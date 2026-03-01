/* =====================================================================
   GLOBAL STATE
   ===================================================================== */
const API_BASE = ''; // Same-origin — all API calls are relative

// Helper to get trader-scoped localStorage keys
function traderStorageKey(key) {
  const trader = STATE && STATE.trader;
  const tn = trader ? trader.trader_name : '_anon';
  return 'ng_' + tn + '_' + key;
}

const _savedTrader = JSON.parse(localStorage.getItem('ng_trader') || 'null');
const _traderPrefix = _savedTrader ? 'ng_' + _savedTrader.trader_name + '_' : 'ng__anon_';

const STATE = {
  trader: _savedTrader,
  trades: JSON.parse(localStorage.getItem(_traderPrefix + 'trades') || '[]'),
  settings: JSON.parse(localStorage.getItem(_traderPrefix + 'settings') || localStorage.getItem('ng_settings') || '{"balance":1000000,"margin":"nymex","sound":false}'),
  connected: false,
  currentPage: 'ng',
  selectedHubs: { ng: 'Henry Hub', crude: 'WTI Cushing', power: 'ERCOT Hub', freight: 'Baltic Dry Index', ag: 'Corn (CBOT)', metals: 'Gold (COMEX)', ngls: 'Ethane (C2)', lng: 'JKM (Platts)' },
  chartRanges: { ng: 30, crude: 30, power: 30, freight: 30, ag: 30, metals: 30, ngls: 30, lng: 30 },
  visibleHubs: {},
  forwardCurves: {},
  clickedPrice: null,
  eqRange: 'ALL',
  pnlRange: 'ALL',
  lbRange: '1M',
  lastActivity: Date.now(),
  ws: null,
  // New: Alerts & Notifications
  alerts: JSON.parse(localStorage.getItem(_traderPrefix + 'alerts') || '[]'),
  notifications: JSON.parse(localStorage.getItem(_traderPrefix + 'notifications') || '[]'),
  pendingOrders: JSON.parse(localStorage.getItem(_traderPrefix + 'pending_orders') || '[]'),
  calendarAlertsEnabled: true,
  lastCalendarCheck: 0,
  // Weather
  weather: null,
  weatherBias: {},
  weatherSource: 'none',
  wxHeatingSeason: false,
};

/* =====================================================================
   HUB DATA
   ===================================================================== */
const NG_HUBS = [
  { name:'Henry Hub', base:2.75, vol:4.5, color:'#22d3ee' },
  { name:'Waha', base:2.40, vol:6.0, color:'#f59e0b' },
  { name:'SoCal Gas', base:2.90, vol:5.5, color:'#a78bfa' },
  { name:'Chicago', base:2.70, vol:4.0, color:'#10b981' },
  { name:'Algonquin', base:3.55, vol:12.0, color:'#ef4444' },
  { name:'Transco Zone 6', base:3.35, vol:10.0, color:'#ec4899' },
  { name:'Dominion South', base:2.30, vol:5.0, color:'#84cc16' },
  { name:'Dawn', base:2.85, vol:4.5, color:'#06b6d4' },
  { name:'Sumas', base:2.95, vol:6.0, color:'#f97316' },
  { name:'Malin', base:2.93, vol:5.5, color:'#8b5cf6' },
  { name:'Opal', base:2.67, vol:5.0, color:'#14b8a6' },
  { name:'Tetco M3', base:3.30, vol:9.0, color:'#e11d48' },
  { name:'Kern River', base:2.80, vol:5.0, color:'#0ea5e9' },
  { name:'AECO', base:1.95, vol:7.0, color:'#d946ef', currency:'CAD/GJ' }
];

const CRUDE_HUBS = [
  { name:'WTI Cushing', base:79.50, vol:1.8, color:'#22d3ee' },
  { name:'Brent Dated', base:82.70, vol:1.6, color:'#f59e0b' },
  { name:'WTI Midland', base:79.90, vol:2.0, color:'#a78bfa' },
  { name:'Mars Sour', base:77.70, vol:2.2, color:'#10b981' },
  { name:'LLS', base:80.70, vol:1.9, color:'#ec4899' },
  { name:'ANS', base:80.40, vol:2.0, color:'#ef4444' },
  { name:'Bakken', base:78.90, vol:2.1, color:'#84cc16' },
  { name:'WCS', base:65.00, vol:3.0, color:'#f97316' },
  { name:'Dubai/Oman', base:80.20, vol:1.7, color:'#fbbf24' },
  { name:'Murban', base:81.10, vol:1.6, color:'#c084fc' },
  { name:'Urals', base:71.50, vol:2.5, color:'#6366f1' },
  { name:'Bonny Light', base:83.40, vol:2.0, color:'#14b8a6' },
  { name:'Tapis', base:84.10, vol:1.8, color:'#fb7185' },
  { name:'Basra Medium', base:76.80, vol:2.1, color:'#d97706' },
  { name:'Daqing', base:77.50, vol:1.9, color:'#f43f5e' }
];

