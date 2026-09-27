import dayjs, { type Dayjs } from 'dayjs'
import { supabase } from '../lib/supabase'
import { buildLines } from '../lib/invoicing'
import { ALWAYS } from '../lib/rates'
import { buildRows } from '../lib/report'
import type { Client, InvoiceSnapshot, Project, Rate, Task, TimeEntry, Workspace } from '../lib/types'

// Fills a fresh (demo) workspace with realistic sample data: clients, projects with rates (including a
// rate change and a task override), tasks, ~6 weeks of time entries, a running timer, and two invoices.

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]
const between = (min: number, max: number) => min + Math.random() * (max - min)
const roundTo5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5)

interface TaskDef {
  name: string
  rate?: number
  notes: string[]
}

interface ProjectDef {
  key: string
  name: string
  client: string | null
  color: string
  billable: boolean
  rate?: number
  /** A later rate: [days ago it started, new rate] */
  raise?: [number, number]
  budget?: number
  weight: number
  tasks: TaskDef[]
}

const CLIENTS = [
  { name: 'Northwind Studio', email: 'billing@northwind.example', address: '120 Market Street\nSan Francisco, CA 94105', currency: null },
  { name: 'Lumen Health', email: 'accounts@lumenhealth.example', address: 'Keizersgracht 221\n1016 DV Amsterdam', currency: 'EUR' },
  { name: 'Atlas Outdoor', email: 'finance@atlas.example', address: '48 Pine Ridge Rd\nDenver, CO 80202', currency: null },
]

const PROJECTS: ProjectDef[] = [
  {
    key: 'web',
    name: 'Website redesign',
    client: 'Northwind Studio',
    color: '#4c6ef5',
    billable: true,
    rate: 90,
    raise: [21, 95],
    budget: 120,
    weight: 30,
    tasks: [
      { name: 'Discovery workshop', rate: 120, notes: ['Stakeholder interviews', 'Competitor review', 'Workshop prep'] },
      { name: 'Wireframes', notes: ['Homepage wireframes', 'Checkout flow', 'Mobile navigation'] },
      { name: 'Visual design', notes: ['Style tiles', 'Design review round', 'Icon set'] },
      { name: 'Frontend build', notes: ['Product grid component', 'Responsive fixes', 'Accessibility pass', 'CMS integration'] },
    ],
  },
  {
    key: 'brand',
    name: 'Brand refresh',
    client: 'Northwind Studio',
    color: '#be4bdb',
    billable: true,
    rate: 85,
    weight: 12,
    tasks: [
      { name: 'Logo concepts', notes: ['Logo sketches', 'Refine concept B'] },
      { name: 'Brand guidelines', notes: ['Typography rules', 'Color palette doc'] },
    ],
  },
  {
    key: 'portal',
    name: 'Patient portal',
    client: 'Lumen Health',
    color: '#12b886',
    billable: true,
    rate: 110,
    budget: 160,
    weight: 30,
    tasks: [
      { name: 'API integration', notes: ['Appointments endpoint', 'Auth token refresh', 'Error handling'] },
      { name: 'QA & fixes', notes: ['Regression testing', 'Bug triage', 'Fix date picker issue'] },
      { name: 'Sprint planning', notes: ['Sprint planning call', 'Backlog grooming'] },
    ],
  },
  {
    key: 'campaign',
    name: 'Spring campaign',
    client: 'Atlas Outdoor',
    color: '#fd7e14',
    billable: true,
    rate: 75,
    weight: 16,
    tasks: [
      { name: 'Landing page', notes: ['Hero section', 'Signup form', 'A/B test variant'] },
      { name: 'Email templates', notes: ['Newsletter template', 'Launch announcement'] },
    ],
  },
  {
    key: 'admin',
    name: 'Admin & learning',
    client: null,
    color: '#868e96',
    billable: false,
    weight: 12,
    tasks: [
      { name: 'Bookkeeping', notes: ['Expenses and receipts', 'Invoice follow-ups'] },
      { name: 'Learning', notes: ['Course: advanced TypeScript', 'Reading design articles'] },
    ],
  },
]

function weightedProject(): ProjectDef {
  const total = PROJECTS.reduce((s, p) => s + p.weight, 0)
  let r = Math.random() * total
  for (const p of PROJECTS) {
    r -= p.weight
    if (r <= 0) return p
  }
  return PROJECTS[0]
}

