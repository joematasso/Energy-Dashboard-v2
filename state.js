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

