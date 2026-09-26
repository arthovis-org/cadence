import { useRef, useState, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Text, useCursor } from '@react-three/drei'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import regularFont from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url'
import boldFont from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url'

// Scene units are roughly meters. The desk top surface sits at DESK_Y.
export const DESK_Y = 0.75
const HALF_PI = Math.PI / 2

/** Readable text color on top of a background color. */
function textOn(hex: string): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#212529' : '#ffffff'
}

function Label({ children, bold, ...props }: { children: ReactNode; bold?: boolean } & Omit<React.ComponentProps<typeof Text>, 'children'>) {
  return (
    <Text font={bold ? boldFont : regularFont} anchorX="center" anchorY="middle" {...props}>
      {children}
    </Text>
  )
}

/** Hover state + pointer cursor for clickable objects. */
function useHover() {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  return {
    hovered,
    bind: {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        setHovered(true)
      },
      onPointerOut: () => setHovered(false),
    },
  }
}

/** Smoothly move a group's y position toward a target. */
function useLift(target: number) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.position.y += (target - ref.current.position.y) * Math.min(1, dt * 10)
  })
  return ref
}

// ---------------------------------------------------------------------------
// Room and desk
// ---------------------------------------------------------------------------

export function Room({ dark }: { dark: boolean }) {
  const wood = dark ? '#6b4f3a' : '#a47551'
  return (
    <group>
      {/* Floor and back wall */}
      <mesh rotation={[-HALF_PI, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color={dark ? '#1f2023' : '#d9d4cc'} />
      </mesh>
      <mesh position={[0, 3, -0.8]} receiveShadow>
        <planeGeometry args={[12, 6]} />
        <meshStandardMaterial color={dark ? '#2b2d31' : '#ebe7e0'} />
      </mesh>
      {/* Desk */}
      <mesh position={[0, DESK_Y - 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 0.06, 1.35]} />
        <meshStandardMaterial color={wood} roughness={0.7} />
      </mesh>
      {[
        [-1.3, -0.58],
        [1.3, -0.58],
        [-1.3, 0.58],
        [1.3, 0.58],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, (DESK_Y - 0.06) / 2, z]} castShadow>
          <boxGeometry args={[0.06, DESK_Y - 0.06, 0.06]} />
          <meshStandardMaterial color={dark ? '#3b3f45' : '#5c5f66'} />
        </mesh>
      ))}
      {/* Mug */}
      <group position={[0.5, DESK_Y, 0.45]}>
        <mesh position={[0, 0.06, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.04, 0.12, 24]} />
          <meshStandardMaterial color="#4c6ef5" />
        </mesh>
        <mesh position={[0.05, 0.065, 0]} rotation={[HALF_PI, 0, 0]}>
          <torusGeometry args={[0.025, 0.008, 8, 16]} />
          <meshStandardMaterial color="#4c6ef5" />
        </mesh>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Stopwatch: start / stop the timer
// ---------------------------------------------------------------------------

export function Stopwatch({
  running,
  seconds,
  label,
  onToggle,
}: {
  running: boolean
  seconds: number
  label: string
  onToggle: () => void
}) {
  const { hovered, bind } = useHover()
  const body = useRef<MeshStandardMaterial>(null)
  const button = useRef<Mesh>(null)

  useFrame(({ clock }, dt) => {
    if (body.current) {
      const glow = running ? 0.25 + Math.sin(clock.elapsedTime * 3) * 0.15 : hovered ? 0.15 : 0
      body.current.emissiveIntensity += (glow - body.current.emissiveIntensity) * Math.min(1, dt * 8)
    }
    if (button.current) button.current.position.y += (0.375 - button.current.position.y) * Math.min(1, dt * 12)
  })

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const digital = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

  function click(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    if (button.current) button.current.position.y = 0.36 // press animation
    onToggle()
  }

  return (
    <group position={[0.05, DESK_Y, 0.2]} onClick={click} {...bind}>
      {/* Stand */}
      <mesh position={[0, 0.012, 0]} castShadow>
        <boxGeometry args={[0.2, 0.024, 0.1]} />
        <meshStandardMaterial color="#343a40" />
      </mesh>
      {/* Body */}
      <mesh position={[0, 0.19, 0]} rotation={[HALF_PI, 0, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.06, 48]} />
        <meshStandardMaterial ref={body} color={running ? '#e03131' : '#495057'} emissive={running ? '#ff6b6b' : '#748ffc'} emissiveIntensity={0} metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Face */}
      <mesh position={[0, 0.19, 0.031]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.004, 48]} />
        <meshStandardMaterial color="#f8f9fa" />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.sin(a) * 0.12, 0.19 + Math.cos(a) * 0.12, 0.035]} rotation={[0, 0, -a]}>
            <boxGeometry args={[0.005, i % 3 === 0 ? 0.022 : 0.012, 0.002]} />
            <meshStandardMaterial color="#495057" />
          </mesh>
        )
      })}
      {/* Seconds and minutes hands (pivot at the center of the face) */}
      <group position={[0, 0.19, 0.037]} rotation={[0, 0, -((seconds % 60) / 60) * Math.PI * 2]}>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[0.005, 0.11, 0.002]} />
          <meshStandardMaterial color="#e03131" />
        </mesh>
      </group>
      <group position={[0, 0.19, 0.036]} rotation={[0, 0, -((seconds % 3600) / 3600) * Math.PI * 2]}>
        <mesh position={[0, 0.035, 0]}>
          <boxGeometry args={[0.008, 0.075, 0.002]} />
          <meshStandardMaterial color="#212529" />
        </mesh>
      </group>
      <mesh position={[0, 0.19, 0.039]}>
        <sphereGeometry args={[0.009, 12, 12]} />
        <meshStandardMaterial color="#212529" />
      </mesh>
      <Label position={[0, 0.125, 0.04]} fontSize={0.026} color="#212529" bold>
        {digital}
      </Label>
      {/* Crown button */}
      <mesh position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.03, 16]} />
        <meshStandardMaterial color="#adb5bd" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh ref={button} position={[0, 0.375, 0]} castShadow>
        <cylinderGeometry args={[0.032, 0.032, 0.02, 20]} />
        <meshStandardMaterial color={running ? '#e03131' : '#4c6ef5'} />
      </mesh>
      <Label position={[0, 0.44, 0]} fontSize={0.028} color={running ? '#e03131' : hovered ? '#4c6ef5' : '#868e96'} maxWidth={0.8} textAlign="center" bold>
        {running ? `● ${label}` : hovered ? 'Click to start' : label}
      </Label>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Folder rack: one folder per project
