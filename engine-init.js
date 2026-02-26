/* =====================================================================
   ORDER TYPE UI
   ===================================================================== */
function onOrderTypeChange() {
  const orderType = document.getElementById('tradeOrderType').value;
  document.getElementById('limitPriceGroup').style.display = ['LIMIT','STOP_LIMIT'].includes(orderType) ? 'block' : 'none';
  document.getElementById('stopPriceGroup').style.display = ['STOP','STOP_LIMIT'].includes(orderType) ? 'block' : 'none';
  // Hint update
  const hint = document.getElementById('tradeFormHint');
  if (orderType === 'LIMIT') hint.textContent = 'Order fills when price reaches your limit';
  else if (orderType === 'STOP') hint.textContent = 'Order triggers when price hits stop level';
  else if (orderType === 'STOP_LIMIT') hint.textContent = 'Stop triggers, then limit order placed';
  else hint.textContent = '';
}

function cancelPendingOrder(pendingId) {
  if (!confirm('Cancel this pending order?')) return;
  STATE.pendingOrders = STATE.pendingOrders.filter(o => o._pendingId !== pendingId);
  localStorage.setItem(traderStorageKey('pending_orders'), JSON.stringify(STATE.pendingOrders));
  toast('Pending order cancelled', 'info');
  renderBlotterPage();
}

/* =====================================================================
   PENDING ORDER & STOP-LOSS ENGINE (runs every price tick)
   ===================================================================== */
function processPendingOrders() {
  const now = new Date();
  let filled = false;

  STATE.pendingOrders = STATE.pendingOrders.filter(order => {
    const spot = getPrice(order.hub);
    if (!spot) return true;

    // Check TIF expiry: DAY orders expire at 17:00 CT (simulated as 8 hours from creation)
    if (order.tif === 'DAY') {
      const created = new Date(order.createdAt);
      if (now - created > 8 * 3600000) {
        addNotification('order', 'Order Expired', `${order.orderType} ${order.direction} ${order.hub} expired (DAY order)`);
        return false; // remove
      }
    }

    // IOC orders: should have been filled immediately or cancelled — remove if still here
    if (order.tif === 'IOC') {
      addNotification('order', 'Order Cancelled', `IOC order ${order.direction} ${order.hub} — not immediately fillable`);
      return false;
    }

    let shouldFill = false;
    let fillPrice = spot;

    if (order.orderType === 'LIMIT') {
      if (order.direction === 'BUY' && spot <= order.limitPrice) { shouldFill = true; fillPrice = order.limitPrice; }
      if (order.direction === 'SELL' && spot >= order.limitPrice) { shouldFill = true; fillPrice = order.limitPrice; }
    } else if (order.orderType === 'STOP') {
      if (order.direction === 'BUY' && spot >= order.stopPrice) { shouldFill = true; fillPrice = spot; }
      if (order.direction === 'SELL' && spot <= order.stopPrice) { shouldFill = true; fillPrice = spot; }
    } else if (order.orderType === 'STOP_LIMIT') {
      // Stop triggered?
      if (!order._stopTriggered) {
        if (order.direction === 'BUY' && spot >= order.stopPrice) order._stopTriggered = true;
        if (order.direction === 'SELL' && spot <= order.stopPrice) order._stopTriggered = true;
        if (order._stopTriggered) addNotification('order', 'Stop Triggered', `${order.direction} ${order.hub} — limit order now active at $${order.limitPrice.toFixed(3)}`);
      }
      // If triggered, check limit
      if (order._stopTriggered) {
        if (order.direction === 'BUY' && spot <= order.limitPrice) { shouldFill = true; fillPrice = order.limitPrice; }
        if (order.direction === 'SELL' && spot >= order.limitPrice) { shouldFill = true; fillPrice = order.limitPrice; }
      }
    }

    if (shouldFill) {
      // Convert to live trade
      const trade = {
        ...order,
        entryPrice: fillPrice,
        spotRef: spot,
        status: 'OPEN',
        id: Date.now() + Math.floor(Math.random()*1000),
        timestamp: new Date().toISOString(),
      };
      delete trade._pendingId;
      delete trade._pending;
      delete trade._stopTriggered;
      delete trade.createdAt;
      STATE.trades.unshift(trade);
      filled = true;

      playSound('trade');
      addNotification('order', 'Order Filled', `${order.orderType} ${order.direction} ${parseFloat(order.volume).toLocaleString()} ${order.hub} filled @ $${fillPrice.toFixed(4)}`);
      toast(`${order.orderType} order filled: ${order.direction} ${order.hub} @ $${fillPrice.toFixed(4)}`, 'success');

      // Submit to server if connected
      if (STATE.connected && STATE.trader) {
        fetch(API_BASE + '/api/trades/' + STATE.trader.trader_name, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trade)
        }).catch(() => {});
      }

      return false; // remove from pending
    }
    return true; // keep
  });

  if (filled) {
    localStorage.setItem(traderStorageKey('trades'), JSON.stringify(STATE.trades));
    localStorage.setItem(traderStorageKey('pending_orders'), JSON.stringify(STATE.pendingOrders));
  }
}

