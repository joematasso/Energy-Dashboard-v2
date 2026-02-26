#!/usr/bin/env python3
"""Miscellaneous routes: OTC system, weather, WebSocket events, margin calc."""

import json
import math
import logging
import threading
import time as _time
from datetime import datetime, date

import requests
from flask import Blueprint, request, jsonify

from app import (get_db, get_db_standalone, logger, socketio,
                 active_connections, connections_lock)

misc_bp = Blueprint('misc', __name__)

# ---------------------------------------------------------------------------
# OTC System
# ---------------------------------------------------------------------------
@misc_bp.route('/api/traders/otc-status/<trader>', methods=['GET'])
def get_otc_status(trader):
    db = get_db()
    row = db.execute("SELECT otc_available FROM traders WHERE trader_name=?", (trader,)).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    return jsonify({'success': True, 'otc_available': bool(row['otc_available'])})

@misc_bp.route('/api/traders/otc-status/<trader>', methods=['POST'])
def set_otc_status(trader):
    db = get_db()
    data = request.get_json()
    val = 1 if data.get('otc_available', True) else 0
    db.execute("UPDATE traders SET otc_available=? WHERE trader_name=?", (val, trader))
    db.commit()
    return jsonify({'success': True, 'otc_available': bool(val)})

@misc_bp.route('/api/traders/otc-counterparties/<trader>', methods=['GET'])
def get_otc_counterparties(trader):
    db = get_db()
    me = db.execute("SELECT * FROM traders WHERE trader_name=?", (trader,)).fetchone()
    if not me:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    my_team_id = me['team_id']
    if my_team_id:
        rows = db.execute("""
            SELECT t.trader_name, t.display_name, t.real_name, t.firm, t.otc_available,
                   tm.name as team_name, tm.color as team_color
            FROM traders t LEFT JOIN teams tm ON t.team_id=tm.id
            WHERE t.status='ACTIVE' AND t.trader_name != ? AND (t.team_id IS NULL OR t.team_id != ?)
        """, (trader, my_team_id)).fetchall()
    else:
        rows = db.execute("""
            SELECT t.trader_name, t.display_name, t.real_name, t.firm, t.otc_available,
                   tm.name as team_name, tm.color as team_color
            FROM traders t LEFT JOIN teams tm ON t.team_id=tm.id
            WHERE t.status='ACTIVE' AND t.trader_name != ?
        """, (trader,)).fetchall()
    return jsonify({'success': True, 'counterparties': [{
        'trader_name': r['trader_name'], 'display_name': r['display_name'],
        'real_name': r['real_name'] if 'real_name' in r.keys() else r['display_name'],
        'firm': r['firm'], 'otc_available': bool(r['otc_available']),
        'team_name': r['team_name'] or '', 'team_color': r['team_color'] or '#888'
    } for r in rows]})

