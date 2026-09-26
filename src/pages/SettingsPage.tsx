import { useState } from 'react'
import { Button, Grid, Group, NumberInput, Paper, Select, Stack, Text, TextInput, Textarea, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconDownload } from '@tabler/icons-react'
import dayjs from 'dayjs'
import { useUpdateWorkspace, useWorkspace } from '../data/hooks'
import { supabase } from '../lib/supabase'
import { CURRENCIES } from '../lib/money'
import type { TableName, Workspace } from '../lib/types'
import { RateEditor } from '../components/RateEditor'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const BACKUP_TABLES: TableName[] = [
  'clients',
  'projects',
  'tasks',
  'rates',
  'time_entries',
  'invoices',
  'invoice_lines',
  'payments',
  'saved_reports',
]

async function fetchAll(table: TableName, workspaceId: string) {
  const pageSize = 1000
  const rows: unknown[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}

export function SettingsPage() {
  const workspace = useWorkspace().data!
  const update = useUpdateWorkspace()
  const [exporting, setExporting] = useState(false)

  const form = useForm({
    initialValues: {
      name: workspace.name,
      currency: workspace.currency,
      week_start: String(workspace.week_start),
      default_tax_percent: workspace.default_tax_percent as number | string,
      invoice_prefix: workspace.invoice_prefix,
      business_name: workspace.business_name ?? '',
      business_email: workspace.business_email ?? '',
      business_address: workspace.business_address ?? '',
    },
  })

  async function submit(v: typeof form.values) {
    const patch: Partial<Workspace> & { id: string } = {
      id: workspace.id,
      name: v.name.trim() || 'My workspace',
      currency: v.currency,
      week_start: Number(v.week_start),
      default_tax_percent: Number(v.default_tax_percent) || 0,
      invoice_prefix: v.invoice_prefix,
      business_name: v.business_name || null,
      business_email: v.business_email || null,
      business_address: v.business_address || null,
    }
    try {
      await update.mutateAsync(patch)
      notifications.show({ color: 'green', message: 'Settings saved' })
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message })
    }
  }

  async function exportBackup() {
    setExporting(true)
    try {
      const backup: Record<string, unknown> = {
        app: 'cadence',
        version: 1,
        exported_at: new Date().toISOString(),
        workspace,
      }
      for (const table of BACKUP_TABLES) backup[table] = await fetchAll(table, workspace.id)
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cadence-backup-${dayjs().format('YYYY-MM-DD')}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Stack maw={1000}>
      <Title order={2}>Settings</Title>
      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper withBorder p="md">
            <form onSubmit={form.onSubmit(submit)}>
              <Stack>
                <Title order={4}>Workspace</Title>
                <TextInput label="Workspace name" {...form.getInputProps('name')} />
                <Group grow>
                  <Select
                    label="Default currency"
                    description="Clients can override this"
                    data={CURRENCIES}
                    searchable
                    allowDeselect={false}
                    {...form.getInputProps('currency')}
                  />
                  <Select
                    label="Week starts on"
                    description="Used by reports"
                    data={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))}
                    allowDeselect={false}
                    {...form.getInputProps('week_start')}
                  />
                </Group>

                <Title order={4} mt="sm">
                  Invoicing
                </Title>
                <Group grow>
                  <NumberInput label="Default tax / VAT %" min={0} max={100} decimalScale={2} {...form.getInputProps('default_tax_percent')} />
                  <TextInput label="Invoice number prefix" {...form.getInputProps('invoice_prefix')} />
                </Group>
                <TextInput label="Your business name" {...form.getInputProps('business_name')} />
                <TextInput label="Your business email" type="email" {...form.getInputProps('business_email')} />
                <Textarea label="Your business address" autosize minRows={2} {...form.getInputProps('business_address')} />

                <Group justify="flex-end">
                  <Button type="submit" loading={update.isPending}>
                    Save settings
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack>
            <RateEditor scope={{ level: 'default' }} parent={{}} currency={workspace.currency} />
            <Text size="xs" c="dimmed" px="xs">
              Rates cascade: a task rate overrides its project rate, which overrides the client rate, which overrides
              this default.
            </Text>

            <Paper withBorder p="md">
              <Stack gap="xs">
                <Title order={4}>Backup</Title>
                <Text size="sm" c="dimmed">
                  Download all your data as a JSON file. The free Supabase plan has no downloadable backups, so do
                  this now and then.
                </Text>
                <Button variant="light" leftSection={<IconDownload size={16} />} onClick={exportBackup} loading={exporting}>
                  Export backup
                </Button>
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  )
}