export async function seedDemoWorkspace() {
  const workspace = ok(await supabase.from('workspaces').select('*').limit(1).single()) as Workspace
  const ws = workspace.id
  const today = dayjs().startOf('day')

  ok(
    await supabase
      .from('workspaces')
      .update({
        name: 'Demo workspace',
        business_name: 'Demo Studio',
        business_email: 'hello@demostudio.example',
        business_address: '1 Example Lane\nSpringfield',
        default_tax_percent: 0,
      })
      .eq('id', ws),
  )

  // Clients and projects
  const clients = ok(await supabase.from('clients').insert(CLIENTS.map((c) => ({ ...c, workspace_id: ws }))).select()) as Client[]
  const clientId = (name: string | null) => clients.find((c) => c.name === name)?.id ?? null

  const projects = ok(
    await supabase
      .from('projects')
      .insert(
        PROJECTS.map((p) => ({
          workspace_id: ws,
          client_id: clientId(p.client),
          name: p.name,
          color: p.color,
          billable: p.billable,
          budget_hours: p.budget ?? null,
        })),
      )
      .select(),
  ) as Project[]
  const projectOf = (key: string) => projects.find((p) => p.name === PROJECTS.find((d) => d.key === key)!.name)!

  const tasks = ok(
    await supabase
      .from('tasks')
      .insert(PROJECTS.flatMap((p) => p.tasks.map((t) => ({ workspace_id: ws, project_id: projectOf(p.key).id, name: t.name }))))
      .select(),
  ) as Task[]
  const taskOf = (projectKey: string, name: string) => tasks.find((t) => t.project_id === projectOf(projectKey).id && t.name === name)!

  // Rates: one per billable project, a rate raise three weeks ago, and a premium rate for workshops.
  const rateRows = [
    ...PROJECTS.filter((p) => p.rate).map((p) => ({ workspace_id: ws, project_id: projectOf(p.key).id, rate_cents: p.rate! * 100, effective_from: ALWAYS })),
    ...PROJECTS.filter((p) => p.raise).map((p) => ({
      workspace_id: ws,
      project_id: projectOf(p.key).id,
      rate_cents: p.raise![1] * 100,
      effective_from: today.subtract(p.raise![0], 'day').format('YYYY-MM-DD'),
    })),
    ...PROJECTS.flatMap((p) =>
      p.tasks.filter((t) => t.rate).map((t) => ({ workspace_id: ws, task_id: taskOf(p.key, t.name).id, rate_cents: t.rate! * 100, effective_from: ALWAYS })),
    ),
  ]
  const rates = ok(await supabase.from('rates').insert(rateRows).select()) as Rate[]

  // Time entries: weekdays over the last six weeks, 2–4 blocks a day, nothing in the future.
  const now = dayjs()
  const entryRows: Omit<TimeEntry, 'id' | 'user_id' | 'created_at' | 'invoice_id' | 'tags'>[] = []
  for (let back = 42; back >= 0; back--) {
    const day = today.subtract(back, 'day')
    if (day.day() === 0 || day.day() === 6) continue
    let cursor: Dayjs = day.hour(9).minute(roundTo5(between(0, 40)))
    const blocks = Math.floor(between(2, 5))
    for (let b = 0; b < blocks; b++) {
      const def = weightedProject()
      const task = pick(def.tasks)
      const end = cursor.add(roundTo5(between(45, 160)), 'minute')
      if (end.isAfter(now.subtract(30, 'minute'))) break
      entryRows.push({
        workspace_id: ws,
        project_id: projectOf(def.key).id,
        task_id: taskOf(def.key, task.name).id,
        description: pick(task.notes),
        start_at: cursor.toISOString(),
        end_at: end.toISOString(),
        billable: def.billable,
      })
      cursor = end.add(roundTo5(between(10, 50)), 'minute')
    }
  }
  const entries = ok(await supabase.from('time_entries').insert(entryRows).select()) as TimeEntry[]

  // Invoices: an older one for Northwind (paid) and a recent one for Lumen (sent, now overdue).
  const rows = buildRows(entries, { projects, clients, tasks, rates, currency: workspace.currency, weekStart: workspace.week_start })
  const business = { name: 'Demo Studio', email: 'hello@demostudio.example', address: '1 Example Lane\nSpringfield' }

  async function invoice(clientName: string, fromDaysAgo: number, toDaysAgo: number, issuedDaysAgo: number, dueDays: number) {
    const client = clients.find((c) => c.name === clientName)!
    const currency = client.currency ?? workspace.currency
    const selected = rows.filter(
      (r) =>
        r.client?.id === client.id &&
        r.entry.billable &&
        r.date >= today.subtract(fromDaysAgo, 'day').format('YYYY-MM-DD') &&
        r.date < today.subtract(toDaysAgo, 'day').format('YYYY-MM-DD'),
    )
    if (selected.length === 0) return null
    const lines = buildLines(selected, 'task', currency)
    const issue = today.subtract(issuedDaysAgo, 'day')
    const snapshot: InvoiceSnapshot = { business, client: { name: client.name, email: client.email, address: client.address } }
    const id = ok(
      await supabase.rpc('create_invoice', {
        p_workspace: ws,
        p_client: client.id,
        p_issue_date: issue.format('YYYY-MM-DD'),
        p_due_date: issue.add(dueDays, 'day').format('YYYY-MM-DD'),
        p_currency: currency,
        p_tax_percent: 0,
        p_notes: 'Thank you! Payment by bank transfer within 14 days.',
        p_snapshot: snapshot,
        p_lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, rate_cents: l.rate_cents, amount_cents: l.amount_cents })),
        p_entry_ids: lines.flatMap((l) => l.entryIds),
      }),
    ) as string
    ok(await supabase.from('invoices').update({ status: 'sent' }).eq('id', id))
    return id
  }

  const paidInvoice = await invoice('Northwind Studio', 43, 28, 27, 14)
  if (paidInvoice) {
    const inv = ok(await supabase.from('invoices').select('total_cents').eq('id', paidInvoice).single()) as { total_cents: number }
    ok(
      await supabase.from('payments').insert({
        workspace_id: ws,
        invoice_id: paidInvoice,
        amount_cents: inv.total_cents,
        paid_at: today.subtract(16, 'day').format('YYYY-MM-DD'),
        method: 'Bank transfer',
      }),
    )
  }
  await invoice('Lumen Health', 43, 18, 17, 14)

  // A timer that's already running, so the stopwatch and "today" views come alive.
  ok(
    await supabase.from('time_entries').insert({
      workspace_id: ws,
      project_id: projectOf('web').id,
      task_id: taskOf('web', 'Frontend build').id,
      description: 'Checkout page polish',
      start_at: now.subtract(roundTo5(between(15, 40)), 'minute').toISOString(),
      end_at: null,
      billable: true,
    }),
  )
}
