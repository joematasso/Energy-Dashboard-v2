/* =====================================================================
   CLOCK, MARKET STATUS & CALENDAR
   ===================================================================== */
let MARKET_HOLIDAYS = new Set();
let MARKET_OPEN = true;
let MARKET_REASON = 'Open';

const TRADING_TIMEZONES = [
  { id:'America/New_York',   name:'New York (ET)',    abbr:'ET',  market:'NYMEX / ICE' },
  { id:'America/Chicago',    name:'Chicago (CT)',     abbr:'CT',  market:'CME / CBOT' },
  { id:'America/Denver',     name:'Denver (MT)',      abbr:'MT',  market:'Rockies Gas' },
  { id:'America/Los_Angeles',name:'Los Angeles (PT)', abbr:'PT',  market:'CAISO / ICE West' },
  { id:'America/Chicago_HOU', name:'Houston (CT)',     abbr:'CT',  market:'Physical Energy', iana:'America/Chicago' },
  { id:'Europe/London',      name:'London (GMT/BST)', abbr:'LDN', market:'ICE Brent / LME' },
  { id:'Europe/Berlin',      name:'Frankfurt (CET)',  abbr:'CET', market:'EEX Power' },
  { id:'Asia/Singapore',     name:'Singapore (SGT)',  abbr:'SGT', market:'SGX / Platts' },
  { id:'Asia/Tokyo',         name:'Tokyo (JST)',      abbr:'JST', market:'TOCOM / JKM' },
  { id:'Asia/Dubai',         name:'Dubai (GST)',      abbr:'GST', market:'DME Oman Crude' },
];

let selectedTzId = localStorage.getItem('ng_timezone') || 'America/Chicago';
if (selectedTzId === 'America/Houston') { selectedTzId = 'America/Chicago_HOU'; localStorage.setItem('ng_timezone', selectedTzId); }

function getSelectedTz() {
  return TRADING_TIMEZONES.find(tz => tz.id === selectedTzId) || TRADING_TIMEZONES[1];
}

function updateClock() {
  const now = new Date();
  const tz = getSelectedTz();
  const tzId = tz.iana || tz.id;
  const opts = { timeZone: tzId, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false };
  const timeStr = now.toLocaleTimeString('en-US', opts);
  const dateStr = now.toLocaleDateString('en-US', { timeZone: tzId, weekday:'short', month:'short', day:'numeric' });
  const el = document.getElementById('clockTime');
  if (el) el.textContent = timeStr;
  const dateEl = document.getElementById('clockDate');
  if (dateEl) dateEl.textContent = dateStr;
  const labelEl = document.getElementById('clockTzLabel');
  if (labelEl) labelEl.textContent = tz.abbr;
}

function toggleTzPicker() {
  const popup = document.getElementById('tzPopup');
  if (popup.classList.contains('show')) {
    popup.classList.remove('show');
    return;
  }
  renderTzPicker();
  popup.classList.add('show');
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', closeTzPickerOutside, { once: true, capture: true });
  }, 0);
}

function closeTzPickerOutside(e) {
  const popup = document.getElementById('tzPopup');
  if (!popup.contains(e.target) && !e.target.closest('#clockTime') && !e.target.closest('#clockTzLabel')) {
    popup.classList.remove('show');
  } else if (popup.classList.contains('show')) {
    setTimeout(() => {
      document.addEventListener('click', closeTzPickerOutside, { once: true, capture: true });
    }, 0);
  }
}

function renderTzPicker() {
  const popup = document.getElementById('tzPopup');
  const now = new Date();
  let html = '<div class="tz-popup-title">Trading Timezones</div><div class="tz-grid">';
  for (const tz of TRADING_TIMEZONES) {
    const isActive = tz.id === selectedTzId;
    const liveTime = now.toLocaleTimeString('en-US', { timeZone: tz.iana || tz.id, hour:'2-digit', minute:'2-digit', hour12:true });
    html += `<button class="tz-option ${isActive ? 'active' : ''}" onclick="selectTimezone('${tz.id}')">
      <span><span class="tz-name">${tz.name}</span><br><span class="tz-abbr">${tz.market}</span></span>
      <span class="tz-live">${liveTime}</span>
    </button>`;
  }
  html += '</div>';
  popup.innerHTML = html;
}

