import { useMemo, useState, type FormEvent } from 'react'
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Checkbox,
  ColorSwatch,
  Grid,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconArchive, IconArrowLeft, IconDots, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useClients, useProjects, useRates, useRemove, useSave, useTasks, useWorkspace } from '../data/hooks'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/money'
import { amountCents, resolveRate } from '../lib/rates'
import { RateLabel } from '../components/RateLabel'
import { entrySeconds, formatHours, localDate } from '../lib/time'
import type { Project, Task, TimeEntry } from '../lib/types'
import { ProjectForm } from '../components/ProjectForm'
import { RateEditor } from '../components/RateEditor'

type EntryLite = Pick<TimeEntry, 'task_id' | 'start_at' | 'end_at' | 'billable'>

function useProjectEntries(projectId: string | undefined) {
  return useQuery({
    queryKey: ['time_entries', 'project', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('task_id, start_at, end_at, billable')
        .eq('project_id', projectId!)
        .not('end_at', 'is', null)
      if (error) throw new Error(error.message)
      return data as EntryLite[]
    },
  })
}

export function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const project = useProjects().data?.find((p) => p.id === id)
  const clients = useClients().data ?? []
  const allTasks = useTasks().data
  const ratesData = useRates().data
  const rates = ratesData ?? []
  const workspace = useWorkspace().data!
  const entriesData = useProjectEntries(id).data
  const saveProject = useSave<Project>('projects')
  const removeProject = useRemove('projects')
  const saveTask = useSave<Task>('tasks')
  const removeTask = useRemove('tasks')
  const [editingProject, setEditingProject] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [newTask, setNewTask] = useState('')

  const tasks = useMemo(() => (allTasks ?? []).filter((t) => t.project_id === id), [allTasks, id])

  const stats = useMemo(() => {
    const byTask = new Map<string | null, number>()
    let seconds = 0
    let billableCents = 0
    for (const e of entriesData ?? []) {
      const s = entrySeconds(e)
      seconds += s
      byTask.set(e.task_id, (byTask.get(e.task_id) ?? 0) + s)
      if (e.billable && project) {
        const rate = resolveRate(ratesData ?? [], { taskId: e.task_id, projectId: project.id }, localDate(e.start_at))
        billableCents += amountCents(s, rate.cents)
      }
    }
    return { seconds, billableCents, byTask }
  }, [entriesData, ratesData, project])

  if (!project) {
    return (
      <Stack>
        <Anchor component={Link} to="/projects">
          ← Back to projects
        </Anchor>
        <Text c="dimmed">{allTasks ? 'Project not found.' : 'Loading…'}</Text>
      </Stack>
    )
  }

  const client = clients.find((c) => c.id === project.client_id)
  const currency = client?.currency ?? workspace.currency
  const budgetPct = project.budget_hours ? (stats.seconds / 3600 / project.budget_hours) * 100 : null

  async function addTask(e: FormEvent) {
    e.preventDefault()
    if (!newTask.trim()) return
    try {
      await saveTask.mutateAsync({ project_id: project!.id, name: newTask.trim() })
      setNewTask('')
    } catch (err) {
      notifications.show({ color: 'red', message: (err as Error).message })
    }
  }

  function confirmDeleteProject() {
    modals.openConfirmModal({
      title: `Delete ${project!.name}?`,
      children: (
        <Text size="sm">
          Its tasks and rates are deleted. Time entries are kept but lose their project. Archiving keeps everything
          and hides the project instead.
        </Text>
      ),
      labels: { confirm: 'Delete project', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => removeProject.mutate(project!.id, { onSuccess: () => navigate('/projects') }),
    })
  }

  function confirmDeleteTask(t: Task) {
    modals.openConfirmModal({
      title: `Delete task "${t.name}"?`,
      children: <Text size="sm">Time entries on this task are kept and stay on the project.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => removeTask.mutate(t.id),
    })
  }

  return (
    <Stack>
      <Anchor component={Link} to="/projects" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} /> Projects
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <ColorSwatch color={project.color} size={16} />
            <Title order={2}>{project.name}</Title>
            {project.archived && <Badge color="gray">Archived</Badge>}
          </Group>
          <Text c="dimmed" size="sm">
            {client ? client.name : 'No client'} · {project.billable ? 'Billable' : 'Non-billable'}
          </Text>
        </div>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconPencil size={16} />} onClick={() => setEditingProject(true)}>
            Edit
          </Button>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="More actions">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconArchive size={14} />}
                onClick={() => saveProject.mutate({ id: project.id, archived: !project.archived })}
              >
                {project.archived ? 'Unarchive' : 'Archive'}
              </Menu.Item>
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={confirmDeleteProject}>
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Paper withBorder p="md">
          <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
            Tracked
          </Text>
          <Text fw={700} size="xl" className="tabular">
            {formatHours(stats.seconds)}
          </Text>
        </Paper>
        <Paper withBorder p="md">
          <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
            Billable amount
          </Text>
          <Text fw={700} size="xl" className="tabular">
            {formatMoney(stats.billableCents, currency)}
          </Text>
        </Paper>
        <Paper withBorder p="md">
          <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
            Budget
          </Text>
          {budgetPct === null ? (
            <Text c="dimmed">No budget</Text>
          ) : (
            <Stack gap={6}>
              <Text fw={700} size="xl" className="tabular">
                {Math.round(budgetPct)}%{' '}
                <Text span size="sm" c="dimmed" fw={400}>
                  of {project.budget_hours} h
                </Text>
              </Text>
              <Progress value={Math.min(100, budgetPct)} color={budgetPct > 100 ? 'red' : budgetPct > 80 ? 'yellow' : 'indigo'} />
            </Stack>
          )}
        </Paper>
      </SimpleGrid>

      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper withBorder>
            <Stack gap={0}>
              <Group p="md" justify="space-between">
                <Title order={4}>Tasks</Title>
              </Group>
              <form onSubmit={addTask}>
                <Group px="md" pb="md" gap="xs">
                  <TextInput
                    style={{ flex: 1 }}
                    placeholder="Add a task…"
                    value={newTask}
                    onChange={(e) => setNewTask(e.currentTarget.value)}
                  />
                  <Button type="submit" leftSection={<IconPlus size={16} />} loading={saveTask.isPending}>
                    Add
                  </Button>
                </Group>
              </form>
              <Table.ScrollContainer minWidth={480}>
                <Table verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={40} />
                      <Table.Th>Task</Table.Th>
                      <Table.Th>Tracked</Table.Th>
                      <Table.Th>Rate</Table.Th>
                      <Table.Th w={80} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {tasks.map((t) => {
                      const rate = resolveRate(rates, { taskId: t.id, projectId: project.id })
                      const secs = stats.byTask.get(t.id) ?? 0
                      return (
                        <Table.Tr key={t.id}>
                          <Table.Td>
                            <Checkbox
                              checked={t.done}
                              onChange={(e) => saveTask.mutate({ id: t.id, done: e.currentTarget.checked })}
                              aria-label="Done"
                            />
                          </Table.Td>
                          <Table.Td>
                            <Text td={t.done ? 'line-through' : undefined} c={t.done ? 'dimmed' : undefined}>
                              {t.name}
                            </Text>
                          </Table.Td>
                          <Table.Td className="tabular">
                            {formatHours(secs)}
                            {t.estimate_hours ? <Text span size="xs" c="dimmed"> / {t.estimate_hours} h</Text> : null}
                          </Table.Td>
                          <Table.Td>
                            {ratesData && <RateLabel rate={rate} currency={currency} own="task" />}
                          </Table.Td>
                          <Table.Td>
                            <Group gap={4} justify="flex-end" wrap="nowrap">
                              <ActionIcon variant="subtle" color="gray" onClick={() => setEditingTask(t)} aria-label="Edit task">
                                <IconPencil size={16} />
                              </ActionIcon>
                              <ActionIcon variant="subtle" color="gray" onClick={() => confirmDeleteTask(t)} aria-label="Delete task">
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      )
                    })}
                    {tasks.length === 0 && (
                      <Table.Tr>
                        <Table.Td colSpan={5}>
                          <Text c="dimmed" ta="center" py="md" size="sm">
                            No tasks yet. You can also log time directly on the project.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack>
            <RateEditor scope={{ level: 'project', id: project.id }} currency={currency} />
            {project.notes && (
              <Paper withBorder p="md">
                <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                  Notes
                </Text>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {project.notes}
                </Text>
              </Paper>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      <Modal opened={editingProject} onClose={() => setEditingProject(false)} title="Edit project" size="lg">
        <ProjectForm project={project} onDone={() => setEditingProject(false)} />
      </Modal>

      <Modal opened={editingTask !== null} onClose={() => setEditingTask(null)} title="Edit task" size="lg">
        {editingTask && (
          <TaskForm task={editingTask} project={project} currency={currency} onDone={() => setEditingTask(null)} />
        )}
      </Modal>
    </Stack>
  )
}

function TaskForm({ task, project, currency, onDone }: { task: Task; project: Project; currency: string; onDone: () => void }) {
  const save = useSave<Task>('tasks')
  const [name, setName] = useState(task.name)
  const [estimate, setEstimate] = useState<number | string>(task.estimate_hours ?? '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await save.mutateAsync({ id: task.id, name: name.trim(), estimate_hours: estimate === '' ? null : Number(estimate) })
      onDone()
    } catch (err) {
      notifications.show({ color: 'red', message: (err as Error).message })
    }
  }

  return (
    <Stack>
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Name" required value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
          <NumberInput label="Estimate (hours)" placeholder="None" min={0} value={estimate} onChange={setEstimate} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
      <RateEditor
        scope={{ level: 'task', id: task.id }}
        projectId={project.id}
        currency={currency}
      />
    </Stack>
  )
}
