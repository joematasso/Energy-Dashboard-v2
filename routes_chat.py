#!/usr/bin/env python3
"""Chat routes: conversations, messages, reactions, pins."""

import json
import re
from datetime import datetime

from flask import Blueprint, request, jsonify

from app import get_db, socketio
from routes_admin import censor_text

chat_bp = Blueprint('chat', __name__)

# ---------------------------------------------------------------------------
# Chat Rename
# ---------------------------------------------------------------------------
@chat_bp.route('/api/chat/conversations/<int:conv_id>/rename', methods=['POST'])
def rename_conversation(conv_id):
    db = get_db()
    data = request.get_json()
    trader = data.get('trader', '')
    new_name = data.get('name', '').strip()
    if not new_name:
        return jsonify({'success': False, 'error': 'Name required'}), 400
    if len(new_name) > 50:
        return jsonify({'success': False, 'error': 'Name too long (max 50 chars)'}), 400
    # Verify membership
    member = db.execute("SELECT * FROM conversation_members WHERE conversation_id=? AND trader_name=?",
                        (conv_id, trader)).fetchone()
    if not member:
        return jsonify({'success': False, 'error': 'Not a member'}), 403
    # Only allow renaming group conversations
    conv = db.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
    if not conv or conv['type'] not in ('group',):
        return jsonify({'success': False, 'error': 'Can only rename group chats'}), 400
    db.execute("UPDATE conversations SET name=? WHERE id=?", (new_name, conv_id))
    db.commit()
    return jsonify({'success': True, 'name': new_name})


@chat_bp.route('/api/chat/conversations/<int:conv_id>/avatar', methods=['POST'])
def set_conversation_avatar(conv_id):
    """Upload and resize a group chat avatar to ~128x128, store as base64."""
    from PIL import Image
    import io, base64
    db = get_db()
    trader = request.form.get('trader', '')
    if not trader:
        return jsonify({'success': False, 'error': 'Trader required'}), 400
    member = db.execute("SELECT * FROM conversation_members WHERE conversation_id=? AND trader_name=?",
                        (conv_id, trader)).fetchone()
    if not member:
        return jsonify({'success': False, 'error': 'Not a member'}), 403
    conv = db.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
    if not conv or conv['type'] not in ('group', 'team'):
        return jsonify({'success': False, 'error': 'Avatars only for group/team chats'}), 400

    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No image file provided'}), 400
    file = request.files['image']
    if not file.filename:
        return jsonify({'success': False, 'error': 'Empty file'}), 400

    try:
        img = Image.open(file.stream)
        img = img.convert('RGB')
        # Crop to square from center, then resize
        w, h = img.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
        img = img.resize((128, 128), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=80)
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        avatar_data = f"data:image/jpeg;base64,{b64}"
    except Exception as e:
        return jsonify({'success': False, 'error': f'Image processing failed: {str(e)}'}), 400

    db.execute("UPDATE conversations SET avatar=? WHERE id=?", (avatar_data, conv_id))
    db.commit()
    return jsonify({'success': True, 'avatar': avatar_data})


@chat_bp.route('/api/chat/conversations/<int:conv_id>/members', methods=['GET'])
def get_conversation_members(conv_id):
    db = get_db()
    members = db.execute("""
        SELECT t.trader_name, t.display_name, tm.name as team_name, tm.color as team_color
        FROM conversation_members cm
        JOIN traders t ON cm.trader_name=t.trader_name
        LEFT JOIN teams tm ON t.team_id=tm.id
        WHERE cm.conversation_id=?
    """, (conv_id,)).fetchall()
    return jsonify({'success': True, 'members': [{
        'trader_name': m['trader_name'], 'display_name': m['display_name'],
        'team_name': m['team_name'] or '', 'team_color': m['team_color'] or '#888'
    } for m in members]})


