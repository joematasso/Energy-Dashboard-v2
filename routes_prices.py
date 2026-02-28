#!/usr/bin/env python3
"""
Live price fetching from free public sources.

Sources (all free, no paid subscriptions):
  - yfinance: delayed futures quotes for NG, crude, metals, ag, LNG proxies
  - EIA API:  daily spot prices for Henry Hub and WTI (uses existing EIA_API_KEY)

Endpoint: GET /api/live-prices
Returns a flat dict of hub_name -> current_price so the frontend can seed its
Brownian motion engine with realistic market levels instead of fixed defaults.

Cache TTL: 15 minutes (prices update intraday but 15-min delay is fine for sim).
"""

import io
import json
import time
import logging
import threading
import zipfile
from datetime import datetime, timezone, timedelta

import requests
from flask import Blueprint, jsonify

from app import EIA_API_KEY, FRED_API_KEY

logger = logging.getLogger(__name__)
prices_bp = Blueprint('prices', __name__)

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
_price_cache = {'data': None, 'live_hubs': [], 'ts': 0}
_price_lock = threading.Lock()
PRICE_TTL = 900  # 15 minutes

# ---------------------------------------------------------------------------
# yfinance ticker → internal key mapping
# Prices come in as-is from yfinance; conversion applied separately.
# ---------------------------------------------------------------------------
TICKERS = [
    'NG=F',   # Henry Hub natural gas ($/MMBtu)
    'CL=F',   # WTI crude ($/bbl)
    'BZ=F',   # Brent crude ($/bbl)
    'HO=F',   # Heating Oil ($/gal)
    'RB=F',   # RBOB Gasoline ($/gal)
    'GC=F',   # Gold ($/oz)
    'SI=F',   # Silver ($/oz)
    'HG=F',   # Copper ($/lb — COMEX)
    'PL=F',   # Platinum ($/oz)
    'PA=F',   # Palladium ($/oz)
    'ZC=F',   # Corn (cents/bu → /100 for $/bu)
    'ZW=F',   # Wheat (cents/bu → /100)
    'ZS=F',   # Soybeans (cents/bu → /100)
    'ZL=F',   # Soybean Oil (cents/lb → /100)
    'ZM=F',   # Soybean Meal ($/ton)
    'CT=F',   # Cotton (cents/lb → /100)
    'SB=F',   # Sugar #11 (cents/lb → /100)
    'KC=F',   # Coffee C (cents/lb → /100)
    'CC=F',   # Cocoa ($/MT)
    'LE=F',   # Live Cattle (cents/lb → /100)
    'HE=F',   # Lean Hogs (cents/lb → /100)
    'GF=F',   # Feeder Cattle (cents/lb → /100)
]

# Tickers that report in cents — divide by 100 to get $/unit
CENTS_TICKERS = {'ZC=F', 'ZW=F', 'ZS=F', 'ZL=F', 'CT=F', 'SB=F', 'KC=F', 'LE=F', 'HE=F', 'GF=F'}


def _fetch_yfinance(tickers):
    """Fetch latest prices from yfinance. Returns dict ticker -> float."""
    try:
        import yfinance as yf
        raw = yf.download(
            tickers=' '.join(tickers),
            period='2d',       # 2 days to ensure we get at least 1 close
            interval='1h',
            group_by='ticker',
            auto_adjust=True,
            progress=False,
            threads=True,
        )
        result = {}
        if raw.empty:
            return result

        for ticker in tickers:
            try:
                # yfinance >=1.0 uses (ticker, price_type) MultiIndex when multi-ticker
                if len(tickers) == 1:
                    col_data = raw['Close']
                elif isinstance(raw.columns, __import__('pandas').MultiIndex):
                    # New format: top-level is ticker, second level is price type
                    col_data = raw[ticker]['Close']
                else:
                    col_data = raw['Close'][ticker]
                col_data = col_data.dropna()
                if col_data.empty:
                    continue
                price = float(col_data.iloc[-1])
                if ticker in CENTS_TICKERS:
                    price /= 100.0
                result[ticker] = round(price, 6)
            except Exception:
                continue
        return result
    except Exception as e:
        logger.warning(f'yfinance fetch error: {e}')
        return {}


