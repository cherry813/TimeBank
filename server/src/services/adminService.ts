import { config } from '../config'
import { getAll, getOne, now } from '../db'
import { listDisputeOrders } from './orderService'
import { listReports } from './reportService'

export function getAdminStats() {
  const users =
    getOne<{ total: number }>(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'STUDENT' AND id <> 'u_system'",
    )
      ?.total || 0
  const activeListings =
    getOne<{ total: number }>("SELECT COUNT(*) AS total FROM listings WHERE status = 'ACTIVE'")
      ?.total || 0
  const completedOrders =
    getOne<{ total: number }>("SELECT COUNT(*) AS total FROM orders WHERE status = 'COMPLETED'")
      ?.total || 0
  const disputedOrders =
    getOne<{ total: number }>("SELECT COUNT(*) AS total FROM orders WHERE status = 'DISPUTED'")
      ?.total || 0
  const frozenCoins =
    getOne<{ total: number }>('SELECT COALESCE(SUM(frozen), 0) AS total FROM wallets')?.total || 0
  const pendingReports =
    getOne<{ total: number }>("SELECT COUNT(*) AS total FROM reports WHERE status = 'PENDING'")
      ?.total || 0

  return {
    users,
    activeListings,
    completedOrders,
    disputedOrders,
    frozenCoins,
    pendingReports,
  }
}

export function listAdminReports(status: 'PENDING' | 'RESOLVED' | 'DISMISSED' = 'PENDING') {
  return listReports(status)
}

export function listAdminDisputes() {
  return {
    stats: getAdminStats(),
    items: listDisputeOrders(),
  }
}

export function getAdminOverview() {
  const stats = getAdminStats()
  const disputes = listDisputeOrders().slice(0, 4)
  const reports = listReports('PENDING').slice(0, 4)
  const orderActivities = getAll<{
    id: string
    action: string
    note: string
    created_at: string
    order_id: string
    listing_title: string
    actor_nickname: string
  }>(
    `SELECT e.id, e.action, e.note, e.created_at, e.order_id,
            l.title AS listing_title, u.nickname AS actor_nickname
     FROM order_events e
     JOIN users u ON u.id = e.actor_id
     JOIN orders o ON o.id = e.order_id
     JOIN listings l ON l.id = o.listing_id
     WHERE u.role = 'ADMIN'
     ORDER BY e.created_at DESC
     LIMIT 6`,
  ).map((item) => ({
    id: item.id,
    kind: 'ORDER',
    action: item.action,
    title: item.listing_title,
    note: item.note,
    actorNickname: item.actor_nickname,
    createdAt: item.created_at,
    link: `/admin/disputes?open=${item.order_id}`,
  }))
  const reportActivities = getAll<{
    id: string
    target_type: string
    target_id: string
    status: string
    reason: string
    resolution_note: string
    resolved_at: string
    resolver_nickname: string | null
  }>(
    `SELECT r.id, r.target_type, r.target_id, r.status, r.reason,
            r.resolution_note, r.resolved_at, resolver.nickname AS resolver_nickname
     FROM reports r
     LEFT JOIN users resolver ON resolver.id = r.resolver_id
     WHERE r.status <> 'PENDING' AND r.resolved_at IS NOT NULL
     ORDER BY r.resolved_at DESC
     LIMIT 6`,
  ).map((item) => ({
    id: item.id,
    kind: 'REPORT',
    action: item.status === 'DISMISSED' ? 'REPORT_DISMISSED' : 'REPORT_RESOLVED',
    title: item.target_type === 'LISTING' ? '技能帖举报审核' : '用户举报审核',
    note: item.resolution_note,
    actorNickname: item.resolver_nickname || '管理员',
    createdAt: item.resolved_at,
    link: '/admin/reports',
  }))
  const recentActivity = [...orderActivities, ...reportActivities]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)

  return {
    stats,
    pending: {
      disputes,
      reports,
    },
    recentActivity,
    system: {
      status: 'ONLINE',
      database: 'SQLite · WAL',
      serverTime: now(),
      uptimeSeconds: Math.floor(process.uptime()),
      autoConfirmHours: config.autoConfirmHours,
      automationIntervalSeconds: Math.round(config.autoConfirmIntervalMs / 1000),
    },
  }
}

