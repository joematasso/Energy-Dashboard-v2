#!/usr/bin/env python3
"""
Energy Desk v3.0 — Backend Server
Flask + SQLite (WAL) + WebSocket (flask-socketio)
"""

import os
import sys
import json

# Load .env file if present (local dev)
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip())

# Prevent circular import: when run as `python app.py`, the module is __main__,
# but route files do `from app import ...` which would load app.py a second time.
# This ensures both names point to the same module object.
if __name__ == '__main__':
    sys.modules['app'] = sys.modules['__main__']
import time
import random
import re
import string
import sqlite3
import hashlib
import csv
import io
import logging
import math
from datetime import datetime, timedelta
from functools import wraps
from threading import Lock

import requests
import feedparser
from flask import Flask, request, jsonify, send_from_directory, Response, g
from flask_socketio import SocketIO, emit

# ---------------------------------------------------------------------------
# App Setup
# ---------------------------------------------------------------------------
app = Flask(__name__, static_folder='.', static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'energydesk-v3-secret')
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

DATABASE = os.environ.get('DB_PATH', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'energydesk.db'))
EIA_API_KEY  = os.environ.get('EIA_API_KEY', 'gy5wa7bBT1fQGFkomilxjR1XN8Rs889yG9D0n2HT')
FRED_API_KEY = os.environ.get('FRED_API_KEY', '')   # optional — register free at fred.stlouisfed.org/docs/api/api_key.html

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)
# Suppress Werkzeug's per-request access log — it floods Railway's log quota
logging.getLogger('werkzeug').setLevel(logging.WARNING)

# Caches
news_cache = {}
news_cache_lock = Lock()
NEWS_CACHE_TTL = 900  # 15 minutes

eia_cache = {}
eia_cache_lock = Lock()
EIA_CACHE_TTL = 3600  # 1 hour

# Active connections
active_connections = set()
connections_lock = Lock()

# Trader name → socket ID mapping (for call signaling)
trader_sids = {}
trader_sids_lock = Lock()

# ---------------------------------------------------------------------------
# Database Helpers
# ---------------------------------------------------------------------------
def get_db():
    """Get database connection for current request."""
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def get_db_standalone():
    """Get database connection outside of request context."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    """Initialize database schema."""
    conn = get_db_standalone()
    cur = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#22d3ee',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS traders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trader_name TEXT UNIQUE NOT NULL,
            real_name TEXT NOT NULL DEFAULT '',
            display_name TEXT NOT NULL,
            firm TEXT DEFAULT '',
            pin TEXT NOT NULL,
            team_id INTEGER,
            status TEXT DEFAULT 'PENDING',
            starting_balance REAL DEFAULT 1000000,
            photo_url TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen TIMESTAMP,
            FOREIGN KEY (team_id) REFERENCES teams(id)
        );

        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trader_name TEXT NOT NULL,
            trade_data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (trader_name) REFERENCES traders(trader_name)
        );

        CREATE TABLE IF NOT EXISTS pins (
            pin TEXT PRIMARY KEY,
            status TEXT DEFAULT 'AVAILABLE',
            claimed_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS performance_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trader_name TEXT NOT NULL,
            snapshot_date DATE NOT NULL,
            equity REAL,
            realized_pnl REAL,
            unrealized_pnl REAL,
            trade_count INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS admin_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT DEFAULT '',
            type TEXT NOT NULL,
            team_id INTEGER,
            avatar TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS conversation_members (
            conversation_id INTEGER NOT NULL,
            trader_name TEXT NOT NULL,
            last_read TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (conversation_id, trader_name)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            sender TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS trade_feed (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trader_name TEXT NOT NULL,
            action TEXT NOT NULL,
            summary TEXT NOT NULL,
            team_name TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS message_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            trader_name TEXT NOT NULL,
            emoji TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, trader_name, emoji)
        );

        CREATE TABLE IF NOT EXISTS pinned_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            message_id INTEGER NOT NULL,
            pinned_by TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(conversation_id, message_id)
        );

        CREATE TABLE IF NOT EXISTS admin_broadcasts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'normal',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tournaments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'PENDING',
            start_time TIMESTAMP,
            end_time TIMESTAMP,
            starting_balance REAL DEFAULT 1000000,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tournament_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER NOT NULL,
            trader_name TEXT NOT NULL,
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
            UNIQUE(tournament_id, trader_name)
        );

        CREATE TABLE IF NOT EXISTS pending_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trader_name TEXT NOT NULL,
            order_data TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (trader_name) REFERENCES traders(trader_name)
        );

        CREATE TABLE IF NOT EXISTS otc_proposals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_trader TEXT NOT NULL,
            to_trader TEXT NOT NULL,
            trade_data TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            message TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP
        );
    """)

    # Insert default admin PIN if not exists
    cur.execute("INSERT OR IGNORE INTO admin_config (key, value) VALUES ('admin_pin', 'admin123')")
    cur.execute("INSERT OR IGNORE INTO admin_config (key, value) VALUES ('censored_words', '[]')")

    # Migration: add real_name column if it doesn't exist
    try:
        cur.execute("SELECT real_name FROM traders LIMIT 1")
    except sqlite3.OperationalError:
        cur.execute("ALTER TABLE traders ADD COLUMN real_name TEXT NOT NULL DEFAULT ''")
        cur.execute("UPDATE traders SET real_name = display_name WHERE real_name = ''")

    # Migration: add otc_available column
    try:
        cur.execute("SELECT otc_available FROM traders LIMIT 1")
    except sqlite3.OperationalError:
        cur.execute("ALTER TABLE traders ADD COLUMN otc_available INTEGER DEFAULT 0")

    # Migration: add avatar column to conversations
    try:
        cur.execute("SELECT avatar FROM conversations LIMIT 1")
    except sqlite3.OperationalError:
        cur.execute("ALTER TABLE conversations ADD COLUMN avatar TEXT DEFAULT ''")

    # Migration: add image column to messages (for image attachments)
    try:
        cur.execute("SELECT image FROM messages LIMIT 1")
    except sqlite3.OperationalError:
        cur.execute("ALTER TABLE messages ADD COLUMN image TEXT DEFAULT ''")

    # Migration: add privileged column to traders (after-hours + backdate)
    try:
        cur.execute("SELECT privileged FROM traders LIMIT 1")
    except sqlite3.OperationalError:
        cur.execute("ALTER TABLE traders ADD COLUMN privileged INTEGER DEFAULT 0")

    conn.commit()

    # Auto-seed traders from traders_seed.json if the traders table is empty
    _maybe_seed_traders(conn)

    conn.close()
    logger.info("Database initialized successfully.")


