/* =====================================================================
   CONTRACT EXPIRY & ROLLOVER LOGIC
   ===================================================================== */

function _expIsWeekend(d) { const day = d.getDay(); return day === 0 || day === 6; }

function _expAdjustBizDays(date, n) {
  const d = new Date(date);
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    if (!_expIsWeekend(d)) remaining--;
  }
  return d;
}

function _expLastBizDay(date) {
  const d = new Date(date);
  while (_expIsWeekend(d)) d.setDate(d.getDate() - 1);
  return d;
}

// Returns the last trading day (Date) for a given hub + delivery month + sector
function getContractExpiry(hubName, deliveryMonth, sector) {
  if (!deliveryMonth) return null;
  const delivery = new Date(deliveryMonth + '-01');
  const y = delivery.getFullYear();
  const m = delivery.getMonth();
  let expiry;

  switch (sector) {
    case 'crude':
      if (hubName === 'Brent Dated') {
        // ICE Brent: last biz day of 2nd month before delivery
        expiry = _expLastBizDay(new Date(y, m - 1, 0));
      } else if (['RBOB Gasoline','ULSD Diesel','Jet Fuel'].includes(hubName)) {
        // Products: last biz day of month before delivery
        expiry = _expLastBizDay(new Date(y, m, 0));
      } else {
        // WTI & others: 3 biz days before 25th of prior month
        expiry = _expAdjustBizDays(new Date(y, m - 1, 25), -3);
      }
      break;
    case 'ng':
      // NYMEX NG: 3 biz days before 1st of delivery month
      expiry = _expAdjustBizDays(new Date(y, m, 1), -3);
      break;
    case 'power':
      // Power: last biz day before delivery month
      expiry = _expLastBizDay(new Date(y, m, 0));
      break;
    case 'ag':
      // CBOT: biz day before 15th of delivery month
      expiry = _expAdjustBizDays(new Date(y, m, 15), -1);
      break;
    case 'metals':
      // COMEX: 3rd-to-last biz day of delivery month
      expiry = _expAdjustBizDays(_expLastBizDay(new Date(y, m + 1, 0)), -2);
      break;
    case 'freight':
      // FFA: last biz day of delivery month (cash-settled)
      expiry = _expLastBizDay(new Date(y, m + 1, 0));
      break;
    case 'lng':
      // JKM/TTF: ~15th of month before delivery
      var mid = new Date(y, m - 1, 15);
      expiry = _expIsWeekend(mid) ? _expAdjustBizDays(mid, 1) : mid;
      break;
    case 'ngls':
      // Last biz day of month before delivery
      expiry = _expLastBizDay(new Date(y, m, 0));
      break;
    default:
      return null;
  }
  return expiry;
}

// Returns true if this trade type settles with physical delivery
function isPhysicalSettlement(tradeType) {
  const physTypes = new Set(['CRUDE_PHYS','PHYS_FIXED','PHYS_INDEX','LNG_FOB','LNG_DES',
    'NGL_PHYS','FREIGHT_PHYS','AG_FUTURES','METALS_FUTURES','EFP']);
  return physTypes.has(tradeType);
}

// Formatted expiry info for display
function formatExpiryInfo(hubName, deliveryMonth, sector) {
  const expiry = getContractExpiry(hubName, deliveryMonth, sector);
  if (!expiry) return null;
  const now = new Date();
  now.setHours(0,0,0,0);
  const daysToExpiry = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
  const dateStr = expiry.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  let badge;
  if (daysToExpiry < 0) {
    badge = '<span style="color:var(--red);font-weight:600">EXPIRED</span>';
  } else if (daysToExpiry === 0) {
    badge = '<span style="color:var(--red);font-weight:600">EXPIRY DAY</span>';
  } else if (daysToExpiry <= 7) {
    badge = '<span style="color:#f59e0b;font-weight:600">' + daysToExpiry + 'd left</span>';
  } else {
    badge = '<span style="color:var(--text-dim)">' + daysToExpiry + 'd</span>';
  }
  return dateStr + ' ' + badge;
}

// Prompt month calculation per sector — returns YYYY-MM string for earliest tradeable month
function getPromptMonthMin(sector) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  let promptM;

  if (sector === 'crude' || sector === 'ng') {
    // WTI/NG expire around 20th-25th of the month before delivery
    promptM = d > 22 ? m + 2 : m + 1;
  } else if (sector === 'lng') {
    // LNG swaps expire ~15th of 2 months before delivery
    promptM = d > 15 ? m + 3 : m + 2;
  } else {
    // Default: prompt = next month
    promptM = m + 1;
  }

  let promptY = y;
  while (promptM > 11) { promptY++; promptM -= 12; }
  return promptY + '-' + String(promptM + 1).padStart(2, '0');
}

// Toggle auto-roll on a specific trade
function toggleAutoRoll(tradeId, enabled) {
  const t = STATE.trades.find(x => String(x.id) === String(tradeId));
  if (!t) return;
  t.autoRoll = enabled;
  localStorage.setItem(traderStorageKey('trades'), JSON.stringify(STATE.trades));
  // Sync to server
  if (STATE.connected && STATE.trader) {
    fetch(API_BASE + '/api/trades/' + STATE.trader.trader_name + '/' + tradeId, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoRoll: enabled })
    }).catch(() => {});
  }
  toast(enabled ? 'Auto-roll enabled for this position' : 'Auto-roll disabled', 'info');
}

// Contract rollover info popup
function showRolloverInfo(event) {
  event.stopPropagation();
  const pop = document.getElementById('rolloverInfoPop');
  if (!pop) return;
  const isVisible = pop.style.display !== 'none';
  pop.style.display = isVisible ? 'none' : 'block';
  if (isVisible) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const pw = pop.offsetWidth || 360;
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 6;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (left < 8) left = 8;
  if (top + 400 > window.scrollY + window.innerHeight) top = rect.top + window.scrollY - 420;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}

document.addEventListener('click', function(e) {
  const pop = document.getElementById('rolloverInfoPop');
  if (pop && pop.style.display !== 'none' && !pop.contains(e.target) && !e.target.classList.contains('rollover-info-btn')) {
    pop.style.display = 'none';
  }
});

