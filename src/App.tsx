import { lazy } from 'react'
import { Center, Loader, Stack, Text } from '@mantine/core'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useWorkspace } from './data/hooks'
import { AppLayout } from './layout/AppLayout'
import { TrackerPage } from './pages/TrackerPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ClientsPage } from './pages/ClientsPage'
import { SettingsPage } from './pages/SettingsPage'

// Heavier pages (charts, invoicing) load on first visit.
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const InvoicesPage = lazy(() => import('./pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage })))
const NewInvoicePage = lazy(() => import('./pages/NewInvoicePage').then((m) => ({ default: m.NewInvoicePage })))
const InvoiceDetailPage = lazy(() => import('./pages/InvoiceDetailPage').then((m) => ({ default: m.InvoiceDetailPage })))

export function App() {
  const workspace = useWorkspace()

  if (workspace.isPending) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }
  if (workspace.isError) {
    return (
      <Center h="100vh" p="md">
        <Stack gap="xs" maw={480}>
          <Text fw={600}>Couldn't load your workspace.</Text>
          <Text size="sm" c="dimmed">
            {workspace.error.message}. If this is a fresh setup, make sure the database migration in
            supabase/migrations has been run in the Supabase SQL editor.
          </Text>
        </Stack>
      </Center>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<TrackerPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/new" element={<NewInvoicePage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
