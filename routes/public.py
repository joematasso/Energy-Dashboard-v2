#!/usr/bin/env python3
"""Public API routes: register, login, trades CRUD, leaderboard, photos."""

import json
import hashlib
import math
import os
import random
import re
import sqlite3
import string
import subprocess
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify

from app import get_db, active_connections, connections_lock, socketio, _calc_margin, logger

public_bp = Blueprint('public', __name__)

# ---------------------------------------------------------------------------
# Build info — captured once at import time from git
# ---------------------------------------------------------------------------
def _read_git_info():
    """Read build info — always tries git first for freshest data, falls back to build_info.json."""
    info = {'version': '3.0', 'commit': None, 'commit_short': None,
            'last_updated': None, 'commit_message': None, 'commit_count': 0}
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Always try git first (works in dev/codespace AND on servers with git installed)
    git_ok = False
    try:
        def _git(cmd):
            return subprocess.check_output(cmd, cwd=root, stderr=subprocess.DEVNULL).decode().strip()
        info['commit'] = _git(['git', 'rev-parse', 'HEAD'])
        info['commit_short'] = info['commit'][:7]
        info['last_updated'] = _git(['git', 'log', '-1', '--format=%ci'])
        info['commit_message'] = _git(['git', 'log', '-1', '--format=%s'])
        count = int(_git(['git', 'rev-list', '--count', 'HEAD']))
        info['commit_count'] = count
        info['version'] = f'3.0.{count}'
        git_ok = True
    except Exception:
        pass

    # Fall back to build_info.json only if git failed (e.g. Docker with no .git)
    if not git_ok:
        build_file = os.path.join(root, 'build_info.json')
        if os.path.exists(build_file):
            try:
                with open(build_file) as f:
                    saved = json.load(f)
                info.update(saved)
                if info.get('commit') and not info.get('commit_short'):
                    info['commit_short'] = info['commit'][:7]
            except Exception:
                pass

    return info

_BUILD_INFO = _read_git_info()

def _read_git_history(limit=20):
    """Read recent git commit history."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        # Use @@@ as delimiter to avoid collision with pipe chars in commit messages
        delim = '@@@'
        raw = subprocess.check_output(
            ['git', 'log', '--format=%H' + delim + '%h' + delim + '%s' + delim + '%ci' + delim + '%an',
             '-' + str(limit)],
            cwd=root, stderr=subprocess.DEVNULL
        ).decode().strip()
        if not raw:
            return []
        commits = []
        for line in raw.split('\n'):
            parts = line.split(delim, 4)
            if len(parts) >= 4:
                commits.append({
                    'hash': parts[0],
                    'short': parts[1],
                    'message': parts[2],
                    'date': parts[3],
                    'author': parts[4] if len(parts) > 4 else '',
                })
        return commits
    except Exception:
        return []

# ---------------------------------------------------------------------------
# Server-side price cache — tracks last known spot price per hub
# Seeded by trade submissions (spotRef), prevents fabricated prices
# ---------------------------------------------------------------------------
import threading as _threading
_price_cache = {}       # {hub_name: price}
_price_cache_lock = _threading.Lock()

def _update_price_cache(hub, price):
    """Update server-side price cache for a hub."""
    try:
        p = float(price)
        if math.isfinite(p) and p > 0:
            with _price_cache_lock:
                _price_cache[hub] = p
    except (ValueError, TypeError):
        pass

def _get_cached_price(hub):
    """Get last known server-side price for a hub."""
    with _price_cache_lock:
        return _price_cache.get(hub, 0)

def _verify_trader_pin(trader_name):
    """Verify the X-Trader-Pin header matches the trader's PIN. Returns (ok, error_response_tuple)."""
    pin = request.headers.get('X-Trader-Pin', '')
    if not pin:
        return False, (jsonify({'success': False, 'error': 'Authentication required (X-Trader-Pin header)'}), 401)
    db = get_db()
    row = db.execute("SELECT pin FROM traders WHERE trader_name=?", (trader_name,)).fetchone()
    if not row:
        return False, (jsonify({'success': False, 'error': 'Trader not found'}), 404)
    if row['pin'] != pin:
        return False, (jsonify({'success': False, 'error': 'Invalid PIN'}), 403)
    return True, None