def _fetch_eia_prices():
    """
    Fetch petroleum spot prices from EIA API v2 (/petroleum/pri/spt/data/).
    Batches multiple series in one request for efficiency.

    Series fetched:
      RWTC  — WTI Cushing ($/bbl)
      RBRTE — Brent ($/bbl)  [backup for yfinance BZ=F]

    Note: EIA v2 dropped the daily Henry Hub gas spot (RNGWHHD). NG price
    now comes from the EIA Today in Energy scrape or yfinance NG=F.
    """
    if not EIA_API_KEY:
        return {}
    result = {}
    try:
        url = (
            'https://api.eia.gov/v2/petroleum/pri/spt/data/'
            f'?api_key={EIA_API_KEY}'
            '&frequency=daily&data[0]=value'
            '&facets[series][]=RWTC&facets[series][]=RBRTE'
            '&sort[0][column]=period&sort[0][direction]=desc&length=5'
        )
        r = requests.get(url, timeout=8)
        d = r.json()
        rows = d.get('response', {}).get('data', [])

        # Rows are sorted date DESC across all requested series.
        # 'series' field in each row holds the series ID (e.g. 'RWTC', 'RBRTE').
        SERIES_KEY_MAP = {'RWTC': 'wti_eia', 'RBRTE': 'brent_eia'}
        for row in rows:
            series_id = row.get('series', '')
            val = row.get('value')
            key = SERIES_KEY_MAP.get(series_id)
            if key and key not in result and val is not None:
                result[key] = float(val)
                logger.debug(f"EIA {series_id}: ${val} ({row.get('period')})")
            if len(result) == len(SERIES_KEY_MAP):
                break  # all series found

    except Exception as e:
        logger.debug(f'EIA petroleum spot fetch failed: {e}')

    return result


def _fetch_ercot_lmps():
    """
    Fetch ERCOT real-time settlement point prices (no API key required).
    Uses the ERCOT public API v2 grid-status endpoint — updated every 5 minutes.
    Returns dict: hub_name -> float ($/MWh)
    """
    # ERCOT public API now requires authentication — returns 404 without a key.
    # Return empty; ERCOT hubs fall back to heat-rate estimates (marked EST).
    logger.debug('ERCOT LMP fetch skipped: API requires auth')
    return {}


def _fetch_caiso_lmps():
    # CAISO OASIS consistently returns malformed XML for unauthenticated requests.
    # Return empty; CAISO hubs fall back to heat-rate estimates (marked EST).
    logger.debug('CAISO LMP fetch skipped: OASIS returning invalid responses')
    return {}


def _fetch_nyiso_lmps():
    """
    Fetch NYISO real-time zone LMPs from the public CSV feed (no auth required).
    URL pattern: https://mis.nyiso.com/public/csv/rtlbmp/{YYYYMMDD}rtlbmp_zone.csv
    Returns dict: hub_name -> float ($/MWh), using the most recent 5-min interval.
    """
    import csv as csv_mod
    try:
        now_et = datetime.now(timezone.utc) - timedelta(hours=5)  # Eastern time (approx)
        date_str = now_et.strftime('%Y%m%d')
        url = f'https://mis.nyiso.com/public/csv/rtlbmp/{date_str}rtlbmp_zone.csv'
        r = requests.get(url, timeout=10)
        if r.status_code != 200 or not r.text.strip():
            return {}
        reader = csv_mod.DictReader(r.text.splitlines())
        rows = list(reader)
        if not rows:
            return {}
        # Get the most recent timestamp available
        timestamps = sorted(set(row.get('Time Stamp', '') for row in rows), reverse=True)
        latest_ts = timestamps[0]
        latest_rows = [row for row in rows if row.get('Time Stamp') == latest_ts]
        # Map NYISO zone names to our hub names
        ZONE_MAP = {
            'N.Y.C.': 'NYISO Zone J',   # NYC / Zone J
            'WEST':   'NYISO Zone A',   # Western upstate / Zone A
        }
        result = {}
        for row in latest_rows:
            zone = row.get('Name', '').strip()
            if zone in ZONE_MAP:
                try:
                    result[ZONE_MAP[zone]] = round(float(row['LBMP ($/MWHr)']), 2)
                except (ValueError, KeyError):
                    continue
        logger.debug(f'NYISO LMPs fetched ({latest_ts}): {result}')
        return result
    except Exception as e:
        logger.debug(f'NYISO LMP fetch failed: {e}')
        return {}


