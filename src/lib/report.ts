import dayjs from 'dayjs'
import { formatMoney } from './money'
import { startOfWeek } from './ranges'
import { amountCents, resolveRate } from './rates'
import { entrySeconds, localDate } from './time'
import type { Client, Project, Rate, Task, TimeEntry } from './types'

/** Filter value that matches entries without a client / project / task. */
export const NONE = '__none__'

export type GroupKey = 'client' | 'project' | 'task' | 'day' | 'week' | 'month' | 'description'

export const GROUP_OPTIONS: { value: GroupKey; label: string }[] = [
  { value: 'project', label: 'Project' },
  { value: 'client', label: 'Client' },
  { value: 'task', label: 'Task' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'description', label: 'Description' },
]

export interface ReportFilters {
  clientIds: string[]
  projectIds: string[]
  taskIds: string[]
  billable: 'all' | 'billable' | 'nonbillable'
  invoiced: 'all' | 'invoiced' | 'uninvoiced'
}

export const EMPTY_FILTERS: ReportFilters = {
  clientIds: [],
  projectIds: [],
  taskIds: [],
  billable: 'all',
  invoiced: 'all',
}

export interface ReportContext {
  projects: Project[]
  clients: Client[]
  tasks: Task[]
  rates: Rate[]
  currency: string
  weekStart: number
}

/** A time entry with everything a report needs, resolved once. */
export interface ReportRow {
  entry: TimeEntry
  date: string
  seconds: number
  project: Project | null
  task: Task | null
  client: Client | null
  rateCents: number
  /** Billable amount; 0 for non-billable entries. */
  cents: number
  currency: string
}

/** Amounts per currency, e.g. { USD: 12000, EUR: 5000 }. */
export type MoneyTotals = Record<string, number>

export function addMoney(totals: MoneyTotals, currency: string, cents: number) {
  totals[currency] = (totals[currency] ?? 0) + cents
}

export function formatMoneyTotals(totals: MoneyTotals, fallbackCurrency: string): string {
  const parts = Object.entries(totals).filter(([, c]) => c !== 0)
  if (parts.length === 0) return formatMoney(0, fallbackCurrency)
  return parts.map(([cur, c]) => formatMoney(c, cur)).join(' + ')
}

export function buildRows(entries: TimeEntry[], ctx: ReportContext): ReportRow[] {
  const projects = new Map(ctx.projects.map((p) => [p.id, p]))
  const clients = new Map(ctx.clients.map((c) => [c.id, c]))
  const tasks = new Map(ctx.tasks.map((t) => [t.id, t]))
  return entries.map((entry) => {
    const project = (entry.project_id && projects.get(entry.project_id)) || null
    const task = (entry.task_id && tasks.get(entry.task_id)) || null
    const client = (project?.client_id && clients.get(project.client_id)) || null
    const date = localDate(entry.start_at)
    const seconds = entrySeconds(entry)
    const rate = resolveRate(ctx.rates, { taskId: entry.task_id, projectId: entry.project_id, clientId: project?.client_id }, date)
    return {
      entry,
      date,
      seconds,
      project,
      task,
      client,
      rateCents: rate.cents,
      cents: entry.billable ? amountCents(seconds, rate.cents) : 0,
      currency: client?.currency ?? ctx.currency,
    }
  })
}

function matchesIds(ids: string[], id: string | null | undefined): boolean {
  if (ids.length === 0) return true
  return ids.includes(id ?? NONE)
}

export function applyFilters(rows: ReportRow[], f: ReportFilters): ReportRow[] {
  return rows.filter(
    (r) =>
      matchesIds(f.clientIds, r.client?.id) &&
      matchesIds(f.projectIds, r.project?.id) &&
      matchesIds(f.taskIds, r.task?.id) &&
      (f.billable === 'all' || (f.billable === 'billable') === r.entry.billable) &&
      (f.invoiced === 'all' || (f.invoiced === 'invoiced') === !!r.entry.invoice_id),
  )
}

export interface Totals {
  seconds: number
  billableSeconds: number
  money: MoneyTotals
  count: number
}

export function totals(rows: ReportRow[]): Totals {
  const t: Totals = { seconds: 0, billableSeconds: 0, money: {}, count: rows.length }
  for (const r of rows) {
    t.seconds += r.seconds
    if (r.entry.billable) {
      t.billableSeconds += r.seconds
      addMoney(t.money, r.currency, r.cents)
    }
  }
  return t
}

export interface ReportGroup extends Totals {
  key: string
  label: string
  sub?: string
  color?: string
  sortKey: string
  children: ReportGroup[]
}