@chat_bp.route('/api/chat/conversations/<int:conv_id>/members', methods=['POST'])
def add_conversation_members(conv_id):
    db = get_db()
    data = request.get_json()
    trader = data.get('trader', '')
    new_members = data.get('members', [])
    if not new_members:
        return jsonify({'success': False, 'error': 'No members specified'}), 400
    # Verify requester is a member
    member = db.execute("SELECT * FROM conversation_members WHERE conversation_id=? AND trader_name=?",
                        (conv_id, trader)).fetchone()
    if not member:
        return jsonify({'success': False, 'error': 'Not a member'}), 403
    # Only allow adding to group conversations
    conv = db.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
    if not conv or conv['type'] != 'group':
        return jsonify({'success': False, 'error': 'Can only add members to group chats'}), 400
    added = []
    for m in new_members:
        t = db.execute("SELECT trader_name FROM traders WHERE trader_name=? AND status='ACTIVE'", (m,)).fetchone()
        if t:
            db.execute("INSERT OR IGNORE INTO conversation_members (conversation_id, trader_name) VALUES (?, ?)",
                       (conv_id, m))
            added.append(m)
    db.commit()
    return jsonify({'success': True, 'added': added, 'count': len(added)})



# Chat System
# ---------------------------------------------------------------------------
@chat_bp.route('/api/chat/conversations/<trader>', methods=['GET'])
def get_conversations(trader):
    db = get_db()
    rows = db.execute("""
        SELECT c.id, c.name, c.type, c.team_id, c.avatar, cm.last_read,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.created_at > cm.last_read AND m.sender != ?) as unread,
            (SELECT m.text FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) as last_msg,
            (SELECT m.sender FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) as last_sender,
            (SELECT m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) as last_msg_time
        FROM conversations c
        JOIN conversation_members cm ON c.id=cm.conversation_id AND cm.trader_name=?
        ORDER BY last_msg_time DESC NULLS LAST
    """, (trader, trader)).fetchall()
    convos = []
    for r in rows:
        members = db.execute("""
            SELECT t.trader_name, t.display_name, tm.name as team_name, tm.color as team_color
            FROM conversation_members cm JOIN traders t ON cm.trader_name=t.trader_name
            LEFT JOIN teams tm ON t.team_id=tm.id WHERE cm.conversation_id=?
        """, (r['id'],)).fetchall()
        convos.append({
            'id': r['id'], 'name': r['name'], 'type': r['type'], 'team_id': r['team_id'],
            'avatar': r['avatar'] or '',
            'unread': r['unread'] or 0, 'last_msg': r['last_msg'], 'last_sender': r['last_sender'],
            'last_msg_time': r['last_msg_time'],
            'members': [{'trader_name': m['trader_name'], 'display_name': m['display_name'],
                         'team_name': m['team_name'] or '', 'team_color': m['team_color'] or '#888'} for m in members]
        })
    return jsonify({'success': True, 'conversations': convos})

@chat_bp.route('/api/chat/conversations', methods=['POST'])
def create_conversation():
    db = get_db()
    data = request.get_json()
    conv_type = data.get('type', 'dm')
    name = data.get('name', '')
    members = data.get('members', [])
    creator = data.get('creator', '')
    if not creator:
        return jsonify({'success': False, 'error': 'Creator required'}), 400
    if conv_type == 'dm' and len(members) == 1:
        other = members[0]
        existing = db.execute("""
            SELECT c.id FROM conversations c WHERE c.type='dm' AND
                EXISTS (SELECT 1 FROM conversation_members cm1 WHERE cm1.conversation_id=c.id AND cm1.trader_name=?) AND
                EXISTS (SELECT 1 FROM conversation_members cm2 WHERE cm2.conversation_id=c.id AND cm2.trader_name=?)
        """, (creator, other)).fetchone()
        if existing:
            return jsonify({'success': True, 'conversation_id': existing['id'], 'existing': True})
    cur = db.execute("INSERT INTO conversations (name, type) VALUES (?, ?)", (name, conv_type))
    conv_id = cur.lastrowid
    for m in set(members + [creator]):
        db.execute("INSERT OR IGNORE INTO conversation_members (conversation_id, trader_name) VALUES (?, ?)", (conv_id, m))
    db.commit()
    return jsonify({'success': True, 'conversation_id': conv_id})

