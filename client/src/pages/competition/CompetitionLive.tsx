import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, useSearchParams } from "react-router-dom";
import {
  Play,
  Pause,
  StopCircle,
  SkipForward,
  Bell,
  AlertTriangle,
  CheckCircle2,
  Hand,
  XOctagon,
  Flag,
  RotateCcw,
} from "lucide-react";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/api";
import { loadBellSettings } from "../../lib/bellSettings";
import { Modal } from "../../components/ui/Modal";
import type { Competition, Device, Entry, ResultRow, ShowClass } from "../../lib/types";
import { getSocket } from "../../lib/socket";

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
}

interface ResultsPayload {
  class: ShowClass;
  rows: ResultRow[];
}

interface NoticeState {
  type: "info" | "success" | "error";
  message: string;
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const sec = String(s).padStart(2, "0");
  const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
  return `${sec}:${cs}`;
}

function fmtSignedScore(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const v = Math.trunc(value);
  return v < 0 ? `-${Math.abs(v)}` : String(v);
}

function computeLiveTimeFaults(timeMs: number, allowedTimeSeconds: number | null | undefined, cls?: ShowClass): number {
  if (!cls) return 0;
  if (allowedTimeSeconds == null || allowedTimeSeconds <= 0) return 0;
  const overSec = timeMs / 1000 - allowedTimeSeconds;
  if (overSec <= 0) return 0;
  const standardPerSecondMode = cls.competitionType === "STANDARD";
  const intervalSeconds = standardPerSecondMode ? 1 : Math.max(1, cls.timeFaultIntervalSeconds ?? 4);
  const pointsPerInterval = Math.max(0, cls.timeFaultPoints ?? 1);
  return Math.ceil(overSec / intervalSeconds) * pointsPerInterval;
}

interface LiveState {
  currentEntry: Entry | null;
  faults: number;
  knockdownCount: number;
  refusalCount: number;
  status: "PENDING" | "OK" | "RETIRED" | "ELIMINATED";
  sensorArmed: boolean;
  elapsedMs: number;
  running: boolean;
  addedTimeSeconds: number;
  accumulatorPoints: number;
  accumulatorPenalties: number;
  accumulatorFinalScore: number;
  accumulatorObstacles: Record<
    number,
    { outcome: "CLEAR" | "KNOCKDOWN"; attempt: "NORMAL" | "JOKER" | "JOKER1" | "JOKER2"; notes?: string }
  >;
  standardObstacles: Record<number, { outcome: "CLEAR" | "KNOCKDOWN"; notes?: string }>;
}

interface EntryLiveSnapshot {
  faults: number;
  knockdownCount: number;
  refusalCount: number;
  status: "PENDING" | "OK" | "RETIRED" | "ELIMINATED";
  elapsedMs: number;
  addedTimeSeconds: number;
  accumulatorPoints: number;
  accumulatorPenalties: number;
  accumulatorFinalScore: number;
  accumulatorObstacles: Record<
    number,
    { outcome: "CLEAR" | "KNOCKDOWN"; attempt: "NORMAL" | "JOKER" | "JOKER1" | "JOKER2"; notes?: string }
  >;
  standardObstacles: Record<number, { outcome: "CLEAR" | "KNOCKDOWN"; notes?: string }>;
  locked: boolean;
}

const initState: LiveState = {
  currentEntry: null,
  faults: 0,
  knockdownCount: 0,
  refusalCount: 0,
  status: "PENDING",
  sensorArmed: false,
  elapsedMs: 0,
  running: false,
  addedTimeSeconds: 0,
  accumulatorPoints: 0,
  accumulatorPenalties: 0,
  accumulatorFinalScore: 0,
  accumulatorObstacles: {},
  standardObstacles: {},
};

