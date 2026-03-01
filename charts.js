/* =====================================================================
   TECHNICAL ANALYSIS STATE
   ===================================================================== */
if (!STATE.ta) STATE.ta = { sma20:true, sma50:false, sma200:false, ema20:false, bb:false, rsi:false, macd:false, vol:false, fib:false, alerts:{} };

function _sma(data, period) {
  const out = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0; for (let j = i - period + 1; j <= i; j++) sum += data[j];
    out.push(sum / period);
  }
  return out;
}
function _ema(data, period) {
  const out = []; const k = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { out.push(data[0]); }
    else if (i < period - 1) { let s = 0; for (let j = 0; j <= i; j++) s += data[j]; out.push(s / (i + 1)); }
    else { out.push(data[i] * k + out[i - 1] * (1 - k)); }
  }
  return out;
}
function _bollinger(data, period, mult) {
  const sma = _sma(data, period);
  const upper = [], lower = [];
  for (let i = 0; i < data.length; i++) {
    if (sma[i] === null) { upper.push(null); lower.push(null); continue; }
    let sum = 0; for (let j = i - period + 1; j <= i; j++) sum += (data[j] - sma[i]) * (data[j] - sma[i]);
    const std = Math.sqrt(sum / period);
    upper.push(sma[i] + mult * std); lower.push(sma[i] - mult * std);
  }
  return { mid: sma, upper, lower };
}
function _rsi(data, period) {
  const out = []; let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { out.push(null); continue; }
    const diff = data[i] - data[i - 1];
    const gain = diff > 0 ? diff : 0, loss = diff < 0 ? -diff : 0;
    if (i <= period) { avgGain += gain / period; avgLoss += loss / period; if (i < period) { out.push(null); continue; } }
    else { avgGain = (avgGain * (period - 1) + gain) / period; avgLoss = (avgLoss * (period - 1) + loss) / period; }
    const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}
