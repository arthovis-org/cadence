import { Badge, Text } from '@mantine/core'
import { formatMoney } from '../lib/money'
import { SOURCE_LABEL, type RateSource, type ResolvedRate } from '../lib/rates'

/** "$50.00/h", with where it comes from when that isn't `own`; or a "No rate" badge. */
export function RateLabel({ rate, currency, own }: { rate: ResolvedRate; currency: string; own?: RateSource }) {
  if (rate.source === 'none') {
    return (
      <Badge color="orange" variant="light" size="sm">
        No rate
      </Badge>
    )
  }
  return (
    <Text span size="sm" className="tabular">
      {formatMoney(rate.cents, currency)}/h
      {own && rate.source !== own && (
        <Text span size="xs" c="dimmed">
          {' '}
          ({SOURCE_LABEL[rate.source]})
        </Text>
      )}
    </Text>
  )
}