def _maybe_seed_traders(conn):
    """
    If no traders exist, load teams + traders from traders_seed.json (if present).
    This keeps trader accounts alive across fresh deployments — just export once,
    commit the seed file to the repo, and it auto-imports on every fresh startup.
    """
    seed_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'traders_seed.json')
    if not os.path.exists(seed_path):
        return
    cur = conn.cursor()
    count = cur.execute("SELECT COUNT(*) FROM traders").fetchone()[0]
    if count > 0:
        return  # already populated — don't overwrite live data
    try:
        with open(seed_path) as f:
            seed = json.load(f)
        # Insert teams first
        for t in seed.get('teams', []):
            cur.execute(
                "INSERT OR IGNORE INTO teams (name, description, color) VALUES (?,?,?)",
                (t['name'], t.get('description', ''), t.get('color', '#22d3ee'))
            )
        # Insert traders — look up team_id by name
        for t in seed.get('traders', []):
            team_id = None
            if t.get('team'):
                row = cur.execute("SELECT id FROM teams WHERE name=?", (t['team'],)).fetchone()
                team_id = row[0] if row else None
            cur.execute("""
                INSERT OR IGNORE INTO traders
                  (trader_name, real_name, display_name, firm, pin, team_id,
                   status, starting_balance, photo_url)
                VALUES (?,?,?,?,?,?,?,?,?)
            """, (
                t['trader_name'], t.get('real_name', ''), t.get('display_name', t['trader_name']),
                t.get('firm', ''), t['pin'], team_id,
                t.get('status', 'ACTIVE'), t.get('starting_balance', 1000000),
                t.get('photo_url', '')
            ))
        conn.commit()
        logger.info(f"Seeded {len(seed.get('traders', []))} traders from traders_seed.json")
    except Exception as e:
        logger.warning(f"traders_seed.json load failed: {e}")

# ---------------------------------------------------------------------------
# Auth Helpers
# ---------------------------------------------------------------------------
def verify_admin_pin(pin):
    """Verify admin PIN against database."""
    db = get_db()
    row = db.execute("SELECT value FROM admin_config WHERE key='admin_pin'").fetchone()
    if row and row['value'] == pin:
        return True
    return False

def admin_required(f):
    """Decorator to require admin PIN in X-Admin-Pin header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        pin = request.headers.get('X-Admin-Pin', '')
        if not verify_admin_pin(pin):
            return jsonify({'success': False, 'error': 'Invalid admin PIN'}), 403
        return f(*args, **kwargs)
    return decorated

# ---------------------------------------------------------------------------
# Static File Routes
# ---------------------------------------------------------------------------
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/admin')
def serve_admin():
    return send_from_directory('.', 'admin.html')

@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory('.', 'manifest.json')

@app.route('/icon.svg')
def serve_icon():
    return send_from_directory('.', 'icon.svg')


# ---------------------------------------------------------------------------
# Trade Margin Calculation Helper (shared by routes_public + routes_misc)
# ---------------------------------------------------------------------------
def _calc_margin(td):
    """Calculate required margin for a trade."""
    volume = float(td.get('volume', 0))
    trade_type = td.get('type', '')
    is_crude = trade_type.startswith('CRUDE') or trade_type in ('EFP', 'OPTION_CL')

    # Spread and multileg trades get reduced margin (offsetting risk)
    is_spread = trade_type in ('SPREAD', 'MULTILEG', 'CRUDE_DIFF')
    spread_discount = 0.4 if is_spread else 1.0  # 60% margin reduction for spreads

    if is_crude:
        margin = (volume / 1000) * 5000
    elif trade_type == 'BASIS_SWAP':
        margin = (volume / 10000) * 800
    elif trade_type in ('OPTION_NG',):
        margin = (volume / 10000) * 1500 * 0.5
    elif trade_type == 'OPTION_CL':
        margin = (volume / 1000) * 5000 * 0.5
    else:
        margin = (volume / 10000) * 1500

    return margin * spread_discount

# ---------------------------------------------------------------------------
# Blueprint Registration
# ---------------------------------------------------------------------------
from routes_public import public_bp
from routes_market import market_bp
from routes_admin import admin_bp
from routes_chat import chat_bp
from routes_misc import misc_bp
from routes_prices import prices_bp

app.register_blueprint(public_bp)
app.register_blueprint(market_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(misc_bp)
app.register_blueprint(prices_bp)

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    init_db()

    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'

    logger.info(f"Starting Energy Desk v3.0 on {host}:{port}")
    logger.info(f"Database: {DATABASE}")
    logger.info(f"EIA API Key:  {'configured' if EIA_API_KEY else 'NOT SET'}")
    logger.info(f"FRED API Key: {'configured' if FRED_API_KEY else 'NOT SET (propane will be estimated)'}")

    socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
