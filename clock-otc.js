/* =====================================================================
   WEATHER SYSTEM
   ===================================================================== */
let _wxLastFetch = 0;
const WX_FETCH_INTERVAL = 300000; // 5 min client-side polling

async function fetchWeather(force) {
  if (!force && Date.now() - _wxLastFetch < WX_FETCH_INTERVAL && STATE.weather) return;
  try {
    const [fRes, bRes] = await Promise.all([
      fetch(API_BASE + '/api/weather/forecast'),
      fetch(API_BASE + '/api/weather/bias')
    ]);
    const fData = await fRes.json();
    const bData = await bRes.json();
    if (fData.success) {
      STATE.weather = fData.cities;
      STATE.weatherSource = fData.source;
    }
    if (bData.success) {
      STATE.weatherBias = bData.bias || {};
      STATE._isHeatingSeason = bData.is_heating_season;
    }
    _wxLastFetch = Date.now();
    if (STATE.currentPage === 'weather') renderWeatherPage();
  } catch(e) { console.warn('Weather fetch failed:', e); }
}

function renderWeatherPage() {
  if (!STATE.weather) { fetchWeather(true); return; }
  const cities = STATE.weather;
  const bias = STATE.weatherBias;

  // Source indicator — populate both old and new locations
  ['wxSource','wxSource2'].forEach(id => {
    const srcEl = document.getElementById(id);
    if (srcEl) {
      const isLive = STATE.weatherSource === 'open-meteo';
      srcEl.innerHTML = (isLive ? '🟢' : '🟡') + ' ' + (isLive ? 'Live — Open-Meteo' : 'Simulated Forecast');
      srcEl.style.background = isLive ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)';
      srcEl.style.color = isLive ? '#10b981' : '#f59e0b';
    }
  });

  // HDD/CDD table — populate both
  const ddHtml = cities.map(c => {
    const s = c.summary;
    const hubBias = c.hubs.map(h => bias[h] || 0);
    const avgBias = hubBias.length ? hubBias.reduce((a,b)=>a+b,0)/hubBias.length : 0;
    const biasStr = avgBias > 0.001 ? '🔺 Bullish' : avgBias < -0.001 ? '🔻 Bearish' : '— Neutral';
    const biasColor = avgBias > 0.001 ? '#10b981' : avgBias < -0.001 ? '#ef4444' : 'var(--text-muted)';
    return `<tr>
      <td style="font-weight:600">${c.name}, ${c.state}</td>
      <td><div style="display:flex;flex-wrap:wrap;gap:3px">${c.hubs.map(h => '<span class="wx-hub-chip">'+h+'</span>').join('')}</div></td>
      <td style="text-align:right;font-weight:600">${s.hdd_6_10.toFixed(0)}</td>
      <td style="text-align:right;color:var(--text-muted)">${s.normal_hdd_6_10.toFixed(0)}</td>
      <td style="text-align:right;font-weight:700;color:${s.hdd_6_10_dev > 2 ? '#38bdf8' : s.hdd_6_10_dev < -2 ? '#ef4444' : 'var(--text-muted)'}">${s.hdd_6_10_dev > 0 ? '+' : ''}${s.hdd_6_10_dev.toFixed(0)}</td>
      <td style="text-align:right;font-weight:600">${s.cdd_6_10.toFixed(0)}</td>
      <td style="text-align:right;color:var(--text-muted)">${s.normal_cdd_6_10.toFixed(0)}</td>
      <td style="text-align:right;font-weight:700;color:${s.cdd_6_10_dev > 2 ? '#ef4444' : s.cdd_6_10_dev < -2 ? '#38bdf8' : 'var(--text-muted)'}">${s.cdd_6_10_dev > 0 ? '+' : ''}${s.cdd_6_10_dev.toFixed(0)}</td>
      <td style="text-align:right;font-weight:600">${s.hdd_8_14.toFixed(0)}</td>
      <td style="text-align:right;font-weight:700;color:${s.hdd_8_14_dev > 2 ? '#38bdf8' : s.hdd_8_14_dev < -2 ? '#ef4444' : 'var(--text-muted)'}">${s.hdd_8_14_dev > 0 ? '+' : ''}${s.hdd_8_14_dev.toFixed(0)}</td>
      <td style="text-align:right;font-weight:600">${s.cdd_8_14.toFixed(0)}</td>
      <td style="text-align:right;font-weight:700;color:${s.cdd_8_14_dev > 2 ? '#ef4444' : s.cdd_8_14_dev < -2 ? '#38bdf8' : 'var(--text-muted)'}">${s.cdd_8_14_dev > 0 ? '+' : ''}${s.cdd_8_14_dev.toFixed(0)}</td>
      <td style="color:${biasColor};font-weight:600;font-size:11px;white-space:nowrap">${biasStr}</td>
    </tr>`;
  }).join('');
  ['wxDDBody','wxDDBody2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = ddHtml;
  });

  // City forecast cards — populate both
  const cityHtml = cities.map(c => {
    const days = c.days;
    const today = days[0] || {};
    const avgAnomaly = days.slice(0,7).reduce((s,d) => s + d.anomaly, 0) / Math.min(7, days.length);
    const anomalyClass = avgAnomaly < -3 ? 'cold' : avgAnomaly > 3 ? 'warm' : 'neutral';
    const anomalyText = avgAnomaly < -3 ? 'Below Normal' : avgAnomaly > 3 ? 'Above Normal' : 'Near Normal';
    const canvasId = 'wxSpark_' + c.id;
    return `<div class="wx-city-card">
      <div class="wx-city-header">
        <div>
          <div class="wx-city-name">${c.name}, ${c.state}</div>
          <span class="wx-anomaly-badge ${anomalyClass}">${avgAnomaly > 0 ? '+' : ''}${avgAnomaly.toFixed(1)}°F · ${anomalyText}</span>
        </div>
        <div style="text-right">
          <div class="wx-city-temp">${today.high ? today.high.toFixed(0) : '--'}°</div>
          <div style="font-size:11px;color:var(--text-muted)">H: ${today.high ? today.high.toFixed(0) : '--'} / L: ${today.low ? today.low.toFixed(0) : '--'}</div>
        </div>
      </div>
      <canvas class="wx-sparkline" id="${canvasId}"></canvas>
      <div class="wx-city-hubs">${c.hubs.map(h => {
        const b = bias[h] || 0;
        const color = b > 0.001 ? '#10b981' : b < -0.001 ? '#ef4444' : 'var(--text-dim)';
        return `<span class="wx-hub-chip" style="border-left:2px solid ${color}">${h}</span>`;
      }).join('')}</div>
    </div>`;
  }).join('');

  // For NG-embedded grid, use unique canvas IDs
  const cityHtml2 = cities.map(c => {
    const days = c.days;
    const today = days[0] || {};
    const avgAnomaly = days.slice(0,7).reduce((s,d) => s + d.anomaly, 0) / Math.min(7, days.length);
    const anomalyClass = avgAnomaly < -3 ? 'cold' : avgAnomaly > 3 ? 'warm' : 'neutral';
    const anomalyText = avgAnomaly < -3 ? 'Below Normal' : avgAnomaly > 3 ? 'Above Normal' : 'Near Normal';
    const canvasId = 'wxSpark2_' + c.id;
    return `<div class="wx-city-card">
      <div class="wx-city-header">
        <div>
          <div class="wx-city-name">${c.name}, ${c.state}</div>
          <span class="wx-anomaly-badge ${anomalyClass}">${avgAnomaly > 0 ? '+' : ''}${avgAnomaly.toFixed(1)}°F · ${anomalyText}</span>
        </div>
        <div style="text-align:right">
          <div class="wx-city-temp">${today.high ? today.high.toFixed(0) : '--'}°</div>
          <div style="font-size:11px;color:var(--text-muted)">H: ${today.high ? today.high.toFixed(0) : '--'} / L: ${today.low ? today.low.toFixed(0) : '--'}</div>
        </div>
      </div>
      <canvas class="wx-sparkline" id="${canvasId}"></canvas>
      <div class="wx-city-hubs">${c.hubs.map(h => {
        const b = bias[h] || 0;
        const color = b > 0.001 ? '#10b981' : b < -0.001 ? '#ef4444' : 'var(--text-dim)';
        return `<span class="wx-hub-chip" style="border-left:2px solid ${color}">${h}</span>`;
      }).join('')}</div>
    </div>`;
  }).join('');

  const grid = document.getElementById('wxCityGrid');
  if (grid) {
    grid.innerHTML = cityHtml;
    setTimeout(() => cities.forEach(c => drawWxSparkline('wxSpark_' + c.id, c.days)), 10);
  }
  const grid2 = document.getElementById('wxCityGrid2');
  if (grid2) {
    grid2.innerHTML = cityHtml2;
    setTimeout(() => cities.forEach(c => drawWxSparkline('wxSpark2_' + c.id, c.days)), 10);
  }

  // Bias grid — populate both
  const entries = Object.entries(bias).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1]));
  const biasHtml = entries.map(([hub, val]) => {
    const pct = (val * 100).toFixed(2);
    const arrow = val > 0.001 ? '▲' : val < -0.001 ? '▼' : '—';
    const color = val > 0.001 ? '#10b981' : val < -0.001 ? '#ef4444' : 'var(--text-muted)';
    return `<div class="wx-bias-chip">
      <span class="bias-arrow" style="color:${color}">${arrow}</span>
      <span class="bias-hub">${hub}</span>
      <span class="bias-val" style="color:${color}">${val > 0 ? '+' : ''}${pct}%</span>
    </div>`;
  }).join('');
  ['wxBiasGrid','wxBiasGrid2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = biasHtml;
  });
}

