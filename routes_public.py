#!/usr/bin/env python3
"""Public API routes: register, login, trades CRUD, leaderboard, photos."""

import json
import hashlib
import math
import random
import re
import string
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify

from app import get_db, active_connections, connections_lock, socketio, _calc_margin

public_bp = Blueprint('public', __name__)

# ---------------------------------------------------------------------------
# Public API Endpoints
# ---------------------------------------------------------------------------
@public_bp.route('/api/status')
def api_status():
    db = get_db()
    active = db.execute("SELECT COUNT(*) as c FROM traders WHERE status='ACTIVE'").fetchone()['c']
    with connections_lock:
        ws_count = len(active_connections)
    return jsonify({
        'success': True,
        'status': 'online',
        'active_traders': active,
        'connected_clients': ws_count,
        'server_time': datetime.utcnow().isoformat(),
        'version': '3.0'
    })

@public_bp.route('/api/traders/register', methods=['POST'])
def register_trader():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    real_name = (data.get('real_name') or data.get('display_name') or '').strip()
    display_name = (data.get('display_name') or real_name).strip()
    firm = (data.get('firm') or '').strip()
    pin = (data.get('pin') or '').strip()

    if not real_name:
        return jsonify({'success': False, 'error': 'Name is required'}), 400
    if not pin or len(pin) != 4 or not pin.isdigit():
        return jsonify({'success': False, 'error': 'A valid 4-digit PIN is required'}), 400

    # Generate trader_name from real_name
    trader_name = real_name.lower().replace(' ', '_')

    db = get_db()

    # Check if PIN exists and is available
    pin_row = db.execute("SELECT * FROM pins WHERE pin=?", (pin,)).fetchone()
    if pin_row:
        if pin_row['status'] != 'AVAILABLE':
            return jsonify({'success': False, 'error': 'PIN already claimed or disabled'}), 400
    # If no PINs exist in the system, allow registration without PIN validation
    total_pins = db.execute("SELECT COUNT(*) as c FROM pins").fetchone()['c']
    if total_pins > 0 and not pin_row:
        return jsonify({'success': False, 'error': 'Invalid PIN'}), 400

    # Check if trader already exists
    existing = db.execute("SELECT * FROM traders WHERE trader_name=?", (trader_name,)).fetchone()
    if existing:
        return jsonify({'success': False, 'error': 'Trader name already taken'}), 400

    try:
        db.execute(
            "INSERT INTO traders (trader_name, real_name, display_name, firm, pin, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
            (trader_name, real_name, display_name, firm, pin)
        )
        if pin_row:
            db.execute("UPDATE pins SET status='CLAIMED', claimed_by=? WHERE pin=?", (trader_name, pin))
        db.commit()

        socketio.emit('trader_registered', {
            'trader_name': trader_name,
            'display_name': display_name,
            'real_name': real_name,
            'firm': firm
        })

        return jsonify({
            'success': True,
            'trader_name': trader_name,
            'display_name': display_name,
            'real_name': real_name,
            'status': 'ACTIVE'
        })
    except sqlite3.IntegrityError as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@public_bp.route('/api/traders/login', methods=['POST'])
def login_trader():
    """Login with real name and PIN. Admin must have created the account first."""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    name = (data.get('name') or '').strip()
    pin = (data.get('pin') or '').strip()

    if not name:
        return jsonify({'success': False, 'error': 'Name is required'}), 400
    if not pin or len(pin) != 4 or not pin.isdigit():
        return jsonify({'success': False, 'error': 'A valid 4-digit PIN is required'}), 400

    db = get_db()

    # Match by real_name (case-insensitive) and PIN
    trader = db.execute(
        "SELECT * FROM traders WHERE LOWER(real_name)=LOWER(?) AND pin=?",
        (name, pin)
    ).fetchone()

    if not trader:
        return jsonify({'success': False, 'error': 'Invalid name or PIN. Contact your admin for access.'}), 401

    if trader['status'] == 'DISABLED':
        return jsonify({'success': False, 'error': 'Your account has been disabled. Contact your admin.'}), 403

    # Update last_seen
    db.execute("UPDATE traders SET last_seen=CURRENT_TIMESTAMP WHERE id=?", (trader['id'],))
    if trader['status'] == 'PENDING':
        db.execute("UPDATE traders SET status='ACTIVE' WHERE id=?", (trader['id'],))
    db.commit()

    # Get team info
    team_info = None
    if trader['team_id']:
        team = db.execute("SELECT name, color FROM teams WHERE id=?", (trader['team_id'],)).fetchone()
        if team:
            team_info = {'name': team['name'], 'color': team['color']}

    return jsonify({
        'success': True,
        'trader_name': trader['trader_name'],
        'real_name': (trader['real_name'] if 'real_name' in trader.keys() else trader['display_name']),
        'display_name': trader['display_name'],
        'firm': trader['firm'],
        'status': 'ACTIVE',
        'starting_balance': trader['starting_balance'],
        'photo_url': trader['photo_url'],
        'team': team_info
    })

