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
  { name:'WCS', base:65.00, vol:3.0, color:'#f97316' }
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
const MAP_STATE = { ng: false, crude: false };
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
function genHistory(base, days, vol) {
  const h = [base];
  for (let i = 1; i < days; i++) {
    let p = h[i-1] + (Math.random()-0.5) * 2 * (base * vol/100 / 15);
    if (p < base * 0.4) p = base * 0.4;
    h.push(p);
  }
  return h;
}

function initPrices() {
  for (const [sector, hubs] of Object.entries(ALL_HUB_SETS)) {
    hubs.forEach(h => {
      priceHistory[h.name] = genHistory(h.base, 180, h.vol);
      STATE.visibleHubs[h.name] = true;
    });
  }
  initForwardCurves();
}

function tickPrices() {
  for (const [sector, hubs] of Object.entries(ALL_HUB_SETS)) {
    hubs.forEach(h => {
      const hist = priceHistory[h.name];
      const last = hist[hist.length - 1];
      let drift = (Math.random()-0.5) * 2 * (h.base * h.vol/100 / 15);
      // Apply weather-driven bias for gas and power hubs
      if ((sector === 'ng' || sector === 'power') && STATE.weatherBias[h.name]) {
        drift += last * STATE.weatherBias[h.name] * (0.3 + Math.random() * 0.4);
      }
      let next = last + drift;
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

/* =====================================================================
   CHART RENDERING
   ===================================================================== */
function drawChart(canvasId, hubName, range) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !canvas.parentElement) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  if (!rect || !rect.width) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = 300 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '300px';
  ctx.scale(dpr, dpr);
  const W = rect.width, H = 300;

  const hub = findHub(hubName);
  const hist = priceHistory[hubName];
  if (!hist || !hub) return;

  const data = hist.slice(-range);
  if (data.length < 2) return;

  const min = Math.min(...data) * 0.998;
  const max = Math.max(...data) * 1.002;
  const padL = 65, padR = 35, padT = 20, padB = 40;
  const cW = W - padL - padR, cH = H - padT - padB;

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const bgColor = isLight ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  const gridColor = isLight ? '#e2e8f0' : 'rgba(30,45,61,0.6)';
  const textColor = isLight ? '#475569' : '#94a3b8';

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 5; i++) {
    const y = padT + (cH / 5) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    const val = max - (max - min) * (i / 5);
    ctx.fillStyle = textColor;
    ctx.font = '11px IBM Plex Mono';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(hubName.includes('Baltic') || hubName.includes('Index') ? 0 : 2), padL - 8, y + 4);
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
  grad.addColorStop(0, hub.color + '30');
  grad.addColorStop(1, hub.color + '00');
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = padL + (i / (data.length - 1)) * cW;
    const y = padT + (1 - (data[i] - min) / (max - min)) * cH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.lineTo(padL + cW, padT + cH);
  ctx.lineTo(padL, padT + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = padL + (i / (data.length - 1)) * cW;
    const y = padT + (1 - (data[i] - min) / (max - min)) * cH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = hub.color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Current price dot
  const lastX = padL + cW;
  const lastY = padT + (1 - (data[data.length-1] - min) / (max - min)) * cH;
  ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2); ctx.fillStyle = hub.color; ctx.fill();

  // X-axis time labels
  ctx.fillStyle = textColor;
  ctx.font = '10px IBM Plex Mono';
  ctx.textAlign = 'center';
  const now = new Date();
  const labelCount = Math.min(6, data.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor(i * (data.length - 1) / (labelCount - 1));
    const x = padL + (idx / (data.length - 1)) * cW;
    const daysBack = data.length - 1 - idx;
    const labelDate = new Date(now.getTime() - daysBack * 86400000);
    const label = labelDate.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    ctx.fillText(label, x, H - padB + 18);
  }

  // Store chart meta for crosshair
  canvas._chartMeta = { padL, padR, padT, padB, cW, cH, min, max, data, hubName, hub };
}

// Crosshair handler
function initChartCrosshair(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || canvas._crosshairInit) return;
  canvas._crosshairInit = true;

  canvas.addEventListener('mousemove', e => {
    const meta = canvas._chartMeta;
    if (!meta) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const { padL, padR, padT, cW, cH, min, max, data, hub, hubName } = meta;

    if (mx < padL || mx > padL + cW) {
      drawChart(canvasId, hubName, STATE.chartRanges[canvasId.replace('Chart','')]);
      return;
    }

    // Find nearest data index from mouse X
    const idx = Math.round(((mx - padL) / cW) * (data.length - 1));
    const clampIdx = Math.max(0, Math.min(data.length - 1, idx));
    const price = data[clampIdx];
    const range = max - min || 1;

    // Snap positions
    const snapX = padL + (clampIdx / (data.length - 1)) * cW;
    const snapY = padT + (1 - (price - min) / range) * cH;

    // Redraw base chart
    drawChart(canvasId, hubName, STATE.chartRanges[canvasId.replace('Chart','')]);
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Vertical line at snapped X
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(snapX, padT); ctx.lineTo(snapX, padT + cH); ctx.stroke();
    // Horizontal line at snapped Y
    ctx.beginPath(); ctx.moveTo(padL, snapY); ctx.lineTo(padL + cW, snapY); ctx.stroke();
    ctx.setLineDash([]);

    // Snap dot on the line
    ctx.beginPath(); ctx.arc(snapX, snapY, 5, 0, Math.PI * 2);
    ctx.fillStyle = hub.color; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    // Tooltip with price
    const isLarge = hubName.includes('Baltic') || hubName.includes('Index');
    const txt = isLarge ? price.toFixed(0) : price.toFixed(2);
    ctx.font = '12px IBM Plex Mono';
    const tw = ctx.measureText(txt).width + 16;
    // Position tooltip — flip side if near right edge
    const tipX = snapX + 12 + tw > padL + cW ? snapX - tw - 12 : snapX + 12;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(tipX, snapY - 12, tw, 22);
    ctx.strokeStyle = hub.color; ctx.lineWidth = 1;
    ctx.strokeRect(tipX, snapY - 12, tw, 22);
    ctx.fillStyle = hub.color;
    ctx.textAlign = 'left';
    ctx.fillText(txt, tipX + 8, snapY + 4);

    // Date label at bottom
    const now = new Date();
    const daysBack = data.length - 1 - clampIdx;
    const labelDate = new Date(now.getTime() - daysBack * 86400000);
    const dateStr = labelDate.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    ctx.font = '10px IBM Plex Mono';
    const dtw = ctx.measureText(dateStr).width + 10;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(snapX - dtw/2, padT + cH + 2, dtw, 18);
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.fillText(dateStr, snapX, padT + cH + 14);

    ctx.restore();
  });

  canvas.addEventListener('mouseleave', () => {
    const meta = canvas._chartMeta;
    if (meta) drawChart(canvasId, meta.hubName, STATE.chartRanges[canvasId.replace('Chart','')]);
  });

  // Click to set entry price (snaps to data)
  canvas.addEventListener('click', e => {
    const meta = canvas._chartMeta;
    if (!meta) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const { padL, cW, data, hubName } = meta;
    const idx = Math.round(((mx - padL) / cW) * (data.length - 1));
    const clampIdx = Math.max(0, Math.min(data.length - 1, idx));
    const price = data[clampIdx];
    STATE.clickedPrice = parseFloat(price.toFixed(hubName.includes('Baltic') ? 0 : 4));
    toast('Entry price captured: ' + STATE.clickedPrice, 'info');
  });
}

function setRange(sector, days, btn) {
  STATE.chartRanges[sector] = days;
  btn.parentElement.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCurrentPage();
}

/* =====================================================================
   SPARKLINE SVG
   ===================================================================== */
