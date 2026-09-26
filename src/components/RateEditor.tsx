import { useState } from 'react'
import { ActionIcon, Badge, Button, Group, NumberInput, Paper, SegmentedControl, Stack, Table, Text, Tooltip } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import { IconTrash } from '@tabler/icons-react'
import dayjs from 'dayjs'
import { useRates, useRemove, useSave } from '../data/hooks'
import { formatMoney, toCents } from '../lib/money'
import { ALWAYS, ownRateOn, ratesForScope, resolveRate, type RateScope } from '../lib/rates'
import type { Rate } from '../lib/types'

interface Props {
  scope: RateScope
  /** For a task: its project, whose rate applies when the task has none. */
  projectId?: string
  currency: string
}

export function RateEditor({ scope, projectId, currency }: Props) {
  const rates = useRates().data ?? []
  const save = useSave<Rate>('rates')
  const remove = useRemove('rates')
  const today = dayjs().format('YYYY-MM-DD')
  const history = ratesForScope(rates, scope)
  const own = ownRateOn(rates, scope, today)
  const isTask = scope.level === 'task'
  const projectRate = isTask ? resolveRate(rates, { projectId }, today) : null

  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState<number | string>('')
  const [applyTo, setApplyTo] = useState<'all' | 'from'>('all')
  const [from, setFrom] = useState<string | null>(today)

  function startEditing() {
    setAmount(own?.rate_cents != null ? own.rate_cents / 100 : '')
    // With no rate yet, the new rate naturally covers all time; after that, a change usually starts today.
    setApplyTo(history.length === 0 ? 'all' : 'from')
    setFrom(today)
    setEditing(true)
  }

  async function submit() {
    const cents = toCents(amount)
    if (cents === null && !isTask) {
      notifications.show({ color: 'red', message: 'Enter an hourly rate.' })
      return
    }
    const effective = applyTo === 'all' ? ALWAYS : from
    if (!effective) return
    try {
      if (applyTo === 'all') {
        // "All time" replaces the whole history with one row.
        const [keep, ...extra] = history
        await save.mutateAsync({
          id: keep?.id,
          project_id: scope.level === 'project' ? scope.id : null,
          task_id: isTask ? scope.id : null,
          rate_cents: cents,
          effective_from: ALWAYS,
        })
        for (const r of extra) await remove.mutateAsync(r.id)
      } else {
        const existing = history.find((r) => r.effective_from === effective)
        await save.mutateAsync({
          id: existing?.id,
          project_id: scope.level === 'project' ? scope.id : null,
          task_id: isTask ? scope.id : null,
          rate_cents: cents,
          effective_from: effective,
        })
      }
      setEditing(false)
      notifications.show({ color: 'green', message: 'Rate saved' })
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message })
    }
  }

  const current =
    own && own.rate_cents !== null ? (
      <Text fw={600} className="tabular">
        {formatMoney(own.rate_cents, currency)}/h
      </Text>
    ) : projectRate && projectRate.source !== 'none' ? (
      <Text>
        <Text span fw={600} className="tabular">
          {formatMoney(projectRate.cents, currency)}/h
        </Text>
        <Text span c="dimmed" size="sm">
          {' '}
          from the project
        </Text>
      </Text>
    ) : (
      <Badge color="orange" variant="light">
        No rate
      </Badge>
    )

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
              {isTask ? 'Task rate' : 'Hourly rate'}
            </Text>
            {current}
          </div>
          {!editing && (
            <Button variant="light" size="xs" onClick={startEditing}>
              {history.length ? 'Change rate' : 'Set rate'}
            </Button>
          )}
        </Group>

        {editing && (
          <Stack gap="xs">
            <NumberInput
              label="Rate per hour"
              placeholder={isTask ? 'Empty = use the project rate' : '0.00'}
              min={0}
              decimalScale={2}
              fixedDecimalScale
              value={amount}
              onChange={setAmount}
              rightSection={
                <Text size="xs" c="dimmed" pr="xs">
                  {currency}/h
                </Text>
              }
              rightSectionWidth={60}
              data-autofocus
            />
            <SegmentedControl
              fullWidth
              size="xs"
              value={applyTo}
              onChange={(v) => setApplyTo(v as 'all' | 'from')}
              data={[
                { value: 'all', label: 'All time' },
                { value: 'from', label: 'From a date' },
              ]}
            />
            {applyTo === 'from' && (
              <DateInput label="Starting" value={from} onChange={setFrom} valueFormat="MMM D, YYYY" />
            )}
            <Text size="xs" c="dimmed">
              {applyTo === 'all'
                ? 'All time on this ' + (isTask ? 'task' : 'project') + ', past and future, uses this rate.'
                : 'Time before this date keeps its current rate, so past amounts and reports don’t change.'}
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

        {history.length > 1 || (history.length === 1 && history[0].effective_from > ALWAYS) ? (
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
                    {r.effective_from <= ALWAYS ? 'Start' : dayjs(r.effective_from).format('MMM D, YYYY')}
                  </Table.Td>
                  <Table.Td className="tabular">
                    {r.rate_cents === null ? (
                      <Text c="dimmed" size="sm">
                        project rate
                      </Text>
                    ) : (
                      `${formatMoney(r.rate_cents, currency)}/h`
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label="Delete this rate change">
                      <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => remove.mutate(r.id)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : null}
      </Stack>
    </Paper>
  )
}
