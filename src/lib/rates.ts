import dayjs from 'dayjs'
import type { Rate } from './types'

// Rates live on projects, with optional task overrides. There is no client or global fallback:
// billable time without a rate is flagged as missing rather than silently valued at some default.

export type RateScope = { level: 'task'; id: string } | { level: 'project'; id: string }

export type RateSource = RateScope['level'] | 'none'

export interface ResolvedRate {
  cents: number
  source: RateSource
}

export interface RateContext {
  taskId?: string | null
  projectId?: string | null
}

/** Rows start on this date when they apply to all time. */
export const ALWAYS = '2000-01-01'

export function scopeMatches(rate: Rate, scope: RateScope): boolean {
  return scope.level === 'task' ? rate.task_id === scope.id : rate.project_id === scope.id
}

/** Rows for exactly one scope, newest effective date first. */
export function ratesForScope(rates: Rate[], scope: RateScope): Rate[] {
  return rates
    .filter((r) => scopeMatches(r, scope))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
}

/** The row of this scope in effect on `date`, if the scope has any. */
export function ownRateOn(rates: Rate[], scope: RateScope, date: string): Rate | undefined {
  return ratesForScope(rates, scope).find((r) => r.effective_from <= date)
}

/**
 * Hourly rate for a piece of work on a given date: the task's rate if it has one, otherwise the project's,
 * using the latest row whose effective date is on or before `date`.
 * A row with rate_cents = null means "stop overriding from this date on" (a task going back to the project rate).
 */
export function resolveRate(rates: Rate[], ctx: RateContext, date = dayjs().format('YYYY-MM-DD')): ResolvedRate {
  const chain: RateScope[] = []
  if (ctx.taskId) chain.push({ level: 'task', id: ctx.taskId })
  if (ctx.projectId) chain.push({ level: 'project', id: ctx.projectId })

  for (const scope of chain) {
    const row = ownRateOn(rates, scope, date)
    if (row && row.rate_cents !== null) return { cents: row.rate_cents, source: scope.level }
  }
  return { cents: 0, source: 'none' }
}

export function amountCents(seconds: number, rateCents: number): number {
  return Math.round((seconds / 3600) * rateCents)
}

export const SOURCE_LABEL: Record<RateSource, string> = {
  task: 'task rate',
  project: 'project rate',
  none: 'no rate',
}
