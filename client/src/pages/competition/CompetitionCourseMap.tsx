import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPinned, Trash2, GripVertical, RotateCcw, Layers, Maximize2, Minimize2, SlidersHorizontal, Wand2 } from "lucide-react";
import clsx from "clsx";
import type { Competition, ShowClass } from "../../lib/types";
import { api } from "../../lib/api";
import { CourseObstacleArt } from "./CourseObstacleArt";
import { CourseMapEditPlan } from "./CourseMapEditPlan";
import { CourseMapPremium } from "./CourseMapPremium";

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
}

const STORAGE_KEY = "course-map-state-v1";
const VIEW_MODE_KEY = "course-map-view-mode-v1";

const DEFAULT_START = { xPct: 10, yPct: 18 };
const DEFAULT_FINISH = { xPct: 90, yPct: 82 };

type ObstacleTemplate = {
  id: string;
  defaultColor: string;
  shape: "vertical" | "oxer" | "triple" | "wall" | "water" | "liverpool" | "combination" | "gate" | "plank";
};

const TEMPLATES: ObstacleTemplate[] = [
  { id: "vertical", defaultColor: "#22d3ee", shape: "vertical" },
  { id: "oxer", defaultColor: "#a855f7", shape: "oxer" },
  { id: "triple", defaultColor: "#f472b6", shape: "triple" },
  { id: "wall", defaultColor: "#94a3b8", shape: "wall" },
  { id: "gate", defaultColor: "#8b5cf6", shape: "gate" },
  { id: "plank", defaultColor: "#f97316", shape: "plank" },
  { id: "water", defaultColor: "#3b82f6", shape: "water" },
  { id: "liverpool", defaultColor: "#14b8a6", shape: "liverpool" },
  { id: "combination", defaultColor: "#f59e0b", shape: "combination" },
];

export type PlacedObstacle = {
  id: string;
  templateId: string;
  number: number;
  color: string;
  isDouble: boolean;
  xPct: number;
  yPct: number;
  /** סיבוב ביחס לאמצע המכשול (מעלות) */
  rotationDeg: number;
};

type MapState = {
  obstacles: PlacedObstacle[];
  startPct: { xPct: number; yPct: number };
  finishPct: { xPct: number; yPct: number };
  arenaWidthM: number;
  arenaLengthM: number;
  targetObstacles: number;
  obstacleHeightM: number;
  includedTemplateIds: string[];
};

type MapViewMode = "edit" | "presentation";

function normalizeState(raw: unknown): MapState {
  const s = raw as Partial<MapState>;
  const obstaclesRaw = Array.isArray(s?.obstacles) ? s.obstacles : [];
  const obstacles: PlacedObstacle[] = obstaclesRaw.map((o) => {
    const ob = o as PlacedObstacle;
    return {
      ...ob,
      rotationDeg: 0,
    };
  });
  return {
    obstacles,
    startPct:
      s?.startPct && typeof s.startPct.xPct === "number" && typeof s.startPct.yPct === "number"
        ? s.startPct
        : { ...DEFAULT_START },
    finishPct:
      s?.finishPct && typeof s.finishPct.xPct === "number" && typeof s.finishPct.yPct === "number"
        ? s.finishPct
        : { ...DEFAULT_FINISH },
    arenaWidthM:
      typeof s?.arenaWidthM === "number" && Number.isFinite(s.arenaWidthM)
        ? Math.max(20, Math.min(120, s.arenaWidthM))
        : DEFAULT_ARENA_WIDTH_M,
    arenaLengthM:
      typeof s?.arenaLengthM === "number" && Number.isFinite(s.arenaLengthM)
        ? Math.max(40, Math.min(180, s.arenaLengthM))
        : DEFAULT_ARENA_LENGTH_M,
    targetObstacles:
      typeof s?.targetObstacles === "number" && Number.isFinite(s.targetObstacles)
        ? Math.max(6, Math.min(20, Math.round(s.targetObstacles)))
        : DEFAULT_TARGET_OBSTACLES,
    obstacleHeightM:
      typeof s?.obstacleHeightM === "number" && Number.isFinite(s.obstacleHeightM)
        ? Math.max(0.6, Math.min(MAX_OBSTACLE_HEIGHT_M, s.obstacleHeightM))
        : DEFAULT_OBSTACLE_HEIGHT_M,
    includedTemplateIds: Array.isArray(s?.includedTemplateIds)
      ? s.includedTemplateIds.filter((id): id is string => typeof id === "string" && TEMPLATES.some((t) => t.id === id))
      : TEMPLATES.map((t) => t.id),
  };
}

