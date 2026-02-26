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
