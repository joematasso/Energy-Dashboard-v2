#!/usr/bin/env python3
"""Admin API routes: trader management, teams, PINs, system, censored words, broadcasts."""

import json
import csv
import io
import random
import sqlite3
import string
from datetime import datetime

from flask import Blueprint, request, jsonify, Response

from app import get_db, admin_required, socketio, EIA_API_KEY, NEWS_CACHE_TTL, logger, DATABASE

admin_bp = Blueprint('admin', __name__)

# ---------------------------------------------------------------------------
# Admin API Endpoints
# ---------------------------------------------------------------------------
@admin_bp.route('/api/admin/traders', methods=['GET'])
@admin_required
def admin_list_traders():
    db = get_db()
    traders = db.execute("""
        SELECT t.*, tm.name as team_name, tm.color as team_color,
               (SELECT COUNT(*) FROM trades WHERE trader_name=t.trader_name) as trade_count
        FROM traders t
        LEFT JOIN teams tm ON t.team_id = tm.id
        WHERE t.status != 'DELETED'
        ORDER BY t.created_at DESC
    """).fetchall()

    results = []
    for t in traders:
        trades = db.execute("SELECT trade_data FROM trades WHERE trader_name=?", (t['trader_name'],)).fetchall()
        realized = sum(float(json.loads(r['trade_data']).get('realizedPnl', 0))
                       for r in trades if json.loads(r['trade_data']).get('status') == 'CLOSED')

        results.append({
            'id': t['id'],
            'trader_name': t['trader_name'],
            'real_name': t['real_name'] if 'real_name' in t.keys() else t['display_name'],
            'display_name': t['display_name'],
            'firm': t['firm'],
            'pin': t['pin'],
            'status': t['status'],
            'team_id': t['team_id'],
            'team_name': t['team_name'],
            'team_color': t['team_color'],
            'starting_balance': t['starting_balance'],
            'trade_count': t['trade_count'],
            'realized_pnl': realized,
            'photo_url': t['photo_url'],
            'created_at': t['created_at'],
            'last_seen': t['last_seen'],
            'privileged': bool(t['privileged']) if 'privileged' in t.keys() else False
        })

    return jsonify({'success': True, 'traders': results})

@admin_bp.route('/api/admin/traders/approve/<int:tid>', methods=['POST'])
@admin_required
def admin_approve_trader(tid):
    db = get_db()
    db.execute("UPDATE traders SET status='ACTIVE' WHERE id=?", (tid,))
    db.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/admin/traders/disable/<int:tid>', methods=['POST'])
@admin_required
def admin_disable_trader(tid):
    db = get_db()
    db.execute("UPDATE traders SET status='DISABLED' WHERE id=?", (tid,))
    db.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/admin/traders/enable/<int:tid>', methods=['POST'])
@admin_required
def admin_enable_trader(tid):
    db = get_db()
    db.execute("UPDATE traders SET status='ACTIVE' WHERE id=?", (tid,))
    db.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/admin/traders/privilege/<int:tid>', methods=['POST'])
@admin_required
def admin_toggle_privilege(tid):
    """Toggle privileged status (after-hours trading + backdate)."""
    db = get_db()
    trader = db.execute("SELECT privileged FROM traders WHERE id=?", (tid,)).fetchone()
    if not trader:
        return jsonify({'success': False, 'error': 'Trader not found'}), 404
    new_val = 0 if trader['privileged'] else 1
    db.execute("UPDATE traders SET privileged=? WHERE id=?", (new_val, tid))
    db.commit()
    return jsonify({'success': True, 'privileged': bool(new_val)})

@admin_bp.route('/api/admin/traders/reset/<int:tid>', methods=['POST'])
@admin_required
def admin_reset_individual(tid):
    """Reset a single trader's trades."""
    db = get_db()
    trader = db.execute("SELECT trader_name FROM traders WHERE id=?", (tid,)).fetchone()
    if not trader:
        return jsonify({'success': False, 'error': 'Trader not found'}), 404
    db.execute("DELETE FROM trades WHERE trader_name=?", (trader['trader_name'],))
    db.execute("DELETE FROM performance_snapshots WHERE trader_name=?", (trader['trader_name'],))
    db.commit()
    socketio.emit('trader_reset', {'trader_name': trader['trader_name']})
    socketio.emit('leaderboard_update', {'reason': 'trader_reset'})
    return jsonify({'success': True})

