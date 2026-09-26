import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  AppShell,
  Burger,
  Center,
  Group,
  Loader,
  NavLink,
  ScrollArea,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconBriefcase,
  IconChartBar,
  IconClockHour4,
  IconFileInvoice,
  IconLogout,
  IconMoon,
  IconSettings,
  IconSun,
  IconUsers,
} from '@tabler/icons-react'
import { NavLink as RouterNavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ViewSwitch } from './ViewSwitch'
import { ViewContext, type Phase, type View } from './view'

const loadDesk = () => import('../desk/DeskPage')
const DeskPage = lazy(() => loadDesk().then((m) => ({ default: m.DeskPage })))

const VIEW_KEY = 'cadence.view'

const NAV = [
  { to: '/', label: 'Time tracker', icon: IconClockHour4 },
  { to: '/projects', label: 'Projects', icon: IconBriefcase },
  { to: '/clients', label: 'Clients', icon: IconUsers },
  { to: '/reports', label: 'Reports', icon: IconChartBar },
  { to: '/invoices', label: 'Invoices', icon: IconFileInvoice },
  { to: '/settings', label: 'Settings', icon: IconSettings },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function initialView(pathname: string): View {
  if (pathname.startsWith('/3d')) return '3d'
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    return stored === '3d' || stored === 'panel' ? stored : '2d'
  } catch {
    return '2d'
  }
}

function remember(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Not critical.
  }
}

/** While the 2D app floats in 3D space, it tilts gently toward the pointer. */
function usePanelTilt(active: boolean, el: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const node = el.current
    if (!active || !node || reducedMotion()) return
    const move = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth - 0.5
      const y = e.clientY / window.innerHeight - 0.5
      node.style.setProperty('--vt-ry', `${(x * 6).toFixed(2)}deg`)
      node.style.setProperty('--vt-rx', `${(-y * 4).toFixed(2)}deg`)
    }
    window.addEventListener('pointermove', move)
    return () => {
      window.removeEventListener('pointermove', move)
      node.style.removeProperty('--vt-ry')
      node.style.removeProperty('--vt-rx')
    }
  }, [active, el])
}

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [view, setView] = useState<View>(() => initialView(location.pathname))
  const [phase, setPhase] = useState<Phase>('idle')
  const [deskMounted, setDeskMounted] = useState(view !== '2d')
  const shellRef = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const deskReady = useRef(false)
  const resolveReady = useRef<(() => void) | null>(null)

  const onDeskReady = useCallback(() => {
    deskReady.current = true
    resolveReady.current?.()
    resolveReady.current = null
  }, [])

  const waitForDesk = () =>
    deskReady.current
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          resolveReady.current = resolve
          setTimeout(resolve, 3500) // don't hang if the first frame is slow
        })

  // Each step animates between two neighbouring views: 2d <-> panel <-> 3d.
  const steps = {
    async toPanelFrom2d() {
      loadDesk()
      window.scrollTo(0, 0)
      setDeskMounted(true)
      setPhase('lift')
      await sleep(700)
      setView('panel')
      setPhase('idle')
    },
    async to2dFromPanel() {
      setPhase('land')
      await sleep(520)
      setView('2d')
      setPhase('idle')
      setDeskMounted(false)
      deskReady.current = false
    },
    async to3dFromPanel() {
      await waitForDesk()
      setPhase('away')
      await sleep(1250)
      setView('3d')
      setPhase('idle')
    },
    async toPanelFrom3d() {
      setPhase('leave')
      await sleep(60)
      setPhase('return')
      await sleep(1000)
      setView('panel')
      setPhase('idle')
    },
  }

  const switchTo = useCallback(
    async (next: View, path?: string) => {
      if (busy.current) return
      if (path) navigate(path)
      if (next === view) return
      busy.current = true
      remember(next)
      try {
        if (reducedMotion()) {
          setDeskMounted(next !== '2d')
          setView(next)
          return
        }
        if (view === '2d') await steps.toPanelFrom2d()
        if (view === '3d') await steps.toPanelFrom3d()
        // Now floating in 3D space; continue to the target if it's further along.
        if (next === '3d') await steps.to3dFromPanel()
        if (next === '2d') await steps.to2dFromPanel()
      } finally {
        busy.current = false
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, navigate],
  )

  const ctx = useMemo(() => ({ view, phase, switchTo }), [view, phase, switchTo])

  const resting = phase === 'idle'
  usePanelTilt(resting && view === 'panel', shellRef)

  // The 2D app: normal page (2d), a floating panel (panel, and while animating), or hidden (3d).
  const floating = !resting || view === 'panel'
  const shellClass = !resting
    ? `vt-shell vt-active vt-${phase}`
    : view === 'panel'
      ? 'vt-shell vt-active vt-panel'
      : view === '3d'
        ? 'vt-shell vt-hidden'
        : 'vt-shell'

  // The room behind: visible in panel and 3d views, fading in/out with lift/land.
  const deskVisible = phase === 'lift' || (phase !== 'land' && view !== '2d')
  const deskClass = ['vt-desk', deskVisible && 'vt-on', view === '3d' && resting && 'vt-interactive', floating && phase !== 'away' && 'vt-dim']
    .filter(Boolean)
    .join(' ')

  return (
    <ViewContext.Provider value={ctx}>
      {floating && <div className="vt-backdrop" />}

      {deskMounted && (
        <div className={deskClass} aria-hidden={!(view === '3d' && resting)}>
          <Suspense
            fallback={
              <Center h="100%">
                <Loader color="gray" />
              </Center>
            }
          >
            <DeskPage onReady={onDeskReady} />
          </Suspense>
        </div>
      )}

      <div className={floating ? 'vt-stage' : undefined}>
        <div ref={shellRef} className={shellClass}>
          <div className={floating ? 'vt-scroller' : undefined}>
            <Shell />
          </div>
        </div>
      </div>
    </ViewContext.Provider>
  )
}

/** The regular 2D app. */
function Shell() {
  const [opened, { toggle, close }] = useDisclosure()
  const { setColorScheme } = useMantineColorScheme()
  const scheme = useComputedColorScheme('light')
  const location = useLocation()

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 230, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <IconClockHour4 size={24} color="var(--mantine-color-indigo-6)" />
            <Text fw={700} size="lg">
              Cadence
            </Text>
          </Group>
          <Group gap="xs">
            <ViewSwitch />
            <Tooltip label="Toggle dark mode">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
                aria-label="Toggle dark mode"
              >
                {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Sign out">
              <ActionIcon variant="default" size="lg" onClick={() => supabase.auth.signOut()} aria-label="Sign out">
                <IconLogout size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <AppShell.Section grow component={ScrollArea}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              component={RouterNavLink}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={18} />}
              active={item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)}
              onClick={close}
            />
          ))}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Suspense
          fallback={
            <Center py="xl">
              <Loader />
            </Center>
          }
        >
          <Outlet />
        </Suspense>
      </AppShell.Main>
    </AppShell>
  )
}
