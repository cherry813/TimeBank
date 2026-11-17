import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, signToken } from '../auth'
import { execute, getOne, id, now, transaction } from '../db'
import { AppError, ConflictError, NotFoundError } from '../errors'
import { hashPassword, verifyPassword } from '../security/password'
import { assertOwnedImageUrls } from '../services/listingInteractionService'

const router = Router()

const registerSchema = z.object({
  nickname: z.string().trim().min(2, '昵称至少 2 个字').max(20),
  email: z.email('请输入正确的邮箱').transform((value) => value.toLowerCase()),
  password: z.string().min(6, '密码至少 6 位').max(72),
  campus: z.string().trim().max(30).default(''),
  major: z.string().trim().max(40).default(''),
})

const loginSchema = z.object({
  email: z.email('请输入正确的邮箱').transform((value) => value.toLowerCase()),
  password: z.string().min(1, '请输入密码'),
})

interface UserRow {
  id: string
  nickname: string
  email: string
  password_hash: string
  avatar: string
  bio: string
  campus: string
  major: string
  role: 'STUDENT' | 'ADMIN'
  rating_avg: number
  review_count: number
  completed_count: number
  created_at: string
}

interface WalletRow {
  available: number
  frozen: number
  earned_total: number
  spent_total: number
}

function userDto(user: UserRow) {
  return {
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio,
    campus: user.campus,
    major: user.major,
    role: user.role,
    ratingAvg: user.rating_avg,
    reviewCount: user.review_count,
    completedCount: user.completed_count,
    createdAt: user.created_at,
  }
}

router.post('/register', (req, res) => {
  const result = registerSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '注册信息有误')
  const input = result.data
  if (getOne('SELECT id FROM users WHERE email = ?', input.email)) {
    throw new ConflictError('该邮箱已经注册')
  }

  const userId = id('u')
  const timestamp = now()
  transaction(() => {
    execute(
      `INSERT INTO users
       (id, nickname, email, password_hash, avatar, bio, campus, major,
        rating_avg, review_count, completed_count, created_at)
       VALUES (?, ?, ?, ?, '', '', ?, ?, 5.0, 0, 0, ?)`,
      userId,
      input.nickname,
      input.email,
      hashPassword(input.password),
      input.campus,
      input.major,
      timestamp,
    )
    execute(
      `INSERT INTO wallets
       (user_id, available, frozen, earned_total, spent_total, updated_at)
       VALUES (?, 3, 0, 0, 0, ?)`,
      userId,
      timestamp,
    )
    execute(
      `INSERT INTO wallet_transactions
       (id, user_id, order_id, type, amount, balance_after, description, created_at)
       VALUES (?, ?, NULL, 'ADJUST', 3, 3, '新用户欢迎时间币', ?)`,
      id('txn'),
      userId,
      timestamp,
    )
  })

  const user = getOne<UserRow>('SELECT * FROM users WHERE id = ?', userId)
  if (!user) throw new Error('用户创建失败')
  const token = signToken({
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    role: user.role,
  })
  res.status(201).json({ data: { token, user: userDto(user) } })
})

router.post('/login', (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '登录信息有误')

  const user = getOne<UserRow>('SELECT * FROM users WHERE email = ?', result.data.email)
  if (!user || !verifyPassword(result.data.password, user.password_hash)) {
    throw new AppError(401, '邮箱或密码错误', 'INVALID_CREDENTIALS')
  }
  const token = signToken({
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    role: user.role,
  })
  res.json({ data: { token, user: userDto(user) } })
})

router.get('/me', requireAuth, (req, res) => {
  const user = getOne<UserRow>('SELECT * FROM users WHERE id = ?', req.authUser!.id)
  if (!user) throw new NotFoundError('用户不存在')
  const wallet = getOne<WalletRow>(
    'SELECT available, frozen, earned_total, spent_total FROM wallets WHERE user_id = ?',
    user.id,
  )
  res.json({
    data: {
      user: userDto(user),
      wallet: {
        available: wallet?.available || 0,
        frozen: wallet?.frozen || 0,
        earnedTotal: wallet?.earned_total || 0,
        spentTotal: wallet?.spent_total || 0,
      },
    },
  })
})

const updateProfileSchema = z.object({
  nickname: z.string().trim().min(2).max(20).optional(),
  bio: z.string().trim().max(300).optional(),
  campus: z.string().trim().max(30).optional(),
  major: z.string().trim().max(40).optional(),
  avatar: z
    .string()
    .regex(/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/, '头像地址无效')
    .optional(),
})

router.patch('/me', requireAuth, (req, res) => {
  const result = updateProfileSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message || '资料格式有误')
  const current = getOne<UserRow>('SELECT * FROM users WHERE id = ?', req.authUser!.id)
  if (!current) throw new NotFoundError('用户不存在')
  const input = result.data
  if (input.avatar) assertOwnedImageUrls(current.id, [input.avatar])
  execute(
    'UPDATE users SET nickname = ?, bio = ?, campus = ?, major = ?, avatar = ? WHERE id = ?',
    input.nickname ?? current.nickname,
    input.bio ?? current.bio,
    input.campus ?? current.campus,
    input.major ?? current.major,
    input.avatar ?? current.avatar,
    current.id,
  )
  const updated = getOne<UserRow>('SELECT * FROM users WHERE id = ?', current.id)
  res.json({ data: userDto(updated!) })
})

export default router

