import dayjs from 'dayjs'
import type { Rate } from './types'

export type RateScope =
  | { level: 'task'; id: string }
  | { level: 'project'; id: string }
  | { level: 'client'; id: string }
  | { level: 'default' }

export type RateSource = RateScope['level']

export interface ResolvedRate {
  cents: number
  source: RateSource
}

export interface RateContext {
  taskId?: string | null
  projectId?: string | null
  clientId?: string | null
}

export function scopeMatches(rate: Rate, scope: RateScope): boolean {
  switch (scope.level) {
    case 'task':
      return rate.task_id === scope.id
    case 'project':
      return rate.project_id === scope.id
    case 'client':
      return rate.client_id === scope.id
    case 'default':
      return !rate.task_id && !rate.project_id && !rate.client_id
  }
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
 * Hourly rate for a piece of work on a given date.
 * The most specific level with a rate in effect wins: task -> project -> client -> default.
 * A row with rate_cents = null means "inherit from the level above from this date on".
 */
export function resolveRate(rates: Rate[], ctx: RateContext, date = dayjs().format('YYYY-MM-DD')): ResolvedRate {
  const chain: RateScope[] = []
  if (ctx.taskId) chain.push({ level: 'task', id: ctx.taskId })
  if (ctx.projectId) chain.push({ level: 'project', id: ctx.projectId })
  if (ctx.clientId) chain.push({ level: 'client', id: ctx.clientId })
  chain.push({ level: 'default' })

  for (const scope of chain) {
    const row = ownRateOn(rates, scope, date)
    if (row && row.rate_cents !== null) return { cents: row.rate_cents, source: scope.level }
  }
  return { cents: 0, source: 'default' }
}

export function amountCents(seconds: number, rateCents: number): number {
  return Math.round((seconds / 3600) * rateCents)
}

export const SOURCE_LABEL: Record<RateSource, string> = {
  task: 'task rate',
  project: 'project rate',
  client: 'client rate',
  default: 'default rate',
}