const POWER_HUBS = [
  { name:'ERCOT Hub', base:42.50, vol:8.0, color:'#22d3ee', gasRef:'Henry Hub' },
  { name:'ERCOT North', base:40.80, vol:7.5, color:'#06b6d4', gasRef:'Henry Hub' },
  { name:'ERCOT South', base:44.10, vol:9.0, color:'#0ea5e9', gasRef:'Henry Hub' },
  { name:'PJM West Hub', base:38.20, vol:6.0, color:'#a78bfa', gasRef:'Transco Zone 6' },
  { name:'NEPOOL Mass', base:51.30, vol:10.0, color:'#ef4444', gasRef:'Algonquin' },
  { name:'MISO Illinois', base:34.70, vol:5.5, color:'#10b981', gasRef:'Chicago' },
  { name:'CAISO NP15', base:48.60, vol:9.5, color:'#f59e0b', gasRef:'SoCal Gas' },
  { name:'CAISO SP15', base:47.20, vol:9.0, color:'#f97316', gasRef:'SoCal Gas' },
  { name:'NYISO Zone J', base:55.40, vol:11.0, color:'#ec4899', gasRef:'Transco Zone 6' },
  { name:'NYISO Zone A', base:36.80, vol:7.0, color:'#8b5cf6', gasRef:'Dawn' },
  { name:'SPP North', base:33.90, vol:6.5, color:'#84cc16', gasRef:'Henry Hub' }
];

const FREIGHT_HUBS = [
  { name:'Baltic Dry Index', base:1650, vol:5.0, color:'#22d3ee' },
  { name:'Baltic Capesize', base:2200, vol:7.0, color:'#f59e0b' },
  { name:'Baltic Panamax', base:1450, vol:5.5, color:'#a78bfa' },
  { name:'Baltic Supramax', base:1280, vol:5.0, color:'#10b981' },
  { name:'TD3C VLCC AG-East', base:45.50, vol:8.0, color:'#ef4444' },
  { name:'TC2 Transatlantic', base:18.20, vol:9.0, color:'#ec4899' },
  { name:'TD20 Suezmax WAF', base:32.80, vol:7.5, color:'#84cc16' },
  { name:'LNG Spot East', base:12.40, vol:6.0, color:'#f97316' }
];

const AG_HUBS = [
  { name:'Corn (CBOT)', base:4.52, vol:3.5, color:'#f59e0b', unit:'bu' },
  { name:'Soybeans (CBOT)', base:11.85, vol:2.8, color:'#10b981', unit:'bu' },
  { name:'Wheat (CBOT)', base:5.78, vol:4.0, color:'#ef4444', unit:'bu' },
  { name:'Soybean Oil (CBOT)', base:0.445, vol:3.2, color:'#a78bfa', unit:'lb' },
  { name:'Soybean Meal (CBOT)', base:330.50, vol:2.5, color:'#84cc16', unit:'ton' },
  { name:'Cotton (ICE)', base:0.775, vol:3.5, color:'#ec4899', unit:'lb' },
  { name:'Sugar #11 (ICE)', base:0.198, vol:4.5, color:'#22d3ee', unit:'lb' },
  { name:'Coffee C (ICE)', base:1.88, vol:5.0, color:'#f97316', unit:'lb' },
  { name:'Cocoa (ICE)', base:8450, vol:3.0, color:'#8b5cf6', unit:'MT' },
  { name:'Live Cattle (CME)', base:1.875, vol:2.0, color:'#06b6d4', unit:'lb' },
  { name:'Lean Hogs (CME)', base:0.895, vol:4.0, color:'#e11d48', unit:'lb' },
  { name:'Feeder Cattle (CME)', base:2.56, vol:2.2, color:'#14b8a6', unit:'lb' }
];

