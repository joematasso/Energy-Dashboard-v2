/* =====================================================================
   CHAT SYSTEM
   ===================================================================== */
let CHAT_STATE = {
  open: false,
  conversations: [],
  activeConvo: null,
  showingPicker: false,
  showingAddMembers: false,
  pollTimer: null,
  lastMsgId: null
};

function toggleChat() {
  CHAT_STATE.open = !CHAT_STATE.open;
  const panel = document.getElementById('chatPanel');
  const fab = document.querySelector('.mobile-fab');
  if(CHAT_STATE.open) {
    panel.classList.add('open');
    if(fab) fab.classList.add('chat-hidden');
    loadConversations();
    if(!CHAT_STATE.pollTimer) CHAT_STATE.pollTimer = setInterval(pollChat, 5000);
  } else {
    panel.classList.remove('open');
    if(fab) fab.classList.remove('chat-hidden');
    CHAT_STATE.showingPicker = false;
    if(CHAT_STATE.pollTimer) { clearInterval(CHAT_STATE.pollTimer); CHAT_STATE.pollTimer = null; }
  }
}

document.addEventListener('click', function(e) {
    if (!CHAT_STATE.open) return;
    const panel = document.getElementById('chatPanel');
    const chatTab = document.getElementById('chatTab');
    const headerChatBtn = document.getElementById('headerChatBtn');
    // If click is inside the chat panel or on any chat toggle button, do nothing
    if (panel && panel.contains(e.target)) return;
    if (chatTab && chatTab.contains(e.target)) return;
    if (headerChatBtn && headerChatBtn.contains(e.target)) return;
    // Close the chat
    CHAT_STATE.open = false;
    panel.classList.remove('open');
    CHAT_STATE.showingPicker = false;
    if (CHAT_STATE.pollTimer) { clearInterval(CHAT_STATE.pollTimer); CHAT_STATE.pollTimer = null; }
});

async function loadConversations() {
  if(!STATE.trader) return;
  try {
    // Ensure team conversation exists
    await fetch(API_BASE+'/api/chat/team-conversation/'+encodeURIComponent(STATE.trader.trader_name),{method:'POST'}).catch(()=>{});
    const r = await fetch(API_BASE+'/api/chat/conversations/'+encodeURIComponent(STATE.trader.trader_name));
    const d = await r.json();
    if(d.success) CHAT_STATE.conversations = d.conversations;
    if(!CHAT_STATE.showingPicker) renderConvoList();
    updateUnreadBadge();
  } catch(e) {}
}

function renderConvoList() {
  const list = document.getElementById('chatConvoList');
  if(!list) return;
  if(!CHAT_STATE.conversations.length) {
    list.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;color:var(--text-muted);text-align:center;gap:10px;padding:24px"><div style="font-size:36px;opacity:0.4">💬</div><div style="font-size:13px;line-height:1.6">No conversations yet.<br>Tap <strong style="color:var(--text)">+ New</strong> to start one.</div></div>';
    return;
  }
  list.innerHTML = CHAT_STATE.conversations.map(c => {
    const isActive = CHAT_STATE.activeConvo && CHAT_STATE.activeConvo.id === c.id;
    const unread = c.unread > 0;
    let name = c.name || '';
    let avatarContent = '';
    if(c.type === 'dm') {
      const other = c.members.find(m => m.trader_name !== STATE.trader.trader_name);
      name = other ? other.display_name : 'DM';
      avatarContent = other && other.photo_url ? '<img src="'+other.photo_url+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : name.charAt(0).toUpperCase();
    } else if(c.type === 'team') {
      name = '🏢 ' + (c.name || 'Team');
      avatarContent = c.avatar ? '<img src="'+c.avatar+'" alt="">' : '🏢';
    } else if(c.type === 'system' || c.type === 'admin_inbox') {
      name = '📡 ' + (c.name || 'System');
      avatarContent = '📡';
    } else {
      avatarContent = c.avatar ? '<img src="'+c.avatar+'" alt="">' : (c.type === 'group' ? '👥' : name.charAt(0).toUpperCase());
    }
    const preview = c.last_msg ? (c.last_sender === STATE.trader.trader_name ? 'You: ' : '') + c.last_msg.substring(0,40) : 'No messages yet';
    const time = c.last_msg_time ? new Date(c.last_msg_time+'Z').toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';
    return `<div class="chat-convo-item ${isActive?'active':''} ${unread?'unread':''}" onclick="openConvo(${c.id})">
      <div class="convo-avatar">${avatarContent}</div>
      <div class="convo-info"><div class="convo-name">${name}</div><div class="convo-preview">${preview}</div></div>
      <div class="convo-meta"><span>${time}</span>${unread?`<span class="convo-unread">${c.unread}</span>`:''}</div>
    </div>`;
  }).join('');
}

function updateUnreadBadge() {
  const total = CHAT_STATE.conversations.reduce((s,c)=>s+(c.unread||0),0);
  const dot = document.getElementById('chatUnreadDot');
  if(dot) dot.style.display = total > 0 ? 'block' : 'none';
  const hdrBadge = document.getElementById('chatUnreadBadge');
  if(hdrBadge) {
    if(total > 0) { hdrBadge.textContent = total; hdrBadge.style.display = 'flex'; }
    else { hdrBadge.textContent = ''; hdrBadge.style.display = 'none'; }
  }
}

async function openConvo(convId) {
  const convo = CHAT_STATE.conversations.find(c=>c.id===convId);
  if(!convo) return;
  CHAT_STATE.activeConvo = convo;
  CHAT_STATE.showingPicker = false;
  CHAT_STATE.showingAddMembers = false;
  CHAT_STATE.lastMsgId = null;
  document.getElementById('chatConvoList').style.display = 'none';
  const msgView = document.getElementById('chatMsgView');
  msgView.style.display = 'flex';
  document.getElementById('chatBackBtn').style.display = 'block';
  document.getElementById('chatNewBtn').style.display = 'none';
  document.getElementById('chatNewGroupBtn').style.display = 'none';
  document.getElementById('chatRenameBtn').style.display = convo.type === 'group' ? 'block' : 'none';
  document.getElementById('chatAddMembersBtn').style.display = convo.type === 'group' ? 'block' : 'none';
  document.getElementById('chatCallBtn').style.display = convo.type === 'dm' ? 'block' : 'none';
  document.getElementById('chatVideoBtn').style.display = convo.type === 'dm' ? 'block' : 'none';
  let name = convo.name;
  if(convo.type==='dm') {
    const other = convo.members.find(m=>m.trader_name!==STATE.trader.trader_name);
    name = other?other.display_name:'DM';
  }
  if(convo.type==='team') name = convo.name || 'Team Chat';
  if(convo.type==='system' || convo.type==='admin_inbox') name = '📡 ' + (convo.name || 'System Broadcasts');
  document.getElementById('chatTitle').textContent = name;

  // Hide input for read-only conversations (system broadcasts and admin inbox)
  const isReadOnly = convo.type === 'system' || convo.type === 'admin_inbox';
  const chatInputWrap = document.getElementById('chatInputWrap');
  if(chatInputWrap) chatInputWrap.style.display = isReadOnly ? 'none' : '';

  // Header avatar
  const headerAvatar = document.getElementById('chatHeaderAvatar');
  const isGroupOrTeam = convo.type === 'group' || convo.type === 'team';
  if (convo.type === 'system' || convo.type === 'admin_inbox') {
    headerAvatar.style.display = 'flex';
    headerAvatar.classList.remove('clickable');
    headerAvatar.innerHTML = '📡';
  } else if (isGroupOrTeam) {
    headerAvatar.style.display = 'flex';
    headerAvatar.classList.toggle('clickable', true);
    if (convo.avatar) {
      headerAvatar.innerHTML = '<img src="' + convo.avatar + '" alt="">';
    } else {
      const icon = convo.type === 'team' ? '🏢' : '👥';
      headerAvatar.innerHTML = icon;
    }
  } else if (convo.type === 'dm') {
    const other = convo.members.find(m=>m.trader_name!==STATE.trader.trader_name);
    headerAvatar.style.display = 'flex';
    if (other && other.photo_url) {
      headerAvatar.classList.remove('clickable');
      headerAvatar.classList.add('enlargeable');
      headerAvatar.innerHTML = '<img src="' + other.photo_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
      headerAvatar.onclick = function(ev) { ev.stopPropagation(); showImageLightbox(other.photo_url, other.display_name); };
    } else {
      headerAvatar.classList.remove('clickable', 'enlargeable');
      headerAvatar.innerHTML = (other ? other.display_name : 'D').charAt(0).toUpperCase();
      headerAvatar.onclick = null;
    }
  } else {
    headerAvatar.style.display = 'none';
  }
  await loadMessages(convId);
  if(convo.type !== 'system' && convo.type !== 'admin_inbox') document.getElementById('chatInput').focus();
}

