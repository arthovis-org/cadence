import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type {
  Client,
  Invoice,
  InvoiceLine,
  Payment,
  Project,
  Rate,
  SavedReport,
  TableName,
  Task,
  TimeEntry,
  Workspace,
} from '../lib/types'

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export function useWorkspace() {
  return useQuery({
    queryKey: ['workspace'],
    queryFn: async () =>
      check(await supabase.from('workspaces').select('*').order('created_at').limit(1).single()) as Workspace,
    staleTime: Infinity,
  })
}

export function useWorkspaceId(): string | undefined {
  return useWorkspace().data?.id
}

export function useUpdateWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<Workspace> & { id: string }) => {
      const { id, ...rest } = patch
      return check(await supabase.from('workspaces').update(rest).eq('id', id).select().single()) as Workspace
    },
    onSuccess: (ws) => qc.setQueryData(['workspace'], ws),
  })
}

// ---------------------------------------------------------------------------
// Generic workspace-scoped tables
// ---------------------------------------------------------------------------

function useList<T>(table: TableName, orderBy: string, ascending = true) {
  const ws = useWorkspaceId()
  return useQuery({
    queryKey: [table, ws],
    enabled: !!ws,
    queryFn: async () =>
      check(await supabase.from(table).select('*').eq('workspace_id', ws!).order(orderBy, { ascending })) as T[],
  })
}

export const useClients = () => useList<Client>('clients', 'name')
export const useProjects = () => useList<Project>('projects', 'name')
export const useTasks = () => useList<Task>('tasks', 'created_at')
export const useRates = () => useList<Rate>('rates', 'effective_from', false)
export const useInvoices = () => useList<Invoice>('invoices', 'issue_date', false)
export const usePayments = () => useList<Payment>('payments', 'paid_at', false)
export const useSavedReports = () => useList<SavedReport>('saved_reports', 'name')

/** Insert (no id) or update (with id) a row, then refresh that table. */
export function useSave<T extends { id: string }>(table: TableName) {
  const qc = useQueryClient()
  const ws = useWorkspaceId()
  return useMutation({
    mutationFn: async (row: Partial<T>) => {
      if (row.id) {
        const { id, ...rest } = row
        return check(await supabase.from(table).update(rest as Record<string, unknown>).eq('id', id).select().single()) as T
      }
      return check(await supabase.from(table).insert({ ...row, workspace_id: ws }).select().single()) as T
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  })
}

export function useRemove(table: TableName) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      check(await supabase.from(table).delete().eq('id', id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] })
      // Deletes cascade (e.g. a project's tasks, rates); refresh dependents too.
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['rates'] })
      qc.invalidateQueries({ queryKey: ['time_entries'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------

export function useTimeEntries(sinceIso: string) {
  const ws = useWorkspaceId()
  return useQuery({
    queryKey: ['time_entries', ws, 'since', sinceIso],
    enabled: !!ws,
    queryFn: async () =>
      check(
        await supabase
          .from('time_entries')
          .select('*')
          .eq('workspace_id', ws!)
          .not('end_at', 'is', null)
          .gte('start_at', sinceIso)
          .order('start_at', { ascending: false }),
      ) as TimeEntry[],
  })
}

export function useRunningEntry() {
  const ws = useWorkspaceId()
  return useQuery({
    queryKey: ['time_entries', ws, 'running'],
    enabled: !!ws,
    // Pick up a timer started or stopped on another device.
    refetchInterval: 30_000,
    queryFn: async () =>
      check(
        await supabase.from('time_entries').select('*').eq('workspace_id', ws!).is('end_at', null).maybeSingle(),
      ) as TimeEntry | null,
  })
}

export interface StartParams {
  description: string
  project_id: string | null
  task_id: string | null
  billable: boolean
}

/** Start a timer, stopping any timer that is already running. */
export function useStartTimer() {
  const qc = useQueryClient()
  const ws = useWorkspaceId()
  return async (params: StartParams) => {
    const now = new Date().toISOString()
    const stop = await supabase.from('time_entries').update({ end_at: now }).eq('workspace_id', ws!).is('end_at', null)
    if (stop.error) throw new Error(stop.error.message)
    const { error } = await supabase.from('time_entries').insert({ ...params, workspace_id: ws, start_at: now })
    if (error) throw new Error(error.message)
    await qc.invalidateQueries({ queryKey: ['time_entries'] })
  }
}

// ---------------------------------------------------------------------------
// Larger reads (reports, invoicing, backups): page past the 1000-row API limit
// ---------------------------------------------------------------------------

type Filter = (q: any) => any // eslint-disable-line @typescript-eslint/no-explicit-any

export async function fetchAllRows<T>(table: TableName, workspaceId: string, filter: Filter = (q) => q): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const query = filter(supabase.from(table).select('*').eq('workspace_id', workspaceId))
    const { data, error } = await query.order('id').range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as T[]))
    if (data.length < pageSize) return rows
  }
}

/** Finished time entries that started within [fromIso, toIso). */
export function useEntriesBetween(fromIso: string, toIso: string) {
  const ws = useWorkspaceId()
  return useQuery({
    queryKey: ['time_entries', ws, 'between', fromIso, toIso],
    enabled: !!ws,
    queryFn: () =>
      fetchAllRows<TimeEntry>('time_entries', ws!, (q) =>
        q.not('end_at', 'is', null).gte('start_at', fromIso).lt('start_at', toIso),
      ),
  })
}

/** Billable, finished time entries not on any invoice yet. */
export function useUnbilledEntries() {
  const ws = useWorkspaceId()
  return useQuery({
    queryKey: ['time_entries', ws, 'unbilled'],
    enabled: !!ws,
    queryFn: () =>
      fetchAllRows<TimeEntry>('time_entries', ws!, (q) =>
        q.not('end_at', 'is', null).is('invoice_id', null).eq('billable', true),
      ),
  })
}

export function useInvoiceDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['invoices', 'detail', id],
    enabled: !!id,
    queryFn: async () => {
      const [invoice, lines, payments] = await Promise.all([
        supabase.from('invoices').select('*').eq('id', id!).single(),
        supabase.from('invoice_lines').select('*').eq('invoice_id', id!).order('position'),
        supabase.from('payments').select('*').eq('invoice_id', id!).order('paid_at'),
      ])
      return {
        invoice: check(invoice) as Invoice,
        lines: check(lines) as InvoiceLine[],
        payments: check(payments) as Payment[],
      }
    },
  })
}

/** Refresh everything an invoice change can affect. */
export function useInvalidateBilling() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['invoices'] }),
      qc.invalidateQueries({ queryKey: ['invoice_lines'] }),
      qc.invalidateQueries({ queryKey: ['payments'] }),
      qc.invalidateQueries({ queryKey: ['time_entries'] }),
      qc.invalidateQueries({ queryKey: ['workspace'] }),
    ])
}

/** Stop or edit the running timer. Shared by the 2D timer bar and the 3D desk. */
export function useTimerActions() {
  const qc = useQueryClient()
  const start = useStartTimer()
  const refresh = () => qc.invalidateQueries({ queryKey: ['time_entries'] })
  return {
    start,
    async stop(id: string, patch: Partial<TimeEntry> = {}) {
      check(await supabase.from('time_entries').update({ ...patch, end_at: new Date().toISOString() }).eq('id', id))
      await refresh()
    },
    async patch(id: string, patch: Partial<TimeEntry>) {
      check(await supabase.from('time_entries').update(patch).eq('id', id))
      await refresh()
    },
  }
}