function loadState(classId: string): MapState {
  if (!classId) {
    return {
      obstacles: [],
      startPct: { ...DEFAULT_START },
      finishPct: { ...DEFAULT_FINISH },
      arenaWidthM: DEFAULT_ARENA_WIDTH_M,
      arenaLengthM: DEFAULT_ARENA_LENGTH_M,
      targetObstacles: DEFAULT_TARGET_OBSTACLES,
      obstacleHeightM: DEFAULT_OBSTACLE_HEIGHT_M,
      includedTemplateIds: TEMPLATES.map((t) => t.id),
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return normalizeState(all[classId]);
  } catch {
    return normalizeState(undefined);
  }
}

function persistState(classId: string, state: MapState) {
  if (!classId) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, MapState>) : {};
    all[classId] = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

const PRESET_COLORS = [
  "#22d3ee",
  "#a855f7",
  "#f472b6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#e2e8f0",
  "#1e293b",
];

const DEFAULT_ARENA_WIDTH_M = 40;
const DEFAULT_ARENA_LENGTH_M = 80;
const DEFAULT_TARGET_OBSTACLES = 10;
const DEFAULT_OBSTACLE_HEIGHT_M = 1.3;
const MAX_OBSTACLE_HEIGHT_M = 1.75;

function pctDistanceInMeters(
  a: { xPct: number; yPct: number },
  b: { xPct: number; yPct: number },
  arenaWidthM: number,
  arenaLengthM: number
) {
  const dxM = ((a.xPct - b.xPct) / 92) * arenaWidthM;
  const dyM = ((a.yPct - b.yPct) / 84) * arenaLengthM;
  return Math.hypot(dxM, dyM);
}

type GateKind = "start" | "finish";

export function CompetitionCourseMap() {
  const { t, i18n } = useTranslation();
  const { competitionId, competition } = useOutletContext<OutletCtx>();
  const [searchParams] = useSearchParams();
  const classId = searchParams.get("classId") ?? "";
  const mapRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const { data: classes = [] } = useQuery<ShowClass[]>({
    queryKey: ["classes", competitionId],
    queryFn: () => api.get(`/classes?competitionId=${competitionId}`),
    enabled: !!competitionId,
  });
  const activeClassName = classes.find((c) => c.id === classId)?.name;
  const [obstacles, setObstacles] = useState<PlacedObstacle[]>([]);
  const [paletteDragOver, setPaletteDragOver] = useState(false);
  const [startPct, setStartPct] = useState(DEFAULT_START);
  const [finishPct, setFinishPct] = useState(DEFAULT_FINISH);
  const [arenaWidthM, setArenaWidthM] = useState(DEFAULT_ARENA_WIDTH_M);
  const [arenaLengthM, setArenaLengthM] = useState(DEFAULT_ARENA_LENGTH_M);
  const [targetObstacles, setTargetObstacles] = useState(DEFAULT_TARGET_OBSTACLES);
  const [obstacleHeightM, setObstacleHeightM] = useState(DEFAULT_OBSTACLE_HEIGHT_M);
  const [includedTemplateIds, setIncludedTemplateIds] = useState<string[]>(TEMPLATES.map((t) => t.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGate, setSelectedGate] = useState<GateKind | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("edit");

  useEffect(() => {
    const s = loadState(classId);
    setObstacles(s.obstacles);
    setStartPct(s.startPct);
    setFinishPct(s.finishPct);
    setArenaWidthM(s.arenaWidthM);
    setArenaLengthM(s.arenaLengthM);
    setTargetObstacles(s.targetObstacles);
    setObstacleHeightM(s.obstacleHeightM);
    setIncludedTemplateIds(s.includedTemplateIds.length ? s.includedTemplateIds : TEMPLATES.map((t) => t.id));
    setSelectedId(null);
    setSelectedGate(null);
    try {
      const raw = localStorage.getItem(VIEW_MODE_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      const mode = all[classId];
      if (mode === "premium" || mode === "presentation") setMapViewMode("presentation");
      else if (mode === "edit3d" || mode === "edit") setMapViewMode("edit");
      else setMapViewMode("edit");
    } catch {
      setMapViewMode("edit");
    }
  }, [classId]);

  useEffect(() => {
    persistState(classId, {
      obstacles,
      startPct,
      finishPct,
      arenaWidthM,
      arenaLengthM,
      targetObstacles,
      obstacleHeightM,
      includedTemplateIds,
    });
  }, [classId, obstacles, startPct, finishPct, arenaWidthM, arenaLengthM, targetObstacles, obstacleHeightM, includedTemplateIds]);

  useEffect(() => {
    if (!classId) return;
    try {
      const raw = localStorage.getItem(VIEW_MODE_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, MapViewMode>) : {};
      all[classId] = mapViewMode;
      localStorage.setItem(VIEW_MODE_KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }, [classId, mapViewMode]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const nextNumber = useCallback(() => {
    const used = new Set(obstacles.map((o) => o.number));
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }, [obstacles]);

  const templateById = useCallback((id: string) => TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0], []);

  const dragPercent = (
    e: { preventDefault: () => void; clientX: number; clientY: number },
    initial: { xPct: number; yPct: number },
    apply: (xPct: number, yPct: number) => void
  ) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = initial.xPct;
    const oy = initial.yPct;

    const move = (ev: PointerEvent) => {
      const el = mapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      const xPct = Math.round(Math.min(96, Math.max(4, ox + dx)));
      const yPct = Math.round(Math.min(92, Math.max(8, oy + dy)));
      apply(xPct, yPct);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onDropOnMap = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/course-obstacle");
    if (!raw) return;
    try {
      const { templateId } = JSON.parse(raw) as { templateId: string };
      const template = templateById(templateId);
      let xPct = 50;
      let yPct = 50;
      if (mapRef.current) {
        const rect = mapRef.current.getBoundingClientRect();
        xPct = Math.round(Math.min(96, Math.max(4, ((e.clientX - rect.left) / rect.width) * 100)));
        yPct = Math.round(Math.min(92, Math.max(8, ((e.clientY - rect.top) / rect.height) * 100)));
      }
      const obs: PlacedObstacle = {
        id: crypto.randomUUID(),
        templateId,
        number: nextNumber(),
        color: template.defaultColor,
        isDouble: template.shape === "combination",
        xPct,
        yPct,
        rotationDeg: 0,
      };
      setObstacles((prev) => [...prev, obs]);
      setSelectedId(obs.id);
      setSelectedGate(null);
    } catch {
      /* ignore */
    }
  };

  const onDragOverMap = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const clearMap = () => {
    if (!window.confirm(t("courseMap.confirmClear"))) return;
    setObstacles([]);
    setStartPct({ ...DEFAULT_START });
    setFinishPct({ ...DEFAULT_FINISH });
    setSelectedId(null);
    setSelectedGate(null);
  };

  const buildAutoCourse = () => {
    const count = Math.max(6, Math.min(20, targetObstacles));
    const allowedTemplates = TEMPLATES.filter((t) => includedTemplateIds.includes(t.id));
    if (allowedTemplates.length === 0) {
      window.alert(t("courseMap.selectAtLeastOneType"));
      return;
    }
    const minY = 18;
    const maxY = 82;
    const sideMarginPct = 13;
    const points: Array<{ xPct: number; yPct: number }> = [];

    const tryGenerate = (strictness: number) => {
      points.length = 0;
      let prev = { xPct: 50, yPct: 12 };
      let heading = Math.random() > 0.5 ? 1 : -1;

      for (let i = 0; i < count; i++) {
        let found = false;
        for (let attempt = 0; attempt < 60 && !found; attempt++) {
          const progressBase = minY + ((i + 1) / (count + 1)) * (maxY - minY);
          const yPct = Math.round(Math.min(maxY, Math.max(minY, progressBase + (Math.random() * 12 - 6))));

          if (Math.random() < 0.42) heading *= -1;
          const lateral = Math.min(32, Math.max(8, 12 + Math.random() * 20));
          const xPct = Math.round(
            Math.min(100 - sideMarginPct, Math.max(sideMarginPct, 50 + heading * lateral + (Math.random() * 8 - 4)))
          );

          const candidate = { xPct, yPct };
          const distPrev = pctDistanceInMeters(prev, candidate, arenaWidthM, arenaLengthM);
          const prev2 = points.length > 0 ? points[points.length - 1] : null;
          const distPrev2 = prev2 ? pctDistanceInMeters(prev2, candidate, arenaWidthM, arenaLengthM) : 999;
          const yForward = candidate.yPct - prev.yPct;

          // FEI-style practical spacing: avoid clustered side-by-side obstacles.
          const minDist = 10 - strictness * 1.2;
          const maxDist = 32 + strictness * 2.4;
          if (distPrev < minDist || distPrev > maxDist) continue;
          if (distPrev2 < Math.max(6.5, 8 - strictness * 0.6)) continue;
          if (yForward < Math.max(0.8, 2 - strictness * 0.5)) continue;

          const nearAnother = points.some(
            (p) => pctDistanceInMeters(p, candidate, arenaWidthM, arenaLengthM) < Math.max(6.6, 8.5 - strictness)
          );
          if (nearAnother) continue;

          // Keep line flowing like a horse track, avoid very sharp zigzags.
          if (points.length >= 2) {
            const a = points[points.length - 2];
            const b = points[points.length - 1];
            const v1x = b.xPct - a.xPct;
            const v1y = b.yPct - a.yPct;
            const v2x = candidate.xPct - b.xPct;
            const v2y = candidate.yPct - b.yPct;
            const ang1 = Math.atan2(v1y, v1x);
            const ang2 = Math.atan2(v2y, v2x);
            let delta = Math.abs(((ang2 - ang1) * 180) / Math.PI);
            if (delta > 180) delta = 360 - delta;
            if (delta > 105 + strictness * 12) continue;
          }

          points.push(candidate);
          prev = candidate;
          found = true;
        }
        if (!found) return false;
      }
      return true;
    };

    let ok = false;
    for (let strictness = 0; strictness <= 3 && !ok; strictness++) {
      for (let i = 0; i < 10 && !ok; i++) ok = tryGenerate(strictness);
    }
    if (!ok) {
      // Deterministic fallback: always generate a valid flowing snake route.
      points.length = 0;
      const stepY = (maxY - minY) / (count + 1);
      for (let i = 0; i < count; i++) {
        const yPct = Math.round(minY + stepY * (i + 1));
        const phase = i % 4;
        const base = phase < 2 ? 1 : -1;
        const spread = 14 + (phase % 2) * 8;
        const xPct = Math.round(Math.max(sideMarginPct, Math.min(100 - sideMarginPct, 50 + base * spread)));
        points.push({ xPct, yPct });
      }
    }

    const next: PlacedObstacle[] = points.map((p, i) => {
      const template = allowedTemplates[Math.floor(Math.random() * allowedTemplates.length)];
      return {
        id: crypto.randomUUID(),
        templateId: template.id,
        number: i + 1,
        color: template.defaultColor,
        isDouble: template.shape === "combination",
        xPct: p.xPct,
        yPct: p.yPct,
        rotationDeg: 0,
      };
    });

    const first = points[0] ?? { xPct: 48, yPct: 20 };
    const last = points[points.length - 1] ?? { xPct: 52, yPct: 78 };
    // Keep start/finish inside arena and away from fence lines.
    setStartPct({
      xPct: Math.max(sideMarginPct, Math.min(100 - sideMarginPct, first.xPct - 4)),
      yPct: Math.max(10, first.yPct - 7),
    });
    setFinishPct({
      xPct: Math.max(sideMarginPct, Math.min(100 - sideMarginPct, last.xPct + 4)),
      yPct: Math.min(90, last.yPct + 6),
    });
    setObstacles(next);
    setSelectedId(next[0]?.id ?? null);
    setSelectedGate(null);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setObstacles((prev) => prev.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  };

  const selected = obstacles.find((o) => o.id === selectedId) ?? null;
  const routePoints = [
    startPct,
    ...[...obstacles].sort((a, b) => a.number - b.number).map((o) => ({ xPct: o.xPct, yPct: o.yPct })),
    finishPct,
  ];

  const startDragObstacle = (
    e: { stopPropagation: () => void; preventDefault: () => void; clientX: number; clientY: number },
    o: PlacedObstacle
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(o.id);
    setSelectedGate(null);
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = o.xPct;
    const oy = o.yPct;
    const id = o.id;

    const move = (ev: PointerEvent) => {
      const el = mapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      const xPct = Math.round(Math.min(96, Math.max(4, ox + dx)));
      const yPct = Math.round(Math.min(92, Math.max(8, oy + dy)));
      setObstacles((prev) => prev.map((ob) => (ob.id === id ? { ...ob, xPct, yPct } : ob)));

      const aside = asideRef.current;
      if (aside) {
        const r = aside.getBoundingClientRect();
        const over =
          ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        setPaletteDragOver(over);
      }
    };
    const up = (ev: PointerEvent) => {
      setPaletteDragOver(false);
      const aside = asideRef.current;
      if (aside) {
        const r = aside.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          setObstacles((prev) => prev.filter((ob) => ob.id !== id));
          setSelectedId((cur) => (cur === id ? null : cur));
        }
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!classId) {
    return <div className="card text-white/55 text-center py-12">{t("live.selectClass")}</div>;
  }

  return (
    <div
      className={clsx(
        "flex flex-col xl:flex-row gap-4 items-stretch",
        mapViewMode === "presentation"
          ? "min-h-[min(88vh,920px)] xl:min-h-[min(86vh,900px)]"
          : "min-h-[min(70vh,640px)]",
        isFullscreen &&
          (mapViewMode === "presentation"
            ? "fixed inset-0 z-[70] p-4 bg-[#e8e4dc]"
            : "fixed inset-0 z-[70] p-4 bg-[#0b0f14]")
      )}
      dir="ltr"
    >
      <div
        className={clsx(
          "flex-1 min-w-0 rounded-2xl border overflow-hidden flex flex-col",
          mapViewMode === "presentation"
            ? "border-[#c4b59a]/60 bg-[#f7f4ec] shadow-[0_8px_40px_rgba(44,36,24,0.08)]"
            : "border-slate-300/80 bg-slate-50",
          isFullscreen &&
            (mapViewMode === "presentation" ? "bg-[#faf8f3]" : "bg-gradient-to-br from-[#0f1419] to-[#121823]")
        )}
        dir="ltr"
      >
        <div
          className={clsx(
            "flex items-center justify-between gap-2 px-4 py-2 border-b",
            mapViewMode === "presentation"
              ? "border-[#d6cec0]/90 bg-[#fffcf5]/80"
              : "border-slate-200/90 bg-white/80"
          )}
        >
          <div
            className={clsx(
              "flex items-center gap-2",
              mapViewMode === "presentation" ? "text-[#2c2419]" : "text-slate-800"
            )}
          >
            <MapPinned className={clsx("w-5 h-5", mapViewMode === "presentation" ? "text-amber-700" : "text-sky-700")} />
            <span className="font-display font-bold">{t("courseMap.title")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMapViewMode("edit")}
              className={clsx(
                "btn-ghost !h-8 !py-0 text-xs",
                mapViewMode === "edit" && "border-sky-600/50 bg-sky-100 text-sky-900",
                mapViewMode === "presentation" && "text-stone-800 border-stone-300/60"
              )}
            >
              {t("courseMap.modeEdit")}
            </button>
            <button
              type="button"
              onClick={() => setMapViewMode("presentation")}
              className={clsx(
                "btn-ghost !h-8 !py-0 text-xs",
                mapViewMode === "presentation" && "border-amber-800/50 bg-amber-200/90 text-amber-950 font-semibold",
                mapViewMode === "edit" && "border-slate-300 bg-white text-slate-700"
              )}
            >
              {t("courseMap.modePresentation")}
            </button>
            {!(isFullscreen && mapViewMode === "presentation") && (
              <>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className={clsx(
                    "btn-ghost !h-8 !py-0 text-xs",
                    mapViewMode === "presentation" ? "text-stone-800" : "text-slate-700"
                  )}
                  title={t("courseMap.arenaSettings")}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {t("courseMap.arenaSettings")}
                </button>
                <button
                  type="button"
                  onClick={buildAutoCourse}
                  className={clsx(
                    "btn-ghost !h-8 !py-0 text-xs",
                    mapViewMode === "presentation" ? "text-emerald-800" : "text-emerald-700"
                  )}
                  title={t("courseMap.autoBuild")}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  {t("courseMap.autoBuild")}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              className={clsx(
                "btn-ghost !h-8 !py-0 text-xs",
                mapViewMode === "presentation" ? "text-stone-800" : "text-slate-700"
              )}
              title={isFullscreen ? t("courseMap.exitFullscreen") : t("courseMap.enterFullscreen")}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {isFullscreen ? t("courseMap.exitFullscreen") : t("courseMap.enterFullscreen")}
            </button>
            {!(isFullscreen && mapViewMode === "presentation") && (
              <button
                type="button"
                onClick={clearMap}
                className={clsx(
                  "btn-ghost !h-8 !py-0 text-xs",
                  mapViewMode === "presentation" ? "text-red-700" : "text-red-700"
                )}
              >
                <RotateCcw className="w-3.5 h-3.5" /> {t("courseMap.clear")}
              </button>
            )}
          </div>
        </div>
        <div
          ref={mapRef}
          className={clsx(
            "relative flex-1 overflow-hidden",
            mapViewMode === "presentation"
              ? "min-h-[min(78vh,820px)] m-1 xl:m-2 rounded-xl border border-[#d4c4a8]/45"
              : "min-h-[420px] m-3 rounded-xl border border-slate-300/85",
            isFullscreen && "min-h-0 h-[calc(100vh-9rem)] m-2"
          )}
          onDrop={mapViewMode === "edit" ? onDropOnMap : undefined}
          onDragOver={mapViewMode === "edit" ? onDragOverMap : undefined}
        >
          {mapViewMode === "edit" ? (
            <CourseMapEditPlan
              obstacles={obstacles}
              templateById={templateById}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              selectedGate={selectedGate}
              setSelectedGate={setSelectedGate}
              startPct={startPct}
              finishPct={finishPct}
              startLabel={t("courseMap.startSensor")}
              finishLabel={t("courseMap.finishSensor")}
              onBackgroundPointerDown={() => {
                setSelectedId(null);
                setSelectedGate(null);
              }}
              onObstacleDragHandle={(o, ev) => startDragObstacle(ev, o)}
              onGateDragHandle={(kind, ev) => {
                setSelectedGate(kind);
                setSelectedId(null);
                const pct = kind === "start" ? startPct : finishPct;
                if (kind === "start") {
                  dragPercent(ev, pct, (x, y) => setStartPct({ xPct: x, yPct: y }));
                } else {
                  dragPercent(ev, pct, (x, y) => setFinishPct({ xPct: x, yPct: y }));
                }
              }}
              pathPoints={routePoints}
              obstacleHeightM={obstacleHeightM}
            />
          ) : (
            <CourseMapPremium
              obstacles={obstacles}
              startPct={startPct}
              finishPct={finishPct}
              arenaWidthM={arenaWidthM}
              arenaLengthM={arenaLengthM}
              obstacleHeightM={obstacleHeightM}
              obstacleLabel={(id) => t(`courseMap.obstacles.${id}`)}
              obstacleShape={(id) => templateById(id).shape}
              deckTitle={competition?.name}
              deckSubtitle={activeClassName}
            />
          )}
          {mapViewMode === "edit" && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-[1] flex justify-center px-4">
              <p className="text-[11px] text-slate-800 text-center bg-white/85 rounded-lg px-3 py-1.5 border border-slate-200/90 shadow-sm max-w-lg leading-snug">
                {t("courseMap.editPlanHint")}
              </p>
            </div>
          )}
          {mapViewMode === "edit" && obstacles.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-4 z-[1]">
              <p className="text-slate-700/90 text-sm max-w-xs text-center bg-white/50 rounded-lg px-2 py-1">
                {t("courseMap.dropHint")}
              </p>
            </div>
          )}
        </div>
      </div>

      <aside
        ref={asideRef}
        className={clsx(
          "w-full xl:w-80 shrink-0 rounded-2xl border flex flex-col max-h-[70vh] overflow-hidden transition-shadow",
          mapViewMode === "edit" ? "bg-white border-slate-300/80" : "bg-white/[0.03]",
          isFullscreen && "max-h-[calc(100vh-2rem)]",
          mapViewMode === "presentation" && "hidden",
          paletteDragOver
            ? "border-red-400/90 shadow-[0_0_0_2px_rgba(248,113,113,0.5)] bg-red-500/[0.08]"
            : mapViewMode === "edit"
              ? "border-slate-300/80"
              : "border-white/10"
        )}
        dir={i18n.dir()}
      >
        <div className={clsx("px-4 py-3 border-b", mapViewMode === "edit" ? "border-slate-200" : "border-white/10")}>
          <div className={clsx("flex items-center gap-2 font-display font-bold", mapViewMode === "edit" ? "text-slate-800" : "text-white")}>
            <Layers className={clsx("w-5 h-5", mapViewMode === "edit" ? "text-sky-700" : "text-neon-violet")} />
            {t("courseMap.palette")}
          </div>
          <p className={clsx("text-xs mt-1 leading-snug", mapViewMode === "edit" ? "text-slate-500" : "text-white/50")}>{t("courseMap.paletteHint")}</p>
          {paletteDragOver && (
            <p className="text-xs text-red-300 font-semibold mt-2">{t("courseMap.dropToDelete")}</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/course-obstacle", JSON.stringify({ templateId: tmpl.id }));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={clsx(
                "rounded-xl border p-2 flex items-center gap-2 cursor-grab active:cursor-grabbing transition",
                mapViewMode === "edit"
                  ? "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
              )}
            >
              <GripVertical className={clsx("w-4 h-4 shrink-0", mapViewMode === "edit" ? "text-slate-400" : "text-white/35")} />
              <div className="flex-1 min-w-0">
                <div className={clsx("text-sm font-semibold truncate", mapViewMode === "edit" ? "text-slate-800" : "text-white")}>{t(`courseMap.obstacles.${tmpl.id}`)}</div>
                <div className={clsx("text-[10px]", mapViewMode === "edit" ? "text-slate-500" : "text-white/45")}>{t("courseMap.dragToMap")}</div>
              </div>
              <div className="shrink-0 flex flex-col items-center">
                <CourseObstacleArt shape={tmpl.shape} color={tmpl.defaultColor} compact obstacleHeightM={obstacleHeightM} />
              </div>
            </div>
          ))}
        </div>

        {selectedGate && (
          <div className={clsx("border-t p-3 space-y-2", mapViewMode === "edit" ? "border-slate-200 bg-slate-50/80" : "border-white/10 bg-white/[0.02]")}>
            <div className={clsx("text-xs uppercase tracking-wider font-bold", mapViewMode === "edit" ? "text-slate-500" : "text-white/45")}>{t("courseMap.gateEdit")}</div>
            <p className={clsx("text-sm leading-snug", mapViewMode === "edit" ? "text-slate-700" : "text-white/70")}>
              {selectedGate === "start" ? t("courseMap.startSensorHint") : t("courseMap.finishSensorHint")}
            </p>
          </div>
        )}

        {selected && (
          <div className={clsx("border-t p-3 space-y-3", mapViewMode === "edit" ? "border-slate-200 bg-slate-50/80" : "border-white/10 bg-white/[0.02]")}>
            <div className={clsx("text-xs uppercase tracking-wider font-bold", mapViewMode === "edit" ? "text-slate-500" : "text-white/45")}>{t("courseMap.edit")}</div>
            <div>
              <label className="label">{t("courseMap.number")}</label>
              <input
                type="number"
                min={1}
                max={99}
                className="input mt-1 !h-9 !py-0 text-sm"
                value={selected.number}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(99, Number(e.target.value) || 1));
                  setObstacles((prev) => prev.map((o) => (o.id === selected.id ? { ...o, number: n } : o)));
                }}
              />
            </div>
            <div>
              <label className="label">{t("courseMap.color")}</label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={clsx(
                      "w-8 h-8 rounded-lg border-2 transition",
                      selected.color === c ? "border-white scale-110" : "border-transparent opacity-80 hover:opacity-100"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() =>
                      setObstacles((prev) => prev.map((o) => (o.id === selected.id ? { ...o, color: c } : o)))
                    }
                  />
                ))}
                <input
                  type="color"
                  value={selected.color}
                  className="w-10 h-8 rounded-lg border border-white/20 cursor-pointer bg-transparent p-0"
                  onChange={(e) =>
                    setObstacles((prev) => prev.map((o) => (o.id === selected.id ? { ...o, color: e.target.value } : o)))
                  }
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/85 w-full cursor-pointer">
              <input
                type="checkbox"
                className="accent-neon-cyan"
                checked={selected.isDouble}
                onChange={(e) =>
                  setObstacles((prev) => prev.map((o) => (o.id === selected.id ? { ...o, isDouble: e.target.checked } : o)))
                }
              />
              {t("courseMap.isDouble")}
            </label>
            <button type="button" onClick={removeSelected} className="btn-danger w-full !py-2">
              <Trash2 className="w-4 h-4" /> {t("courseMap.remove")}
            </button>
          </div>
        )}
      </aside>

      {settingsOpen && (
        <div className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-[1px] flex items-center justify-center p-4" onClick={() => setSettingsOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-white/15 bg-[#10151d] p-4 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-white font-display font-bold text-lg">{t("courseMap.arenaSettings")}</div>
            <p className="text-xs text-white/55">{t("courseMap.feiHint")}</p>
            <div>
              <label className="label">{t("courseMap.arenaWidth")}</label>
              <input
                type="number"
                min={20}
                max={120}
                className="input mt-1 !h-9 !py-0 text-sm"
                value={arenaWidthM}
                onChange={(e) => setArenaWidthM(Math.max(20, Math.min(120, Number(e.target.value) || 40)))}
              />
            </div>
            <div>
              <label className="label">{t("courseMap.arenaLength")}</label>
              <input
                type="number"
                min={40}
                max={180}
                className="input mt-1 !h-9 !py-0 text-sm"
                value={arenaLengthM}
                onChange={(e) => setArenaLengthM(Math.max(40, Math.min(180, Number(e.target.value) || 80)))}
              />
            </div>
            <div>
              <label className="label">{t("courseMap.obstacleCount")}</label>
              <input
                type="number"
                min={6}
                max={20}
                className="input mt-1 !h-9 !py-0 text-sm"
                value={targetObstacles}
                onChange={(e) => setTargetObstacles(Math.max(6, Math.min(20, Number(e.target.value) || 10)))}
              />
            </div>
            <div>
              <label className="label">{t("courseMap.obstacleHeight")}</label>
              <input
                type="number"
                min={0.6}
                max={MAX_OBSTACLE_HEIGHT_M}
                step={0.05}
                className="input mt-1 !h-9 !py-0 text-sm"
                value={obstacleHeightM}
                onChange={(e) =>
                  setObstacleHeightM(Math.max(0.6, Math.min(MAX_OBSTACLE_HEIGHT_M, Number(e.target.value) || 1.3)))
                }
              />
              <p className="text-[11px] text-amber-200/80 mt-1">{t("courseMap.heightLimitHint")}</p>
            </div>
            <div>
              <label className="label">{t("courseMap.allowedTypes")}</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {TEMPLATES.map((tpl) => {
                  const checked = includedTemplateIds.includes(tpl.id);
                  return (
                    <label
                      key={tpl.id}
                      className={clsx(
                        "rounded-lg border px-2 py-1.5 text-xs cursor-pointer select-none",
                        checked ? "border-neon-cyan bg-neon-cyan/15 text-white" : "border-white/15 text-white/75"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={(e) => {
                          setIncludedTemplateIds((prev) => {
                            if (e.target.checked) return [...prev, tpl.id];
                            return prev.filter((id) => id !== tpl.id);
                          });
                        }}
                      />
                      {t(`courseMap.obstacles.${tpl.id}`)}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-ghost !h-9 !py-0" onClick={() => setSettingsOpen(false)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn-primary !h-9 !py-0"
                onClick={() => setSettingsOpen(false)}
              >
                {t("courseMap.confirmSettings")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
