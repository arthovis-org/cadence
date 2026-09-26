import { useState, type FormEvent } from 'react'
import { Button, Group, Stack, Switch, Text, TextInput } from '@mantine/core'
import { DateInput, TimeInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import { useProjects, useSave } from '../data/hooks'
import { entryRange, formatDuration } from '../lib/time'
import type { TimeEntry } from '../lib/types'
import { ProjectTaskSelect, type ProjectTaskValue } from './ProjectTaskSelect'

/** Create or edit a finished time entry. */
export function EntryForm({ entry, onDone }: { entry: TimeEntry | null; onDone: () => void }) {
  const projects = useProjects().data ?? []
  const save = useSave<TimeEntry>('time_entries')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [pt, setPt] = useState<ProjectTaskValue>({ projectId: entry?.project_id ?? null, taskId: entry?.task_id ?? null })
  const [billable, setBillable] = useState(entry?.billable ?? true)
  const [date, setDate] = useState<string | null>(dayjs(entry?.start_at).format('YYYY-MM-DD'))
  const [start, setStart] = useState(entry ? dayjs(entry.start_at).format('HH:mm') : dayjs().subtract(1, 'hour').format('HH:mm'))
  const [end, setEnd] = useState(entry?.end_at ? dayjs(entry.end_at).format('HH:mm') : dayjs().format('HH:mm'))

  const range = date ? entryRange(date, start, end) : null
  const seconds = range ? dayjs(range.end_at).diff(range.start_at, 'second') : 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!range) return
    try {
      await save.mutateAsync({
        id: entry?.id,
        description: description.trim(),
        project_id: pt.projectId,
        task_id: pt.taskId,
        billable,
        ...range,
      })
      onDone()
    } catch (err) {
      notifications.show({ color: 'red', message: (err as Error).message })
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Description" placeholder="What did you work on?" value={description} onChange={(e) => setDescription(e.currentTarget.value)} data-autofocus />
        <ProjectTaskSelect
          label="Project / task"
          value={pt}
          onChange={(v) => {
            setPt(v)
            const p = projects.find((x) => x.id === v.projectId)
            if (p && !entry) setBillable(p.billable)
          }}
        />
        <Group grow align="flex-end">
          <DateInput label="Date" value={date} onChange={setDate} valueFormat="ddd, MMM D, YYYY" />
          <TimeInput label="Start" value={start} onChange={(e) => setStart(e.currentTarget.value)} />
          <TimeInput label="End" value={end} onChange={(e) => setEnd(e.currentTarget.value)} />
        </Group>
        <Group justify="space-between">
          <Switch label="Billable" checked={billable} onChange={(e) => setBillable(e.currentTarget.checked)} />
          <Text className="tabular" c="dimmed">
            Duration: {formatDuration(seconds, false)}
          </Text>
        </Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!range}>
            {entry ? 'Save' : 'Add entry'}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
