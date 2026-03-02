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

# Suppress noisy yfinance TzCache warnings
logging.getLogger('yfinance').setLevel(logging.WARNING)
logging.getLogger('peewee').setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
_price_cache = {'data': None, 'live_hubs': [], 'hub_sources': {}, 'ts': 0}
_price_lock = threading.Lock()
PRICE_TTL = 900  # 15 minutes

# ---------------------------------------------------------------------------
# yfinance ticker → internal key mapping
# Prices come in as-is from yfinance; conversion applied separately.
# ---------------------------------------------------------------------------
TICKERS = [
    'NG=F',     # Henry Hub natural gas ($/MMBtu)
    'CL=F',     # WTI crude ($/bbl)
    'BZ=F',     # Brent crude ($/bbl)
    'HO=F',     # Heating Oil ($/gal)
    'RB=F',     # RBOB Gasoline ($/gal)
    'GC=F',     # Gold ($/oz)
    'SI=F',     # Silver ($/oz)
    'HG=F',     # Copper ($/lb — COMEX)
    'PL=F',     # Platinum ($/oz)
    'PA=F',     # Palladium ($/oz)
    'ZC=F',     # Corn (cents/bu → /100 for $/bu)
    'ZW=F',     # Wheat (cents/bu → /100)
    'ZS=F',     # Soybeans (cents/bu → /100)
    'ZL=F',     # Soybean Oil (cents/lb → /100)
    'ZM=F',     # Soybean Meal ($/ton)
    'CT=F',     # Cotton (cents/lb → /100)
    'SB=F',     # Sugar #11 (cents/lb → /100)
    'KC=F',     # Coffee C (cents/lb → /100)
    'CC=F',     # Cocoa ($/MT)
    'LE=F',     # Live Cattle (cents/lb → /100)
    'HE=F',     # Lean Hogs (cents/lb → /100)
    'GF=F',     # Feeder Cattle (cents/lb → /100)
    'TTF=F',    # Dutch TTF Natural Gas (EUR/MWh on ICE — converted to $/MMBtu)
    'EURUSD=X', # EUR/USD spot rate (for TTF conversion)
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
        r = requests.get(url, timeout=5)
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
    Scrape EIA Today in Energy daily spot prices for NG, electricity, and petroleum.
    URL: https://www.eia.gov/todayinenergy/prices.php

    Page layout (tables[0]): Product | Area | Price | %Chg  (petroleum: WTI, Brent, etc.)
    Page layout (tables[2]): Region | NG Price | NG %Chg | Elec Price | Elec %Chg | Spark Spread
    Page layout (tables[3]): Region | Gas Point Used | Power Point Used
    Prices update on business days; no API key required.

    Returns tuple (ng_spots, power_spots, petroleum_spots):
      ng_spots:        our_hub_name -> float ($/MMBtu)
      power_spots:     our_hub_name -> float ($/MWh)
      petroleum_spots: dict with keys 'wti_spot', 'brent_spot' -> float ($/barrel)
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

        # --- Parse Table 0: Petroleum spot prices (WTI, Brent) ---
        petroleum_spots = {}
        try:
            for row in tables[0].find_all('tr'):
                cells = row.find_all('td')
                if len(cells) < 3:
                    continue
                # Table 0 format varies: some rows have Product|Area|Price|%Chg,
                # others just Area|Price|%Chg (when product spans multiple rows).
                text_vals = [c.get_text(strip=True) for c in cells]
                # Look for WTI or Brent in any cell text
                row_text = ' '.join(text_vals).lower()
                price_val = None
                if 'wti' in row_text and 'wti_spot' not in petroleum_spots:
                    # Find the price cell: first numeric-looking value
                    for t in text_vals:
                        try:
                            v = float(t.replace(',', ''))
                            if 10.0 < v < 300.0:  # sanity: crude $/bbl range
                                petroleum_spots['wti_spot'] = round(v, 2)
                                break
                        except ValueError:
                            continue
                elif 'brent' in row_text and 'brent_spot' not in petroleum_spots:
                    for t in text_vals:
                        try:
                            v = float(t.replace(',', ''))
                            if 10.0 < v < 300.0:
                                petroleum_spots['brent_spot'] = round(v, 2)
                                break
                        except ValueError:
                            continue
            if petroleum_spots:
                logger.debug(f'EIA petroleum spots from page: {petroleum_spots}')
        except Exception as e:
            logger.debug(f'EIA petroleum table parse error: {e}')

        logger.debug(f'EIA spot prices: {len(ng_spots)} NG {ng_spots}, {len(power_spots)} power, {len(petroleum_spots)} petroleum')
        return ng_spots, power_spots, petroleum_spots

    except Exception as e:
        logger.debug(f'EIA spot scrape failed: {e}')
        return {}, {}, {}


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


def _build_hub_prices(yf_prices, eia_prices, nyiso_lmps=None, eia_ng_spots=None, eia_power_spots=None, fred_prices=None, eia_petroleum_spots=None):
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
    if eia_petroleum_spots is None:
        eia_petroleum_spots = {}

    # --- Benchmarks ---
    # Priority chain (most authoritative → most available):
    # Henry Hub: EIA page physical spot > FRED EIA-sourced spot > yfinance NYMEX futures
    # WTI:       EIA API RWTC spot / EIA page spot > FRED EIA-sourced spot > yfinance CL=F futures
    # Brent:     yfinance BZ=F > EIA API/page spot > FRED EIA-sourced spot
    hh    = eia_ng_spots.get('Henry Hub') or eia_prices.get('henry_hub_eia') or fred_prices.get('henry_hub_fred') or yf_prices.get('NG=F')
    wti   = eia_prices.get('wti_eia')    or fred_prices.get('wti_fred')      or yf_prices.get('CL=F')
    brent = yf_prices.get('BZ=F')        or eia_prices.get('brent_eia')      or fred_prices.get('brent_fred')

    out = {}
    live_hubs = set()
    hub_srcs = {}   # hub_name → source key string (used by frontend for popover info)

    # Determine source key for each benchmark depending on which feed succeeded
    hh_src  = ('eia_spot_page'      if eia_ng_spots.get('Henry Hub')        else
               'fred_backup'        if fred_prices.get('henry_hub_fred')    else
               'yfinance_ng')
    # WTI: distinguish EIA API vs EIA page scrape
    _wti_from_page = eia_petroleum_spots.get('wti_spot') and not eia_prices.get('wti_eia') != eia_petroleum_spots.get('wti_spot')
    wti_src = ('eia_spot_page'      if eia_petroleum_spots.get('wti_spot') and eia_prices.get('wti_eia') == eia_petroleum_spots['wti_spot'] else
               'eia_api_rwtc'       if eia_prices.get('wti_eia')            else
               'fred_backup'        if fred_prices.get('wti_fred')          else
               'yfinance_cl')
    brent_src = ('yfinance_bz'      if yf_prices.get('BZ=F')               else
                 'eia_spot_page'    if eia_petroleum_spots.get('brent_spot') and eia_prices.get('brent_eia') == eia_petroleum_spots['brent_spot'] else
                 'eia_api_brent'    if eia_prices.get('brent_eia')          else
                 'fred_backup')

    # --- Natural Gas (all relative to Henry Hub) ---
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
        'AECO': -0.80,
    }
    if hh:
        for hub, spread in NG_SPREADS.items():
            out[hub] = round(hh + spread, 4)
            hub_srcs[hub] = 'hh_spread'
        hub_srcs['Henry Hub'] = hh_src
        live_hubs.add('Henry Hub')

    # Override spread estimates with real EIA daily spot prices where available.
    for hub_name, spot_price in eia_ng_spots.items():
        out[hub_name] = spot_price
        hub_srcs[hub_name] = 'eia_spot_page'
        live_hubs.add(hub_name)
    # Waha maps to El Paso San Juan (proxy) — clarify in the source key
    if 'Waha' in eia_ng_spots:
        hub_srcs['Waha'] = 'eia_spot_page_proxy'

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
            hub_srcs[hub] = 'wti_diff'
        hub_srcs['WTI Cushing'] = wti_src
        live_hubs.add('WTI Cushing')
    if brent:
        out['Brent Dated'] = round(brent, 2)
        hub_srcs['Brent Dated'] = brent_src
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
            hub_srcs[hub] = 'yfinance_comex'
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
            hub_srcs[hub] = 'yfinance_ag'
            live_hubs.add(hub)

    # --- LNG ---
    if hh:
        out['HH Netback'] = round(hh + 3.30, 2)
        hub_srcs['HH Netback'] = 'hh_netback_est'
        live_hubs.add('HH Netback')

    # TTF Dutch gas: ICE futures quoted in EUR/MWh → convert to $/MMBtu
    # 1 MWh = 3.41214 MMBtu; multiply by EUR/USD spot rate
    ttf_raw = yf_prices.get('TTF=F')
    eurusd  = yf_prices.get('EURUSD=X') or 1.10  # fallback if forex unavailable
    if ttf_raw and ttf_raw > 0 and eurusd > 0:
        ttf_usd_mmbtu = round(ttf_raw * eurusd / 3.41214, 2)
        out['TTF (ICE)'] = ttf_usd_mmbtu
        hub_srcs['TTF (ICE)'] = 'yfinance_ttf'
        live_hubs.add('TTF (ICE)')

    # --- NGLs ---
    if hh:
        out['Ethane (C2)'] = round(hh * 8.18, 1)
        hub_srcs['Ethane (C2)'] = 'hh_ratio_est'
        live_hubs.add('Ethane (C2)')
    if wti:
        out['Normal Butane (nC4)'] = round(wti * 1.32, 1)
        out['Isobutane (iC4)']     = round(wti * 1.41, 1)
        out['Nat Gasoline (C5+)']  = round(wti * 1.95, 1)
        hub_srcs['Normal Butane (nC4)'] = 'wti_ratio_est'
        hub_srcs['Isobutane (iC4)']     = 'wti_ratio_est'
        hub_srcs['Nat Gasoline (C5+)']  = 'wti_ratio_est'
        live_hubs.update(['Normal Butane (nC4)', 'Isobutane (iC4)', 'Nat Gasoline (C5+)'])

    if fred_prices.get('propane_fred'):
        out['Propane (C3)'] = round(fred_prices['propane_fred'] * 100, 1)
        hub_srcs['Propane (C3)'] = 'fred_propane'
        live_hubs.add('Propane (C3)')
    elif wti:
        out['Propane (C3)'] = round(wti * 0.905, 1)
        hub_srcs['Propane (C3)'] = 'wti_ratio_est'

    # --- Power ---
    POWER_GAS_REF = {
        'ERCOT Hub':    ('Henry Hub',      8.0,  +5.00),
        'ERCOT North':  ('Henry Hub',      7.8,  +3.00),
        'ERCOT South':  ('Henry Hub',      8.2,  +6.00),
        'PJM West Hub': ('Transco Zone 6', 7.5,  +2.00),
        'NEPOOL Mass':  ('Algonquin',      8.5,  +8.00),
        'MISO Illinois':('Chicago',        7.8,  +3.50),
        'CAISO NP15':   ('SoCal Gas',      8.5,  +8.00),
        'CAISO SP15':   ('SoCal Gas',      8.2,  +6.00),
        'NYISO Zone J': ('Transco Zone 6', 8.5,  +8.00),
        'NYISO Zone A': ('Dawn',           7.5,  +3.00),
        'SPP North':    ('Henry Hub',      7.5,  +2.00),
    }
    for hub, (gas_hub, heat_rate, adder) in POWER_GAS_REF.items():
        if nyiso_lmps and hub in nyiso_lmps:
            out[hub] = nyiso_lmps[hub]
            hub_srcs[hub] = 'nyiso_rt_lmp'
            live_hubs.add(hub)
        elif eia_power_spots and hub in eia_power_spots:
            out[hub] = eia_power_spots[hub]
            hub_srcs[hub] = 'eia_power_snl'
            live_hubs.add(hub)
        else:
            gas_price = out.get(gas_hub)
            if gas_price:
                out[hub] = round(gas_price * heat_rate + adder, 2)
                hub_srcs[hub] = 'heat_rate_est'

    return out, list(live_hubs), hub_srcs


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
        eia_ng_spots, eia_power_spots, eia_petroleum_spots = f_spots.result()
        fred_prices            = f_fred.result()

    # Merge EIA page petroleum spots into eia_prices as fallback for API
    if eia_petroleum_spots.get('wti_spot') and not eia_prices.get('wti_eia'):
        eia_prices['wti_eia'] = eia_petroleum_spots['wti_spot']
        logger.debug(f"Using EIA page WTI spot: ${eia_petroleum_spots['wti_spot']}")
    if eia_petroleum_spots.get('brent_spot') and not eia_prices.get('brent_eia'):
        eia_prices['brent_eia'] = eia_petroleum_spots['brent_spot']
        logger.debug(f"Using EIA page Brent spot: ${eia_petroleum_spots['brent_spot']}")

    hub_prices, live_hubs, hub_srcs = _build_hub_prices(
        yf_prices, eia_prices, nyiso_lmps, eia_ng_spots, eia_power_spots, fred_prices, eia_petroleum_spots
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
        _price_cache['hub_sources'] = hub_srcs
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
            'hub_sources': _price_cache.get('hub_sources', {}),
            'fetched_at': _price_cache.get('ts', 0),
            'hub_count': len(prices),
            'cache_age_seconds': cached_age,
            'source': 'yfinance+EIA+NYISO+EIA-spot-scrape'
        })
    except Exception as e:
        logger.error(f'Live prices endpoint error: {e}')
        return jsonify({'success': False, 'error': str(e), 'prices': {}})


