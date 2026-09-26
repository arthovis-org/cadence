import { useState } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconArchive, IconDots, IconFileInvoice, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { useClients, useProjects, useRates, useRemove, useSave, useWorkspace } from '../data/hooks'
import { CURRENCIES, formatMoney } from '../lib/money'
import { resolveRate, SOURCE_LABEL } from '../lib/rates'
import type { Client } from '../lib/types'
import { RateEditor } from '../components/RateEditor'

export function ClientsPage() {
  const clients = useClients()
  const projects = useProjects().data ?? []
  const rates = useRates().data ?? []
  const workspace = useWorkspace().data!
  const save = useSave<Client>('clients')
  const remove = useRemove('clients')
  const [showArchived, setShowArchived] = useState(false)
  const navigate = useNavigate()
  const [editing, setEditing] = useState<Client | 'new' | null>(null)

  const list = (clients.data ?? []).filter((c) => showArchived || !c.archived)

  function confirmDelete(c: Client) {
    modals.openConfirmModal({
      title: `Delete ${c.name}?`,
      children: (
        <Text size="sm">
          Projects of this client are kept but lose their client. Consider archiving instead. Clients with invoices
          can't be deleted.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(c.id, { onError: (e) => notifications.show({ color: 'red', message: e.message }) }),
    })
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Clients</Title>
        <Group>
          <Switch label="Show archived" checked={showArchived} onChange={(e) => setShowArchived(e.currentTarget.checked)} />
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
            New client
          </Button>
        </Group>
      </Group>

      <Paper withBorder>
        <Table.ScrollContainer minWidth={560}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Projects</Table.Th>
                <Table.Th>Rate</Table.Th>
                <Table.Th>Currency</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.map((c) => {
                const rate = resolveRate(rates, { clientId: c.id })
                const currency = c.currency ?? workspace.currency
                return (
                  <Table.Tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setEditing(c)}>
                    <Table.Td>
                      <Group gap="xs">
                        <Text fw={500}>{c.name}</Text>
                        {c.archived && <Badge size="xs" color="gray">Archived</Badge>}
                      </Group>
                      {c.email && <Text size="xs" c="dimmed">{c.email}</Text>}
                    </Table.Td>
                    <Table.Td>{projects.filter((p) => p.client_id === c.id).length}</Table.Td>
                    <Table.Td className="tabular">
                      {formatMoney(rate.cents, currency)}/h{' '}
                      {rate.source !== 'client' && <Text span size="xs" c="dimmed">({SOURCE_LABEL[rate.source]})</Text>}
                    </Table.Td>
                    <Table.Td>{currency}</Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Menu position="bottom-end">
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label="Actions">
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(c)}>
                            Edit
                          </Menu.Item>
                          <Menu.Item leftSection={<IconFileInvoice size={14} />} onClick={() => navigate(`/invoices/new?client=${c.id}`)}>
                            New invoice
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconArchive size={14} />}
                            onClick={() => save.mutate({ id: c.id, archived: !c.archived })}
                          >
                            {c.archived ? 'Unarchive' : 'Archive'}
                          </Menu.Item>
                          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => confirmDelete(c)}>
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
              {list.length === 0 && !clients.isPending && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed" ta="center" py="lg">
                      No clients yet.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New client' : 'Edit client'}
        size="lg"
      >
        {editing !== null && (
          <ClientForm
            client={editing === 'new' ? null : editing}
            defaultCurrency={workspace.currency}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </Stack>
  )
}

function ClientForm({ client, defaultCurrency, onDone }: { client: Client | null; defaultCurrency: string; onDone: () => void }) {
  const save = useSave<Client>('clients')
  const form = useForm({
    initialValues: {
      name: client?.name ?? '',
      email: client?.email ?? '',
      address: client?.address ?? '',
      currency: client?.currency ?? '',
      notes: client?.notes ?? '',
    },
    validate: { name: (v) => (v.trim() ? null : 'Name is required') },
  })

  async function submit(values: typeof form.values) {
    try {
      await save.mutateAsync({
        id: client?.id,
        name: values.name.trim(),
        email: values.email || null,
        address: values.address || null,
        currency: values.currency || null,
        notes: values.notes || null,
      })
      onDone()
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message })
    }
  }

  return (
    <Stack>
      <form onSubmit={form.onSubmit(submit)}>
        <Stack>
          <TextInput label="Name" required data-autofocus {...form.getInputProps('name')} />
          <TextInput label="Email" type="email" {...form.getInputProps('email')} />
          <Textarea label="Address" autosize minRows={2} {...form.getInputProps('address')} />
          <Select
            label="Currency"
            placeholder={`Workspace default (${defaultCurrency})`}
            data={CURRENCIES}
            clearable
            searchable
            {...form.getInputProps('currency')}
          />
          <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {client ? 'Save' : 'Create client'}
            </Button>
          </Group>
        </Stack>
      </form>
      {client ? (
        <RateEditor scope={{ level: 'client', id: client.id }} parent={{}} currency={client.currency ?? defaultCurrency} />
      ) : (
        <Text size="xs" c="dimmed">
          You can set a client-specific rate after creating the client.
        </Text>
      )}
    </Stack>
  )
}
