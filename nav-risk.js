/* =====================================================================
   TOAST
   ===================================================================== */
function toast(msg, type) {
  type = type || 'info';
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
}

/* =====================================================================
   PAGE SWITCHING
   ===================================================================== */
function switchPage(name) {
  STATE.currentPage = name;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  const tab = document.querySelector('.tab-btn[data-page="' + name + '"]');
  if (tab) tab.classList.add('active');
  renderCurrentPage();
}

function renderCurrentPage() {
  try {
    switch (STATE.currentPage) {
      case 'ng': renderNGPage(); if (typeof renderWeatherPage === 'function') renderWeatherPage(); break;
      case 'crude': if (typeof renderCrudePage === 'function') renderCrudePage(); break;
      case 'power': if (typeof renderPowerPage === 'function') renderPowerPage(); break;
      case 'freight': if (typeof renderFreightPage === 'function') renderFreightPage(); break;
      case 'ag': if (typeof renderAgPage === 'function') renderAgPage(); break;
      case 'metals': if (typeof renderMetalsPage === 'function') renderMetalsPage(); break;
      case 'ngls': if (typeof renderNGLsPage === 'function') renderNGLsPage(); break;
      case 'lng': if (typeof renderLNGPage === 'function') renderLNGPage(); break;
      case 'blotter': if (typeof renderBlotterPage === 'function') renderBlotterPage(); break;
      case 'risk': if (typeof renderRiskPage === 'function') renderRiskPage(); break;
      case 'weather': STATE.currentPage='ng'; switchPage('ng'); break; // weather merged into NG
      case 'leaderboard': if (typeof renderLeaderboardPage === 'function') renderLeaderboardPage(); break;
    }
  } catch(e) { console.error('renderCurrentPage error:', e); }
}

/* =====================================================================
   RENDER FUNCTIONS — RISK ANALYTICS
   ===================================================================== */