function sparklineSVG(data, color, w, h) {
  if (!data || data.length < 2) return '';
  const d = data.slice(-30);
  const min = Math.min(...d), max = Math.max(...d);
  const range = max - min || 1;
  const pts = d.map((v, i) => `${(i/(d.length-1))*w},${h - ((v-min)/range)*h}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}

/* =====================================================================
   RENDER FUNCTIONS — NATURAL GAS
   ===================================================================== */
function renderNGPage() {
  // Toggle bar
  const toggleBar = document.getElementById('ngToggles');
  toggleBar.innerHTML = NG_HUBS.map(h =>
    `<button class="hub-toggle ${STATE.visibleHubs[h.name]?'on':''}" onclick="toggleHub('${h.name}')" style="${STATE.visibleHubs[h.name]?'background:'+h.color+';color:#000;border-color:'+h.color:''}">${h.name}</button>`
  ).join('');

  // Bench grid
  const grid = document.getElementById('ngBenchGrid');
  grid.innerHTML = NG_HUBS.filter(h => STATE.visibleHubs[h.name]).map(h => {
    const p = getPrice(h.name), c = getPriceChange(h.name), cp = getPriceChangePct(h.name);
    const sel = STATE.selectedHubs.ng === h.name ? 'selected' : '';
    const isAECO = h.currency === 'CAD/GJ';
    const cadPrice = isAECO ? mmbtuToCADGJ(p) : 0;
    const priceDisplay = isAECO
      ? `<div class="hub-price">C$${cadPrice.toFixed(2)}<span style="font-size:11px;color:var(--text-muted)"> /GJ</span></div><div style="font-size:11px;color:var(--text-dim)">US$${p.toFixed(3)}/MMBtu</div>`
      : `<div class="hub-price">$${p.toFixed(2)}</div>`;
    return `<div class="bench-card ${sel}" onclick="setSelectedHub('ng','${h.name}')">
      <div class="hub-name" style="color:${h.color}">${h.name}${isAECO?' 🇨🇦':''}</div>
      ${priceDisplay}
      <div class="hub-change ${c>=0?'up':'down'}">${c>=0?'+':''}${c.toFixed(3)} (${cp>=0?'+':''}${cp.toFixed(2)}%)</div>
      <div class="sparkline">${sparklineSVG(priceHistory[h.name], h.color, 150, 24)}</div>
    </div>`;
  }).join('');

  // Chart
  const selHub = STATE.selectedHubs.ng;
  document.getElementById('ngChartTitle').textContent = selHub;
  try { drawChart('ngChart', selHub, STATE.chartRanges.ng);
  initChartCrosshair('ngChart'); } catch(e) { console.error('NG chart error:', e); }

  // Basis table
  const henry = getPrice('Henry Hub');
  const basisTbody = document.querySelector('#ngBasisTable tbody');
  basisTbody.innerHTML = NG_HUBS.map(h => {
    const p = getPrice(h.name), basis = p - henry, c = getPriceChange(h.name);
    const isAECO = h.currency === 'CAD/GJ';
    const hist30 = (priceHistory[h.name]||[]).slice(-30);
    const henryHist30 = (priceHistory['Henry Hub']||[]).slice(-30);
    const avg30 = hist30.reduce((s,v,i) => s + (v - (henryHist30[i]||henry)), 0) / hist30.length;
    const spotDisplay = isAECO ? `C$${mmbtuToCADGJ(p).toFixed(2)} <span style="font-size:10px;color:var(--text-muted)">(US$${p.toFixed(3)})</span>` : `$${p.toFixed(3)}`;
    return `<tr>
      <td style="color:${h.color};font-weight:600">${h.name}${isAECO?' 🇨🇦':''}</td>
      <td class="mono">${spotDisplay}</td>
      <td class="mono ${basis>=0?'green':'red'}">${basis>=0?'+':''}${basis.toFixed(3)}</td>
      <td class="mono ${c>=0?'green':'red'}">${c>=0?'+':''}${c.toFixed(3)}</td>
      <td class="mono">${avg30>=0?'+':''}${avg30.toFixed(3)}</td>
    </tr>`;
  }).join('');

  // Forward curve
  document.getElementById('ngFwdTitle').textContent = selHub;
  const fwd = STATE.forwardCurves[selHub] || [];
  const fwdTbody = document.querySelector('#ngFwdTable tbody');
  const now = new Date();
  fwdTbody.innerHTML = fwd.map((pt, i) => {
    const mDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const mLabel = mDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const prevPrice = i > 0 ? fwd[i-1].price : getPrice(selHub);
    const change = pt.price - prevPrice;
    return `<tr>
      <td>${mLabel}</td>
      <td class="mono">$${pt.price.toFixed(3)}</td>
      <td class="mono ${change>=0?'green':'red'}">${change>=0?'+':''}${change.toFixed(3)}</td>
      <td class="mono">${pt.oi.toLocaleString()}</td>
    </tr>`;
  }).join('');

  // News
  renderNews('ng', 'ngNews');

  // Calendar
  renderCalendar('ngCalendar', 'ng');

  // Options chain (refresh if open)
  if (document.getElementById('ngOptSection')?.classList.contains('open')) {
    document.getElementById('ngOptHub').textContent = getSelectedHub('ng');
    const sel = document.getElementById('ngOptExpiry');
    if (sel) { sel.innerHTML = ''; initOptExpiry('ng'); }
    renderOptionsChain('ng');
  }

  // Refresh map if visible
  if (MAP_STATE.ng) renderPipelineMap('ng');
}

function toggleHub(name) {
  STATE.visibleHubs[name] = !STATE.visibleHubs[name];
  renderCurrentPage();
}

/* =====================================================================
   RENDER FUNCTIONS — CRUDE OIL
   ===================================================================== */
function renderCrudePage() {
  // Toggle bar
  const toggleBar = document.getElementById('crudeToggles');
  if (!toggleBar) return;
  toggleBar.innerHTML = CRUDE_HUBS.map(h =>
    `<button class="hub-toggle ${STATE.visibleHubs[h.name]?'on':''}" onclick="toggleHub('${h.name}')" style="${STATE.visibleHubs[h.name]?'background:'+h.color+';color:#000;border-color:'+h.color:''}">${h.name}</button>`
  ).join('');

  // Bench grid
  const grid = document.getElementById('crudeBenchGrid');
  grid.innerHTML = CRUDE_HUBS.filter(h => STATE.visibleHubs[h.name]).map(h => {
    const p = getPrice(h.name), c = getPriceChange(h.name), cp = getPriceChangePct(h.name);
    const sel = STATE.selectedHubs.crude === h.name ? 'selected' : '';
    return `<div class="bench-card ${sel}" onclick="setSelectedHub('crude','${h.name}')">
      <div class="hub-name" style="color:${h.color}">${h.name}</div>
      <div class="hub-price">$${p.toFixed(2)}</div>
      <div class="hub-change ${c>=0?'up':'down'}">${c>=0?'+':''}${c.toFixed(2)} (${cp>=0?'+':''}${cp.toFixed(2)}%)</div>
      <div class="sparkline">${sparklineSVG(priceHistory[h.name], h.color, 150, 24)}</div>
    </div>`;
  }).join('');

  // Chart
  const selHub = STATE.selectedHubs.crude;
  document.getElementById('crudeChartTitle').textContent = selHub;
  try { drawChart('crudeChart', selHub, STATE.chartRanges.crude);
  initChartCrosshair('crudeChart'); } catch(e) { console.error('Crude chart error:', e); }

  // Differentials table vs WTI Cushing
  const wti = getPrice('WTI Cushing');
  const diffTbody = document.querySelector('#crudeDiffTable tbody');
  diffTbody.innerHTML = CRUDE_HUBS.map(h => {
    const p = getPrice(h.name), diff = p - wti, c = getPriceChange(h.name);
    const hist30 = (priceHistory[h.name]||[]).slice(-30);
    const wtiHist30 = (priceHistory['WTI Cushing']||[]).slice(-30);
    const avg30 = hist30.reduce((s,v,i) => s + (v - (wtiHist30[i]||wti)), 0) / hist30.length;
    return `<tr>
      <td style="color:${h.color};font-weight:600">${h.name}</td>
      <td class="mono">$${p.toFixed(2)}</td>
      <td class="mono ${diff>=0?'green':'red'}">${diff>=0?'+':''}${diff.toFixed(2)}</td>
      <td class="mono ${c>=0?'green':'red'}">${c>=0?'+':''}${c.toFixed(2)}</td>
      <td class="mono">${avg30>=0?'+':''}${avg30.toFixed(2)}</td>
    </tr>`;
  }).join('');

  // Forward curve
  document.getElementById('crudeFwdTitle').textContent = selHub;
  const fwd = STATE.forwardCurves[selHub] || [];
  const fwdTbody = document.querySelector('#crudeFwdTable tbody');
  const now = new Date();
  fwdTbody.innerHTML = fwd.map((pt, i) => {
    const mDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const mLabel = mDate.toLocaleDateString('en-US', { month:'short', year:'numeric' });
    const prevPrice = i > 0 ? fwd[i-1].price : getPrice(selHub);
    const change = pt.price - prevPrice;
    return `<tr>
      <td>${mLabel}</td>
      <td class="mono">$${pt.price.toFixed(2)}</td>
      <td class="mono ${change>=0?'green':'red'}">${change>=0?'+':''}${change.toFixed(2)}</td>
      <td class="mono">${pt.oi.toLocaleString()}</td>
    </tr>`;
  }).join('');

  // News
  renderNews('crude', 'crudeNews');

  // Calendar
  renderCalendar('crudeCalendar', 'crude');

  // Options chain (refresh if open)
  if (document.getElementById('crudeOptSection')?.classList.contains('open')) {
    document.getElementById('crudeOptHub').textContent = getSelectedHub('crude');
    const sel = document.getElementById('crudeOptExpiry');
    if (sel) { sel.innerHTML = ''; initOptExpiry('crude'); }
    renderOptionsChain('crude');
  }

  // Refresh map if visible
  if (MAP_STATE.crude) renderPipelineMap('crude');
}

/* =====================================================================
   RENDER FUNCTIONS — POWER
   ===================================================================== */
function renderPowerPage() {
  // Toggle bar
  const toggleBar = document.getElementById('powerToggles');
  if (!toggleBar) return;
  toggleBar.innerHTML = POWER_HUBS.map(h =>
    `<button class="hub-toggle ${STATE.visibleHubs[h.name]?'on':''}" onclick="toggleHub('${h.name}')" style="${STATE.visibleHubs[h.name]?'background:'+h.color+';color:#000;border-color:'+h.color:''}">${h.name}</button>`
  ).join('');

  // Bench grid
  const grid = document.getElementById('powerBenchGrid');
  grid.innerHTML = POWER_HUBS.filter(h => STATE.visibleHubs[h.name]).map(h => {
    const p = getPrice(h.name), c = getPriceChange(h.name), cp = getPriceChangePct(h.name);
    const sel = STATE.selectedHubs.power === h.name ? 'selected' : '';
    return `<div class="bench-card ${sel}" onclick="setSelectedHub('power','${h.name}')">
      <div class="hub-name" style="color:${h.color}">${h.name}</div>
      <div class="hub-price">$${p.toFixed(2)}</div>
      <div class="hub-change ${c>=0?'up':'down'}">${c>=0?'+':''}${c.toFixed(2)} (${cp>=0?'+':''}${cp.toFixed(2)}%)</div>
      <div class="sparkline">${sparklineSVG(priceHistory[h.name], h.color, 150, 24)}</div>
    </div>`;
  }).join('');

  // Chart
  const selHub = STATE.selectedHubs.power;
  document.getElementById('powerChartTitle').textContent = selHub;
  try { drawChart('powerChart', selHub, STATE.chartRanges.power);
  initChartCrosshair('powerChart'); } catch(e) { console.error('Power chart error:', e); }

  // Spark Spread table
  const HEAT_RATE = 7.0;
  const sparkTbody = document.querySelector('#powerSparkTable tbody');
  sparkTbody.innerHTML = POWER_HUBS.map(h => {
    const powerPrice = getPrice(h.name);
    const gasPrice = getPrice(h.gasRef);
    const gasCostMwh = gasPrice * HEAT_RATE;
    const spark = powerPrice - gasCostMwh;
    return `<tr>
      <td style="color:${h.color};font-weight:600">${h.name}</td>
      <td class="mono">$${powerPrice.toFixed(2)}</td>
      <td style="color:var(--text-dim);font-size:12px">${h.gasRef}</td>
      <td class="mono">$${gasPrice.toFixed(3)}</td>
      <td class="mono">$${gasCostMwh.toFixed(2)}</td>
      <td class="mono ${spark>=0?'green':'red'}" style="font-weight:700">${spark>=0?'+':''}$${spark.toFixed(2)}</td>
    </tr>`;
  }).join('');

  // Forward curve
  document.getElementById('powerFwdTitle').textContent = selHub;
  const fwd = STATE.forwardCurves[selHub] || [];
  const fwdTbody = document.querySelector('#powerFwdTable tbody');
  const now = new Date();
  fwdTbody.innerHTML = fwd.map((pt, i) => {
    const mDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const mLabel = mDate.toLocaleDateString('en-US', { month:'short', year:'numeric' });
    const prevPrice = i > 0 ? fwd[i-1].price : getPrice(selHub);
    const change = pt.price - prevPrice;
    return `<tr>
      <td>${mLabel}</td>
      <td class="mono">$${pt.price.toFixed(2)}</td>
      <td class="mono ${change>=0?'green':'red'}">${change>=0?'+':''}${change.toFixed(2)}</td>
      <td class="mono">${pt.oi.toLocaleString()}</td>
    </tr>`;
  }).join('');

  // News
  renderNews('power', 'powerNews');

  // Calendar
  renderCalendar('powerCalendar', 'power');
}

/* =====================================================================
   RENDER FUNCTIONS — FREIGHT
   ===================================================================== */
function renderFreightPage() {
  const toggleBar = document.getElementById('freightToggles');
  if (!toggleBar) return;
  toggleBar.innerHTML = FREIGHT_HUBS.map(h =>
    `<button class="hub-toggle ${STATE.visibleHubs[h.name]?'on':''}" onclick="toggleHub('${h.name}')" style="${STATE.visibleHubs[h.name]?'background:'+h.color+';color:#000;border-color:'+h.color:''}">${h.name}</button>`
  ).join('');

  const grid = document.getElementById('freightBenchGrid');
  grid.innerHTML = FREIGHT_HUBS.filter(h => STATE.visibleHubs[h.name]).map(h => {
    const p = getPrice(h.name), c = getPriceChange(h.name), cp = getPriceChangePct(h.name);
    const sel = STATE.selectedHubs.freight === h.name ? 'selected' : '';
    const isIdx = h.base > 100;
    return `<div class="bench-card ${sel}" onclick="setSelectedHub('freight','${h.name}')">
      <div class="hub-name" style="color:${h.color}">${h.name}</div>
      <div class="hub-price">${isIdx ? p.toFixed(0) : '$'+p.toFixed(2)}</div>
      <div class="hub-change ${c>=0?'up':'down'}">${c>=0?'+':''}${isIdx?c.toFixed(0):c.toFixed(2)} (${cp>=0?'+':''}${cp.toFixed(2)}%)</div>
      <div class="sparkline">${sparklineSVG(priceHistory[h.name], h.color, 150, 24)}</div>
    </div>`;
  }).join('');

  const selHub = STATE.selectedHubs.freight;
  document.getElementById('freightChartTitle').textContent = selHub;
  try { drawChart('freightChart', selHub, STATE.chartRanges.freight);
  initChartCrosshair('freightChart'); } catch(e) { console.error('Freight chart error:', e); }

  // Differentials table vs BDI
  const bdi = getPrice('Baltic Dry Index');
  const diffTbody = document.querySelector('#freightDiffTable tbody');
  diffTbody.innerHTML = FREIGHT_HUBS.map(h => {
    const p = getPrice(h.name), c = getPriceChange(h.name);
    const isIdx = h.base > 100;
    const diff = isIdx ? p - bdi : p; // tanker rates aren't comparable to BDI directly
    const diffLabel = h.name === 'Baltic Dry Index' ? '—' : (isIdx ? (diff>=0?'+':'')+diff.toFixed(0) : '$'+p.toFixed(2));
    const hist30 = (priceHistory[h.name]||[0]).slice(-30);
    const avg = hist30.length ? hist30.reduce((s,v)=>s+v,0)/hist30.length : 0;
    return `<tr>
      <td style="color:${h.color};font-weight:600">${h.name}</td>
      <td class="mono">${isIdx ? p.toFixed(0) : '$'+p.toFixed(2)}</td>
      <td class="mono">${diffLabel}</td>
      <td class="mono ${c>=0?'green':'red'}">${c>=0?'+':''}${isIdx?c.toFixed(0):c.toFixed(2)}</td>
      <td class="mono">${isIdx ? avg.toFixed(0) : '$'+avg.toFixed(2)}</td>
    </tr>`;
  }).join('');

  // Forward curve
  document.getElementById('freightFwdTitle').textContent = selHub;
  const fwd = STATE.forwardCurves[selHub] || [];
  const fwdTbody = document.querySelector('#freightFwdTable tbody');
  const now = new Date();
  const isIdx = findHub(selHub) && findHub(selHub).base > 100;
  fwdTbody.innerHTML = fwd.map((pt, i) => {
    const mDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const mLabel = mDate.toLocaleDateString('en-US', { month:'short', year:'numeric' });
    const prevPrice = i > 0 ? fwd[i-1].price : getPrice(selHub);
    const change = pt.price - prevPrice;
    return `<tr>
      <td>${mLabel}</td>
      <td class="mono">${isIdx ? pt.price.toFixed(0) : '$'+pt.price.toFixed(2)}</td>
      <td class="mono ${change>=0?'green':'red'}">${change>=0?'+':''}${isIdx?change.toFixed(0):change.toFixed(2)}</td>
      <td class="mono">${pt.oi.toLocaleString()}</td>
    </tr>`;
  }).join('');

  renderNews('freight', 'freightNews');
  renderCalendar('freightCalendar', 'freight');
}

/* =====================================================================
   RENDER FUNCTIONS — AGRICULTURE
   ===================================================================== */
function formatAgPrice(hub, price) {
  if(hub.base >= 100) return price.toFixed(2);
  if(hub.base >= 1) return '$' + price.toFixed(2);
  return '$' + price.toFixed(3);
}

function renderAgPage() {
  const toggleBar = document.getElementById('agToggles');
  if (!toggleBar) return;
  toggleBar.innerHTML = AG_HUBS.map(h =>
    `<button class="hub-toggle ${STATE.visibleHubs[h.name]?'on':''}" onclick="toggleHub('${h.name}')" style="${STATE.visibleHubs[h.name]?'background:'+h.color+';color:#000;border-color:'+h.color:''}">${h.name.replace(/ \(.*\)/,'')}</button>`
  ).join('');

  const grid = document.getElementById('agBenchGrid');
  grid.innerHTML = AG_HUBS.filter(h => STATE.visibleHubs[h.name]).map(h => {
    const p = getPrice(h.name), c = getPriceChange(h.name), cp = getPriceChangePct(h.name);
    const sel = STATE.selectedHubs.ag === h.name ? 'selected' : '';
    return `<div class="bench-card ${sel}" onclick="setSelectedHub('ag','${h.name}')">
      <div class="hub-name" style="color:${h.color}">${h.name.replace(/ \(.*\)/,'')}</div>
      <div class="hub-price">${formatAgPrice(h, p)}</div>
      <div class="hub-change ${c>=0?'up':'down'}">${c>=0?'+':''}${c.toFixed(3)} (${cp>=0?'+':''}${cp.toFixed(2)}%)</div>
      <div class="sparkline">${sparklineSVG(priceHistory[h.name], h.color, 150, 24)}</div>
    </div>`;
  }).join('');

  const selHub = STATE.selectedHubs.ag;
  document.getElementById('agChartTitle').textContent = selHub;
  document.getElementById('agDiffTitle').textContent = selHub;
  try { drawChart('agChart', selHub, STATE.chartRanges.ag);
  initChartCrosshair('agChart'); } catch(e) {}

  const diffTbody = document.querySelector('#agDiffTable tbody');
  diffTbody.innerHTML = AG_HUBS.map(h => {
    const p = getPrice(h.name), c = getPriceChange(h.name), cp = getPriceChangePct(h.name);
    const hist30 = (priceHistory[h.name]||[0]).slice(-30);
    const avg = hist30.length ? hist30.reduce((s,v)=>s+v,0)/hist30.length : 0;
    return `<tr>
      <td style="color:${h.color};font-weight:600">${h.name}</td>
      <td class="mono">${formatAgPrice(h, p)}</td>
      <td class="mono ${c>=0?'green':'red'}">${c>=0?'+':''}${c.toFixed(3)}</td>
      <td class="mono ${cp>=0?'green':'red'}">${cp>=0?'+':''}${cp.toFixed(2)}%</td>
      <td class="mono">${formatAgPrice(h, avg)}</td>
    </tr>`;
  }).join('');

  document.getElementById('agFwdTitle').textContent = selHub;
  const fwd = STATE.forwardCurves[selHub] || [];
  const fwdTbody = document.querySelector('#agFwdTable tbody');
  const now = new Date();
  const selHubData = AG_HUBS.find(h=>h.name===selHub);
  fwdTbody.innerHTML = fwd.map((pt, i) => {
    const mDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const mLabel = mDate.toLocaleDateString('en-US', { month:'short', year:'numeric' });
    const prevPrice = i > 0 ? fwd[i-1].price : getPrice(selHub);
    const change = pt.price - prevPrice;
    return `<tr>
      <td>${mLabel}</td>
      <td class="mono">${selHubData ? formatAgPrice(selHubData, pt.price) : pt.price.toFixed(3)}</td>
      <td class="mono ${change>=0?'green':'red'}">${change>=0?'+':''}${change.toFixed(3)}</td>
      <td class="mono">${pt.oi.toLocaleString()}</td>
    </tr>`;
  }).join('');

  renderNews('ag', 'agNews');
  renderCalendar('agCalendar', 'ag');
}

/* =====================================================================
   RENDER FUNCTIONS — METALS
   ===================================================================== */
function formatMetalPrice(hub, price) {
  if(hub.base >= 1000) return '$' + price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  if(hub.base >= 10) return '$' + price.toFixed(2);
  return '$' + price.toFixed(4);
}

function renderMetalsPage() {
  const toggleBar = document.getElementById('metalsToggles');
  if (!toggleBar) return;
  toggleBar.innerHTML = METALS_HUBS.map(h =>
    `<button class="hub-toggle ${STATE.visibleHubs[h.name]?'on':''}" onclick="toggleHub('${h.name}')" style="${STATE.visibleHubs[h.name]?'background:'+h.color+';color:#000;border-color:'+h.color:''}">${h.name.replace(/ \(.*\)/,'')}</button>`
  ).join('');

  const grid = document.getElementById('metalsBenchGrid');
  grid.innerHTML = METALS_HUBS.filter(h => STATE.visibleHubs[h.name]).map(h => {
    const p = getPrice(h.name), c = getPriceChange(h.name), cp = getPriceChangePct(h.name);
    const sel = STATE.selectedHubs.metals === h.name ? 'selected' : '';
    return `<div class="bench-card ${sel}" onclick="setSelectedHub('metals','${h.name}')">
      <div class="hub-name" style="color:${h.color}">${h.name.replace(/ \(.*\)/,'')}</div>
      <div class="hub-price">${formatMetalPrice(h, p)}</div>
      <div class="hub-change ${c>=0?'up':'down'}">${c>=0?'+':''}${c.toFixed(2)} (${cp>=0?'+':''}${cp.toFixed(2)}%)</div>
      <div class="sparkline">${sparklineSVG(priceHistory[h.name], h.color, 150, 24)}</div>
    </div>`;
  }).join('');

  const selHub = STATE.selectedHubs.metals;
  document.getElementById('metalsChartTitle').textContent = selHub;
  document.getElementById('metalsDiffTitle').textContent = selHub;
  try { drawChart('metalsChart', selHub, STATE.chartRanges.metals);
  initChartCrosshair('metalsChart'); } catch(e) {}

  const diffTbody = document.querySelector('#metalsDiffTable tbody');
  diffTbody.innerHTML = METALS_HUBS.map(h => {
    const p = getPrice(h.name), c = getPriceChange(h.name), cp = getPriceChangePct(h.name);
    const hist30 = (priceHistory[h.name]||[0]).slice(-30);
    const avg = hist30.length ? hist30.reduce((s,v)=>s+v,0)/hist30.length : 0;
    return `<tr>
      <td style="color:${h.color};font-weight:600">${h.name}</td>
      <td class="mono">${formatMetalPrice(h, p)}</td>
      <td class="mono ${c>=0?'green':'red'}">${c>=0?'+':''}${c.toFixed(2)}</td>
      <td class="mono ${cp>=0?'green':'red'}">${cp>=0?'+':''}${cp.toFixed(2)}%</td>
      <td class="mono">${formatMetalPrice(h, avg)}</td>
    </tr>`;
  }).join('');

  document.getElementById('metalsFwdTitle').textContent = selHub;
  const fwd = STATE.forwardCurves[selHub] || [];
  const fwdTbody = document.querySelector('#metalsFwdTable tbody');
  const now = new Date();
  const selHubData = METALS_HUBS.find(h=>h.name===selHub);
  fwdTbody.innerHTML = fwd.map((pt, i) => {
    const mDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const mLabel = mDate.toLocaleDateString('en-US', { month:'short', year:'numeric' });
    const prevPrice = i > 0 ? fwd[i-1].price : getPrice(selHub);
    const change = pt.price - prevPrice;
    return `<tr>
      <td>${mLabel}</td>
      <td class="mono">${selHubData ? formatMetalPrice(selHubData, pt.price) : '$'+pt.price.toFixed(2)}</td>
      <td class="mono ${change>=0?'green':'red'}">${change>=0?'+':''}${change.toFixed(2)}</td>
      <td class="mono">${pt.oi.toLocaleString()}</td>
    </tr>`;
  }).join('');

  renderNews('metals', 'metalsNews');
  renderCalendar('metalsCalendar', 'metals');
}

/* =====================================================================
   RENDER FUNCTIONS — NGLs (Mont Belvieu)
   ===================================================================== */
function renderNGLsPage() {
  const toggleBar = document.getElementById('nglsToggles');
  if (!toggleBar) return;
  toggleBar.innerHTML = NGL_HUBS.map(h =>
    `<button class="hub-toggle ${STATE.visibleHubs[h.name]?'on':''}" onclick="toggleHub('${h.name}')" style="${STATE.visibleHubs[h.name]?'background:'+h.color+';color:#fff;border-color:'+h.color:''}">${h.name.replace(/ \(.*\)/,'')}</button>`
  ).join('');

  // Bench grid — ¢/gal primary, $/bbl secondary
  const grid = document.getElementById('nglsBenchGrid');
  grid.innerHTML = NGL_HUBS.filter(h => STATE.visibleHubs[h.name]).map(h => {
    const p = getPrice(h.name), c = getPriceChange(h.name), cp = getPriceChangePct(h.name);
    const sel = STATE.selectedHubs.ngls === h.name ? 'selected' : '';
    const bblPrice = (p * 42 / 100).toFixed(2);
    return `<div class="bench-card ${sel}" onclick="setSelectedHub('ngls','${h.name}')">
      <div class="hub-name" style="color:${h.color}">${h.name.replace(/ \(.*\)/,'')}</div>
      <div class="hub-price">${p.toFixed(1)}¢<span style="font-size:11px;color:var(--text-muted)">/gal</span></div>
      <div style="font-size:11px;color:var(--text-dim)">$${bblPrice}/bbl</div>
      <div class="hub-change ${c>=0?'up':'down'}">${c>=0?'+':''}${c.toFixed(2)}¢ (${cp>=0?'+':''}${cp.toFixed(2)}%)</div>
      <div class="sparkline">${sparklineSVG(priceHistory[h.name], h.color, 150, 24)}</div>
    </div>`;
  }).join('');

  // Frac Spread Calculator
  const henry = getPrice('Henry Hub');
  let totalRevenue = 0;
  const fracGridEl = document.getElementById('fracSpreadGrid');
  if (fracGridEl) {
    fracGridEl.innerHTML = NGL_HUBS.map(h => {
      const p = getPrice(h.name);
      const revPerMcf = (p / 100) * h.yieldPerMcf; // Convert ¢/gal to $/gal, then × yield
      totalRevenue += revPerMcf;
      return `<div style="text-align:center;padding:8px;background:var(--surface2);border-radius:6px;border-left:3px solid ${h.color}">
        <div style="font-size:11px;color:var(--text-muted)">${h.name.replace(/ \(.*\)/,'')}</div>
        <div style="font-size:14px;font-weight:600;color:${h.color}">${p.toFixed(1)}¢</div>
        <div style="font-size:10px;color:var(--text-dim)">${h.yieldPerMcf} gal/Mcf → $${revPerMcf.toFixed(3)}</div>
      </div>`;
    }).join('');
  }
  const gasCost = henry; // $/MMBtu ≈ $/Mcf
  const fracMargin = totalRevenue - gasCost;
  const fracPct = totalRevenue > 0 ? ((fracMargin / totalRevenue) * 100).toFixed(1) : '0';
  const fracColor = fracMargin > 0 ? 'var(--green)' : 'var(--red)';
  const revEl = document.getElementById('fracRevenue');
  const costEl = document.getElementById('fracGasCost');
  const marginEl = document.getElementById('fracMargin');
  const marginPctEl = document.getElementById('fracMarginPct');
  if (revEl) revEl.textContent = '$' + totalRevenue.toFixed(3);
  if (costEl) costEl.textContent = '$' + gasCost.toFixed(3);
  if (marginEl) { marginEl.textContent = (fracMargin >= 0 ? '+' : '') + '$' + fracMargin.toFixed(3); marginEl.style.color = fracColor; }
  if (marginPctEl) marginPctEl.textContent = fracPct + '%';

  // Product table
  const prodTbody = document.querySelector('#nglsProductTable tbody');
  if (prodTbody) {
    prodTbody.innerHTML = NGL_HUBS.map(h => {
      const p = getPrice(h.name), c = getPriceChange(h.name), cp = getPriceChangePct(h.name);
      const bblPrice = (p * 42 / 100).toFixed(2);
      const revPerMcf = (p / 100) * h.yieldPerMcf;
      return `<tr>
        <td style="color:${h.color};font-weight:600">${h.name}</td>
        <td class="mono">${p.toFixed(2)}</td>
        <td class="mono">$${bblPrice}</td>
        <td class="mono ${c>=0?'green':'red'}">${c>=0?'+':''}${c.toFixed(2)}</td>
        <td class="mono ${cp>=0?'green':'red'}">${cp>=0?'+':''}${cp.toFixed(2)}%</td>
        <td class="mono">${h.yieldPerMcf}</td>
        <td class="mono" style="color:var(--green)">$${revPerMcf.toFixed(3)}</td>
      </tr>`;
    }).join('');
  }

  // Chart
  const selHub = STATE.selectedHubs.ngls;
  const titleEl = document.getElementById('nglsChartTitle');
  if (titleEl) titleEl.textContent = selHub;
  try { drawChart('nglsChart', selHub, STATE.chartRanges.ngls || 30);
  initChartCrosshair('nglsChart'); } catch(e) {}

  // Forward curve
  const fwdTitle = document.getElementById('nglsFwdTitle');
  if (fwdTitle) fwdTitle.textContent = selHub;
  const fwd = STATE.forwardCurves[selHub] || [];
  const fwdTbody = document.querySelector('#nglsFwdTable tbody');
  if (fwdTbody) {
    const now = new Date();
    fwdTbody.innerHTML = fwd.map((pt, i) => {
      const mDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      const mLabel = mDate.toLocaleDateString('en-US', { month:'short', year:'numeric' });
      const prevPrice = i > 0 ? fwd[i-1].price : getPrice(selHub);
      const change = pt.price - prevPrice;
      const bblPrice = (pt.price * 42 / 100).toFixed(2);
      return `<tr>
        <td>${mLabel}</td>
        <td class="mono">${pt.price.toFixed(2)}</td>
        <td class="mono">$${bblPrice}</td>
        <td class="mono ${change>=0?'green':'red'}">${change>=0?'+':''}${change.toFixed(2)}</td>
        <td class="mono">${pt.oi.toLocaleString()}</td>
      </tr>`;
    }).join('');
  }

  renderNews('ngls', 'nglsNews');
  renderCalendar('nglsCalendar', 'ngls');
}

/* =====================================================================
   RENDER FUNCTIONS — LNG
   ===================================================================== */
function renderLNGPage() {
  const toggleBar = document.getElementById('lngToggles');
  if (!toggleBar) return;
  toggleBar.innerHTML = LNG_HUBS.map(h =>
    `<button class="hub-toggle ${STATE.visibleHubs[h.name]?'on':''}" onclick="toggleHub('${h.name}')" style="${STATE.visibleHubs[h.name]?'background:'+h.color+';color:#fff;border-color:'+h.color:''}">${h.name.replace(/ \(.*\)/,'')}</button>`
  ).join('');

  // Bench grid
  const grid = document.getElementById('lngBenchGrid');
  grid.innerHTML = LNG_HUBS.filter(h => STATE.visibleHubs[h.name]).map(h => {
    const p = getPrice(h.name), c = getPriceChange(h.name), cp = getPriceChangePct(h.name);
    const sel = STATE.selectedHubs.lng === h.name ? 'selected' : '';
    const regionFlag = h.region === 'Asia' ? '🇯🇵' : h.region === 'Europe' ? '🇪🇺' : h.region === 'US Export' ? '🇺🇸' : h.region === 'LatAm' ? '🌎' : '🌐';
    return `<div class="bench-card ${sel}" onclick="setSelectedHub('lng','${h.name}')">
      <div class="hub-name" style="color:${h.color}">${regionFlag} ${h.name.replace(/ \(.*\)/,'')}</div>
      <div class="hub-price">$${p.toFixed(2)}<span style="font-size:11px;color:var(--text-muted)">/MMBtu</span></div>
      <div class="hub-change ${c>=0?'up':'down'}">${c>=0?'+':''}${c.toFixed(3)} (${cp>=0?'+':''}${cp.toFixed(2)}%)</div>
      <div class="sparkline">${sparklineSVG(priceHistory[h.name], h.color, 150, 24)}</div>
    </div>`;
  }).join('');

  // Arbitrage Calculator
  const hh = getPrice('Henry Hub');
  const jkm = getPrice('JKM (Platts)');
  const ttf = getPrice('TTF (ICE)');
  const des = getPrice('DES South America');
  const fob = hh + LNG_SHIPPING.liquefactionFee;
  const arbAsia = jkm - fob - LNG_SHIPPING.usGulfToAsia - LNG_SHIPPING.regas;
  const arbEur = ttf - fob - LNG_SHIPPING.usGulfToEurope - LNG_SHIPPING.regas;
  const arbLatAm = des - fob - LNG_SHIPPING.usGulfToLatAm - LNG_SHIPPING.regas;

  const setArb = (id, val, labelId) => {
    const el = document.getElementById(id);
    const lbl = document.getElementById(labelId);
    if (el) { el.textContent = (val >= 0 ? '+' : '') + '$' + val.toFixed(2); el.style.color = val > 0 ? 'var(--green)' : val < -0.5 ? 'var(--red)' : 'var(--amber)'; }
    if (lbl) lbl.style.color = val > 0 ? 'var(--green)' : val < -0.5 ? 'var(--red)' : 'var(--amber)';
  };
  const hhEl = document.getElementById('lngArbHH');
  if (hhEl) hhEl.textContent = '$' + hh.toFixed(2);
  const fobEl = document.getElementById('lngArbFOB');
  if (fobEl) fobEl.textContent = '$' + fob.toFixed(2);
  setArb('lngArbAsia', arbAsia, 'lngArbAsiaLabel');
  setArb('lngArbEurope', arbEur, 'lngArbEuropeLabel');
  setArb('lngArbLatAm', arbLatAm, 'lngArbLatAmLabel');

  // Cargo Economics (standard ~3.4M MMBtu cargo)
  const cargoMMBtu = 3400000;
  const cargoGrid = document.getElementById('cargoEconGrid');
  if (cargoGrid) {
    const cargoData = [
      { label:'Feed Gas Cost', val: hh * cargoMMBtu, color:'#22d3ee', sub:'HH × 3.4M MMBtu' },
      { label:'Liquefaction', val: LNG_SHIPPING.liquefactionFee * cargoMMBtu, color:'var(--text-dim)', sub:'$2.50/MMBtu tolling' },
      { label:'FOB Cargo Value', val: fob * cargoMMBtu, color:'var(--amber)', sub:'Feed + liquefaction' },
      { label:'Asia DES Value', val: jkm * cargoMMBtu, color:'#ef4444', sub:'JKM × 3.4M' },
      { label:'Asia Net Margin', val: arbAsia * cargoMMBtu, color: arbAsia > 0 ? 'var(--green)' : 'var(--red)', sub:'Per cargo P&L' },
      { label:'Europe Net Margin', val: arbEur * cargoMMBtu, color: arbEur > 0 ? 'var(--green)' : 'var(--red)', sub:'Per cargo P&L' },
    ];
    cargoGrid.innerHTML = cargoData.map(d => `<div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px">
      <div style="font-size:10px;color:var(--text-muted)">${d.label}</div>
      <div style="font-size:16px;font-weight:700;color:${d.color}">${d.val >= 0 ? '' : '-'}$${Math.abs(d.val/1000000).toFixed(2)}M</div>
      <div style="font-size:9px;color:var(--text-muted)">${d.sub}</div>
    </div>`).join('');
  }

  // Chart
  const selHub = STATE.selectedHubs.lng;
  const titleEl = document.getElementById('lngChartTitle');
  if (titleEl) titleEl.textContent = selHub;
  try { drawChart('lngChart', selHub, STATE.chartRanges.lng || 30);
  initChartCrosshair('lngChart'); } catch(e) {}

  // Spread table vs JKM
  const spreadTbody = document.querySelector('#lngSpreadTable tbody');
  if (spreadTbody) {
    spreadTbody.innerHTML = LNG_HUBS.map(h => {
      const p = getPrice(h.name), spread = p - jkm, c = getPriceChange(h.name);
      const hist30 = (priceHistory[h.name]||[]).slice(-30);
      const jkmHist30 = (priceHistory['JKM (Platts)']||[]).slice(-30);
      const avg30 = hist30.reduce((s,v,i) => s + (v - (jkmHist30[i]||jkm)), 0) / hist30.length;
      return `<tr>
        <td style="color:${h.color};font-weight:600">${h.name}</td>
        <td style="font-size:11px;color:var(--text-dim)">${h.region}</td>
        <td class="mono">$${p.toFixed(3)}</td>
        <td class="mono ${spread>=0?'green':'red'}">${spread>=0?'+':''}${spread.toFixed(3)}</td>
        <td class="mono ${c>=0?'green':'red'}">${c>=0?'+':''}${c.toFixed(3)}</td>
        <td class="mono">${avg30>=0?'+':''}${avg30.toFixed(3)}</td>
      </tr>`;
    }).join('');
  }

  // Forward curve
  const fwdTitle = document.getElementById('lngFwdTitle');
  if (fwdTitle) fwdTitle.textContent = selHub;
  const fwd = STATE.forwardCurves[selHub] || [];
  const fwdTbody = document.querySelector('#lngFwdTable tbody');
  if (fwdTbody) {
    const now = new Date();
    fwdTbody.innerHTML = fwd.map((pt, i) => {
      const mDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      const mLabel = mDate.toLocaleDateString('en-US', { month:'short', year:'numeric' });
      const prevPrice = i > 0 ? fwd[i-1].price : getPrice(selHub);
      const change = pt.price - prevPrice;
      return `<tr>
        <td>${mLabel}</td>
        <td class="mono">$${pt.price.toFixed(3)}</td>
        <td class="mono ${change>=0?'green':'red'}">${change>=0?'+':''}${change.toFixed(3)}</td>
        <td class="mono">${pt.oi.toLocaleString()}</td>
      </tr>`;
    }).join('');
  }

  renderNews('lng', 'lngNews');
  renderCalendar('lngCalendar', 'lng');
}

/* =====================================================================
   RENDER FUNCTIONS — TRADE BLOTTER
   ===================================================================== */
let tradeDirection = '';
let blotterPage = 0;
const BLOTTER_PAGE_SIZE = 10;

function renderBlotterPage() {
  updateAccountBar();
  populateHubDropdown();
  updateMarginPreview();
  renderBlotterTable();
  renderNetPositions();
  drawPnlChart();
  try { initPnlCrosshair(); } catch(e) {}

  // Pre-fill entry price if clicked from chart
  if (STATE.clickedPrice !== null) {
    document.getElementById('tradeEntry').value = STATE.clickedPrice;
    document.getElementById('tradeFormHint').textContent = 'Entry price captured from chart: ' + STATE.clickedPrice;
    STATE.clickedPrice = null;
  }

  // Update spot ref
  const hub = document.getElementById('tradeHub').value;
  if (hub) document.getElementById('tradeSpot').value = getPrice(hub).toFixed(4);
}

function updateAccountBar() {
  const balance = STATE.settings.balance || 1000000;
  let realized = 0, unrealized = 0, wins = 0, losses = 0, openCount = 0;

  STATE.trades.forEach(t => {
    if (t.status === 'CLOSED') {
      const pnl = parseFloat(t.realizedPnl || 0);
      realized += pnl;
      if (pnl > 0) wins++; else if (pnl < 0) losses++;
    } else if (t.status === 'OPEN') {
      openCount++;
      const spot = getPrice(t.hub);
      const dir = t.direction === 'BUY' ? 1 : -1;
      const vol = parseFloat(t.volume || 0);
      const entry = parseFloat(t.entryPrice || 0);
      unrealized += (spot - entry) * vol * dir;
    }
  });

  const pendingCount = STATE.pendingOrders.length;
  const equity = balance + realized + unrealized;
  const usedMargin = STATE.trades.filter(t=>t.status==='OPEN').reduce((s,t)=>s+calcMargin(t),0);
  const buyingPower = equity - usedMargin;
  const wr = (wins+losses) > 0 ? ((wins/(wins+losses))*100).toFixed(1)+'%' : '—';

  const fmt = v => '$' + Math.abs(v).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0});
  const sign = v => v >= 0 ? '' : '-';

  document.getElementById('acctBalance').textContent = fmt(equity);
  document.getElementById('acctBalance').style.color = '';

  const uel = document.getElementById('acctUnrealized');
  uel.textContent = sign(unrealized) + fmt(unrealized);
  uel.style.color = unrealized >= 0 ? 'var(--green)' : 'var(--red)';

  const rel = document.getElementById('acctRealized');
  rel.textContent = sign(realized) + fmt(realized);
  rel.style.color = realized >= 0 ? 'var(--green)' : 'var(--red)';

  document.getElementById('acctBuyingPower').textContent = fmt(buyingPower);
  document.getElementById('acctBuyingPower').style.color = buyingPower > 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('acctOpenPos').textContent = openCount + (pendingCount ? ` (+${pendingCount})` : '');
  document.getElementById('acctWinRate').textContent = wr;
}

function populateHubDropdown() {
  const sel = document.getElementById('tradeHub');
  const type = document.getElementById('tradeType').value;
  const sector = document.getElementById('tradeSector') ? document.getElementById('tradeSector').value : '';
  const curVal = sel.value;

  // Sector dropdown is primary, trade type is fallback
  const SECTOR_HUB_MAP = { ng: NG_HUBS, crude: CRUDE_HUBS, power: POWER_HUBS, freight: FREIGHT_HUBS, ag: AG_HUBS, metals: METALS_HUBS, ngls: NGL_HUBS, lng: LNG_HUBS };
  let hubs;
  if (sector && SECTOR_HUB_MAP[sector]) {
    hubs = SECTOR_HUB_MAP[sector];
  } else if (type.startsWith('CRUDE') || type === 'EFP' || type === 'OPTION_CL') hubs = CRUDE_HUBS;
  else if (type.startsWith('FREIGHT')) hubs = FREIGHT_HUBS;
  else if (type.startsWith('AG')) hubs = AG_HUBS;
  else if (type.startsWith('METALS')) hubs = METALS_HUBS;
  else if (type.startsWith('NGL')) hubs = NGL_HUBS;
  else if (type.startsWith('LNG')) hubs = LNG_HUBS;
  else hubs = NG_HUBS;

  sel.innerHTML = hubs.map(h => `<option value="${h.name}" ${h.name===curVal?'selected':''}>${h.name}</option>`).join('');

  // Also populate basis hub dropdown
  const basisSel = document.getElementById('tradeBasisHub');
  if (basisSel) basisSel.innerHTML = NG_HUBS.map(h => `<option value="${h.name}">${h.name}</option>`).join('');

  // Update spot reference
  const hub = sel.value;
  if (hub) document.getElementById('tradeSpot').value = getPrice(hub).toFixed(4);
}

const SECTOR_TRADE_TYPES = {
  ng: [
    { value:'PHYS_FIXED', label:'Physical Fixed' },
    { value:'PHYS_INDEX', label:'Physical Index' },
    { value:'BASIS_SWAP', label:'Basis Swap' },
    { value:'FIXED_FLOAT', label:'Fixed/Float Swap' },
    { value:'SPREAD', label:'Calendar Spread' },
    { value:'BALMO', label:'Balance of Month' },
    { value:'OPTION_NG', label:'NG Option' },
    { value:'TAS', label:'Trade at Settlement' },
    { value:'MULTILEG', label:'Multi-Leg' },
  ],
  crude: [
    { value:'CRUDE_PHYS', label:'Crude Physical' },
    { value:'CRUDE_SWAP', label:'Crude Swap' },
    { value:'CRUDE_DIFF', label:'Crude Differential' },
    { value:'OPTION_CL', label:'Crude Option' },
    { value:'EFP', label:'Exchange for Physical' },
    { value:'TAS', label:'Trade at Settlement' },
  ],
  power: [
    { value:'PHYS_FIXED', label:'Power Fixed Price' },
    { value:'PHYS_INDEX', label:'Power Index' },
    { value:'FIXED_FLOAT', label:'Heat Rate Swap' },
    { value:'SPREAD', label:'Calendar Spread' },
    { value:'BALMO', label:'Balance of Month' },
    { value:'TAS', label:'Trade at Settlement' },
  ],
  freight: [
    { value:'FREIGHT_FFA', label:'Freight FFA' },
    { value:'FREIGHT_PHYS', label:'Freight Physical' },
  ],
  ag: [
    { value:'AG_FUTURES', label:'Ag Futures' },
    { value:'AG_OPTION', label:'Ag Option' },
    { value:'AG_SPREAD', label:'Ag Calendar Spread' },
  ],
  metals: [
    { value:'METALS_FUTURES', label:'Metals Futures' },
    { value:'METALS_OPTION', label:'Metals Option' },
    { value:'METALS_SPREAD', label:'Metals Calendar Spread' },
  ],
  ngls: [
    { value:'NGL_PHYS', label:'NGL Physical' },
    { value:'NGL_SWAP', label:'NGL Swap' },
    { value:'NGL_SPREAD', label:'NGL Calendar Spread' },
    { value:'NGL_FRAC', label:'Frac Spread' },
  ],
  lng: [
    { value:'LNG_DES', label:'LNG DES Cargo' },
    { value:'LNG_FOB', label:'LNG FOB Cargo' },
    { value:'LNG_SWAP', label:'LNG Swap' },
    { value:'LNG_SPREAD', label:'LNG Calendar Spread' },
    { value:'LNG_BASIS', label:'LNG Basis (JKM-HH)' },
  ]
};

const SECTOR_VENUES = {
  ng: [
    { value:'NYMEX', label:'NYMEX' },
    { value:'ICE', label:'ICE' },
    { value:'CME', label:'CME Globex' },
    { value:'BGC', label:'BGC Partners' },
    { value:'Tradition', label:'Tradition' },
    { value:'GFI', label:'GFI Group' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  crude: [
    { value:'NYMEX', label:'NYMEX' },
    { value:'ICE', label:'ICE Futures' },
    { value:'CME', label:'CME Globex' },
    { value:'BGC', label:'BGC Partners' },
    { value:'Tradition', label:'Tradition' },
    { value:'GFI', label:'GFI Group' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  power: [
    { value:'ICE', label:'ICE' },
    { value:'CME', label:'CME Globex' },
    { value:'BGC', label:'BGC Partners' },
    { value:'Tradition', label:'Tradition' },
    { value:'GFI', label:'GFI Group' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  freight: [
    { value:'BALTIC', label:'Baltic Exchange' },
    { value:'ICE', label:'ICE Futures' },
    { value:'CME', label:'CME ClearPort' },
    { value:'Clarksons', label:'Clarksons' },
    { value:'SSY', label:'Simpson Spence Young' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  ag: [
    { value:'CBOT', label:'CBOT' },
    { value:'ICE', label:'ICE Futures US' },
    { value:'CME', label:'CME Globex' },
    { value:'MGEX', label:'MGEX' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  metals: [
    { value:'COMEX', label:'COMEX' },
    { value:'NYMEX', label:'NYMEX' },
    { value:'LME', label:'LME' },
    { value:'SGX', label:'SGX' },
    { value:'SHFE', label:'Shanghai Futures' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  ngls: [
    { value:'OPIS', label:'OPIS (Mont Belvieu)' },
    { value:'NYMEX', label:'NYMEX' },
    { value:'ICE', label:'ICE' },
    { value:'CME', label:'CME ClearPort' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  lng: [
    { value:'ICE', label:'ICE Futures' },
    { value:'CME', label:'CME/NYMEX' },
    { value:'SGX', label:'SGX' },
    { value:'TOCOM', label:'TOCOM' },
    { value:'OTC', label:'OTC Bilateral' },
  ]
};

function populateVenueDropdown(sector) {
  const sel = document.getElementById('tradeVenue');
  if (!sel) return;
  const venues = SECTOR_VENUES[sector] || [{ value:'OTC', label:'OTC Bilateral' }];
  const curVal = sel.value;
  sel.innerHTML = venues.map(v => `<option value="${v.value}" ${v.value===curVal?'selected':''}>${v.label}</option>`).join('');
}

function onTradeSectorChange() {
  const sector = document.getElementById('tradeSector').value;
  const typeSel = document.getElementById('tradeType');
  if (!sector) {
    typeSel.innerHTML = '<option value="">Select sector first...</option>';
    return;
  }
  const types = SECTOR_TRADE_TYPES[sector] || [];
  typeSel.innerHTML = '<option value="">Select type...</option>' +
    types.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
  // Auto-populate hub dropdown for this sector
  populateHubDropdown();
  // Auto-populate venue dropdown for this sector
  populateVenueDropdown(sector);
}

function onTradeTypeChange() {
  const type = document.getElementById('tradeType').value;
  populateHubDropdown();

  // Show/hide conditional fields
  const condDiv = document.getElementById('conditionalFields');
  condDiv.style.display = 'none';
  condDiv.querySelectorAll('.form-group').forEach(fg => fg.style.display = 'none');

  if (['SPREAD','CRUDE_DIFF'].includes(type)) {
    condDiv.style.display = 'block';
    condDiv.querySelectorAll('.cond-spread').forEach(fg => fg.style.display = 'flex');
    if (type === 'CRUDE_DIFF') condDiv.querySelectorAll('.cond-diff').forEach(fg => fg.style.display = 'flex');
  }
  if (['OPTION_NG','OPTION_CL'].includes(type)) {
    condDiv.style.display = 'block';
    condDiv.querySelectorAll('.cond-option').forEach(fg => fg.style.display = 'flex');
  }
  if (type === 'BASIS_SWAP') {
    condDiv.style.display = 'block';
    condDiv.querySelectorAll('.cond-basis').forEach(fg => fg.style.display = 'flex');
  }
  updateMarginPreview();
}

function setDirection(dir) {
  tradeDirection = dir;
  const buyBtn = document.getElementById('dirBuy');
  const sellBtn = document.getElementById('dirSell');
  const hint = document.getElementById('priceHint');
  if (dir === 'BUY') {
    buyBtn.style.background = 'var(--green)'; buyBtn.style.color = '#fff'; buyBtn.style.borderColor = 'var(--green)';
    sellBtn.style.background = 'var(--surface2)'; sellBtn.style.color = 'var(--text-dim)'; sellBtn.style.borderColor = 'var(--border)';
    if(hint) hint.textContent = '(at or above spot for BUY)';
  } else if (dir === 'SELL') {
    sellBtn.style.background = 'var(--red)'; sellBtn.style.color = '#fff'; sellBtn.style.borderColor = 'var(--red)';
    buyBtn.style.background = 'var(--surface2)'; buyBtn.style.color = 'var(--text-dim)'; buyBtn.style.borderColor = 'var(--border)';
    if(hint) hint.textContent = '(at or below spot for SELL)';
  } else {
    buyBtn.style.background = 'var(--surface2)'; buyBtn.style.color = 'var(--text-dim)'; buyBtn.style.borderColor = 'var(--border)';
    sellBtn.style.background = 'var(--surface2)'; sellBtn.style.color = 'var(--text-dim)'; sellBtn.style.borderColor = 'var(--border)';
    if(hint) hint.textContent = '';
  }
}

function calcMargin(t) {
  const vol = parseFloat(t.volume || 0);
  const type = t.type || '';
  const isCrude = type.startsWith('CRUDE') || type === 'EFP' || type === 'OPTION_CL';
  const isSpread = ['SPREAD', 'MULTILEG', 'CRUDE_DIFF'].includes(type);
  const spreadDiscount = isSpread ? 0.4 : 1.0; // 60% margin reduction for spreads
  let margin;
  if (isCrude) margin = (vol / 1000) * 5000;
  else if (type === 'BASIS_SWAP') margin = (vol / 10000) * 800;
  else if (type === 'OPTION_NG') margin = (vol / 10000) * 1500 * 0.5;
  else if (type === 'OPTION_CL') margin = (vol / 1000) * 5000 * 0.5;
  else if (type.startsWith('FREIGHT')) margin = (vol / 1000) * 2000;
  else if (type.startsWith('NGL')) margin = (vol / 1000) * 1200;
  else if (type.startsWith('LNG')) margin = (vol / 10000) * 8000;
  else margin = (vol / 10000) * 1500;
  return margin * spreadDiscount;
}

function updateMarginPreview() {
  const type = document.getElementById('tradeType').value;
  const vol = parseFloat(document.getElementById('tradeVolume').value || 0);
  const mockTrade = { type, volume: vol };
  const reqMargin = calcMargin(mockTrade);

  const balance = STATE.settings.balance || 1000000;
  let realized = 0;
  STATE.trades.forEach(t => { if (t.status === 'CLOSED') realized += parseFloat(t.realizedPnl || 0); });
  const usedMargin = STATE.trades.filter(t=>t.status==='OPEN').reduce((s,t)=>s+calcMargin(t),0);
  const equity = balance + realized;
  const available = equity - usedMargin;

  document.getElementById('marginRequired').textContent = '$' + reqMargin.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('marginAvailable').textContent = '$' + available.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('marginAvailable').style.color = available > reqMargin ? 'var(--green)' : 'var(--red)';
  const util = equity > 0 ? (((usedMargin + reqMargin) / equity) * 100).toFixed(1) : '0.0';
  document.getElementById('marginUtil').textContent = util + '%';
}

// Listen for volume/type changes to update margin
document.getElementById('tradeVolume').addEventListener('input', updateMarginPreview);
document.getElementById('tradeHub').addEventListener('change', function() {
  const price = getPrice(this.value);
  document.getElementById('tradeSpot').value = price.toFixed(4);
  document.getElementById('tradeEntry').value = price.toFixed(4);
});

async function submitTrade() {
  const type = document.getElementById('tradeType').value;
  const hub = document.getElementById('tradeHub').value;
  const volume = document.getElementById('tradeVolume').value;
  const orderType = document.getElementById('tradeOrderType').value;
  const tif = document.getElementById('tradeTIF').value;

  if (!type) return toast('Select a trade type', 'error');
  if (!tradeDirection) return toast('Select BUY or SELL', 'error');
  if (!hub) return toast('Select a hub', 'error');
  if (!volume || parseFloat(volume) <= 0) return toast('Enter a valid volume', 'error');

  // Get spot price and validate entry price
  const spotPrice = getPrice(hub);
  const isBasisType = type === 'BASIS_SWAP';
  if (!isBasisType && (!spotPrice || spotPrice <= 0)) return toast('No market price available', 'error');
  const enteredPrice = parseFloat(document.getElementById('tradeEntry').value);
  const currentPrice = (enteredPrice && (isBasisType || enteredPrice > 0)) ? enteredPrice : spotPrice;

  // Order type specific validation
  const limitPrice = parseFloat(document.getElementById('tradeLimitPrice').value) || 0;
  const stopPrice = parseFloat(document.getElementById('tradeStopPrice').value) || 0;

  if (orderType === 'LIMIT' && !limitPrice) return toast('Limit price is required for limit orders', 'error');
  if (orderType === 'STOP' && !stopPrice) return toast('Stop trigger price is required for stop orders', 'error');
  if (orderType === 'STOP_LIMIT' && (!stopPrice || !limitPrice)) return toast('Both stop trigger and limit price required for stop-limit orders', 'error');

  // Validate limit price direction: LIMIT BUY should be below market, LIMIT SELL above
  if (orderType === 'LIMIT') {
    if (tradeDirection === 'BUY' && limitPrice >= spotPrice) return toast('Limit BUY price should be below current market ($' + spotPrice.toFixed(4) + ')', 'error');
    if (tradeDirection === 'SELL' && limitPrice <= spotPrice) return toast('Limit SELL price should be above current market ($' + spotPrice.toFixed(4) + ')', 'error');
  }
  if (orderType === 'STOP') {
    if (tradeDirection === 'BUY' && stopPrice <= spotPrice) return toast('Stop BUY trigger should be above current market', 'error');
    if (tradeDirection === 'SELL' && stopPrice >= spotPrice) return toast('Stop SELL trigger should be below current market', 'error');
  }

  // For MARKET orders, validate as before
  if (orderType === 'MARKET') {
    const isBasisTrade = type === 'BASIS_SWAP';
    if (!isBasisTrade && tradeDirection === 'BUY' && currentPrice < spotPrice) {
      return toast('BUY price must be at or above spot ($' + spotPrice.toFixed(4) + ')', 'error');
    }
    if (!isBasisTrade && tradeDirection === 'SELL' && currentPrice > spotPrice) {
      return toast('SELL price must be at or below spot ($' + spotPrice.toFixed(4) + ')', 'error');
    }
  }

  const trade = {
    type, direction: tradeDirection, hub,
    volume: parseFloat(volume), entryPrice: orderType === 'MARKET' ? currentPrice : (limitPrice || stopPrice || currentPrice),
    spotRef: spotPrice,
    sector: document.getElementById('tradeSector') ? document.getElementById('tradeSector').value : '',
    deliveryMonth: document.getElementById('tradeDelivery').value,
    counterparty: document.getElementById('tradeCpty').value,
    stopLoss: document.getElementById('tradeStop').value || null,
    targetExit: document.getElementById('tradeTarget').value || null,
    venue: document.getElementById('tradeVenue').value,
    notes: document.getElementById('tradeNotes').value,
    orderType: orderType,
    tif: tif,
    limitPrice: limitPrice || null,
    stopPrice: stopPrice || null,
    status: 'OPEN',
    timestamp: new Date().toISOString()
  };

  // Market hours check for exchange trades
  const venue = trade.venue;
  const isExchange = venue && venue !== 'OTC';
  if (isExchange && !MARKET_OPEN) {
    return toast('Exchange is closed (' + MARKET_REASON + '). Use OTC or wait for market open.', 'error');
  }

  // OTC bilateral routing
  const cptyTrader = document.getElementById('tradeCpty').value;
  const isOtcBilateral = cptyTrader && cptyTrader.length > 0;

  // Conditional fields
  if (['SPREAD','CRUDE_DIFF'].includes(type)) {
    trade.nearMonth = document.getElementById('tradeNearMonth').value;
    trade.farMonth = document.getElementById('tradeFarMonth').value;
  }
  if (['OPTION_NG','OPTION_CL'].includes(type)) {
    trade.strike = document.getElementById('tradeStrike').value;
    trade.expiry = document.getElementById('tradeExpiry').value;
    trade.callPut = document.getElementById('tradeCallPut').value;
    trade.premium = document.getElementById('tradePremium').value;
  }
  if (type === 'BASIS_SWAP') {
    trade.basisHub = document.getElementById('tradeBasisHub').value;
  }

  // NON-MARKET orders → queue as pending
  if (orderType !== 'MARKET') {
    const pendingOrder = {
      ...trade,
      _pendingId: 'po_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    STATE.pendingOrders.push(pendingOrder);
    localStorage.setItem(traderStorageKey('pending_orders'), JSON.stringify(STATE.pendingOrders));
    playSound('trade');
    const triggerLabel = orderType === 'LIMIT' ? `limit $${limitPrice.toFixed(3)}` : orderType === 'STOP' ? `stop $${stopPrice.toFixed(3)}` : `stop $${stopPrice.toFixed(3)} / limit $${limitPrice.toFixed(3)}`;
    toast(`${orderType} order placed: ${tradeDirection} ${volume} ${hub} (${triggerLabel}, ${tif})`, 'success');
    resetTradeForm();
    renderBlotterPage();
    return;
  }

  // MARKET order → immediate execution
  trade.entryPrice = currentPrice;

  // Try server submission
  if (STATE.connected && STATE.trader) {
    try {
      let url, body;
      if (isOtcBilateral) {
        url = API_BASE + '/api/trades/otc/' + STATE.trader.trader_name;
        body = JSON.stringify({...trade, counterparty: cptyTrader});
      } else {
        url = API_BASE + '/api/trades/' + STATE.trader.trader_name;
        body = JSON.stringify(trade);
      }
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body
      });
      const d = await r.json();
      if (!d.success) { toast(d.error || 'Trade rejected by server', 'error'); return; }
      trade.id = d.trade_id;
      if (isOtcBilateral) {
        const cptyInfo = OTC_COUNTERPARTIES.find(c=>c.trader_name===cptyTrader);
        toast('OTC trade executed with ' + (cptyInfo?cptyInfo.display_name:cptyTrader) + '. Mirror position created.', 'success');
      }
    } catch { /* fallback to local */ }
  }

  // Store locally
  if (!trade.id) trade.id = Date.now();
  STATE.trades.unshift(trade);
  localStorage.setItem(traderStorageKey('trades'), JSON.stringify(STATE.trades));

  playSound('trade');
  toast('Trade submitted: ' + tradeDirection + ' ' + volume + ' ' + hub, 'success');
  resetTradeForm();
  renderBlotterPage();
}

function resetTradeForm() {
  document.getElementById('tradeSector').value = '';
  document.getElementById('tradeType').innerHTML = '<option value="">Select sector first...</option>';
  document.getElementById('tradeType').value = '';
  document.getElementById('tradeVenue').innerHTML = '<option value="OTC">OTC Bilateral</option>';
  document.getElementById('tradeVolume').value = '';
  document.getElementById('tradeEntry').value = '';
  document.getElementById('tradeCpty').value = '';
  document.getElementById('tradeNotes').value = '';
  document.getElementById('tradeStop').value = '';
  document.getElementById('tradeTarget').value = '';
  document.getElementById('tradeLimitPrice').value = '';
  document.getElementById('tradeStopPrice').value = '';
  document.getElementById('tradeOrderType').value = 'MARKET';
  document.getElementById('tradeTIF').value = 'DAY';
  document.getElementById('tradeFormHint').textContent = '';
  onOrderTypeChange();
  tradeDirection = '';
  setDirection('');
  document.getElementById('dirBuy').style.background = 'var(--surface2)';
  document.getElementById('dirBuy').style.color = 'var(--text-dim)';
  document.getElementById('dirBuy').style.borderColor = 'var(--border)';
  document.getElementById('dirSell').style.background = 'var(--surface2)';
  document.getElementById('dirSell').style.color = 'var(--text-dim)';
  document.getElementById('dirSell').style.borderColor = 'var(--border)';
}

function renderBlotterTable() {
  let trades = [...STATE.trades, ...STATE.pendingOrders.map(o => ({...o, _pending: true}))];
  const search = (document.getElementById('blotterSearch').value || '').toLowerCase();
  if (search) {
    trades = trades.filter(t =>
      (t.hub||'').toLowerCase().includes(search) ||
      (t.type||'').toLowerCase().includes(search) ||
      (t.notes||'').toLowerCase().includes(search) ||
      (t.counterparty||'').toLowerCase().includes(search)
    );
  }

  document.getElementById('blotterCount').textContent = trades.length + ' trades' + (STATE.pendingOrders.length ? ` (${STATE.pendingOrders.length} pending)` : '');

  // Pagination
  const totalPages = Math.max(1, Math.ceil(trades.length / BLOTTER_PAGE_SIZE));
  if (blotterPage >= totalPages) blotterPage = totalPages - 1;
  const start = blotterPage * BLOTTER_PAGE_SIZE;
  const pageTrades = trades.slice(start, start + BLOTTER_PAGE_SIZE);

  const tbody = document.getElementById('blotterBody');
  tbody.innerHTML = pageTrades.map(t => {
    const spot = getPrice(t.hub);
    const dir = t.direction === 'BUY' ? 1 : -1;
    const vol = parseFloat(t.volume || 0);
    const entry = parseFloat(t.entryPrice || 0);
    let mtm = 0;
    if (t._pending) mtm = 0;
    else if (t.status === 'OPEN') {
      if (t.type === 'BASIS_SWAP') {
        mtm = (spot - entry) * vol * dir;
      } else {
        mtm = (spot - entry) * vol * dir;
      }
    }
    else mtm = parseFloat(t.realizedPnl || 0);

    const mtmColor = mtm >= 0 ? 'green' : 'red';
    const dirColor = t.direction === 'BUY' ? 'color:var(--green)' : 'color:var(--red)';

    // Order type badge
    const orderType = t.orderType || 'MARKET';
    const tif = t.tif || 'DAY';
    let orderBadge;
    if (t._pending) {
      const triggerPrice = t.limitPrice || t.stopPrice || '—';
      orderBadge = `<span class="order-badge pending">${orderType}</span><br><span style="font-size:10px;color:var(--text-muted)">@${parseFloat(triggerPrice).toFixed(3)} ${tif}</span>`;
    } else if (orderType === 'MARKET') {
      orderBadge = `<span style="font-size:11px;color:var(--text-muted)">MKT</span>`;
    } else {
      orderBadge = `<span class="order-badge filled">${orderType}</span>`;
    }

    let statusBadge;
    if (t._pending) {
      statusBadge = '<span class="badge" style="background:rgba(139,92,246,0.15);color:#8b5cf6">PENDING</span>';
    } else if (t.status === 'OPEN') {
      statusBadge = '<span class="badge" style="background:rgba(34,211,238,0.15);color:var(--accent)">OPEN</span>';
    } else {
      statusBadge = '<span class="badge" style="background:rgba(148,163,184,0.15);color:var(--text-dim)">CLOSED</span>';
    }

    // Row tint
    const rowBg = t._pending ? 'background:rgba(139,92,246,0.03)' : (t.status === 'OPEN' ? (mtm >= 0 ? 'background:rgba(16,185,129,0.03)' : 'background:rgba(239,68,68,0.03)') : '');

    // Check 1-hour delete window
    const created = new Date(t.timestamp || t.server_created_at || Date.now());
    const canDelete = (Date.now() - created.getTime()) < 3600000;

    const dateStr = new Date(t.timestamp || Date.now()).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const isLarge = (t.hub||'').includes('Baltic') || (t.hub||'').includes('Index');

    let actions = '';
    if (t._pending) {
      actions += `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="cancelPendingOrder('${t._pendingId}')">Cancel</button>`;
    } else {
      if (t.status === 'OPEN') actions += `<button class="btn btn-ghost btn-sm" onclick="closeTrade(${t.id})">Close</button>`;
      if (canDelete) actions += `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteTrade(${t.id})">Delete</button>`;
      else if (t.status === 'OPEN') actions += `<span style="font-size:10px;color:var(--text-muted)" title="Admin required after 1hr">Locked</span>`;
      actions += `<button class="btn btn-ghost btn-sm" onclick="cloneTrade(${t.id})">Clone</button>`;
    }

    return `<tr style="${rowBg}">
      <td style="font-size:12px;white-space:nowrap">${dateStr}</td>
      <td style="font-size:11px">${t.type}</td>
      <td style="${dirColor};font-weight:700">${t.direction}</td>
      <td>${t.hub}</td>
      <td class="mono">${parseFloat(t.volume).toLocaleString()}</td>
      <td class="mono">${isLarge ? entry.toFixed(0) : entry.toFixed(3)}</td>
      <td class="mono">${isLarge ? spot.toFixed(0) : spot.toFixed(3)}</td>
      <td>${orderBadge}</td>
      <td class="mono ${mtmColor}" style="font-weight:600">${t._pending ? '—' : (mtm>=0?'+':'') + '$' + Math.abs(mtm).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
      <td>${statusBadge}</td>
      <td><div class="actions-cell">${actions}</div></td>
    </tr>`;
  }).join('');

  if (!pageTrades.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:30px">No trades yet. Use the form above to place your first trade.</td></tr>';
  }

  // Pagination controls
  const pagDiv = document.getElementById('blotterPagination');
  if (totalPages <= 1) { pagDiv.innerHTML = ''; return; }
  let pagHtml = '';
  for (let i = 0; i < totalPages; i++) {
    pagHtml += `<button class="btn btn-sm ${i===blotterPage?'btn-primary':'btn-ghost'}" onclick="blotterPage=${i};renderBlotterTable()">${i+1}</button>`;
  }
  pagDiv.innerHTML = pagHtml;
}