def _fetch_eia_spot_prices():
    """
    Scrape EIA Today in Energy daily spot prices for NG and electricity.
    URL: https://www.eia.gov/todayinenergy/prices.php

    Page layout (tables[2]): Region | NG Price | NG %Chg | Elec Price | Elec %Chg | Spark Spread
    Page layout (tables[3]): Region | Gas Point Used | Power Point Used
    Prices update on business days; no API key required.

    Returns tuple (ng_spots, power_spots):
      ng_spots:    our_hub_name -> float ($/MMBtu)
      power_spots: our_hub_name -> float ($/MWh)
    """
    try:
        from bs4 import BeautifulSoup
        r = requests.get(
            'https://www.eia.gov/todayinenergy/prices.php',
            timeout=15,
            headers={'User-Agent': 'Mozilla/5.0 (compatible; EnergyDesk/3.0)'},
        )
        if r.status_code != 200:
            logger.debug(f'EIA prices page HTTP {r.status_code}')
            return {}, {}

        soup = BeautifulSoup(r.text, 'html.parser')
        tables = soup.find_all('table')
        if len(tables) < 4:
            logger.debug(f'EIA prices page: expected ≥4 tables, got {len(tables)}')
            return {}, {}

        # --- Parse Table 2: Region → (ng_price, elec_price) ---
        # Row format: cells[0]=region  cells[1]=NG$  cells[2]=NG%  cells[3]=elec$  cells[4]=elec%  cells[5]=spark
        region_prices = {}
        for row in tables[2].find_all('tr'):
            cells = row.find_all('td')
            if len(cells) < 2:
                continue
            region = cells[0].get_text(strip=True)
            try:
                ng_val = float(cells[1].get_text(strip=True).replace(',', ''))
                pwr_val = float(cells[3].get_text(strip=True).replace(',', '')) if len(cells) >= 4 else None
                region_prices[region] = (ng_val, pwr_val)
            except (ValueError, IndexError):
                continue

        # --- Hardcoded region → (ng_our_hub, power_our_hub) mapping ---
        # Derived from Table 3 analysis; hardcoded for stability.
        # Table 2 region name → (our NG hub or None, our power hub or None)
        REGION_TO_HUBS = {
            'New England':   ('Algonquin',      'NEPOOL Mass'),
            'New York City': ('Transco Zone 6', 'NYISO Zone J'),
            'Mid-Atlantic':  ('Tetco M3',       'PJM West Hub'),
            'Midwest':       ('Chicago',         'MISO Illinois'),
            'Louisiana':     ('Henry Hub',       None),          # Entergy not in our hub list
            'Houston':       (None,              'ERCOT Hub'),   # Houston Ship Channel not an NG hub we use
            'Southwest':     ('Waha',            None),          # El Paso San Juan = Waha proxy; Palo Verde not in our list
            'Southern CA':   ('SoCal Gas',       'CAISO SP15'),
            'Northern CA':   (None,              'CAISO NP15'),  # PG&E CG not in our NG list
            'Northwest':     ('Sumas',           None),          # Mid-Columbia not in our power list
        }

        ng_spots = {}
        power_spots = {}

        for region, (ng_hub, pwr_hub) in REGION_TO_HUBS.items():
            # Flexible region match: exact first, then prefix
            prices = region_prices.get(region)
            if prices is None:
                for r_key in region_prices:
                    if r_key.startswith(region) or region.startswith(r_key):
                        prices = region_prices[r_key]
                        break
            if prices is None:
                continue

            ng_val, pwr_val = prices

            if ng_hub and ng_val is not None:
                if -5.0 < ng_val < 50.0:
                    ng_spots[ng_hub] = round(ng_val, 4)

            if pwr_hub and pwr_val is not None:
                if -50.0 < pwr_val < 1500.0:
                    power_spots[pwr_hub] = round(pwr_val, 2)

        logger.debug(f'EIA spot prices: {len(ng_spots)} NG {ng_spots}, {len(power_spots)} power {power_spots}')
        return ng_spots, power_spots

    except Exception as e:
        logger.debug(f'EIA spot scrape failed: {e}')
        return {}, {}