@misc_bp.route('/api/trades/otc/<trader>', methods=['POST'])
def submit_otc_trade(trader):
    db = get_db()
    data = request.get_json()
    me = db.execute("SELECT * FROM traders WHERE trader_name=? AND status='ACTIVE'", (trader,)).fetchone()
    if not me:
        return jsonify({'success': False, 'error': 'Trader not found'}), 404
    cpty_name = data.get('counterparty', '')
    cpty = db.execute("SELECT * FROM traders WHERE trader_name=? AND status='ACTIVE'", (cpty_name,)).fetchone()
    if not cpty:
        return jsonify({'success': False, 'error': 'Counterparty not found'}), 404
    if not cpty['otc_available']:
        return jsonify({'success': False, 'error': f'{cpty["display_name"]} is not accepting OTC trades'}), 400
    if me['team_id'] and cpty['team_id'] and me['team_id'] == cpty['team_id']:
        return jsonify({'success': False, 'error': 'OTC trades must be with a different team'}), 400

    entry_price = float(data.get('entryPrice', 0))
    volume = float(data.get('volume', 0))
    direction = data.get('direction', '')
    mirror_direction = 'SELL' if direction == 'BUY' else 'BUY'

    trade_data = {
        'type': data.get('type', 'SWAP'), 'direction': direction, 'hub': data.get('hub', ''),
        'volume': volume, 'entryPrice': entry_price, 'spotRef': float(data.get('spotRef', entry_price)),
        'venue': 'OTC', 'counterparty': cpty['display_name'], 'counterpartyTrader': cpty_name,
        'otcMirrorOf': None, 'deliveryMonth': data.get('deliveryMonth', ''),
        'notes': data.get('notes', ''), 'status': 'OPEN', 'timestamp': datetime.utcnow().isoformat(),
    }
    cur = db.execute("INSERT INTO trades (trader_name, trade_data) VALUES (?, ?)", (trader, json.dumps(trade_data)))
    db.commit()
    my_trade_id = cur.lastrowid

    mirror_data = dict(trade_data)
    mirror_data['direction'] = mirror_direction
    mirror_data['counterparty'] = me['display_name']
    mirror_data['counterpartyTrader'] = trader
    mirror_data['otcMirrorOf'] = my_trade_id
    mirror_data['notes'] = f'OTC mirror — initiated by {me["display_name"]}'
    cur2 = db.execute("INSERT INTO trades (trader_name, trade_data) VALUES (?, ?)", (cpty_name, json.dumps(mirror_data)))
    db.commit()
    mirror_id = cur2.lastrowid

    trade_data['otcMirrorOf'] = mirror_id
    db.execute("UPDATE trades SET trade_data=? WHERE id=?", (json.dumps(trade_data), my_trade_id))
    db.commit()

    # Trade feed
    me_team = db.execute("SELECT name FROM teams WHERE id=?", (me['team_id'],)).fetchone() if me['team_id'] else None
    feed_summary = f"{me['display_name']} {direction} {volume:,.0f} {data.get('hub','')} OTC w/ {cpty['display_name']} @ ${entry_price:.4f}"
    db.execute("INSERT INTO trade_feed (trader_name, action, summary, team_name) VALUES (?,?,?,?)",
               (trader, 'OTC_TRADE', feed_summary, me_team['name'] if me_team else ''))
    db.commit()

    socketio.emit('trade_submitted', {'trader_name': trader, 'trade_id': my_trade_id, 'otc': True})
    socketio.emit('trade_submitted', {'trader_name': cpty_name, 'trade_id': mirror_id, 'otc': True})
    socketio.emit('leaderboard_update', {'reason': 'otc_trade'})
    return jsonify({'success': True, 'trade_id': my_trade_id, 'mirror_id': mirror_id})


# ---- OTC Trade Close (auto-close mirror) ----
@misc_bp.route('/api/trades/otc-close/<trader>/<int:trade_id>', methods=['POST'])
def close_otc_trade(trader, trade_id):
    db = get_db()
    row = db.execute("SELECT * FROM trades WHERE id=? AND trader_name=?", (trade_id, trader)).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Trade not found'}), 404
    td = json.loads(row['trade_data'])
    close_data = request.get_json()
    close_price = float(close_data.get('closePrice', 0))

    # Close initiator
    td['status'] = 'CLOSED'
    td['closePrice'] = close_price
    td['closeTimestamp'] = datetime.utcnow().isoformat()
    vol = float(td.get('volume', 0))
    ep = float(td.get('entryPrice', 0))
    is_basis_trade = td.get('type') == 'BASIS_SWAP'
    if is_basis_trade:
        # Basis P&L = change in differential × volume
        diff_change = close_price - ep
        pnl = diff_change * vol if td['direction'] == 'BUY' else -diff_change * vol
    else:
        pnl = (close_price - ep) * vol if td['direction'] == 'BUY' else (ep - close_price) * vol
    td['realizedPnl'] = pnl
    db.execute("UPDATE trades SET trade_data=? WHERE id=?", (json.dumps(td), trade_id))

    # Close mirror
    mirror_id = td.get('otcMirrorOf')
    if mirror_id:
        mrow = db.execute("SELECT * FROM trades WHERE id=?", (mirror_id,)).fetchone()
        if mrow:
            mtd = json.loads(mrow['trade_data'])
            mtd['status'] = 'CLOSED'
            mtd['closePrice'] = close_price
            mtd['closeTimestamp'] = datetime.utcnow().isoformat()
            m_is_basis = mtd.get('type') == 'BASIS_SWAP'
            if m_is_basis:
                m_diff_change = close_price - float(mtd['entryPrice'])
                mpnl = m_diff_change * float(mtd['volume']) if mtd['direction'] == 'BUY' else -m_diff_change * float(mtd['volume'])
            else:
                mpnl = (close_price - float(mtd['entryPrice'])) * float(mtd['volume']) if mtd['direction'] == 'BUY' else (float(mtd['entryPrice']) - close_price) * float(mtd['volume'])
            mtd['realizedPnl'] = mpnl
            db.execute("UPDATE trades SET trade_data=? WHERE id=?", (json.dumps(mtd), mirror_id))
            socketio.emit('trade_closed', {'trader_name': mrow['trader_name'], 'trade_id': mirror_id})

    db.commit()
    socketio.emit('trade_closed', {'trader_name': trader, 'trade_id': trade_id})
    socketio.emit('leaderboard_update', {'reason': 'otc_close'})
    return jsonify({'success': True})


# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# WebSocket Events
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Weather Forecasts (Open-Meteo API + synthetic fallback)
# ---------------------------------------------------------------------------

WEATHER_CITIES = [
    {'id': 'houston', 'name': 'Houston', 'state': 'TX', 'lat': 29.76, 'lon': -95.37,
     'hubs': ['Henry Hub', 'Waha', 'ERCOT Hub', 'ERCOT South'], 'normal_jan': 53, 'normal_jul': 95, 'sector': 'both'},
    {'id': 'chicago', 'name': 'Chicago', 'state': 'IL', 'lat': 41.88, 'lon': -87.63,
     'hubs': ['Chicago', 'MISO Illinois'], 'normal_jan': 26, 'normal_jul': 84, 'sector': 'both'},
    {'id': 'new_york', 'name': 'New York', 'state': 'NY', 'lat': 40.71, 'lon': -74.01,
     'hubs': ['Transco Zone 6', 'NYISO Zone J', 'Tetco M3'], 'normal_jan': 33, 'normal_jul': 85, 'sector': 'both'},
    {'id': 'boston', 'name': 'Boston', 'state': 'MA', 'lat': 42.36, 'lon': -71.06,
     'hubs': ['Algonquin', 'NEPOOL Mass'], 'normal_jan': 29, 'normal_jul': 82, 'sector': 'both'},
    {'id': 'pittsburgh', 'name': 'Pittsburgh', 'state': 'PA', 'lat': 40.44, 'lon': -79.99,
     'hubs': ['Dominion South', 'PJM West Hub'], 'normal_jan': 28, 'normal_jul': 83, 'sector': 'both'},
    {'id': 'dallas', 'name': 'Dallas', 'state': 'TX', 'lat': 32.78, 'lon': -96.80,
     'hubs': ['ERCOT North', 'ERCOT Hub'], 'normal_jan': 47, 'normal_jul': 96, 'sector': 'both'},
    {'id': 'los_angeles', 'name': 'Los Angeles', 'state': 'CA', 'lat': 34.05, 'lon': -118.24,
     'hubs': ['SoCal Gas', 'CAISO SP15', 'CAISO NP15'], 'normal_jan': 58, 'normal_jul': 84, 'sector': 'both'},
    {'id': 'denver', 'name': 'Denver', 'state': 'CO', 'lat': 39.74, 'lon': -104.98,
     'hubs': ['Opal', 'Kern River'], 'normal_jan': 32, 'normal_jul': 88, 'sector': 'ng'},
]

_weather_cache = {'data': None, 'timestamp': 0, 'source': 'none'}
_weather_lock = threading.Lock()
WEATHER_TTL = 6 * 3600  # 6 hours


def _get_normal_temp(city, day_of_year):
    """Sinusoidal normal temp based on Jan/Jul normals."""
    jan, jul = city['normal_jan'], city['normal_jul']
    mid = (jan + jul) / 2.0
    amp = (jul - jan) / 2.0
    # Peak around day 200 (mid-July), trough around day 15 (mid-Jan)
    return mid + amp * math.sin(2 * math.pi * (day_of_year - 105) / 365)