function closeTrade(id) {
  const t = STATE.trades.find(x => x.id === id);
  if (!t || t.status !== 'OPEN') return;
  const cp = getPrice(t.hub);
  if (!cp && cp !== 0) return toast('No market price available for ' + t.hub, 'error');
  const isBasis = t.type === 'BASIS_SWAP';
  if (!isBasis && cp <= 0) return toast('No market price available for ' + t.hub, 'error');
  const isOtc = t.venue === 'OTC' && (t.counterpartyTrader || t.otcMirrorOf);
  const confirmMsg = isOtc
    ? 'Close OTC trade at market price $' + cp.toFixed(4) + '? (Mirror position will also close)'
    : 'Close at market price $' + cp.toFixed(4) + '?';
  if (!confirm(confirmMsg)) return;

  const dir = t.direction === 'BUY' ? 1 : -1;
  let pnl;
  if (isBasis) {
    // Basis P&L = change in differential × volume
    pnl = (cp - parseFloat(t.entryPrice)) * parseFloat(t.volume) * dir;
  } else {
    pnl = (cp - parseFloat(t.entryPrice)) * parseFloat(t.volume) * dir;
  }
  t.status = 'CLOSED';
  t.closePrice = cp;
  t.realizedPnl = pnl;
  t.closedAt = new Date().toISOString();
  localStorage.setItem(traderStorageKey('trades'), JSON.stringify(STATE.trades));

  // Update server
  if (STATE.connected && STATE.trader) {
    if (isOtc) {
      fetch(API_BASE + '/api/trades/otc-close/' + STATE.trader.trader_name + '/' + id, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closePrice: cp })
      }).catch(() => {});
    } else {
      fetch(API_BASE + '/api/trades/' + STATE.trader.trader_name + '/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED', closePrice: cp, realizedPnl: pnl, spotRef: cp })
      }).catch(() => {});
    }
  }

  playSound('trade');
  toast('Trade closed: ' + (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toLocaleString(undefined,{maximumFractionDigits:0}) + (isOtc?' (mirror also closed)':''), pnl >= 0 ? 'success' : 'error');
  renderBlotterPage();
}

