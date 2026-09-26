import { useMemo, useState } from 'react'
import { ActionIcon, Badge, Button, ColorSwatch, Group, Modal, Paper, Stack, Text, Title, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconCurrencyDollar, IconPencil, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useClients, useProjects, useRates, useRemove, useRunningEntry, useStartTimer, useTasks, useTimeEntries, useWorkspace } from '../data/hooks'
import { formatMoney } from '../lib/money'
import { amountCents, resolveRate } from '../lib/rates'
import { entrySeconds, formatDuration, localDate } from '../lib/time'
import type { TimeEntry } from '../lib/types'
import { EntryForm } from '../components/EntryForm'
import { TimerBar } from '../components/TimerBar'

function dayLabel(date: string): string {
  const d = dayjs(date)
  if (d.isSame(dayjs(), 'day')) return 'Today'
  if (d.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Yesterday'
  return d.format(d.isSame(dayjs(), 'year') ? 'ddd, MMM D' : 'ddd, MMM D, YYYY')
}

function startOfWeek(weekStart: number) {
  const today = dayjs().startOf('day')
  return today.subtract((today.day() - weekStart + 7) % 7, 'day')
}

export function TrackerPage() {
  const workspace = useWorkspace().data!
  const [days, setDays] = useState(14)
  const since = useMemo(() => dayjs().startOf('day').subtract(days - 1, 'day').toISOString(), [days])
  const entries = useTimeEntries(since)
  const running = useRunningEntry().data ?? null
  const projects = useProjects().data ?? []
  const tasks = useTasks().data ?? []
  const clients = useClients().data ?? []
  const ratesData = useRates().data
  const rates = ratesData ?? []
  const remove = useRemove('time_entries')
  const startTimer = useStartTimer()
  const [editing, setEditing] = useState<TimeEntry | 'new' | null>(null)
  const navigate = useNavigate()

  const groups = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    for (const e of entries.data ?? []) {
      const key = localDate(e.start_at)
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return [...map.entries()]
  }, [entries.data])

  const weekStart = startOfWeek(workspace.week_start)
  const weekSeconds =
    (entries.data ?? []).filter((e) => !dayjs(e.start_at).isBefore(weekStart)).reduce((sum, e) => sum + entrySeconds(e), 0) +
    (running ? entrySeconds(running) : 0)

  function amountFor(e: TimeEntry): { cents: number; currency: string; missing: boolean } | null {
    if (!e.billable) return null
    const project = projects.find((p) => p.id === e.project_id)
    const client = clients.find((c) => c.id === project?.client_id)
    const rate = resolveRate(rates, { taskId: e.task_id, projectId: e.project_id }, localDate(e.start_at))
    return {
      cents: amountCents(entrySeconds(e), rate.cents),
      currency: client?.currency ?? workspace.currency,
      missing: !!ratesData && rate.source === 'none', // don't flag while rates are still loading
    }
  }

  function confirmDelete(e: TimeEntry) {
    modals.openConfirmModal({
      title: 'Delete time entry?',
      children: <Text size="sm">{e.description || 'This entry'} ({formatDuration(entrySeconds(e), false)}) will be removed.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(e.id),
    })
  }

  async function resume(e: TimeEntry) {
    try {
      await startTimer({ description: e.description, project_id: e.project_id, task_id: e.task_id, billable: e.billable })
    } catch (err) {
      notifications.show({ color: 'red', message: (err as Error).message })
    }
  }

  return (
    <Stack>
      <TimerBar onManual={() => setEditing('new')} />

      <Group justify="space-between">
        <Title order={3}>Time entries</Title>
        <Text c="dimmed" size="sm">
          This week:{' '}
          <Text span fw={600} c="var(--mantine-color-text)" className="tabular">
            {formatDuration(weekSeconds, false)}
          </Text>
        </Text>
      </Group>

      {groups.map(([date, dayEntries]) => {
        const total = dayEntries.reduce((s, e) => s + entrySeconds(e), 0)
        return (
          <Paper withBorder key={date}>
            <Group justify="space-between" px="md" py="xs" bg="var(--mantine-color-default-hover)" style={{ borderRadius: 'var(--mantine-radius-md) var(--mantine-radius-md) 0 0' }}>
              <Text fw={600} size="sm">
                {dayLabel(date)}
              </Text>
              <Text size="sm" c="dimmed" className="tabular">
                Total: <Text span fw={600} c="var(--mantine-color-text)">{formatDuration(total, false)}</Text>
              </Text>
            </Group>
            {dayEntries.map((e) => {
              const project = projects.find((p) => p.id === e.project_id)
              const task = tasks.find((t) => t.id === e.task_id)
              const client = clients.find((c) => c.id === project?.client_id)
              const amount = amountFor(e)
              return (
                <Group
                  key={e.id}
                  px="md"
                  py="xs"
                  justify="space-between"
                  wrap="nowrap"
                  style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                >
                  <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" truncate c={e.description ? undefined : 'dimmed'}>
                      {e.description || '(no description)'}
                    </Text>
                    {project && (
                      <Group gap={6} wrap="nowrap">
                        <ColorSwatch color={project.color} size={8} />
                        <Text size="xs" c={project.color} fw={500} truncate>
                          {project.name}
                          {task && ` › ${task.name}`}
                        </Text>
                        {client && (
                          <Text size="xs" c="dimmed" truncate>
                            · {client.name}
                          </Text>
                        )}
                      </Group>
                    )}
                  </Stack>
                  <Group gap="md" wrap="nowrap">
                    <IconCurrencyDollar size={16} color={e.billable ? 'var(--mantine-color-indigo-6)' : 'var(--mantine-color-gray-4)'} />
                    <Text size="sm" c="dimmed" className="tabular" visibleFrom="sm">
                      {dayjs(e.start_at).format('HH:mm')} – {dayjs(e.end_at).format('HH:mm')}
                    </Text>
                    <Text size="sm" fw={600} className="tabular" w={52} ta="right">
                      {formatDuration(entrySeconds(e), false)}
                    </Text>
                    <Text component="div" size="sm" c="dimmed" className="tabular" w={80} ta="right" visibleFrom="xs">
                      {amount?.missing ? (
                        <Tooltip label={project ? 'Set an hourly rate on the project' : 'Billable time needs a project with a rate'}>
                          <Badge
                            color="orange"
                            variant="light"
                            size="sm"
                            style={{ cursor: project ? 'pointer' : undefined }}
                            onClick={() => project && navigate(`/projects/${project.id}`)}
                          >
                            No rate
                          </Badge>
                        </Tooltip>
                      ) : amount ? (
                        formatMoney(amount.cents, amount.currency)
                      ) : (
                        ''
                      )}
                    </Text>
                    <Group gap={2} wrap="nowrap">
                      <Tooltip label="Continue this">
                        <ActionIcon variant="subtle" color="gray" onClick={() => resume(e)} aria-label="Continue">
                          <IconPlayerPlay size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <ActionIcon variant="subtle" color="gray" onClick={() => setEditing(e)} aria-label="Edit">
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="gray" onClick={() => confirmDelete(e)} aria-label="Delete">
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Group>
              )
            })}
          </Paper>
        )
      })}

      {!entries.isPending && groups.length === 0 && (
        <Paper withBorder p="xl">
          <Text c="dimmed" ta="center">
            No time logged in the last {days} days. Start the timer above or add time manually.
          </Text>
        </Paper>
      )}

      <Group justify="center">
        <Button variant="subtle" onClick={() => setDays((d) => d + 14)} loading={entries.isFetching}>
          Show older entries
        </Button>
      </Group>

      <Modal opened={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add time' : 'Edit time entry'} size="lg">
        {editing !== null && <EntryForm entry={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </Stack>
  )
}
