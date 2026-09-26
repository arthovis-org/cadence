import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox, Text, useCursor } from '@react-three/drei'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import regularFont from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url'
import boldFont from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url'

// Scene units are roughly meters. The desk top surface sits at DESK_Y.
export const DESK_Y = 0.75
const HALF_PI = Math.PI / 2
const TAU = Math.PI * 2

/** Readable text color on top of a background color. */
function textOn(hex: string): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#212529' : '#ffffff'
}

export function Label({ children, bold, ...props }: { children: ReactNode; bold?: boolean } & Omit<React.ComponentProps<typeof Text>, 'children'>) {
  return (
    <Text font={bold ? boldFont : regularFont} anchorX="center" anchorY="middle" {...props}>
      {children}
    </Text>
  )
}

/** Hover state + pointer cursor for clickable objects. */
function useHover(onChange?: (hovered: boolean) => void) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  return {
    hovered,
    bind: {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        setHovered(true)
        onChange?.(true)
      },
      onPointerOut: () => {
        setHovered(false)
        onChange?.(false)
      },
    },
  }
}

/** Ease a group's local position toward a target every frame. */
function useEase(target: [number, number, number], speed = 10) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const k = Math.min(1, dt * speed)
    g.position.x += (target[0] - g.position.x) * k
    g.position.y += (target[1] - g.position.y) * k
    g.position.z += (target[2] - g.position.z) * k
  })
  return ref
}

function click(fn: () => void) {
  return (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    fn()
  }
}

// ---------------------------------------------------------------------------
// Room: floor, rug, wall, desk, decor
// ---------------------------------------------------------------------------

