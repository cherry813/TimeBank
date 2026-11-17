import { describe, expect, it } from 'vitest'
import { createTimeRange, rangesOverlap } from './schedule'

describe('schedule overlap', () => {
  it('detects overlapping service ranges', () => {
    const first = createTimeRange('2026-12-01T09:00:00.000Z', 2)
    const second = createTimeRange('2026-12-01T10:00:00.000Z', 2)
    expect(rangesOverlap(first, second)).toBe(true)
  })

  it('allows back-to-back bookings', () => {
    const first = createTimeRange('2026-12-01T09:00:00.000Z', 2)
    const second = createTimeRange('2026-12-01T11:00:00.000Z', 1)
    expect(rangesOverlap(first, second)).toBe(false)
  })

  it('detects a longer booking fully containing a shorter one', () => {
    const first = createTimeRange('2026-12-01T09:00:00.000Z', 5)
    const second = createTimeRange('2026-12-01T10:00:00.000Z', 1)
    expect(rangesOverlap(first, second)).toBe(true)
  })
})
