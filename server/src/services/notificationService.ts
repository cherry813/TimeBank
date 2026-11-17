import { execute, getAll, getOne, id, now } from '../db'
import { broadcastToUsers } from '../realtime/chatHub'

export type NotificationType = 'ORDER' | 'DISPUTE' | 'REVIEW' | 'SYSTEM'

interface NotificationRow {
  id: string
  type: NotificationType
  title: string
  content: string
  link: string
  read_at: string | null
  created_at: string
}

export interface NotificationDto {
  id: string
  type: NotificationType
  title: string
  content: string
  link: string
  readAt: string | null
  createdAt: string
}

function notificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

export function notifyUser(input: {
  userId: string
  type: NotificationType
  title: string
  content: string
  link?: string
}): NotificationDto {
  const notificationId = id('notify')
  const timestamp = now()
  execute(
    `INSERT INTO notifications
     (id, user_id, type, title, content, link, read_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    notificationId,
    input.userId,
    input.type,
    input.title,
    input.content,
    input.link || '',
    timestamp,
  )

  const row = getOne<NotificationRow>(
    'SELECT id, type, title, content, link, read_at, created_at FROM notifications WHERE id = ?',
    notificationId,
  )
  const notification = notificationDto(row!)
  broadcastToUsers([input.userId], {
    type: 'notification.new',
    data: notification,
  })
  return notification
}

export function listNotifications(userId: string, limit = 30) {
  const safeLimit = Math.min(Math.max(limit, 1), 100)
  const rows = getAll<NotificationRow>(
    `SELECT id, type, title, content, link, read_at, created_at
     FROM notifications WHERE user_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    userId,
    safeLimit,
  )
  const count = getOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL',
    userId,
  )
  return {
    items: rows.map(notificationDto),
    unreadCount: count?.total || 0,
  }
}

export function getUnreadNotificationCount(userId: string) {
  return (
    getOne<{ total: number }>(
      'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL',
      userId,
    )?.total || 0
  )
}

export function markNotificationRead(userId: string, notificationId: string) {
  execute(
    'UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?',
    now(),
    notificationId,
    userId,
  )
  return { unreadCount: getUnreadNotificationCount(userId) }
}

export function markAllNotificationsRead(userId: string) {
  execute(
    'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
    now(),
    userId,
  )
  return { unreadCount: 0 }
}

