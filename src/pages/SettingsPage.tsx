import { useState } from 'react'
import { Button, Grid, Group, NumberInput, Paper, Select, Stack, Text, TextInput, Textarea, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconDownload } from '@tabler/icons-react'
import dayjs from 'dayjs'
import { fetchAllRows, useUpdateWorkspace, useWorkspace } from '../data/hooks'
import { CURRENCIES } from '../lib/money'
import type { TableName, Workspace } from '../lib/types'
import { RateEditor } from '../components/RateEditor'
import { AppearanceSettings } from '../components/AppearanceSettings'

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
      receipt_prefix: workspace.receipt_prefix ?? 'RCPT-',
      payment_terms_days: (workspace.payment_terms_days ?? 14) as number | string,
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
      receipt_prefix: v.receipt_prefix,
      payment_terms_days: Number(v.payment_terms_days) || 0,
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
      for (const table of BACKUP_TABLES) backup[table] = await fetchAllRows(table, workspace.id)
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
    <Stack maw={1400}>
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
                  <NumberInput label="Payment terms (days)" description="Default due date" min={0} {...form.getInputProps('payment_terms_days')} />
                </Group>
                <Group grow>
                  <TextInput
                    label="Invoice number prefix"
                    description={`Next: ${workspace.invoice_prefix}${String(workspace.next_invoice_number).padStart(4, '0')}`}
                    {...form.getInputProps('invoice_prefix')}
                  />
                  <TextInput
                    label="Receipt number prefix"
                    description={`Next: ${workspace.receipt_prefix ?? 'RCPT-'}${String(workspace.next_receipt_number ?? 1).padStart(4, '0')}`}
                    {...form.getInputProps('receipt_prefix')}
                  />
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
            <AppearanceSettings />
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
