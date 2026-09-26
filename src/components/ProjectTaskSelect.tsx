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

  const { data, taskProject, color } = useMemo(() => {
    const projects = projectsData ?? []
    const tasks = tasksData ?? []
    const clients = clientsData ?? []
    const taskProject = new Map(tasks.map((t) => [t.id, t.project_id]))
    const color = new Map(projects.map((p) => [p.id, p.color]))
    const data = projects
      .filter((p) => !p.archived || p.id === value.projectId)
      .map((p) => {
        const client = clients.find((c) => c.id === p.client_id)
        return {
          group: client ? `${p.name} · ${client.name}` : p.name,
          items: [
            { value: `p:${p.id}`, label: p.name },
            ...tasks
              .filter((t) => t.project_id === p.id && (!t.done || t.id === value.taskId))
              .map((t) => ({ value: `t:${t.id}`, label: `${p.name} › ${t.name}` })),
          ],
        }
      })
    return { data, taskProject, color }
  }, [projectsData, tasksData, clientsData, value.projectId, value.taskId])

  return (
    <Select
      placeholder="No project"
      searchable
      clearable
      data={data}
      value={encode(value)}
      onChange={(v) => {
        if (!v) return onChange({ projectId: null, taskId: null })
        const id = v.slice(2)
        if (v.startsWith('t:')) onChange({ projectId: taskProject.get(id) ?? null, taskId: id })
        else onChange({ projectId: id, taskId: null })
      }}
      renderOption={({ option }) => {
        const isTask = option.value.startsWith('t:')
        const pid = isTask ? taskProject.get(option.value.slice(2)) : option.value.slice(2)
        return (
          <Group gap="xs" wrap="nowrap" pl={isTask ? 'md' : 0}>
            {!isTask && <ColorSwatch color={color.get(pid ?? '') ?? '#999'} size={10} />}
            <Text size="sm">{isTask ? option.label.split(' › ').slice(1).join(' › ') : option.label}</Text>
          </Group>
        )
      }}
      {...rest}
    />
  )
}
