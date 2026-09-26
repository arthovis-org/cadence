export const CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY', 'CAD', 'AUD', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN', 'INR', 'BRL']

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)
}

export function toCents(amount: number | string | null | undefined): number | null {
  if (amount === '' || amount === null || amount === undefined) return null
  const n = typeof amount === 'number' ? amount : Number(amount)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export function fromCents(cents: number | null | undefined): number | '' {
  return cents === null || cents === undefined ? '' : cents / 100
}
