function openPanel(name) {
  closeAllPanels();
  document.getElementById('panelOverlay').classList.add('active');
  const panel = document.getElementById(name + 'Panel');
  if (panel) panel.classList.add('active');
}

function closeAllPanels() {
  document.getElementById('panelOverlay').classList.remove('active');
  document.querySelectorAll('.slide-panel').forEach(p => p.classList.remove('active'));
}

/* =====================================================================
   THEME
   ===================================================================== */
function setTheme(theme) {
  if (theme === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ng_theme', theme);
  document.querySelectorAll('.theme-opt').forEach(b => {
    b.classList.toggle('btn-primary', b.dataset.theme === theme);
    b.classList.toggle('btn-ghost', b.dataset.theme !== theme);
  });
  if (typeof renderCurrentPage === 'function') renderCurrentPage();
}
(function(){ setTheme(localStorage.getItem('ng_theme') || 'dark'); })();

/* =====================================================================
   REGISTRATION
   ===================================================================== */
function getTraderPhoto() {
  const tn = STATE.trader ? STATE.trader.trader_name : '';
  if (!tn) return '';
  return localStorage.getItem('ng_photo_' + tn) || '';
}
function setTraderPhoto(data) {
  const tn = STATE.trader ? STATE.trader.trader_name : '';
  if (!tn || !data) return;
  localStorage.setItem('ng_photo_' + tn, data);
}

function checkRegistration() {
  if (STATE.trader) {
    document.getElementById('regOverlay').classList.add('hidden');
    initAfterLogin();
  }
}

// Allow Enter key to trigger login from either input field
document.addEventListener('DOMContentLoaded', function() {
  var regName = document.getElementById('regName');
  var regPin = document.getElementById('regPin');
  if (regName) regName.addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  if (regPin) regPin.addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
});

async function doLogin() {
  const name = document.getElementById('regName').value.trim();
  const pin = document.getElementById('regPin').value.trim();
  const errEl = document.getElementById('regError');
  if (!errEl) return;
  errEl.style.display = 'none';

  if (!name) { errEl.textContent = 'Name is required'; errEl.style.display = 'block'; return; }
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) { errEl.textContent = 'A valid 4-digit PIN is required'; errEl.style.display = 'block'; return; }

  try {
    const r = await fetch('/api/traders/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin })
    });
    const d = await r.json();
    if (d.success) {
      STATE.trader = {
        trader_name: d.trader_name,
        real_name: d.real_name,
        display_name: d.display_name,
        firm: d.firm,
        pin: pin,
        starting_balance: d.starting_balance,
        team: d.team || null
      };
      if (d.photo_url) setTraderPhoto(d.photo_url);
      localStorage.setItem('ng_trader', JSON.stringify(STATE.trader));
      document.getElementById('regOverlay').classList.add('hidden');
      toast('Welcome, ' + d.display_name + '!', 'success');
      initAfterLogin();
    } else {
      errEl.textContent = d.error || 'Login failed';
      errEl.style.display = 'block';
    }
  } catch {
    // Offline mode — allow login without server
    const traderName = name.toLowerCase().replace(/\s+/g, '_');
    STATE.trader = { trader_name: traderName, real_name: name, display_name: name, firm: '', pin: pin };
    localStorage.setItem('ng_trader', JSON.stringify(STATE.trader));
    document.getElementById('regOverlay').classList.add('hidden');
    toast('Welcome, ' + name + '! (Offline mode)', 'info');
    initAfterLogin();
  }
}

function initAfterLogin() {
  // Populate settings
  if (STATE.trader) {
    document.getElementById('setRealName').value = STATE.trader.real_name || STATE.trader.display_name || '';
    document.getElementById('setName').value = STATE.trader.display_name || '';
    document.getElementById('setFirm').value = STATE.trader.firm || '';
    // Load trader-scoped data from localStorage
    STATE.alerts = JSON.parse(localStorage.getItem(traderStorageKey('alerts')) || '[]');
    STATE.notifications = JSON.parse(localStorage.getItem(traderStorageKey('notifications')) || '[]');
    STATE.pendingOrders = JSON.parse(localStorage.getItem(traderStorageKey('pending_orders')) || '[]');
    STATE.settings = JSON.parse(localStorage.getItem(traderStorageKey('settings')) || '{"balance":1000000,"margin":"nymex","sound":false}');
  }
  document.getElementById('setBalance').value = STATE.settings.balance || 1000000;
  document.getElementById('setSoundEnabled').checked = STATE.settings.sound || false;
  updatePhotoPreview();
  updateHeaderProfile();
  connectWebSocket();
  fetchLiveNews();
  syncTradesFromServer();
  postLoginInit();
}

