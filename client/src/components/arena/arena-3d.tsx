"use client"

import { Canvas, useThree, ThreeEvent } from "@react-three/fiber"
import { OrbitControls, Environment, Sky, ContactShadows, Plane, Text } from "@react-three/drei"
import { Suspense, useRef, useState, useCallback, useEffect } from "react"
import * as THREE from "three"

export interface ObstacleData {
  id: number
  type: "rails" | "oxer" | "wall" | "water" | "gate" | "triple-bar" | "plank"
  position: [number, number, number]
  rotation?: number
  status: "pending" | "clear" | "knockdown"
  height?: number
}

interface Arena3DProps {
  obstacles: ObstacleData[]
  onObstacleClick?: (id: number) => void
  onObstacleMove?: (id: number, position: [number, number, number]) => void
  showPath?: boolean
  selectedObstacle?: number | null
  editMode?: boolean
  onSelectObstacle?: (id: number | null) => void
  startPosition?: [number, number, number]
  finishPosition?: [number, number, number]
  selectedFlag?: "start" | "finish" | null
  onStartMove?: (position: [number, number, number]) => void
  onFinishMove?: (position: [number, number, number]) => void
  onFlagSelect?: (flag: "start" | "finish" | null) => void
}

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 40, 64, 64]} />
        <meshStandardMaterial color="#c9a66b" roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[80, 60]} />
        <meshStandardMaterial color="#4a7c23" roughness={1} />
      </mesh>
    </group>
  )
}

