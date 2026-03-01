/* =====================================================================
   PRICE ENGINE
   ===================================================================== */

// Real-world price anchors fetched from /api/live-prices (yfinance + EIA).
// Populated on init and refreshed every 15 minutes.
let _livePrices = {};
let _liveHubSet = new Set();   // Hub names confirmed live from external APIs
const LIVE_PRICE_REFRESH = 900000; // 15 minutes

// Returns true if hub price came from a real external source (EIA / yfinance)
function isHubLive(name) { return _liveHubSet.has(name); }

// Returns a small LIVE or EST badge HTML string for a hub.
// Always shows a badge — EST by default, LIVE only when confirmed by the external API.
function priceBadge(name) {
  return isHubLive(name)
    ? '<span class="price-badge live">LIVE</span>'
    : '<span class="price-badge est">EST</span>';
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
      _livePrices = d.prices;
      _liveHubSet = new Set(d.live_hubs || []);
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
    if (liveOk && !histOk) {
      // Fallback: patch simulated history toward live price if real history unavailable
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
}

async function _fetchPriceHistory() {
  try {
    const r = await fetch(API_BASE + '/api/price-history');
    const d = await r.json();
    if (d.success && d.history) {
      let replaced = 0;
      for (const [hub, dailyCloses] of Object.entries(d.history)) {
        if (dailyCloses && dailyCloses.length >= 10 && priceHistory[hub]) {
          priceHistory[hub] = dailyCloses.slice();
          replaced++;
        }
      }
      console.log(`Real price history loaded: ${replaced} hubs replaced`);
      return replaced > 0;
    }
  } catch(e) {
    console.warn('Price history fetch failed, using simulated data:', e);
  }
  return false;
}

function _rebaseToLivePrices() {
  // Nudge the last tick toward the real price to prevent long-term drift.
  // A gentle 20% pull per refresh keeps the simulation grounded without jarring jumps.
  for (const [sector, hubs] of Object.entries(ALL_HUB_SETS)) {
    hubs.forEach(h => {
      const real = _livePrices[h.name];
      if (real === undefined) return;
      const hist = priceHistory[h.name];
      if (!hist || !hist.length) return;
      const current = hist[hist.length - 1];
      const isPower = sector === 'power';
      const floor = isPower ? -h.base * 0.5 : h.base * 0.4;
      // Pull 20% toward real price
      const nudged = Math.max(floor, current + (real - current) * 0.20);
      hist[hist.length - 1] = nudged;
    });
  }
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