function groupKeyOf(r: ReportRow, key: GroupKey, weekStart: number): { key: string; label: string; sub?: string; color?: string; sortKey: string } {
  switch (key) {
    case 'client':
      return r.client
        ? { key: r.client.id, label: r.client.name, sortKey: r.client.name.toLowerCase() }
        : { key: NONE, label: 'No client', sortKey: '￿' }
    case 'project':
      return r.project
        ? { key: r.project.id, label: r.project.name, sub: r.client?.name, color: r.project.color, sortKey: r.project.name.toLowerCase() }
        : { key: NONE, label: 'No project', sortKey: '￿' }
    case 'task':
      return r.task
        ? { key: r.task.id, label: r.task.name, sub: r.project?.name, sortKey: `${r.project?.name ?? ''} ${r.task.name}`.toLowerCase() }
        : { key: NONE, label: 'No task', sortKey: '￿' }
    case 'day':
      return { key: r.date, label: dayjs(r.date).format('ddd, MMM D, YYYY'), sortKey: r.date }
    case 'week': {
      const s = startOfWeek(dayjs(r.date), weekStart)
      return {
        key: s.format('YYYY-MM-DD'),
        label: `Week of ${s.format('MMM D, YYYY')}`,
        sortKey: s.format('YYYY-MM-DD'),
      }
    }
    case 'month': {
      const m = dayjs(r.date).startOf('month')
      return { key: m.format('YYYY-MM'), label: m.format('MMMM YYYY'), sortKey: m.format('YYYY-MM') }
    }
    case 'description': {
      const d = r.entry.description.trim()
      return d ? { key: d.toLowerCase(), label: d, sortKey: d.toLowerCase() } : { key: NONE, label: '(no description)', sortKey: '￿' }
    }
  }
}

const CHRONOLOGICAL: GroupKey[] = ['day', 'week', 'month']

export function groupRows(rows: ReportRow[], keys: GroupKey[], weekStart: number): ReportGroup[] {
  if (keys.length === 0) return []
  const [key, ...rest] = keys
  const map = new Map<string, { meta: ReturnType<typeof groupKeyOf>; rows: ReportRow[] }>()
  for (const r of rows) {
    const meta = groupKeyOf(r, key, weekStart)
    const g = map.get(meta.key)
    if (g) g.rows.push(r)
    else map.set(meta.key, { meta, rows: [r] })
  }
  const groups = [...map.values()].map(({ meta, rows: groupRowsList }) => ({
    ...meta,
    ...totals(groupRowsList),
    children: groupRows(groupRowsList, rest, weekStart),
  }))
  // Dates read naturally oldest-first; everything else largest-first.
  if (CHRONOLOGICAL.includes(key)) groups.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  else groups.sort((a, b) => b.seconds - a.seconds || a.sortKey.localeCompare(b.sortKey))
  return groups
}

// ---------------------------------------------------------------------------
// Chart buckets
// ---------------------------------------------------------------------------

export interface ChartBucket {
  label: string
  billable: number
  nonBillable: number
}

export function chartBuckets(rows: ReportRow[], [from, to]: [string, string], weekStart: number): ChartBucket[] {
  const start = dayjs(from)
  const end = dayjs(to)
  const days = end.diff(start, 'day') + 1
  const unit: 'day' | 'week' | 'month' = days <= 31 ? 'day' : days <= 182 ? 'week' : 'month'

  const bucketStart = (d: dayjs.Dayjs) =>
    unit === 'day' ? d.startOf('day') : unit === 'week' ? startOfWeek(d, weekStart) : d.startOf('month')

  const buckets = new Map<string, ChartBucket>()
  for (let d = bucketStart(start); !d.isAfter(end); d = d.add(1, unit)) {
    const label = unit === 'day' ? d.format(days <= 7 ? 'ddd D' : 'MMM D') : unit === 'week' ? d.format('MMM D') : d.format('MMM YYYY')
    buckets.set(d.format('YYYY-MM-DD'), { label, billable: 0, nonBillable: 0 })
  }
  for (const r of rows) {
    const b = buckets.get(bucketStart(dayjs(r.date)).format('YYYY-MM-DD'))
    if (!b) continue
    const hours = r.seconds / 3600
    if (r.entry.billable) b.billable += hours
    else b.nonBillable += hours
  }
  return [...buckets.values()].map((b) => ({
    ...b,
    billable: Math.round(b.billable * 100) / 100,
    nonBillable: Math.round(b.nonBillable * 100) / 100,
  }))
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // BOM so Excel opens UTF-8 correctly.
  const csv = '﻿' + rows.map((r) => r.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
