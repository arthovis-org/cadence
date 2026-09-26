import { useEffect, useState } from 'react'
import { ActionIcon, Button, Group, Paper, Text, TextInput, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCurrencyDollar, IconPlayerPlayFilled, IconPlayerStopFilled, IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useProjects, useRunningEntry, useStartTimer } from '../data/hooks'
import { supabase } from '../lib/supabase'
import { entrySeconds, formatDuration } from '../lib/time'
import type { TimeEntry } from '../lib/types'
import { ProjectTaskSelect, type ProjectTaskValue } from './ProjectTaskSelect'

interface Props {
  onManual: () => void
}

export function TimerBar({ onManual }: Props) {
  const running = useRunningEntry().data ?? null
  // Remount whenever a different entry starts (possibly on another device) so the inputs mirror it.
  return <TimerInputs key={running?.id ?? 'idle'} running={running} onManual={onManual} />
}

function TimerInputs({ running, onManual }: Props & { running: TimeEntry | null }) {
  const projects = useProjects().data ?? []
  const qc = useQueryClient()
  const startTimer = useStartTimer()

  const [description, setDescription] = useState(running?.description ?? '')
  const [pt, setPt] = useState<ProjectTaskValue>({ projectId: running?.project_id ?? null, taskId: running?.task_id ?? null })
  const [billable, setBillable] = useState(running?.billable ?? true)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!running) return
    const handle = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(handle)
  }, [running])

  const elapsed = running ? entrySeconds(running, now) : 0

  useEffect(() => {
    document.title = running ? `${formatDuration(elapsed)} · Cadence` : 'Cadence'
  }, [running, elapsed])

  async function patchRunning(patch: Partial<TimeEntry>) {
    if (!running) return
    const { error } = await supabase.from('time_entries').update(patch).eq('id', running.id)
    if (error) notifications.show({ color: 'red', message: error.message })
    else qc.invalidateQueries({ queryKey: ['time_entries'] })
  }

  async function start() {
    setBusy(true)
    try {
      await startTimer({ description: description.trim(), project_id: pt.projectId, task_id: pt.taskId, billable })
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message })
      setBusy(false)
    }
  }

  async function stop() {
    if (!running) return
    setBusy(true)
    const { error } = await supabase
      .from('time_entries')
      .update({ end_at: new Date().toISOString(), description: description.trim() })
      .eq('id', running.id)
    if (error) {
      notifications.show({ color: 'red', message: error.message })
      setBusy(false)
      return
    }
    await qc.invalidateQueries({ queryKey: ['time_entries'] })
  }

  return (
    <Paper withBorder p="sm" shadow="xs">
      <Group gap="sm" wrap="wrap">
        <TextInput
          style={{ flex: '1 1 320px' }}
          placeholder="What are you working on?"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          onBlur={() => running && description.trim() !== running.description && patchRunning({ description: description.trim() })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !running) start()
          }}
          size="md"
        />
        <ProjectTaskSelect
          style={{ flex: '0 1 340px', minWidth: 220 }}
          size="md"
          value={pt}
          onChange={(v) => {
            setPt(v)
            const p = projects.find((x) => x.id === v.projectId)
            const nextBillable = p ? p.billable : billable
            setBillable(nextBillable)
            if (running) patchRunning({ project_id: v.projectId, task_id: v.taskId, billable: nextBillable })
          }}
        />
        <Group gap="sm" wrap="nowrap">
          <Tooltip label={billable ? 'Billable' : 'Non-billable'}>
            <ActionIcon
              size="lg"
              variant={billable ? 'light' : 'subtle'}
              color={billable ? 'indigo' : 'gray'}
              onClick={() => {
                setBillable(!billable)
                if (running) patchRunning({ billable: !billable })
              }}
              aria-label="Toggle billable"
            >
              <IconCurrencyDollar size={20} />
            </ActionIcon>
          </Tooltip>
          <Text fw={600} size="xl" className="tabular" w={100} ta="right">
            {formatDuration(elapsed)}
          </Text>
          {running ? (
            <Button color="red" size="md" leftSection={<IconPlayerStopFilled size={16} />} onClick={stop} loading={busy}>
              Stop
            </Button>
          ) : (
            <Button size="md" leftSection={<IconPlayerPlayFilled size={16} />} onClick={start} loading={busy}>
              Start
            </Button>
          )}
          <Tooltip label="Add time manually">
            <ActionIcon size="lg" variant="default" onClick={onManual} aria-label="Add time manually">
              <IconPlus size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Paper>
  )
}