const METALS_HUBS = [
  { name:'Gold (COMEX)', base:2340.50, vol:1.2, color:'#f59e0b', unit:'oz' },
  { name:'Silver (COMEX)', base:29.45, vol:3.0, color:'#94a3b8', unit:'oz' },
  { name:'Copper (COMEX)', base:4.42, vol:2.5, color:'#ef4444', unit:'lb' },
  { name:'Platinum (NYMEX)', base:985.00, vol:2.0, color:'#a78bfa', unit:'oz' },
  { name:'Palladium (NYMEX)', base:1020.00, vol:3.5, color:'#22d3ee', unit:'oz' },
  { name:'Aluminum (LME)', base:2480.00, vol:2.0, color:'#84cc16', unit:'MT' },
  { name:'Nickel (LME)', base:17250.00, vol:3.0, color:'#10b981', unit:'MT' },
  { name:'Zinc (LME)', base:2720.00, vol:2.5, color:'#06b6d4', unit:'MT' },
  { name:'Iron Ore (SGX)', base:108.50, vol:3.5, color:'#f97316', unit:'MT' },
  { name:'Steel HRC (CME)', base:780.00, vol:2.8, color:'#ec4899', unit:'ton' }
];

const NGL_HUBS = [
  { name:'Ethane (C2)', base:22.5, vol:6.0, color:'#3b82f6', unit:'¢/gal', gasAnchor:true, yieldPerMcf:3.5 },
  { name:'Propane (C3)', base:72.0, vol:5.0, color:'#f97316', unit:'¢/gal', crudeAnchor:0.35, yieldPerMcf:1.5 },
  { name:'Normal Butane (nC4)', base:105.0, vol:4.5, color:'#ef4444', unit:'¢/gal', crudeAnchor:0.50, yieldPerMcf:0.5 },
  { name:'Isobutane (iC4)', base:112.0, vol:4.5, color:'#a855f7', unit:'¢/gal', crudeAnchor:0.55, yieldPerMcf:0.3 },
  { name:'Nat Gasoline (C5+)', base:155.0, vol:3.5, color:'#10b981', unit:'¢/gal', crudeAnchor:0.75, yieldPerMcf:0.3 }
];

const LNG_HUBS = [
  { name:'JKM (Platts)', base:12.80, vol:8.0, color:'#ef4444', unit:'$/MMBtu', region:'Asia' },
  { name:'TTF (ICE)', base:10.50, vol:7.0, color:'#3b82f6', unit:'$/MMBtu', region:'Europe' },
  { name:'NBP (ICE)', base:10.20, vol:7.5, color:'#8b5cf6', unit:'$/MMBtu', region:'Europe' },
  { name:'HH Netback', base:8.90, vol:5.0, color:'#22d3ee', unit:'$/MMBtu', region:'US Export' },
  { name:'DES South America', base:11.40, vol:6.5, color:'#10b981', unit:'$/MMBtu', region:'LatAm' },
  { name:'Brent-Linked LNG', base:13.20, vol:4.0, color:'#f59e0b', unit:'$/MMBtu', region:'Global' }
];

// LNG shipping cost assumptions ($/MMBtu)
const LNG_SHIPPING = {
  usGulfToAsia: 2.80,
  usGulfToEurope: 1.20,
  usGulfToLatAm: 0.90,
  liquefactionFee: 2.50,  // tolling fee
  regas: 0.50
};

// FX rate for AECO CAD/GJ conversion (admin-configurable)
const FX_CONFIG = { usdCad: 1.36 };
// Conversion: 1 MMBtu ≈ 1.055 GJ
function mmbtuToCADGJ(usdPerMmbtu) {
  return usdPerMmbtu * FX_CONFIG.usdCad / 1.055;
}
function cadGJtoUSDMmbtu(cadPerGJ) {
  return cadPerGJ * 1.055 / FX_CONFIG.usdCad;
}

const ALL_HUB_SETS = { ng: NG_HUBS, crude: CRUDE_HUBS, power: POWER_HUBS, freight: FREIGHT_HUBS, ag: AG_HUBS, metals: METALS_HUBS, ngls: NGL_HUBS, lng: LNG_HUBS };

// Price history storage: hubName -> array of prices
const priceHistory = {};
const basisHistory = {};

