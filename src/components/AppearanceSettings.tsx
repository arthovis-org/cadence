import { useState } from 'react'
import { Button, Group, Paper, SegmentedControl, Slider, Stack, Text, Title, useMantineColorScheme, type MantineColorScheme } from '@mantine/core'
import { getUiScale, setUiScale, UI_SCALE_DEFAULT, UI_SCALE_MAX, UI_SCALE_MIN } from '../lib/uiScale'

export function AppearanceSettings() {
  const [scale, setScale] = useState(getUiScale)
  const { colorScheme, setColorScheme } = useMantineColorScheme()

  function change(v: number) {
    setScale(v)
    setUiScale(v)
  }

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={4}>Appearance</Title>
        <div>
          <Group justify="space-between" mb={6}>
            <Text size="sm" fw={500}>
              Interface scale
            </Text>
            <Group gap="xs">
              <Text size="sm" fw={600} className="tabular">
                {scale}%
              </Text>
              {scale !== UI_SCALE_DEFAULT && (
                <Button variant="subtle" size="compact-xs" onClick={() => change(UI_SCALE_DEFAULT)}>
                  Reset
                </Button>
              )}
            </Group>
          </Group>
          <Slider
            min={UI_SCALE_MIN}
            max={UI_SCALE_MAX}
            step={5}
            value={scale}
            onChange={change}
            label={(v) => `${v}%`}
            marks={[
              { value: 80, label: '80%' },
              { value: 100, label: '100%' },
              { value: 125, label: '125%' },
              { value: 150, label: '150%' },
            ]}
            mb="lg"
          />
          <Text size="xs" c="dimmed" mt="md">
            Makes text and controls bigger or smaller. Saved for this device only, so your laptop and big monitor can
            each have their own size.
          </Text>
        </div>
        <div>
          <Text size="sm" fw={500} mb={6}>
            Theme
          </Text>
          <SegmentedControl
            fullWidth
            value={colorScheme}
            onChange={(v) => setColorScheme(v as MantineColorScheme)}
            data={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'auto', label: 'System' },
            ]}
          />
        </div>
      </Stack>
    </Paper>
  )
}
