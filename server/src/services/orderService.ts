import { execute, getAll, getOne, id, now, transaction } from '../db'
import { config } from '../config'
import {
  resolveDisputeTransition,
  transition,
  type DisputeResolution,
} from '../domain/orderStateMachine'
import { createTimeRange, rangesOverlap } from '../domain/schedule'
import { ConflictError, ForbiddenError, NotFoundError } from '../errors'
import { orderDto, type OrderRow } from '../serializers'
import { notifyUser } from './notificationService'
import type { OrderAction, OrderStatus } from '../types'

const orderSelect = `
  SELECT o.*, l.title AS listing_title, l.category AS listing_category,
         l.cover_color AS listing_color,
         buyer.nickname AS buyer_nickname, buyer.avatar AS buyer_avatar,
         provider.nickname AS provider_nickname, provider.avatar AS provider_avatar,
         (SELECT c.id FROM conversations c WHERE c.order_id = o.id LIMIT 1) AS conversation_id,
         buyer_review.rating AS buyer_review_rating,
         buyer_review.content AS buyer_review_content,
         provider_review.rating AS provider_review_rating,
         provider_review.content AS provider_review_content
  FROM orders o
  JOIN listings l ON l.id = o.listing_id
  JOIN users buyer ON buyer.id = o.buyer_id
  JOIN users provider ON provider.id = o.provider_id
  LEFT JOIN reviews buyer_review
    ON buyer_review.order_id = o.id AND buyer_review.author_id = o.buyer_id
  LEFT JOIN reviews provider_review
    ON provider_review.order_id = o.id AND provider_review.author_id = o.provider_id
`

interface ListingForOrder {
  id: string
  owner_id: string
  kind: 'OFFER' | 'REQUEST'
  coin_per_hour: number
  status: string
}

interface WalletRow {
  available: number
  frozen: number
}

interface ScheduleConflictRow {
  id: string
  buyer_id: string
  provider_id: string
  scheduled_at: string
  hours: number
  status: OrderStatus
}

export interface CreateOrderInput {
  listingId: string
  hours: number
  scheduledAt: string
  note: string
}

export interface ScheduleCheckInput {
  listingId: string
  hours: number
  scheduledAt: string
}

export interface ScheduleBusyWindowInput {
  listingId: string
  from: string
  to: string
}

const scheduleBlockingStatuses = [
  'PENDING',
  'ACCEPTED',
  'IN_PROGRESS',
  'AWAITING_CONFIRMATION',
  'DISPUTED',
] as const