@chat_bp.route('/api/chat/team-conversation/<trader>', methods=['POST'])
def ensure_team_conversation(trader):
    db = get_db()
    me = db.execute("SELECT * FROM traders WHERE trader_name=?", (trader,)).fetchone()
    if not me or not me['team_id']:
        return jsonify({'success': False, 'error': 'No team'}), 400
    team = db.execute("SELECT * FROM teams WHERE id=?", (me['team_id'],)).fetchone()
    existing = db.execute("SELECT id FROM conversations WHERE type='team' AND team_id=?", (me['team_id'],)).fetchone()
    if existing:
        db.execute("INSERT OR IGNORE INTO conversation_members (conversation_id, trader_name) VALUES (?, ?)", (existing['id'], trader))
        db.commit()
        return jsonify({'success': True, 'conversation_id': existing['id']})
    cur = db.execute("INSERT INTO conversations (name, type, team_id) VALUES (?, 'team', ?)", (team['name'], me['team_id']))
    conv_id = cur.lastrowid
    teammates = db.execute("SELECT trader_name FROM traders WHERE team_id=? AND status='ACTIVE'", (me['team_id'],)).fetchall()
    for t in teammates:
        db.execute("INSERT OR IGNORE INTO conversation_members (conversation_id, trader_name) VALUES (?, ?)", (conv_id, t['trader_name']))
    db.commit()
    return jsonify({'success': True, 'conversation_id': conv_id})

@chat_bp.route('/api/chat/messages/<int:conv_id>', methods=['GET'])
def get_messages(conv_id):
    db = get_db()
    trader = request.args.get('trader', '')
    member = db.execute("SELECT * FROM conversation_members WHERE conversation_id=? AND trader_name=?", (conv_id, trader)).fetchone()
    if not member:
        return jsonify({'success': False, 'error': 'Not a member'}), 403
    limit = int(request.args.get('limit', 100))
    rows = db.execute("""
        SELECT m.*, t.display_name, tm.name as team_name, tm.color as team_color
        FROM messages m JOIN traders t ON m.sender=t.trader_name
        LEFT JOIN teams tm ON t.team_id=tm.id
        WHERE m.conversation_id=? ORDER BY m.id DESC LIMIT ?
    """, (conv_id, limit)).fetchall()
    db.execute("UPDATE conversation_members SET last_read=CURRENT_TIMESTAMP WHERE conversation_id=? AND trader_name=?", (conv_id, trader))
    db.commit()

    # Fetch reactions and pins in batch for all returned messages
    msg_ids = [r['id'] for r in rows]
    reactions_map = {}
    pins_set = set()
    if msg_ids:
        placeholders = ','.join('?' * len(msg_ids))
        react_rows = db.execute(f"""
            SELECT message_id, emoji, GROUP_CONCAT(trader_name) as traders, COUNT(*) as count
            FROM message_reactions WHERE message_id IN ({placeholders}) GROUP BY message_id, emoji
        """, msg_ids).fetchall()
        for rr in react_rows:
            mid = rr['message_id']
            if mid not in reactions_map:
                reactions_map[mid] = []
            reactions_map[mid].append({'emoji': rr['emoji'], 'traders': rr['traders'].split(','), 'count': rr['count']})
        pin_rows = db.execute(f"SELECT message_id FROM pinned_messages WHERE conversation_id=? AND message_id IN ({placeholders})",
                              [conv_id] + msg_ids).fetchall()
        pins_set = {pr['message_id'] for pr in pin_rows}

    return jsonify({'success': True, 'messages': [{
        'id': r['id'], 'sender': r['sender'], 'display_name': r['display_name'],
        'team_name': r['team_name'] or '', 'team_color': r['team_color'] or '#888',
        'text': r['text'], 'created_at': r['created_at'],
        'reactions': reactions_map.get(r['id'], []),
        'pinned': r['id'] in pins_set
    } for r in reversed(rows)]})