async function loadMessages(convId, isPolling) {
  try {
    const r = await fetch(API_BASE+'/api/chat/messages/'+convId+'?trader='+encodeURIComponent(STATE.trader.trader_name));
    const d = await r.json();
    if(d.success) renderMessages(d.messages, isPolling);
    // Mark as read
    fetch(API_BASE+'/api/chat/mark-read/'+convId+'/'+encodeURIComponent(STATE.trader.trader_name),{method:'POST'}).catch(()=>{});
    const c = CHAT_STATE.conversations.find(c=>c.id===convId);
    if(c) c.unread = 0;
    updateUnreadBadge();
  } catch(e) {}
}

function renderMessages(msgs, isPolling) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  // Remember scroll position — only auto-scroll if already near bottom
  const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;

  let html = '';
  let lastDate = null;
  let lastSender = null;
  let lastMsgTime = null;

  msgs.forEach(m => {
    const isMe = m.sender === STATE.trader.trader_name;
    const msgDate = new Date(m.created_at + 'Z');
    const dateLabel = msgDate.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
    const timeStr = msgDate.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});

    // Date separator between different days
    if (dateLabel !== lastDate) {
      html += `<div class="chat-date-sep"><span>${dateLabel}</span></div>`;
      lastDate = dateLabel;
      lastSender = null;
      lastMsgTime = null;
    }

    // Group consecutive messages from same sender within 5 minutes
    const timeDiff = lastMsgTime ? (msgDate - lastMsgTime) / 60000 : 999;
    const isGrouped = !m.pinned && m.sender === lastSender && timeDiff < 5;
    lastSender = m.sender;
    lastMsgTime = msgDate;

    // Reactions
    const reactions = m.reactions || [];
    let reactionsHtml = '';
    if (reactions.length) {
      reactionsHtml = '<div class="msg-reactions">' + reactions.map(r => {
        const isMine = r.traders.includes(STATE.trader.trader_name);
        const title = r.traders.join(', ');
        return `<span class="msg-reaction ${isMine ? 'mine' : ''}" title="${title}" onclick="toggleReaction(${m.id},'${r.emoji}')"><span class="react-emoji">${r.emoji}</span><span class="react-count">${r.count}</span></span>`;
      }).join('') + '</div>';
    }

    const pinIndicator = m.pinned ? '<div class="msg-pin-indicator">📌 Pinned</div>' : '';
    const deleteBtn = isMe ? `<button class="msg-action-btn" onclick="deleteMessage(${m.id})" title="Delete">🗑</button>` : '';
    const actionsHtml = `<div class="msg-actions-inline">
      <button class="msg-action-btn" onclick="showReactPicker(event,${m.id})" title="React">😊</button>
      <button class="msg-action-btn" onclick="togglePin(${m.id})" title="${m.pinned ? 'Unpin' : 'Pin'}">${m.pinned ? '📌' : '📍'}</button>
      ${deleteBtn}
    </div>`;

    const teamDot = m.team_color ? `<span style="width:6px;height:6px;border-radius:50%;background:${m.team_color};display:inline-block;flex-shrink:0"></span>` : '';
    const renderedText = m.text ? formatMentions(escapeHtml(m.text)) : '';
    const imageHtml = m.image ? `<img src="${m.image}" class="chat-img-msg" onclick="showImageLightbox(this.src)" alt="image">` : '';

    // Avatar column (other messages only)
    let avatarHtml = '';
    if (!isMe) {
      if (!isGrouped) {
        const initials = (m.display_name || '?').charAt(0).toUpperCase();
        const imgContent = m.photo_url ? `<img src="${m.photo_url}" alt="">` : initials;
        const safeDisplayName = (m.display_name || '').replace(/'/g, "\\'");
        const avatarClick = m.photo_url ? ` onclick="showImageLightbox('${m.photo_url}','${safeDisplayName}')" style="cursor:pointer"` : '';
        avatarHtml = `<div class="msg-avatar"${avatarClick}>${imgContent}</div>`;
      } else {
        avatarHtml = `<div class="msg-avatar-spacer"></div>`;
      }
    }

    html += `<div class="chat-msg ${isMe ? 'me' : 'other'}${isGrouped ? ' grouped' : ''}">
      ${!isMe ? avatarHtml : ''}
      <div class="chat-msg-content">
        ${pinIndicator}
        ${!isMe && !isGrouped ? `<div class="msg-sender">${teamDot}${m.display_name}</div>` : ''}
        ${renderedText ? `<div class="msg-bubble">${renderedText}</div>` : ''}
        ${imageHtml}
        ${reactionsHtml}
        <div class="msg-meta">
          <div class="msg-time">${timeStr}</div>
          ${actionsHtml}
        </div>
      </div>
    </div>`;
  });

  // Track last message ID to skip redundant re-renders during polling
  const newLastId = msgs.length ? msgs[msgs.length - 1].id : null;
  if (isPolling && newLastId === CHAT_STATE.lastMsgId && msgs.length === container.querySelectorAll('.chat-msg').length) {
    return; // Nothing changed — skip DOM thrash
  }
  CHAT_STATE.lastMsgId = newLastId;

  if (isPolling) container.classList.add('no-anim');
  const savedScroll = container.scrollTop;
  container.innerHTML = html;
  if (isPolling) {
    // Defer removal so browser renders one frame with animation:none
    requestAnimationFrame(() => container.classList.remove('no-anim'));
    // Preserve scroll position unless new messages arrived
    if (wasNearBottom) {
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTop = savedScroll;
    }
  } else {
    container.scrollTop = container.scrollHeight;
  }
  if (CHAT_STATE.activeConvo) loadPinnedBar(CHAT_STATE.activeConvo.id);
}

function formatMentions(text) {
  // Highlight @mentions — match @word or @"multi word"
  return text.replace(/@(\w[\w\s]*?)(?=\s|$|[.,!?&]|&amp;)/g, '<span class="mention-tag">@$1</span>');
}

