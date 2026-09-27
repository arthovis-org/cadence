import { useState } from 'react'
import { Button, Group, Paper, Text } from '@mantine/core'
import { IconFlask } from '@tabler/icons-react'
import { exitDemo, exitDemoToSignUp } from './demo'

/** Floating reminder that this is a demo workspace, with ways out. */
export function DemoBanner() {
  const [busy, setBusy] = useState<'exit' | 'signup' | null>(null)
  return (
    <Paper className="demo-banner" shadow="md" withBorder px="sm" py={6}>
      <Group gap="sm" wrap="nowrap">
        <IconFlask size={18} color="var(--mantine-color-grape-6)" />
        <Text size="sm" visibleFrom="xs">
          <b>Demo workspace</b> · sample data, removed when you leave
        </Text>
        <Button
          size="compact-sm"
          variant="light"
          loading={busy === 'signup'}
          onClick={() => {
            setBusy('signup')
            exitDemoToSignUp()
          }}
        >
          Create an account
        </Button>
        <Button
          size="compact-sm"
          variant="subtle"
          color="gray"
          loading={busy === 'exit'}
          onClick={() => {
            setBusy('exit')
            exitDemo()
          }}
        >
          Exit demo
        </Button>
      </Group>
    </Paper>
  )
}
