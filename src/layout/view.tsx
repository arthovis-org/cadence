import { createContext, useContext } from 'react'

export type View = '2d' | '3d'

/**
 * Transition phases between the 2D app and the 3D desk:
 * - lift:   the 2D app shrinks into a floating panel (the desk loads behind it)
 * - away:   the panel tilts back and flies off while the desk fades in
 * - leave:  the desk fades out
 * - return: the panel flies back in from the distance
 * - land:   the panel grows back to full screen
 */
export type Phase = 'idle' | 'lift' | 'away' | 'leave' | 'return' | 'land'

export interface ViewState {
  view: View
  phase: Phase
  /** Switch views with the transition. For 2D, optionally land on a specific page. */
  switchTo: (view: View, path?: string) => void
}

export const ViewContext = createContext<ViewState>({ view: '2d', phase: 'idle', switchTo: () => {} })

export const useView = () => useContext(ViewContext)