function processStopLossTargets() {
  let changed = false;
  STATE.trades.forEach(t => {
    if (t.status !== 'OPEN') return;
    const spot = getPrice(t.hub);
    if (!spot) return;
    const dir = t.direction === 'BUY' ? 1 : -1;

    // Stop loss
    if (t.stopLoss) {
      const sl = parseFloat(t.stopLoss);
      if ((dir === 1 && spot <= sl) || (dir === -1 && spot >= sl)) {
        const pnl = (spot - parseFloat(t.entryPrice)) * parseFloat(t.volume) * dir;
        t.status = 'CLOSED';
        t.closePrice = spot;
        t.realizedPnl = pnl;
        t.closedAt = new Date().toISOString();
        t.closeReason = 'STOP_LOSS';
        changed = true;
        addNotification('position', 'Stop Loss Hit', `${t.direction} ${t.hub} closed at $${spot.toFixed(4)} — P&L: ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toLocaleString(undefined,{maximumFractionDigits:0})}`);
        toast(`Stop loss triggered: ${t.hub} closed at $${spot.toFixed(4)}`, pnl >= 0 ? 'success' : 'error');
        playSound('alert');
        // Server update
        if (STATE.connected && STATE.trader && t.id) {
          fetch(API_BASE + '/api/trades/' + STATE.trader.trader_name + '/' + t.id, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CLOSED', closePrice: spot, realizedPnl: pnl, spotRef: spot })
          }).catch(() => {});
        }
      }
    }

    // Target exit
    if (t.targetExit && t.status === 'OPEN') {
      const te = parseFloat(t.targetExit);
      if ((dir === 1 && spot >= te) || (dir === -1 && spot <= te)) {
        const pnl = (spot - parseFloat(t.entryPrice)) * parseFloat(t.volume) * dir;
        t.status = 'CLOSED';
        t.closePrice = spot;
        t.realizedPnl = pnl;
        t.closedAt = new Date().toISOString();
        t.closeReason = 'TARGET';
        changed = true;
        addNotification('position', 'Target Hit', `${t.direction} ${t.hub} target reached at $${spot.toFixed(4)} — P&L: +$${Math.abs(pnl).toLocaleString(undefined,{maximumFractionDigits:0})}`);
        toast(`Target reached: ${t.hub} closed at $${spot.toFixed(4)}`, 'success');
        playSound('trade');
        if (STATE.connected && STATE.trader && t.id) {
          fetch(API_BASE + '/api/trades/' + STATE.trader.trader_name + '/' + t.id, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CLOSED', closePrice: spot, realizedPnl: pnl, spotRef: spot })
          }).catch(() => {});
        }
      }
    }
  });

  if (changed) localStorage.setItem(traderStorageKey('trades'), JSON.stringify(STATE.trades));
}

/* =====================================================================
   PRICE & POSITION ALERTS ENGINE
   ===================================================================== */
function openAlertModal() {
  document.getElementById('alertModal').classList.add('active');
  populateAlertHubDropdown();
  renderActiveAlerts();
}
function closeAlertModal() { document.getElementById('alertModal').classList.remove('active'); }

function onAlertTypeChange() {
  const t = document.getElementById('alertType').value;
  document.getElementById('alertHubGroup').style.display = t.startsWith('price') ? 'block' : (t === 'pnl_threshold' ? 'none' : 'none');
  document.getElementById('alertValueGroup').style.display = t === 'calendar' ? 'none' : 'block';
  const label = document.getElementById('alertValueGroup').querySelector('label');
  if (t === 'pnl_threshold') label.textContent = 'P&L Threshold ($)';
  else label.textContent = 'Price / Value';
}