export function createOrder(userId: string, input: CreateOrderInput) {
  const listing = getOne<ListingForOrder>(
    'SELECT id, owner_id, kind, coin_per_hour, status FROM listings WHERE id = ?',
    input.listingId,
  )
  if (!listing) throw new NotFoundError('技能帖不存在')
  if (listing.status !== 'ACTIVE') throw new ConflictError('该技能帖当前不可预约')
  if (listing.owner_id === userId) throw new ConflictError('不能预约自己发布的技能')

  const scheduledAt = new Date(input.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000) {
    throw new ConflictError('请选择未来的服务时间', 'INVALID_SCHEDULE')
  }

  const buyerId = listing.kind === 'OFFER' ? userId : listing.owner_id
  const providerId = listing.kind === 'OFFER' ? listing.owner_id : userId
  const coinAmount = input.hours * listing.coin_per_hour

  const duplicate = getOne<{ id: string }>(
    `SELECT id FROM orders
     WHERE listing_id = ? AND buyer_id = ? AND provider_id = ?
       AND status NOT IN ('CANCELLED', 'COMPLETED')`,
    listing.id,
    buyerId,
    providerId,
  )
  if (duplicate) throw new ConflictError('你们已有一个进行中的订单，请先处理')

  const wallet = getOne<WalletRow>('SELECT available, frozen FROM wallets WHERE user_id = ?', buyerId)
  if (!wallet) throw new NotFoundError('时间钱包不存在')
  if (wallet.available < coinAmount) {
    throw new ConflictError(
      listing.kind === 'REQUEST'
        ? '需求发布者的时间币不足，暂时无法接单'
        : '时间币不足，请先完成一项技能服务',
      'INSUFFICIENT_COINS',
    )
  }

  const orderId = id('order')
  const timestamp = now()

  transaction(() => {
    assertScheduleAvailable(buyerId, providerId, scheduledAt, input.hours)

    const reserved = execute(
      `UPDATE wallets SET available = available - ?, frozen = frozen + ?, updated_at = ?
       WHERE user_id = ? AND available >= ?`,
      coinAmount,
      coinAmount,
      timestamp,
      buyerId,
      coinAmount,
    )
    if (Number(reserved.changes) !== 1) throw new ConflictError('时间币余额发生变化，请重试')

    execute(
      `INSERT INTO orders
       (id, listing_id, buyer_id, provider_id, hours, coin_amount, status,
        scheduled_at, auto_confirm_at, note, cancel_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, NULL, ?, '', ?, ?)`,
      orderId,
      listing.id,
      buyerId,
      providerId,
      input.hours,
      coinAmount,
      scheduledAt.toISOString(),
      input.note.trim(),
      timestamp,
      timestamp,
    )

    execute(
      `INSERT INTO wallet_transactions
       (id, user_id, order_id, type, amount, balance_after, description, created_at)
       VALUES (?, ?, ?, 'RESERVE', ?, ?, ?, ?)`,
      id('txn'),
      buyerId,
      orderId,
      -coinAmount,
      wallet.available - coinAmount,
      `预约校园技能服务，冻结 ${coinAmount} 时间币`,
      timestamp,
    )

    execute(
      `INSERT INTO order_events
       (id, order_id, from_status, to_status, actor_id, action, note, created_at)
       VALUES (?, ?, NULL, 'PENDING', ?, 'CREATE', '', ?)`,
      id('event'),
      orderId,
      userId,
      timestamp,
    )

    const [userA, userB] = [buyerId, providerId].sort()
    execute(
      `INSERT INTO conversations
       (id, user_a, user_b, order_id, listing_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id('conv'),
      userA,
      userB,
      orderId,
      listing.id,
      timestamp,
      timestamp,
    )
  })

  const created = getOrder(orderId, userId)
  const recipientId = userId === buyerId ? providerId : buyerId
  safelyNotify({
    userId: recipientId,
    type: 'ORDER',
    title: listing.kind === 'OFFER' ? '收到新的技能预约' : '有人愿意帮你',
    content: `「${created.listingTitle}」新订单已创建，等待双方确认。`,
    link: `/orders?open=${orderId}`,
  })
  return created
}

export function getOrder(orderId: string, userId: string) {
  const row = getOne<OrderRow>(`${orderSelect} WHERE o.id = ?`, orderId)
  if (!row) throw new NotFoundError('订单不存在')
  if (row.buyer_id !== userId && row.provider_id !== userId) {
    throw new ForbiddenError('你不是该订单的参与者')
  }
  return orderDto(row, userId)
}

export function listOrders(userId: string, role: 'BUYER' | 'PROVIDER' | 'ALL') {
  const conditions = [role === 'BUYER' ? 'o.buyer_id = ?' : role === 'PROVIDER' ? 'o.provider_id = ?' : '(o.buyer_id = ? OR o.provider_id = ?)']
  const params = role === 'ALL' ? [userId, userId] : [userId]
  const rows = getAll<OrderRow>(
    `${orderSelect} WHERE ${conditions[0]} ORDER BY o.updated_at DESC`,
    ...params,
  )
  return rows.map((row) => orderDto(row, userId))
}

export function getOrderEvents(orderId: string, userId: string) {
  getOrder(orderId, userId)
  return getAll<{
    id: string
    from_status: OrderStatus | null
    to_status: OrderStatus
    action: string
    note: string
    created_at: string
    actor_nickname: string
  }>(
    `SELECT e.id, e.from_status, e.to_status, e.action, e.note, e.created_at,
            u.nickname AS actor_nickname
     FROM order_events e JOIN users u ON u.id = e.actor_id
     WHERE e.order_id = ? ORDER BY e.created_at`,
    orderId,
  ).map((event) => ({
    id: event.id,
    fromStatus: event.from_status,
    toStatus: event.to_status,
    action: event.action,
    note: event.note,
    createdAt: event.created_at,
    actorNickname: event.actor_nickname,
  }))
}

export function performOrderAction(
  orderId: string,
  userId: string,
  action: OrderAction,
  note = '',
) {
  const row = getOne<OrderRow>(`${orderSelect} WHERE o.id = ?`, orderId)
  if (!row) throw new NotFoundError('订单不存在')

  const actor = row.buyer_id === userId ? 'BUYER' : row.provider_id === userId ? 'PROVIDER' : null
  if (!actor) throw new ForbiddenError('你不是该订单的参与者')

  const nextStatus = transition(row.status, action, actor)
  if (!nextStatus) {
    throw new ConflictError('当前订单状态不允许执行此操作', 'INVALID_TRANSITION')
  }

  const timestamp = now()
  const autoConfirmAt =
    nextStatus === 'AWAITING_CONFIRMATION'
      ? new Date(Date.now() + config.autoConfirmHours * 3_600_000).toISOString()
      : null
  transaction(() => {
    const changed = execute(
      `UPDATE orders
       SET status = ?, updated_at = ?, cancel_reason = ?, auto_confirm_at = ?
       WHERE id = ? AND status = ?`,
      nextStatus,
      timestamp,
      action === 'CANCEL' ? note.trim() : row.cancel_reason,
      autoConfirmAt,
      orderId,
      row.status,
    )
    if (Number(changed.changes) !== 1) {
      throw new ConflictError('订单状态已被更新，请刷新后重试')
    }

    execute(
      `INSERT INTO order_events
       (id, order_id, from_status, to_status, actor_id, action, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id('event'),
      orderId,
      row.status,
      nextStatus,
      userId,
      action,
      note.trim(),
      timestamp,
    )

    if (nextStatus === 'CANCELLED') refundBuyer(row, timestamp)
    if (nextStatus === 'COMPLETED') settleOrder(row, timestamp)
  })

  const updated = getOrder(orderId, userId)
  const recipientId = userId === row.buyer_id ? row.provider_id : row.buyer_id
  const event = orderNotification(nextStatus, action, row.listing_title)
  safelyNotify({
    userId: recipientId,
    type: action === 'DISPUTE' ? 'DISPUTE' : 'ORDER',
    title: event.title,
    content: event.content,
    link: `/orders?open=${orderId}`,
  })

  if (nextStatus === 'DISPUTED') {
    const admins = getAll<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN'")
    for (const admin of admins) {
      safelyNotify({
        userId: admin.id,
        type: 'DISPUTE',
        title: '有新的订单申诉待处理',
        content: `「${row.listing_title}」进入申诉状态，请及时审核。`,
        link: `/admin/disputes?open=${orderId}`,
      })
    }
  }

  return updated
}

export function checkScheduleAvailability(userId: string, input: ScheduleCheckInput) {
  const listing = getOne<ListingForOrder>(
    'SELECT id, owner_id, kind, coin_per_hour, status FROM listings WHERE id = ?',
    input.listingId,
  )
  if (!listing) throw new NotFoundError('技能帖不存在')
  if (listing.status !== 'ACTIVE') throw new ConflictError('该技能帖当前不可预约')
  if (listing.owner_id === userId) throw new ConflictError('不能预约自己发布的技能')

  const scheduledAt = new Date(input.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000) {
    throw new ConflictError('请选择未来的服务时间', 'INVALID_SCHEDULE')
  }

  const buyerId = listing.kind === 'OFFER' ? userId : listing.owner_id
  const providerId = listing.kind === 'OFFER' ? listing.owner_id : userId
  const existingActiveOrder = getOne<{ id: string }>(
    `SELECT id FROM orders
     WHERE listing_id = ? AND buyer_id = ? AND provider_id = ?
       AND status NOT IN ('CANCELLED', 'COMPLETED')`,
    listing.id,
    buyerId,
    providerId,
  )
  const conflicts = findScheduleConflicts(buyerId, providerId, scheduledAt, input.hours)
  const buyerConflict = conflicts.some((item) => item.buyer_id === buyerId || item.provider_id === buyerId)
  const providerConflict = conflicts.some(
    (item) => item.buyer_id === providerId || item.provider_id === providerId,
  )
  const range = createTimeRange(scheduledAt, input.hours)
  return {
    available: conflicts.length === 0 && !existingActiveOrder,
    buyerConflict,
    providerConflict,
    existingActiveOrder: Boolean(existingActiveOrder),
    conflictCount: conflicts.length,
    startsAt: range.start.toISOString(),
    endsAt: range.end.toISOString(),
  }
}

export function getScheduleBusyWindow(userId: string, input: ScheduleBusyWindowInput) {
  const listing = getOne<ListingForOrder>(
    'SELECT id, owner_id, kind, coin_per_hour, status FROM listings WHERE id = ?',
    input.listingId,
  )
  if (!listing) throw new NotFoundError('技能帖不存在')
  if (listing.owner_id === userId) throw new ConflictError('不能预约自己发布的技能')

  const from = new Date(input.from)
  const to = new Date(input.to)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    throw new ConflictError('日历时间范围无效', 'INVALID_SCHEDULE')
  }
  if (to.getTime() - from.getTime() > 31 * 86_400_000) {
    throw new ConflictError('单次最多查看 31 天日程', 'INVALID_SCHEDULE')
  }

  const buyerId = listing.kind === 'OFFER' ? userId : listing.owner_id
  const providerId = listing.kind === 'OFFER' ? listing.owner_id : userId
  const existingActiveOrder = getOne<{ id: string }>(
    `SELECT id FROM orders
     WHERE listing_id = ? AND buyer_id = ? AND provider_id = ?
       AND status NOT IN ('CANCELLED', 'COMPLETED')`,
    listing.id,
    buyerId,
    providerId,
  )
  const rows = findBlockingOrdersInWindow(buyerId, providerId, from, to)

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    existingActiveOrder: Boolean(existingActiveOrder),
    busy: rows.map((row) => ({
      startAt: row.scheduled_at,
      endAt: new Date(
        new Date(row.scheduled_at).getTime() + row.hours * 3_600_000,
      ).toISOString(),
      buyerBusy: row.buyer_id === buyerId || row.provider_id === buyerId,
      providerBusy: row.buyer_id === providerId || row.provider_id === providerId,
    })),
  }
}

