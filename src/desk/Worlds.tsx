import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { ContactShadows, Grid, Sparkles } from '@react-three/drei'
import { Color, Fog, type Group } from 'three'

// Two worlds share one scene:
// - the empty space where the 2D app card floats (2D in 3D), and
// - the room with the desk (3D).
// Moving between them, the room rises up and assembles around the camera, or sinks away again.

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const DURATION = 1.25 // seconds, matching the camera move

/** 0 = empty space, 1 = room, eased over the transition. */
function useRoomProgress(shown: boolean) {
  const p = useRef(shown ? 1 : 0)
  useFrame((_, dt) => {
    const target = shown ? 1 : 0
    const step = Math.min(dt / DURATION, Math.abs(target - p.current))
    p.current += Math.sign(target - p.current) * step
  })
  return p
}

export function Worlds({ roomShown, dark, room }: { roomShown: boolean; dark: boolean; room: ReactNode }) {
  const p = useRoomProgress(roomShown)
  const roomGroup = useRef<Group>(null)
  const spaceGroup = useRef<Group>(null)
  const colors = useMemo(
    () => ({ space: new Color(dark ? '#0e1018' : '#1c2033'), room: new Color(dark ? '#16171a' : '#e9e3d8') }),
    [dark],
  )

  useFrame(({ scene }) => {
    const e = ease(p.current)
    const g = roomGroup.current
    if (g) {
      // Rise from below and grow into place.
      g.visible = e > 0.001
      g.position.y = -2.2 * (1 - e)
      g.scale.setScalar(0.55 + 0.45 * e)
    }
    if (spaceGroup.current) spaceGroup.current.visible = e < 0.999
    if (!(scene.background instanceof Color)) scene.background = new Color()
    scene.background.copy(colors.space).lerp(colors.room, e)
    if (!(scene.fog instanceof Fog)) scene.fog = new Fog(0x000000, 5, 11)
    scene.fog.color.copy(scene.background)
    // The room uses fog for depth; the empty space stays clear.
    scene.fog.near = 5 + (1 - e) * 40
    scene.fog.far = 11 + (1 - e) * 60
  })

  return (
    <>
      <group ref={spaceGroup}>
        <Grid
          position={[0, 0, 0]}
          args={[30, 30]}
          cellSize={0.25}
          cellThickness={0.6}
          cellColor="#3b4a7a"
          sectionSize={1.5}
          sectionThickness={1}
          sectionColor="#5c7cfa"
          fadeDistance={14}
          fadeStrength={1.5}
          infiniteGrid
        />
        <Sparkles count={70} scale={[7, 3, 5]} position={[0, 1.6, -1]} size={2.2} speed={0.25} opacity={0.6} color="#91a7ff" />
        <ContactShadows position={[0, 0.002, 0.05]} opacity={0.55} scale={4} blur={2.8} far={1.8} resolution={512} color="#000000" />
      </group>
      <group ref={roomGroup}>{room}</group>
    </>
  )
}