@public_bp.route('/api/traders/heartbeat/<trader>', methods=['POST'])
def trader_heartbeat(trader):
    db = get_db()
    db.execute("UPDATE traders SET last_seen=CURRENT_TIMESTAMP WHERE trader_name=?", (trader,))
    db.commit()
    return jsonify({'success': True})


@public_bp.route('/api/traders/display-name/<trader>', methods=['POST'])
def update_display_name(trader):
    """Let a trader update their own display name."""
    data = request.get_json()
    new_name = (data.get('display_name') or '').strip()
    if not new_name:
        return jsonify({'success': False, 'error': 'Display name cannot be empty'}), 400
    if len(new_name) > 30:
        return jsonify({'success': False, 'error': 'Display name must be 30 characters or less'}), 400

    db = get_db()
    db.execute("UPDATE traders SET display_name=? WHERE trader_name=?", (new_name, trader))
    db.commit()
    return jsonify({'success': True, 'display_name': new_name})

@public_bp.route('/api/trades/<trader>', methods=['GET'])
def get_trades(trader):
    db = get_db()
    rows = db.execute(
        "SELECT id, trade_data, created_at FROM trades WHERE trader_name=? ORDER BY created_at DESC",
        (trader,)
    ).fetchall()
    trades = []
    for row in rows:
        td = json.loads(row['trade_data'])
        td['id'] = row['id']
        td['server_created_at'] = row['created_at']
        trades.append(td)
    return jsonify({'success': True, 'trades': trades})

