import { useMemo, useState } from 'react'
import { Badge, Button, Group, Paper, SegmentedControl, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useClients, useInvoices, usePayments, useProjects, useRates, useTasks, useUnbilledEntries, useWorkspace } from '../data/hooks'
import { formatMoney } from '../lib/money'
import { displayStatus, paidByInvoice, STATUS_COLOR, STATUS_LABEL } from '../lib/invoicing'
import { addMoney, buildRows, formatMoneyTotals, type MoneyTotals } from '../lib/report'

type Filter = 'all' | 'open' | 'draft' | 'paid' | 'void'

export function InvoicesPage() {
  const workspace = useWorkspace().data!
  const invoices = useInvoices()
  const payments = usePayments().data
  const clientsData = useClients().data
  const clients = useMemo(() => clientsData ?? [], [clientsData])
  const projects = useProjects().data
  const tasks = useTasks().data
  const rates = useRates().data
  const unbilled = useUnbilledEntries().data
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')

  const paid = useMemo(() => paidByInvoice(payments ?? []), [payments])

  const stats = useMemo(() => {
    const outstanding: MoneyTotals = {}
    const overdue: MoneyTotals = {}
    const paidThisYear: MoneyTotals = {}
    const byId = new Map((invoices.data ?? []).map((i) => [i.id, i]))
    for (const inv of invoices.data ?? []) {
      if (inv.status === 'sent') {
        const due = inv.total_cents - (paid.get(inv.id) ?? 0)
        addMoney(outstanding, inv.currency, due)
        if (displayStatus(inv, paid.get(inv.id) ?? 0) === 'overdue') addMoney(overdue, inv.currency, due)
      }
    }
    for (const p of payments ?? []) {
      const inv = byId.get(p.invoice_id)
      if (inv && dayjs(p.paid_at).isSame(dayjs(), 'year')) addMoney(paidThisYear, inv.currency, p.amount_cents)
    }
    const unbilledMoney: MoneyTotals = {}
    const rows = buildRows(unbilled ?? [], {
      projects: projects ?? [],
      clients,
      tasks: tasks ?? [],
      rates: rates ?? [],
      currency: workspace.currency,
      weekStart: workspace.week_start,
    })
    for (const r of rows) if (r.client) addMoney(unbilledMoney, r.currency, r.cents)
    return { outstanding, overdue, paidThisYear, unbilledMoney }
  }, [invoices.data, payments, paid, unbilled, projects, clients, tasks, rates, workspace])

  const list = (invoices.data ?? []).filter((inv) => {
    switch (filter) {
      case 'all':
        return true
      case 'open':
        return inv.status === 'sent'
      default:
        return inv.status === filter
    }
  })

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Invoices</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/invoices/new')}>
          New invoice
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Stat label="Unbilled time" value={formatMoneyTotals(stats.unbilledMoney, workspace.currency)} hint="Billable time on client projects" />
        <Stat label="Outstanding" value={formatMoneyTotals(stats.outstanding, workspace.currency)} />
        <Stat label="Overdue" value={formatMoneyTotals(stats.overdue, workspace.currency)} danger={Object.values(stats.overdue).some((v) => v > 0)} />
        <Stat label={`Paid in ${dayjs().year()}`} value={formatMoneyTotals(stats.paidThisYear, workspace.currency)} />
      </SimpleGrid>

      <SegmentedControl
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        data={[
          { value: 'all', label: 'All' },
          { value: 'draft', label: 'Drafts' },
          { value: 'open', label: 'Unpaid' },
          { value: 'paid', label: 'Paid' },
          { value: 'void', label: 'Void' },
        ]}
        style={{ alignSelf: 'flex-start' }}
      />

      <Paper withBorder>
        <Table.ScrollContainer minWidth={700}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Number</Table.Th>
                <Table.Th>Client</Table.Th>
                <Table.Th>Issued</Table.Th>
                <Table.Th>Due</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
                <Table.Th ta="right">Balance</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.map((inv) => {
                const paidCents = paid.get(inv.id) ?? 0
                const status = displayStatus(inv, paidCents)
                return (
                  <Table.Tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <Table.Td fw={600}>{inv.number}</Table.Td>
                    <Table.Td>{clients.find((c) => c.id === inv.client_id)?.name ?? inv.snapshot.client?.name}</Table.Td>
                    <Table.Td className="tabular">{dayjs(inv.issue_date).format('MMM D, YYYY')}</Table.Td>
                    <Table.Td className="tabular">{inv.due_date ? dayjs(inv.due_date).format('MMM D, YYYY') : '—'}</Table.Td>
                    <Table.Td ta="right" className="tabular">
                      {formatMoney(inv.total_cents, inv.currency)}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular">
                      {inv.status === 'void' ? '—' : formatMoney(inv.total_cents - paidCents, inv.currency)}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={STATUS_COLOR[status]} variant="light">
                        {STATUS_LABEL[status]}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
              {list.length === 0 && !invoices.isPending && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" ta="center" py="lg">
                      {filter === 'all' ? 'No invoices yet. Create one from your unbilled time.' : 'No invoices here.'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </Stack>
  )
}

function Stat({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <Paper withBorder p="md">
      <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
        {label}
      </Text>
      <Text fw={700} size="xl" className="tabular" c={danger ? 'red' : undefined}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Paper>
  )
}
