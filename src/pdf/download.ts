import { createElement } from 'react'
import type { Invoice, InvoiceLine, Payment } from '../lib/types'

// The PDF renderer is large, so it is only loaded when a PDF is actually requested.
async function save(element: () => Promise<React.ReactElement>, filename: string) {
  const [{ pdf }, el] = await Promise.all([import('@react-pdf/renderer'), element()])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(el as any).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const safe = (s: string) => s.replace(/[^\w.-]+/g, '_')

export function downloadInvoicePdf(invoice: Invoice, lines: InvoiceLine[], payments: Payment[]) {
  return save(async () => {
    const { InvoiceDocument } = await import('./documents')
    return createElement(InvoiceDocument, { invoice, lines, payments })
  }, `${safe(invoice.number)}.pdf`)
}

export function downloadReceiptPdf(invoice: Invoice, payment: Payment, payments: Payment[]) {
  return save(async () => {
    const { ReceiptDocument } = await import('./documents')
    return createElement(ReceiptDocument, { invoice, payment, payments })
  }, `${safe(payment.receipt_number ?? 'receipt')}.pdf`)
}