@public_bp.route('/api/trades/<trader>', methods=['POST'])
def submit_trade(trader):
    """Submit a trade with server-side validation."""
    db = get_db()

    # 1. Validate trader status
    trader_row = db.execute("SELECT * FROM traders WHERE trader_name=?", (trader,)).fetchone()
    if not trader_row:
        return jsonify({'success': False, 'error': 'Trader not found'}), 404
    if trader_row['status'] != 'ACTIVE':
        return jsonify({'success': False, 'error': f'Trader status is {trader_row["status"]}. Must be ACTIVE to trade.'}), 403

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No trade data provided'}), 400

    # 2. Validate required fields
    required = ['type', 'direction', 'hub', 'volume', 'entryPrice']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'success': False, 'error': f'Missing required fields: {", ".join(missing)}'}), 400

    # 3. Volume limits
    volume = float(data.get('volume', 0))
    trade_type = data.get('type', '')
    is_crude = trade_type.startswith('CRUDE') or trade_type in ('EFP', 'OPTION_CL')
    max_volume = 50000 if is_crude else 500000
    unit = 'BBL' if is_crude else 'MMBtu'
    if volume <= 0:
        return jsonify({'success': False, 'error': 'Volume must be positive'}), 400
    if volume > max_volume:
        return jsonify({'success': False, 'error': f'Volume exceeds maximum of {max_volume:,.0f} {unit}'}), 400

    # Validate trade type against commodity sector
    SECTOR_TRADE_TYPES = {
        'ng': {'PHYS_FIXED', 'PHYS_INDEX', 'BASIS_SWAP', 'FIXED_FLOAT', 'SPREAD', 'BALMO', 'OPTION_NG', 'TAS', 'MULTILEG'},
        'crude': {'CRUDE_PHYS', 'CRUDE_SWAP', 'CRUDE_DIFF', 'OPTION_CL', 'EFP', 'TAS'},
        'power': {'PHYS_FIXED', 'PHYS_INDEX', 'FIXED_FLOAT', 'SPREAD', 'BALMO', 'TAS'},
        'freight': {'FREIGHT_FFA', 'FREIGHT_PHYS'},
        'ag': {'AG_FUTURES', 'AG_OPTIONS', 'AG_SPREAD'},
        'metals': {'METALS_FUTURES', 'METALS_OPTIONS', 'METALS_SPREAD'},
    }
    hub_name = data.get('hub', '')
    trade_sector = data.get('sector', '')
    # Infer sector from trade type if not provided
    if not trade_sector:
        if is_crude:
            trade_sector = 'crude'
        elif trade_type.startswith('FREIGHT'):
            trade_sector = 'freight'
        elif trade_type.startswith('AG'):
            trade_sector = 'ag'
        elif trade_type.startswith('METALS'):
            trade_sector = 'metals'
        elif trade_type in ('OPTION_NG', 'BASIS_SWAP'):
            trade_sector = 'ng'
    if trade_sector and trade_sector in SECTOR_TRADE_TYPES:
        allowed = SECTOR_TRADE_TYPES[trade_sector]
        if trade_type not in allowed:
            return jsonify({'success': False, 'error': f'Trade type {trade_type} is not valid for {trade_sector} sector'}), 400

    # 4. Price validation
    entry_price = float(data.get('entryPrice', 0))
    is_basis = trade_type == 'BASIS_SWAP'
    if not is_basis and entry_price <= 0:
        return jsonify({'success': False, 'error': 'Entry price must be positive'}), 400

    # Validate price vs direction: BUY >= spot, SELL <= spot (skip for basis trades)
    spot_ref = float(data.get('spotRef', entry_price))
    direction = data.get('direction', '')
    if not is_basis:
        if direction == 'BUY' and entry_price < spot_ref * 0.999:
            return jsonify({'success': False, 'error': 'BUY price must be at or above spot'}), 400
        if direction == 'SELL' and entry_price > spot_ref * 1.001:
            return jsonify({'success': False, 'error': 'SELL price must be at or below spot'}), 400

    starting_balance = trader_row['starting_balance']
    existing_trades = db.execute(
        "SELECT trade_data FROM trades WHERE trader_name=?", (trader,)
    ).fetchall()

    used_margin = 0
    realized_pnl = 0
    for row in existing_trades:
        td = json.loads(row['trade_data'])
        if td.get('status') == 'CLOSED':
            realized_pnl += float(td.get('realizedPnl', 0))
        elif td.get('status') == 'OPEN':
            used_margin += _calc_margin(td)

    new_margin = _calc_margin(data)
    equity = starting_balance + realized_pnl
    buying_power = equity - used_margin
    if new_margin > buying_power:
        return jsonify({
            'success': False,
            'error': f'Insufficient buying power. Required: ${new_margin:,.0f}, Available: ${buying_power:,.0f}'
        }), 400

    # 5. Duplicate prevention (same trade within 5 seconds)
    recent = db.execute(
        "SELECT trade_data FROM trades WHERE trader_name=? AND created_at > datetime('now', '-5 seconds')",
        (trader,)
    ).fetchall()
    for row in recent:
        td = json.loads(row['trade_data'])
        if (td.get('type') == data.get('type') and
            td.get('direction') == data.get('direction') and
            td.get('hub') == data.get('hub') and
            abs(float(td.get('volume', 0)) - volume) / max(volume, 1) < 0.05 and
            abs(float(td.get('entryPrice', 0)) - entry_price) / max(abs(entry_price), 0.01) < 0.02):
            return jsonify({'success': False, 'error': 'Duplicate trade detected (within 5 seconds)'}), 400

    # Store trade
    data['status'] = 'OPEN'
    data['timestamp'] = datetime.utcnow().isoformat()
    trade_json = json.dumps(data)

    cur = db.execute(
        "INSERT INTO trades (trader_name, trade_data) VALUES (?, ?)",
        (trader, trade_json)
    )
    db.commit()
    trade_id = cur.lastrowid

    db.execute("UPDATE traders SET last_seen=CURRENT_TIMESTAMP WHERE trader_name=?", (trader,))
    db.commit()

    socketio.emit('trade_submitted', {
        'trader_name': trader,
        'trade_id': trade_id,
        'type': data.get('type'),
        'direction': data.get('direction'),
        'hub': data.get('hub'),
        'volume': volume
    })
    socketio.emit('leaderboard_update', {'reason': 'trade_submitted'})

    # Log to trade feed
    try:
        me_row = db.execute("SELECT t.display_name, tm.name as team_name FROM traders t LEFT JOIN teams tm ON t.team_id=tm.id WHERE t.trader_name=?", (trader,)).fetchone()
        feed_sum = f"{me_row['display_name']} {data.get('direction')} {volume:,.0f} {data.get('hub','')} @ ${entry_price:.4f}"
        db.execute("INSERT INTO trade_feed (trader_name, action, summary, team_name) VALUES (?,?,?,?)",
                   (trader, 'TRADE', feed_sum, me_row['team_name'] or ''))
        db.commit()
        socketio.emit('trade_feed_update', {'summary': feed_sum})
    except Exception:
        pass

    return jsonify({'success': True, 'trade_id': trade_id})

