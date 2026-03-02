/* =====================================================================
   TECHNICAL ANALYSIS — INFO & STATE
   ===================================================================== */
const TA_INFO = {
  sma20: {
    name: 'Simple Moving Average (20)',
    desc: 'Averages the last 20 closing prices to smooth out short-term noise and reveal the trend direction.',
    usage: 'Price above SMA20 = short-term bullish. Below = bearish. Acts as dynamic support/resistance. Commodity traders use it to time entries on pullbacks to the mean.',
    color: '#f59e0b'
  },
  sma50: {
    name: 'Simple Moving Average (50)',
    desc: 'The 50-period SMA represents the medium-term trend and is widely watched by institutional commodity traders.',
    usage: '"Golden Cross" (SMA20 above SMA50) = bullish momentum. "Death Cross" = bearish. Critical for swing trading energy and metals.',
    color: '#a78bfa'
  },
  sma200: {
    name: 'Simple Moving Average (200)',
    desc: 'Defines the long-term trend. The most important SMA for institutional traders and portfolio managers.',
    usage: 'Above SMA200 = secular bull market. Below = bear market. In oil markets, SMA200 often marks the boundary between bull and bear regimes.',
    color: '#ef4444'
  },
  ema20: {
    name: 'Exponential Moving Average (20)',
    desc: 'EMA gives more weight to recent prices, reacting faster to changes than SMA. EMA20 hugs price tightly.',
    usage: 'Preferred by short-term traders. When EMA20 > SMA20, momentum is accelerating. Used for fast trend detection in energy markets.',
    color: '#22d3ee'
  },
  bb: {
    name: 'Bollinger Bands (20, 2\u03c3)',
    desc: 'A 20-period SMA with upper/lower bands at 2 standard deviations. Bands expand during volatility and contract during calm.',
    usage: 'Touching upper band may signal overbought. Lower = oversold. Band "squeeze" (narrow bands) precedes major breakouts. Essential for commodity options traders assessing implied vol.',
    color: '#a855f7'
  },
  rsi: {
    name: 'Relative Strength Index (14)',
    desc: 'Measures speed and magnitude of price changes on a 0\u2013100 scale. Identifies overbought (>70) and oversold (<30) conditions.',
    usage: 'RSI > 70: consider selling/hedging. RSI < 30: potential buy. Divergences (price makes new high, RSI doesn\'t) are powerful reversal signals. Essential for timing seasonal commodity entries.',
    color: '#a78bfa'
  },
  macd: {
    name: 'MACD (12, 26, 9)',
    desc: 'Moving Average Convergence/Divergence: MACD line = EMA12 \u2212 EMA26. Signal line = 9-EMA of MACD. Histogram = MACD \u2212 Signal.',
    usage: 'Bullish: MACD crosses above signal. Bearish: below. Histogram bars shrinking = momentum fading. Zero-line crossover = trend change. Widely used in energy trading.',
    color: '#22d3ee'
  },
  vol: {
    name: 'Volume',
    desc: 'Volume shows trading activity intensity. Higher volume validates moves; low volume suggests weak conviction.',
    usage: 'Rising price + rising volume = strong trend. Rising price + falling volume = weakening. Volume spikes often precede reversals. Confirms breakouts in commodity markets.',
    color: '#64748b'
  },
  fib: {
    name: 'Fibonacci Retracement',
    desc: 'Horizontal levels at 23.6%, 38.2%, 50%, 61.8%, 78.6% of the price range, based on the Fibonacci sequence.',
    usage: 'After a major move, prices retrace to Fib levels before continuing. 38.2% and 61.8% are most significant. Commodity traders use them for entry orders and stop losses.',
    color: '#f59e0b'
  },
  stoch: {
    name: 'Stochastic Oscillator (14, 3)',
    desc: 'Compares closing price to the price range over 14 periods. %K = fast line, %D = slow signal. Ranges 0\u2013100.',
    usage: '%K > 80: overbought. %K < 20: oversold. %K crossing above %D in oversold zone = bullish. Works best in range-bound commodity markets.',
    color: '#10b981'
  },
  ichimoku: {
    name: 'Ichimoku Cloud',
    desc: 'Shows support/resistance, trend, and momentum simultaneously. Tenkan (9), Kijun (26), Senkou A/B (cloud), Chikou (lagging close).',
    usage: 'Price above cloud = bullish. Below = bearish. Inside = consolidation. Cloud thickness = support/resistance strength. Popular in Asian energy markets.',
    color: '#f97316'
  },
  atr: {
    name: 'Average True Range (14)',
    desc: 'Measures market volatility by averaging price range over 14 periods. Higher ATR = more volatility. Does NOT indicate direction.',
    usage: 'Set stop-losses at 2\u00d7 ATR from entry. Rising ATR during a trend confirms strong momentum. Falling ATR = consolidation. Essential for commodity position sizing.',
    color: '#f97316'
  },
  adx: {
    name: 'Average Directional Index (14)',
    desc: 'Measures trend STRENGTH on 0\u2013100 scale. ADX > 25 = trending market. ADX < 20 = ranging/choppy market.',
    usage: 'Use ADX to decide strategy: trend-following (ADX > 25) vs mean-reversion (ADX < 20). Helps identify when seasonal commodity trends are tradeable.',
    color: '#ec4899'
  },
  obv: {
    name: 'On-Balance Volume (OBV)',
    desc: 'Cumulative volume indicator: adds volume on up days, subtracts on down days. Shows whether volume is flowing in or out.',
    usage: 'OBV rising + flat price = accumulation (bullish). OBV falling + flat price = distribution (bearish). OBV divergences from price are strong reversal signals.',
    color: '#06b6d4'
  },
  vwap: {
    name: 'Volume-Weighted Average Price',
    desc: 'Average price weighted by volume \u2014 represents the "fair value" for the trading period.',
    usage: 'Price above VWAP = buyers in control. Below = sellers. Institutional traders benchmark execution against VWAP. Mean reversion to VWAP is a common intraday strategy.',
    color: '#8b5cf6'
  }
};

if (!STATE.ta) STATE.ta = { sma20:true, sma50:false, sma200:false, ema20:false, bb:false, rsi:false, macd:false, vol:false, fib:false, stoch:false, ichimoku:false, atr:false, adx:false, obv:false, vwap:false, alerts:{} };
// Ensure new keys exist on existing STATE
['stoch','ichimoku','atr','adx','obv','vwap'].forEach(k => { if (STATE.ta[k] === undefined) STATE.ta[k] = false; });