// Message 5 globals (must be declared before any render calls)
const MAP_STATE = { ng: false, crude: false, lng: false };
let lbTab = 'individual';
let mobDir = '';
const SCENARIOS = [
  { name:'Winter Freeze', ng:40, power:60, crude:5, freight:10 },
  { name:'OPEC Cut', ng:0, power:0, crude:20, freight:15 },
  { name:'Demand Destruction', ng:-25, power:-25, crude:-25, freight:-30 },
  { name:'Storage Surprise Bull', ng:15, power:10, crude:0, freight:5 },
  { name:'Summer Heat Wave', ng:20, power:45, crude:0, freight:0 }
];
const SIM_PEERS = [
  {name:'J. Martinez',realName:'Juan Martinez',firm:'Basis Capital',team:{name:'Alpha',color:'#22d3ee'},ret:6.2,winRate:58,pf:1.80,trades:42},
  {name:'K. Thompson',realName:'Kate Thompson',firm:'Crude Trading LLC',team:{name:'Alpha',color:'#22d3ee'},ret:3.8,winRate:52,pf:1.40,trades:31},
  {name:'A. Singh',realName:'Arun Singh',firm:'Optionality Partners',team:{name:'Beta',color:'#f59e0b'},ret:11.4,winRate:64,pf:2.30,trades:55},
  {name:'R. Chen',realName:'Robert Chen',firm:'Spread Capital',team:{name:'Beta',color:'#f59e0b'},ret:-1.2,winRate:45,pf:0.90,trades:28},
  {name:'M. Williams',realName:'Marcus Williams',firm:'Grid Power Co',team:{name:'Gamma',color:'#10b981'},ret:2.1,winRate:51,pf:1.20,trades:19},
  {name:'S. Patel',realName:'Sanjay Patel',firm:'Energy Macro Fund',team:{name:'Gamma',color:'#10b981'},ret:7.8,winRate:55,pf:1.90,trades:48},
  {name:'L. Davis',realName:'Lisa Davis',firm:'Vol Trading Group',team:null,ret:4.5,winRate:48,pf:1.50,trades:36},
  {name:'T. Nakamura',realName:'Takeshi Nakamura',firm:'Pacific Energy',team:null,ret:-0.5,winRate:43,pf:0.95,trades:22}
];

/* =====================================================================
   PRICE ENGINE
   ===================================================================== */

// Real-world price anchors fetched from /api/live-prices (yfinance + EIA).
// Populated on init and refreshed every 15 minutes.
let _livePrices = {};
let _liveHubSet = new Set();   // Hub names confirmed live from external APIs
let _hubSources = {};           // hub_name → source key (e.g. 'eia_spot_page')
let _pricesFetchedAt = 0;       // Unix timestamp of last successful fetch

// Historical daily closes stored separately from tick engine to prevent corruption.
// Charts read from this; tick engine uses priceHistory for real-time simulation.
let _historicalDaily = {};
const LIVE_PRICE_REFRESH = 900000; // 15 minutes