# ---------------------------------------------------------------------------
# Historical Price Data (6 months daily) for charts
# ---------------------------------------------------------------------------
_hist_cache = {'data': None, 'ts': 0}
_hist_lock = threading.Lock()
HIST_TTL = 3600  # cache for 1 hour

# Reverse mapping: hub_name → yfinance ticker (direct tickers only)
_TICKER_HUB_MAP = {
    'NG=F': 'Henry Hub',
    'CL=F': 'WTI Cushing',
    'BZ=F': 'Brent Dated',
    'GC=F': 'Gold (COMEX)',
    'SI=F': 'Silver (COMEX)',
    'HG=F': 'Copper (COMEX)',
    'PL=F': 'Platinum (NYMEX)',
    'PA=F': 'Palladium (NYMEX)',
    'ZC=F': 'Corn (CBOT)',
    'ZS=F': 'Soybeans (CBOT)',
    'ZW=F': 'Wheat (CBOT)',
    'ZL=F': 'Soybean Oil (CBOT)',
    'ZM=F': 'Soybean Meal (CBOT)',
    'CT=F': 'Cotton (ICE)',
    'SB=F': 'Sugar #11 (ICE)',
    'KC=F': 'Coffee C (ICE)',
    'CC=F': 'Cocoa (ICE)',
    'LE=F': 'Live Cattle (CME)',
    'HE=F': 'Lean Hogs (CME)',
    'GF=F': 'Feeder Cattle (CME)',
}

