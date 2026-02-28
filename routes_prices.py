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
from datetime import datetime, timezone

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
    """Fetch Henry Hub and WTI spot prices from EIA API v2."""
    if not EIA_API_KEY:
        return {}
    result = {}
    try:
        # Henry Hub natural gas spot
        url = (
            'https://api.eia.gov/v2/natural-gas/pri/sum/data/'
            f'?api_key={EIA_API_KEY}'
            '&frequency=daily&data[0]=value&facets[series][]=RNGWHHD'
            '&sort[0][column]=period&sort[0][direction]=desc&length=1'
        )
        r = requests.get(url, timeout=8)
        d = r.json()
        rows = d.get('response', {}).get('data', [])
        if rows and rows[0].get('value') is not None:
            result['henry_hub_eia'] = float(rows[0]['value'])
    except Exception as e:
        logger.debug(f'EIA NG spot fetch failed: {e}')

    try:
        # WTI crude spot
        url = (
            'https://api.eia.gov/v2/petroleum/pri/spt/data/'
            f'?api_key={EIA_API_KEY}'
            '&frequency=daily&data[0]=value&facets[series][]=RCLC1'
            '&sort[0][column]=period&sort[0][direction]=desc&length=1'
        )
        r = requests.get(url, timeout=8)
        d = r.json()
        rows = d.get('response', {}).get('data', [])
        if rows and rows[0].get('value') is not None:
            result['wti_eia'] = float(rows[0]['value'])
    except Exception as e:
        logger.debug(f'EIA WTI spot fetch failed: {e}')

    return result


def _fetch_ercot_lmps():
    """
    Fetch ERCOT real-time settlement point prices (no API key required).
    Uses the ERCOT public API v2 grid-status endpoint — updated every 5 minutes.
    Returns dict: hub_name -> float ($/MWh)
    """
    NAME_MAP = {
        'HB_HUBAVG': 'ERCOT Hub',
        'HB_NORTH':  'ERCOT North',
        'HB_SOUTH':  'ERCOT South',
        'HB_WEST':   'ERCOT Hub',
        'HB_BUSAVG': 'ERCOT Hub',
    }
    # Try the newer ERCOT API v2 endpoint (grid conditions / realtime LMPs)
    urls_to_try = [
        'https://www.ercot.com/api/1/services/read/dashboards/current-condition.json',
        'https://www.ercot.com/api/1/services/read/dashboards/systemWidePrices.json',
    ]
    result = {}
    for url in urls_to_try:
        try:
            r = requests.get(url, timeout=8, headers={'Accept': 'application/json',
                                                       'User-Agent': 'Mozilla/5.0'})
            if r.status_code != 200:
                continue
            data = r.json()
            # Walk all nested dicts/lists looking for settlement point price data
            def _walk(obj):
                if isinstance(obj, list):
                    for item in obj:
                        sp = item.get('settlementPointName', '') if isinstance(item, dict) else ''
                        pr = item.get('settlementPointPrice') if isinstance(item, dict) else None
                        if sp in NAME_MAP and pr is not None and NAME_MAP[sp] not in result:
                            result[NAME_MAP[sp]] = round(float(pr), 2)
                        _walk(item) if isinstance(item, dict) else None
                elif isinstance(obj, dict):
                    for v in obj.values():
                        _walk(v)
            _walk(data)
            if result:
                logger.debug(f'ERCOT LMPs fetched from {url}: {result}')
                return result
        except Exception as e:
            logger.debug(f'ERCOT attempt {url} failed: {e}')
    logger.debug('ERCOT LMP fetch: all endpoints failed, returning empty')
    return result


def _fetch_caiso_lmps():
    """
    Fetch CAISO real-time LMPs via OASIS API (no API key required).
    Returns most recent interval prices for NP15 and SP15 nodes ($/MWh).
    Note: CAISO OASIS returns a ZIP file containing CSV — parsed in memory.
    """
    try:
        now_utc = datetime.now(timezone.utc)
        # Use the current hour; CAISO data is typically available with ~15 min lag
        start = now_utc.strftime('%Y%m%dT%H00')
        # Node IDs for the two main CAISO trading hubs
        nodes = 'TH_NP15_GEN-APND,TH_SP15_GEN-APND'
        url = (
            'https://oasis.caiso.com/oasisapi/SingleZip'
            f'?queryname=PRC_INTVL_LMP'
            f'&startdatetime={start}'
            f'&version=1&market_run_id=RTM'
            f'&node_id={nodes}'
            f'&resultformat=6'  # CSV format
        )
        r = requests.get(url, timeout=12)
        if r.status_code != 200 or not r.content:
            return {}

        # Unzip in memory
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            csv_name = next((n for n in zf.namelist() if n.endswith('.csv')), None)
            if not csv_name:
                return {}
            csv_bytes = zf.read(csv_name).decode('utf-8', errors='replace')

        # Parse CSV: find most recent LMP_TYPE=LMP rows per node
        lines = csv_bytes.splitlines()
        if not lines:
            return {}
        header = [h.strip() for h in lines[0].split(',')]
        try:
            node_col = header.index('NODE')
            val_col  = header.index('MW')
            type_col = header.index('LMP_TYPE')
        except ValueError:
            # Column names may vary; try alternative names
            try:
                node_col = next(i for i, h in enumerate(header) if 'NODE' in h.upper())
                val_col  = next(i for i, h in enumerate(header) if h.upper() in ('MW', 'VALUE', 'LMP'))
                type_col = next(i for i, h in enumerate(header) if 'TYPE' in h.upper())
            except (StopIteration, ValueError):
                return {}

        latest = {}  # node -> price (take last occurrence = most recent interval)
        for line in lines[1:]:
            cols = line.split(',')
            if len(cols) <= max(node_col, val_col, type_col):
                continue
            lmp_type = cols[type_col].strip()
            if lmp_type != 'LMP':
                continue
            node = cols[node_col].strip()
            try:
                price = float(cols[val_col].strip())
                latest[node] = price
            except ValueError:
                continue

        result = {}
        if 'TH_NP15_GEN-APND' in latest:
            result['CAISO NP15'] = round(latest['TH_NP15_GEN-APND'], 2)
        if 'TH_SP15_GEN-APND' in latest:
            result['CAISO SP15'] = round(latest['TH_SP15_GEN-APND'], 2)
        logger.debug(f'CAISO LMPs fetched: {result}')
        return result
    except Exception as e:
        logger.debug(f'CAISO LMP fetch failed: {e}')
        return {}


