# CLAUDE.md — Energy Desk v3.0 Complete Reference

Multi-user energy commodity trading simulation. Flask backend + vanilla JS frontend.
8 sectors: NG, Crude, Power, Freight, Agriculture, Metals, NGLs, LNG.

## Tech Stack
- **Backend:** Flask 2.3.0 + Flask-SocketIO, SQLite3 (WAL mode)
- **Frontend:** Vanilla JS, HTML5, CSS3 (no frameworks, no bundler)
- **External APIs:** Open-Meteo (weather), EIA v2 (inventories), CFTC Socrata (COT), RSS (news)
- **Deployment:** Railway (Procfile), runs on Python 3.10+

## Project Structure
```
app.py                     Flask app, DB schema, shared helpers (_calc_margin, get_db, admin_required)
Procfile                   Railway start command
requirements.txt           Python deps
routes/
  __init__.py              Re-exports all blueprints
  public.py                Trader APIs: login, trades, leaderboard, pending orders, tournaments
  admin.py                 Admin APIs (X-Admin-Pin header): trader/team/tournament mgmt, broadcasts
  market.py                Market data: news RSS, EIA, COT, weather, market hours (is_market_open)
  chat.py                  Messaging: conversations, messages, reactions, pins
  misc.py                  OTC trading, WebSocket events, weather endpoints, pending orders
  prices.py                Price cache: live prices, price history, forward curves
static/
  index.html               Main SPA (trading app)
  admin.html               Admin dashboard (standalone, all JS inline)
  styles.css               Global styles
  js/                      13 JS files loaded via <script> tags (order matters)
    state.js               FIRST — global STATE object, hub definitions, tradeHeaders()
    charts.js              Canvas OHLC/price charts, click-to-trade crosshair
    pages.js               Per-sector page renderers
    trading.js             Trade form, blotter, submitTrade()
    positions.js           Net positions, P&L chart, sector breakdowns
    market-data.js         News, EIA charts, COT, trade feed ticker
    options.js             Options chain, Greeks, payoff diagrams
    ui-auth.js             Login/registration, profile, post-login init
    nav-risk.js            VaR, margin analysis, risk dashboard
    leaderboard.js         Rankings, equity curves, snapshots
    clock-otc.js           Clocks, market hours badge, OTC trade UI
    chat.js                Messaging UI, reactions, pins, @mentions
    engine-init.js         LAST — startup, tick loop (8s), pending order fills, stop-loss checks
  js/maps/
    maps.js                SVG map renderer, hub markers, click-to-trade
    pipeline-network.js    Pipeline route coordinates
    world-paths.js         Country border paths (Mercator)
    state-paths.js         US state border paths
data/
  world.geojson            Source GeoJSON (reference only, not served)
```

## Shared Exports from app.py

Route files import these from `app`:
- `app`, `socketio` — Flask app + SocketIO instances
- `get_db()` — SQLite connection (request context)
- `get_db_standalone()` — SQLite connection (outside request)
- `admin_required` — decorator requiring X-Admin-Pin header
- `verify_admin_pin(pin)` — check admin PIN
- `_calc_margin(td)` — margin calculator:
  - NG/Power: (vol/10000) × 1500
  - Crude: (vol/1000) × 5000
  - Basis: (vol/10000) × 800
  - Options: 50% discount; Spreads: 60% discount

Global caches: `news_cache` (TTL 900s), `eia_cache` (TTL 3600s), `active_connections`, `trader_sids`

## Database Schema (SQLite)

**Core:** `teams`, `traders`, `trades` (JSON blob in trade_data), `pins`, `admin_config`, `performance_snapshots`

**Chat:** `conversations` (type: dm/group/team/system/admin_inbox), `conversation_members`, `messages` (+ image column), `message_reactions`, `pinned_messages`

**Trading:** `trade_feed`, `pending_orders`, `otc_proposals` (+ revision_history, turn, revision_count)

**Tournaments:** `tournaments` (+ sector, duration_minutes, var_limit, price_snapshot, config), `tournament_entries` (+ status, disqualified_at, final_pnl), `tournament_trades`, `tournament_news_events`

**Other:** `admin_broadcasts`

