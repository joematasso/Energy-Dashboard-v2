#!/usr/bin/env python3
"""Admin API routes: trader management, teams, PINs, system, censored words, broadcasts."""

import json
import csv
import io
import random
import string
from datetime import datetime

from flask import Blueprint, request, jsonify, Response

from app import get_db, admin_required, socketio, EIA_API_KEY, NEWS_CACHE_TTL, logger

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
            'last_seen': t['last_seen']
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
    db.execute("DELETE FROM traders WHERE id=?", (tid,))
    db.commit()
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
    db = get_db()
    rows = db.execute("SELECT * FROM admin_config").fetchall()
    config = {}
    for r in rows:
        if r['key'] == 'admin_pin':
            config['admin_pin'] = '****'
        else:
            config[r['key']] = r['value']
    config['eia_api_key'] = '****' if EIA_API_KEY else 'NOT SET'
    config['database'] = DATABASE
    config['news_cache_ttl'] = NEWS_CACHE_TTL
    return jsonify({'success': True, 'config': config})


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


