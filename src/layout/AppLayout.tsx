import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
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
    return localStorage.getItem(VIEW_KEY) === '3d' ? '3d' : '2d'
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

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [view, setView] = useState<View>(() => initialView(location.pathname))
  const [phase, setPhase] = useState<Phase>('idle')
  const [deskMounted, setDeskMounted] = useState(view === '3d')
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

  const switchTo = useCallback(
    async (next: View, path?: string) => {
      if (busy.current) return
      if (next === view) {
        if (path) navigate(path)
        return
      }
      busy.current = true
      remember(next)
      try {
        if (next === '3d') {
          loadDesk()
          deskReady.current = false
          if (reducedMotion()) {
            setDeskMounted(true)
            setView('3d')
            return
          }
          window.scrollTo(0, 0)
          setDeskMounted(true)
          setPhase('lift') // 2D becomes a floating panel; the desk loads behind it
          await Promise.all([sleep(650), waitForDesk()])
          setPhase('away') // the panel flies off, the desk fades in
          await sleep(1150)
          setView('3d')
          setPhase('idle')
        } else {
          if (path) navigate(path)
          if (reducedMotion()) {
            setView('2d')
            setDeskMounted(false)
            return
          }
          window.scrollTo(0, 0)
          setPhase('leave') // the desk fades out; the 2D panel waits far away
          await sleep(280)
          setPhase('return') // the panel flies back in
          await sleep(900)
          setPhase('land') // and grows back to full screen
          await sleep(480)
          setView('2d')
          setPhase('idle')
          setDeskMounted(false)
        }
      } finally {
        busy.current = false
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, navigate],
  )

  const ctx = useMemo(() => ({ view, phase, switchTo }), [view, phase, switchTo])

  const animating = phase !== 'idle'
  const deskVisible = (view === '3d' && phase === 'idle') || phase === 'away'
  const shellClass = animating ? `vt-shell vt-active vt-${phase}` : view === '3d' ? 'vt-shell vt-hidden' : 'vt-shell'

  return (
    <ViewContext.Provider value={ctx}>
      {animating && <div className="vt-backdrop" />}

      {deskMounted && (
        <div className={`vt-desk${deskVisible ? ' vt-on' : ''}${phase === 'away' ? ' vt-slow' : ''}`} aria-hidden={!deskVisible}>
          <Suspense
            fallback={
              <Center h="100%">
                <Loader />
              </Center>
            }
          >
            <DeskPage onReady={onDeskReady} />
          </Suspense>
        </div>
      )}

      <div className={animating ? 'vt-stage' : undefined}>
        <div className={shellClass}>
          <Shell />
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