function deleteTrade(id) {
  const idx = STATE.trades.findIndex(x => x.id === id);
  if (idx === -1) return;
  STATE.trades.splice(idx, 1);
  localStorage.setItem(traderStorageKey('trades'), JSON.stringify(STATE.trades));
  if (STATE.connected && STATE.trader) {
    fetch('/api/trades/' + STATE.trader.trader_name + '/' + id, { method: 'DELETE' }).catch(() => {});
  }
  toast('Trade deleted', 'info');
  renderBlotterPage();
}

function inferSectorFromType(type) {
  if (!type) return '';
  if (type.startsWith('CRUDE') || type === 'EFP' || type === 'OPTION_CL') return 'crude';
  if (type.startsWith('FREIGHT')) return 'freight';
  if (type.startsWith('AG')) return 'ag';
  if (type.startsWith('METALS')) return 'metals';
  // NG/Power types overlap — default to ng
  return 'ng';
}

function cloneTrade(id) {
  const t = STATE.trades.find(x => x.id === id);
  if (!t) return;
  // Set sector first, then populate types, then set type
  const sector = inferSectorFromType(t.type);
  document.getElementById('tradeSector').value = sector;
  onTradeSectorChange();
  document.getElementById('tradeType').value = t.type || '';
  onTradeTypeChange();
  setDirection(t.direction);
  setTimeout(() => {
    document.getElementById('tradeHub').value = t.hub || '';
    if (t.venue) document.getElementById('tradeVenue').value = t.venue;
    document.getElementById('tradeVolume').value = t.volume || '';
    document.getElementById('tradeEntry').value = t.entryPrice || '';
    document.getElementById('tradeCpty').value = t.counterparty || '';
    document.getElementById('tradeNotes').value = t.notes || '';
    document.getElementById('tradeSpot').value = getPrice(t.hub).toFixed(4);
    updateMarginPreview();
  }, 50);
  toast('Trade cloned — review and submit', 'info');
  document.getElementById('tradeFormCard').scrollIntoView({ behavior: 'smooth' });
}

function renderNetPositions() {
  const positions = {};
  STATE.trades.filter(t => t.status === 'OPEN').forEach(t => {
    if (!positions[t.hub]) positions[t.hub] = { long: 0, short: 0 };
    if (t.direction === 'BUY') positions[t.hub].long += parseFloat(t.volume);
    else positions[t.hub].short += parseFloat(t.volume);
  });

  const tbody = document.getElementById('netPositionBody');
  const entries = Object.entries(positions);
  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">No open positions</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(([hub, pos]) => {
    const net = pos.long - pos.short;
    const dir = net > 0 ? 'NET LONG' : net < 0 ? 'NET SHORT' : 'FLAT';
    const dirColor = net > 0 ? 'color:var(--green)' : net < 0 ? 'color:var(--red)' : 'color:var(--text-muted)';
    return `<tr>
      <td style="font-weight:600">${hub}</td>
      <td class="mono green">${pos.long.toLocaleString()}</td>
      <td class="mono red">${pos.short.toLocaleString()}</td>
      <td class="mono" style="${dirColor};font-weight:700">${Math.abs(net).toLocaleString()}</td>
      <td style="${dirColor};font-weight:600">${dir}</td>
    </tr>`;
  }).join('');
}