export function Room({ dark }: { dark: boolean }) {
  const wood = dark ? '#5e4332' : '#9c6b47'
  const metal = dark ? '#2c2e33' : '#3b3e45'
  return (
    <group>
      <mesh rotation={[-HALF_PI, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color={dark ? '#1b1c1f' : '#cfc6b8'} roughness={0.9} />
      </mesh>
      {/* Rug */}
      <mesh rotation={[-HALF_PI, 0, 0]} position={[0, 0.003, 0.25]} receiveShadow>
        <circleGeometry args={[1.9, 64]} />
        <meshStandardMaterial color={dark ? '#2f3a4a' : '#8fa3bf'} roughness={1} />
      </mesh>
      <mesh rotation={[-HALF_PI, 0, 0]} position={[0, 0.004, 0.25]}>
        <ringGeometry args={[1.72, 1.78, 64]} />
        <meshStandardMaterial color={dark ? '#44546a' : '#dfe6ef'} roughness={1} />
      </mesh>
      {/* Wall with a darker lower band and a baseboard */}
      <mesh position={[0, 3, -0.8]} receiveShadow>
        <planeGeometry args={[14, 6]} />
        <meshStandardMaterial color={dark ? '#2a2c31' : '#efe9df'} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.45, -0.795]} receiveShadow>
        <planeGeometry args={[14, 0.9]} />
        <meshStandardMaterial color={dark ? '#23252a' : '#d9cfc0'} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.05, -0.79]}>
        <boxGeometry args={[14, 0.1, 0.02]} />
        <meshStandardMaterial color={dark ? '#1d1e22' : '#f8f5ef'} />
      </mesh>

      {/* Desk */}
      <RoundedBox args={[2.9, 0.06, 1.4]} radius={0.025} smoothness={4} position={[0, DESK_Y - 0.03, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={wood} roughness={0.55} />
      </RoundedBox>
      {[-1.32, 1.32].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {[-0.58, 0.58].map((z) => (
            <mesh key={z} position={[0, (DESK_Y - 0.06) / 2, z]} castShadow>
              <boxGeometry args={[0.05, DESK_Y - 0.06, 0.05]} />
              <meshStandardMaterial color={metal} metalness={0.6} roughness={0.35} />
            </mesh>
          ))}
          <mesh position={[0, 0.08, 0]} castShadow>
            <boxGeometry args={[0.04, 0.04, 1.2]} />
            <meshStandardMaterial color={metal} metalness={0.6} roughness={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function Plant() {
  const leaves = [
    [0, 0.26, 0, 0, 0],
    [0.05, 0.22, 0.02, 0.5, 0.4],
    [-0.05, 0.23, -0.01, -0.5, 1.6],
    [0.02, 0.2, -0.05, 0.45, 2.6],
    [-0.03, 0.19, 0.05, -0.4, 4],
    [0.04, 0.29, -0.02, 0.25, 5.2],
  ]
  return (
    <group position={[-1.22, DESK_Y, -0.5]}>
      <mesh position={[0, 0.075, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.065, 0.15, 32]} />
        <meshStandardMaterial color="#c9744a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.148, 0]}>
        <cylinderGeometry args={[0.078, 0.078, 0.01, 32]} />
        <meshStandardMaterial color="#4a3526" roughness={1} />
      </mesh>
      {leaves.map(([x, y, z, tilt, turn], i) => (
        <group key={i} position={[x, y, z]} rotation={[0, turn, tilt]}>
          <mesh castShadow scale={[0.035, 0.13, 0.012]} position={[0, 0.06, 0]}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color={i % 2 ? '#2f9e44' : '#37b24d'} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function Lamp({ dark }: { dark: boolean }) {
  return (
    <group position={[1.2, DESK_Y, -0.48]} rotation={[0, -0.6, 0]}>
      <mesh position={[0, 0.012, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.1, 0.024, 32]} />
        <meshStandardMaterial color="#212529" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0.12]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.38, 12]} />
        <meshStandardMaterial color="#212529" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0.1, 0.39, 0]} rotation={[0, 0, -1.1]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.26, 12]} />
        <meshStandardMaterial color="#212529" metalness={0.5} roughness={0.35} />
      </mesh>
      <group position={[0.21, 0.43, 0]} rotation={[0, 0, -0.5]}>
        <mesh castShadow>
          <coneGeometry args={[0.09, 0.13, 32, 1, true]} />
          <meshStandardMaterial color="#f08c00" side={2} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.04, 0]}>
          <sphereGeometry args={[0.03, 16, 16]} />
          <meshStandardMaterial color="#fff3bf" emissive="#ffe066" emissiveIntensity={dark ? 3 : 1.5} />
        </mesh>
        <pointLight position={[0, -0.1, 0]} intensity={dark ? 2.2 : 0.8} distance={1.6} color="#ffd8a8" />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Desk calendar: this week at a glance
// ---------------------------------------------------------------------------

export interface WeekData {
  hours: string
  amount: string
  bars: { label: string; value: number; today: boolean }[]
  top: { name: string; color: string; hours: string; share: number }[]
}

const CAL_W = 0.96
const CAL_H = 0.5
const CAL_TILT = 0.2

export function WeekCalendar({ data, onClick }: { data: WeekData; onClick: () => void }) {
  const { hovered, bind } = useHover()
  const lift = useEase([0, hovered ? 0.012 : 0, 0])
  const max = Math.max(1, ...data.bars.map((b) => b.value))
  const L = -CAL_W / 2 + 0.05
  return (
    <group position={[-0.02, DESK_Y, -0.36]} onClick={click(onClick)} {...bind}>
      <group ref={lift}>
        {/* Back leg of the tent-style stand */}
        <mesh position={[0, CAL_H / 2 - 0.02, -0.12]} rotation={[-0.32, 0, 0]} castShadow>
          <boxGeometry args={[CAL_W - 0.1, CAL_H, 0.01]} />
          <meshStandardMaterial color="#343a40" roughness={0.6} />
        </mesh>
        <group rotation={[-CAL_TILT, 0, 0]}>
          {/* Board and paper */}
          <RoundedBox args={[CAL_W, CAL_H, 0.014]} radius={0.006} smoothness={3} position={[0, CAL_H / 2, 0]} castShadow>
            <meshStandardMaterial color="#343a40" roughness={0.6} />
          </RoundedBox>
          <mesh position={[0, CAL_H / 2 - 0.015, 0.0075]}>
            <planeGeometry args={[CAL_W - 0.03, CAL_H - 0.06]} />
            <meshStandardMaterial color={hovered ? '#ffffff' : '#fbfaf7'} roughness={0.9} />
          </mesh>
          {/* Spiral binding */}
          {Array.from({ length: 16 }, (_, i) => (
            <mesh key={i} position={[-CAL_W / 2 + 0.06 + i * ((CAL_W - 0.12) / 15), CAL_H - 0.02, 0.008]} rotation={[0, HALF_PI, 0]}>
              <torusGeometry args={[0.012, 0.0025, 8, 16]} />
              <meshStandardMaterial color="#adb5bd" metalness={0.8} roughness={0.25} />
            </mesh>
          ))}
          <group position={[0, CAL_H / 2 - 0.015, 0.009]}>
            <Label position={[L, 0.17, 0]} fontSize={0.019} color="#4c6ef5" anchorX="left" bold letterSpacing={0.08}>
              THIS WEEK
            </Label>
            <Label position={[-L, 0.17, 0]} fontSize={0.015} color={hovered ? '#4c6ef5' : '#adb5bd'} anchorX="right">
              Open reports ↗
            </Label>
            <Label position={[L, 0.11, 0]} fontSize={0.07} color="#212529" anchorX="left" bold>
              {data.hours}
            </Label>
            <Label position={[L, 0.055, 0]} fontSize={0.021} color="#2f9e44" anchorX="left" bold>
              {`${data.amount} billable`}
            </Label>
            {data.bars.map((b, i) => {
              const h = Math.max(0.004, (b.value / max) * 0.14)
              const x = L + 0.025 + i * 0.056
              return (
                <group key={b.label}>
                  <mesh position={[x, -0.16 + h / 2, 0]}>
                    <planeGeometry args={[0.034, h]} />
                    <meshBasicMaterial color={b.today ? '#4c6ef5' : '#91a7ff'} />
                  </mesh>
                  {b.value > 0 && (
                    <Label position={[x, -0.15 + h, 0]} fontSize={0.011} color="#868e96">
                      {b.value.toFixed(1)}
                    </Label>
                  )}
                  <Label position={[x, -0.18, 0]} fontSize={0.013} color={b.today ? '#212529' : '#868e96'} bold={b.today}>
                    {b.label}
                  </Label>
                </group>
              )
            })}
            <mesh position={[0.03, -0.02, 0]}>
              <planeGeometry args={[0.002, 0.34]} />
              <meshBasicMaterial color="#e9ecef" />
            </mesh>
            <Label position={[0.07, 0.11, 0]} fontSize={0.015} color="#868e96" anchorX="left" bold letterSpacing={0.06}>
              TOP PROJECTS
            </Label>
            {data.top.map((p, i) => (
              <group key={p.name} position={[0.07, 0.065 - i * 0.065, 0]}>
                <Label position={[0, 0.01, 0]} fontSize={0.016} color="#343a40" anchorX="left">
                  {p.name.length > 30 ? `${p.name.slice(0, 29)}…` : p.name}
                </Label>
                <Label position={[0.35, 0.01, 0]} fontSize={0.016} color="#212529" anchorX="right" bold>
                  {p.hours}
                </Label>
                <mesh position={[0.175, -0.014, 0]}>
                  <planeGeometry args={[0.35, 0.009]} />
                  <meshBasicMaterial color="#f1f3f5" />
                </mesh>
                <mesh position={[0.175 * p.share, -0.014, 0.0005]}>
                  <planeGeometry args={[Math.max(0.004, 0.35 * p.share), 0.009]} />
                  <meshBasicMaterial color={p.color} />
                </mesh>
              </group>
            ))}
            {data.top.length === 0 && (
              <Label position={[0.24, 0.02, 0]} fontSize={0.015} color="#adb5bd">
                Nothing tracked yet this week
              </Label>
            )}
          </group>
        </group>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Notepad on a small stand: today
// ---------------------------------------------------------------------------

export interface TodayLine {
  key: string
  time: string
  text: string
  duration: string
  color: string
  running: boolean
}

const PAD_W = 0.56
const PAD_H = 0.4

export function TodayNotepad({
  lines,
  total,
  running,
  onClick,
}: {
  lines: TodayLine[]
  total: string
  running: { elapsed: string; label: string } | null
  onClick: () => void
}) {
  const { hovered, bind } = useHover()
  const lift = useEase([0, hovered ? 0.01 : 0, 0])
  const dot = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (dot.current) dot.current.scale.setScalar(0.8 + Math.sin(clock.elapsedTime * 4) * 0.2)
  })
  const done = lines.filter((l) => !l.running)
  const L = -PAD_W / 2 + 0.04
  return (
    <group position={[0.06, DESK_Y, 0.2]} rotation={[0, -0.06, 0]} onClick={click(onClick)} {...bind}>
      <group ref={lift}>
        {/* Wedge stand */}
        <mesh position={[0, 0.03, -0.1]} rotation={[0.9, 0, 0]} castShadow>
          <boxGeometry args={[PAD_W - 0.1, 0.012, 0.16]} />
          <meshStandardMaterial color="#495057" roughness={0.5} />
        </mesh>
        <group position={[0, 0.012, 0.06]} rotation={[-HALF_PI + 0.55, 0, 0]}>
          <RoundedBox args={[PAD_W, PAD_H, 0.012]} radius={0.006} smoothness={3} position={[0, PAD_H / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#6b4f3a" roughness={0.7} />
          </RoundedBox>
          <mesh position={[0, PAD_H / 2 - 0.01, 0.0065]}>
            <planeGeometry args={[PAD_W - 0.03, PAD_H - 0.04]} />
            <meshStandardMaterial color={hovered ? '#ffffff' : '#fffdf6'} roughness={0.95} />
          </mesh>
          {/* Clip */}
          <RoundedBox args={[0.16, 0.035, 0.018]} radius={0.006} position={[0, PAD_H - 0.012, 0.012]}>
            <meshStandardMaterial color="#adb5bd" metalness={0.8} roughness={0.25} />
          </RoundedBox>
          <group position={[0, PAD_H / 2 - 0.02, 0.008]}>
            <Label position={[L, 0.125, 0]} fontSize={0.022} color="#212529" anchorX="left" bold>
              Today
            </Label>
            <Label position={[-L, 0.125, 0]} fontSize={0.022} color="#212529" anchorX="right" bold>
              {total}
            </Label>
            {running ? (
              <group position={[L, 0.085, 0]}>
                <mesh ref={dot} position={[0.008, 0, 0]}>
                  <circleGeometry args={[0.008, 20]} />
                  <meshBasicMaterial color="#e03131" />
                </mesh>
                <Label position={[0.024, 0, 0]} fontSize={0.02} color="#e03131" anchorX="left" bold>
                  {running.elapsed}
                </Label>
                <Label position={[0.13, 0, 0]} fontSize={0.015} color="#495057" anchorX="left">
                  {running.label.length > 38 ? `${running.label.slice(0, 37)}…` : running.label}
                </Label>
              </group>
            ) : (
              <Label position={[L, 0.085, 0]} fontSize={0.015} color="#adb5bd" anchorX="left">
                No timer running
              </Label>
            )}
            {/* Ruled lines */}
            {Array.from({ length: 6 }, (_, i) => (
              <mesh key={i} position={[0, 0.043 - i * 0.034 - 0.016, -0.0005]}>
                <planeGeometry args={[PAD_W - 0.06, 0.0015]} />
                <meshBasicMaterial color="#d0ebff" />
              </mesh>
            ))}
            {done.slice(0, 6).map((l, i) => (
              <group key={l.key} position={[0, 0.043 - i * 0.034, 0]}>
                <mesh position={[L + 0.005, 0, 0]}>
                  <circleGeometry args={[0.005, 12]} />
                  <meshBasicMaterial color={l.color} />
                </mesh>
                <Label position={[L + 0.018, 0, 0]} fontSize={0.014} color="#868e96" anchorX="left">
                  {l.time}
                </Label>
                <Label position={[L + 0.075, 0, 0]} fontSize={0.015} color="#343a40" anchorX="left">
                  {l.text}
                </Label>
                <Label position={[-L, 0, 0]} fontSize={0.015} color="#212529" anchorX="right" bold>
                  {l.duration}
                </Label>
              </group>
            ))}
            {done.length === 0 && (
              <Label position={[0, 0, 0]} fontSize={0.015} color="#adb5bd">
                Nothing logged yet today
              </Label>
            )}
            <Label position={[0, -0.165, 0]} fontSize={0.014} color={hovered ? '#4c6ef5' : '#adb5bd'}>
              + Click to add time manually
            </Label>
          </group>
        </group>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Stopwatch: start / stop the timer
// ---------------------------------------------------------------------------

export function Stopwatch({ running, seconds, label, onToggle }: { running: boolean; seconds: number; label: string; onToggle: () => void }) {
  const { hovered, bind } = useHover()
  const body = useRef<MeshStandardMaterial>(null)
  const button = useRef<Mesh>(null)

  useFrame(({ clock }, dt) => {
    if (body.current) {
      const glow = running ? 0.3 + Math.sin(clock.elapsedTime * 3) * 0.15 : hovered ? 0.2 : 0
      body.current.emissiveIntensity += (glow - body.current.emissiveIntensity) * Math.min(1, dt * 8)
    }
    if (button.current) button.current.position.y += (0.3 - button.current.position.y) * Math.min(1, dt * 12)
  })

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const digital = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  const R = 0.13
  const cy = 0.155

  return (
    <group
      position={[0.98, DESK_Y, 0.2]}
      rotation={[0, -0.5, 0]}
      onClick={(e) => {
        e.stopPropagation()
        if (button.current) button.current.position.y = 0.285 // press animation
        onToggle()
      }}
      {...bind}
    >
      <RoundedBox args={[0.16, 0.022, 0.09]} radius={0.008} position={[0, 0.011, 0]} castShadow>
        <meshStandardMaterial color="#343a40" metalness={0.4} roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, cy, 0]} rotation={[HALF_PI, 0, 0]} castShadow>
        <cylinderGeometry args={[R, R, 0.05, 64]} />
        <meshStandardMaterial ref={body} color={running ? '#e03131' : '#4c6ef5'} emissive={running ? '#ff6b6b' : '#748ffc'} emissiveIntensity={0} metalness={0.35} roughness={0.3} />
      </mesh>
      <mesh position={[0, cy, 0.026]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[R - 0.015, R - 0.015, 0.003, 64]} />
        <meshStandardMaterial color="#f8f9fa" roughness={0.3} />
      </mesh>
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i / 60) * TAU
        const major = i % 5 === 0
        return (
          <mesh key={i} position={[Math.sin(a) * (R - 0.028), cy + Math.cos(a) * (R - 0.028), 0.029]} rotation={[0, 0, -a]}>
            <boxGeometry args={[major ? 0.004 : 0.002, major ? 0.016 : 0.007, 0.001]} />
            <meshBasicMaterial color={major ? '#343a40' : '#adb5bd'} />
          </mesh>
        )
      })}
      <group position={[0, cy, 0.031]} rotation={[0, 0, -((seconds % 60) / 60) * TAU]}>
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.003, 0.1, 0.001]} />
          <meshBasicMaterial color="#e03131" />
        </mesh>
      </group>
      <group position={[0, cy, 0.0305]} rotation={[0, 0, -((seconds % 3600) / 3600) * TAU]}>
        <mesh position={[0, 0.028, 0]}>
          <boxGeometry args={[0.006, 0.06, 0.001]} />
          <meshBasicMaterial color="#212529" />
        </mesh>
      </group>
      <mesh position={[0, cy, 0.032]}>
        <sphereGeometry args={[0.007, 12, 12]} />
        <meshStandardMaterial color="#212529" />
      </mesh>
      <Label position={[0, cy - 0.05, 0.03]} fontSize={0.021} color="#212529" bold>
        {digital}
      </Label>
      <mesh position={[0, cy + R + 0.012, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, 0.03, 16]} />
        <meshStandardMaterial color="#adb5bd" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh ref={button} position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.016, 24]} />
        <meshStandardMaterial color={running ? '#c92a2a' : '#364fc7'} metalness={0.3} roughness={0.3} />
      </mesh>
      <Label position={[0, 0.36, 0]} fontSize={0.022} color={running ? '#e03131' : hovered ? '#4c6ef5' : '#495057'} maxWidth={0.5} textAlign="center" bold>
        {running ? '● Recording' : hovered ? 'Click to start' : 'Timer'}
      </Label>
      <Label position={[0, 0.332, 0]} fontSize={0.015} color="#868e96" maxWidth={0.6} textAlign="center">
        {label}
      </Label>
    </group>
  )
}

