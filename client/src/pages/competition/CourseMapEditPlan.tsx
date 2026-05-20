import { CourseObstacleArt, type CourseObstacleShape } from "./CourseObstacleArt";

export type EditPlanObstacle = {
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
  shape: CourseObstacleShape;
};

export function CourseMapEditPlan({
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
  onBackgroundPointerDown,
  onObstacleDragHandle,
  onGateDragHandle,
  pathPoints,
  obstacleHeightM,
}: {
  obstacles: EditPlanObstacle[];
  templateById: (id: string) => ObstacleTemplate;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedGate: "start" | "finish" | null;
  setSelectedGate: (g: "start" | "finish" | null) => void;
  startPct: { xPct: number; yPct: number };
  finishPct: { xPct: number; yPct: number };
  startLabel: string;
  finishLabel: string;
  onBackgroundPointerDown: () => void;
  onObstacleDragHandle: (o: EditPlanObstacle, e: React.PointerEvent<SVGElement>) => void;
  onGateDragHandle: (kind: "start" | "finish", e: PointerEvent) => void;
  pathPoints: Array<{ xPct: number; yPct: number }>;
  obstacleHeightM: number;
}) {
  const routeD = pathPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.xPct} ${p.yPct}`).join(" ");
  const sorted = [...obstacles].sort((a, b) => a.number - b.number);

  return (
    <div className="absolute inset-0 overflow-hidden rounded-[inherit] bg-[#f8fafc]">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full touch-none select-none"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="planGrass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#edf7ec" />
            <stop offset="100%" stopColor="#dbeed7" />
          </linearGradient>
          <linearGradient id="planSand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7efd8" />
            <stop offset="100%" stopColor="#efdfb9" />
          </linearGradient>
        </defs>

        <rect
          x={0}
          y={0}
          width={100}
          height={100}
          fill="transparent"
          onPointerDown={() => onBackgroundPointerDown()}
        />

        <rect x={2} y={2} width={96} height={96} rx={1.1} fill="url(#planGrass)" />
        <rect x={7} y={7} width={86} height={86} rx={0.45} fill="url(#planSand)" stroke="#ffffff" strokeWidth={0.55} />
        <rect x={7} y={7} width={86} height={86} rx={0.45} fill="none" stroke="#d0c3a4" strokeWidth={0.3} />

        {routeD && (
          <path
            d={routeD}
            fill="none"
            stroke="#c7961f"
            strokeOpacity={0.72}
            strokeWidth={0.85}
            strokeDasharray="2.1 1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}

        {sorted.map((o) => {
          const t = templateById(o.templateId);
          const sel = selectedId === o.id;
          return (
            <g key={o.id} transform={`translate(${o.xPct}, ${o.yPct})`}>
              {sel && (
                <ellipse
                  cx={0}
                  cy={2.4}
                  rx={7.8}
                  ry={4.2}
                  fill="none"
                  stroke="#0f766e"
                  strokeWidth={0.55}
                  pointerEvents="none"
                />
              )}
              <g
                transform="translate(-22, -30)"
                className="cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelectedId(o.id);
                  setSelectedGate(null);
                }}
              >
                <CourseObstacleArt shape={t.shape} color={o.color} compact obstacleHeightM={obstacleHeightM} />
              </g>
              <circle cx={0} cy={-9.2} r={2.9} fill="#ffffff" stroke="#374151" strokeWidth={0.35} pointerEvents="none" />
              <text
                x={0}
                y={-8.2}
                textAnchor="middle"
                fill="#111827"
                fontSize={3.5}
                fontWeight="800"
                pointerEvents="none"
              >
                {o.number}
              </text>
              <rect
                x={6}
                y={6}
                width={6.5}
                height={6.5}
                rx={0.8}
                fill="#1f2937"
                stroke="#ffffff"
                strokeWidth={0.28}
                className="cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelectedId(o.id);
                  setSelectedGate(null);
                  onObstacleDragHandle(o, e);
                }}
              />
            </g>
          );
        })}

        <g transform={`translate(${startPct.xPct}, ${startPct.yPct})`}>
          <circle
            r={3.2}
            fill={selectedGate === "start" ? "#15803d" : "#16a34a"}
            stroke="#ffffff"
            strokeWidth={0.45}
            className="cursor-pointer"
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelectedGate("start");
              setSelectedId(null);
            }}
          />
          <text
            x={0}
            y={1}
            textAnchor="middle"
            fill="white"
            fontSize={2.8}
            fontWeight="800"
            pointerEvents="none"
          >
            S
          </text>
          <rect
            x={4.8}
            y={-5.2}
            width={5.8}
            height={5.8}
            rx={0.8}
            fill="#1f2937"
            stroke="#ffffff"
            strokeWidth={0.25}
            className="cursor-grab"
            onPointerDown={(e) => {
              e.stopPropagation();
              onGateDragHandle("start", e.nativeEvent);
            }}
          />
        </g>
        <text
          x={startPct.xPct}
          y={startPct.yPct - 5.1}
          textAnchor="middle"
          fill="#14532d"
          fontSize={2.8}
          fontWeight="800"
          pointerEvents="none"
        >
          {startLabel}
        </text>

        <g transform={`translate(${finishPct.xPct}, ${finishPct.yPct})`}>
          <circle
            r={3.2}
            fill={selectedGate === "finish" ? "#b91c1c" : "#dc2626"}
            stroke="#ffffff"
            strokeWidth={0.45}
            className="cursor-pointer"
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelectedGate("finish");
              setSelectedId(null);
            }}
          />
          <text
            x={0}
            y={1}
            textAnchor="middle"
            fill="white"
            fontSize={2.8}
            fontWeight="800"
            pointerEvents="none"
          >
            F
          </text>
          <rect
            x={4.8}
            y={-5.2}
            width={5.8}
            height={5.8}
            rx={0.8}
            fill="#1f2937"
            stroke="#ffffff"
            strokeWidth={0.25}
            className="cursor-grab"
            onPointerDown={(e) => {
              e.stopPropagation();
              onGateDragHandle("finish", e.nativeEvent);
            }}
          />
        </g>
        <text
          x={finishPct.xPct}
          y={finishPct.yPct - 5.1}
          textAnchor="middle"
          fill="#7f1d1d"
          fontSize={2.8}
          fontWeight="800"
          pointerEvents="none"
        >
          {finishLabel}
        </text>
      </svg>
    </div>
  );
}