Key columns on traders: `trader_name` (unique), `pin` (4-digit plaintext), `status` (PENDING/ACTIVE/DELETED), `team_id` (FK), `starting_balance` (default 1M), `privileged` (after-hours), `otc_available`

## API Endpoints

### Public (routes/public.py)
- `POST /api/traders/register` — {name, pin, real_name?, firm?}
- `POST /api/traders/login` — {name, pin} → trader object
- `GET /api/traders/profile/<trader>`
- `POST /api/traders/heartbeat/<trader>`
- `POST /api/traders/display-name/<trader>` — {new_name}
- `POST /api/traders/photo/<trader>` — {photo: base64}
- `GET /api/traders/photo/<trader>` — binary image
- `GET /api/trades/<trader>` — all trades
- `POST /api/trades/<trader>` — submit trade (validates margin, duplicates, volume, market hours)
- `PUT /api/trades/<trader>/<id>` — update trade (close, amend)
- `DELETE /api/trades/<trader>/<id>` — soft-delete
- `GET /api/trades/<trader>/stats` — performance stats
- `GET /api/leaderboard` — ranked traders
- `GET /api/leaderboard/all-snapshots` — historical equity
- `GET /api/leaderboard/snapshots/<trader>`
- `GET /api/status` — build info
- `POST /api/tournament/<tid>/trade/<trader>` — tournament trade
- `PUT /api/tournament/<tid>/trade/<trader>/<id>` — update tournament trade
- `POST /api/tournament/<tid>/force-close/<trader>` — force-close all positions

### Market (routes/market.py)
- `GET /api/news/<commodity>` — RSS feed (cached 15min)
- `GET /api/eia/<type>` — EIA inventory (ng_storage, crude_inventory, crude_cushing)
- `GET /api/cot/<commodity>` — CFTC COT data (cached 2hr)
- `GET /api/market-status` — {open, reason, ct_time} (CME Globex hours)
- `GET /api/trade-feed` — last 50 trades
- `POST /api/eia-cache-clear` — admin only

### Admin (routes/admin.py) — all require X-Admin-Pin
- `GET/POST /api/admin/traders` — list/manage traders
- `POST /api/admin/traders/approve|disable|enable|privilege|reset|balance|pin/<id>`
- `DELETE /api/admin/traders/<id>`
- `GET/POST/PUT/DELETE /api/admin/teams`, `/api/admin/teams/<id>/assign|remove`
- `GET/POST /api/admin/pins`, `POST /api/admin/pins/generate|revoke`
- `POST /api/admin/reset-all` — delete all trades
- `GET /api/admin/export` — CSV dump
- `POST /api/admin/change-pin`
- `GET/PUT /api/admin/config`
- `GET/POST/DELETE /api/admin/censored-words`
- `POST /api/admin/broadcast`, `GET /api/admin/broadcasts`
- `GET /api/admin/metrics`, `GET /api/admin/support-messages`
- `GET/POST/PUT/DELETE /api/admin/tournaments`, `DELETE /api/admin/tournaments/all`
- `POST /api/admin/tournaments/<id>/enroll-all`
- `GET /api/tournament/active` — trader-facing

### Chat (routes/chat.py)
- `GET /api/chat/conversations/<trader>` — with unread counts
- `POST /api/chat/conversations` — {type, creator, members}
- `POST /api/chat/team-conversation/<trader>`
- `POST /api/chat/conversations/<id>/rename|avatar`
- `GET/POST /api/chat/conversations/<id>/members`
- `GET /api/chat/messages/<conv_id>?trader=&limit=100`
- `POST /api/chat/send/<conv_id>` — {sender, text, image?} applies censor_text()
- `POST /api/chat/messages/<id>/delete`
- `GET/POST /api/chat/reactions/<msg_id>` — toggle reaction
- `POST /api/chat/reactions-batch` — batch fetch
- `GET /api/chat/pins/<conv_id>`, `POST /api/chat/pins/<conv_id>/<msg_id>`
- `POST /api/chat/message-admin` — help/support message

