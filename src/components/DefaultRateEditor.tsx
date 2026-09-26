import { useState } from 'react'
import { Button, Group, NumberInput, Paper, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useRates, useWorkspaceId } from '../data/hooks'
import { supabase } from '../lib/supabase'
import { fromCents, toCents } from '../lib/money'
import { ratesForScope } from '../lib/rates'

// The default rate is one plain value, stored as a single "always" rate row.
const ALWAYS = '2000-01-01'

export function DefaultRateEditor({ currency }: { currency: string }) {
  const rates = useRates().data
  const ws = useWorkspaceId()
  const qc = useQueryClient()
  const rows = ratesForScope(rates ?? [], { level: 'default' })
  const current = rows.find((r) => r.rate_cents !== null)?.rate_cents ?? 0
  const [amount, setAmount] = useState<number | string | null>(null)
  const [busy, setBusy] = useState(false)

  const value = amount ?? fromCents(current)
  const cents = toCents(value) ?? 0
  const dirty = amount !== null && cents !== current

  async function save() {
    setBusy(true)
    // Keep exactly one default row (older versions of the app could create dated ones).
    const [keep, ...extra] = [...rows].sort((a, b) => a.effective_from.localeCompare(b.effective_from))
    const write = keep
      ? supabase.from('rates').update({ rate_cents: cents, effective_from: ALWAYS }).eq('id', keep.id)
      : supabase.from('rates').insert({ workspace_id: ws, rate_cents: cents, effective_from: ALWAYS })
    const { error } = await write
    if (!error && extra.length) await supabase.from('rates').delete().in('id', extra.map((r) => r.id))
    setBusy(false)
    if (error) {
      notifications.show({ color: 'red', message: error.message })
      return
    }
    await qc.invalidateQueries({ queryKey: ['rates'] })
    setAmount(null)
    notifications.show({ color: 'green', message: 'Default rate saved' })
  }

  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
          Default hourly rate
        </Text>
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <NumberInput
            style={{ flex: 1 }}
            min={0}
            decimalScale={2}
            fixedDecimalScale
            value={value}
            onChange={setAmount}
            rightSection={
              <Text size="xs" c="dimmed" pr="xs">
                {currency}/h
              </Text>
            }
            rightSectionWidth={60}
            onKeyDown={(e) => e.key === 'Enter' && dirty && save()}
          />
          <Button onClick={save} loading={busy} disabled={!dirty}>
            Save
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          Used for any work without a client, project or task rate. Changing it updates all time that uses the default.
          To keep past amounts unchanged when you raise a price, set the rate on the client or project instead.
          Those rates can have start dates.
        </Text>
      </Stack>
    </Paper>
  )
}
