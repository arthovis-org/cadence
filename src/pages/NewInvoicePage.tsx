import { useMemo, useState } from 'react'
import {
  ActionIcon,
  Anchor,
  Button,
  Checkbox,
  ColorSwatch,
  Grid,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { DatePickerInput, DateInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import { IconArrowLeft, IconPlus, IconTrash } from '@tabler/icons-react'
import dayjs from 'dayjs'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useClients, useInvalidateBilling, useProjects, useRates, useTasks, useUnbilledEntries, useWorkspace } from '../data/hooks'
import { supabase } from '../lib/supabase'
import { formatMoney, fromCents, toCents } from '../lib/money'
import { buildLines, LINE_GROUPINGS, lineAmount, type LineGrouping } from '../lib/invoicing'
import { addMoney, buildRows, formatMoneyTotals, type MoneyTotals } from '../lib/report'
import { formatHours } from '../lib/time'
import type { InvoiceSnapshot } from '../lib/types'

interface ExtraLine {
  key: string
  description: string
  quantity: number | string
  rate: number | string
}

export function NewInvoicePage() {
  const workspace = useWorkspace().data!
  const clientsData = useClients().data
  const clients = useMemo(() => clientsData ?? [], [clientsData])
  const projects = useProjects().data
  const tasks = useTasks().data
  const rates = useRates().data
  const unbilled = useUnbilledEntries()
  const invalidate = useInvalidateBilling()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [clientId, setClientId] = useState<string | null>(params.get('client'))
  const [period, setPeriod] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState<[string | null, string | null]>([
    dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
    dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
  ])
  const [excludedProjects, setExcludedProjects] = useState<Set<string>>(new Set())
  const [grouping, setGrouping] = useState<LineGrouping>('task')
  const [descOverrides, setDescOverrides] = useState<Record<string, string>>({})
  const [extras, setExtras] = useState<ExtraLine[]>([])
  const [issueDate, setIssueDate] = useState<string | null>(dayjs().format('YYYY-MM-DD'))
  const [dueDate, setDueDate] = useState<string | null>(dayjs().add(workspace.payment_terms_days ?? 14, 'day').format('YYYY-MM-DD'))
  const [tax, setTax] = useState<number | string>(Number(workspace.default_tax_percent) || 0)
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)

  const client = clients.find((c) => c.id === clientId) ?? null
  const currency = client?.currency ?? workspace.currency

  const allRows = useMemo(
    () =>
      buildRows(unbilled.data ?? [], {
        projects: projects ?? [],
        clients,
        tasks: tasks ?? [],
        rates: rates ?? [],
        currency: workspace.currency,
        weekStart: workspace.week_start,
      }).filter((r) => r.client),
    [unbilled.data, projects, clients, tasks, rates, workspace.currency, workspace.week_start],
  )

  const unbilledByClient = useMemo(() => {
    const m = new Map<string, MoneyTotals>()
    for (const r of allRows) {
      const t = m.get(r.client!.id) ?? {}
      addMoney(t, r.currency, r.cents)
      m.set(r.client!.id, t)
    }
    return m
  }, [allRows])

  const clientRows = useMemo(
    () =>
      allRows.filter(
        (r) =>
          r.client!.id === clientId &&
          (period === 'all' || ((!range[0] || r.date >= range[0]) && (!range[1] || r.date <= range[1]))),
      ),
    [allRows, clientId, period, range],
  )

  const projectSummary = useMemo(() => {
    const m = new Map<string, { seconds: number; cents: number }>()
    for (const r of clientRows) {
      const k = r.project!.id
      const s = m.get(k) ?? { seconds: 0, cents: 0 }
      s.seconds += r.seconds
      s.cents += r.cents
      m.set(k, s)
    }
    return [...m.entries()].flatMap(([id, s]) => {
      const project = (projects ?? []).find((p) => p.id === id)
      return project ? [{ project, ...s }] : []
    })
  }, [clientRows, projects])

  const selectedRows = useMemo(() => clientRows.filter((r) => !excludedProjects.has(r.project!.id)), [clientRows, excludedProjects])
  const lines = useMemo(() => buildLines(selectedRows, grouping, currency), [selectedRows, grouping, currency])

  const extraLines = extras.map((x) => {
    const quantity = Number(x.quantity) || 0
    const rate = toCents(x.rate) ?? 0
    return { ...x, quantityNum: quantity, rateCents: rate, amount: lineAmount(quantity, rate) }
  })

  const subtotal = lines.reduce((s, l) => s + l.amount_cents, 0) + extraLines.reduce((s, l) => s + l.amount, 0)
  const taxCents = Math.round((subtotal * (Number(tax) || 0)) / 100)
  const total = subtotal + taxCents
  const lineCount = lines.length + extraLines.filter((l) => l.description.trim()).length

  async function create() {
    if (!client || !issueDate) return
    setCreating(true)
    const snapshot: InvoiceSnapshot = {
      business: { name: workspace.business_name, email: workspace.business_email, address: workspace.business_address },
      client: { name: client.name, email: client.email, address: client.address },
    }
    const payloadLines = [
      ...lines.map((l) => ({
        description: descOverrides[l.key]?.trim() || l.description,
        quantity: l.quantity,
        rate_cents: l.rate_cents,
        amount_cents: l.amount_cents,
      })),
      ...extraLines
        .filter((l) => l.description.trim())
        .map((l) => ({ description: l.description.trim(), quantity: l.quantityNum, rate_cents: l.rateCents, amount_cents: l.amount })),
    ]
    const { data, error } = await supabase.rpc('create_invoice', {
      p_workspace: workspace.id,
      p_client: client.id,
      p_issue_date: issueDate,
      p_due_date: dueDate,
      p_currency: currency,
      p_tax_percent: Number(tax) || 0,
      p_notes: notes.trim() || null,
      p_snapshot: snapshot,
      p_lines: payloadLines,
      p_entry_ids: lines.flatMap((l) => l.entryIds),
    })
    setCreating(false)
    if (error) {
      notifications.show({ color: 'red', message: error.message })
      return
    }
    await invalidate()
    notifications.show({ color: 'green', message: 'Invoice created as a draft' })
    navigate(`/invoices/${data as string}`)
  }

  return (
    <Stack maw={1200}>
      <Anchor component={Link} to="/invoices" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} /> Invoices
        </Group>
      </Anchor>
      <Title order={2}>New invoice</Title>

      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack>
            <Paper withBorder p="md">
              <Stack>
                <Select
                  label="Client"
                  placeholder="Choose a client"
                  searchable
                  data={clients
                    .filter((c) => !c.archived)
                    .map((c) => ({ value: c.id, label: c.name }))}
                  value={clientId}
                  onChange={(v) => {
                    setClientId(v)
                    setExcludedProjects(new Set())
                    setDescOverrides({})
                  }}
                  renderOption={({ option }) => {
                    const t = unbilledByClient.get(option.value)
                    const c = clients.find((x) => x.id === option.value)
                    return (
                      <Group justify="space-between" w="100%" wrap="nowrap">
                        <Text size="sm">{option.label}</Text>
                        {t && (
                          <Text size="xs" c="dimmed">
                            {formatMoneyTotals(t, c?.currency ?? workspace.currency)} unbilled
                          </Text>
                        )}
                      </Group>
                    )
                  }}
                />
                <div>
                  <Text size="sm" fw={500} mb={4}>
                    Time to include
                  </Text>
                  <SegmentedControl
                    fullWidth
                    value={period}
                    onChange={(v) => setPeriod(v as 'all' | 'range')}
                    data={[
                      { value: 'all', label: 'All unbilled' },
                      { value: 'range', label: 'Date range' },
                    ]}
                  />
                </div>
                {period === 'range' && (
                  <DatePickerInput
                    type="range"
                    label="Dates"
                    value={range}
                    onChange={(v) => setRange(v as [string | null, string | null])}
                    valueFormat="MMM D, YYYY"
                    allowSingleDateInRange
                    firstDayOfWeek={workspace.week_start as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                  />
                )}
                <Select
                  label="Invoice lines"
                  data={LINE_GROUPINGS}
                  value={grouping}
                  allowDeselect={false}
                  onChange={(v) => {
                    setGrouping((v as LineGrouping) ?? 'task')
                    setDescOverrides({})
                  }}
                />
              </Stack>
            </Paper>

            {client && (
              <Paper withBorder p="md">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>
                    Unbilled time by project
                  </Text>
                  {projectSummary.length === 0 && (
                    <Text size="sm" c="dimmed">
                      {unbilled.isPending ? 'Loading…' : 'No unbilled billable time for this client in this period.'}
                    </Text>
                  )}
                  {projectSummary.map(({ project, seconds, cents }) => (
                    <Checkbox
                      key={project.id}
                      checked={!excludedProjects.has(project.id)}
                      onChange={(e) => {
                        const next = new Set(excludedProjects)
                        if (e.currentTarget.checked) next.delete(project.id)
                        else next.add(project.id)
                        setExcludedProjects(next)
                      }}
                      label={
                        <Group gap={6} wrap="nowrap">
                          <ColorSwatch color={project.color} size={10} withShadow={false} />
                          <Text size="sm">{project.name}</Text>
                          <Text size="xs" c="dimmed" className="tabular">
                            {formatHours(seconds)} · {formatMoney(cents, currency)}
                          </Text>
                        </Group>
                      }
                    />
                  ))}
                </Stack>
              </Paper>
            )}

            <Paper withBorder p="md">
              <Stack>
                <Group grow>
                  <DateInput label="Issue date" value={issueDate} onChange={setIssueDate} valueFormat="MMM D, YYYY" />
                  <DateInput label="Due date" value={dueDate} onChange={setDueDate} valueFormat="MMM D, YYYY" clearable />
                </Group>
                <NumberInput label="Tax / VAT %" min={0} max={100} decimalScale={2} value={tax} onChange={setTax} />
                <Textarea
                  label="Notes"
                  description="Shown on the invoice, e.g. payment details"
                  autosize
                  minRows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.currentTarget.value)}
                />
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper withBorder p="md">
            <Stack>
              <Group justify="space-between">
                <Title order={4}>Preview</Title>
                <Text size="sm" c="dimmed">
                  {client ? `${client.name} · ${currency}` : 'Choose a client to see unbilled time'}
                </Text>
              </Group>
              <Table.ScrollContainer minWidth={560}>
                <Table verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Description</Table.Th>
                      <Table.Th w={100} ta="right">Hours / qty</Table.Th>
                      <Table.Th w={120} ta="right">Rate</Table.Th>
                      <Table.Th w={120} ta="right">Amount</Table.Th>
                      <Table.Th w={40} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {lines.map((l) => (
                      <Table.Tr key={l.key}>
                        <Table.Td>
                          <TextInput
                            variant="unstyled"
                            size="sm"
                            value={descOverrides[l.key] ?? l.description}
                            onChange={(e) => setDescOverrides({ ...descOverrides, [l.key]: e.currentTarget.value })}
                          />
                          <Text size="xs" c="dimmed">
                            {l.entryIds.length} time {l.entryIds.length === 1 ? 'entry' : 'entries'}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right" className="tabular">
                          {l.quantity.toFixed(2)}
                        </Table.Td>
                        <Table.Td ta="right" className="tabular">
                          {formatMoney(l.rate_cents, currency)}
                        </Table.Td>
                        <Table.Td ta="right" className="tabular">
                          {formatMoney(l.amount_cents, currency)}
                        </Table.Td>
                        <Table.Td />
                      </Table.Tr>
                    ))}
                    {extraLines.map((x, i) => (
                      <Table.Tr key={x.key}>
                        <Table.Td>
                          <TextInput
                            size="xs"
                            placeholder="Description, e.g. Hosting fee"
                            value={x.description}
                            onChange={(e) => {
                              const v = e.currentTarget.value
                              setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, description: v } : y)))
                            }}
                          />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            size="xs"
                            min={0}
                            decimalScale={2}
                            value={x.quantity}
                            onChange={(v) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, quantity: v } : y)))}
                          />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            size="xs"
                            min={0}
                            decimalScale={2}
                            value={x.rate}
                            onChange={(v) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, rate: v } : y)))}
                          />
                        </Table.Td>
                        <Table.Td ta="right" className="tabular">
                          {formatMoney(x.amount, currency)}
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon variant="subtle" color="gray" onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove line">
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {lines.length === 0 && extras.length === 0 && (
                      <Table.Tr>
                        <Table.Td colSpan={5}>
                          <Text c="dimmed" ta="center" py="md" size="sm">
                            No lines yet.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              <Group>
                <Button
                  variant="subtle"
                  size="compact-sm"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => setExtras((xs) => [...xs, { key: crypto.randomUUID(), description: '', quantity: 1, rate: fromCents(0) }])}
                >
                  Add a custom line (fixed fee, expense…)
                </Button>
              </Group>

              <Stack gap={4} ml="auto" w={280}>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Subtotal</Text>
                  <Text size="sm" className="tabular">{formatMoney(subtotal, currency)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Tax ({Number(tax) || 0}%)</Text>
                  <Text size="sm" className="tabular">{formatMoney(taxCents, currency)}</Text>
                </Group>
                <Group justify="space-between" pt={6} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                  <Text fw={700}>Total</Text>
                  <Text fw={700} className="tabular">{formatMoney(total, currency)}</Text>
                </Group>
              </Stack>

              <Group justify="flex-end">
                <Button onClick={create} loading={creating} disabled={!client || lineCount === 0 || !issueDate}>
                  Create draft invoice
                </Button>
              </Group>
              <Text size="xs" c="dimmed" ta="right">
                The included time entries are marked as invoiced, so they can't be billed twice.
              </Text>
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  )
}
