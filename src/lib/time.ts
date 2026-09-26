import dayjs from 'dayjs'
import type { TimeEntry } from './types'

export function entrySeconds(entry: Pick<TimeEntry, 'start_at' | 'end_at'>, now = Date.now()): number {
  const end = entry.end_at ? new Date(entry.end_at).getTime() : now
  return Math.max(0, Math.floor((end - new Date(entry.start_at).getTime()) / 1000))
}

export function formatDuration(totalSeconds: number, withSeconds = true): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = String(m).padStart(2, '0')
  return withSeconds ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${h}:${mm}`
}

export function formatHours(totalSeconds: number): string {
  return `${(totalSeconds / 3600).toFixed(2)} h`
}

/** Local calendar date (YYYY-MM-DD) of a timestamp. */
export function localDate(iso: string | Date): string {
  return dayjs(iso).format('YYYY-MM-DD')
}

/** Combine a local date and HH:mm time into an ISO timestamp. */
export function combineDateTime(date: string, time: string): string {
  return dayjs(`${date}T${time}`).toISOString()
}

/** Resolve start/end timestamps; an end time earlier than the start means the entry ran past midnight. */
export function entryRange(date: string, start: string, end: string): { start_at: string; end_at: string } | null {
  if (!date || !start || !end) return null
  const s = dayjs(combineDateTime(date, start))
  let e = dayjs(combineDateTime(date, end))
  if (!e.isAfter(s)) e = e.add(1, 'day')
  return { start_at: s.toISOString(), end_at: e.toISOString() }
}
