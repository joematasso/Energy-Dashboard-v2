#!/usr/bin/env python3
"""Market data routes: news proxy, EIA, COT, market hours, trade feed."""

import re
import time
import json
import logging
from datetime import datetime, date
from threading import Lock

import requests
import feedparser
from flask import Blueprint, request, jsonify

from app import (get_db, logger, news_cache, news_cache_lock, NEWS_CACHE_TTL,
                 eia_cache, eia_cache_lock, EIA_CACHE_TTL, EIA_API_KEY)

market_bp = Blueprint('market', __name__)

# ---------------------------------------------------------------------------
# News Proxy
# ---------------------------------------------------------------------------
def _strip_html(text):
    """Strip all HTML tags, decode entities, collapse whitespace."""
    if not text:
        return ''
    # Remove HTML tags
    clean = re.sub(r'<[^>]+>', ' ', text)
    # Decode common HTML entities
    for entity, char in [('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'),
                         ('&quot;', '"'), ("&#39;", "'"), ('&nbsp;', ' '),
                         ("&#8217;", "'"), ("&#8216;", "'"), ('&#8220;', '\u201c'),
                         ('&#8221;', '\u201d'), ('&#8230;', '...')]:
        clean = clean.replace(entity, char)
    # Collapse whitespace
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean


@market_bp.route('/api/news/<commodity>')
def get_news(commodity):
    with news_cache_lock:
        cached = news_cache.get(commodity)
        if cached and time.time() - cached['ts'] < NEWS_CACHE_TTL:
            return jsonify({'success': True, 'articles': cached['data']})

    # Per-commodity RSS feeds and keyword filters
    feed_config = {
        'ng': {
            'feeds': [
                ('https://oilprice.com/rss/main', 'OilPrice'),
                ('https://www.rigzone.com/news/rss/rigzone_latest.aspx', 'Rigzone'),
            ],
            'keywords': ['natural gas', 'storage', 'henry hub', 'pipeline', 'gas storage',
                         'gas export', 'gas demand', 'gas production', 'gas price', 'mcf', 'bcf',
                         'marcellus', 'permian gas', 'freeport', 'sabine', 'cheniere',
                         'nymex gas', 'gas futures', 'heating degree', 'gas rig']
        },
        'lng': {
            'feeds': [
                ('https://www.naturalgasintel.com/feed/', 'NGI'),
                ('https://oilprice.com/rss/main', 'OilPrice'),
                ('https://www.rigzone.com/news/rss/rigzone_latest.aspx', 'Rigzone'),
                ('https://gcaptain.com/feed/', 'gCaptain'),
            ],
            'keywords': ['lng', 'liquefied natural gas', 'liquefaction', 'regasification',
                         'lng export', 'lng import', 'lng terminal', 'lng carrier',
                         'lng tanker', 'lng cargo', 'lng spot', 'freeport lng',
                         'sabine pass', 'cheniere', 'cameron lng', 'golden pass',
                         'plaquemines', 'venture global', 'next decade',
                         'jktc', 'ttf', 'des', 'fob lng', 'lng train',
                         'qatar lng', 'australia lng', 'mozambique lng',
                         'lng demand', 'lng supply', 'floating lng', 'flng',
                         'lng vessel', 'lng shipping', 'lng bunkering']
        },
        'ngls': {
            'feeds': [
                ('https://www.naturalgasintel.com/feed/', 'NGI'),
                ('https://oilprice.com/rss/main', 'OilPrice'),
                ('https://www.rigzone.com/news/rss/rigzone_latest.aspx', 'Rigzone'),
            ],
            'keywords': ['ngl', 'natural gas liquid', 'ethane', 'propane', 'butane',
                         'isobutane', 'natural gasoline', 'y-grade', 'mont belvieu',
                         'conway', 'fractionat', 'ngl pipeline', 'ngl export',
                         'purity product', 'ngl supply', 'ngl demand',
                         'petrochemical', 'cracker', 'ethylene', 'propylene',
                         'ngl price', 'ngl spread', 'frac spread',
                         'enterprise product', 'targa', 'oneok', 'dcp midstream',
                         'ngl barrel', 'gas processing', 'ngl recovery',
                         'midstream', 'gas plant', 'ngl storage']
        },
        'crude': {
            'feeds': [
                ('https://oilprice.com/rss/main', 'OilPrice'),
                ('https://www.rigzone.com/news/rss/rigzone_latest.aspx', 'Rigzone'),
            ],
            'keywords': ['crude', 'oil', 'opec', 'barrel', 'wti', 'brent', 'petroleum',
                         'refinery', 'gasoline', 'diesel', 'cushing', 'bakken', 'shale',
                         'oil price', 'oil production', 'oil demand', 'drilling', 'rig count']
        },
        'power': {
            'feeds': [
                ('https://www.utilitydive.com/feeds/news/', 'UtilityDive'),
                ('https://oilprice.com/rss/main', 'OilPrice'),
            ],
            'keywords': ['power', 'electric', 'grid', 'renewable', 'ercot', 'pjm', 'solar',
                         'wind', 'utility', 'generation', 'caiso', 'nuclear', 'battery',
                         'capacity', 'megawatt', 'blackout', 'transmission', 'energy storage',
                         'power plant', 'coal plant', 'gas plant', 'grid operator',
                         'wholesale power', 'electricity price', 'load forecast',
                         'demand response', 'interconnect', 'ferc']
        },
        'freight': {
            'feeds': [
                ('https://gcaptain.com/feed/', 'gCaptain'),
                ('https://www.hellenicshippingnews.com/feed/', 'Hellenic Shipping'),
            ],
            'keywords': ['shipping', 'freight', 'tanker', 'baltic', 'vessel', 'vlcc', 'cargo',
                         'maritime', 'bulk', 'container', 'charter', 'tonnage', 'port',
                         'suezmax', 'panamax', 'capesize', 'lng carrier', 'dry bulk']
        },
        'ag': {
            'feeds': [
                ('https://www.agweb.com/rss/news', 'AgWeb'),
                ('https://www.feedstuffs.com/rss.xml', 'Feedstuffs'),
            ],
            'keywords': ['corn', 'soybean', 'wheat', 'grain', 'crop', 'usda', 'cattle',
                         'hog', 'livestock', 'cotton', 'sugar', 'coffee', 'cocoa', 'harvest',
                         'planting', 'drought', 'yield', 'agriculture', 'farm', 'ethanol']
        },
        'metals': {
            'feeds': [
                ('https://news.goldseek.com/newsRSS.xml', 'GoldSeek'),
                ('https://www.mining.com/feed/', 'Mining.com'),
                ('https://www.northernminer.com/feed/', 'Northern Miner'),
                ('https://www.canadianminingjournal.com/feed/', 'CMJ'),
            ],
            'keywords': ['gold', 'silver', 'copper', 'platinum', 'palladium', 'aluminum',
                         'aluminium', 'nickel', 'iron ore', 'steel', 'zinc', 'metal',
                         'mining', 'bullion', 'comex', 'lme', 'precious', 'base metal',
                         'ore', 'cobalt', 'lithium', 'tin', 'lead', 'manganese',
                         'smelter', 'refining', 'scrap metal', 'gold price',
                         'copper price', 'silver price', 'metal market']
        }
    }

    config = feed_config.get(commodity, feed_config.get('crude'))
    articles = []

    for feed_url, source_name in config['feeds']:
        try:
            feed = feedparser.parse(feed_url, agent='Mozilla/5.0 (compatible; EnergyTradingTerminal/1.0)')
            for entry in feed.entries[:30]:
                raw_title = entry.get('title', '')
                raw_summary = entry.get('summary', '')
                # Strip HTML for keyword matching
                clean_title = _strip_html(raw_title).lower()
                clean_summary = _strip_html(raw_summary).lower()
                combined = clean_title + ' ' + clean_summary
                # Deduplicate by headline
                headline_text = _strip_html(raw_title)
                if any(a['headline'] == headline_text for a in articles):
                    continue
                if any(kw in combined for kw in config['keywords']):
                    # Parse time
                    pub = entry.get('published', entry.get('updated', ''))
                    try:
                        from email.utils import parsedate_to_datetime
                        dt = parsedate_to_datetime(pub)
                        age = datetime.now(dt.tzinfo) - dt if dt.tzinfo else datetime.utcnow() - dt
                        hrs = int(age.total_seconds() / 3600)
                        if hrs < 1:
                            time_label = f"{int(age.total_seconds()/60)}m ago"
                        elif hrs < 24:
                            time_label = f"{hrs}h ago"
                        else:
                            time_label = f"{hrs//24}d ago"
                    except Exception:
                        time_label = pub[:16] if pub else ''

                    articles.append({
                        'source': source_name,
                        'headline': _strip_html(raw_title),
                        'description': _strip_html(raw_summary)[:200],
                        'time': time_label,
                        'url': entry.get('link', '')
                    })
                if len(articles) >= 15:
                    break
        except Exception as e:
            logger.warning(f"RSS fetch failed for {source_name} ({commodity}): {e}")
            continue

    with news_cache_lock:
        news_cache[commodity] = {'data': articles, 'ts': time.time()}
    return jsonify({'success': True, 'articles': articles})


