/* =====================================================================
   WEATHER & DEGREE DAYS
   Fetches /api/weather/forecast and /api/weather/bias
   Renders degree-day outlook table, price bias cards, 14-day city forecasts
   Also populates STATE.weatherBias for the price tick engine
   ===================================================================== */

const WX_FETCH_INTERVAL = 300000; // 5 minutes

let _wxExpanded = false;

function toggleWxSection() {
  _wxExpanded = !_wxExpanded;
  const body = document.getElementById('ngWxBody');
  const arrow = document.getElementById('wxArrow');
  if (body) body.style.display = _wxExpanded ? 'block' : 'none';
  if (arrow) arrow.textContent = _wxExpanded ? '▼' : '▶';
}

async function fetchWeather(isInitial) {
  const srcEl = document.getElementById('wxSource');
  if (srcEl && isInitial) srcEl.textContent = 'Loading...';
  try {
    const [forecastRes, biasRes] = await Promise.all([
      fetch(API_BASE + '/api/weather/forecast'),
      fetch(API_BASE + '/api/weather/bias')
    ]);
    const forecastData = await forecastRes.json();
    const biasData = await biasRes.json();

    if (forecastData.success && forecastData.cities) {
      _renderWeatherData(forecastData);
    }
    if (biasData.success && biasData.bias) {
      STATE.weatherBias = biasData.bias;
      _renderBiasGrid(biasData.bias, biasData.is_heating_season);
    }
  } catch(e) {
    if (srcEl) srcEl.textContent = 'Unavailable';
  }
}

function _renderWeatherData(data) {
  const srcEl = document.getElementById('wxSource');
  if (srcEl) {
    srcEl.textContent = data.source === 'open-meteo' ? 'Open-Meteo Live' : 'Synthetic';
    srcEl.style.color = data.source === 'open-meteo' ? 'var(--green)' : 'var(--amber)';
  }
  _renderDDTable(data.cities);
  _renderCityForecasts(data.cities);
}

function _renderDDTable(cities) {
  const tbody = document.getElementById('wxDDBody');
  if (!tbody) return;
  const devColor = v => v > 2 ? 'color:var(--red)' : v < -2 ? 'color:var(--green)' : 'color:var(--text-muted)';
  const biasLabel = v => {
    if (v > 0.003) return '<span style="color:var(--red);font-weight:700">Bullish</span>';
    if (v < -0.003) return '<span style="color:var(--green);font-weight:700">Bearish</span>';
    return '<span style="color:var(--text-muted)">Neutral</span>';
  };
  tbody.innerHTML = cities.map(city => {
    const s = city.summary;
    const hubBias = STATE.weatherBias[city.hubs[0]] || 0;
    return `<tr>
      <td style="font-weight:600">${city.name}, ${city.state}</td>
      <td style="font-size:11px;color:var(--text-muted)">${city.hubs.join(', ')}</td>
      <td class="mono" style="text-align:right">${s.hdd_6_10.toFixed(1)}</td>
      <td class="mono" style="text-align:right;color:var(--text-muted)">${s.normal_hdd_6_10.toFixed(1)}</td>
      <td class="mono" style="text-align:right;${devColor(s.hdd_6_10_dev)}">${s.hdd_6_10_dev >= 0 ? '+' : ''}${s.hdd_6_10_dev.toFixed(1)}</td>
      <td class="mono" style="text-align:right">${s.cdd_6_10.toFixed(1)}</td>
      <td class="mono" style="text-align:right;color:var(--text-muted)">${s.normal_cdd_6_10.toFixed(1)}</td>
      <td class="mono" style="text-align:right;${devColor(s.cdd_6_10_dev)}">${s.cdd_6_10_dev >= 0 ? '+' : ''}${s.cdd_6_10_dev.toFixed(1)}</td>
      <td class="mono" style="text-align:right">${s.hdd_8_14.toFixed(1)}</td>
      <td class="mono" style="text-align:right;${devColor(s.hdd_8_14_dev)}">${s.hdd_8_14_dev >= 0 ? '+' : ''}${s.hdd_8_14_dev.toFixed(1)}</td>
      <td class="mono" style="text-align:right">${s.cdd_8_14.toFixed(1)}</td>
      <td class="mono" style="text-align:right;${devColor(s.cdd_8_14_dev)}">${s.cdd_8_14_dev >= 0 ? '+' : ''}${s.cdd_8_14_dev.toFixed(1)}</td>
      <td>${biasLabel(hubBias)}</td>
    </tr>`;
  }).join('');
}