async function syncTradesFromServer() {
  if (!STATE.trader) return;
  try {
    const r = await fetch(API_BASE + '/api/trades/' + encodeURIComponent(STATE.trader.trader_name));
    const d = await r.json();
    if (d.success && Array.isArray(d.trades)) {
      STATE.trades = d.trades;
      localStorage.setItem(traderStorageKey('trades'), JSON.stringify(STATE.trades));
      renderCurrentPage();
    }
  } catch(e) {
    console.warn('Could not sync trades from server, using local cache:', e);
    // Fall back to trader-scoped localStorage
    STATE.trades = JSON.parse(localStorage.getItem(traderStorageKey('trades')) || '[]');
  }
}

function updateHeaderProfile() {
  const chip = document.getElementById('headerProfile');
  if (!STATE.trader) { chip.style.display='none'; return; }
  chip.style.display='flex';
  const name = STATE.trader.display_name || 'Trader';
  const photo = getTraderPhoto() || '';
  const avatarEl = document.getElementById('headerAvatar');
  const nameEl = document.getElementById('headerName');
  if (photo) {
    avatarEl.innerHTML = `<img src="${photo}">`;
  } else {
    const initials = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    avatarEl.innerHTML = initials;
    avatarEl.style.background = 'var(--accent)';
  }
  nameEl.textContent = name;
}

function showMyProfile() {
  const balance = STATE.settings.balance||1000000;
  let realized=0,wins=0,losses=0,grossWins=0,grossLosses=0;
  STATE.trades.forEach(t=>{if(t.status==='CLOSED'){const pnl=parseFloat(t.realizedPnl||0);realized+=pnl;if(pnl>0){wins++;grossWins+=pnl;}else if(pnl<0){losses++;grossLosses+=Math.abs(pnl);}}});
  const equity=balance+realized;
  const ret=((equity-balance)/balance)*100;
  const wr=(wins+losses)>0?((wins/(wins+losses))*100):0;
  const pf=grossLosses>0?(grossWins/grossLosses):(grossWins>0?999:0);
  const name=STATE.trader?STATE.trader.display_name:'You';
  const realName=STATE.trader?STATE.trader.real_name:'';
  const firm=STATE.trader?STATE.trader.firm:'';
  const photo=getTraderPhoto()||'';
  const team=STATE.trader?STATE.trader.team:null;
  showTraderProfile({name,realName,firm,team,ret:parseFloat(ret.toFixed(2)),winRate:parseFloat(wr.toFixed(1)),pf:parseFloat(pf.toFixed(2)),trades:STATE.trades.length,equity,photo,isMe:true});
}

function showTraderProfile(trader) {
  const overlay = document.getElementById('profileOverlay');
  const balance = STATE.settings.balance||1000000;

  // Avatar
  const avatarEl = document.getElementById('profAvatar');
  const initials = trader.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  const bgColor = trader.isMe ? 'var(--accent)' : 'var(--text-muted)';
  if (trader.photo) {
    avatarEl.innerHTML = `<img src="${trader.photo}">`;
    avatarEl.style.background = bgColor;
  } else {
    avatarEl.innerHTML = initials;
    avatarEl.style.background = bgColor;
  }

  // Name / firm / rank
  document.getElementById('profName').textContent = trader.name + (trader.isMe ? ' (You)' : '');
  const firmLine = trader.firm || 'Independent';
  const realNameLine = trader.realName && trader.realName !== trader.name ? 'Real name: ' + trader.realName : '';
  document.getElementById('profFirm').innerHTML = firmLine + (realNameLine ? '<br><span style="color:var(--text-dim);font-size:12px">' + realNameLine + '</span>' : '');
  const rankEl = document.getElementById('profRank');
  let rankHtml = '';
  if (trader.rank) {
    const suffix = trader.rank===1?'st':trader.rank===2?'nd':trader.rank===3?'rd':'th';
    rankHtml += `#${trader.rank}${suffix} on leaderboard`;
  }
  if (trader.team && trader.team.name) {
    rankHtml += `${rankHtml?' · ':''}<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:${trader.team.color||'var(--accent)'};display:inline-block"></span>${trader.team.name}</span>`;
  }
  rankEl.innerHTML = rankHtml || '';

  // Stats grid
  const retColor = trader.ret>=0 ? '#10b981' : '#ef4444';
  const equity = trader.equity || balance*(1+trader.ret/100);
  document.getElementById('profStats').innerHTML = `
    <div class="profile-stat"><div class="profile-stat-label">Return</div><div class="profile-stat-value" style="color:${retColor}">${trader.ret>=0?'+':''}${trader.ret.toFixed(1)}%</div></div>
    <div class="profile-stat"><div class="profile-stat-label">Equity</div><div class="profile-stat-value">$${equity.toLocaleString(undefined,{maximumFractionDigits:0})}</div></div>
    <div class="profile-stat"><div class="profile-stat-label">Win Rate</div><div class="profile-stat-value">${trader.winRate.toFixed(0)}%</div></div>
    <div class="profile-stat"><div class="profile-stat-label">Profit Factor</div><div class="profile-stat-value">${trader.pf.toFixed(2)}</div></div>
    <div class="profile-stat"><div class="profile-stat-label">Trades</div><div class="profile-stat-value">${trader.trades}</div></div>
    <div class="profile-stat"><div class="profile-stat-label">Status</div><div class="profile-stat-value" style="font-size:14px">${trader.isMe?'Active':'Peer'}</div></div>
  `;

  // Mini equity curve
  drawProfileEquityCurve(equity, retColor);

  overlay.classList.add('active');
}

