# Energy Desk — Project Map (Post-Split)

> **Status**: All splits complete (Phases 1–5). Frontend split into 16 JS modules + CSS. Backend split into 6 Flask Blueprint files.

---

## File Structure

```
index.html              (1,282 lines)  — HTML structure (CSS extracted)
admin.html              (594 lines)    — Admin panel (unchanged)
app.py                  (326 lines)   — Flask core: setup, DB, auth, static routes, Blueprint registration
routes_public.py        (512 lines)   — Register, login, trades CRUD, leaderboard, photos
routes_market.py        (421 lines)   — News proxy, EIA, COT, market hours, trade feed
routes_admin.py         (468 lines)   — Admin traders/teams/PINs/system/broadcasts
routes_chat.py          (448 lines)   — Chat conversations, messages, reactions, pins
routes_misc.py          (432 lines)   — OTC system, weather, WebSocket events
manifest.json                          — PWA manifest
requirements.txt                       — Python dependencies

static/
  css/
    styles.css          (612 lines)   — All CSS extracted from index.html
  js/
    state.js            (191 lines)   — STATE object, hub arrays, constants
    prices.js           (105 lines)   — Price engine
    charts.js           (222 lines)   — Chart rendering, crosshair, sparklines
    pages.js            (685 lines)   — 8 commodity page renderers
    trading.js          (517 lines)   — Trade blotter page, form, submission
    positions.js        (418 lines)   — Blotter table, net positions, PnL chart
    market-data.js      (507 lines)   — News, ticker, calendar, EIA, COT
    options.js          (571 lines)   — Black-Scholes, options chain, hub info
    ui-auth.js          (474 lines)   — Panels, theme, login, profile, sounds
    nav-risk.js         (441 lines)   — Page switching, risk analytics + heatmap
    leaderboard.js      (364 lines)   — Leaderboard rendering, charts, teams
    maps.js             (412 lines)   — Logo, pipeline maps, mobile trade ticket
    clock-otc.js        (251 lines)   — Clock, timezone, market status, OTC
    weather.js          (239 lines)   — Weather fetch, render, sparklines
    chat.js             (703 lines)   — Full chat system
    engine-init.js      (522 lines)   — Order engine, alerts, notifications, startup
```

---

## JS Load Order (critical)

All JS uses global scope — load order matters:

### Core (from old core.js):
1. **state.js** — `STATE`, hub arrays, constants (everything depends on this)
2. **prices.js** — `genHistory()`, `initPrices()`, `tickPrices()`, `getPrice()`
3. **charts.js** — `drawChart()`, `initChartCrosshair()`, `sparklineSVG()`
4. **pages.js** — All 8 commodity page renderers
5. **trading.js** — Trade form, submission, blotter page
6. **positions.js** — Blotter table, net positions, PnL chart
7. **market-data.js** — News, ticker, calendar, EIA, COT
8. **options.js** — Black-Scholes, options chain, hub info panels

### Live (from old live.js):
9. **ui-auth.js** — Panels, theme, login, profile, WebSocket, sounds
10. **nav-risk.js** — Toast, page switching, risk analytics
11. **leaderboard.js** — Leaderboard rendering and charts
12. **maps.js** — Pipeline maps, mobile trade ticket, logos
13. **clock-otc.js** — Clock, timezone, market status, OTC system
14. **weather.js** — Weather fetch and rendering
15. **chat.js** — Full chat system
16. **engine-init.js** — Order/alert engines, notifications, **INIT block** (must be last)

---

## Key Functions by File

### state.js
- `API_BASE`, `traderStorageKey()`, `STATE` object
- Hub arrays: `NG_HUBS`, `CRUDE_HUBS`, `POWER_HUBS`, `FREIGHT_HUBS`, `AG_HUBS`, `METALS_HUBS`, `NGL_HUBS`, `LNG_HUBS`
- `ALL_HUB_SETS`, `priceHistory`, `basisHistory`
- `MAP_STATE`, `SCENARIOS`, `SIM_PEERS`
- LNG shipping constants, FX helpers

### prices.js
- `genHistory()`, `initPrices()`, `tickPrices()`
- `initForwardCurves()`, `tickForwardCurves()`
- `findHub()`, `getPrice()`, `getPriceChange()`, `getPriceChangePct()`