# ---------------------------------------------------------------------------
# Public API Endpoints
# ---------------------------------------------------------------------------
import sys as _sys
import platform as _platform
import flask as _flask
_server_start_time = datetime.utcnow()

@public_bp.route('/api/status')
def api_status():
    db = get_db()
    active = db.execute("SELECT COUNT(*) as c FROM traders WHERE status='ACTIVE'").fetchone()['c']
    total_trades = db.execute("SELECT COUNT(*) as c FROM trades").fetchone()['c']
    with connections_lock:
        ws_count = len(active_connections)

    # Database file size
    db_size_mb = 0
    try:
        db_size_mb = round(os.path.getsize(DATABASE) / (1024 * 1024), 2)
    except Exception:
        pass

    uptime_seconds = int((datetime.utcnow() - _server_start_time).total_seconds())

    # Recent version history
    history = _read_git_history(20)

    return jsonify({
        'success': True,
        'status': 'online',
        'active_traders': active,
        'connected_clients': ws_count,
        'server_time': datetime.utcnow().isoformat(),
        'version': _BUILD_INFO['version'],
        'build': _BUILD_INFO,
        'history': history,
        'system': {
            'python': _sys.version.split()[0],
            'flask': _flask.__version__,
            'sqlite': db.execute("SELECT sqlite_version()").fetchone()[0],
            'os': _platform.system() + ' ' + _platform.release(),
            'db_size_mb': db_size_mb,
            'total_trades': total_trades,
            'uptime_seconds': uptime_seconds,
        }
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
    if trader['status'] == 'DELETED':
        return jsonify({'success': False, 'error': 'Invalid name or PIN. Contact your admin for access.'}), 401

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
        'team': team_info,
        'privileged': bool(trader['privileged']) if 'privileged' in trader.keys() else False
    })

@public_bp.route('/api/traders/heartbeat/<trader>', methods=['POST'])
def trader_heartbeat(trader):
    db = get_db()
    row = db.execute("SELECT status FROM traders WHERE trader_name=?", (trader,)).fetchone()
    if not row or row['status'] == 'DELETED':
        return jsonify({'success': False, 'revoked': True}), 403
    db.execute("UPDATE traders SET last_seen=CURRENT_TIMESTAMP WHERE trader_name=?", (trader,))
    db.commit()
    return jsonify({'success': True})

@public_bp.route('/api/traders/profile/<trader>', methods=['GET'])
def get_trader_profile(trader):
    """Return current trader flags (privileged, status, etc.) for client sync."""
    db = get_db()
    row = db.execute("SELECT * FROM traders WHERE trader_name=?", (trader,)).fetchone()
    if not row:
        return jsonify({'success': False}), 404
    if row['status'] == 'DELETED':
        return jsonify({'success': False, 'revoked': True}), 403
    return jsonify({
        'success': True,
        'privileged': bool(row['privileged']) if 'privileged' in row.keys() else False,
        'status': row['status'],
        'starting_balance': row['starting_balance'],
        'display_name': row['display_name'],
        'firm': row['firm']
    })


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
    limit = min(int(request.args.get('limit', 200)), 1000)
    offset = max(int(request.args.get('offset', 0)), 0)
    total = db.execute("SELECT COUNT(*) FROM trades WHERE trader_name=?", (trader,)).fetchone()[0]
    rows = db.execute(
        "SELECT id, trade_data, created_at FROM trades WHERE trader_name=? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (trader, limit, offset)
    ).fetchall()
    trades = []
    for row in rows:
        td = json.loads(row['trade_data'])
        td['id'] = row['id']
        td['server_created_at'] = row['created_at']
        td.pop('backdated', None)
        trades.append(td)
    return jsonify({'success': True, 'trades': trades, 'total': total, 'limit': limit, 'offset': offset})