function assertScheduleAvailable(
  buyerId: string,
  providerId: string,
  start: Date,
  hours: number,
) {
  const conflicts = findScheduleConflicts(buyerId, providerId, start, hours)
  if (!conflicts.length) return
  const buyerConflict = conflicts.some(
    (item) => item.buyer_id === buyerId || item.provider_id === buyerId,
  )
  const providerConflict = conflicts.some(
    (item) => item.buyer_id === providerId || item.provider_id === providerId,
  )
  const message =
    buyerConflict && providerConflict
      ? '双方在该时段都已有其他预约，请选择新的时间'
      : buyerConflict
        ? '你在该时段已有另一项技能安排，请选择新的时间'
        : '服务方在该时段已有安排，请选择新的时间'
  throw new ConflictError(message, 'TIME_CONFLICT')
}

function findScheduleConflicts(
  buyerId: string,
  providerId: string,
  start: Date,
  hours: number,
) {
  const range = createTimeRange(start, hours)
  return findBlockingOrdersInWindow(buyerId, providerId, range.start, range.end).filter((row) =>
    rangesOverlap(range, createTimeRange(row.scheduled_at, row.hours)),
  )
}

function findBlockingOrdersInWindow(
  buyerId: string,
  providerId: string,
  from: Date,
  to: Date,
) {
  const statuses = scheduleBlockingStatuses.map(() => '?').join(', ')
  return getAll<ScheduleConflictRow>(
    `SELECT id, buyer_id, provider_id, scheduled_at, hours, status
     FROM orders
     WHERE status IN (${statuses})
       AND (buyer_id = ? OR provider_id = ? OR buyer_id = ? OR provider_id = ?)
       AND datetime(scheduled_at) < datetime(?)
       AND datetime(scheduled_at, '+' || hours || ' hours') > datetime(?)`,
    ...scheduleBlockingStatuses,
    buyerId,
    buyerId,
    providerId,
    providerId,
    to.toISOString(),
    from.toISOString(),
  )
}