// ---------------------------------------------------------------------------
// File organizer: one folder per project, stepped front to back
// ---------------------------------------------------------------------------

export interface FolderItem {
  id: string
  name: string
  color: string
  sub?: string
}

const FOLDER_W = 0.3
const FOLDER_H = 0.22
const SLOT_DEPTH = 0.052
const SLOT_RISE = 0.034
export const MAX_FOLDERS = 8

function Folder({
  item,
  slot,
  selected,
  onSelect,
  onHover,
}: {
  item: FolderItem
  slot: number
  selected: boolean
  onSelect: (id: string) => void
  onHover: (hovered: boolean) => void
}) {
  const { hovered, bind } = useHover(onHover)
  const baseY = slot * SLOT_RISE
  const ref = useEase([0, baseY + (selected ? 0.12 : hovered ? 0.05 : 0), 0])
  const fg = textOn(item.color)
  const tabX = -FOLDER_W / 2 + 0.05 + (slot % 3) * 0.09
  return (
    <group position={[0, 0, -slot * SLOT_DEPTH]}>
      <group ref={ref} position={[0, baseY, 0]} onClick={click(() => onSelect(item.id))} {...bind}>
        <mesh position={[0, FOLDER_H / 2 + 0.01, -0.004]} castShadow>
          <boxGeometry args={[FOLDER_W - 0.03, FOLDER_H, 0.004]} />
          <meshStandardMaterial color="#fdfdfd" />
        </mesh>
        <RoundedBox args={[FOLDER_W, FOLDER_H, 0.008]} radius={0.003} smoothness={2} position={[0, FOLDER_H / 2, 0.002]} castShadow>
          <meshStandardMaterial color={item.color} emissive={item.color} emissiveIntensity={selected ? 0.4 : hovered ? 0.18 : 0} roughness={0.55} />
        </RoundedBox>
        <RoundedBox args={[0.1, 0.03, 0.008]} radius={0.004} smoothness={2} position={[tabX, FOLDER_H + 0.01, 0.002]}>
          <meshStandardMaterial color={item.color} emissive={item.color} emissiveIntensity={selected ? 0.4 : 0} roughness={0.55} />
        </RoundedBox>
        <Label position={[0, FOLDER_H - 0.022, 0.0075]} fontSize={0.018} color={fg} maxWidth={FOLDER_W - 0.03} textAlign="center" bold>
          {item.name.length > 30 ? `${item.name.slice(0, 29)}…` : item.name}
        </Label>
        {item.sub && (
          <Label position={[0, FOLDER_H - 0.045, 0.0075]} fontSize={0.013} color={fg} fillOpacity={0.8} maxWidth={FOLDER_W - 0.03}>
            {item.sub}
          </Label>
        )}
      </group>
    </group>
  )
}

