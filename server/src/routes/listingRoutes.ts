import { Router } from 'express'
import { z } from 'zod'
import { optionalAuth, requireAuth } from '../auth'
import { execute, getOne, id, now } from '../db'
import { AppError, ForbiddenError, NotFoundError } from '../errors'
import { getListing, listMine, searchListings } from '../services/listingService'
import {
  assertOwnedImageUrls,
  listFavorites,
  listViewHistory,
  toggleFavorite,
} from '../services/listingInteractionService'
import { recommendListings } from '../services/recommendationService'

const router = Router()

const imageUrlSchema = z
  .string()
  .regex(/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/, '图片地址无效')

const createListingSchema = z.object({
  kind: z.enum(['OFFER', 'REQUEST']),
  title: z.string().trim().min(4, '标题至少 4 个字').max(60),
  category: z.string().trim().min(1, '请选择分类').max(30),
  description: z.string().trim().min(15, '描述至少 15 个字').max(1000),
  tags: z.array(z.string().trim().min(1).max(12)).max(5).default([]),
  images: z.array(imageUrlSchema).max(6).default([]),
  location: z.string().trim().max(60).default(''),
  availability: z.string().trim().max(80).default(''),
  coverColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#5D7CF6'),
})

const updateListingSchema = z.object({
  kind: z.enum(['OFFER', 'REQUEST']).optional(),
  title: z.string().trim().min(4, '标题至少 4 个字').max(60).optional(),
  category: z.string().trim().min(1, '请选择分类').max(30).optional(),
  description: z.string().trim().min(15, '描述至少 15 个字').max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(12)).max(5).optional(),
  images: z.array(imageUrlSchema).max(6).optional(),
  location: z.string().trim().max(60).optional(),
  availability: z.string().trim().max(80).optional(),
  coverColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']).optional(),
})

router.get('/', (req, res) => {
  const kind = req.query.kind === 'OFFER' || req.query.kind === 'REQUEST' ? req.query.kind : undefined
  const sort =
    req.query.sort === 'popular' || req.query.sort === 'rating' ? req.query.sort : 'latest'
  const data = searchListings({
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    kind,
    sort,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 12,
  })
  res.json({ data })
})

router.get('/recommendations', requireAuth, (req, res) => {
  res.json({ data: recommendListings(req.authUser!.id) })
})

router.get('/mine', requireAuth, (req, res) => {
  res.json({ data: listMine(req.authUser!.id) })
})

router.get('/favorites/mine', requireAuth, (req, res) => {
  res.json({ data: listFavorites(req.authUser!.id) })
})

router.get('/history/mine', requireAuth, (req, res) => {
  res.json({ data: listViewHistory(req.authUser!.id, Number(req.query.limit) || 30) })
})

router.get('/categories', (_req, res) => {
  res.json({
    data: [
      '学业辅导',
      '编程开发',
      '数码维修',
      '摄影摄像',
      '美妆造型',
      '语言交流',
      '运动健身',
      '生活服务',
      '其他',
    ],
  })
})

router.post('/', requireAuth, (req, res) => {
  const result = createListingSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '发布信息有误')
  const input = result.data
  assertOwnedImageUrls(req.authUser!.id, input.images)
  const listingId = id('l')
  const timestamp = now()
  execute(
    `INSERT INTO listings
     (id, owner_id, kind, title, category, description, tags, coin_per_hour,
      images, location, availability, cover_color, status, view_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'ACTIVE', 0, ?, ?)`,
    listingId,
    req.authUser!.id,
    input.kind,
    input.title,
    input.category,
    input.description,
    JSON.stringify(input.tags),
    JSON.stringify(input.images),
    input.location,
    input.availability,
    input.coverColor,
    timestamp,
    timestamp,
  )
  res.status(201).json({ data: getListing(listingId) })
})

router.patch('/:id', requireAuth, (req, res) => {
  const listingId = String(req.params.id)
  const existing = getOne<{ owner_id: string; blocked_at: string | null }>(
    'SELECT owner_id, blocked_at FROM listings WHERE id = ?',
    listingId,
  )
  if (!existing) throw new NotFoundError('技能帖不存在')
  if (existing.owner_id !== req.authUser!.id) throw new ForbiddenError()
  if (existing.blocked_at) throw new ForbiddenError('该技能帖因内容审核已关闭，不能继续编辑或恢复')
  const result = updateListingSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '修改信息有误')

  const current = getListing(listingId) as ReturnType<typeof getListing> & {
    description: string
    kind: string
    title: string
    category: string
    location: string
    availability: string
    coverColor: string
    status: string
    moderationBlocked: boolean
    tags: string[]
    images: string[]
  }
  const input = result.data
  if (input.images) assertOwnedImageUrls(req.authUser!.id, input.images)
  execute(
    `UPDATE listings SET kind = ?, title = ?, category = ?, description = ?, tags = ?,
      images = ?, location = ?, availability = ?, cover_color = ?, status = ?, updated_at = ?
     WHERE id = ?`,
    input.kind ?? current.kind,
    input.title ?? current.title,
    input.category ?? current.category,
    input.description ?? current.description,
    JSON.stringify(input.tags ?? current.tags),
    JSON.stringify(input.images ?? current.images),
    input.location ?? current.location,
    input.availability ?? current.availability,
    input.coverColor ?? current.coverColor,
    input.status ?? current.status,
    now(),
    listingId,
  )
  res.json({ data: getListing(listingId) })
})

router.post('/:id/favorite', requireAuth, (req, res) => {
  res.json({ data: toggleFavorite(req.authUser!.id, String(req.params.id)) })
})

router.get('/:id', optionalAuth, (req, res) => {
  res.json({
    data: getListing(String(req.params.id), true, req.authUser?.id),
  })
})

export default router

