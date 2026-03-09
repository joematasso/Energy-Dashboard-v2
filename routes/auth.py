"""Windows Authentication routes — NTLM/SPNEGO handled directly by Flask via pyspnego."""

import base64
import random
import string
from flask import Blueprint, request, jsonify, session, Response, make_response

from app import get_db, AUTH_MODE, logger

auth_bp = Blueprint('auth', __name__)

# Per-connection SPNEGO state for multi-step NTLM handshake.
# Keyed by client IP+port (or a connection identifier).
_ntlm_contexts = {}


@auth_bp.route('/api/auth/mode')
def auth_mode():
    """Return current auth mode so frontend can adapt UI."""
    return jsonify({'mode': AUTH_MODE})


@auth_bp.route('/api/auth/ntlm', methods=['GET', 'POST'])
def ntlm_auth():
    """Handle NTLM/SPNEGO authentication directly in Flask.

    The browser performs a multi-step handshake:
      1. Client sends request with no Authorization → Flask returns 401 + WWW-Authenticate: NTLM
      2. Client sends Authorization: NTLM <type1> → Flask returns 401 + WWW-Authenticate: NTLM <type2>
      3. Client sends Authorization: NTLM <type3> → Flask validates, returns 200 + username
    """
    if AUTH_MODE != 'windows':
        return jsonify({'success': False, 'error': 'Windows auth not enabled'}), 400

    import spnego

    auth_header = request.headers.get('Authorization', '')

    if not auth_header or not auth_header.upper().startswith(('NTLM ', 'NEGOTIATE ')):
        # Step 1: No credentials — send 401 challenge
        resp = Response('', status=401)
        resp.headers['WWW-Authenticate'] = 'NTLM'
        return resp

    # Decode the token from the client
    parts = auth_header.split(' ', 1)
    in_token = base64.b64decode(parts[1])

    # Use a connection key to track the multi-step handshake
    conn_key = f"{request.remote_addr}"

    if conn_key in _ntlm_contexts:
        ctx = _ntlm_contexts[conn_key]
    else:
        ctx = spnego.server(protocol='ntlm')
        _ntlm_contexts[conn_key] = ctx

    try:
        out_token = ctx.step(in_token)
    except Exception as e:
        # Auth failed — clean up
        _ntlm_contexts.pop(conn_key, None)
        logger.warning(f"NTLM auth failed for {conn_key}: {e}")
        resp = Response('', status=401)
        resp.headers['WWW-Authenticate'] = 'NTLM'
        return resp

    if not ctx.complete:
        # Step 2: Need another round (Type 2 challenge)
        out_b64 = base64.b64encode(out_token).decode()
        resp = Response('', status=401)
        resp.headers['WWW-Authenticate'] = f'NTLM {out_b64}'
        return resp

    # Step 3: Authentication complete!
    _ntlm_contexts.pop(conn_key, None)
    client_principal = str(ctx.client_principal)
    logger.info(f"NTLM auth succeeded for: {client_principal}")

    return jsonify({'success': True, 'windows_identity': client_principal})