/* --- Blotter sort state --- */
let _blotterSortCol = '';
let _blotterSortAsc = true;
function blotterSort(col) {
  if (_blotterSortCol === col) _blotterSortAsc = !_blotterSortAsc;
  else { _blotterSortCol = col; _blotterSortAsc = true; }
  // Update header indicators
  document.querySelectorAll('#blotterTable th.sortable').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    if (th.dataset.sort === col) th.classList.add(_blotterSortAsc ? 'sort-asc' : 'sort-desc');
  });
  renderBlotterTable();
}

/* --- Sector display helpers --- */
const SECTOR_LABELS = { ng:'NG', crude:'CL', power:'PWR', freight:'FRT', ag:'AG', metals:'MTL', ngls:'NGL', lng:'LNG' };
const SECTOR_COLORS = { ng:'#5b9bd5', crude:'#f59e0b', power:'#a78bfa', freight:'#6366f1', ag:'#34d399', metals:'#f472b6', ngls:'#fb923c', lng:'#38bdf8' };
function getSector(t) { return t.sector || inferSectorFromType(t.type) || ''; }
function getVolumeUnit(sector) {
  const m = { ng:'MMBtu', crude:'BBL', power:'MWh', freight:'Lots', ag:'Bu', metals:'oz', ngls:'Gal', lng:'MMBtu' };
  return m[sector] || '';
}
function formatAge(ms) {
  if (ms < 0) return '—';
  const s = Math.floor(ms/1000), m = Math.floor(s/60), h = Math.floor(m/60), d = Math.floor(h/24);
  if (d > 0) return d + 'd ' + (h%24) + 'h';
  if (h > 0) return h + 'h ' + (m%60) + 'm';
  if (m > 0) return m + 'm';
  return '<1m';
}
function _typeLabel(type) {
  const m = {
    PHYS_FIXED:'Fixed',PHYS_INDEX:'Index',BASIS_SWAP:'Basis',FIXED_FLOAT:'Swap',SPREAD:'Spread',
    BALMO:'BalMo',OPTION_NG:'Opt',TAS:'TAS',MULTILEG:'MuLeg',
    CRUDE_PHYS:'Phys',CRUDE_SWAP:'Swap',CRUDE_DIFF:'Diff',OPTION_CL:'Opt',EFP:'EFP',
    FREIGHT_FFA:'FFA',FREIGHT_PHYS:'Phys',AG_FUTURES:'Fut',AG_OPTION:'Opt',AG_SPREAD:'Spread',
    METALS_FUTURES:'Fut',METALS_OPTION:'Opt',METALS_SPREAD:'Spread',
    NGL_PHYS:'Phys',NGL_SWAP:'Swap',NGL_SPREAD:'Spread',NGL_FRAC:'Frac',
    LNG_DES:'DES',LNG_FOB:'FOB',LNG_SWAP:'Swap',LNG_SPREAD:'Spread',LNG_BASIS:'Basis'
  };
  return m[type] || type;
}

/* --- Multi-leg spread/basis pricing --- */
const SPREAD_TYPES = new Set(['SPREAD','CRUDE_DIFF','AG_SPREAD','METALS_SPREAD','NGL_SPREAD','LNG_SPREAD']);
const BASIS_TYPES = new Set(['BASIS_SWAP','LNG_BASIS']);

function getSpreadPrice(t) {
  // Calendar spread: price = near month forward - far month forward
  if (!t.nearMonth || !t.farMonth) return getPrice(t.hub);
  const fwd = STATE.forwardCurves[t.hub];
  if (!fwd || !fwd.length) return getPrice(t.hub);
  const now = new Date();
  const nearDate = new Date(t.nearMonth + '-01');
  const farDate = new Date(t.farMonth + '-01');
  const nearIdx = Math.max(0, Math.min(11, (nearDate.getFullYear() - now.getFullYear()) * 12 + nearDate.getMonth() - now.getMonth()));
  const farIdx = Math.max(0, Math.min(11, (farDate.getFullYear() - now.getFullYear()) * 12 + farDate.getMonth() - now.getMonth()));
  const nearPrice = fwd[nearIdx] ? fwd[nearIdx].price : getPrice(t.hub);
  const farPrice = fwd[farIdx] ? fwd[farIdx].price : getPrice(t.hub);
  return nearPrice - farPrice;
}

function getBasisPrice(t) {
  // Basis swap: price = primary hub price - basis hub price (differential)
  if (!t.basisHub) return getPrice(t.hub);
  const p1 = getPrice(t.hub);
  const p2 = getPrice(t.basisHub);
  return p1 - p2;
}

function getMultilegPrice(t) {
  if (!t.legs || !t.legs.length) return getPrice(t.hub) || 0;
  // Net price = sum of each leg's signed price (BUY = +, SELL = -)
  // Normalized per-unit relative to trade direction
  let net = 0;
  t.legs.forEach(function(leg) {
    const p = getPrice(leg.hub) || 0;
    net += (leg.direction === 'BUY' ? 1 : -1) * p;
  });
  // If trade direction is SELL, the trade P&L inverts, so return raw net
  return net;
}

// Returns the forward curve price for a specific delivery month, or spot if prompt.
function _getContractPrice(hub, deliveryMonth) {
  if (!deliveryMonth || !hub) return getPrice(hub);
  const fwd = STATE.forwardCurves[hub];
  if (!fwd || !fwd.length) return getPrice(hub);

  // First try exact delivery month match (real forward curve data has delivery strings)
  const match = fwd.find(pt => pt.delivery === deliveryMonth);
  if (match) return match.price;

  // Fallback: index-based lookup
  const now = new Date();
  const target = new Date(deliveryMonth + '-01');
  const monthsAhead = (target.getFullYear() - now.getFullYear()) * 12 + target.getMonth() - now.getMonth();
  // Prompt month (0) or past month → use spot
  if (monthsAhead <= 0) return getPrice(hub);
  // Deferred month → use forward curve
  if (monthsAhead <= fwd.length) return fwd[monthsAhead - 1].price;
  // Beyond curve → use last available forward point
  return fwd[fwd.length - 1].price;
}

function getTradeSpot(t) {
  if (t.type === 'MULTILEG' && t.legs && t.legs.length) return getMultilegPrice(t);
  if (SPREAD_TYPES.has(t.type)) return getSpreadPrice(t);
  if (BASIS_TYPES.has(t.type)) return getBasisPrice(t);
  return _getContractPrice(t.hub, t.deliveryMonth);
}