# ---------------------------------------------------------------------------
# EIA Proxy
# ---------------------------------------------------------------------------
@market_bp.route('/api/eia-debug')
def eia_debug():
    """Debug endpoint — hit /api/eia-debug in your browser to check EIA status"""
    info = {
        'api_key_set': bool(EIA_API_KEY),
        'api_key_prefix': EIA_API_KEY[:6] + '...' if len(EIA_API_KEY) > 6 else '(empty)',
        'cache_entries': list(eia_cache.keys()),
        'test_result': None
    }
    if EIA_API_KEY:
        try:
            test_url = f"https://api.eia.gov/v2/natural-gas/stor/wkly/data/?api_key={EIA_API_KEY}&frequency=weekly&data[0]=value&facets[process][]=SAT&sort[0][column]=period&sort[0][direction]=desc&length=2"
            resp = requests.get(test_url, timeout=15)
            info['test_status_code'] = resp.status_code
            info['test_response_preview'] = resp.text[:500]
            data = resp.json()
            rows = data.get('response', {}).get('data', [])
            info['test_rows_returned'] = len(rows)
            if rows:
                info['test_first_row'] = rows[0]
            info['test_result'] = 'OK' if rows else 'No data rows in response'
        except Exception as e:
            info['test_result'] = f'Error: {str(e)}'
    else:
        info['test_result'] = 'EIA_API_KEY environment variable not set. Run: set EIA_API_KEY=your_key_here before starting app.py'
    return jsonify(info)

@market_bp.route('/api/eia/<eia_type>')
def get_eia(eia_type):
    with eia_cache_lock:
        cached = eia_cache.get(eia_type)
        if cached and time.time() - cached['ts'] < EIA_CACHE_TTL:
            return jsonify({'success': True, 'data': cached['data']})

    if not EIA_API_KEY:
        return jsonify({'success': False, 'error': 'EIA_API_KEY not configured'})

    # EIA v2 API routes and series IDs
    routes = {
        'ng_storage': {
            'url': f"https://api.eia.gov/v2/natural-gas/stor/wkly/data/?api_key={EIA_API_KEY}&frequency=weekly&data[0]=value&facets[process][]=SAT&sort[0][column]=period&sort[0][direction]=desc&length=52",
            'label': 'NG Weekly Storage'
        },
        'crude_inventory': {
            'url': f"https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key={EIA_API_KEY}&frequency=weekly&data[0]=value&facets[product][]=EPC0&facets[duoarea][]=NUS&sort[0][column]=period&sort[0][direction]=desc&length=52",
            'label': 'Crude Weekly Inventory'
        },
        'crude_cushing': {
            'url': f"https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key={EIA_API_KEY}&frequency=weekly&data[0]=value&facets[product][]=EPC0&facets[duoarea][]=R20&sort[0][column]=period&sort[0][direction]=desc&length=52",
            'label': 'Cushing Stocks'
        }
    }

    route = routes.get(eia_type)
    if not route:
        return jsonify({'success': False, 'error': 'Unknown EIA type'}), 400

    try:
        resp = requests.get(route['url'], timeout=15)
        raw = resp.json()
        # Parse v2 response format
        rows = raw.get('response', {}).get('data', [])
        parsed = []
        for row in rows[:52]:
            parsed.append({
                'period': row.get('period', ''),
                'value': row.get('value'),
            })
        result = {
            'type': eia_type,
            'label': route['label'],
            'data': parsed,
            'total': raw.get('response', {}).get('total', 0)
        }
        with eia_cache_lock:
            eia_cache[eia_type] = {'data': result, 'ts': time.time()}
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        logger.error(f"EIA fetch error for {eia_type}: {e}")
        return jsonify({'success': False, 'error': str(e)})

# ---------------------------------------------------------------------------
# CFTC Commitment of Traders Proxy
# ---------------------------------------------------------------------------
cot_cache = {}
cot_cache_lock = Lock()
COT_CACHE_TTL = 7200  # 2 hours

