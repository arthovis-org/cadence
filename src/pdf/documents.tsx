import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import dayjs from 'dayjs'
import regularFont from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url'
import boldFont from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url'
import type { Invoice, InvoiceLine, Payment } from '../lib/types'

// DejaVu covers Turkish and other accented letters plus currency symbols like ₺ and €.
Font.register({
  family: 'DejaVu',
  fonts: [
    { src: regularFont, fontWeight: 'normal' },
    { src: boldFont, fontWeight: 'bold' },
  ],
})
Font.registerHyphenationCallback((word) => [word])

const ACCENT = '#4c6ef5'
const MUTED = '#6b7280'
const BORDER = '#e5e7eb'

const s = StyleSheet.create({
  page: { fontFamily: 'DejaVu', fontSize: 10, color: '#111827', padding: 48, lineHeight: 1.4 },
  row: { flexDirection: 'row' },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: 'bold', color: ACCENT, letterSpacing: 1, lineHeight: 1.2 },
  label: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  bold: { fontWeight: 'bold' },
  muted: { color: MUTED },
  section: { marginTop: 28 },
  th: { fontSize: 8, color: MUTED, textTransform: 'uppercase', fontWeight: 'bold' },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#111827', paddingBottom: 6 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 7 },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 60, textAlign: 'right' },
  colRate: { width: 80, textAlign: 'right' },
  colAmount: { width: 90, textAlign: 'right' },
  totals: { marginTop: 12, marginLeft: 'auto', width: 230 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#111827',
    marginTop: 4,
    paddingTop: 6,
    fontWeight: 'bold',
    fontSize: 12,
    lineHeight: 1.3,
  },
  notes: { marginTop: 32, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER },
  footer: { position: 'absolute', bottom: 28, left: 48, right: 48, textAlign: 'center', fontSize: 8, color: MUTED },
  stamp: {
    marginTop: 28,
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderColor: '#0ca678',
    color: '#0ca678',
    paddingVertical: 6,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 2,
    lineHeight: 1.2,
  },
})

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)
const date = (d: string | null) => (d ? dayjs(d).format('MMM D, YYYY') : '—')
const qty = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Party({ label, name, email, address }: { label: string; name?: string | null; email?: string | null; address?: string | null }) {
  return (
    <View style={{ width: '48%' }}>
      <Text style={s.label}>{label}</Text>
      {name ? <Text style={s.bold}>{name}</Text> : null}
      {address ? <Text>{address}</Text> : null}
      {email ? <Text style={s.muted}>{email}</Text> : null}
    </View>
  )
}

function Meta({ items }: { items: [string, string][] }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      {items.map(([k, v]) => (
        <View key={k} style={[s.row, { marginBottom: 2 }]}>
          <Text style={[s.muted, { width: 80, textAlign: 'right', marginRight: 8 }]}>{k}</Text>
          <Text style={[s.bold, { minWidth: 90, textAlign: 'right' }]}>{v}</Text>
        </View>
      ))}
    </View>
  )
}