// Source metadata displayed in the info popover.
// Keys match what routes_prices.py sets in hub_srcs.
const PRICE_SOURCE_META = {
  eia_spot_page:      { name: 'EIA Today in Energy',           url: 'https://www.eia.gov/todayinenergy/prices.php',                     freq: 'Daily (business days)',   desc: 'Physical spot price for delivery today, sourced from NGI/SNL and published by EIA.' },
  eia_spot_page_proxy:{ name: 'EIA Today in Energy (proxy)',   url: 'https://www.eia.gov/todayinenergy/prices.php',                     freq: 'Daily (business days)',   desc: 'Nearest available EIA hub used as a proxy — El Paso San Juan represents the Permian/Waha region.' },
  eia_api_rwtc:       { name: 'EIA API v2 — RWTC',            url: 'https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm',                freq: 'Daily',                   desc: 'WTI Cushing spot price from the EIA official v2 API (series RWTC).' },
  eia_api_brent:      { name: 'EIA API v2 — RBRTE',           url: 'https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm',                freq: 'Daily',                   desc: 'Brent crude spot price from EIA official API (series RBRTE).' },
  eia_power_snl:      { name: 'EIA Today in Energy (SNL data)',url: 'https://www.eia.gov/todayinenergy/prices.php',                     freq: 'Daily (business days)',   desc: 'Regional electricity spot price from SNL Financial, republished daily by EIA.' },
  nyiso_rt_lmp:       { name: 'NYISO Real-Time LMP',          url: 'https://mis.nyiso.com/public/',                                    freq: 'Every 5 minutes',         desc: '5-minute zone locational marginal price from the NYISO public real-time CSV feed.' },
  yfinance_ng:        { name: 'NYMEX NG=F via yfinance',      url: 'https://finance.yahoo.com/quote/NG%3DF/',                          freq: '15-min delayed',          desc: 'Henry Hub natural gas front-month futures settlement price. 15-minute delay during market hours.' },
  yfinance_cl:        { name: 'NYMEX CL=F via yfinance',      url: 'https://finance.yahoo.com/quote/CL%3DF/',                          freq: '15-min delayed',          desc: 'WTI crude front-month futures settlement price. 15-minute delay during market hours.' },
  yfinance_bz:        { name: 'ICE BZ=F via yfinance',        url: 'https://finance.yahoo.com/quote/BZ%3DF/',                          freq: '15-min delayed',          desc: 'Brent crude front-month futures settlement price. 15-minute delay during market hours.' },
  yfinance_comex:     { name: 'COMEX / NYMEX via yfinance',   url: 'https://finance.yahoo.com/',                                       freq: '15-min delayed',          desc: 'Exchange-traded metals futures (GC=F gold, SI=F silver, HG=F copper, PL=F platinum, PA=F palladium).' },
  yfinance_ag:        { name: 'CBOT / CME / ICE via yfinance',url: 'https://finance.yahoo.com/',                                       freq: '15-min delayed',          desc: 'Exchange-traded agricultural futures from CBOT, CME, and ICE. 15-minute delay during market hours.' },
  yfinance_ttf:       { name: 'ICE TTF=F via yfinance',        url: 'https://finance.yahoo.com/quote/TTF%3DF/',                          freq: '15-min delayed',          desc: 'Dutch TTF Natural Gas front-month futures (ICE). Quoted in EUR/MWh, converted to $/MMBtu using live EUR/USD rate. 15-minute delay during market hours.' },
  fred_propane:       { name: 'FRED — DPROPANEMBTX',          url: 'https://fred.stlouisfed.org/series/DPROPANEMBTX',                  freq: 'Weekly (Wednesdays)',      desc: 'Mont Belvieu, TX propane spot price from the EIA weekly petroleum survey, via FRED API.' },
  fred_backup:        { name: 'FRED (backup source)',          url: 'https://fred.stlouisfed.org/',                                     freq: 'Daily / Weekly',          desc: 'Price sourced from FRED (Federal Reserve Economic Data), used as fallback when primary API is unavailable.' },
  hh_spread:          { name: 'HH + basis spread (est.)',      url: null,                                                               freq: 'Derived',                 desc: 'Estimated from live Henry Hub price plus a fixed historical basis differential for this hub.' },
  wti_diff:           { name: 'WTI + grade differential (est.)',url: null,                                                              freq: 'Derived',                 desc: 'Estimated from live WTI price plus a fixed grade and location differential for this crude grade.' },
  heat_rate_est:      { name: 'Heat-rate formula (est.)',      url: null,                                                               freq: 'Derived',                 desc: 'Estimated: gas_price × heat_rate (MMBtu/MWh) + non-fuel adder (capacity, O&M, congestion).' },
  hh_ratio_est:       { name: 'NG ratio estimate',             url: null,                                                               freq: 'Derived',                 desc: 'Estimated from live Henry Hub price using a historical NGL energy content ratio.' },
  wti_ratio_est:      { name: 'Crude ratio estimate',          url: null,                                                               freq: 'Derived',                 desc: 'Estimated from live WTI crude price using a historical NGL-to-crude price ratio.' },
  hh_netback_est:     { name: 'HH Netback formula',            url: null,                                                               freq: 'Derived',                 desc: 'Estimated: Henry Hub spot + blended LNG export cost (~$3.30/MMBtu for liquefaction + shipping).' },
};
const _fallbackMeta = { name: 'Simulation engine', url: null, freq: 'Every 8 seconds', desc: 'Price generated by the Brownian motion simulation engine, seeded from market anchors on startup.' };

// Returns true if hub price came from a real external source
function isHubLive(name) { return _liveHubSet.has(name); }

