import { createContext, useContext } from 'react'

/**
 * The three ways to see the app:
 * - 2d:    the regular app
 * - panel: the live 2D app floating as a panel in the 3D room (still fully usable)
 * - 3d:    the 3D desk
 */
export type View = '2d' | 'panel' | '3d'

/**
 * Animation steps between views:
 * - lift:   2D shrinks into the floating panel, the room fades in behind it
 * - land:   the panel grows back to full-screen 2D, the room fades out
 * - away:   the panel tilts back and flies off while the camera moves in to the desk
 * - leave:  (instant) the panel is placed far away, ready to come back
 * - return: the panel flies back in while the camera pulls back from the desk
 */
export type Phase = 'idle' | 'lift' | 'land' | 'away' | 'leave' | 'return'

export interface ViewState {
  view: View
  phase: Phase
  /** Switch views with an animation. Optionally open a specific 2D page. */
  switchTo: (view: View, path?: string) => void
}

export const ViewContext = createContext<ViewState>({ view: '2d', phase: 'idle', switchTo: () => {} })

export const useView = () => useContext(ViewContext)

export const VIEW_LABELS: Record<View, string> = {
  '2d': '2D',
  panel: '2D in 3D',
  '3d': '3D desk',
}