function drawProfileEquityCurve(finalEquity, color) {
  const canvas = document.getElementById('profEquityCanvas');
  if (!canvas) return;
  const dpr = window.devicePixelRatio||1;
  const W = canvas.offsetWidth || 332;
  const H = 120;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr,dpr);

  const balance = STATE.settings.balance||1000000;
  const steps = 30;
  const line = [balance];
  for (let i=1;i<=steps;i++) {
    const target = balance+(finalEquity-balance)*(i/steps);
    const noise = (Math.random()-0.5)*balance*0.005;
    line.push(target+noise);
  }
  line[line.length-1] = finalEquity;

  const minV = Math.min(...line)*0.999;
  const maxV = Math.max(...line)*1.001;
  const range = maxV-minV||1;
  const pad = {t:10,b:10,l:10,r:10};
  const pw = W-pad.l-pad.r;
  const ph = H-pad.t-pad.b;

  ctx.clearRect(0,0,W,H);
  ctx.beginPath();
  line.forEach((v,i)=>{
    const x=pad.l+(i/steps)*pw;
    const y=pad.t+ph-(((v-minV)/range)*ph);
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  });
  ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();

  // Fill under
  ctx.lineTo(pad.l+pw, pad.t+ph);
  ctx.lineTo(pad.l, pad.t+ph);
  ctx.closePath();
  ctx.fillStyle=color+'20';ctx.fill();
}

function closeProfile() {
  document.getElementById('profileOverlay').classList.remove('active');
}

function openLbProfile(index) {
  const entries = window._lbEntries;
  if (!entries || !entries[index]) return;
  showTraderProfile(entries[index]);
}

function doLogout() {
  localStorage.removeItem('ng_trader');
  
  // Clear all trader-specific state
  STATE.trades = [];
  STATE.alerts = [];
  STATE.notifications = [];
  STATE.pendingOrders = [];
  STATE.settings = {balance:1000000, margin:'nymex', sound:false};
  STATE.trader = null;
  document.getElementById('regOverlay').classList.remove('hidden');
  document.getElementById('regName').value = '';
  document.getElementById('regPin').value = '';
  document.getElementById('headerProfile').style.display = 'none';
  // Clean up chat
  document.getElementById('chatTab').style.display = 'none';
  var hcb = document.getElementById('headerChatBtn'); if(hcb) hcb.style.display = 'none';
  document.getElementById('chatPanel').classList.remove('open');
  CHAT_STATE.open = false;
  CHAT_STATE.conversations = [];
  CHAT_STATE.activeConvo = null;
  if(CHAT_STATE.pollTimer){clearInterval(CHAT_STATE.pollTimer);CHAT_STATE.pollTimer=null;}
  closeAllPanels();
  toast('Logged out', 'info');
}

/* =====================================================================
   SETTINGS
   ===================================================================== */
function saveSettings() {
  if (STATE.trader) {
    const newDisplayName = document.getElementById('setName').value.trim() || STATE.trader.display_name;
    if (newDisplayName !== STATE.trader.display_name) {
      STATE.trader.display_name = newDisplayName;
      // Sync display name to server
      try {
        fetch('/api/traders/display-name/' + STATE.trader.trader_name, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name: newDisplayName })
        });
      } catch {}
    }
    localStorage.setItem('ng_trader', JSON.stringify(STATE.trader));
  }
  STATE.settings.balance = parseFloat(document.getElementById('setBalance').value) || 1000000;
  STATE.settings.margin = document.getElementById('setMargin').value;
  STATE.settings.sound = document.getElementById('setSoundEnabled').checked;
  localStorage.setItem(traderStorageKey('settings'), JSON.stringify(STATE.settings));
  toast('Settings saved', 'success');
  updateHeaderProfile();
  closeAllPanels();
}

function handlePhotoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    const s = Math.min(img.width, img.height);
    const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
    ctx.drawImage(img, sx, sy, s, s, 0, 0, 64, 64);
    const b64 = canvas.toDataURL('image/jpeg', 0.8);
    setTraderPhoto(b64);
    updatePhotoPreview();
    updateHeaderProfile();
    // Upload to server
    if (STATE.trader) {
      fetch('/api/traders/photo/' + STATE.trader.trader_name, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo: b64 })
      }).catch(() => {});
    }
    toast('Photo updated', 'success');
  };
  img.src = URL.createObjectURL(file);
}

function updatePhotoPreview() {
  const el = document.getElementById('photoPreview');
  const photo = getTraderPhoto();
  if (photo) {
    el.innerHTML = `<img src="${photo}" style="width:100%;height:100%;object-fit:cover">`;
  } else if (STATE.trader) {
    el.textContent = STATE.trader.display_name.charAt(0).toUpperCase();
  }
}

/* =====================================================================
   WEBSOCKET CONNECTION
   ===================================================================== */
function connectWebSocket() {
  updateConnBadge('reconnecting');
  // Try HTTP status first
  fetch('/api/status').then(r => r.json()).then(d => {
    if (d.success) {
      STATE.connected = true;
      updateConnBadge('online', d.active_traders);
    }
  }).catch(() => {
    STATE.connected = false;
    updateConnBadge('offline');
  });

  // Periodic check
  setInterval(() => {
    fetch('/api/status').then(r => r.json()).then(d => {
      STATE.connected = true;
      updateConnBadge('online', d.active_traders);
    }).catch(() => {
      STATE.connected = false;
      updateConnBadge('offline');
    });
  }, 15000);
}

function updateConnBadge(status, traders) {
  const dot = document.getElementById('connDot');
  const text = document.getElementById('connText');
  dot.className = 'conn-dot ' + (status === 'online' ? 'online' : status === 'reconnecting' ? 'reconnecting' : 'offline');
  if (status === 'online') text.textContent = 'CONNECTED' + (traders ? ' · ' + traders + ' traders' : '');
  else if (status === 'reconnecting') text.textContent = 'RECONNECTING...';
  else text.textContent = 'OFFLINE — LOCAL MODE';
}

/* =====================================================================
   LIVE NEWS FETCH
   ===================================================================== */
async function fetchLiveNews() {
  for (const sector of ['ng', 'crude', 'power', 'freight', 'ag', 'metals', 'ngls', 'lng']) {
    try {
      const r = await fetch('/api/news/' + sector);
      const d = await r.json();
      if (d.success && d.articles.length) liveNews[sector] = d.articles;
    } catch {}
  }
  renderNewsTicker();
}

/* =====================================================================
   SOUND ALERTS
   ===================================================================== */
let audioCtx;
function playSound(type) {
  if (!STATE.settings.sound) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  if (type === 'trade') { osc.frequency.value = 880; gain.gain.value = 0.1; osc.type = 'sine'; }
  else if (type === 'alert') { osc.frequency.value = 440; gain.gain.value = 0.15; osc.type = 'triangle'; }
  else { osc.frequency.value = 660; gain.gain.value = 0.08; osc.type = 'sine'; }
  osc.start(); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3); osc.stop(audioCtx.currentTime + 0.3);
}

/* =====================================================================
   KEYBOARD SHORTCUTS
   ===================================================================== */
document.addEventListener('keydown', e => {
  // Don't capture when in input
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

  const pages = ['ng','crude','power','freight','ag','metals','blotter','risk','leaderboard'];
  if (e.key >= '1' && e.key <= '9') { e.preventDefault(); switchPage(pages[parseInt(e.key)-1]); }
  if (e.key === 'Escape') { closeAllPanels(); closeModal(); }
  if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); openPanel('help'); }
  if (e.key.toLowerCase() === 'i') {
    const hub = STATE.selectedHubs[STATE.currentPage];
    if (hub && HUB_INFO[hub]) openHubInfo(hub);
  }
});

/* =====================================================================
   SESSION TIMEOUT
   ===================================================================== */
let timeoutTimer;
function resetActivityTimer() {
  STATE.lastActivity = Date.now();
  const banner = document.getElementById('timeoutBanner');
  if (banner.classList.contains('active')) {
    banner.classList.remove('active');
  }
}
function checkTimeout() {
  if (Date.now() - STATE.lastActivity > 30 * 60 * 1000) {
    document.getElementById('timeoutBanner').classList.add('active');
  }
}
function dismissTimeout() {
  document.getElementById('timeoutBanner').classList.remove('active');
  resetActivityTimer();
  // Refresh prices
  for (let i = 0; i < 5; i++) tickPrices();
  toast('Prices refreshed', 'info');
}
document.addEventListener('mousemove', resetActivityTimer);
document.addEventListener('keydown', resetActivityTimer);
document.addEventListener('click', resetActivityTimer);
setInterval(checkTimeout, 60000);