function escapeHtml(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

/* --- Reactions --- */
const QUICK_REACTIONS = ['👍','🔥','📈','📉','💯','😂'];
const EMOJI_CATEGORIES = {
  'Frequent': ['👍','👎','🔥','💯','📈','📉','🎯','💰','🚀','⚡','✅','❌','👀','🤝','💪','🙏'],
  'Trading':  ['📈','📉','💰','💵','💸','🏦','📊','📋','🛢️','⛽','💎','🪙','📦','🔔','⏰','🧾'],
  'Smileys':  ['😂','😅','🤣','😊','😎','🤔','😬','😱','🥳','😤','🫡','🤯','😏','🙄','😭','🥲'],
  'Hands':    ['👍','👎','👏','🤝','💪','✌️','🤞','👋','🫶','🙏','🤙','👊','✊','🫰','🤌','☝️'],
  'Objects':  ['🚀','⚡','🔥','💡','🎯','🏆','⭐','❤️','💔','🔒','🔓','📌','🗑️','✏️','📎','🔗']
};

let _emojiPickerMsgId = null;

function showReactPicker(event, msgId) {
  event.stopPropagation();
  closePickers();
  _emojiPickerMsgId = msgId;

  const btn = event.currentTarget;
  const actionsDiv = btn.closest('.msg-actions-inline');
  const msgEl = btn.closest('.chat-msg');

  const picker = document.createElement('div');
  picker.className = 'emoji-picker';
  picker.onclick = (e) => e.stopPropagation();

  // Quick bar
  let html = '<div class="emoji-quick-bar">';
  QUICK_REACTIONS.forEach(e => {
    html += `<button class="emoji-quick-btn" onclick="pickEmoji('${e}')">${e}</button>`;
  });
  html += '</div>';

  // Search
  html += '<div class="emoji-search-wrap"><input class="emoji-search" placeholder="Search emoji..." oninput="filterEmojis(this.value)"></div>';

  // Category tabs
  const cats = Object.keys(EMOJI_CATEGORIES);
  html += '<div class="emoji-tabs">';
  cats.forEach((cat, i) => {
    html += `<button class="emoji-tab${i===0?' active':''}" onclick="switchEmojiTab(this,'${cat}')">${cat}</button>`;
  });
  html += '</div>';

  // Emoji grid (show first category by default)
  html += '<div class="emoji-grid" id="emojiGrid">';
  EMOJI_CATEGORIES[cats[0]].forEach(e => {
    html += `<button class="emoji-cell" onclick="pickEmoji('${e}')">${e}</button>`;
  });
  html += '</div>';

  picker.innerHTML = html;

  // Position: above or below the message depending on space
  const chatPanel = document.getElementById('chatPanel');
  actionsDiv.after(picker);
  actionsDiv.classList.add('picker-open');

  // Focus search
  setTimeout(() => { const s = picker.querySelector('.emoji-search'); if (s) s.focus(); }, 50);

  // Auto-close on outside click
  setTimeout(() => {
    document.addEventListener('click', function _close(ev) {
      if (!picker.contains(ev.target) && !btn.contains(ev.target)) {
        closePickers();
        document.removeEventListener('click', _close);
      }
    });
  }, 10);
}

function pickEmoji(emoji) {
  if (_emojiPickerMsgId) toggleReaction(_emojiPickerMsgId, emoji);
  closePickers();
}

function switchEmojiTab(btn, cat) {
  btn.parentElement.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const grid = document.getElementById('emojiGrid');
  if (!grid) return;
  const emojis = EMOJI_CATEGORIES[cat] || [];
  grid.innerHTML = emojis.map(e => `<button class="emoji-cell" onclick="pickEmoji('${e}')">${e}</button>`).join('');
}

function filterEmojis(query) {
  const grid = document.getElementById('emojiGrid');
  if (!grid) return;
  if (!query.trim()) {
    // Reset to active tab
    const activeTab = document.querySelector('.emoji-tab.active');
    if (activeTab) switchEmojiTab(activeTab, activeTab.textContent);
    return;
  }
  // Search across all categories (match by showing all)
  const all = [];
  const seen = new Set();
  Object.values(EMOJI_CATEGORIES).forEach(arr => arr.forEach(e => { if (!seen.has(e)) { seen.add(e); all.push(e); } }));
  grid.innerHTML = all.map(e => `<button class="emoji-cell" onclick="pickEmoji('${e}')">${e}</button>`).join('');
}

function closePickers() {
  document.querySelectorAll('.emoji-picker').forEach(p => p.remove());
  document.querySelectorAll('.react-picker-inline').forEach(p => p.remove());
  document.querySelectorAll('.msg-actions-inline.picker-open').forEach(a => a.classList.remove('picker-open'));
  _emojiPickerMsgId = null;
}

async function toggleReaction(msgId, emoji) {
  if (!STATE.trader) return;
  try {
    const r = await fetch(API_BASE + '/api/chat/reactions/' + msgId, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ trader: STATE.trader.trader_name, emoji })
    });
    const d = await r.json();
    if (d.success && CHAT_STATE.activeConvo) {
      await loadMessages(CHAT_STATE.activeConvo.id);
    }
  } catch(e) {}
}

/* --- Delete Messages --- */
async function deleteMessage(msgId) {
  if (!STATE.trader || !CHAT_STATE.activeConvo) return;
  try {
    const r = await fetch(API_BASE + '/api/chat/messages/' + msgId + '/delete', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ trader: STATE.trader.trader_name })
    });
    const d = await r.json();
    if (d.success) {
      await loadMessages(CHAT_STATE.activeConvo.id);
    } else { toast(d.error || 'Delete failed', 'error'); }
  } catch(e) { toast('Failed to delete message', 'error'); }
}

/* --- Pinned Messages --- */
async function togglePin(msgId) {
  if (!STATE.trader || !CHAT_STATE.activeConvo) return;
  try {
    const r = await fetch(API_BASE + '/api/chat/pins/' + CHAT_STATE.activeConvo.id + '/' + msgId, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ trader: STATE.trader.trader_name })
    });
    const d = await r.json();
    if (d.success) {
      toast(d.action === 'pinned' ? 'Message pinned' : 'Message unpinned', 'info');
      await loadMessages(CHAT_STATE.activeConvo.id);
    } else { toast(d.error || 'Pin failed', 'error'); }
  } catch(e) {}
}

async function loadPinnedBar(convId) {
  try {
    const r = await fetch(API_BASE + '/api/chat/pins/' + convId);
    const d = await r.json();
    const bar = document.getElementById('chatPinnedBar');
    if (d.success && d.pins.length > 0) {
      const latest = d.pins[0];
      document.getElementById('chatPinnedText').textContent = latest.display_name + ': ' + latest.text.substring(0, 60) + (latest.text.length > 60 ? '...' : '');
      bar.style.display = 'flex';
      bar._pins = d.pins;
    } else {
      bar.style.display = 'none';
    }
  } catch(e) {}
}

function showPinnedMessages() {
  const bar = document.getElementById('chatPinnedBar');
  const pins = bar._pins || [];
  if (!pins.length) return;
  const container = document.getElementById('chatMessages');
  const savedScroll = container.scrollTop;
  // Show pinned messages as a temporary overlay
  const overlay = document.createElement('div');
  overlay.id = 'pinnedOverlay';
  overlay.style.cssText = 'position:absolute;inset:0;background:var(--surface);z-index:5;overflow-y:auto;padding:14px';
  overlay.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
    '<h4 style="font-size:14px;font-weight:700;color:var(--amber)">📌 Pinned Messages (' + pins.length + ')</h4>' +
    '<button class="btn btn-ghost btn-sm" onclick="closePinnedOverlay()">Close</button></div>' +
    pins.map(p => {
      const time = new Date(p.msg_time+'Z').toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',month:'short',day:'numeric'});
      const teamDot = p.team_color ? `<span style="width:6px;height:6px;border-radius:50%;background:${p.team_color};display:inline-block"></span>` : '';
      return `<div style="padding:10px;background:var(--surface2);border-radius:8px;margin-bottom:8px;border-left:3px solid var(--amber)">
        <div style="font-size:12px;font-weight:600;color:var(--text-dim);margin-bottom:4px">${teamDot} ${p.display_name} · ${time}</div>
        <div style="font-size:13px;color:var(--text)">${formatMentions(escapeHtml(p.text))}</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:6px;font-size:11px" onclick="togglePin(${p.message_id})">Unpin</button>
      </div>`;
    }).join('');
  container.style.position = 'relative';
  container.appendChild(overlay);
}

function closePinnedOverlay() {
  const overlay = document.getElementById('pinnedOverlay');
  if (overlay) overlay.remove();
}

/* --- @Mention Autocomplete --- */
let mentionState = { active: false, query: '', startPos: 0, selectedIdx: 0, members: [] };

function chatInputKeydown(event) {
  const dropdown = document.getElementById('mentionDropdown');
  if (mentionState.active && dropdown.classList.contains('open')) {
    const options = dropdown.querySelectorAll('.mention-option');
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      mentionState.selectedIdx = Math.min(mentionState.selectedIdx + 1, options.length - 1);
      updateMentionSelection(options);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      mentionState.selectedIdx = Math.max(mentionState.selectedIdx - 1, 0);
      updateMentionSelection(options);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      if (options[mentionState.selectedIdx]) {
        insertMention(options[mentionState.selectedIdx].dataset.name);
      }
    } else if (event.key === 'Escape') {
      closeMentionDropdown();
    }
  } else if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatSend();
  }
}

function chatInputChanged() {
  const input = document.getElementById('chatInput');
  // Auto-grow textarea
  if (input.tagName === 'TEXTAREA') {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }
  const val = input.value;
  const cursorPos = input.selectionStart;

  // Find if cursor is right after an @mention query
  const beforeCursor = val.substring(0, cursorPos);
  const atMatch = beforeCursor.match(/@(\w*)$/);

  if (atMatch) {
    mentionState.active = true;
    mentionState.query = atMatch[1].toLowerCase();
    mentionState.startPos = atMatch.index;
    showMentionDropdown();
  } else {
    closeMentionDropdown();
  }
}

function showMentionDropdown() {
  const dropdown = document.getElementById('mentionDropdown');
  // Get conversation members
  const members = CHAT_STATE.activeConvo ? (CHAT_STATE.activeConvo.members || []) : [];
  const filtered = members.filter(m => {
    if (m.trader_name === STATE.trader.trader_name) return false;
    if (!mentionState.query) return true;
    return m.display_name.toLowerCase().includes(mentionState.query) ||
           m.trader_name.toLowerCase().includes(mentionState.query);
  });

  if (!filtered.length) { closeMentionDropdown(); return; }

  mentionState.selectedIdx = 0;
  dropdown.innerHTML = filtered.map((m, i) => {
    const teamDot = m.team_color ? `<span style="width:8px;height:8px;border-radius:50%;background:${m.team_color};display:inline-block"></span>` : '';
    return `<div class="mention-option ${i===0?'active':''}" data-name="${m.display_name}" onclick="insertMention('${m.display_name.replace(/'/g,"\\'")}')">
      ${teamDot}<span class="mention-name">${m.display_name}</span>
      <span class="mention-team">${m.team_name || ''}</span>
    </div>`;
  }).join('');
  dropdown.classList.add('open');
}

