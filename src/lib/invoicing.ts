import dayjs from 'dayjs'
import { formatMoney } from './money'
import type { ReportRow } from './report'
import type { Invoice, InvoiceStatus, Payment } from './types'

export type LineGrouping = 'project' | 'task' | 'entry' | 'single'

export const LINE_GROUPINGS: { value: LineGrouping; label: string }[] = [
  { value: 'project', label: 'One line per project' },
  { value: 'task', label: 'One line per task' },
  { value: 'entry', label: 'One line per time entry' },
  { value: 'single', label: 'A single line' },
]

export interface DraftLine {
  key: string
  description: string
  quantity: number
  rate_cents: number
  amount_cents: number
  entryIds: string[]
}

export function lineAmount(quantity: number, rateCents: number): number {
  return Math.round(quantity * rateCents)
}

/**
 * Turn billable time into invoice lines. Time with different hourly rates (e.g. after a rate change)
 * always lands on separate lines, so quantity × rate = amount holds for every line.
 */
export function buildLines(rows: ReportRow[], grouping: LineGrouping, currency: string): DraftLine[] {
  const groups = new Map<string, { description: string; sortKey: string; seconds: number; rate: number; entryIds: string[] }>()

  const dates = rows.map((r) => r.date).sort()
  const period =
    dates.length === 0
      ? ''
      : dates[0] === dates[dates.length - 1]
        ? dayjs(dates[0]).format('MMM D, YYYY')
        : `${dayjs(dates[0]).format('MMM D')} – ${dayjs(dates[dates.length - 1]).format('MMM D, YYYY')}`

  for (const r of rows) {
    let key: string
    let description: string
    let sortKey: string
    const projectName = r.project?.name ?? 'Other work'
    switch (grouping) {
      case 'project':
        key = r.project?.id ?? 'none'
        description = projectName
        sortKey = projectName
        break
      case 'task':
        key = `${r.project?.id ?? 'none'}/${r.task?.id ?? 'none'}`
        description = r.task ? `${projectName} › ${r.task.name}` : projectName
        sortKey = description
        break
      case 'entry': {
        key = r.entry.id
        const day = dayjs(r.date).format('MMM D')
        const where = r.task ? `${projectName} › ${r.task.name}` : projectName
        description = r.entry.description ? `${day} · ${r.entry.description} (${where})` : `${day} · ${where}`
        sortKey = r.entry.start_at
        break
      }
      case 'single':
        key = 'all'
        description = period ? `Professional services, ${period}` : 'Professional services'
        sortKey = ''
        break
    }
    const fullKey = `${key}@${r.rateCents}`
    const g = groups.get(fullKey)
    if (g) {
      g.seconds += r.seconds
      g.entryIds.push(r.entry.id)
    } else {
      groups.set(fullKey, { description, sortKey, seconds: r.seconds, rate: r.rateCents, entryIds: [r.entry.id] })
    }
  }

  // Mark lines that were split only because of different rates.
  const descCount = new Map<string, number>()
  for (const g of groups.values()) descCount.set(g.description, (descCount.get(g.description) ?? 0) + 1)

  return [...groups.entries()]
    .sort(([, a], [, b]) => a.sortKey.localeCompare(b.sortKey) || b.rate - a.rate)
    .map(([key, g]) => {
      const quantity = Math.round((g.seconds / 3600) * 100) / 100
      return {
        key,
        description: (descCount.get(g.description) ?? 0) > 1 ? `${g.description} (at ${formatMoney(g.rate, currency)}/h)` : g.description,
        quantity,
        rate_cents: g.rate,
        amount_cents: lineAmount(quantity, g.rate),
        entryIds: g.entryIds,
      }
    })
}

export const STATUS_COLOR: Record<InvoiceStatus | 'overdue' | 'partial', string> = {
  draft: 'gray',
  sent: 'blue',
  partial: 'yellow',
  overdue: 'red',
  paid: 'teal',
  void: 'dark',
}

export const STATUS_LABEL: Record<InvoiceStatus | 'overdue' | 'partial', string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partially paid',
  overdue: 'Overdue',
  paid: 'Paid',
  void: 'Void',
}

/** Status for display: adds "partially paid" and "overdue" on top of the stored status. */
export function displayStatus(invoice: Invoice, paidCents: number): keyof typeof STATUS_LABEL {
  if (invoice.status === 'void' || invoice.status === 'paid' || invoice.status === 'draft') return invoice.status
  if (invoice.due_date && dayjs(invoice.due_date).isBefore(dayjs(), 'day')) return 'overdue'
  if (paidCents > 0) return 'partial'
  return invoice.status
}

export function paidByInvoice(payments: Payment[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of payments) m.set(p.invoice_id, (m.get(p.invoice_id) ?? 0) + p.amount_cents)
  return m
}

export const PAYMENT_METHODS = ['Bank transfer', 'Card', 'Cash', 'PayPal', 'Wise', 'Stripe', 'Check', 'Other']
