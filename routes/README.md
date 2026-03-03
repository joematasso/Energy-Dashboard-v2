# routes/

Flask blueprint modules that define all backend API endpoints. Each file is a self-contained blueprint registered in `app.py`.

## Files

| File | Blueprint | What it does |
|------|-----------|-------------|
| `__init__.py` | — | Re-exports all blueprints so `app.py` can do a single import |
| `public.py` | `public_bp` | Core trader APIs — login, registration, trade submission, portfolio, leaderboard, pending/limit orders, stop-losses, performance snapshots |
| `admin.py` | `admin_bp` | Admin-only APIs (require `X-Admin-Pin` header) — trader management, team CRUD, tournaments, broadcasts, trade feed, CSV export |
| `market.py` | `market_bp` | External data APIs — news (RSS), EIA inventories, CFTC COT reports, weather (Open-Meteo), market open/close status |
| `chat.py` | `chat_bp` | Real-time messaging — conversations, messages, reactions, pinned messages, image attachments |
| `misc.py` | `misc_bp` | OTC bilateral trading, WebSocket event handlers (connect/disconnect, call signaling), weather endpoints |
| `prices.py` | `prices_bp` | Server-side price cache — accepts price snapshots from clients, serves latest prices, EIA spot price lookups |

## How they connect

- Every blueprint imports shared helpers from `app.py` (`get_db`, `admin_required`, `_calc_margin`, `socketio`, etc.)
- Cross-blueprint imports: `chat.py` imports `censor_text` from `admin.py`; `admin.py` imports `trader_sids` from `misc.py`; `public.py` imports `is_market_open` from `market.py`
- All routes use the `/api/` URL prefix (e.g., `/api/trades/<trader>`, `/api/admin/traders`)