function updateMentionSelection(options) {
  options.forEach((o, i) => o.classList.toggle('active', i === mentionState.selectedIdx));
}

function insertMention(displayName) {
  const input = document.getElementById('chatInput');
  const val = input.value;
  const before = val.substring(0, mentionState.startPos);
  const after = val.substring(input.selectionStart);
  input.value = before + '@' + displayName + ' ' + after;
  input.focus();
  const newPos = before.length + displayName.length + 2;
  input.setSelectionRange(newPos, newPos);
  closeMentionDropdown();
}

function closeMentionDropdown() {
  mentionState.active = false;
  document.getElementById('mentionDropdown').classList.remove('open');
}

let _chatPendingImage = null;

function chatImageSelected(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (!file.type.startsWith('image/')) { toast('Please select an image','error'); input.value=''; return; }
  if (file.size > 5*1024*1024) { toast('Image too large (max 5 MB)','error'); input.value=''; return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    _chatPendingImage = e.target.result;
    document.getElementById('chatImgThumb').src = _chatPendingImage;
    document.getElementById('chatImgPreview').style.display = 'block';
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function showImageLightbox(src, caption) {
  const existing = document.getElementById('chatImgLightbox');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'chatImgLightbox';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:zoom-out;gap:12px';
  overlay.innerHTML = '<img src="' + src + '" style="max-width:90vw;max-height:85vh;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5)">'
    + (caption ? '<div style="color:#fff;font-size:14px;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.5)">' + caption + '</div>' : '');
  overlay.onclick = function() { overlay.remove(); };
  document.body.appendChild(overlay);
}

function clearChatImage() {
  _chatPendingImage = null;
  document.getElementById('chatImgPreview').style.display = 'none';
  document.getElementById('chatImgThumb').src = '';
}

async function chatSend() {
  if(!CHAT_STATE.activeConvo||!STATE.trader) return;
  if(CHAT_STATE.activeConvo.type === 'system' || CHAT_STATE.activeConvo.type === 'admin_inbox') { toast('This is a read-only broadcast channel','error'); return; }
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  const hasImage = !!_chatPendingImage;
  if(!text && !hasImage) return;
  const payload = { sender: STATE.trader.trader_name, text: text || '' };
  if (hasImage) payload.image = _chatPendingImage;
  input.value = '';
  if (input.tagName === 'TEXTAREA') input.style.height = 'auto';
  clearChatImage();
  try {
    await fetch(API_BASE+'/api/chat/send/'+CHAT_STATE.activeConvo.id,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    await loadMessages(CHAT_STATE.activeConvo.id);
  } catch(e) { toast('Failed to send message','error'); }
}

function chatShowList() {
  CHAT_STATE.activeConvo = null;
  CHAT_STATE.showingPicker = false;
  document.getElementById('chatConvoList').style.display = 'block';
  document.getElementById('chatMsgView').style.display = 'none';
  document.getElementById('chatBackBtn').style.display = 'none';
  document.getElementById('chatNewBtn').style.display = 'block';
  document.getElementById('chatNewGroupBtn').style.display = 'block';
  document.getElementById('chatRenameBtn').style.display = 'none';
  document.getElementById('chatAddMembersBtn').style.display = 'none';
  document.getElementById('chatCallBtn').style.display = 'none';
  document.getElementById('chatVideoBtn').style.display = 'none';
  document.getElementById('chatHeaderAvatar').style.display = 'none';
  document.getElementById('chatTitle').textContent = 'Messages';
  loadConversations();
}

async function chatRenameConvo() {
  if(!CHAT_STATE.activeConvo||CHAT_STATE.activeConvo.type!=='group') return;
  const current = CHAT_STATE.activeConvo.name || '';
  const newName = prompt('Rename group chat:', current);
  if(!newName || newName.trim() === current) return;
  try {
    const r = await fetch(API_BASE+'/api/chat/conversations/'+CHAT_STATE.activeConvo.id+'/rename', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({trader:STATE.trader.trader_name, name:newName.trim()})
    });
    const d = await r.json();
    if(d.success) {
      CHAT_STATE.activeConvo.name = d.name;
      document.getElementById('chatTitle').textContent = d.name;
      toast('Group renamed to "'+d.name+'"', 'success');
    } else { toast(d.error||'Rename failed','error'); }
  } catch(e) { toast('Failed to rename','error'); }
}

function chatAvatarClick() {
  if (!CHAT_STATE.activeConvo) return;
  if (CHAT_STATE.activeConvo.type !== 'group' && CHAT_STATE.activeConvo.type !== 'team') return;
  document.getElementById('chatAvatarFileInput').click();
}

async function chatAvatarUpload(input) {
  if (!input.files || !input.files[0]) return;
  if (!CHAT_STATE.activeConvo || !STATE.trader) return;
  const file = input.files[0];
  if (!file.type.startsWith('image/')) { toast('Please select an image file', 'error'); return; }
  if (file.size > 5 * 1024 * 1024) { toast('Image too large (max 5 MB)', 'error'); return; }
  const convId = CHAT_STATE.activeConvo.id;
  const formData = new FormData();
  formData.append('image', file);
  formData.append('trader', STATE.trader.trader_name);
  try {
    const r = await fetch(API_BASE + '/api/chat/conversations/' + convId + '/avatar', {
      method: 'POST', body: formData
    });
    const d = await r.json();
    if (d.success) {
      CHAT_STATE.activeConvo.avatar = d.avatar;
      // Update header avatar
      const headerAvatar = document.getElementById('chatHeaderAvatar');
      headerAvatar.innerHTML = '<img src="' + d.avatar + '" alt="">';
      // Update in conversations list cache
      const cached = CHAT_STATE.conversations.find(c => c.id === convId);
      if (cached) cached.avatar = d.avatar;
      toast('Group photo updated', 'success');
    } else { toast(d.error || 'Upload failed', 'error'); }
  } catch(e) { toast('Failed to upload avatar', 'error'); }
  input.value = ''; // Reset so same file can be re-selected
}

async function chatAddMembers() {
  if(!CHAT_STATE.activeConvo || CHAT_STATE.activeConvo.type !== 'group') return;
  CHAT_STATE.showingAddMembers = true;
  const convId = CHAT_STATE.activeConvo.id;

  // Get current members
  let currentMembers = new Set();
  try {
    const r = await fetch(API_BASE+'/api/chat/conversations/'+convId+'/members');
    const d = await r.json();
    if(d.success) d.members.forEach(m => currentMembers.add(m.trader_name));
  } catch(e) {}

  // Get all traders
  let allTraders = [];
  try {
    const r = await fetch(API_BASE+'/api/leaderboard');
    const d = await r.json();
    if(d.leaderboard) allTraders = d.leaderboard;
    else if(Array.isArray(d)) allTraders = d;
  } catch(e) { toast('Failed to load traders','error'); return; }

  // Filter to non-members only
  const available = allTraders.filter(t => !currentMembers.has(t.trader_name));
  if(!available.length) { toast('All traders are already in this group','info'); return; }

  // Show picker in message area
  const msgView = document.getElementById('chatMsgView');
  const msgContainer = document.getElementById('chatMessages');
  const savedHtml = msgContainer.innerHTML;

  msgContainer.innerHTML = `<div style="padding:8px">
    <h4 style="margin:0 0 8px;font-size:13px;color:var(--text-dim)">Add members to ${CHAT_STATE.activeConvo.name || 'group'}</h4>
    <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Current members: ${currentMembers.size}</p>
    <div id="addMembersList">${available.map(t => {
      const teamDot = t.team ? `<span style="width:8px;height:8px;border-radius:50%;background:${t.team.color||'var(--accent)'};display:inline-block"></span>` : '';
      return `<div class="chat-convo-item" style="gap:8px" onclick="doAddMember('${t.trader_name}','${(t.display_name||'').replace(/'/g,"\\'")}',${convId},this)">
        <div class="convo-avatar">${(t.display_name||'?')[0].toUpperCase()}</div>
        <div class="convo-info"><div class="convo-name">${teamDot} ${t.display_name}</div><div class="convo-preview">${t.firm||''}</div></div>
        <span style="font-size:11px;color:var(--accent);font-weight:600">+ Add</span>
      </div>`;
    }).join('')}</div>
    <button class="btn btn-ghost btn-sm" onclick="chatDoneAdding()" style="width:100%;margin-top:12px">Done</button>
  </div>`;
  window._chatAddMembersSavedHtml = savedHtml;
}

async function doAddMember(traderName, displayName, convId, el) {
  try {
    const r = await fetch(API_BASE+'/api/chat/conversations/'+convId+'/members', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({trader:STATE.trader.trader_name, members:[traderName]})
    });
    const d = await r.json();
    if(d.success) {
      toast(displayName + ' added to group', 'success');
      if(el) { el.style.opacity='0.4'; el.style.pointerEvents='none'; el.querySelector('span:last-child').textContent='✓ Added'; }
    } else { toast(d.error||'Failed to add','error'); }
  } catch(e) { toast('Failed to add member','error'); }
}

