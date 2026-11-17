import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth'
import { AppError } from '../errors'
import { broadcastToUsers } from '../realtime/chatHub'
import {
  createConversationFromListing,
  getConversation,
  getMessages,
  listConversations,
  sendMessage,
} from '../services/chatService'

const router = Router()
router.use(requireAuth)

router.get('/conversations', (req, res) => {
  res.json({ data: listConversations(req.authUser!.id) })
})

const createConversationSchema = z.object({ listingId: z.string().min(1) })

router.post('/conversations', (req, res) => {
  const result = createConversationSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, '请选择要沟通的技能帖')
  res.status(201).json({
    data: createConversationFromListing(result.data.listingId, req.authUser!.id),
  })
})

router.get('/conversations/:id', (req, res) => {
  res.json({ data: getConversation(req.params.id, req.authUser!.id) })
})

router.get('/conversations/:id/messages', (req, res) => {
  res.json({ data: getMessages(req.params.id, req.authUser!.id) })
})

const sendSchema = z.object({ content: z.string().trim().min(1).max(1000) })

router.post('/conversations/:id/messages', (req, res) => {
  const result = sendSchema.safeParse(req.body)
  if (!result.success) throw new AppError(400, '请输入 1 至 1000 字的消息')
  const sent = sendMessage(req.params.id, req.authUser!.id, result.data.content)
  const recipientId = sent.participants.find((participant) => participant !== req.authUser!.id)
  if (recipientId) {
    broadcastToUsers([recipientId], { type: 'chat.message', data: sent.message })
  }
  res.status(201).json({ data: sent.message })
})

export default router