def _generate_synthetic_weather():
    """Generate plausible synthetic 14-day forecasts when API unavailable."""
    import random
    now = datetime.utcnow()
    doy = now.timetuple().tm_yday
    result = []
    for city in WEATHER_CITIES:
        days = []
        for d in range(14):
            normal = _get_normal_temp(city, doy + d)
            # Random anomaly: biased slightly for realism
            anomaly = random.gauss(0, 5)  # 5°F std dev
            high = normal + abs(random.gauss(5, 2)) + anomaly
            low = normal - abs(random.gauss(5, 2)) + anomaly
            avg = (high + low) / 2
            hdd = max(0, 65 - avg)
            cdd = max(0, avg - 65)
            date_str = (now + timedelta(days=d)).strftime('%Y-%m-%d')
            days.append({
                'date': date_str, 'high': round(high, 1), 'low': round(low, 1),
                'avg': round(avg, 1), 'normal': round(normal, 1),
                'anomaly': round(avg - normal, 1), 'hdd': round(hdd, 1), 'cdd': round(cdd, 1)
            })
        # Compute period aggregates
        hdd_6_10 = sum(d['hdd'] for d in days[5:10])
        cdd_6_10 = sum(d['cdd'] for d in days[5:10])
        hdd_8_14 = sum(d['hdd'] for d in days[7:14])
        cdd_8_14 = sum(d['cdd'] for d in days[7:14])
        normal_hdd_6_10 = sum(max(0, 65 - _get_normal_temp(city, doy + i)) for i in range(5, 10))
        normal_cdd_6_10 = sum(max(0, _get_normal_temp(city, doy + i) - 65) for i in range(5, 10))
        normal_hdd_8_14 = sum(max(0, 65 - _get_normal_temp(city, doy + i)) for i in range(7, 14))
        normal_cdd_8_14 = sum(max(0, _get_normal_temp(city, doy + i) - 65) for i in range(7, 14))
        result.append({
            'id': city['id'], 'name': city['name'], 'state': city['state'],
            'lat': city['lat'], 'lon': city['lon'],
            'hubs': city['hubs'], 'sector': city['sector'],
            'days': days,
            'summary': {
                'hdd_6_10': round(hdd_6_10, 1), 'cdd_6_10': round(cdd_6_10, 1),
                'hdd_8_14': round(hdd_8_14, 1), 'cdd_8_14': round(cdd_8_14, 1),
                'normal_hdd_6_10': round(normal_hdd_6_10, 1), 'normal_cdd_6_10': round(normal_cdd_6_10, 1),
                'normal_hdd_8_14': round(normal_hdd_8_14, 1), 'normal_cdd_8_14': round(normal_cdd_8_14, 1),
                'hdd_6_10_dev': round(hdd_6_10 - normal_hdd_6_10, 1),
                'cdd_6_10_dev': round(cdd_6_10 - normal_cdd_6_10, 1),
                'hdd_8_14_dev': round(hdd_8_14 - normal_hdd_8_14, 1),
                'cdd_8_14_dev': round(cdd_8_14 - normal_cdd_8_14, 1),
            }
        })
    return result


