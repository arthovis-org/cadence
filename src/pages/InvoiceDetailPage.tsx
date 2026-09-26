import { useState } from 'react'
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import {
  IconArrowLeft,
  IconCash,
  IconDots,
  IconFileDownload,
  IconPencil,
  IconPlus,
  IconReceipt,
  IconSend,
  IconTrash,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useInvalidateBilling, useInvoiceDetail, useWorkspaceId } from '../data/hooks'
import { supabase } from '../lib/supabase'
import { formatMoney, fromCents, toCents } from '../lib/money'
import { displayStatus, lineAmount, PAYMENT_METHODS, STATUS_COLOR, STATUS_LABEL } from '../lib/invoicing'
import type { Invoice, InvoiceLine, Payment } from '../lib/types'
import { downloadInvoicePdf, downloadReceiptPdf } from '../pdf/download'

async function run(action: PromiseLike<{ error: { message: string } | null }>, success?: string) {
  const { error } = await action
  if (error) {
    notifications.show({ color: 'red', message: error.message })
    return false
  }
  if (success) notifications.show({ color: 'green', message: success })
  return true
}

export function InvoiceDetailPage() {
  const { id } = useParams()
  const detail = useInvoiceDetail(id)
  const invalidate = useInvalidateBilling()
  const navigate = useNavigate()
  const [lineEditing, setLineEditing] = useState<InvoiceLine | 'new' | null>(null)
  const [recording, setRecording] = useState(false)
  const [editingDetails, setEditingDetails] = useState(false)
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)

  const entryCount = useQuery({
    queryKey: ['time_entries', 'invoice', id],
    enabled: !!id,
    queryFn: async () => {
      const { count, error } = await supabase.from('time_entries').select('id', { count: 'exact', head: true }).eq('invoice_id', id!)
      if (error) throw new Error(error.message)
      return count ?? 0
    },
  })

  if (detail.isPending) return <Text c="dimmed">Loading…</Text>
  if (detail.isError) return <Alert color="red">{detail.error.message}</Alert>

  const { invoice, lines, payments } = detail.data
  const cur = invoice.currency
  const paid = payments.reduce((s, p) => s + p.amount_cents, 0)
  const balance = invoice.total_cents - paid
  const status = displayStatus(invoice, paid)
  const isDraft = invoice.status === 'draft'
  const isVoid = invoice.status === 'void'

  async function pdf(key: string, fn: () => Promise<void>) {
    setPdfBusy(key)
    try {
      await fn()
    } catch (e) {
      notifications.show({ color: 'red', message: `Couldn't create the PDF: ${(e as Error).message}` })
    }
    setPdfBusy(null)
  }

  async function setStatus(next: Invoice['status'], message: string) {
    if (await run(supabase.from('invoices').update({ status: next }).eq('id', invoice.id), message)) await invalidate()
  }

  function confirmVoid() {
    modals.openConfirmModal({
      title: `Void ${invoice.number}?`,
      children: (
        <Text size="sm">
          The invoice is kept for your records but marked void. Its {entryCount.data ?? ''} time entries become unbilled
          again, so you can put them on a new invoice.
        </Text>
      ),
      labels: { confirm: 'Void invoice', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        if (await run(supabase.rpc('void_invoice', { p_invoice: invoice.id }), 'Invoice voided')) await invalidate()
      },
    })
  }

  function confirmDelete() {
    modals.openConfirmModal({
      title: `Delete ${invoice.number}?`,
      children: (
        <Text size="sm">
          The invoice and its payments are removed permanently and its time entries become unbilled again. The invoice
          number is not reused.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        if (await run(supabase.from('invoices').delete().eq('id', invoice.id), 'Invoice deleted')) {
          await invalidate()
          navigate('/invoices')
        }
      },
    })
  }

  function confirmDeletePayment(p: Payment) {
    modals.openConfirmModal({
      title: 'Delete payment?',
      children: (
        <Text size="sm">
          {formatMoney(p.amount_cents, cur)} on {dayjs(p.paid_at).format('MMM D, YYYY')} ({p.receipt_number}) will be removed.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        if (await run(supabase.from('payments').delete().eq('id', p.id))) await invalidate()
      },
    })
  }

  return (
    <Stack maw={1000}>
      <Anchor component={Link} to="/invoices" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} /> Invoices
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>{invoice.number}</Title>
            <Badge color={STATUS_COLOR[status]} variant="light" size="lg">
              {STATUS_LABEL[status]}
            </Badge>
          </Group>
          <Text c="dimmed" size="sm">
            {invoice.snapshot.client?.name} · {entryCount.data ?? 0} time entries
          </Text>
        </div>
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={<IconFileDownload size={16} />}
            loading={pdfBusy === 'invoice'}
            onClick={() => pdf('invoice', () => downloadInvoicePdf(invoice, lines, payments))}
          >
            PDF
          </Button>
          {isDraft && (
            <Button leftSection={<IconSend size={16} />} onClick={() => setStatus('sent', 'Marked as sent')} disabled={lines.length === 0}>
              Mark as sent
            </Button>
          )}
          {!isVoid && balance > 0 && (
            <Button variant={isDraft ? 'light' : 'filled'} leftSection={<IconCash size={16} />} onClick={() => setRecording(true)}>
              Record payment
            </Button>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="More actions">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {!isVoid && (
                <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditingDetails(true)}>
                  Edit details
                </Menu.Item>
              )}
              {invoice.status === 'sent' && payments.length === 0 && (
                <Menu.Item onClick={() => setStatus('draft', 'Moved back to draft')}>Move back to draft</Menu.Item>
              )}
              {!isVoid && !isDraft && (
                <Menu.Item color="red" onClick={confirmVoid}>
                  Void invoice
                </Menu.Item>
              )}
              {(isDraft || isVoid) && (
                <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={confirmDelete}>
                  Delete invoice
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Info label="Issued" value={dayjs(invoice.issue_date).format('MMM D, YYYY')} />
        <Info label="Due" value={invoice.due_date ? dayjs(invoice.due_date).format('MMM D, YYYY') : '—'} danger={status === 'overdue'} />
        <Info label="Total" value={formatMoney(invoice.total_cents, cur)} />
        <Info label="Balance due" value={isVoid ? '—' : formatMoney(balance, cur)} />
      </SimpleGrid>

      <Paper withBorder p="md">
        <Stack>
          <Group justify="space-between">
            <Title order={4}>Lines</Title>
            {isDraft && (
              <Button variant="subtle" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={() => setLineEditing('new')}>
                Add line
              </Button>
            )}
          </Group>
          {!isDraft && !isVoid && (
            <Text size="xs" c="dimmed">
              Sent invoices are locked. Move it back to draft (if it has no payments) to change the lines.
            </Text>
          )}
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Description</Table.Th>
                  <Table.Th w={100} ta="right">Hours / qty</Table.Th>
                  <Table.Th w={120} ta="right">Rate</Table.Th>
                  <Table.Th w={120} ta="right">Amount</Table.Th>
                  {isDraft && <Table.Th w={70} />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lines.map((l) => (
                  <Table.Tr key={l.id}>
                    <Table.Td>{l.description}</Table.Td>
                    <Table.Td ta="right" className="tabular">
                      {Number(l.quantity).toFixed(2)}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular">
                      {formatMoney(l.rate_cents, cur)}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular">
                      {formatMoney(l.amount_cents, cur)}
                    </Table.Td>
                    {isDraft && (
                      <Table.Td>
                        <Group gap={2} wrap="nowrap" justify="flex-end">
                          <ActionIcon variant="subtle" color="gray" onClick={() => setLineEditing(l)} aria-label="Edit line">
                            <IconPencil size={14} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            onClick={async () => {
                              if (await run(supabase.from('invoice_lines').delete().eq('id', l.id))) await invalidate()
                            }}
                            aria-label="Delete line"
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Stack gap={4} ml="auto" w={280}>
            <Row label="Subtotal" value={formatMoney(invoice.subtotal_cents, cur)} />
            {Number(invoice.tax_percent) > 0 && <Row label={`Tax (${Number(invoice.tax_percent)}%)`} value={formatMoney(invoice.tax_cents, cur)} />}
            <Group justify="space-between" pt={6} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
              <Text fw={700}>Total</Text>
              <Text fw={700} className="tabular">
                {formatMoney(invoice.total_cents, cur)}
              </Text>
            </Group>
            {paid > 0 && (
              <>
                <Row label="Paid" value={`−${formatMoney(paid, cur)}`} />
                <Row label="Balance due" value={formatMoney(balance, cur)} bold />
              </>
            )}
          </Stack>
          {invoice.notes && (
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
              {invoice.notes}
            </Text>
          )}
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack>
          <Title order={4}>Payments & receipts</Title>
          {payments.length === 0 ? (
            <Text size="sm" c="dimmed">
              No payments recorded yet. Recording a payment creates a receipt you can download.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={560}>
              <Table verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Receipt</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Method</Table.Th>
                    <Table.Th ta="right">Amount</Table.Th>
                    <Table.Th w={80} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {payments.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td fw={500}>{p.receipt_number}</Table.Td>
                      <Table.Td className="tabular">{dayjs(p.paid_at).format('MMM D, YYYY')}</Table.Td>
                      <Table.Td>{p.method ?? '—'}</Table.Td>
                      <Table.Td ta="right" className="tabular">
                        {formatMoney(p.amount_cents, cur)}
                      </Table.Td>
                      <Table.Td>
                        <Group gap={2} wrap="nowrap" justify="flex-end">
                          <Tooltip label="Download receipt PDF">
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              loading={pdfBusy === p.id}
                              onClick={() => pdf(p.id, () => downloadReceiptPdf(invoice, p, payments))}
                              aria-label="Download receipt"
                            >
                              <IconReceipt size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <ActionIcon variant="subtle" color="gray" onClick={() => confirmDeletePayment(p)} aria-label="Delete payment">
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>
      </Paper>

      <Modal opened={lineEditing !== null} onClose={() => setLineEditing(null)} title={lineEditing === 'new' ? 'Add line' : 'Edit line'}>
        {lineEditing !== null && (
          <LineForm
            invoice={invoice}
            line={lineEditing === 'new' ? null : lineEditing}
            position={lines.length}
            onDone={async (changed) => {
              setLineEditing(null)
              if (changed) await invalidate()
            }}
          />
        )}
      </Modal>

      <Modal opened={recording} onClose={() => setRecording(false)} title="Record payment">
        {recording && (
          <PaymentForm
            invoice={invoice}
            balance={balance}
            onDone={async (payment) => {
              setRecording(false)
              if (payment) {
                await invalidate()
                notifications.show({ color: 'green', message: `Payment recorded · receipt ${payment.receipt_number}` })
              }
            }}
          />
        )}
      </Modal>

      <Modal opened={editingDetails} onClose={() => setEditingDetails(false)} title="Edit invoice details">
        {editingDetails && (
          <DetailsForm
            invoice={invoice}
            onDone={async (changed) => {
              setEditingDetails(false)
              if (changed) await invalidate()
            }}
          />
        )}
      </Modal>
    </Stack>
  )
}

function Info({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Paper withBorder p="md">
      <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
        {label}
      </Text>
      <Text fw={700} size="lg" className="tabular" c={danger ? 'red' : undefined}>
        {value}
      </Text>
    </Paper>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Group justify="space-between">
      <Text size="sm" c={bold ? undefined : 'dimmed'} fw={bold ? 700 : undefined}>
        {label}
      </Text>
      <Text size="sm" className="tabular" fw={bold ? 700 : undefined}>
        {value}
      </Text>
    </Group>
  )
}

function LineForm({
  invoice,
  line,
  position,
  onDone,
}: {
  invoice: Invoice
  line: InvoiceLine | null
  position: number
  onDone: (changed: boolean) => void
}) {
  const [description, setDescription] = useState(line?.description ?? '')
  const [quantity, setQuantity] = useState<number | string>(line ? Number(line.quantity) : 1)
  const [rate, setRate] = useState<number | string>(fromCents(line?.rate_cents ?? 0))
  const [busy, setBusy] = useState(false)
  const amount = lineAmount(Number(quantity) || 0, toCents(rate) ?? 0)

  async function submit() {
    if (!description.trim()) return
    setBusy(true)
    const row = {
      description: description.trim(),
      quantity: Number(quantity) || 0,
      rate_cents: toCents(rate) ?? 0,
      amount_cents: amount,
    }
    const ok = await run(
      line
        ? supabase.from('invoice_lines').update(row).eq('id', line.id)
        : supabase.from('invoice_lines').insert({ ...row, invoice_id: invoice.id, workspace_id: invoice.workspace_id, position }),
    )
    setBusy(false)
    if (ok) onDone(true)
  }

  return (
    <Stack>
      <TextInput label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} data-autofocus required />
      <Group grow>
        <NumberInput label="Hours / quantity" min={0} decimalScale={2} value={quantity} onChange={setQuantity} />
        <NumberInput label={`Rate (${invoice.currency})`} min={0} decimalScale={2} fixedDecimalScale value={rate} onChange={setRate} />
      </Group>
      <Text size="sm" ta="right">
        Amount: <b>{formatMoney(amount, invoice.currency)}</b>
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button onClick={submit} loading={busy}>
          Save
        </Button>
      </Group>
    </Stack>
  )
}

function PaymentForm({ invoice, balance, onDone }: { invoice: Invoice; balance: number; onDone: (p: Payment | null) => void }) {
  const ws = useWorkspaceId()
  const [amount, setAmount] = useState<number | string>(fromCents(balance))
  const [paidAt, setPaidAt] = useState<string | null>(dayjs().format('YYYY-MM-DD'))
  const [method, setMethod] = useState<string | null>('Bank transfer')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const cents = toCents(amount)
    if (!cents || cents <= 0 || !paidAt) return
    setBusy(true)
    const { data, error } = await supabase
      .from('payments')
      .insert({ workspace_id: ws, invoice_id: invoice.id, amount_cents: cents, paid_at: paidAt, method, notes: notes.trim() || null })
      .select()
      .single()
    setBusy(false)
    if (error) notifications.show({ color: 'red', message: error.message })
    else onDone(data as Payment)
  }

  return (
    <Stack>
      <NumberInput
        label={`Amount (${invoice.currency})`}
        min={0}
        decimalScale={2}
        fixedDecimalScale
        value={amount}
        onChange={setAmount}
        description={`Balance due: ${formatMoney(balance, invoice.currency)}`}
        data-autofocus
      />
      <DateInput label="Payment date" value={paidAt} onChange={setPaidAt} valueFormat="MMM D, YYYY" />
      <Select label="Method" data={PAYMENT_METHODS} value={method} onChange={setMethod} clearable searchable />
      <Textarea label="Notes" description="Shown on the receipt" autosize minRows={2} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
      <Group justify="flex-end">
        <Button variant="default" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button onClick={submit} loading={busy}>
          Record payment
        </Button>
      </Group>
    </Stack>
  )
}

function DetailsForm({ invoice, onDone }: { invoice: Invoice; onDone: (changed: boolean) => void }) {
  const [issueDate, setIssueDate] = useState<string | null>(invoice.issue_date)
  const [dueDate, setDueDate] = useState<string | null>(invoice.due_date)
  const [tax, setTax] = useState<number | string>(Number(invoice.tax_percent))
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const [busy, setBusy] = useState(false)
  const locked = invoice.status !== 'draft'

  async function submit() {
    if (!issueDate) return
    setBusy(true)
    const patch: Partial<Invoice> = { issue_date: issueDate, due_date: dueDate, notes: notes.trim() || null }
    if (!locked) patch.tax_percent = Number(tax) || 0
    const ok = await run(supabase.from('invoices').update(patch).eq('id', invoice.id), 'Invoice updated')
    setBusy(false)
    if (ok) onDone(true)
  }

  return (
    <Stack>
      <Group grow>
        <DateInput label="Issue date" value={issueDate} onChange={setIssueDate} valueFormat="MMM D, YYYY" />
        <DateInput label="Due date" value={dueDate} onChange={setDueDate} valueFormat="MMM D, YYYY" clearable />
      </Group>
      <NumberInput
        label="Tax / VAT %"
        min={0}
        max={100}
        decimalScale={2}
        value={tax}
        onChange={setTax}
        disabled={locked}
        description={locked ? 'Only drafts can change tax' : undefined}
      />
      <Textarea label="Notes" autosize minRows={3} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
      <Group justify="flex-end">
        <Button variant="default" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button onClick={submit} loading={busy}>
          Save
        </Button>
      </Group>
    </Stack>
  )
}
