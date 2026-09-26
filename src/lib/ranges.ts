import dayjs, { type Dayjs } from 'dayjs'

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'last_7'
  | 'this_month'
  | 'last_month'
  | 'last_30'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'custom'

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'last_quarter', label: 'Last quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_year', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
]

export function startOfWeek(d: Dayjs, weekStart: number): Dayjs {
  const day = d.startOf('day')
  return day.subtract((day.day() - weekStart + 7) % 7, 'day')
}

function startOfQuarter(d: Dayjs): Dayjs {
  return d.startOf('month').month(Math.floor(d.month() / 3) * 3)
}

/** Inclusive start and end dates (YYYY-MM-DD) for a preset. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, weekStart: number): [string, string] {
  const today = dayjs().startOf('day')
  const f = (d: Dayjs) => d.format('YYYY-MM-DD')
  switch (preset) {
    case 'today':
      return [f(today), f(today)]
    case 'yesterday':
      return [f(today.subtract(1, 'day')), f(today.subtract(1, 'day'))]
    case 'this_week': {
      const s = startOfWeek(today, weekStart)
      return [f(s), f(s.add(6, 'day'))]
    }
    case 'last_week': {
      const s = startOfWeek(today, weekStart).subtract(7, 'day')
      return [f(s), f(s.add(6, 'day'))]
    }
    case 'last_7':
      return [f(today.subtract(6, 'day')), f(today)]
    case 'this_month':
      return [f(today.startOf('month')), f(today.endOf('month'))]
    case 'last_month': {
      const m = today.subtract(1, 'month')
      return [f(m.startOf('month')), f(m.endOf('month'))]
    }
    case 'last_30':
      return [f(today.subtract(29, 'day')), f(today)]
    case 'this_quarter': {
      const s = startOfQuarter(today)
      return [f(s), f(s.add(3, 'month').subtract(1, 'day'))]
    }
    case 'last_quarter': {
      const s = startOfQuarter(today).subtract(3, 'month')
      return [f(s), f(s.add(3, 'month').subtract(1, 'day'))]
    }
    case 'this_year':
      return [f(today.startOf('year')), f(today.endOf('year'))]
    case 'last_year': {
      const y = today.subtract(1, 'year')
      return [f(y.startOf('year')), f(y.endOf('year'))]
    }
  }
}

/** Inclusive local date range -> [startIso, endIsoExclusive). */
export function rangeToIso([from, to]: [string, string]): [string, string] {
  return [dayjs(from).startOf('day').toISOString(), dayjs(to).add(1, 'day').startOf('day').toISOString()]
}

export function formatRange([from, to]: [string, string]): string {
  const a = dayjs(from)
  const b = dayjs(to)
  if (from === to) return a.format('MMM D, YYYY')
  if (a.year() === b.year()) return `${a.format('MMM D')} – ${b.format('MMM D, YYYY')}`
  return `${a.format('MMM D, YYYY')} – ${b.format('MMM D, YYYY')}`
}
