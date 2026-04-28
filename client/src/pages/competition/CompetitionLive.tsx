import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext, useSearchParams } from "react-router-dom";
import {
  Play,
  StopCircle,
  SkipForward,
  Bell,
  CheckCircle2,
  Hand,
  XOctagon,
  Flag,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/api";
import type { Competition, Entry, ShowClass } from "../../lib/types";
import { getSocket } from "../../lib/socket";

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
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
};

export function CompetitionLive() {
  const { competitionId } = useOutletContext<OutletCtx>();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [classId, setClassId] = useState<string>(searchParams.get("classId") ?? "");
  const [state, setState] = useState<LiveState>(initState);

  useEffect(() => {
    const fromUrl = searchParams.get("classId") ?? "";
    if (fromUrl !== classId) setClassId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function selectClass(id: string) {
    setClassId(id);
    if (id) setSearchParams({ classId: id });
    else setSearchParams({});
  }

  const { data: classes = [] } = useQuery<ShowClass[]>({
    queryKey: ["classes", competitionId],
    queryFn: () => api.get(`/classes?competitionId=${competitionId}`),
    enabled: !!competitionId,
  });
  const { data: classDetail } = useQuery<ShowClass & { entries: Entry[] }>({
    queryKey: ["classDetail", classId],
    queryFn: () => api.get(`/classes/${classId}`),
    enabled: !!classId,
  });

  const cls = classes.find((c) => c.id === classId);

  useEffect(() => {
    if (!classId) return;
    const s = getSocket();
    s.emit("class:join", { classId });
    const onState = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({
        ...prev,
        sensorArmed: p.sensorArmed ?? prev.sensorArmed,
        faults: p.faults ?? prev.faults,
        knockdownCount: p.knockdownCount ?? prev.knockdownCount,
        refusalCount: p.refusalCount ?? prev.refusalCount,
        status: p.status ?? prev.status,
        elapsedMs: p.timer?.elapsedMs ?? prev.elapsedMs,
        running: p.timer?.running ?? prev.running,
      }));
    };
    const onTick = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({ ...prev, elapsedMs: p.elapsedMs, running: true }));
    };
    const onTimerStarted = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({ ...prev, running: true, sensorArmed: false }));
    };
    const onTimerStopped = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({ ...prev, running: false, elapsedMs: p.elapsedMs }));
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
        sensorArmed: false,
      }));
    };
    const onFault = (p: any) => {
      if (p.classId !== classId) return;
      setState((prev) => ({
        ...prev,
        faults: p.faults,
        status: p.status,
        knockdownCount: p.knockdownCount ?? prev.knockdownCount,
        refusalCount: p.refusalCount ?? prev.refusalCount,
      }));
    };
    const onApproved = () => {
      setState((prev) => ({ ...prev, status: "PENDING" }));
    };

    s.on("class:state", onState);
    s.on("timer:tick", onTick);
    s.on("timer:started", onTimerStarted);
    s.on("timer:stopped", onTimerStopped);
    s.on("timer:reset", onTimerReset);
    s.on("sensor:armed", onSensorArmed);
    s.on("rider:current", onRiderCurrent);
    s.on("fault:added", onFault);
    s.on("result:approved", onApproved);

    return () => {
      s.emit("class:leave", { classId });
      s.off("class:state", onState);
      s.off("timer:tick", onTick);
      s.off("timer:started", onTimerStarted);
      s.off("timer:stopped", onTimerStopped);
      s.off("timer:reset", onTimerReset);
      s.off("sensor:armed", onSensorArmed);
      s.off("rider:current", onRiderCurrent);
      s.off("fault:added", onFault);
      s.off("result:approved", onApproved);
    };
  }, [classId]);

  const upcoming = useMemo(() => {
    if (!classDetail) return [];
    return classDetail.entries
      .filter((e) => e.status !== "DONE" && e.id !== state.currentEntry?.id)
      .slice(0, 5);
  }, [classDetail, state.currentEntry]);

  const overTime =
    !!cls && cls.allowedTime != null && state.elapsedMs > cls.allowedTime * 1000;

  function emit(name: string, payload: object = {}) {
    getSocket().emit(name, { classId, ...payload });
  }

  return (
    <div>
      <div className="card mb-4">
        <label className="label">{t("entries.class")}</label>
        <select
          className="select mt-1 max-w-md"
          value={classId}
          onChange={(e) => selectClass(e.target.value)}
        >
          <option value="">{t("live.selectClass")}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.courseHeight}cm
            </option>
          ))}
        </select>
      </div>

      {!classId ? (
        <div className="card text-white/55 text-center py-12">{t("live.selectClass")}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
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
                    animate={{ scale: state.running ? [1, 1.02, 1] : 1 }}
                    transition={{ duration: 1, repeat: state.running ? Infinity : 0 }}
                    className={`text-7xl md:text-8xl font-mono font-bold timer-glow tracking-tight ${
                      overTime ? "text-red-400" : "text-white"
                    }`}
                  >
                    {fmt(state.elapsedMs)}
                  </motion.div>
                </div>

                <div className="mt-4 flex items-center justify-center gap-3">
                  <div className="glass px-5 py-2 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-white/50">
                      {t("live.faults")}
                    </div>
                    <div className="text-2xl font-display font-bold text-neon-pink">{state.faults}</div>
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
                <button onClick={() => emit("class:start")} className="btn-success">
                  <Play className="w-4 h-4" /> {t("live.startClass")}
                </button>
                <button onClick={() => emit("rider:next")} className="btn-primary">
                  <SkipForward className="w-4 h-4" /> {t("live.nextRider")}
                </button>
                <button
                  onClick={() => emit("sensor:arm")}
                  className="btn-warn"
                  disabled={!state.currentEntry}
                >
                  <Bell className="w-4 h-4" /> {t("live.armSensor")}
                </button>
                <button onClick={() => emit("class:end")} className="btn-ghost">
                  <StopCircle className="w-4 h-4" /> {t("live.endClass")}
                </button>
                <button
                  onClick={() => emit("timer:manual_start")}
                  disabled={!state.currentEntry || state.running}
                  className="btn-ghost"
                >
                  <Play className="w-4 h-4" /> {t("live.manualStart")}
                </button>
                <button
                  onClick={() => emit("timer:manual_stop")}
                  disabled={!state.running}
                  className="btn-ghost"
                >
                  <StopCircle className="w-4 h-4" /> {t("live.manualFinish")}
                </button>
                <button onClick={() => emit("timer:reset")} className="btn-ghost">
                  <RotateCcw className="w-4 h-4" /> {t("live.reset")}
                </button>
                <button
                  onClick={() => emit("result:approve")}
                  disabled={!state.currentEntry}
                  className="btn-success"
                >
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
                  {t("live.totalFaults", "Total Faults")}
                </span>
                <span className="text-xl font-display font-bold text-white">{state.faults}</span>
              </div>
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

          <div className="card">
            <h3 className="font-display font-bold text-white mb-3">Next 5</h3>
            <div className="space-y-2">
              {upcoming.length === 0 ? (
                <div className="text-white/45 text-sm py-6 text-center">{t("common.none")}</div>
              ) : (
                upcoming.map((e, i) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/10"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-violet/20 to-neon-cyan/20 border border-white/10 flex items-center justify-center font-mono font-bold text-white">
                      {e.startNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate">{e.rider?.name}</div>
                      <div className="text-xs text-white/55 truncate">{e.horse?.name}</div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