@admin_bp.route('/api/admin/traders/<int:tid>', methods=['DELETE'])
@admin_required
def admin_delete_trader(tid):
    db = get_db()
    trader = db.execute("SELECT trader_name FROM traders WHERE id=?", (tid,)).fetchone()
    if trader:
        db.execute("DELETE FROM trades WHERE trader_name=?", (trader['trader_name'],))
        db.execute("DELETE FROM performance_snapshots WHERE trader_name=?", (trader['trader_name'],))
    # Soft-delete: mark as DELETED so active sessions get silently revoked
    db.execute("UPDATE traders SET status='DELETED' WHERE id=?", (tid,))
    db.commit()
    # Immediately kick via WebSocket if online
    if trader:
        try:
            from routes_misc import trader_sids, trader_sids_lock
            from app import socketio
            with trader_sids_lock:
                sid = trader_sids.get(trader['trader_name'])
            if sid:
                socketio.emit('session_revoked', {}, room=sid)
        except Exception:
            pass
    return jsonify({'success': True})

@admin_bp.route('/api/admin/traders/balance/<int:tid>', methods=['POST'])
@admin_required
def admin_set_balance(tid):
    data = request.get_json()
    balance = float(data.get('starting_balance', 1000000))
    db = get_db()
    db.execute("UPDATE traders SET starting_balance=? WHERE id=?", (balance, tid))
    db.commit()
    return jsonify({'success': True})


@admin_bp.route('/api/admin/traders/pin/<int:tid>', methods=['POST'])
@admin_required
def admin_change_trader_pin(tid):
    data = request.get_json()
    new_pin = data.get('pin', '').strip()
    if not new_pin or len(new_pin) != 4 or not new_pin.isdigit():
        return jsonify({'success': False, 'error': 'PIN must be exactly 4 digits'}), 400
    db = get_db()
    trader = db.execute("SELECT * FROM traders WHERE id=?", (tid,)).fetchone()
    if not trader:
        return jsonify({'success': False, 'error': 'Trader not found'}), 404
    db.execute("UPDATE traders SET pin=? WHERE id=?", (new_pin, tid))
    db.commit()
    return jsonify({'success': True, 'display_name': trader['display_name']})

# ---------------------------------------------------------------------------
# Admin Teams
# ---------------------------------------------------------------------------
@admin_bp.route('/api/admin/teams', methods=['GET'])
@admin_required
def admin_list_teams():
    db = get_db()
    teams = db.execute("SELECT * FROM teams ORDER BY name").fetchall()
    results = []
    for t in teams:
        members = db.execute(
            "SELECT id, trader_name, display_name, firm, status FROM traders WHERE team_id=?",
            (t['id'],)
        ).fetchall()
        results.append({
            'id': t['id'],
            'name': t['name'],
            'description': t['description'],
            'color': t['color'],
            'members': [dict(m) for m in members],
            'member_count': len(members)
        })
    return jsonify({'success': True, 'teams': results})

@admin_bp.route('/api/admin/teams', methods=['POST'])
@admin_required
def admin_create_team():
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Team name is required'}), 400
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO teams (name, description, color) VALUES (?, ?, ?)",
            (name, data.get('description', ''), data.get('color', '#22d3ee'))
        )
        db.commit()
        return jsonify({'success': True, 'team_id': cur.lastrowid})
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'error': 'Team name already exists'}), 400

@admin_bp.route('/api/admin/teams/<int:tid>', methods=['PUT'])
@admin_required
def admin_update_team(tid):
    data = request.get_json()
    db = get_db()
    db.execute(
        "UPDATE teams SET name=?, description=?, color=? WHERE id=?",
        (data.get('name', ''), data.get('description', ''), data.get('color', '#22d3ee'), tid)
    )
    db.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/admin/teams/<int:tid>', methods=['DELETE'])