@public_bp.route('/api/trades/<trader>', methods=['POST'])
def submit_trade(trader):
    """Submit a trade with server-side validation."""
    # Authenticate trader
    ok, err = _verify_trader_pin(trader)
    if not ok:
        return err

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

    # 1b. Market hours enforcement (OTC and privileged bypass allowed)
    venue = data.get('venue', '')
    is_privileged_trader = trader_row['privileged'] if 'privileged' in trader_row.keys() else False
    if venue and venue != 'OTC' and not is_privileged_trader:
        try:
            from routes.market import is_market_open
            mkt_open, mkt_reason, _ = is_market_open()
            if not mkt_open:
                return jsonify({'success': False, 'error': f'Exchange closed ({mkt_reason}). Use OTC or wait for market open.'}), 400
        except ImportError:
            pass  # If market module unavailable, allow trade

    # 2. Validate required fields
    required = ['type', 'direction', 'hub', 'volume', 'entryPrice']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'success': False, 'error': f'Missing required fields: {", ".join(missing)}'}), 400

    # 3. Volume limits
    try:
        volume = float(data.get('volume', 0))
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'Invalid volume'}), 400
    if not math.isfinite(volume):
        return jsonify({'success': False, 'error': 'Volume must be a finite number'}), 400
    trade_type = data.get('type', '')
    is_crude = trade_type.startswith('CRUDE') or trade_type in ('EFP', 'OPTION_CL')
    max_volume = 50000 if is_crude else 500000
    if is_privileged_trader:
        max_volume *= 2
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
    try:
        entry_price = float(data.get('entryPrice', 0))
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'Invalid entry price'}), 400
    if not math.isfinite(entry_price):
        return jsonify({'success': False, 'error': 'Entry price must be a finite number'}), 400
    is_basis = trade_type == 'BASIS_SWAP'
    if not is_basis and entry_price <= 0:
        return jsonify({'success': False, 'error': 'Entry price must be positive'}), 400
    # Basis swaps: reject absurd differentials (>$50)
    if is_basis and abs(entry_price) > 50:
        return jsonify({'success': False, 'error': 'Basis differential too large (max ±$50)'}), 400

    # Validate price vs direction: BUY >= spot, SELL <= spot (skip for basis and backdated trades)
    try:
        spot_ref = float(data.get('spotRef', entry_price))
    except (ValueError, TypeError):
        spot_ref = entry_price
    if not math.isfinite(spot_ref) or (not is_basis and spot_ref <= 0):
        spot_ref = entry_price  # Fall back to entry price if spotRef is invalid

    # Validate spotRef against server-side price cache (prevents client fabricating spotRef)
    hub = data.get('hub', '')
    cached_price = _get_cached_price(hub)
    if cached_price > 0 and not is_basis:
        # spotRef must be within 5% of last known server price
        spot_deviation = abs(spot_ref - cached_price) / cached_price
        if spot_deviation > 0.05:
            return jsonify({'success': False, 'error': f'Spot reference ${spot_ref:.4f} deviates too far from market ${cached_price:.4f}'}), 400
        # entryPrice must also be within 5% of cached price
        entry_deviation = abs(entry_price - cached_price) / cached_price
        if entry_deviation > 0.05:
            return jsonify({'success': False, 'error': f'Entry price ${entry_price:.4f} deviates too far from market ${cached_price:.4f}'}), 400

    direction = data.get('direction', '')
    is_privileged_trader = trader_row['privileged'] if 'privileged' in trader_row.keys() else False
    is_backdating = bool(data.get('backdate')) and is_privileged_trader
    if not is_basis and not is_backdating:
        # Tolerance widened to accommodate bid-ask spread + slippage (up to ~0.5%)
        if direction == 'BUY' and entry_price < spot_ref * 0.995:
            return jsonify({'success': False, 'error': 'BUY price must be at or above spot'}), 400
        if direction == 'SELL' and entry_price > spot_ref * 1.005:
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

    # 5. Duplicate prevention (same trade within 5 seconds) — privileged bypass
    if is_privileged_trader:
        recent = []
    else:
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
    # Privileged traders can backdate trades
    backdate = data.pop('backdate', None)
    is_privileged = trader_row['privileged'] if 'privileged' in trader_row.keys() else False
    if backdate and is_privileged:
        data['timestamp'] = backdate
        data['backdated'] = True
    else:
        data['timestamp'] = datetime.utcnow().isoformat()
    trade_json = json.dumps(data)

    if backdate and is_privileged:
        cur = db.execute(
            "INSERT INTO trades (trader_name, trade_data, created_at) VALUES (?, ?, ?)",
            (trader, trade_json, backdate)
        )
    else:
        cur = db.execute(
            "INSERT INTO trades (trader_name, trade_data) VALUES (?, ?)",
            (trader, trade_json)
        )
    db.commit()
    trade_id = cur.lastrowid

    db.execute("UPDATE traders SET last_seen=CURRENT_TIMESTAMP WHERE trader_name=?", (trader,))
    db.commit()

    # Update server-side price cache with this trade's spotRef
    _update_price_cache(data.get('hub', ''), spot_ref)

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
    ok, err = _verify_trader_pin(trader)
    if not ok:
        return err

    db = get_db()
    row = db.execute("SELECT * FROM trades WHERE id=? AND trader_name=?", (trade_id, trader)).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Trade not found'}), 404

    data = request.get_json()
    td = json.loads(row['trade_data'])

    # Validate close price if closing a non-OTC trade
    if data.get('status') == 'CLOSED' and td.get('venue') != 'OTC':
        try:
            close_price = float(data.get('closePrice', 0))
        except (ValueError, TypeError):
            return jsonify({'success': False, 'error': 'Invalid close price'}), 400
        if not math.isfinite(close_price):
            return jsonify({'success': False, 'error': 'Close price must be a finite number'}), 400

        # Validate close price against server-side price cache (not client spotRef)
        hub = td.get('hub', '')
        is_basis = td.get('type') == 'BASIS_SWAP'
        cached = _get_cached_price(hub)
        if cached > 0 and not is_basis:
            deviation = abs(close_price - cached) / cached
            if deviation > 0.05:
                return jsonify({'success': False, 'error': f'Close price ${close_price:.4f} deviates too far from market ${cached:.4f}'}), 400
            # Update cache with close price
            _update_price_cache(hub, close_price)
        elif not is_basis:
            # Fall back to client spotRef if no cached price (first trade for this hub)
            try:
                spot_ref = float(data.get('spotRef', 0)) or float(td.get('spotRef', 0))
            except (ValueError, TypeError):
                spot_ref = 0
            if spot_ref > 0 and math.isfinite(spot_ref):
                deviation = abs(close_price - spot_ref) / spot_ref
                if deviation > 0.02:
                    return jsonify({'success': False, 'error': f'Close price ${close_price:.4f} deviates too far from market ${spot_ref:.4f}'}), 400
                _update_price_cache(hub, spot_ref)

    # Validate closeReason if provided
    if data.get('closeReason'):
        valid_reasons = {'MANUAL', 'STOP_LOSS', 'TARGET', 'AUTO_ROLL', 'EXPIRY', 'MARGIN_CALL', 'FLAT_ALL', 'TRAILING_STOP', 'BACKDATED_ROLL'}
        if data['closeReason'] not in valid_reasons:
            return jsonify({'success': False, 'error': f'Invalid close reason: {data["closeReason"]}'}), 400

    # Validate realizedPnl is finite if provided
    if data.get('realizedPnl') is not None:
        try:
            rpnl = float(data['realizedPnl'])
            if not math.isfinite(rpnl):
                return jsonify({'success': False, 'error': 'Realized P&L must be a finite number'}), 400
        except (ValueError, TypeError):
            return jsonify({'success': False, 'error': 'Invalid realized P&L value'}), 400

    # Privileged traders can amend closed trades (correct mistakes)
    trader_info = db.execute("SELECT privileged FROM traders WHERE trader_name=?", (trader,)).fetchone()
    is_privileged = trader_info and trader_info['privileged'] if trader_info and 'privileged' in trader_info.keys() else False

    # Only allow specific safe fields to be updated (prevent td.update injection)
    ALLOWED_FIELDS = {'status', 'closePrice', 'closedAt', 'closeReason', 'realizedPnl',
                      'stopLoss', 'targetExit', 'notes', 'spotRef', 'autoRoll'}
    if is_privileged:
        ALLOWED_FIELDS |= {'entryPrice', 'volume'}  # privileged can also amend entry price/volume
    for key in data:
        if key in ALLOWED_FIELDS:
            td[key] = data[key]

    # Server-compute realizedPnl when closing a trade
    if td.get('status') == 'CLOSED' and td.get('closePrice') is not None:
        try:
            entry_price = float(td.get('entryPrice', 0))
            close_price = float(td.get('closePrice', 0))
            volume = float(td.get('volume', 0))
            direction = td.get('direction', 'BUY')
            mult = 1 if direction == 'BUY' else -1
            # Compute P&L multiplier based on trade type
            trade_type = td.get('type', '')
            is_basis = trade_type == 'BASIS_SWAP'
            computed_pnl = mult * (close_price - entry_price) * volume
            if is_basis:
                computed_pnl = (close_price - entry_price) * volume if direction == 'BUY' else -(close_price - entry_price) * volume
            td['realizedPnl'] = round(computed_pnl, 2)
        except (ValueError, TypeError):
            pass

    db.execute("UPDATE trades SET trade_data=? WHERE id=?", (json.dumps(td), trade_id))
    db.commit()

    if data.get('status') == 'CLOSED':
        socketio.emit('trade_closed', {'trader_name': trader, 'trade_id': trade_id})
        socketio.emit('leaderboard_update', {'reason': 'trade_closed'})

    return jsonify({'success': True, 'trade_id': trade_id})