async function fetchMarketStatus() {
  try {
    const r = await fetch(API_BASE+'/api/market-status');
    const d = await r.json();
    MARKET_OPEN = d.open;
    MARKET_REASON = d.reason;
    if(d.holidays) MARKET_HOLIDAYS = new Set(d.holidays);
    const badge = document.getElementById('mktBadge');
    if(badge) {
      if(MARKET_OPEN) {
        badge.className='mkt-badge mkt-open';
        badge.textContent='MARKET OPEN';
      } else {
        badge.className='mkt-badge mkt-closed';
        badge.textContent=MARKET_REASON==='Holiday'?'HOLIDAY':'MKT CLOSED';
      }
    }
  } catch(e) { console.warn('Market status fetch failed', e); }
}

function initClock() {
  try {
    document.getElementById('clockWrap').style.display = 'flex';
    updateClock();
    setInterval(updateClock, 1000);
    fetchMarketStatus();
    setInterval(fetchMarketStatus, 60000);
  } catch(e) { console.warn('initClock error:', e); }
}

function selectTimezone(tzId) {
  selectedTzId = tzId;
  localStorage.setItem('ng_timezone', tzId);
  updateClock();
  renderTzPicker();
  // Close popup after short delay so user sees the selection
  setTimeout(() => {
    document.getElementById('tzPopup').classList.remove('show');
  }, 200);
}

