import { useMemo } from 'react'
import { ColorSwatch, Group, Select, Text, type SelectProps } from '@mantine/core'
import { useClients, useProjects, useTasks } from '../data/hooks'

export interface ProjectTaskValue {
  projectId: string | null
  taskId: string | null
}

interface Props extends Omit<SelectProps, 'value' | 'onChange' | 'data'> {
  value: ProjectTaskValue
  onChange: (value: ProjectTaskValue) => void
}

// Options are encoded as "p:<projectId>" or "t:<taskId>".
function encode(v: ProjectTaskValue): string | null {
  if (v.taskId) return `t:${v.taskId}`
  if (v.projectId) return `p:${v.projectId}`
  return null
}

export function ProjectTaskSelect({ value, onChange, ...rest }: Props) {
  const projectsData = useProjects().data
  const tasksData = useTasks().data
  const clientsData = useClients().data

  const { data, taskProject, color, taskName } = useMemo(() => {
    const projects = (projectsData ?? []).filter((p) => !p.archived || p.id === value.projectId)
    const tasks = tasksData ?? []
    const clients = clientsData ?? []
    const taskProject = new Map(tasks.map((t) => [t.id, t.project_id]))
    const taskName = new Map(tasks.map((t) => [t.id, t.name]))
    const color = new Map(projects.map((p) => [p.id, p.color]))

    // Group projects by client; each project is followed by its (open) tasks.
    const groups = [...clients, null].map((client) => {
      const items = projects
        .filter((p) => p.client_id === (client?.id ?? null))
        .flatMap((p) => [
          { value: `p:${p.id}`, label: p.name },
          ...tasks
            .filter((t) => t.project_id === p.id && (!t.done || t.id === value.taskId))
            .map((t) => ({ value: `t:${t.id}`, label: `${p.name} › ${t.name}` })),
        ])
      return { group: client?.name ?? 'No client', items }
    })
    return { data: groups.filter((g) => g.items.length > 0), taskProject, color, taskName }
  }, [projectsData, tasksData, clientsData, value.projectId, value.taskId])

  return (
    <Select
      placeholder="No project"
      searchable
      clearable
      data={data}
      value={encode(value)}
      maxDropdownHeight={360}
      onChange={(v) => {
        if (!v) return onChange({ projectId: null, taskId: null })
        const id = v.slice(2)
        if (v.startsWith('t:')) onChange({ projectId: taskProject.get(id) ?? null, taskId: id })
        else onChange({ projectId: id, taskId: null })
      }}
      renderOption={({ option }) => {
        const id = option.value.slice(2)
        if (option.value.startsWith('t:')) {
          return (
            <Text size="xs" c="dimmed" pl={22}>
              {taskName.get(id)}
            </Text>
          )
        }
        return (
          <Group gap={8} wrap="nowrap">
            <ColorSwatch color={color.get(id) ?? '#999'} size={10} withShadow={false} />
            <Text size="sm" fw={500}>
              {option.label}
            </Text>
          </Group>
        )
      }}
      {...rest}
    />
  )
}
