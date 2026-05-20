import { useEffect, useMemo } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, OrbitControls, Text } from "@react-three/drei";
import { Plane, Quaternion, Raycaster, Vector2, Vector3 } from "three";

export const MAP_ARENA_HALF = 4.2;

export type CourseMapObstacle = {
  id: string;
  templateId: string;
  number: number;
  color: string;
  isDouble: boolean;
  xPct: number;
  yPct: number;
  rotationDeg: number;
};

type ObstacleTemplate = {
  id: string;
  defaultColor: string;
  shape: "vertical" | "oxer" | "triple" | "wall" | "water" | "liverpool" | "combination" | "gate" | "plank";
};

export type RaycastGroundFn = (clientX: number, clientY: number) => Vector3 | null;

function arenaHalfSize(widthM: number, lengthM: number) {
  return {
    halfX: MAP_ARENA_HALF * (Math.max(20, Math.min(120, widthM)) / 40),
    halfZ: MAP_ARENA_HALF * (Math.max(40, Math.min(180, lengthM)) / 80),
  };
}

export function pctToWorld(xPct: number, yPct: number, y = 0, widthM = 40, lengthM = 80): [number, number, number] {
  const { halfX, halfZ } = arenaHalfSize(widthM, lengthM);
  const x = ((xPct - 50) / 46) * halfX;
  const z = ((50 - yPct) / 42) * halfZ;
  return [x, y, z];
}

export function worldToPct(x: number, z: number, widthM = 40, lengthM = 80) {
  const { halfX, halfZ } = arenaHalfSize(widthM, lengthM);
  const xPct = Math.round(Math.min(96, Math.max(4, 50 + (x / halfX) * 46)));
  const yPct = Math.round(Math.min(92, Math.max(8, 50 - (z / halfZ) * 42)));
  return { xPct, yPct };
}

function RaycastRegister({ raycastRef }: { raycastRef: React.MutableRefObject<RaycastGroundFn | null> }) {
  const { camera, gl } = useThree();

  useEffect(() => {
    const plane = new Plane(new Vector3(0, 1, 0), 0);
    const raycaster = new Raycaster();
    raycastRef.current = (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
      const hit = new Vector3();
      if (raycaster.ray.intersectPlane(plane, hit)) return hit;
      return null;
    };
    return () => {
      raycastRef.current = null;
    };
  }, [camera, gl, raycastRef]);

  return null;
}

function WoodPole({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, 0.65, z]} castShadow receiveShadow>
      <cylinderGeometry args={[0.055, 0.06, 1.3, 10]} />
      <meshStandardMaterial color="#f8fafc" roughness={0.65} metalness={0.12} />
    </mesh>
  );
}

function FlagPair() {
  return (
    <>
      <mesh position={[-0.66, 1.55, 0]}>
        <boxGeometry args={[0.02, 0.22, 0.02]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[-0.62, 1.6, 0]}>
        <boxGeometry args={[0.09, 0.05, 0.01]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      <mesh position={[0.66, 1.55, 0]}>
        <boxGeometry args={[0.02, 0.22, 0.02]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[0.7, 1.6, 0]}>
        <boxGeometry args={[0.09, 0.05, 0.01]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </>
  );
}

function StandardFrame({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.09, 1.24, 0.09]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.36, 0.06, 0.22]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.08, 0.16, 0.08]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
    </group>
  );
}