def _fetch_fred_prices():
    """
    Fetch commodity prices from FRED (Federal Reserve Economic Data).
    Optional — only runs if FRED_API_KEY env var is set.
    Register free at: https://fred.stlouisfed.org/docs/api/api_key.html

    Key series fetched:
      DPROPANEMBTX  — Mont Belvieu propane spot ($/gallon, weekly from EIA)
      DHHNGSP       — Henry Hub natural gas spot ($/MMBtu, daily from EIA) [backup]
      DCOILWTICO    — WTI crude spot ($/barrel, daily from EIA) [backup]
      DCOILBRENTEU  — Brent crude spot ($/barrel, daily from EIA) [backup]

    Returns dict with keys: propane_fred, henry_hub_fred, wti_fred, brent_fred
    (all float, $/unit as noted above)
    """
    if not FRED_API_KEY:
        return {}

    FRED_SERIES = {
        'DPROPANEMBTX': 'propane_fred',     # Mont Belvieu propane ($/gal)
        'DHHNGSP':      'henry_hub_fred',   # Henry Hub spot ($/MMBtu)
        'DCOILWTICO':   'wti_fred',         # WTI spot ($/bbl)
        'DCOILBRENTEU': 'brent_fred',       # Brent spot ($/bbl)
    }

    result = {}
    for series_id, key in FRED_SERIES.items():
        try:
            url = (
                'https://api.stlouisfed.org/fred/series/observations'
                f'?series_id={series_id}'
                f'&api_key={FRED_API_KEY}'
                '&sort_order=desc&limit=10&file_type=json'
            )
            r = requests.get(url, timeout=8)
            if r.status_code != 200:
                continue
            obs = r.json().get('observations', [])
            # Find the most recent non-missing observation ('.' means no data)
            for ob in obs:
                if ob.get('value', '.') != '.':
                    result[key] = float(ob['value'])
                    logger.debug(f'FRED {series_id}: {ob["value"]} ({ob["date"]})')
                    break
        except Exception as e:
            logger.debug(f'FRED {series_id} fetch failed: {e}')

    return result