/* =====================================================================
   CALCULATION FUNCTIONS
   ===================================================================== */
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
  if (data.length < 26) return { macd: [], signal: [], hist: [] };
  const ema12 = _ema(data, 12), ema26 = _ema(data, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = _ema(macdLine, 9);
  const hist = macdLine.map((v, i) => v - signal[i]);
  return { macd: macdLine, signal, hist };
}
function _atr(data, period) {
  const out = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { out.push(null); continue; }
    if (i < period) { out.push(null); continue; }
    if (i === period) {
      let sum = 0; for (let j = 1; j <= period; j++) sum += Math.abs(data[j] - data[j - 1]);
      out.push(sum / period);
    } else {
      const tr = Math.abs(data[i] - data[i - 1]);
      out.push((out[i - 1] * (period - 1) + tr) / period);
    }
  }
  return out;
}
function _stochastic(data, kPeriod, dPeriod) {
  const k = [];
  for (let i = 0; i < data.length; i++) {
    if (i < kPeriod - 1) { k.push(null); continue; }
    const sl = data.slice(i - kPeriod + 1, i + 1);
    const lo = Math.min(...sl), hi = Math.max(...sl);
    k.push(hi === lo ? 50 : ((data[i] - lo) / (hi - lo)) * 100);
  }
  const d = [];
  for (let i = 0; i < k.length; i++) {
    if (k[i] === null || i < kPeriod - 1 + dPeriod - 1) { d.push(null); continue; }
    let sum = 0, cnt = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) { if (k[j] !== null) { sum += k[j]; cnt++; } }
    d.push(cnt > 0 ? sum / cnt : null);
  }
  return { k, d };
}
function _ichimoku(data) {
  const tenkan = [], kijun = [], spanA = [], spanB = [];
  function _mid(arr, start, len) {
    const sl = arr.slice(Math.max(0, start), start + len);
    return sl.length > 0 ? (Math.max(...sl) + Math.min(...sl)) / 2 : null;
  }
  for (let i = 0; i < data.length; i++) {
    tenkan.push(i >= 8 ? _mid(data, i - 8, 9) : null);
    kijun.push(i >= 25 ? _mid(data, i - 25, 26) : null);
    spanA.push(tenkan[i] !== null && kijun[i] !== null ? (tenkan[i] + kijun[i]) / 2 : null);
    spanB.push(i >= 51 ? _mid(data, i - 51, 52) : null);
  }
  return { tenkan, kijun, spanA, spanB };
}
function _adx(data, period) {
  const diP = [], diM = [], adxOut = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { diP.push(0); diM.push(0); adxOut.push(null); continue; }
    const up = data[i] - data[i - 1], dn = data[i - 1] - data[i];
    diP.push(up > 0 && up > dn ? up : 0);
    diM.push(dn > 0 && dn > up ? dn : 0);
    if (i < period) { adxOut.push(null); continue; }
    let sP = 0, sM = 0, atr = 0;
    for (let j = i - period + 1; j <= i; j++) { sP += diP[j]; sM += diM[j]; atr += Math.abs(data[j] - data[j - 1]); }
    atr = atr / period || 1;
    const dp = (sP / period) / atr * 100, dm = (sM / period) / atr * 100;
    const dx = (dp + dm) > 0 ? Math.abs(dp - dm) / (dp + dm) * 100 : 0;
    if (i < period * 2 - 1) { adxOut.push(null); continue; }
    if (i === period * 2 - 1) {
      let sum = 0, cnt = 0;
      for (let j = period; j <= i; j++) { const v = adxOut[j]; /* these are null, recalc dx */ }
      // Simple average of recent dx values
      adxOut.push(dx);
    } else {
      adxOut.push(adxOut[i - 1] !== null ? (adxOut[i - 1] * (period - 1) + dx) / period : dx);
    }
  }
  return adxOut;
}
function _obv(data) {
  const out = [0];
  for (let i = 1; i < data.length; i++) {
    const vol = Math.abs(data[i] - data[i - 1]) * 1000 + 200;
    if (data[i] > data[i - 1]) out.push(out[i - 1] + vol);
    else if (data[i] < data[i - 1]) out.push(out[i - 1] - vol);
    else out.push(out[i - 1]);
  }
  return out;
}
function _vwap(data) {
  const out = []; let cumPV = 0, cumV = 0;
  for (let i = 0; i < data.length; i++) {
    const vol = i === 0 ? 200 : Math.abs(data[i] - data[i - 1]) * 1000 + 200;
    cumPV += data[i] * vol; cumV += vol;
    out.push(cumV > 0 ? cumPV / cumV : data[i]);
  }
  return out;
}

/* =====================================================================
   TA UI — TOOLBAR, INFO MODAL, TOGGLE
   ===================================================================== */
function toggleTA(key) {
  STATE.ta[key] = !STATE.ta[key];
  document.querySelectorAll('.ta-btn[data-ta="' + key + '"]').forEach(btn => btn.classList.toggle('active', STATE.ta[key]));
  renderCurrentPage();
}

