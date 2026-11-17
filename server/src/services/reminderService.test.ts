import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'timebank-reminders-'))
process.env.DATABASE_PATH = path.join(testDirectory, 'test.db')

const { db, getAll } = await import('../db')
const { createOrder, performOrderAction } = await import('./orderService')
const { sendDueOrderReminders } = await import('./reminderService')

afterAll(() => {
  db.close()
  fs.rmSync(testDirectory, { recursive: true, force: true })
})

describe('appointment reminders', () => {
  it('sends one-hour and one-day reminders without duplicates', () => {
    const oneHourOrder = createOrder('u_lin', {
      listingId: 'l_seed_3',
      hours: 1,
      scheduledAt: new Date(Date.now() + 45 * 60_000).toISOString(),
      note: '一小时内提醒测试',
    })
    performOrderAction(oneHourOrder.id, 'u_zhou', 'ACCEPT')

    const dayOrder = createOrder('u_lin', {
      listingId: 'l_seed_4',
      hours: 1,
      scheduledAt: new Date(Date.now() + 18 * 3_600_000).toISOString(),
      note: '二十四小时提醒测试',
    })
    performOrderAction(dayOrder.id, 'u_song', 'ACCEPT')

    const firstRun = sendDueOrderReminders(new Date().toISOString())
    expect(firstRun.oneHour).toBe(1)
    expect(firstRun.oneDay).toBe(1)
    expect(firstRun.total).toBe(2)

    const secondRun = sendDueOrderReminders(new Date().toISOString())
    expect(secondRun.total).toBe(0)

    const reminderRows = getAll<{ order_id: string; type: string }>(
      'SELECT order_id, type FROM order_reminders ORDER BY type',
    )
    expect(reminderRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ order_id: oneHourOrder.id, type: '1H' }),
        expect.objectContaining({ order_id: dayOrder.id, type: '24H' }),
      ]),
    )
  })
})
