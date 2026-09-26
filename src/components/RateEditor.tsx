import { useState } from 'react'
import { ActionIcon, Button, Group, NumberInput, Paper, Stack, Table, Text, Tooltip } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import { IconTrash } from '@tabler/icons-react'
import dayjs from 'dayjs'
import { useRates, useRemove, useSave } from '../data/hooks'
import { formatMoney, toCents } from '../lib/money'
import { ownRateOn, ratesForScope, resolveRate, SOURCE_LABEL, type RateContext, type RateScope } from '../lib/rates'
import type { Rate } from '../lib/types'

interface Props {
  scope: RateScope
  /** Context used to show what this level inherits when it has no rate of its own. */
  parent: RateContext
  currency: string
}

function scopeFields(scope: RateScope): Pick<Rate, 'client_id' | 'project_id' | 'task_id'> {
  return {
    client_id: scope.level === 'client' ? scope.id : null,
    project_id: scope.level === 'project' ? scope.id : null,
    task_id: scope.level === 'task' ? scope.id : null,
  }
}

export function RateEditor({ scope, parent, currency }: Props) {
  const rates = useRates().data ?? []
  const save = useSave<Rate>('rates')
  const remove = useRemove('rates')
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState<number | string>('')
  const [from, setFrom] = useState<string | null>(dayjs().format('YYYY-MM-DD'))

  const today = dayjs().format('YYYY-MM-DD')
  const history = ratesForScope(rates, scope)
  const own = ownRateOn(rates, scope, today)
  const inherited = scope.level === 'default' ? null : resolveRate(rates, parent, today)
  const isDefault = scope.level === 'default'

  async function submit() {
    const cents = toCents(amount)
    if (isDefault && cents === null) {
      notifications.show({ color: 'red', message: 'The default rate needs an amount.' })
      return
    }
    if (!from) return
    const existing = history.find((r) => r.effective_from === from)
    try {
      await save.mutateAsync({ id: existing?.id, ...scopeFields(scope), rate_cents: cents, effective_from: from })
      setEditing(false)
      setAmount('')
      notifications.show({ color: 'green', message: 'Rate saved' })
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message })
    }
  }

  const current =
    own && own.rate_cents !== null ? (
      <Text>
        <Text span fw={600} className="tabular">
          {formatMoney(own.rate_cents, currency)}/h
        </Text>
        {!isDefault && (
          <Text span c="dimmed" size="sm">
            {' '}
            (own {SOURCE_LABEL[scope.level]})
          </Text>
        )}
      </Text>
    ) : inherited ? (
      <Text>
        <Text span fw={600} className="tabular">
          {formatMoney(inherited.cents, currency)}/h
        </Text>
        <Text span c="dimmed" size="sm">
          {' '}
          inherited from {SOURCE_LABEL[inherited.source]}
        </Text>
      </Text>
    ) : (
      <Text c="dimmed">No rate set</Text>
    )

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
              {isDefault ? 'Default hourly rate' : 'Hourly rate'}
            </Text>
            {current}
          </div>
          {!editing && (
            <Button variant="light" size="xs" onClick={() => setEditing(true)}>
              Change rate
            </Button>
          )}
        </Group>

        {editing && (
          <Stack gap="xs">
            <Group align="flex-end" grow>
              <NumberInput
                label="Rate per hour"
                placeholder={isDefault ? '0.00' : 'Empty = inherit'}
                min={0}
                decimalScale={2}
                fixedDecimalScale
                value={amount}
                onChange={setAmount}
              />
              <DateInput label="Effective from" value={from} onChange={setFrom} valueFormat="YYYY-MM-DD" />
            </Group>
            <Text size="xs" c="dimmed">
              Time logged before this date keeps its old rate. To change all past time too, pick an early date.
              {!isDefault && ' Leave the amount empty to go back to inheriting.'}
            </Text>
            <Group gap="xs">
              <Button size="xs" onClick={submit} loading={save.isPending}>
                Save rate
              </Button>
              <Button size="xs" variant="default" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </Group>
          </Stack>
        )}

        {history.length > 0 && (
          <Table withRowBorders={false} verticalSpacing={4} fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>From</Table.Th>
                <Table.Th>Rate</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {history.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td className="tabular">
                    {r.effective_from <= '2000-01-01' ? 'Always' : dayjs(r.effective_from).format('MMM D, YYYY')}
                  </Table.Td>
                  <Table.Td className="tabular">
                    {r.rate_cents === null ? <Text c="dimmed" size="sm">inherit</Text> : `${formatMoney(r.rate_cents, currency)}/h`}
                  </Table.Td>
                  <Table.Td>
                    {!(isDefault && history.length === 1) && (
                      <Tooltip label="Delete this rate change">
                        <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => remove.mutate(r.id)}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  )
}