/* --- Row expand toggle --- */
function toggleBlotterRow(rowId) {
  const detail = document.getElementById('bdet_' + rowId);
  if (detail) detail.classList.toggle('expanded');
}

function renderBlotterTable() {
  let trades = [...STATE.trades, ...STATE.pendingOrders.map(o => ({...o, _pending: true}))];

  // --- Filters ---
  const search = (document.getElementById('blotterSearch')?.value || '').toLowerCase();
  const fSector = document.getElementById('blotterFilterSector')?.value || '';
  const fStatus = document.getElementById('blotterFilterStatus')?.value || '';
  const fDir = document.getElementById('blotterFilterDir')?.value || '';

  if (search) {
    trades = trades.filter(t =>
      (t.hub||'').toLowerCase().includes(search) || (t.type||'').toLowerCase().includes(search) ||
      (t.notes||'').toLowerCase().includes(search) || (t.counterparty||'').toLowerCase().includes(search) ||
      (t.confirmRef||'').toLowerCase().includes(search) || (t.venue||'').toLowerCase().includes(search)
    );
  }
  if (fSector) trades = trades.filter(t => getSector(t) === fSector);
  if (fStatus) {
    if (fStatus === 'PENDING') trades = trades.filter(t => t._pending);
    else trades = trades.filter(t => !t._pending && t.status === fStatus);
  }
  if (fDir) trades = trades.filter(t => t.direction === fDir);

  // --- Pre-compute MTM for sort ---
  const enriched = trades.map(t => {
    const spot = getTradeSpot(t);
    const dir = t.direction === 'BUY' ? 1 : -1;
    const vol = parseFloat(t.volume || 0);
    const entry = parseFloat(t.entryPrice || 0);
    let mtm = 0;
    if (t._pending) mtm = 0;
    else if (t.status === 'OPEN') mtm = (spot - entry) * vol * dir;
    else mtm = parseFloat(t.realizedPnl || 0);
    const mg = (typeof calcMargin === 'function') ? calcMargin(t) : 0;
    return { t, spot, dir, vol, entry, mtm, margin: mg, sector: getSector(t) };
  });

  // --- Sort ---
  if (_blotterSortCol) {
    const asc = _blotterSortAsc ? 1 : -1;
    enriched.sort((a, b) => {
      let va, vb;
      switch (_blotterSortCol) {
        case 'sector': va = a.sector; vb = b.sector; break;
        case 'type': va = a.t.type||''; vb = b.t.type||''; break;
        case 'direction': va = a.t.direction||''; vb = b.t.direction||''; break;
        case 'hub': va = a.t.hub||''; vb = b.t.hub||''; break;
        case 'deliveryMonth': va = a.t.deliveryMonth||''; vb = b.t.deliveryMonth||''; break;
        case 'volume': return (a.vol - b.vol) * asc;
        case 'entryPrice': return (a.entry - b.entry) * asc;
        case 'spot': return (a.spot - b.spot) * asc;
        case 'mtm': return (a.mtm - b.mtm) * asc;
        case 'margin': return (a.margin - b.margin) * asc;
        case 'status': va = a.t._pending ? 'PENDING' : a.t.status; vb = b.t._pending ? 'PENDING' : b.t.status; break;
        default: return 0;
      }
      if (va !== undefined) return va < vb ? -asc : va > vb ? asc : 0;
      return 0;
    });
  }

  const countEl = document.getElementById('blotterCount');
  if (countEl) countEl.textContent = enriched.length + ' trades' + (STATE.pendingOrders.length ? ` (${STATE.pendingOrders.length} pending)` : '');

  // Pagination
  const totalPages = Math.max(1, Math.ceil(enriched.length / BLOTTER_PAGE_SIZE));
  if (blotterPage >= totalPages) blotterPage = totalPages - 1;
  const start = blotterPage * BLOTTER_PAGE_SIZE;
  const pageItems = enriched.slice(start, start + BLOTTER_PAGE_SIZE);

  const tbody = document.getElementById('blotterBody');
  tbody.innerHTML = pageItems.map(({ t, spot, dir, vol, entry, mtm, margin, sector }) => {
    const mtmColor = mtm >= 0 ? 'green' : 'red';
    const dirColor = t.direction === 'BUY' ? 'color:var(--buy)' : 'color:var(--sell)';
    const isLarge = (t.hub||'').includes('Baltic') || (t.hub||'').includes('Index');

    // Sector badge
    const sLabel = SECTOR_LABELS[sector] || sector.toUpperCase();
    const sColor = SECTOR_COLORS[sector] || 'var(--text-muted)';
    const sectorBadge = sector ? `<span class="sector-badge" style="color:${sColor};border-color:${sColor}">${sLabel}</span>` : '—';

    // Type + order type combined
    const orderType = t.orderType || 'MARKET';
    const tif = t.tif || 'DAY';
    let typeCell = `<span style="font-weight:600;font-size:11px">${_typeLabel(t.type)}</span>`;
    if (t._pending) {
      const trigPrice = t.limitPrice || t.stopPrice || 0;
      typeCell += `<br><span class="order-badge pending">${orderType}</span> <span style="font-size:10px;color:var(--text-muted)">@${parseFloat(trigPrice).toFixed(2)} ${tif}</span>`;
    } else if (orderType !== 'MARKET') {
      typeCell += `<br><span class="order-badge filled">${orderType}</span>`;
    } else {
      typeCell += `<br><span style="font-size:10px;color:var(--text-muted)">MKT/${tif}</span>`;
    }

    // Delivery month (show spread legs for calendar spreads)
    let delMo;
    if (SPREAD_TYPES.has(t.type) && t.nearMonth && t.farMonth) {
      const nm = new Date(t.nearMonth + '-01').toLocaleDateString('en-US', { month:'short', year:'2-digit' });
      const fm = new Date(t.farMonth + '-01').toLocaleDateString('en-US', { month:'short', year:'2-digit' });
      delMo = nm + ' / ' + fm;
    } else if (t.type === 'MULTILEG' && t.legs && t.legs.length) {
      const months = t.legs.filter(function(l){return l.deliveryMonth;}).map(function(l){ return new Date(l.deliveryMonth + '-01').toLocaleDateString('en-US', { month:'short', year:'2-digit' }); });
      delMo = months.length ? months.join(', ') : '—';
    } else {
      delMo = t.deliveryMonth ? new Date(t.deliveryMonth + '-01').toLocaleDateString('en-US', { month:'short', year:'2-digit' }) : '—';
    }

    // Volume with unit
    const unit = getVolumeUnit(sector);
    const volDisplay = `${vol.toLocaleString()}<span style="font-size:10px;color:var(--text-muted);margin-left:2px">${unit}</span>`;

    // P&L with per-unit
    let pnlCell;
    if (t._pending) {
      pnlCell = '<span style="color:var(--text-muted)">—</span>';
    } else {
      const perUnit = vol > 0 ? Math.abs(mtm / vol) : 0;
      const pnlSign = mtm >= 0 ? '+' : '-';
      pnlCell = `<span class="${mtmColor}" style="font-weight:600">${pnlSign}$${Math.abs(mtm).toLocaleString(undefined,{maximumFractionDigits:0})}</span>`;
      if (vol > 0 && t.status === 'OPEN') {
        pnlCell += `<br><span style="font-size:10px;color:var(--text-muted)">${mtm >= 0 ? '+' : '-'}$${perUnit.toFixed(3)}/${unit || 'u'}</span>`;
      }
    }

    // Margin
    const marginStr = margin > 0 ? '$' + margin.toLocaleString(undefined,{maximumFractionDigits:0}) : '—';

    // Venue badge
    const venue = t.venue || 'OTC';
    const isOtcVenue = venue === 'OTC';
    const venueBadge = isOtcVenue
      ? `<span style="font-size:10px;padding:1px 4px;border-radius:3px;background:rgba(139,92,246,0.12);color:#a78bfa">OTC</span>`
      : `<span style="font-size:10px;padding:1px 4px;border-radius:3px;background:rgba(34,211,238,0.08);color:var(--text-dim)">${venue}</span>`;

    // Status badge
    let statusBadge;
    if (t._pending) statusBadge = '<span class="badge" style="background:rgba(139,92,246,0.15);color:#8b5cf6">PEND</span>';
    else if (t.status === 'OPEN') statusBadge = '<span class="badge" style="background:rgba(34,211,238,0.15);color:var(--accent)">OPEN</span>';
    else statusBadge = '<span class="badge" style="background:rgba(148,163,184,0.15);color:var(--text-dim)">CLSD</span>';

    // Age
    const created = new Date(t.timestamp || t.server_created_at || Date.now());
    const ageMs = Date.now() - created.getTime();
    const ageStr = t._pending ? '—' : formatAge(ageMs);

    // Row tint
    const rowBg = t._pending ? 'background:rgba(139,92,246,0.03)' : (t.status === 'OPEN' ? (mtm >= 0 ? 'background:rgba(16,185,129,0.03)' : 'background:rgba(239,68,68,0.03)') : '');

    // Actions
    const canDelete = (Date.now() - created.getTime()) < 3600000;
    let actions = '';
    if (t._pending) {
      actions = `<button class="btn btn-ghost btn-sm" style="color:var(--red);font-size:11px" onclick="event.stopPropagation();cancelPendingOrder('${t._pendingId}')">Cancel</button>`;
    } else {
      if (t.status === 'OPEN') actions += `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="event.stopPropagation();closeTrade(${t.id})">Close</button>`;
      if (canDelete) actions += `<button class="btn btn-ghost btn-sm" style="color:var(--red);font-size:11px" onclick="event.stopPropagation();deleteTrade(${t.id})">Del</button>`;
      actions += `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="event.stopPropagation();cloneTrade(${t.id})">Clone</button>`;
      actions += `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="event.stopPropagation();shareTradeToChat(${t.id})">Share</button>`;
    }

    // Expanded detail row content
    const rowId = t._pending ? t._pendingId : t.id;
    const dateStr = created.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const refLabel = t.confirmRef || '—';
    const isPhys = t.settlementType === 'PHYSICAL' || isPhysicalSettlement(t.type);
    const settleBadge = isPhys
      ? '<span style="color:#f59e0b;font-weight:600">Physical Delivery</span>'
      : '<span style="color:#60a5fa;font-weight:600">Financial (Cash Settled)</span>';
    const expiryHtml = t.deliveryMonth ? (formatExpiryInfo(t.hub, t.deliveryMonth, sector) || '—') : '—';
    const brokerLabel = t.broker || 'Direct';
    const cptyLabel = t.counterparty || t.counterpartyTrader || '—';
    const stopLoss = t.stopLoss ? '$' + parseFloat(t.stopLoss).toFixed(3) : '—';
    const targetExit = t.targetExit ? '$' + parseFloat(t.targetExit).toFixed(3) : '—';
    const commission = t.commission ? '$' + parseFloat(t.commission).toFixed(4) + '/unit' : '—';
    const notesLabel = t.notes || '—';
    // Multi-leg detail info
    let legInfo = '';
    if (SPREAD_TYPES.has(t.type) && (t.nearMonth || t.farMonth)) {
      legInfo = '<div class="bdet-item"><span class="bdet-label">Leg 1 (Near)</span><span>' + (t.nearMonth||'—') + '</span></div>'
        + '<div class="bdet-item"><span class="bdet-label">Leg 2 (Far)</span><span>' + (t.farMonth||'—') + '</span></div>';
    }
    if (BASIS_TYPES.has(t.type) && t.basisHub) {
      var _p1 = getPrice(t.hub), _p2 = getPrice(t.basisHub), _diff = _p1 - _p2;
      var _diffColor = _diff >= 0 ? 'var(--green)' : 'var(--red)';
      legInfo = '<div class="bdet-item"><span class="bdet-label">Trade Hub</span><span>' + t.hub + ' ($' + _p1.toFixed(4) + ')</span></div>'
        + '<div class="bdet-item"><span class="bdet-label">Base Hub (Reference)</span><span>' + t.basisHub + ' ($' + _p2.toFixed(4) + ')</span></div>'
        + '<div class="bdet-item"><span class="bdet-label">Formula</span><span style="color:var(--text-dim)">' + t.hub + ' - ' + t.basisHub + '</span></div>'
        + '<div class="bdet-item"><span class="bdet-label">Differential</span><span style="font-weight:700;font-size:14px;color:' + _diffColor + '">' + (_diff >= 0 ? '+' : '') + _diff.toFixed(4) + '</span></div>';
    }
    if (t.type === 'MULTILEG' && t.legs && t.legs.length) {
      legInfo = t.legs.map(function(leg, i) {
        var lp = getPrice(leg.hub);
        return '<div class="bdet-item"><span class="bdet-label">Leg ' + (i+1) + '</span><span>' + leg.direction + ' ' + leg.hub + ' ' + (leg.deliveryMonth || '') + ' ($' + lp.toFixed(4) + ')</span></div>';
      }).join('');
    }
    const closeInfo = t.status === 'CLOSED' ? `<div class="bdet-item"><span class="bdet-label">Close Price</span><span>$${parseFloat(t.closePrice||0).toFixed(4)}</span></div><div class="bdet-item"><span class="bdet-label">Closed At</span><span>${t.closedAt ? new Date(t.closedAt).toLocaleString() : '—'}</span></div>` : '';

    return `<tr class="blotter-row" style="${rowBg}" onclick="toggleBlotterRow('${rowId}')">
      <td>${sectorBadge}</td>
      <td>${typeCell}</td>
      <td style="${dirColor};font-weight:700;font-size:12px">${t.direction}</td>
      <td style="font-weight:500;font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${t.hub}${t.basisHub ? ' vs ' + t.basisHub : ''}">${t.hub}${BASIS_TYPES.has(t.type) && t.basisHub ? '<br><span style="font-size:10px;color:var(--text-muted)">' + t.basisHub + ' (base)</span><br><span style="font-size:10px;font-weight:700;color:' + ((getPrice(t.hub)-getPrice(t.basisHub)) >= 0 ? 'var(--green)' : 'var(--red)') + '">' + ((getPrice(t.hub)-getPrice(t.basisHub)) >= 0 ? '+' : '') + (getPrice(t.hub)-getPrice(t.basisHub)).toFixed(4) + ' diff</span>' : ''}${t.type === 'MULTILEG' && t.legs && t.legs.length ? '<br><span style="font-size:10px;color:var(--text-muted)">' + t.legs.length + ' legs</span>' : ''}</td>
      <td style="font-size:11px;color:var(--text-dim)">${delMo}</td>
      <td class="mono" style="font-size:12px">${volDisplay}</td>
      <td class="mono" style="font-size:12px">${isLarge ? entry.toFixed(0) : entry.toFixed(3)}</td>
      <td class="mono" style="font-size:12px">${t._pending ? '—' : (isLarge ? spot.toFixed(0) : spot.toFixed(3))}</td>
      <td>${pnlCell}</td>
      <td style="font-size:11px;color:var(--text-dim)">${marginStr}</td>
      <td>${venueBadge}</td>
      <td>${statusBadge}</td>
      <td style="font-size:11px;color:var(--text-muted);white-space:nowrap">${ageStr}</td>
      <td><div class="actions-cell">${actions}</div></td>
    </tr>
    <tr class="blotter-detail" id="bdet_${rowId}"><td colspan="14"><div class="bdet-grid">
      <div class="bdet-item"><span class="bdet-label">Ref#</span><span class="mono">${refLabel}</span></div>
      <div class="bdet-item"><span class="bdet-label">Date</span><span>${dateStr}</span></div>
      <div class="bdet-item"><span class="bdet-label">Full Type</span><span>${t.type}</span></div>
      <div class="bdet-item"><span class="bdet-label">Settlement</span><span>${settleBadge}</span></div>
      <div class="bdet-item"><span class="bdet-label">Contract Expiry</span><span>${expiryHtml}</span></div>
      ${t.deliveryMonth && t.status === 'OPEN' ? `<div class="bdet-item"><span class="bdet-label">Auto-Roll</span><span><label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-size:12px"><input type="checkbox" ${t.autoRoll ? 'checked' : ''} onchange="toggleAutoRoll('${t.id}',this.checked)"> Roll to next month before expiry</label>${t.rolledFrom ? '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Rolled from previous contract</div>' : ''}</span></div>` : ''}
      ${t.closeReason ? `<div class="bdet-item"><span class="bdet-label">Close Reason</span><span style="font-weight:600;color:${t.closeReason === 'MARGIN_CALL' ? 'var(--red)' : t.closeReason === 'EXPIRY' ? '#ef4444' : t.closeReason === 'STOP_LOSS' ? '#f97316' : t.closeReason === 'AUTO_ROLL' ? '#f59e0b' : t.closeReason === 'TARGET' ? 'var(--green)' : 'var(--text-dim)'}">${t.closeReason === 'AUTO_ROLL' ? 'AUTO-ROLLED to next month' : t.closeReason === 'STOP_LOSS' ? 'STOP-LOSS triggered' : t.closeReason === 'TARGET' ? 'TARGET reached' : t.closeReason === 'EXPIRY' ? 'CONTRACT EXPIRED (cash settled)' : t.closeReason === 'MARGIN_CALL' ? 'MARGIN CALL — forced liquidation' : t.closeReason === 'FLAT_ALL' ? 'FLAT ALL positions' : t.closeReason}</span></div>` : ''}
      <div class="bdet-item"><span class="bdet-label">Broker</span><span>${brokerLabel}</span></div>
      <div class="bdet-item"><span class="bdet-label">Counterparty</span><span>${cptyLabel}</span></div>
      <div class="bdet-item"><span class="bdet-label">Venue</span><span>${venue}</span></div>
      <div class="bdet-item"><span class="bdet-label">Margin</span><span>${marginStr}</span></div>
      <div class="bdet-item"><span class="bdet-label">Commission</span><span>${commission}</span></div>
      <div class="bdet-item"><span class="bdet-label">Stop Loss</span><span>${stopLoss}</span></div>
      <div class="bdet-item"><span class="bdet-label">Target Exit</span><span>${targetExit}</span></div>
      ${closeInfo}
      ${legInfo}
      <div class="bdet-item bdet-notes"><span class="bdet-label">Notes</span><span>${notesLabel}</span></div>
    </div></td></tr>`;
  }).join('');

  if (!pageItems.length) {
    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:var(--text-muted);padding:30px">No trades yet. Use the form above to place your first trade.</td></tr>';
  }

  // Pagination controls
  const pagDiv = document.getElementById('blotterPagination');
  if (totalPages <= 1) { pagDiv.innerHTML = ''; return; }
  let pagHtml = '';
  for (let i = 0; i < totalPages; i++) {
    pagHtml += `<button class="btn btn-sm ${i===blotterPage?'btn-primary':'btn-ghost'}" onclick="blotterPage=${i};renderBlotterTable()">${i+1}</button>`;
  }
  pagDiv.innerHTML = pagHtml;
}

function closeTrade(id) {
  const t = STATE.trades.find(x => x.id === id);
  if (!t || t.status !== 'OPEN') return;
  const isMultiLeg = SPREAD_TYPES.has(t.type) || BASIS_TYPES.has(t.type) || (t.type === 'MULTILEG' && t.legs && t.legs.length);
  const cp = getTradeSpot(t);
  if (cp === null || cp === undefined || isNaN(cp)) return toast('No market price available for ' + t.hub, 'error');
  const isOtc = t.venue === 'OTC' && (t.counterpartyTrader || t.otcMirrorOf);
  const priceLabel = isMultiLeg ? 'spread $' + cp.toFixed(4) : 'market price $' + cp.toFixed(4);
  const confirmMsg = isOtc
    ? 'Close OTC trade at ' + priceLabel + '? (Mirror position will also close)'
    : 'Close at ' + priceLabel + '?';
  if (!confirm(confirmMsg)) return;

  const dir = t.direction === 'BUY' ? 1 : -1;
  const pnl = (cp - parseFloat(t.entryPrice)) * parseFloat(t.volume) * dir;
  t.status = 'CLOSED';
  t.closePrice = cp;
  t.realizedPnl = pnl;
  t.closedAt = new Date().toISOString();
  t.closeReason = 'MANUAL';
  localStorage.setItem(traderStorageKey('trades'), JSON.stringify(STATE.trades));

  // Update server
  if (STATE.connected && STATE.trader) {
    if (isOtc) {
      fetch(API_BASE + '/api/trades/otc-close/' + STATE.trader.trader_name + '/' + id, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closePrice: cp })
      }).catch(() => {});
    } else {
      fetch(API_BASE + '/api/trades/' + STATE.trader.trader_name + '/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED', closePrice: cp, realizedPnl: pnl, spotRef: cp, closeReason: 'MANUAL' })
      }).catch(() => {});
    }
  }

  playSound('trade');
  toast('Trade closed: ' + (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toLocaleString(undefined,{maximumFractionDigits:0}) + (isOtc?' (mirror also closed)':''), pnl >= 0 ? 'success' : 'error');
  renderBlotterPage();
}

function deleteTrade(id) {
  const idx = STATE.trades.findIndex(x => x.id === id);
  if (idx === -1) return;
  STATE.trades.splice(idx, 1);
  localStorage.setItem(traderStorageKey('trades'), JSON.stringify(STATE.trades));
  if (STATE.connected && STATE.trader) {
    fetch('/api/trades/' + STATE.trader.trader_name + '/' + id, { method: 'DELETE' }).catch(() => {});
  }
  toast('Trade deleted', 'info');
  renderBlotterPage();
}

function inferSectorFromType(type) {
  if (!type) return '';
  if (type.startsWith('CRUDE') || type === 'EFP' || type === 'OPTION_CL') return 'crude';
  if (type.startsWith('FREIGHT')) return 'freight';
  if (type.startsWith('AG')) return 'ag';
  if (type.startsWith('METALS')) return 'metals';
  if (type.startsWith('NGL')) return 'ngls';
  if (type.startsWith('LNG')) return 'lng';
  // NG/Power types overlap — default to ng
  return 'ng';
}

function cloneTrade(id) {
  const t = STATE.trades.find(x => x.id === id);
  if (!t) return;
  // Set sector first, then populate types, then set type
  const sector = inferSectorFromType(t.type);
  document.getElementById('tradeSector').value = sector;
  onTradeSectorChange();
  document.getElementById('tradeType').value = t.type || '';
  onTradeTypeChange();
  setDirection(t.direction);
  setTimeout(() => {
    document.getElementById('tradeHub').value = t.hub || '';
    if (t.venue) document.getElementById('tradeVenue').value = t.venue;
    document.getElementById('tradeVolume').value = t.volume || '';
    document.getElementById('tradeEntry').value = t.entryPrice || '';
    document.getElementById('tradeCpty').value = t.counterparty || '';
    document.getElementById('tradeNotes').value = t.notes || '';
    const cloneSpot = (typeof getTradeSpot === 'function') ? getTradeSpot(t) : getPrice(t.hub);
    document.getElementById('tradeSpot').value = cloneSpot.toFixed(4);
    updateMarginPreview();
  }, 50);
  toast('Trade cloned — review and submit', 'info');
  document.getElementById('tradeFormCard').scrollIntoView({ behavior: 'smooth' });
}

function renderNetPositions() {
  const positions = {};
  STATE.trades.filter(t => t.status === 'OPEN').forEach(t => {
    if (!positions[t.hub]) positions[t.hub] = { long: 0, short: 0 };
    if (t.direction === 'BUY') positions[t.hub].long += parseFloat(t.volume);
    else positions[t.hub].short += parseFloat(t.volume);
  });

  const tbody = document.getElementById('netPositionBody');
  const entries = Object.entries(positions);
  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">No open positions</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(([hub, pos]) => {
    const net = pos.long - pos.short;
    const dir = net > 0 ? 'NET LONG' : net < 0 ? 'NET SHORT' : 'FLAT';
    const dirColor = net > 0 ? 'color:var(--green)' : net < 0 ? 'color:var(--red)' : 'color:var(--text-muted)';
    return `<tr>
      <td style="font-weight:600">${hub}</td>
      <td class="mono green">${pos.long.toLocaleString()}</td>
      <td class="mono red">${pos.short.toLocaleString()}</td>
      <td class="mono" style="${dirColor};font-weight:700">${Math.abs(net).toLocaleString()}</td>
      <td style="${dirColor};font-weight:600">${dir}</td>
    </tr>`;
  }).join('');
}

function drawPnlChart() {
  const canvas = document.getElementById('pnlChart');
  if (!canvas || !canvas.parentElement) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  if (!rect || !rect.width) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = 280 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '280px';
  ctx.scale(dpr, dpr);
  const W = rect.width, H = 280;

  const closed = STATE.trades.filter(t => t.status === 'CLOSED').reverse();
  if (closed.length < 1) {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = isLight ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = isLight ? '#94a3b8' : '#475569';
    ctx.font = '13px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Close trades to see cumulative P&L', W/2, H/2);
    return;
  }

  const cumPnlAll = [];
  let running = 0;
  closed.forEach(t => { running += parseFloat(t.realizedPnl || 0); cumPnlAll.push(running); });

  // Range filtering
  const rangeMap = { '1W': 7, '1M': 30, '3M': 90, 'ALL': cumPnlAll.length };
  const sliceN = rangeMap[STATE.pnlRange] || cumPnlAll.length;
  const cumPnl = cumPnlAll.slice(-Math.min(sliceN, cumPnlAll.length));

  const min = Math.min(0, ...cumPnl);
  const max = Math.max(0, ...cumPnl);
  const range = (max - min) || 1;
  const padL = 70, padR = 35, padT = 20, padB = 45;
  const cW = W - padL - padR, cH = H - padT - padB;

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  ctx.fillStyle = isLight ? '#ffffff' : getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  ctx.fillRect(0, 0, W, H);

  // Zero line
  const zeroY = padT + (1 - (0 - min) / range) * cH;
  ctx.strokeStyle = 'rgba(148,163,184,0.3)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(W - padR, zeroY); ctx.stroke();
  ctx.setLineDash([]);

  // P&L line
  const lastVal = cumPnl[cumPnl.length - 1];
  const lineColor = lastVal >= 0 ? '#10b981' : '#ef4444';
  ctx.beginPath();
  cumPnl.forEach((val, i) => {
    const x = padL + (cumPnl.length > 1 ? (i / (cumPnl.length - 1)) * cW : cW / 2);
    const y = padT + (1 - (val - min) / range) * cH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
  if (lastVal >= 0) { grad.addColorStop(0, 'rgba(16,185,129,0.15)'); grad.addColorStop(1, 'rgba(16,185,129,0)'); }
  else { grad.addColorStop(0, 'rgba(239,68,68,0)'); grad.addColorStop(1, 'rgba(239,68,68,0.15)'); }
  ctx.beginPath();
  cumPnl.forEach((val, i) => {
    const x = padL + (cumPnl.length > 1 ? (i / (cumPnl.length - 1)) * cW : cW / 2);
    const y = padT + (1 - (val - min) / range) * cH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(padL + cW, zeroY);
  ctx.lineTo(padL, zeroY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Y-axis labels
  const textColor = isLight ? '#475569' : '#94a3b8';
  ctx.fillStyle = textColor;
  ctx.font = '11px JetBrains Mono';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = min + (range * i / 4);
    const y = padT + (1 - i / 4) * cH;
    ctx.fillText('$' + val.toFixed(0), padL - 8, y + 4);
  }

  // X-axis date labels
  ctx.fillStyle = textColor;
  ctx.font = '10px JetBrains Mono';
  ctx.textAlign = 'center';
  const now = new Date();
  const totalSpanDays = rangeMap[STATE.pnlRange] || cumPnl.length;
  const labelCount = Math.min(6, cumPnl.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = cumPnl.length > 1 ? Math.floor(i * (cumPnl.length - 1) / (labelCount - 1)) : 0;
    const x = padL + (cumPnl.length > 1 ? (idx / (cumPnl.length - 1)) * cW : cW / 2);
    const daysBack = Math.round(totalSpanDays * (1 - idx / Math.max(1, cumPnl.length - 1)));
    const labelDate = new Date(now.getTime() - daysBack * 86400000);
    const label = labelDate.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    ctx.fillText(label, x, H - padB + 20);
  }

  // Store metadata for crosshair
  canvas._pnlMeta = { padL, padR, padT, padB, cW, cH, min, max, range, data: cumPnl, lineColor, W, H };
}

function initPnlCrosshair() {
  const canvas = document.getElementById('pnlChart');
  if (!canvas || canvas._pnlCrossInit) return;
  canvas._pnlCrossInit = true;

  canvas.addEventListener('mousemove', e => {
    const meta = canvas._pnlMeta;
    if (!meta) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const { padL, padT, cW, cH, min, range, data, lineColor, W, H, padB } = meta;
    if (mx < padL || mx > padL + cW) { drawPnlChart(); return; }

    const idx = Math.round(((mx - padL) / cW) * (data.length - 1));
    const clampIdx = Math.max(0, Math.min(data.length - 1, idx));
    const val = data[clampIdx];
    const snapX = padL + (clampIdx / (data.length - 1)) * cW;
    const snapY = padT + (1 - (val - min) / range) * cH;

    drawPnlChart();
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save(); ctx.scale(dpr, dpr);

    ctx.strokeStyle = 'rgba(148,163,184,0.4)'; ctx.lineWidth = 0.5; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(snapX, padT); ctx.lineTo(snapX, padT + cH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, snapY); ctx.lineTo(padL + cW, snapY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath(); ctx.arc(snapX, snapY, 5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

    const sign = val >= 0 ? '+' : '-';
    const txt = sign + '$' + Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 });
    ctx.font = '12px JetBrains Mono';
    const tw = ctx.measureText(txt).width + 16;
    const tipX = snapX + 12 + tw > padL + cW ? snapX - tw - 12 : snapX + 12;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(tipX, snapY - 14, tw, 24);
    ctx.strokeStyle = lineColor; ctx.lineWidth = 1;
    ctx.strokeRect(tipX, snapY - 14, tw, 24);
    ctx.fillStyle = lineColor; ctx.textAlign = 'left';
    ctx.fillText(txt, tipX + 8, snapY + 3);

    const now = new Date();
    const daysBack = data.length - 1 - clampIdx;
    const labelDate = new Date(now.getTime() - daysBack * 86400000);
    const dateStr = labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ctx.font = '10px JetBrains Mono';
    const dtw = ctx.measureText(dateStr).width + 10;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(snapX - dtw / 2, padT + cH + 2, dtw, 18);
    ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center';
    ctx.fillText(dateStr, snapX, padT + cH + 14);
    ctx.restore();
  });

  canvas.addEventListener('mouseleave', () => { if (canvas._pnlMeta) drawPnlChart(); });
}

async function shareTradeToChat(tradeId) {
  if (!STATE.trader) return toast('Please log in to share trades', 'error');
  const t = STATE.trades.find(x => x.id === tradeId);
  if (!t) return;

  // Build formatted trade message
  const spot = getTradeSpot(t);
  const dir = t.direction === 'BUY' ? 1 : -1;
  const mtm = t.status === 'OPEN' ? ((spot - parseFloat(t.entryPrice)) * parseFloat(t.volume) * dir) : parseFloat(t.realizedPnl || 0);
  const mtmStr = (mtm >= 0 ? '+' : '') + '$' + Math.abs(mtm).toLocaleString(undefined, {maximumFractionDigits: 0});
  const statusLabel = t.status === 'OPEN' ? `OPEN | Spot: $${spot.toFixed(3)} | MTM: ${mtmStr}` : `CLOSED @ $${parseFloat(t.closePrice||0).toFixed(3)} | P&L: ${mtmStr}`;
  const msg = `📊 ${t.direction} ${parseFloat(t.volume).toLocaleString()} ${t.hub} @ $${parseFloat(t.entryPrice).toFixed(3)} [${t.type}] — ${statusLabel}${t.notes ? ' | ' + t.notes : ''}`;

  // Load conversations
  let convos = [];
  try {
    const r = await fetch(API_BASE + '/api/chat/conversations/' + encodeURIComponent(STATE.trader.trader_name));
    const d = await r.json();
    if (d.success) convos = (d.conversations || []).filter(c => c.type !== 'system' && c.type !== 'admin_inbox');
  } catch(e) {}

  if (!convos.length) {
    toast('No conversations to share to. Open chat to start one.', 'info');
    return;
  }

  // Show picker
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9000;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;min-width:300px;max-width:420px;width:90%">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">Share Trade to Chat</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;font-family:monospace;padding:8px;background:var(--surface2);border-radius:6px;word-break:break-all">${msg}</div>
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:8px">Select a conversation:</div>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
        ${convos.map(c => {
          const name = c.type === 'dm' ? (c.members||[]).filter(m => m !== STATE.trader.trader_name).join(', ') || c.name : c.name;
          return `<div style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''" onclick="doShareToChat(${c.id})" data-convo-id="${c.id}">
            <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--text-dim)">${c.type==='dm'?'DM':c.type.toUpperCase()}</span>
            <span style="font-weight:600">${name}</span>
          </div>`;
        }).join('')}
      </div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" onclick="this.closest('[data-overlay-root]').remove()">Cancel</button>
      </div>
    </div>`;
  overlay.setAttribute('data-overlay-root', '1');
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  // Store msg for the share handler
  overlay._shareMsg = msg;
  window._shareOverlay = overlay;
  document.body.appendChild(overlay);
}

async function doShareToChat(convId) {
  if (!STATE.trader) return;
  const msg = window._shareOverlay ? window._shareOverlay._shareMsg : '';
  if (!msg) return;
  try {
    await fetch(API_BASE + '/api/chat/send/' + convId, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({sender: STATE.trader.trader_name, text: msg})
    });
    toast('Trade shared to chat', 'success');
  } catch(e) { toast('Failed to share trade', 'error'); }
  if (window._shareOverlay) { window._shareOverlay.remove(); window._shareOverlay = null; }
}

