import { Alert, Anchor, Group, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import type { ReportRow } from '../lib/report'
import { formatDuration } from '../lib/time'

/** Warns about billable time that has no hourly rate, with links to fix each project. */
export function MissingRatesAlert({ rows, context }: { rows: ReportRow[]; context: 'report' | 'invoice' }) {
  const missing = rows.filter((r) => r.rateMissing)
  if (missing.length === 0) return null

  const seconds = missing.reduce((s, r) => s + r.seconds, 0)
  const projects = new Map<string, { name: string; id: string | null; seconds: number }>()
  for (const r of missing) {
    const key = r.project?.id ?? 'none'
    const p = projects.get(key) ?? { name: r.project?.name ?? 'No project', id: r.project?.id ?? null, seconds: 0 }
    p.seconds += r.seconds
    projects.set(key, p)
  }

  return (
    <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />} title="Some billable time has no rate">
      <Text size="sm">
        {formatDuration(seconds, false)} of billable time {context === 'invoice' ? 'goes on the invoice at zero' : 'counts as zero'} until
        its project has an hourly rate.
      </Text>
      <Group gap="md" mt={6}>
        {[...projects.values()].map((p) =>
          p.id ? (
            <Anchor key={p.id} component={Link} to={`/projects/${p.id}`} size="sm" fw={500}>
              Set rate for {p.name} ({formatDuration(p.seconds, false)})
            </Anchor>
          ) : (
            <Text key="none" size="sm" c="dimmed">
              {formatDuration(p.seconds, false)} has no project. Add a project to those entries.
            </Text>
          ),
        )}
      </Group>
    </Alert>
  )
}