# Spread-derived hubs: anchor_hub → {derived_hub: spread}
_NG_SPREADS = {
    'Waha': -0.35, 'SoCal Gas': +0.15, 'Chicago': -0.05, 'Algonquin': +0.80,
    'Transco Zone 6': +0.60, 'Dominion South': -0.45, 'Dawn': +0.10,
    'Sumas': +0.20, 'Malin': +0.18, 'Opal': -0.08, 'Tetco M3': +0.55,
    'Kern River': +0.05, 'AECO': -0.80,
}
_CRUDE_DIFFS = {
    'WTI Midland': +0.40, 'Mars Sour': -1.80, 'LLS': +1.20,
    'ANS': +0.90, 'Bakken': -0.60, 'WCS': -14.50,
}
_POWER_HEAT = {
    'ERCOT Hub': ('Henry Hub', 8.0, +5.00), 'ERCOT North': ('Henry Hub', 7.8, +3.00),
    'ERCOT South': ('Henry Hub', 8.2, +6.00), 'PJM West Hub': ('Transco Zone 6', 7.5, +2.00),
    'NEPOOL Mass': ('Algonquin', 8.5, +8.00), 'MISO Illinois': ('Chicago', 7.8, +3.50),
    'CAISO NP15': ('SoCal Gas', 8.5, +8.00), 'CAISO SP15': ('SoCal Gas', 8.2, +6.00),
    'NYISO Zone J': ('Transco Zone 6', 8.5, +8.00), 'NYISO Zone A': ('Dawn', 7.5, +3.00),
    'SPP North': ('Henry Hub', 7.5, +2.00),
}
_NGL_RATIOS = {
    'Ethane (C2)': ('Henry Hub', 8.18), 'Propane (C3)': ('WTI Cushing', 0.905),
    'Normal Butane (nC4)': ('WTI Cushing', 1.32), 'Isobutane (iC4)': ('WTI Cushing', 1.41),
    'Nat Gasoline (C5+)': ('WTI Cushing', 1.95),
}


