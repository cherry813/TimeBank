import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth'
import { AppError } from '../errors'
import {
  createOrder,
  createReview,
  checkScheduleAvailability,
  getScheduleBusyWindow,
  getOrder,
  getOrderEvents,
  listOrders,
  performOrderAction,
} from '../services/orderService'

const router = Router()
router.use(requireAuth)

const createSchema = z.object({
  listingId: z.string().min(1),
  hours: z.number().int().min(1).max(8),
  scheduledAt: z.iso.datetime('请选择服务时间'),
  note: z.string().trim().max(300).default(''),
})

const actionSchema = z.object({
  action: z.enum(['ACCEPT', 'START', 'SUBMIT', 'CONFIRM', 'CANCEL', 'DISPUTE']),
  note: z.string().trim().max(300).default(''),
})

router.get('/', (req, res) => {
  const role = req.query.role === 'BUYER' || req.query.role === 'PROVIDER' ? req.query.role : 'ALL'
  res.json({ data: listOrders(req.authUser!.id, role) })
})

router.post('/', (req, res) => {
  const result = createSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '订单信息有误')
  res.status(201).json({ data: createOrder(req.authUser!.id, result.data) })
})

const scheduleSchema = z.object({
  listingId: z.string().min(1),
  hours: z.coerce.number().int().min(1).max(8),
  scheduledAt: z.iso.datetime('请选择服务时间'),
})

router.get('/schedule-check', (req, res) => {
  const result = scheduleSchema.safeParse(req.query)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '时间格式有误')
  res.json({ data: checkScheduleAvailability(req.authUser!.id, result.data) })
})

const busySchema = z.object({
  listingId: z.string().min(1),
  from: z.iso.datetime('日历开始时间格式有误'),
  to: z.iso.datetime('日历结束时间格式有误'),
})

router.get('/schedule-busy', (req, res) => {
  const result = busySchema.safeParse(req.query)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '日历参数有误')
  res.json({ data: getScheduleBusyWindow(req.authUser!.id, result.data) })
})

router.get('/:id', (req, res) => {
  res.json({ data: getOrder(req.params.id, req.authUser!.id) })
})

router.get('/:id/events', (req, res) => {
  res.json({ data: getOrderEvents(req.params.id, req.authUser!.id) })
})

router.post('/:id/actions', (req, res) => {
  const result = actionSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '操作信息有误')
  res.json({
    data: performOrderAction(
      req.params.id,
      req.authUser!.id,
      result.data.action,
      result.data.note,
    ),
  })
})

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  content: z.string().trim().max(300).default(''),
})

router.post('/:id/review', (req, res) => {
  const result = reviewSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '评价信息有误')
  res.status(201).json({
    data: createReview(req.params.id, req.authUser!.id, result.data.rating, result.data.content),
  })
})

export default router

