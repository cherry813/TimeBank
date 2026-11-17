import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import multer, { MulterError } from 'multer'
import { requireAuth } from '../auth'
import { config } from '../config'
import { execute, id, now } from '../db'
import { AppError } from '../errors'

const router = Router()
fs.mkdirSync(config.uploadsPath, { recursive: true })

const allowedTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
])

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 6,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      callback(new AppError(400, '仅支持 JPG、PNG 或 WebP 图片', 'INVALID_IMAGE_TYPE'))
      return
    }
    callback(null, true)
  },
})

function uploadMiddleware(req: Request, res: Response, next: NextFunction) {
  uploader.array('images', 6)(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      next(
        new AppError(
          400,
          error.code === 'LIMIT_FILE_SIZE' ? '单张图片不能超过 5MB' : '最多上传 6 张图片',
          'UPLOAD_LIMIT',
        ),
      )
      return
    }
    next(error)
  })
}

function hasValidSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString() === 'RIFF' &&
      buffer.subarray(8, 12).toString() === 'WEBP'
    )
  }
  return false
}

router.post('/images', requireAuth, uploadMiddleware, async (req, res) => {
  const files = (req.files || []) as Express.Multer.File[]
  if (!files.length) throw new AppError(400, '请选择要上传的图片', 'NO_IMAGE')

  for (const file of files) {
    if (!hasValidSignature(file.buffer, file.mimetype)) {
      throw new AppError(400, '图片内容与文件格式不符', 'INVALID_IMAGE_CONTENT')
    }
  }

  const images = []
  for (const file of files) {
    const extension = allowedTypes.get(file.mimetype)!
    const filename = `${randomUUID().replaceAll('-', '')}${extension}`
    await fs.promises.writeFile(path.join(config.uploadsPath, filename), file.buffer)
    const url = `/uploads/${filename}`
    execute(
      'INSERT INTO uploaded_assets (id, user_id, url, created_at) VALUES (?, ?, ?, ?)',
      id('asset'),
      req.authUser!.id,
      url,
      now(),
    )
    images.push({ url, size: file.size })
  }

  res.status(201).json({ data: { images } })
})

export default router