function renderRiskPage() {
  const balance = STATE.settings.balance || 1000000;
  let realized=0, unrealized=0, wins=0, losses=0, openCount=0, closedCount=0;
  let grossWins=0, grossLosses=0, best=-Infinity, worst=Infinity;
  const pnlList = [];

  STATE.trades.forEach(t => {
    if (t.status === 'CLOSED') {
      closedCount++;
      const pnl = parseFloat(t.realizedPnl||0);
      realized += pnl;
      pnlList.push(pnl);
      if (pnl > 0) { wins++; grossWins += pnl; }
      else if (pnl < 0) { losses++; grossLosses += Math.abs(pnl); }
      if (pnl > best) best = pnl;
      if (pnl < worst) worst = pnl;
    } else if (t.status === 'OPEN') {
      openCount++;
      const spot = getPrice(t.hub);
      const dir = t.direction === 'BUY' ? 1 : -1;
      unrealized += (spot - parseFloat(t.entryPrice)) * parseFloat(t.volume) * dir;
    }
  });

  const equity = balance + realized + unrealized;
  const portfolio = Math.abs(unrealized) + Math.abs(realized) || equity;

  // Realized volatility from P&L returns (rolling window, fallback to sector defaults)
  let dailyVol = 0.02;
  if (pnlList.length >= 5) {
    const mean = pnlList.reduce((a,b)=>a+b,0) / pnlList.length;
    const variance = pnlList.reduce((s,v)=>s+(v-mean)*(v-mean),0) / (pnlList.length - 1);
    const realizedStd = Math.sqrt(variance);
    // Normalize as fraction of portfolio
    dailyVol = portfolio > 0 ? Math.max(0.005, Math.min(0.10, realizedStd / portfolio)) : 0.02;
  }

  // VaR (parametric)
  const var95 = portfolio * dailyVol * 1.645;
  const var99 = portfolio * dailyVol * 2.326;
  // CVaR (Expected Shortfall): average of P&L beyond VaR threshold, or parametric approximation
  let cvar95 = var95 * 1.3, cvar99 = var99 * 1.3;
  if (pnlList.length >= 10) {
    const sorted = [...pnlList].sort((a,b)=>a-b);
    const cutoff95 = Math.max(1, Math.floor(sorted.length * 0.05));
    const cutoff99 = Math.max(1, Math.floor(sorted.length * 0.01));
    const tail95 = sorted.slice(0, cutoff95);
    const tail99 = sorted.slice(0, cutoff99);
    if (tail95.length) cvar95 = Math.abs(tail95.reduce((a,b)=>a+b,0) / tail95.length);
    if (tail99.length) cvar99 = Math.abs(tail99.reduce((a,b)=>a+b,0) / tail99.length);
  }
  document.getElementById('riskPortValue').textContent = '$' + equity.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('riskVar95').textContent = '-$' + var95.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('riskVar99').textContent = '-$' + var99.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('riskCvar95').textContent = '-$' + cvar95.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('riskCvar99').textContent = '-$' + cvar99.toLocaleString(undefined,{maximumFractionDigits:0});

  // Performance
  const wr = (wins+losses)>0 ? ((wins/(wins+losses))*100).toFixed(1)+'%' : '—';
  const pf = grossLosses>0 ? (grossWins/grossLosses).toFixed(2) : (grossWins>0?'999':'—');
  const avgWin = wins>0 ? grossWins/wins : 0;
  const avgLoss = losses>0 ? grossLosses/losses : 0;
  // Sharpe ratio (time-based: group P&L by day, annualize with sqrt(252))
  const sharpe = pnlList.length>1 ? (function(){
    // Group P&L by calendar day for proper time-based calculation
    const dailyPnl = {};
    STATE.trades.filter(t=>t.status==='CLOSED').forEach(t=>{
      const day = (t.closedAt || t.timestamp || '').slice(0, 10);
      if (day) dailyPnl[day] = (dailyPnl[day] || 0) + parseFloat(t.realizedPnl || 0);
    });
    const dailyReturns = Object.values(dailyPnl);
    if (dailyReturns.length < 2) {
      // Fallback to per-trade Sharpe if insufficient days
      const mean=pnlList.reduce((a,b)=>a+b,0)/pnlList.length;
      const std=Math.sqrt(pnlList.reduce((s,v)=>s+(v-mean)*(v-mean),0)/(pnlList.length-1));
      return std>0?((mean/std)*Math.sqrt(Math.min(pnlList.length,252))).toFixed(2):'—';
    }
    const mean=dailyReturns.reduce((a,b)=>a+b,0)/dailyReturns.length;
    const std=Math.sqrt(dailyReturns.reduce((s,v)=>s+(v-mean)*(v-mean),0)/(dailyReturns.length-1));
    return std>0?((mean/std)*Math.sqrt(252)).toFixed(2):'—';
  })() : '—';

  // Sortino ratio (downside deviation from all periods, not just negative trades)
  const sortino = pnlList.length>1 ? (function(){
    const mean=pnlList.reduce((a,b)=>a+b,0)/pnlList.length;
    // Downside deviation: sqrt(mean of squared negative returns from MAR=0)
    const downSquares = pnlList.map(v => v < 0 ? v * v : 0);
    const dStd=Math.sqrt(downSquares.reduce((s,v)=>s+v,0)/pnlList.length);
    if(dStd <= 0) return mean>0?'999':'—';
    return ((mean/dStd)*Math.sqrt(252)).toFixed(2);
  })() : '—';

  // Max drawdown from equity curve
  let maxDD=0, peak=balance, equityCurveArr=[balance];
  let runBal=balance;
  STATE.trades.filter(t=>t.status==='CLOSED').reverse().forEach(t=>{
    runBal+=parseFloat(t.realizedPnl||0); equityCurveArr.push(runBal);
    if(runBal>peak)peak=runBal;
    const dd=((peak-runBal)/peak)*100;
    if(dd>maxDD)maxDD=dd;
  });

  // Calmar ratio (annualized return / max drawdown)
  const totalReturn = equity - balance;
  const calmar = maxDD > 0 ? ((totalReturn / balance * 100) / maxDD).toFixed(2) : '—';

  document.getElementById('riskSharpe').textContent = sharpe;
  const sortinoEl = document.getElementById('riskSortino');
  if (sortinoEl) sortinoEl.textContent = sortino;
  const maxDDEl = document.getElementById('riskMaxDD');
  if (maxDDEl) { maxDDEl.textContent = maxDD > 0 ? maxDD.toFixed(2) + '%' : '—'; maxDDEl.style.color = maxDD > 10 ? 'var(--red)' : ''; }
  const calmarEl = document.getElementById('riskCalmar');
  if (calmarEl) calmarEl.textContent = calmar;
  document.getElementById('riskWinRate').textContent = wr;
  document.getElementById('riskPF').textContent = pf;
  document.getElementById('riskAvgWL').textContent = avgWin>0||avgLoss>0 ? '$'+avgWin.toFixed(0)+' / $'+avgLoss.toFixed(0) : '—';
  document.getElementById('riskBest').textContent = best>-Infinity ? (best>=0?'+':'')+('$'+Math.abs(best).toLocaleString(undefined,{maximumFractionDigits:0})) : '—';
  document.getElementById('riskWorst').textContent = worst<Infinity ? '-$'+Math.abs(worst).toLocaleString(undefined,{maximumFractionDigits:0}) : '—';
  document.getElementById('riskCounts').textContent = STATE.trades.length+' / '+openCount+' / '+closedCount;

  // Scenario analysis
  const scenBody = document.getElementById('scenarioBody');
  scenBody.innerHTML = SCENARIOS.map(sc => {
    let impact = 0;
    STATE.trades.filter(t=>t.status==='OPEN').forEach(t => {
      const vol = parseFloat(t.volume);
      const entry = parseFloat(t.entryPrice);
      const dir = t.direction==='BUY'?1:-1;
      const type = t.type||'';
      let pctMove = 0;
      if (type.startsWith('CRUDE')||type==='EFP'||type==='OPTION_CL') pctMove = sc.crude;
      else if (type.startsWith('FREIGHT')) pctMove = sc.freight;
      else if (type.startsWith('AG')) pctMove = sc.ag||0;
      else if (type.startsWith('METALS')) pctMove = sc.metals||0;
      else if (type.startsWith('NGL')) pctMove = sc.ngls||0;
      else if (type.startsWith('LNG')) pctMove = sc.lng||0;
      else if (typeof POWER_HUBS!=='undefined'&&POWER_HUBS.find(h=>h.name===t.hub)) pctMove = sc.power;
      else pctMove = sc.ng;
      impact += entry * (pctMove/100) * vol * dir;
    });
    const impPct = equity > 0 ? (impact / equity * 100).toFixed(2) : '0.00';
    const impColor = impact>=0?'green':'red';
    return `<tr><td style="font-weight:600;white-space:nowrap">${sc.name}</td><td class="mono">${sc.ng>=0?'+':''}${sc.ng}%</td><td class="mono">${sc.crude>=0?'+':''}${sc.crude}%</td><td class="mono">${sc.power>=0?'+':''}${sc.power}%</td><td class="mono ${impColor}" style="font-weight:700">${impact>=0?'+':'-'}$${Math.abs(impact).toLocaleString(undefined,{maximumFractionDigits:0})}<br><span style="font-size:10px;font-weight:400">${impact>=0?'+':''}${impPct}%</span></td></tr>`;
  }).join('');

  // Open positions
  const riskOpen = document.getElementById('riskOpenBody');
  const open = STATE.trades.filter(t=>t.status==='OPEN');
  if (!open.length) { riskOpen.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">No open positions</td></tr>'; }
  else { riskOpen.innerHTML = open.map(t => { const spot=getPrice(t.hub);const dir=t.direction==='BUY'?1:-1;const mtm=(spot-parseFloat(t.entryPrice))*parseFloat(t.volume)*dir;return `<tr><td>${t.hub}</td><td style="color:${t.direction==='BUY'?'var(--buy)':'var(--sell)'};font-weight:700">${t.direction}</td><td class="mono">${parseFloat(t.volume).toLocaleString()}</td><td class="mono ${mtm>=0?'green':'red'}">${mtm>=0?'+':'-'}$${Math.abs(mtm).toLocaleString(undefined,{maximumFractionDigits:0})}</td></tr>`;}).join(''); }

  // Margin & Exposure
  renderRiskMargin(open, equity);

  // Concentration risk
  renderConcentrationRisk(open, equity);

  // Correlation matrix
  renderCorrelationMatrix();

  // Greeks (for options positions)
  renderGreeksSummary(open);

  // Drawdown chart
  drawDrawdownChart(equityCurveArr);
  try { initDrawdownCrosshair(); } catch(e) { console.error('Drawdown crosshair error:', e); }

  // Equity curve
  drawEquityCurve();
  try { initEquityCrosshair(); } catch(e) { console.error('Equity crosshair error:', e); }

  // Position Heatmap
  renderRiskHeatmap(open);

  // Check price alerts
  if (typeof checkPriceAlerts === 'function') checkPriceAlerts();
}

function renderRiskHeatmap(openTrades) {
  const container = document.getElementById('riskHeatmap');
  if (!container) return;

  if (!openTrades || !openTrades.length) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:180px;color:var(--text-muted);font-size:13px">No open positions to display</div>';
    return;
  }

  // Calculate MTM for each position
  const positions = openTrades.map(t => {
    const spot = getPrice(t.hub);
    const dir = t.direction === 'BUY' ? 1 : -1;
    const entry = parseFloat(t.entryPrice);
    const vol = parseFloat(t.volume);
    const mtm = (spot - entry) * vol * dir;
    const exposure = Math.abs(entry * vol);
    const pctReturn = entry > 0 ? ((spot - entry) / entry) * dir * 100 : 0;
    return { hub: t.hub, direction: t.direction, volume: vol, mtm, exposure, pctReturn, spot, entry };
  });

  // Sort by absolute exposure descending (biggest blocks first)
  positions.sort((a, b) => b.exposure - a.exposure);

  const totalExposure = positions.reduce((s, p) => s + p.exposure, 0) || 1;
  const maxAbsPct = Math.max(...positions.map(p => Math.abs(p.pctReturn)), 1);

  // Build treemap-style heatmap
  // Split into rows: first row gets the biggest positions, second row gets smaller ones
  const bigThreshold = positions.length > 3 ? 2 : positions.length;
  const topRow = positions.slice(0, bigThreshold);
  const botRow = positions.slice(bigThreshold);
  const topTotal = topRow.reduce((s, p) => s + p.exposure, 0) || 1;
  const botTotal = botRow.reduce((s, p) => s + p.exposure, 0) || 1;

  function buildCell(p) {
    const intensity = Math.min(Math.abs(p.pctReturn) / maxAbsPct, 1);
    let bgColor, textColor;
    if (p.mtm >= 0) {
      bgColor = `rgba(16,185,129,${0.12 + intensity * 0.35})`;
      textColor = '#10b981';
    } else {
      bgColor = `rgba(239,68,68,${0.12 + intensity * 0.35})`;
      textColor = '#ef4444';
    }
    const mtmStr = (p.mtm >= 0 ? '+' : '-') + '$' + Math.abs(p.mtm).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const retStr = (p.pctReturn >= 0 ? '+' : '') + p.pctReturn.toFixed(2) + '%';
    return `<div style="flex:${p.exposure};min-width:100px;background:${bgColor};border:1px solid ${textColor}33;border-radius:6px;padding:10px 12px;display:flex;flex-direction:column;justify-content:center;cursor:default;transition:transform 0.15s" onmouseenter="this.style.transform='scale(1.02)'" onmouseleave="this.style.transform='scale(1)'">
      <div style="font-weight:700;font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.hub}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${p.direction} ${p.volume.toLocaleString()} @ ${p.entry.toFixed(2)}</div>
      <div style="font-size:18px;font-weight:800;color:${textColor};margin-top:6px;font-family:var(--font-mono)">${mtmStr}</div>
      <div style="font-size:11px;color:${textColor};font-family:var(--font-mono)">${retStr}</div>
    </div>`;
  }

  let html = '<div style="display:flex;flex-direction:column;gap:4px;height:100%;min-height:200px">';
  // Top row
  html += '<div style="display:flex;gap:4px;flex:1">';
  topRow.forEach(p => { html += buildCell(p); });
  html += '</div>';
  // Bottom row (if any)
  if (botRow.length) {
    html += '<div style="display:flex;gap:4px;flex:1">';
    botRow.forEach(p => { html += buildCell(p); });
    html += '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
}

function renderRiskMargin(openTrades, equity) {
  const usedMargin = openTrades.reduce((s, t) => s + calcMargin(t), 0);
  const availMargin = equity - usedMargin;
  const pct = equity > 0 ? Math.min((usedMargin / equity) * 100, 100) : 0;

  const barEl = document.getElementById('riskMarginBar');
  const pctEl = document.getElementById('riskMarginPct');
  const usedEl = document.getElementById('riskMarginUsed');
  const availEl = document.getElementById('riskMarginAvail');
  if (barEl) {
    barEl.style.width = pct.toFixed(1) + '%';
    barEl.style.background = pct > 90 ? 'var(--red)' : pct > 75 ? '#f59e0b' : 'var(--accent)';
  }
  if (pctEl) pctEl.textContent = pct.toFixed(1) + '%';
  if (usedEl) usedEl.textContent = '$' + usedMargin.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (availEl) availEl.textContent = '$' + availMargin.toLocaleString(undefined, { maximumFractionDigits: 0 });

  // Sector exposure breakdown
  const sectorMap = {};
  openTrades.forEach(t => {
    const type = t.type || '';
    const spot = getPrice(t.hub);
    const vol = parseFloat(t.volume);
    const dir = t.direction === 'BUY' ? 1 : -1;
    const exposure = Math.abs(spot * vol);
    let sector = 'NG';
    if (type.startsWith('CRUDE') || type === 'EFP' || type === 'OPTION_CL') sector = 'Crude';
    else if (type.startsWith('FREIGHT')) sector = 'Freight';
    else if (type.startsWith('NGL')) sector = 'NGLs';
    else if (type.startsWith('LNG')) sector = 'LNG';
    else if (typeof POWER_HUBS !== 'undefined' && POWER_HUBS.find(h => h.name === t.hub)) sector = 'Power';
    else if (typeof AG_HUBS !== 'undefined' && AG_HUBS.find(h => h.name === t.hub)) sector = 'Ag';
    else if (typeof METALS_HUBS !== 'undefined' && METALS_HUBS.find(h => h.name === t.hub)) sector = 'Metals';
    sectorMap[sector] = (sectorMap[sector] || 0) + exposure;
  });

  const expEl = document.getElementById('riskSectorExposure');
  if (!expEl) return;
  const sectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);
  const totalExp = sectors.reduce((s, [, v]) => s + v, 0) || 1;
  const colors = { NG: '#5b9bd5', Crude: '#f59e0b', Power: '#a78bfa', Freight: '#fb923c', NGLs: '#34d399', LNG: '#60a5fa', Ag: '#84cc16', Metals: '#e879f9' };

  if (!sectors.length) {
    expEl.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px 0">No open positions</div>';
    return;
  }
  expEl.innerHTML = sectors.map(([name, exp]) => {
    const w = ((exp / totalExp) * 100).toFixed(1);
    const c = colors[name] || 'var(--accent)';
    return `<div style="display:flex;align-items:center;gap:8px"><span style="width:48px;font-size:11px;font-weight:600;color:var(--text-muted)">${name}</span><div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden"><div style="height:100%;width:${w}%;background:${c};border-radius:3px"></div></div><span class="mono" style="font-size:10px;color:var(--text-muted);min-width:55px;text-align:right">$${(exp/1000).toFixed(0)}k</span></div>`;
  }).join('');
}