export function InvoiceDocument({ invoice, lines, payments }: { invoice: Invoice; lines: InvoiceLine[]; payments: Payment[] }) {
  const cur = invoice.currency
  const paid = payments.reduce((sum, p) => sum + p.amount_cents, 0)
  const business = invoice.snapshot.business
  const client = invoice.snapshot.client

  return (
    <Document title={`Invoice ${invoice.number}`} author={business?.name ?? undefined}>
      <Page size="A4" style={s.page}>
        <View style={s.between}>
          <View>
            <Text style={s.title}>INVOICE</Text>
            <Text style={[s.muted, { marginTop: 2 }]}>{invoice.number}</Text>
          </View>
          <Meta
            items={[
              ['Issue date', date(invoice.issue_date)],
              ['Due date', date(invoice.due_date)],
              ['Amount due', money(invoice.total_cents - paid, cur)],
            ]}
          />
        </View>

        <View style={[s.between, s.section]}>
          <Party label="From" name={business?.name} email={business?.email} address={business?.address} />
          <Party label="Bill to" name={client?.name} email={client?.email} address={client?.address} />
        </View>

        <View style={s.section}>
          <View style={s.tableHead}>
            <Text style={[s.th, s.colDesc]}>Description</Text>
            <Text style={[s.th, s.colQty]}>Hours / qty</Text>
            <Text style={[s.th, s.colRate]}>Rate</Text>
            <Text style={[s.th, s.colAmount]}>Amount</Text>
          </View>
          {lines.map((l) => (
            <View key={l.id} style={s.tableRow} wrap={false}>
              <Text style={s.colDesc}>{l.description}</Text>
              <Text style={s.colQty}>{qty(l.quantity)}</Text>
              <Text style={s.colRate}>{money(l.rate_cents, cur)}</Text>
              <Text style={s.colAmount}>{money(l.amount_cents, cur)}</Text>
            </View>
          ))}

          <View style={s.totals} wrap={false}>
            <View style={s.totalRow}>
              <Text style={s.muted}>Subtotal</Text>
              <Text>{money(invoice.subtotal_cents, cur)}</Text>
            </View>
            {Number(invoice.tax_percent) > 0 && (
              <View style={s.totalRow}>
                <Text style={s.muted}>Tax ({Number(invoice.tax_percent)}%)</Text>
                <Text>{money(invoice.tax_cents, cur)}</Text>
              </View>
            )}
            <View style={s.grandTotal}>
              <Text>Total</Text>
              <Text>{money(invoice.total_cents, cur)}</Text>
            </View>
            {paid > 0 && (
              <>
                <View style={s.totalRow}>
                  <Text style={s.muted}>Paid</Text>
                  <Text>−{money(paid, cur)}</Text>
                </View>
                <View style={[s.totalRow, s.bold]}>
                  <Text>Balance due</Text>
                  <Text>{money(invoice.total_cents - paid, cur)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {invoice.status === 'paid' && <Text style={s.stamp}>PAID</Text>}

        {invoice.notes ? (
          <View style={s.notes}>
            <Text style={s.label}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}

        <Text style={s.footer} fixed>
          {invoice.number}
          {business?.name ? ` · ${business.name}` : ''}
        </Text>
      </Page>
    </Document>
  )
}

export function ReceiptDocument({ invoice, payment, payments }: { invoice: Invoice; payment: Payment; payments: Payment[] }) {
  const cur = invoice.currency
  const business = invoice.snapshot.business
  const client = invoice.snapshot.client
  // Balance after this payment, counting payments up to and including it.
  const paidToDate = payments
    .filter((p) => p.paid_at < payment.paid_at || (p.paid_at === payment.paid_at && p.created_at <= payment.created_at))
    .reduce((sum, p) => sum + p.amount_cents, 0)
  const balance = Math.max(0, invoice.total_cents - paidToDate)

  return (
    <Document title={`Receipt ${payment.receipt_number ?? ''}`} author={business?.name ?? undefined}>
      <Page size="A4" style={s.page}>
        <View style={s.between}>
          <View>
            <Text style={s.title}>RECEIPT</Text>
            <Text style={[s.muted, { marginTop: 2 }]}>{payment.receipt_number}</Text>
          </View>
          <Meta
            items={[
              ['Payment date', date(payment.paid_at)],
              ['Invoice', invoice.number],
              ...(payment.method ? ([['Method', payment.method]] as [string, string][]) : []),
            ]}
          />
        </View>

        <View style={[s.between, s.section]}>
          <Party label="Received by" name={business?.name} email={business?.email} address={business?.address} />
          <Party label="Received from" name={client?.name} email={client?.email} address={client?.address} />
        </View>

        <View style={[s.section, { borderWidth: 1, borderColor: BORDER, padding: 20, borderRadius: 4 }]}>
          <Text style={s.label}>Amount received</Text>
          <Text style={{ fontSize: 26, fontWeight: 'bold', color: ACCENT, lineHeight: 1.2, marginTop: 2 }}>{money(payment.amount_cents, cur)}</Text>
          <Text style={[s.muted, { marginTop: 6 }]}>
            Payment for invoice {invoice.number} dated {date(invoice.issue_date)}.
          </Text>
        </View>

        <View style={[s.totals, { marginTop: 20 }]}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Invoice total</Text>
            <Text>{money(invoice.total_cents, cur)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.muted}>Paid to date</Text>
            <Text>{money(paidToDate, cur)}</Text>
          </View>
          <View style={s.grandTotal}>
            <Text>Balance remaining</Text>
            <Text>{money(balance, cur)}</Text>
          </View>
        </View>

        {balance === 0 && <Text style={s.stamp}>PAID IN FULL</Text>}

        {payment.notes ? (
          <View style={s.notes}>
            <Text style={s.label}>Notes</Text>
            <Text>{payment.notes}</Text>
          </View>
        ) : null}

        <Text style={s.footer} fixed>
          Thank you for your business.
        </Text>
      </Page>
    </Document>
  )
}