// ---------------------------------------------------------------------------

export interface FolderItem {
  id: string
  name: string
  color: string
  sub?: string
}

const FOLDER_W = 0.19
const FOLDER_GAP = 0.025
const MAX_FOLDERS = 9

function Folder({ item, x, selected, onSelect }: { item: FolderItem; x: number; selected: boolean; onSelect: (id: string) => void }) {
  const { hovered, bind } = useHover()
  const ref = useLift(selected ? 0.07 : hovered ? 0.025 : 0)
  const fg = textOn(item.color)
  return (
    <group position={[x, 0, 0]}>
      <group
        ref={ref}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(item.id)
        }}
        {...bind}
      >
        {/* Paper peeking out */}
        <mesh position={[0.005, 0.13, -0.002]} castShadow>
          <boxGeometry args={[FOLDER_W - 0.02, 0.24, 0.006]} />
          <meshStandardMaterial color="#f8f9fa" />
        </mesh>
        <mesh position={[0, 0.115, 0.004]} castShadow>
          <boxGeometry args={[FOLDER_W, 0.23, 0.01]} />
          <meshStandardMaterial color={item.color} emissive={item.color} emissiveIntensity={selected ? 0.35 : 0} roughness={0.6} />
        </mesh>
        {/* Tab */}
        <mesh position={[-FOLDER_W / 2 + 0.04, 0.24, 0.004]}>
          <boxGeometry args={[0.07, 0.022, 0.01]} />
          <meshStandardMaterial color={item.color} />
        </mesh>
        <Label position={[0, 0.14, 0.01]} fontSize={0.019} color={fg} maxWidth={FOLDER_W - 0.03} textAlign="center" bold lineHeight={1.15}>
          {item.name}
        </Label>
        {item.sub && (
          <Label position={[0, 0.045, 0.01]} fontSize={0.013} color={fg} maxWidth={FOLDER_W - 0.03} fillOpacity={0.8}>
            {item.sub}
          </Label>
        )}
      </group>
    </group>
  )
}

