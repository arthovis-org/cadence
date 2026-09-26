import { SegmentedControl } from '@mantine/core'
import { useView, type View } from './view'

/** 2D / 3D toggle, used in the 2D header and on the 3D desk. */
export function ViewSwitch() {
  const { view, phase, switchTo } = useView()
  return (
    <SegmentedControl
      size="xs"
      value={view}
      disabled={phase !== 'idle'}
      onChange={(v) => switchTo(v as View)}
      // Start loading the 3D code as soon as the pointer heads for the switch.
      onMouseEnter={() => void import('../desk/DeskPage')}
      data={[
        { value: '2d', label: '2D' },
        { value: '3d', label: '3D desk' },
      ]}
    />
  )
}