function drawPnlChart() {
  const canvas = document.getElementById('pnlChart');
  if (!canvas || !canvas.parentElement) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  if (!rect || !rect.width) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = 280 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '280px';
  ctx.scale(dpr, dpr);
  const W = rect.width, H = 280;

  const closed = STATE.trades.filter(t => t.status === 'CLOSED').reverse();
  if (closed.length < 1) {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = isLight ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = isLight ? '#94a3b8' : '#475569';
    ctx.font = '13px IBM Plex Sans';
    ctx.textAlign = 'center';
    ctx.fillText('Close trades to see cumulative P&L', W/2, H/2);
    return;
  }

  const cumPnlAll = [];
  let running = 0;
  closed.forEach(t => { running += parseFloat(t.realizedPnl || 0); cumPnlAll.push(running); });

  // Range filtering
  const rangeMap = { '1W': 7, '1M': 30, '3M': 90, 'ALL': cumPnlAll.length };
  const sliceN = rangeMap[STATE.pnlRange] || cumPnlAll.length;
  const cumPnl = cumPnlAll.slice(-Math.min(sliceN, cumPnlAll.length));

  const min = Math.min(0, ...cumPnl);
  const max = Math.max(0, ...cumPnl);
  const range = (max - min) || 1;
  const padL = 70, padR = 35, padT = 20, padB = 45;
  const cW = W - padL - padR, cH = H - padT - padB;

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  ctx.fillStyle = isLight ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  ctx.fillRect(0, 0, W, H);

  // Zero line
  const zeroY = padT + (1 - (0 - min) / range) * cH;
  ctx.strokeStyle = 'rgba(148,163,184,0.3)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(W - padR, zeroY); ctx.stroke();
  ctx.setLineDash([]);

  // P&L line
  const lastVal = cumPnl[cumPnl.length - 1];
  const lineColor = lastVal >= 0 ? '#10b981' : '#ef4444';
  ctx.beginPath();
  cumPnl.forEach((val, i) => {
    const x = padL + (cumPnl.length > 1 ? (i / (cumPnl.length - 1)) * cW : cW / 2);
    const y = padT + (1 - (val - min) / range) * cH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
  if (lastVal >= 0) { grad.addColorStop(0, 'rgba(16,185,129,0.15)'); grad.addColorStop(1, 'rgba(16,185,129,0)'); }
  else { grad.addColorStop(0, 'rgba(239,68,68,0)'); grad.addColorStop(1, 'rgba(239,68,68,0.15)'); }
  ctx.beginPath();
  cumPnl.forEach((val, i) => {
    const x = padL + (cumPnl.length > 1 ? (i / (cumPnl.length - 1)) * cW : cW / 2);
    const y = padT + (1 - (val - min) / range) * cH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(padL + cW, zeroY);
  ctx.lineTo(padL, zeroY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Y-axis labels
  const textColor = isLight ? '#475569' : '#94a3b8';
  ctx.fillStyle = textColor;
  ctx.font = '11px IBM Plex Mono';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = min + (range * i / 4);
    const y = padT + (1 - i / 4) * cH;
    ctx.fillText('$' + val.toFixed(0), padL - 8, y + 4);
  }

  // X-axis date labels
  ctx.fillStyle = textColor;
  ctx.font = '10px IBM Plex Mono';
  ctx.textAlign = 'center';
  const now = new Date();
  const totalSpanDays = rangeMap[STATE.pnlRange] || cumPnl.length;
  const labelCount = Math.min(6, cumPnl.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = cumPnl.length > 1 ? Math.floor(i * (cumPnl.length - 1) / (labelCount - 1)) : 0;
    const x = padL + (cumPnl.length > 1 ? (idx / (cumPnl.length - 1)) * cW : cW / 2);
    const daysBack = Math.round(totalSpanDays * (1 - idx / Math.max(1, cumPnl.length - 1)));
    const labelDate = new Date(now.getTime() - daysBack * 86400000);
    const label = labelDate.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    ctx.fillText(label, x, H - padB + 20);
  }

  // Store metadata for crosshair
  canvas._pnlMeta = { padL, padR, padT, padB, cW, cH, min, max, range, data: cumPnl, lineColor, W, H };
}

function initPnlCrosshair() {
  const canvas = document.getElementById('pnlChart');
  if (!canvas || canvas._pnlCrossInit) return;
  canvas._pnlCrossInit = true;

  canvas.addEventListener('mousemove', e => {
    const meta = canvas._pnlMeta;
    if (!meta) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const { padL, padT, cW, cH, min, range, data, lineColor, W, H, padB } = meta;
    if (mx < padL || mx > padL + cW) { drawPnlChart(); return; }

    const idx = Math.round(((mx - padL) / cW) * (data.length - 1));
    const clampIdx = Math.max(0, Math.min(data.length - 1, idx));
    const val = data[clampIdx];
    const snapX = padL + (clampIdx / (data.length - 1)) * cW;
    const snapY = padT + (1 - (val - min) / range) * cH;

    drawPnlChart();
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save(); ctx.scale(dpr, dpr);

    ctx.strokeStyle = 'rgba(148,163,184,0.4)'; ctx.lineWidth = 0.5; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(snapX, padT); ctx.lineTo(snapX, padT + cH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, snapY); ctx.lineTo(padL + cW, snapY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath(); ctx.arc(snapX, snapY, 5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    const sign = val >= 0 ? '+' : '-';
    const txt = sign + '$' + Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 });
    ctx.font = '12px IBM Plex Mono';
    const tw = ctx.measureText(txt).width + 16;
    const tipX = snapX + 12 + tw > padL + cW ? snapX - tw - 12 : snapX + 12;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(tipX, snapY - 14, tw, 24);
    ctx.strokeStyle = lineColor; ctx.lineWidth = 1;
    ctx.strokeRect(tipX, snapY - 14, tw, 24);
    ctx.fillStyle = lineColor; ctx.textAlign = 'left';
    ctx.fillText(txt, tipX + 8, snapY + 3);

    const now = new Date();
    const daysBack = data.length - 1 - clampIdx;
    const labelDate = new Date(now.getTime() - daysBack * 86400000);
    const dateStr = labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ctx.font = '10px IBM Plex Mono';
    const dtw = ctx.measureText(dateStr).width + 10;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(snapX - dtw / 2, padT + cH + 2, dtw, 18);
    ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center';
    ctx.fillText(dateStr, snapX, padT + cH + 14);
    ctx.restore();
  });

  canvas.addEventListener('mouseleave', () => { if (canvas._pnlMeta) drawPnlChart(); });
}

// Keyboard shortcuts for blotter
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if (STATE.currentPage === 'blotter') {
    if (e.key.toLowerCase() === 'b') { e.preventDefault(); setDirection('BUY'); }
    if (e.key.toLowerCase() === 's') { e.preventDefault(); setDirection('SELL'); }
    if (e.key === 'Enter') { e.preventDefault(); submitTrade(); }
  }
});

/* =====================================================================
   NEWS
   ===================================================================== */
const SIM_NEWS = {
  ng: [
    { source:'Simulated', headline:'Henry Hub Prices Surge on Colder Weather Forecast', description:'Extended cold pattern expected across Eastern US pushes gas futures higher.', time:'2h ago' },
    { source:'Simulated', headline:'Freeport LNG Export Terminal Reaches Full Capacity', description:'Gulf Coast LNG demand continues to tighten domestic supply.', time:'4h ago' },
    { source:'Simulated', headline:'EIA Reports Larger-Than-Expected Storage Draw', description:'Working gas dropped 120 Bcf, well above the 5-year average draw.', time:'6h ago' },
    { source:'Simulated', headline:'Permian Basin Flaring Regulations Tighten', description:'New rules could reduce associated gas production in the Waha corridor.', time:'8h ago' },
    { source:'Simulated', headline:'Algonquin Basis Explodes on Pipeline Constraints', description:'Northeast basis blows out as Algonquin capacity maxes out during cold snap.', time:'10h ago' },
    { source:'Simulated', headline:'Dawn Hub Storage Nears Operational Minimums', description:'Canadian storage at Dawn approaches critically low levels ahead of spring.', time:'12h ago' }
  ],
  crude: [
    { source:'Simulated', headline:'OPEC+ Agrees to Extend Production Cuts', description:'Cartel maintains supply discipline, supporting Brent above $80.', time:'2h ago' },
    { source:'Simulated', headline:'US Crude Inventories Fall for 5th Straight Week', description:'EIA reports 4.2M barrel draw at Cushing hub.', time:'5h ago' },
    { source:'Simulated', headline:'WCS Discount Widens on Pipeline Bottleneck', description:'Canadian heavy crude struggles to reach Gulf Coast refiners.', time:'7h ago' },
    { source:'Simulated', headline:'Mars Sour Premium Strengthens on Refinery Demand', description:'Gulf Coast sour crude demand rises ahead of maintenance season.', time:'9h ago' },
    { source:'Simulated', headline:'Brent-WTI Spread Narrows to $3 on Export Growth', description:'Rising US exports tighten the transatlantic arbitrage.', time:'11h ago' },
    { source:'Simulated', headline:'Bakken Production Hits Record Despite Takeaway Limits', description:'North Dakota output surpasses 1.3 million barrels per day.', time:'14h ago' }
  ],
  power: [
    { source:'Simulated', headline:'ERCOT Issues Conservation Alert Amid Heat Wave', description:'Texas grid operator warns of tight reserves as temps hit 105°F.', time:'1h ago' },
    { source:'Simulated', headline:'PJM Capacity Auction Clears at Record Prices', description:'Rising demand and retirements push capacity prices to new highs.', time:'4h ago' },
    { source:'Simulated', headline:'CAISO Curtails 5GW of Solar During Midday Peak', description:'California oversupply leads to negative prices during afternoon hours.', time:'6h ago' },
    { source:'Simulated', headline:'NYISO Zone J Spikes to $200/MWh on Transmission Outage', description:'NYC zone prices soar as key transmission line goes offline.', time:'8h ago' },
    { source:'Simulated', headline:'MISO Wind Generation Sets New Record', description:'Wind output across Midwest surpasses 25GW, depressing on-peak prices.', time:'10h ago' },
    { source:'Simulated', headline:'NEPOOL Winter Readiness Report Raises Concerns', description:'New England ISO flags potential fuel security issues for upcoming winter.', time:'13h ago' }
  ],
  freight: [
    { source:'Simulated', headline:'Baltic Dry Index Surges on Iron Ore Demand', description:'Chinese steel production ramp-up drives capesize rates higher.', time:'2h ago' },
    { source:'Simulated', headline:'VLCC Rates Spike on Red Sea Rerouting', description:'Tankers avoiding Suez Canal add ton-miles, tightening supply.', time:'4h ago' },
    { source:'Simulated', headline:'Panamax Rates Firm on South American Grain Season', description:'Brazilian soybean exports boost Pacific and Atlantic rates.', time:'6h ago' },
    { source:'Simulated', headline:'LNG Spot Freight Eases as Newbuilds Enter Fleet', description:'New vessel deliveries add tonnage, pressuring spot charter rates.', time:'8h ago' },
    { source:'Simulated', headline:'Suezmax Market Tightens on West African Crude Exports', description:'Rising WAF crude demand boosts dirty tanker rates.', time:'10h ago' },
    { source:'Simulated', headline:'Dry Bulk Scrapping Accelerates as Emissions Rules Loom', description:'Older vessels exit fleet ahead of CII regulations, supporting rates.', time:'12h ago' }
  ],
  ag: [
    { source:'Simulated', headline:'USDA WASDE Report Cuts Corn Yield Estimate', description:'Drought conditions across the Corn Belt reduce expected output by 3%.', time:'1h ago' },
    { source:'Simulated', headline:'Soybean Exports to China Surge to Record Pace', description:'Brazilian port congestion shifts buying to US Gulf terminals.', time:'3h ago' },
    { source:'Simulated', headline:'Wheat Futures Rally on Black Sea Export Uncertainty', description:'Geopolitical tensions threaten Ukrainian grain corridor shipments.', time:'5h ago' },
    { source:'Simulated', headline:'Coffee C Prices Hit 2-Year High on Brazilian Frost Risk', description:'Cold front approaching Minas Gerais raises supply concerns.', time:'7h ago' },
    { source:'Simulated', headline:'Live Cattle Futures Firm on Strong Packer Demand', description:'Tight cattle supplies support cash market premiums.', time:'9h ago' },
    { source:'Simulated', headline:'Cocoa Prices Surge as West Africa Crop Falls Short', description:'Ghana and Ivory Coast report lowest production in a decade.', time:'11h ago' }
  ],
  metals: [
    { source:'Simulated', headline:'Gold Breaks Above $2,350 on Safe-Haven Demand', description:'Central bank buying and geopolitical tensions drive bullion higher.', time:'1h ago' },
    { source:'Simulated', headline:'Copper Rallies on China Stimulus Expectations', description:'Beijing infrastructure spending signals boost demand outlook.', time:'3h ago' },
    { source:'Simulated', headline:'Silver Outperforms Gold as Industrial Demand Grows', description:'Solar panel manufacturing drives record silver consumption.', time:'5h ago' },
    { source:'Simulated', headline:'Aluminum Prices Drop on LME Warehouse Surplus', description:'Rising inventories in Asian warehouses weigh on spot premiums.', time:'7h ago' },
    { source:'Simulated', headline:'Iron Ore Tumbles on Weak Chinese Steel Margins', description:'Steelmakers cut production as margins turn negative.', time:'9h ago' },
    { source:'Simulated', headline:'Nickel Volatility Spikes Amid Indonesian Export Policy Shift', description:'Jakarta signals potential export tax changes for nickel ore.', time:'11h ago' }
  ],
  ngls: [
    { source:'Simulated', headline:'Mont Belvieu Propane Strengthens on Export Demand', description:'Enterprise TEPPCO terminal loadings hit seasonal highs, tightening Gulf Coast supply.', time:'1h ago' },
    { source:'Simulated', headline:'Ethane Rejection Rises as Gas-NGL Spread Narrows', description:'Processors leaving ethane in the gas stream as recovery margins compress.', time:'3h ago' },
    { source:'Simulated', headline:'Frac Spread Widens on Higher NGL Prices, Weaker Gas', description:'Processing economics improve as NGL basket outpaces Henry Hub input cost.', time:'5h ago' },
    { source:'Simulated', headline:'Enterprise Products Expands Mont Belvieu Fractionation', description:'New 150,000 bpd unit to come online Q3, adding NGL processing capacity.', time:'7h ago' },
    { source:'Simulated', headline:'Natural Gasoline Premium Surges on Blending Demand', description:'C5+ prices rise as refiners increase gasoline blending component purchases.', time:'9h ago' },
    { source:'Simulated', headline:'Asian Propane Imports Reach Record, Lifting US Gulf Prices', description:'LPG export cargoes from Houston ship channel fully booked through month-end.', time:'11h ago' }
  ],
  lng: [
    { source:'Simulated', headline:'JKM Surges as Northeast Asia Cold Snap Drives Spot Buying', description:'Japanese and Korean utilities scramble for spot cargoes, pushing Asia LNG to 3-month highs.', time:'1h ago' },
    { source:'Simulated', headline:'Sabine Pass Declares Force Majeure on Train 2', description:'Unplanned outage at Cheniere facility removes 0.7 Bcf/d of export capacity.', time:'3h ago' },
    { source:'Simulated', headline:'TTF Drops as European Storage Hits 85% Ahead of Schedule', description:'Mild autumn weather and strong LNG imports leave EU well-positioned for winter.', time:'5h ago' },
    { source:'Simulated', headline:'Mozambique LNG Final Investment Decision Expected Q1', description:'TotalEnergies signals restart of Mozambique project, adding future supply.', time:'7h ago' },
    { source:'Simulated', headline:'US LNG Exports Hit Record 14 Bcf/d in November', description:'Golden Pass and Plaquemines Phase 1 commissioning cargoes boost total loadings.', time:'9h ago' },
    { source:'Simulated', headline:'Qatar Expands North Field East with New Long-Term Offtake Deals', description:'QatarEnergy signs 27-year supply agreements with Asian buyers at Brent-linked pricing.', time:'11h ago' }
  ]
};

let liveNews = {};

let newsExpanded = {};

function renderNews(sector, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const articles = liveNews[sector] || SIM_NEWS[sector] || [];
  const expanded = newsExpanded[sector] || false;
  const visible = expanded ? articles : articles.slice(0, 5);
  const remaining = articles.length - 5;

  // Store articles for click handler
  if (!window._newsArticles) window._newsArticles = {};
  window._newsArticles[sector] = articles;

  let html = visible.map((a, i) =>
    `<div class="news-card" onclick="openNewsBySector('${sector}',${i})">
      <div class="news-source">${escapeHtml(a.source)}</div>
      <div class="news-headline">${escapeHtml(a.headline)}</div>
      <div class="news-desc">${escapeHtml(a.description || '')}</div>
      <div class="news-time">${escapeHtml(a.time)}</div>
    </div>`
  ).join('');

  if (!expanded && remaining > 0) {
    html += `<button class="news-show-more" onclick="expandNews('${sector}','${containerId}')">
      Show More Headlines<span class="news-count-badge">+${remaining}</span>
    </button>`;
  } else if (expanded && articles.length > 5) {
    html += `<button class="news-show-more" onclick="collapseNews('${sector}','${containerId}')" style="color:var(--text-muted)">
      Show Less
    </button>`;
  }

  container.innerHTML = html;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function openNewsBySector(sector, idx) {
  const articles = (window._newsArticles || {})[sector] || liveNews[sector] || SIM_NEWS[sector] || [];
  const a = articles[idx];
  if (!a) return;
  openNewsModalSafe(a.headline, a.description, a.url);
}

function expandNews(sector, containerId) {
  newsExpanded[sector] = true;
  renderNews(sector, containerId);
}

function collapseNews(sector, containerId) {
  newsExpanded[sector] = false;
  renderNews(sector, containerId);
  // Scroll back up to the news section
  document.getElementById(containerId)?.scrollIntoView({ behavior:'smooth', block:'start' });
}

/* =====================================================================
   NEWS TICKER BAR
   ===================================================================== */
const SECTOR_TAGS = {
  ng:      { label:'NG',  cls:'ng' },
  crude:   { label:'CL',  cls:'crude' },
  power:   { label:'PWR', cls:'power' },
  freight: { label:'FRT', cls:'freight' },
  ag:      { label:'AG',  cls:'ag' },
  metals:  { label:'MTL', cls:'metals' },
  ngls:    { label:'NGL', cls:'ng' },
  lng:     { label:'LNG', cls:'crude' },
};

function renderNewsTicker() {
  const inner = document.getElementById('newsTickerInner');
  if (!inner) return;

  // Collect headlines from all sectors
  const allItems = [];
  const sectors = ['ng','crude','power','freight','ag','metals','ngls','lng'];
  for (const sec of sectors) {
    const articles = liveNews[sec] || SIM_NEWS[sec] || [];
    for (const a of articles.slice(0, 4)) {
      allItems.push({ sector: sec, ...a });
    }
  }

  // Interleave: round-robin across sectors so it doesn't cluster
  const bySector = {};
  for (const item of allItems) {
    if (!bySector[item.sector]) bySector[item.sector] = [];
    bySector[item.sector].push(item);
  }
  const interleaved = [];
  const queues = sectors.map(s => bySector[s] || []);
  let maxLen = Math.max(...queues.map(q => q.length));
  for (let i = 0; i < maxLen; i++) {
    for (const q of queues) {
      if (i < q.length) interleaved.push(q[i]);
    }
  }

  // Store interleaved for click handler
  window._tickerArticles = interleaved;

  const buildHTML = (items, offset) => items.map((item, i) => {
    const tag = SECTOR_TAGS[item.sector] || { label:'?', cls:'' };
    const idx = (offset || 0) + i;
    return `<span class="news-tick" onclick="openTickerNews(${idx % interleaved.length})"><span class="news-tick-tag ${tag.cls}">${tag.label}</span>${escapeHtml(item.headline)}<span class="news-tick-src">${escapeHtml(item.time)}</span></span><span class="news-tick-sep">◆</span>`;
  }).join('');

  // Duplicate content for seamless looping
  const segment = buildHTML(interleaved, 0);
  inner.innerHTML = segment + buildHTML(interleaved, 0);

  // Calculate speed: measure actual content width, target ~60px/sec
  requestAnimationFrame(() => {
    const contentWidth = inner.scrollWidth / 2; // half because we duplicated
    const speed = 60; // pixels per second — comfortable reading pace
    const duration = Math.max(30, contentWidth / speed);
    inner.style.animation = `newsScroll ${duration}s linear infinite`;
  });
}

function openTickerNews(idx) {
  const items = window._tickerArticles || [];
  const a = items[idx];
  if (!a) return;
  openNewsModalSafe(a.headline, a.description, a.url);
}

function openNewsModalSafe(headline, desc, url) {
  const modal = document.getElementById('modalContent');
  modal.innerHTML = '';
  const h = document.createElement('h3');
  h.textContent = headline || '';
  modal.appendChild(h);
  const p = document.createElement('p');
  p.textContent = desc || '';
  modal.appendChild(p);
  if (url) {
    const lp = document.createElement('p');
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.style.color = 'var(--accent)';
    a.textContent = 'Read full article →';
    lp.appendChild(a);
    modal.appendChild(lp);
  }
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  actions.innerHTML = '<button class="btn btn-ghost" onclick="closeModal()">Close</button>';
  modal.appendChild(actions);
  document.getElementById('modalOverlay').classList.add('active');
}

// Keep legacy function for backward compat
function openNewsModal(headline, desc, url) {
  openNewsModalSafe(headline, desc, url);
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }

/* =====================================================================
   ECONOMIC CALENDAR
   ===================================================================== */
const CALENDAR_EVENTS = {
  ng: [
    { name:'EIA Natural Gas Storage Report', impact:'HIGH', dayOfWeek:4, recurring:true },
    { name:'NOAA 6-10 Day Forecast', impact:'MEDIUM', dayOfWeek:1, recurring:true },
    { name:'FERC Monthly Gas Report', impact:'MEDIUM', monthDay:15 },
    { name:'LNG Export Terminal Maintenance Window', impact:'HIGH', monthDay:20 },
    { name:'NYMEX NG Options Expiry', impact:'HIGH', monthDay:25 },
  ],
  crude: [
    { name:'EIA Weekly Petroleum Status', impact:'HIGH', dayOfWeek:3, recurring:true },
    { name:'API Weekly Crude Stocks', impact:'MEDIUM', dayOfWeek:2, recurring:true },
    { name:'OPEC+ Monthly Meeting', impact:'HIGH', monthDay:5 },
    { name:'Baker Hughes Rig Count', impact:'MEDIUM', dayOfWeek:5, recurring:true },
    { name:'NYMEX CL Options Expiry', impact:'HIGH', monthDay:20 },
  ],
  power: [
    { name:'ERCOT Seasonal Assessment', impact:'HIGH', monthDay:10 },
    { name:'PJM Capacity Auction Results', impact:'HIGH', monthDay:22 },
    { name:'CAISO Renewables Forecast Update', impact:'MEDIUM', dayOfWeek:1, recurring:true },
    { name:'FERC Monthly Energy Review', impact:'MEDIUM', monthDay:18 },
    { name:'EPA Emissions Rule Comment Deadline', impact:'HIGH', monthDay:28 },
  ],
  freight: [
    { name:'Baltic Exchange Weekly Summary', impact:'HIGH', dayOfWeek:5, recurring:true },
    { name:'Shanghai Shipping Exchange Index', impact:'MEDIUM', dayOfWeek:1, recurring:true },
    { name:'IMO CII Rating Review', impact:'HIGH', monthDay:21 },
    { name:'Chinese PMI Release', impact:'HIGH', monthDay:1 },
    { name:'BIMCO Market Report', impact:'MEDIUM', monthDay:14 },
  ],
  ag: [
    { name:'USDA WASDE Report', impact:'HIGH', monthDay:12 },
    { name:'USDA Crop Progress Report', impact:'HIGH', dayOfWeek:1, recurring:true },
    { name:'USDA Export Sales Report', impact:'MEDIUM', dayOfWeek:4, recurring:true },
    { name:'CBOT Grain Options Expiry', impact:'HIGH', monthDay:22 },
    { name:'USDA Cattle on Feed Report', impact:'MEDIUM', monthDay:20 },
    { name:'ICE Coffee First Notice Day', impact:'HIGH', monthDay:26 },
  ],
  metals: [
    { name:'FOMC Rate Decision', impact:'HIGH', monthDay:14 },
    { name:'US Non-Farm Payrolls', impact:'HIGH', monthDay:3 },
    { name:'Chinese Manufacturing PMI', impact:'HIGH', monthDay:1 },
    { name:'COMEX Gold Options Expiry', impact:'HIGH', monthDay:25 },
    { name:'LME Week Conference', impact:'MEDIUM', monthDay:28 },
    { name:'World Gold Council Demand Report', impact:'MEDIUM', monthDay:18 },
  ],
  ngls: [
    { name:'EIA Weekly Petroleum Status (NGL Stocks)', impact:'HIGH', dayOfWeek:3, recurring:true },
    { name:'Mont Belvieu OPIS Settlement', impact:'HIGH', dayOfWeek:5, recurring:true },
    { name:'Enterprise Products Fractionation Report', impact:'MEDIUM', monthDay:10 },
    { name:'NYMEX Propane Options Expiry', impact:'HIGH', monthDay:25 },
    { name:'EIA Monthly NGL Production Report', impact:'MEDIUM', monthDay:28 },
    { name:'US LPG Export Loadings Update', impact:'MEDIUM', dayOfWeek:2, recurring:true },
  ],
  lng: [
    { name:'DOE LNG Monthly Export Report', impact:'HIGH', monthDay:15 },
    { name:'Platts JKM Settlement', impact:'HIGH', dayOfWeek:5, recurring:true },
    { name:'GIIGNL Annual Report Release', impact:'MEDIUM', monthDay:20 },
    { name:'ICE TTF Options Expiry', impact:'HIGH', monthDay:25 },
    { name:'EIA Natural Gas Monthly (LNG Exports)', impact:'HIGH', monthDay:28 },
    { name:'Asian Spot Tender Deadline Window', impact:'MEDIUM', dayOfWeek:3, recurring:true },
  ]
};

function renderCalendar(containerId, sector) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const events = CALENDAR_EVENTS[sector] || [];
  const now = new Date();

  const items = events.map(ev => {
    let daysAway;
    if (ev.recurring && ev.dayOfWeek !== undefined) {
      const today = now.getDay();
      daysAway = (ev.dayOfWeek - today + 7) % 7;
      if (daysAway === 0) daysAway = 0; // today
    } else if (ev.monthDay !== undefined) {
      // Anchor to a specific day of the month — if passed, show next month
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), ev.monthDay);
      if (thisMonth >= now) {
        daysAway = Math.ceil((thisMonth - now) / 86400000);
      } else {
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, ev.monthDay);
        daysAway = Math.ceil((nextMonth - now) / 86400000);
      }
    } else {
      daysAway = ev.daysAway || 0;
    }
    const evDate = new Date(now.getTime() + daysAway * 86400000);
    return { ...ev, daysAway, date: evDate };
  }).sort((a, b) => a.daysAway - b.daysAway);

  container.innerHTML = items.map(ev => {
    const dateStr = ev.date.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    const daysLabel = ev.daysAway === 0 ? 'Today' : ev.daysAway === 1 ? 'Tomorrow' : ev.daysAway + 'd away';
    return `<div class="cal-item">
      <span class="cal-date">${dateStr}</span>
      <span class="cal-name">${ev.name}</span>
      <span class="cal-impact ${ev.impact.toLowerCase()}">${ev.impact}</span>
      <span class="cal-days">${daysLabel}</span>
    </div>`;
  }).join('');
}

/* =====================================================================
   EIA DATA FETCHING
   ===================================================================== */
let eiaLoaded = { ng: false, crude: false };

async function fetchEiaData() {
  // Helper to show error in EIA widget
  function showEiaError(ids, msg) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) { el.textContent = '—'; el.title = msg; }
    }
  }

  // Natural Gas Storage
  try {
    const ngResp = await fetch('/api/eia/ng_storage');
    const ngJson = await ngResp.json();
    if (ngJson.success && ngJson.data && ngJson.data.data && ngJson.data.data.length >= 2) {
      const rows = ngJson.data.data;
      const latest = rows[0];
      const prev = rows[1];
      const val = parseFloat(latest.value);
      const prevVal = parseFloat(prev.value);
      const change = val - prevVal;
      document.getElementById('ngEiaStorage').textContent = val.toLocaleString() + ' Bcf';
      const changeEl = document.getElementById('ngEiaChange');
      changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(0) + ' Bcf';
      changeEl.style.color = change >= 0 ? 'var(--green)' : 'var(--red)';
      document.getElementById('ngEiaDate').textContent = latest.period;
      if (rows.length >= 52) {
        const avg52 = rows.slice(0, 52).reduce((s, r) => s + parseFloat(r.value || 0), 0) / 52;
        const diff = val - avg52;
        const pct = ((diff / avg52) * 100).toFixed(1);
        const avgEl = document.getElementById('ngEia5yr');
        avgEl.textContent = (diff >= 0 ? '+' : '') + pct + '%';
        avgEl.style.color = diff >= 0 ? 'var(--green)' : 'var(--red)';
      }
      eiaLoaded.ng = true;
    } else if (ngJson.error) {
      console.warn('EIA NG error:', ngJson.error);
      showEiaError(['ngEiaStorage'], ngJson.error.includes('not configured') ? 'API key not set' : 'Error');
    }
  } catch (e) { console.warn('EIA NG fetch failed:', e); }

  // Crude Inventory
  try {
    const crudeResp = await fetch('/api/eia/crude_inventory');
    const crudeJson = await crudeResp.json();
    if (crudeJson.success && crudeJson.data && crudeJson.data.data && crudeJson.data.data.length >= 2) {
      const rows = crudeJson.data.data;
      const latest = rows[0];
      const prev = rows[1];
      const val = parseFloat(latest.value);
      const prevVal = parseFloat(prev.value);
      const change = val - prevVal;
      document.getElementById('crudeEiaInv').textContent = (val / 1000).toFixed(1) + 'M bbl';
      const changeEl = document.getElementById('crudeEiaChange');
      changeEl.textContent = (change >= 0 ? '+' : '') + (change / 1000).toFixed(1) + 'M bbl';
      changeEl.style.color = change <= 0 ? 'var(--green)' : 'var(--red)';
      document.getElementById('crudeEiaDate').textContent = latest.period;
      eiaLoaded.crude = true;
    } else if (crudeJson.error) {
      console.warn('EIA crude error:', crudeJson.error);
    }
  } catch (e) { console.warn('EIA crude fetch failed:', e); }

  // Cushing Stocks
  try {
    const cushResp = await fetch('/api/eia/crude_cushing');
    const cushJson = await cushResp.json();
    if (cushJson.success && cushJson.data && cushJson.data.data && cushJson.data.data.length >= 1) {
      const val = parseFloat(cushJson.data.data[0].value);
      document.getElementById('crudeEiaCushing').textContent = (val / 1000).toFixed(1) + 'M bbl';
    }
  } catch (e) { console.warn('EIA Cushing fetch failed:', e); }

  // If nothing loaded, log debug hint
  if (!eiaLoaded.ng && !eiaLoaded.crude) {
    console.info('%c EIA data not loading? Visit /api/eia-debug in your browser to diagnose.', 'color: #f59e0b; font-weight: bold;');
  }
}

/* =====================================================================
   CFTC COMMITMENT OF TRADERS
   ===================================================================== */
let cotLoaded = { ng: false, crude: false };

async function fetchCotData() {
  for (const commodity of ['ng', 'crude']) {
    const container = document.getElementById(commodity + 'CotContent');
    if (!container) continue;
    try {
      const resp = await fetch(`/api/cot/${commodity}`);
      const json = await resp.json();
      if (json.success && json.data && json.data.data && json.data.data.length >= 2) {
        renderCotWidget(container, json.data.data, commodity);
        cotLoaded[commodity] = true;
      } else {
        container.innerHTML = '<div class="cot-loading" style="color:var(--text-muted)">COT data unavailable</div>';
      }
    } catch (e) {
      console.warn(`COT ${commodity} fetch failed:`, e);
      container.innerHTML = '<div class="cot-loading" style="color:var(--text-muted)">COT data unavailable</div>';
    }
  }
}