@public_bp.route('/api/trades/<trader>/<int:trade_id>', methods=['PUT'])
def update_trade(trader, trade_id):
    """Close a trade (or update trade data)."""
    db = get_db()
    row = db.execute("SELECT * FROM trades WHERE id=? AND trader_name=?", (trade_id, trader)).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Trade not found'}), 404

    data = request.get_json()
    td = json.loads(row['trade_data'])

    # Validate close price if closing a non-OTC trade
    if data.get('status') == 'CLOSED' and td.get('venue') != 'OTC':
        close_price = float(data.get('closePrice', 0))
        spot_ref = float(data.get('spotRef', 0)) or float(td.get('spotRef', 0))
        if spot_ref > 0:
            # Allow close price within 5% of spot reference (generous for sim, prevents abuse)
            deviation = abs(close_price - spot_ref) / spot_ref
            if deviation > 0.05:
                return jsonify({'success': False, 'error': f'Close price ${close_price:.4f} deviates too far from market ${spot_ref:.4f}'}), 400

    td.update(data)
    db.execute("UPDATE trades SET trade_data=? WHERE id=?", (json.dumps(td), trade_id))
    db.commit()

    if data.get('status') == 'CLOSED':
        socketio.emit('trade_closed', {'trader_name': trader, 'trade_id': trade_id})
        socketio.emit('leaderboard_update', {'reason': 'trade_closed'})

    return jsonify({'success': True, 'trade_id': trade_id})

@public_bp.route('/api/trades/<trader>/<int:trade_id>', methods=['DELETE'])
def delete_trade(trader, trade_id):
    """Delete a trade (only within 1-hour window)."""
    db = get_db()
    row = db.execute("SELECT * FROM trades WHERE id=? AND trader_name=?", (trade_id, trader)).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Trade not found'}), 404

    created = datetime.fromisoformat(row['created_at'])
    if datetime.utcnow() - created > timedelta(hours=1):
        return jsonify({'success': False, 'error': 'Trade can only be deleted within 1 hour of placement'}), 400

    db.execute("DELETE FROM trades WHERE id=?", (trade_id,))
    db.commit()
    return jsonify({'success': True})

@public_bp.route('/api/traders/photo/<trader>', methods=['POST'])
def upload_photo(trader):
    """Upload headshot photo (base64)."""
    data = request.get_json()
    photo = data.get('photo', '')
    if not photo:
        return jsonify({'success': False, 'error': 'No photo data'}), 400
    db = get_db()
    db.execute("UPDATE traders SET photo_url=? WHERE trader_name=?", (photo, trader))
    db.commit()
    return jsonify({'success': True})

@public_bp.route('/api/traders/photo/<trader>', methods=['GET'])
def get_photo(trader):
    db = get_db()
    row = db.execute("SELECT photo_url FROM traders WHERE trader_name=?", (trader,)).fetchone()
    if row:
        return jsonify({'success': True, 'photo': row['photo_url']})
    return jsonify({'success': False, 'error': 'Trader not found'}), 404