export function autoConfirmExpiredOrders(at = now()) {
  const dueOrders = getAll<{ id: string }>(
    `SELECT id FROM orders
     WHERE status = 'AWAITING_CONFIRMATION'
       AND auto_confirm_at IS NOT NULL
       AND auto_confirm_at <= ?`,
    at,
  )
  let confirmed = 0
  for (const order of dueOrders) {
    try {
      if (autoConfirmOrder(order.id, at)) confirmed += 1
    } catch (error) {
      console.error(`automatic confirmation failed for ${order.id}`, error)
    }
  }
  return confirmed
}

function autoConfirmOrder(orderId: string, at: string) {
  const row = getOne<OrderRow>(`${orderSelect} WHERE o.id = ?`, orderId)
  if (
    !row ||
    row.status !== 'AWAITING_CONFIRMATION' ||
    !row.auto_confirm_at ||
    row.auto_confirm_at > at
  ) {
    return false
  }

  transaction(() => {
    const changed = execute(
      `UPDATE orders
       SET status = 'COMPLETED', updated_at = ?, auto_confirm_at = NULL
       WHERE id = ? AND status = 'AWAITING_CONFIRMATION'
         AND auto_confirm_at IS NOT NULL AND auto_confirm_at <= ?`,
      at,
      orderId,
      at,
    )
    if (Number(changed.changes) !== 1) {
      throw new ConflictError('订单已被用户处理，自动确认跳过')
    }
    execute(
      `INSERT INTO order_events
       (id, order_id, from_status, to_status, actor_id, action, note, created_at)
       VALUES (?, ?, 'AWAITING_CONFIRMATION', 'COMPLETED', 'u_system',
               'AUTO_CONFIRM', '预约方超过确认期限，系统自动确认完成。', ?)`,
      id('event'),
      orderId,
      at,
    )
    settleOrder(row, at)
  })

  safelyNotify({
    userId: row.buyer_id,
    type: 'SYSTEM',
    title: '订单已超时自动确认',
    content: `「${row.listing_title}」超过确认期限，系统已完成确认和结算。`,
    link: `/orders?open=${orderId}`,
  })
  safelyNotify({
    userId: row.provider_id,
    type: 'SYSTEM',
    title: '服务时间币已自动到账',
    content: `「${row.listing_title}」已由系统自动确认完成。`,
    link: `/orders?open=${orderId}`,
  })
  return true
}