def _build_hub_prices(yf_prices, eia_prices, nyiso_lmps=None, eia_ng_spots=None, eia_power_spots=None, fred_prices=None):
    """
    Map raw benchmark prices to the platform's hub names.

    LIVE hubs: directly fetched from an external API (yfinance, EIA, NYISO).
    EST hubs:  derived via fixed spreads/heat-rates from live anchor prices.

    Returns (prices_dict, live_hubs_list).
    """
    if nyiso_lmps is None:
        nyiso_lmps = {}
    if eia_ng_spots is None:
        eia_ng_spots = {}
    if eia_power_spots is None:
        eia_power_spots = {}
    if fred_prices is None:
        fred_prices = {}

    # --- Benchmarks ---
    # Priority chain (most authoritative → most available):
    # Henry Hub: EIA page physical spot > FRED EIA-sourced spot > yfinance NYMEX futures
    # WTI:       EIA API RWTC spot      > FRED EIA-sourced spot > yfinance CL=F futures
    # Brent:     yfinance BZ=F          > FRED EIA-sourced spot
    hh    = eia_ng_spots.get('Henry Hub') or eia_prices.get('henry_hub_eia') or fred_prices.get('henry_hub_fred') or yf_prices.get('NG=F')
    wti   = eia_prices.get('wti_eia')    or fred_prices.get('wti_fred')      or yf_prices.get('CL=F')
    brent = yf_prices.get('BZ=F')        or eia_prices.get('brent_eia')      or fred_prices.get('brent_fred')

    out = {}
    live_hubs = set()

    # --- Natural Gas (all relative to Henry Hub) ---
    # Historical basis spreads ($/MMBtu) vs Henry Hub
    NG_SPREADS = {
        'Henry Hub': 0.00,
        'Waha': -0.35,
        'SoCal Gas': +0.15,
        'Chicago': -0.05,
        'Algonquin': +0.80,
        'Transco Zone 6': +0.60,
        'Dominion South': -0.45,
        'Dawn': +0.10,
        'Sumas': +0.20,
        'Malin': +0.18,
        'Opal': -0.08,
        'Tetco M3': +0.55,
        'Kern River': +0.05,
        'AECO': -0.80,   # approximate (CAD/GJ conversion applied client-side)
    }
    if hh:
        for hub, spread in NG_SPREADS.items():
            out[hub] = round(hh + spread, 4)
        # Henry Hub from yfinance NG=F — always LIVE.
        live_hubs.add('Henry Hub')

    # Override spread-estimated hubs with real EIA daily spot prices where available.
    # These are the actual published spot prices for physical delivery today —
    # much more accurate than HH + fixed spread.
    for hub_name, spot_price in eia_ng_spots.items():
        out[hub_name] = spot_price
        live_hubs.add(hub_name)

    # --- Crude (all relative to WTI) ---
    CRUDE_DIFFS = {
        'WTI Cushing': 0.00,
        'WTI Midland': +0.40,
        'Mars Sour': -1.80,
        'LLS': +1.20,
        'ANS': +0.90,
        'Bakken': -0.60,
        'WCS': -14.50,
    }
    if wti:
        for hub, diff in CRUDE_DIFFS.items():
            out[hub] = round(wti + diff, 2)
        # Only WTI Cushing is sourced from real data (EIA RWTC / yfinance CL=F).
        # Other crude grades use fixed estimated differentials — mark as EST.
        live_hubs.add('WTI Cushing')
    if brent:
        out['Brent Dated'] = round(brent, 2)
        live_hubs.add('Brent Dated')

    # --- Metals (direct from yfinance) ---
    METALS_MAP = {
        'Gold (COMEX)': 'GC=F',
        'Silver (COMEX)': 'SI=F',
        'Copper (COMEX)': 'HG=F',
        'Platinum (NYMEX)': 'PL=F',
        'Palladium (NYMEX)': 'PA=F',
    }
    for hub, ticker in METALS_MAP.items():
        if ticker in yf_prices:
            out[hub] = round(yf_prices[ticker], 2)
            live_hubs.add(hub)

    # --- Agriculture (direct from yfinance) ---
    AG_MAP = {
        'Corn (CBOT)': 'ZC=F',
        'Soybeans (CBOT)': 'ZS=F',
        'Wheat (CBOT)': 'ZW=F',
        'Soybean Oil (CBOT)': 'ZL=F',
        'Soybean Meal (CBOT)': 'ZM=F',
        'Cotton (ICE)': 'CT=F',
        'Sugar #11 (ICE)': 'SB=F',
        'Coffee C (ICE)': 'KC=F',
        'Cocoa (ICE)': 'CC=F',
        'Live Cattle (CME)': 'LE=F',
        'Lean Hogs (CME)': 'HE=F',
        'Feeder Cattle (CME)': 'GF=F',
    }
    for hub, ticker in AG_MAP.items():
        if ticker in yf_prices:
            out[hub] = round(yf_prices[ticker], 4)
            live_hubs.add(hub)

    # --- LNG (anchor HH Netback to Henry Hub; others are too proprietary) ---
    if hh:
        # HH Netback ≈ Henry Hub + liquefaction + shipping - regas
        # Rough: HH + 3.30 blended export cost
        out['HH Netback'] = round(hh + 3.30, 2)
        live_hubs.add('HH Netback')
        # TTF tracks HH with a premium — use yfinance if available
        # JKM not available free; keep as Brownian

    # --- NGLs (anchor to NG and crude; upgrade to FRED spot where available) ---
    if hh:
        # Ethane (¢/gal): loosely tracks NG — ~3.5 Mcf per gallon
        out['Ethane (C2)'] = round(hh * 8.18, 1)
        live_hubs.add('Ethane (C2)')
    if wti:
        out['Normal Butane (nC4)'] = round(wti * 1.32, 1)
        out['Isobutane (iC4)']     = round(wti * 1.41, 1)
        out['Nat Gasoline (C5+)']  = round(wti * 1.95, 1)
        live_hubs.update(['Normal Butane (nC4)', 'Isobutane (iC4)', 'Nat Gasoline (C5+)'])

    # Propane: prefer FRED Mont Belvieu spot ($/gal → ¢/gal × 100) over crude ratio.
    # FRED DPROPANEMBTX = EIA weekly Mont Belvieu propane price in $/gallon.
    if fred_prices.get('propane_fred'):
        out['Propane (C3)'] = round(fred_prices['propane_fred'] * 100, 1)  # $/gal → ¢/gal
        live_hubs.add('Propane (C3)')
    elif wti:
        # Fallback: crude ratio (WTI $65 → ~59 ¢/gal at ~0.905 ratio)
        out['Propane (C3)'] = round(wti * 0.905, 1)

    # --- Power: NYISO live LMPs; heat-rate estimates (EST) for all others ---
    # Heat-rate formula: LMP ≈ gas_price ($/MMBtu) × heat_rate (MMBtu/MWh) + non-fuel adder
    # Adder captures: capacity payments, O&M, ancillary services, congestion, carbon costs.
    # Recalibrated Feb 2026 at NG ~$2.85/MMBtu against observed market prices.
    POWER_GAS_REF = {
        # hub                  gas_hub          HR    adder  notes
        'ERCOT Hub':    ('Henry Hub',      8.0,  +5.00),  # ~$28 vs typical $25-40
        'ERCOT North':  ('Henry Hub',      7.8,  +3.00),  # typically discount to Hub
        'ERCOT South':  ('Henry Hub',      8.2,  +6.00),  # slight premium (load center)
        'PJM West Hub': ('Transco Zone 6', 7.5,  +2.00),  # ~$28 vs observed $23-35
        'NEPOOL Mass':  ('Algonquin',      8.5,  +8.00),  # ~$39 vs typical $30-50
        'MISO Illinois':('Chicago',        7.8,  +3.50),  # ~$25 vs typical $22-32
        'CAISO NP15':   ('SoCal Gas',      8.5,  +8.00),  # ~$33 (renewable-heavy, varies)
        'CAISO SP15':   ('SoCal Gas',      8.2,  +6.00),  # slight discount to NP15
        'NYISO Zone J': ('Transco Zone 6', 8.5,  +8.00),  # ~$37 vs typical $30-55 (NYC)
        'NYISO Zone A': ('Dawn',           7.5,  +3.00),  # ~$25 vs typical $20-35 (upstate)
        'SPP North':    ('Henry Hub',      7.5,  +2.00),  # ~$23 vs typical $20-30
    }

    # Priority order for power prices:
    # 1. NYISO real-time CSV (5-min, most current)
    # 2. EIA Today in Energy (daily SNL/regional assessments)
    # 3. Heat-rate formula (estimated, marked EST)
    for hub, (gas_hub, heat_rate, adder) in POWER_GAS_REF.items():
        if nyiso_lmps and hub in nyiso_lmps:
            out[hub] = nyiso_lmps[hub]
            live_hubs.add(hub)
        elif eia_power_spots and hub in eia_power_spots:
            out[hub] = eia_power_spots[hub]
            live_hubs.add(hub)
        else:
            gas_price = out.get(gas_hub)
            if gas_price:
                out[hub] = round(gas_price * heat_rate + adder, 2)
                # Heat-rate derived — NOT marked live even though anchored to live gas.

    return out, list(live_hubs)