def _fetch_open_meteo_weather():
    """Fetch 14-day forecasts from Open-Meteo API, return structured data or None."""
    import urllib.request
    try:
        lats = ','.join(str(c['lat']) for c in WEATHER_CITIES)
        lons = ','.join(str(c['lon']) for c in WEATHER_CITIES)
        url = (f"https://api.open-meteo.com/v1/forecast?"
               f"latitude={lats}&longitude={lons}"
               f"&daily=temperature_2m_max,temperature_2m_min"
               f"&temperature_unit=fahrenheit&forecast_days=14&timezone=America/Chicago")
        req = urllib.request.Request(url, headers={'User-Agent': 'EnergyDesk/3.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = json.loads(resp.read().decode())
        # Open-Meteo returns a list when multiple coords are sent
        if not isinstance(raw, list):
            raw = [raw]
        now = datetime.utcnow()
        doy = now.timetuple().tm_yday
        result = []
        for i, city in enumerate(WEATHER_CITIES):
            api_data = raw[i] if i < len(raw) else None
            if not api_data or 'daily' not in api_data:
                continue
            daily = api_data['daily']
            highs = daily.get('temperature_2m_max', [])
            lows = daily.get('temperature_2m_min', [])
            dates = daily.get('time', [])
            days = []
            for d in range(min(14, len(highs))):
                high = highs[d]; low = lows[d]
                avg = (high + low) / 2
                normal = _get_normal_temp(city, doy + d)
                hdd = max(0, 65 - avg); cdd = max(0, avg - 65)
                days.append({
                    'date': dates[d] if d < len(dates) else '',
                    'high': round(high, 1), 'low': round(low, 1),
                    'avg': round(avg, 1), 'normal': round(normal, 1),
                    'anomaly': round(avg - normal, 1), 'hdd': round(hdd, 1), 'cdd': round(cdd, 1)
                })
            hdd_6_10 = sum(d['hdd'] for d in days[5:10])
            cdd_6_10 = sum(d['cdd'] for d in days[5:10])
            hdd_8_14 = sum(d['hdd'] for d in days[7:14])
            cdd_8_14 = sum(d['cdd'] for d in days[7:14])
            normal_hdd_6_10 = sum(max(0, 65 - _get_normal_temp(city, doy + j)) for j in range(5, 10))
            normal_cdd_6_10 = sum(max(0, _get_normal_temp(city, doy + j) - 65) for j in range(5, 10))
            normal_hdd_8_14 = sum(max(0, 65 - _get_normal_temp(city, doy + j)) for j in range(7, 14))
            normal_cdd_8_14 = sum(max(0, _get_normal_temp(city, doy + j) - 65) for j in range(7, 14))
            result.append({
                'id': city['id'], 'name': city['name'], 'state': city['state'],
                'lat': city['lat'], 'lon': city['lon'],
                'hubs': city['hubs'], 'sector': city['sector'],
                'days': days,
                'summary': {
                    'hdd_6_10': round(hdd_6_10, 1), 'cdd_6_10': round(cdd_6_10, 1),
                    'hdd_8_14': round(hdd_8_14, 1), 'cdd_8_14': round(cdd_8_14, 1),
                    'normal_hdd_6_10': round(normal_hdd_6_10, 1), 'normal_cdd_6_10': round(normal_cdd_6_10, 1),
                    'normal_hdd_8_14': round(normal_hdd_8_14, 1), 'normal_cdd_8_14': round(normal_cdd_8_14, 1),
                    'hdd_6_10_dev': round(hdd_6_10 - normal_hdd_6_10, 1),
                    'cdd_6_10_dev': round(cdd_6_10 - normal_cdd_6_10, 1),
                    'hdd_8_14_dev': round(hdd_8_14 - normal_hdd_8_14, 1),
                    'cdd_8_14_dev': round(cdd_8_14 - normal_cdd_8_14, 1),
                }
            })
        if len(result) == len(WEATHER_CITIES):
            return result
        return None
    except Exception as e:
        logger.warning(f"Open-Meteo fetch failed: {e}")
        return None


@misc_bp.route('/api/weather/forecast', methods=['GET'])
def get_weather_forecast():
    """Return 14-day weather forecasts for energy hub cities."""
    global _weather_cache
    now_ts = _time.time()
    with _weather_lock:
        if _weather_cache['data'] and (now_ts - _weather_cache['timestamp']) < WEATHER_TTL:
            return jsonify({'success': True, 'source': _weather_cache['source'],
                            'cities': _weather_cache['data'],
                            'cached_at': _weather_cache['timestamp']})
    # Try live data first
    live = _fetch_open_meteo_weather()
    if live:
        with _weather_lock:
            _weather_cache = {'data': live, 'timestamp': now_ts, 'source': 'open-meteo'}
        return jsonify({'success': True, 'source': 'open-meteo', 'cities': live, 'cached_at': now_ts})
    # Fallback to synthetic
    synth = _generate_synthetic_weather()
    with _weather_lock:
        _weather_cache = {'data': synth, 'timestamp': now_ts, 'source': 'synthetic'}
    return jsonify({'success': True, 'source': 'synthetic', 'cities': synth, 'cached_at': now_ts})


@misc_bp.route('/api/weather/bias', methods=['GET'])
def get_weather_bias():
    """Return per-hub weather-driven price bias for the tick engine.
    Positive = bullish (cold in winter / hot in summer), negative = bearish."""
    global _weather_cache
    data = _weather_cache.get('data')
    if not data:
        # Generate on-the-fly
        data = _generate_synthetic_weather()
    now = datetime.utcnow()
    month = now.month
    is_heating = month in (1, 2, 3, 4, 10, 11, 12)
    hub_bias = {}
    for city in data:
        s = city['summary']
        if is_heating:
            # Colder than normal = more HDD = bullish gas/power
            dev = s['hdd_6_10_dev']
            # Scale: +10 HDD deviation → ~+2% bias
            bias = dev * 0.002
        else:
            # Hotter than normal = more CDD = bullish power
            dev = s['cdd_6_10_dev']
            bias = dev * 0.002
        for hub_name in city['hubs']:
            hub_bias[hub_name] = round(bias, 4)
    return jsonify({'success': True, 'is_heating_season': is_heating, 'bias': hub_bias})


# ---------------------------------------------------------------------------
# WebSocket Events
# ---------------------------------------------------------------------------
@socketio.on('connect')
def handle_connect():
    sid = request.sid
    with connections_lock:
        active_connections.add(sid)
        count = len(active_connections)
    emit('connection_count', {'count': count}, broadcast=True)
    logger.info(f"Client connected: {sid} (total: {count})")

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    with connections_lock:
        active_connections.discard(sid)
        count = len(active_connections)
    emit('connection_count', {'count': count}, broadcast=True)
    logger.info(f"Client disconnected: {sid} (total: {count})")

@socketio.on('register_trader')
def handle_register_trader(data):
    trader_name = data.get('trader_name', '')
    if trader_name:
        conn = get_db_standalone()
        conn.execute("UPDATE traders SET last_seen=CURRENT_TIMESTAMP WHERE trader_name=?", (trader_name,))
        conn.commit()
        conn.close()
        logger.info(f"Trader registered on WS: {trader_name}")

@socketio.on('request_leaderboard')
def handle_leaderboard_request():
    emit('leaderboard_update', {'reason': 'requested'})



