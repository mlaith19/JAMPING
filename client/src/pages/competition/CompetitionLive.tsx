import { useEffect, useMemo, useState } from "react";
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
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
  return `${mm}:${ss}.${cs}`;
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
};

export function CompetitionLive() {
  const { competitionId } = useOutletContext<OutletCtx>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [classId, setClassId] = useState<string>(searchParams.get("classId") ?? "");
  const [selectedEntryId, setSelectedEntryId] = useState<string>("");
  const [state, setState] = useState<LiveState>(initState);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [manualModeEnabled, setManualModeEnabled] = useState(false);
  const [readinessIssues, setReadinessIssues] = useState<string[]>([]);
  const [showReadinessModal, setShowReadinessModal] = useState(false);

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
  });
  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => api.get("/devices"),
  });

  const cls = classDetail;
  const isAccumulator = cls?.competitionType === "ACCUMULATOR";
  const obstacleCount = cls?.numberOfObstacles ?? 10;
  const showClock =
    !isAccumulator ||
    cls?.accumulatorMode === "AGAINST_CLOCK_NO_JUMP_OFF" ||
    cls?.accumulatorMode === "AGAINST_CLOCK_WITH_JUMP_OFF";

  useEffect(() => {
    if (!classId) return;
    const s = getSocket();
    s.emit("class:join", { classId });
    const inv = () => {
      qc.invalidateQueries({ queryKey: ["classDetail", classId] });
      qc.invalidateQueries({ queryKey: ["results", classId] });
    };
    const onState = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({
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
      }));
    };
    const onTick = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => {
        if (prev.status === "ELIMINATED" || prev.status === "RETIRED") {
          return { ...prev, running: false };
        }
        return { ...prev, elapsedMs: p.elapsedMs, running: true };
      });
    };
    const onTimerStarted = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({ ...prev, running: true, sensorArmed: false }));
    };
    const onTimerStopped = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({ ...prev, running: false, elapsedMs: p.elapsedMs }));
    };
    const onTimerPaused = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({
        ...prev,
        running: false,
        elapsedMs: p.elapsedMs ?? prev.elapsedMs,
        addedTimeSeconds: p.addedTimeSeconds ?? prev.addedTimeSeconds,
      }));
      showNotice(t("live.pauseNotice", "השעון הושהה"), "info");
    };
    const onTimerReset = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({
        ...prev,
        running: false,
        elapsedMs: 0,
        faults: 0,
        knockdownCount: 0,
        refusalCount: 0,
        status: "PENDING",
      }));
    };
    const onSensorArmed = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({ ...prev, sensorArmed: true }));
    };
    const onRiderCurrent = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({
        ...prev,
        currentEntry: p.entry,
        faults: 0,
        knockdownCount: 0,
        refusalCount: 0,
        status: "PENDING",
        elapsedMs: 0,
        running: false,
        addedTimeSeconds: 0,
        sensorArmed: false,
        accumulatorPoints: 0,
        accumulatorPenalties: 0,
        accumulatorFinalScore: 0,
        accumulatorObstacles: {},
      }));
      inv();
    };
    const onFault = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({
        ...prev,
        faults: p.faults,
        status: p.status,
        knockdownCount: p.knockdownCount ?? prev.knockdownCount,
        refusalCount: p.refusalCount ?? prev.refusalCount,
        running: p.status === "ELIMINATED" || p.status === "RETIRED" ? false : prev.running,
        accumulatorPenalties: p.faults ?? prev.accumulatorPenalties,
        accumulatorFinalScore: prev.accumulatorPoints - (p.faults ?? prev.accumulatorPenalties),
      }));
    };
    const onAccumulatorUpdated = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({
        ...prev,
        accumulatorPoints: p.points ?? prev.accumulatorPoints,
        accumulatorPenalties: p.penalties ?? prev.accumulatorPenalties,
        accumulatorFinalScore:
          p.finalScore ?? (p.points ?? prev.accumulatorPoints) - (p.penalties ?? prev.accumulatorPenalties),
        accumulatorObstacles: p.obstacles ?? prev.accumulatorObstacles,
      }));
    };
    const onApproved = () => {
      setState((prev) => ({ ...prev, status: "PENDING" }));
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

    s.on("class:state", onState);
    s.on("timer:tick", onTick);
    s.on("timer:started", onTimerStarted);
    s.on("timer:stopped", onTimerStopped);
    s.on("timer:paused", onTimerPaused);
    s.on("timer:reset", onTimerReset);
    s.on("sensor:armed", onSensorArmed);
    s.on("rider:current", onRiderCurrent);
    s.on("fault:added", onFault);
    s.on("result:approved", onApproved);
    s.on("class:ended", onClassEnded);
    s.on("results:updated", onResultsUpdated);
    s.on("jumpoff:started", onJumpOffStarted);
    s.on("jumpoff:not_required", onJumpOffNotRequired);
    s.on("jumpoff:completed", onJumpOffCompleted);
    s.on("accumulator:updated", onAccumulatorUpdated);

    return () => {
      s.emit("class:leave", { classId });
      s.off("class:state", onState);
      s.off("timer:tick", onTick);
      s.off("timer:started", onTimerStarted);
      s.off("timer:stopped", onTimerStopped);
      s.off("timer:paused", onTimerPaused);
      s.off("timer:reset", onTimerReset);
      s.off("sensor:armed", onSensorArmed);
      s.off("rider:current", onRiderCurrent);
      s.off("fault:added", onFault);
      s.off("result:approved", onApproved);
      s.off("class:ended", onClassEnded);
      s.off("results:updated", onResultsUpdated);
      s.off("jumpoff:started", onJumpOffStarted);
      s.off("jumpoff:not_required", onJumpOffNotRequired);
      s.off("jumpoff:completed", onJumpOffCompleted);
      s.off("accumulator:updated", onAccumulatorUpdated);
    };
  }, [classId, qc, t]);

  const classEntriesSorted = useMemo(() => {
    if (!classDetail?.entries?.length) return [];
    return [...classDetail.entries].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [classDetail]);
  const rankedRows = useMemo(() => {
    const rows = resultsPayload?.rows ?? [];
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const ap = a.place ?? 9999;
      const bp = b.place ?? 9999;
      if (ap !== bp) return ap - bp;
      return a.startNumber - b.startNumber;
    });
    return sorted;
  }, [resultsPayload]);

  const overTime =
    !!cls && cls.allowedTime != null && state.elapsedMs > cls.allowedTime * 1000;

  function emit(name: string, payload: object = {}) {
    getSocket().emit(name, { classId, ...payload });
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
    const canPickSelected = !!selected && selected.status !== "SCRATCHED";
    if (canPickSelected) {
      emit("entry:pick", { entryId: selected.id });
      return;
    }
    emit("rider:next");
  }

  function pickEntryForJudging(entry: Entry) {
    if (entry.status === "SCRATCHED") return;
    emit("entry:pick", { entryId: entry.id });
  }

  function handleStartJumpOff() {
    if (!classId) {
      showNotice(t("live.selectClass"), "error");
      return;
    }
    const ok = window.confirm(t("live.confirmStartJumpOff", "Start Jump-Off for tied first place?"));
    if (!ok) return;
    emit("jumpoff:start");
    showNotice(t("live.startingJumpOff", "Preparing Jump-Off..."), "info");
  }

  function submitAccumulatorObstacle(
    obstacleNumber: number,
    outcome: "CLEAR" | "KNOCKDOWN",
    attempt: "NORMAL" | "JOKER" | "JOKER1" | "JOKER2" = "NORMAL"
  ) {
    emit("accumulator:obstacle", { obstacleNumber, outcome, attempt });
  }

  return (
    <div>
      {notice && (
        <div
          className={clsx(
            "mb-3 rounded-xl border px-3 py-2 text-sm font-medium",
            notice.type === "success" && "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
            notice.type === "error" && "border-red-400/40 bg-red-500/15 text-red-200",
            notice.type === "info" && "border-neon-cyan/40 bg-neon-cyan/10 text-cyan-100"
          )}
        >
          {notice.message}
        </div>
      )}
      {!classId ? (
        <div className="card text-white/55 text-center py-12">{t("live.selectClass")}</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          <aside className="xl:col-span-3 order-2 xl:order-1 card flex flex-col min-h-[10rem] max-h-[60vh] xl:max-h-[calc(100vh-12rem)]">
            <h3 className="font-display font-bold text-white mb-1">{t("live.classEntries")}</h3>
            <p className="text-[11px] text-white/45 mb-3 leading-snug">{t("live.doubleClickToJudge")}</p>
            <div className="overflow-y-auto flex-1 min-h-0 -mx-2 px-2 space-y-1.5">
              {classEntriesSorted.map((e) => {
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
                      inactive && !isCurrent && "border-white/10 bg-white/[0.02]",
                      isCurrent && "border-neon-cyan/70 bg-neon-cyan/15",
                      isSelected && !isCurrent && "border-neon-violet/60 bg-neon-violet/10",
                      !inactive && !isCurrent && "border-white/12 bg-white/[0.03] hover:bg-white/[0.07] cursor-pointer"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 font-mono text-sm font-bold text-neon-cyan tabular-nums w-9 shrink-0">
                        {e.startNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white text-sm leading-tight truncate">{e.rider?.name ?? "—"}</div>
                        <div className="text-[11px] text-white/50 truncate">{e.horse?.name ?? "—"}</div>
                        {(inactive || isCurrent) && (
                          <div className="mt-1 text-[10px] uppercase font-bold tracking-wide text-white/40">
                            {inactive ? t(`status.${e.status}`) : t("live.activeNow")}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {classEntriesSorted.length === 0 && (
                <div className="text-white/45 text-sm py-8 text-center">{t("common.none")}</div>
              )}
            </div>
          </aside>

          <div className="xl:col-span-6 order-1 xl:order-2 space-y-4 min-w-0">
            <div className="card relative overflow-hidden">
              <div className="absolute inset-0 bg-hero-gradient opacity-30" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-white/55 font-bold">
                      {t("live.current")}
                    </div>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={state.currentEntry?.id ?? "none"}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                      >
                        {state.currentEntry ? (
                          <div>
                            <div className="text-3xl md:text-4xl font-display font-bold text-white">
                              {state.currentEntry.rider?.name}
                            </div>
                            <div className="text-white/65 mt-1">{state.currentEntry.horse?.name}</div>
                          </div>
                        ) : (
                          <div className="text-2xl text-white/45 mt-2">{t("live.noRider")}</div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  {state.currentEntry && (
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-neon-violet to-neon-cyan flex items-center justify-center text-3xl font-display font-bold text-white">
                      {state.currentEntry.startNumber}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-center">
                  <motion.div
                    animate={{ scale: showClock && state.running ? [1, 1.02, 1] : 1 }}
                    transition={{ duration: 1, repeat: showClock && state.running ? Infinity : 0 }}
                    className={`text-7xl md:text-8xl font-mono font-bold timer-glow tracking-tight ${
                      overTime ? "text-red-400" : "text-white"
                    }`}
                  >
                    {showClock ? fmt(state.elapsedMs) : String(state.accumulatorFinalScore)}
                  </motion.div>
                </div>
                {isAccumulator && (
                  <div className="mt-2 text-center text-sm text-white/70">
                    {t("live.accumulator.finalScore", "Final Score")} = {state.accumulatorPoints} -{" "}
                    {state.accumulatorPenalties} ={" "}
                    <span className="font-bold text-neon-lime">{state.accumulatorFinalScore}</span>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-center gap-3">
                  <div className="glass px-5 py-2 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-white/50">
                      {t("live.faults")}
                    </div>
                    <div className="text-2xl font-display font-bold text-neon-pink">{state.faults}</div>
                  </div>
                  <div className="glass px-5 py-2 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-white/50">
                      {t("live.timeAddition", "תוספת זמן")}
                    </div>
                    <div className="text-2xl font-display font-bold text-neon-amber">
                      {state.addedTimeSeconds}
                    </div>
                  </div>
                  {state.sensorArmed && (
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="badge-amber"
                    >
                      <Bell className="w-3 h-3 me-1" /> {t("live.armed")}
                    </motion.div>
                  )}
                  {state.status !== "PENDING" && state.status !== "OK" && (
                    <span className={state.status === "ELIMINATED" ? "badge-pink" : "badge-amber"}>
                      {t(`status.${state.status}`)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <button onClick={handleStartClass} className="btn-success">
                  <Play className="w-4 h-4" /> {t("live.startClass")}
                </button>
                <button
                  onClick={() => setManualModeEnabled((prev) => !prev)}
                  className={manualModeEnabled ? "btn-warn" : "btn-ghost"}
                >
                  <Hand className="w-4 h-4" />{" "}
                  {manualModeEnabled
                    ? t("live.manualModeOn", "Manual mode: ON")
                    : t("live.manualModeOff", "Manual mode: OFF")}
                </button>
                <button onClick={pickNextOrSelected} className="btn-primary">
                  <SkipForward className="w-4 h-4" /> {t("live.nextRider")}
                </button>
                <button onClick={handleStartJumpOff} className="btn-ghost">
                  <Flag className="w-4 h-4" /> {t("live.startJumpOff", "Start Jump-Off")}
                </button>
                <button
                  onClick={() => emit("sensor:arm")}
                  className="btn-warn"
                  disabled={!state.currentEntry}
                >
                  <Bell className="w-4 h-4" /> {t("live.armSensor")}
                </button>
                <button onClick={handleEndClass} className="btn-ghost">
                  <StopCircle className="w-4 h-4" /> {t("live.endClass")}
                </button>
                <button
                  onClick={() => emit("timer:pause")}
                  disabled={!state.running || !showClock}
                  className="btn-warn"
                >
                  <Pause className="w-4 h-4" /> {t("live.pause", "Pause")}
                </button>
                <button
                  onClick={() => emit("timer:manual_start")}
                  disabled={!state.currentEntry || state.running || !showClock}
                  className="btn-ghost"
                >
                  <Play className="w-4 h-4" /> {t("live.manualStart")}
                </button>
                <button
                  onClick={() => emit("timer:manual_stop")}
                  disabled={!state.running || !showClock}
                  className="btn-ghost"
                >
                  <StopCircle className="w-4 h-4" /> {t("live.manualFinish")}
                </button>
                <button onClick={() => emit("timer:reset")} className="btn-ghost">
                  <RotateCcw className="w-4 h-4" /> {t("live.reset")}
                </button>
                <button onClick={handleApproveResult} disabled={!state.currentEntry} className="btn-success">
                  <CheckCircle2 className="w-4 h-4" /> {t("live.approve")}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="glass px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
                  {t("live.knockdownsCount", "Knockdowns")}
                </span>
                <span className="text-xl font-display font-bold text-neon-pink">{state.knockdownCount}</span>
              </div>
              <div className="glass px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
                  {t("live.refusalsCount", "Refusals")}
                </span>
                <span className="text-xl font-display font-bold text-neon-amber">{state.refusalCount}</span>
              </div>
              <div className="glass px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
                  {isAccumulator ? t("live.accumulator.penalties", "Penalties") : t("live.totalFaults", "Total Faults")}
                </span>
                <span className="text-xl font-display font-bold text-white">{state.faults}</span>
              </div>
              {isAccumulator && (
                <div className="glass px-3 py-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
                    {t("live.accumulator.points", "Points")}
                  </span>
                  <span className="text-xl font-display font-bold text-neon-lime">{state.accumulatorPoints}</span>
                </div>
              )}
              <div className="glass px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
                  {t("common.status")}
                </span>
                <span
                  className={`text-xs font-display font-bold ${
                    state.status === "ELIMINATED"
                      ? "text-neon-pink"
                      : state.status === "RETIRED"
                      ? "text-neon-amber"
                      : state.status === "OK"
                      ? "text-neon-lime"
                      : "text-white/60"
                  }`}
                >
                  {t(`status.${state.status}`)}
                </span>
              </div>
            </div>

            {isAccumulator && (
              <div className="card space-y-3">
                <div className="text-sm font-semibold text-white/85">
                  {t("live.accumulator.obstacles", "Accumulator obstacles")}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
                  {Array.from({ length: obstacleCount }).map((_, idx) => {
                    const n = idx + 1;
                    const isLast = n === obstacleCount;
                    const current = state.accumulatorObstacles[n];
                    return (
                      <div key={n} className="rounded-xl border border-white/10 bg-white/[0.03] p-2 space-y-2">
                        <div className="text-xs text-white/70">#{n}</div>
                        <div className="grid grid-cols-2 gap-1">
                          <button className="btn-success !h-8 !text-xs" onClick={() => submitAccumulatorObstacle(n, "CLEAR")}>
                            {t("live.accumulator.clear", "Clear")}
                          </button>
                          <button className="btn-danger !h-8 !text-xs" onClick={() => submitAccumulatorObstacle(n, "KNOCKDOWN")}>
                            {t("live.accumulator.knockdown", "Knockdown")}
                          </button>
                        </div>
                        {isLast && cls?.hasJoker && (
                          <div className="grid grid-cols-1 gap-1">
                            <button className="btn-ghost !h-8 !text-xs" onClick={() => submitAccumulatorObstacle(n, "CLEAR", "NORMAL")}>
                              {t("live.accumulator.normal", "Normal")}
                            </button>
                            {cls.jokerType === "SINGLE_JOKER" && (
                              <button className="btn-primary !h-8 !text-xs" onClick={() => submitAccumulatorObstacle(n, "CLEAR", "JOKER")}>
                                {t("live.accumulator.joker", "Joker")}
                              </button>
                            )}
                            {cls.jokerType === "DOUBLE_JOKER" && (
                              <>
                                <button className="btn-primary !h-8 !text-xs" onClick={() => submitAccumulatorObstacle(n, "CLEAR", "JOKER1")}>
                                  {t("live.accumulator.joker1", "Joker 1")}
                                </button>
                                <button className="btn-primary !h-8 !text-xs" onClick={() => submitAccumulatorObstacle(n, "CLEAR", "JOKER2")}>
                                  {t("live.accumulator.joker2", "Joker 2")}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        {current && <div className="text-[10px] text-white/55">{current.attempt} / {current.outcome}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <button
                onClick={() => emit("fault:add", { type: "KNOCKDOWN" })}
                className="btn-ghost h-20 flex-col text-base"
                disabled={!state.currentEntry}
              >
                <Hand className="w-5 h-5 text-neon-pink" />
                <span>{t("live.knockdown")}</span>
              </button>
              <button
                onClick={() => emit("fault:add", { type: "REFUSAL" })}
                className="btn-ghost h-20 flex-col text-base"
                disabled={!state.currentEntry}
              >
                <Flag className="w-5 h-5 text-neon-amber" />
                <span>{t("live.refusal")}</span>
              </button>
              <button
                onClick={() => emit("fault:add", { type: "RETIRED" })}
                className="btn-ghost h-20 flex-col text-base"
                disabled={!state.currentEntry}
              >
                <Flag className="w-5 h-5 text-neon-cyan" />
                <span>{t("live.retired")}</span>
              </button>
              <button
                onClick={() => emit("fault:add", { type: "ELIMINATION" })}
                className="btn-danger h-20 flex-col text-base"
                disabled={!state.currentEntry}
              >
                <XOctagon className="w-5 h-5" />
                <span>{t("live.elimination")}</span>
              </button>
            </div>
          </div>

          <aside className="xl:col-span-3 order-3 card flex flex-col min-h-[10rem] max-h-[65vh] xl:max-h-[calc(100vh-12rem)]">
            <h3 className="font-display font-bold text-white mb-4 text-center tracking-[0.2em] text-sm uppercase text-zinc-400">
              {t("display.leaderboard")}
            </h3>
            <div className="overflow-y-auto flex-1 min-h-0 -mx-2 px-2 space-y-2">
              {rankedRows.length === 0 ? (
                <div className="text-white/45 text-sm py-8 text-center">{t("common.none")}</div>
              ) : (
                rankedRows.map((r) => (
                  <div
                    key={r.entryId}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-black text-neon-violet">{r.place != null ? r.place : "—"}</span>
                      <span className="font-mono text-xs text-neon-cyan font-bold tabular-nums">#{r.startNumber}</span>
                    </div>
                    <div className="text-sm font-semibold text-white truncate">{r.riderName}</div>
                    <div className="text-[11px] text-white/50 truncate">{r.horseName}</div>
                    <div className="flex justify-between gap-2 pt-1 text-[11px]">
                      <span className="text-white/55">
                        {isAccumulator
                          ? `${t("live.accumulator.finalScore", "Final Score")}: `
                          : `${t("results.faults")}: `}
                        <span className="font-mono text-fuchsia-300">
                          {isAccumulator ? (r.finalScore ?? "—") : (r.faults ?? "—")}
                        </span>
                      </span>
                      <span className="font-mono text-white/80 tabular-nums">
                        {showClock && r.timeMs != null ? `${(r.timeMs / 1000).toFixed(2)}` : "—"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
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
                className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 flex items-start gap-2"
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
    </div>
  );
}