function flatAll() {
  const open = STATE.trades.filter(t => t.status === 'OPEN');
  if (!open.length) return toast('No open positions to close', 'info');
  if (!confirm(`Close all ${open.length} open position(s) at market price?`)) return;
  let totalPnl = 0;
  open.forEach(t => {
    const cp = getTradeSpot(t);
    if ((!cp && cp !== 0) || isNaN(cp)) return;
    const dir = t.direction === 'BUY' ? 1 : -1;
    const ep = parseFloat(t.entryPrice);
    const vol = parseFloat(t.volume);
    if (isNaN(ep) || isNaN(vol)) return;
    const pnl = (cp - ep) * vol * dir;
    t.status = 'CLOSED';
    t.closePrice = cp;
    t.realizedPnl = pnl;
    t.closedAt = new Date().toISOString();
    t.closeReason = 'FLAT_ALL';
    totalPnl += pnl;
    if (STATE.connected && STATE.trader) {
      fetch(API_BASE + '/api/trades/' + STATE.trader.trader_name + '/' + t.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED', closePrice: cp, realizedPnl: pnl, spotRef: cp, closeReason: 'FLAT_ALL' })
      }).catch(() => {});
    }
  });
  localStorage.setItem(traderStorageKey('trades'), JSON.stringify(STATE.trades));
  playSound('trade');
  toast(`Flattened ${open.length} position(s). Net P&L: ${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toLocaleString(undefined, {maximumFractionDigits:0})}`, totalPnl >= 0 ? 'success' : 'error');
  renderBlotterPage();
}