function _renderBiasGrid(bias, isHeatingSeason) {
  const grid = document.getElementById('wxBiasGrid');
  if (!grid) return;
  const entries = Object.entries(bias).filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (!entries.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No active weather bias — temperatures near normal.</p>';
    return;
  }
  grid.innerHTML = entries.map(([hub, val]) => {
    const pct = (val * 100).toFixed(2);
    const isBull = val > 0;
    const color = isBull ? 'var(--red)' : 'var(--green)';
    const label = isBull ? 'Bullish' : 'Bearish';
    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px">
      <div style="font-size:12px;font-weight:600;margin-bottom:3px">${hub}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">${isHeatingSeason ? 'Heating season' : 'Cooling season'}</div>
      <div style="font-size:14px;font-weight:700;color:${color}">${isBull ? '+' : ''}${pct}%/tick <span style="font-size:11px">${label}</span></div>
    </div>`;
  }).join('');
}

function _renderCityForecasts(cities) {
  const grid = document.getElementById('wxCityGrid');
  if (!grid) return;
  grid.innerHTML = cities.map(city => {
    const dayRows = city.days.slice(0, 14).map(d => {
      const anomColor = d.anomaly > 3 ? 'var(--red)' : d.anomaly < -3 ? 'var(--green)' : 'var(--text-muted)';
      const dateLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric'});
      return `<tr style="font-size:11px">
        <td style="color:var(--text-muted)">${dateLabel}</td>
        <td class="mono" style="text-align:right">${d.high.toFixed(0)}°</td>
        <td class="mono" style="text-align:right">${d.low.toFixed(0)}°</td>
        <td class="mono" style="text-align:right;color:var(--text-muted)">${d.normal.toFixed(0)}°</td>
        <td class="mono" style="text-align:right;color:${anomColor}">${d.anomaly >= 0 ? '+' : ''}${d.anomaly.toFixed(1)}</td>
        <td class="mono" style="text-align:right">${d.hdd > 0 ? d.hdd.toFixed(0) : '—'}</td>
        <td class="mono" style="text-align:right">${d.cdd > 0 ? d.cdd.toFixed(0) : '—'}</td>
      </tr>`;
    }).join('');
    return `<div class="card">
      <div style="padding:12px 14px 0">
        <div style="font-weight:700;font-size:14px">${city.name}, ${city.state}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${city.hubs.join(' · ')}</div>
      </div>
      <div class="table-wrap" style="max-height:260px;overflow-y:auto">
        <table style="font-size:11px">
          <thead><tr><th>Date</th><th style="text-align:right">Hi</th><th style="text-align:right">Lo</th><th style="text-align:right">Nml</th><th style="text-align:right">Anom</th><th style="text-align:right">HDD</th><th style="text-align:right">CDD</th></tr></thead>
          <tbody>${dayRows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

function renderWeatherPage() {
  // Called by nav-risk.js when the NG page is rendered
  // Weather data is already fetched on init; just re-render if data exists
  if (STATE.weatherBias && Object.keys(STATE.weatherBias).length) {
    // Bias already loaded — trigger a fresh render of the bias grid only
    fetch(API_BASE + '/api/weather/bias').then(r => r.json()).then(d => {
      if (d.success) _renderBiasGrid(d.bias, d.is_heating_season);
    }).catch(() => {});
  }
}
