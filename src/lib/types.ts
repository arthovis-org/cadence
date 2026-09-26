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
  receipt_prefix: string
  next_receipt_number: number
  payment_terms_days: number
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

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'

export interface InvoiceSnapshot {
  business?: { name: string | null; email: string | null; address: string | null }
  client?: { name: string; email: string | null; address: string | null }
}

export interface Invoice {
  id: string
  workspace_id: string
  client_id: string
  number: string
  status: InvoiceStatus
  issue_date: string
  due_date: string | null
  currency: string
  subtotal_cents: number
  tax_percent: number
  tax_cents: number
  total_cents: number
  notes: string | null
  snapshot: InvoiceSnapshot
  created_at: string
}

export interface InvoiceLine {
  id: string
  workspace_id: string
  invoice_id: string
  position: number
  description: string
  quantity: number
  rate_cents: number
  amount_cents: number
}

export interface Payment {
  id: string
  workspace_id: string
  invoice_id: string
  amount_cents: number
  paid_at: string
  method: string | null
  receipt_number: string | null
  notes: string | null
  created_at: string
}

export interface SavedReport {
  id: string
  workspace_id: string
  name: string
  config: Record<string, unknown>
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