def _fetch_historical():
    """Fetch 6 months of daily closes and build per-hub history arrays."""
    try:
        import yfinance as yf
        import pandas as pd

        tickers_needed = list(_TICKER_HUB_MAP.keys())
        raw = yf.download(
            tickers=' '.join(tickers_needed),
            period='6mo',
            interval='1d',
            group_by='ticker',
            auto_adjust=True,
            progress=False,
            threads=True,
        )
        if raw.empty:
            return {}

        # Extract daily close series per ticker
        ticker_series = {}
        for ticker in tickers_needed:
            try:
                if len(tickers_needed) == 1:
                    col = raw['Close']
                elif isinstance(raw.columns, __import__('pandas').MultiIndex):
                    col = raw[ticker]['Close']
                else:
                    col = raw['Close'][ticker]
                col = col.dropna()
                if col.empty:
                    continue
                values = col.tolist()
                # Convert cents tickers
                if ticker in CENTS_TICKERS:
                    values = [v / 100.0 for v in values]
                ticker_series[ticker] = values
            except Exception:
                continue

        # Build hub histories
        result = {}

        # Direct-mapped hubs
        for ticker, hub in _TICKER_HUB_MAP.items():
            if ticker in ticker_series:
                result[hub] = [round(v, 4) for v in ticker_series[ticker]]

        # NG spread hubs (from Henry Hub)
        if 'Henry Hub' in result:
            hh_hist = result['Henry Hub']
            for hub, spread in _NG_SPREADS.items():
                result[hub] = [round(v + spread, 4) for v in hh_hist]

        # Crude diff hubs (from WTI)
        if 'WTI Cushing' in result:
            wti_hist = result['WTI Cushing']
            for hub, diff in _CRUDE_DIFFS.items():
                result[hub] = [round(v + diff, 2) for v in wti_hist]

        # Power hubs (heat rate from gas hub)
        for hub, (gas_hub, heat_rate, adder) in _POWER_HEAT.items():
            if gas_hub in result:
                result[hub] = [round(v * heat_rate + adder, 2) for v in result[gas_hub]]

        # NGL hubs (ratio from anchor)
        for hub, (anchor, ratio) in _NGL_RATIOS.items():
            if anchor in result:
                result[hub] = [round(v * ratio, 1) for v in result[anchor]]

        # LNG: HH Netback
        if 'Henry Hub' in result:
            result['HH Netback'] = [round(v + 3.30, 2) for v in result['Henry Hub']]

        # TTF: need EURUSD history too — approximate with latest rate
        if 'TTF=F' in ticker_series:
            eurusd = 1.10
            try:
                eu_raw = yf.download('EURUSD=X', period='2d', interval='1d', progress=False)
                if not eu_raw.empty:
                    eurusd = float(eu_raw['Close'].dropna().iloc[-1])
            except Exception:
                pass
            result['TTF (ICE)'] = [round(v * eurusd / 3.41214, 2) for v in ticker_series['TTF=F']]

        return result
    except Exception as e:
        logger.error(f'Historical price fetch error: {e}')
        return {}


