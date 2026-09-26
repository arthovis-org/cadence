import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Center,
  ColorSwatch,
  Group,
  Loader,
  Menu,
  Modal,
  Pagination,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { BarChart } from '@mantine/charts'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconBookmark,
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconPrinter,
  IconSelector,
  IconTrash,
} from '@tabler/icons-react'
import dayjs from 'dayjs'
import {
  useClients,
  useEntriesBetween,
  useInvoices,
  useProjects,
  useRates,
  useRemove,
  useSave,
  useSavedReports,
  useTasks,
  useWorkspace,
} from '../data/hooks'
import { formatMoney } from '../lib/money'
import { formatRange, presetRange, RANGE_PRESETS, rangeToIso, type RangePreset } from '../lib/ranges'
import {
  applyFilters,
  buildRows,
  chartBuckets,
  downloadCsv,
  EMPTY_FILTERS,
  formatMoneyTotals,
  GROUP_OPTIONS,
  groupRows,
  NONE,
  totals,
  type GroupKey,
  type ReportFilters,
  type ReportGroup,
  type ReportRow,
} from '../lib/report'
import { formatDuration } from '../lib/time'
import type { SavedReport, TimeEntry } from '../lib/types'
import { EntryForm } from '../components/EntryForm'
import { MissingRatesAlert } from '../components/MissingRatesAlert'
import { FilterMultiSelect } from '../components/FilterMultiSelect'

interface ReportConfig {
  preset: RangePreset
  custom: [string | null, string | null]
  filters: ReportFilters
  groupBy: GroupKey
  thenBy: GroupKey | null
  tab: 'summary' | 'detailed'
}

const DEFAULT_CONFIG: ReportConfig = {
  preset: 'this_month',
  custom: [null, null],
  filters: EMPTY_FILTERS,
  groupBy: 'project',
  thenBy: 'task',
  tab: 'summary',
}

const STORAGE_KEY = 'cadence.report.config'

function loadConfig(): ReportConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    // Storage unavailable: fall back to defaults.
  }
  return DEFAULT_CONFIG
}

const hours = (s: number) => (s / 3600).toFixed(2)

