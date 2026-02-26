/* =====================================================================
   CHAT SYSTEM
   ===================================================================== */
let CHAT_STATE = {
  open: false,
  conversations: [],
  activeConvo: null,
  showingPicker: false,
  pollTimer: null
};

function toggleChat() {
  CHAT_STATE.open = !CHAT_STATE.open;
  const panel = document.getElementById('chatPanel');
  if(CHAT_STATE.open) {
    panel.classList.add('open');
    loadConversations();
    if(!CHAT_STATE.pollTimer) CHAT_STATE.pollTimer = setInterval(pollChat, 5000);
  } else {
    panel.classList.remove('open');
    CHAT_STATE.showingPicker = false;
    if(CHAT_STATE.pollTimer) { clearInterval(CHAT_STATE.pollTimer); CHAT_STATE.pollTimer = null; }
  }
}

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
    list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px">No conversations yet.<br>Click + New to start one.</p>';
    return;
  }
  list.innerHTML = CHAT_STATE.conversations.map(c => {
    const isActive = CHAT_STATE.activeConvo && CHAT_STATE.activeConvo.id === c.id;
    const unread = c.unread > 0;
    let name = c.name || '';
    if(c.type === 'dm') {
      const other = c.members.find(m => m.trader_name !== STATE.trader.trader_name);
      name = other ? other.display_name : 'DM';
    }
    if(c.type === 'team') name = '🏢 ' + (c.name || 'Team');
    const icon = c.type === 'team' ? '🏢' : c.type === 'group' ? '👥' : '';
    const preview = c.last_msg ? (c.last_sender === STATE.trader.trader_name ? 'You: ' : '') + c.last_msg.substring(0,40) : 'No messages yet';
    const time = c.last_msg_time ? new Date(c.last_msg_time+'Z').toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';
    return `<div class="chat-convo-item ${isActive?'active':''} ${unread?'unread':''}" onclick="openConvo(${c.id})">
      <div class="convo-avatar">${c.avatar ? '<img src="'+c.avatar+'" alt="">' : (icon || name.charAt(0).toUpperCase())}</div>
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
  if(hdrBadge) { hdrBadge.textContent = total > 0 ? total : ''; hdrBadge.setAttribute('data-count', total); }
}

async function openConvo(convId) {
  const convo = CHAT_STATE.conversations.find(c=>c.id===convId);
  if(!convo) return;
  CHAT_STATE.activeConvo = convo;
  CHAT_STATE.showingPicker = false;
  document.getElementById('chatConvoList').style.display = 'none';
  const msgView = document.getElementById('chatMsgView');
  msgView.style.display = 'flex';
  document.getElementById('chatBackBtn').style.display = 'block';
  document.getElementById('chatNewBtn').style.display = 'none';
  document.getElementById('chatRenameBtn').style.display = convo.type === 'group' ? 'block' : 'none';
  document.getElementById('chatAddMembersBtn').style.display = convo.type === 'group' ? 'block' : 'none';
  let name = convo.name;
  if(convo.type==='dm') {
    const other = convo.members.find(m=>m.trader_name!==STATE.trader.trader_name);
    name = other?other.display_name:'DM';
  }
  if(convo.type==='team') name = convo.name || 'Team Chat';
  document.getElementById('chatTitle').textContent = name;

  // Header avatar
  const headerAvatar = document.getElementById('chatHeaderAvatar');
  const isGroupOrTeam = convo.type === 'group' || convo.type === 'team';
  if (isGroupOrTeam) {
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
    headerAvatar.classList.remove('clickable');
    headerAvatar.innerHTML = (other ? other.display_name : 'D').charAt(0).toUpperCase();
  } else {
    headerAvatar.style.display = 'none';
  }
  await loadMessages(convId);
  document.getElementById('chatInput').focus();
}

async function loadMessages(convId) {
  try {
    const r = await fetch(API_BASE+'/api/chat/messages/'+convId+'?trader='+encodeURIComponent(STATE.trader.trader_name));
    const d = await r.json();
    if(d.success) renderMessages(d.messages);
    // Mark as read
    fetch(API_BASE+'/api/chat/mark-read/'+convId+'/'+encodeURIComponent(STATE.trader.trader_name),{method:'POST'}).catch(()=>{});
    const c = CHAT_STATE.conversations.find(c=>c.id===convId);
    if(c) c.unread = 0;
    updateUnreadBadge();
  } catch(e) {}
}

function renderMessages(msgs) {
  const container = document.getElementById('chatMessages');
  const REACTION_EMOJIS = ['👍','🔥','📈','📉','💯','🎯'];

  container.innerHTML = msgs.map(m => {
    const isMe = m.sender === STATE.trader.trader_name;
    const time = new Date(m.created_at+'Z').toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    const teamDot = m.team_color ? `<span style="width:6px;height:6px;border-radius:50%;background:${m.team_color};display:inline-block"></span>` : '';

    // Render @mentions highlighted
    const renderedText = formatMentions(escapeHtml(m.text));

    // Reactions
    const reactions = m.reactions || [];
    let reactionsHtml = '';
    if (reactions.length) {
      reactionsHtml = '<div class="msg-reactions">' + reactions.map(r => {
        const isMine = r.traders.includes(STATE.trader.trader_name);
        const title = r.traders.join(', ');
        return `<span class="msg-reaction ${isMine?'mine':''}" title="${title}" onclick="toggleReaction(${m.id},'${r.emoji}')">`
          + `<span class="react-emoji">${r.emoji}</span><span class="react-count">${r.count}</span></span>`;
      }).join('') + '</div>';
    }

    // Pin indicator
    const pinIndicator = m.pinned ? '<div class="msg-pin-indicator">📌 Pinned</div>' : '';

    // Action buttons (react + pin) — shown on hover
    const actionsHtml = `<div class="msg-actions">
      <button class="msg-action-btn" onclick="showReactPicker(event,${m.id})" title="React">😊</button>
      <button class="msg-action-btn" onclick="togglePin(${m.id})" title="${m.pinned?'Unpin':'Pin'}">${m.pinned?'📌':'📍'}</button>
    </div>`;

    return `<div class="chat-msg ${isMe?'me':'other'}" style="position:relative">
      ${pinIndicator}
      ${!isMe?`<div class="msg-sender">${teamDot}${m.display_name}</div>`:''}
      <div class="msg-bubble">${renderedText}</div>
      ${reactionsHtml}
      <div class="msg-time" style="text-align:${isMe?'right':'left'}">${time}</div>
      ${actionsHtml}
    </div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;

  // Load pinned bar
  if (CHAT_STATE.activeConvo) loadPinnedBar(CHAT_STATE.activeConvo.id);
}

function formatMentions(text) {
  // Highlight @mentions — match @word or @"multi word"
  return text.replace(/@(\w[\w\s]*?)(?=\s|$|[.,!?&]|&amp;)/g, '<span class="mention-tag">@$1</span>');
}

function escapeHtml(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

/* --- Reactions --- */
const REACTION_EMOJIS = ['👍','🔥','📈','📉','💯','🎯'];

function showReactPicker(event, msgId) {
  event.stopPropagation();
  // Remove any existing pickers
  document.querySelectorAll('.react-picker').forEach(p => p.remove());
  const btn = event.currentTarget;
  const picker = document.createElement('div');
  picker.className = 'react-picker';
  picker.innerHTML = REACTION_EMOJIS.map(e => `<button class="react-picker-btn" onclick="toggleReaction(${msgId},'${e}');this.closest('.react-picker').remove()">${e}</button>`).join('');
  btn.closest('.msg-actions').appendChild(picker);
  // Auto-close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closePicker(ev) {
      if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', closePicker); }
    });
  }, 10);
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
  } else if (event.key === 'Enter') {
    chatSend();
  }
}