// Returns source metadata object for a hub (falls back to simulation engine)
function getHubSource(name) {
  const key = _hubSources[name];
  return (key && PRICE_SOURCE_META[key]) ? PRICE_SOURCE_META[key] : _fallbackMeta;
}

// Returns a clickable LIVE/EST badge button that opens the source info popover.
function priceBadge(name) {
  const live = isHubLive(name);
  const safeHub = name.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<button type="button" class="price-badge ${live ? 'live' : 'est'}" data-hub="${safeHub}" onclick="showPriceSource(event,this.dataset.hub)" title="View data source">${live ? 'LIVE' : 'EST'}</button>`;
}

// ---------- Price Source Popover ----------
function showPriceSource(event, hubName) {
  event.stopPropagation();
  const pop = document.getElementById('priceSourcePop');
  if (!pop) return;
  const src = getHubSource(hubName);

  pop.querySelector('.psp-hub').textContent = hubName;
  pop.querySelector('.psp-src-name').textContent = src.name;
  pop.querySelector('.psp-desc').textContent = src.desc;
  pop.querySelector('.psp-freq').textContent = 'Updates: ' + src.freq;

  const link = pop.querySelector('.psp-link');
  if (src.url) {
    link.href = src.url;
    link.textContent = src.url.replace('https://', '').split('/')[0] + ' ↗';
    link.style.display = 'inline-block';
  } else {
    link.style.display = 'none';
  }

  const ageEl = pop.querySelector('.psp-age');
  if (_pricesFetchedAt) {
    const mins = Math.round((Date.now() - _pricesFetchedAt * 1000) / 60000);
    ageEl.textContent = mins <= 1 ? 'Price data fetched just now' : `Price data fetched ${mins}m ago`;
    ageEl.style.display = 'block';
  } else {
    ageEl.style.display = 'none';
  }

  const simNote = pop.querySelector('.psp-sim-note');
  if (simNote) {
    if (isHubLive(hubName)) {
      simNote.style.display = 'block';
    } else {
      simNote.style.display = 'none';
    }
  }

  // Position near the clicked badge; clamp to viewport edges
  pop.style.display = 'block';
  const rect = event.currentTarget.getBoundingClientRect();
  const pw = pop.offsetWidth || 280;
  let left = rect.left + window.scrollX;
  let top  = rect.bottom + window.scrollY + 6;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (left < 8) left = 8;
  // Flip above if it would clip the bottom
  if (top + 180 > window.scrollY + window.innerHeight) top = rect.top + window.scrollY - 186;
  pop.style.left = left + 'px';
  pop.style.top  = top + 'px';
}

function hidePriceSource() {
  const pop = document.getElementById('priceSourcePop');
  if (pop) pop.style.display = 'none';
}

// Close popover when clicking outside it
document.addEventListener('click', function(e) {
  const pop = document.getElementById('priceSourcePop');
  if (pop && pop.style.display !== 'none' && !pop.contains(e.target)) {
    pop.style.display = 'none';
  }
});

// Returns a small always-visible source label for each bench-card.
// Clicking it opens the same popover as the LIVE/EST badge.
function hubSrcLine(name) {
  const src = getHubSource(name);
  let short = src.name
    .replace(/ \(est\.\)/, '')
    .replace(/ via yfinance$/, '')
    .replace(/ \(proxy\)/, '')
    .replace(/ \(backup source\)/, '')
    .split(' — ')[0]
    .trim();
  if (short.length > 26) short = short.slice(0, 24) + '…';
  const safeHub = name.replace(/"/g, '&quot;');
  return `<div class="hub-src-line" data-hub="${safeHub}" onclick="event.stopPropagation();showPriceSource(event,this.dataset.hub)" title="Click to see source details">${short}</div>`;
}

// Updates the floating "N live prices · fetched Xm ago" pill.
function _updateRefreshBar() {
  const bar = document.getElementById('priceRefreshBar');
  const txt = document.getElementById('priceRefreshText');
  if (!bar || !txt || !_pricesFetchedAt) return;
  const mins = Math.round((Date.now() - _pricesFetchedAt * 1000) / 60000);
  const liveCount = _liveHubSet.size;
  const ageStr = mins <= 1 ? 'just now' : mins + 'm ago';
  txt.textContent = `${liveCount} live prices · fetched ${ageStr} · click source label on any card for details`;
  bar.style.display = 'flex';
}

function genHistory(base, days, vol) {
  const h = [base];
  for (let i = 1; i < days; i++) {
    let p = h[i-1] + (Math.random()-0.5) * 2 * (base * vol/100 / 15);
    if (p < base * 0.4) p = base * 0.4;
    h.push(p);
  }
  return h;
}

async function fetchLivePrices() {
  try {
    const r = await fetch(API_BASE + '/api/live-prices');
    const d = await r.json();
    if (d.success && d.prices && Object.keys(d.prices).length > 0) {
      _livePrices      = d.prices;
      _liveHubSet      = new Set(d.live_hubs || []);
      _hubSources      = d.hub_sources || {};
      _pricesFetchedAt = d.fetched_at  || 0;
      _updateRefreshBar();
      const srcEl = document.getElementById('livePriceSrc');
      if (srcEl) {
        srcEl.textContent = `Live prices: ${d.live_hubs ? d.live_hubs.length : d.hub_count} hubs (${d.source})`;
        srcEl.title = `Cache age: ${d.cache_age_seconds}s`;
      }
      return true;
    }
  } catch(e) {
    // Non-critical — falls back to static base prices
  }
  return false;
}

function _seedPrice(hub) {
  // Use real market price if available, otherwise fall back to static base
  return _livePrices[hub.name] !== undefined ? _livePrices[hub.name] : hub.base;
}

function initPrices() {
  // Initialize immediately with static base prices so the tick engine can start
  for (const [sector, hubs] of Object.entries(ALL_HUB_SETS)) {
    hubs.forEach(h => {
      priceHistory[h.name] = genHistory(h.base, 180, h.vol);
      STATE.visibleHubs[h.name] = true;
    });
  }
  initForwardCurves();

  // Fetch real prices and real history in parallel (non-blocking)
  Promise.all([fetchLivePrices(), _fetchPriceHistory()]).then(([liveOk, histOk]) => {
    if (liveOk) {
      // Re-seed tick engine history with real prices — patches the last 5 ticks toward reality
      for (const [sector, hubs] of Object.entries(ALL_HUB_SETS)) {
        hubs.forEach(h => {
          const real = _livePrices[h.name];
          if (real === undefined) return;
          const hist = priceHistory[h.name];
          const n = Math.min(5, hist.length);
          for (let i = n; i >= 1; i--) {
            const frac = (n - i + 1) / (n + 1);
            hist[hist.length - i] = hist[hist.length - i] + (real - hist[hist.length - i]) * frac;
          }
        });
      }
    }
    renderCurrentPage();
  });

  // Refresh live prices periodically and gently rebase
  setInterval(async () => {
    const ok = await fetchLivePrices();
    if (ok) _rebaseToLivePrices();
  }, LIVE_PRICE_REFRESH);

  // Keep the "fetched Xm ago" text current every minute
  setInterval(_updateRefreshBar, 60000);
}

function _rebaseToLivePrices() {
  // Nudge the last tick toward the real price to prevent long-term drift.
  // Live hubs (real anchor): 70% hard pull back to anchor every 15 min.
  // Estimated hubs: gentle 20% nudge.
  for (const [sector, hubs] of Object.entries(ALL_HUB_SETS)) {
    hubs.forEach(h => {
      const real = _livePrices[h.name];
      if (real === undefined) return;
      const hist = priceHistory[h.name];
      if (!hist || !hist.length) return;
      const current = hist[hist.length - 1];
      const isPower = sector === 'power';
      const floor = isPower ? -h.base * 0.5 : h.base * 0.4;
      const pull = isHubLive(h.name) ? 0.70 : 0.20;
      const nudged = Math.max(floor, current + (real - current) * pull);
      hist[hist.length - 1] = nudged;
    });
  }
}

async function _fetchPriceHistory() {
  try {
    const r = await fetch(API_BASE + '/api/price-history');
    const d = await r.json();
    if (d.success && d.history) {
      let loaded = 0;
      for (const [hub, dailyCloses] of Object.entries(d.history)) {
        if (dailyCloses && dailyCloses.length >= 10) {
          _historicalDaily[hub] = dailyCloses.slice();
          loaded++;
        }
      }
      console.log('Real price history loaded: ' + loaded + ' hubs stored for charts');
      return loaded > 0;
    }
  } catch(e) {
    console.warn('Price history fetch failed, using simulated data:', e);
  }
  return false;
}

// Returns daily historical data for charts. Appends current tick price as latest point.
function getChartHistory(hubName) {
  const daily = _historicalDaily[hubName];
  if (daily && daily.length > 0) {
    const current = priceHistory[hubName];
    const currentPrice = current ? current[current.length - 1] : null;
    if (currentPrice !== null) {
      return daily.concat([currentPrice]);
    }
    return daily;
  }
  return priceHistory[hubName];
}

function tickPrices() {
  for (const [sector, hubs] of Object.entries(ALL_HUB_SETS)) {
    hubs.forEach(h => {
      const hist = priceHistory[h.name];
      const last = hist[hist.length - 1];
      const live = isHubLive(h.name);
      // Live hubs are anchored to real daily/intraday prices — use 10% of normal vol
      // so the price ticks slightly (keeping P&L active) but stays close to the real anchor.
      const volScale = live ? 0.10 : 1.0;
      let drift = (Math.random()-0.5) * 2 * (h.base * h.vol/100 / 15) * volScale;
      // Apply weather-driven bias for gas and power hubs (also dampened for live)
      if ((sector === 'ng' || sector === 'power') && STATE.weatherBias[h.name]) {
        drift += last * STATE.weatherBias[h.name] * (0.3 + Math.random() * 0.4) * volScale;
      }
      let next = last + drift;
      // Hard clamp for live hubs: never drift more than ±2% from the real anchor
      if (live) {
        const anchor = _livePrices[h.name];
        if (anchor !== undefined && anchor > 0) {
          const maxDev = anchor * 0.02;
          if (next > anchor + maxDev) next = anchor + maxDev;
          if (next < anchor - maxDev) next = Math.max(anchor - maxDev, 0.001);
        }
      }
      // Power markets can go negative; others have a floor
      const isPower = sector === 'power';
      const priceFloor = isPower ? -h.base * 0.5 : h.base * 0.4;
      if (next < priceFloor) next = priceFloor;
      hist.push(next);
      if (hist.length > 200) hist.shift();
    });
  }
  tickForwardCurves();
  renderCurrentPage();
}

function initForwardCurves() {
  for (const [sector, hubs] of Object.entries(ALL_HUB_SETS)) {
    hubs.forEach(h => {
      const curve = [];
      const spot = priceHistory[h.name][priceHistory[h.name].length - 1];
      for (let m = 0; m < 12; m++) {
        const seasonal = Math.sin((m + 1) / 12 * Math.PI * 2) * (h.base * 0.03);
        const contango = m * (h.base * 0.002);
        curve.push({ price: spot + seasonal + contango + (Math.random()-0.5)*h.base*0.01, oi: Math.floor(5000 + Math.random()*50000) });
      }
      STATE.forwardCurves[h.name] = curve;
    });
  }
}

function tickForwardCurves() {
  for (const name in STATE.forwardCurves) {
    const hub = findHub(name);
    if (!hub) continue;
    // Determine if this hub can go negative (power markets)
    const isPower = POWER_HUBS.some(h => h.name === name);
    const priceFloor = isPower ? -hub.base * 0.5 : hub.base * 0.3;
    STATE.forwardCurves[name].forEach(pt => {
      pt.price += (Math.random()-0.5) * 2 * (hub.base * hub.vol/100 / 50);
      if (pt.price < priceFloor) pt.price = priceFloor;
      pt.oi += Math.floor((Math.random()-0.5) * 200);
      if (pt.oi < 100) pt.oi = 100;
    });
  }
}

function findHub(name) {
  for (const hubs of Object.values(ALL_HUB_SETS)) {
    const h = hubs.find(x => x.name === name);
    if (h) return h;
  }
  return null;
}

function getPrice(name) {
  const h = priceHistory[name];
  return h ? h[h.length - 1] : 0;
}

function getPriceChange(name) {
  const h = priceHistory[name];
  if (!h || h.length < 2) return 0;
  return h[h.length - 1] - h[h.length - 2];
}

function getPriceChangePct(name) {
  const h = priceHistory[name];
  if (!h || h.length < 2) return 0;
  return ((h[h.length-1] - h[h.length-2]) / h[h.length-2]) * 100;
}

function getSelectedHub(sector) { return STATE.selectedHubs[sector]; }
function setSelectedHub(sector, name) { STATE.selectedHubs[sector] = name; renderCurrentPage(); }

