import { useState } from 'react'
import { Badge, Button, ColorSwatch, Group, Modal, Paper, Select, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core'
import { IconPlus, IconSearch } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { useClients, useProjects, useRates, useTasks, useWorkspace } from '../data/hooks'
import { resolveRate } from '../lib/rates'
import { RateLabel } from '../components/RateLabel'
import { ProjectForm } from '../components/ProjectForm'

export function ProjectsPage() {
  const projects = useProjects()
  const clients = useClients().data ?? []
  const tasks = useTasks().data ?? []
  const ratesData = useRates().data
  const rates = ratesData ?? []
  const workspace = useWorkspace().data!
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState<string | null>(null)

  const list = (projects.data ?? []).filter(
    (p) =>
      (showArchived || !p.archived) &&
      (!clientFilter || p.client_id === clientFilter) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Projects</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
          New project
        </Button>
      </Group>

      <Group>
        <TextInput
          placeholder="Search projects"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Select
          placeholder="All clients"
          clearable
          data={clients.map((c) => ({ value: c.id, label: c.name }))}
          value={clientFilter}
          onChange={setClientFilter}
        />
        <Switch label="Show archived" checked={showArchived} onChange={(e) => setShowArchived(e.currentTarget.checked)} />
      </Group>

      <Paper withBorder>
        <Table.ScrollContainer minWidth={600}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Project</Table.Th>
                <Table.Th>Client</Table.Th>
                <Table.Th>Tasks</Table.Th>
                <Table.Th>Rate</Table.Th>
                <Table.Th>Billable</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.map((p) => {
                const client = clients.find((c) => c.id === p.client_id)
                const rate = resolveRate(rates, { projectId: p.id })
                const currency = client?.currency ?? workspace.currency
                const projectTasks = tasks.filter((t) => t.project_id === p.id)
                return (
                  <Table.Tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <ColorSwatch color={p.color} size={12} />
                        <Text fw={500}>{p.name}</Text>
                        {p.archived && <Badge size="xs" color="gray">Archived</Badge>}
                      </Group>
                    </Table.Td>
                    <Table.Td>{client?.name ?? <Text c="dimmed" size="sm">—</Text>}</Table.Td>
                    <Table.Td>
                      {projectTasks.filter((t) => !t.done).length}
                      <Text span c="dimmed" size="sm"> / {projectTasks.length}</Text>
                    </Table.Td>
                    <Table.Td>
                      {!ratesData ? null : p.billable || rate.source !== 'none' ? <RateLabel rate={rate} currency={currency} /> : <Text span size="sm" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>{p.billable ? 'Yes' : 'No'}</Table.Td>
                  </Table.Tr>
                )
              })}
              {list.length === 0 && !projects.isPending && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed" ta="center" py="lg">
                      No projects found.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal opened={creating} onClose={() => setCreating(false)} title="New project" size="lg">
        <ProjectForm
          project={null}
          onDone={(saved) => {
            setCreating(false)
            if (saved) navigate(`/projects/${saved.id}`)
          }}
        />
      </Modal>
    </Stack>
  )
}