export function ReportsPage() {
  const workspace = useWorkspace().data!
  const projects = useProjects().data
  const clients = useClients().data
  const tasks = useTasks().data
  const rates = useRates().data
  const invoices = useInvoices().data
  const savedReports = useSavedReports().data ?? []
  const saveReport = useSave<SavedReport>('saved_reports')
  const removeReport = useRemove('saved_reports')

  const [config, setConfig] = useState<ReportConfig>(loadConfig)
  const [savingName, setSavingName] = useState<string | null>(null)
  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const update = (patch: Partial<ReportConfig>) => setConfig((c) => ({ ...c, ...patch }))
  const setFilters = (patch: Partial<ReportFilters>) => setConfig((c) => ({ ...c, filters: { ...c.filters, ...patch } }))

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {
      // Not critical.
    }
  }, [config])

  const range: [string, string] = useMemo(() => {
    if (config.preset !== 'custom') return presetRange(config.preset, workspace.week_start)
    const [a, b] = config.custom
    const today = dayjs().format('YYYY-MM-DD')
    return [a ?? today, b ?? a ?? today]
  }, [config.preset, config.custom, workspace.week_start])

  const [fromIso, toIso] = rangeToIso(range)
  const entries = useEntriesBetween(fromIso, toIso)

  const allRows = useMemo(
    () =>
      buildRows(entries.data ?? [], {
        projects: projects ?? [],
        clients: clients ?? [],
        tasks: tasks ?? [],
        rates: rates ?? [],
        currency: workspace.currency,
        weekStart: workspace.week_start,
      }),
    [entries.data, projects, clients, tasks, rates, workspace.currency, workspace.week_start],
  )
  const rows = useMemo(() => applyFilters(allRows, config.filters), [allRows, config.filters])
  const sum = useMemo(() => totals(rows), [rows])
  const groupKeys = useMemo(
    () => [config.groupBy, ...(config.thenBy && config.thenBy !== config.groupBy ? [config.thenBy] : [])],
    [config.groupBy, config.thenBy],
  )
  const groups = useMemo(() => groupRows(rows, groupKeys, workspace.week_start), [rows, groupKeys, workspace.week_start])
  const chart = useMemo(() => chartBuckets(rows, range, workspace.week_start), [rows, range, workspace.week_start])

  // Filter options. Task options follow the selected projects.
  const clientOptions = [{ value: NONE, label: 'No client' }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]
  const projectOptions = [
    { value: NONE, label: 'No project' },
    ...(projects ?? [])
      .filter((p) => config.filters.clientIds.length === 0 || config.filters.clientIds.includes(p.client_id ?? NONE))
      .map((p) => ({ value: p.id, label: p.name })),
  ]
  const taskOptions = [
    { value: NONE, label: 'No task' },
    ...(tasks ?? [])
      .filter((t) => config.filters.projectIds.length === 0 || config.filters.projectIds.includes(t.project_id))
      .map((t) => {
        const p = projects?.find((x) => x.id === t.project_id)
        return { value: t.id, label: `${p?.name ?? ''} › ${t.name}` }
      }),
  ]

  const invoiceNumber = (id: string | null) => (id ? invoices?.find((i) => i.id === id)?.number ?? 'Invoiced' : null)
  const fileBase = `cadence-report-${range[0]}-to-${range[1]}`

  function exportSummary() {
    const currencies = Object.keys(sum.money)
    const header = [
      GROUP_OPTIONS.find((g) => g.value === groupKeys[0])!.label,
      ...(groupKeys[1] ? [GROUP_OPTIONS.find((g) => g.value === groupKeys[1])!.label] : []),
      'Hours',
      'Billable hours',
      ...currencies.map((c) => `Amount (${c})`),
    ]
    const out: (string | number)[][] = [header]
    const line = (labels: string[], g: ReportGroup) => [
      ...labels,
      hours(g.seconds),
      hours(g.billableSeconds),
      ...currencies.map((c) => ((g.money[c] ?? 0) / 100).toFixed(2)),
    ]
    for (const g of groups) {
      if (groupKeys[1] && g.children.length) for (const c of g.children) out.push(line([g.label, c.label], c))
      else out.push(line(groupKeys[1] ? [g.label, ''] : [g.label], g))
    }
    out.push(line(groupKeys[1] ? ['Total', ''] : ['Total'], { ...sum, key: '', label: '', sortKey: '', children: [] }))
    downloadCsv(`${fileBase}-summary.csv`, out)
  }

  function exportDetailed() {
    const out: (string | number)[][] = [
      ['Date', 'Start', 'End', 'Description', 'Client', 'Project', 'Task', 'Hours', 'Duration', 'Billable', 'Rate', 'Amount', 'Currency', 'Invoice'],
    ]
    for (const r of [...rows].sort((a, b) => a.entry.start_at.localeCompare(b.entry.start_at))) {
      out.push([
        r.date,
        dayjs(r.entry.start_at).format('HH:mm'),
        dayjs(r.entry.end_at).format('HH:mm'),
        r.entry.description,
        r.client?.name ?? '',
        r.project?.name ?? '',
        r.task?.name ?? '',
        hours(r.seconds),
        formatDuration(r.seconds, false),
        r.entry.billable ? 'Yes' : 'No',
        (r.rateCents / 100).toFixed(2),
        (r.cents / 100).toFixed(2),
        r.currency,
        invoiceNumber(r.entry.invoice_id) ?? '',
      ])
    }
    downloadCsv(`${fileBase}-detailed.csv`, out)
  }

  async function saveCurrent() {
    if (!savingName?.trim()) return
    try {
      await saveReport.mutateAsync({ name: savingName.trim(), config: config as unknown as Record<string, unknown> })
      setSavingName(null)
      notifications.show({ color: 'green', message: 'Report saved' })
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message })
    }
  }

  const activeFilterCount =
    config.filters.clientIds.length +
    config.filters.projectIds.length +
    config.filters.taskIds.length +
    (config.filters.billable !== 'all' ? 1 : 0) +
    (config.filters.invoiced !== 'all' ? 1 : 0)

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Reports</Title>
          <Text c="dimmed" size="sm">
            {formatRange(range)}
          </Text>
        </div>
        <Group gap="xs" className="no-print">
          <Menu position="bottom-end" width={260}>
            <Menu.Target>
              <Button variant="default" leftSection={<IconBookmark size={16} />}>
                Saved reports
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {savedReports.length === 0 && <Menu.Label>No saved reports yet</Menu.Label>}
              {savedReports.map((r) => (
                <Menu.Item
                  key={r.id}
                  onClick={() => setConfig({ ...DEFAULT_CONFIG, ...(r.config as Partial<ReportConfig>) })}
                  rightSection={
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      component="span"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeReport.mutate(r.id)
                      }}
                      aria-label="Delete saved report"
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  }
                >
                  {r.name}
                </Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item onClick={() => setSavingName('')}>Save current report…</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Menu position="bottom-end">
            <Menu.Target>
              <Button variant="default" leftSection={<IconDownload size={16} />}>
                Export
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={exportSummary}>Summary (CSV)</Menu.Item>
              <Menu.Item onClick={exportDetailed}>Detailed entries (CSV)</Menu.Item>
              <Menu.Item leftSection={<IconPrinter size={14} />} onClick={() => window.print()}>
                Print / save as PDF
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <Paper withBorder p="md" className="no-print">
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4, xl: 7 }} spacing="sm">
            <Select
              label="Time frame"
              data={RANGE_PRESETS}
              value={config.preset}
              allowDeselect={false}
              onChange={(v) => update({ preset: (v as RangePreset) ?? 'this_month', custom: range })}
            />
            <DatePickerInput
              type="range"
              label="Dates"
              value={config.preset === 'custom' ? config.custom : range}
              onChange={(v) => update({ preset: 'custom', custom: v as [string | null, string | null] })}
              valueFormat="MMM D, YYYY"
              firstDayOfWeek={workspace.week_start as 0 | 1 | 2 | 3 | 4 | 5 | 6}
              allowSingleDateInRange
            />
            <FilterMultiSelect
              label="Clients"
              placeholder="All clients"
              data={clientOptions}
              value={config.filters.clientIds}
              onChange={(v) => setFilters({ clientIds: v })}
            />
            <FilterMultiSelect
              label="Projects"
              placeholder="All projects"
              data={projectOptions}
              value={config.filters.projectIds}
              onChange={(v) => setFilters({ projectIds: v })}
            />
            <FilterMultiSelect
              label="Tasks"
              placeholder="All tasks"
              data={taskOptions}
              value={config.filters.taskIds}
              onChange={(v) => setFilters({ taskIds: v })}
            />
            <Select
              label="Billable"
              data={[
                { value: 'all', label: 'Billable and non-billable' },
                { value: 'billable', label: 'Billable only' },
                { value: 'nonbillable', label: 'Non-billable only' },
              ]}
              value={config.filters.billable}
              allowDeselect={false}
              onChange={(v) => setFilters({ billable: (v as ReportFilters['billable']) ?? 'all' })}
            />
            <Select
              label="Invoiced"
              data={[
                { value: 'all', label: 'Invoiced and not invoiced' },
                { value: 'uninvoiced', label: 'Not invoiced yet' },
                { value: 'invoiced', label: 'Invoiced' },
              ]}
              value={config.filters.invoiced}
              allowDeselect={false}
              onChange={(v) => setFilters({ invoiced: (v as ReportFilters['invoiced']) ?? 'all' })}
            />
          </SimpleGrid>
          {activeFilterCount > 0 && (
            <Group>
              <Button variant="subtle" size="compact-sm" onClick={() => update({ filters: EMPTY_FILTERS })}>
                Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
              </Button>
            </Group>
          )}
        </Stack>
      </Paper>

      <MissingRatesAlert rows={rows} context="report" />

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Stat label="Total time" value={formatDuration(sum.seconds, false)} sub={`${hours(sum.seconds)} h`} />
        <Stat
          label="Billable time"
          value={formatDuration(sum.billableSeconds, false)}
          sub={sum.seconds ? `${Math.round((sum.billableSeconds / sum.seconds) * 100)}% of total` : '—'}
        />
        <Stat label="Billable amount" value={formatMoneyTotals(sum.money, workspace.currency)} />
        <Stat label="Entries" value={String(sum.count)} />
      </SimpleGrid>

      {entries.isPending ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : (
        <Tabs value={config.tab} onChange={(v) => update({ tab: (v as ReportConfig['tab']) ?? 'summary' })}>
          <Tabs.List className="no-print">
            <Tabs.Tab value="summary">Summary</Tabs.Tab>
            <Tabs.Tab value="detailed">Detailed</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="summary" pt="md">
            <Stack>
              <Paper withBorder p="md">
                <BarChart
                  h={220}
                  data={chart as unknown as Record<string, unknown>[]}
                  dataKey="label"
                  type="stacked"
                  withLegend
                  legendProps={{ verticalAlign: 'top', height: 36 }}
                  valueFormatter={(v) => `${v.toFixed(2)} h`}
                  series={[
                    { name: 'billable', label: 'Billable', color: 'indigo.6' },
                    { name: 'nonBillable', label: 'Non-billable', color: 'gray.4' },
                  ]}
                  tickLine="none"
                  gridAxis="y"
                />
              </Paper>
              <Group gap="sm" className="no-print">
                <Select
                  label="Group by"
                  data={GROUP_OPTIONS}
                  value={config.groupBy}
                  allowDeselect={false}
                  onChange={(v) => update({ groupBy: (v as GroupKey) ?? 'project' })}
                  w={180}
                />
                <Select
                  label="Then by"
                  placeholder="Nothing"
                  data={GROUP_OPTIONS.filter((g) => g.value !== config.groupBy)}
                  value={config.thenBy}
                  clearable
                  onChange={(v) => update({ thenBy: (v as GroupKey) ?? null })}
                  w={180}
                />
              </Group>
              <SummaryTable groups={groups} total={sum.seconds} currency={workspace.currency} nested={groupKeys.length > 1} />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="detailed" pt="md">
            <DetailedTable rows={rows} invoiceNumber={invoiceNumber} onEdit={setEditing} />
          </Tabs.Panel>
        </Tabs>
      )}

      <Modal opened={savingName !== null} onClose={() => setSavingName(null)} title="Save report">
        <Stack>
          <TextInput
            label="Name"
            placeholder="e.g. Acme – this month"
            value={savingName ?? ''}
            onChange={(e) => setSavingName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveCurrent()}
            data-autofocus
          />
          <Text size="xs" c="dimmed">
            Saves the time frame, filters and grouping. Relative time frames like “This month” stay relative.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setSavingName(null)}>
              Cancel
            </Button>
            <Button onClick={saveCurrent} loading={saveReport.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={editing !== null} onClose={() => setEditing(null)} title="Edit time entry" size="lg">
        {editing && <EntryForm entry={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </Stack>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Paper withBorder p="md">
      <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
        {label}
      </Text>
      <Text fw={700} size="xl" className="tabular">
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      )}
    </Paper>
  )
}

