import { execute, getAll, getOne, id, now } from '../db'
import { ConflictError, ForbiddenError, NotFoundError } from '../errors'

interface ConversationRow {
  id: string
  user_a: string
  user_b: string
  order_id: string | null
  listing_id: string | null
  created_at: string
  updated_at: string
  other_id: string
  other_nickname: string
  other_avatar: string
  listing_title: string | null
  last_message: string | null
  last_message_at: string | null
  unread_count: number
}

interface MessageRow {
  id: string
  conversation_id: string
  sender_id: string
  sender_nickname: string
  content: string
  read_at: string | null
  created_at: string
}

const conversationSelect = `
  SELECT c.*,
    CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END AS other_id,
    other.nickname AS other_nickname, other.avatar AS other_avatar,
    l.title AS listing_title,
    (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
    (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
    (SELECT COUNT(*) FROM messages m
      WHERE m.conversation_id = c.id AND m.sender_id <> ? AND m.read_at IS NULL) AS unread_count
  FROM conversations c
  JOIN users other ON other.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
  LEFT JOIN listings l ON l.id = c.listing_id
`

function conversationDto(row: ConversationRow) {
  return {
    id: row.id,
    orderId: row.order_id,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    other: {
      id: row.other_id,
      nickname: row.other_nickname,
      avatar: row.other_avatar,
    },
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    updatedAt: row.updated_at,
  }
}

function messageDto(row: MessageRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderNickname: row.sender_nickname,
    content: row.content,
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

function getConversationRow(conversationId: string, userId: string) {
  const row = getOne<ConversationRow>(
    `${conversationSelect} WHERE c.id = ?`,
    userId,
    userId,
    userId,
    conversationId,
  )
  if (!row) throw new NotFoundError('会话不存在')
  if (row.user_a !== userId && row.user_b !== userId) throw new ForbiddenError('无权访问该会话')
  return row
}

export function listConversations(userId: string) {
  const rows = getAll<ConversationRow>(
    `${conversationSelect}
     WHERE c.user_a = ? OR c.user_b = ?
     ORDER BY c.updated_at DESC`,
    userId,
    userId,
    userId,
    userId,
    userId,
  )
  return rows.map(conversationDto)
}

export function createConversationFromListing(listingId: string, userId: string) {
  const listing = getOne<{ owner_id: string; title: string; status: string }>(
    'SELECT owner_id, title, status FROM listings WHERE id = ?',
    listingId,
  )
  if (!listing) throw new NotFoundError('技能帖不存在')
  if (listing.owner_id === userId) throw new ConflictError('不能和自己发起会话')

  const [userA, userB] = [userId, listing.owner_id].sort()
  const existing = getOne<{ id: string }>(
    `SELECT id FROM conversations
     WHERE ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))
       AND listing_id = ? AND order_id IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    userA,
    userB,
    userB,
    userA,
    listingId,
  )
  if (existing) return getConversationRow(existing.id, userId)

  const timestamp = now()
  const conversationId = id('conv')
  execute(
    `INSERT INTO conversations
     (id, user_a, user_b, order_id, listing_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    conversationId,
    userA,
    userB,
    listingId,
    timestamp,
    timestamp,
  )
  return getConversationRow(conversationId, userId)
}

export function getConversation(conversationId: string, userId: string) {
  return conversationDto(getConversationRow(conversationId, userId))
}

export function getMessages(conversationId: string, userId: string) {
  const conversation = getConversationRow(conversationId, userId)
  execute(
    `UPDATE messages SET read_at = ?
     WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL`,
    now(),
    conversationId,
    userId,
  )
  return getAll<MessageRow>(
    `SELECT m.*, u.nickname AS sender_nickname
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ?
     ORDER BY m.created_at ASC
     LIMIT 300`,
    conversationId,
  ).map(messageDto)
}

export function sendMessage(conversationId: string, userId: string, content: string) {
  const conversation = getConversationRow(conversationId, userId)
  const cleanContent = content.trim()
  if (!cleanContent) throw new ConflictError('消息不能为空')
  if (cleanContent.length > 1000) throw new ConflictError('消息不能超过 1000 字')

  const timestamp = now()
  const messageId = id('msg')
  execute(
    `INSERT INTO messages (id, conversation_id, sender_id, content, read_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
    messageId,
    conversationId,
    userId,
    cleanContent,
    timestamp,
  )
  execute('UPDATE conversations SET updated_at = ? WHERE id = ?', timestamp, conversationId)

  const row = getOne<MessageRow>(
    `SELECT m.*, u.nickname AS sender_nickname
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.id = ?`,
    messageId,
  )
  if (!row) throw new Error('消息写入失败')

  return {
    message: messageDto(row),
    participants: [conversation.user_a, conversation.user_b],
  }
}

