import { Router } from 'express'
import { requireAuth } from '../auth'
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService'

const router = Router()
router.use(requireAuth)

router.get('/', (req, res) => {
  res.json({ data: listNotifications(req.authUser!.id, Number(req.query.limit) || 30) })
})

router.get('/unread-count', (req, res) => {
  res.json({ data: { unreadCount: getUnreadNotificationCount(req.authUser!.id) } })
})

router.post('/read-all', (req, res) => {
  res.json({ data: markAllNotificationsRead(req.authUser!.id) })
})

router.post('/:id/read', (req, res) => {
  res.json({
    data: markNotificationRead(req.authUser!.id, String(req.params.id)),
  })
})

export default router