function chatDoneAdding() {
  CHAT_STATE.showingAddMembers = false;
  // Reload the conversation messages
  if(CHAT_STATE.activeConvo) {
    loadMessages(CHAT_STATE.activeConvo.id);
    loadConversations();
  }
}

async function chatNewConvo() {
  if(!STATE.trader) return;
  // Make sure we're showing the list view, not the message view
  document.getElementById('chatMsgView').style.display = 'none';
  document.getElementById('chatConvoList').style.display = 'block';
  document.getElementById('chatBackBtn').style.display = 'none';
  document.getElementById('chatRenameBtn').style.display = 'none';
  document.getElementById('chatAddMembersBtn').style.display = 'none';
  document.getElementById('chatCallBtn').style.display = 'none';
  document.getElementById('chatVideoBtn').style.display = 'none';
  CHAT_STATE.activeConvo = null;
  CHAT_STATE.showingPicker = true;
  let traders = [];
  try {
    const r = await fetch(API_BASE+'/api/leaderboard');
    const d = await r.json();
    // Leaderboard returns {success, leaderboard: [...]} — handle all formats
    if(Array.isArray(d)) {
      traders = d.filter(t=>t.trader_name!==STATE.trader.trader_name);
    } else if(d.leaderboard) {
      traders = d.leaderboard.filter(t=>t.trader_name!==STATE.trader.trader_name);
    } else if(d.traders) {
      traders = d.traders.filter(t=>t.trader_name!==STATE.trader.trader_name);
    }
  } catch(e) { console.warn('chatNewConvo fetch error:', e); toast('Failed to load traders','error'); return; }
  if(!traders.length) { toast('No other traders to message','error'); return; }

  const list = document.getElementById('chatConvoList');
  list.innerHTML = `<div style="padding:8px"><h4 style="margin:0 0 8px;font-size:13px;color:var(--text-dim)">Start a conversation</h4>
    <div style="margin-bottom:12px"><input id="chatSearchTrader" placeholder="Search traders..." style="width:100%;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px" oninput="filterChatTraders()"></div>
    <div id="chatTraderPicker">${traders.map(t=>{
      const teamDot = t.team?`<span style="width:8px;height:8px;border-radius:50%;background:${t.team.color||'var(--accent)'};display:inline-block"></span>`:'';
      return `<div class="chat-convo-item" onclick="startDm('${t.trader_name}')">${t.photo_url ? `<div class="convo-avatar"><img src="${t.photo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>` : `<div class="convo-avatar">${(t.display_name||'?')[0].toUpperCase()}</div>`}<div class="convo-info"><div class="convo-name">${teamDot} ${t.display_name}</div><div class="convo-preview">${t.firm||''}</div></div></div>`;
    }).join('')}</div>
  </div>`;
  window._chatTraders = traders;
}

function chatNewGroup() {
  if(!STATE.trader) return;
  // Show group creation UI directly in the convo list area
  document.getElementById('chatMsgView').style.display = 'none';
  document.getElementById('chatConvoList').style.display = 'block';
  document.getElementById('chatBackBtn').style.display = 'none';
  document.getElementById('chatRenameBtn').style.display = 'none';
  document.getElementById('chatAddMembersBtn').style.display = 'none';
  document.getElementById('chatCallBtn').style.display = 'none';
  document.getElementById('chatVideoBtn').style.display = 'none';
  CHAT_STATE.activeConvo = null;
  CHAT_STATE.showingPicker = true;
  const list = document.getElementById('chatConvoList');
  list.innerHTML = `<div style="padding:12px">
    <h4 style="margin:0 0 12px;font-size:13px;color:var(--text-dim)">Create a Group Chat</h4>
    <input id="chatGroupName" placeholder="Group name" style="width:100%;padding:8px;margin-bottom:12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
    <button class="btn btn-primary btn-sm" onclick="createGroup()" style="width:100%">Create Group</button>
    <button class="btn btn-ghost btn-sm" onclick="loadConversations()" style="width:100%;margin-top:8px">Cancel</button>
  </div>`;
}

function filterChatTraders() {
  const q = (document.getElementById('chatSearchTrader').value||'').toLowerCase();
  const picker = document.getElementById('chatTraderPicker');
  if(!picker) return;
  const traders = window._chatTraders || [];
  picker.innerHTML = traders.filter(t=>(t.display_name||'').toLowerCase().includes(q)).map(t=>{
    const teamDot = t.team?`<span style="width:8px;height:8px;border-radius:50%;background:${t.team.color||'var(--accent)'};display:inline-block"></span>`:'';
    return `<div class="chat-convo-item" onclick="startDm('${t.trader_name}')">${t.photo_url ? `<div class="convo-avatar"><img src="${t.photo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>` : `<div class="convo-avatar">${(t.display_name||'?')[0].toUpperCase()}</div>`}<div class="convo-info"><div class="convo-name">${teamDot} ${t.display_name}</div><div class="convo-preview">${t.firm||''}</div></div></div>`;
  }).join('');
}

async function startDm(traderName) {
  try {
    const r = await fetch(API_BASE+'/api/chat/conversations',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'dm',members:[traderName],creator:STATE.trader.trader_name})
    });
    const d = await r.json();
    if(d.success) {
      await loadConversations();
      openConvo(d.conversation_id);
    }
  } catch(e) { toast('Failed to create DM','error'); }
}

async function createGroup() {
  const name = (document.getElementById('chatGroupName').value||'').trim();
  if(!name) { toast('Enter a group name','error'); return; }
  // For now create with just yourself — others can be added later
  try {
    const r = await fetch(API_BASE+'/api/chat/conversations',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'group',name:name,members:[],creator:STATE.trader.trader_name})
    });
    const d = await r.json();
    if(d.success) { await loadConversations(); openConvo(d.conversation_id); }
  } catch(e) { toast('Failed to create group','error'); }
}

async function pollChat() {
  if(!STATE.trader||!CHAT_STATE.open) return;
  if(CHAT_STATE.activeConvo && !CHAT_STATE.showingAddMembers) {
    await loadMessages(CHAT_STATE.activeConvo.id, true);
  }
  // Refresh unread counts (but don't overwrite picker)
  try {
    const r = await fetch(API_BASE+'/api/chat/conversations/'+encodeURIComponent(STATE.trader.trader_name));
    const d = await r.json();
    if(d.success) {
      CHAT_STATE.conversations = d.conversations;
      updateUnreadBadge();
      if(!CHAT_STATE.activeConvo && !CHAT_STATE.showingPicker) renderConvoList();
    }
  } catch(e) {}
}