@prices_bp.route('/api/price-history', methods=['GET'])
def get_price_history():
    """Return 6 months of daily closes per hub for charting."""
    now = time.time()
    with _hist_lock:
        if _hist_cache['data'] and (now - _hist_cache['ts']) < HIST_TTL:
            return jsonify({'success': True, 'history': _hist_cache['data'],
                            'hub_count': len(_hist_cache['data'])})

    data = _fetch_historical()
    with _hist_lock:
        _hist_cache['data'] = data
        _hist_cache['ts'] = time.time()

    return jsonify({'success': True, 'history': data, 'hub_count': len(data)})


# ---------------------------------------------------------------------------
# Forward Curve — Real deferred-month prices from yfinance
# ---------------------------------------------------------------------------
_fwd_cache = {'data': None, 'ts': 0}
_fwd_lock = threading.Lock()
FWD_TTL = 1800  # cache for 30 minutes

MONTH_CODES = {1:'F', 2:'G', 3:'H', 4:'J', 5:'K', 6:'M',
               7:'N', 8:'Q', 9:'U', 10:'V', 11:'X', 12:'Z'}

# Commodity roots: root symbol, hub name, exchange suffix, listed months, is_cents
FORWARD_CURVE_SPECS = {
    'NG':  {'hub': 'Henry Hub',       'suffix': '.NYM', 'months': list(range(1,13)), 'cents': False},
    'CL':  {'hub': 'WTI Cushing',     'suffix': '.NYM', 'months': list(range(1,13)), 'cents': False},
    'BZ':  {'hub': 'Brent Dated',     'suffix': '.NYM', 'months': list(range(1,13)), 'cents': False},
    'HO':  {'hub': 'ULSD Diesel',     'suffix': '.NYM', 'months': list(range(1,13)), 'cents': False},
    'RB':  {'hub': 'RBOB Gasoline',   'suffix': '.NYM', 'months': list(range(1,13)), 'cents': False},
    'GC':  {'hub': 'Gold (COMEX)',     'suffix': '.CMX', 'months': [2,4,6,8,10,12],  'cents': False},
    'SI':  {'hub': 'Silver (COMEX)',   'suffix': '.CMX', 'months': [3,5,7,9,12],     'cents': False},
    'HG':  {'hub': 'Copper (COMEX)',   'suffix': '.CMX', 'months': list(range(1,13)), 'cents': False},
    'ZC':  {'hub': 'Corn (CBOT)',      'suffix': '.CBT', 'months': [3,5,7,9,12],     'cents': True},
    'ZW':  {'hub': 'Wheat (CBOT)',     'suffix': '.CBT', 'months': [3,5,7,9,12],     'cents': True},
    'ZS':  {'hub': 'Soybeans (CBOT)',  'suffix': '.CBT', 'months': [1,3,5,7,8,9,11], 'cents': True},
}


