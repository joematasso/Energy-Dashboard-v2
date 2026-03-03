# Energy Desk v3.0

Multi-user energy commodity trading simulation platform. Covers 8 sectors: Natural Gas, Crude Oil, Power, Freight, Agriculture, Metals, NGLs, and LNG.

## Tech Stack

- **Backend:** Python / Flask + Flask-SocketIO, SQLite (WAL mode)
- **Frontend:** Vanilla JavaScript, HTML5, CSS3 (no frameworks or bundlers)
- **External APIs:** Open-Meteo (weather), EIA v2 (inventories), CFTC/Socrata (COT reports), RSS (news)
- **Deployment:** Railway (Procfile-based), runs on any platform with Python 3.10+

## Project Structure

```
asdf/
├── app.py                 # Flask app setup, DB schema, shared helpers
├── Procfile               # Railway/Heroku start command
├── requirements.txt       # Python dependencies
├── build_info.json        # Deploy metadata (git hash, timestamp)
│
├── routes/                # Backend API endpoints (Flask blueprints)
│   ├── public.py          #   Trader APIs — login, trades, leaderboard
│   ├── admin.py           #   Admin APIs — trader/team/tournament management
│   ├── market.py          #   Market data — news, EIA, COT, weather, market hours
│   ├── chat.py            #   Real-time messaging
│   ├── misc.py            #   OTC trading, WebSocket handlers
│   └── prices.py          #   Price cache and EIA spot lookups
│
├── static/                # Browser-served files
│   ├── index.html         #   Main trading app (single-page)
│   ├── admin.html         #   Admin dashboard (standalone)
│   ├── styles.css         #   Global styles
│   └── js/                #   Frontend JavaScript (13 files)
│       └── maps/          #   SVG pipeline map data (4 files)
│
└── data/                  # Non-served reference data
    └── world.geojson      #   Source data for map generation
```

Each folder has its own README with details on every file.

## Running Locally

```bash
pip install -r requirements.txt
python app.py
```

Opens on `http://localhost:5000`. No build step needed.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | No | Flask session key (has default) |
| `EIA_API_KEY` | No | EIA v2 API key for inventory data (has default) |
| `FRED_API_KEY` | No | FRED API key for propane prices (optional) |
| `PORT` | No | Server port (default 5000) |
| `HOST` | No | Bind address (default 0.0.0.0) |
| `DB_PATH` | No | SQLite database path (default `./energydesk.db`) |

## Key Concepts

- **Prices** are simulated client-side via Brownian motion, ticked every 8 seconds. Weather data biases NG/Power prices.
- **Trading** goes through server-side validation (margin checks, market hours, duplicate detection) before being stored.
- **Market hours** follow the CME Globex energy schedule: Sunday 5 PM CT through Friday 4 PM CT, with a daily 4-5 PM CT maintenance break.
- **Auth** uses 4-digit PINs (no SSO). Admin endpoints require an `X-Admin-Pin` header.
- **Real-time updates** use Socket.IO for trade feed, chat messages, and OTC call signaling.