@admin_required
def admin_delete_team(tid):
    db = get_db()
    db.execute("UPDATE traders SET team_id=NULL WHERE team_id=?", (tid,))
    db.execute("DELETE FROM teams WHERE id=?", (tid,))
    db.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/admin/teams/<int:tid>/assign', methods=['POST'])
@admin_required
def admin_assign_to_team(tid):
    data = request.get_json()
    trader_id = data.get('trader_id')
    db = get_db()
    db.execute("UPDATE traders SET team_id=? WHERE id=?", (tid, trader_id))
    db.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/admin/teams/<int:tid>/remove', methods=['POST'])
@admin_required
def admin_remove_from_team(tid):
    data = request.get_json()
    trader_id = data.get('trader_id')
    db = get_db()
    db.execute("UPDATE traders SET team_id=NULL WHERE id=? AND team_id=?", (trader_id, tid))
    db.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/admin/teams/transfer', methods=['POST'])
@admin_required
def admin_transfer_trader():
    """Transfer trader between teams."""
    data = request.get_json()
    trader_id = data.get('trader_id')
    to_team_id = data.get('to_team_id')
    db = get_db()
    db.execute("UPDATE traders SET team_id=? WHERE id=?", (to_team_id, trader_id))
    db.commit()
    return jsonify({'success': True})

# ---------------------------------------------------------------------------
# Admin PINs
# ---------------------------------------------------------------------------
@admin_bp.route('/api/admin/pins', methods=['GET'])
@admin_required
def admin_list_pins():
    db = get_db()
    pins = db.execute("SELECT * FROM pins ORDER BY created_at DESC").fetchall()
    results = [dict(p) for p in pins]
    return jsonify({'success': True, 'pins': results})

@admin_bp.route('/api/admin/pins/generate', methods=['POST'])
@admin_required
def admin_generate_pins():
    data = request.get_json()
    quantity = min(int(data.get('quantity', 10)), 50)
    db = get_db()
    generated = []
    for _ in range(quantity):
        while True:
            pin = ''.join(random.choices(string.digits, k=4))
            existing = db.execute("SELECT pin FROM pins WHERE pin=?", (pin,)).fetchone()
            if not existing:
                break
        db.execute("INSERT INTO pins (pin) VALUES (?)", (pin,))
        generated.append(pin)
    db.commit()
    return jsonify({'success': True, 'pins': generated, 'count': len(generated)})

@admin_bp.route('/api/admin/pins/revoke', methods=['POST'])
@admin_required
def admin_revoke_pin():
    data = request.get_json()
    pin = data.get('pin')
    db = get_db()
    db.execute("UPDATE pins SET status='DISABLED' WHERE pin=?", (pin,))
    db.commit()
    return jsonify({'success': True})

# ---------------------------------------------------------------------------
# Admin System
# ---------------------------------------------------------------------------
@admin_bp.route('/api/admin/reset-all', methods=['POST'])
@admin_required
def admin_reset_all():
    db = get_db()
    db.execute("DELETE FROM trades")
    db.execute("DELETE FROM performance_snapshots")
    db.commit()
    socketio.emit('trader_reset', {'trader_name': '__all__'})
    socketio.emit('leaderboard_update', {'reason': 'reset_all'})
    return jsonify({'success': True})

@admin_bp.route('/api/admin/export', methods=['GET'])
@admin_required
def admin_export():
    db = get_db()
    rows = db.execute(
        "SELECT t.trader_name, t.trade_data, t.created_at FROM trades t ORDER BY t.created_at DESC"
    ).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Trader', 'Type', 'Direction', 'Hub', 'Volume', 'Entry Price', 'Status',
                     'Realized P&L', 'Close Price', 'Notes', 'Created At'])
    for row in rows:
        td = json.loads(row['trade_data'])
        writer.writerow([
            row['trader_name'],
            td.get('type', ''),
            td.get('direction', ''),
            td.get('hub', ''),
            td.get('volume', ''),
            td.get('entryPrice', ''),
            td.get('status', ''),
            td.get('realizedPnl', ''),
            td.get('closePrice', ''),
            td.get('notes', ''),
            row['created_at']
        ])

    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=energy_desk_trades.csv'}
    )

