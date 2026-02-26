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