export function FileOrganizer({
  items,
  selectedId,
  onSelect,
  onCreate,
}: {
  items: FolderItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
}) {
  const shown = items.slice(0, MAX_FOLDERS)
  const slots = Math.max(3, shown.length)
  const depth = slots * SLOT_DEPTH + 0.03
  const [active, setActive] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)
  // Keep the "+" visible while the pointer is anywhere on the organizer, and briefly after it leaves.
  const hover = (on: boolean) => {
    window.clearTimeout(hideTimer.current)
    if (on) setActive(true)
    else hideTimer.current = window.setTimeout(() => setActive(false), 900)
  }
  const plus = useHover(hover)
  const plusRef = useEase([FOLDER_W / 2 + 0.075, active ? 0.2 : 0.1, 0.02])
  const plusScale = useRef<Group>(null)
  useFrame((_, dt) => {
    if (plusScale.current) {
      const t = active ? (plus.hovered ? 1.15 : 1) : 0.001
      const s = plusScale.current.scale.x + (t - plusScale.current.scale.x) * Math.min(1, dt * 12)
      plusScale.current.scale.setScalar(s)
    }
  })
  useEffect(() => () => window.clearTimeout(hideTimer.current), [])
  const bodyHover = { onPointerOver: () => hover(true), onPointerOut: () => hover(false) }

  return (
    <group position={[-1.08, DESK_Y, -0.16]} rotation={[0, 0.45, 0]}>
      {/* Stepped organizer body */}
      {Array.from({ length: slots }, (_, i) => (
        <mesh key={i} position={[0, 0.01 + (i * SLOT_RISE) / 2, -i * SLOT_DEPTH - 0.005]} castShadow receiveShadow {...bodyHover}>
          <boxGeometry args={[FOLDER_W + 0.04, 0.02 + i * SLOT_RISE, SLOT_DEPTH]} />
          <meshStandardMaterial color="#2b2d31" metalness={0.4} roughness={0.45} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (FOLDER_W / 2 + 0.022), 0.06 + (slots * SLOT_RISE) / 2, -depth / 2 + 0.025]} castShadow>
          <boxGeometry args={[0.006, 0.12 + slots * SLOT_RISE, depth]} />
          <meshStandardMaterial color="#343a40" metalness={0.4} roughness={0.45} />
        </mesh>
      ))}
      <group position={[0, 0.02, 0]}>
        {shown.map((item, i) => (
          <Folder key={item.id} item={item} slot={i} selected={item.id === selectedId} onSelect={onSelect} onHover={hover} />
        ))}
      </group>
      {items.length === 0 && (
        <Label position={[0, 0.16, 0.02]} fontSize={0.02} color="#868e96">
          No projects yet
        </Label>
      )}
      {items.length > MAX_FOLDERS && (
        <Label position={[0, 0.035, 0.03]} rotation={[-0.4, 0, 0]} fontSize={0.016} color="#adb5bd">
          +{items.length - MAX_FOLDERS} more in 2D
        </Label>
      )}

      {/* "+" new project button */}
      <group ref={plusRef} position={[FOLDER_W / 2 + 0.075, 0.1, 0.02]} rotation={[0, -0.25, 0]}>
        <group ref={plusScale} scale={0.001} onClick={click(onCreate)} {...plus.bind}>
          <mesh rotation={[HALF_PI, 0, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.016, 40]} />
            <meshStandardMaterial color={plus.hovered ? '#5c7cfa' : '#4c6ef5'} emissive="#4c6ef5" emissiveIntensity={plus.hovered ? 0.5 : 0.2} />
          </mesh>
          <mesh position={[0, 0, 0.008]}>
            <boxGeometry args={[0.05, 0.011, 0.002]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, 0, 0.008]}>
            <boxGeometry args={[0.011, 0.05, 0.002]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <Label position={[0, -0.072, 0]} fontSize={0.019} color="#4c6ef5" bold>
            New project
          </Label>
        </group>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Sticky notes: tasks of the selected project
// ---------------------------------------------------------------------------

export interface NoteItem {
  id: string
  name: string
}

const NOTE = 0.13
const PER_ROW = 4

function Note({
  label,
  position,
  tilt,
  selected,
  add,
  onClick,
}: {
  label: string
  position: [number, number]
  tilt: number
  selected?: boolean
  add?: boolean
  onClick: () => void
}) {
  const { hovered, bind } = useHover()
  const ref = useEase([0, selected ? 0.03 : hovered ? 0.012 : 0, 0])
  const color = add ? (hovered ? '#d0ebff' : '#e7f5ff') : selected ? '#ffa94d' : hovered ? '#ffec99' : '#ffe066'
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, tilt, 0]}>
      <group ref={ref} onClick={click(onClick)} {...bind}>
        <mesh position={[0, 0.002, 0]} castShadow receiveShadow>
          <boxGeometry args={[NOTE, 0.003, NOTE]} />
          <meshStandardMaterial color={color} emissive={selected ? '#ff922b' : '#000000'} emissiveIntensity={selected ? 0.3 : 0} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.0036, -NOTE / 2 + 0.012]}>
          <boxGeometry args={[NOTE, 0.0004, 0.024]} />
          <meshStandardMaterial color={add ? '#a5d8ff' : '#fcc419'} roughness={0.8} />
        </mesh>
        <Label
          position={[0, 0.0045, 0.006]}
          rotation={[-HALF_PI, 0, 0]}
          fontSize={add ? 0.016 : 0.017}
          color={add ? '#1971c2' : '#5c4813'}
          maxWidth={NOTE - 0.02}
          textAlign="center"
          lineHeight={1.15}
          bold={add}
        >
          {label}
        </Label>
      </group>
    </group>
  )
}