@admin_bp.route('/api/admin/change-pin', methods=['POST'])
@admin_required
def admin_change_pin():
    """Change admin PIN."""
    data = request.get_json()
    new_pin = (data.get('new_pin') or '').strip()
    confirm_pin = (data.get('confirm_pin') or '').strip()
    if not new_pin:
        return jsonify({'success': False, 'error': 'New PIN is required'}), 400
    if new_pin != confirm_pin:
        return jsonify({'success': False, 'error': 'PINs do not match'}), 400
    if len(new_pin) < 4:
        return jsonify({'success': False, 'error': 'PIN must be at least 4 characters'}), 400

    db = get_db()
    db.execute("UPDATE admin_config SET value=? WHERE key='admin_pin'", (new_pin,))
    db.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/admin/config', methods=['GET'])
@admin_required
def admin_get_config():
    reveal = request.args.get('reveal', '').lower() == 'true'
    db = get_db()
    rows = db.execute("SELECT * FROM admin_config").fetchall()
    config = {}
    for r in rows:
        if r['key'] == 'admin_pin':
            config['admin_pin'] = r['value'] if reveal else '****'
        else:
            config[r['key']] = r['value']
    import app as _app
    eia_key = _app.EIA_API_KEY
    config['eia_api_key'] = eia_key if (reveal and eia_key) else ('****' if eia_key else 'NOT SET')
    config['database'] = DATABASE
    config['news_cache_ttl'] = NEWS_CACHE_TTL
    return jsonify({'success': True, 'config': config})


@admin_bp.route('/api/admin/config/eia-key', methods=['PUT'])
@admin_required
def admin_update_eia_key():
    import app as _app
    data = request.get_json()
    new_key = (data.get('eia_api_key') or '').strip()
    if not new_key:
        return jsonify({'success': False, 'error': 'API key cannot be empty'}), 400
    # Update the runtime variable on the source module (persists until restart)
    _app.EIA_API_KEY = new_key
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Censored Words (Admin)
# ---------------------------------------------------------------------------
@admin_bp.route('/api/admin/censored-words', methods=['GET'])
@admin_required
def get_censored_words():
    db = get_db()
    row = db.execute("SELECT value FROM admin_config WHERE key='censored_words'").fetchone()
    words = json.loads(row['value']) if row else []
    return jsonify({'success': True, 'words': words})

@admin_bp.route('/api/admin/censored-words', methods=['POST'])
@admin_required
def set_censored_words():
    db = get_db()
    data = request.get_json()
    words = data.get('words', [])
    # Normalize: lowercase, strip whitespace
    words = [w.strip().lower() for w in words if w.strip()]
    db.execute("INSERT OR REPLACE INTO admin_config (key, value) VALUES ('censored_words', ?)",
               (json.dumps(words),))
    db.commit()
    return jsonify({'success': True, 'words': words, 'count': len(words)})


def censor_text(text):
    """Replace censored words/phrases with asterisks."""
    db = get_db()
    row = db.execute("SELECT value FROM admin_config WHERE key='censored_words'").fetchone()
    if not row:
        return text
    words = json.loads(row['value'])
    if not words:
        return text
    result = text
    for word in words:
        if not word:
            continue
        # Case-insensitive replacement
        import re as _re
        pattern = _re.compile(_re.escape(word), _re.IGNORECASE)
        replacement = '*' * len(word)
        result = pattern.sub(replacement, result)
    return result


# ---------------------------------------------------------------------------
# Admin Broadcasts
# ---------------------------------------------------------------------------
@admin_bp.route('/api/admin/broadcasts', methods=['GET'])
@admin_required
def get_broadcasts():
    db = get_db()
    rows = db.execute("SELECT * FROM admin_broadcasts ORDER BY id DESC LIMIT 50").fetchall()
    return jsonify({'success': True, 'broadcasts': [dict(r) for r in rows]})