function showTAInfo(key, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  const info = TA_INFO[key];
  if (!info) return;
  // Remove existing modal
  const old = document.getElementById('taInfoModal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'taInfoModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)';
  modal.innerHTML = '<div style="background:var(--surface2,#1e293b);border:1px solid var(--border,#334155);border-radius:12px;padding:24px;max-width:440px;width:90%;color:var(--text,#e2e8f0);font-family:inherit">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
    + '<h3 style="margin:0;font-size:16px;color:' + (info.color || 'var(--accent)') + '">' + info.name + '</h3>'
    + '<button onclick="document.getElementById(\'taInfoModal\').remove()" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;padding:0 4px">&times;</button>'
    + '</div>'
    + '<p style="margin:0 0 12px;font-size:13px;color:var(--text-dim,#94a3b8);line-height:1.5">' + info.desc + '</p>'
    + '<div style="background:var(--surface,#0f172a);border-radius:8px;padding:12px;border:1px solid var(--border,#334155)">'
    + '<div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">How Traders Use It</div>'
    + '<p style="margin:0;font-size:12px;color:var(--text,#e2e8f0);line-height:1.5">' + info.usage + '</p>'
    + '</div>'
    + '<div style="margin-top:14px;text-align:right"><button onclick="document.getElementById(\'taInfoModal\').remove()" style="background:var(--accent,#3b82f6);color:#fff;border:none;border-radius:6px;padding:6px 16px;font-size:12px;font-weight:600;cursor:pointer">Got it</button></div>'
    + '</div>';
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

function renderTAToolbar(containerId) {
  const container = document.getElementById(containerId);
  if (!container || container.querySelector('.ta-toolbar')) return;
  const header = container.querySelector('.chart-header');
  if (!header) return;
  const tb = document.createElement('div');
  tb.className = 'ta-toolbar';

  const buttons = [
    { key:'sma20', label:'SMA20' }, { key:'sma50', label:'SMA50' }, { key:'ema20', label:'EMA20' },
    { key:'bb', label:'BB' }, { key:'vwap', label:'VWAP' }, { key:'ichimoku', label:'Ichimoku' }, { key:'fib', label:'Fib' },
    { key:'rsi', label:'RSI' }, { key:'macd', label:'MACD' }, { key:'stoch', label:'Stoch' },
    { key:'atr', label:'ATR' }, { key:'adx', label:'ADX' },
    { key:'vol', label:'Vol' }, { key:'obv', label:'OBV' }
  ];

  let html = '<div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">'
    + '<span style="font-size:10px;color:var(--text-muted);font-weight:600;margin-right:4px">TA:</span>';
  buttons.forEach(b => {
    const active = STATE.ta[b.key] ? ' active' : '';
    html += '<span class="ta-btn-wrap" style="display:inline-flex;align-items:center;position:relative">'
      + '<button class="ta-btn' + active + '" data-ta="' + b.key + '" onclick="toggleTA(\'' + b.key + '\')" title="' + (TA_INFO[b.key] ? TA_INFO[b.key].name : b.label) + '">' + b.label + '</button>'
      + '<span class="ta-info-icon" onclick="showTAInfo(\'' + b.key + '\', event)" title="What is ' + b.label + '?">?</span>'
      + '</span>';
  });
  html += '</div>';
  tb.innerHTML = html;
  header.after(tb);
}

/* =====================================================================
   OHLC GENERATION (from close-only data)
   ===================================================================== */
function _generateOHLC(closeData) {
  const bars = [];
  for (let i = 0; i < closeData.length; i++) {
    const close = closeData[i];
    const open = i === 0 ? close : closeData[i - 1];
    const range = Math.abs(close - open) || close * 0.002;
    const hBump = range * (0.2 + ((i * 17 + 7) % 13) / 26);
    const lBump = range * (0.2 + ((i * 11 + 3) % 13) / 26);
    bars.push({ open, high: Math.max(open, close) + hBump, low: Math.min(open, close) - lBump, close });
  }
  return bars;
}

/* =====================================================================
   CHART RENDERING
   ===================================================================== */
function drawChart(canvasId, hubName, range) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !canvas.parentElement) return;
  const chartContainer = canvas.closest('.chart-container');
  if (chartContainer) renderTAToolbar(chartContainer.id);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  if (!rect || !rect.width) return;

  const hub = findHub(hubName);
  const hist = (typeof getChartHistory === 'function') ? getChartHistory(hubName) : priceHistory[hubName];
  if (!hist || !hub) return;
  const fullData = hist.slice(-range);
  if (fullData.length < 2) return;

  // Apply zoom window if set
  const zoom = STATE.chartZoom && STATE.chartZoom[canvasId];
  let data;
  if (zoom && zoom.start >= 0 && zoom.end > zoom.start && zoom.end <= fullData.length) {
    data = fullData.slice(zoom.start, zoom.end);
  } else {
    data = fullData;
  }
  if (data.length < 2) return;

  // Chart type: line or candle
  const sector = canvasId.replace('Chart', '');
  const chartType = (STATE.chartTypes && STATE.chartTypes[sector]) || 'line';
  const ohlcBars = chartType === 'candle' ? _generateOHLC(data) : null;

  // Determine which sub-charts are active
  const ta = STATE.ta || {};
  const subChartList = [];
  if (ta.vol) subChartList.push('vol');
  if (ta.rsi) subChartList.push('rsi');
  if (ta.macd && data.length >= 26) subChartList.push('macd');
  if (ta.stoch) subChartList.push('stoch');
  if (ta.atr) subChartList.push('atr');
  if (ta.adx) subChartList.push('adx');
  if (ta.obv) subChartList.push('obv');

  // Calculate total canvas height BEFORE drawing
  const subH = 60, subGap = 8;
  const mainH = 300;
  const totalH = mainH + subChartList.length * (subH + subGap);

  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = totalH * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = totalH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = mainH;

  let min, max;
  if (ohlcBars) {
    min = Math.min(...ohlcBars.map(b => b.low)) * 0.998;
    max = Math.max(...ohlcBars.map(b => b.high)) * 1.002;
  } else {
    min = Math.min(...data) * 0.998;
    max = Math.max(...data) * 1.002;
  }
  const padL = 65, padR = 35, padT = 20, padB = 40;
  const cW = W - padL - padR, cH = H - padT - padB;

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const bgColor = isLight ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  const gridColor = isLight ? '#e2e8f0' : 'rgba(30,45,61,0.6)';
  const textColor = isLight ? '#475569' : '#94a3b8';
  const isLargeVal = hubName.includes('Baltic') || hubName.includes('Index') || (hub && hub.base > 100);
  const decimals = isLargeVal ? 0 : 2;

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, totalH);

  // Grid
  ctx.strokeStyle = gridColor; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 5; i++) {
    const y = padT + (cH / 5) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = textColor; ctx.font = '11px IBM Plex Mono'; ctx.textAlign = 'right';
    ctx.fillText((max - (max - min) * (i / 5)).toFixed(decimals), padL - 8, y + 4);
  }

  // Helper functions
  const rangeV = max - min || 1;
  function _yPos(v) { return padT + (1 - (v - min) / rangeV) * cH; }
  function _xPos(i) { return padL + (i / (data.length - 1)) * cW; }
  function _drawLine(arr, color, width, dash) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width || 1;
    if (dash) ctx.setLineDash(dash);
    let started = false;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === null || !isFinite(arr[i])) { started = false; continue; }
      if (!started) { ctx.moveTo(_xPos(i), _yPos(arr[i])); started = true; }
      else ctx.lineTo(_xPos(i), _yPos(arr[i]));
    }
    ctx.stroke(); if (dash) ctx.setLineDash([]);
  }

  // --- Pre-compute TA data (stored in meta for crosshair) ---
  const taData = {};
  if (ta.sma20) taData.sma20 = _sma(data, 20);
  if (ta.sma50) taData.sma50 = _sma(data, 50);
  if (ta.sma200 && data.length >= 200) taData.sma200 = _sma(data, 200);
  if (ta.ema20) taData.ema20 = _ema(data, 20);
  if (ta.bb) taData.bb = _bollinger(data, 20, 2);
  if (ta.vwap) taData.vwap = _vwap(data);
  if (ta.ichimoku && data.length >= 26) taData.ichimoku = _ichimoku(data);
  if (ta.rsi) taData.rsi = _rsi(data, 14);
  if (ta.macd && data.length >= 26) taData.macd = _macd(data);
  if (ta.stoch) taData.stoch = _stochastic(data, 14, 3);
  if (ta.atr) taData.atr = _atr(data, 14);
  if (ta.adx) taData.adx = _adx(data, 14);
  if (ta.obv) taData.obv = _obv(data);

  // --- Ichimoku Cloud (drawn behind price) ---
  if (taData.ichimoku) {
    const ik = taData.ichimoku;
    ctx.beginPath(); ctx.fillStyle = 'rgba(249,115,22,0.06)';
    let started = false;
    for (let i = 0; i < data.length; i++) {
      if (ik.spanA[i] === null || ik.spanB[i] === null) continue;
      if (!started) { ctx.moveTo(_xPos(i), _yPos(ik.spanA[i])); started = true; }
      else ctx.lineTo(_xPos(i), _yPos(ik.spanA[i]));
    }
    for (let i = data.length - 1; i >= 0; i--) {
      if (ik.spanA[i] === null || ik.spanB[i] === null) continue;
      ctx.lineTo(_xPos(i), _yPos(ik.spanB[i]));
    }
    ctx.closePath(); ctx.fill();
    _drawLine(ik.tenkan, '#f97316', 1);
    _drawLine(ik.kijun, '#3b82f6', 1);
    _drawLine(ik.spanA, 'rgba(249,115,22,0.4)', 0.8, [2, 2]);
    _drawLine(ik.spanB, 'rgba(59,130,246,0.4)', 0.8, [2, 2]);
  }

  // --- Price rendering: Line or Candlestick ---
  if (ohlcBars) {
    // Candlestick rendering
    const barW = Math.max(2, (cW / data.length) * 0.65);
    for (let i = 0; i < ohlcBars.length; i++) {
      const b = ohlcBars[i], x = _xPos(i);
      const bullish = b.close >= b.open;
      const color = bullish ? '#10b981' : '#ef4444';
      // Wick
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, _yPos(b.high)); ctx.lineTo(x, _yPos(b.low)); ctx.stroke();
      // Body
      const bodyTop = _yPos(Math.max(b.open, b.close));
      const bodyBot = _yPos(Math.min(b.open, b.close));
      const bodyH = Math.max(1, bodyBot - bodyTop);
      if (bullish) {
        ctx.fillStyle = bgColor; ctx.fillRect(x - barW / 2, bodyTop, barW, bodyH);
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(x - barW / 2, bodyTop, barW, bodyH);
      } else {
        ctx.fillStyle = color; ctx.fillRect(x - barW / 2, bodyTop, barW, bodyH);
      }
    }
  } else {
    // Line/area rendering
    const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, hub.color + '30'); grad.addColorStop(1, hub.color + '00');
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = _xPos(i), y = _yPos(data[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.lineTo(padL + cW, padT + cH); ctx.lineTo(padL, padT + cH);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    // Price line
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = _xPos(i), y = _yPos(data[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = hub.color; ctx.lineWidth = 2; ctx.stroke();
  }

  // Current price dot
  ctx.beginPath(); ctx.arc(padL + cW, _yPos(data[data.length - 1]), 4, 0, Math.PI * 2);
  ctx.fillStyle = hub.color; ctx.fill();

  // Percent change badge
  const pctChg = data[0] > 0 ? ((data[data.length - 1] - data[0]) / data[0]) * 100 : 0;
  const absChg = data[data.length - 1] - data[0];
  const pctColor = pctChg >= 0 ? '#10b981' : '#ef4444';
  const pctSign = pctChg >= 0 ? '+' : '';
  const chgStr = isLargeVal
    ? pctSign + absChg.toFixed(0) + ' (' + pctSign + pctChg.toFixed(2) + '%)'
    : pctSign + absChg.toFixed(2) + ' (' + pctSign + pctChg.toFixed(2) + '%)';
  ctx.font = 'bold 12px IBM Plex Mono';
  const chgW = ctx.measureText(chgStr).width + 14;
  ctx.fillStyle = pctColor + '18'; ctx.fillRect(W - padR - chgW - 4, padT + 2, chgW + 4, 22);
  ctx.fillStyle = pctColor; ctx.textAlign = 'right'; ctx.fillText(chgStr, W - padR - 6, padT + 17);

  // X-axis time labels
  ctx.fillStyle = textColor; ctx.font = '10px IBM Plex Mono'; ctx.textAlign = 'center';
  const now = new Date();
  const labelCount = Math.min(6, data.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor(i * (data.length - 1) / (labelCount - 1));
    const daysBack = data.length - 1 - idx;
    const labelDate = new Date(now.getTime() - daysBack * 86400000);
    ctx.fillText(labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), _xPos(idx), H - padB + 18);
  }

  // --- TA Overlays on main chart ---
  if (taData.sma20) _drawLine(taData.sma20, '#f59e0b', 1.2);
  if (taData.sma50) _drawLine(taData.sma50, '#a78bfa', 1.2);
  if (taData.sma200) _drawLine(taData.sma200, '#ef4444', 1.2);
  if (taData.ema20) _drawLine(taData.ema20, '#22d3ee', 1.2, [4, 2]);
  if (taData.vwap) _drawLine(taData.vwap, '#8b5cf6', 1.2, [6, 3]);

  // Bollinger Bands
  if (taData.bb) {
    const bb = taData.bb;
    _drawLine(bb.upper, 'rgba(168,85,247,0.8)', 1.5);
    _drawLine(bb.lower, 'rgba(168,85,247,0.8)', 1.5);
    _drawLine(bb.mid, 'rgba(168,85,247,0.5)', 1, [4, 2]);
    ctx.beginPath(); ctx.fillStyle = 'rgba(168,85,247,0.12)';
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

  // Fibonacci
  if (ta.fib && data.length > 10) {
    const fibHigh = Math.max(...data), fibLow = Math.min(...data), fibDiff = fibHigh - fibLow;
    [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].forEach(level => {
      const price = fibHigh - fibDiff * level, y = _yPos(price);
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

  // Store meta for crosshair + zoom/pan
  canvas._chartMeta = { padL, padR, padT, padB, cW, cH, min, max, data, fullData, ohlcBars, hubName, hub, taData, subChartList, subH, subGap, mainH, decimals, sector };

  // --- Sub-charts ---
  if (subChartList.length) {
    let subY = H + 4;
    const subTextCol = isLight ? '#475569' : '#94a3b8';
    const subBg = isLight ? '#f8fafc' : 'rgba(15,23,42,0.3)';
    const subBorder = isLight ? '#e2e8f0' : 'rgba(30,45,61,0.4)';

    subChartList.forEach(type => {
      // Background
      ctx.fillStyle = subBg; ctx.fillRect(padL, subY, cW, subH);
      ctx.strokeStyle = subBorder; ctx.lineWidth = 0.5; ctx.strokeRect(padL, subY, cW, subH);

      if (type === 'rsi' && taData.rsi) {
        const rsiD = taData.rsi;
        const ob = subY + (1 - 70 / 100) * subH, os = subY + (1 - 30 / 100) * subH;
        ctx.fillStyle = 'rgba(239,68,68,0.06)'; ctx.fillRect(padL, subY, cW, ob - subY);
        ctx.fillStyle = 'rgba(16,185,129,0.06)'; ctx.fillRect(padL, os, cW, subY + subH - os);
        ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(padL, ob); ctx.lineTo(padL + cW, ob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(padL, os); ctx.lineTo(padL + cW, os); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(148,163,184,0.15)'; ctx.beginPath();
        ctx.moveTo(padL, subY + subH / 2); ctx.lineTo(padL + cW, subY + subH / 2); ctx.stroke();
        // RSI line
        ctx.beginPath(); ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.5;
        let s = false;
        for (let i = 0; i < rsiD.length; i++) {
          if (rsiD[i] === null) continue;
          const x = _xPos(i), y = subY + (1 - rsiD[i] / 100) * subH;
          if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = subTextCol; ctx.font = '9px IBM Plex Mono'; ctx.textAlign = 'right';
        ctx.fillText('70', padL - 4, ob + 3); ctx.fillText('30', padL - 4, os + 3);
        ctx.fillStyle = '#a78bfa'; ctx.font = '10px IBM Plex Sans'; ctx.textAlign = 'left';
        ctx.fillText('RSI(14)', padL + 4, subY + 12);
        const lastRsi = rsiD.filter(v => v !== null).slice(-1)[0];
        if (lastRsi !== undefined) {
          ctx.textAlign = 'right'; ctx.font = 'bold 11px IBM Plex Mono';
          ctx.fillStyle = lastRsi > 70 ? '#ef4444' : lastRsi < 30 ? '#10b981' : '#a78bfa';
          ctx.fillText(lastRsi.toFixed(1), padL + cW - 4, subY + 12);
        }
      }

      if (type === 'macd' && taData.macd) {
        const md = taData.macd;
        const allV = [...md.macd, ...md.signal, ...md.hist].filter(v => v !== null && isFinite(v));
        if (allV.length > 0) {
          const mMin = Math.min(...allV), mMax = Math.max(...allV), mR = mMax - mMin || 1;
          function mY(v) { return subY + (1 - (v - mMin) / mR) * subH; }
          const zeroY = mY(0);
          ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(padL + cW, zeroY); ctx.stroke();
          const barW = Math.max(1, cW / data.length - 0.5);
          for (let i = 0; i < md.hist.length; i++) {
            if (!isFinite(md.hist[i])) continue;
            const x = _xPos(i), y1 = mY(md.hist[i]);
            ctx.fillStyle = md.hist[i] >= 0 ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)';
            ctx.fillRect(x - barW / 2, Math.min(y1, zeroY), barW, Math.abs(y1 - zeroY));
          }
          ctx.beginPath(); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.2;
          let s = false;
          for (let i = 26; i < md.macd.length; i++) { if (!isFinite(md.macd[i])) continue; const x = _xPos(i), y = mY(md.macd[i]); if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y); }
          ctx.stroke();
          ctx.beginPath(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1;
          s = false;
          for (let i = 26; i < md.signal.length; i++) { if (!isFinite(md.signal[i])) continue; const x = _xPos(i), y = mY(md.signal[i]); if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y); }
          ctx.stroke();
        }
        ctx.fillStyle = '#22d3ee'; ctx.font = '10px IBM Plex Sans'; ctx.textAlign = 'left';
        ctx.fillText('MACD(12,26,9)', padL + 4, subY + 12);
      }

      if (type === 'stoch' && taData.stoch) {
        const st = taData.stoch;
        const ob2 = subY + (1 - 80 / 100) * subH, os2 = subY + (1 - 20 / 100) * subH;
        ctx.fillStyle = 'rgba(239,68,68,0.06)'; ctx.fillRect(padL, subY, cW, ob2 - subY);
        ctx.fillStyle = 'rgba(16,185,129,0.06)'; ctx.fillRect(padL, os2, cW, subY + subH - os2);
        ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(padL, ob2); ctx.lineTo(padL + cW, ob2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(padL, os2); ctx.lineTo(padL + cW, os2); ctx.stroke();
        ctx.setLineDash([]);
        // %K line
        ctx.beginPath(); ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1.5;
        let s = false;
        for (let i = 0; i < st.k.length; i++) {
          if (st.k[i] === null) continue;
          const x = _xPos(i), y = subY + (1 - st.k[i] / 100) * subH;
          if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // %D line
        ctx.beginPath(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1;
        s = false;
        for (let i = 0; i < st.d.length; i++) {
          if (st.d[i] === null) continue;
          const x = _xPos(i), y = subY + (1 - st.d[i] / 100) * subH;
          if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = subTextCol; ctx.font = '9px IBM Plex Mono'; ctx.textAlign = 'right';
        ctx.fillText('80', padL - 4, ob2 + 3); ctx.fillText('20', padL - 4, os2 + 3);
        ctx.fillStyle = '#10b981'; ctx.font = '10px IBM Plex Sans'; ctx.textAlign = 'left';
        ctx.fillText('Stoch(14,3)', padL + 4, subY + 12);
        const lastK = st.k.filter(v => v !== null).slice(-1)[0];
        if (lastK !== undefined) {
          ctx.textAlign = 'right'; ctx.font = 'bold 11px IBM Plex Mono';
          ctx.fillStyle = lastK > 80 ? '#ef4444' : lastK < 20 ? '#10b981' : '#64748b';
          ctx.fillText(lastK.toFixed(1), padL + cW - 4, subY + 12);
        }
      }

      if (type === 'atr' && taData.atr) {
        const atrD = taData.atr.filter(v => v !== null && isFinite(v));
        if (atrD.length > 0) {
          const aMin = Math.min(...atrD) * 0.9, aMax = Math.max(...atrD) * 1.1, aR = aMax - aMin || 1;
          ctx.beginPath(); ctx.strokeStyle = '#f97316'; ctx.lineWidth = 1.5;
          let s = false;
          for (let i = 0; i < taData.atr.length; i++) {
            if (taData.atr[i] === null) continue;
            const x = _xPos(i), y = subY + (1 - (taData.atr[i] - aMin) / aR) * subH;
            if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.fillStyle = '#f97316'; ctx.font = '10px IBM Plex Sans'; ctx.textAlign = 'left';
        ctx.fillText('ATR(14)', padL + 4, subY + 12);
        const lastAtr = taData.atr.filter(v => v !== null).slice(-1)[0];
        if (lastAtr !== undefined) {
          ctx.textAlign = 'right'; ctx.font = 'bold 11px IBM Plex Mono'; ctx.fillStyle = '#f97316';
          ctx.fillText(lastAtr.toFixed(decimals), padL + cW - 4, subY + 12);
        }
      }

      if (type === 'adx' && taData.adx) {
        const adxD = taData.adx.filter(v => v !== null && isFinite(v));
        if (adxD.length > 0) {
          const aMin2 = 0, aMax2 = Math.max(60, Math.max(...adxD) * 1.1), aR2 = aMax2 || 1;
          // 25 threshold line
          const y25 = subY + (1 - 25 / aR2) * subH;
          ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(padL, y25); ctx.lineTo(padL + cW, y25); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = subTextCol; ctx.font = '9px IBM Plex Mono'; ctx.textAlign = 'right';
          ctx.fillText('25', padL - 4, y25 + 3);
          // ADX line
          ctx.beginPath(); ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 1.5;
          let s = false;
          for (let i = 0; i < taData.adx.length; i++) {
            if (taData.adx[i] === null) continue;
            const x = _xPos(i), y = subY + (1 - (taData.adx[i] - aMin2) / aR2) * subH;
            if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.fillStyle = '#ec4899'; ctx.font = '10px IBM Plex Sans'; ctx.textAlign = 'left';
        ctx.fillText('ADX(14)', padL + 4, subY + 12);
        const lastAdx = taData.adx.filter(v => v !== null).slice(-1)[0];
        if (lastAdx !== undefined) {
          ctx.textAlign = 'right'; ctx.font = 'bold 11px IBM Plex Mono';
          ctx.fillStyle = lastAdx > 25 ? '#ec4899' : '#64748b';
          ctx.fillText(lastAdx.toFixed(1), padL + cW - 4, subY + 12);
        }
      }

      if (type === 'vol') {
        // Deterministic volume simulation (no Math.random to prevent flicker)
        const vol = data.map((v, i) => i === 0 ? 100 : Math.abs(v - data[i - 1]) * 1000 + 200 + (((i * 7 + 13) % 17) * 30));
        const maxVol = Math.max(...vol) || 1;
        const barW = Math.max(1, cW / data.length - 0.5);
        for (let i = 0; i < vol.length; i++) {
          const x = _xPos(i), h = (vol[i] / maxVol) * subH * 0.85;
          ctx.fillStyle = (i > 0 && data[i] >= data[i - 1]) ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';
          ctx.fillRect(x - barW / 2, subY + subH - h, barW, h);
        }
        ctx.fillStyle = subTextCol; ctx.font = '10px IBM Plex Sans'; ctx.textAlign = 'left';
        ctx.fillText('Volume', padL + 4, subY + 12);
      }

      if (type === 'obv' && taData.obv) {
        const obvD = taData.obv;
        const oMin = Math.min(...obvD), oMax = Math.max(...obvD), oR = oMax - oMin || 1;
        ctx.beginPath(); ctx.strokeStyle = '#06b6d4'; ctx.lineWidth = 1.5;
        let s = false;
        for (let i = 0; i < obvD.length; i++) {
          const x = _xPos(i), y = subY + (1 - (obvD[i] - oMin) / oR) * subH;
          if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = '#06b6d4'; ctx.font = '10px IBM Plex Sans'; ctx.textAlign = 'left';
        ctx.fillText('OBV', padL + 4, subY + 12);
      }

      subY += subH + subGap;
    });
  }
}

/* =====================================================================
   CROSSHAIR HANDLER
   ===================================================================== */
function initChartCrosshair(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || canvas._crosshairInit) return;
  canvas._crosshairInit = true;
  let _panState = null;

  // --- Wheel zoom ---
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const meta = canvas._chartMeta;
    if (!meta || !meta.fullData) return;
    const fullLen = meta.fullData.length;
    const curZoom = (STATE.chartZoom && STATE.chartZoom[canvasId]) || { start: 0, end: fullLen };
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
    if (ne - ns === fullLen) { delete STATE.chartZoom[canvasId]; } else { STATE.chartZoom[canvasId] = { start: Math.max(0, ns), end: Math.min(fullLen, ne) }; }
    drawChart(canvasId, meta.hubName, STATE.chartRanges[meta.sector]);
  }, { passive: false });

  // --- Drag pan ---
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const meta = canvas._chartMeta;
    if (!meta || !meta.fullData) return;
    _panState = { startX: e.clientX, zoom: { ...((STATE.chartZoom && STATE.chartZoom[canvasId]) || { start: 0, end: meta.fullData.length }) } };
  });
  canvas.addEventListener('mouseup', () => { _panState = null; });

  // --- Double-click reset zoom ---
  canvas.addEventListener('dblclick', () => {
    if (STATE.chartZoom) delete STATE.chartZoom[canvasId];
    const meta = canvas._chartMeta;
    if (meta) drawChart(canvasId, meta.hubName, STATE.chartRanges[meta.sector]);
  });

  // --- Crosshair / pan mousemove ---
  canvas.addEventListener('mousemove', e => {
    const meta = canvas._chartMeta;
    if (!meta) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    // Handle pan drag
    if (_panState && meta.fullData) {
      const dx = e.clientX - _panState.startX;
      const dataPerPx = meta.data.length / meta.cW;
      const shift = Math.round(-dx * dataPerPx);
      const fullLen = meta.fullData.length;
      const viewLen = _panState.zoom.end - _panState.zoom.start;
      let ns = _panState.zoom.start + shift, ne = ns + viewLen;
      if (ns < 0) { ns = 0; ne = viewLen; }
      if (ne > fullLen) { ne = fullLen; ns = fullLen - viewLen; }
      STATE.chartZoom[canvasId] = { start: ns, end: ne };
      drawChart(canvasId, meta.hubName, STATE.chartRanges[meta.sector]);
      return;
    }

    const { padL, padR, padT, cW, cH, min, max, data, hub, hubName, taData, subChartList, subH, subGap, mainH, decimals } = meta;

    if (mx < padL || mx > padL + cW) {
      drawChart(canvasId, hubName, STATE.chartRanges[meta.sector]);
      return;
    }

    const idx = Math.round(((mx - padL) / cW) * (data.length - 1));
    const clampIdx = Math.max(0, Math.min(data.length - 1, idx));
    const price = data[clampIdx];
    const range = max - min || 1;
    const snapX = padL + (clampIdx / (data.length - 1)) * cW;
    const snapY = padT + (1 - (price - min) / range) * cH;

    // Redraw base chart (sets transform to dpr)
    drawChart(canvasId, hubName, STATE.chartRanges[canvasId.replace('Chart', '') || 'ng']);
    const ctx = canvas.getContext('2d');
    ctx.save();

    // Crosshair lines
    ctx.strokeStyle = 'rgba(148,163,184,0.4)'; ctx.lineWidth = 0.5; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(snapX, padT); ctx.lineTo(snapX, padT + cH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, snapY); ctx.lineTo(padL + cW, snapY); ctx.stroke();
    ctx.setLineDash([]);

    // Snap dot
    ctx.beginPath(); ctx.arc(snapX, snapY, 5, 0, Math.PI * 2);
    ctx.fillStyle = hub.color; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    // Price tooltip
    const txt = price.toFixed(decimals);
    ctx.font = '12px IBM Plex Mono';
    const tw = ctx.measureText(txt).width + 16;
    const tipX = snapX + 12 + tw > padL + cW ? snapX - tw - 12 : snapX + 12;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(tipX, snapY - 12, tw, 22);
    ctx.strokeStyle = hub.color; ctx.lineWidth = 1;
    ctx.strokeRect(tipX, snapY - 12, tw, 22);
    ctx.fillStyle = hub.color; ctx.textAlign = 'left';
    ctx.fillText(txt, tipX + 8, snapY + 4);

    // Date label at bottom
    const now = new Date();
    const daysBack = data.length - 1 - clampIdx;
    const labelDate = new Date(now.getTime() - daysBack * 86400000);
    const dateStr = labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ctx.font = '10px IBM Plex Mono';
    const dtw = ctx.measureText(dateStr).width + 10;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(snapX - dtw / 2, padT + cH + 2, dtw, 18);
    ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center';
    ctx.fillText(dateStr, snapX, padT + cH + 14);

    // --- TA DATA PANEL (top-left of chart, shows values at hover index) ---
    if (taData) {
      const lines = [];
      if (taData.sma20 && taData.sma20[clampIdx] !== null) lines.push({ label: 'SMA20', value: taData.sma20[clampIdx].toFixed(decimals), color: '#f59e0b' });
      if (taData.sma50 && taData.sma50[clampIdx] !== null) lines.push({ label: 'SMA50', value: taData.sma50[clampIdx].toFixed(decimals), color: '#a78bfa' });
      if (taData.sma200 && taData.sma200[clampIdx] !== null) lines.push({ label: 'SMA200', value: taData.sma200[clampIdx].toFixed(decimals), color: '#ef4444' });
      if (taData.ema20 && taData.ema20[clampIdx] !== null) lines.push({ label: 'EMA20', value: taData.ema20[clampIdx].toFixed(decimals), color: '#22d3ee' });
      if (taData.bb) {
        const bb = taData.bb;
        if (bb.upper[clampIdx] !== null) lines.push({ label: 'BB', value: bb.lower[clampIdx].toFixed(decimals) + ' / ' + bb.mid[clampIdx].toFixed(decimals) + ' / ' + bb.upper[clampIdx].toFixed(decimals), color: '#a855f7' });
      }
      if (taData.vwap && taData.vwap[clampIdx] !== null) lines.push({ label: 'VWAP', value: taData.vwap[clampIdx].toFixed(decimals), color: '#8b5cf6' });
      if (taData.ichimoku) {
        const ik = taData.ichimoku;
        if (ik.tenkan[clampIdx] !== null) lines.push({ label: 'Tenkan', value: ik.tenkan[clampIdx].toFixed(decimals), color: '#f97316' });
        if (ik.kijun[clampIdx] !== null) lines.push({ label: 'Kijun', value: ik.kijun[clampIdx].toFixed(decimals), color: '#3b82f6' });
      }
      if (taData.rsi && taData.rsi[clampIdx] !== null) lines.push({ label: 'RSI', value: taData.rsi[clampIdx].toFixed(1), color: '#a78bfa' });
      if (taData.macd && taData.macd.macd[clampIdx] !== undefined) {
        const mv = taData.macd.macd[clampIdx], sv = taData.macd.signal[clampIdx];
        if (isFinite(mv)) lines.push({ label: 'MACD', value: mv.toFixed(3) + (isFinite(sv) ? ' / ' + sv.toFixed(3) : ''), color: '#22d3ee' });
      }
      if (taData.stoch && taData.stoch.k[clampIdx] !== null) {
        const kv = taData.stoch.k[clampIdx], dv = taData.stoch.d[clampIdx];
        lines.push({ label: 'Stoch', value: kv.toFixed(1) + (dv !== null ? ' / ' + dv.toFixed(1) : ''), color: '#10b981' });
      }
      if (taData.atr && taData.atr[clampIdx] !== null) lines.push({ label: 'ATR', value: taData.atr[clampIdx].toFixed(decimals), color: '#f97316' });
      if (taData.adx && taData.adx[clampIdx] !== null) lines.push({ label: 'ADX', value: taData.adx[clampIdx].toFixed(1), color: '#ec4899' });

      if (lines.length > 0) {
        ctx.font = '10px IBM Plex Mono'; ctx.textAlign = 'left';
        let px = padL + 6, py = padT + 4;
        lines.forEach(l => {
          const str = l.label + ': ' + l.value;
          const w = ctx.measureText(str).width + 8;
          ctx.fillStyle = 'rgba(15,21,32,0.75)';
          ctx.fillRect(px - 2, py - 1, w, 14);
          ctx.fillStyle = l.color; ctx.fillText(l.label + ':', px, py + 9);
          const lw = ctx.measureText(l.label + ': ').width;
          ctx.fillStyle = '#e2e8f0'; ctx.fillText(l.value, px + lw, py + 9);
          py += 14;
        });
      }
    }

    // --- Sub-chart crosshair vertical lines ---
    if (subChartList && subChartList.length) {
      let subY = mainH + 4;
      ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3]);
      subChartList.forEach(() => {
        ctx.beginPath(); ctx.moveTo(snapX, subY); ctx.lineTo(snapX, subY + subH); ctx.stroke();
        subY += subH + subGap;
      });
      ctx.setLineDash([]);
    }

    ctx.restore();
  });

  canvas.addEventListener('mouseleave', () => {
    const meta = canvas._chartMeta;
    if (meta) drawChart(canvasId, meta.hubName, STATE.chartRanges[canvasId.replace('Chart', '') || 'ng']);
  });

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

/* =====================================================================
   PRICE ALERTS
   ===================================================================== */
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
        try { new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==').play(); } catch (e) {}
      }
      a._lastPrice = price;
    });
  });
}

/* =====================================================================
   RANGE SELECTOR & SPARKLINE
   ===================================================================== */
function setRange(sector, days, btn) {
  STATE.chartRanges[sector] = days;
  // Clear zoom on range change
  if (STATE.chartZoom) delete STATE.chartZoom[sector + 'Chart'];
  btn.parentElement.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCurrentPage();
}

function setChartType(sector, type, btn) {
  STATE.chartTypes[sector] = type;
  if (btn) {
    btn.parentElement.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  renderCurrentPage();
}

function renderSpreadChart(sector) {
  const canvas = document.getElementById(sector + 'SpreadChart');
  if (!canvas) return;
  const sel1 = document.getElementById(sector + 'Spread1');
  const sel2 = document.getElementById(sector + 'Spread2');
  if (!sel1 || !sel2 || !sel1.value || !sel2.value || sel1.value === sel2.value) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width = rect.width * dpr; canvas.height = 180 * dpr;
    canvas.style.width = rect.width + 'px'; canvas.style.height = '180px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = isLight ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
    ctx.fillRect(0, 0, rect.width, 180);
    ctx.fillStyle = isLight ? '#94a3b8' : '#475569';
    ctx.font = '12px IBM Plex Mono'; ctx.textAlign = 'center';
    ctx.fillText('Select two different hubs to view spread', rect.width / 2, 95);
    return;
  }
  const hub1 = sel1.value, hub2 = sel2.value;
  const h1 = (typeof getChartHistory === 'function') ? getChartHistory(hub1) : priceHistory[hub1];
  const h2 = (typeof getChartHistory === 'function') ? getChartHistory(hub2) : priceHistory[hub2];
  if (!h1 || !h2) return;
  const len = Math.min(h1.length, h2.length, 90);
  const d1 = h1.slice(-len), d2 = h2.slice(-len);
  const spread = d1.map((v, i) => v - d2[i]);
  if (spread.length < 2) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  if (!rect.width) return;
  canvas.width = rect.width * dpr; canvas.height = 180 * dpr;
  canvas.style.width = rect.width + 'px'; canvas.style.height = '180px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = rect.width, H = 180;
  const padL = 65, padR = 20, padT = 20, padB = 30;
  const cW = W - padL - padR, cH = H - padT - padB;
  const sMin = Math.min(...spread) * 1.05, sMax = Math.max(...spread) * 1.05;
  const sMinAdj = Math.min(sMin, 0), sMaxAdj = Math.max(sMax, 0);
  const range = sMaxAdj - sMinAdj || 1;

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const bgColor = isLight ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  const gridColor = isLight ? '#e2e8f0' : 'rgba(30,45,61,0.6)';
  const textColor = isLight ? '#475569' : '#94a3b8';

  ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);

  function yPos(v) { return padT + (1 - (v - sMinAdj) / range) * cH; }
  function xPos(i) { return padL + (i / (spread.length - 1)) * cW; }

  // Zero line
  const zeroY = yPos(0);
  ctx.strokeStyle = isLight ? '#94a3b8' : 'rgba(148,163,184,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(padL + cW, zeroY); ctx.stroke(); ctx.setLineDash([]);

  // Grid
  ctx.strokeStyle = gridColor; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (cH / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = textColor; ctx.font = '10px IBM Plex Mono'; ctx.textAlign = 'right';
    ctx.fillText((sMaxAdj - (sMaxAdj - sMinAdj) * (i / 4)).toFixed(2), padL - 6, y + 3);
  }

  // Filled areas above/below zero
  // Green above zero
  ctx.beginPath(); ctx.moveTo(xPos(0), zeroY);
  for (let i = 0; i < spread.length; i++) {
    const y = Math.min(yPos(spread[i]), zeroY);
    ctx.lineTo(xPos(i), y);
  }
  ctx.lineTo(xPos(spread.length - 1), zeroY); ctx.closePath();
  ctx.fillStyle = 'rgba(16,185,129,0.15)'; ctx.fill();

  // Red below zero
  ctx.beginPath(); ctx.moveTo(xPos(0), zeroY);
  for (let i = 0; i < spread.length; i++) {
    const y = Math.max(yPos(spread[i]), zeroY);
    ctx.lineTo(xPos(i), y);
  }
  ctx.lineTo(xPos(spread.length - 1), zeroY); ctx.closePath();
  ctx.fillStyle = 'rgba(239,68,68,0.15)'; ctx.fill();

  // Spread line
  ctx.beginPath();
  for (let i = 0; i < spread.length; i++) {
    const x = xPos(i), y = yPos(spread[i]);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5; ctx.stroke();

  // Current spread label
  const cur = spread[spread.length - 1];
  ctx.font = 'bold 11px IBM Plex Mono'; ctx.textAlign = 'left';
  ctx.fillStyle = cur >= 0 ? '#10b981' : '#ef4444';
  ctx.fillText((cur >= 0 ? '+' : '') + cur.toFixed(3), padL + cW + 3, yPos(cur) + 4);

  // Title
  ctx.font = '10px IBM Plex Mono'; ctx.fillStyle = textColor; ctx.textAlign = 'left';
  ctx.fillText(hub1 + ' - ' + hub2, padL, padT - 6);
}

/* =====================================================================
   FORWARD CURVE CHART
   ===================================================================== */
function drawForwardCurveChart(canvasId, hubName) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const fwd = STATE.forwardCurves[hubName];
  if (!fwd || fwd.length < 2) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width = rect.width * dpr; canvas.height = 200 * dpr;
    canvas.style.width = rect.width + 'px'; canvas.style.height = '200px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = isLight ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
    ctx.fillRect(0, 0, rect.width, 200);
    ctx.fillStyle = isLight ? '#94a3b8' : '#475569';
    ctx.font = '12px IBM Plex Mono'; ctx.textAlign = 'center';
    ctx.fillText('No forward curve data for ' + hubName, rect.width / 2, 105);
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  if (!rect.width) return;
  const H = 200;
  canvas.width = rect.width * dpr; canvas.height = H * dpr;
  canvas.style.width = rect.width + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width;

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const bgColor = isLight ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  const gridColor = isLight ? '#e2e8f0' : 'rgba(30,45,61,0.6)';
  const textColor = isLight ? '#94a3b8' : '#94a3b8';

  ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);

  const padL = 70, padR = 25, padT = 25, padB = 35;
  const cW = W - padL - padR, cH = H - padT - padB;

  const prices = fwd.map(pt => pt.price);
  const spotPrice = getPrice(hubName);
  const allPrices = [spotPrice, ...prices];
  let pMin = Math.min(...allPrices), pMax = Math.max(...allPrices);
  const margin = (pMax - pMin) * 0.1 || 1;
  pMin -= margin; pMax += margin;
  const pRange = pMax - pMin;

  function yPos(v) { return padT + (1 - (v - pMin) / pRange) * cH; }
  function xPos(i) { return padL + ((i + 1) / (fwd.length + 1)) * cW; }
  const spotX = padL;

  // Grid lines
  ctx.strokeStyle = gridColor; ctx.lineWidth = 0.5;
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const y = padT + (cH / gridSteps) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    const val = pMax - (pMax - pMin) * (i / gridSteps);
    ctx.fillStyle = textColor; ctx.font = '10px IBM Plex Mono'; ctx.textAlign = 'right';
    ctx.fillText(val >= 100 ? val.toFixed(0) : val.toFixed(2), padL - 6, y + 3);
  }

  // Spot price reference line
  const spotY = yPos(spotPrice);
  ctx.strokeStyle = isLight ? '#94a3b8' : 'rgba(148,163,184,0.4)';
  ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(padL, spotY); ctx.lineTo(W - padR, spotY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = isLight ? '#64748b' : '#64748b'; ctx.font = '9px IBM Plex Mono'; ctx.textAlign = 'left';
  ctx.fillText('Spot', padL + 3, spotY - 5);

  // Gradient fill under curve
  const grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
  const isContango = prices[prices.length - 1] > spotPrice;
  if (isContango) {
    grad.addColorStop(0, 'rgba(239,68,68,0.12)');
    grad.addColorStop(1, 'rgba(239,68,68,0.02)');
  } else {
    grad.addColorStop(0, 'rgba(16,185,129,0.02)');
    grad.addColorStop(1, 'rgba(16,185,129,0.12)');
  }
  ctx.beginPath();
  ctx.moveTo(spotX, yPos(spotPrice));
  for (let i = 0; i < fwd.length; i++) ctx.lineTo(xPos(i), yPos(prices[i]));
  ctx.lineTo(xPos(fwd.length - 1), padT + cH);
  ctx.lineTo(spotX, padT + cH);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Curve line from spot through forward months
  ctx.beginPath();
  ctx.moveTo(spotX, yPos(spotPrice));
  for (let i = 0; i < fwd.length; i++) ctx.lineTo(xPos(i), yPos(prices[i]));
  ctx.strokeStyle = isContango ? '#ef4444' : '#10b981';
  ctx.lineWidth = 2; ctx.stroke();

  // Spot dot
  ctx.beginPath(); ctx.arc(spotX, yPos(spotPrice), 4, 0, Math.PI * 2);
  ctx.fillStyle = '#60a5fa'; ctx.fill();
  ctx.strokeStyle = bgColor; ctx.lineWidth = 1.5; ctx.stroke();

  // Data point dots — green=real, amber=interpolated, gray=synthetic
  for (let i = 0; i < fwd.length; i++) {
    const pt = fwd[i];
    const x = xPos(i), y = yPos(prices[i]);
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    if (pt._real === true) { ctx.fillStyle = '#22c55e'; }
    else if (pt._real === false) { ctx.fillStyle = '#f59e0b'; }
    else { ctx.fillStyle = isLight ? '#94a3b8' : '#64748b'; }
    ctx.fill();
    ctx.strokeStyle = bgColor; ctx.lineWidth = 1; ctx.stroke();
  }

  // X-axis month labels
  ctx.font = '9px IBM Plex Mono'; ctx.textAlign = 'center'; ctx.fillStyle = textColor;
  const now = new Date();
  ctx.fillText('Spot', spotX, padT + cH + 14);
  for (let i = 0; i < fwd.length; i++) {
    const mDate = fwd[i].delivery ? new Date(fwd[i].delivery + '-01') : new Date(now.getFullYear(), now.getMonth() + i + 2, 1);
    const label = mDate.toLocaleDateString('en-US', { month: 'short' });
    const yr = mDate.getFullYear() % 100;
    if (fwd.length <= 6 || i % 2 === 0) {
      ctx.fillText(label + "'" + yr, xPos(i), padT + cH + 14);
    }
  }

  // Structure label (contango / backwardation)
  const structLabel = isContango ? 'CONTANGO' : 'BACKWARDATION';
  const structColor = isContango ? '#ef4444' : '#10b981';
  ctx.font = 'bold 10px IBM Plex Mono'; ctx.textAlign = 'right';
  ctx.fillStyle = structColor;
  ctx.fillText(structLabel, W - padR, padT - 8);

  // Hub name + LIVE/SIM label
  const isReal = typeof _realFwdHubs !== 'undefined' && _realFwdHubs.has(hubName);
  ctx.font = '10px IBM Plex Mono'; ctx.textAlign = 'left'; ctx.fillStyle = textColor;
  ctx.fillText(hubName, padL, padT - 8);
  if (isReal) {
    const tw = ctx.measureText(hubName).width;
    ctx.fillStyle = '#22c55e'; ctx.font = 'bold 8px IBM Plex Mono';
    ctx.fillText(' LIVE', padL + tw + 2, padT - 8);
  }

  // Legend: dot colors
  const legY = padT + cH + 26;
  ctx.font = '8px IBM Plex Mono'; ctx.textAlign = 'left';
  let legX = padL;
  // Green dot = real
  ctx.beginPath(); ctx.arc(legX, legY, 3, 0, Math.PI * 2); ctx.fillStyle = '#22c55e'; ctx.fill();
  ctx.fillStyle = textColor; ctx.fillText('Market', legX + 6, legY + 3); legX += 50;
  // Amber dot = interpolated
  ctx.beginPath(); ctx.arc(legX, legY, 3, 0, Math.PI * 2); ctx.fillStyle = '#f59e0b'; ctx.fill();
  ctx.fillStyle = textColor; ctx.fillText('Interp.', legX + 6, legY + 3); legX += 50;
  // Gray dot = synthetic
  ctx.beginPath(); ctx.arc(legX, legY, 3, 0, Math.PI * 2); ctx.fillStyle = '#64748b'; ctx.fill();
  ctx.fillStyle = textColor; ctx.fillText('Sim', legX + 6, legY + 3);
}

function sparklineSVG(data, color, w, h) {
  if (!data || data.length < 2) return '';
  const d = data.slice(-30);
  const min = Math.min(...d), max = Math.max(...d);
  const range = max - min || 1;
  const pts = d.map((v, i) => `${(i / (d.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}