// Listen for real-time messages via socketio
var socket = null; // global for call system
if(typeof io !== 'undefined') {
  try {
    const sock = io ? io() : null;
    socket = sock;
    if(sock) {
      // Register trader name → sid mapping on connect (for call routing)
      sock.on('connect', function() {
        if (STATE.trader && STATE.trader.trader_name) {
          sock.emit('register_trader', { trader_name: STATE.trader.trader_name });
        }
      });
      sock.on('new_message', function(data) {
        // Ignore own messages
        if(data.sender === (STATE.trader||{}).trader_name) {
          if(CHAT_STATE.activeConvo && CHAT_STATE.activeConvo.id === data.conversation_id) {
            loadMessages(data.conversation_id);
          }
          return;
        }
        // If chat is open and viewing this conversation, refresh
        if(CHAT_STATE.activeConvo && CHAT_STATE.activeConvo.id === data.conversation_id) {
          loadMessages(data.conversation_id);
        } else {
          // Increment unread
          const c = CHAT_STATE.conversations.find(c=>c.id===data.conversation_id);
          if(c) { c.unread = (c.unread||0)+1; updateUnreadBadge(); renderConvoList(); }
          else { loadConversations(); }
        }
        // Force badge update even if conversations not loaded
        if (!CHAT_STATE.conversations.length) {
          loadConversations();
        } else {
          updateUnreadBadge();
        }
        // Show toast with message preview
        const senderName = data.display_name || data.sender || 'Someone';
        const preview = (data.text || '').substring(0, 80) + ((data.text||'').length > 80 ? '…' : '');
        toast('💬 ' + senderName + ': ' + preview, 'info');
      });
      sock.on('trade_feed_update', function() { fetchTradeFeed(); });
      sock.on('mention_notification', function(data) {
        // Only show if this mention is for the current user
        if (data.mentioned_trader === (STATE.trader||{}).trader_name) {
          addNotification('price', '@Mention', data.sender_display + ' mentioned you: ' + data.text_preview);
          playSound('alert');
          toast(data.sender_display + ' mentioned you in chat', 'info');
        }
      });
      sock.on('reaction_update', function(data) {
        // If viewing the conversation with this message, refresh
        if (CHAT_STATE.activeConvo) loadMessages(CHAT_STATE.activeConvo.id);
      });
      sock.on('pin_update', function(data) {
        if (CHAT_STATE.activeConvo && CHAT_STATE.activeConvo.id === data.conversation_id) {
          loadMessages(CHAT_STATE.activeConvo.id);
        }
      });
      sock.on('message_deleted', function(data) {
        if (CHAT_STATE.activeConvo && CHAT_STATE.activeConvo.id === data.conversation_id) {
          loadMessages(CHAT_STATE.activeConvo.id);
        }
      });
      sock.on('trade_submitted', function(data) {
        if(data.otc && data.trader_name === (STATE.trader||{}).trader_name) {
          toast('OTC trade assigned to your book — check blotter','info');
        }
      });
      sock.on('admin_broadcast', async function(data) {
        const isUrgent = data.priority === 'urgent';

        // Reload conversations to pick up the system broadcast conversation + unread count
        await loadConversations();

        // Toast notification
        if (isUrgent) {
            playSound('alert');
            toast('🔴 URGENT BROADCAST: ' + (data.subject || data.body.slice(0, 60)), 'error');
        } else {
            toast('📡 New broadcast: ' + (data.subject || data.body.slice(0, 60)), 'info');
        }
      });
      sock.on('trader_reset', function(data) {
        if (STATE.trader && (data.trader_name === STATE.trader.trader_name || data.trader_name === '__all__')) {
          STATE.trades = [];
          STATE.pendingOrders = [];
          localStorage.setItem(traderStorageKey('trades'), '[]');
          localStorage.setItem(traderStorageKey('pending_orders'), '[]');
          toast('Your trades have been reset by an administrator.', 'info');
          renderCurrentPage();
        }
      });
      // Init voice call socket listeners
      initCallSocketListeners();
    }
  } catch(e) {}
}

async function sendAdminMessage() {
  if (!STATE.trader) { toast('Please log in first', 'error'); return; }
  const subject = (document.getElementById('adminMsgSubject').value || '').trim();
  const body = (document.getElementById('adminMsgBody').value || '').trim();
  const status = document.getElementById('adminMsgStatus');
  if (!body) { toast('Please enter a message', 'error'); return; }
  try {
    const r = await fetch(API_BASE + '/api/chat/message-admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: STATE.trader.trader_name, subject, body })
    });
    const d = await r.json();
    if (d.success) {
      document.getElementById('adminMsgSubject').value = '';
      document.getElementById('adminMsgBody').value = '';
      status.style.display = 'block';
      status.style.color = 'var(--green)';
      status.textContent = '✓ Message sent to admin successfully';
      setTimeout(() => { status.style.display = 'none'; }, 4000);
      toast('Message sent to admin', 'success');
    } else {
      toast(d.error || 'Failed to send', 'error');
    }
  } catch (e) { toast('Failed to send message to admin', 'error'); }
}

function initChat() {
  try {
    document.getElementById('chatTab').style.display = 'none';
    var hcb = document.getElementById('headerChatBtn'); if(hcb) hcb.style.display = STATE.trader ? 'flex' : 'none';
  } catch(e) {}
  // Register trader on socket for call routing
  if(STATE.trader && socket && socket.connected) {
    socket.emit('register_trader', { trader_name: STATE.trader.trader_name });
  }
  // Load conversations immediately so badge shows
  if(STATE.trader) {
    fetch(API_BASE+'/api/chat/conversations/'+encodeURIComponent(STATE.trader.trader_name))
      .then(r=>r.json()).then(d=>{
        if(d.success) { CHAT_STATE.conversations = d.conversations; updateUnreadBadge(); }
      }).catch(()=>{});
  }
  // Background unread polling even when chat is closed
  setInterval(async ()=>{
    if(!STATE.trader||CHAT_STATE.open) return;
    try {
      const r = await fetch(API_BASE+'/api/chat/conversations/'+encodeURIComponent(STATE.trader.trader_name));
      const d = await r.json();
      if(d.success) { CHAT_STATE.conversations = d.conversations; updateUnreadBadge(); }
    } catch(e){}
  }, 15000);
}


/* =====================================================================
   CALL SYSTEM (WebRTC) — Audio + Video
   ===================================================================== */
const CALL_STATE = {
  active: false,
  peer: null,           // RTCPeerConnection
  localStream: null,
  remoteStream: null,
  remoteTarget: null,   // trader name of the other party
  isCaller: false,
  muted: false,
  videoOff: false,
  callType: 'audio',    // 'audio' or 'video'
  timerInterval: null,
  startTime: null,
  ringTimeout: null,    // caller-side unanswered timeout
  disconnectTimeout: null, // delay before ending on 'disconnected'
  iceRestarted: false,  // track if we already tried ICE restart
  pendingCandidates: [], // buffer ICE candidates before peer is ready
  incomingOffer: null,
  incomingCaller: null,
  incomingCallType: 'audio',
  incomingDismissTimeout: null, // 30s auto-dismiss timer
  remoteAudio: null     // stored ref for cleanup (audio-only calls)
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

function getCallTargetName() {
  const convo = CHAT_STATE.activeConvo;
  if (!convo || convo.type !== 'dm' || !convo.members) return null;
  const me = STATE.trader ? STATE.trader.trader_name : '';
  const others = convo.members.filter(m => (m.trader_name || m) !== me);
  return others.length === 1 ? (others[0].trader_name || others[0]) : null;
}

async function startCall(type) {
  if (CALL_STATE.active) { toast('Already in a call', 'error'); return; }
  const target = getCallTargetName();
  if (!target) { toast('Calls only work in DM conversations', 'error'); return; }

  const constraints = { audio: true, video: type === 'video' };
  try {
    CALL_STATE.localStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch(e) {
    toast(type === 'video' ? 'Camera/microphone access denied' : 'Microphone access denied', 'error');
    return;
  }

  CALL_STATE.active = true;
  CALL_STATE.isCaller = true;
  CALL_STATE.remoteTarget = target;
  CALL_STATE.muted = false;
  CALL_STATE.videoOff = false;
  CALL_STATE.callType = type;

  showCallOverlay('Calling...', target, type);

  // Auto-cancel if no answer in 45s
  CALL_STATE.ringTimeout = setTimeout(() => {
    if (CALL_STATE.active && !CALL_STATE.startTime) {
      toast('No answer', 'info');
      endCall();
    }
  }, 45000);

  try {
    CALL_STATE.peer = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 5 });
    CALL_STATE.localStream.getTracks().forEach(t => CALL_STATE.peer.addTrack(t, CALL_STATE.localStream));

    // Show local video preview
    if (type === 'video') {
      const localVid = document.getElementById('callLocalVideo');
      if (localVid) { localVid.srcObject = CALL_STATE.localStream; localVid.play().catch(()=>{}); }
    }

    CALL_STATE.peer.onicecandidate = (e) => {
      if (e.candidate && typeof socket !== 'undefined') {
        socket.emit('call_ice', { target, candidate: e.candidate, from: STATE.trader.trader_name });
      }
    };

    CALL_STATE.peer.ontrack = (e) => {
      const stream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
      CALL_STATE.remoteStream = stream;
      if (CALL_STATE.callType === 'video') {
        // Video element handles both audio and video
        const remoteVid = document.getElementById('callRemoteVideo');
        if (remoteVid) {
          remoteVid.srcObject = stream;
          remoteVid.play().catch(()=>{});
        }
      } else {
        // Audio-only: use a separate Audio element
        if (!CALL_STATE.remoteAudio) {
          CALL_STATE.remoteAudio = new Audio();
        }
        CALL_STATE.remoteAudio.srcObject = stream;
        CALL_STATE.remoteAudio.play().catch(() => {});
      }
    };

    CALL_STATE.peer.oniceconnectionstatechange = () => {
      if (!CALL_STATE.peer) return;
      const st = CALL_STATE.peer.iceConnectionState;
      console.log('[Call] ICE state:', st);
      if (st === 'connected' || st === 'completed') {
        CALL_STATE.iceRestarted = false;
        if (CALL_STATE.ringTimeout) { clearTimeout(CALL_STATE.ringTimeout); CALL_STATE.ringTimeout = null; }
        if (CALL_STATE.disconnectTimeout) { clearTimeout(CALL_STATE.disconnectTimeout); CALL_STATE.disconnectTimeout = null; }
        document.getElementById('callStatus').textContent = 'Connected';
        if (!CALL_STATE.startTime) startCallTimer();
      } else if (st === 'failed') {
        // Try one ICE restart before giving up
        if (!CALL_STATE.iceRestarted && CALL_STATE.peer) {
          CALL_STATE.iceRestarted = true;
          console.log('[Call] ICE failed, attempting restart...');
          document.getElementById('callStatus').textContent = 'Reconnecting...';
          CALL_STATE.peer.createOffer({ iceRestart: true }).then(offer => {
            return CALL_STATE.peer.setLocalDescription(offer);
          }).then(() => {
            if (typeof socket !== 'undefined') {
              socket.emit('call_restart', {
                from: STATE.trader.trader_name,
                target: CALL_STATE.remoteTarget,
                offer: CALL_STATE.peer.localDescription
              });
            }
          }).catch(() => { endCall(); });
        } else {
          endCall();
        }
      } else if (st === 'disconnected') {
        if (!CALL_STATE.disconnectTimeout) {
          CALL_STATE.disconnectTimeout = setTimeout(() => {
            if (CALL_STATE.peer && CALL_STATE.peer.iceConnectionState === 'disconnected') {
              endCall();
            }
            CALL_STATE.disconnectTimeout = null;
          }, 5000);
        }
      }
    };

    const offer = await CALL_STATE.peer.createOffer();
    await CALL_STATE.peer.setLocalDescription(offer);

    if (typeof socket !== 'undefined') {
      socket.emit('call_initiate', {
        caller: STATE.trader.trader_name,
        callee: target,
        offer: CALL_STATE.peer.localDescription,
        callType: type
      });
    }
  } catch(e) {
    toast('Failed to start call', 'error');
    endCallLocal();
  }
}