function drawWxSparkline(canvasId, days) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !canvas.parentElement) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = rect.width;
  const H = 60;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  if (!days || days.length < 2) return;

  const highs = days.map(d => d.high);
  const lows = days.map(d => d.low);
  const normals = days.map(d => d.normal);
  const allVals = [...highs, ...lows, ...normals];
  const minV = Math.min(...allVals) - 3;
  const maxV = Math.max(...allVals) + 3;
  const range = maxV - minV || 1;
  const padL = 2, padR = 2, padT = 4, padB = 14;
  const cW = W - padL - padR, cH = H - padT - padB;

  const x = (i) => padL + (i / (days.length - 1)) * cW;
  const y = (v) => padT + (1 - (v - minV) / range) * cH;

  // Normal line (dashed)
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(148,163,184,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  normals.forEach((v, i) => { i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)); });
  ctx.stroke();
  ctx.setLineDash([]);

  // Fill between high and low
  ctx.beginPath();
  highs.forEach((v, i) => { i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)); });
  for (let i = lows.length - 1; i >= 0; i--) ctx.lineTo(x(i), y(lows[i]));
  ctx.closePath();
  // Color based on anomaly
  const avgAnomaly = days.reduce((s, d) => s + d.anomaly, 0) / days.length;
  ctx.fillStyle = avgAnomaly > 3 ? 'rgba(239,68,68,0.1)' : avgAnomaly < -3 ? 'rgba(56,189,248,0.1)' : 'rgba(148,163,184,0.08)';
  ctx.fill();

  // High line
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  highs.forEach((v, i) => { i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)); });
  ctx.stroke();

  // Low line
  ctx.strokeStyle = '#38bdf8';
  ctx.beginPath();
  lows.forEach((v, i) => { i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)); });
  ctx.stroke();

  // Day labels
  ctx.fillStyle = 'rgba(148,163,184,0.6)';
  ctx.font = '9px system-ui';
  ctx.textAlign = 'center';
  days.forEach((d, i) => {
    if (i % 2 === 0) {
      const label = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', {month:'short',day:'numeric'});
      ctx.fillText(label, x(i), H - 2);
    }
  });

  // Temp endpoints
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 9px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(highs[highs.length-1].toFixed(0) + '°', W - 2, y(highs[highs.length-1]) - 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(lows[lows.length-1].toFixed(0) + '°', W - 2, y(lows[lows.length-1]) + 10);
}