function populateAlertHubDropdown() {
  const sel = document.getElementById('alertHub');
  sel.innerHTML = '';
  for (const hubs of Object.values(ALL_HUB_SETS)) {
    hubs.forEach(h => { sel.innerHTML += `<option value="${h.name}">${h.name}</option>`; });
  }
}

function createAlert() {
  const alertType = document.getElementById('alertType').value;
  const hub = document.getElementById('alertHub').value;
  const value = parseFloat(document.getElementById('alertValue').value);

  if (alertType !== 'calendar' && !value && value !== 0) return toast('Enter a value', 'error');

  const alert = {
    id: 'alert_' + Date.now(),
    type: alertType,
    hub: alertType.startsWith('price') ? hub : null,
    value: value || 0,
    enabled: true,
    triggered: false,
    createdAt: new Date().toISOString(),
  };

  STATE.alerts.push(alert);
  localStorage.setItem(traderStorageKey('alerts'), JSON.stringify(STATE.alerts));
  toast('Alert created', 'success');
  document.getElementById('alertValue').value = '';
  renderActiveAlerts();
}

function removeAlert(id) {
  STATE.alerts = STATE.alerts.filter(a => a.id !== id);
  localStorage.setItem(traderStorageKey('alerts'), JSON.stringify(STATE.alerts));
  renderActiveAlerts();
}

function renderActiveAlerts() {
  const list = document.getElementById('activeAlertsList');
  if (!STATE.alerts.length) {
    list.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:8px 0">No active alerts</div>';
    return;
  }
  list.innerHTML = '<div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-dim)">Active Alerts (' + STATE.alerts.length + ')</div>' +
    STATE.alerts.map(a => {
      let desc;
      if (a.type === 'price_cross') desc = `${a.hub} crosses $${a.value.toFixed(2)}`;
      else if (a.type === 'price_above') desc = `${a.hub} above $${a.value.toFixed(2)}`;
      else if (a.type === 'price_below') desc = `${a.hub} below $${a.value.toFixed(2)}`;
      else if (a.type === 'pnl_threshold') desc = `Unrealized P&L exceeds $${Math.abs(a.value).toLocaleString()}`;
      else if (a.type === 'calendar') desc = `Calendar events (1hr warning)`;
      else desc = a.type;
      return `<div class="alert-row">
        <div class="alert-info">${desc}${a.triggered ? ' <span style="color:var(--green);font-size:10px">✓ triggered</span>' : ''}</div>
        <button class="alert-remove" onclick="removeAlert('${a.id}')">✕</button>
      </div>`;
    }).join('');
}

function checkAlerts() {
  // Compute total unrealized
  let totalUnrealized = 0;
  STATE.trades.forEach(t => {
    if (t.status !== 'OPEN') return;
    const spot = getPrice(t.hub);
    if (!spot) return;
    const dir = t.direction === 'BUY' ? 1 : -1;
    totalUnrealized += (spot - parseFloat(t.entryPrice)) * parseFloat(t.volume) * dir;
  });

  STATE.alerts.forEach(alert => {
    if (!alert.enabled || alert.triggered) return;

    if (alert.type === 'price_cross') {
      const spot = getPrice(alert.hub);
      if (!spot || !alert._lastPrice) { alert._lastPrice = spot; return; }
      if ((alert._lastPrice < alert.value && spot >= alert.value) || (alert._lastPrice > alert.value && spot <= alert.value)) {
        alert.triggered = true;
        addNotification('price', 'Price Alert', `${alert.hub} crossed $${alert.value.toFixed(4)} — now at $${spot.toFixed(4)}`);
        playSound('alert');
      }
      alert._lastPrice = spot;
    }
    else if (alert.type === 'price_above') {
      const spot = getPrice(alert.hub);
      if (spot && spot > alert.value) {
        alert.triggered = true;
        addNotification('price', 'Price Alert', `${alert.hub} above $${alert.value.toFixed(4)} — now $${spot.toFixed(4)}`);
        playSound('alert');
      }
    }
    else if (alert.type === 'price_below') {
      const spot = getPrice(alert.hub);
      if (spot && spot < alert.value) {
        alert.triggered = true;
        addNotification('price', 'Price Alert', `${alert.hub} below $${alert.value.toFixed(4)} — now $${spot.toFixed(4)}`);
        playSound('alert');
      }
    }
    else if (alert.type === 'pnl_threshold') {
      if (Math.abs(totalUnrealized) > Math.abs(alert.value)) {
        alert.triggered = true;
        const sign = totalUnrealized >= 0 ? '+' : '-';
        addNotification('position', 'P&L Alert', `Unrealized P&L ${sign}$${Math.abs(totalUnrealized).toLocaleString(undefined,{maximumFractionDigits:0})} exceeds threshold of $${Math.abs(alert.value).toLocaleString()}`);
        playSound('alert');
      }
    }
  });

  localStorage.setItem(traderStorageKey('alerts'), JSON.stringify(STATE.alerts));
}