export function StickyNotes({
  items,
  selectedId,
  onSelect,
  onAdd,
  projectName,
}: {
  items: NoteItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  projectName: string | null
}) {
  if (!projectName) return null
  const shown = items.slice(0, 7)
  const cells = [...shown.map((t) => ({ t })), { t: null as NoteItem | null }]
  return (
    <group position={[-0.98, DESK_Y, 0.06]} rotation={[0, 0.1, 0]}>
      <Label position={[-NOTE / 2, 0.002, -0.1]} rotation={[-HALF_PI, 0, 0]} fontSize={0.019} color="#343a40" anchorX="left" bold>
        {`Tasks · ${projectName.length > 28 ? `${projectName.slice(0, 27)}…` : projectName}`}
      </Label>
      {cells.map(({ t }, i) => (
        <Note
          key={t?.id ?? 'add'}
          label={t ? t.name : '+ New task'}
          add={!t}
          position={[(i % PER_ROW) * (NOTE + 0.03), Math.floor(i / PER_ROW) * (NOTE + 0.025)]}
          tilt={t ? ((i * 37) % 11) / 100 - 0.05 : 0}
          selected={!!t && t.id === selectedId}
          onClick={() => (t ? onSelect(t.id) : onAdd())}
        />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Wall: analog clock and invoice pinboard
// ---------------------------------------------------------------------------

export function WallClock({ dark }: { dark: boolean }) {
  const hour = useRef<Group>(null)
  const minute = useRef<Group>(null)
  const second = useRef<Group>(null)
  useFrame(() => {
    const d = new Date()
    const s = d.getSeconds() + d.getMilliseconds() / 1000
    const m = d.getMinutes() + s / 60
    const h = (d.getHours() % 12) + m / 60
    if (second.current) second.current.rotation.z = -(s / 60) * TAU
    if (minute.current) minute.current.rotation.z = -(m / 60) * TAU
    if (hour.current) hour.current.rotation.z = -(h / 12) * TAU
  })
  const R = 0.19
  return (
    <group position={[0.78, 1.78, -0.775]}>
      <mesh rotation={[HALF_PI, 0, 0]} castShadow>
        <cylinderGeometry args={[R + 0.018, R + 0.018, 0.035, 64]} />
        <meshStandardMaterial color={dark ? '#adb5bd' : '#212529'} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.018]}>
        <circleGeometry args={[R, 64]} />
        <meshStandardMaterial color="#fcfcfc" roughness={0.4} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * TAU
        return (
          <group key={i}>
            <mesh position={[Math.sin(a) * (R - 0.02), Math.cos(a) * (R - 0.02), 0.019]} rotation={[0, 0, -a]}>
              <boxGeometry args={[i % 3 === 0 ? 0.008 : 0.004, i % 3 === 0 ? 0.03 : 0.016, 0.001]} />
              <meshBasicMaterial color="#343a40" />
            </mesh>
            {i % 3 === 0 && (
              <Label position={[Math.sin(a) * (R - 0.058), Math.cos(a) * (R - 0.058), 0.02]} fontSize={0.028} color="#343a40" bold>
                {String(i === 0 ? 12 : i)}
              </Label>
            )}
          </group>
        )
      })}
      <group ref={hour} position={[0, 0, 0.021]}>
        <mesh position={[0, 0.045, 0]}>
          <boxGeometry args={[0.012, 0.1, 0.002]} />
          <meshBasicMaterial color="#212529" />
        </mesh>
      </group>
      <group ref={minute} position={[0, 0, 0.023]}>
        <mesh position={[0, 0.065, 0]}>
          <boxGeometry args={[0.008, 0.145, 0.002]} />
          <meshBasicMaterial color="#212529" />
        </mesh>
      </group>
      <group ref={second} position={[0, 0, 0.025]}>
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[0.003, 0.16, 0.001]} />
          <meshBasicMaterial color="#e03131" />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.027]}>
        <circleGeometry args={[0.01, 20]} />
        <meshBasicMaterial color="#e03131" />
      </mesh>
    </group>
  )
}