@public_bp.route('/api/trades/<trader>/<int:trade_id>', methods=['DELETE'])
def delete_trade(trader, trade_id):
    """Delete a trade (1-hour window, or anytime for privileged traders)."""
    ok, err = _verify_trader_pin(trader)
    if not ok:
        return err

    db = get_db()
    row = db.execute("SELECT * FROM trades WHERE id=? AND trader_name=?", (trade_id, trader)).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Trade not found'}), 404

    trader_info = db.execute("SELECT privileged FROM traders WHERE trader_name=?", (trader,)).fetchone()
    is_privileged = trader_info and trader_info['privileged'] if trader_info and 'privileged' in trader_info.keys() else False
    if not is_privileged:
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
# Trade Statistics API
# ---------------------------------------------------------------------------
@public_bp.route('/api/trades/<trader>/stats')
def get_trade_stats(trader):
    """Server-computed trade statistics."""
    db = get_db()
    trader_row = db.execute("SELECT * FROM traders WHERE trader_name=?", (trader,)).fetchone()
    if not trader_row:
        return jsonify({'success': False, 'error': 'Trader not found'}), 404

    rows = db.execute("SELECT trade_data FROM trades WHERE trader_name=?", (trader,)).fetchall()
    wins, losses, gross_win, gross_loss = 0, 0, 0.0, 0.0
    sector_pnl = {}
    daily_pnl = {}
    equity_peak = 0.0
    max_dd = 0.0
    balance = 1000000
    running_equity = balance

    for row in rows:
        td = json.loads(row['trade_data'])
        status = td.get('status', '')
        pnl = float(td.get('realizedPnl', 0) or 0)
        sector = td.get('sector', 'unknown')

        if status == 'CLOSED':
            running_equity += pnl
            if running_equity > equity_peak:
                equity_peak = running_equity
            dd = (equity_peak - running_equity) / equity_peak if equity_peak > 0 else 0
            if dd > max_dd:
                max_dd = dd

            if pnl > 0:
                wins += 1
                gross_win += pnl
            elif pnl < 0:
                losses += 1
                gross_loss += abs(pnl)

            sector_pnl[sector] = sector_pnl.get(sector, 0) + pnl

            day = (td.get('closedAt') or td.get('timestamp', ''))[:10]
            if day:
                daily_pnl[day] = daily_pnl.get(day, 0) + pnl

    total = wins + losses
    win_rate = (wins / total * 100) if total > 0 else 0
    avg_win = gross_win / wins if wins > 0 else 0
    avg_loss = gross_loss / losses if losses > 0 else 0
    profit_factor = gross_win / gross_loss if gross_loss > 0 else float('inf') if gross_win > 0 else 0

    # Sharpe from daily P&L
    daily_returns = list(daily_pnl.values())
    if len(daily_returns) >= 2:
        import statistics
        mean_r = statistics.mean(daily_returns)
        std_r = statistics.stdev(daily_returns)
        sharpe = (mean_r / std_r * (252 ** 0.5)) if std_r > 0 else 0
    else:
        sharpe = 0

    return jsonify({
        'success': True,
        'stats': {
            'trade_count': total,
            'wins': wins, 'losses': losses,
            'win_rate': round(win_rate, 1),
            'avg_win': round(avg_win, 2),
            'avg_loss': round(avg_loss, 2),
            'profit_factor': round(profit_factor, 2) if profit_factor != float('inf') else 999,
            'sharpe': round(sharpe, 2),
            'max_drawdown': round(max_dd * 100, 2),
            'total_pnl': round(running_equity - balance, 2),
            'sector_breakdown': sector_pnl
        }
    })

