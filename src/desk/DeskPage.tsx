import { Suspense, useEffect, useMemo, useState } from 'react'
import { ActionIcon, Box, Button, Group, Modal, Paper, Text, TextInput, Tooltip, useComputedColorScheme } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCurrencyDollar, IconExternalLink, IconPlayerPlayFilled, IconPlayerStopFilled, IconPlus } from '@tabler/icons-react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import {
  useClients,
  useInvoices,
  usePayments,
  useProjects,
  useRates,
  useRunningEntry,
  useTasks,
  useTimeEntries,
  useTimerActions,
  useWorkspace,
} from '../data/hooks'
import { formatMoney } from '../lib/money'
import { displayStatus, paidByInvoice, STATUS_LABEL } from '../lib/invoicing'
import { startOfWeek } from '../lib/ranges'
import { resolveRate } from '../lib/rates'
import { buildRows, formatMoneyTotals, totals } from '../lib/report'
import { entrySeconds, formatDuration, localDate } from '../lib/time'
import type { TimeEntry } from '../lib/types'
import { EntryForm } from '../components/EntryForm'
import { ProjectTaskSelect, type ProjectTaskValue } from '../components/ProjectTaskSelect'
import { RateLabel } from '../components/RateLabel'
import { FolderRack, Monitor, Notepad, Pinboard, Room, StickyNotes, Stopwatch } from './objects'

const STATUS_HEX: Record<string, string> = {
  draft: '#868e96',
  sent: '#228be6',
  partial: '#f59f00',
  overdue: '#e03131',
  paid: '#12b886',
  void: '#343a40',
}

interface Draft extends ProjectTaskValue {
  description: string
  billable: boolean
}

const TARGET: [number, number, number] = [0, 0.95, -0.15]
const OFFSET: [number, number, number] = [0, 0.8, 1.95]

/** How much farther the camera sits on narrow screens so the whole desk stays in view. */
function useFit() {
  const { size } = useThree()
  return Math.max(1, 1.75 / (size.width / size.height))
}

/** Places the camera once per screen shape; after that the user orbits freely. */
function CameraRig() {
  const { camera } = useThree()
  const k = useFit()
  useEffect(() => {
    camera.position.set(TARGET[0] + OFFSET[0] * k, TARGET[1] + OFFSET[1] * k, TARGET[2] + OFFSET[2] * k)
    camera.lookAt(...TARGET)
  }, [camera, k])
  return null
}

function Controls() {
  const k = useFit()
  return (
    <OrbitControls
      target={TARGET}
      enablePan={false}
      minDistance={1.1}
      maxDistance={3.2 * k}
      minPolarAngle={0.35}
      maxPolarAngle={1.4}
      minAzimuthAngle={-0.9}
      maxAzimuthAngle={0.9}
      enableDamping
    />
  )
}

const BLANK: Draft = { description: '', projectId: null, taskId: null, billable: true }

const fromEntry = (e: TimeEntry): Draft => ({
  description: e.description,
  projectId: e.project_id,
  taskId: e.task_id,
  billable: e.billable,
})