### charts.js
- `drawChart()`, `initChartCrosshair()`, `setRange()`, `sparklineSVG()`

### pages.js
- `renderNGPage()`, `renderCrudePage()`, `renderPowerPage()`
- `renderFreightPage()`, `renderAgPage()`, `renderMetalsPage()`
- `renderNGLsPage()`, `renderLNGPage()`
- `toggleHub()`, `setSelectedHub()`

### trading.js
- `renderBlotterPage()`, `updateAccountBar()`
- `populateHubDropdown()`, `onTradeSectorChange()`, `onTradeTypeChange()`
- `setDirection()`, `calcMargin()`, `submitTrade()`

### positions.js
- `renderBlotterTable()`, `closeTrade()`, `deleteTrade()`, `cloneTrade()`
- `renderNetPositions()`, `drawPnlChart()`, `initPnlCrosshair()`

### market-data.js
- `SIM_NEWS`, `renderNews()`, `expandNews()`, `renderNewsTicker()`
- `CALENDAR_EVENTS`, `renderCalendar()`
- `fetchEiaData()`, `fetchCotData()`, `renderCotWidget()`

### options.js
- `normCDF()`, `bsPrice()`, `bsGreeks()`
- `generateOptionsChain()`, `renderOptionsChain()`, `renderOiChart()`
- `STRATEGIES`, `renderPayoff()`, `HUB_INFO`, `openHubInfo()`

### ui-auth.js
- `openPanel()`, `closeAllPanels()`, `setTheme()`
- `checkRegistration()`, `doLogin()`, `initAfterLogin()`
- `showMyProfile()`, `showTraderProfile()`, `doLogout()`
- `connectWebSocket()`, `fetchLiveNews()`, `playSound()`

### nav-risk.js
- `toast()`, `switchPage()`, `renderCurrentPage()`
- `renderRiskPage()`, `renderRiskHeatmap()`
- `drawEquityCurve()`, `initEquityCrosshair()`

### leaderboard.js
- `setLbTab()`, `renderLeaderboardPage()`, `renderLeaderboardData()`
- `drawMultiLineChart()`, `drawLbEquityCurve()`, `drawTeamEquityChart()`

### maps.js
- `openMobileTicket()`, `closeMobileTicket()`, `submitMobileTrade()`
- `initLogos()`, `toggleMap()`, `renderPipelineMap()`
- `STATE_PATHS`, `initMapZoom()`, `mapHubClick()`

### clock-otc.js
- `getSelectedTz()`, `updateClock()`, `toggleTzPicker()`
- `fetchMarketStatus()`, `initClock()`
- `fetchTradeFeed()`, `loadOtcCounterparties()`, `toggleOtcAvailable()`

### weather.js
- `fetchWeather()`, `renderWeatherPage()`, `drawWxSparkline()`

### chat.js
- `toggleChat()`, `loadConversations()`, `renderConvoList()`
- `openConvo()`, `loadMessages()`, `renderMessages()`
- `showReactPicker()`, `toggleReaction()`, `togglePin()`
- `chatSend()`, `chatNewConvo()`, `startDm()`, `createGroup()`
- `pollChat()`, `initChat()`

### engine-init.js
- `onOrderTypeChange()`, `cancelPendingOrder()`
- `processPendingOrders()`, `processStopLossTargets()`
- `openAlertModal()`, `createAlert()`, `checkAlerts()`
- `addNotification()`, `toggleNotifPanel()`, `renderNotifPanel()`
- `runTickEngines()`, **INIT BLOCK**, `postLoginInit()`

---

## Backend (Flask Blueprints — split complete)

- `app.py` (326 lines) — Core setup, DB helpers, auth decorators, static routes, `_calc_margin`, Blueprint registration
- `routes_public.py` (512 lines) — `/api/status`, register, login, trades CRUD, leaderboard, performance snapshots
- `routes_market.py` (421 lines) — News proxy (RSS), EIA proxy, CFTC COT proxy, NYMEX market hours, trade feed
- `routes_admin.py` (468 lines) — Admin traders/teams/PINs/system config, censored words, broadcasts
- `routes_chat.py` (448 lines) — Chat rename, conversations, messages, reactions, pinned messages
- `routes_misc.py` (432 lines) — OTC system, weather forecasts (Open-Meteo), WebSocket events
