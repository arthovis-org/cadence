import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [view, setView] = useState<View>(() => initialView(location.pathname))
  const [phase, setPhase] = useState<Phase>('idle')
  const [deskMounted, setDeskMounted] = useState(view !== '2d')
  const busy = useRef(false)
  const deskReady = useRef(false)
  const resolveReady = useRef<(() => void) | null>(null)

  // The 2D app is rendered once into this element, which is then moved between the page (2D view)
  // and the card inside the 3D scene. Moving the element keeps all React state (forms, scroll, timers).
  const [shellHost] = useState(() => {
    const el = document.createElement('div')
    el.className = 'shell-host'
    return el
  })
  const pageSlot = useRef<HTMLDivElement>(null)
  const onCard = view !== '2d' || phase === 'lift' || phase === 'land'
  useLayoutEffect(() => {
    if (!onCard) pageSlot.current?.appendChild(shellHost)
  }, [onCard, shellHost])

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
          setTimeout(resolve, 4000) // don't hang if the first frame is slow
        })

  // Each step animates between two neighbouring views: 2d <-> panel <-> 3d.
  const steps = {
    async toPanelFrom2d() {
      loadDesk()
      setDeskMounted(true)
      await waitForDesk() // the room renders invisibly first, so the swap onto the card is seamless
      window.scrollTo(0, 0)
      setPhase('lift') // the app moves onto the card, filling the screen; the camera pulls back
      await sleep(1300)
      setView('panel')
      setPhase('idle')
    },
    async to2dFromPanel() {
      setPhase('land') // the camera moves in until the card fills the screen
      await sleep(1000)
      setView('2d')
      setPhase('idle')
      setDeskMounted(false)
      deskReady.current = false
    },
    async to3dFromPanel() {
      setPhase('away') // the card flies off while the camera moves to the desk
      await sleep(1300)
      setView('3d')
      setPhase('idle')
    },
    async toPanelFrom3d() {
      setPhase('return') // the card flies back in while the camera pulls back
      await sleep(1150)
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
        // Now the card is floating in the room; continue if the target is further along.
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

  return (
    <ViewContext.Provider value={ctx}>
      {deskMounted && (
        <div className={onCard ? 'vt-desk vt-on' : 'vt-desk'} aria-hidden={!onCard}>
          <Suspense
            fallback={
              <Center h="100%">
                <Loader color="gray" />
              </Center>
            }
          >
            <DeskPage onReady={onDeskReady} shellHost={shellHost} />
          </Suspense>
        </div>
      )}

      <div ref={pageSlot} />
      {createPortal(<Shell />, shellHost)}
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