export function DeskPage() {
  const workspace = useWorkspace().data!
  const navigate = useNavigate()
  const dark = useComputedColorScheme('light') === 'dark'
  const projectsData = useProjects().data
  const tasksData = useTasks().data
  const clientsData = useClients().data
  const ratesData = useRates().data
  const invoicesData = useInvoices().data
  const paymentsData = usePayments().data
  const runningQuery = useRunningEntry()
  const running = runningQuery.data ?? null
  const actions = useTimerActions()

  const weekStart = useMemo(() => startOfWeek(dayjs(), workspace.week_start), [workspace.week_start])
  const weekEntries = useTimeEntries(weekStart.toISOString()).data

  // The draft mirrors the running entry; it resets whenever a different entry starts or the timer stops
  // (including from another tab or device).
  const [draft, setDraft] = useState<Draft>(BLANK)
  const [syncedId, setSyncedId] = useState<string | null | undefined>(undefined)
  const runningId = running?.id ?? null
  if (runningQuery.isFetched && syncedId !== runningId) {
    setSyncedId(runningId)
    setDraft(running ? fromEntry(running) : BLANK)
  }

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!runningId) return
    const handle = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(handle)
  }, [runningId])

  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)

  const projects = useMemo(() => (projectsData ?? []).filter((p) => !p.archived), [projectsData])
  const clients = useMemo(() => clientsData ?? [], [clientsData])
  const tasks = useMemo(() => tasksData ?? [], [tasksData])
  const selectedProject = projects.find((p) => p.id === draft.projectId) ?? null
  const selectedClient = clients.find((c) => c.id === selectedProject?.client_id) ?? null
  const currency = selectedClient?.currency ?? workspace.currency

  // ---- actions -------------------------------------------------------------

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message })
    }
    setBusy(false)
  }

  function choose(next: ProjectTaskValue) {
    const project = projects.find((p) => p.id === next.projectId)
    const billable = project ? project.billable : draft.billable
    setDraft({ ...draft, ...next, billable })
    if (running) run(() => actions.patch(running.id, { project_id: next.projectId, task_id: next.taskId, billable }))
  }

  function toggleTimer() {
    if (running) run(() => actions.stop(running.id, { description: draft.description.trim() }))
    else
      run(() =>
        actions.start({
          description: draft.description.trim(),
          project_id: draft.projectId,
          task_id: draft.taskId,
          billable: draft.billable,
        }),
      )
  }

  // ---- scene data ------------------------------------------------------------

  const folders = useMemo(
    () =>
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        sub: clients.find((c) => c.id === p.client_id)?.name,
      })),
    [projects, clients],
  )

  const notes = useMemo(
    () => tasks.filter((t) => t.project_id === draft.projectId && (!t.done || t.id === draft.taskId)).map((t) => ({ id: t.id, name: t.name })),
    [tasks, draft.projectId, draft.taskId],
  )

  const allWeek = useMemo(() => [...(weekEntries ?? []), ...(running ? [running] : [])], [weekEntries, running])

  const week = useMemo(() => {
    const rows = buildRows(
      allWeek.map((e) => (e.end_at ? e : { ...e, end_at: new Date(now).toISOString() })),
      {
        projects: projectsData ?? [],
        clients,
        tasks,
        rates: ratesData ?? [],
        currency: workspace.currency,
        weekStart: workspace.week_start,
      },
    )
    const t = totals(rows)
    const bars = Array.from({ length: 7 }, (_, i) => {
      const d = weekStart.add(i, 'day')
      const key = d.format('YYYY-MM-DD')
      return {
        label: d.format('dd'),
        value: rows.filter((r) => r.date === key).reduce((s, r) => s + r.seconds, 0) / 3600,
        today: d.isSame(dayjs(), 'day'),
      }
    })
    return { seconds: t.seconds, money: t.money, bars }
  }, [allWeek, now, projectsData, clients, tasks, ratesData, workspace, weekStart])

  const today = dayjs().format('YYYY-MM-DD')
  const todayEntries = allWeek
    .filter((e) => localDate(e.start_at) === today)
    .sort((a, b) => b.start_at.localeCompare(a.start_at))
  const todaySeconds = todayEntries.reduce((s, e) => s + entrySeconds(e, now), 0)
  const lines = todayEntries.map((e) => {
    const p = (projectsData ?? []).find((x) => x.id === e.project_id)
    const t = tasks.find((x) => x.id === e.task_id)
    const text = e.description || [p?.name, t?.name].filter(Boolean).join(' › ') || '(no description)'
    return {
      key: e.id,
      time: dayjs(e.start_at).format('HH:mm'),
      text: text.length > 30 ? `${text.slice(0, 29)}…` : text,
      duration: e.end_at ? formatDuration(entrySeconds(e), false) : '● now',
      color: p?.color ?? '#adb5bd',
    }
  })

  const pins = useMemo(() => {
    const paid = paidByInvoice(paymentsData ?? [])
    return (invoicesData ?? [])
      .filter((i) => i.status !== 'void')
      .slice(0, 7)
      .map((inv) => {
        const status = displayStatus(inv, paid.get(inv.id) ?? 0)
        return {
          id: inv.id,
          number: inv.number,
          client: clients.find((c) => c.id === inv.client_id)?.name ?? inv.snapshot.client?.name ?? '',
          amount: formatMoney(inv.total_cents, inv.currency),
          status: STATUS_LABEL[status],
          color: STATUS_HEX[status],
        }
      })
  }, [invoicesData, paymentsData, clients])

  const elapsed = running ? entrySeconds(running, now) : 0
  const task = tasks.find((t) => t.id === draft.taskId)
  const stopwatchLabel = selectedProject ? `${selectedProject.name}${task ? ` › ${task.name}` : ''}` : 'No project'
  const rate = resolveRate(ratesData ?? [], { projectId: draft.projectId, taskId: draft.taskId })

  useEffect(() => {
    document.title = running ? `${formatDuration(elapsed)} · Cadence` : 'Cadence'
  }, [running, elapsed])

  return (
    <Box pos="relative" h="calc(100dvh - 56px)" style={{ overflow: 'hidden' }}>
      <Canvas shadows camera={{ position: [0, 1.75, 1.8], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={[dark ? '#16171a' : '#e9e6df']} />
        <ambientLight intensity={dark ? 0.45 : 0.7} />
        <directionalLight position={[2.5, 4, 3]} intensity={dark ? 1 : 1.3} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-2} shadow-camera-right={2} shadow-camera-top={2} shadow-camera-bottom={-2} />
        <pointLight position={[-1.2, 1.6, 0.6]} intensity={dark ? 0.6 : 0.3} color="#ffd8a8" />
        <Suspense fallback={null}>
          <Room dark={dark} />
          <Stopwatch running={!!running} seconds={elapsed} label={stopwatchLabel} onToggle={toggleTimer} />
          <FolderRack
            items={folders}
            selectedId={draft.projectId}
            onSelect={(id) => choose(id === draft.projectId && !draft.taskId ? { projectId: null, taskId: null } : { projectId: id, taskId: null })}
          />
          <StickyNotes
            items={notes}
            selectedId={draft.taskId}
            projectName={selectedProject?.name ?? null}
            onSelect={(id) => choose({ projectId: draft.projectId, taskId: id === draft.taskId ? null : id })}
          />
          <Notepad lines={lines} total={formatDuration(todaySeconds, false)} onClick={() => setAdding(true)} />
          <Monitor
            hours={formatDuration(week.seconds, false)}
            amount={formatMoneyTotals(week.money, workspace.currency)}
            bars={week.bars}
            onClick={() => navigate('/reports')}
          />
          <Pinboard items={pins} onOpen={(id) => navigate(`/invoices/${id}`)} onNew={() => navigate('/invoices/new')} />
          <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={6} blur={2.5} far={1} />
        </Suspense>
        <CameraRig />
        <Controls />
      </Canvas>

      {/* Hint */}
      <Paper pos="absolute" top={12} left={12} px="sm" py={6} withBorder shadow="xs" maw={340} style={{ opacity: 0.92 }}>
        <Text size="xs" c="dimmed">
          Click a <b>folder</b> to pick a project, a <b>sticky note</b> for a task, the <b>stopwatch</b> to start or stop.
          Drag to look around, scroll to zoom.
        </Text>
      </Paper>

      {/* Selected project */}
      {selectedProject && (
        <Paper pos="absolute" top={12} right={12} p="sm" withBorder shadow="sm" w={260}>
          <Group gap={8} wrap="nowrap" mb={4}>
            <Box w={10} h={10} style={{ borderRadius: 3, background: selectedProject.color, flexShrink: 0 }} />
            <Text fw={600} size="sm" truncate>
              {selectedProject.name}
            </Text>
          </Group>
          {selectedClient && (
            <Text size="xs" c="dimmed">
              {selectedClient.name}
            </Text>
          )}
          {task && (
            <Text size="xs" mt={4}>
              Task: <b>{task.name}</b>
            </Text>
          )}
          <Group justify="space-between" mt={6}>
            {draft.billable ? <RateLabel rate={rate} currency={currency} own={draft.taskId ? 'task' : 'project'} /> : <Text size="xs" c="dimmed">Non-billable</Text>}
            <Button size="compact-xs" variant="subtle" rightSection={<IconExternalLink size={12} />} onClick={() => navigate(`/projects/${selectedProject.id}`)}>
              Open
            </Button>
          </Group>
        </Paper>
      )}

      {/* Timer controls */}
      <Paper pos="absolute" bottom={16} left="50%" p="xs" withBorder shadow="md" style={{ transform: 'translateX(-50%)', width: 'min(920px, calc(100% - 24px))' }}>
        <Group gap="xs" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            placeholder="What are you working on?"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.currentTarget.value })}
            onBlur={() => running && draft.description.trim() !== running.description && run(() => actions.patch(running.id, { description: draft.description.trim() }))}
            onKeyDown={(e) => e.key === 'Enter' && !running && toggleTimer()}
          />
          <ProjectTaskSelect style={{ width: 260 }} value={draft} onChange={choose} visibleFrom="sm" />
          <Tooltip label={draft.billable ? 'Billable' : 'Non-billable'}>
            <ActionIcon
              size="lg"
              variant={draft.billable ? 'light' : 'subtle'}
              color={draft.billable ? 'indigo' : 'gray'}
              onClick={() => {
                setDraft({ ...draft, billable: !draft.billable })
                if (running) run(() => actions.patch(running.id, { billable: !draft.billable }))
              }}
              aria-label="Toggle billable"
            >
              <IconCurrencyDollar size={18} />
            </ActionIcon>
          </Tooltip>
          <Text fw={600} className="tabular" w={76} ta="right">
            {formatDuration(elapsed)}
          </Text>
          <Button
            color={running ? 'red' : undefined}
            leftSection={running ? <IconPlayerStopFilled size={14} /> : <IconPlayerPlayFilled size={14} />}
            onClick={toggleTimer}
            loading={busy}
          >
            {running ? 'Stop' : 'Start'}
          </Button>
          <Tooltip label="Add time manually">
            <ActionIcon size="lg" variant="default" onClick={() => setAdding(true)} aria-label="Add time manually">
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Paper>

      <Modal opened={adding} onClose={() => setAdding(false)} title="Add time" size="lg">
        {adding && <EntryForm entry={null} onDone={() => setAdding(false)} />}
      </Modal>
    </Box>
  )
}
