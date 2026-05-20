import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { buildCurvedCoursePath, pointsToBroadcastSplineD } from "./coursePlanner";
import {
  arenaIsoPolygon,
  boundsOfPoints,
  outerGroundIsoPolygon,
  projectPctToIso,
  type IsoProjectConfig,
} from "./isometricProjection";
import {
  toPremiumObstacleKind,
  type PremiumCourseModel,
  type PremiumMapObstacleShape,
  type PremiumObstacleModel,
} from "./courseMapPremiumTypes";
import { ARENA_ASSETS, MARKER_ASSETS } from "./courseAssetPaths";
import { PremiumObstacleSprite } from "./PremiumObstacleSprite";

export type PremiumInputObstacle = {
  id: string;
  templateId: string;
  number: number;
  xPct: number;
  yPct: number;
  color: string;
  isDouble?: boolean;
};

const CANVAS_W = 1600;
const CANVAS_H = 980;

export function CourseMapPremium({
  obstacles,
  startPct,
  finishPct,
  arenaWidthM,
  arenaLengthM,
  obstacleHeightM,
  obstacleLabel,
  obstacleShape,
  deckTitle,
  deckSubtitle,
}: {
  obstacles: PremiumInputObstacle[];
  startPct: { xPct: number; yPct: number };
  finishPct: { xPct: number; yPct: number };
  arenaWidthM: number;
  arenaLengthM: number;
  obstacleHeightM: number;
  obstacleLabel: (templateId: string) => string;
  obstacleShape: (templateId: string) => PremiumMapObstacleShape;
  /** כותרת אירוע — אינפוגרפיקה */
  deckTitle?: string;
  /** תת־כותרת (למשל שם מחלקה) */
  deckSubtitle?: string;
}) {
  const { t } = useTranslation();
  const cfg: IsoProjectConfig = useMemo(
    () => ({
      arenaWidthM,
      arenaLengthM,
      canvasWidth: CANVAS_W,
      canvasHeight: CANVAS_H,
      scale: 19.6,
      originX: CANVAS_W * 0.5,
      originY: CANVAS_H * 0.56,
    }),
    [arenaWidthM, arenaLengthM]
  );

  const model: PremiumCourseModel = useMemo(
    () => ({
      arena: { widthM: arenaWidthM, lengthM: arenaLengthM, sandTone: "#c9a06c" },
      start: startPct,
      finish: finishPct,
      obstacles: obstacles
        .slice()
        .sort((a, b) => a.number - b.number)
        .map<PremiumObstacleModel>((o) => ({
          id: o.id,
          number: o.number,
          name: obstacleLabel(o.templateId),
          kind: toPremiumObstacleKind(o.templateId),
          xPct: o.xPct,
          yPct: o.yPct,
          rotationDeg: 0,
          color: o.color,
          heightM: obstacleHeightM,
          widthM: o.isDouble ? 3.4 : 2.4,
          isCombination: o.isDouble,
        })),
    }),
    [arenaWidthM, arenaLengthM, startPct, finishPct, obstacles, obstacleLabel, obstacleHeightM]
  );

  const arenaPoly = useMemo(() => arenaIsoPolygon(cfg), [cfg]);
  const outerPoly = useMemo(() => outerGroundIsoPolygon(cfg), [cfg]);

  const viewBoxStr = useMemo(() => {
    const pts = [
      ...outerPoly,
      ...arenaPoly,
      projectPctToIso(model.start.xPct, model.start.yPct, 0, cfg),
      projectPctToIso(model.finish.xPct, model.finish.yPct, 0, cfg),
      ...model.obstacles.map((o) => projectPctToIso(o.xPct, o.yPct, 0, cfg)),
    ];
    const b = boundsOfPoints(pts);
    const padX = (b.maxX - b.minX) * 0.028 + 16;
    const padY = (b.maxY - b.minY) * 0.04 + 18;
    const w = b.maxX - b.minX + 2 * padX;
    const h = b.maxY - b.minY + 2 * padY;
    return `${b.minX - padX} ${b.minY - padY} ${w} ${h}`;
  }, [outerPoly, arenaPoly, model, cfg]);

  const route = useMemo(
    () =>
      buildCurvedCoursePath(
        [model.start, ...model.obstacles.map((o) => ({ xPct: o.xPct, yPct: o.yPct })), model.finish],
        26
      ),
    [model]
  );

  const pathProjected = useMemo(() => {
    return route.map((p) => projectPctToIso(p.xPct, p.yPct, 0.025, cfg));
  }, [route, cfg]);

  const pathD = useMemo(() => pointsToBroadcastSplineD(pathProjected), [pathProjected]);

  const projected = useMemo(() => {
    return model.obstacles.map((o) => {
      const base = projectPctToIso(o.xPct, o.yPct, 0, cfg);
      return { ...o, sx: base.x, sy: base.y, depthKey: base.y };
    });
  }, [model.obstacles, cfg]);

  const sorted = useMemo(() => projected.slice().sort((a, b) => a.depthKey - b.depthKey), [projected]);

  const bushPositions = useMemo(() => {
    const spots = [
      { xPct: -2, yPct: 7, seed: 1 },
      { xPct: 5, yPct: -1, seed: 2 },
      { xPct: 102, yPct: 6, seed: 3 },
      { xPct: 104, yPct: 94, seed: 4 },
      { xPct: -3, yPct: 93, seed: 5 },
      { xPct: 48, yPct: -2, seed: 6 },
    ];
    return spots.map((s) => ({
      ...projectPctToIso(s.xPct, s.yPct, 0, cfg),
      seed: s.seed,
    }));
  }, [cfg]);

  const flowerSpots = useMemo(() => {
    const spots = [
      { xPct: 2, yPct: 22 },
      { xPct: 98, yPct: 18 },
      { xPct: 101, yPct: 72 },
      { xPct: -1, yPct: 68 },
      { xPct: 8, yPct: 96 },
      { xPct: 92, yPct: 4 },
    ];
    return spots.map((s) => projectPctToIso(s.xPct, s.yPct, 0, cfg));
  }, [cfg]);

  const grassBounds = useMemo(() => {
    const b = boundsOfPoints(outerPoly);
    const pad = 420;
    return { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + 2 * pad, h: b.maxY - b.minY + 2 * pad };
  }, [outerPoly]);

  const sandBounds = useMemo(() => boundsOfPoints(arenaPoly), [arenaPoly]);
  const sandW = sandBounds.maxX - sandBounds.minX;
  const sandH = sandBounds.maxY - sandBounds.minY;

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-xl border border-[#c4b59a]/55 shadow-[0_24px_80px_rgba(44,36,24,0.12)]"
      style={{
        background: "linear-gradient(165deg, #e8f4fc 0%, #f5efe3 38%, #ebe4d4 72%, #ddd3bf 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-[2] rounded-xl"
        style={{
          background:
            "radial-gradient(ellipse 85% 55% at 50% 18%, rgba(255,255,255,0.55) 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 70% 90%, rgba(255,248,230,0.35) 0%, transparent 45%)",
        }}
      />

      {(deckTitle || deckSubtitle) && (
        <div className="pointer-events-none absolute left-0 right-0 top-3 z-[4] flex flex-col items-center gap-0.5 px-6 text-center">
          {deckTitle && (
            <p className="font-serif text-[clamp(0.95rem,2.2vw,1.35rem)] font-bold tracking-[0.04em] text-[#2c2419] drop-shadow-sm">
              {deckTitle}
            </p>
          )}
          {deckSubtitle && (
            <p className="font-serif text-[clamp(0.72rem,1.5vw,0.95rem)] italic text-[#5c5346]">{deckSubtitle}</p>
          )}
        </div>
      )}

      <div className="absolute inset-0 z-[1]">
        <svg
          viewBox={viewBoxStr}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={deckTitle ?? "Course map"}
        >
          <defs>
            <clipPath id="arenaSandClip">
              <polygon points={arenaPoly.map((p) => `${p.x},${p.y}`).join(" ")} />
            </clipPath>
            <filter id="spriteAssetDrop" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="3" dy="8" stdDeviation="5" floodColor="#1a1510" floodOpacity="0.38" />
            </filter>
            <linearGradient id="ribbonBody" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(255,251,235,0.95)" />
              <stop offset="40%" stopColor="rgba(234,179,8,0.88)" />
              <stop offset="100%" stopColor="rgba(254,243,199,0.92)" />
            </linearGradient>
            <linearGradient id="ribbonSheen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.62)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            <filter id="arenaShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="14" />
              <feOffset dx="0" dy="10" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.5" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="ribbonShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="8" />
              <feOffset dx="0" dy="6" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.28" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <image
            href={ARENA_ASSETS.grassField}
            x={grassBounds.x}
            y={grassBounds.y}
            width={grassBounds.w}
            height={grassBounds.h}
            preserveAspectRatio="none"
            opacity={0.98}
          />

          <polygon
            points={outerPoly.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#f5f5f4"
            strokeWidth="6.5"
            strokeLinejoin="round"
            opacity="0.96"
          />
          <polygon
            points={outerPoly.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="rgba(28,24,18,0.28)"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />

          {flowerSpots.map((p, i) => (
            <g key={`fl-${i}`} transform={`translate(${p.x},${p.y})`} opacity={0.88}>
              <circle cx={-4} cy={2} r={3.2} fill="#f9a8d4" />
              <circle cx={4} cy={0} r={2.8} fill="#fde047" />
              <circle cx={0} cy={-4} r={2.5} fill="#fda4af" />
            </g>
          ))}

          {bushPositions.map((b, i) => (
            <image
              key={`bush-${i}`}
              href={ARENA_ASSETS.bushCluster}
              x={b.x - 56}
              y={b.y - 42}
              width={112}
              height={84}
              preserveAspectRatio="xMidYMid meet"
              opacity={0.94}
            />
          ))}

          <ellipse
            cx={(arenaPoly[0].x + arenaPoly[2].x) / 2}
            cy={arenaPoly[2].y + 28}
            rx={Math.abs(arenaPoly[2].x - arenaPoly[0].x) * 0.42}
            ry={36}
            fill="rgba(0,0,0,0.2)"
            filter="url(#arenaShadow)"
            opacity="0.85"
          />

          <g clipPath="url(#arenaSandClip)">
            <image
              href={ARENA_ASSETS.sandSurface}
              x={sandBounds.minX}
              y={sandBounds.minY}
              width={sandW}
              height={sandH}
              preserveAspectRatio="none"
              opacity={0.95}
            />
          </g>

          <polygon
            points={arenaPoly.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#fafaf9"
            strokeWidth="3.8"
            strokeLinejoin="round"
          />
          <polygon
            points={arenaPoly.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="rgba(255,250,240,0.55)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <polygon
            points={arenaPoly.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="rgba(62,48,32,0.18)"
            strokeWidth="7"
            strokeLinejoin="round"
            opacity="0.45"
          />

          <path
            d={pathD}
            fill="none"
            stroke="rgba(44,36,22,0.12)"
            strokeWidth="44"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#ribbonShadow)"
            opacity="0.9"
          />
          <path
            d={pathD}
            fill="none"
            stroke="url(#ribbonBody)"
            strokeWidth="28"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.94"
          />
          <path
            d={pathD}
            fill="none"
            stroke="url(#ribbonSheen)"
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.42"
          />
          <path
            d={pathD}
            fill="none"
            stroke="#fffefb"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />

          {sorted.map((o) => {
            const shape = obstacleShape(obstacles.find((x) => x.id === o.id)?.templateId ?? "vertical");
            return (
              <g key={o.id} transform={`translate(${o.sx},${o.sy})`} style={{ pointerEvents: "none" }}>
                <PremiumObstacleSprite shape={shape} number={o.number} isDouble={!!o.isCombination} />
              </g>
            );
          })}

          {(() => {
            const s = projectPctToIso(model.start.xPct, model.start.yPct, 0.02, cfg);
            const f = projectPctToIso(model.finish.xPct, model.finish.yPct, 0.02, cfg);
            const markerSize = 62;
            const markerHalf = markerSize / 2;
            return (
              <>
                <g transform={`translate(${s.x},${s.y})`} style={{ pointerEvents: "none" }}>
                  <image
                    href={MARKER_ASSETS.start}
                    x={-markerHalf}
                    y={-markerHalf - 8}
                    width={markerSize}
                    height={markerSize}
                    preserveAspectRatio="xMidYMid meet"
                    filter="url(#spriteAssetDrop)"
                  />
                  <text
                    x={0}
                    y={-markerHalf - 20}
                    textAnchor="middle"
                    fill="#14532d"
                    fontSize={15}
                    fontWeight="800"
                    fontFamily="Georgia, 'Times New Roman', serif"
                    letterSpacing="0.14em"
                  >
                    START
                  </text>
                </g>
                <g transform={`translate(${f.x},${f.y})`} style={{ pointerEvents: "none" }}>
                  <image
                    href={MARKER_ASSETS.finish}
                    x={-markerHalf}
                    y={-markerHalf - 8}
                    width={markerSize}
                    height={markerSize}
                    preserveAspectRatio="xMidYMid meet"
                    filter="url(#spriteAssetDrop)"
                  />
                  <text
                    x={0}
                    y={-markerHalf - 20}
                    textAnchor="middle"
                    fill="#7f1d1d"
                    fontSize={15}
                    fontWeight="800"
                    fontFamily="Georgia, 'Times New Roman', serif"
                    letterSpacing="0.14em"
                  >
                    FINISH
                  </text>
                </g>
              </>
            );
          })()}
        </svg>
      </div>

      <p
        className="pointer-events-none absolute bottom-3 left-0 right-0 z-[3] text-center font-serif text-[10px] uppercase tracking-[0.25em] text-[#6b5f4f]/85"
        style={{ textShadow: "0 1px 0 rgba(255,255,255,0.6)" }}
      >
        {t("courseMap.presentationFooter")}
      </p>
    </div>
  );
}