def _build_hub_prices(yf_prices, eia_prices, ercot_lmps=None, caiso_lmps=None):
    """
    Map raw benchmark prices to the platform's hub names.
    For hubs without direct data, compute as benchmark ± historical spread.

    NG hubs: priced as Henry Hub + basis spread
    Crude hubs: priced as WTI + differential
    Power hubs: real-time LMPs where available (ERCOT, CAISO), otherwise heat-rate calc
    Others: direct mapping where available

    Returns (prices_dict, live_hubs_list) — live_hubs are hubs anchored to
    at least one real external data source (EIA, yfinance, ERCOT, or CAISO).
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
            live_hubs.add(hub)

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
            live_hubs.add(hub)
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

    # --- Power: real-time LMPs where available, heat-rate calc as fallback ---
    # Heat rate: typical 7.0-9.0 MMBtu/MWh
    POWER_GAS_REF = {
        'ERCOT Hub':    ('Henry Hub',      8.5,  0.00),
        'ERCOT North':  ('Henry Hub',      8.0, -1.50),
        'ERCOT South':  ('Henry Hub',      8.8, +0.80),
        'PJM West Hub': ('Transco Zone 6', 7.5, -1.00),
        'NEPOOL Mass':  ('Algonquin',      8.5, +3.00),
        'MISO Illinois':('Chicago',        8.0, -2.50),
        'CAISO NP15':   ('SoCal Gas',      9.0, +3.00),
        'CAISO SP15':   ('SoCal Gas',      8.8, +2.00),
        'NYISO Zone J': ('Transco Zone 6', 9.5, +5.00),
        'NYISO Zone A': ('Dawn',           7.5, -2.00),
        'SPP North':    ('Henry Hub',      7.8, -3.50),
    }

    # Merge live LMP sources (prefer real-time data over derived)
    live_power_prices = {}
    live_power_prices.update(ercot_lmps)   # ERCOT real-time SPP
    live_power_prices.update(caiso_lmps)   # CAISO real-time LMP

    for hub, (gas_hub, heat_rate, adder) in POWER_GAS_REF.items():
        if hub in live_power_prices:
            # Use real-time LMP
            out[hub] = live_power_prices[hub]
            live_hubs.add(hub)
        else:
            # Fall back to heat-rate calculation from gas price
            gas_price = out.get(gas_hub)
            if gas_price:
                out[hub] = round(gas_price * heat_rate + adder, 2)
                live_hubs.add(hub)  # still anchored to live gas price

    return out, list(live_hubs)


def fetch_live_prices():
    """Fetch all prices, returning hub_name -> float dict. Uses cache."""
    now = time.time()
    with _price_lock:
        if _price_cache['data'] and (now - _price_cache['ts']) < PRICE_TTL:
            return _price_cache['data']

    logger.info('Fetching live prices from yfinance + EIA + ERCOT + CAISO...')

    # Fetch all sources concurrently
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        f_yf    = ex.submit(_fetch_yfinance, TICKERS)
        f_eia   = ex.submit(_fetch_eia_prices)
        f_ercot = ex.submit(_fetch_ercot_lmps)
        f_caiso = ex.submit(_fetch_caiso_lmps)
        yf_prices   = f_yf.result()
        eia_prices  = f_eia.result()
        ercot_lmps  = f_ercot.result()
        caiso_lmps  = f_caiso.result()

    hub_prices, live_hubs = _build_hub_prices(yf_prices, eia_prices, ercot_lmps, caiso_lmps)

    sources = []
    if yf_prices:  sources.append('yfinance')
    if eia_prices: sources.append('EIA')
    if ercot_lmps: sources.append(f'ERCOT({len(ercot_lmps)})')
    if caiso_lmps: sources.append(f'CAISO({len(caiso_lmps)})')
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
            'source': 'yfinance+EIA+ERCOT+CAISO'
        })
    except Exception as e:
        logger.error(f'Live prices endpoint error: {e}')
        return jsonify({'success': False, 'error': str(e), 'prices': {}})