function startVoiceCall() { startCall('audio'); }
function startVideoCall() { startCall('video'); }

async function acceptCall() {
  if (!CALL_STATE.incomingOffer || !CALL_STATE.incomingCaller) return;

  const type = CALL_STATE.incomingCallType || 'audio';
  const constraints = { audio: true, video: type === 'video' };
  try {
    CALL_STATE.localStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch(e) {
    toast(type === 'video' ? 'Camera/microphone access denied' : 'Microphone access denied', 'error');
    rejectCall();
    return;
  }

  CALL_STATE.active = true;
  CALL_STATE.isCaller = false;
  CALL_STATE.remoteTarget = CALL_STATE.incomingCaller;
  CALL_STATE.muted = false;
  CALL_STATE.videoOff = false;
  CALL_STATE.callType = type;
  CALL_STATE.pendingCandidates = CALL_STATE.pendingCandidates || []; // keep buffered candidates

  // Clear the 30s auto-dismiss timer
  if (CALL_STATE.incomingDismissTimeout) { clearTimeout(CALL_STATE.incomingDismissTimeout); CALL_STATE.incomingDismissTimeout = null; }

  document.getElementById('callIncoming').style.display = 'none';
  showCallOverlay('Connecting...', CALL_STATE.remoteTarget, type);

  try {
    CALL_STATE.peer = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 5 });
    CALL_STATE.localStream.getTracks().forEach(t => CALL_STATE.peer.addTrack(t, CALL_STATE.localStream));

    if (type === 'video') {
      const localVid = document.getElementById('callLocalVideo');
      if (localVid) { localVid.srcObject = CALL_STATE.localStream; localVid.play().catch(()=>{}); }
    }

    CALL_STATE.peer.onicecandidate = (e) => {
      if (e.candidate && typeof socket !== 'undefined') {
        socket.emit('call_ice', { target: CALL_STATE.remoteTarget, candidate: e.candidate, from: STATE.trader.trader_name });
      }
    };

    CALL_STATE.peer.ontrack = (e) => {
      const stream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
      CALL_STATE.remoteStream = stream;
      if (CALL_STATE.callType === 'video') {
        const remoteVid = document.getElementById('callRemoteVideo');
        if (remoteVid) {
          remoteVid.srcObject = stream;
          remoteVid.play().catch(()=>{});
        }
      } else {
        if (!CALL_STATE.remoteAudio) {
          CALL_STATE.remoteAudio = new Audio();
        }
        CALL_STATE.remoteAudio.srcObject = stream;
        CALL_STATE.remoteAudio.play().catch(() => {});
      }
      document.getElementById('callStatus').textContent = 'Connected';
      if (!CALL_STATE.startTime) startCallTimer();
    };

    CALL_STATE.peer.oniceconnectionstatechange = () => {
      if (!CALL_STATE.peer) return;
      const st = CALL_STATE.peer.iceConnectionState;
      console.log('[Call] ICE state (acceptor):', st);
      if (st === 'failed') {
        endCall();
      } else if (st === 'disconnected') {
        if (!CALL_STATE.disconnectTimeout) {
          CALL_STATE.disconnectTimeout = setTimeout(() => {
            if (CALL_STATE.peer && CALL_STATE.peer.iceConnectionState === 'disconnected') {
              endCall();
            }
            CALL_STATE.disconnectTimeout = null;
          }, 5000);
        }
      } else if (st === 'connected' || st === 'completed') {
        CALL_STATE.iceRestarted = false;
        if (CALL_STATE.disconnectTimeout) { clearTimeout(CALL_STATE.disconnectTimeout); CALL_STATE.disconnectTimeout = null; }
      }
    };

    await CALL_STATE.peer.setRemoteDescription(new RTCSessionDescription(CALL_STATE.incomingOffer));
    // Flush any ICE candidates that arrived while waiting to accept
    while (CALL_STATE.pendingCandidates.length > 0) {
      const c = CALL_STATE.pendingCandidates.shift();
      try { await CALL_STATE.peer.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
    }
    const answer = await CALL_STATE.peer.createAnswer();
    await CALL_STATE.peer.setLocalDescription(answer);

    if (typeof socket !== 'undefined') {
      socket.emit('call_answer', {
        caller: CALL_STATE.incomingCaller,
        callee: STATE.trader.trader_name,
        answer: CALL_STATE.peer.localDescription
      });
    }
  } catch(e) {
    toast('Failed to connect call', 'error');
    endCallLocal();
  }

  CALL_STATE.incomingOffer = null;
  CALL_STATE.incomingCaller = null;
  CALL_STATE.incomingCallType = 'audio';
}

// Keep old name as alias for backwards compat in HTML onclick
function acceptVoiceCall() { acceptCall(); }

function rejectCall() {
  if (CALL_STATE.incomingDismissTimeout) { clearTimeout(CALL_STATE.incomingDismissTimeout); CALL_STATE.incomingDismissTimeout = null; }
  document.getElementById('callIncoming').style.display = 'none';
  if (typeof socket !== 'undefined' && CALL_STATE.incomingCaller) {
    socket.emit('call_reject', { caller: CALL_STATE.incomingCaller, callee: STATE.trader ? STATE.trader.trader_name : '' });
  }
  CALL_STATE.incomingOffer = null;
  CALL_STATE.incomingCaller = null;
  CALL_STATE.incomingCallType = 'audio';
  CALL_STATE.pendingCandidates = [];
}
function rejectVoiceCall() { rejectCall(); }

function endCall() {
  if (!CALL_STATE.active && !CALL_STATE.peer) return; // guard against double-end
  // Capture target before cleanup clears it
  const target = CALL_STATE.remoteTarget;
  endCallLocal();
  // Send end signal after cleanup so we don't react to our own signal
  if (typeof socket !== 'undefined' && target) {
    socket.emit('call_end', { target, from: STATE.trader ? STATE.trader.trader_name : '' });
  }
}
function endVoiceCall() { endCall(); }

