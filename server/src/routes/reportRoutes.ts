import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth'
import { AppError } from '../errors'
import { createReport } from '../services/reportService'

const router = Router()
router.use(requireAuth)

const reportSchema = z.object({
  targetType: z.enum(['LISTING', 'USER']),
  targetId: z.string().min(1),
  reason: z.enum(['FRAUD', 'HARASSMENT', 'SPAM', 'INAPPROPRIATE', 'OTHER']),
  detail: z.string().trim().max(500).default(''),
})

router.post('/', (req, res) => {
  const result = reportSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '举报信息有误')
  res.status(201).json({ data: createReport(req.authUser!.id, result.data) })
})

export default router