### OTC (routes/misc.py)
- `GET/POST /api/traders/otc-status/<trader>`
- `GET /api/traders/otc-counterparties/<trader>`
- `POST /api/trades/otc/<trader>` — submit proposal
- `GET /api/otc/proposals/<trader>` — sent + received
- `POST /api/otc/proposals/<trader>/<id>/accept|reject|withdraw|counter`
- `POST /api/trades/otc-close/<trader>/<id>` — closes both sides atomically

### Prices (routes/prices.py)
- `GET /api/live-prices` — real market anchors (~70 hubs, cached 15min)
- `GET /api/price-history` — 6-month daily closes (cached 1hr)
- `GET /api/forward-curve` — deferred-month futures (cached 30min)

### Pending Orders (routes/misc.py)
- `GET /api/pending-orders/<trader>`
- `POST /api/pending-orders/<trader>` — {orderType, direction, hub, volume, ...}
- `DELETE /api/pending-orders/<trader>/<id>`

### Weather (routes/misc.py)
- `GET /api/weather/forecast` — 14-day forecast (cached 6hr)
- `GET /api/weather/bias` — per-hub price bias from weather

## WebSocket Events

**Client → Server:** `register_trader`, `call_initiate/answer/ice/restart/end/reject`, `request_leaderboard`

**Server → Client:** `connection_count`, `trade_submitted`, `trade_closed`, `otc_proposal`, `otc_counter`, `otc_proposal_resolved`, `leaderboard_update`, `presence_change`, `new_message`, `message_deleted`, `reaction_update`, `pin_update`, `mention_notification`, `call_incoming/answered/ice/restart/ended/rejected/error`

## Frontend STATE Object (state.js)

Key properties:
- `STATE.trader` — {trader_name, pin, display_name, starting_balance, team, privileged}
- `STATE.trades` — all trades array
- `STATE.currentPage` — active sector tab
- `STATE.selectedHubs` — {sector: hub_name}
- `STATE.pendingOrders` — client-side orders (synced with server)
- `STATE.alerts` — price alerts
- `STATE.weather`, `STATE.weatherBias` — forecast + per-hub bias
- `STATE.forwardCurves` — {hub: [{delivery, price}]}
- `STATE.tournament*` — tournament mode state

Hub arrays: `NG_HUBS` (15), `CRUDE_HUBS` (18), `POWER_HUBS` (11), `FREIGHT_HUBS` (8), `AG_HUBS` (12), `METALS_HUBS` (10), `NGL_HUBS` (5), `LNG_HUBS` (6)

## Key Functions

- `tradeHeaders()` — returns fetch headers with X-Trader-Pin for auth
- `submitTrade()` — validates form → POST /api/trades → updates STATE
- `tickPrices()` — every 8s, Brownian motion + weather bias for all hubs
- `processPendingOrders()` — every tick, checks limit/stop/trailing fill conditions
- `processStopLossTargets()` — every tick, auto-closes at stop/target thresholds
- `doLogin()` → `initAfterLogin()` → loads localStorage, connects WebSocket, syncs trades
- `is_market_open()` — CME Globex: Sun 5PM–Fri 4PM CT, daily 4-5PM break

## Auth Pattern
- Traders: `X-Trader-Pin` header on all authenticated requests (via `tradeHeaders()`)
- Admin: `X-Admin-Pin` header (via `@admin_required` decorator)
- localStorage scoped per trader: `ng_{trader_name}_{key}`

## Market Hours (CME Globex)
- Sunday: closed until 5PM CT, then open
- Mon–Thu: open except 4–5PM CT maintenance break
- Friday: closes at 4PM CT for weekend
- Saturday: closed
- NYMEX holidays: predefined set in market.py

## Trade Data JSON Structure
```
{type, direction, hub, sector, volume, entryPrice, spotRef, deliveryMonth?,
 status (OPEN/CLOSED), stopLoss?, targetExit?, trailAmount?, trailType?,
 basisHub?, basisSpread?, counterparty?, otcMirrorOf?, closePrice?, realizedPnl?}
```

## Environment Variables
`SECRET_KEY`, `DB_PATH` (default ./energydesk.db), `HOST` (0.0.0.0), `PORT` (5000), `DEBUG`, `EIA_API_KEY`, `FRED_API_KEY`