function JumpRail({
  position,
  args,
  color,
  selected,
}: {
  position: [number, number, number];
  args: [number, number, number];
  color: string;
  selected: boolean;
}) {
  const stripeColors = ["#ffffff", color, "#ffffff", color, "#ffffff"];
  return (
    <group position={position}>
      {stripeColors.map((sc, idx) => (
        <mesh key={idx} position={[(idx - 2) * (args[0] / 5), 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[args[0] / 5 + 0.01, args[1], args[2]]} />
          <meshStandardMaterial
            color={sc}
            metalness={0.22}
            roughness={0.34}
            emissive={selected ? color : "#000000"}
            emissiveIntensity={selected ? 0.2 : 0}
          />
        </mesh>
      ))}
    </group>
  );
}

function ObstacleNumberLabel({ n }: { n: number }) {
  return (
    <Billboard follow position={[0, 1.42, 0]}>
      <Text
        fontSize={0.42}
        color="#ffffff"
        outlineWidth={0.04}
        outlineColor="#000000"
        fontWeight="800"
        anchorX="center"
        anchorY="middle"
      >
        {String(n)}
      </Text>
    </Billboard>
  );
}

function ObstacleMesh3D({
  o,
  template,
  selected,
  onSelect,
  onDragHandleDown,
  arenaWidthM,
  arenaLengthM,
}: {
  o: CourseMapObstacle;
  template: ObstacleTemplate;
  selected: boolean;
  onSelect: () => void;
  onDragHandleDown: (e: ThreeEvent<PointerEvent>) => void;
  arenaWidthM: number;
  arenaLengthM: number;
}) {
  const [px, , pz] = pctToWorld(o.xPct, o.yPct, 0, arenaWidthM, arenaLengthM);
  const rotY = (o.rotationDeg * Math.PI) / 180;
  const c = o.color;
  const railW = o.isDouble ? 1.55 : 1.32;

  const shapeBody = useMemo(() => {
    switch (template.shape) {
      case "vertical":
        return (
          <>
            <StandardFrame x={-0.52} />
            <StandardFrame x={0.52} />
            <JumpRail position={[0, 1.22, 0]} args={[railW, 0.075, 0.09]} color={c} selected={selected} />
            <FlagPair />
          </>
        );
      case "oxer":
        return (
          <>
            <StandardFrame x={-0.58} />
            <StandardFrame x={0.58} />
            <JumpRail position={[0, 1.12, 0]} args={[railW, 0.065, 0.085]} color={c} selected={selected} />
            <JumpRail position={[0, 1.32, 0]} args={[railW * 0.92, 0.065, 0.085]} color={c} selected={selected} />
            <FlagPair />
          </>
        );
      case "triple":
        return (
          <>
            <StandardFrame x={-0.62} />
            <StandardFrame x={0.62} />
            <JumpRail position={[0, 1.02, 0]} args={[railW, 0.055, 0.08]} color={c} selected={selected} />
            <JumpRail position={[0, 1.2, 0]} args={[railW * 0.95, 0.055, 0.08]} color={c} selected={selected} />
            <JumpRail position={[0, 1.38, 0]} args={[railW * 0.88, 0.055, 0.08]} color={c} selected={selected} />
            <FlagPair />
          </>
        );
      case "wall":
        return (
          <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.45, 0.95, 0.28]} />
            <meshStandardMaterial
              color={c}
              metalness={0.12}
              roughness={0.65}
              emissive={selected ? c : "#000000"}
              emissiveIntensity={selected ? 0.2 : 0}
            />
          </mesh>
        );
      case "gate":
        return (
          <>
            <StandardFrame x={-0.56} />
            <StandardFrame x={0.56} />
            <mesh position={[0, 0.92, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.35, 0.58, 0.12]} />
              <meshStandardMaterial
                color={c}
                metalness={0.2}
                roughness={0.45}
                emissive={selected ? c : "#000000"}
                emissiveIntensity={selected ? 0.15 : 0}
              />
            </mesh>
            <FlagPair />
          </>
        );
      case "plank":
        return (
          <>
            <StandardFrame x={-0.56} />
            <StandardFrame x={0.56} />
            <mesh position={[0, 1.08, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.35, 0.18, 0.08]} />
              <meshStandardMaterial
                color={c}
                metalness={0.22}
                roughness={0.42}
                emissive={selected ? c : "#000000"}
                emissiveIntensity={selected ? 0.18 : 0}
              />
            </mesh>
            <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.35, 0.12, 0.08]} />
              <meshStandardMaterial color="#f8fafc" metalness={0.18} roughness={0.44} />
            </mesh>
            <FlagPair />
          </>
        );
      case "water":
        return (
          <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[1.15, 32]} />
            <meshStandardMaterial color={c} transparent opacity={0.82} metalness={0.15} roughness={0.2} />
          </mesh>
        );
      case "liverpool":
        return (
          <>
            <StandardFrame x={-0.5} />
            <StandardFrame x={0.5} />
            <JumpRail position={[0, 1.14, 0]} args={[railW * 0.95, 0.07, 0.085]} color={c} selected={selected} />
            <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
              <boxGeometry args={[railW + 0.35, 0.2, 0.85]} />
              <meshStandardMaterial color={c} metalness={0.2} roughness={0.45} transparent opacity={0.9} />
            </mesh>
            <FlagPair />
          </>
        );
      case "combination":
        return (
          <>
            <group position={[-0.85, 0, 0]}>
              <StandardFrame x={-0.32} />
              <StandardFrame x={0.32} />
              <JumpRail position={[0, 1.18, 0]} args={[0.92, 0.07, 0.085]} color={c} selected={selected} />
            </group>
            <group position={[0.85, 0, 0]}>
              <StandardFrame x={-0.38} />
              <StandardFrame x={0.38} />
              <JumpRail position={[0, 1.1, 0]} args={[1.05, 0.07, 0.085]} color={c} selected={selected} />
            </group>
            <FlagPair />
          </>
        );
      default:
        return null;
    }
  }, [template.shape, c, selected, railW]);

  return (
    <group position={[px, 0, pz]} rotation={[0, rotY, 0]} scale={[0.9, 0.9, 0.9]}>
      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {shapeBody}
        {o.isDouble && (
          <Billboard follow position={[0.72, 1.55, 0]}>
            <Text fontSize={0.22} color="#fbbf24" outlineWidth={0.03} outlineColor="#000" fontWeight="900">
              ×2
            </Text>
          </Billboard>
        )}
        <ObstacleNumberLabel n={o.number} />
      </group>
      <mesh
        position={[-0.95, 1.35, 0.35]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDragHandleDown(e);
        }}
      >
        <boxGeometry args={[0.28, 0.22, 0.28]} />
        <meshStandardMaterial color="#334155" metalness={0.3} />
      </mesh>
    </group>
  );
}