function chatInputChanged() {
  const input = document.getElementById('chatInput');
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

async function chatSend() {
  if(!CHAT_STATE.activeConvo||!STATE.trader) return;
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text) return;
  input.value = '';
  try {
    await fetch(API_BASE+'/api/chat/send/'+CHAT_STATE.activeConvo.id,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sender:STATE.trader.trader_name,text})
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
  document.getElementById('chatRenameBtn').style.display = 'none';
  document.getElementById('chatAddMembersBtn').style.display = 'none';
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
      return `<div class="chat-convo-item" onclick="startDm('${t.trader_name}')"><div class="convo-avatar">${(t.display_name||'?')[0].toUpperCase()}</div><div class="convo-info"><div class="convo-name">${teamDot} ${t.display_name}</div><div class="convo-preview">${t.firm||''}</div></div></div>`;
    }).join('')}</div>
    <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
      <h4 style="margin:0 0 8px;font-size:13px;color:var(--text-dim)">Or create a group</h4>
      <input id="chatGroupName" placeholder="Group name" style="width:100%;padding:8px;margin-bottom:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
      <button class="btn btn-primary btn-sm" onclick="createGroup()" style="width:100%">Create Group Chat</button>
    </div>
  </div>`;
  window._chatTraders = traders;
}

function filterChatTraders() {
  const q = (document.getElementById('chatSearchTrader').value||'').toLowerCase();
  const picker = document.getElementById('chatTraderPicker');
  if(!picker) return;
  const traders = window._chatTraders || [];
  picker.innerHTML = traders.filter(t=>(t.display_name||'').toLowerCase().includes(q)).map(t=>{
    const teamDot = t.team?`<span style="width:8px;height:8px;border-radius:50%;background:${t.team.color||'var(--accent)'};display:inline-block"></span>`:'';
    return `<div class="chat-convo-item" onclick="startDm('${t.trader_name}')"><div class="convo-avatar">${(t.display_name||'?')[0].toUpperCase()}</div><div class="convo-info"><div class="convo-name">${teamDot} ${t.display_name}</div><div class="convo-preview">${t.firm||''}</div></div></div>`;
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
  if(CHAT_STATE.activeConvo) {
    await loadMessages(CHAT_STATE.activeConvo.id);
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
if(typeof io !== 'undefined') {
  try {
    const sock = io ? io() : null;
    if(sock) {
      sock.on('new_message', function(data) {
        // If chat is open and viewing this conversation, refresh
        if(CHAT_STATE.activeConvo && CHAT_STATE.activeConvo.id === data.conversation_id) {
          loadMessages(data.conversation_id);
        } else {
          // Increment unread
          const c = CHAT_STATE.conversations.find(c=>c.id===data.conversation_id);
          if(c) { c.unread = (c.unread||0)+1; updateUnreadBadge(); renderConvoList(); }
          else { loadConversations(); }
        }
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
      sock.on('trade_submitted', function(data) {
        if(data.otc && data.trader_name === (STATE.trader||{}).trader_name) {
          toast('OTC trade assigned to your book — check blotter','info');
        }
      });
      sock.on('admin_broadcast', function(data) {
        const isUrgent = data.priority === 'urgent';
        const title = isUrgent ? '🔴 URGENT: ' + (data.subject || 'Admin Broadcast') : (data.subject || '📡 Admin Broadcast');
        addNotification(isUrgent ? 'broadcast-urgent' : 'broadcast', title, data.body);
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
    }
  } catch(e) {}
}

function initChat() {
  try {
    document.getElementById('chatTab').style.display = 'none';
    var hcb = document.getElementById('headerChatBtn'); if(hcb) hcb.style.display = STATE.trader ? 'flex' : 'none';
  } catch(e) {}
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