function renderCotWidget(container, data, commodity) {
  const latest = data[0];
  const prev = data[1];
  const oi = latest.oi || 1;

  const categories = [
    { label: 'Prod/Merchant', long: latest.prod_long, short: latest.prod_short, pLong: prev.prod_long, pShort: prev.prod_short },
    { label: 'Swap Dealers', long: latest.swap_long, short: latest.swap_short, pLong: prev.swap_long, pShort: prev.swap_short },
    { label: 'Money Mgrs', long: latest.mm_long, short: latest.mm_short, pLong: prev.mm_long, pShort: prev.mm_short },
    { label: 'Other Rptbl', long: latest.other_long, short: latest.other_short, pLong: prev.other_long, pShort: prev.other_short },
    { label: 'Non-Reportable', long: latest.nonrept_long, short: latest.nonrept_short, pLong: prev.nonrept_long, pShort: prev.nonrept_short },
  ];

  const maxPos = Math.max(...categories.map(c => Math.max(c.long, c.short)), 1);

  let html = '';
  for (const cat of categories) {
    const lPct = (cat.long / maxPos * 100).toFixed(1);
    const sPct = (cat.short / maxPos * 100).toFixed(1);
    const net = cat.long - cat.short;
    const prevNet = cat.pLong - cat.pShort;
    const netChg = net - prevNet;
    html += `<div class="cot-row">
      <span class="cot-label">${cat.label}</span>
      <div class="cot-bar-wrap" title="Long: ${cat.long.toLocaleString()} | Short: ${cat.short.toLocaleString()}">
        <div class="cot-bar-long" style="width:${lPct}%"></div>
      </div>
      <div class="cot-bar-wrap" title="Short: ${cat.short.toLocaleString()}">
        <div class="cot-bar-short" style="width:${sPct}%"></div>
      </div>
      <span class="cot-val" style="color:${net>=0?'var(--green)':'var(--red)'}">${net>=0?'+':''}${(net/1000).toFixed(1)}K <span style="font-size:9px;color:var(--text-muted)">${netChg>=0?'▲':'▼'}${Math.abs(netChg/1000).toFixed(1)}K</span></span>
    </div>`;
  }

  // Summary stats
  const mmNet = latest.mm_long - latest.mm_short;
  const prevMmNet = prev.mm_long - prev.mm_short;
  const mmChg = mmNet - prevMmNet;
  const prodNet = latest.prod_long - latest.prod_short;

  html += `<div class="cot-summary">
    <div class="eia-item"><div class="eia-label">Report Date</div><div class="eia-value" style="font-size:13px">${latest.date}</div></div>
    <div class="eia-item"><div class="eia-label">Open Interest</div><div class="eia-value" style="font-size:13px">${(oi/1000).toFixed(0)}K</div></div>
    <div class="eia-item"><div class="eia-label">Money Mgr Net</div><div class="eia-value" style="font-size:13px;color:${mmNet>=0?'var(--green)':'var(--red)'}">${(mmNet/1000).toFixed(1)}K</div></div>
    <div class="eia-item"><div class="eia-label">MM Net Δ (wk)</div><div class="eia-value" style="font-size:13px;color:${mmChg>=0?'var(--green)':'var(--red)'}">${mmChg>=0?'+':''}${(mmChg/1000).toFixed(1)}K</div></div>
  </div>`;

  html += `<div style="margin-top:8px;font-size:10px;color:var(--text-muted);display:flex;gap:16px;align-items:center">
    <span><span style="display:inline-block;width:10px;height:10px;background:#10b981;border-radius:2px;vertical-align:middle"></span> Long</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;vertical-align:middle"></span> Short</span>
    <span style="margin-left:auto">Net = Long − Short | Source: CFTC Disaggregated</span>
  </div>`;

  container.innerHTML = html;
}

/* =====================================================================
   OPTIONS CHAIN ENGINE — Black-Scholes Pricing
   ===================================================================== */

// Standard normal CDF (Abramowitz & Stegun approximation)
function normCDF(x) {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t * Math.exp(-x*x);
  return 0.5 * (1.0 + sign * y);
}

function normPDF(x) { return Math.exp(-0.5*x*x) / Math.sqrt(2*Math.PI); }

// Black-Scholes pricing
function bsPrice(S, K, T, r, sigma, type) {
  if (T <= 0) return Math.max(type === 'call' ? S-K : K-S, 0);
  const d1 = (Math.log(S/K) + (r + 0.5*sigma*sigma)*T) / (sigma*Math.sqrt(T));
  const d2 = d1 - sigma*Math.sqrt(T);
  if (type === 'call') return S*normCDF(d1) - K*Math.exp(-r*T)*normCDF(d2);
  return K*Math.exp(-r*T)*normCDF(-d2) - S*normCDF(-d1);
}

// Greeks
function bsGreeks(S, K, T, r, sigma, type) {
  if (T <= 0.001) T = 0.001;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S/K) + (r + 0.5*sigma*sigma)*T) / (sigma*sqrtT);
  const d2 = d1 - sigma*sqrtT;
  const nd1 = normPDF(d1);
  const Nd1 = normCDF(d1);
  const Nd2 = normCDF(d2);

  let delta, theta;
  if (type === 'call') {
    delta = Nd1;
    theta = (-S*nd1*sigma/(2*sqrtT) - r*K*Math.exp(-r*T)*Nd2) / 365;
  } else {
    delta = Nd1 - 1;
    theta = (-S*nd1*sigma/(2*sqrtT) + r*K*Math.exp(-r*T)*normCDF(-d2)) / 365;
  }
  const gamma = nd1 / (S * sigma * sqrtT);
  const vega = S * nd1 * sqrtT / 100;
  const rho = type === 'call' ? K*T*Math.exp(-r*T)*Nd2/100 : -K*T*Math.exp(-r*T)*normCDF(-d2)/100;

  return { delta, gamma, theta, vega, rho };
}

// Generate strike intervals appropriate for commodity
function getStrikeInterval(price) {
  if (price < 5) return 0.25;
  if (price < 20) return 0.50;
  if (price < 50) return 1.0;
  if (price < 100) return 2.5;
  if (price < 500) return 5.0;
  return 10.0;
}

// Generate full options chain data
function generateOptionsChain(sector) {
  const hub = getSelectedHub(sector);
  const spot = getPrice(hub);
  const hubObj = findHub(hub);
  if (!spot || !hubObj) return null;

  const fwd = STATE.forwardCurves[hub] || [];
  const expirySelect = document.getElementById(sector + 'OptExpiry');
  const strikeCountEl = document.getElementById(sector + 'OptStrikes');
  const expiryIdx = expirySelect ? parseInt(expirySelect.value) || 0 : 0;
  const numStrikes = strikeCountEl ? parseInt(strikeCountEl.value) || 9 : 9;

  const now = new Date();
  const futPrice = fwd[expiryIdx] ? fwd[expiryIdx].price : spot;
  const futOI = fwd[expiryIdx] ? fwd[expiryIdx].oi : 10000;
  const T = (expiryIdx + 1) / 12; // time to expiry in years
  const r = 0.045; // risk-free rate
  const baseVol = hubObj.vol / 100 * 2.5; // annualized vol from hub params
  const interval = getStrikeInterval(futPrice);
  const atm = Math.round(futPrice / interval) * interval;

  const half = Math.floor(numStrikes / 2);
  const strikes = [];
  for (let i = -half; i <= half; i++) {
    strikes.push(+(atm + i * interval).toFixed(4));
  }

  // Generate chain with skew
  const chain = strikes.map(K => {
    const moneyness = Math.log(K / futPrice);
    const skew = 1 + 0.15 * moneyness * moneyness + 0.05 * moneyness; // vol smile
    const iv = baseVol * skew * (0.9 + Math.random() * 0.2);

    const callPrice = bsPrice(futPrice, K, T, r, iv, 'call');
    const putPrice = bsPrice(futPrice, K, T, r, iv, 'put');
    const callGreeks = bsGreeks(futPrice, K, T, r, iv, 'call');
    const putGreeks = bsGreeks(futPrice, K, T, r, iv, 'put');

    // Simulated bid/ask spread (tighter ATM, wider OTM)
    const spreadPct = 0.02 + Math.abs(moneyness) * 0.05;
    const callBid = Math.max(0, callPrice * (1 - spreadPct));
    const callAsk = callPrice * (1 + spreadPct);
    const putBid = Math.max(0, putPrice * (1 - spreadPct));
    const putAsk = putPrice * (1 + spreadPct);

    // Simulated volume & OI (higher ATM)
    const atmFactor = Math.exp(-3 * moneyness * moneyness);
    const callVol = Math.floor(50 + atmFactor * 2000 * Math.random());
    const putVol = Math.floor(40 + atmFactor * 1800 * Math.random());
    const callOI = Math.floor(500 + atmFactor * futOI * 0.3 * (0.5 + Math.random()));
    const putOI = Math.floor(400 + atmFactor * futOI * 0.25 * (0.5 + Math.random()));

    return {
      strike: K, iv, T, futPrice,
      call: { price: callPrice, bid: callBid, ask: callAsk, vol: callVol, oi: callOI, ...callGreeks },
      put: { price: putPrice, bid: putBid, ask: putAsk, vol: putVol, oi: putOI, ...putGreeks },
      isATM: Math.abs(K - atm) < interval * 0.01,
      callITM: K < futPrice,
      putITM: K > futPrice,
    };
  });

  return { chain, futPrice, atm, T, r, baseVol, hub, interval, fwd, expiryIdx };
}

// Toggle section open/close
function toggleOptSection(sector) {
  const section = document.getElementById(sector + 'OptSection');
  const wasOpen = section.classList.contains('open');
  section.classList.toggle('open');
  if (!wasOpen) {
    initOptExpiry(sector);
    renderOptionsChain(sector);
  }
}

function initOptExpiry(sector) {
  const hub = getSelectedHub(sector);
  const fwd = STATE.forwardCurves[hub] || [];
  const select = document.getElementById(sector + 'OptExpiry');
  if (!select || select.options.length > 0) return;
  const now = new Date();
  fwd.forEach((pt, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const label = d.toLocaleDateString('en-US', { month:'short', year:'numeric' });
    select.add(new Option(label, i));
  });
}

// View switching
function setOptView(sector, view, btn) {
  const views = ['Chain','Oi','Payoff'];
  views.forEach(v => {
    const el = document.getElementById(sector + 'Opt' + v + 'View');
    if (el) el.style.display = 'none';
  });
  document.getElementById(sector + 'Opt' + view.charAt(0).toUpperCase() + view.slice(1) + 'View').style.display = 'block';
  btn.parentElement.querySelectorAll('.opt-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  if (view === 'oi') renderOiChart(sector);
  if (view === 'payoff') renderPayoff(sector);
}

// Main chain render
function renderOptionsChain(sector) {
  const data = generateOptionsChain(sector);
  if (!data) return;

  // Update hub label
  const hubLabel = document.getElementById(sector + 'OptHub');
  if (hubLabel) hubLabel.textContent = data.hub;

  // Summary bar
  const summary = document.getElementById(sector + 'OptSummary');
  const totalCallOI = data.chain.reduce((s, r) => s + r.call.oi, 0);
  const totalPutOI = data.chain.reduce((s, r) => s + r.put.oi, 0);
  const pcRatio = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : '—';
  const totalCallVol = data.chain.reduce((s, r) => s + r.call.vol, 0);
  const totalPutVol = data.chain.reduce((s, r) => s + r.put.vol, 0);
  const avgIV = (data.chain.reduce((s, r) => s + r.iv, 0) / data.chain.length * 100).toFixed(1);
  summary.innerHTML = `
    <div class="eia-item"><div class="eia-label">Underlying</div><div class="eia-value">$${data.futPrice.toFixed(data.futPrice<10?3:2)}</div></div>
    <div class="eia-item"><div class="eia-label">ATM IV</div><div class="eia-value">${avgIV}%</div></div>
    <div class="eia-item"><div class="eia-label">Put/Call Ratio</div><div class="eia-value" style="color:${pcRatio>1?'var(--red)':'var(--green)'}">${pcRatio}</div></div>
    <div class="eia-item"><div class="eia-label">Call Volume</div><div class="eia-value">${totalCallVol.toLocaleString()}</div></div>
    <div class="eia-item"><div class="eia-label">Put Volume</div><div class="eia-value">${totalPutVol.toLocaleString()}</div></div>
    <div class="eia-item"><div class="eia-label">Days to Expiry</div><div class="eia-value">${Math.round(data.T * 365)}</div></div>`;

  // Chain table
  const table = document.getElementById(sector + 'OptChain');
  const maxVol = Math.max(...data.chain.map(r => Math.max(r.call.vol, r.put.vol)), 1);
  const dp = data.futPrice < 10 ? 4 : 2;
  const sdp = data.futPrice < 10 ? 2 : 2;

  table.querySelector('thead').innerHTML = `<tr>
    <th class="call-side">OI</th><th class="call-side">Vol</th><th class="call-side">Bid</th>
    <th class="call-side">Ask</th><th class="call-side">Last</th><th class="call-side">IV</th><th class="call-side">Δ</th>
    <th class="strike-col">Strike</th>
    <th class="put-side">Δ</th><th class="put-side">IV</th><th class="put-side">Last</th>
    <th class="put-side">Bid</th><th class="put-side">Ask</th><th class="put-side">Vol</th><th class="put-side">OI</th>
  </tr>`;

  table.querySelector('tbody').innerHTML = data.chain.map(r => {
    const cls = r.isATM ? 'atm' : '';
    const cCls = r.callITM ? 'itm' : 'otm';
    const pCls = r.putITM ? 'itm' : 'otm';
    const cVolBar = (r.call.vol / maxVol * 30).toFixed(0);
    const pVolBar = (r.put.vol / maxVol * 30).toFixed(0);
    return `<tr class="${cls}">
      <td class="call-side ${cCls}">${r.call.oi.toLocaleString()}</td>
      <td class="call-side ${cCls}"><span class="vol-bar" style="width:${cVolBar}px"></span>${r.call.vol}</td>
      <td class="call-side ${cCls}">${r.call.bid.toFixed(dp)}</td>
      <td class="call-side ${cCls}">${r.call.ask.toFixed(dp)}</td>
      <td class="call-side ${cCls}" style="font-weight:600">${r.call.price.toFixed(dp)}</td>
      <td class="call-side ${cCls}">${(r.iv*100).toFixed(1)}%</td>
      <td class="call-side ${cCls}">${r.call.delta.toFixed(3)}</td>
      <td class="strike-col">${r.strike.toFixed(sdp)}</td>
      <td class="put-side ${pCls}">${r.put.delta.toFixed(3)}</td>
      <td class="put-side ${pCls}">${(r.iv*100).toFixed(1)}%</td>
      <td class="put-side ${pCls}" style="font-weight:600">${r.put.price.toFixed(dp)}</td>
      <td class="put-side ${pCls}">${r.put.bid.toFixed(dp)}</td>
      <td class="put-side ${pCls}">${r.put.ask.toFixed(dp)}</td>
      <td class="put-side ${pCls}"><span class="vol-bar" style="width:${pVolBar}px"></span>${r.put.vol}</td>
      <td class="put-side ${pCls}">${r.put.oi.toLocaleString()}</td>
    </tr>`;
  }).join('');
}

// OI by Expiry chart
function renderOiChart(sector) {
  const hub = getSelectedHub(sector);
  const fwd = STATE.forwardCurves[hub] || [];
  const canvas = document.getElementById(sector + 'OiCanvas');
  if (!canvas || !fwd.length) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;

  ctx.clearRect(0, 0, W, H);

  const now = new Date();
  const labels = fwd.map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    return d.toLocaleDateString('en-US', { month:'short' });
  });
  const maxOI = Math.max(...fwd.map(p => p.oi), 1);
  const barW = (W - 60) / fwd.length * 0.7;
  const gap = (W - 60) / fwd.length;

  // Draw bars
  fwd.forEach((pt, i) => {
    const x = 40 + i * gap + gap * 0.15;
    const barH = (pt.oi / maxOI) * (H - 40);
    const y = H - 25 - barH;

    const gradient = ctx.createLinearGradient(x, y, x, H - 25);
    gradient.addColorStop(0, 'rgba(34,211,238,0.8)');
    gradient.addColorStop(1, 'rgba(34,211,238,0.2)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barW, barH);

    // Label
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px IBM Plex Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + barW/2, H - 8);

    // Value on top
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '9px IBM Plex Mono, monospace';
    ctx.fillText((pt.oi/1000).toFixed(1)+'K', x + barW/2, y - 4);
  });

  // Y axis label
  ctx.save();
  ctx.translate(10, H/2);
  ctx.rotate(-Math.PI/2);
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Open Interest', 0, 0);
  ctx.restore();
}

// Strategy definitions
const STRATEGIES = {
  long_call:     { name:'Long Call',       legs: [{type:'call',dir:1,strikeOff:0}], desc:'Bullish bet with limited downside. Max loss = premium paid. Unlimited upside potential.' },
  long_put:      { name:'Long Put',        legs: [{type:'put',dir:1,strikeOff:0}], desc:'Bearish bet with limited upside risk. Max loss = premium paid. Profits as price falls.' },
  covered_call:  { name:'Covered Call',    legs: [{type:'fut',dir:1},{type:'call',dir:-1,strikeOff:1}], desc:'Own the future, sell upside via call. Generates income but caps gains. Popular yield strategy.' },
  protective_put:{ name:'Protective Put',  legs: [{type:'fut',dir:1},{type:'put',dir:1,strikeOff:-1}], desc:'Own the future, buy downside protection via put. Insurance against price drop.' },
  bull_spread:   { name:'Bull Call Spread', legs: [{type:'call',dir:1,strikeOff:-1},{type:'call',dir:-1,strikeOff:1}], desc:'Bullish spread. Buy lower call, sell higher call. Limited risk and limited reward.' },
  bear_spread:   { name:'Bear Put Spread',  legs: [{type:'put',dir:1,strikeOff:1},{type:'put',dir:-1,strikeOff:-1}], desc:'Bearish spread. Buy higher put, sell lower put. Limited risk and limited reward.' },
  straddle:      { name:'Long Straddle',   legs: [{type:'call',dir:1,strikeOff:0},{type:'put',dir:1,strikeOff:0}], desc:'Bet on volatility. Profits from large move in either direction. Max loss = both premiums.' },
  strangle:      { name:'Long Strangle',   legs: [{type:'call',dir:1,strikeOff:1},{type:'put',dir:1,strikeOff:-1}], desc:'Cheaper vol bet than straddle. Needs larger move to profit. OTM options reduce cost.' },
  iron_condor:   { name:'Iron Condor',     legs: [{type:'put',dir:-1,strikeOff:-1},{type:'put',dir:1,strikeOff:-2},{type:'call',dir:-1,strikeOff:1},{type:'call',dir:1,strikeOff:2}], desc:'Sell volatility. Profits if price stays within range. Max profit = net premium collected.' },
  butterfly:     { name:'Butterfly',       legs: [{type:'call',dir:1,strikeOff:-1},{type:'call',dir:-2,strikeOff:0},{type:'call',dir:1,strikeOff:1}], desc:'Low-cost bet that price stays near ATM. Max profit at center strike. Limited risk.' },
  collar:        { name:'Collar',          legs: [{type:'fut',dir:1},{type:'put',dir:1,strikeOff:-1},{type:'call',dir:-1,strikeOff:1}], desc:'Own the future, buy put protection, fund it by selling a call. Limits both upside and downside.' },
};