@market_bp.route('/api/cot/<commodity>')
def get_cot(commodity):
    with cot_cache_lock:
        cached = cot_cache.get(commodity)
        if cached and time.time() - cached['ts'] < COT_CACHE_TTL:
            return jsonify({'success': True, 'data': cached['data']})

    # CFTC contract codes
    contract_map = {
        'ng': '023651',       # Natural Gas (NYMEX)
        'crude': '067651',    # Crude Oil (NYMEX)
    }
    code = contract_map.get(commodity)
    if not code:
        return jsonify({'success': False, 'error': 'Unknown commodity'}), 400

    try:
        # CFTC Disaggregated Futures — Socrata Open Data API (no key needed)
        url = (
            f"https://publicreporting.cftc.gov/resource/72hh-3qpy.json?"
            f"$where=cftc_contract_market_code='{code}'"
            f"&$order=report_date_as_yyyy_mm_dd DESC"
            f"&$limit=12"
        )
        resp = requests.get(url, timeout=15)
        rows = resp.json()
        parsed = []
        for row in rows:
            parsed.append({
                'date': row.get('report_date_as_yyyy_mm_dd', ''),
                'market': row.get('market_and_exchange_names', ''),
                'oi': _safe_int(row.get('open_interest_all')),
                'prod_long': _safe_int(row.get('prod_merc_positions_long_all')),
                'prod_short': _safe_int(row.get('prod_merc_positions_short_all')),
                'swap_long': _safe_int(row.get('swap_positions_long_all')),
                'swap_short': _safe_int(row.get('swap__positions_short_all')),
                'mm_long': _safe_int(row.get('money_manager_positions_long')),
                'mm_short': _safe_int(row.get('money_manager_positions_short')),
                'other_long': _safe_int(row.get('other_rept_positions_long_all')),
                'other_short': _safe_int(row.get('other_rept_positions_short_all')),
                'nonrept_long': _safe_int(row.get('nonrept_positions_long_all')),
                'nonrept_short': _safe_int(row.get('nonrept_positions_short_all')),
            })
        result = {'commodity': commodity, 'data': parsed}
        with cot_cache_lock:
            cot_cache[commodity] = {'data': result, 'ts': time.time()}
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        logger.error(f"CFTC COT fetch error for {commodity}: {e}")
        return jsonify({'success': False, 'error': str(e)})

def _safe_int(val):
    try:
        return int(val) if val else 0
    except (ValueError, TypeError):
        return 0

# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# NYMEX Market Hours & Holidays
# ---------------------------------------------------------------------------
NYMEX_HOLIDAYS = {
    # 2025
    '2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26',
    '2025-07-04','2025-09-01','2025-11-27','2025-12-25',
    # 2026
    '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
    '2026-07-03','2026-09-07','2026-11-26','2026-12-25',
    # 2027
    '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31',
    '2027-07-05','2027-09-06','2027-11-25','2027-12-24',
    # 2028
    '2028-01-01','2028-01-17','2028-02-21','2028-04-14','2028-05-29',
    '2028-07-04','2028-09-04','2028-11-23','2028-12-25',
    # 2029
    '2029-01-01','2029-01-15','2029-02-19','2029-03-30','2029-05-28',
    '2029-07-04','2029-09-03','2029-11-22','2029-12-25',
    # 2030
    '2030-01-01','2030-01-21','2030-02-18','2030-04-19','2030-05-27',
    '2030-07-04','2030-09-02','2030-11-28','2030-12-25',
}

def is_market_open():
    """Check if market is open. Business hours: 8AM-5PM CT, Mon-Fri. Closed holidays."""
    try:
        import pytz
        ct = datetime.now(pytz.timezone('US/Central'))
    except Exception:
        ct = datetime.utcnow() - timedelta(hours=6)
    date_str = ct.strftime('%Y-%m-%d')
    if date_str in NYMEX_HOLIDAYS:
        return False, 'Holiday', ct
    dow = ct.weekday()
    t = ct.hour * 60 + ct.minute
    if dow >= 5:  # Saturday=5, Sunday=6
        return False, 'Weekend', ct
    if t < 8*60:  # Before 8AM CT
        return False, 'Pre-Market', ct
    if t >= 17*60:  # After 5PM CT
        return False, 'After Hours', ct
    return True, 'Open', ct


@market_bp.route('/api/market-status')
def market_status():
    is_open, reason, ct = is_market_open()
    return jsonify({
        'open': is_open, 'reason': reason,
        'ct_time': ct.strftime('%H:%M:%S'), 'ct_date': ct.strftime('%Y-%m-%d'),
        'ct_dow': ct.strftime('%A'), 'holidays': sorted(NYMEX_HOLIDAYS)
    })




# ---------------------------------------------------------------------------
# Trade Feed
# ---------------------------------------------------------------------------
@market_bp.route('/api/trade-feed')
def get_trade_feed():
    db = get_db()
    rows = db.execute("SELECT * FROM trade_feed ORDER BY created_at DESC LIMIT 50").fetchall()
    return jsonify([{
        'id': r['id'], 'trader_name': r['trader_name'], 'action': r['action'],
        'summary': r['summary'], 'team_name': r['team_name'], 'created_at': r['created_at']
    } for r in rows])


# ---------------------------------------------------------------------------
