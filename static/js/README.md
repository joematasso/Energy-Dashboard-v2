# static/js/

Frontend JavaScript for the trading platform. All files are loaded via `<script>` tags in `index.html` (no bundler). Load order matters — `state.js` must be first, `engine-init.js` must be last.

## Files (in load order)

| # | File | Purpose |
|---|------|---------|
| 1 | `state.js` | Global `STATE` object — all hub definitions, price arrays, trader session, UI state. Everything else reads/writes to this. |
| 2 | `charts.js` | Canvas-based OHLC and price charts with click-to-trade crosshair overlay |
| 3 | `pages.js` | Per-commodity page renderers — builds the HTML for each sector tab (NG, Crude, Power, Freight, Ag, Metals, NGLs, LNG) |
| 4 | `trading.js` | Trade form, blotter table, account balance bar, `submitTrade()` POST to backend |
| 5 | `positions.js` | Net position summary, P&L chart, sector breakdowns, margin usage display |
| 6 | `market-data.js` | News feed, EIA inventory charts, CFTC COT data, live trade feed ticker |
| 7 | `options.js` | Options chain pricing, Greeks calculator, payoff diagrams |
| 8 | `ui-auth.js` | Login/registration forms, PIN authentication, profile management, post-login initialization |
| 9 | `nav-risk.js` | VaR calculation, margin analysis, risk dashboard |
| 10 | `leaderboard.js` | Rankings table, equity curve charts, performance snapshots |
| 11 | `clock-otc.js` | Timezone clocks, market hours badge, OTC bilateral trade UI |
| 12 | `chat.js` | Real-time messaging UI — conversations list, message thread, reactions, pins, @mentions |
| 13 | `engine-init.js` | **Must be last.** Startup orchestrator — initializes price engine, pending order fill checks, stop-loss monitoring, alert system, 8-second tick loop |

## Key patterns

- No module bundler — files communicate through the global `STATE` object and global functions
- Prices are simulated client-side via Brownian motion (in `state.js`), ticked every 8 seconds by `engine-init.js`
- All API calls use `fetch()` with `tradeHeaders()` from `ui-auth.js` for PIN authentication
- WebSocket (Socket.IO) used for real-time trade feed, chat messages, and OTC call signaling