function checkCalendarAlerts() {
  if (!STATE.calendarAlertsEnabled) return;
  const now = Date.now();
  if (now - STATE.lastCalendarCheck < 300000) return; // check every 5 min max
  STATE.lastCalendarCheck = now;

  const sectors = ['ng','crude','power','freight','ag','metals'];
  const nowDate = new Date();

  sectors.forEach(sector => {
    const events = CALENDAR_EVENTS[sector] || [];
    events.forEach(ev => {
      let daysAway;
      if (ev.recurring && ev.dayOfWeek !== undefined) {
        const today = nowDate.getDay();
        daysAway = (ev.dayOfWeek - today + 7) % 7;
      } else if (ev.monthDay !== undefined) {
        const thisMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), ev.monthDay);
        daysAway = thisMonth >= nowDate ? Math.ceil((thisMonth - nowDate) / 86400000) : Math.ceil((new Date(nowDate.getFullYear(), nowDate.getMonth()+1, ev.monthDay) - nowDate) / 86400000);
      } else return;

      // Alert if event is within ~1 hour (0 days away and we haven't alerted yet)
      if (daysAway === 0) {
        const alertKey = 'calAlerted_' + ev.name + '_' + nowDate.toDateString();
        if (!sessionStorage.getItem(alertKey)) {
          sessionStorage.setItem(alertKey, '1');
          addNotification('calendar', 'Event Today', `${ev.name} (${ev.impact} impact) — happening today`);
        }
      } else if (daysAway === 1) {
        const alertKey = 'calAlerted_tmrw_' + ev.name + '_' + nowDate.toDateString();
        if (!sessionStorage.getItem(alertKey)) {
          sessionStorage.setItem(alertKey, '1');
          addNotification('calendar', 'Event Tomorrow', `${ev.name} (${ev.impact} impact) — tomorrow`);
        }
      }
    });
  });
}

/* =====================================================================
   NOTIFICATION SYSTEM
   ===================================================================== */
function addNotification(type, title, desc) {
  const notif = {
    id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
    type, // 'price', 'calendar', 'position', 'order'
    title,
    desc,
    time: new Date().toISOString(),
    read: false,
  };
  STATE.notifications.unshift(notif);
  if (STATE.notifications.length > 100) STATE.notifications = STATE.notifications.slice(0, 100);
  localStorage.setItem(traderStorageKey('notifications'), JSON.stringify(STATE.notifications));
  updateNotifBadge();
  renderNotifPanel();
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    // Mark all as read
    STATE.notifications.forEach(n => n.read = true);
    localStorage.setItem(traderStorageKey('notifications'), JSON.stringify(STATE.notifications));
    updateNotifBadge();
    renderNotifPanel();
  }
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  const unread = STATE.notifications.filter(n => !n.read).length;
  badge.textContent = unread > 0 ? (unread > 99 ? '99+' : unread) : '';
  badge.setAttribute('data-count', unread);
}

function renderNotifPanel() {
  const body = document.getElementById('notifBody');
  if (!STATE.notifications.length) {
    body.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }
  body.innerHTML = STATE.notifications.slice(0, 50).map(n => {
    const iconClass = n.type === 'price' ? 'price' : n.type === 'calendar' ? 'calendar' : n.type === 'order' ? 'order' : n.type === 'broadcast-urgent' ? 'broadcast-urgent' : n.type === 'broadcast' ? 'broadcast' : 'position';
    const iconSymbol = n.type === 'price' ? '📈' : n.type === 'calendar' ? '📅' : n.type === 'order' ? '✓' : (n.type === 'broadcast' || n.type === 'broadcast-urgent') ? '📡' : '⚠';
    const ago = formatTimeAgo(n.time);
    return `<div class="notif-item ${n.read ? '' : 'unread'}">
      <div class="notif-icon ${iconClass}">${iconSymbol}</div>
      <div class="notif-content">
        <div class="notif-title">${n.title}</div>
        <div class="notif-desc">${n.desc}</div>
        <div class="notif-time">${ago}</div>
      </div>
    </div>`;
  }).join('');
}

function formatTimeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

