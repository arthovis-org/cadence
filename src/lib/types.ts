export interface Workspace {
  id: string
  name: string
  owner_id: string
  currency: string
  week_start: number
  timezone: string
  default_tax_percent: number
  invoice_prefix: string
  next_invoice_number: number
  business_name: string | null
  business_email: string | null
  business_address: string | null
  created_at: string
}

export interface Client {
  id: string
  workspace_id: string
  name: string
  email: string | null
  address: string | null
  currency: string | null
  notes: string | null
  archived: boolean
  created_at: string
}

export interface Project {
  id: string
  workspace_id: string
  client_id: string | null
  name: string
  color: string
  billable: boolean
  budget_hours: number | null
  notes: string | null
  archived: boolean
  created_at: string
}

export interface Task {
  id: string
  workspace_id: string
  project_id: string
  name: string
  estimate_hours: number | null
  done: boolean
  created_at: string
}

export interface Rate {
  id: string
  workspace_id: string
  client_id: string | null
  project_id: string | null
  task_id: string | null
  rate_cents: number | null
  effective_from: string // YYYY-MM-DD
  created_at: string
}

export interface TimeEntry {
  id: string
  workspace_id: string
  user_id: string
  project_id: string | null
  task_id: string | null
  description: string
  start_at: string
  end_at: string | null
  billable: boolean
  invoice_id: string | null
  tags: string[]
  created_at: string
}

export type TableName =
  | 'clients'
  | 'projects'
  | 'tasks'
  | 'rates'
  | 'time_entries'
  | 'invoices'
  | 'invoice_lines'
  | 'payments'
  | 'saved_reports'