// Calendar
let calYear, calMonth;
function openCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendarModal();
  document.getElementById('calModal').classList.add('show');
}
function closeCalendar() { document.getElementById('calModal').classList.remove('show'); }
function calNav(dir) { calMonth+=dir; if(calMonth<0){calMonth=11;calYear--;}if(calMonth>11){calMonth=0;calYear++;} renderCalendarModal(); }
function renderCalendarModal() {
  const title = new Date(calYear, calMonth).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  document.getElementById('calTitle').textContent = title;
  const grid = document.getElementById('calGrid');
  const today = new Date();
  const todayStr = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  let html = ['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=>`<div class="cal-day-hdr">${d}</div>`).join('');
  const first = new Date(calYear, calMonth, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  for(let i=0;i<startDay;i++) html+='<div class="cal-day"></div>';
  for(let d=1;d<=daysInMonth;d++) {
    const ds = calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const dow = new Date(calYear,calMonth,d).getDay();
    const isToday = ds===todayStr;
    const isHoliday = MARKET_HOLIDAYS.has(ds);
    const isWeekend = dow===0||dow===6;
    let cls = 'cal-day';
    if(isToday) cls+=' today';
    else if(isHoliday) cls+=' holiday';
    else if(isWeekend) cls+=' weekend';
    html+=`<div class="${cls}" title="${isHoliday?'Market Holiday':isWeekend?'Weekend':''}">${d}</div>`;
  }
  grid.innerHTML = html;
}


/* =====================================================================
   TRADE FEED
   ===================================================================== */
async function fetchTradeFeed() {
  try {
    const r = await fetch(API_BASE+'/api/trade-feed');
    const data = await r.json();
    if(data && data.length) {
      const inner = document.getElementById('feedScrollInner');
      inner.innerHTML = data.map(f => `<span class="feed-item">${f.summary} <span style="color:var(--text-muted);font-size:10px">${new Date(f.created_at+'Z').toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span></span>`).join('');
      document.getElementById('tradeFeedBar').style.display = 'flex';
    }
  } catch(e) {}
}


/* =====================================================================
   OTC SYSTEM
   ===================================================================== */
let OTC_COUNTERPARTIES = [];

async function loadOtcCounterparties() {
  if(!STATE.trader) return;
  try {
    const r = await fetch(API_BASE+'/api/traders/otc-counterparties/'+encodeURIComponent(STATE.trader.trader_name));
    const d = await r.json();
    if(d.success) OTC_COUNTERPARTIES = d.counterparties;
    refreshCptyDropdown();
  } catch(e) {}
}

function refreshCptyDropdown() {
  const sel = document.getElementById('tradeCpty');
  if(!sel) return;
  sel.innerHTML = '<option value="">None (Exchange)</option>';
  OTC_COUNTERPARTIES.forEach(c => {
    const avail = c.otc_available;
    const label = c.display_name + ' (' + c.team_name + ')' + (avail?'':' — unavailable');
    const opt = document.createElement('option');
    opt.value = c.trader_name;
    opt.textContent = label;
    opt.disabled = !avail;
    opt.style.color = avail ? '' : 'var(--text-muted)';
    sel.appendChild(opt);
  });
}

async function toggleOtcAvailable(val) {
  if(!STATE.trader) return;
  try {
    await fetch(API_BASE+'/api/traders/otc-status/'+encodeURIComponent(STATE.trader.trader_name),{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({otc_available:val})
    });
    toast(val?'Now accepting OTC trades':'OTC trades disabled','success');
  } catch(e) { toast('Failed to update OTC status','error'); }
}

async function loadOtcStatus() {
  if(!STATE.trader) return;
  try {
    const r = await fetch(API_BASE+'/api/traders/otc-status/'+encodeURIComponent(STATE.trader.trader_name));
    const d = await r.json();
    const el = document.getElementById('setOtcAvailable');
    if(el && d.success) el.checked = d.otc_available;
  } catch(e) {}
}

// Venue change handler — block exchange when market closed, auto-set OTC when counterparty selected
try {
  document.getElementById('tradeVenue').addEventListener('change', function() {
    const venue = this.value;
    const isPrivileged = STATE.trader && STATE.trader.privileged;
    if(!MARKET_OPEN && venue !== 'OTC' && !isPrivileged) {
      toast('Exchange is closed (' + MARKET_REASON + '). Switch to OTC or wait for market open.', 'error');
      this.value = 'OTC';
    }
  });

  document.getElementById('tradeCpty').addEventListener('change', function() {
    if(this.value) {
      document.getElementById('tradeVenue').value = 'OTC';
      document.getElementById('cptyHint').textContent = '(OTC bilateral — proposal sent to counterparty)';
    } else {
      document.getElementById('cptyHint').textContent = '';
    }
  });
} catch(e) { console.warn('OTC listener init:', e); }

// ---- OTC Desk (Negotiations) ----
let _otcProposals = { received: [], sent: [] };
let _otcHistory = { received: [], sent: [] };
let _otcTab = 'active';
let _otcExpandedThreads = new Set();
let _otcExpandedCounters = new Set();

async function loadOtcProposals() {
  if (!STATE.trader) return;
  try {
    const r = await fetch(API_BASE + '/api/otc/proposals/' + encodeURIComponent(STATE.trader.trader_name));
    const d = await r.json();
    if (d.success) {
      _otcProposals = { received: d.received || [], sent: d.sent || [] };
      renderOtcActive();
    }
  } catch(e) {}
}

async function loadOtcHistory() {
  if (!STATE.trader) return;
  try {
    const r = await fetch(API_BASE + '/api/otc/proposals/' + encodeURIComponent(STATE.trader.trader_name) + '?include_resolved=true');
    const d = await r.json();
    if (d.success) {
      // Filter to only resolved
      _otcHistory = {
        received: (d.received || []).filter(p => p.status !== 'PENDING'),
        sent: (d.sent || []).filter(p => p.status !== 'PENDING')
      };
      renderOtcHistory();
    }
  } catch(e) {}
}

function switchOtcTab(tab) {
  _otcTab = tab;
  document.getElementById('otcTabActive').classList.toggle('active', tab === 'active');
  document.getElementById('otcTabHistory').classList.toggle('active', tab === 'history');
  document.getElementById('otcActiveBody').style.display = tab === 'active' ? '' : 'none';
  document.getElementById('otcHistoryBody').style.display = tab === 'history' ? '' : 'none';
  if (tab === 'history') loadOtcHistory();
}

function _otcOtherName(p) {
  const me = STATE.trader.trader_name;
  if (p.from_trader === me) return p.to_name || p.to_trader;
  return p.from_name || p.from_trader;
}

function _otcIsMyTurn(p) {
  return p.turn === STATE.trader.trader_name;
}

function _otcTermsSummary(td) {
  const dirColor = td.direction === 'BUY' ? 'var(--green)' : 'var(--red)';
  return `<strong style="color:${dirColor}">${td.direction}</strong> `
    + `<strong>${parseFloat(td.volume).toLocaleString()}</strong> ${td.hub} `
    + `@ <strong>$${parseFloat(td.entryPrice).toFixed(4)}</strong>`
    + (td.deliveryMonth ? ` <span style="color:var(--text-muted)">${td.deliveryMonth}</span>` : '')
    + ` <span style="color:var(--text-muted)">[${td.type}]</span>`;
}

function _renderRevisionThread(revs, proposalId) {
  if (!revs || !revs.length) return '<div style="color:var(--text-muted);font-size:11px;padding:4px 0">No history</div>';
  let html = '<div class="otc-thread">';
  revs.forEach((rev, i) => {
    const isMe = rev.by === STATE.trader.trader_name;
    const who = isMe ? 'You' : (rev.by || '?');
    const actionLabel = rev.action === 'INITIAL' ? 'proposed' : rev.action === 'COUNTER' ? 'countered' : rev.action.toLowerCase();
    const time = rev.at ? new Date(rev.at).toLocaleString('en-US', {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
    html += `<div class="otc-revision">
      <div class="otc-revision-header">${who} ${actionLabel} <span style="color:var(--text-muted);font-weight:400;font-size:10px">${time}</span></div>`;
    if (rev.trade_data) {
      html += `<div class="otc-revision-terms">${_otcTermsSummary(rev.trade_data)}</div>`;
    }
    if (rev.message) {
      html += `<div class="otc-revision-msg">"${rev.message}"</div>`;
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderOtcActive() {
  const body = document.getElementById('otcActiveBody');
  if (!body) return;

  // Merge received + sent into one list, sorted by created_at desc
  const all = [
    ..._otcProposals.received.map(p => ({...p, _role: 'received'})),
    ..._otcProposals.sent.map(p => ({...p, _role: 'sent'}))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Update active count badge
  const countEl = document.getElementById('otcActiveCount');
  const myTurnCount = all.filter(p => _otcIsMyTurn(p)).length;
  if (countEl) {
    if (myTurnCount > 0) {
      countEl.style.display = '';
      countEl.textContent = myTurnCount + ' action needed';
    } else {
      countEl.style.display = 'none';
    }
  }

  if (all.length === 0) {
    body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px;font-size:12px">No active negotiations</div>';
    return;
  }

  let html = '';
  all.forEach(p => {
    const td = p.trade_data;
    const other = _otcOtherName(p);
    const myTurn = _otcIsMyTurn(p);
    const revCount = p.revision_count || 0;
    const threadExpanded = _otcExpandedThreads.has(p.id);
    const counterExpanded = _otcExpandedCounters.has(p.id);
    const age = formatAge(Date.now() - new Date(p.created_at).getTime());

    html += `<div class="otc-proposal" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="min-width:80px">
          <div class="otc-from">${other}</div>
          <div style="font-size:10px;color:var(--text-muted)">${age} ago</div>
        </div>
        <div class="otc-details" style="flex:1">
          ${_otcTermsSummary(td)}
        </div>
        <span class="otc-turn-badge ${myTurn ? 'your-turn' : 'waiting'}">${myTurn ? 'YOUR TURN' : 'WAITING'}</span>
      </div>`;

    // Thread toggle
    html += `<div style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <button class="btn btn-sm btn-ghost" style="font-size:10px;padding:2px 8px" onclick="toggleOtcThread(${p.id})">
          ${threadExpanded ? '&#9660;' : '&#9654;'} History (${revCount + 1})
        </button>`;

    // Action buttons
    if (myTurn) {
      html += `<div class="otc-actions">
          <button class="btn btn-sm" style="background:rgba(139,92,246,0.15);color:#a78bfa;border-color:rgba(139,92,246,0.3);font-size:10px" onclick="toggleOtcCounter(${p.id})">Counter</button>
          <button class="btn btn-sm" style="background:rgba(16,185,129,0.15);color:var(--green);border-color:rgba(16,185,129,0.3);font-size:10px" onclick="acceptOtcProposal(${p.id})">Accept</button>
          <button class="btn btn-sm" style="background:rgba(239,68,68,0.15);color:var(--red);border-color:rgba(239,68,68,0.3);font-size:10px" onclick="rejectOtcProposal(${p.id})">Reject</button>
        </div>`;
    } else {
      html += `<div class="otc-actions">
          <button class="btn btn-sm btn-ghost" style="color:var(--text-muted);font-size:10px" onclick="withdrawOtcProposal(${p.id})">Withdraw</button>
        </div>`;
    }
    html += '</div>';

    // Expandable thread
    if (threadExpanded) {
      html += _renderRevisionThread(p.revision_history || [], p.id);
    }

    // Counter-offer form
    if (counterExpanded && myTurn) {
      html += `<div class="otc-counter-form" id="otcCounterForm_${p.id}">
        <div class="form-row">
          <div><label>Price</label><input type="number" step="0.0001" id="otcCtrPrice_${p.id}" value="${td.entryPrice}"></div>
          <div><label>Volume</label><input type="number" step="1" id="otcCtrVol_${p.id}" value="${td.volume}"></div>
          <div><label>Del. Month</label><input type="text" id="otcCtrMonth_${p.id}" value="${td.deliveryMonth || ''}" placeholder="e.g. Jan-26"></div>
        </div>
        <div style="margin-bottom:8px"><label>Message</label><textarea id="otcCtrMsg_${p.id}" rows="2" placeholder="Optional message..."></textarea></div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm" style="background:rgba(139,92,246,0.2);color:#a78bfa;border-color:rgba(139,92,246,0.3)" onclick="submitOtcCounter(${p.id})">Send Counter</button>
          <button class="btn btn-sm btn-ghost" onclick="toggleOtcCounter(${p.id})">Cancel</button>
        </div>
      </div>`;
    }

    html += '</div>';
  });

  body.innerHTML = html;
}

function renderOtcHistory() {
  const body = document.getElementById('otcHistoryBody');
  if (!body) return;

  const all = [
    ..._otcHistory.received.map(p => ({...p, _role: 'received'})),
    ..._otcHistory.sent.map(p => ({...p, _role: 'sent'}))
  ].sort((a, b) => new Date(b.resolved_at || b.created_at) - new Date(a.resolved_at || a.created_at));

  if (all.length === 0) {
    body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px;font-size:12px">No resolved negotiations</div>';
    return;
  }

  let html = '';
  all.forEach(p => {
    const td = p.trade_data;
    const other = _otcOtherName(p);
    const statusColors = { ACCEPTED: 'var(--green)', REJECTED: 'var(--red)', WITHDRAWN: 'var(--text-muted)' };
    const threadExpanded = _otcExpandedThreads.has(p.id);

    html += `<div class="otc-proposal" style="flex-direction:column;align-items:stretch;opacity:0.75">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="min-width:80px">
          <div class="otc-from">${other}</div>
          <div style="font-size:10px;color:var(--text-muted)">${p.resolved_at ? new Date(p.resolved_at).toLocaleDateString() : ''}</div>
        </div>
        <div class="otc-details" style="flex:1">
          ${_otcTermsSummary(td)}
        </div>
        <span class="otc-turn-badge resolved" style="color:${statusColors[p.status] || 'var(--text-muted)'}">${p.status}</span>
      </div>
      <div style="margin-top:6px">
        <button class="btn btn-sm btn-ghost" style="font-size:10px;padding:2px 8px" onclick="toggleOtcThread(${p.id})">
          ${threadExpanded ? '&#9660;' : '&#9654;'} History (${(p.revision_count || 0) + 1})
        </button>
      </div>`;

    if (threadExpanded) {
      html += _renderRevisionThread(p.revision_history || [], p.id);
    }
    html += '</div>';
  });

  body.innerHTML = html;
}

function toggleOtcThread(id) {
  if (_otcExpandedThreads.has(id)) _otcExpandedThreads.delete(id);
  else _otcExpandedThreads.add(id);
  if (_otcTab === 'active') renderOtcActive();
  else renderOtcHistory();
}

function toggleOtcCounter(id) {
  if (_otcExpandedCounters.has(id)) _otcExpandedCounters.delete(id);
  else _otcExpandedCounters.add(id);
  renderOtcActive();
}

async function submitOtcCounter(id) {
  if (!STATE.trader) return;
  const price = document.getElementById('otcCtrPrice_' + id)?.value;
  const volume = document.getElementById('otcCtrVol_' + id)?.value;
  const month = document.getElementById('otcCtrMonth_' + id)?.value;
  const msg = document.getElementById('otcCtrMsg_' + id)?.value;
  try {
    const r = await fetch(API_BASE + '/api/otc/proposals/' + STATE.trader.trader_name + '/' + id + '/counter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price, volume, deliveryMonth: month, message: msg })
    });
    const d = await r.json();
    if (d.success) {
      toast('Counter-offer sent', 'success');
      _otcExpandedCounters.delete(id);
      loadOtcProposals();
    } else {
      toast(d.error || 'Failed to counter', 'error');
    }
  } catch(e) { toast('Failed to send counter-offer', 'error'); }
}

async function acceptOtcProposal(id) {
  if (!STATE.trader) return;
  try {
    const r = await fetch(API_BASE + '/api/otc/proposals/' + STATE.trader.trader_name + '/' + id + '/accept', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    });
    const d = await r.json();
    if (d.success) {
      toast('OTC trade accepted — position added to your book', 'success');
      playSound('trade');
      loadOtcProposals();
      if (typeof syncTradesFromServer === 'function') syncTradesFromServer();
    } else {
      toast(d.error || 'Failed to accept', 'error');
    }
  } catch(e) { toast('Failed to accept proposal', 'error'); }
}

async function rejectOtcProposal(id) {
  if (!STATE.trader) return;
  try {
    const r = await fetch(API_BASE + '/api/otc/proposals/' + STATE.trader.trader_name + '/' + id + '/reject', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    });
    const d = await r.json();
    if (d.success) {
      toast('OTC proposal rejected', 'info');
      loadOtcProposals();
    } else {
      toast(d.error || 'Failed to reject', 'error');
    }
  } catch(e) { toast('Failed to reject proposal', 'error'); }
}

async function withdrawOtcProposal(id) {
  if (!STATE.trader) return;
  if (!confirm('Withdraw this OTC proposal?')) return;
  try {
    const r = await fetch(API_BASE + '/api/otc/proposals/' + STATE.trader.trader_name + '/' + id + '/withdraw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    });
    const d = await r.json();
    if (d.success) {
      toast('OTC proposal withdrawn', 'info');
      loadOtcProposals();
    }
  } catch(e) { toast('Failed to withdraw proposal', 'error'); }
}