function refundBuyer(row: OrderRow, timestamp: string) {
  const refunded = execute(
    `UPDATE wallets
     SET available = available + ?, frozen = frozen - ?, updated_at = ?
     WHERE user_id = ? AND frozen >= ?`,
    row.coin_amount,
    row.coin_amount,
    timestamp,
    row.buyer_id,
    row.coin_amount,
  )
  if (Number(refunded.changes) !== 1) throw new ConflictError('冻结金额异常，请联系管理员')

  const wallet = getOne<WalletRow>('SELECT available, frozen FROM wallets WHERE user_id = ?', row.buyer_id)
  execute(
    `INSERT INTO wallet_transactions
     (id, user_id, order_id, type, amount, balance_after, description, created_at)
     VALUES (?, ?, ?, 'REFUND', ?, ?, '订单取消，冻结时间币已退回', ?)`,
    id('txn'),
    row.buyer_id,
    row.id,
    row.coin_amount,
    wallet?.available || 0,
    timestamp,
  )
}

function settleOrder(row: OrderRow, timestamp: string) {
  const buyerWallet = execute(
    `UPDATE wallets
     SET frozen = frozen - ?, spent_total = spent_total + ?, updated_at = ?
     WHERE user_id = ? AND frozen >= ?`,
    row.coin_amount,
    row.coin_amount,
    timestamp,
    row.buyer_id,
    row.coin_amount,
  )
  if (Number(buyerWallet.changes) !== 1) throw new ConflictError('冻结金额异常，请联系管理员')

  execute(
    `UPDATE wallets
     SET available = available + ?, earned_total = earned_total + ?, updated_at = ?
     WHERE user_id = ?`,
    row.coin_amount,
    row.coin_amount,
    timestamp,
    row.provider_id,
  )
  execute('UPDATE users SET completed_count = completed_count + 1 WHERE id = ?', row.provider_id)

  const providerWallet = getOne<WalletRow>(
    'SELECT available, frozen FROM wallets WHERE user_id = ?',
    row.provider_id,
  )
  execute(
    `INSERT INTO wallet_transactions
     (id, user_id, order_id, type, amount, balance_after, description, created_at)
     VALUES (?, ?, ?, 'INCOME', ?, ?, '完成技能服务获得时间币', ?)`,
    id('txn'),
    row.provider_id,
    row.id,
    row.coin_amount,
    providerWallet?.available || 0,
    timestamp,
  )
}