function exportTradesCSV() {
  const trades = STATE.trades;
  if (!trades.length) return toast('No trades to export', 'info');
  const headers = ['Date','Type','Direction','Hub','Volume','Entry Price','Close Price','Status','Realized P&L','MTM P&L','Sector','Delivery','Counterparty','Venue','Notes'];
  const rows = trades.map(t => {
    const spot = (typeof getTradeSpot === 'function') ? getTradeSpot(t) : getPrice(t.hub);
    const dir = t.direction === 'BUY' ? 1 : -1;
    const mtm = t.status === 'OPEN' ? ((spot - parseFloat(t.entryPrice)) * parseFloat(t.volume) * dir) : '';
    return [
      new Date(t.timestamp || t.server_created_at || Date.now()).toISOString(),
      t.type || '',
      t.direction || '',
      t.hub || '',
      t.volume || '',
      t.entryPrice || '',
      t.closePrice || '',
      t.status || '',
      t.status === 'CLOSED' ? (t.realizedPnl || 0) : '',
      t.status === 'OPEN' ? mtm.toFixed(2) : '',
      t.sector || '',
      t.deliveryMonth || '',
      t.counterparty || '',
      t.venue || '',
      (t.notes || '').replace(/"/g, '""')
    ].map(v => `"${v}"`).join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const traderName = STATE.trader ? STATE.trader.trader_name : 'trades';
  a.href = url;
  a.download = `${traderName}_trades_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Exported ${trades.length} trades to CSV`, 'success');
}

// Keyboard shortcuts for blotter
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if (STATE.currentPage === 'blotter') {
    if (e.key.toLowerCase() === 'b') { e.preventDefault(); setDirection('BUY'); }
    if (e.key.toLowerCase() === 's') { e.preventDefault(); setDirection('SELL'); }
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); setDirection(tradeDirection === 'BUY' ? 'SELL' : 'BUY'); }
    if (e.key === 'Enter') { e.preventDefault(); submitTrade(); }
  }
});

