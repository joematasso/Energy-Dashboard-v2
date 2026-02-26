function renderBlotterTable() {
  let trades = [...STATE.trades, ...STATE.pendingOrders.map(o => ({...o, _pending: true}))];
  const search = (document.getElementById('blotterSearch').value || '').toLowerCase();
  if (search) {
    trades = trades.filter(t =>
      (t.hub||'').toLowerCase().includes(search) ||
      (t.type||'').toLowerCase().includes(search) ||
      (t.notes||'').toLowerCase().includes(search) ||
      (t.counterparty||'').toLowerCase().includes(search)
    );
  }

  document.getElementById('blotterCount').textContent = trades.length + ' trades' + (STATE.pendingOrders.length ? ` (${STATE.pendingOrders.length} pending)` : '');

  // Pagination
  const totalPages = Math.max(1, Math.ceil(trades.length / BLOTTER_PAGE_SIZE));
  if (blotterPage >= totalPages) blotterPage = totalPages - 1;
  const start = blotterPage * BLOTTER_PAGE_SIZE;
  const pageTrades = trades.slice(start, start + BLOTTER_PAGE_SIZE);

  const tbody = document.getElementById('blotterBody');
  tbody.innerHTML = pageTrades.map(t => {
    const spot = getPrice(t.hub);
    const dir = t.direction === 'BUY' ? 1 : -1;
    const vol = parseFloat(t.volume || 0);
    const entry = parseFloat(t.entryPrice || 0);
    let mtm = 0;
    if (t._pending) mtm = 0;
    else if (t.status === 'OPEN') {
      if (t.type === 'BASIS_SWAP') {
        mtm = (spot - entry) * vol * dir;
      } else {
        mtm = (spot - entry) * vol * dir;
      }
    }
    else mtm = parseFloat(t.realizedPnl || 0);

    const mtmColor = mtm >= 0 ? 'green' : 'red';
    const dirColor = t.direction === 'BUY' ? 'color:var(--green)' : 'color:var(--red)';

    // Order type badge
    const orderType = t.orderType || 'MARKET';
    const tif = t.tif || 'DAY';
    let orderBadge;
    if (t._pending) {
      const triggerPrice = t.limitPrice || t.stopPrice || '—';
      orderBadge = `<span class="order-badge pending">${orderType}</span><br><span style="font-size:10px;color:var(--text-muted)">@${parseFloat(triggerPrice).toFixed(3)} ${tif}</span>`;
    } else if (orderType === 'MARKET') {
      orderBadge = `<span style="font-size:11px;color:var(--text-muted)">MKT</span>`;
    } else {
      orderBadge = `<span class="order-badge filled">${orderType}</span>`;
    }

    let statusBadge;
    if (t._pending) {
      statusBadge = '<span class="badge" style="background:rgba(139,92,246,0.15);color:#8b5cf6">PENDING</span>';
    } else if (t.status === 'OPEN') {
      statusBadge = '<span class="badge" style="background:rgba(34,211,238,0.15);color:var(--accent)">OPEN</span>';
    } else {
      statusBadge = '<span class="badge" style="background:rgba(148,163,184,0.15);color:var(--text-dim)">CLOSED</span>';
    }

    // Row tint
    const rowBg = t._pending ? 'background:rgba(139,92,246,0.03)' : (t.status === 'OPEN' ? (mtm >= 0 ? 'background:rgba(16,185,129,0.03)' : 'background:rgba(239,68,68,0.03)') : '');

    // Check 1-hour delete window
    const created = new Date(t.timestamp || t.server_created_at || Date.now());
    const canDelete = (Date.now() - created.getTime()) < 3600000;

    const dateStr = new Date(t.timestamp || Date.now()).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const isLarge = (t.hub||'').includes('Baltic') || (t.hub||'').includes('Index');

    let actions = '';
    if (t._pending) {
      actions += `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="cancelPendingOrder('${t._pendingId}')">Cancel</button>`;
    } else {
      if (t.status === 'OPEN') actions += `<button class="btn btn-ghost btn-sm" onclick="closeTrade(${t.id})">Close</button>`;
      if (canDelete) actions += `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteTrade(${t.id})">Delete</button>`;
      else if (t.status === 'OPEN') actions += `<span style="font-size:10px;color:var(--text-muted)" title="Admin required after 1hr">Locked</span>`;
      actions += `<button class="btn btn-ghost btn-sm" onclick="cloneTrade(${t.id})">Clone</button>`;
    }

    return `<tr style="${rowBg}">
      <td style="font-size:12px;white-space:nowrap">${dateStr}</td>
      <td style="font-size:11px">${t.type}</td>
      <td style="${dirColor};font-weight:700">${t.direction}</td>
      <td>${t.hub}</td>
      <td class="mono">${parseFloat(t.volume).toLocaleString()}</td>
      <td class="mono">${isLarge ? entry.toFixed(0) : entry.toFixed(3)}</td>
      <td class="mono">${isLarge ? spot.toFixed(0) : spot.toFixed(3)}</td>
      <td>${orderBadge}</td>
      <td class="mono ${mtmColor}" style="font-weight:600">${t._pending ? '—' : (mtm>=0?'+':'') + '$' + Math.abs(mtm).toLocaleString(undefined,{maximumFractionDigits:0})}</td>
      <td>${statusBadge}</td>
      <td><div class="actions-cell">${actions}</div></td>
    </tr>`;
  }).join('');

  if (!pageTrades.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:30px">No trades yet. Use the form above to place your first trade.</td></tr>';
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
  const cp = getPrice(t.hub);
  if (!cp && cp !== 0) return toast('No market price available for ' + t.hub, 'error');
  const isBasis = t.type === 'BASIS_SWAP';
  if (!isBasis && cp <= 0) return toast('No market price available for ' + t.hub, 'error');
  const isOtc = t.venue === 'OTC' && (t.counterpartyTrader || t.otcMirrorOf);
  const confirmMsg = isOtc
    ? 'Close OTC trade at market price $' + cp.toFixed(4) + '? (Mirror position will also close)'
    : 'Close at market price $' + cp.toFixed(4) + '?';
  if (!confirm(confirmMsg)) return;

  const dir = t.direction === 'BUY' ? 1 : -1;
  let pnl;
  if (isBasis) {
    // Basis P&L = change in differential × volume
    pnl = (cp - parseFloat(t.entryPrice)) * parseFloat(t.volume) * dir;
  } else {
    pnl = (cp - parseFloat(t.entryPrice)) * parseFloat(t.volume) * dir;
  }
  t.status = 'CLOSED';
  t.closePrice = cp;
  t.realizedPnl = pnl;
  t.closedAt = new Date().toISOString();
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
        body: JSON.stringify({ status: 'CLOSED', closePrice: cp, realizedPnl: pnl, spotRef: cp })
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
    document.getElementById('tradeSpot').value = getPrice(t.hub).toFixed(4);
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
    ctx.font = '13px IBM Plex Sans';
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
  ctx.font = '11px IBM Plex Mono';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = min + (range * i / 4);
    const y = padT + (1 - i / 4) * cH;
    ctx.fillText('$' + val.toFixed(0), padL - 8, y + 4);
  }

  // X-axis date labels
  ctx.fillStyle = textColor;
  ctx.font = '10px IBM Plex Mono';
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
    ctx.font = '12px IBM Plex Mono';
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
    ctx.font = '10px IBM Plex Mono';
    const dtw = ctx.measureText(dateStr).width + 10;
    ctx.fillStyle = 'rgba(15,21,32,0.92)';
    ctx.fillRect(snapX - dtw / 2, padT + cH + 2, dtw, 18);
    ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center';
    ctx.fillText(dateStr, snapX, padT + cH + 14);
    ctx.restore();
  });

  canvas.addEventListener('mouseleave', () => { if (canvas._pnlMeta) drawPnlChart(); });
}

// Keyboard shortcuts for blotter
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if (STATE.currentPage === 'blotter') {
    if (e.key.toLowerCase() === 'b') { e.preventDefault(); setDirection('BUY'); }
    if (e.key.toLowerCase() === 's') { e.preventDefault(); setDirection('SELL'); }
    if (e.key === 'Enter') { e.preventDefault(); submitTrade(); }
  }
});

