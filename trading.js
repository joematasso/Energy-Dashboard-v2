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
    if(!MARKET_OPEN && venue !== 'OTC') {
      toast('Exchange is closed (' + MARKET_REASON + '). Switch to OTC or wait for market open.', 'error');
      this.value = 'OTC';
    }
  });

  document.getElementById('tradeCpty').addEventListener('change', function() {
    if(this.value) {
      document.getElementById('tradeVenue').value = 'OTC';
      document.getElementById('cptyHint').textContent = '(OTC bilateral)';
    } else {
      document.getElementById('cptyHint').textContent = '';
    }
  });
} catch(e) { console.warn('OTC listener init:', e); }


