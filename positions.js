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