@admin_bp.route('/api/admin/broadcast', methods=['POST'])
@admin_required
def send_broadcast():
    db = get_db()
    data = request.get_json()
    subject = data.get('subject', '').strip()
    body = data.get('body', '').strip()
    priority = data.get('priority', 'normal')
    if not body:
        return jsonify({'success': False, 'error': 'Message body required'}), 400
    if priority not in ('normal', 'urgent'):
        priority = 'normal'
    cur = db.execute("INSERT INTO admin_broadcasts (subject, body, priority) VALUES (?, ?, ?)",
                     (subject, body, priority))
    db.commit()
    broadcast_id = cur.lastrowid
    # Also deliver broadcast as a chat message to all traders
    try:
        traders = db.execute("SELECT trader_name FROM traders WHERE status='ACTIVE'").fetchall()
        # Find or create a "System Broadcasts" conversation
        sys_convo = db.execute("SELECT id FROM conversations WHERE name='System Broadcasts' AND type='system'").fetchone()
        if not sys_convo:
            cur2 = db.execute("INSERT INTO conversations (name, type) VALUES ('System Broadcasts', 'system')")
            sys_convo_id = cur2.lastrowid
        else:
            sys_convo_id = sys_convo['id']
        # Ensure all active traders are members
        for t in traders:
            existing = db.execute("SELECT conversation_id FROM conversation_members WHERE conversation_id=? AND trader_name=?",
                                  (sys_convo_id, t['trader_name'])).fetchone()
            if not existing:
                db.execute("INSERT INTO conversation_members (conversation_id, trader_name, last_read) VALUES (?, ?, '2000-01-01 00:00:00')",
                           (sys_convo_id, t['trader_name']))
        # Insert the broadcast as a message from "SYSTEM"
        prefix = '🔴 URGENT: ' if priority == 'urgent' else '📡 '
        msg_text = prefix + (subject or 'Broadcast') + ('\n' + body if body else '')
        db.execute("INSERT INTO messages (conversation_id, sender, text) VALUES (?, 'SYSTEM', ?)",
                   (sys_convo_id, msg_text))
        db.commit()
    except Exception as e:
        logger.warning(f"Broadcast chat delivery failed: {e}")
    # Emit to all connected traders via socket
    socketio.emit('admin_broadcast', {
        'id': broadcast_id,
        'subject': subject,
        'body': body,
        'priority': priority,
        'created_at': datetime.utcnow().isoformat()
    })
    return jsonify({'success': True, 'id': broadcast_id})

@admin_bp.route('/api/admin/broadcasts/<int:bid>', methods=['DELETE'])
@admin_required
def delete_broadcast(bid):
    db = get_db()
    db.execute("DELETE FROM admin_broadcasts WHERE id=?", (bid,))
    db.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/admin/support-messages', methods=['GET'])
@admin_required
def get_support_messages():
    """Fetch messages traders sent via Help > Contact Admin."""
    db = get_db()
    convo = db.execute("SELECT id FROM conversations WHERE name='Admin Messages' AND type='admin_inbox'").fetchone()
    if not convo:
        return jsonify({'success': True, 'messages': []})
    rows = db.execute("""
        SELECT m.id, m.sender, m.text, m.created_at,
               t.display_name, t.photo_url, tm.name as team_name, tm.color as team_color
        FROM messages m
        LEFT JOIN traders t ON m.sender=t.trader_name
        LEFT JOIN teams tm ON t.team_id=tm.id
        WHERE m.conversation_id=?
        ORDER BY m.id DESC LIMIT 50
    """, (convo['id'],)).fetchall()
    return jsonify({'success': True, 'messages': [{
        'id': r['id'], 'sender': r['sender'],
        'display_name': r['display_name'] or r['sender'],
        'photo_url': r['photo_url'] or '',
        'team_name': r['team_name'] or '',
        'team_color': r['team_color'] or '#888',
        'text': r['text'], 'created_at': r['created_at']
    } for r in rows]})