function clearNotifications() {
  STATE.notifications = [];
  localStorage.setItem(traderStorageKey('notifications'), JSON.stringify(STATE.notifications));
  updateNotifBadge();
  renderNotifPanel();
}

// Close notif panel when clicking outside
document.addEventListener('click', e => {
  const panel = document.getElementById('notifPanel');
  const bell = document.getElementById('notifBell');
  if (panel && panel.classList.contains('open') && !panel.contains(e.target) && !bell.contains(e.target)) {
    panel.classList.remove('open');
  }
  // Close alert modal on outside click
  const alertModal = document.getElementById('alertModal');
  const alertBox = alertModal ? alertModal.querySelector('.alert-modal-box') : null;
  if (alertModal && alertModal.classList.contains('active') && alertBox && !alertBox.contains(e.target)) {
    closeAlertModal();
  }
});

/* =====================================================================
   TICK INTEGRATION — run engines on every price update
   ===================================================================== */
function runTickEngines() {
  processPendingOrders();
  processStopLossTargets();
  checkAlerts();
  checkCalendarAlerts();
}


/* =====================================================================
   INIT — STARTUP
   ===================================================================== */
try {
  console.log('Energy Desk v3.5 — initializing...');
  // Re-apply theme now that renderCurrentPage is available
  setTheme(localStorage.getItem('ng_theme') || 'dark');
  initPrices();
  initLogos();
  checkRegistration();
  initClock();
  setInterval(tickPrices, 8000);
  setInterval(runTickEngines, 8000);  // Process pending orders, stop-losses, alerts on each tick
  updateNotifBadge();  // Initialize notification badge
  setInterval(fetchLiveNews, 900000);
  setInterval(fetchTradeFeed, 60000);
  fetchTradeFeed();
  setInterval(()=>{
    if(STATE.trader&&STATE.trader.trader_name){
      fetch(API_BASE+'/api/traders/heartbeat/'+encodeURIComponent(STATE.trader.trader_name),{method:'POST'}).catch(()=>{});
    }
  }, 60000);
  renderCurrentPage();
  renderNewsTicker();
  // Fetch EIA & COT data (non-blocking)
  fetchEiaData();
  fetchCotData();
  // Refresh EIA every hour, COT every 2 hours
  setInterval(fetchEiaData, 3600000);
  setInterval(fetchCotData, 7200000);
  // Weather: fetch on load, refresh every 5 minutes
  fetchWeather(true);
  setInterval(() => fetchWeather(false), WX_FETCH_INTERVAL);
} catch(e) { console.error('INIT error:', e); }

function postLoginInit() {
  try {
    loadOtcCounterparties();
    loadOtcStatus();
    initChat();
    loadRecentBroadcasts();
    document.getElementById('chatTab').style.display = 'none';
    var hcb = document.getElementById('headerChatBtn'); if(hcb) hcb.style.display = 'flex';
    document.getElementById('tradeFeedBar').style.display = 'flex';
  } catch(e) { console.warn('postLoginInit error:', e); }
}

async function loadRecentBroadcasts() {
  try {
    const r = await fetch('/api/broadcasts?limit=10');
    const d = await r.json();
    if (d.success && d.broadcasts) {
      // Add any broadcasts from the last 24 hours that aren't already in notifications
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const existingIds = new Set(STATE.notifications.filter(n => n.broadcastId).map(n => n.broadcastId));
      d.broadcasts.forEach(b => {
        const ts = new Date(b.created_at + 'Z').getTime();
        if (ts > cutoff && !existingIds.has(b.id)) {
          const isUrgent = b.priority === 'urgent';
          const title = isUrgent ? '🔴 URGENT: ' + (b.subject || 'Admin Broadcast') : (b.subject || '📡 Admin Broadcast');
          const notif = {
            id: 'b_' + b.id,
            broadcastId: b.id,
            type: isUrgent ? 'broadcast-urgent' : 'broadcast',
            title: title,
            desc: b.body,
            time: b.created_at + 'Z',
            read: false,
          };
          STATE.notifications.unshift(notif);
        }
      });
      // Sort by time descending
      STATE.notifications.sort((a, b) => new Date(b.time) - new Date(a.time));
      if (STATE.notifications.length > 100) STATE.notifications = STATE.notifications.slice(0, 100);
      localStorage.setItem(traderStorageKey('notifications'), JSON.stringify(STATE.notifications));
      updateNotifBadge();
      renderNotifPanel();
    }
  } catch(e) {}
}