@chat_bp.route('/api/chat/send/<int:conv_id>', methods=['POST'])
def send_message(conv_id):
    db = get_db()
    data = request.get_json()
    sender = data.get('sender', '')
    text = data.get('text', '').strip()
    if not text:
        return jsonify({'success': False, 'error': 'Empty message'}), 400
    if len(text) > 2000:
        return jsonify({'success': False, 'error': 'Too long'}), 400
    member = db.execute("SELECT * FROM conversation_members WHERE conversation_id=? AND trader_name=?", (conv_id, sender)).fetchone()
    if not member:
        return jsonify({'success': False, 'error': 'Not a member'}), 403
    # Apply word filter
    text = censor_text(text)
    cur = db.execute("INSERT INTO messages (conversation_id, sender, text) VALUES (?, ?, ?)", (conv_id, sender, text))
    db.commit()
    msg_id = cur.lastrowid
    db.execute("UPDATE conversation_members SET last_read=CURRENT_TIMESTAMP WHERE conversation_id=? AND trader_name=?", (conv_id, sender))
    db.commit()
    sender_info = db.execute("""
        SELECT t.display_name, tm.name as team_name, tm.color as team_color
        FROM traders t LEFT JOIN teams tm ON t.team_id=tm.id WHERE t.trader_name=?
    """, (sender,)).fetchone()
    socketio.emit('new_message', {
        'conversation_id': conv_id, 'id': msg_id, 'sender': sender,
        'display_name': sender_info['display_name'] if sender_info else sender,
        'team_name': sender_info['team_name'] if sender_info else '',
        'team_color': sender_info['team_color'] if sender_info else '#888',
        'text': text, 'created_at': datetime.utcnow().isoformat()
    })

    # Detect @mentions and emit notifications
    import re as _re
    mentions = _re.findall(r'@(\w[\w\s]*?)(?=\s|$|[.,!?])', text)
    if mentions:
        # Get all conversation members to match display names
        members = db.execute("""
            SELECT t.trader_name, t.display_name FROM conversation_members cm
            JOIN traders t ON cm.trader_name=t.trader_name
            WHERE cm.conversation_id=?
        """, (conv_id,)).fetchall()
        sender_display = sender_info['display_name'] if sender_info else sender
        for mention in mentions:
            mention_lower = mention.strip().lower()
            for member in members:
                if (member['display_name'].lower().startswith(mention_lower) or
                    member['trader_name'].lower() == mention_lower):
                    if member['trader_name'] != sender:
                        socketio.emit('mention_notification', {
                            'mentioned_trader': member['trader_name'],
                            'sender_display': sender_display,
                            'conversation_id': conv_id,
                            'text_preview': text[:100]
                        })

    return jsonify({'success': True, 'message_id': msg_id})

@chat_bp.route('/api/chat/mark-read/<int:conv_id>/<trader>', methods=['POST'])
def mark_read(conv_id, trader):
    db = get_db()
    db.execute("UPDATE conversation_members SET last_read=CURRENT_TIMESTAMP WHERE conversation_id=? AND trader_name=?", (conv_id, trader))
    db.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Chat Reactions
# ---------------------------------------------------------------------------
@chat_bp.route('/api/chat/reactions/<int:message_id>', methods=['GET'])
def get_reactions(message_id):
    db = get_db()
    rows = db.execute("""
        SELECT emoji, GROUP_CONCAT(trader_name) as traders, COUNT(*) as count
        FROM message_reactions WHERE message_id=? GROUP BY emoji
    """, (message_id,)).fetchall()
    reactions = [{'emoji': r['emoji'], 'traders': r['traders'].split(','), 'count': r['count']} for r in rows]
    return jsonify({'success': True, 'reactions': reactions})


@chat_bp.route('/api/chat/reactions/<int:message_id>', methods=['POST'])
def toggle_reaction(message_id):
    db = get_db()
    data = request.get_json()
    trader = data.get('trader', '')
    emoji = data.get('emoji', '')
    if not trader or not emoji:
        return jsonify({'success': False, 'error': 'Trader and emoji required'}), 400
    # Check if reaction exists
    existing = db.execute(
        "SELECT id FROM message_reactions WHERE message_id=? AND trader_name=? AND emoji=?",
        (message_id, trader, emoji)
    ).fetchone()
    if existing:
        db.execute("DELETE FROM message_reactions WHERE id=?", (existing['id'],))
        action = 'removed'
    else:
        db.execute(
            "INSERT INTO message_reactions (message_id, trader_name, emoji) VALUES (?, ?, ?)",
            (message_id, trader, emoji)
        )
        action = 'added'
    db.commit()
    # Return updated reactions for this message
    rows = db.execute("""
        SELECT emoji, GROUP_CONCAT(trader_name) as traders, COUNT(*) as count
        FROM message_reactions WHERE message_id=? GROUP BY emoji
    """, (message_id,)).fetchall()
    reactions = [{'emoji': r['emoji'], 'traders': r['traders'].split(','), 'count': r['count']} for r in rows]
    # Broadcast reaction update
    socketio.emit('reaction_update', {'message_id': message_id, 'reactions': reactions})
    return jsonify({'success': True, 'action': action, 'reactions': reactions})


