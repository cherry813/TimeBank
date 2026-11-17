import { execute, getAll, getOne, id, now, transaction } from '../db'
import { ConflictError, NotFoundError } from '../errors'
import { notifyUser } from './notificationService'

type ReportTargetType = 'LISTING' | 'USER'
type ReportReason = 'FRAUD' | 'HARASSMENT' | 'SPAM' | 'INAPPROPRIATE' | 'OTHER'
type ReportDecision = 'DISMISS' | 'CLOSE_LISTING' | 'WARN_USER'

interface ReportRow {
  id: string
  reporter_id: string
  target_type: ReportTargetType
  target_id: string
  reason: ReportReason
  detail: string
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
  resolution_note: string
  created_at: string
  resolved_at: string | null
  reporter_nickname: string
  resolver_nickname: string | null
}

export function createReport(
  reporterId: string,
  input: {
    targetType: ReportTargetType
    targetId: string
    reason: ReportReason
    detail: string
  },
) {
  if (input.targetType === 'LISTING') {
    const listing = getOne<{ owner_id: string; title: string }>(
      'SELECT owner_id, title FROM listings WHERE id = ?',
      input.targetId,
    )
    if (!listing) throw new NotFoundError('举报的技能帖不存在')
    if (listing.owner_id === reporterId) throw new ConflictError('不能举报自己发布的内容')
  } else {
    const user = getOne<{ id: string }>('SELECT id FROM users WHERE id = ?', input.targetId)
    if (!user) throw new NotFoundError('举报的用户不存在')
    if (input.targetId === reporterId) throw new ConflictError('不能举报自己')
  }

  const duplicate = getOne<{ id: string }>(
    `SELECT id FROM reports
     WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'PENDING'`,
    reporterId,
    input.targetType,
    input.targetId,
  )
  if (duplicate) throw new ConflictError('你已经提交过针对该对象的举报，正在处理中')

  const reportId = id('report')
  execute(
    `INSERT INTO reports
     (id, reporter_id, target_type, target_id, reason, detail, status,
      resolver_id, resolution_note, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NULL, '', ?, NULL)`,
    reportId,
    reporterId,
    input.targetType,
    input.targetId,
    input.reason,
    input.detail.trim(),
    now(),
  )
  return { id: reportId, status: 'PENDING' as const }
}

export function listReports(status: 'PENDING' | 'RESOLVED' | 'DISMISSED' = 'PENDING') {
  const rows = getAll<ReportRow>(
    `SELECT r.*, reporter.nickname AS reporter_nickname,
            resolver.nickname AS resolver_nickname
     FROM reports r
     JOIN users reporter ON reporter.id = r.reporter_id
     LEFT JOIN users resolver ON resolver.id = r.resolver_id
     WHERE r.status = ?
     ORDER BY CASE r.status WHEN 'PENDING' THEN r.created_at END ASC,
              r.resolved_at DESC`,
    status,
  )
  return rows.map(reportDto)
}

function reportDto(row: ReportRow) {
  let target:
    | { type: 'LISTING'; id: string; title: string; status: string; ownerId: string }
    | { type: 'USER'; id: string; nickname: string; major: string }
    | null = null
  if (row.target_type === 'LISTING') {
    const listing = getOne<{
      id: string
      title: string
      status: string
      owner_id: string
    }>('SELECT id, title, status, owner_id FROM listings WHERE id = ?', row.target_id)
    if (listing) {
      target = {
        type: 'LISTING',
        id: listing.id,
        title: listing.title,
        status: listing.status,
        ownerId: listing.owner_id,
      }
    }
  } else {
    const user = getOne<{ id: string; nickname: string; major: string }>(
      'SELECT id, nickname, major FROM users WHERE id = ?',
      row.target_id,
    )
    if (user) {
      target = {
        type: 'USER',
        id: user.id,
        nickname: user.nickname,
        major: user.major,
      }
    }
  }

  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    target,
    reason: row.reason,
    detail: row.detail,
    status: row.status,
    reporter: { id: row.reporter_id, nickname: row.reporter_nickname },
    resolutionNote: row.resolution_note,
    resolverNickname: row.resolver_nickname,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }
}

export function resolveReport(
  reportId: string,
  adminId: string,
  decision: ReportDecision,
  note: string,
) {
  const report = getOne<ReportRow>(
    `SELECT r.*, reporter.nickname AS reporter_nickname
     FROM reports r JOIN users reporter ON reporter.id = r.reporter_id
     WHERE r.id = ?`,
    reportId,
  )
  if (!report) throw new NotFoundError('举报记录不存在')
  if (report.status !== 'PENDING') throw new ConflictError('该举报已经处理过')

  if (decision === 'CLOSE_LISTING' && report.target_type !== 'LISTING') {
    throw new ConflictError('只有技能帖举报可以关闭帖子')
  }
  if (decision === 'WARN_USER' && report.target_type !== 'USER') {
    throw new ConflictError('用户警告只能用于用户举报')
  }

  const timestamp = now()
  const finalStatus = decision === 'DISMISS' ? 'DISMISSED' : 'RESOLVED'
  transaction(() => {
    const changed = execute(
      `UPDATE reports
       SET status = ?, resolver_id = ?, resolution_note = ?, resolved_at = ?
       WHERE id = ? AND status = 'PENDING'`,
      finalStatus,
      adminId,
      note.trim(),
      timestamp,
      reportId,
    )
    if (Number(changed.changes) !== 1) throw new ConflictError('该举报已被其他管理员处理')
    if (decision === 'CLOSE_LISTING') {
      execute(
        "UPDATE listings SET status = 'CLOSED', blocked_at = ?, updated_at = ? WHERE id = ?",
        timestamp,
        timestamp,
        report.target_id,
      )
    }
  })

  if (decision === 'CLOSE_LISTING') {
    const listing = getOne<{ owner_id: string; title: string }>(
      'SELECT owner_id, title FROM listings WHERE id = ?',
      report.target_id,
    )
    if (listing) {
      notifyUser({
        userId: listing.owner_id,
        type: 'SYSTEM',
        title: '技能帖已下架',
        content: `「${listing.title}」因举报审核被关闭。${note.trim() ? `说明：${note.trim()}` : ''}`,
        link: '/profile',
      })
    }
  }
  if (decision === 'WARN_USER') {
    notifyUser({
      userId: report.target_id,
      type: 'SYSTEM',
      title: '收到平台行为提醒',
      content: `管理员已完成一条针对你的举报审核。${note.trim() ? `说明：${note.trim()}` : '请遵守校园互助规范。'}`,
      link: '/notifications',
    })
  }

  notifyUser({
    userId: report.reporter_id,
    type: 'SYSTEM',
    title: '举报处理结果',
    content:
      decision === 'DISMISS'
        ? `你提交的举报经审核未发现问题。${note.trim() ? `说明：${note.trim()}` : ''}`
        : `你提交的举报已完成处理。${note.trim() ? `说明：${note.trim()}` : ''}`,
    link: '/notifications',
  })
  return { id: reportId, status: finalStatus, decision }
}

