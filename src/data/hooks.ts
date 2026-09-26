import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Client, Project, Rate, TableName, Task, TimeEntry, Workspace } from '../lib/types'

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