// Payoff diagram
function renderPayoff(sector) {
  const data = generateOptionsChain(sector);
  if (!data) return;

  const stratKey = document.getElementById(sector + 'StratSelect').value;
  const qty = parseInt(document.getElementById(sector + 'StratQty').value) || 10;
  const strat = STRATEGIES[stratKey];
  if (!strat) return;

  // Build legs
  const legs = strat.legs.map(leg => {
    const strikeIdx = Math.floor(data.chain.length / 2) + (leg.strikeOff || 0);
    const row = data.chain[Math.max(0, Math.min(strikeIdx, data.chain.length - 1))];
    if (leg.type === 'fut') return { type:'fut', dir: leg.dir, price: data.futPrice };
    const opt = row[leg.type];
    return { type: leg.type, dir: leg.dir, strike: row.strike, premium: opt.price, price: data.futPrice };
  });

  // Calculate P&L across price range
  const range = data.futPrice * 0.15;
  const low = data.futPrice - range;
  const high = data.futPrice + range;
  const steps = 200;
  const points = [];
  let minPL = Infinity, maxPL = -Infinity;

  for (let i = 0; i <= steps; i++) {
    const px = low + (high - low) * i / steps;
    let pl = 0;
    for (const leg of legs) {
      if (leg.type === 'fut') {
        pl += leg.dir * (px - leg.price) * qty;
      } else if (leg.type === 'call') {
        const intrinsic = Math.max(px - leg.strike, 0);
        pl += leg.dir * (intrinsic - leg.premium) * qty;
      } else {
        const intrinsic = Math.max(leg.strike - px, 0);
        pl += leg.dir * (intrinsic - leg.premium) * qty;
      }
    }
    points.push({ px, pl });
    minPL = Math.min(minPL, pl);
    maxPL = Math.max(maxPL, pl);
  }

  // Draw
  const canvas = document.getElementById(sector + 'PayoffCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  const pad = { left:55, right:20, top:20, bottom:30 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  // Extend P&L range for padding
  const plRange = maxPL - minPL || 1;
  const plPad = plRange * 0.1;
  const yMin = minPL - plPad;
  const yMax = maxPL + plPad;

  const toX = (px) => pad.left + (px - low) / (high - low) * cW;
  const toY = (pl) => pad.top + (1 - (pl - yMin) / (yMax - yMin)) * cH;

  // Zero line
  const zeroY = toY(0);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(W - pad.right, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Spot price line
  const spotX = toX(data.futPrice);
  ctx.strokeStyle = 'rgba(34,211,238,0.4)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(spotX, pad.top);
  ctx.lineTo(spotX, H - pad.bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#22d3ee';
  ctx.font = '10px IBM Plex Mono';
  ctx.textAlign = 'center';
  ctx.fillText('Spot', spotX, pad.top - 5);

  // Fill profit/loss areas
  ctx.beginPath();
  ctx.moveTo(toX(points[0].px), zeroY);
  points.forEach(p => ctx.lineTo(toX(p.px), toY(p.pl)));
  ctx.lineTo(toX(points[points.length-1].px), zeroY);
  ctx.closePath();
  // We need two separate fills for profit and loss
  // Simple approach: fill gradient from green to red based on zero crossing
  const gradY = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
  gradY.addColorStop(0, 'rgba(16,185,129,0.15)');
  gradY.addColorStop((zeroY - pad.top) / cH, 'rgba(16,185,129,0.05)');
  gradY.addColorStop((zeroY - pad.top) / cH + 0.01, 'rgba(239,68,68,0.05)');
  gradY.addColorStop(1, 'rgba(239,68,68,0.15)');
  ctx.fillStyle = gradY;
  ctx.fill();

  // P&L line
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = toX(p.px);
    const y = toY(p.pl);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Axes labels
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  const dp = data.futPrice < 10 ? 2 : 0;
  for (let i = 0; i <= 4; i++) {
    const px = low + (high - low) * i / 4;
    ctx.fillText('$' + px.toFixed(dp), toX(px), H - 8);
  }
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const pl = yMin + (yMax - yMin) * (1 - i / 4);
    ctx.fillText('$' + pl.toFixed(0), pad.left - 8, pad.top + cH * i / 4 + 4);
  }

  // Labels
  ctx.fillStyle = '#9ca3af';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('P&L', pad.left - 8, pad.top - 5);
  ctx.fillStyle = maxPL >= 0 ? '#10b981' : '#ef4444';
  ctx.font = 'bold 11px IBM Plex Mono';
  ctx.textAlign = 'left';
  ctx.fillText('Max P: $' + maxPL.toFixed(0), pad.left + 5, pad.top + 14);
  ctx.fillStyle = minPL <= 0 ? '#ef4444' : '#10b981';
  ctx.fillText('Max L: $' + minPL.toFixed(0), pad.left + 5, pad.top + 28);

  // Strategy description
  const descEl = document.getElementById(sector + 'StratDesc');
  if (descEl) {
    const legDesc = legs.map(l => {
      if (l.type === 'fut') return `${l.dir > 0 ? 'Long' : 'Short'} Future @ $${l.price.toFixed(dp)}`;
      return `${l.dir > 0 ? 'Buy' : 'Sell'} ${l.strike.toFixed(dp)} ${l.type.toUpperCase()} @ $${l.premium.toFixed(data.futPrice < 10 ? 4 : 2)}`;
    }).join(' + ');
    descEl.innerHTML = `<strong>${strat.name}</strong> × ${qty} — ${legDesc}<br><span style="color:var(--text-dim)">${strat.desc}</span>`;
  }
}

/* =====================================================================
   HUB INFO PANELS
   ===================================================================== */
const HUB_INFO = {
  'Henry Hub': { location:'Erath, Louisiana', desc:'The benchmark natural gas pricing point in North America. Henry Hub is the delivery point for NYMEX natural gas futures and serves as the primary reference for US gas trading.', contract:'10,000 MMBtu per contract', tick:'$0.001/MMBtu ($10/tick)', hours:'Sun-Fri 6:00pm-5:00pm ET', settlement:'Physical delivery', seasonal:'Prices typically peak in winter (Dec-Feb) during heating season and can spike during summer (Jul-Aug) on cooling demand. Shoulder months (Apr-May, Sep-Oct) tend to be lowest.', risks:'Hurricane exposure in Gulf of Mexico, storage injection/withdrawal patterns, LNG export demand, associated gas production from Permian Basin.', related:['Waha','Transco Zone 6','Dawn'] },
  'Waha': { location:'Permian Basin, West Texas', desc:'The main hub for Permian Basin associated gas. Waha often trades at a significant discount to Henry Hub due to pipeline takeaway constraints from the prolific Permian production region.', contract:'10,000 MMBtu', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Basis typically weakens (wider discount) when Permian oil production increases. Narrower basis during high-demand winters.', risks:'Pipeline capacity buildout, Permian oil production rates, flaring regulations, Gulf Coast LNG demand pulling gas east.', related:['Henry Hub','Kern River','Opal'] },
  'SoCal Gas': { location:'Southern California', desc:'Key delivery hub for Southern California gas demand. Prices are influenced by California environmental regulations, hydroelectric availability, and desert cooling demand.', contract:'10,000 MMBtu', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Physical', seasonal:'Summer peaks driven by power generation for cooling. Winter peaks are moderate. Hydro availability in spring can depress prices.', risks:'Aliso Canyon storage facility constraints, wildfire impacts on infrastructure, state environmental policy, renewable penetration reducing gas burn.', related:['CAISO SP15','Kern River','Malin'] },
  'Chicago': { location:'Chicago, Illinois', desc:'Major Midwest gas hub serving the Chicago metro area. A key intersection of multiple pipeline systems connecting Gulf supply, Appalachian supply, and Midwestern demand.', contract:'10,000 MMBtu', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Strong winter premium due to heating demand. Moderate summer prices. Shoulder seasons see basis compression.', risks:'Polar vortex events, pipeline maintenance on key corridors, Appalachian supply growth, industrial demand fluctuations.', related:['Henry Hub','Dawn','MISO Illinois'] },
  'Algonquin': { location:'Algonquin Citygate, New England', desc:'The primary pricing point for New England gas. Notorious for extreme winter volatility due to pipeline constraints into the region and heavy heating demand.', contract:'10,000 MMBtu', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Extreme winter spikes ($20-60+ during polar events). Summer basis is relatively flat. Most volatile hub in North America.', risks:'Pipeline capacity constraints (no new pipelines approved), LNG import dependence in winter, heating oil switching capability, Mystic Generating Station retirement.', related:['Transco Zone 6','NEPOOL Mass','Tetco M3'] },
  'Transco Zone 6': { location:'New York City area', desc:'Transco Zone 6 NY covers the New York City metropolitan gas market. Part of the Transcontinental Pipeline system, it is a critical hub for Northeast demand.', contract:'10,000 MMBtu', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Winter premium similar to Algonquin but less extreme. Summer basis is moderate. Cold snaps cause rapid basis expansion.', risks:'NYC building electrification mandates, pipeline expansion opposition, winter weather severity, power sector gas demand.', related:['Algonquin','NYISO Zone J','Tetco M3'] },
  'Dominion South': { location:'Appalachian Basin, Southwest PA', desc:'Hub for Marcellus/Utica shale gas production. Often trades at a discount to Henry Hub due to abundant local supply and pipeline takeaway constraints.', contract:'10,000 MMBtu', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Basis widens (deeper discount) when production is high and demand is low. Tighter in winter when local demand absorbs supply.', risks:'Marcellus/Utica production growth, pipeline capacity additions (MVP, regional projects), environmental regulations on drilling.', related:['Tetco M3','Henry Hub','Chicago'] },
  'Dawn': { location:'Dawn, Ontario, Canada', desc:'Major Canadian gas hub and storage center. Dawn serves as the benchmark for Eastern Canadian gas and connects to major US pipeline systems.', contract:'10,000 MMBtu (GJ equivalent)', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Winter premium on heating demand. Storage-driven trading around injection/withdrawal seasons.', risks:'Cross-border pipeline policy, Canadian production trends, storage capacity utilization, regulatory changes.', related:['Chicago','Henry Hub','NYISO Zone A'] },
  'Sumas': { location:'Sumas, Washington (US-Canada border)', desc:'Pacific Northwest border crossing hub for gas flowing between British Columbia and Washington/Oregon markets.', contract:'10,000 MMBtu', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Winter basis widens on Pacific NW heating demand. Hydro-heavy region means gas competes with cheap hydro in spring.', risks:'BC production trends, Enbridge T-South pipeline capacity, Pacific NW LNG project development, hydroelectric conditions.', related:['Malin','CAISO NP15','Dawn'] },
  'Malin': { location:'Malin, Oregon (OR-CA border)', desc:'Key interconnect between Pacific Northwest and California gas markets. Serves as a gateway for Canadian and Rockies gas flowing into California.', contract:'10,000 MMBtu', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Influenced by both California demand and PNW supply. Basis typically tracks between Sumas and SoCal Gas.', risks:'Ruby Pipeline flow dynamics, California regulatory changes, wildfire impacts, competing Rockies supply routes.', related:['SoCal Gas','Sumas','Kern River'] },
  'Opal': { location:'Opal, Wyoming', desc:'Rocky Mountain gas hub fed by Wyoming and Colorado production. A key supply-side hub for westbound gas flows to California and Pacific Northwest.', contract:'10,000 MMBtu', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Relatively stable pricing with moderate seasonal swings. Basis widths fluctuate with Rockies production levels.', risks:'Rockies production decline rates, pipeline flow reversals, competition with Permian gas for western markets.', related:['Kern River','Waha','Malin'] },
  'Tetco M3': { location:'Appalachian Basin, Eastern PA', desc:'Texas Eastern M3 zone covers the pipeline delivery area into the eastern Pennsylvania and New Jersey region. Closely correlated with Transco Zone 6 but reflects local Appalachian dynamics.', contract:'10,000 MMBtu', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Winter spikes correlate with Northeast cold events. Summer basis moderate. Close spread to Transco Z6.', risks:'Similar to Transco Z6 — pipeline constraints, Marcellus oversupply, local demand fluctuations.', related:['Transco Zone 6','Dominion South','Algonquin'] },
  'Kern River': { location:'Kern County, California', desc:'Delivery point on the Kern River Pipeline connecting Rocky Mountain production to California markets via the Mojave Desert corridor.', contract:'10,000 MMBtu', tick:'$0.001/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Tracks California demand patterns. Summer cooling demand supports prices. Spring hydro surplus weakens basis.', risks:'California energy transition, Kern River pipeline utilization rates, competing supply from Permian via El Paso line.', related:['SoCal Gas','Opal','Waha'] },
  'WTI Cushing': { location:'Cushing, Oklahoma', desc:'The benchmark crude oil pricing point for North America and the delivery hub for NYMEX WTI futures. Cushing is a major storage and pipeline crossroads.', contract:'1,000 BBL per contract', tick:'$0.01/BBL ($10/tick)', hours:'Sun-Fri 6:00pm-5:00pm ET', settlement:'Physical delivery', seasonal:'Seasonal builds in Q1, draws in summer driving season. Refinery maintenance (turnaround) in spring/fall.', risks:'OPEC+ production policy, US shale production growth, SPR releases, global demand outlook, Cushing storage levels.', related:['Brent Dated','WTI Midland','Mars Sour'] },
  'Brent Dated': { location:'North Sea, UK', desc:'The global benchmark crude oil price, representing light sweet crude from the North Sea. Used to price approximately 2/3 of globally traded crude.', contract:'1,000 BBL', tick:'$0.01/BBL', hours:'ICE 01:00-23:00 London', settlement:'Cash settled (ICE)', seasonal:'Global demand patterns, refinery runs, OPEC policy drive seasonal moves.', risks:'OPEC+ policy, North Sea production decline, geopolitical events (Middle East, Russia), global recession risk.', related:['WTI Cushing','Mars Sour','ANS'] },
  'WTI Midland': { location:'Midland, Texas (Permian Basin)', desc:'Represents crude oil priced at the Permian Basin wellhead. Typically trades at a slight premium or discount to Cushing depending on pipeline takeaway.', contract:'1,000 BBL', tick:'$0.01/BBL', hours:'OTC 24/7', settlement:'Financial', seasonal:'Follows WTI Cushing patterns. Basis fluctuates with pipeline capacity.', risks:'Permian production growth, pipeline capacity additions, refinery demand on Gulf Coast.', related:['WTI Cushing','LLS','Bakken'] },
  'Mars Sour': { location:'Gulf of Mexico', desc:'Medium sour crude grade from the Gulf of Mexico. Mars is a key benchmark for sour crude pricing and is heavily influenced by Gulf Coast refinery demand.', contract:'1,000 BBL', tick:'$0.01/BBL', hours:'OTC 24/7', settlement:'Financial', seasonal:'Sour crude premium strengthens when heavy/sour-capable refineries are running hard.', risks:'Gulf hurricane disruptions, OPEC sour crude supply, refinery coker capacity, IMO fuel specifications.', related:['WTI Cushing','LLS','WCS'] },
  'LLS': { location:'St. James, Louisiana', desc:'Louisiana Light Sweet is the primary domestic sweet crude benchmark for the Gulf Coast refining complex. Priced at the St. James terminal.', contract:'1,000 BBL', tick:'$0.01/BBL', hours:'OTC 24/7', settlement:'Physical', seasonal:'Premium typically strengthens during high refinery utilization periods.', risks:'Gulf Coast refinery demand, waterborne crude import competition, pipeline flows from Midcontinent.', related:['WTI Cushing','Mars Sour','Brent Dated'] },
  'ANS': { location:'Valdez, Alaska', desc:'Alaska North Slope crude, a medium-gravity sour grade shipped by tanker from Valdez to US West Coast refineries.', contract:'1,000 BBL', tick:'$0.01/BBL', hours:'OTC 24/7', settlement:'Financial', seasonal:'West Coast refinery demand and Trans-Alaska Pipeline throughput drive pricing.', risks:'TAPS pipeline throughput decline, West Coast refinery closures, competing Pacific Basin crudes.', related:['WTI Cushing','Brent Dated','WCS'] },
  'Bakken': { location:'Williston Basin, North Dakota', desc:'Light sweet crude from the Bakken shale play. Quality premium but transportation discounts due to limited pipeline access and rail dependence.', contract:'1,000 BBL', tick:'$0.01/BBL', hours:'OTC 24/7', settlement:'Financial', seasonal:'Basis widens when rail economics deteriorate or pipeline capacity is constrained.', risks:'DAPL pipeline legal challenges, rail transportation costs, North Dakota production volumes, winter operational challenges.', related:['WTI Cushing','WTI Midland','WCS'] },
  'WCS': { location:'Hardisty, Alberta, Canada', desc:'Western Canadian Select is the benchmark for Canadian heavy sour crude. Trades at a significant discount to WTI due to quality differential and transportation costs.', contract:'1,000 BBL', tick:'$0.01/BBL (CAD)', hours:'OTC 24/7', settlement:'Financial', seasonal:'Discount widens during refinery maintenance seasons and narrows when heavy crude demand is strong.', risks:'Trans Mountain pipeline expansion, Alberta production curtailments, US Midwest refinery demand, diluent availability.', related:['WTI Cushing','Mars Sour','Bakken'] },
  'ERCOT Hub': { location:'Texas (statewide)', desc:'The Electric Reliability Council of Texas Hub represents the load-weighted average across all ERCOT settlement points. Texas operates its own isolated grid.', contract:'50 MWh (on-peak block)', tick:'$0.01/MWh', hours:'OTC / ICE', settlement:'Financial', seasonal:'Extreme summer peaks (Jul-Aug) on cooling demand. Winter spikes possible (Feb 2021 event). Moderate shoulder seasons.', risks:'Extreme weather events, renewable intermittency, grid reliability concerns, generation retirements, political/regulatory intervention.', related:['ERCOT North','ERCOT South','SPP North'] },
  'ERCOT North': { location:'North Texas (Dallas/Fort Worth)', desc:'Settlement zone covering the Dallas-Fort Worth metroplex, the largest load center in ERCOT.', contract:'50 MWh', tick:'$0.01/MWh', hours:'OTC', settlement:'Financial', seasonal:'Follows ERCOT Hub patterns with slightly lower volatility than South zone.', risks:'Same as ERCOT Hub with localized transmission constraints.', related:['ERCOT Hub','ERCOT South','SPP North'] },
  'ERCOT South': { location:'South Texas (Houston/San Antonio)', desc:'Settlement zone covering the Houston and San Antonio areas, with significant industrial load and Gulf Coast exposure.', contract:'50 MWh', tick:'$0.01/MWh', hours:'OTC', settlement:'Financial', seasonal:'Higher summer peaks than North due to coastal humidity. Industrial base load adds stability.', risks:'Hurricane exposure, coastal flooding, petrochemical facility demand swings.', related:['ERCOT Hub','ERCOT North','Henry Hub'] },
  'PJM West Hub': { location:'Western PJM (PA/OH/WV)', desc:'The primary financial trading hub in the PJM Interconnection, covering the western portion of the world\'s largest power market.', contract:'50 MWh', tick:'$0.01/MWh', hours:'OTC / ICE', settlement:'Financial', seasonal:'Summer and winter peaks. Gas-on-the-margin pricing during peak hours.', risks:'Gas price exposure (Transco Z6), renewable buildout, capacity market design changes, coal plant retirements.', related:['NYISO Zone J','NEPOOL Mass','Transco Zone 6'] },
  'NEPOOL Mass': { location:'Massachusetts / New England', desc:'The New England Power Pool Massachusetts hub. New England is heavily gas-dependent for power generation with limited pipeline capacity.', contract:'50 MWh', tick:'$0.01/MWh', hours:'OTC', settlement:'Financial', seasonal:'Extreme winter spikes when gas prices soar (Algonquin basis). Moderate summer. Highest winter power prices in US.', risks:'Gas pipeline constraints, Mystic station retirement, offshore wind development, fuel security concerns.', related:['Algonquin','PJM West Hub','NYISO Zone J'] },
  'MISO Illinois': { location:'Illinois / Midwest', desc:'MISO Illinois hub covers the central portion of the Midcontinent ISO, a region with diverse generation mix including wind, gas, coal, and nuclear.', contract:'50 MWh', tick:'$0.01/MWh', hours:'OTC', settlement:'Financial', seasonal:'Moderate seasonal patterns. Wind generation can depress off-peak prices significantly.', risks:'Wind overbuild risk, coal retirements, Chicago gas price linkage, transmission constraints.', related:['Chicago','PJM West Hub','SPP North'] },
  'CAISO NP15': { location:'Northern California', desc:'California ISO North Path 15 hub, covering Northern California including the Bay Area. Heavy renewable penetration leads to unique pricing dynamics.', contract:'50 MWh', tick:'$0.01/MWh', hours:'OTC', settlement:'Financial', seasonal:'Duck curve: negative midday prices from solar, evening ramps. Summer heat events spike prices.', risks:'Solar curtailment, hydro availability, wildfire risk, gas plant retirements, battery storage buildout.', related:['CAISO SP15','SoCal Gas','Malin'] },
  'CAISO SP15': { location:'Southern California', desc:'California ISO South Path 15 hub covering the Los Angeles basin and Southern California. Similar duck curve dynamics to NP15.', contract:'50 MWh', tick:'$0.01/MWh', hours:'OTC', settlement:'Financial', seasonal:'Desert heat drives summer peaks. Solar-driven negative midday prices. Evening ramp steeper than NP15.', risks:'Same as NP15 plus desert solar overgeneration, transmission constraints on Path 15.', related:['CAISO NP15','SoCal Gas','ERCOT Hub'] },
  'NYISO Zone J': { location:'New York City', desc:'NYISO Zone J covers New York City, the most congested and expensive power zone in the eastern US. Transmission constraints keep prices elevated.', contract:'50 MWh', tick:'$0.01/MWh', hours:'OTC', settlement:'Financial', seasonal:'Summer peaks on AC demand. Winter peaks on heating-related electric load. Always premium to upstate.', risks:'Transmission constraints, Indian Point retirement impacts, gas pipeline availability, building electrification mandates.', related:['Transco Zone 6','PJM West Hub','NEPOOL Mass'] },
  'NYISO Zone A': { location:'Western New York (Buffalo)', desc:'NYISO Zone A covers western New York, benefiting from proximity to Niagara hydro and Canadian imports.', contract:'50 MWh', tick:'$0.01/MWh', hours:'OTC', settlement:'Financial', seasonal:'Lower and less volatile than Zone J. Hydro availability provides price stability.', risks:'Hydro conditions, Canadian import availability, limited gas pipeline expansion.', related:['Dawn','PJM West Hub','MISO Illinois'] },
  'SPP North': { location:'Great Plains (KS/OK/NE)', desc:'Southwest Power Pool North hub covering the wind-rich Great Plains. Among the lowest wholesale power prices due to massive wind generation.', contract:'50 MWh', tick:'$0.01/MWh', hours:'OTC', settlement:'Financial', seasonal:'Frequent negative prices during high wind periods. Summer has moderate peaks.', risks:'Wind curtailment, transmission buildout, negative price risk, limited storage.', related:['ERCOT Hub','MISO Illinois','Henry Hub'] },
  'Baltic Dry Index': { location:'Global (composite)', desc:'The BDI is a composite index of dry bulk shipping rates across Capesize, Panamax, and Supramax vessel classes. Widely watched as a barometer of global trade and commodity demand.', contract:'FFA ($/day or index pts)', tick:'1 index point', hours:'Baltic Exchange 09:00-17:00 London', settlement:'Financial (FFA)', seasonal:'Peaks during grain seasons (Q1 South America, Q3 North America) and Chinese restocking cycles. Weakest in Q4.', risks:'Chinese steel/iron ore demand, global grain trade, fleet supply growth, port congestion, geopolitical disruptions.', related:['Baltic Capesize','Baltic Panamax','Baltic Supramax'] },
  'Baltic Capesize': { location:'Global (iron ore/coal routes)', desc:'Capesize vessels (180,000+ DWT) primarily carry iron ore and coal on long-haul routes. Most volatile segment of dry bulk.', contract:'FFA ($/day)', tick:'$1/day', hours:'Baltic Exchange', settlement:'Financial', seasonal:'Heavily tied to Chinese iron ore imports. Q1 restocking and Q3 pre-winter builds drive rates.', risks:'Chinese property sector, Brazilian/Australian iron ore production, fleet ordering cycles, canal transit disruptions.', related:['Baltic Dry Index','Baltic Panamax','TD3C VLCC AG-East'] },
  'Baltic Panamax': { location:'Global (grain/coal routes)', desc:'Panamax vessels (65-80,000 DWT) are the workhorses of grain and minor bulk trades, sized to transit the Panama Canal.', contract:'FFA ($/day)', tick:'$1/day', hours:'Baltic Exchange', settlement:'Financial', seasonal:'South American grain season (Feb-May) and US grain season (Sep-Nov) drive seasonal peaks.', risks:'Global grain harvests, fertilizer trade, coal demand shifts, Panama Canal water levels/restrictions.', related:['Baltic Dry Index','Baltic Supramax','Baltic Capesize'] },
  'Baltic Supramax': { location:'Global (minor bulk routes)', desc:'Supramax/Ultramax vessels (50-65,000 DWT) with self-loading gear. Most versatile segment, trading a wide range of minor bulk commodities.', contract:'FFA ($/day)', tick:'$1/day', hours:'Baltic Exchange', settlement:'Financial', seasonal:'More diversified seasonal pattern than Capesize/Panamax. Regional trade flows dominate.', risks:'Regional commodity flows, port infrastructure, fleet age profile, trade route disruptions.', related:['Baltic Dry Index','Baltic Panamax','LNG Spot East'] },
  'TD3C VLCC AG-East': { location:'Arabian Gulf to East Asia', desc:'The benchmark dirty tanker route for VLCCs (Very Large Crude Carriers, 300,000+ DWT) from the Arabian Gulf to China/East Asia. Priced in Worldscale points.', contract:'FFA (Worldscale pts)', tick:'WS 0.5', hours:'Baltic Exchange', settlement:'Financial', seasonal:'Q4 Asian refinery runs drive rates. Summer OPEC output decisions impact. Red Sea diversions add ton-miles.', risks:'OPEC production/export volumes, geopolitical (Strait of Hormuz, Red Sea), fleet ordering, sanctions on tanker trade.', related:['TD20 Suezmax WAF','TC2 Transatlantic','Brent Dated'] },
  'TC2 Transatlantic': { location:'NW Europe to US Atlantic Coast', desc:'Benchmark clean tanker route for Medium Range (MR) vessels carrying refined products across the Atlantic.', contract:'FFA (Worldscale pts)', tick:'WS 0.5', hours:'Baltic Exchange', settlement:'Financial', seasonal:'Winter heating oil demand boosts transatlantic product flows. Summer gasoline demand supports rates.', risks:'Refinery utilization differentials, product stock levels, vessel supply, refinery closures.', related:['TD3C VLCC AG-East','TD20 Suezmax WAF','Brent Dated'] },
  'TD20 Suezmax WAF': { location:'West Africa to NW Europe', desc:'Suezmax tanker route (130-160,000 DWT) carrying crude from West Africa to European refineries.', contract:'FFA (Worldscale pts)', tick:'WS 0.5', hours:'Baltic Exchange', settlement:'Financial', seasonal:'West African crude export volumes and European refinery demand drive seasonal patterns.', risks:'Nigerian/Angolan production levels, European refinery demand, competing Atlantic Basin grades, Suez Canal disruptions.', related:['TD3C VLCC AG-East','TC2 Transatlantic','Brent Dated'] },
  'LNG Spot East': { location:'East Asia (JKM-linked)', desc:'Spot LNG freight rate for standard-size LNG carriers on East Asian routes, linked to JKM (Japan Korea Marker) pricing dynamics.', contract:'$/MMBtu equivalent', tick:'$0.01/MMBtu', hours:'OTC 24/7', settlement:'Financial', seasonal:'Winter demand spikes on Asian heating/power demand. Summer sees easing as European injection competes for cargoes.', risks:'LNG newbuild deliveries, Panama Canal LNG transit restrictions, Asian gas demand, floating storage economics.', related:['Baltic Dry Index','Henry Hub','TD3C VLCC AG-East'] },
  // Agriculture
  'Corn (CBOT)': { location:'Chicago Board of Trade', desc:'Most actively traded US grain futures contract. Benchmark for global corn pricing, heavily influenced by USDA reports and US crop conditions.', contract:'5,000 bushels', tick:'1/4 cent/bu ($12.50)', hours:'CME Globex: Sun-Fri', settlement:'Physical delivery', seasonal:'Planting pressure Mar-May, weather premium Jun-Aug, harvest pressure Sep-Nov.', risks:'USDA WASDE reports, weather/drought, ethanol mandate, China demand, S. American supply.', related:['Soybeans (CBOT)','Wheat (CBOT)','Soybean Meal (CBOT)'] },
  'Soybeans (CBOT)': { location:'Chicago Board of Trade', desc:'Key oilseed futures contract reflecting global protein/oil demand. China is the dominant importer, making trade policy a major price driver.', contract:'5,000 bushels', tick:'1/4 cent/bu ($12.50)', hours:'CME Globex: Sun-Fri', settlement:'Physical delivery', seasonal:'S. American harvest Feb-May, US planting Jun-Jul, US harvest Sep-Nov.', risks:'China demand, Brazilian production, soybean crush margins, trade policy, USD strength.', related:['Corn (CBOT)','Soybean Oil (CBOT)','Soybean Meal (CBOT)'] },
  'Wheat (CBOT)': { location:'Chicago Board of Trade', desc:'Soft red winter wheat futures, the most liquid wheat contract globally. Influenced by Black Sea production, US/EU crops, and import demand.', contract:'5,000 bushels', tick:'1/4 cent/bu ($12.50)', hours:'CME Globex: Sun-Fri', settlement:'Physical delivery', seasonal:'Winter kill risk Dec-Feb, spring development Apr-May, harvest Jun-Jul.', risks:'Black Sea geopolitics, drought, India/China export policy, substitution with corn.', related:['Corn (CBOT)','Soybeans (CBOT)'] },
  'Soybean Oil (CBOT)': { location:'Chicago Board of Trade', desc:'Soybean oil futures, driven by biodiesel demand, food consumption, and crush economics. Increasingly linked to renewable diesel policy.', contract:'60,000 lbs', tick:'$0.0001/lb ($6.00)', hours:'CME Globex: Sun-Fri', settlement:'Physical delivery', seasonal:'Biofuel blending mandates, palm oil competition, S. American crush.', risks:'RFS/biodiesel mandates, palm oil prices, Chinese import policy, crush margins.', related:['Soybeans (CBOT)','Soybean Meal (CBOT)'] },
  'Soybean Meal (CBOT)': { location:'Chicago Board of Trade', desc:'Primary protein feed ingredient for livestock globally. Crush margins and livestock feeding economics are key drivers.', contract:'100 short tons', tick:'$0.10/ton ($10.00)', hours:'CME Globex: Sun-Fri', settlement:'Physical delivery', seasonal:'Livestock feeding cycles, S. American crush capacity, US export program.', risks:'Crush margins, livestock herd sizes, Argentine export taxes, Chinese demand.', related:['Soybeans (CBOT)','Soybean Oil (CBOT)','Live Cattle (CME)'] },
  'Cotton (ICE)': { location:'ICE Futures US', desc:'Cotton No.2 futures, the global benchmark for cotton pricing. Driven by textile demand, weather in key growing regions, and USDA data.', contract:'50,000 lbs', tick:'$0.0001/lb ($5.00)', hours:'ICE: Mon-Fri', settlement:'Physical delivery', seasonal:'US planting Apr-Jun, monsoon impact Jul-Sep, harvest Oct-Dec.', risks:'China textile demand, Indian production, weather in US Delta/Texas, polyester competition.', related:['Corn (CBOT)','Sugar #11 (ICE)'] },
  'Sugar #11 (ICE)': { location:'ICE Futures US', desc:'World sugar futures (raw cane sugar), the global benchmark. Brazilian production and ethanol economics dominate price action.', contract:'112,000 lbs', tick:'$0.0001/lb ($11.20)', hours:'ICE: Mon-Fri', settlement:'Physical delivery', seasonal:'Brazilian crush season Apr-Nov, Indian export policy Oct-Mar.', risks:'Brazilian ethanol policy, Indian export subsidies, Thai/Australian production, El Niño.', related:['Coffee C (ICE)','Cotton (ICE)'] },
  'Coffee C (ICE)': { location:'ICE Futures US', desc:'Arabica coffee futures, the global benchmark for washed arabica. Brazilian and Colombian production dominate supply-side fundamentals.', contract:'37,500 lbs', tick:'$0.0005/lb ($18.75)', hours:'ICE: Mon-Fri', settlement:'Physical delivery', seasonal:'Brazilian frost risk Jun-Aug, flowering Oct-Dec, harvest May-Sep.', risks:'Brazilian frost/drought, Vietnamese robusta competition, freight costs, consumption trends.', related:['Sugar #11 (ICE)','Cocoa (ICE)'] },
  'Cocoa (ICE)': { location:'ICE Futures US', desc:'Cocoa futures representing global cocoa bean pricing. West African production (Ivory Coast, Ghana) dominates supply.', contract:'10 metric tons', tick:'$1/MT ($10.00)', hours:'ICE: Mon-Fri', settlement:'Physical delivery', seasonal:'West African main crop Oct-Mar, mid-crop May-Aug, grinding demand.', risks:'West African weather/disease, Ivory Coast/Ghana policy, chocolate demand, currency moves.', related:['Coffee C (ICE)','Sugar #11 (ICE)'] },
  'Live Cattle (CME)': { location:'CME Group', desc:'Live cattle futures for fed cattle (1,050-1,350 lbs). Driven by feedlot economics, consumer beef demand, and cattle cycle dynamics.', contract:'40,000 lbs', tick:'$0.00025/lb ($10.00)', hours:'CME Globex: Sun-Fri', settlement:'Physical delivery', seasonal:'Grilling season demand May-Aug, feedlot placements, cattle-on-feed reports.', risks:'Cattle cycle, feed costs, packer margins, consumer demand, trade policy.', related:['Feeder Cattle (CME)','Lean Hogs (CME)','Corn (CBOT)'] },
  'Lean Hogs (CME)': { location:'CME Group', desc:'Lean hog futures representing the US pork market. More volatile than cattle due to shorter production cycles and disease sensitivity.', contract:'40,000 lbs', tick:'$0.00025/lb ($10.00)', hours:'CME Globex: Sun-Fri', settlement:'Cash settled', seasonal:'Holiday demand Dec, summer grilling Jun-Aug, seasonal production patterns.', risks:'ASF disease risk, China pork imports, feed costs, packer capacity, cold storage levels.', related:['Live Cattle (CME)','Corn (CBOT)','Soybean Meal (CBOT)'] },
  'Feeder Cattle (CME)': { location:'CME Group', desc:'Feeder cattle futures for 700-849 lb steers. Driven by the spread between expected fed cattle prices and feed costs.', contract:'50,000 lbs', tick:'$0.00025/lb ($12.50)', hours:'CME Globex: Sun-Fri', settlement:'Cash settled (CME Feeder Cattle Index)', seasonal:'Fall placements Sep-Nov, spring grass season, drought impacts on pasture.', risks:'Corn prices, drought/pasture conditions, cattle cycle, fed cattle prices.', related:['Live Cattle (CME)','Corn (CBOT)'] },
  // Metals
  'Gold (COMEX)': { location:'COMEX (CME Group)', desc:'Global benchmark for gold pricing. Primary safe-haven asset driven by central bank policy, real interest rates, and geopolitical risk.', contract:'100 troy oz', tick:'$0.10/oz ($10.00)', hours:'CME Globex: Sun-Fri', settlement:'Physical delivery', seasonal:'Indian wedding season Oct-Dec, Chinese New Year buying, central bank reserve management.', risks:'Fed rate policy, USD strength, central bank buying, geopolitical events, real yields.', related:['Silver (COMEX)','Platinum (NYMEX)','Copper (COMEX)'] },
  'Silver (COMEX)': { location:'COMEX (CME Group)', desc:'Dual industrial/precious metal. Solar panel demand and electronics drive industrial use (~50%), while investment demand follows gold.', contract:'5,000 troy oz', tick:'$0.005/oz ($25.00)', hours:'CME Globex: Sun-Fri', settlement:'Physical delivery', seasonal:'Gold correlation, solar installations, electronics manufacturing cycles.', risks:'Gold prices, solar demand, industrial activity, mine supply (byproduct), ETF flows.', related:['Gold (COMEX)','Copper (COMEX)','Platinum (NYMEX)'] },
  'Copper (COMEX)': { location:'COMEX (CME Group)', desc:'Dr. Copper — the metal with a PhD in economics. Key industrial indicator driven by construction, EVs, power infrastructure, and China demand.', contract:'25,000 lbs', tick:'$0.0005/lb ($12.50)', hours:'CME Globex: Sun-Fri', settlement:'Physical delivery', seasonal:'China construction season Mar-Oct, infrastructure spending cycles.', risks:'China property/infrastructure, EV adoption, mine supply disruptions, green transition demand.', related:['Aluminum (LME)','Nickel (LME)','Iron Ore (SGX)'] },
  'Platinum (NYMEX)': { location:'NYMEX (CME Group)', desc:'PGM metal used in catalytic converters, hydrogen fuel cells, and jewelry. South Africa produces ~70% of global supply.', contract:'50 troy oz', tick:'$0.10/oz ($5.00)', hours:'CME Globex: Sun-Fri', settlement:'Physical delivery', seasonal:'Auto production cycles, S. African mine maintenance, jewelry demand.', risks:'Auto catalyst demand, hydrogen economy, S. African mine supply, palladium substitution.', related:['Palladium (NYMEX)','Gold (COMEX)'] },
  'Palladium (NYMEX)': { location:'NYMEX (CME Group)', desc:'PGM primarily used in gasoline vehicle catalytic converters. Russia and South Africa dominate supply (~80% combined).', contract:'100 troy oz', tick:'$0.05/oz ($5.00)', hours:'CME Globex: Sun-Fri', settlement:'Physical delivery', seasonal:'Auto production cycles, Russian export dynamics.', risks:'EV transition (reduces demand), Russian supply disruption, auto production, platinum substitution.', related:['Platinum (NYMEX)','Gold (COMEX)'] },
  'Aluminum (LME)': { location:'London Metal Exchange', desc:'Most widely used non-ferrous metal. China produces ~60% of global output. Energy costs are a major driver (smelting is energy-intensive).', contract:'25 metric tons', tick:'$0.50/MT', hours:'LME: Mon-Fri', settlement:'Physical delivery', seasonal:'China property construction, energy costs, smelter curtailments.', risks:'China production policy, energy costs, LME warehouse stocks, trade tariffs, green transition.', related:['Copper (COMEX)','Nickel (LME)','Zinc (LME)'] },
  'Nickel (LME)': { location:'London Metal Exchange', desc:'Key input for stainless steel and EV batteries. Indonesian supply dominance and battery demand create volatile price action.', contract:'6 metric tons', tick:'$1/MT', hours:'LME: Mon-Fri', settlement:'Physical delivery', seasonal:'Stainless steel production cycles, Indonesian ore export policy, battery demand.', risks:'Indonesian policy, EV battery demand, LME stocks, short squeeze risk, class 1 vs class 2 split.', related:['Copper (COMEX)','Aluminum (LME)','Zinc (LME)'] },
  'Zinc (LME)': { location:'London Metal Exchange', desc:'Primarily used for galvanizing steel. Global mine supply concentration and smelter economics drive pricing.', contract:'25 metric tons', tick:'$0.50/MT', hours:'LME: Mon-Fri', settlement:'Physical delivery', seasonal:'Construction activity, smelter maintenance schedules.', risks:'Mine closures, smelter energy costs, China steel demand, LME inventory levels.', related:['Aluminum (LME)','Copper (COMEX)','Steel HRC (CME)'] },
  'Iron Ore (SGX)': { location:'Singapore Exchange', desc:'Benchmark for seaborne iron ore (62% Fe fines, CFR China). China imports ~70% of globally traded iron ore.', contract:'100 dry metric tons', tick:'$0.01/MT ($1.00)', hours:'SGX: Mon-Fri', settlement:'Cash settled (Platts IODEX)', seasonal:'China steel production restocking Jan-Mar, golden week disruption Oct.', risks:'China property sector, steel production cuts, Australian/Brazilian supply, port inventories.', related:['Steel HRC (CME)','Copper (COMEX)'] },
  'Steel HRC (CME)': { location:'CME Group', desc:'US hot-rolled coil steel futures. Driven by domestic supply/demand, trade protection (Section 232 tariffs), and scrap markets.', contract:'20 short tons', tick:'$1.00/ton ($20.00)', hours:'CME Globex: Sun-Fri', settlement:'Cash settled (CRU HRC Index)', seasonal:'Auto production, construction season, inventory restocking cycles.', risks:'Import tariffs, domestic mill capacity, scrap prices, auto/construction demand, China exports.', related:['Iron Ore (SGX)','Aluminum (LME)','Copper (COMEX)'] },
  // AECO
  'AECO': { location:'Alberta, Canada (NOVA/AECO-C Hub)', desc:'The benchmark natural gas pricing point for Western Canada, traded on NGX (Natural Gas Exchange). Priced natively in CAD/GJ. AECO typically trades at a discount to Henry Hub due to pipeline takeaway constraints out of Alberta and distance from major US demand centers.', contract:'1,000 GJ (NGX)', tick:'C$0.001/GJ', hours:'NGX: Mon-Fri', settlement:'Physical/Financial (NGX)', seasonal:'Strong winter premium on heating demand. Summer basis to HH widens when Rockies/WCSB production is high. Spring shoulder sees weakest prices.', risks:'Trans Mountain/NGTL expansion, Alberta production volumes, TC Energy pipeline constraints, USD/CAD exchange rate, LNG Canada export terminal startup.', related:['Henry Hub','Dawn','Sumas'] },
  // NGLs
  'Ethane (C2)': { location:'Mont Belvieu, Texas', desc:'The lightest NGL, used primarily as petrochemical feedstock for ethylene crackers. Ethane pricing is uniquely tied to natural gas (it can be "rejected" back into the gas stream when economics are unfavorable).', contract:'42,000 gal (1,000 bbl)', tick:'$0.0001/gal', hours:'OPIS/OTC 24/7', settlement:'OPIS Mont Belvieu', seasonal:'Ethane demand peaks with cracker utilization (spring/fall turnarounds reduce demand). Winter heating competes for purity ethane.', risks:'Cracker capacity additions, ethane rejection economics, gas-ethane spread, petrochemical demand, export terminal capacity.', related:['Propane (C3)','Henry Hub'] },
  'Propane (C3)': { location:'Mont Belvieu, Texas', desc:'Most widely traded NGL. Used for heating, petrochemical feedstock (PDH units), crop drying, and exports. US is world\'s largest propane exporter.', contract:'42,000 gal (1,000 bbl)', tick:'$0.0001/gal', hours:'NYMEX/OPIS', settlement:'OPIS Mont Belvieu', seasonal:'Strong winter demand (residential/commercial heating). Summer crop drying. Export demand year-round. Inventories build Mar-Sep.', risks:'Winter weather severity, export demand (Asia/Europe), propane-crude ratio, PDH margins, inventory levels, shipping economics.', related:['Normal Butane (nC4)','Ethane (C2)','WTI Cushing'] },
  'Normal Butane (nC4)': { location:'Mont Belvieu, Texas', desc:'Used for gasoline blending (RVP management), petrochemical feedstock, and as lighter fuel. Seasonal blending regulations heavily influence demand.', contract:'42,000 gal (1,000 bbl)', tick:'$0.0001/gal', hours:'OPIS/OTC', settlement:'OPIS Mont Belvieu', seasonal:'Strongest in winter (gasoline RVP limits are relaxed, allowing more butane blending). Weakest in summer when EPA vapor pressure limits restrict blending.', risks:'EPA RVP regulations, refinery blending demand, gasoline crack spreads, seasonal transitions, isobutane substitution.', related:['Isobutane (iC4)','Nat Gasoline (C5+)','WTI Cushing'] },
  'Isobutane (iC4)': { location:'Mont Belvieu, Texas', desc:'Branched-chain butane isomer used primarily as alkylation feedstock to produce high-octane gasoline blendstock. Premium to normal butane.', contract:'42,000 gal (1,000 bbl)', tick:'$0.0001/gal', hours:'OPIS/OTC', settlement:'OPIS Mont Belvieu', seasonal:'Demand tracks refinery alkylation unit runs. Strongest when gasoline margins are high and alky units run at capacity.', risks:'Refinery alkylation capacity, gasoline octane demand, HF vs sulfuric acid alky economics, butane isomerization capacity.', related:['Normal Butane (nC4)','Nat Gasoline (C5+)'] },
  'Nat Gasoline (C5+)': { location:'Mont Belvieu, Texas', desc:'Heaviest NGL (pentanes plus). Used as gasoline blendstock, diluent for heavy crude transport (esp. Canadian oil sands), and petrochemical feedstock.', contract:'42,000 gal (1,000 bbl)', tick:'$0.0001/gal', hours:'OPIS/OTC', settlement:'OPIS Mont Belvieu', seasonal:'Tracks crude/gasoline pricing most closely of all NGLs. Diluent demand from Canada strongest in winter.', risks:'Canadian heavy crude production, gasoline demand, crude oil prices, diluent pipeline capacity, refinery demand.', related:['Normal Butane (nC4)','WTI Cushing','WCS'] },
  // LNG
  'JKM (Platts)': { location:'Japan/Korea Marker (Northeast Asia)', desc:'The premier Asian LNG spot price benchmark, assessed by S&P Global Platts. JKM represents DES (Delivered Ex-Ship) spot cargo prices into Japan, South Korea, China, and Taiwan. The most liquid and widely referenced LNG spot index globally.', contract:'10,000 MMBtu (notional)', tick:'$0.001/MMBtu', hours:'ICE/CME: Mon-Fri', settlement:'Cash settled (Platts JKM)', seasonal:'Strong winter premium (Dec-Feb) on Northeast Asian heating demand. Summer shoulder weakens. Typhoon season disruptions possible. Chinese restocking cycles.', risks:'Asian demand (Japan nuclear restarts, China LNG imports), shipping costs, new supply (Qatar/US/Mozambique), weather, spot vs long-term contract dynamics, geopolitical events.', related:['TTF (ICE)','HH Netback','Henry Hub'] },
  'TTF (ICE)': { location:'Title Transfer Facility, Netherlands', desc:'The European natural gas benchmark traded on ICE Endex. TTF has become the global reference for European gas and LNG pricing, surpassing NBP. LNG cargoes into NW Europe are priced against TTF.', contract:'Lot = 1 MW/day for delivery period', tick:'€0.001/MWh', hours:'ICE Endex: Mon-Fri', settlement:'Physical/Financial', seasonal:'Strong winter premium (Oct-Mar). Summer injection season (Apr-Sep) provides support floor. Wind/solar intermittency drives intraday volatility.', risks:'Russian supply dynamics, LNG import flows, Norwegian maintenance, renewable generation, storage levels, Asian demand competition, EU policy/price caps.', related:['NBP (ICE)','JKM (Platts)','Henry Hub'] },
  'NBP (ICE)': { location:'National Balancing Point, UK', desc:'The UK natural gas benchmark. Historically the European reference price, now secondary to TTF but still important for UK-specific gas and power markets. Influenced by interconnector flows (BBL, IUK) between UK and continent.', contract:'1,000 therms/day', tick:'0.01p/therm', hours:'ICE: Mon-Fri', settlement:'Physical', seasonal:'Similar to TTF with UK-specific factors: North Sea wind, interconnector maintenance, Rough storage closure impact.', risks:'Interconnector capacity, North Sea production decline, UK energy policy, wind generation variability, cold snaps.', related:['TTF (ICE)','JKM (Platts)'] },
  'HH Netback': { location:'US Gulf Coast (Henry Hub export netback)', desc:'Calculated price representing the value of US LNG exports. HH Netback = Henry Hub + Liquefaction Fee. This is the FOB US Gulf price that exporters need to exceed at the destination to justify shipping cargoes.', contract:'Calculated benchmark', tick:'Derived', hours:'N/A (calculated)', settlement:'Reference price', seasonal:'Follows Henry Hub seasonality plus liquefaction capacity utilization. Summer maintenance at LNG facilities reduces export volumes.', risks:'Henry Hub price levels, liquefaction tolling fees, US export capacity additions, feed gas pipeline constraints, regulatory/permit environment.', related:['Henry Hub','JKM (Platts)','TTF (ICE)'] },
  'DES South America': { location:'DES Brazil/Argentina/Chile', desc:'Spot LNG cargo prices delivered to South American regasification terminals. Brazil (Bahia, Guanabara Bay) and Argentina (Escobar) are the primary import points. Pricing reflects short-haul shipping advantage from US Gulf.', contract:'Cargo basis (typically 3-3.5M MMBtu)', tick:'$0.01/MMBtu', hours:'OTC', settlement:'OTC bilateral', seasonal:'Brazilian dry season (May-Oct) drives gas-for-power demand. Argentine winter (Jun-Aug) heating demand. Counter-seasonal to Northern Hemisphere.', risks:'Brazilian hydro conditions, Argentine peso/capital controls, Chilean demand growth, Panama Canal transit availability, competing supply from Trinidad.', related:['HH Netback','JKM (Platts)'] },
  'Brent-Linked LNG': { location:'Global (long-term contract pricing)', desc:'Represents oil-indexed LNG contract pricing, the traditional pricing mechanism for long-term LNG sale and purchase agreements (SPAs). Typically structured as a percentage of Brent (slope) plus a constant. Standard slopes range 10-14% of Brent.', contract:'Long-term SPA (20-27 years typical)', tick:'Derived from Brent', hours:'N/A', settlement:'Per SPA terms', seasonal:'Follows Brent crude seasonality rather than gas fundamentals. Disconnect between oil-linked contract prices and spot gas prices creates arbitrage.', risks:'Oil-gas price disconnect, S-curve mechanisms, contract renegotiation risk, destination flexibility clauses, take-or-pay obligations.', related:['Brent Dated','JKM (Platts)','TTF (ICE)'] }
};

function openHubInfo(hubName) {
  const info = HUB_INFO[hubName];
  if (!info) { toast('No info available for ' + hubName, 'error'); return; }
  document.getElementById('hubInfoTitle').textContent = hubName;
  document.getElementById('hubInfoBody').innerHTML = `
    <div class="panel-section"><h3>Location &amp; Description</h3><p><strong>${info.location}</strong></p><p>${info.desc}</p></div>
    <div class="panel-section"><h3>Contract Specifications</h3>
      <p><strong>Size:</strong> ${info.contract}</p><p><strong>Tick:</strong> ${info.tick}</p>
      <p><strong>Hours:</strong> ${info.hours}</p><p><strong>Settlement:</strong> ${info.settlement}</p>
    </div>
    <div class="panel-section"><h3>Seasonal Patterns</h3><p>${info.seasonal}</p></div>
    <div class="panel-section"><h3>Key Constraints &amp; Risks</h3><p>${info.risks}</p></div>
    <div class="panel-section"><h3>Related Hubs</h3><p>${info.related.join(' · ')}</p></div>
  `;
  openPanel('hubInfo');
}

/* =====================================================================
   PANELS
   ===================================================================== */
