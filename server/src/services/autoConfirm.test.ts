import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'timebank-auto-confirm-'))
process.env.DATABASE_PATH = path.join(testDirectory, 'test.db')

const { getOne, execute, db } = await import('../db')
const {
  autoConfirmExpiredOrders,
  checkScheduleAvailability,
  createOrder,
  getOrder,
  getOrderEvents,
  performOrderAction,
} = await import('./orderService')

afterAll(() => {
  db.close()
  fs.rmSync(testDirectory, { recursive: true, force: true })
})

describe('automatic order confirmation', () => {
  it('rejects overlapping schedules for the provider or buyer', () => {
    const start = new Date(Date.now() + 2 * 86_400_000)
    start.setHours(10, 0, 0, 0)
    createOrder('u_lin', {
      listingId: 'l_seed_2',
      hours: 2,
      scheduledAt: start.toISOString(),
      note: '日程冲突测试',
    })

    expect(() =>
      createOrder('u_zhou', {
        listingId: 'l_seed_2',
        hours: 1,
        scheduledAt: new Date(start.getTime() + 3_600_000).toISOString(),
        note: '服务方时间冲突',
      }),
    ).toThrow(/服务方在该时段已有安排/)

    const buyerConflict = checkScheduleAvailability('u_lin', {
      listingId: 'l_seed_4',
      hours: 1,
      scheduledAt: new Date(start.getTime() + 3_600_000).toISOString(),
    })
    expect(buyerConflict.available).toBe(false)
    expect(buyerConflict.buyerConflict).toBe(true)

    const adjacent = checkScheduleAvailability('u_lin', {
      listingId: 'l_seed_4',
      hours: 1,
      scheduledAt: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    })
    expect(adjacent.available).toBe(true)
  })

  it('settles an expired waiting order exactly once', () => {
    const scheduled = new Date(Date.now() + 86_400_000)
    scheduled.setMinutes(0, 0, 0)
    const order = createOrder('u_lin', {
      listingId: 'l_seed_3',
      hours: 1,
      scheduledAt: scheduled.toISOString(),
      note: '自动确认测试订单',
    })
    performOrderAction(order.id, 'u_zhou', 'ACCEPT')
    performOrderAction(order.id, 'u_zhou', 'START')
    const waiting = performOrderAction(order.id, 'u_zhou', 'SUBMIT')
    expect(waiting.status).toBe('AWAITING_CONFIRMATION')
    expect(waiting.autoConfirmAt).toBeTruthy()

    const providerBefore = getOne<{ available: number }>(
      'SELECT available FROM wallets WHERE user_id = ?',
      'u_zhou',
    )!.available
    execute(
      'UPDATE orders SET auto_confirm_at = ? WHERE id = ?',
      new Date(Date.now() - 1_000).toISOString(),
      order.id,
    )

    expect(autoConfirmExpiredOrders(new Date().toISOString())).toBe(1)
    expect(autoConfirmExpiredOrders(new Date().toISOString())).toBe(0)
    expect(getOrder(order.id, 'u_lin').status).toBe('COMPLETED')
    expect(
      getOne<{ available: number }>(
        'SELECT available FROM wallets WHERE user_id = ?',
        'u_zhou',
      )!.available,
    ).toBe(providerBefore + 1)
    expect(getOrderEvents(order.id, 'u_lin').some((event) => event.action === 'AUTO_CONFIRM')).toBe(
      true,
    )
  })
})
