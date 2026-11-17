import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from './config'
import { getOne } from './db'
import { AppError } from './errors'
import type { AuthUser } from './types'

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: '7d' })
}

export function readToken(token: string): AuthUser {
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    if (typeof payload === 'string') throw new Error('invalid payload')
    return {
      id: String(payload.id),
      nickname: String(payload.nickname),
      email: String(payload.email),
      role: payload.role === 'ADMIN' ? 'ADMIN' : 'STUDENT',
    }
  } catch {
    throw new AppError(401, '登录状态已失效，请重新登录', 'UNAUTHORIZED')
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const user = req.authUser
  if (!user) {
    next(new AppError(401, '请先登录', 'UNAUTHORIZED'))
    return
  }
  const current = getOne<{ role: string }>('SELECT role FROM users WHERE id = ?', user.id)
  if (current?.role !== 'ADMIN') {
    next(new AppError(403, '需要管理员权限', 'ADMIN_REQUIRED'))
    return
  }
  next()
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, '请先登录', 'UNAUTHORIZED'))
    return
  }

  try {
    req.authUser = readToken(header.slice(7))
    next()
  } catch (error) {
    next(error)
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    next()
    return
  }
  try {
    req.authUser = readToken(header.slice(7))
  } catch {
    // Public endpoints remain accessible when an expired token is present.
  }
  next()
}