function setEqRange(range, btn) {
  STATE.eqRange = range;
  if (btn) {
    btn.parentElement.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  drawEquityCurve();
  try { initEquityCrosshair(); } catch(e) {}
}

function setPnlRange(range, btn) {
  STATE.pnlRange = range;
  if (btn) {
    btn.parentElement.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  drawPnlChart();
  try { initPnlCrosshair(); } catch(e) {}
}

function setLbRange(range, btn) {
  STATE.lbRange = range;
  if (btn) {
    btn.parentElement.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const canvas = document.getElementById('lbEquityChart');
  if (canvas && canvas._lbRedraw) {
    canvas._lbRedraw();
  } else {
    // Trigger full leaderboard re-render for range change
    window._lbChartVisible = {}; // Reset cache for new range
    renderLeaderboardPage();
  }
}

function drawEquityCurve() {
  const canvas = document.getElementById('equityChart');
  if (!canvas || !canvas.parentElement) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  if (!rect || !rect.width) return;
  const dpr = window.devicePixelRatio||1;
  canvas.width = rect.width*dpr; canvas.height = 280*dpr;
  canvas.style.width = rect.width+'px'; canvas.style.height = '280px';
  ctx.scale(dpr,dpr);
  const W=rect.width, H=280;
  const balance = STATE.settings.balance||1000000;
  const isLight = document.documentElement.getAttribute('data-theme')==='light';
  ctx.fillStyle = isLight?'#ffffff':getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  ctx.fillRect(0,0,W,H);

  const closed = STATE.trades.filter(t=>t.status==='CLOSED').reverse();
  if (closed.length<1){ctx.fillStyle=isLight?'#94a3b8':'#475569';ctx.font='13px Inter';ctx.textAlign='center';ctx.fillText('Close trades to see equity curve',W/2,H/2);return;}

  // Build full equity series
  const fullPts=[balance];let run=balance;
  closed.forEach(t=>{run+=parseFloat(t.realizedPnl||0);fullPts.push(run);});

  // Apply range filter
  const range = STATE.eqRange || 'ALL';
  let equityPts;
  if (range === 'ALL') {
    equityPts = fullPts;
  } else {
    let maxPts;
    if (range === '1W') maxPts = 7;
    else if (range === '1M') maxPts = 30;
    else if (range === '3M') maxPts = 90;
    else if (range === 'YTD') {
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      maxPts = Math.ceil((now - startOfYear) / 86400000);
    } else maxPts = fullPts.length;
    equityPts = fullPts.length > maxPts ? fullPts.slice(fullPts.length - maxPts) : fullPts;
  }

  if (equityPts.length < 2) { equityPts = fullPts; }

  // Apply zoom if set
  const fullEquityPts = equityPts;
  const eqZoom = canvas._eqZoom;
  if (eqZoom && eqZoom.end > eqZoom.start) {
    equityPts = fullEquityPts.slice(eqZoom.start, eqZoom.end);
    if (equityPts.length < 2) equityPts = fullEquityPts;
  }

  const min=Math.min(...equityPts)*0.998,max=Math.max(...equityPts)*1.002,rangeV=max-min||1;
  const padL=75,padR=40,padT=20,padB=45,cW=W-padL-padR,cH=H-padT-padB;

  // Period return stats
  const startVal = equityPts[0];
  const endVal = equityPts[equityPts.length - 1];
  const periodPnl = endVal - startVal;
  const periodPct = ((endVal - startVal) / startVal * 100);
  const periodHigh = Math.max(...equityPts);
  const periodLow = Math.min(...equityPts);
  const drawdown = ((periodHigh - endVal) / periodHigh * 100);

  const lineColor = endVal>=startVal?'#10b981':'#ef4444';

  // Gradient fill
  ctx.beginPath();
  equityPts.forEach((v,i)=>{const x=padL+(i/(equityPts.length-1))*cW;const y=padT+(1-(v-min)/rangeV)*cH;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  const grad = ctx.createLinearGradient(0, padT, 0, padT+cH);
  grad.addColorStop(0, lineColor + '20');
  grad.addColorStop(1, lineColor + '03');
  ctx.lineTo(padL+cW, padT+cH);
  ctx.lineTo(padL, padT+cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  equityPts.forEach((v,i)=>{const x=padL+(i/(equityPts.length-1))*cW;const y=padT+(1-(v-min)/rangeV)*cH;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.strokeStyle=lineColor;ctx.lineWidth=2;ctx.stroke();

  // Start balance reference line
  const balY=padT+(1-(startVal-min)/rangeV)*cH;
  ctx.strokeStyle='rgba(148,163,184,0.3)';ctx.setLineDash([4,4]);ctx.lineWidth=0.5;
  ctx.beginPath();ctx.moveTo(padL,balY);ctx.lineTo(W-padR,balY);ctx.stroke();ctx.setLineDash([]);

  // Y labels
  const textColor = isLight?'#475569':'#94a3b8';
  ctx.fillStyle=textColor;ctx.font='11px JetBrains Mono';ctx.textAlign='right';
  for(let i=0;i<=4;i++){const val=min+(rangeV*i/4);const y=padT+(1-i/4)*cH;ctx.fillText('$'+(val/1000).toFixed(0)+'k',padL-8,y+4);}

  // X-axis date labels
  ctx.fillStyle = textColor;
  ctx.font = '10px JetBrains Mono';
  ctx.textAlign = 'center';
  const now = new Date();
  const labelCount = Math.min(6, equityPts.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor(i * (equityPts.length - 1) / (labelCount - 1));
    const x = padL + (idx / (equityPts.length - 1)) * cW;
    const daysBack = equityPts.length - 1 - idx;
    const labelDate = new Date(now.getTime() - daysBack * 86400000);
    const label = labelDate.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    ctx.fillText(label, x, H - padB + 20);
  }

  // Period stats overlay (top right)
  const statsX = W - padR - 10;
  ctx.textAlign = 'right';
  ctx.font = '11px JetBrains Mono';
  ctx.fillStyle = lineColor;
  ctx.fillText((periodPnl>=0?'+':'-')+'$'+Math.abs(periodPnl).toLocaleString(undefined,{maximumFractionDigits:0})+' ('+periodPct.toFixed(2)+'%)', statsX, padT + 14);
  ctx.fillStyle = textColor;
  ctx.font = '10px JetBrains Mono';
  ctx.fillText('DD: '+drawdown.toFixed(2)+'%  Hi: $'+(periodHigh/1000).toFixed(1)+'k  Lo: $'+(periodLow/1000).toFixed(1)+'k', statsX, padT + 28);

  // Store metadata for crosshair + zoom
  canvas._eqMeta = { padL, padR, padT, padB, cW, cH, min, max, range: rangeV, data: equityPts, fullData: fullEquityPts, lineColor, W, H, startVal };
}

function initEquityCrosshair() {
  const canvas = document.getElementById('equityChart');
  if (!canvas || canvas._eqCrosshairInit) return;
  canvas._eqCrosshairInit = true;
  let _panState = null;

  // Wheel zoom
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const meta = canvas._eqMeta;
    if (!meta || !meta.fullData || meta.fullData.length < 3) return;
    const fullLen = meta.fullData.length;
    const curZoom = canvas._eqZoom || { start: 0, end: fullLen };
    const viewLen = curZoom.end - curZoom.start;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, (mx - meta.padL) / meta.cW));
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    const newLen = Math.round(Math.max(10, Math.min(fullLen, viewLen * factor)));
    const anchor = curZoom.start + Math.round(pct * viewLen);
    let ns = Math.round(anchor - pct * newLen), ne = ns + newLen;
    if (ns < 0) { ns = 0; ne = newLen; }
    if (ne > fullLen) { ne = fullLen; ns = fullLen - newLen; }
    if (ne - ns >= fullLen) { delete canvas._eqZoom; } else { canvas._eqZoom = { start: Math.max(0, ns), end: Math.min(fullLen, ne) }; }
    drawEquityCurve();
  }, { passive: false });

  // Drag pan
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const meta = canvas._eqMeta;
    if (!meta || !meta.fullData) return;
    _panState = { startX: e.clientX, zoom: { ...(canvas._eqZoom || { start: 0, end: meta.fullData.length }) } };
  });
  canvas.addEventListener('mouseup', () => { _panState = null; });

  // Double-click reset
  canvas.addEventListener('dblclick', () => {
    delete canvas._eqZoom;
    drawEquityCurve();
  });

  canvas.addEventListener('mousemove', e => {
    const meta = canvas._eqMeta;
    if (!meta) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    // Handle pan drag
    if (_panState && meta.fullData) {
      const dataPerPx = meta.data.length / meta.cW;
      const shift = Math.round(-(e.clientX - _panState.startX) * dataPerPx);
      const fullLen = meta.fullData.length;
      const viewLen = _panState.zoom.end - _panState.zoom.start;
      let ns = _panState.zoom.start + shift, ne = ns + viewLen;
      if (ns < 0) { ns = 0; ne = viewLen; }
      if (ne > fullLen) { ne = fullLen; ns = fullLen - viewLen; }
      canvas._eqZoom = { start: ns, end: ne };
      drawEquityCurve();
      return;
    }

    const { padL, padT, cW, cH, min, max, range, data, lineColor, W, H } = meta;

    if (mx < padL || mx > padL + cW) {
      drawEquityCurve();
      return;
    }

    // Find nearest data index
    const idx = Math.round(((mx - padL) / cW) * (data.length - 1));
    const clampIdx = Math.max(0, Math.min(data.length - 1, idx));
    const val = data[clampIdx];

    // Snap positions
    const snapX = padL + (clampIdx / (data.length - 1)) * cW;
    const snapY = padT + (1 - (val - min) / range) * cH;

    // Redraw base
    drawEquityCurve();
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Crosshair lines
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(snapX, padT); ctx.lineTo(snapX, padT + cH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, snapY); ctx.lineTo(padL + cW, snapY); ctx.stroke();
    ctx.setLineDash([]);

    // Snap dot
    ctx.beginPath(); ctx.arc(snapX, snapY, 5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    // Tooltip with equity value
    const startVal = meta.startVal || (STATE.settings.balance || 1000000);
    const pnl = val - startVal;
    const pnlStr = (pnl >= 0 ? '+' : '-') + '$' + Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const valStr = '$' + (val / 1000).toFixed(1) + 'k';
    const txt = valStr + ' (' + pnlStr + ')';
    ctx.font = '11px JetBrains Mono';
    const tw = ctx.measureText(txt).width + 16;
    const tipX = snapX + 12 + tw > padL + cW ? snapX - tw - 12 : snapX + 12;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(tipX, snapY - 14, tw, 24);
    ctx.strokeStyle = lineColor; ctx.lineWidth = 1;
    ctx.strokeRect(tipX, snapY - 14, tw, 24);
    ctx.fillStyle = lineColor;
    ctx.textAlign = 'left';
    ctx.fillText(txt, tipX + 8, snapY + 3);

    // Date label at bottom
    const now = new Date();
    const daysBack = data.length - 1 - clampIdx;
    const labelDate = new Date(now.getTime() - daysBack * 86400000);
    const dateStr = labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ctx.font = '10px JetBrains Mono';
    const dtw = ctx.measureText(dateStr).width + 10;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(snapX - dtw / 2, padT + cH + 2, dtw, 18);
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.fillText(dateStr, snapX, padT + cH + 14);

    ctx.restore();
  });

  canvas.addEventListener('mouseleave', () => {
    _panState = null;
    if (canvas._eqMeta) drawEquityCurve();
  });
}

/* =====================================================================
   CONCENTRATION RISK
   ===================================================================== */
function renderConcentrationRisk(openTrades, equity) {
  const el = document.getElementById('riskConcentration');
  if (!el) return;
  if (!openTrades.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:11px;text-align:center;padding:20px">No open positions</div>'; return; }

  // Group by hub
  const hubMap = {};
  openTrades.forEach(t => {
    const spot = getPrice(t.hub); const vol = parseFloat(t.volume);
    const exp = Math.abs(spot * vol);
    hubMap[t.hub] = (hubMap[t.hub] || 0) + exp;
  });
  const entries = Object.entries(hubMap).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

  // Concentration warnings
  const topPct = (entries[0][1] / total) * 100;
  const warning = topPct > 50 ? '<div style="color:var(--red);font-size:11px;font-weight:600;margin-bottom:8px">Warning: ' + entries[0][0] + ' is ' + topPct.toFixed(0) + '% of exposure</div>' : '';

  // HHI (Herfindahl-Hirschman Index) for concentration measurement
  const hhi = entries.reduce((s, [, v]) => s + Math.pow(v / total * 100, 2), 0);
  const hhiLabel = hhi > 2500 ? 'Concentrated' : hhi > 1500 ? 'Moderate' : 'Diversified';
  const hhiColor = hhi > 2500 ? 'var(--red)' : hhi > 1500 ? '#f59e0b' : 'var(--green)';

  el.innerHTML = warning
    + '<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:11px"><span style="color:var(--text-muted)">HHI: <strong style="color:' + hhiColor + '">' + hhi.toFixed(0) + '</strong></span><span style="color:' + hhiColor + ';font-weight:600">' + hhiLabel + '</span></div>'
    + '<div style="display:flex;height:14px;border-radius:4px;overflow:hidden;margin-bottom:8px">'
    + entries.map(([hub, exp], i) => {
        const pct = (exp / total * 100);
        const colors = ['#5b9bd5','#f59e0b','#a78bfa','#10b981','#ef4444','#fb923c','#e879f9','#84cc16'];
        return '<div style="width:' + pct + '%;background:' + colors[i % colors.length] + ';min-width:2px" title="' + hub + ': ' + pct.toFixed(1) + '%"></div>';
      }).join('')
    + '</div>'
    + entries.slice(0, 8).map(([hub, exp], i) => {
        const pct = (exp / total * 100).toFixed(1);
        const colors = ['#5b9bd5','#f59e0b','#a78bfa','#10b981','#ef4444','#fb923c','#e879f9','#84cc16'];
        return '<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:2px"><span style="width:8px;height:8px;border-radius:2px;background:' + colors[i % colors.length] + ';flex-shrink:0"></span><span style="flex:1;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + hub + '</span><span class="mono" style="color:var(--text-muted)">' + pct + '%</span></div>';
      }).join('');
}

/* =====================================================================
   CORRELATION MATRIX
   ===================================================================== */
function renderCorrelationMatrix() {
  const el = document.getElementById('riskCorrelation');
  if (!el) return;

  // Get sectors that have price history
  const sectors = ['NG', 'Crude', 'Power', 'Freight', 'Ag', 'Metals', 'NGLs', 'LNG'];
  const sectorHubs = { NG: 'Henry Hub', Crude: 'WTI Cushing', Power: 'PJM West', Freight: 'Baltic Dry', Ag: 'Corn CBOT', Metals: 'Gold COMEX', NGLs: 'Mt Belvieu Ethane', LNG: 'JKM' };
  const histories = {};
  sectors.forEach(s => {
    const hub = sectorHubs[s];
    const hist = (typeof getChartHistory === 'function') ? getChartHistory(hub) : (typeof priceHistory !== 'undefined' ? priceHistory[hub] : null);
    if (hist && hist.length > 10) histories[s] = hist.slice(-50);
  });

  const activeSectors = Object.keys(histories);
  if (activeSectors.length < 2) { el.innerHTML = '<div style="color:var(--text-muted);font-size:11px;text-align:center;padding:20px">Need price data for 2+ sectors</div>'; return; }

  // Calculate returns
  const returns = {};
  activeSectors.forEach(s => {
    const h = histories[s];
    returns[s] = h.slice(1).map((v, i) => (v - h[i]) / h[i]);
  });

  // Correlation function
  function corr(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 5) return 0;
    const ax = a.slice(0, n), bx = b.slice(0, n);
    const ma = ax.reduce((s, v) => s + v, 0) / n, mb = bx.reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (ax[i] - ma) * (bx[i] - mb); da += (ax[i] - ma) ** 2; db += (bx[i] - mb) ** 2; }
    const den = Math.sqrt(da * db);
    return den > 0 ? num / den : 0;
  }

  // Build matrix
  let html = '<table style="width:100%;font-size:10px;border-collapse:collapse"><tr><th></th>';
  activeSectors.forEach(s => { html += '<th style="padding:3px;color:var(--text-muted);font-weight:600">' + s + '</th>'; });
  html += '</tr>';
  activeSectors.forEach((s1, i) => {
    html += '<tr><td style="font-weight:600;color:var(--text-muted);padding:3px">' + s1 + '</td>';
    activeSectors.forEach((s2, j) => {
      const c = i === j ? 1 : corr(returns[s1], returns[s2]);
      const abs = Math.abs(c);
      const bg = c > 0 ? 'rgba(16,185,129,' + (abs * 0.4) + ')' : 'rgba(239,68,68,' + (abs * 0.4) + ')';
      const color = abs > 0.5 ? '#fff' : 'var(--text-dim)';
      html += '<td style="padding:3px;text-align:center;background:' + bg + ';color:' + color + ';font-family:var(--font-mono);border-radius:2px">' + c.toFixed(2) + '</td>';
    });
    html += '</tr>';
  });
  html += '</table>';
  el.innerHTML = html;
}

/* =====================================================================
   GREEKS SUMMARY (Options positions)
   ===================================================================== */
function renderGreeksSummary(openTrades) {
  const el = document.getElementById('riskGreeks');
  if (!el) return;

  const opts = openTrades.filter(t => ['OPTION_NG','OPTION_CL'].includes(t.type));
  if (!opts.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:11px;text-align:center;padding:12px">No options positions</div>'; return; }

  let totalDelta = 0, totalGamma = 0, totalTheta = 0, totalVega = 0;
  opts.forEach(t => {
    const vol = parseFloat(t.volume || 0);
    const dir = t.direction === 'BUY' ? 1 : -1;
    const spot = getPrice(t.hub);
    const strike = parseFloat(t.strike || spot);
    const isCall = t.callPut !== 'PUT';
    // Simplified Greeks estimation
    const moneyness = spot / strike;
    const d = isCall ? Math.max(0.1, Math.min(0.9, 0.5 + (moneyness - 1) * 2)) : Math.max(0.1, Math.min(0.9, 0.5 - (moneyness - 1) * 2));
    const delta = d * dir * vol / 10000;
    const gamma = 0.02 * vol / 10000;
    const theta = -0.01 * spot * vol / 10000 * dir;
    const vega = 0.15 * spot * vol / 10000;
    totalDelta += delta; totalGamma += gamma; totalTheta += theta; totalVega += vega;
  });

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">'
    + '<div><div style="font-size:10px;color:var(--text-muted)">Delta</div><div class="mono" style="font-size:14px;font-weight:700;color:' + (totalDelta >= 0 ? 'var(--green)' : 'var(--red)') + '">' + totalDelta.toFixed(2) + '</div></div>'
    + '<div><div style="font-size:10px;color:var(--text-muted)">Gamma</div><div class="mono" style="font-size:14px;font-weight:700">' + totalGamma.toFixed(4) + '</div></div>'
    + '<div><div style="font-size:10px;color:var(--text-muted)">Theta</div><div class="mono" style="font-size:14px;font-weight:700;color:var(--red)">' + totalTheta.toFixed(2) + '/d</div></div>'
    + '<div><div style="font-size:10px;color:var(--text-muted)">Vega</div><div class="mono" style="font-size:14px;font-weight:700">' + totalVega.toFixed(2) + '</div></div>'
    + '</div>';
}

/* =====================================================================
   DRAWDOWN CHART
   ===================================================================== */
function drawDrawdownChart(equityArr) {
  const canvas = document.getElementById('drawdownChart');
  if (!canvas || !canvas.parentElement || !equityArr || equityArr.length < 2) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = window.devicePixelRatio || 1;
  const W = rect.width, H = 120;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  ctx.fillStyle = isLight ? '#fff' : getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  ctx.fillRect(0, 0, W, H);

  // Calculate full drawdown series
  const fullDD = [];
  let peak = equityArr[0];
  equityArr.forEach(v => {
    if (v > peak) peak = v;
    fullDD.push(((peak - v) / peak) * 100);
  });

  // Apply zoom if set
  let dd = fullDD;
  const ddZoom = canvas._ddZoom;
  if (ddZoom && ddZoom.end > ddZoom.start) {
    dd = fullDD.slice(ddZoom.start, ddZoom.end);
    if (dd.length < 2) dd = fullDD;
  }

  const maxDD = Math.max(...dd, 1);
  const padL = 55, padR = 20, padT = 10, padB = 20;
  const cW = W - padL - padR, cH = H - padT - padB;

  // Fill area
  ctx.beginPath();
  dd.forEach((v, i) => {
    const x = padL + (i / (dd.length - 1)) * cW;
    const y = padT + (v / maxDD) * cH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(padL + cW, padT); ctx.lineTo(padL, padT); ctx.closePath();
  ctx.fillStyle = 'rgba(239,68,68,0.15)'; ctx.fill();

  // Line
  ctx.beginPath();
  dd.forEach((v, i) => {
    const x = padL + (i / (dd.length - 1)) * cW;
    const y = padT + (v / maxDD) * cH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5; ctx.stroke();

  // Y labels
  ctx.fillStyle = isLight ? '#475569' : '#94a3b8';
  ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
  ctx.fillText('0%', padL - 6, padT + 4);
  ctx.fillText('-' + maxDD.toFixed(1) + '%', padL - 6, padT + cH + 4);

  // Label
  ctx.fillStyle = '#ef4444'; ctx.font = '10px Inter'; ctx.textAlign = 'left';
  ctx.fillText('Drawdown', padL + 4, padT + 12);

  // Store metadata for crosshair + zoom
  canvas._ddMeta = { padL, padR, padT, padB, cW, cH, maxDD, dd, fullDD, W, H };
  canvas._ddEquityArr = equityArr;
}

/* =====================================================================
   DRAWDOWN CROSSHAIR + ZOOM
   ===================================================================== */
function initDrawdownCrosshair() {
  const canvas = document.getElementById('drawdownChart');
  if (!canvas || canvas._ddCrosshairInit) return;
  canvas._ddCrosshairInit = true;
  let _panState = null;

  // Wheel zoom
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const meta = canvas._ddMeta;
    if (!meta || !meta.fullDD || meta.fullDD.length < 3) return;
    const fullLen = meta.fullDD.length;
    const curZoom = canvas._ddZoom || { start: 0, end: fullLen };
    const viewLen = curZoom.end - curZoom.start;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, (mx - meta.padL) / meta.cW));
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    const newLen = Math.round(Math.max(10, Math.min(fullLen, viewLen * factor)));
    const anchor = curZoom.start + Math.round(pct * viewLen);
    let ns = Math.round(anchor - pct * newLen), ne = ns + newLen;
    if (ns < 0) { ns = 0; ne = newLen; }
    if (ne > fullLen) { ne = fullLen; ns = fullLen - newLen; }
    if (ne - ns >= fullLen) { delete canvas._ddZoom; } else { canvas._ddZoom = { start: Math.max(0, ns), end: Math.min(fullLen, ne) }; }
    if (canvas._ddEquityArr) drawDrawdownChart(canvas._ddEquityArr);
  }, { passive: false });

  // Drag pan
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const meta = canvas._ddMeta;
    if (!meta || !meta.fullDD) return;
    _panState = { startX: e.clientX, zoom: { ...(canvas._ddZoom || { start: 0, end: meta.fullDD.length }) } };
  });
  canvas.addEventListener('mouseup', () => { _panState = null; });

  // Double-click reset
  canvas.addEventListener('dblclick', () => {
    delete canvas._ddZoom;
    if (canvas._ddEquityArr) drawDrawdownChart(canvas._ddEquityArr);
  });

  canvas.addEventListener('mousemove', e => {
    const meta = canvas._ddMeta;
    if (!meta) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    // Handle pan drag
    if (_panState && meta.fullDD) {
      const dataPerPx = meta.dd.length / meta.cW;
      const shift = Math.round(-(e.clientX - _panState.startX) * dataPerPx);
      const fullLen = meta.fullDD.length;
      const viewLen = _panState.zoom.end - _panState.zoom.start;
      let ns = _panState.zoom.start + shift, ne = ns + viewLen;
      if (ns < 0) { ns = 0; ne = viewLen; }
      if (ne > fullLen) { ne = fullLen; ns = fullLen - viewLen; }
      canvas._ddZoom = { start: ns, end: ne };
      if (canvas._ddEquityArr) drawDrawdownChart(canvas._ddEquityArr);
      return;
    }

    const { padL, padT, cW, cH, maxDD, dd, W, H } = meta;

    if (mx < padL || mx > padL + cW) {
      if (canvas._ddEquityArr) drawDrawdownChart(canvas._ddEquityArr);
      return;
    }

    // Find nearest index
    const idx = Math.round(((mx - padL) / cW) * (dd.length - 1));
    const clampIdx = Math.max(0, Math.min(dd.length - 1, idx));
    const val = dd[clampIdx];

    const snapX = padL + (clampIdx / (dd.length - 1)) * cW;
    const snapY = padT + (val / maxDD) * cH;

    // Redraw base
    if (canvas._ddEquityArr) drawDrawdownChart(canvas._ddEquityArr);
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Crosshair lines
    ctx.strokeStyle = 'rgba(148,163,184,0.4)'; ctx.lineWidth = 0.5; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(snapX, padT); ctx.lineTo(snapX, padT + cH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, snapY); ctx.lineTo(padL + cW, snapY); ctx.stroke();
    ctx.setLineDash([]);

    // Snap dot
    ctx.beginPath(); ctx.arc(snapX, snapY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    // Tooltip showing drawdown %
    const txt = '-' + val.toFixed(2) + '%';
    ctx.font = '11px JetBrains Mono';
    const tw = ctx.measureText(txt).width + 16;
    const tipX = snapX + 12 + tw > padL + cW ? snapX - tw - 12 : snapX + 12;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(tipX, snapY - 12, tw, 22);
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1;
    ctx.strokeRect(tipX, snapY - 12, tw, 22);
    ctx.fillStyle = '#ef4444'; ctx.textAlign = 'left';
    ctx.fillText(txt, tipX + 8, snapY + 4);

    // Date label at bottom
    const now = new Date();
    const daysBack = dd.length - 1 - clampIdx;
    const labelDate = new Date(now.getTime() - daysBack * 86400000);
    const dateStr = labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ctx.font = '10px JetBrains Mono';
    const dtw = ctx.measureText(dateStr).width + 10;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(snapX - dtw / 2, padT + cH + 2, dtw, 16);
    ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center';
    ctx.fillText(dateStr, snapX, padT + cH + 13);

    ctx.restore();
  });

  canvas.addEventListener('mouseleave', () => {
    _panState = null;
    if (canvas._ddEquityArr) drawDrawdownChart(canvas._ddEquityArr);
  });
}