@auth_bp.route('/api/auth/windows', methods=['POST'])
def windows_login():
    """Complete the Windows login after NTLM auth provides the identity.
    Accepts windows_identity from the trusted NTLM handshake.
    Also still supports X-Remote-User header as fallback (if IIS forwarding works).
    """
    if AUTH_MODE != 'windows':
        return jsonify({'success': False, 'error': 'Windows auth not enabled'}), 400

    data = request.get_json(silent=True) or {}
    remote_user = data.get('windows_identity', '').strip()

    # Fallback: check X-Remote-User header (IIS forwarding)
    if not remote_user:
        remote_user = request.headers.get('X-Remote-User', '').strip()

    if not remote_user:
        return jsonify({'success': False, 'error': 'No Windows credentials detected.'}), 401

    # Parse domain\username or username@domain
    if '\\' in remote_user:
        _domain, username = remote_user.split('\\', 1)
    elif '@' in remote_user:
        username, _domain = remote_user.split('@', 1)
    else:
        username = remote_user

    username = username.strip().lower()
    windows_identity = remote_user.strip().upper()  # Normalize: ARM\JOE.MATASSO

    db = get_db()

    # Check if this Windows identity is already linked to a trader
    row = db.execute(
        "SELECT * FROM traders WHERE windows_identity=? COLLATE NOCASE",
        (windows_identity,)
    ).fetchone()

    if row:
        # Existing linked trader
        if row['status'] in ('DISABLED', 'DELETED'):
            return jsonify({'success': False, 'error': 'Account disabled. Contact your administrator.'}), 403

        # Update last_seen
        db.execute("UPDATE traders SET last_seen=CURRENT_TIMESTAMP WHERE id=?", (row['id'],))
        db.commit()

        # Set session
        session.permanent = True
        session['trader_name'] = row['trader_name']
        session['auth_method'] = 'windows'

        return jsonify({
            'success': True,
            'trader_name': row['trader_name'],
            'display_name': row['display_name'],
            'real_name': row['real_name'],
            'firm': row['firm'],
            'starting_balance': row['starting_balance'],
            'team': _get_team(db, row['team_id']),
            'privileged': bool(row['privileged']),
            'photo_url': row['photo_url'] or ''
        })

    # Try to match an existing trader by derived username before creating a new one.
    # e.g. Windows user "joe.matasso" → trader_name "joe_matasso"
    base_name = username.replace('.', '_').replace('-', '_').replace(' ', '_')
    existing_trader = db.execute(
        "SELECT * FROM traders WHERE trader_name=? COLLATE NOCASE", (base_name,)
    ).fetchone()

    if existing_trader and existing_trader['status'] not in ('DISABLED', 'DELETED'):
        # Link this Windows identity to the existing account
        db.execute("UPDATE traders SET windows_identity=?, last_seen=CURRENT_TIMESTAMP WHERE id=?",
                   (windows_identity, existing_trader['id']))
        db.commit()
        logger.info(f"Linked Windows identity '{windows_identity}' to existing trader '{existing_trader['trader_name']}'")

        session.permanent = True
        session['trader_name'] = existing_trader['trader_name']
        session['auth_method'] = 'windows'

        return jsonify({
            'success': True,
            'trader_name': existing_trader['trader_name'],
            'display_name': existing_trader['display_name'],
            'real_name': existing_trader['real_name'],
            'firm': existing_trader['firm'],
            'starting_balance': existing_trader['starting_balance'],
            'team': _get_team(db, existing_trader['team_id']),
            'privileged': bool(existing_trader['privileged']),
            'photo_url': existing_trader['photo_url'] or ''
        })

    # No match found — auto-provision a new trader
    trader_name = base_name

    # Handle collisions (e.g. if trader_name exists but is DISABLED/DELETED)
    existing = db.execute("SELECT id FROM traders WHERE trader_name=?", (trader_name,)).fetchone()
    suffix = 2
    while existing:
        trader_name = f"{base_name}_{suffix}"
        existing = db.execute("SELECT id FROM traders WHERE trader_name=?", (trader_name,)).fetchone()
        suffix += 1

    # Build display name: joe.matasso -> Joe Matasso
    display_name = username.replace('.', ' ').replace('_', ' ').title()

    # Generate a random PIN (required by schema, but won't be used for login)
    random_pin = ''.join(random.choices(string.digits, k=4))

    db.execute("""
        INSERT INTO traders (trader_name, real_name, display_name, firm, pin, status,
                             starting_balance, windows_identity, last_seen)
        VALUES (?, ?, ?, '', ?, 'ACTIVE', 1000000, ?, CURRENT_TIMESTAMP)
    """, (trader_name, display_name, display_name, random_pin, windows_identity))
    db.commit()

    logger.info(f"Auto-provisioned trader '{trader_name}' for Windows identity '{windows_identity}'")

    # Set session
    session.permanent = True
    session['trader_name'] = trader_name
    session['auth_method'] = 'windows'

    return jsonify({
        'success': True,
        'trader_name': trader_name,
        'display_name': display_name,
        'real_name': display_name,
        'firm': '',
        'starting_balance': 1000000,
        'team': None,
        'privileged': False,
        'photo_url': '',
        'new_account': True
    })


@auth_bp.route('/api/auth/check')
def auth_check():
    """Check if a valid session exists (for page reloads)."""
    trader_name = session.get('trader_name')
    if not trader_name:
        return jsonify({'authenticated': False})

    db = get_db()
    row = db.execute("SELECT * FROM traders WHERE trader_name=?", (trader_name,)).fetchone()
    if not row or row['status'] in ('DISABLED', 'DELETED'):
        session.clear()
        return jsonify({'authenticated': False})

    return jsonify({
        'authenticated': True,
        'trader_name': row['trader_name'],
        'display_name': row['display_name'],
        'real_name': row['real_name'],
        'firm': row['firm'],
        'starting_balance': row['starting_balance'],
        'team': _get_team(db, row['team_id']),
        'privileged': bool(row['privileged']),
        'photo_url': row['photo_url'] or ''
    })


@auth_bp.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    """Clear server-side session."""
    session.clear()
    return jsonify({'success': True})


def _get_team(db, team_id):
    """Helper to fetch team info."""
    if not team_id:
        return None
    team = db.execute("SELECT name, color FROM teams WHERE id=?", (team_id,)).fetchone()
    if team:
        return {'name': team['name'], 'color': team['color']}
    return None