function _macd(data) {
  const ema12 = _ema(data, 12), ema26 = _ema(data, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = _ema(macdLine, 9);
  const hist = macdLine.map((v, i) => v - signal[i]);
  return { macd: macdLine, signal, hist };
}

function toggleTA(key) {
  STATE.ta[key] = !STATE.ta[key];
  document.querySelectorAll('.ta-btn[data-ta="' + key + '"]').forEach(btn => btn.classList.toggle('active', STATE.ta[key]));
  renderCurrentPage();
}

function renderTAToolbar(containerId) {
  const container = document.getElementById(containerId);
  if (!container || container.querySelector('.ta-toolbar')) return;
  const header = container.querySelector('.chart-header');
  if (!header) return;
  const tb = document.createElement('div');
  tb.className = 'ta-toolbar';
  tb.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">'
    + '<span style="font-size:10px;color:var(--text-muted);font-weight:600;margin-right:4px">TA:</span>'
    + '<button class="ta-btn' + (STATE.ta.sma20 ? ' active' : '') + '" data-ta="sma20" onclick="toggleTA(\'sma20\')">SMA20</button>'
    + '<button class="ta-btn' + (STATE.ta.sma50 ? ' active' : '') + '" data-ta="sma50" onclick="toggleTA(\'sma50\')">SMA50</button>'
    + '<button class="ta-btn' + (STATE.ta.ema20 ? ' active' : '') + '" data-ta="ema20" onclick="toggleTA(\'ema20\')">EMA20</button>'
    + '<button class="ta-btn' + (STATE.ta.bb ? ' active' : '') + '" data-ta="bb" onclick="toggleTA(\'bb\')">BB</button>'
    + '<button class="ta-btn' + (STATE.ta.rsi ? ' active' : '') + '" data-ta="rsi" onclick="toggleTA(\'rsi\')">RSI</button>'
    + '<button class="ta-btn' + (STATE.ta.macd ? ' active' : '') + '" data-ta="macd" onclick="toggleTA(\'macd\')">MACD</button>'
    + '<button class="ta-btn' + (STATE.ta.vol ? ' active' : '') + '" data-ta="vol" onclick="toggleTA(\'vol\')">Vol</button>'
    + '<button class="ta-btn' + (STATE.ta.fib ? ' active' : '') + '" data-ta="fib" onclick="toggleTA(\'fib\')">Fib</button>'
    + '</div>';
  header.after(tb);
}

/* =====================================================================
   CHART RENDERING
   ===================================================================== */
function drawChart(canvasId, hubName, range) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !canvas.parentElement) return;
  // Inject TA toolbar if parent chart-container exists
  const chartContainer = canvas.closest('.chart-container');
  if (chartContainer) renderTAToolbar(chartContainer.id);
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
  const hist = (typeof getChartHistory === 'function') ? getChartHistory(hubName) : priceHistory[hubName];
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

  // Percent change badge (top-right)
  const firstPrice = data[0], lastPrice = data[data.length - 1];
  const pctChg = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const absChg = lastPrice - firstPrice;
  const pctColor = pctChg >= 0 ? '#10b981' : '#ef4444';
  const pctSign = pctChg >= 0 ? '+' : '';
  const isLargeVal = hubName.includes('Baltic') || hubName.includes('Index') || (hub && hub.base > 100);
  const chgStr = isLargeVal
    ? `${pctSign}${absChg.toFixed(0)} (${pctSign}${pctChg.toFixed(2)}%)`
    : `${pctSign}${absChg.toFixed(2)} (${pctSign}${pctChg.toFixed(2)}%)`;
  ctx.font = 'bold 12px IBM Plex Mono';
  const chgW = ctx.measureText(chgStr).width + 14;
  ctx.fillStyle = pctColor + '18';
  ctx.fillRect(W - padR - chgW - 4, padT + 2, chgW + 4, 22);
  ctx.fillStyle = pctColor;
  ctx.textAlign = 'right';
  ctx.fillText(chgStr, W - padR - 6, padT + 17);

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

  // --- Technical Analysis Overlays ---
  const ta = STATE.ta || {};
  const rangeV = max - min || 1;
  function _yPos(v) { return padT + (1 - (v - min) / rangeV) * cH; }
  function _xPos(i) { return padL + (i / (data.length - 1)) * cW; }
  function _drawLine(arr, color, width, dash) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width || 1;
    if (dash) ctx.setLineDash(dash);
    let started = false;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === null) { started = false; continue; }
      if (!started) { ctx.moveTo(_xPos(i), _yPos(arr[i])); started = true; }
      else ctx.lineTo(_xPos(i), _yPos(arr[i]));
    }
    ctx.stroke(); if (dash) ctx.setLineDash([]);
  }

  // SMA overlays
  if (ta.sma20) _drawLine(_sma(data, 20), '#f59e0b', 1.2);
  if (ta.sma50) _drawLine(_sma(data, 50), '#a78bfa', 1.2);
  if (ta.sma200 && data.length >= 200) _drawLine(_sma(data, 200), '#ef4444', 1.2);
  if (ta.ema20) _drawLine(_ema(data, 20), '#22d3ee', 1.2, [4, 2]);

  // Bollinger Bands
  if (ta.bb) {
    const bb = _bollinger(data, 20, 2);
    _drawLine(bb.upper, 'rgba(168,85,247,0.5)', 0.8, [3, 3]);
    _drawLine(bb.lower, 'rgba(168,85,247,0.5)', 0.8, [3, 3]);
    // Fill between bands
    ctx.beginPath(); ctx.fillStyle = 'rgba(168,85,247,0.06)';
    let started = false;
    for (let i = 0; i < data.length; i++) {
      if (bb.upper[i] === null) continue;
      if (!started) { ctx.moveTo(_xPos(i), _yPos(bb.upper[i])); started = true; }
      else ctx.lineTo(_xPos(i), _yPos(bb.upper[i]));
    }
    for (let i = data.length - 1; i >= 0; i--) {
      if (bb.lower[i] === null) continue;
      ctx.lineTo(_xPos(i), _yPos(bb.lower[i]));
    }
    ctx.closePath(); ctx.fill();
  }

  // Fibonacci retracement levels
  if (ta.fib && data.length > 10) {
    const fibHigh = Math.max(...data), fibLow = Math.min(...data);
    const fibDiff = fibHigh - fibLow;
    [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].forEach(level => {
      const price = fibHigh - fibDiff * level;
      const y = _yPos(price);
      ctx.strokeStyle = 'rgba(245,158,11,0.25)'; ctx.lineWidth = 0.5; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cW, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245,158,11,0.5)'; ctx.font = '9px IBM Plex Mono'; ctx.textAlign = 'left';
      ctx.fillText((level * 100).toFixed(1) + '%', padL + 4, y - 3);
    });
  }

  // Price alerts
  const alerts = (ta.alerts && ta.alerts[hubName]) || [];
  alerts.forEach(a => {
    const y = _yPos(a.price);
    if (y < padT || y > padT + cH) return;
    ctx.strokeStyle = a.color || '#ef4444'; ctx.lineWidth = 1; ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cW, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = a.color || '#ef4444'; ctx.font = '10px IBM Plex Mono'; ctx.textAlign = 'right';
    ctx.fillText('ALERT ' + a.price.toFixed(2), padL + cW - 4, y - 3);
  });

  // Store extended chart meta for crosshair + sub-charts
  canvas._chartMeta = { padL, padR, padT, padB, cW, cH, min, max, data, hubName, hub };

  // --- Sub-charts: RSI / MACD / Volume (drawn below main chart) ---
  const subCharts = [];
  if (ta.vol) subCharts.push('vol');
  if (ta.rsi) subCharts.push('rsi');
  if (ta.macd) subCharts.push('macd');
  if (subCharts.length) {
    const subH = 60;
    const totalExtra = subCharts.length * (subH + 8);
    // Expand canvas if needed
    const newH = H + totalExtra;
    const dpr2 = window.devicePixelRatio || 1;
    canvas.height = newH * dpr2;
    canvas.style.height = newH + 'px';
    ctx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
    let subY = H + 4;
    const isLight2 = document.documentElement.getAttribute('data-theme') === 'light';
    const subTextColor = isLight2 ? '#475569' : '#94a3b8';

    subCharts.forEach(type => {
      // Sub-chart background
      ctx.fillStyle = isLight2 ? '#f8fafc' : 'rgba(15,23,42,0.3)';
      ctx.fillRect(padL, subY, cW, subH);
      ctx.strokeStyle = isLight2 ? '#e2e8f0' : 'rgba(30,45,61,0.4)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(padL, subY, cW, subH);

      if (type === 'rsi') {
        const rsiData = _rsi(data, 14);
        // Overbought/oversold zones
        const ob = subY + (1 - 70 / 100) * subH, os = subY + (1 - 30 / 100) * subH;
        ctx.fillStyle = 'rgba(239,68,68,0.06)'; ctx.fillRect(padL, subY, cW, ob - subY);
        ctx.fillStyle = 'rgba(16,185,129,0.06)'; ctx.fillRect(padL, os, cW, subY + subH - os);
        // 30/70 lines
        ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(padL, ob); ctx.lineTo(padL + cW, ob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(padL, os); ctx.lineTo(padL + cW, os); ctx.stroke();
        ctx.setLineDash([]);
        // 50 center line
        const mid50 = subY + subH / 2;
        ctx.strokeStyle = 'rgba(148,163,184,0.15)'; ctx.beginPath(); ctx.moveTo(padL, mid50); ctx.lineTo(padL + cW, mid50); ctx.stroke();
        // RSI line
        ctx.beginPath(); ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.5;
        let started = false;
        for (let i = 0; i < rsiData.length; i++) {
          if (rsiData[i] === null) continue;
          const x = _xPos(i), y = subY + (1 - rsiData[i] / 100) * subH;
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // Labels
        ctx.fillStyle = subTextColor; ctx.font = '9px IBM Plex Mono'; ctx.textAlign = 'right';
        ctx.fillText('70', padL - 4, ob + 3); ctx.fillText('30', padL - 4, os + 3);
        ctx.fillStyle = '#a78bfa'; ctx.font = '10px IBM Plex Sans'; ctx.textAlign = 'left';
        ctx.fillText('RSI(14)', padL + 4, subY + 12);
        // Current RSI value
        const lastRsi = rsiData.filter(v => v !== null).slice(-1)[0];
        if (lastRsi !== undefined) {
          ctx.textAlign = 'right'; ctx.font = 'bold 11px IBM Plex Mono';
          ctx.fillStyle = lastRsi > 70 ? '#ef4444' : lastRsi < 30 ? '#10b981' : '#a78bfa';
          ctx.fillText(lastRsi.toFixed(1), padL + cW - 4, subY + 12);
        }
      }

      if (type === 'macd') {
        const md = _macd(data);
        const allVals = [...md.macd, ...md.signal, ...md.hist].filter(v => v !== null && isFinite(v));
        const mMin = Math.min(...allVals), mMax = Math.max(...allVals);
        const mRange = mMax - mMin || 1;
        function mY(v) { return subY + (1 - (v - mMin) / mRange) * subH; }
        // Zero line
        const zeroY = mY(0);
        ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(padL + cW, zeroY); ctx.stroke();
        // Histogram bars
        const barW = Math.max(1, cW / data.length - 0.5);
        for (let i = 0; i < md.hist.length; i++) {
          const x = _xPos(i); const h = md.hist[i];
          ctx.fillStyle = h >= 0 ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)';
          const y1 = mY(h), y0 = zeroY;
          ctx.fillRect(x - barW / 2, Math.min(y1, y0), barW, Math.abs(y1 - y0));
        }
        // MACD line
        ctx.beginPath(); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.2;
        let s1 = false;
        for (let i = 26; i < md.macd.length; i++) { const x = _xPos(i), y = mY(md.macd[i]); if (!s1) { ctx.moveTo(x, y); s1 = true; } else ctx.lineTo(x, y); }
        ctx.stroke();
        // Signal line
        ctx.beginPath(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1;
        s1 = false;
        for (let i = 26; i < md.signal.length; i++) { const x = _xPos(i), y = mY(md.signal[i]); if (!s1) { ctx.moveTo(x, y); s1 = true; } else ctx.lineTo(x, y); }
        ctx.stroke();
        ctx.fillStyle = '#22d3ee'; ctx.font = '10px IBM Plex Sans'; ctx.textAlign = 'left';
        ctx.fillText('MACD', padL + 4, subY + 12);
      }

      if (type === 'vol') {
        // Simulate volume from price changes (no real volume data)
        const vol = data.map((v, i) => i === 0 ? 0 : Math.abs(v - data[i - 1]) * 1000 + Math.random() * 500);
        const maxVol = Math.max(...vol) || 1;
        const barW = Math.max(1, cW / data.length - 0.5);
        for (let i = 0; i < vol.length; i++) {
          const x = _xPos(i);
          const h = (vol[i] / maxVol) * subH * 0.85;
          const isUp = i > 0 && data[i] >= data[i - 1];
          ctx.fillStyle = isUp ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';
          ctx.fillRect(x - barW / 2, subY + subH - h, barW, h);
        }
        ctx.fillStyle = subTextColor; ctx.font = '10px IBM Plex Sans'; ctx.textAlign = 'left';
        ctx.fillText('Volume', padL + 4, subY + 12);
      }

      subY += subH + 8;
    });
  }
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

function addPriceAlert(hubName) {
  const priceStr = prompt('Enter alert price for ' + hubName + ':');
  if (!priceStr) return;
  const price = parseFloat(priceStr);
  if (isNaN(price) || price <= 0) { toast('Invalid price', 'error'); return; }
  if (!STATE.ta.alerts) STATE.ta.alerts = {};
  if (!STATE.ta.alerts[hubName]) STATE.ta.alerts[hubName] = [];
  STATE.ta.alerts[hubName].push({ price, color: '#ef4444', triggered: false });
  toast('Alert set at $' + price.toFixed(2) + ' for ' + hubName, 'info');
  renderCurrentPage();
}
function clearPriceAlerts(hubName) {
  if (!STATE.ta.alerts) return;
  delete STATE.ta.alerts[hubName];
  toast('Alerts cleared for ' + hubName, 'info');
  renderCurrentPage();
}
// Check alerts on each tick
function checkPriceAlerts() {
  if (!STATE.ta || !STATE.ta.alerts) return;
  Object.entries(STATE.ta.alerts).forEach(([hub, alerts]) => {
    const price = getPrice(hub);
    if (!price) return;
    alerts.forEach(a => {
      if (a.triggered) return;
      if ((a._lastPrice && a._lastPrice < a.price && price >= a.price) || (a._lastPrice && a._lastPrice > a.price && price <= a.price)) {
        a.triggered = true;
        toast('ALERT: ' + hub + ' crossed $' + a.price.toFixed(2) + ' (now $' + price.toFixed(2) + ')', 'info');
        try { new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==').play(); } catch(e) {}
      }
      a._lastPrice = price;
    });
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