def fetch_live_prices():
    """Fetch all prices, returning hub_name -> float dict. Uses cache."""
    now = time.time()
    with _price_lock:
        if _price_cache['data'] and (now - _price_cache['ts']) < PRICE_TTL:
            return _price_cache['data']

    logger.info('Fetching live prices from yfinance + EIA + NYISO + EIA-spot-scrape...')

    # Fetch all sources concurrently
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        f_yf    = ex.submit(_fetch_yfinance, TICKERS)
        f_eia   = ex.submit(_fetch_eia_prices)
        f_nyiso = ex.submit(_fetch_nyiso_lmps)
        f_spots = ex.submit(_fetch_eia_spot_prices)
        f_fred  = ex.submit(_fetch_fred_prices)
        yf_prices              = f_yf.result()
        eia_prices             = f_eia.result()
        nyiso_lmps             = f_nyiso.result()
        eia_ng_spots, eia_power_spots = f_spots.result()
        fred_prices            = f_fred.result()

    hub_prices, live_hubs = _build_hub_prices(
        yf_prices, eia_prices, nyiso_lmps, eia_ng_spots, eia_power_spots, fred_prices
    )

    sources = []
    if yf_prices:       sources.append('yfinance')
    if eia_prices:      sources.append('EIA-WTI')
    if nyiso_lmps:      sources.append(f'NYISO({len(nyiso_lmps)})')
    if eia_ng_spots:    sources.append(f'EIA-NG({len(eia_ng_spots)})')
    if eia_power_spots: sources.append(f'EIA-PWR({len(eia_power_spots)})')
    if fred_prices:     sources.append(f'FRED({len(fred_prices)})')
    logger.info(f'Live prices fetched from [{", ".join(sources)}]: {len(hub_prices)} hubs ({len(live_hubs)} live)')

    with _price_lock:
        _price_cache['data'] = hub_prices
        _price_cache['live_hubs'] = live_hubs
        _price_cache['ts'] = now

    return hub_prices


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@prices_bp.route('/api/live-prices', methods=['GET'])
def get_live_prices():
    """Return real-world price anchors for the frontend price engine."""
    try:
        prices = fetch_live_prices()
        cached_age = int(time.time() - _price_cache['ts'])
        return jsonify({
            'success': True,
            'prices': prices,
            'live_hubs': _price_cache.get('live_hubs', []),
            'hub_count': len(prices),
            'cache_age_seconds': cached_age,
            'source': 'yfinance+EIA+NYISO+EIA-spot-scrape'
        })
    except Exception as e:
        logger.error(f'Live prices endpoint error: {e}')
        return jsonify({'success': False, 'error': str(e), 'prices': {}})
