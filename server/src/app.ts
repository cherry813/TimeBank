import fs from 'node:fs'
import path from 'node:path'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { config } from './config'
import { AppError } from './errors'
import authRoutes from './routes/authRoutes'
import adminRoutes from './routes/adminRoutes'
import chatRoutes from './routes/chatRoutes'
import listingRoutes from './routes/listingRoutes'
import notificationRoutes from './routes/notificationRoutes'
import orderRoutes from './routes/orderRoutes'
import reportRoutes from './routes/reportRoutes'
import uploadRoutes from './routes/uploadRoutes'
import userRoutes from './routes/userRoutes'

export function createApp() {
  const app = express()

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: config.isProduction ? undefined : false,
    }),
  )
  app.use(cors({ origin: config.clientOrigin, credentials: true }))
  app.use(express.json({ limit: '256kb' }))

  app.get('/api/health', (_req, res) => {
    res.json({
      data: {
        status: 'ok',
        service: 'campus-time-bank',
        time: new Date().toISOString(),
      },
    })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/uploads', uploadRoutes)
  app.use(
    '/uploads',
    express.static(config.uploadsPath, {
      fallthrough: false,
      maxAge: '7d',
      immutable: true,
    }),
  )
  app.use('/api/admin', adminRoutes)
  app.use('/api/listings', listingRoutes)
  app.use('/api/orders', orderRoutes)
  app.use('/api/reports', reportRoutes)
  app.use('/api/chat', chatRoutes)
  app.use('/api/notifications', notificationRoutes)
  app.use('/api/users', userRoutes)

  const clientDist = path.resolve(process.cwd(), 'client/dist')
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        next()
        return
      }
      res.sendFile(path.join(clientDist, 'index.html'))
    })
  }

  app.use((_req, _res, next) => {
    next(new AppError(404, '接口不存在', 'NOT_FOUND'))
  })

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: { code: error.code, message: error.message },
      })
      return
    }

    console.error(error)
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: config.isProduction ? '服务器开小差了，请稍后再试' : String(error),
      },
    })
  })

  return app
}

