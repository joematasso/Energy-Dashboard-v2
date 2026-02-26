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
      case 'weather': if (typeof renderWeatherPage === 'function') renderWeatherPage(); break;
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
  const dailyVol = 0.02;

  // VaR
  const var95 = portfolio * dailyVol * 1.645;
  const var99 = portfolio * dailyVol * 2.326;
  document.getElementById('riskPortValue').textContent = '$' + equity.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('riskVar95').textContent = '-$' + var95.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('riskVar99').textContent = '-$' + var99.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('riskCvar95').textContent = '-$' + (var95*1.3).toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('riskCvar99').textContent = '-$' + (var99*1.3).toLocaleString(undefined,{maximumFractionDigits:0});

  // Performance
  const wr = (wins+losses)>0 ? ((wins/(wins+losses))*100).toFixed(1)+'%' : '—';
  const pf = grossLosses>0 ? (grossWins/grossLosses).toFixed(2) : (grossWins>0?'999':'—');
  const avgWin = wins>0 ? grossWins/wins : 0;
  const avgLoss = losses>0 ? grossLosses/losses : 0;
  const sharpe = pnlList.length>1 ? (function(){ const mean=pnlList.reduce((a,b)=>a+b,0)/pnlList.length; const std=Math.sqrt(pnlList.reduce((s,v)=>s+(v-mean)*(v-mean),0)/(pnlList.length-1)); return std>0?((mean/std)*Math.sqrt(252)).toFixed(2):'—'; })() : '—';

  document.getElementById('riskSharpe').textContent = sharpe;
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
      else if (POWER_HUBS.find(h=>h.name===t.hub)) pctMove = sc.power;
      else pctMove = sc.ng;
      impact += entry * (pctMove/100) * vol * dir;
    });
    const impColor = impact>=0?'green':'red';
    return `<tr><td style="font-weight:600">${sc.name}</td><td class="mono">${sc.ng>=0?'+':''}${sc.ng}%</td><td class="mono">${sc.power>=0?'+':''}${sc.power}%</td><td class="mono">${sc.crude>=0?'+':''}${sc.crude}%</td><td class="mono">${sc.freight>=0?'+':''}${sc.freight}%</td><td class="mono ${impColor}" style="font-weight:700">${impact>=0?'+':'-'}$${Math.abs(impact).toLocaleString(undefined,{maximumFractionDigits:0})}</td></tr>`;
  }).join('');

  // Open positions
  const riskOpen = document.getElementById('riskOpenBody');
  const open = STATE.trades.filter(t=>t.status==='OPEN');
  if (!open.length) { riskOpen.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">No open positions</td></tr>'; }
  else { riskOpen.innerHTML = open.map(t => { const spot=getPrice(t.hub);const dir=t.direction==='BUY'?1:-1;const mtm=(spot-parseFloat(t.entryPrice))*parseFloat(t.volume)*dir;return `<tr><td>${t.hub}</td><td style="color:${t.direction==='BUY'?'var(--green)':'var(--red)'};font-weight:700">${t.direction}</td><td class="mono">${parseFloat(t.volume).toLocaleString()}</td><td class="mono ${mtm>=0?'green':'red'}">${mtm>=0?'+':'-'}$${Math.abs(mtm).toLocaleString(undefined,{maximumFractionDigits:0})}</td></tr>`;}).join(''); }

  // Equity curve
  drawEquityCurve();
  try { initEquityCrosshair(); } catch(e) { console.error('Equity crosshair error:', e); }

  // Position Heatmap
  renderRiskHeatmap(open);
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
  if (closed.length<1){ctx.fillStyle=isLight?'#94a3b8':'#475569';ctx.font='13px IBM Plex Sans';ctx.textAlign='center';ctx.fillText('Close trades to see equity curve',W/2,H/2);return;}

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
  ctx.fillStyle=textColor;ctx.font='11px IBM Plex Mono';ctx.textAlign='right';
  for(let i=0;i<=4;i++){const val=min+(rangeV*i/4);const y=padT+(1-i/4)*cH;ctx.fillText('$'+(val/1000).toFixed(0)+'k',padL-8,y+4);}

  // X-axis date labels
  ctx.fillStyle = textColor;
  ctx.font = '10px IBM Plex Mono';
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
  ctx.font = '11px IBM Plex Mono';
  ctx.fillStyle = lineColor;
  ctx.fillText((periodPnl>=0?'+':'-')+'$'+Math.abs(periodPnl).toLocaleString(undefined,{maximumFractionDigits:0})+' ('+periodPct.toFixed(2)+'%)', statsX, padT + 14);
  ctx.fillStyle = textColor;
  ctx.font = '10px IBM Plex Mono';
  ctx.fillText('DD: '+drawdown.toFixed(2)+'%  Hi: $'+(periodHigh/1000).toFixed(1)+'k  Lo: $'+(periodLow/1000).toFixed(1)+'k', statsX, padT + 28);

  // Store metadata for crosshair
  canvas._eqMeta = { padL, padR, padT, padB, cW, cH, min, max, range: rangeV, data: equityPts, lineColor, W, H, startVal };
}

function initEquityCrosshair() {
  const canvas = document.getElementById('equityChart');
  if (!canvas || canvas._eqCrosshairInit) return;
  canvas._eqCrosshairInit = true;

  canvas.addEventListener('mousemove', e => {
    const meta = canvas._eqMeta;
    if (!meta) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
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
    ctx.font = '11px IBM Plex Mono';
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
    ctx.font = '10px IBM Plex Mono';
    const dtw = ctx.measureText(dateStr).width + 10;
    const padB = meta.padB;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(snapX - dtw / 2, padT + cH + 2, dtw, 18);
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.fillText(dateStr, snapX, padT + cH + 14);

    ctx.restore();
  });

  canvas.addEventListener('mouseleave', () => {
    if (canvas._eqMeta) drawEquityCurve();
  });
}