export function CompetitionLive() {
  const { competitionId } = useOutletContext<OutletCtx>();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [classId, setClassId] = useState<string>(searchParams.get("classId") ?? "");
  const [selectedEntryId, setSelectedEntryId] = useState<string>("");
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [showAllRanking, setShowAllRanking] = useState(false);
  const [activeDisplayView, setActiveDisplayView] = useState<"round" | "finish" | "leaderboard" | null>(null);
  const [state, setState] = useState<LiveState>(initState);
  const [entrySnapshots, setEntrySnapshots] = useState<Record<string, EntryLiveSnapshot>>({});
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const manualModeEnabled = false;
  const [readinessIssues, setReadinessIssues] = useState<string[]>([]);
  const [showReadinessModal, setShowReadinessModal] = useState(false);
  const [showEditRunModal, setShowEditRunModal] = useState(false);
  const [manualTimeSecondsInput, setManualTimeSecondsInput] = useState("");
  const [manualFaultsInput, setManualFaultsInput] = useState("");
  const [manualRefusalsInput, setManualRefusalsInput] = useState("");
  const [manualKnockdownsInput, setManualKnockdownsInput] = useState("");
  const [manualPenaltiesInput, setManualPenaltiesInput] = useState("");
  const [manualPointsInput, setManualPointsInput] = useState("");
  const displayWindowRef = useRef<Window | null>(null);
  const bellAudioRef = useRef<HTMLAudioElement | null>(null);
  const bellStopTimeoutRef = useRef<number | null>(null);

  function showNotice(message: string, type: NoticeState["type"] = "info") {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 2500);
  }

  useEffect(() => {
    const fromUrl = searchParams.get("classId") ?? "";
    if (fromUrl !== classId) setClassId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { data: classDetail } = useQuery<ShowClass & { entries: Entry[] }>({
    queryKey: ["classDetail", classId],
    queryFn: () => api.get(`/classes/${classId}`),
    enabled: !!classId,
  });
  const { data: resultsPayload } = useQuery<ResultsPayload>({
    queryKey: ["results", classId],
    queryFn: () => api.get(`/results/${classId}`),
    enabled: !!classId,
    refetchInterval: classId ? 1500 : false,
    refetchIntervalInBackground: true,
  });
  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => api.get("/devices"),
  });

  const cls = classDetail;
  const isAccumulator = cls?.competitionType === "ACCUMULATOR";
  const obstacleCount = cls?.numberOfObstacles ?? 10;
  const standardObstacleCount = Math.max(1, cls?.maxObstacles ?? 12);
  const showClock =
    !isAccumulator ||
    cls?.accumulatorMode === "AGAINST_CLOCK_NO_JUMP_OFF" ||
    cls?.accumulatorMode === "AGAINST_CLOCK_WITH_JUMP_OFF";
  const isRtlUi = i18n.dir() === "rtl";

  useEffect(() => {
    if (!classId) return;
    const s = getSocket();
    const joinClassRoom = () => {
      s.emit("class:join", { classId });
    };
    joinClassRoom();
    const inv = () => {
      qc.invalidateQueries({ queryKey: ["classDetail", classId] });
      qc.invalidateQueries({ queryKey: ["results", classId] });
    };
    const onState = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => {
        const next = {
          ...(p.status === "ELIMINATED" || p.status === "RETIRED" ? { running: false } : {}),
          ...prev,
          sensorArmed: p.sensorArmed ?? prev.sensorArmed,
          faults: p.faults ?? prev.faults,
          knockdownCount: p.knockdownCount ?? prev.knockdownCount,
          refusalCount: p.refusalCount ?? prev.refusalCount,
          status: p.status ?? prev.status,
          elapsedMs: p.timer?.elapsedMs ?? prev.elapsedMs,
          running: p.timer?.running ?? prev.running,
          addedTimeSeconds: p.addedTimeSeconds ?? prev.addedTimeSeconds,
          accumulatorPoints: p.accumulator?.points ?? prev.accumulatorPoints,
          accumulatorPenalties: p.accumulator?.penalties ?? prev.accumulatorPenalties,
          accumulatorFinalScore:
            p.accumulator?.finalScore ??
            (p.accumulator?.points ?? prev.accumulatorPoints) - (p.accumulator?.penalties ?? prev.accumulatorPenalties),
          accumulatorObstacles: p.accumulator?.obstacles ?? prev.accumulatorObstacles,
          standardObstacles: p.standard?.obstacles ?? prev.standardObstacles,
        };
        saveCurrentEntrySnapshot(next);
        return next;
      });
    };
    const onTick = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => {
        if (prev.status === "ELIMINATED" || prev.status === "RETIRED") {
          return { ...prev, running: false };
        }
        const next = { ...prev, elapsedMs: p.elapsedMs, running: true };
        saveCurrentEntrySnapshot(next);
        return next;
      });
    };
    const onTimerStarted = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({ ...prev, running: true, sensorArmed: false }));
    };
    const onTimerStopped = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => {
        const next = { ...prev, running: false, elapsedMs: p.elapsedMs };
        saveCurrentEntrySnapshot(next, true);
        return next;
      });
    };
    const onTimerPaused = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => {
        const next = {
          ...prev,
          running: false,
          elapsedMs: p.elapsedMs ?? prev.elapsedMs,
          addedTimeSeconds: p.addedTimeSeconds ?? prev.addedTimeSeconds,
        };
        saveCurrentEntrySnapshot(next);
        return next;
      });
      showNotice(t("live.pauseNotice", "השעון הושהה"), "info");
    };
    const onTimerReset = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => {
        const next = {
          ...prev,
          running: false,
          elapsedMs: 0,
          faults: 0,
          knockdownCount: 0,
          refusalCount: 0,
          status: "PENDING" as const,
          accumulatorPoints: 0,
          accumulatorPenalties: 0,
          accumulatorFinalScore: 0,
          accumulatorObstacles: {},
          standardObstacles: {},
        };
        saveCurrentEntrySnapshot(next, false);
        return next;
      });
    };
    const onSensorArmed = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({ ...prev, sensorArmed: true }));
    };
    const onSensorDisarmed = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({ ...prev, sensorArmed: false }));
    };
    const onRiderCurrent = (p: any) => {
      if (p.classId !== classId) return;
      const snapshot = entrySnapshots[p.entry?.id];
      setState((prev) => ({
        ...prev,
        currentEntry: p.entry,
        faults: snapshot?.faults ?? 0,
        knockdownCount: snapshot?.knockdownCount ?? 0,
        refusalCount: snapshot?.refusalCount ?? 0,
        status: snapshot?.status ?? "PENDING",
        elapsedMs: snapshot?.elapsedMs ?? 0,
        running: false,
        addedTimeSeconds: snapshot?.addedTimeSeconds ?? 0,
        sensorArmed: false,
        accumulatorPoints: snapshot?.accumulatorPoints ?? 0,
        accumulatorPenalties: snapshot?.accumulatorPenalties ?? 0,
        accumulatorFinalScore: snapshot?.accumulatorFinalScore ?? 0,
        accumulatorObstacles: snapshot?.accumulatorObstacles ?? {},
        standardObstacles: snapshot?.standardObstacles ?? {},
      }));
      inv();
    };
    const onFault = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => {
        const lockedByStatus = p.status === "ELIMINATED" || p.status === "RETIRED";
        const next = {
          ...prev,
          faults: p.faults,
          status: p.status,
          knockdownCount: p.knockdownCount ?? prev.knockdownCount,
          refusalCount: p.refusalCount ?? prev.refusalCount,
          running: lockedByStatus ? false : prev.running,
          accumulatorPenalties: p.faults ?? prev.accumulatorPenalties,
          accumulatorFinalScore: prev.accumulatorPoints - (p.faults ?? prev.accumulatorPenalties),
        };
        saveCurrentEntrySnapshot(next, lockedByStatus ? true : undefined);
        return next;
      });
    };
    const onAccumulatorUpdated = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => {
        const next = {
          ...prev,
          accumulatorPoints: p.points ?? prev.accumulatorPoints,
          accumulatorPenalties: p.penalties ?? prev.accumulatorPenalties,
          accumulatorFinalScore:
            p.finalScore ?? (p.points ?? prev.accumulatorPoints) - (p.penalties ?? prev.accumulatorPenalties),
          accumulatorObstacles: p.obstacles ?? prev.accumulatorObstacles,
        };
        saveCurrentEntrySnapshot(next);
        return next;
      });
    };
    const onStandardUpdated = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => {
        const next = { ...prev, standardObstacles: p.obstacles ?? prev.standardObstacles };
        saveCurrentEntrySnapshot(next);
        return next;
      });
    };
    const onApproved = () => {
      setState((prev) => {
        saveCurrentEntrySnapshot(prev, true);
        return { ...prev, status: "PENDING" };
      });
      showNotice(t("live.approveSuccess", "Result approved"), "success");
      inv();
    };
    const onClassEnded = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({
        ...prev,
        currentEntry: null,
        running: false,
        elapsedMs: 0,
        sensorArmed: false,
      }));
      showNotice(t("live.classEndedSuccess", "Class ended"), "success");
      inv();
    };
    const onResultsUpdated = (p: { classId?: string }) => {
      if (p?.classId !== classId) return;
      inv();
    };
    const onJumpOffStarted = (p: any) => {
      if (p?.classId !== classId) return;
      showNotice(t("live.jumpOffStarted", "Jump-Off started"), "success");
    };
    const onJumpOffNotRequired = (p: any) => {
      if (p?.classId !== classId) return;
      showNotice(t("live.jumpOffNotRequired", "Jump-Off not required"), "info");
    };
    const onJumpOffCompleted = (p: any) => {
      if (p?.classId !== classId) return;
      showNotice(t("live.jumpOffCompleted", "Jump-Off completed"), "success");
      inv();
    };
    const onBellRing = (p: any) => {
      if (p?.classId !== classId) return;
      playBellSound();
    };
    const onConnect = () => {
      // Socket.io drops rooms on reconnect; rejoin automatically.
      joinClassRoom();
    };

    s.on("class:state", onState);
    s.on("timer:tick", onTick);
    s.on("timer:started", onTimerStarted);
    s.on("timer:stopped", onTimerStopped);
    s.on("timer:paused", onTimerPaused);
    s.on("timer:reset", onTimerReset);
    s.on("sensor:armed", onSensorArmed);
    s.on("sensor:disarmed", onSensorDisarmed);
    s.on("rider:current", onRiderCurrent);
    s.on("fault:added", onFault);
    s.on("result:approved", onApproved);
    s.on("class:ended", onClassEnded);
    s.on("results:updated", onResultsUpdated);
    s.on("jumpoff:started", onJumpOffStarted);
    s.on("jumpoff:not_required", onJumpOffNotRequired);
    s.on("jumpoff:completed", onJumpOffCompleted);
    s.on("accumulator:updated", onAccumulatorUpdated);
    s.on("standard:updated", onStandardUpdated);
    s.on("bell:ring", onBellRing);
    s.on("connect", onConnect);

    return () => {
      s.emit("class:leave", { classId });
      s.off("class:state", onState);
      s.off("timer:tick", onTick);
      s.off("timer:started", onTimerStarted);
      s.off("timer:stopped", onTimerStopped);
      s.off("timer:paused", onTimerPaused);
      s.off("timer:reset", onTimerReset);
      s.off("sensor:armed", onSensorArmed);
      s.off("sensor:disarmed", onSensorDisarmed);
      s.off("rider:current", onRiderCurrent);
      s.off("fault:added", onFault);
      s.off("result:approved", onApproved);
      s.off("class:ended", onClassEnded);
      s.off("results:updated", onResultsUpdated);
      s.off("jumpoff:started", onJumpOffStarted);
      s.off("jumpoff:not_required", onJumpOffNotRequired);
      s.off("jumpoff:completed", onJumpOffCompleted);
      s.off("accumulator:updated", onAccumulatorUpdated);
      s.off("standard:updated", onStandardUpdated);
      s.off("bell:ring", onBellRing);
      s.off("connect", onConnect);
    };
  }, [classId, qc, t, entrySnapshots]);

  const classEntriesSorted = useMemo(() => {
    if (!classDetail?.entries?.length) return [];
    return [...classDetail.entries].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [classDetail]);
  const rankedRows = useMemo(() => {
    const rows = resultsPayload?.rows ?? [];
    const working = [...rows];
    const currentId = state.currentEntry?.id;
    if (currentId) {
      const idx = working.findIndex((r) => r.entryId === currentId);
      const liveStatus = state.status === "ELIMINATED" || state.status === "RETIRED" ? state.status : "OK";
      const liveFaultsEffective =
        cls?.competitionType === "ACCUMULATOR"
          ? state.faults
          : state.faults + computeLiveTimeFaults(state.elapsedMs, cls?.allowedTime, cls);
      const liveRow = {
        entryId: currentId,
        startNumber: state.currentEntry?.startNumber ?? working[idx]?.startNumber ?? 0,
        horseName: state.currentEntry?.horse?.name ?? working[idx]?.horseName ?? "—",
        riderName: state.currentEntry?.rider?.name ?? working[idx]?.riderName ?? "—",
        faults: liveFaultsEffective,
        timeMs: state.elapsedMs,
        status: liveStatus,
        approved: false,
        points: state.accumulatorPoints,
        penalties: state.accumulatorPenalties,
        finalScore: state.accumulatorFinalScore,
      };
      if (idx >= 0) working[idx] = { ...working[idx], ...liveRow };
      else working.push(liveRow);
    }

    const valid = working.filter((r) => r.status === "OK" && r.timeMs != null);
    const invalid = working.filter((r) => !(r.status === "OK" && r.timeMs != null));
    const rankingMode = cls?.rankingMode ?? "FAULTS_TIME";

    if (cls?.competitionType === "ACCUMULATOR") {
      valid.sort((a, b) => {
        const scoreDiff = (b.finalScore ?? b.points ?? -9999) - (a.finalScore ?? a.points ?? -9999);
        if (scoreDiff !== 0) return scoreDiff;
        return (a.timeMs ?? Number.MAX_SAFE_INTEGER) - (b.timeMs ?? Number.MAX_SAFE_INTEGER);
      });
    } else if (cls?.competitionType === "TIME_60_80") {
      const targetSec = Number(cls?.targetTimeSeconds ?? cls?.allowedTime ?? 40);
      const targetMs = Math.max(1, targetSec) * 1000;
      valid.sort((a, b) => {
        const da = Math.abs((a.timeMs ?? Number.MAX_SAFE_INTEGER) - targetMs);
        const db = Math.abs((b.timeMs ?? Number.MAX_SAFE_INTEGER) - targetMs);
        if (da !== db) return da - db;
        return (a.timeMs ?? Number.MAX_SAFE_INTEGER) - (b.timeMs ?? Number.MAX_SAFE_INTEGER);
      });
    } else if (rankingMode === "TIME_ONLY") {
      valid.sort((a, b) => (a.timeMs ?? Number.MAX_SAFE_INTEGER) - (b.timeMs ?? Number.MAX_SAFE_INTEGER));
    } else {
      // FAULTS_TIME / FAULTS_ONLY
      valid.sort((a, b) => {
        if ((a.faults ?? 0) !== (b.faults ?? 0)) return (a.faults ?? 0) - (b.faults ?? 0);
        return (a.timeMs ?? Number.MAX_SAFE_INTEGER) - (b.timeMs ?? Number.MAX_SAFE_INTEGER);
      });
    }

    const placed = valid.map((r, idx) => ({ ...r, place: idx + 1 }));
    const tail = invalid
      .map((r) => ({ ...r, place: null as number | null }))
      .sort((a, b) => a.startNumber - b.startNumber);
    return [...placed, ...tail];
  }, [resultsPayload, state, cls]);
  const entriesTop8 = classEntriesSorted.slice(0, 8);
  const entriesRest = classEntriesSorted.slice(8);
  const rankedTop5 = rankedRows.slice(0, 5);
  const rankedRest = rankedRows.slice(5);

  const overTime =
    !!cls && cls.allowedTime != null && state.elapsedMs > cls.allowedTime * 1000;
  const allowedTimeSeconds = cls?.allowedTime ?? 0;
  const excessSeconds = Math.max(0, state.elapsedMs / 1000 - allowedTimeSeconds);
  const legalTimeAdditionStep = cls?.tableCDisobedienceWithKnockdownSeconds ?? 0;
  const legalTimeAdditionCount =
    legalTimeAdditionStep > 0 ? Math.floor(state.addedTimeSeconds / legalTimeAdditionStep) : 0;
  const showLegalTimeAdditionCard =
    !isAccumulator && (!!cls?.applyTimeAdditionToClock || state.addedTimeSeconds > 0);
  const showAccumulatorFinalScoreCard = isAccumulator;
  const penaltiesValue = isAccumulator ? state.accumulatorPenalties : state.faults;
  const statusHeadline =
    state.status === "ELIMINATED"
      ? t("live.elimination", "פסילה")
      : state.status === "RETIRED"
        ? t("live.retired", "פרישה")
        : null;
  const currentEntryId = state.currentEntry?.id ?? "";
  const currentEntryLocked = !!(currentEntryId && entrySnapshots[currentEntryId]?.locked);

  function saveCurrentEntrySnapshot(nextState: LiveState, lockedOverride?: boolean) {
    const entryId = nextState.currentEntry?.id;
    if (!entryId) return;
    setEntrySnapshots((prev) => ({
      ...prev,
      [entryId]: {
        faults: nextState.faults,
        knockdownCount: nextState.knockdownCount,
        refusalCount: nextState.refusalCount,
        status: nextState.status,
        elapsedMs: nextState.elapsedMs,
        addedTimeSeconds: nextState.addedTimeSeconds,
        accumulatorPoints: nextState.accumulatorPoints,
        accumulatorPenalties: nextState.accumulatorPenalties,
        accumulatorFinalScore: nextState.accumulatorFinalScore,
        accumulatorObstacles: nextState.accumulatorObstacles,
        standardObstacles: nextState.standardObstacles,
        locked: lockedOverride ?? prev[entryId]?.locked ?? false,
      },
    }));
  }

  function guardLockedEntry(): boolean {
    if (!currentEntryLocked) return true;
    showNotice(t("live.resultLockedResetRequired", "התוצאה נעולה לרוכב זה. יש לבצע איפוס עם אישור לפני שינוי."), "error");
    return false;
  }

  function emit(name: string, payload: object = {}) {
    getSocket().emit(name, { classId, ...payload });
  }

  function playBellSound() {
    const cfg = loadBellSettings(competitionId);
    if (bellStopTimeoutRef.current) {
      window.clearTimeout(bellStopTimeoutRef.current);
      bellStopTimeoutRef.current = null;
    }
    if (bellAudioRef.current) {
      bellAudioRef.current.pause();
      bellAudioRef.current.currentTime = 0;
    }
    const audio = new Audio(cfg.audioUrl);
    bellAudioRef.current = audio;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // ignore autoplay / loading errors
    });
    bellStopTimeoutRef.current = window.setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
      if (bellAudioRef.current === audio) bellAudioRef.current = null;
      bellStopTimeoutRef.current = null;
    }, Math.max(1, cfg.durationSeconds) * 1000);
  }

  function evaluateClassReadiness(): string[] {
    const issues: string[] = [];
    const entryCount = classDetail?.entries?.length ?? 0;
    if (entryCount < 1) issues.push(t("live.readiness.noEntries"));
    if (!cls?.startListLocked) issues.push(t("live.readiness.startListUnlocked"));
    if (cls?.tableType === "A" && (!cls.allowedTime || cls.allowedTime <= 0)) {
      issues.push(t("live.readiness.allowedTimeMissing"));
    }

    let assignedJudgesCount = 0;
    try {
      const raw = localStorage.getItem("class-judges-map-v1");
      if (raw) {
        const map = JSON.parse(raw) as Record<string, string[]>;
        assignedJudgesCount = Array.isArray(map?.[classId]) ? map[classId].length : 0;
      }
    } catch {
      assignedJudgesCount = 0;
    }
    if (assignedJudgesCount < 1) issues.push(t("live.readiness.noJudges"));

    const hasStartOnline = devices.some((d) => d.type === "START" && d.online);
    const hasFinishOnline = devices.some((d) => d.type === "FINISH" && d.online);
    if (!manualModeEnabled && !hasStartOnline) issues.push(t("live.readiness.startSensorOffline"));
    if (!manualModeEnabled && !hasFinishOnline) issues.push(t("live.readiness.finishSensorOffline"));

    return issues;
  }

  function handleStartClass() {
    if (!classId) {
      showNotice(t("live.selectClass"), "error");
      return;
    }
    const issues = evaluateClassReadiness();
    if (issues.length > 0) {
      setReadinessIssues(issues);
      setShowReadinessModal(true);
      return;
    }
    emit("class:start");
  }

  function handleStartAnyway() {
    const ok = window.confirm(
      t(
        "live.readiness.confirmStartAnyway",
        "Are you sure you want to start with missing configuration?"
      )
    );
    if (!ok) return;
    setShowReadinessModal(false);
    emit("class:start");
  }

  function handleEndClass() {
    if (!classId) {
      showNotice(t("live.selectClass"), "error");
      return;
    }
    const ok = window.confirm(t("live.confirmEndClass", "End this class?"));
    if (!ok) return;
    emit("class:end");
    showNotice(t("live.classEnding", "Ending class..."));
  }

  function handleApproveResult() {
    if (!classId) {
      showNotice(t("live.selectClass"), "error");
      return;
    }
    if (!state.currentEntry) {
      showNotice(t("live.noRider"), "error");
      return;
    }
    const ok = window.confirm(t("live.confirmApprove", "Approve current result?"));
    if (!ok) return;
    emit("result:approve");
    showNotice(t("live.approving", "Approving result..."));
  }

  function pickNextOrSelected() {
    const selected = classEntriesSorted.find((e) => e.id === selectedEntryId);
    const canPickSelected =
      !!selected &&
      selected.status !== "SCRATCHED" &&
      selected.id !== state.currentEntry?.id;
    if (canPickSelected) {
      emit("entry:pick", { entryId: selected.id });
      showNotice(t("live.current", "Current Rider"), "info");
      return;
    }
    emit("rider:next");
    showNotice(t("live.nextRider"), "info");
  }

  function pickEntryForJudging(entry: Entry) {
    if (entry.status === "SCRATCHED") return;
    emit("entry:pick", { entryId: entry.id });
  }

  function submitAccumulatorObstacle(
    obstacleNumber: number,
    outcome: "CLEAR" | "KNOCKDOWN",
    attempt: "NORMAL" | "JOKER" | "JOKER1" | "JOKER2" = "NORMAL",
    notes?: string
  ) {
    emit("accumulator:obstacle", { obstacleNumber, outcome, attempt, notes });
  }

  function toggleAccumulatorObstacle(
    obstacleNumber: number,
    outcome: "CLEAR" | "KNOCKDOWN",
    attempt: "NORMAL" | "JOKER" | "JOKER1" | "JOKER2" = "NORMAL"
  ) {
    const current = state.accumulatorObstacles[obstacleNumber];
    if (current && current.outcome === outcome && current.attempt === attempt) {
      emit("accumulator:clear", { obstacleNumber });
      return;
    }
    submitAccumulatorObstacle(obstacleNumber, outcome, attempt);
  }

  function markAccumulatorRefusal(
    obstacleNumber: number,
    attempt: "NORMAL" | "JOKER" | "JOKER1" | "JOKER2" = "NORMAL"
  ) {
    handleAddFault("REFUSAL");
    submitAccumulatorObstacle(obstacleNumber, "KNOCKDOWN", attempt, "REFUSAL");
  }

  function toggleStandardObstacle(obstacleNumber: number, outcome: "CLEAR" | "KNOCKDOWN") {
    if (!guardLockedEntry()) return;
    const current = state.standardObstacles[obstacleNumber];
    const same = current?.outcome === outcome && !current?.notes;
    if (same) {
      emit("standard:clear", { obstacleNumber });
      return;
    }
    emit("standard:obstacle", { obstacleNumber, outcome });
    if (outcome === "KNOCKDOWN") {
      handleAddFault("KNOCKDOWN");
    }
  }

  function markStandardRefusal(obstacleNumber: number) {
    if (!guardLockedEntry()) return;
    const current = state.standardObstacles[obstacleNumber];
    const alreadyRefusal = current?.notes === "REFUSAL";
    if (alreadyRefusal) {
      emit("standard:clear", { obstacleNumber });
      return;
    }
    emit("standard:obstacle", { obstacleNumber, outcome: "KNOCKDOWN", notes: "REFUSAL" });
    handleAddFault("REFUSAL");
  }

  function handleManualStart() {
    if (!guardLockedEntry()) return;
    emit("timer:manual_start");
    showNotice(t("live.manualStart", "Manual Start"), "info");
  }

  function handlePauseTimer() {
    emit("timer:pause");
    showNotice(t("live.pauseNotice", "השעון הושהה"), "info");
  }

  function handleManualStop() {
    if (!guardLockedEntry()) return;
    emit("timer:manual_stop");
    setEntrySnapshots((prev) => {
      const id = state.currentEntry?.id;
      if (!id) return prev;
      return {
        ...prev,
        [id]: {
          ...(prev[id] ?? {
            faults: state.faults,
            knockdownCount: state.knockdownCount,
            refusalCount: state.refusalCount,
            status: state.status,
            elapsedMs: state.elapsedMs,
            addedTimeSeconds: state.addedTimeSeconds,
            accumulatorPoints: state.accumulatorPoints,
            accumulatorPenalties: state.accumulatorPenalties,
            accumulatorFinalScore: state.accumulatorFinalScore,
            accumulatorObstacles: state.accumulatorObstacles,
            locked: false,
          }),
          locked: true,
        },
      };
    });
    showNotice(t("live.manualFinish", "Manual Finish"), "info");
  }

  function handleResetTimer() {
    const ok = window.confirm(t("live.confirmReset", "לאפס תוצאה לרוכב הנוכחי? פעולה זו תאפשר עריכה מחדש."));
    if (!ok) return;
    emit("timer:reset");
    setEntrySnapshots((prev) => {
      const id = state.currentEntry?.id;
      if (!id || !prev[id]) return prev;
      return {
        ...prev,
        [id]: { ...prev[id], locked: false, faults: 0, knockdownCount: 0, refusalCount: 0, status: "PENDING", elapsedMs: 0, addedTimeSeconds: 0, accumulatorPoints: 0, accumulatorPenalties: 0, accumulatorFinalScore: 0, accumulatorObstacles: {}, standardObstacles: {} },
      };
    });
    showNotice(t("live.reset", "Reset"), "info");
  }

  function openEditRunModal() {
    if (!state.currentEntry) {
      showNotice(t("live.selectCurrentRiderFirst", "בחר רוכב נוכחי קודם"), "error");
      return;
    }
    setManualTimeSecondsInput((state.elapsedMs / 1000).toFixed(2));
    setManualFaultsInput(String(state.faults));
    setManualRefusalsInput(String(state.refusalCount));
    setManualKnockdownsInput(String(state.knockdownCount));
    setManualPenaltiesInput(String(state.accumulatorPenalties));
    setManualPointsInput(String(state.accumulatorPoints));
    setShowEditRunModal(true);
  }

  function parseNonNegativeNumber(raw: string, allowDecimal = false): number | null {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return allowDecimal ? n : Math.floor(n);
  }

  function applyRunEdits() {
    const sec = parseNonNegativeNumber(manualTimeSecondsInput, true);
    const faults = parseNonNegativeNumber(manualFaultsInput);
    const refusals = parseNonNegativeNumber(manualRefusalsInput);
    const knockdowns = parseNonNegativeNumber(manualKnockdownsInput);
    const penalties = parseNonNegativeNumber(manualPenaltiesInput);
    const points = parseNonNegativeNumber(manualPointsInput);

    if (sec == null || faults == null || refusals == null || knockdowns == null) {
      showNotice(t("live.invalidEditInput", "ערכי עריכה לא תקינים"), "error");
      return;
    }
    if (isAccumulator && (penalties == null || points == null)) {
      showNotice(t("live.invalidEditInput", "ערכי עריכה לא תקינים"), "error");
      return;
    }

    const ms = Math.round(sec * 1000);
    emit("live:manual_edit", {
      elapsedMs: ms,
      faults,
      refusalCount: refusals,
      knockdownCount: knockdowns,
      accumulatorPenalties: isAccumulator ? penalties : undefined,
      accumulatorPoints: isAccumulator ? points : undefined,
    });

    setState((prev) => {
      const nextPenalties = isAccumulator ? (penalties ?? prev.accumulatorPenalties) : prev.accumulatorPenalties;
      const nextPoints = isAccumulator ? (points ?? prev.accumulatorPoints) : prev.accumulatorPoints;
      return {
        ...prev,
        elapsedMs: ms,
        faults,
        refusalCount: refusals,
        knockdownCount: knockdowns,
        accumulatorPenalties: nextPenalties,
        accumulatorPoints: nextPoints,
        accumulatorFinalScore: nextPoints - nextPenalties,
        status: "PENDING",
      };
    });
    setShowEditRunModal(false);
    showNotice(t("live.editUpdated", "הערכים עודכנו"), "success");
  }

  function handleToggleSensor() {
    if (!guardLockedEntry()) return;
    emit(state.sensorArmed ? "sensor:disarm" : "sensor:arm");
    showNotice(
      state.sensorArmed
        ? t("live.disarmSensor", "בטל חימוש חיישן")
        : t("live.armSensor", "הפעל חיישן זינוק"),
      "info"
    );
  }

  function handleAddFault(type: "KNOCKDOWN" | "REFUSAL" | "RETIRED" | "ELIMINATION") {
    if (!guardLockedEntry()) return;
    emit("fault:add", { type });
    const key =
      type === "KNOCKDOWN"
        ? "live.knockdown"
        : type === "REFUSAL"
          ? "live.refusal"
          : type === "RETIRED"
            ? "live.retired"
            : "live.elimination";
    showNotice(t(key), "info");
  }

  useEffect(() => {
    return () => {
      if (bellStopTimeoutRef.current) window.clearTimeout(bellStopTimeoutRef.current);
      if (bellAudioRef.current) {
        bellAudioRef.current.pause();
        bellAudioRef.current.currentTime = 0;
      }
    };
  }, []);

  function openDisplayView(view: "round" | "finish" | "leaderboard") {
    if (!classId) {
      showNotice(t("live.selectClass"), "error");
      return;
    }
    setActiveDisplayView(view);
    const lang = (i18n.resolvedLanguage ?? i18n.language ?? "en").split("-")[0] ?? "en";
    const nextUrl = `/display/${classId}?view=${view}&lang=${encodeURIComponent(lang)}`;
    if (!displayWindowRef.current || displayWindowRef.current.closed) {
      displayWindowRef.current = window.open(nextUrl, "showjump-display-screen");
    } else {
      try {
        displayWindowRef.current.location.href = nextUrl;
      } catch {
        displayWindowRef.current = window.open(nextUrl, "showjump-display-screen");
      }
    }
    // Keep operator on LIVE tab; only display window content changes.
    displayWindowRef.current?.blur();
    window.focus();
  }

  function handleOpenRoundDisplay() {
    openDisplayView("round");
  }

  function handleOpenFinishDisplay() {
    openDisplayView("finish");
  }

  function handleOpenLeaderboardDisplay() {
    openDisplayView("leaderboard");
  }

  return (
    <div>
      {notice && (
        <div
          className={clsx(
            "fixed left-1/2 top-24 z-50 w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border px-3 py-2 text-center text-sm font-medium shadow-lg backdrop-blur",
            notice.type === "success" && "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
            notice.type === "error" && "border-neon-pink/40 bg-neon-pink/15 text-red-100",
            notice.type === "info" && "border-neon-cyan/40 bg-neon-cyan/10 text-cyan-100"
          )}
        >
          {notice.message}
        </div>
      )}
      {!classId ? (
        <div className="card text-white/55 text-center py-12">{t("live.selectClass")}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-10 gap-4 items-start">
            <aside className="xl:col-span-2 card flex flex-col min-h-[12rem] max-h-[70vh] space-y-3">
              <div>
                <h3 className="font-display font-bold text-white mb-3 text-center">{t("live.classEntries")}</h3>
                <div className="space-y-1.5">
                  {entriesTop8.map((e) => {
                    const isCurrent = state.currentEntry?.id === e.id;
                    const isSelected = selectedEntryId === e.id;
                    const inactive = e.status === "SCRATCHED";
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelectedEntryId(e.id)}
                        onDoubleClick={() => pickEntryForJudging(e)}
                        disabled={inactive}
                        className={clsx(
                          "w-full text-start rounded-xl border px-2.5 py-2 transition",
                          inactive && "opacity-40 cursor-not-allowed",
                          isCurrent ? "border-neon-cyan/70 bg-neon-cyan/15" : "border-white/12 bg-white/[0.03]",
                          isSelected && !isCurrent && "border-neon-violet/60"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 font-mono text-base font-bold text-neon-cyan tabular-nums w-9 shrink-0">
                            {e.startNumber}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-white text-sm leading-tight truncate">{e.rider?.name ?? "—"}</div>
                            <div className="text-[11px] text-white/50 truncate">{e.horse?.name ?? "—"}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {entriesRest.length > 0 && showAllParticipants && (
                  <div className="mt-2 max-h-44 overflow-y-auto space-y-1.5 pe-1">
                    {entriesRest.map((e) => {
                      const isCurrent = state.currentEntry?.id === e.id;
                      const isSelected = selectedEntryId === e.id;
                      const inactive = e.status === "SCRATCHED";
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setSelectedEntryId(e.id)}
                          onDoubleClick={() => pickEntryForJudging(e)}
                          disabled={inactive}
                          className={clsx(
                            "w-full text-start rounded-xl border px-2.5 py-2 transition",
                            inactive && "opacity-40 cursor-not-allowed",
                            isCurrent ? "border-neon-cyan/70 bg-neon-cyan/15" : "border-white/12 bg-white/[0.03]",
                            isSelected && !isCurrent && "border-neon-violet/60"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 font-mono text-base font-bold text-neon-cyan tabular-nums w-9 shrink-0">
                              {e.startNumber}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-white text-sm leading-tight truncate">{e.rider?.name ?? "—"}</div>
                              <div className="text-[11px] text-white/50 truncate">{e.horse?.name ?? "—"}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllParticipants((v) => !v)}
                    className="btn-ghost !h-8 !py-0 !px-3 text-xs"
                    disabled={entriesRest.length === 0}
                  >
                    {entriesRest.length === 0
                      ? t("live.noMoreParticipants", "אין משתתפים נוספים")
                      : showAllParticipants
                      ? t("live.showLessParticipants", "הצג פחות משתתפים")
                      : t("live.showAllParticipants", "הצג את כל המשתתפים")}
                  </button>
                </div>
              </div>

            </aside>

            <div className="xl:col-span-6 space-y-3 min-w-0">
              <div className="live-hero-panel relative rounded-2xl border border-white/10 bg-ink-800/80 p-4 md:p-6 shadow-glow">
                <div>
                  <div className="text-[11px] text-white/55">{t("live.current")}</div>
                  {state.sensorArmed && (
                    <div className="absolute top-3 end-3 badge-amber">
                      <Bell className="w-3 h-3 me-1" />
                      {t("live.armed", "מוכן")}
                    </div>
                  )}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={state.currentEntry?.id ?? "none"}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="flex items-center gap-2"
                    >
                      <span className="inline-flex items-center rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-mono text-white">
                        {state.currentEntry?.startNumber ?? "—"}
                      </span>
                      <span className="text-3xl font-display font-bold text-white">
                        {state.currentEntry?.rider?.name ?? t("live.noRider")}
                      </span>
                      {statusHeadline && (
                        <span className="inline-flex items-center rounded-xl border border-neon-pink/45 bg-neon-pink/15 px-3 py-1 text-lg font-display font-extrabold tracking-wide text-neon-pink">
                          {statusHeadline}
                        </span>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  <div className="text-white/55">{state.currentEntry?.horse?.name ?? "—"}</div>
                </div>

                <div className="mt-4 text-center">
                  <motion.div
                    animate={{ scale: showClock && state.running ? [1, 1.02, 1] : 1 }}
                    transition={{ duration: 1, repeat: showClock && state.running ? Infinity : 0 }}
                    className={`text-7xl md:text-8xl font-mono font-bold timer-glow tracking-tight ${
                      overTime ? "text-neon-pink" : "text-white"
                    }`}
                  >
                    {showClock ? (
                      fmt(state.elapsedMs)
                    ) : (
                      <span dir={isRtlUi ? "ltr" : undefined} className="inline-block unicode-bidi-isolate">
                        {fmtSignedScore(state.accumulatorFinalScore)}
                      </span>
                    )}
                  </motion.div>
                </div>

                <div
                  className={clsx(
                    "mt-4 grid gap-2",
                    showLegalTimeAdditionCard || showAccumulatorFinalScoreCard ? "grid-cols-5" : "grid-cols-4"
                  )}
                >
                  <div className="glass px-3 py-2 text-center">
                    <div className="text-[10px] text-white/50">{t("live.accumulator.penalties", "עונשין")}</div>
                    <div className="text-2xl font-display font-bold text-neon-pink">{penaltiesValue}</div>
                  </div>
                  <div className="glass px-3 py-2 text-center">
                    <div className="text-[10px] text-white/50">{t("live.refusal", "סירוב")}</div>
                    <div className="text-2xl font-display font-bold text-neon-amber">{state.refusalCount}</div>
                  </div>
                  <div className="glass px-3 py-2 text-center">
                    <div className="text-[10px] text-white/50">{t("live.allowedTime", "זמן מוקצה")}</div>
                    <div className="text-2xl font-display font-bold text-neon-lime">{allowedTimeSeconds}</div>
                  </div>
                  <div className="glass px-3 py-2 text-center">
                    <div className="text-[10px] text-white/50">{t("live.excessSeconds", "שניות עודפות")}</div>
                    <div className="text-2xl font-display font-bold text-neon-lime">
                      {excessSeconds.toFixed(2)}
                    </div>
                  </div>
                  {showLegalTimeAdditionCard && (
                    <div className="glass px-3 py-2 text-center">
                      <div className="text-[10px] text-white/50">{t("live.legalTimeAddition", "תוספת זמן לפי החוק")}</div>
                      <div className="text-xl font-display font-bold text-neon-lime">+{state.addedTimeSeconds.toFixed(0)}</div>
                      <div className="text-[10px] text-white/55 mt-0.5">
                        {t("live.additionsCount", "כמות הוספות")}: {legalTimeAdditionCount}
                      </div>
                    </div>
                  )}
                  {showAccumulatorFinalScoreCard && (
                    <div className="glass px-3 py-2 text-center">
                      <div className="text-[10px] text-white/50">{t("live.accumulator.finalScore", "ניקוד סופי")}</div>
                      <div className="text-2xl font-display font-bold text-neon-cyan">
                        <span dir={isRtlUi ? "ltr" : undefined} className="inline-block unicode-bidi-isolate">
                          {fmtSignedScore(state.accumulatorFinalScore)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                <button
                  onClick={pickNextOrSelected}
                  className="btn-info !h-14 text-base !bg-[#06b6d4] !text-[#041218]"
                >
                  <SkipForward className="w-5 h-5" /> {t("live.nextRider")}
                </button>
                <button
                  onClick={handleManualStart}
                  disabled={!state.currentEntry || state.running || !showClock || currentEntryLocked}
                  className="btn-success !h-14 text-base"
                >
                  <Play className="w-5 h-5" /> START
                </button>
                <button
                  onClick={handlePauseTimer}
                  disabled={!state.running || !showClock}
                  className="btn-warn !h-14 text-base"
                >
                  <Pause className="w-5 h-5" /> PAUSE
                </button>
                <button
                  onClick={handleManualStop}
                  disabled={!state.running || !showClock || currentEntryLocked}
                  className="btn-danger !h-14 text-base"
                >
                  <Flag className="w-5 h-5" /> FINISH
                </button>
                <button
                  onClick={handleToggleSensor}
                  className="btn-warn !h-14 text-base !bg-neon-amber !text-[#1d1602]"
                  disabled={!state.currentEntry || currentEntryLocked}
                >
                  <Bell className="w-5 h-5" /> BILL
                </button>
              </div>

              <div className="card">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <button onClick={handleStartClass} className="btn-success">
                    <Play className="w-4 h-4" /> {t("live.startClass")}
                  </button>
                  <button
                    onClick={handleToggleSensor}
                    className={clsx(
                      state.sensorArmed ? "btn-success" : "btn-warn !bg-neon-amber !text-[#1d1602]"
                    )}
                    disabled={!state.currentEntry || currentEntryLocked}
                  >
                    <Bell className="w-4 h-4" />{" "}
                    {state.sensorArmed ? t("live.disarmSensor", "בטל חימוש") : t("live.armSensor")}
                  </button>
                  <button onClick={handleEndClass} className="btn-ghost">
                    <StopCircle className="w-4 h-4" /> {t("live.endClass")}
                  </button>
                  <button
                    onClick={() => handleAddFault("RETIRED")}
                    className="btn-ghost"
                    disabled={!state.currentEntry || currentEntryLocked}
                  >
                    <Flag className="w-4 h-4" /> {t("live.retired")}
                  </button>
                  <button
                    onClick={() => handleAddFault("ELIMINATION")}
                    className="btn-danger"
                    disabled={!state.currentEntry || currentEntryLocked}
                  >
                    <XOctagon className="w-4 h-4" /> {t("live.elimination")}
                  </button>
                </div>
                <div className={clsx("mt-2 grid grid-cols-2 gap-2", isAccumulator ? "md:grid-cols-8" : "md:grid-cols-6")}>
                  <button onClick={handleResetTimer} className="btn-ghost">
                    <RotateCcw className="w-4 h-4" /> {t("live.reset")}
                  </button>
                  <button onClick={openEditRunModal} className="btn-ghost">
                    {t("live.editRun", "עריכה")}
                  </button>
                  <button
                    onClick={handleOpenRoundDisplay}
                    className={clsx(activeDisplayView === "round" ? "btn-success" : "btn-ghost")}
                  >
                    {t("live.roundScreenShort", "ROUND")}
                  </button>
                  <button
                    onClick={handleOpenFinishDisplay}
                    className={clsx(activeDisplayView === "finish" ? "btn-success" : "btn-ghost")}
                  >
                    {t("live.finishScreenShort", "FINISH")}
                  </button>
                  <button
                    onClick={handleOpenLeaderboardDisplay}
                    className={clsx(activeDisplayView === "leaderboard" ? "btn-success" : "btn-ghost")}
                  >
                    {t("live.leaderboardScreenShort", "BOARD")}
                  </button>
                  <button onClick={handleApproveResult} disabled={!state.currentEntry || currentEntryLocked} className="btn-success">
                    <CheckCircle2 className="w-4 h-4" /> {t("live.approve")}
                  </button>
                </div>
              </div>

            </div>

            <aside className="xl:col-span-2 card flex flex-col min-h-[12rem] max-h-[70vh] space-y-3">
              <div>
                <h3 className="font-display font-bold text-white mb-3 text-center">{t("display.leaderboard")}</h3>
                <div className="space-y-1.5">
                  {rankedTop5.map((r) => (
                    <button key={`top-${r.entryId}`} type="button" className="w-full text-start rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-black text-neon-violet">{r.place != null ? r.place : "—"}</span>
                        <span className="font-mono text-xs text-neon-cyan font-bold tabular-nums">#{r.startNumber}</span>
                      </div>
                      <div className="text-sm font-semibold text-white truncate">{r.riderName}</div>
                      <div className="text-[11px] text-white/50 truncate">{r.horseName}</div>
                      <div className="mt-1 text-[10px] text-white/65 flex flex-wrap items-center gap-2">
                        <span>
                          {t("results.time", "זמן")}: <span className="font-mono text-white/85">{fmt(r.timeMs ?? 0)}</span>
                        </span>
                        <span>
                          {t("results.faults", "עונשין")}: <span className="font-mono text-white/85">{r.faults ?? 0}</span>
                        </span>
                        {isAccumulator && (
                          <span>
                            {t("live.accumulator.finalScore", "ניקוד סופי")}:{" "}
                            <span dir={isRtlUi ? "ltr" : undefined} className="inline-block unicode-bidi-isolate font-mono text-neon-cyan">
                              {fmtSignedScore(r.finalScore ?? r.points ?? 0)}
                            </span>
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {rankedRest.length > 0 && showAllRanking && (
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 pe-1">
                    {rankedRest.map((r) => (
                      <button key={`rest-${r.entryId}`} type="button" className="w-full text-start rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display font-black text-neon-violet">{r.place != null ? r.place : "—"}</span>
                          <span className="font-mono text-xs text-neon-cyan font-bold tabular-nums">#{r.startNumber}</span>
                        </div>
                        <div className="text-sm font-semibold text-white truncate">{r.riderName}</div>
                        <div className="text-[11px] text-white/50 truncate">{r.horseName}</div>
                        <div className="mt-1 text-[10px] text-white/65 flex flex-wrap items-center gap-2">
                          <span>
                            {t("results.time", "זמן")}: <span className="font-mono text-white/85">{fmt(r.timeMs ?? 0)}</span>
                          </span>
                          <span>
                            {t("results.faults", "עונשין")}: <span className="font-mono text-white/85">{r.faults ?? 0}</span>
                          </span>
                          {isAccumulator && (
                            <span>
                              {t("live.accumulator.finalScore", "ניקוד סופי")}:{" "}
                              <span dir={isRtlUi ? "ltr" : undefined} className="inline-block unicode-bidi-isolate font-mono text-neon-cyan">
                                {fmtSignedScore(r.finalScore ?? r.points ?? 0)}
                              </span>
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllRanking((v) => !v)}
                    className="btn-ghost !h-8 !py-0 !px-3 text-xs"
                    disabled={rankedRest.length === 0}
                  >
                    {rankedRest.length === 0
                      ? t("live.noMoreRanking", "אין דירוג נוסף")
                      : showAllRanking
                      ? t("live.showLessRanking", "הצג פחות דירוג")
                      : t("live.showAllRanking", "הצג את כל הדירוג")}
                  </button>
                </div>
              </div>
            </aside>
          </div>

          {!isAccumulator && (
            <div className="card">
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${standardObstacleCount}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: standardObstacleCount }).map((_, idx) => {
                  const n = idx + 1;
                  const current = state.standardObstacles[n];
                  const isDone = !!current;
                  const isRefusal = isDone && current?.notes === "REFUSAL";
                  const isKnockdown = isDone && current?.outcome === "KNOCKDOWN" && !isRefusal;
                  return (
                    <div
                      key={n}
                      className={clsx(
                        "relative rounded-xl border p-2 text-center space-y-1 bg-ink-900/55",
                        isDone
                          ? isRefusal
                            ? "border-neon-amber/80 bg-neon-amber/14 shadow-[0_0_16px_rgba(234,179,8,0.24)]"
                            : isKnockdown
                              ? "border-[#FF0000]/80 bg-[#FF0000]/14 shadow-[0_0_16px_rgba(255,0,0,0.3)]"
                              : "border-neon-lime/60 bg-neon-lime/12 shadow-[0_0_14px_rgba(34,197,94,0.2)]"
                          : "border-white/15"
                      )}
                    >
                      {isDone && (
                        <div
                          className={clsx(
                            "absolute end-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                            isRefusal
                              ? "bg-neon-amber text-[#1f1300]"
                              : isKnockdown
                                ? "bg-[#FF0000] text-white"
                                : "bg-neon-lime text-[#052014]"
                          )}
                        >
                          {isRefusal
                            ? t("live.refusal", "סירוב")
                            : isKnockdown
                              ? t("live.accumulator.refusal", "הפיל")
                              : t("live.accumulator.done", "בוצע")}
                        </div>
                      )}
                      <div className="text-xs font-semibold text-white/85">{n}</div>
                      <div className="space-y-1">
                        <button
                          className={clsx(
                            "w-full rounded-md text-[11px] py-1.5 border",
                            current?.outcome === "CLEAR" && !current?.notes
                              ? "bg-[#22c55e]/30 text-[#d8ffe9] border-[#22c55e]/70"
                              : "bg-[#06b6d4]/12 text-[#22c55e] border-[#06b6d4]/35"
                          )}
                          onClick={() => toggleStandardObstacle(n, "CLEAR")}
                          disabled={!state.currentEntry || currentEntryLocked}
                        >
                          {t("live.accumulator.done", "בוצע")}
                        </button>
                        <button
                          className={clsx(
                            "w-full rounded-md text-[11px] py-1.5 border",
                            current?.outcome === "KNOCKDOWN" && !current?.notes
                              ? "bg-[#FF0000]/30 text-white border-[#FF0000]/80"
                              : "bg-[#06b6d4]/12 text-red-100 border-[#06b6d4]/35"
                          )}
                          onClick={() => toggleStandardObstacle(n, "KNOCKDOWN")}
                          disabled={!state.currentEntry || currentEntryLocked}
                        >
                          {t("live.accumulator.refusal", "הפיל")}
                        </button>
                        <button
                          className="w-full rounded-md text-[11px] py-1.5 border bg-[#eab308]/25 text-yellow-100 border-[#eab308]/60"
                          onClick={() => markStandardRefusal(n)}
                          disabled={!state.currentEntry || currentEntryLocked}
                        >
                          {t("live.refusal", "סירוב")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isAccumulator && (
            <div className="card">
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${obstacleCount + (cls?.hasJoker ? 1 : 0)}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: obstacleCount + (cls?.hasJoker ? 1 : 0) }).map((_, idx) => {
                  const n = idx + 1;
                  const isJokerCard = !!cls?.hasJoker && n === obstacleCount + 1;
                  const targetObstacle = isJokerCard ? obstacleCount : n;
                  const current = state.accumulatorObstacles[targetObstacle];
                  const currentIsJokerAttempt =
                    current?.attempt === "JOKER" || current?.attempt === "JOKER1" || current?.attempt === "JOKER2";
                  const isActiveOnThisCard = isJokerCard ? currentIsJokerAttempt : !currentIsJokerAttempt;
                  const isDone = !!current && isActiveOnThisCard;
                  const isRefusal = isDone && current?.notes === "REFUSAL";
                  const isKnockdown = isDone && current?.outcome === "KNOCKDOWN" && !isRefusal;
                  const jokerAttempt: "JOKER" | "JOKER1" | "JOKER2" =
                    cls?.jokerType === "DOUBLE_JOKER" ? "JOKER2" : cls?.jokerType === "SINGLE_JOKER" ? "JOKER" : "JOKER";
                  return (
                    <div
                      key={n}
                      className={clsx(
                        "relative rounded-xl border p-2 text-center space-y-1 bg-ink-900/55",
                        isDone
                          ? isRefusal
                            ? "border-neon-amber/80 bg-neon-amber/14 shadow-[0_0_16px_rgba(234,179,8,0.24)]"
                            : isKnockdown
                            ? "border-[#FF0000]/80 bg-[#FF0000]/14 shadow-[0_0_16px_rgba(255,0,0,0.3)]"
                            : "border-neon-lime/60 bg-neon-lime/12 shadow-[0_0_14px_rgba(34,197,94,0.2)]"
                          : "border-white/15"
                      )}
                    >
                      {isDone && (
                        <div
                          className={clsx(
                            "absolute end-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                            isRefusal
                              ? "bg-neon-amber text-[#1f1300]"
                              : isKnockdown
                                ? "bg-[#FF0000] text-white"
                                : "bg-neon-lime text-[#052014]"
                          )}
                        >
                          {isRefusal
                            ? t("live.refusal", "סירוב")
                            : isKnockdown
                              ? t("live.accumulator.refusal", "הפיל")
                            : t("live.accumulator.done", "בוצע")}
                        </div>
                      )}
                      <div className="text-xs font-semibold text-white/85">{n}</div>
                      {isJokerCard && <div className="text-[10px] font-semibold text-neon-cyan">JOKER (±20)</div>}
                      {isJokerCard ? (
                        <div className="space-y-1">
                          <button
                            className={clsx(
                              "w-full rounded-md text-[10px] py-1 border",
                              current?.attempt === jokerAttempt && current?.outcome === "CLEAR"
                                ? "bg-[#22c55e]/30 text-[#d8ffe9] border-[#22c55e]/70"
                                : "bg-[#06b6d4]/12 text-[#22c55e] border-[#06b6d4]/35"
                            )}
                            onClick={() => toggleAccumulatorObstacle(targetObstacle, "CLEAR", jokerAttempt)}
                          >
                            {t("live.accumulator.jokerUp", "+20")}
                          </button>
                          <button
                            className={clsx(
                              "w-full rounded-md text-[10px] py-1 border",
                              current?.attempt === jokerAttempt && current?.outcome === "KNOCKDOWN"
                                ? "bg-[#FF0000]/30 text-white border-[#FF0000]/80"
                                : "bg-[#06b6d4]/12 text-red-100 border-[#06b6d4]/35"
                            )}
                            onClick={() => toggleAccumulatorObstacle(targetObstacle, "KNOCKDOWN", jokerAttempt)}
                          >
                            {t("live.accumulator.jokerDown", "-20")}
                          </button>
                          <button
                            className="w-full rounded-md text-[10px] py-1 border bg-[#eab308]/25 text-yellow-100 border-[#eab308]/60"
                            onClick={() => markAccumulatorRefusal(targetObstacle, jokerAttempt)}
                            disabled={!state.currentEntry || currentEntryLocked}
                          >
                            {t("live.refusal", "סירוב")}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <button
                            className={clsx(
                              "w-full rounded-md text-[11px] py-1.5 border",
                              current?.attempt === "NORMAL" && current?.outcome === "CLEAR"
                                ? "bg-[#22c55e]/30 text-[#d8ffe9] border-[#22c55e]/70"
                                : "bg-[#06b6d4]/12 text-[#22c55e] border-[#06b6d4]/35"
                            )}
                            onClick={() => toggleAccumulatorObstacle(targetObstacle, "CLEAR", "NORMAL")}
                          >
                            {t("live.accumulator.done", "בוצע")}
                          </button>
                          <button
                            className={clsx(
                              "w-full rounded-md text-[11px] py-1.5 border",
                              current?.attempt === "NORMAL" && current?.outcome === "KNOCKDOWN"
                                ? "bg-[#FF0000]/30 text-white border-[#FF0000]/80"
                                : "bg-[#06b6d4]/12 text-red-100 border-[#06b6d4]/35"
                            )}
                            onClick={() => toggleAccumulatorObstacle(targetObstacle, "KNOCKDOWN", "NORMAL")}
                          >
                            {t("live.accumulator.refusal", "הפיל")}
                          </button>
                          <button
                            className="w-full rounded-md text-[11px] py-1.5 border bg-[#eab308]/25 text-yellow-100 border-[#eab308]/60"
                            onClick={() => markAccumulatorRefusal(targetObstacle, "NORMAL")}
                            disabled={!state.currentEntry || currentEntryLocked}
                          >
                            {t("live.refusal", "סירוב")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <div className="glass px-3 py-2 text-center"><div className="text-[10px] text-white/50">{t("classes.allowedTime")}</div><div className="font-mono text-neon-lime">{cls?.allowedTime ?? 0}</div></div>
            <div className="glass px-3 py-2 text-center"><div className="text-[10px] text-white/50">{t("results.time")}</div><div className="font-mono text-neon-violet">{fmt(state.elapsedMs)}</div></div>
            <div className="glass px-3 py-2 text-center"><div className="text-[10px] text-white/50">{t("live.timeAddition")}</div><div className="font-mono text-neon-lime">+{state.addedTimeSeconds.toFixed(2)}</div></div>
            <div className="glass px-3 py-2 text-center"><div className="text-[10px] text-white/50">{t("live.accumulator.penalties", "Penalties")}</div><div className="font-mono text-neon-pink">{state.accumulatorPenalties}</div></div>
            <div className="glass px-3 py-2 text-center"><div className="text-[10px] text-white/50">{t("live.refusalsCount", "Refusals")}</div><div className="font-mono text-neon-cyan">{state.refusalCount}</div></div>
            <div className="glass px-3 py-2 text-center"><div className="text-[10px] text-white/50">{t("live.accumulator.points", "Points")}</div><div className="font-mono text-neon-cyan">{state.accumulatorPoints}</div></div>
          </div>
        </div>
      )}
      <Modal
        open={showReadinessModal}
        onClose={() => setShowReadinessModal(false)}
        title={t("live.readiness.title", "Class Not Ready")}
      >
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            {t("live.readiness.subtitle", "Fix the following before starting")}
          </p>
          <div className="space-y-2">
            {readinessIssues.map((issue, idx) => (
              <div
                key={`${issue}-${idx}`}
                className="rounded-xl border border-neon-amber/25 bg-neon-amber/10 px-3 py-2 text-sm text-yellow-100 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{issue}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowReadinessModal(false)} className="btn-ghost">
              {t("common.cancel")}
            </button>
            <button type="button" onClick={handleStartAnyway} className="btn-warn">
              {t("live.readiness.startAnyway", "Start Anyway")}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={showEditRunModal}
        onClose={() => setShowEditRunModal(false)}
        title={t("live.editRun", "עריכה")}
      >
        <div className="space-y-4">
          <div>
            <label className="label">{t("live.manualTimeSeconds", "זמן ידני (שניות)")}</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="input mt-1"
              value={manualTimeSecondsInput}
              onChange={(e) => setManualTimeSecondsInput(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">{t("live.manualFaults", "עונשין")}</label>
              <input
                type="number"
                min={0}
                step={1}
                className="input mt-1"
                value={manualFaultsInput}
                onChange={(e) => setManualFaultsInput(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t("live.editRefusals", "סירובים")}</label>
              <input
                type="number"
                min={0}
                step={1}
                className="input mt-1"
                value={manualRefusalsInput}
                onChange={(e) => setManualRefusalsInput(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t("live.editKnockdowns", "הפלות")}</label>
              <input
                type="number"
                min={0}
                step={1}
                className="input mt-1"
                value={manualKnockdownsInput}
                onChange={(e) => setManualKnockdownsInput(e.target.value)}
              />
            </div>
          </div>
          {isAccumulator && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">{t("live.manualPenalties", "עונשין ידני")}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="input mt-1"
                  value={manualPenaltiesInput}
                  onChange={(e) => setManualPenaltiesInput(e.target.value)}
                />
              </div>
              <div>
                <label className="label">{t("live.manualPoints", "ניקוד ידני")}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="input mt-1"
                  value={manualPointsInput}
                  onChange={(e) => setManualPointsInput(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowEditRunModal(false)} className="btn-ghost">
              {t("common.cancel")}
            </button>
            <button type="button" onClick={applyRunEdits} className="btn-primary">
              {t("common.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