export function createReview(
  orderId: string,
  userId: string,
  rating: number,
  content: string,
) {
  const row = getOne<OrderRow>(`${orderSelect} WHERE o.id = ?`, orderId)
  if (!row) throw new NotFoundError('订单不存在')
  if (row.buyer_id !== userId && row.provider_id !== userId) {
    throw new ForbiddenError('只有订单参与者可以评价')
  }
  if (row.status !== 'COMPLETED') throw new ConflictError('订单完成后才能评价')
  const existingReview =
    userId === row.buyer_id ? row.buyer_review_rating : row.provider_review_rating
  if (existingReview) throw new ConflictError('你已经评价过该订单')

  const targetId = userId === row.buyer_id ? row.provider_id : row.buyer_id

  const timestamp = now()
  transaction(() => {
    execute(
      `INSERT INTO reviews
       (id, order_id, author_id, target_id, rating, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id('review'),
      orderId,
      userId,
      targetId,
      rating,
      content.trim(),
      timestamp,
    )
    execute(
      `UPDATE users
       SET rating_avg = ((rating_avg * review_count) + ?) / (review_count + 1),
           review_count = review_count + 1
       WHERE id = ?`,
      rating,
      targetId,
    )
  })

  const updated = getOrder(orderId, userId)
  safelyNotify({
    userId: targetId,
    type: 'REVIEW',
    title: '收到一条新评价',
    content: `「${row.listing_title}」获得 ${rating} 星评价。`,
    link: `/orders?open=${orderId}`,
  })
  return updated
}

export function getOrderForAdmin(orderId: string) {
  const row = getOne<OrderRow>(`${orderSelect} WHERE o.id = ?`, orderId)
  if (!row) throw new NotFoundError('订单不存在')
  return orderDto(row, '__admin__')
}

export function listDisputeOrders() {
  const rows = getAll<
    OrderRow & {
      dispute_reason: string | null
      disputed_at: string | null
    }
  >(
    `${orderSelect}
     WHERE o.status = 'DISPUTED'
     ORDER BY o.updated_at ASC`,
  )
  return rows.map((row) => {
    const detail = getOne<{ note: string; created_at: string }>(
      `SELECT note, created_at FROM order_events
       WHERE order_id = ? AND action = 'DISPUTE'
       ORDER BY created_at DESC LIMIT 1`,
      row.id,
    )
    return {
      ...orderDto(row, '__admin__'),
      disputeReason: detail?.note || '用户未填写申诉说明',
      disputedAt: detail?.created_at || row.updated_at,
    }
  })
}

export function resolveDispute(
  orderId: string,
  adminUserId: string,
  resolution: DisputeResolution,
  note: string,
) {
  const row = getOne<OrderRow>(`${orderSelect} WHERE o.id = ?`, orderId)
  if (!row) throw new NotFoundError('订单不存在')
  if (row.status !== 'DISPUTED') {
    throw new ConflictError('该订单当前不在申诉状态', 'NOT_DISPUTED')
  }
  const nextStatus = resolveDisputeTransition(row.status, resolution)
  if (!nextStatus) throw new ConflictError('申诉处理结果无效')

  const timestamp = now()
  const action = resolution === 'RELEASE' ? 'ADMIN_RELEASE' : 'ADMIN_REFUND'
  transaction(() => {
    const changed = execute(
      `UPDATE orders
       SET status = ?, updated_at = ?, auto_confirm_at = NULL
       WHERE id = ? AND status = ?`,
      nextStatus,
      timestamp,
      orderId,
      row.status,
    )
    if (Number(changed.changes) !== 1) {
      throw new ConflictError('订单状态已被其他人处理，请刷新后重试')
    }
    execute(
      `INSERT INTO order_events
       (id, order_id, from_status, to_status, actor_id, action, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id('event'),
      orderId,
      row.status,
      nextStatus,
      adminUserId,
      action,
      note.trim(),
      timestamp,
    )
    if (nextStatus === 'COMPLETED') settleOrder(row, timestamp)
    if (nextStatus === 'CANCELLED') refundBuyer(row, timestamp)
  })

  const released = resolution === 'RELEASE'
  safelyNotify({
    userId: row.buyer_id,
    type: 'DISPUTE',
    title: '申诉审核已完成',
    content: released
      ? `「${row.listing_title}」审核通过，时间币已结算给服务方。`
      : `「${row.listing_title}」申诉成立，冻结的时间币已退回。`,
    link: `/orders?open=${orderId}`,
  })
  safelyNotify({
    userId: row.provider_id,
    type: 'DISPUTE',
    title: '申诉审核已完成',
    content: released
      ? `「${row.listing_title}」的服务时间币已经到账。`
      : `「${row.listing_title}」经审核后已退款，冻结金额已解除。`,
    link: `/orders?open=${orderId}`,
  })
  return getOrderForAdmin(orderId)
}

function safelyNotify(input: Parameters<typeof notifyUser>[0]) {
  try {
    notifyUser(input)
  } catch (error) {
    console.error('notification failed', error)
  }
}

function orderNotification(status: OrderStatus, _action: OrderAction, title: string) {
  const messages: Record<OrderStatus, { title: string; content: string }> = {
    PENDING: { title: '订单状态更新', content: `「${title}」正在等待对方处理。` },
    ACCEPTED: { title: '你的订单已被接单', content: `对方已接受「${title}」订单。` },
    IN_PROGRESS: { title: '服务已经开始', content: `「${title}」正在进行中。` },
    AWAITING_CONFIRMATION: {
      title: '服务已提交，等待确认',
      content: `「${title}」已完成服务，请及时确认。`,
    },
    COMPLETED: { title: '订单已完成', content: `「${title}」的时间币已结算。` },
    CANCELLED: { title: '订单已取消', content: `「${title}」已取消，冻结时间币已退回。` },
    DISPUTED: { title: '订单进入申诉', content: `「${title}」已提交申诉，等待管理员审核。` },
  }
  return messages[status]
}