# Batch fetch reactions for multiple messages
@chat_bp.route('/api/chat/reactions-batch', methods=['POST'])
def get_reactions_batch():
    db = get_db()
    data = request.get_json()
    message_ids = data.get('message_ids', [])
    if not message_ids:
        return jsonify({'success': True, 'reactions': {}})
    placeholders = ','.join('?' * len(message_ids))
    rows = db.execute(f"""
        SELECT message_id, emoji, GROUP_CONCAT(trader_name) as traders, COUNT(*) as count
        FROM message_reactions WHERE message_id IN ({placeholders}) GROUP BY message_id, emoji
    """, message_ids).fetchall()
    result = {}
    for r in rows:
        mid = r['message_id']
        if mid not in result:
            result[mid] = []
        result[mid].append({'emoji': r['emoji'], 'traders': r['traders'].split(','), 'count': r['count']})
    return jsonify({'success': True, 'reactions': result})


# ---------------------------------------------------------------------------
# Chat Pinned Messages
# ---------------------------------------------------------------------------
@chat_bp.route('/api/chat/pins/<int:conv_id>', methods=['GET'])
def get_pinned_messages(conv_id):
    db = get_db()
    rows = db.execute("""
        SELECT p.message_id, p.pinned_by, p.created_at as pinned_at,
               m.text, m.sender, m.created_at as msg_time,
               t.display_name, tm.name as team_name, tm.color as team_color
        FROM pinned_messages p
        JOIN messages m ON p.message_id=m.id
        JOIN traders t ON m.sender=t.trader_name
        LEFT JOIN teams tm ON t.team_id=tm.id
        WHERE p.conversation_id=?
        ORDER BY p.created_at DESC
    """, (conv_id,)).fetchall()
    pins = [{
        'message_id': r['message_id'], 'pinned_by': r['pinned_by'],
        'pinned_at': r['pinned_at'], 'text': r['text'],
        'sender': r['sender'], 'display_name': r['display_name'],
        'team_name': r['team_name'] or '', 'team_color': r['team_color'] or '#888',
        'msg_time': r['msg_time']
    } for r in rows]
    return jsonify({'success': True, 'pins': pins})


@chat_bp.route('/api/chat/pins/<int:conv_id>/<int:message_id>', methods=['POST'])
def pin_message(conv_id, message_id):
    db = get_db()
    data = request.get_json()
    trader = data.get('trader', '')
    if not trader:
        return jsonify({'success': False, 'error': 'Trader required'}), 400
    # Verify membership
    member = db.execute("SELECT * FROM conversation_members WHERE conversation_id=? AND trader_name=?",
                        (conv_id, trader)).fetchone()
    if not member:
        return jsonify({'success': False, 'error': 'Not a member'}), 403
    # Toggle pin
    existing = db.execute("SELECT id FROM pinned_messages WHERE conversation_id=? AND message_id=?",
                          (conv_id, message_id)).fetchone()
    if existing:
        db.execute("DELETE FROM pinned_messages WHERE id=?", (existing['id'],))
        db.commit()
        socketio.emit('pin_update', {'conversation_id': conv_id, 'message_id': message_id, 'action': 'unpinned'})
        return jsonify({'success': True, 'action': 'unpinned'})
    else:
        # Limit to 25 pins per conversation
        count = db.execute("SELECT COUNT(*) as c FROM pinned_messages WHERE conversation_id=?", (conv_id,)).fetchone()['c']
        if count >= 25:
            return jsonify({'success': False, 'error': 'Maximum 25 pinned messages per conversation'}), 400
        db.execute("INSERT INTO pinned_messages (conversation_id, message_id, pinned_by) VALUES (?, ?, ?)",
                   (conv_id, message_id, trader))
        db.commit()
        socketio.emit('pin_update', {'conversation_id': conv_id, 'message_id': message_id, 'action': 'pinned'})
        return jsonify({'success': True, 'action': 'pinned'})


# ---------------------------------------------------------------------------
