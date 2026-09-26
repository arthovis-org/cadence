import { SegmentedControl } from '@mantine/core'
import { useView, VIEW_LABELS, type View } from './view'

const VIEWS: View[] = ['2d', 'panel', '3d']

/** 2D / 2D in 3D / 3D switch, shown in the 2D header and on the 3D desk. */
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
      data={VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
    />
  )
}