export function FolderRack({ items, selectedId, onSelect }: { items: FolderItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const shown = items.slice(0, MAX_FOLDERS)
  const width = Math.max(1, shown.length) * (FOLDER_W + FOLDER_GAP)
  const startX = -width / 2 + (FOLDER_W + FOLDER_GAP) / 2
  return (
    <group position={[-0.45, DESK_Y, -0.45]}>
      <mesh position={[0, 0.012, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.06, 0.024, 0.09]} />
        <meshStandardMaterial color="#343a40" />
      </mesh>
      <mesh position={[0, 0.05, -0.04]} castShadow>
        <boxGeometry args={[width + 0.06, 0.08, 0.01]} />
        <meshStandardMaterial color="#343a40" />
      </mesh>
      <group position={[0, 0.024, 0.01]}>
        {shown.map((item, i) => (
          <Folder key={item.id} item={item} x={startX + i * (FOLDER_W + FOLDER_GAP)} selected={item.id === selectedId} onSelect={onSelect} />
        ))}
      </group>
      {items.length === 0 && (
        <Label position={[0, 0.12, 0]} fontSize={0.03} color="#868e96">
          No projects yet
        </Label>
      )}
      {items.length > MAX_FOLDERS && (
        <Label position={[width / 2 + 0.1, 0.1, 0]} fontSize={0.025} color="#868e96">
          +{items.length - MAX_FOLDERS}
        </Label>
      )}
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

function Note({ item, position, tilt, selected, onSelect }: { item: NoteItem; position: [number, number]; tilt: number; selected: boolean; onSelect: (id: string) => void }) {
  const { hovered, bind } = useHover()
  const ref = useLift(selected ? 0.03 : hovered ? 0.012 : 0)
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, tilt, 0]}>
      <group
        ref={ref}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(item.id)
        }}
        {...bind}
      >
        <mesh position={[0, 0.003, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.15, 0.004, 0.15]} />
          <meshStandardMaterial color={selected ? '#ffa94d' : '#ffe066'} emissive={selected ? '#ff922b' : '#000000'} emissiveIntensity={selected ? 0.3 : 0} />
        </mesh>
        <Label position={[0, 0.0055, 0]} rotation={[-HALF_PI, 0, 0]} fontSize={0.019} color="#5c4813" maxWidth={0.13} textAlign="center" lineHeight={1.15}>
          {item.name}
        </Label>
      </group>
    </group>
  )
}