function Fence() {
  const fenceHeight = 1.4
  const posts: [number, number, number][] = []
  
  for (let x = -28; x <= 28; x += 3) {
    posts.push([x, 0, -18])
    posts.push([x, 0, 18])
  }
  for (let z = -18; z <= 18; z += 3) {
    posts.push([-28, 0, z])
    posts.push([28, 0, z])
  }

  return (
    <group>
      {posts.map((pos, i) => (
        <group key={i} position={pos}>
          <mesh position={[0, fenceHeight / 2, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, fenceHeight, 8]} />
            <meshStandardMaterial color="#f5f5f0" roughness={0.3} />
          </mesh>
          <mesh position={[0, fenceHeight, 0]} castShadow>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#f5f5f0" roughness={0.3} />
          </mesh>
        </group>
      ))}
      
      {[0.35, 0.7, 1.05].map((h, hi) => (
        <group key={hi}>
          <mesh position={[0, h, -18]} castShadow>
            <boxGeometry args={[56, 0.06, 0.06]} />
            <meshStandardMaterial color="#f5f5f0" roughness={0.3} />
          </mesh>
          <mesh position={[0, h, 18]} castShadow>
            <boxGeometry args={[56, 0.06, 0.06]} />
            <meshStandardMaterial color="#f5f5f0" roughness={0.3} />
          </mesh>
          <mesh position={[-28, h, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[36, 0.06, 0.06]} />
            <meshStandardMaterial color="#f5f5f0" roughness={0.3} />
          </mesh>
          <mesh position={[28, h, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[36, 0.06, 0.06]} />
            <meshStandardMaterial color="#f5f5f0" roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function JumpStand({ 
  position, 
  color = "#8b4513", 
  height = 1.5,
  flagColor
}: { 
  position: [number, number, number]
  color?: string
  height?: number
  flagColor?: "red" | "white"
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]} castShadow>
        <boxGeometry args={[0.5, 0.12, 0.5]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[0.12, height, 0.12]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, height + 0.08, 0]} castShadow>
        <boxGeometry args={[0.18, 0.15, 0.18]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {flagColor && (
        <group position={[0, height + 0.15, 0]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 0.7, 8]} />
            <meshStandardMaterial color="#444444" roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0.2, 0.55, 0]} castShadow>
            <boxGeometry args={[0.4, 0.3, 0.015]} />
            <meshStandardMaterial 
              color={flagColor === "red" ? "#dc2626" : "#ffffff"} 
              roughness={0.5} 
              side={THREE.DoubleSide} 
            />
          </mesh>
          <mesh position={[0, 0.72, 0]} castShadow>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#444444" roughness={0.4} metalness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function Pole({ position, length, color, knocked = false }: { position: [number, number, number]; length: number; color: string; knocked?: boolean }) {
  const rotationZ = knocked ? Math.PI / 2 + 0.3 : Math.PI / 2
  const rotationX = knocked ? 0.2 : 0
  const yOffset = knocked ? -position[1] + 0.05 : 0
  
  return (
    <mesh position={[position[0], position[1] + yOffset, position[2]]} rotation={[rotationX, 0, rotationZ]} castShadow>
      <cylinderGeometry args={[0.045, 0.045, length, 12]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
    </mesh>
  )
}

function DraggableObstacle({
  children,
  position,
  rotation,
  id,
  isSelected,
  editMode,
  onSelect,
  onMove,
  onClick,
  status
}: {
  children: React.ReactNode
  position: [number, number, number]
  rotation: number
  id: number
  isSelected: boolean
  editMode: boolean
  onSelect: () => void
  onMove: (newPos: [number, number, number]) => void
  onClick: () => void
  status: "pending" | "clear" | "knockdown"
}) {
  const groupRef = useRef<THREE.Group>(null)
  const [isDragging, setIsDragging] = useState(false)
  const { camera, gl } = useThree()
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const intersection = useRef(new THREE.Vector3())
  const offset = useRef(new THREE.Vector3())

  const handlePointerDown = useCallback((e: THREE.Event) => {
    if (!editMode) {
      onClick()
      return
    }
    
    e.stopPropagation()
    onSelect()
    
    setIsDragging(true)
    gl.domElement.style.cursor = 'grabbing'
    
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2(
      (e.nativeEvent.offsetX / gl.domElement.clientWidth) * 2 - 1,
      -(e.nativeEvent.offsetY / gl.domElement.clientHeight) * 2 + 1
    )
    raycaster.setFromCamera(pointer, camera)
    raycaster.ray.intersectPlane(dragPlane.current, intersection.current)
    offset.current.copy(intersection.current).sub(new THREE.Vector3(position[0], 0, position[2]))
    
    // @ts-expect-error - setPointerCapture exists on target
    e.target.setPointerCapture(e.pointerId)
  }, [editMode, onClick, onSelect, camera, gl, position])

  const handlePointerMove = useCallback((e: THREE.Event) => {
    if (!isDragging || !editMode) return
    
    e.stopPropagation()
    
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2(
      (e.nativeEvent.offsetX / gl.domElement.clientWidth) * 2 - 1,
      -(e.nativeEvent.offsetY / gl.domElement.clientHeight) * 2 + 1
    )
    raycaster.setFromCamera(pointer, camera)
    
    if (raycaster.ray.intersectPlane(dragPlane.current, intersection.current)) {
      const newX = Math.max(-26, Math.min(26, intersection.current.x - offset.current.x))
      const newZ = Math.max(-16, Math.min(16, intersection.current.z - offset.current.z))
      onMove([newX, 0, newZ])
    }
  }, [isDragging, editMode, camera, gl, onMove])

  const handlePointerUp = useCallback((e: THREE.Event) => {
    if (!isDragging) return
    
    e.stopPropagation()
    setIsDragging(false)
    gl.domElement.style.cursor = 'auto'
    
    // @ts-expect-error - releasePointerCapture exists on target
    e.target.releasePointerCapture(e.pointerId)
  }, [isDragging, gl])

  const getGlowColor = () => {
    if (isSelected) return "#22c55e"
    if (status === "knockdown") return "#ef4444"
    if (status === "clear") return "#22c55e"
    return "#888888"
  }

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[0, rotation, 0]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {(isSelected || editMode) && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 1.8, 32]} />
          <meshBasicMaterial color={getGlowColor()} transparent opacity={isSelected ? 0.8 : 0.3} />
        </mesh>
      )}
      <group>
        {children}
      </group>
      <mesh visible={false}>
        <boxGeometry args={[4, 3, 4]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  )
}

function RailsObstacle({ height = 1.2, status }: { height?: number; status: string }) {
  const knocked = status === "knockdown"
  const colors = ["#dc2626", "#ffffff", "#dc2626"]
  
  return (
    <group>
      <JumpStand position={[-1.5, 0, 0]} color="#8b4513" height={height + 0.3} flagColor="red" />
      <JumpStand position={[1.5, 0, 0]} color="#8b4513" height={height + 0.3} flagColor="white" />
      {colors.map((color, i) => (
        <Pole key={i} position={[0, height * 0.4 + i * 0.25, 0]} length={3} color={color} knocked={knocked && i === colors.length - 1} />
      ))}
    </group>
  )
}

function OxerObstacle({ height = 1.1, status }: { height?: number; status: string }) {
  const knocked = status === "knockdown"
  
  return (
    <group>
      <JumpStand position={[-1.5, 0, -0.6]} color="#1e3a5f" height={height + 0.3} flagColor="red" />
      <JumpStand position={[1.5, 0, -0.6]} color="#1e3a5f" height={height + 0.3} flagColor="white" />
      <JumpStand position={[-1.5, 0, 0.6]} color="#1e3a5f" height={height + 0.4} />
      <JumpStand position={[1.5, 0, 0.6]} color="#1e3a5f" height={height + 0.4} />
      <Pole position={[0, height * 0.5, -0.6]} length={3} color="#3b82f6" />
      <Pole position={[0, height * 0.7, -0.6]} length={3} color="#ffffff" />
      <Pole position={[0, height * 0.6, 0.6]} length={3} color="#3b82f6" knocked={knocked} />
      <Pole position={[0, height * 0.8, 0.6]} length={3} color="#ffffff" knocked={knocked} />
    </group>
  )
}

function WallObstacle({ height = 1.0 }: { height?: number }) {
  const brickRows = Math.floor(height * 6)
  
  return (
    <group>
      <JumpStand position={[-1.8, 0, 0]} color="#5c3d2e" height={height + 0.5} flagColor="red" />
      <JumpStand position={[1.8, 0, 0]} color="#5c3d2e" height={height + 0.5} flagColor="white" />
      {Array.from({ length: brickRows }).map((_, row) => (
        <group key={row} position={[0, 0.15 + row * 0.2, 0]}>
          {Array.from({ length: 6 }).map((_, col) => (
            <mesh key={col} position={[-1.25 + col * 0.5 + (row % 2 === 0 ? 0.25 : 0), 0, 0]} castShadow>
              <boxGeometry args={[0.45, 0.18, 0.25]} />
              <meshStandardMaterial color={row % 2 === 0 ? "#a0522d" : "#8b4513"} roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function WaterObstacle() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 2.5]} />
        <meshStandardMaterial color="#0ea5e9" metalness={0.3} roughness={0.2} transparent opacity={0.8} />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[4.2, 0.15, 2.7]} />
        <meshStandardMaterial color="#1e40af" roughness={0.9} />
      </mesh>
      <JumpStand position={[-2.2, 0, -1.5]} color="#ffffff" height={0.8} flagColor="red" />
      <JumpStand position={[2.2, 0, -1.5]} color="#ffffff" height={0.8} flagColor="white" />
      <Pole position={[0, 0.5, -1.5]} length={4.4} color="#ffffff" />
      <Pole position={[0, 0.7, -1.5]} length={4.4} color="#0ea5e9" />
    </group>
  )
}

function GateObstacle({ height = 1.1, status }: { height?: number; status: string }) {
  const knocked = status === "knockdown"
  
  return (
    <group>
      <JumpStand position={[-1.5, 0, 0]} color="#166534" height={height + 0.4} flagColor="red" />
      <JumpStand position={[1.5, 0, 0]} color="#166534" height={height + 0.4} flagColor="white" />
      <mesh position={[0, height * 0.5, 0]} rotation={knocked ? [0.1, 0, 0.05] : [0, 0, 0]} castShadow>
        <boxGeometry args={[3, height * 0.8, 0.08]} />
        <meshStandardMaterial color="#22c55e" roughness={0.5} />
      </mesh>
      <mesh position={[0, height * 0.9, 0.05]} castShadow>
        <boxGeometry args={[3.1, 0.1, 0.12]} />
        <meshStandardMaterial color="#166534" roughness={0.4} />
      </mesh>
      <mesh position={[0, height * 0.1, 0.05]} castShadow>
        <boxGeometry args={[3.1, 0.1, 0.12]} />
        <meshStandardMaterial color="#166534" roughness={0.4} />
      </mesh>
    </group>
  )
}

function TripleBarObstacle({ height = 1.0, status }: { height?: number; status: string }) {
  const knocked = status === "knockdown"
  
  return (
    <group>
      <JumpStand position={[-1.5, 0, -0.8]} color="#4c1d95" height={height * 0.7} flagColor="red" />
      <JumpStand position={[1.5, 0, -0.8]} color="#4c1d95" height={height * 0.7} flagColor="white" />
      <JumpStand position={[-1.5, 0, 0]} color="#4c1d95" height={height * 0.9} />
      <JumpStand position={[1.5, 0, 0]} color="#4c1d95" height={height * 0.9} />
      <JumpStand position={[-1.5, 0, 0.8]} color="#4c1d95" height={height + 0.2} />
      <JumpStand position={[1.5, 0, 0.8]} color="#4c1d95" height={height + 0.2} />
      <Pole position={[0, height * 0.5, -0.8]} length={3} color="#7c3aed" />
      <Pole position={[0, height * 0.7, 0]} length={3} color="#a855f7" />
      <Pole position={[0, height * 0.9, 0.8]} length={3} color="#c084fc" knocked={knocked} />
    </group>
  )
}

function PlankObstacle({ height = 1.1, status }: { height?: number; status: string }) {
  const knocked = status === "knockdown"
  
  return (
    <group>
      <JumpStand position={[-1.5, 0, 0]} color="#9a3412" height={height + 0.3} flagColor="red" />
      <JumpStand position={[1.5, 0, 0]} color="#9a3412" height={height + 0.3} flagColor="white" />
      {[0.4, 0.6, 0.8].map((h, i) => (
        <mesh key={i} position={[0, height * h, 0]} rotation={knocked && i === 2 ? [0.1, 0, 0.1] : [0, 0, 0]} castShadow>
          <boxGeometry args={[3, 0.2, 0.15]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#ea580c" : "#fdba74"} roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function Obstacle({
  data,
  isSelected,
  editMode,
  onSelect,
  onMove,
  onClick
}: {
  data: ObstacleData
  isSelected: boolean
  editMode: boolean
  onSelect: () => void
  onMove: (newPos: [number, number, number]) => void
  onClick: () => void
}) {
  const renderObstacle = () => {
    switch (data.type) {
      case "rails":
        return <RailsObstacle height={data.height} status={data.status} />
      case "oxer":
        return <OxerObstacle height={data.height} status={data.status} />
      case "wall":
        return <WallObstacle height={data.height} />
      case "water":
        return <WaterObstacle />
      case "gate":
        return <GateObstacle height={data.height} status={data.status} />
      case "triple-bar":
        return <TripleBarObstacle height={data.height} status={data.status} />
      case "plank":
        return <PlankObstacle height={data.height} status={data.status} />
      default:
        return <RailsObstacle height={data.height} status={data.status} />
    }
  }

  return (
    <DraggableObstacle
      position={data.position}
      rotation={data.rotation || 0}
      id={data.id}
      isSelected={isSelected}
      editMode={editMode}
      onSelect={onSelect}
      onMove={onMove}
      onClick={onClick}
      status={data.status}
    >
      {renderObstacle()}
    </DraggableObstacle>
  )
}

function calculateObstacleRotation(
  obstacles: ObstacleData[],
  currentIndex: number,
  currentObstacle: ObstacleData
): number {
  if (currentObstacle.rotation !== undefined && currentObstacle.rotation !== 0) {
    return currentObstacle.rotation
  }
  
  const current = currentObstacle.position
  let direction: [number, number] = [0, 1]
  
  if (obstacles.length < 2) {
    return 0
  }
  
  if (currentIndex > 0) {
    const prev = obstacles[currentIndex - 1].position
    direction = [current[0] - prev[0], current[2] - prev[2]]
  } else if (currentIndex < obstacles.length - 1) {
    const next = obstacles[currentIndex + 1].position
    direction = [next[0] - current[0], next[2] - current[2]]
  }
  
  const angle = Math.atan2(direction[0], direction[1])
  
  return angle
}

function ObstacleNumber({ 
  position, 
  number,
  height = 1.5
}: { 
  position: [number, number, number]
  number: number
  height?: number 
}) {
  return (
    <group position={[position[0], height + 1.5, position[2]]}>
      <mesh rotation={[-Math.PI / 5, 0, 0]}>
        <circleGeometry args={[0.6, 32]} />
        <meshStandardMaterial color="#1e40af" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 5, 0, 0]} position={[0, 0, -0.02]}>
        <ringGeometry args={[0.55, 0.65, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <Text
        position={[0, 0.05, 0.05]}
        rotation={[-Math.PI / 5, 0, 0]}
        fontSize={0.6}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {number.toString()}
      </Text>
    </group>
  )
}

function PathLine({ obstacles, show }: { obstacles: ObstacleData[]; show: boolean }) {
  if (!show || obstacles.length < 2) return null
  
  const groundHeight = 0.08
  const points: THREE.Vector3[] = []
  const takeoffDist = 2.5
  const landingDist = 2.5
  
  for (let i = 0; i < obstacles.length; i++) {
    const curr = obstacles[i]
    const obstacleHeight = curr.height ?? 1.2
    const peakHeight = obstacleHeight + 1.0
    
    const cx = curr.position[0]
    const cz = curr.position[2]
    
    const prev = obstacles[i - 1]
    const next = obstacles[i + 1]
    const fromPoint = prev ? prev.position : curr.position
    const toPoint = next ? next.position : curr.position
    
    let inDx = cx - fromPoint[0]
    let inDz = cz - fromPoint[2]
    const inLen = Math.hypot(inDx, inDz) || 1
    inDx /= inLen
    inDz /= inLen
    
    let outDx = toPoint[0] - cx
    let outDz = toPoint[2] - cz
    const outLen = Math.hypot(outDx, outDz) || 1
    outDx /= outLen
    outDz /= outLen
    
    if (prev) {
      let pOutDx = cx - prev.position[0]
      let pOutDz = cz - prev.position[2]
      const pOutLen = Math.hypot(pOutDx, pOutDz) || 1
      pOutDx /= pOutLen
      pOutDz /= pOutLen
      const landX = prev.position[0] + pOutDx * landingDist
      const landZ = prev.position[2] + pOutDz * landingDist
      const takeX = cx - inDx * takeoffDist
      const takeZ = cz - inDz * takeoffDist
      const gapDist = Math.hypot(takeX - landX, takeZ - landZ)
      const numMid = Math.max(1, Math.floor(gapDist / 4))
      for (let m = 1; m <= numMid; m++) {
        const t = m / (numMid + 1)
        points.push(new THREE.Vector3(
          landX + (takeX - landX) * t,
          groundHeight,
          landZ + (takeZ - landZ) * t
        ))
      }
    }
    
    points.push(new THREE.Vector3(cx - inDx * takeoffDist, groundHeight, cz - inDz * takeoffDist))
    points.push(new THREE.Vector3(cx, peakHeight, cz))
    points.push(new THREE.Vector3(cx + outDx * landingDist, groundHeight, cz + outDz * landingDist))
  }
  
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5)
  const tubeGeometry = new THREE.TubeGeometry(curve, 300, 0.15, 8, false)
  
  return (
    <mesh geometry={tubeGeometry} castShadow>
      <meshStandardMaterial color="#eab308" roughness={0.4} metalness={0.2} />
    </mesh>
  )
}

function DraggableFlag({ 
  position, 
  type,
  isSelected,
  editMode,
  onSelect,
  onMove
}: { 
  position: [number, number, number]
  type: "start" | "finish"
  isSelected: boolean
  editMode: boolean
  onSelect: () => void
  onMove: (pos: [number, number, number]) => void
}) {
  const { camera, gl } = useThree()
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const intersectionPoint = useRef(new THREE.Vector3())
  const isDraggingRef = useRef(false)
  const raycaster = useRef(new THREE.Raycaster())
  
  const flagColor = type === "start" ? "#22c55e" : "#ef4444"
  const label = type === "start" ? "התחלה" : "סיום"
  
  useEffect(() => {
    if (!isSelected || !editMode) return
    
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) return
      
      const rect = gl.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      )
      
      raycaster.current.setFromCamera(mouse, camera)
      if (raycaster.current.ray.intersectPlane(planeRef.current, intersectionPoint.current)) {
        const clampedX = Math.max(-30, Math.min(30, intersectionPoint.current.x))
        const clampedZ = Math.max(-20, Math.min(20, intersectionPoint.current.z))
        const newPos: [number, number, number] = [
          Math.round(clampedX * 2) / 2,
          0,
          Math.round(clampedZ * 2) / 2
        ]
        onMove(newPos)
      }
    }
    
    const handleMouseUp = () => {
      isDraggingRef.current = false
    }
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isSelected, editMode, camera, gl, onMove])
  
  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!editMode) return
    e.stopPropagation()
    onSelect()
    isDraggingRef.current = true
  }, [editMode, onSelect])
  
  return (
    <group 
      position={position}
      onPointerDown={handlePointerDown}
    >
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[1.2, 1.5, 32]} />
          <meshBasicMaterial color="#22c55e" transparent opacity={0.6} />
        </mesh>
      )}
      <mesh position={[0, 2, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 4, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.5, 0.2, 16]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      <mesh position={[0.5, 3.5, 0]} castShadow>
        <boxGeometry args={[1, 0.7, 0.03]} />
        <meshStandardMaterial color={flagColor} />
      </mesh>
      <Text
        position={[0, 4.5, 0]}
        fontSize={0.7}
        color={flagColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#000000"
      >
        {label}
      </Text>
      {isSelected && editMode && (
        <Text
          position={[0, -0.5, 0]}
          fontSize={0.3}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          גרור להזזה
        </Text>
      )}
    </group>
  )
}

function Flags({ 
  startPosition, 
  finishPosition,
  selectedFlag,
  editMode,
  onStartMove,
  onFinishMove,
  onFlagSelect
}: { 
  startPosition: [number, number, number]
  finishPosition: [number, number, number]
  selectedFlag: "start" | "finish" | null
  editMode: boolean
  onStartMove: (pos: [number, number, number]) => void
  onFinishMove: (pos: [number, number, number]) => void
  onFlagSelect: (flag: "start" | "finish" | null) => void
}) {
  return (
    <group>
      <DraggableFlag
        position={startPosition}
        type="start"
        isSelected={selectedFlag === "start"}
        editMode={editMode}
        onSelect={() => onFlagSelect("start")}
        onMove={onStartMove}
      />
      <DraggableFlag
        position={finishPosition}
        type="finish"
        isSelected={selectedFlag === "finish"}
        editMode={editMode}
        onSelect={() => onFlagSelect("finish")}
        onMove={onFinishMove}
      />
    </group>
  )
}

function ArenaScene({
  obstacles,
  onObstacleClick,
  onObstacleMove,
  showPath,
  selectedObstacle,
  editMode,
  onSelectObstacle,
  startPosition,
  finishPosition,
  selectedFlag,
  onStartMove,
  onFinishMove,
  onFlagSelect
}: {
  obstacles: ObstacleData[]
  onObstacleClick?: (id: number) => void
  onObstacleMove?: (id: number, position: [number, number, number]) => void
  showPath: boolean
  selectedObstacle: number | null
  editMode: boolean
  onSelectObstacle?: (id: number | null) => void
  startPosition: [number, number, number]
  finishPosition: [number, number, number]
  selectedFlag: "start" | "finish" | null
  onStartMove: (pos: [number, number, number]) => void
  onFinishMove: (pos: [number, number, number]) => void
  onFlagSelect: (flag: "start" | "finish" | null) => void
}) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[20, 30, 20]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={100}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <directionalLight position={[-10, 20, -10]} intensity={0.3} />
      <Sky sunPosition={[100, 20, 100]} turbidity={8} rayleigh={0.5} />
      <Environment preset="park" />
      <Ground />
      <Fence />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.4} scale={80} blur={2} far={20} />
      <PathLine obstacles={obstacles} show={showPath} />
      <Flags 
        startPosition={startPosition}
        finishPosition={finishPosition}
        selectedFlag={selectedFlag}
        editMode={editMode}
        onStartMove={onStartMove}
        onFinishMove={onFinishMove}
        onFlagSelect={onFlagSelect}
      />
      {obstacles.map((obstacle, index) => {
        const autoRotation = calculateObstacleRotation(obstacles, index, obstacle)
        const obstacleWithRotation = {
          ...obstacle,
          rotation: autoRotation
        }
        return (
          <group key={obstacle.id}>
            <ObstacleNumber 
              position={obstacle.position} 
              number={index + 1}
              height={obstacle.height || 1.2}
            />
            <Obstacle
              data={obstacleWithRotation}
              isSelected={selectedObstacle === obstacle.id}
              editMode={editMode}
              onSelect={() => onSelectObstacle?.(obstacle.id)}
              onMove={(newPos) => onObstacleMove?.(obstacle.id, newPos)}
              onClick={() => onObstacleClick?.(obstacle.id)}
            />
          </group>
        )
      })}
      {editMode && (
        <Plane
          args={[100, 100]}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.1, 0]}
          visible={false}
          onClick={() => onSelectObstacle?.(null)}
        />
      )}
    </>
  )
}