# ---------------------------------------------------------------------------
# Leaderboard API
# ---------------------------------------------------------------------------
@public_bp.route('/api/leaderboard')
def get_leaderboard():
    """Server-calculated leaderboard."""
    db = get_db()
    traders = db.execute("SELECT * FROM traders WHERE status='ACTIVE'").fetchall()
    results = []
    # Accept current prices from client (optional query param)
    prices_json = request.args.get('prices', '{}')
    try:
        client_prices = json.loads(prices_json) if prices_json else {}
    except (json.JSONDecodeError, TypeError):
        client_prices = {}

    for t in traders:
        trades = db.execute("SELECT trade_data FROM trades WHERE trader_name=?", (t['trader_name'],)).fetchall()
        realized = 0
        unrealized = 0
        wins = 0
        losses = 0
        gross_wins = 0
        gross_losses = 0
        trade_count = len(trades)
        for row in trades:
            td = json.loads(row['trade_data'])
            if td.get('status') == 'CLOSED':
                pnl = float(td.get('realizedPnl', 0))
                realized += pnl
                if pnl > 0:
                    wins += 1
                    gross_wins += pnl
                elif pnl < 0:
                    losses += 1
                    gross_losses += abs(pnl)
            elif td.get('status') == 'OPEN':
                # Calculate unrealized P&L using client-provided prices or spotRef as fallback
                hub = td.get('hub', '')
                ep = float(td.get('entryPrice', 0))
                vol = float(td.get('volume', 0))
                direction = td.get('direction', '')
                is_basis_trade = td.get('type') == 'BASIS_SWAP'

                current_price = float(client_prices.get(hub, 0))
                if not current_price:
                    current_price = float(td.get('spotRef', ep))

                if is_basis_trade:
                    # For basis trades, use differential change
                    basis_ref = float(td.get('spotRef', ep))
                    diff_change = current_price - ep
                    trade_pnl = diff_change * vol if direction == 'BUY' else -diff_change * vol
                else:
                    d = 1 if direction == 'BUY' else -1
                    trade_pnl = (current_price - ep) * vol * d
                unrealized += trade_pnl

        equity = t['starting_balance'] + realized + unrealized
        ret = ((equity - t['starting_balance']) / t['starting_balance']) * 100 if t['starting_balance'] else 0
        win_rate = (wins / (wins + losses) * 100) if (wins + losses) > 0 else 0
        pf = (gross_wins / gross_losses) if gross_losses > 0 else (999 if gross_wins > 0 else 0)

        team_info = None
        if t['team_id']:
            team = db.execute("SELECT name, color FROM teams WHERE id=?", (t['team_id'],)).fetchone()
            if team:
                team_info = {'name': team['name'], 'color': team['color']}

        results.append({
            'trader_name': t['trader_name'],
            'real_name': (t['real_name'] if 'real_name' in t.keys() else t['display_name']),
            'display_name': t['display_name'],
            'firm': t['firm'],
            'photo_url': t['photo_url'],
            'team': team_info,
            'equity': equity,
            'starting_balance': t['starting_balance'],
            'realized_pnl': realized,
            'unrealized_pnl': unrealized,
            'return_pct': round(ret, 2),
            'win_rate': round(win_rate, 1),
            'profit_factor': round(pf, 2),
            'trade_count': trade_count,
            'wins': wins,
            'losses': losses,
            'last_seen': t['last_seen']
        })

    results.sort(key=lambda x: x['return_pct'], reverse=True)
    for i, r in enumerate(results):
        r['rank'] = i + 1

    # Save performance snapshots (at most once per hour per trader)
    try:
        now = datetime.utcnow()
        today_str = now.strftime('%Y-%m-%d %H:%M')
        for r in results:
            last = db.execute(
                "SELECT created_at FROM performance_snapshots WHERE trader_name=? ORDER BY id DESC LIMIT 1",
                (r['trader_name'],)
            ).fetchone()
            # Save if no snapshot exists or last one is >1 hour old
            should_save = True
            if last and last['created_at']:
                try:
                    from datetime import datetime as _dt
                    last_dt = _dt.strptime(last['created_at'][:19], '%Y-%m-%d %H:%M:%S')
                    if (now - last_dt).total_seconds() < 3600:
                        should_save = False
                except: pass
            if should_save:
                db.execute("""INSERT INTO performance_snapshots 
                    (trader_name, snapshot_date, equity, realized_pnl, unrealized_pnl, trade_count)
                    VALUES (?, ?, ?, ?, ?, ?)""",
                    (r['trader_name'], now.strftime('%Y-%m-%d'), r['equity'],
                     r['realized_pnl'], r['unrealized_pnl'], r['trade_count']))
        db.commit()
    except Exception as e:
        logger.warning(f"Snapshot save failed: {e}")

    return jsonify({'success': True, 'leaderboard': results})

@public_bp.route('/api/leaderboard/all-snapshots')
def get_all_snapshots():
    """Return recent snapshots for all traders (for equity curves)."""
    db = get_db()
    days = int(request.args.get('days', 90))
    rows = db.execute("""
        SELECT trader_name, snapshot_date, equity, created_at
        FROM performance_snapshots 
        WHERE created_at >= datetime('now', ?)
        ORDER BY created_at ASC
    """, (f'-{days} days',)).fetchall()
    result = {}
    for r in rows:
        tn = r['trader_name']
        if tn not in result:
            result[tn] = []
        result[tn].append({
            'date': r['created_at'],
            'equity': r['equity']
        })
    return jsonify({'success': True, 'snapshots': result})

@public_bp.route('/api/leaderboard/snapshots/<trader>')
def get_snapshots(trader):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM performance_snapshots WHERE trader_name=? ORDER BY snapshot_date ASC",
        (trader,)
    ).fetchall()
    snapshots = [dict(row) for row in rows]
    return jsonify({'success': True, 'snapshots': snapshots})

