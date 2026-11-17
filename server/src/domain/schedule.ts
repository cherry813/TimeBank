export interface TimeRange {
  start: Date
  end: Date
}

export function createTimeRange(start: string | Date, hours: number): TimeRange {
  const startDate = new Date(start)
  const end = new Date(startDate.getTime() + hours * 3_600_000)
  return { start: startDate, end }
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime()
}

