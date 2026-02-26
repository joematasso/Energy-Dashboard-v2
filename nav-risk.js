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