@admin_bp.route('/api/broadcasts', methods=['GET'])
def get_trader_broadcasts():
    """Public endpoint for traders to fetch recent broadcasts."""
    db = get_db()
    limit = int(request.args.get('limit', 20))
    rows = db.execute("SELECT * FROM admin_broadcasts ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return jsonify({'success': True, 'broadcasts': [dict(r) for r in rows]})

# ---------------------------------------------------------------------------
# Censored Word Individual Delete
# ---------------------------------------------------------------------------
@admin_bp.route('/api/admin/censored-words/<path:word>', methods=['DELETE'])
@admin_required
def delete_censored_word(word):
    db = get_db()
    row = db.execute("SELECT value FROM admin_config WHERE key='censored_words'").fetchone()
    words = json.loads(row['value']) if row else []
    target = word.strip().lower()
    words = [w for w in words if w != target]
    db.execute("INSERT OR REPLACE INTO admin_config (key, value) VALUES ('censored_words', ?)",
               (json.dumps(words),))
    db.commit()
    return jsonify({'success': True, 'words': words, 'count': len(words)})


# ---------------------------------------------------------------------------
# Admin Dashboard Metrics
# ---------------------------------------------------------------------------
@admin_bp.route('/api/admin/metrics', methods=['GET'])
@admin_required
def get_admin_metrics():
    """Aggregate metrics for the admin dashboard."""
    db = get_db()

    traders = db.execute("SELECT trader_name, status, starting_balance FROM traders").fetchall()
    total_traders = len(traders)
    active_traders = sum(1 for t in traders if t['status'] == 'ACTIVE')

    all_trades = db.execute("SELECT trade_data FROM trades").fetchall()
    total_trades = len(all_trades)
    total_realized_pnl = 0.0
    total_notional = 0.0
    sector_map = {}  # sector -> {count, volume}

    for row in all_trades:
        try:
            td = json.loads(row['trade_data'])
        except Exception:
            continue
        if td.get('status') == 'CLOSED':
            total_realized_pnl += float(td.get('realizedPnl', 0) or 0)
        volume = float(td.get('volume', 0) or 0)
        entry = float(td.get('entryPrice', 0) or 0)
        total_notional += volume * abs(entry)
        sector = td.get('sector', 'other')
        if sector not in sector_map:
            sector_map[sector] = {'sector': sector, 'count': 0, 'volume': 0}
        sector_map[sector]['count'] += 1
        sector_map[sector]['volume'] += volume

    sector_breakdown = sorted(sector_map.values(), key=lambda x: x['count'], reverse=True)

    # Top 5 traders by realized P&L
    trader_pnl = []
    for t in traders:
        rows = db.execute("SELECT trade_data FROM trades WHERE trader_name=?", (t['trader_name'],)).fetchall()
        pnl = 0.0
        for r in rows:
            try:
                td = json.loads(r['trade_data'])
                if td.get('status') == 'CLOSED':
                    pnl += float(td.get('realizedPnl', 0) or 0)
            except Exception:
                pass
        trader_pnl.append({'trader_name': t['trader_name'], 'pnl': round(pnl, 2), 'trades': len(rows)})
    top_traders = sorted(trader_pnl, key=lambda x: x['pnl'], reverse=True)[:5]

    recent_feed = db.execute(
        "SELECT * FROM trade_feed ORDER BY id DESC LIMIT 10"
    ).fetchall()

    return jsonify({
        'success': True,
        'total_traders': total_traders,
        'active_traders': active_traders,
        'total_trades': total_trades,
        'total_realized_pnl': round(total_realized_pnl, 2),
        'total_notional': round(total_notional, 2),
        'sector_breakdown': sector_breakdown,
        'top_traders': top_traders,
        'recent_feed': [dict(r) for r in recent_feed],
    })


# ---------------------------------------------------------------------------
# Tournament Admin Endpoints
# ---------------------------------------------------------------------------
@admin_bp.route('/api/admin/tournaments', methods=['GET'])
@admin_required
def list_tournaments():
    db = get_db()
    rows = db.execute("SELECT * FROM tournaments ORDER BY created_at DESC").fetchall()
    result = []
    for r in rows:
        t = dict(r)
        t['entry_count'] = db.execute(
            "SELECT COUNT(*) as c FROM tournament_entries WHERE tournament_id=?", (r['id'],)
        ).fetchone()['c']
        result.append(t)
    return jsonify({'success': True, 'tournaments': result})


@admin_bp.route('/api/admin/tournaments', methods=['POST'])
@admin_required
def create_tournament():
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Name is required'}), 400
    db = get_db()
    cur = db.execute(
        "INSERT INTO tournaments (name, description, start_time, end_time, starting_balance) VALUES (?,?,?,?,?)",
        (name, data.get('description', ''), data.get('start_time'), data.get('end_time'),
         float(data.get('starting_balance', 1000000)))
    )
    db.commit()
    return jsonify({'success': True, 'id': cur.lastrowid})


@admin_bp.route('/api/admin/tournaments/<int:tid>', methods=['PUT'])
@admin_required
def update_tournament(tid):
    data = request.get_json()
    db = get_db()
    row = db.execute("SELECT * FROM tournaments WHERE id=?", (tid,)).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Not found'}), 404

    name = data.get('name', row['name'])
    desc = data.get('description', row['description'])
    status = data.get('status', row['status'])
    start_time = data.get('start_time', row['start_time'])
    end_time = data.get('end_time', row['end_time'])
    balance = float(data.get('starting_balance', row['starting_balance']))

    # Auto-set start_time when activating
    if status == 'ACTIVE' and row['status'] == 'PENDING' and not start_time:
        start_time = datetime.utcnow().isoformat()

    db.execute(
        "UPDATE tournaments SET name=?, description=?, status=?, start_time=?, end_time=?, starting_balance=? WHERE id=?",
        (name, desc, status, start_time, end_time, balance, tid)
    )
    db.commit()
    socketio.emit('tournament_update', {'id': tid, 'status': status})
    return jsonify({'success': True})


@admin_bp.route('/api/admin/tournaments/<int:tid>', methods=['DELETE'])
@admin_required
def delete_tournament(tid):
    db = get_db()
    db.execute("DELETE FROM tournament_entries WHERE tournament_id=?", (tid,))
    db.execute("DELETE FROM tournaments WHERE id=?", (tid,))
    db.commit()
    return jsonify({'success': True})


@admin_bp.route('/api/admin/tournaments/<int:tid>/enroll-all', methods=['POST'])
@admin_required
def enroll_all_traders(tid):
    db = get_db()
    if not db.execute("SELECT id FROM tournaments WHERE id=?", (tid,)).fetchone():
        return jsonify({'success': False, 'error': 'Tournament not found'}), 404
    traders = db.execute("SELECT trader_name FROM traders WHERE status='ACTIVE'").fetchall()
    enrolled = 0
    for t in traders:
        try:
            db.execute("INSERT OR IGNORE INTO tournament_entries (tournament_id, trader_name) VALUES (?,?)",
                       (tid, t['trader_name']))
            enrolled += 1
        except Exception:
            pass
    db.commit()
    return jsonify({'success': True, 'enrolled': enrolled})


# ---------------------------------------------------------------------------
# Public Tournament Endpoints (no admin auth required)
# ---------------------------------------------------------------------------
@admin_bp.route('/api/tournament/active', methods=['GET'])
def get_active_tournament():
    db = get_db()
    row = db.execute("SELECT * FROM tournaments WHERE status='ACTIVE' ORDER BY created_at DESC LIMIT 1").fetchone()
    if not row:
        return jsonify({'success': True, 'tournament': None})
    t = dict(row)
    t['entry_count'] = db.execute(
        "SELECT COUNT(*) as c FROM tournament_entries WHERE tournament_id=?", (row['id'],)
    ).fetchone()['c']
    return jsonify({'success': True, 'tournament': t})


@admin_bp.route('/api/tournament/<int:tid>/standings', methods=['GET'])
def get_tournament_standings(tid):
    """Return P&L standings for a tournament, scoped to its time window."""
    db = get_db()
    tourn = db.execute("SELECT * FROM tournaments WHERE id=?", (tid,)).fetchone()
    if not tourn:
        return jsonify({'success': False, 'error': 'Not found'}), 404

    prices_raw = request.args.get('prices', '{}')
    try:
        prices = json.loads(prices_raw)
    except Exception:
        prices = {}

    entries = db.execute(
        "SELECT e.trader_name, t.display_name, t.photo_url, tm.name as team_name, tm.color as team_color "
        "FROM tournament_entries e "
        "JOIN traders t ON e.trader_name = t.trader_name "
        "LEFT JOIN teams tm ON t.team_id = tm.id "
        "WHERE e.tournament_id=?", (tid,)
    ).fetchall()

    start = tourn['start_time']
    end = tourn['end_time'] or datetime.utcnow().isoformat()
    balance = tourn['starting_balance']

    standings = []
    for e in entries:
        if start:
            trades = db.execute(
                "SELECT trade_data FROM trades WHERE trader_name=? AND created_at>=? AND created_at<=?",
                (e['trader_name'], start, end)
            ).fetchall()
        else:
            trades = db.execute(
                "SELECT trade_data FROM trades WHERE trader_name=?", (e['trader_name'],)
            ).fetchall()

        realized = 0.0
        unrealized = 0.0
        trade_count = 0
        for row in trades:
            try:
                td = json.loads(row['trade_data'])
            except Exception:
                continue
            trade_count += 1
            if td.get('status') == 'CLOSED':
                realized += float(td.get('realizedPnl', 0) or 0)
            elif td.get('status') == 'OPEN':
                hub = td.get('hub', '')
                price = prices.get(hub, float(td.get('entryPrice', 0) or 0))
                entry = float(td.get('entryPrice', 0) or 0)
                volume = float(td.get('volume', 0) or 0)
                direction = td.get('direction', 'BUY')
                mult = 1 if direction == 'BUY' else -1
                unrealized += mult * (price - entry) * volume

        total_pnl = realized + unrealized
        equity = balance + total_pnl
        ret_pct = (total_pnl / balance * 100) if balance else 0

        standings.append({
            'trader_name': e['trader_name'],
            'display_name': e['display_name'],
            'photo_url': e['photo_url'] or '',
            'team_name': e['team_name'] or '',
            'team_color': e['team_color'] or '#888',
            'equity': round(equity, 2),
            'total_pnl': round(total_pnl, 2),
            'realized_pnl': round(realized, 2),
            'unrealized_pnl': round(unrealized, 2),
            'ret_pct': round(ret_pct, 2),
            'trades': trade_count,
        })

    standings.sort(key=lambda x: x['total_pnl'], reverse=True)
    for i, s in enumerate(standings):
        s['rank'] = i + 1

    return jsonify({
        'success': True,
        'tournament': dict(tourn),
        'standings': standings,
    })


# ---------------------------------------------------------------------------
# Seed Export — download current traders/teams as traders_seed.json
# ---------------------------------------------------------------------------
@admin_bp.route('/api/admin/export-seed', methods=['GET'])
@admin_required
def export_seed():
    """
    Export all teams and traders to a JSON seed file.
    Save this file as traders_seed.json in the repo root — the server
    auto-imports it on startup whenever the traders table is empty, so
    your traders survive fresh deployments.
    """
    db = get_db()
    teams = [dict(r) for r in db.execute(
        "SELECT name, description, color FROM teams ORDER BY id"
    ).fetchall()]
    traders = []
    for r in db.execute(
        """SELECT t.trader_name, t.real_name, t.display_name, t.firm,
                  t.pin, t.status, t.starting_balance, t.photo_url,
                  tm.name as team
           FROM traders t
           LEFT JOIN teams tm ON tm.id = t.team_id
           ORDER BY t.id"""
    ).fetchall():
        traders.append({
            'trader_name':      r['trader_name'],
            'real_name':        r['real_name'],
            'display_name':     r['display_name'],
            'firm':             r['firm'],
            'pin':              r['pin'],
            'status':           r['status'],
            'starting_balance': r['starting_balance'],
            'photo_url':        r['photo_url'],
            'team':             r['team'],
        })
    payload = json.dumps({'teams': teams, 'traders': traders}, indent=2)
    return Response(
        payload,
        mimetype='application/json',
        headers={'Content-Disposition': 'attachment; filename="traders_seed.json"'}
    )