export function Arena3D({ 
  obstacles, 
  onObstacleClick, 
  onObstacleMove,
  showPath = true,
  selectedObstacle = null,
  editMode = false,
  onSelectObstacle,
  startPosition = [-25, 0, 12],
  finishPosition = [-25, 0, 0],
  selectedFlag = null,
  onStartMove = () => {},
  onFinishMove = () => {},
  onFlagSelect = () => {}
}: Arena3DProps) {
  const controlsRef = useRef<any>(null)
  
  return (
    <div className="w-full h-full rounded-xl overflow-hidden">
      <Canvas
        shadows
        camera={{ position: [0, 40, 50], fov: 45 }}
        gl={{ antialias: true }}
        onPointerMissed={() => {
          onSelectObstacle?.(null)
          onFlagSelect(null)
        }}
      >
        <Suspense fallback={null}>
          <ArenaScene 
            obstacles={obstacles} 
            onObstacleClick={onObstacleClick}
            onObstacleMove={onObstacleMove}
            showPath={showPath}
            selectedObstacle={selectedObstacle}
            editMode={editMode}
            onSelectObstacle={onSelectObstacle}
            startPosition={startPosition}
            finishPosition={finishPosition}
            selectedFlag={selectedFlag}
            onStartMove={onStartMove}
            onFinishMove={onFinishMove}
            onFlagSelect={onFlagSelect}
          />
          <OrbitControls
            ref={controlsRef}
            enablePan={true}
            enableZoom={true}
            enableRotate={!editMode || (selectedObstacle === null && selectedFlag === null)}
            minPolarAngle={0.1}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={10}
            maxDistance={100}
            target={[0, 0, 0]}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
