import { Router } from 'express'
import { z } from 'zod'
import { requireAdmin, requireAuth } from '../auth'
import { AppError } from '../errors'
import {
  getAdminOverview,
  getAdminStats,
  listAdminDisputes,
  listAdminReports,
} from '../services/adminService'
import { resolveDispute } from '../services/orderService'
import { resolveReport } from '../services/reportService'

const router = Router()
router.use(requireAuth, requireAdmin)

router.get('/stats', (_req, res) => {
  res.json({ data: getAdminStats() })
})

router.get('/overview', (_req, res) => {
  res.json({ data: getAdminOverview() })
})

router.get('/disputes', (_req, res) => {
  res.json({ data: listAdminDisputes() })
})

router.get('/reports', (req, res) => {
  const status =
    req.query.status === 'RESOLVED' || req.query.status === 'DISMISSED'
      ? req.query.status
      : 'PENDING'
  res.json({ data: listAdminReports(status) })
})

const resolveSchema = z.object({
  resolution: z.enum(['RELEASE', 'REFUND']),
  note: z.string().trim().min(2, '请填写审核说明').max(500),
})

router.post('/orders/:id/resolve', (req, res) => {
  const result = resolveSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '审核信息有误')
  const order = resolveDispute(
    String(req.params.id),
    req.authUser!.id,
    result.data.resolution,
    result.data.note,
  )
  res.json({ data: order })
})

const reportDecisionSchema = z.object({
  decision: z.enum(['DISMISS', 'CLOSE_LISTING', 'WARN_USER']),
  note: z.string().trim().min(2, '请填写审核说明').max(500),
})

router.post('/reports/:id/resolve', (req, res) => {
  const result = reportDecisionSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '审核信息有误')
  res.json({
    data: resolveReport(
      String(req.params.id),
      req.authUser!.id,
      result.data.decision,
      result.data.note,
    ),
  })
})

export default router