export function StickyNotes({ items, selectedId, onSelect, projectName }: { items: NoteItem[]; selectedId: string | null; onSelect: (id: string) => void; projectName: string | null }) {
  const perRow = 4
  return (
    <group position={[-1.1, DESK_Y, -0.13]}>
      {projectName && (
        <Label position={[0.3, 0.002, -0.1]} rotation={[-HALF_PI, 0, 0]} fontSize={0.022} color="#495057" anchorX="center">
          {items.length ? `Tasks · ${projectName}` : `${projectName} has no open tasks`}
        </Label>
      )}
      {items.slice(0, 12).map((t, i) => (
        <Note
          key={t.id}
          item={t}
          position={[(i % perRow) * 0.19, Math.floor(i / perRow) * 0.18]}
          tilt={((i * 37) % 11) / 100 - 0.05}
          selected={t.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Notepad: today's entries
// ---------------------------------------------------------------------------

export interface NoteLine {
  key: string
  time: string
  text: string
  duration: string
  color: string
}

export function Notepad({ lines, total, onClick }: { lines: NoteLine[]; total: string; onClick: () => void }) {
  const { hovered, bind } = useHover()
  return (
    <group
      position={[0.85, DESK_Y, 0.22]}
      rotation={[0, -0.18, 0]}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      {...bind}
    >
      <mesh position={[0, 0.006, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.012, 0.5]} />
        <meshStandardMaterial color={hovered ? '#ffffff' : '#f8f9fa'} emissive="#4c6ef5" emissiveIntensity={hovered ? 0.05 : 0} />
      </mesh>
      <mesh position={[0, 0.013, -0.235]}>
        <boxGeometry args={[0.42, 0.004, 0.03]} />
        <meshStandardMaterial color="#e03131" />
      </mesh>
      <group position={[0, 0.0125, 0]} rotation={[-HALF_PI, 0, 0]}>
        <Label position={[-0.19, 0.19, 0]} fontSize={0.024} color="#212529" anchorX="left" bold>
          Today
        </Label>
        <Label position={[0.19, 0.19, 0]} fontSize={0.024} color="#212529" anchorX="right" bold>
          {total}
        </Label>
        {lines.slice(0, 9).map((l, i) => (
          <group key={l.key} position={[0, 0.14 - i * 0.04, 0]}>
            <mesh position={[-0.185, 0, 0]}>
              <circleGeometry args={[0.006, 12]} />
              <meshBasicMaterial color={l.color} />
            </mesh>
            <Label position={[-0.17, 0, 0]} fontSize={0.015} color="#868e96" anchorX="left">
              {l.time}
            </Label>
            <Label position={[-0.115, 0, 0]} fontSize={0.016} color="#343a40" anchorX="left">
              {l.text}
            </Label>
            <Label position={[0.19, 0, 0]} fontSize={0.016} color="#212529" anchorX="right" bold>
              {l.duration}
            </Label>
          </group>
        ))}
        {lines.length === 0 && (
          <Label position={[0, 0.08, 0]} fontSize={0.017} color="#adb5bd">
            Nothing logged yet today
          </Label>
        )}
        <Label position={[0, -0.215, 0]} fontSize={0.014} color={hovered ? '#4c6ef5' : '#adb5bd'}>
          Click to add time manually
        </Label>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Monitor: this week at a glance
// ---------------------------------------------------------------------------

export function Monitor({
  hours,
  amount,
  bars,
  onClick,
}: {
  hours: string
  amount: string
  bars: { label: string; value: number; today: boolean }[]
  onClick: () => void
}) {
  const { hovered, bind } = useHover()
  const max = Math.max(1, ...bars.map((b) => b.value))
  return (
    <group
      position={[0.78, DESK_Y, -0.38]}
      rotation={[0, -0.25, 0]}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      {...bind}
    >
      <mesh position={[0, 0.01, 0]} castShadow>
        <boxGeometry args={[0.22, 0.02, 0.14]} />
        <meshStandardMaterial color="#343a40" />
      </mesh>
      <mesh position={[0, 0.12, -0.02]} castShadow>
        <boxGeometry args={[0.04, 0.2, 0.03]} />
        <meshStandardMaterial color="#343a40" />
      </mesh>
      <mesh position={[0, 0.37, 0]} castShadow>
        <boxGeometry args={[0.66, 0.42, 0.03]} />
        <meshStandardMaterial color="#212529" />
      </mesh>
      <mesh position={[0, 0.37, 0.016]}>
        <planeGeometry args={[0.62, 0.38]} />
        <meshBasicMaterial color={hovered ? '#1f2a4d' : '#1a1b2e'} />
      </mesh>
      <group position={[0, 0.37, 0.018]}>
        <Label position={[-0.29, 0.155, 0]} fontSize={0.02} color="#91a7ff" anchorX="left">
          THIS WEEK
        </Label>
        <Label position={[-0.29, 0.1, 0]} fontSize={0.06} color="#ffffff" anchorX="left" bold>
          {hours}
        </Label>
        <Label position={[-0.29, 0.045, 0]} fontSize={0.022} color="#b2f2bb" anchorX="left">
          {amount} billable
        </Label>
        {bars.map((b, i) => {
          const h = Math.max(0.004, (b.value / max) * 0.12)
          const x = -0.24 + i * 0.08
          return (
            <group key={b.label}>
              <mesh position={[x, -0.13 + h / 2, 0]}>
                <planeGeometry args={[0.045, h]} />
                <meshBasicMaterial color={b.today ? '#748ffc' : '#4263eb'} />
              </mesh>
              <Label position={[x, -0.15, 0]} fontSize={0.014} color={b.today ? '#ffffff' : '#868e96'}>
                {b.label}
              </Label>
            </group>
          )
        })}
        <Label position={[0.29, 0.155, 0]} fontSize={0.014} color={hovered ? '#ffffff' : '#5c5f66'} anchorX="right">
          Open reports ↗
        </Label>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Pinboard: invoices
// ---------------------------------------------------------------------------

export interface PinItem {
  id: string
  number: string
  client: string
  amount: string
  status: string
  color: string
}

function Pin({ item, position, tilt, onOpen }: { item: PinItem; position: [number, number]; tilt: number; onOpen: (id: string) => void }) {
  const { hovered, bind } = useHover()
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.position.z += ((hovered ? 0.03 : 0) - ref.current.position.z) * Math.min(1, dt * 10)
  })
  return (
    <group position={[position[0], position[1], 0.02]} rotation={[0, 0, tilt]}>
      <group
        ref={ref}
        onClick={(e) => {
          e.stopPropagation()
          onOpen(item.id)
        }}
        {...bind}
      >
        <mesh castShadow>
          <boxGeometry args={[0.17, 0.22, 0.003]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.095, 0.002]}>
          <planeGeometry args={[0.17, 0.03]} />
          <meshBasicMaterial color={item.color} />
        </mesh>
        <Label position={[0, 0.095, 0.003]} fontSize={0.014} color="#ffffff" bold>
          {item.status.toUpperCase()}
        </Label>
        <Label position={[0, 0.045, 0.003]} fontSize={0.019} color="#212529" bold>
          {item.number}
        </Label>
        <Label position={[0, 0.005, 0.003]} fontSize={0.014} color="#495057" maxWidth={0.15} textAlign="center">
          {item.client}
        </Label>
        <Label position={[0, -0.055, 0.003]} fontSize={0.02} color="#212529" bold>
          {item.amount}
        </Label>
        <mesh position={[0, 0.1, 0.01]}>
          <sphereGeometry args={[0.009, 12, 12]} />
          <meshStandardMaterial color="#e03131" />
        </mesh>
      </group>
    </group>
  )
}

export function Pinboard({ items, onOpen, onNew }: { items: PinItem[]; onOpen: (id: string) => void; onNew: () => void }) {
  const newCard = useHover()
  const shown = items.slice(0, 7)
  return (
    <group position={[-0.35, 1.5, -0.78]}>
      <mesh castShadow>
        <boxGeometry args={[1.62, 0.66, 0.03]} />
        <meshStandardMaterial color="#6b4f3a" />
      </mesh>
      <mesh position={[0, 0, 0.016]}>
        <planeGeometry args={[1.54, 0.58]} />
        <meshStandardMaterial color="#c9a46c" roughness={0.95} />
      </mesh>
      <Label position={[-0.72, 0.25, 0.02]} fontSize={0.026} color="#5c3d1e" anchorX="left" bold>
        Invoices
      </Label>
      {shown.map((item, i) => (
        <Pin key={item.id} item={item} position={[-0.63 + i * 0.2, -0.03]} tilt={((i * 53) % 9) / 100 - 0.04} onOpen={onOpen} />
      ))}
      <group
        position={[-0.63 + shown.length * 0.2, -0.03, 0.02]}
        onClick={(e) => {
          e.stopPropagation()
          onNew()
        }}
        {...newCard.bind}
      >
        <mesh>
          <boxGeometry args={[0.17, 0.22, 0.003]} />
          <meshStandardMaterial color={newCard.hovered ? '#edf2ff' : '#f1e3c8'} />
        </mesh>
        <Label position={[0, 0.02, 0.003]} fontSize={0.05} color="#4c6ef5" bold>
          +
        </Label>
        <Label position={[0, -0.04, 0.003]} fontSize={0.015} color="#4c6ef5">
          New invoice
        </Label>
      </group>
    </group>
  )
}
