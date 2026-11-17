import { execute, getAll, id, now, transaction } from '../db'
import { notifyUser } from './notificationService'

type ReminderType = '24H' | '1H'

interface DueOrderRow {
  id: string
  listing_title: string
  buyer_id: string
  provider_id: string
  scheduled_at: string
}

function sendReminderBatch(type: ReminderType, windowHours: number, at: string) {
  const windowEnd = new Date(new Date(at).getTime() + windowHours * 3_600_000).toISOString()
  const dueOrders = getAll<DueOrderRow>(
    `SELECT o.id, l.title AS listing_title, o.buyer_id, o.provider_id, o.scheduled_at
     FROM orders o
     JOIN listings l ON l.id = o.listing_id
     WHERE o.status IN ('ACCEPTED', 'IN_PROGRESS')
       AND o.scheduled_at > ?
       AND o.scheduled_at <= ?
       AND NOT EXISTS (
         SELECT 1 FROM order_reminders r WHERE r.order_id = o.id
       )
     ORDER BY o.scheduled_at ASC`,
    at,
    windowEnd,
  )

  let sent = 0
  for (const order of dueOrders) {
    let inserted = false
    transaction(() => {
      const result = execute(
        `INSERT OR IGNORE INTO order_reminders
         (id, order_id, type, sent_at) VALUES (?, ?, ?, ?)`,
        id('reminder'),
        order.id,
        type,
        at,
      )
      inserted = Number(result.changes) === 1
    })
    if (!inserted) continue

    const windowLabel = type === '24H' ? '24 小时' : '1 小时'
    for (const userId of [order.buyer_id, order.provider_id]) {
      try {
        notifyUser({
          userId,
          type: 'SYSTEM',
          title: `技能预约将在${windowLabel}内开始`,
          content: `「${order.listing_title}」的约定时间即将到来，请提前确认时间与地点。`,
          link: '/orders',
        })
      } catch (error) {
        console.error(`reminder notification failed for order ${order.id}`, error)
      }
    }
    sent += 1
  }
  return sent
}

export function sendDueOrderReminders(at = now()) {
  const oneHour = sendReminderBatch('1H', 1, at)
  const oneDay = sendReminderBatch('24H', 24, at)
  return { oneHour, oneDay, total: oneHour + oneDay }
}

