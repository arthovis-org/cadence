import { useState } from 'react'
import { Button, ColorInput, Group, NumberInput, Select, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useClients, useSave, useWorkspace } from '../data/hooks'
import { supabase } from '../lib/supabase'
import { toCents } from '../lib/money'
import { ALWAYS } from '../lib/rates'
import type { Project } from '../lib/types'

const PROJECT_COLORS = [
  '#4c6ef5', '#228be6', '#15aabf', '#12b886', '#40c057', '#82c91e',
  '#fab005', '#fd7e14', '#fa5252', '#e64980', '#be4bdb', '#7950f2',
]

export function ProjectForm({
  project,
  onDone,
}: {
  project: Project | null
  onDone: (saved?: Project) => void
}) {
  const clients = useClients().data ?? []
  const save = useSave<Project>('projects')
  const workspace = useWorkspace().data
  const qc = useQueryClient()
  const [randomColor] = useState(() => PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)])
  const form = useForm({
    initialValues: {
      name: project?.name ?? '',
      client_id: project?.client_id ?? null,
      color: project?.color ?? randomColor,
      billable: project?.billable ?? true,
      budget_hours: (project?.budget_hours ?? '') as number | string,
      notes: project?.notes ?? '',
      rate: '' as number | string,
    },
    validate: {
      name: (v) => (v.trim() ? null : 'Name is required'),
      // New billable projects need a rate; existing projects change theirs in the rate panel.
      rate: (v, values) => (!project && values.billable && toCents(v) === null ? 'Enter an hourly rate' : null),
    },
  })

  async function submit(v: typeof form.values) {
    try {
      const saved = await save.mutateAsync({
        id: project?.id,
        name: v.name.trim(),
        client_id: v.client_id,
        color: v.color,
        billable: v.billable,
        budget_hours: v.budget_hours === '' ? null : Number(v.budget_hours),
        notes: v.notes || null,
      })
      const cents = toCents(v.rate)
      if (!project && cents !== null) {
        const { error } = await supabase
          .from('rates')
          .insert({ workspace_id: saved.workspace_id, project_id: saved.id, rate_cents: cents, effective_from: ALWAYS })
        if (error) throw new Error(`Project saved, but the rate wasn't: ${error.message}`)
        await qc.invalidateQueries({ queryKey: ['rates'] })
      }
      onDone(saved)
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message })
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack>
        <TextInput label="Name" required data-autofocus {...form.getInputProps('name')} />
        <Select
          label="Client"
          placeholder="No client"
          clearable
          searchable
          data={clients.filter((c) => !c.archived || c.id === project?.client_id).map((c) => ({ value: c.id, label: c.name }))}
          {...form.getInputProps('client_id')}
        />
        <Group grow align="flex-start">
          <ColorInput label="Color" swatches={PROJECT_COLORS} swatchesPerRow={6} {...form.getInputProps('color')} />
          <NumberInput label="Budget (hours)" placeholder="None" min={0} {...form.getInputProps('budget_hours')} />
        </Group>
        <Switch label="Billable by default" {...form.getInputProps('billable', { type: 'checkbox' })} />
        {!project && (
          <NumberInput
            label="Hourly rate"
            description={form.values.billable ? 'You can change it later, from a date or for all time' : 'Optional for non-billable projects'}
            placeholder="0.00"
            min={0}
            decimalScale={2}
            fixedDecimalScale
            withAsterisk={form.values.billable}
            rightSection={
              <Text size="xs" c="dimmed" pr="xs">
                {(clients.find((c) => c.id === form.values.client_id)?.currency ?? workspace?.currency ?? 'USD') + '/h'}
              </Text>
            }
            rightSectionWidth={60}
            {...form.getInputProps('rate')}
          />
        )}
        <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => onDone()}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {project ? 'Save' : 'Create project'}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