function SummaryTable({ groups, total, currency, nested }: { groups: ReportGroup[]; total: number; currency: string; nested: boolean }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  if (groups.length === 0) {
    return (
      <Paper withBorder p="xl">
        <Text c="dimmed" ta="center">
          No time entries match these filters.
        </Text>
      </Paper>
    )
  }

  return (
    <Paper withBorder>
      <Table.ScrollContainer minWidth={600}>
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th w={110} ta="right">Time</Table.Th>
              <Table.Th w={180}>Share</Table.Th>
              <Table.Th w={150} ta="right">Amount</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {groups.map((g) => {
              const open = nested && g.children.length > 0 && !collapsed.has(g.key)
              const pct = total ? (g.seconds / total) * 100 : 0
              return (
                <Fragment key={g.key}>
                  <Table.Tr>
                    <Table.Td>
                      <UnstyledButton onClick={() => nested && toggle(g.key)} style={{ cursor: nested ? 'pointer' : 'default' }}>
                        <Group gap={8} wrap="nowrap">
                          {nested &&
                            (open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />)}
                          {g.color && <ColorSwatch color={g.color} size={10} withShadow={false} />}
                          <Text size="sm" fw={600}>
                            {g.label}
                          </Text>
                          {g.sub && (
                            <Text size="xs" c="dimmed">
                              {g.sub}
                            </Text>
                          )}
                        </Group>
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td ta="right" className="tabular" fw={600}>
                      {formatDuration(g.seconds, false)}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={8} wrap="nowrap">
                        <Progress value={pct} color={g.color ?? 'indigo'} style={{ flex: 1 }} size="sm" />
                        <Text size="xs" c="dimmed" w={40} ta="right" className="tabular">
                          {pct.toFixed(1)}%
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right" className="tabular">
                      {formatMoneyTotals(g.money, currency)}
                    </Table.Td>
                  </Table.Tr>
                  {open &&
                    g.children.map((c) => (
                      <Table.Tr key={`${g.key}/${c.key}`}>
                        <Table.Td pl={44}>
                          <Text size="xs" c="dimmed">
                            {c.label}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right" className="tabular">
                          <Text size="xs" c="dimmed">
                            {formatDuration(c.seconds, false)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed" className="tabular">
                            {g.seconds ? `${((c.seconds / g.seconds) * 100).toFixed(1)}% of ${g.label}` : ''}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right" className="tabular">
                          <Text size="xs" c="dimmed">
                            {formatMoneyTotals(c.money, currency)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                </Fragment>
              )
            })}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Th>Total</Table.Th>
              <Table.Th ta="right" className="tabular">
                {formatDuration(total, false)}
              </Table.Th>
              <Table.Th />
              <Table.Th ta="right" className="tabular">
                {formatMoneyTotals(
                  groups.reduce<Record<string, number>>((m, g) => {
                    for (const [c, v] of Object.entries(g.money)) m[c] = (m[c] ?? 0) + v
                    return m
                  }, {}),
                  currency,
                )}
              </Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  )
}

type SortKey = 'date' | 'duration' | 'amount'
const PAGE_SIZE = 50

function DetailedTable({
  rows,
  invoiceNumber,
  onEdit,
}: {
  rows: ReportRow[]
  invoiceNumber: (id: string | null) => string | null
  onEdit: (e: TimeEntry) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true })
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    const val = (r: ReportRow) => (sort.key === 'date' ? r.entry.start_at : sort.key === 'duration' ? r.seconds : r.cents)
    return [...rows].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const cmp = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)
      return sort.desc ? -cmp : cmp
    })
  }, [rows, sort])

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <Table.Th ta={align}>
      <UnstyledButton onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}>
        <Group gap={4} wrap="nowrap" justify={align === 'right' ? 'flex-end' : 'flex-start'}>
          <Text size="sm" fw={600}>
            {label}
          </Text>
          {sort.key === key ? (
            sort.desc ? <IconChevronDown size={14} /> : <IconChevronDown size={14} style={{ transform: 'rotate(180deg)' }} />
          ) : (
            <IconSelector size={14} opacity={0.4} />
          )}
        </Group>
      </UnstyledButton>
    </Table.Th>
  )

  if (rows.length === 0) {
    return (
      <Paper withBorder p="xl">
        <Text c="dimmed" ta="center">
          No time entries match these filters.
        </Text>
      </Paper>
    )
  }

  return (
    <Stack>
      <Paper withBorder>
        <Table.ScrollContainer minWidth={820}>
          <Table highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                {header('date', 'Date')}
                <Table.Th>Description</Table.Th>
                <Table.Th>Project</Table.Th>
                <Table.Th>Time</Table.Th>
                {header('duration', 'Duration', 'right')}
                {header('amount', 'Amount', 'right')}
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((r) => {
                const inv = invoiceNumber(r.entry.invoice_id)
                return (
                  <Table.Tr key={r.entry.id} style={{ cursor: 'pointer' }} onClick={() => onEdit(r.entry)}>
                    <Table.Td className="tabular" style={{ whiteSpace: 'nowrap' }}>
                      {dayjs(r.date).format('MMM D, YYYY')}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={r.entry.description ? undefined : 'dimmed'} lineClamp={1}>
                        {r.entry.description || '(no description)'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {r.project ? (
                        <Stack gap={0}>
                          <Group gap={6} wrap="nowrap">
                            <ColorSwatch color={r.project.color} size={8} withShadow={false} />
                            <Text size="sm">{r.project.name}</Text>
                          </Group>
                          {(r.task || r.client) && (
                            <Text size="xs" c="dimmed" pl={14}>
                              {[r.task?.name, r.client?.name].filter(Boolean).join(' · ')}
                            </Text>
                          )}
                        </Stack>
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td className="tabular" style={{ whiteSpace: 'nowrap' }}>
                      <Text size="sm" c="dimmed">
                        {dayjs(r.entry.start_at).format('HH:mm')} – {dayjs(r.entry.end_at).format('HH:mm')}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right" className="tabular" fw={600}>
                      {formatDuration(r.seconds, false)}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular">
                      {r.rateMissing ? (
                        <Badge color="orange" variant="light" size="sm">
                          No rate
                        </Badge>
                      ) : r.entry.billable ? (
                        formatMoney(r.cents, r.currency)
                      ) : (
                        <Text span size="sm" c="dimmed">
                          Non-billable
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {inv ? (
                        <Badge variant="light" color="teal" size="sm">
                          {inv}
                        </Badge>
                      ) : r.entry.billable ? (
                        <Badge variant="light" color="gray" size="sm">
                          Unbilled
                        </Badge>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
      {pages > 1 && (
        <Group justify="center" className="no-print">
          <Pagination total={pages} value={current} onChange={setPage} />
        </Group>
      )}
    </Stack>
  )
}