# ---------------------------------------------------------------------------
# Leaderboard API
# ---------------------------------------------------------------------------
@public_bp.route('/api/leaderboard')
def get_leaderboard():
    """Server-calculated leaderboard."""
    db = get_db()
    traders = db.execute("SELECT * FROM traders WHERE status='ACTIVE'").fetchall()
    results = []
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
                # Calculate unrealized P&L using server price cache (not client-supplied)
                hub = td.get('hub', '')
                ep = float(td.get('entryPrice', 0))
                vol = float(td.get('volume', 0))
                direction = td.get('direction', '')
                is_basis_trade = td.get('type') == 'BASIS_SWAP'

                current_price = _get_cached_price(hub)
                if not current_price:
                    current_price = float(td.get('spotRef', ep))

                if is_basis_trade:
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


# ---------------------------------------------------------------------------
# Tournament Trade Submission
# ---------------------------------------------------------------------------
@public_bp.route('/api/tournament/<int:tid>/trade/<trader>', methods=['POST'])
def submit_tournament_trade(tid, trader):
    """Submit a trade within an active tournament (separate from main trades)."""
    ok, err = _verify_trader_pin(trader)
    if not ok:
        return err
    db = get_db()

    # 1. Validate tournament is ACTIVE
    tourn = db.execute("SELECT * FROM tournaments WHERE id=?", (tid,)).fetchone()
    if not tourn:
        return jsonify({'success': False, 'error': 'Tournament not found'}), 404
    if tourn['status'] != 'ACTIVE':
        return jsonify({'success': False, 'error': 'Tournament is not active'}), 400

    # 2. Validate trader is enrolled and not disqualified
    entry = db.execute(
        "SELECT * FROM tournament_entries WHERE tournament_id=? AND trader_name=?",
        (tid, trader)
    ).fetchone()
    if not entry:
        return jsonify({'success': False, 'error': 'Not enrolled in this tournament'}), 403
    if entry['status'] == 'DISQUALIFIED':
        return jsonify({'success': False, 'error': 'You have been disqualified from this tournament'}), 403

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No trade data provided'}), 400

    # 3. Validate required fields
    required = ['type', 'direction', 'hub', 'volume', 'entryPrice']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'success': False, 'error': f'Missing required fields: {", ".join(missing)}'}), 400

    # 4. Volume limits
    try:
        volume = float(data.get('volume', 0))
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'Invalid volume'}), 400
    if not math.isfinite(volume) or volume <= 0:
        return jsonify({'success': False, 'error': 'Volume must be a positive finite number'}), 400
    trade_type = data.get('type', '')
    is_crude = trade_type.startswith('CRUDE') or trade_type in ('EFP', 'OPTION_CL')
    max_volume = 50000 if is_crude else 500000
    if volume > max_volume:
        unit = 'BBL' if is_crude else 'MMBtu'
        return jsonify({'success': False, 'error': f'Volume exceeds maximum of {max_volume:,.0f} {unit}'}), 400

    # 5. Price validation (skip spotRef — tournament prices are simulated, server doesn't know them)
    try:
        entry_price = float(data.get('entryPrice', 0))
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'Invalid entry price'}), 400
    if not math.isfinite(entry_price):
        return jsonify({'success': False, 'error': 'Entry price must be a finite number'}), 400
    is_basis = trade_type == 'BASIS_SWAP'
    if not is_basis and entry_price <= 0:
        return jsonify({'success': False, 'error': 'Entry price must be positive'}), 400
    if is_basis and abs(entry_price) > 50:
        return jsonify({'success': False, 'error': 'Basis differential too large (max ±$50)'}), 400

    # 6. Margin check using tournament starting_balance
    starting_balance = tourn['starting_balance']
    existing_trades = db.execute(
        "SELECT trade_data FROM tournament_trades WHERE tournament_id=? AND trader_name=?",
        (tid, trader)
    ).fetchall()

    used_margin = 0.0
    realized_pnl = 0.0
    for row in existing_trades:
        try:
            td = json.loads(row['trade_data'])
        except Exception:
            continue
        if td.get('status') == 'CLOSED':
            realized_pnl += float(td.get('realizedPnl', 0) or 0)
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

    # 7. Duplicate prevention (same trade within 5 seconds)
    recent = db.execute(
        "SELECT trade_data FROM tournament_trades WHERE tournament_id=? AND trader_name=? "
        "AND created_at > datetime('now', '-5 seconds')",
        (tid, trader)
    ).fetchall()
    for row in recent:
        try:
            td = json.loads(row['trade_data'])
        except Exception:
            continue
        if (td.get('type') == data.get('type') and
            td.get('direction') == data.get('direction') and
            td.get('hub') == data.get('hub') and
            abs(float(td.get('volume', 0)) - volume) / max(volume, 1) < 0.05 and
            abs(float(td.get('entryPrice', 0)) - entry_price) / max(abs(entry_price), 0.01) < 0.02):
            return jsonify({'success': False, 'error': 'Duplicate trade detected (within 5 seconds)'}), 400

    # 8. Store tournament trade
    data['status'] = 'OPEN'
    data['timestamp'] = datetime.utcnow().isoformat()
    data['_tournament'] = True
    trade_json = json.dumps(data)

    cur = db.execute(
        "INSERT INTO tournament_trades (tournament_id, trader_name, trade_data) VALUES (?, ?, ?)",
        (tid, trader, trade_json)
    )
    db.commit()
    trade_id = cur.lastrowid

    socketio.emit('tournament_trade', {
        'tournament_id': tid,
        'trader_name': trader,
        'trade_id': trade_id,
        'type': data.get('type'),
        'direction': data.get('direction'),
        'hub': data.get('hub'),
        'volume': volume
    })

    return jsonify({'success': True, 'trade_id': trade_id})