def _generate_forward_tickers():
    """Generate specific contract tickers for the next 12 months."""
    now = datetime.now()
    all_tickers = []
    ticker_meta = {}  # ticker -> {hub, delivery, root, cents}

    for root, spec in FORWARD_CURVE_SPECS.items():
        for offset in range(1, 14):  # up to 13 months out
            target_month = now.month + offset
            target_year = now.year + (target_month - 1) // 12
            target_month = ((target_month - 1) % 12) + 1

            if target_month not in spec['months']:
                continue

            mc = MONTH_CODES[target_month]
            y2 = str(target_year)[-2:]
            delivery = f'{target_year}-{target_month:02d}'

            # Try ticker with exchange suffix
            ticker = f'{root}{mc}{y2}{spec["suffix"]}'
            all_tickers.append(ticker)
            ticker_meta[ticker] = {
                'hub': spec['hub'], 'delivery': delivery,
                'root': root, 'cents': spec['cents'],
            }

    return all_tickers, ticker_meta


def _fetch_forward_curve():
    """Fetch deferred month contract prices via yfinance."""
    try:
        import yfinance as yf

        all_tickers, ticker_meta = _generate_forward_tickers()
        if not all_tickers:
            return {}

        # Fetch in batches to avoid overwhelming yfinance
        BATCH = 30
        raw_prices = {}
        for i in range(0, len(all_tickers), BATCH):
            batch = all_tickers[i:i+BATCH]
            result = _fetch_yfinance(batch)
            # For cents tickers, the conversion is based on the root
            for tk, price in result.items():
                meta = ticker_meta.get(tk)
                if meta and meta['cents'] and tk not in CENTS_TICKERS:
                    price = price / 100.0
                raw_prices[tk] = price

        # Also try without exchange suffix for any that failed
        missing = [tk for tk in all_tickers if tk not in raw_prices]
        if missing:
            alt_tickers = []
            alt_map = {}
            for tk in missing:
                # Strip suffix: 'NGJ26.NYM' -> 'NGJ26'
                alt = tk.split('.')[0]
                alt_tickers.append(alt)
                alt_map[alt] = tk
            if alt_tickers:
                alt_result = _fetch_yfinance(alt_tickers)
                for alt_tk, price in alt_result.items():
                    orig_tk = alt_map.get(alt_tk, alt_tk)
                    meta = ticker_meta.get(orig_tk)
                    if meta and meta['cents']:
                        price = price / 100.0
                    raw_prices[orig_tk] = price

        # Build per-hub forward curves: hub -> [{delivery, price}]
        curves = {}
        for tk, price in raw_prices.items():
            meta = ticker_meta.get(tk)
            if not meta:
                continue
            hub = meta['hub']
            if hub not in curves:
                curves[hub] = []
            curves[hub].append({
                'delivery': meta['delivery'],
                'price': round(price, 6),
            })

        # Sort each curve by delivery month
        for hub in curves:
            curves[hub].sort(key=lambda x: x['delivery'])

        # Derive spread-based forward curves for secondary hubs
        if 'Henry Hub' in curves:
            hh_curve = {pt['delivery']: pt['price'] for pt in curves['Henry Hub']}
            for hub_name, spread in _NG_SPREADS.items():
                curves[hub_name] = [
                    {'delivery': d, 'price': round(p + spread, 4)}
                    for d, p in sorted(hh_curve.items())
                ]
            # Power hubs from gas
            for hub_name, (gas_hub, heat_rate, adder) in _POWER_HEAT.items():
                gas_curve = None
                if gas_hub == 'Henry Hub':
                    gas_curve = hh_curve
                elif gas_hub in _NG_SPREADS:
                    sp = _NG_SPREADS[gas_hub]
                    gas_curve = {d: p + sp for d, p in hh_curve.items()}
                if gas_curve:
                    curves[hub_name] = [
                        {'delivery': d, 'price': round(p * heat_rate + adder, 2)}
                        for d, p in sorted(gas_curve.items())
                    ]

        if 'WTI Cushing' in curves:
            wti_curve = {pt['delivery']: pt['price'] for pt in curves['WTI Cushing']}
            for hub_name, diff in _CRUDE_DIFFS.items():
                curves[hub_name] = [
                    {'delivery': d, 'price': round(p + diff, 2)}
                    for d, p in sorted(wti_curve.items())
                ]
            # NGL hubs from anchor
            for hub_name, (anchor, ratio) in _NGL_RATIOS.items():
                anchor_curve = None
                if anchor == 'WTI Cushing':
                    anchor_curve = wti_curve
                elif anchor == 'Henry Hub' and 'Henry Hub' in curves:
                    anchor_curve = {pt['delivery']: pt['price'] for pt in curves['Henry Hub']}
                if anchor_curve:
                    curves[hub_name] = [
                        {'delivery': d, 'price': round(p * ratio, 2)}
                        for d, p in sorted(anchor_curve.items())
                    ]

        logger.info(f'Forward curve fetched: {len(curves)} hubs, {sum(len(v) for v in curves.values())} total points')
        return curves
    except Exception as e:
        logger.error(f'Forward curve fetch error: {e}')
        return {}


@prices_bp.route('/api/forward-curve', methods=['GET'])
def get_forward_curve():
    """Return real deferred-month futures prices for all major hubs."""
    now = time.time()
    with _fwd_lock:
        if _fwd_cache['data'] and (now - _fwd_cache['ts']) < FWD_TTL:
            return jsonify({'success': True, 'curves': _fwd_cache['data'],
                            'hub_count': len(_fwd_cache['data']),
                            'cache_age_seconds': int(now - _fwd_cache['ts'])})

    data = _fetch_forward_curve()
    with _fwd_lock:
        _fwd_cache['data'] = data
        _fwd_cache['ts'] = time.time()

    return jsonify({
        'success': True, 'curves': data,
        'hub_count': len(data),
        'cache_age_seconds': 0,
    })