function endCallLocal() {
  if (CALL_STATE.ringTimeout) { clearTimeout(CALL_STATE.ringTimeout); CALL_STATE.ringTimeout = null; }
  if (CALL_STATE.disconnectTimeout) { clearTimeout(CALL_STATE.disconnectTimeout); CALL_STATE.disconnectTimeout = null; }
  if (CALL_STATE.incomingDismissTimeout) { clearTimeout(CALL_STATE.incomingDismissTimeout); CALL_STATE.incomingDismissTimeout = null; }
  if (CALL_STATE.peer) {
    // Remove handlers to prevent callbacks during close
    CALL_STATE.peer.oniceconnectionstatechange = null;
    CALL_STATE.peer.onicecandidate = null;
    CALL_STATE.peer.ontrack = null;
    try { CALL_STATE.peer.close(); } catch(e){}
    CALL_STATE.peer = null;
  }
  if (CALL_STATE.localStream) { CALL_STATE.localStream.getTracks().forEach(t => t.stop()); CALL_STATE.localStream = null; }
  if (CALL_STATE.remoteAudio) { CALL_STATE.remoteAudio.pause(); CALL_STATE.remoteAudio.srcObject = null; CALL_STATE.remoteAudio = null; }
  CALL_STATE.remoteStream = null;
  if (CALL_STATE.timerInterval) { clearInterval(CALL_STATE.timerInterval); CALL_STATE.timerInterval = null; }

  CALL_STATE.active = false;
  CALL_STATE.remoteTarget = null;
  CALL_STATE.isCaller = false;
  CALL_STATE.muted = false;
  CALL_STATE.videoOff = false;
  CALL_STATE.startTime = null;
  CALL_STATE.callType = 'audio';
  CALL_STATE.iceRestarted = false;
  CALL_STATE.pendingCandidates = [];
  CALL_STATE.incomingOffer = null;
  CALL_STATE.incomingCaller = null;
  CALL_STATE.incomingCallType = 'audio';

  // Clear video elements — pause before clearing srcObject
  const lv = document.getElementById('callLocalVideo');
  const rv = document.getElementById('callRemoteVideo');
  if (lv) { lv.pause(); lv.srcObject = null; }
  if (rv) { rv.pause(); rv.srcObject = null; }

  document.getElementById('callOverlay').style.display = 'none';
  document.getElementById('callIncoming').style.display = 'none';
}

function toggleCallMute() {
  CALL_STATE.muted = !CALL_STATE.muted;
  if (CALL_STATE.localStream) {
    CALL_STATE.localStream.getAudioTracks().forEach(t => { t.enabled = !CALL_STATE.muted; });
  }
  const btn = document.getElementById('callMuteBtn');
  if (btn) btn.classList.toggle('active', CALL_STATE.muted);
}

function toggleCallVideo() {
  if (CALL_STATE.callType !== 'video') return;
  CALL_STATE.videoOff = !CALL_STATE.videoOff;
  if (CALL_STATE.localStream) {
    CALL_STATE.localStream.getVideoTracks().forEach(t => { t.enabled = !CALL_STATE.videoOff; });
  }
  const btn = document.getElementById('callVideoToggleBtn');
  if (btn) btn.classList.toggle('active', CALL_STATE.videoOff);
  const localVid = document.getElementById('callLocalVideo');
  if (localVid) localVid.style.opacity = CALL_STATE.videoOff ? '0.3' : '1';
}

function showCallOverlay(status, name, type) {
  document.getElementById('callStatus').textContent = status;
  document.getElementById('callName').textContent = name;
  document.getElementById('callTimer').style.display = 'none';

  const overlay = document.getElementById('callOverlay');
  const videoArea = document.getElementById('callVideoArea');
  const avatarArea = document.getElementById('callAvatarArea');
  const videoToggle = document.getElementById('callVideoToggleBtn');

  // Show/hide video area
  if (type === 'video') {
    overlay.classList.add('video-mode');
    if (videoArea) videoArea.style.display = 'flex';
    if (avatarArea) avatarArea.style.display = 'none';
    if (videoToggle) videoToggle.style.display = 'flex';
  } else {
    overlay.classList.remove('video-mode');
    if (videoArea) videoArea.style.display = 'none';
    if (avatarArea) avatarArea.style.display = 'flex';
    if (videoToggle) videoToggle.style.display = 'none';
  }

  overlay.style.display = 'flex';
  const muteBtn = document.getElementById('callMuteBtn');
  if (muteBtn) muteBtn.classList.remove('active');
  if (videoToggle) videoToggle.classList.remove('active');
}

function startCallTimer() {
  CALL_STATE.startTime = Date.now();
  const timerEl = document.getElementById('callTimer');
  timerEl.style.display = 'block';
  CALL_STATE.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - CALL_STATE.startTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    timerEl.textContent = m + ':' + s;
  }, 1000);
}

// Socket listeners for call events
function initCallSocketListeners() {
  if (typeof socket === 'undefined') return;

  socket.on('call_incoming', (data) => {
    if (CALL_STATE.active) {
      socket.emit('call_reject', { caller: data.caller, callee: STATE.trader ? STATE.trader.trader_name : '' });
      return;
    }
    CALL_STATE.incomingCaller = data.caller;
    CALL_STATE.incomingOffer = data.offer;
    CALL_STATE.incomingCallType = data.callType || 'audio';
    CALL_STATE.pendingCandidates = []; // clear stale candidates from any previous call

    const isVideo = CALL_STATE.incomingCallType === 'video';
    document.getElementById('callIncomingLabel').textContent = isVideo ? 'Incoming Video Call' : 'Incoming Voice Call';
    document.getElementById('callIncomingName').textContent = data.caller;
    document.getElementById('callIncomingIcon').innerHTML = isVideo
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
    document.getElementById('callIncoming').style.display = 'block';

    // Auto-dismiss after 30s — store timeout so it can be cleared on accept
    if (CALL_STATE.incomingDismissTimeout) clearTimeout(CALL_STATE.incomingDismissTimeout);
    CALL_STATE.incomingDismissTimeout = setTimeout(() => {
      if (CALL_STATE.incomingCaller === data.caller) rejectCall();
      CALL_STATE.incomingDismissTimeout = null;
    }, 30000);
  });

  // ICE restart: other side re-offers on the existing call
  socket.on('call_restart', async (data) => {
    if (!CALL_STATE.active || !CALL_STATE.peer) return;
    // Only accept restart from current call partner
    if (data.from !== CALL_STATE.remoteTarget) return;
    try {
      console.log('[Call] Received ICE restart offer');
      await CALL_STATE.peer.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await CALL_STATE.peer.createAnswer();
      await CALL_STATE.peer.setLocalDescription(answer);
      if (typeof socket !== 'undefined') {
        socket.emit('call_answer', {
          caller: data.from,
          callee: STATE.trader.trader_name,
          answer: CALL_STATE.peer.localDescription
        });
      }
    } catch(e) {
      console.log('[Call] ICE restart failed:', e.message);
    }
  });

  socket.on('call_answered', async (data) => {
    if (!CALL_STATE.peer) return;
    try {
      await CALL_STATE.peer.setRemoteDescription(new RTCSessionDescription(data.answer));
      // Flush any buffered ICE candidates now that remote description is set
      while (CALL_STATE.pendingCandidates.length > 0) {
        const c = CALL_STATE.pendingCandidates.shift();
        try { await CALL_STATE.peer.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
      }
      if (CALL_STATE.ringTimeout) { clearTimeout(CALL_STATE.ringTimeout); CALL_STATE.ringTimeout = null; }
      document.getElementById('callStatus').textContent = 'Connected';
      if (!CALL_STATE.startTime) startCallTimer();
    } catch(e) {
      toast('Connection error', 'error');
      endCallLocal();
    }
  });

  socket.on('call_ice', async (data) => {
    // Buffer candidates if peer doesn't exist yet or remote description not set
    if (!CALL_STATE.peer || !CALL_STATE.peer.remoteDescription) {
      CALL_STATE.pendingCandidates.push(data.candidate);
      return;
    }
    try {
      await CALL_STATE.peer.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch(e) { console.log('[Call] ICE candidate error:', e.message); }
  });

  socket.on('call_ended', () => {
    if (CALL_STATE.active) {
      toast('Call ended', 'info');
      endCallLocal();
    }
  });

  socket.on('call_rejected', (data) => {
    toast((data.callee || 'User') + ' declined the call', 'info');
    endCallLocal();
  });

  socket.on('call_error', (data) => {
    toast(data.error || 'Call failed', 'error');
    endCallLocal();
  });
}

function endVoiceCallLocal() { endCallLocal(); }

