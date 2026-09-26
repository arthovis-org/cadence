import { useCallback, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import { Vector3, type Group } from 'three'

// The 2D app lives on this card when it's in the 3D room. The card is sized to the screen's aspect ratio,
// and its HTML is laid out at the screen's pixel size, so when the camera is at the "fill" distance the card
// covers the screen exactly and looks like the regular 2D app.

export const CARD_POS = new Vector3(0, 1.32, 0.05)
export const CARD_H = 0.62

/** Where the card goes when you move on to the desk: up, back and tilted away. */
const GONE_OFFSET = new Vector3(0, 0.95, -2.2)
const GONE_TILT = -0.75

function useScreenSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function AppCard({
  shellHost,
  gone,
  dark,
}: {
  /** The element the 2D app is rendered into; it's moved onto this card. */
  shellHost: HTMLElement
  /** True while the card is away (3D desk view) or flying away. */
  gone: boolean
  dark: boolean
}) {
  const screen = useScreenSize()
  const width = (CARD_H * screen.w) / screen.h
  const slot = useRef<HTMLDivElement>(null)
  const group = useRef<Group>(null)
  const progress = useRef(gone ? 1 : 0) // 0 = at rest in front of the desk, 1 = gone

  // drei renders the card's HTML in its own React root, so attach the app when that element actually appears.
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      slot.current = el
      if (el && shellHost.parentElement !== el) el.appendChild(shellHost)
    },
    [shellHost],
  )

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    // Ease between resting and gone at roughly the same pace as the camera move (~1.2 s).
    const target = gone ? 1 : 0
    const step = Math.min(1, dt / 1.2)
    progress.current += Math.sign(target - progress.current) * Math.min(step, Math.abs(target - progress.current))
    const e = ease(progress.current)
    g.position.copy(CARD_POS).addScaledVector(GONE_OFFSET, e)
    g.rotation.x = GONE_TILT * e
    const el = slot.current
    if (el) {
      el.style.opacity = String(1 - Math.min(1, e * 1.3))
      el.style.visibility = e >= 0.999 ? 'hidden' : 'visible'
    }
  })

  return (
    <group ref={group} position={CARD_POS}>
      {/* The physical card behind the app: thickness, rounded edges, and a shadow on the desk. */}
      <RoundedBox args={[width + 0.024, CARD_H + 0.024, 0.018]} radius={0.012} smoothness={4} position={[0, 0, -0.011]} castShadow>
        <meshStandardMaterial color={dark ? '#2c2e33' : '#f8f9fa'} roughness={0.35} metalness={0.1} />
      </RoundedBox>
      <Html
        transform
        center
        // Maps the card's pixel size to CARD_H world units (drei renders 400 / distanceFactor px per unit).
        distanceFactor={(400 * CARD_H) / screen.h}
        zIndexRange={[50, 0]}
      >
        <div
          ref={attach}
          className="desk-card"
          style={{
            width: screen.w,
            height: screen.h,
            borderRadius: 18,
            overflow: 'hidden',
            backfaceVisibility: 'hidden',
            // Makes the card the containing block for the app's fixed header/sidebar, so they stay clipped to it.
            transform: 'translateZ(0)',
            background: 'var(--mantine-color-body)',
          }}
        />
      </Html>
    </group>
  )
}