export interface PinItem {
  id: string
  number: string
  client: string
  amount: string
  status: string
  color: string
}

const PIN_W = 0.13
const PIN_H = 0.17

function PinCard({
  position,
  tilt,
  onClick,
  children,
}: {
  position: [number, number]
  tilt: number
  onClick: () => void
  children: (hovered: boolean) => ReactNode
}) {
  const { hovered, bind } = useHover()
  const ref = useEase([0, hovered ? 0.01 : 0, hovered ? 0.03 : 0])
  return (
    <group position={[position[0], position[1], 0.02]} rotation={[0, 0, hovered ? 0 : tilt]}>
      <group ref={ref} onClick={click(onClick)} {...bind}>
        {children(hovered)}
      </group>
    </group>
  )
}

export function Pinboard({ items, onOpen, onNew }: { items: PinItem[]; onOpen: (id: string) => void; onNew: () => void }) {
  const shown = items.slice(0, 5)
  const W = 1.05
  const H = 0.48
  const start = -W / 2 + 0.11
  return (
    <group position={[-0.42, 1.74, -0.78]}>
      <RoundedBox args={[W + 0.05, H + 0.05, 0.03]} radius={0.01} castShadow>
        <meshStandardMaterial color="#6b4f3a" roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 0, 0.016]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#c9a46c" roughness={1} />
      </mesh>
      <Label position={[-W / 2 + 0.03, H / 2 - 0.035, 0.02]} fontSize={0.022} color="#5c3d1e" anchorX="left" bold letterSpacing={0.06}>
        INVOICES
      </Label>
      {shown.map((item, i) => (
        <PinCard key={item.id} position={[start + i * 0.17, -0.025]} tilt={((i * 53) % 9) / 100 - 0.04} onClick={() => onOpen(item.id)}>
          {() => (
            <>
              <mesh castShadow>
                <boxGeometry args={[PIN_W, PIN_H, 0.003]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <mesh position={[0, PIN_H / 2 - 0.014, 0.002]}>
                <planeGeometry args={[PIN_W, 0.028]} />
                <meshBasicMaterial color={item.color} />
              </mesh>
              <Label position={[0, PIN_H / 2 - 0.014, 0.003]} fontSize={0.011} color="#ffffff" bold>
                {item.status.toUpperCase()}
              </Label>
              <Label position={[0, 0.03, 0.003]} fontSize={0.016} color="#212529" bold>
                {item.number}
              </Label>
              <Label position={[0, 0, 0.003]} fontSize={0.011} color="#495057" maxWidth={PIN_W - 0.015} textAlign="center">
                {item.client}
              </Label>
              <Label position={[0, -0.045, 0.003]} fontSize={0.016} color="#212529" bold>
                {item.amount}
              </Label>
              <mesh position={[0, PIN_H / 2 - 0.004, 0.01]}>
                <sphereGeometry args={[0.008, 12, 12]} />
                <meshStandardMaterial color="#e03131" />
              </mesh>
            </>
          )}
        </PinCard>
      ))}
      <PinCard position={[start + shown.length * 0.17, -0.025]} tilt={0} onClick={onNew}>
        {(hovered) => (
          <>
            <mesh>
              <boxGeometry args={[PIN_W, PIN_H, 0.003]} />
              <meshStandardMaterial color={hovered ? '#edf2ff' : '#f3e6cc'} />
            </mesh>
            <Label position={[0, 0.02, 0.003]} fontSize={0.045} color="#4c6ef5" bold>
              +
            </Label>
            <Label position={[0, -0.035, 0.003]} fontSize={0.013} color="#4c6ef5">
              New invoice
            </Label>
          </>
        )}
      </PinCard>
    </group>
  )
}
