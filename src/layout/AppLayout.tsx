import { Suspense, useEffect } from 'react'
import {
  ActionIcon,
  AppShell,
  Center,
  Loader,
  Burger,
  SegmentedControl,
  Group,
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

const VIEW_KEY = 'cadence.view'

const NAV = [
  { to: '/', label: 'Time tracker', icon: IconClockHour4 },
  { to: '/projects', label: 'Projects', icon: IconBriefcase },
  { to: '/clients', label: 'Clients', icon: IconUsers },
  { to: '/reports', label: 'Reports', icon: IconChartBar },
  { to: '/invoices', label: 'Invoices', icon: IconFileInvoice },
  { to: '/settings', label: 'Settings', icon: IconSettings },
]

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure()
  const { setColorScheme } = useMantineColorScheme()
  const scheme = useComputedColorScheme('light')
  const location = useLocation()
  const navigate = useNavigate()
  const is3d = location.pathname.startsWith('/3d')

  // Remember the last view; reopening the app on the tracker goes back to 3D if that was used last.
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === '3d' && location.pathname === '/') navigate('/3d', { replace: true })
    } catch {
      // Storage unavailable: start in 2D.
    }
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function switchView(view: string) {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      // Not critical.
    }
    navigate(view === '3d' ? '/3d' : '/')
  }

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 230, breakpoint: 'sm', collapsed: { mobile: !opened || is3d, desktop: is3d } }}
      padding={is3d ? 0 : 'md'}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            {!is3d && <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />}
            <IconClockHour4 size={24} color="var(--mantine-color-indigo-6)" />
            <Text fw={700} size="lg">
              Cadence
            </Text>
          </Group>
          <Group gap="xs">
            <SegmentedControl
              size="xs"
              value={is3d ? '3d' : '2d'}
              onChange={switchView}
              data={[
                { value: '2d', label: '2D' },
                { value: '3d', label: '3D desk' },
              ]}
            />
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
