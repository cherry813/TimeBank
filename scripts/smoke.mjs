import WebSocket from 'ws'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000/api'

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path}: ${payload.error?.message || response.status}`)
  }
  return payload.data
}

async function login(email) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: '123456' }),
  })
  return result
}

function tomorrowAt(hour) {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

async function perform(token, orderId, action, note = '') {
  return request(`/orders/${orderId}/actions`, {
    method: 'POST',
    token,
    body: JSON.stringify({ action, note }),
  })
}

function waitForSocketEvent(socket, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`等待 WebSocket ${type} 超时`)), 5000)
    const listener = (raw) => {
      const event = JSON.parse(raw.toString())
      if (event.type === type) {
        clearTimeout(timeout)
        socket.off('message', listener)
        resolve(event)
      }
    }
    socket.on('message', listener)
  })
}

async function main() {
  const testDatabase = new DatabaseSync(path.resolve(process.cwd(), 'data/timebank.db'))
  try {
    testDatabase.exec('PRAGMA busy_timeout = 5000')
    testDatabase
      .prepare("UPDATE wallets SET available = MAX(available, 20) WHERE user_id = 'u_lin'")
      .run()
  } finally {
    testDatabase.close()
  }

  const buyer = await login('lin@campus.edu')
  const provider = await login('zhou@campus.edu')
  const buyerBefore = await request('/auth/me', { token: buyer.token })
  const providerBefore = await request('/auth/me', { token: provider.token })
  const primarySlot = tomorrowAt(19)
  const initialAvailability = await request(
    `/orders/schedule-check?listingId=l_seed_3&hours=1&scheduledAt=${encodeURIComponent(primarySlot)}`,
    { token: buyer.token },
  )
  if (!initialAvailability.available) throw new Error('空白时段被错误判定为日程冲突')

  const order = await request('/orders', {
    method: 'POST',
    token: buyer.token,
    body: JSON.stringify({
      listingId: 'l_seed_3',
      hours: 1,
      scheduledAt: primarySlot,
      note: '自动验收：请检查笔记本风扇噪音。',
    }),
  })
  const conflictCheck = await request(
    `/orders/schedule-check?listingId=l_seed_4&hours=1&scheduledAt=${encodeURIComponent(primarySlot)}`,
    { token: buyer.token },
  )
  if (conflictCheck.available || !conflictCheck.buyerConflict) {
    throw new Error('预约方日程冲突检测异常')
  }
  const calendarFrom = new Date(new Date(primarySlot).getTime() - 3_600_000).toISOString()
  const calendarTo = new Date(new Date(primarySlot).getTime() + 3 * 3_600_000).toISOString()
  const busyWindow = await request(
    `/orders/schedule-busy?listingId=l_seed_3&from=${encodeURIComponent(calendarFrom)}&to=${encodeURIComponent(calendarTo)}`,
    { token: buyer.token },
  )
  if (!busyWindow.existingActiveOrder || !busyWindow.busy.length) {
    throw new Error('可视化日历未返回忙碌区间')
  }
  await perform(provider.token, order.id, 'ACCEPT')
  await perform(provider.token, order.id, 'START')
  const submitted = await perform(provider.token, order.id, 'SUBMIT', '已完成清灰和温度测试')
  if (!submitted.autoConfirmAt) throw new Error('待确认订单未生成自动确认期限')
  const completed = await perform(buyer.token, order.id, 'CONFIRM')
  const reviewed = await request(`/orders/${order.id}/review`, {
    method: 'POST',
    token: buyer.token,
    body: JSON.stringify({ rating: 5, content: '沟通清楚，处理速度很快。' }),
  })
  const providerReviewed = await request(`/orders/${order.id}/review`, {
    method: 'POST',
    token: provider.token,
    body: JSON.stringify({ rating: 4, content: '预约准时，需求说明清楚。' }),
  })

  const buyerAfter = await request('/auth/me', { token: buyer.token })
  const providerAfter = await request('/auth/me', { token: provider.token })
  if (
    completed.status !== 'COMPLETED' ||
    reviewed.review?.rating !== 5 ||
    providerReviewed.reviews?.provider?.rating !== 4
  ) {
    throw new Error('订单完成或双向评价流程异常')
  }
  if (buyerAfter.wallet.frozen !== buyerBefore.wallet.frozen) {
    throw new Error('订单完成后预约方冻结金额未清零')
  }
  if (providerAfter.wallet.available !== providerBefore.wallet.available + 1) {
    throw new Error('订单完成后服务方时间币未正确到账')
  }

  const favoritesBefore = await request('/listings/favorites/mine', { token: buyer.token })
  let favorite = favoritesBefore.find((item) => item.listing.id === 'l_seed_5')
  if (favorite) {
    await request('/listings/l_seed_5/favorite', {
      method: 'POST',
      token: buyer.token,
    })
  }
  const favoriteResult = await request('/listings/l_seed_5/favorite', {
    method: 'POST',
    token: buyer.token,
  })
  const favoritesAfter = await request('/listings/favorites/mine', { token: buyer.token })
  if (
    !favoriteResult.favorited ||
    !favoritesAfter.some((item) => item.listing.id === 'l_seed_5')
  ) {
    throw new Error('收藏写入或收藏列表异常')
  }
  const recommendations = await request('/listings/recommendations', { token: buyer.token })
  const favoriteRecommendation = recommendations.find((item) => item.id === 'l_seed_5')
  if (!favoriteRecommendation?.recommendationReason?.includes('收藏')) {
    throw new Error('收藏行为未进入推荐信号')
  }
  await request('/listings/l_seed_5', { token: buyer.token })
  const viewHistory = await request('/listings/history/mine', { token: buyer.token })
  if (!viewHistory.some((item) => item.listing.id === 'l_seed_5')) {
    throw new Error('浏览足迹未正确记录')
  }

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
  const uploadBody = new FormData()
  uploadBody.append('images', new Blob([png], { type: 'image/png' }), 'smoke.png')
  const uploadResponse = await fetch(`${baseUrl}/uploads/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: uploadBody,
  })
  const uploadPayload = await uploadResponse.json()
  if (!uploadResponse.ok || !uploadPayload.data?.images?.[0]?.url) {
    throw new Error(uploadPayload.error?.message || '图片上传失败')
  }
  const imageResponse = await fetch(
    `http://localhost:3000${uploadPayload.data.images[0].url}`,
  )
  if (!imageResponse.ok || !imageResponse.headers.get('content-type')?.includes('image/png')) {
    throw new Error('上传图片无法通过公开地址访问')
  }
  const invalidBody = new FormData()
  invalidBody.append(
    'images',
    new Blob(['not-a-real-image'], { type: 'image/png' }),
    'invalid.png',
  )
  const invalidResponse = await fetch(`${baseUrl}/uploads/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: invalidBody,
  })
  if (invalidResponse.status !== 400) throw new Error('伪造图片文件头未被拒绝')

  const editableListing = await request('/listings/l_seed_1', { token: buyer.token })
  const editedListing = await request('/listings/l_seed_1', {
    method: 'PATCH',
    token: buyer.token,
    body: JSON.stringify({
      title: editableListing.title,
      description: editableListing.description,
      images: editableListing.images,
      tags: editableListing.tags,
    }),
  })
  if (
    editedListing.id !== 'l_seed_1' ||
    editedListing.location !== editableListing.location ||
    editedListing.availability !== editableListing.availability
  ) {
    throw new Error('技能帖部分更新误清空了其他字段')
  }
  const publicProfile = await request('/users/u_song')
  if (publicProfile.id !== 'u_song' || !Array.isArray(publicProfile.listings)) {
    throw new Error('公开用户主页数据异常')
  }

  const refundOrder = await request('/orders', {
    method: 'POST',
    token: buyer.token,
    body: JSON.stringify({
      listingId: 'l_seed_3',
      hours: 2,
      scheduledAt: tomorrowAt(20),
      note: '自动验收：取消退款测试。',
    }),
  })
  const cancelled = await perform(buyer.token, refundOrder.id, 'CANCEL', '时间冲突')
  const buyerAfterRefund = await request('/auth/me', { token: buyer.token })
  if (cancelled.status !== 'CANCELLED' || buyerAfterRefund.wallet.available !== buyerAfter.wallet.available) {
    throw new Error('取消订单后时间币未正确退回')
  }

  const buyerSocket = new WebSocket(
    `ws://localhost:3000/ws?token=${encodeURIComponent(buyer.token)}`,
  )
  const providerSocket = new WebSocket(
    `ws://localhost:3000/ws?token=${encodeURIComponent(provider.token)}`,
  )
  await Promise.all([
    waitForSocketEvent(buyerSocket, 'connection.ready'),
    waitForSocketEvent(providerSocket, 'connection.ready'),
  ])
  const incoming = waitForSocketEvent(providerSocket, 'chat.message')
  buyerSocket.send(
    JSON.stringify({
      type: 'chat.send',
      conversationId: completed.conversationId,
      content: '自动验收消息：订单已经完成，感谢！',
    }),
  )
  const event = await incoming
  const history = await request(
    `/chat/conversations/${completed.conversationId}/messages`,
    { token: provider.token },
  )
  buyerSocket.close()
  providerSocket.close()

  if (event.data?.content !== '自动验收消息：订单已经完成，感谢！' || history.length < 1) {
    throw new Error('WebSocket 消息送达或持久化失败')
  }

  const buyerBeforeDispute = await request('/auth/me', { token: buyer.token })
  const disputeOrder = await request('/orders', {
    method: 'POST',
    token: buyer.token,
    body: JSON.stringify({
      listingId: 'l_seed_3',
      hours: 1,
      scheduledAt: tomorrowAt(21),
      note: '自动验收：申诉审核测试。',
    }),
  })
  await perform(provider.token, disputeOrder.id, 'ACCEPT')
  await perform(provider.token, disputeOrder.id, 'START')
  await perform(provider.token, disputeOrder.id, 'SUBMIT', '提交一次测试服务')
  const disputed = await perform(
    buyer.token,
    disputeOrder.id,
    'DISPUTE',
    '自动验收：提交申诉说明',
  )
  if (disputed.status !== 'DISPUTED') throw new Error('订单未进入申诉状态')

  const admin = await login('admin@campus.edu')
  const reportTarget = await request('/listings', {
    method: 'POST',
    token: provider.token,
    body: JSON.stringify({
      kind: 'OFFER',
      title: '自动验收举报目标技能',
      category: '其他',
      description: '这是一条用于自动验收举报审核流程的临时技能内容。',
      tags: ['自动验收'],
      images: [],
      location: '线上',
      availability: '自动验收',
      coverColor: '#5D7CF6',
    }),
  })
  const report = await request('/reports', {
    method: 'POST',
    token: buyer.token,
    body: JSON.stringify({
      targetType: 'LISTING',
      targetId: reportTarget.id,
      reason: 'INAPPROPRIATE',
      detail: '自动验收：核实内容审核与下架流程。',
    }),
  })
  const adminReports = await request('/admin/reports?status=PENDING', { token: admin.token })
  if (!adminReports.some((item) => item.id === report.id)) {
    throw new Error('举报未进入管理员内容审核队列')
  }
  await request(`/admin/reports/${report.id}/resolve`, {
    method: 'POST',
    token: admin.token,
    body: JSON.stringify({
      decision: 'CLOSE_LISTING',
      note: '自动验收：内容不符合展示规范，下架处理。',
    }),
  })
  const closedTarget = await request(`/listings/${reportTarget.id}`, { token: admin.token })
  if (closedTarget.status !== 'CLOSED' || !closedTarget.moderationBlocked) {
    throw new Error('举报审核未正确关闭技能帖')
  }

  const adminQueue = await request('/admin/disputes', { token: admin.token })
  if (!adminQueue.items.some((item) => item.id === disputeOrder.id)) {
    throw new Error('申诉未进入管理员待审核队列')
  }
  const resolved = await request(`/admin/orders/${disputeOrder.id}/resolve`, {
    method: 'POST',
    token: admin.token,
    body: JSON.stringify({
      resolution: 'REFUND',
      note: '自动验收：申诉成立，退回冻结时间币。',
    }),
  })
  const buyerAfterDispute = await request('/auth/me', { token: buyer.token })
  const notifications = await request('/notifications', { token: buyer.token })
  if (
    resolved.status !== 'CANCELLED' ||
    buyerAfterDispute.wallet.available !== buyerBeforeDispute.wallet.available ||
    !notifications.items.length
  ) {
    throw new Error('申诉退款或通知链路异常')
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        orderFlow: 'PENDING → ACCEPTED → IN_PROGRESS → AWAITING_CONFIRMATION → COMPLETED',
        reviews: 'buyer and provider both reviewed',
        listingLifecycle: 'edited and publicly browsable',
        moderation: 'reported, reviewed and closed',
        scheduleConflict: 'buyer overlap detected',
        calendarWindow: `${busyWindow.busy.length} busy interval(s)`,
        favorites: 'saved and listed',
        recommendationSignal: 'favorite category boosted',
        history: 'recorded',
        imageUpload: 'validated and served',
        invalidImage: 'rejected',
        refundFlow: 'PENDING → CANCELLED',
        disputeFlow: 'AWAITING_CONFIRMATION → DISPUTED → CANCELLED (admin refund)',
        websocket: 'delivered and persisted',
        notifications: notifications.items.length,
        buyerBalance: buyerAfterDispute.wallet.available,
        providerBalance: providerAfter.wallet.available,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
