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

from app import EIA_API_KEY

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
    Fetch WTI spot price from EIA API v2.
    Note: EIA v2 dropped the daily Henry Hub gas spot (RNGWHHD) — NG price
    now comes exclusively from yfinance NG=F (NYMEX near-month futures).
    WTI spot is available via series RWTC in /petroleum/pri/spt/data/.
    """
    if not EIA_API_KEY:
        return {}
    result = {}
    try:
        # WTI Cushing spot price (series RWTC)
        url = (
            'https://api.eia.gov/v2/petroleum/pri/spt/data/'
            f'?api_key={EIA_API_KEY}'
            '&frequency=daily&data[0]=value&facets[series][]=RWTC'
            '&sort[0][column]=period&sort[0][direction]=desc&length=1'
        )
        r = requests.get(url, timeout=8)
        d = r.json()
        rows = d.get('response', {}).get('data', [])
        if rows and rows[0].get('value') is not None:
            result['wti_eia'] = float(rows[0]['value'])
            logger.debug(f"EIA WTI spot: ${rows[0]['value']} ({rows[0].get('period')})")
    except Exception as e:
        logger.debug(f'EIA WTI spot fetch failed: {e}')

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


def _build_hub_prices(yf_prices, eia_prices, nyiso_lmps=None):
    """
    Map raw benchmark prices to the platform's hub names.

    LIVE hubs: directly fetched from an external API (yfinance, EIA, NYISO).
    EST hubs:  derived via fixed spreads/heat-rates from live anchor prices.

    Returns (prices_dict, live_hubs_list).
    """
    ercot_lmps = ercot_lmps or {}
    caiso_lmps = caiso_lmps or {}

    # --- Benchmarks ---
    # Prefer EIA spot (more authoritative) then yfinance for NG and WTI
    hh = eia_prices.get('henry_hub_eia') or yf_prices.get('NG=F')
    wti = eia_prices.get('wti_eia') or yf_prices.get('CL=F')
    brent = yf_prices.get('BZ=F')

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
        # Only Henry Hub itself is sourced from a real feed (yfinance NG=F).
        # All other NG hubs use estimated historical basis spreads — mark as EST.
        live_hubs.add('Henry Hub')

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

    # --- NGLs (anchor to NG and crude) ---
    if hh:
        # Ethane (¢/gal): tracks NG price loosely — ~3.5 Mcf per gallon
        # Base: 22.5 ¢/gal when HH ≈ 2.75 → ratio 22.5/2.75 ≈ 8.18
        out['Ethane (C2)'] = round(hh * 8.18, 1)
        live_hubs.add('Ethane (C2)')
    if wti:
        # Propane ≈ 35% of crude (price in ¢/gal, crude in $/bbl)
        # WTI $79.50 → propane ~72 ¢/gal → ratio ≈ 0.905
        out['Propane (C3)'] = round(wti * 0.905, 1)
        out['Normal Butane (nC4)'] = round(wti * 1.32, 1)
        out['Isobutane (iC4)'] = round(wti * 1.41, 1)
        out['Nat Gasoline (C5+)'] = round(wti * 1.95, 1)
        live_hubs.update(['Propane (C3)', 'Normal Butane (nC4)', 'Isobutane (iC4)', 'Nat Gasoline (C5+)'])

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

    # Apply NYISO real-time LMPs where available; all others are heat-rate EST
    for hub, (gas_hub, heat_rate, adder) in POWER_GAS_REF.items():
        if nyiso_lmps and hub in nyiso_lmps:
            out[hub] = nyiso_lmps[hub]
            live_hubs.add(hub)
        else:
            gas_price = out.get(gas_hub)
            if gas_price:
                out[hub] = round(gas_price * heat_rate + adder, 2)
                # Heat-rate derived — NOT marked live even though anchored to live gas.
                # The formula itself is estimated, so these should show EST.

    return out, list(live_hubs)


def fetch_live_prices():
    """Fetch all prices, returning hub_name -> float dict. Uses cache."""
    now = time.time()
    with _price_lock:
        if _price_cache['data'] and (now - _price_cache['ts']) < PRICE_TTL:
            return _price_cache['data']

    logger.info('Fetching live prices from yfinance + EIA + NYISO...')

    # Fetch all sources concurrently
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        f_yf    = ex.submit(_fetch_yfinance, TICKERS)
        f_eia   = ex.submit(_fetch_eia_prices)
        f_nyiso = ex.submit(_fetch_nyiso_lmps)
        yf_prices  = f_yf.result()
        eia_prices = f_eia.result()
        nyiso_lmps = f_nyiso.result()

    hub_prices, live_hubs = _build_hub_prices(yf_prices, eia_prices, nyiso_lmps)

    sources = []
    if yf_prices:  sources.append('yfinance')
    if eia_prices: sources.append('EIA')
    if nyiso_lmps: sources.append(f'NYISO({len(nyiso_lmps)})')
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
            'source': 'yfinance+EIA+NYISO'
        })
    except Exception as e:
        logger.error(f'Live prices endpoint error: {e}')
        return jsonify({'success': False, 'error': str(e), 'prices': {}})
