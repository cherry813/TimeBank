import { config } from '../config'
import { autoConfirmExpiredOrders } from '../services/orderService'
import { sendDueOrderReminders } from '../services/reminderService'

export function startOrderAutomationWorker() {
  let running = false

  const run = () => {
    if (running) return
    running = true
    try {
      const count = autoConfirmExpiredOrders()
      if (count > 0) console.log(`Auto-confirmed ${count} expired order(s)`)
      const reminders = sendDueOrderReminders()
      if (reminders.total > 0) {
        console.log(`Sent reminders for ${reminders.total} order(s)`)
      }
    } catch (error) {
      console.error('automatic order confirmation failed', error)
    } finally {
      running = false
    }
  }

  const initialTimer = setTimeout(run, 5_000)
  initialTimer.unref()
  const interval = setInterval(run, config.autoConfirmIntervalMs)
  interval.unref()

  return () => {
    clearTimeout(initialTimer)
    clearInterval(interval)
  }
}