function GateMesh({
  kind,
  xPct,
  yPct,
  label,
  selected,
  onSelect,
  onDragDown,
  arenaWidthM,
  arenaLengthM,
}: {
  kind: "start" | "finish";
  xPct: number;
  yPct: number;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onDragDown: (e: ThreeEvent<PointerEvent>) => void;
  arenaWidthM: number;
  arenaLengthM: number;
}) {
  const [x, , z] = pctToWorld(xPct, yPct, 0, arenaWidthM, arenaLengthM);
  const accent = kind === "start" ? "#22c55e" : "#f43f5e";

  return (
    <group position={[x, 0, z]}>
      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <mesh position={[0, 0.28, 0]} castShadow>
          <boxGeometry args={[0.22, 0.56, 0.22]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.2} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.78, 0]} castShadow>
          <boxGeometry args={[1.1, 0.1, 0.12]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={selected ? 0.65 : 0.35}
            metalness={0.15}
            roughness={0.4}
          />
        </mesh>
        <Billboard follow position={[0, 1.32, 0]}>
          <Text fontSize={0.28} color={accent} outlineWidth={0.03} outlineColor="#000" fontWeight="900">
            {label}
          </Text>
        </Billboard>
      </group>
      <mesh
        position={[-0.55, 0.95, 0.35]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDragDown(e);
        }}
      >
        <boxGeometry args={[0.26, 0.22, 0.26]} />
        <meshStandardMaterial color="#475569" metalness={0.25} />
      </mesh>
    </group>
  );
}