@public_bp.route('/api/tournament/<int:tid>/trade/<trader>/<int:trade_id>', methods=['PUT'])
def update_tournament_trade(tid, trader, trade_id):
    """Close or update a tournament trade."""
    ok, err = _verify_trader_pin(trader)
    if not ok:
        return err
    db = get_db()

    # Verify tournament is active
    tourn = db.execute("SELECT * FROM tournaments WHERE id=?", (tid,)).fetchone()
    if not tourn:
        return jsonify({'success': False, 'error': 'Tournament not found'}), 404
    if tourn['status'] != 'ACTIVE':
        return jsonify({'success': False, 'error': 'Tournament is not active'}), 400

    row = db.execute(
        "SELECT * FROM tournament_trades WHERE id=? AND tournament_id=? AND trader_name=?",
        (trade_id, tid, trader)
    ).fetchone()
    if not row:
        return jsonify({'success': False, 'error': 'Tournament trade not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    td = json.loads(row['trade_data'])

    # Only allow specific safe fields to be updated
    ALLOWED_FIELDS = {'status', 'closePrice', 'closedAt', 'closeReason', 'realizedPnl',
                      'stopLoss', 'targetExit', 'notes'}
    for key in data:
        if key not in ALLOWED_FIELDS:
            continue
        td[key] = data[key]

    # Validate realizedPnl if provided — must be a finite number within reason
    if 'realizedPnl' in data:
        try:
            rpnl = float(data['realizedPnl'])
            if not math.isfinite(rpnl):
                return jsonify({'success': False, 'error': 'realizedPnl must be finite'}), 400
            starting_balance = tourn['starting_balance']
            if abs(rpnl) > starting_balance * 10:
                return jsonify({'success': False, 'error': 'realizedPnl exceeds reasonable bounds'}), 400
        except (ValueError, TypeError):
            return jsonify({'success': False, 'error': 'Invalid realizedPnl'}), 400

    db.execute("UPDATE tournament_trades SET trade_data=? WHERE id=?", (json.dumps(td), trade_id))
    db.commit()

    return jsonify({'success': True, 'trade_id': trade_id})


@public_bp.route('/api/tournament/<int:tid>/force-close/<trader>', methods=['POST'])
def force_close_tournament_trades(tid, trader):
    """Force-close all open tournament trades for a trader (VaR DQ or tournament end)."""
    ok, err = _verify_trader_pin(trader)
    if not ok:
        return err
    db = get_db()

    # Verify tournament exists
    tourn = db.execute("SELECT * FROM tournaments WHERE id=?", (tid,)).fetchone()
    if not tourn:
        return jsonify({'success': False, 'error': 'Tournament not found'}), 404

    # Verify trader is enrolled
    entry = db.execute(
        "SELECT * FROM tournament_entries WHERE tournament_id=? AND trader_name=?",
        (tid, trader)
    ).fetchone()
    if not entry:
        return jsonify({'success': False, 'error': 'Not enrolled'}), 403

    data = request.get_json() or {}
    closed_trades = data.get('trades', [])
    starting_balance = tourn['starting_balance']

    # Bulk update: client sends array of {trade_id, closePrice, realizedPnl}
    for ct in closed_trades:
        trade_id = ct.get('trade_id')
        if not trade_id:
            continue
        row = db.execute(
            "SELECT * FROM tournament_trades WHERE id=? AND tournament_id=? AND trader_name=?",
            (trade_id, tid, trader)
        ).fetchone()
        if not row:
            continue
        td = json.loads(row['trade_data'])
        if td.get('status') != 'OPEN':
            continue

        # Validate closePrice and realizedPnl
        try:
            close_price = float(ct.get('closePrice', 0))
            realized_pnl = float(ct.get('realizedPnl', 0))
            if not math.isfinite(close_price) or not math.isfinite(realized_pnl):
                continue
            if abs(realized_pnl) > starting_balance * 10:
                continue  # Skip unreasonable P&L
        except (ValueError, TypeError):
            continue

        td['status'] = 'CLOSED'
        td['closePrice'] = close_price
        td['realizedPnl'] = realized_pnl
        td['closedAt'] = datetime.utcnow().isoformat()
        td['closeReason'] = ct.get('closeReason', 'FORCE_CLOSE')
        db.execute("UPDATE tournament_trades SET trade_data=? WHERE id=?", (json.dumps(td), trade_id))

    db.commit()

    # Update entry stats
    all_trades = db.execute(
        "SELECT trade_data FROM tournament_trades WHERE tournament_id=? AND trader_name=?",
        (tid, trader)
    ).fetchall()
    realized = 0.0
    trade_count = 0
    for tr in all_trades:
        try:
            td = json.loads(tr['trade_data'])
        except Exception:
            continue
        trade_count += 1
        if td.get('status') == 'CLOSED':
            realized += float(td.get('realizedPnl', 0) or 0)

    tourn = db.execute("SELECT starting_balance FROM tournaments WHERE id=?", (tid,)).fetchone()
    balance = tourn['starting_balance'] if tourn else 1000000
    equity = balance + realized

    db.execute(
        "UPDATE tournament_entries SET final_pnl=?, final_equity=?, trade_count=? "
        "WHERE tournament_id=? AND trader_name=?",
        (round(realized, 2), round(equity, 2), trade_count, tid, trader)
    )
    db.commit()

    return jsonify({'success': True, 'final_pnl': round(realized, 2), 'equity': round(equity, 2)})