function ArenaFence({ halfX, halfZ }: { halfX: number; halfZ: number }) {
  const posts: Array<[number, number, number]> = [];
  const stepX = Math.max(0.75, (halfX * 2) / 13);
  const stepZ = Math.max(0.75, (halfZ * 2) / 18);
  for (let x = -halfX; x <= halfX; x += stepX) {
    posts.push([x, 0.3, -halfZ], [x, 0.3, halfZ]);
  }
  for (let z = -halfZ + stepZ; z <= halfZ - stepZ; z += stepZ) {
    posts.push([-halfX, 0.3, z], [halfX, 0.3, z]);
  }

  return (
    <group>
      {/* rails */}
      <mesh position={[0, 0.48, -halfZ]} castShadow>
        <boxGeometry args={[halfX * 2 + 0.2, 0.06, 0.06]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[0, 0.72, -halfZ]} castShadow>
        <boxGeometry args={[halfX * 2 + 0.2, 0.06, 0.06]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[0, 0.48, halfZ]} castShadow>
        <boxGeometry args={[halfX * 2 + 0.2, 0.06, 0.06]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[0, 0.72, halfZ]} castShadow>
        <boxGeometry args={[halfX * 2 + 0.2, 0.06, 0.06]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[-halfX, 0.48, 0]} castShadow>
        <boxGeometry args={[0.06, 0.06, halfZ * 2 + 0.2]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[-halfX, 0.72, 0]} castShadow>
        <boxGeometry args={[0.06, 0.06, halfZ * 2 + 0.2]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[halfX, 0.48, 0]} castShadow>
        <boxGeometry args={[0.06, 0.06, halfZ * 2 + 0.2]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[halfX, 0.72, 0]} castShadow>
        <boxGeometry args={[0.06, 0.06, halfZ * 2 + 0.2]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>

      {/* posts */}
      {posts.map((p, idx) => (
        <mesh key={idx} position={p} castShadow>
          <boxGeometry args={[0.07, 0.6, 0.07]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function CoursePathArrows({
  points,
  arenaWidthM,
  arenaLengthM,
}: {
  points: Array<{ xPct: number; yPct: number }>;
  arenaWidthM: number;
  arenaLengthM: number;
}) {
  const segments = useMemo(() => {
    const arr: Array<{ mid: Vector3; end: Vector3; q: Quaternion; len: number }> = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [sx, , sz] = pctToWorld(points[i].xPct, points[i].yPct, 0.06, arenaWidthM, arenaLengthM);
      const [ex, , ez] = pctToWorld(points[i + 1].xPct, points[i + 1].yPct, 0.06, arenaWidthM, arenaLengthM);
      const start = new Vector3(sx, 0.06, sz);
      const end = new Vector3(ex, 0.06, ez);
      const dir = new Vector3().subVectors(end, start);
      const len = dir.length();
      if (len < 0.35) continue;
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
      const mid = new Vector3().addVectors(start, end).multiplyScalar(0.5);
      arr.push({ mid, end, q, len });
    }
    return arr;
  }, [points, arenaWidthM, arenaLengthM]);

  return (
    <group>
      {segments.map((s, idx) => (
        <group key={idx}>
          <mesh position={[s.mid.x, 0.07, s.mid.z]} quaternion={s.q}>
            <cylinderGeometry args={[0.028, 0.028, s.len * 0.78, 9]} />
            <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[s.end.x, 0.09, s.end.z]} quaternion={s.q}>
            <coneGeometry args={[0.09, 0.22, 12]} />
            <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={0.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SceneContent({
  obstacles,
  templateById,
  selectedId,
  setSelectedId,
  setSelectedGate,
  startPct,
  finishPct,
  selectedGate,
  startLabel,
  finishLabel,
  orbitRef,
  onObstacleDragHandle,
  onGateDragHandle,
  arenaWidthM,
  arenaLengthM,
  pathPoints,
}: {
  obstacles: CourseMapObstacle[];
  templateById: (id: string) => ObstacleTemplate;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setSelectedGate: (g: "start" | "finish" | null) => void;
  startPct: { xPct: number; yPct: number };
  finishPct: { xPct: number; yPct: number };
  selectedGate: "start" | "finish" | null;
  startLabel: string;
  finishLabel: string;
  orbitRef: React.RefObject<any>;
  onObstacleDragHandle: (o: CourseMapObstacle, nativeEvent: PointerEvent) => void;
  onGateDragHandle: (kind: "start" | "finish", nativeEvent: PointerEvent) => void;
  arenaWidthM: number;
  arenaLengthM: number;
  pathPoints: Array<{ xPct: number; yPct: number }>;
}) {
  const { halfX, halfZ } = useMemo(() => arenaHalfSize(arenaWidthM, arenaLengthM), [arenaWidthM, arenaLengthM]);

  return (
    <>
      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2 - 0.04}
        minPolarAngle={0.25}
        minDistance={7}
        maxDistance={26}
        target={[0, 0, 0]}
      />

      <ambientLight intensity={0.75} />
      <directionalLight
        position={[8, 16, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-6, 9, -4]} intensity={0.45} color="#fff3d6" />

      <group>
        {/* grass around the arena */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[halfX * 2 + 4.8, halfZ * 2 + 4.8]} />
          <meshStandardMaterial color="#1f7a35" roughness={0.95} metalness={0.02} />
        </mesh>
        {/* sand arena */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow>
          <planeGeometry args={[halfX * 2, halfZ * 2]} />
          <meshStandardMaterial color="#cda365" roughness={0.96} metalness={0.01} />
        </mesh>

        <ArenaFence halfX={halfX} halfZ={halfZ} />
        <CoursePathArrows points={pathPoints} arenaWidthM={arenaWidthM} arenaLengthM={arenaLengthM} />

        {obstacles.map((o) => (
          <ObstacleMesh3D
            key={o.id}
            o={o}
            template={templateById(o.templateId)}
            selected={selectedId === o.id}
            onSelect={() => {
              setSelectedId(o.id);
              setSelectedGate(null);
            }}
            onDragHandleDown={(e) => onObstacleDragHandle(o, e.nativeEvent)}
            arenaWidthM={arenaWidthM}
            arenaLengthM={arenaLengthM}
          />
        ))}

        <GateMesh
          kind="start"
          xPct={startPct.xPct}
          yPct={startPct.yPct}
          label={startLabel}
          selected={selectedGate === "start"}
          onSelect={() => {
            setSelectedGate("start");
            setSelectedId(null);
          }}
          onDragDown={(e) => onGateDragHandle("start", e.nativeEvent)}
          arenaWidthM={arenaWidthM}
          arenaLengthM={arenaLengthM}
        />
        <GateMesh
          kind="finish"
          xPct={finishPct.xPct}
          yPct={finishPct.yPct}
          label={finishLabel}
          selected={selectedGate === "finish"}
          onSelect={() => {
            setSelectedGate("finish");
            setSelectedId(null);
          }}
          onDragDown={(e) => onGateDragHandle("finish", e.nativeEvent)}
          arenaWidthM={arenaWidthM}
          arenaLengthM={arenaLengthM}
        />
      </group>
    </>
  );
}

export function CourseMap3D({
  raycastGroundRef,
  orbitRef,
  obstacles,
  templateById,
  selectedId,
  setSelectedId,
  selectedGate,
  setSelectedGate,
  startPct,
  finishPct,
  startLabel,
  finishLabel,
  onPointerMissed,
  onObstacleDragHandle,
  onGateDragHandle,
  arenaWidthM: _arenaWidthM,
  arenaLengthM: _arenaLengthM,
  pathPoints: _pathPoints,
}: {
  raycastGroundRef: React.MutableRefObject<RaycastGroundFn | null>;
  orbitRef: React.RefObject<any>;
  obstacles: CourseMapObstacle[];
  templateById: (id: string) => ObstacleTemplate;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedGate: "start" | "finish" | null;
  setSelectedGate: (g: "start" | "finish" | null) => void;
  startPct: { xPct: number; yPct: number };
  finishPct: { xPct: number; yPct: number };
  startLabel: string;
  finishLabel: string;
  onPointerMissed: () => void;
  onObstacleDragHandle: (o: CourseMapObstacle, e: PointerEvent) => void;
  onGateDragHandle: (kind: "start" | "finish", e: PointerEvent) => void;
  arenaWidthM?: number;
  arenaLengthM?: number;
  pathPoints?: Array<{ xPct: number; yPct: number }>;
}) {
  return (
    <Canvas
      shadows
      camera={{ position: [7.5, 11.2, 10.2], fov: 42, near: 0.1, far: 80 }}
      gl={{ alpha: false, antialias: true }}
      onPointerMissed={onPointerMissed}
      className="!absolute inset-0 touch-none"
      style={{ background: "linear-gradient(180deg, #dbe7f0 0%, #c5d8e6 70%, #b7cfdc 100%)" }}
    >
      <RaycastRegister raycastRef={raycastGroundRef} />
      <SceneContent
        obstacles={obstacles}
        templateById={templateById}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        setSelectedGate={setSelectedGate}
        startPct={startPct}
        finishPct={finishPct}
        selectedGate={selectedGate}
        startLabel={startLabel}
        finishLabel={finishLabel}
        orbitRef={orbitRef}
        onObstacleDragHandle={onObstacleDragHandle}
        onGateDragHandle={onGateDragHandle}
        arenaWidthM={_arenaWidthM ?? 40}
        arenaLengthM={_arenaLengthM ?? 80}
        pathPoints={_pathPoints ?? []}
      />
    </Canvas>
  );
}
