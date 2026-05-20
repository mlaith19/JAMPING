import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/api";
import type { Competition, Entry, ResultRow, ShowClass } from "../../lib/types";
import { getSocket } from "../../lib/socket";

interface ClassWithEntries extends ShowClass {
  entries: Entry[];
}
interface ResultsPayload {
  class: ShowClass;
  rows: ResultRow[];
}
interface LiveState {
  currentEntry: Entry | null;
  faults: number;
  status: "PENDING" | "OK" | "RETIRED" | "ELIMINATED";
  elapsedMs: number;
  running: boolean;
  accumulatorPoints: number;
  accumulatorPenalties: number;
  accumulatorFinalScore: number;
  accumulatorObstacles: Record<
    number,
    { outcome: "CLEAR" | "KNOCKDOWN"; attempt: "NORMAL" | "JOKER" | "JOKER1" | "JOKER2"; notes?: string }
  >;
  standardObstacles: Record<number, { outcome: "CLEAR" | "KNOCKDOWN"; notes?: string }>;
}

const initLive: LiveState = {
  currentEntry: null,
  faults: 0,
  status: "PENDING",
  elapsedMs: 0,
  running: false,
  accumulatorPoints: 0,
  accumulatorPenalties: 0,
  accumulatorFinalScore: 0,
  accumulatorObstacles: {},
  standardObstacles: {},
};

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const sec = String(s).padStart(2, "0");
  const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
  return `${sec}:${cs}`;
}

function fmtSignedScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0";
  const v = Math.trunc(value);
  return v < 0 ? `-${Math.abs(v)}` : String(v);
}

export function AudienceDisplay() {
  const { classId = "" } = useParams<{ classId: string }>();
  const [params] = useSearchParams();
  const { t, i18n } = useTranslation();
  const langFromQuery = (params.get("lang") ?? "").trim().toLowerCase();

  useEffect(() => {
    if (!langFromQuery) return;
    if (i18n.resolvedLanguage === langFromQuery || i18n.language === langFromQuery) return;
    void i18n.changeLanguage(langFromQuery);
  }, [i18n, langFromQuery]);

  const uiLang = (i18n.resolvedLanguage ?? i18n.language ?? "en").split("-")[0] ?? "en";
  const rtlAudience = uiLang === "he" || uiLang === "ar";
  const qc = useQueryClient();
  const [live, setLive] = useState<LiveState>(initLive);
  const [roomEntryId, setRoomEntryId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const el = document.fullscreenElement;
      setFullscreen(!!el && el === rootRef.current);
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullscreen() {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  }

  const { data: classDetail } = useQuery<ClassWithEntries>({
    queryKey: ["class", classId],
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
  const { data: competition } = useQuery<Competition>({
    queryKey: ["competition", classDetail?.competitionId],
    queryFn: () => api.get(`/competitions/${classDetail?.competitionId}`),
    enabled: !!classDetail?.competitionId,
  });

  useEffect(() => {
    if (!classDetail?.entries?.length || !roomEntryId) return;
    const e = classDetail.entries.find((x) => x.id === roomEntryId);
    if (e) setLive((prev) => ({ ...prev, currentEntry: e }));
  }, [classDetail, roomEntryId]);

  useEffect(() => {
    if (!classId) return;
    const s = getSocket();
    const joinClassRoom = () => {
      s.emit("class:join", { classId });
    };
    joinClassRoom();
    const onState = (p: any) => {
      if (p.classId !== classId) return;
      if (p.currentEntryId !== undefined) setRoomEntryId(p.currentEntryId ?? null);
      setLive((prev) => ({
        ...prev,
        faults: p.faults ?? prev.faults,
        status: p.status ?? prev.status,
        elapsedMs: p.timer?.elapsedMs ?? prev.elapsedMs,
        running: p.timer?.running ?? prev.running,
        accumulatorPoints: p.accumulator?.points ?? prev.accumulatorPoints,
        accumulatorPenalties: p.accumulator?.penalties ?? prev.accumulatorPenalties,
        accumulatorFinalScore:
          p.accumulator?.finalScore ??
          (p.accumulator?.points ?? prev.accumulatorPoints) - (p.accumulator?.penalties ?? prev.accumulatorPenalties),
        accumulatorObstacles: p.accumulator?.obstacles ?? prev.accumulatorObstacles,
        standardObstacles: p.standard?.obstacles ?? prev.standardObstacles,
      }));
    };
    const onTick = (p: any) => p.classId === classId && setLive((prev) => ({ ...prev, elapsedMs: p.elapsedMs, running: true }));
    const onStop = (p: any) => p.classId === classId && setLive((prev) => ({ ...prev, running: false, elapsedMs: p.elapsedMs }));
    const onReset =
      (p: any) =>
        p.classId === classId &&
        setLive((prev) => ({
          ...prev,
          running: false,
          elapsedMs: 0,
          faults: 0,
          status: "PENDING",
          accumulatorPoints: 0,
          accumulatorPenalties: 0,
          accumulatorFinalScore: 0,
          accumulatorObstacles: {},
          standardObstacles: {},
        }));
    const onCurrent = (p: any) => {
      if (p.classId !== classId) return;
      setRoomEntryId(p.entry?.id ?? null);
      setLive((prev) => ({
        ...prev,
        currentEntry: p.entry,
        faults: 0,
        status: "PENDING",
        elapsedMs: 0,
        running: false,
        accumulatorPoints: 0,
        accumulatorPenalties: 0,
        accumulatorFinalScore: 0,
        accumulatorObstacles: {},
        standardObstacles: {},
      }));
      qc.invalidateQueries({ queryKey: ["results", classId] });
    };
    const onFault = (p: any) => p.classId === classId && setLive((prev) => ({ ...prev, faults: p.faults, status: p.status }));
    const onAccumulatorUpdated = (p: any) => {
      if (p.classId !== classId) return;
      setLive((prev) => ({
        ...prev,
        accumulatorPoints: p.points ?? prev.accumulatorPoints,
        accumulatorPenalties: p.penalties ?? prev.accumulatorPenalties,
        accumulatorFinalScore:
          p.finalScore ?? (p.points ?? prev.accumulatorPoints) - (p.penalties ?? prev.accumulatorPenalties),
        accumulatorObstacles: p.obstacles ?? prev.accumulatorObstacles,
      }));
    };
    const onStandardUpdated = (p: any) => {
      if (p.classId !== classId) return;
      setLive((prev) => ({
        ...prev,
        standardObstacles: p.obstacles ?? prev.standardObstacles,
      }));
    };
    const onResultsUpdated = (p: { classId?: string }) => {
      if (p?.classId !== classId) return;
      qc.invalidateQueries({ queryKey: ["results", classId] });
    };
    const onConnect = () => {
      // Socket.io drops rooms on reconnect; rejoin automatically.
      joinClassRoom();
    };
    s.on("class:state", onState);
    s.on("timer:tick", onTick);
    s.on("timer:stopped", onStop);
    s.on("timer:reset", onReset);
    s.on("rider:current", onCurrent);
    s.on("fault:added", onFault);
    s.on("accumulator:updated", onAccumulatorUpdated);
    s.on("standard:updated", onStandardUpdated);
    s.on("result:approved", onResultsUpdated);
    s.on("results:updated", onResultsUpdated);
    s.on("connect", onConnect);
    return () => {
      s.emit("class:leave", { classId });
      s.off("class:state", onState);
      s.off("timer:tick", onTick);
      s.off("timer:stopped", onStop);
      s.off("timer:reset", onReset);
      s.off("rider:current", onCurrent);
      s.off("fault:added", onFault);
      s.off("accumulator:updated", onAccumulatorUpdated);
      s.off("standard:updated", onStandardUpdated);
      s.off("result:approved", onResultsUpdated);
      s.off("results:updated", onResultsUpdated);
      s.off("connect", onConnect);
    };
  }, [classId, qc]);

  const rows = resultsPayload?.rows ?? [];
  const rankedRows = useMemo(() => {
    const working = [...rows];
    const currentId = live.currentEntry?.id;
    if (currentId) {
      const idx = working.findIndex((r) => r.entryId === currentId);
      const liveStatus = live.status === "ELIMINATED" || live.status === "RETIRED" ? live.status : "OK";
      const liveRow = {
        entryId: currentId,
        startNumber: live.currentEntry?.startNumber ?? working[idx]?.startNumber ?? 0,
        horseName: live.currentEntry?.horse?.name ?? working[idx]?.horseName ?? "—",
        riderName: live.currentEntry?.rider?.name ?? working[idx]?.riderName ?? "—",
        faults: live.faults,
        timeMs: live.elapsedMs,
        status: liveStatus,
        approved: false,
        points: live.accumulatorPoints,
        penalties: live.accumulatorPenalties,
        finalScore: live.accumulatorFinalScore,
      };
      if (idx >= 0) working[idx] = { ...working[idx], ...liveRow };
      else working.push(liveRow);
    }

    const isAccumulatorMode = classDetail?.competitionType === "ACCUMULATOR";
    const isTime6080 = classDetail?.competitionType === "TIME_60_80";
    const rankingMode = classDetail?.rankingMode ?? "FAULTS_TIME";
    const valid = working.filter((r) => r.status === "OK" && r.timeMs != null);
    const invalid = working.filter((r) => !(r.status === "OK" && r.timeMs != null));

    if (isAccumulatorMode) {
      valid.sort((a, b) => {
        const scoreDiff = (b.finalScore ?? b.points ?? -9999) - (a.finalScore ?? a.points ?? -9999);
        if (scoreDiff !== 0) return scoreDiff;
        return (a.timeMs ?? Number.MAX_SAFE_INTEGER) - (b.timeMs ?? Number.MAX_SAFE_INTEGER);
      });
    } else if (isTime6080) {
      const targetSec = Number(classDetail?.targetTimeSeconds ?? classDetail?.allowedTime ?? 40);
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
      // FAULTS_TIME / FAULTS_ONLY => less penalties first, then less time.
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
  }, [rows, live, classDetail]);
  const isAccumulator = classDetail?.competitionType === "ACCUMULATOR";
  const roundType = isAccumulator
    ? t("classes.competitionTypes.ACCUMULATOR", "Accumulator (FEI Art. 229)")
    : t("classes.competitionTypes.STANDARD", "Standard");
  const statusLabel =
    live.status === "ELIMINATED"
      ? t("live.elimination", "ELIMINATED")
      : live.status === "RETIRED"
        ? t("live.retired", "RETIRED")
        : live.faults > 0
          ? t("display.fault", "FAULT")
          : t("display.clearRound", "CLEAR ROUND");
  const totalPoints = isAccumulator ? live.accumulatorFinalScore : null;
  const obstacleCount = isAccumulator
    ? classDetail?.numberOfObstacles ?? 10
    : classDetail?.maxObstacles ?? 12;
  const progressCount = obstacleCount + (isAccumulator && classDetail?.hasJoker ? 1 : 0);
  const progressItems = useMemo(() => {
    return Array.from({ length: progressCount }).map((_, idx) => {
      const n = idx + 1;
      const isJoker = isAccumulator && !!classDetail?.hasJoker && n === progressCount;
      const target = isJoker ? obstacleCount : n;
      const o = isAccumulator ? live.accumulatorObstacles[target] : live.standardObstacles[target];
      const isJokerAttempt =
        isAccumulator &&
        ((o as any)?.attempt === "JOKER" || (o as any)?.attempt === "JOKER1" || (o as any)?.attempt === "JOKER2");
      const activeOnCard = isAccumulator ? (isJoker ? isJokerAttempt : !isJokerAttempt) : true;
      let state: "not" | "clear" | "knockdown" | "joker" | "refusal" = "not";
      if (o && activeOnCard) {
        if (isAccumulator && isJoker && o.outcome === "CLEAR") state = "joker";
        else if (o.notes === "REFUSAL") state = "refusal";
        else state = o.outcome === "CLEAR" ? "clear" : "knockdown";
      }
      return { n, isJoker, state };
    });
  }, [progressCount, isAccumulator, classDetail?.hasJoker, obstacleCount, live.accumulatorObstacles, live.standardObstacles]);
  const currentObstacle = progressItems.find((x) => x.state === "not")?.n ?? null;
  const viewMode = params.get("view");
  const isFinishView = viewMode === "finish";
  const isLeaderboardView = viewMode === "leaderboard";
  const currentRow = rankedRows.find((r) => r.entryId === live.currentEntry?.id);
  const currentRank = currentRow?.place ?? null;
  const isNewLeader = isFinishView && currentRank === 1;
  const isClearRound = live.status !== "ELIMINATED" && live.status !== "RETIRED" && live.faults === 0;
  const jumpOffQualified = !isAccumulator && !!classDetail?.hasJumpOff && isClearRound;
  const leaderboardTop5 = rankedRows.slice(0, 5);
  const podium = rankedRows.slice(0, 3);
  const totalRiders = classDetail?.entries?.length ?? 0;
  const completedRiders = classDetail?.entries?.filter((e) => e.status === "DONE").length ?? 0;

  return (
    <div
      ref={rootRef}
      className="min-h-[100dvh] bg-ink-900 text-white overflow-hidden"
      dir={isLeaderboardView ? "ltr" : rtlAudience ? "rtl" : "ltr"}
      data-view={viewMode ?? "round"}
    >
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        className="fixed start-3 top-2 z-[120] inline-flex items-center rounded-2xl border border-neon-cyan/40 bg-ink-700/95 px-2 py-1.5 shadow-glow"
      >
        <img
          src="/logo.png"
          alt={fullscreen ? t("display.fullscreenExit") : t("display.fullscreen")}
          className="h-16 w-auto max-w-[190px] md:h-20 md:max-w-[250px] object-contain"
        />
      </button>

      <div className="w-full min-h-[96px] border-b border-neon-violet/30 bg-ink-800/75 ps-[230px] pe-6 py-5 md:min-h-[118px] md:ps-[295px] md:pe-10 md:py-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 items-center">
          <div className="text-xl md:text-2xl font-display font-black text-neon-cyan truncate">
            {competition?.name ?? t("app.title", "Show Jumping")}
          </div>
          <div className="text-lg md:text-xl font-bold text-zinc-200 truncate">{classDetail?.name ?? "—"}</div>
          <div className="text-lg md:text-xl font-bold text-neon-amber">{roundType}</div>
          <div className="text-lg md:text-xl font-bold text-zinc-200">
            #{live.currentEntry?.startNumber ?? "—"}
          </div>
          <div className="text-end text-3xl md:text-4xl font-mono font-black text-neon-lime">{fmt(live.elapsedMs)}</div>
        </div>
      </div>

      <div className="px-6 md:px-10 py-6 md:py-10">
        {isLeaderboardView ? (
          <div className="space-y-8">
            <div className="card p-5 md:p-6">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 items-center">
                <div className="text-xl md:text-2xl font-black text-[#d4af37]">{t("display.leaderboard", "LEADERBOARD")}</div>
                <div className="text-lg md:text-xl font-bold text-zinc-100 truncate">{classDetail?.name ?? "—"}</div>
                <div className="text-lg md:text-xl font-bold text-[#f0e0b8]">{roundType}</div>
                <div className="text-base md:text-lg text-zinc-200">{t("display.ridersCount", "Riders")}: <span className="font-black">{totalRiders}</span></div>
                <div className="text-base md:text-lg text-zinc-200">{t("display.completedCount", "Completed")}: <span className="font-black">{completedRiders}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, idx) => {
                const row = podium[idx];
                const place = idx + 1;
                const theme =
                  place === 1
                    ? "border-[#d4af37]/80 bg-[#d4af37]/15 shadow-[0_0_28px_rgba(212,175,55,0.35)]"
                    : place === 2
                      ? "border-zinc-300/60 bg-zinc-300/12"
                      : "border-amber-700/70 bg-amber-700/18";
                return (
                  <motion.div
                    key={place}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-3xl border p-5 md:p-6 ${theme}`}
                  >
                    <div className="text-5xl md:text-6xl font-black font-display leading-none text-[#ffe7a3]">
                      #{place}
                    </div>
                    <div className="text-sm tracking-[0.2em] uppercase text-white/75 font-bold">
                      {place === 1
                        ? t("display.firstPlace", "FIRST PLACE")
                        : place === 2
                          ? t("display.secondPlace", "SECOND PLACE")
                          : t("display.thirdPlace", "THIRD PLACE")}
                    </div>
                    <div className="mt-3 text-2xl md:text-3xl font-black text-white">{row?.riderName ?? "—"}</div>
                    <div className="mt-1 text-lg md:text-xl text-[#f0e0b8] font-semibold">{row?.horseName ?? "—"}</div>
                    <div className="mt-3 flex items-center justify-between text-sm md:text-base">
                      <span className="text-zinc-300">
                        {isAccumulator ? t("live.accumulator.points", "Points") : t("results.faults", "Faults")}:{" "}
                        <span className="font-black">
                          {isAccumulator ? (
                            <span dir={rtlAudience ? "ltr" : undefined} className="inline-block unicode-bidi-isolate">
                              {fmtSignedScore(row?.finalScore ?? row?.points ?? 0)}
                            </span>
                          ) : (
                            row?.faults ?? 0
                          )}
                        </span>
                      </span>
                      <span className="text-zinc-300">{fmt(row?.timeMs ?? 0)}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/35 p-4 md:p-5">
              <div className="grid grid-cols-[80px_80px_1.2fr_1.2fr_1fr_1fr_1fr_1fr] gap-2 px-2 py-2 text-xs md:text-sm font-bold tracking-wide uppercase text-[#d4af37] border-b border-white/10">
                <div>{t("display.rank", "Rank")}</div>
                <div>#</div>
                <div>{t("entries.rider", "Rider")}</div>
                <div>{t("entries.horse", "Horse")}</div>
                <div>{t("riders.country", "Country")}</div>
                <div>{isAccumulator ? t("live.accumulator.points", "Points") : t("results.faults", "Faults")}</div>
                <div>{t("results.time", "Time")}</div>
                <div>{t("common.status", "Status")}</div>
              </div>
              <div className="max-h-[55vh] overflow-y-auto space-y-1 pr-1">
                <AnimatePresence initial={false}>
                  {rankedRows.map((r) => {
                    const isLeader = (r.place ?? 9999) === 1;
                    const status = String(r.status ?? "");
                    const isEliminated = status === "ELIMINATED";
                    const isRetired = status === "RETIRED";
                    const faults = r.faults ?? 0;
                    const tone = isLeader
                      ? "border-[#d4af37]/60 bg-[#d4af37]/14"
                      : isEliminated || isRetired
                        ? "border-red-500/35 bg-red-500/12"
                        : faults > 0
                          ? "border-amber-500/35 bg-amber-500/10"
                          : "border-emerald-500/30 bg-emerald-500/10";
                    const statusText = isEliminated
                      ? t("live.elimination", "ELIMINATED")
                      : isRetired
                        ? t("live.retired", "RETIRED")
                        : faults > 0
                          ? t("display.fault", "FAULT")
                          : t("display.clear", "CLEAR");
                    return (
                      <motion.div
                        key={r.entryId}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`grid grid-cols-[80px_80px_1.2fr_1.2fr_1fr_1fr_1fr_1fr] gap-2 px-2 py-2 rounded-xl border ${tone}`}
                      >
                        <div className={`font-black ${isLeader ? "text-[#ffe7a3]" : "text-white"}`}>#{r.place ?? "—"}</div>
                        <div className="font-mono text-zinc-300">{r.startNumber}</div>
                        <div className="truncate font-semibold text-white">{r.riderName}</div>
                        <div className="truncate text-zinc-100">{r.horseName}</div>
                        <div className="truncate text-zinc-300">—</div>
                        <div className="font-black text-white">
                          {isAccumulator ? (
                            <span dir={rtlAudience ? "ltr" : undefined} className="inline-block unicode-bidi-isolate">
                              {fmtSignedScore(r.finalScore ?? r.points ?? 0)}
                            </span>
                          ) : (
                            r.faults ?? 0
                          )}
                        </div>
                        <div className="font-mono text-zinc-200">{fmt(r.timeMs ?? 0)}</div>
                        <div
                          className={
                            isLeader
                              ? "text-[#d4af37] font-black"
                              : isEliminated || isRetired
                                ? "text-red-300 font-bold"
                                : faults > 0
                                  ? "text-amber-300 font-bold"
                                  : "text-emerald-300 font-bold"
                          }
                        >
                          {statusText}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          </div>
        ) : isFinishView ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch">
              <motion.div
                className="xl:col-span-2 card p-6 flex items-center justify-center"
                animate={isNewLeader ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                transition={{ duration: 1, repeat: isNewLeader ? Infinity : 0 }}
              >
                <div className="text-center">
                  <div className="text-[#d4af37] uppercase tracking-[0.25em] text-sm font-bold">{t("display.rank", "RANK")}</div>
                  <div className="text-[7rem] md:text-[9rem] leading-none font-black font-display text-[#ffe7a3]">
                    #{currentRank ?? "—"}
                  </div>
                </div>
              </motion.div>

              <div className="xl:col-span-6 card p-8 md:p-10">
                <div className="text-6xl md:text-8xl font-display font-black leading-tight text-white">
                  {live.currentEntry?.rider?.name ?? t("live.noRider")}
                </div>
                <div className="mt-4 text-3xl md:text-5xl font-semibold text-[#f0e0b8]">
                  {live.currentEntry?.horse?.name ?? "—"}
                </div>
                <div className="mt-3 text-xl md:text-2xl text-zinc-300">
                  {live.currentEntry?.rider?.country ?? "—"} {live.currentEntry?.horse?.owner ? `• ${live.currentEntry.horse.owner}` : ""}
                </div>
              </div>

              <motion.div
                className="xl:col-span-4 card p-7 md:p-8 relative overflow-hidden"
                animate={
                  live.status === "ELIMINATED"
                    ? { boxShadow: ["0 0 0 rgba(239,68,68,0)", "0 0 40px rgba(239,68,68,0.45)", "0 0 0 rgba(239,68,68,0)"] }
                    : isNewLeader
                      ? { boxShadow: ["0 0 0 rgba(212,175,55,0)", "0 0 44px rgba(212,175,55,0.5)", "0 0 0 rgba(212,175,55,0)"] }
                      : isClearRound
                        ? { boxShadow: ["0 0 0 rgba(0,230,118,0)", "0 0 32px rgba(0,230,118,0.4)", "0 0 0 rgba(0,230,118,0)"] }
                        : undefined
                }
                transition={{ duration: 1.3, repeat: Infinity }}
              >
                <div className="text-[#d4af37] uppercase tracking-[0.25em] text-sm font-bold">{t("display.finishResult", "FINISH RESULT")}</div>
                {!isAccumulator ? (
                  <>
                    <div className="mt-5 grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-zinc-400 uppercase">{t("results.faults", "Faults")}</div>
                        <div className="text-5xl font-mono font-black text-white">{live.faults}</div>
                      </div>
                      <div>
                        <div className="text-sm text-zinc-400 uppercase">{t("results.time", "Time")}</div>
                        <div className="text-4xl md:text-5xl font-mono font-black text-[#ffe7a3]">{fmt(live.elapsedMs)}</div>
                      </div>
                    </div>
                    {classDetail?.hasJumpOff && (
                      <div className="mt-4 text-xl font-bold text-[#d4af37]">
                        {jumpOffQualified
                          ? t("display.jumpOffQualified", "JUMP-OFF QUALIFIED")
                          : t("display.jumpOff", "JUMP-OFF")}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="mt-4 text-sm text-zinc-400 uppercase">{t("display.totalPoints", "TOTAL POINTS")}</div>
                    <motion.div
                      key={totalPoints}
                      initial={{ scale: 1.08, opacity: 0.65 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-7xl md:text-8xl font-black font-mono text-[#ffe7a3]"
                    >
                      {totalPoints}
                    </motion.div>
                    <div className="mt-3 text-4xl font-mono font-black text-white">{fmt(live.elapsedMs)}</div>
                    <div className="mt-3 text-lg font-bold text-[#d4af37]">
                      {progressItems.some((x) => x.state === "joker")
                        ? t("display.jokerUsed", "JOKER USED")
                        : t("display.jokerNotUsed", "JOKER NOT USED")}
                    </div>
                  </>
                )}

                <div className="mt-6 flex flex-wrap gap-2">
                  {isNewLeader && <span className="rounded-full bg-[#d4af37]/30 border border-[#d4af37]/70 px-4 py-1.5 text-sm font-black text-[#ffe7a3]">{t("display.newLeader", "NEW LEADER")}</span>}
                  {isClearRound && <span className="rounded-full bg-[#00E676]/20 border border-[#00E676]/60 px-4 py-1.5 text-sm font-black text-[#b8ffd8]">{t("display.clearRound", "CLEAR ROUND")}</span>}
                  {live.status === "ELIMINATED" && <span className="rounded-full bg-red-500/20 border border-red-400/70 px-4 py-1.5 text-sm font-black text-red-200">{t("live.elimination", "ELIMINATED")}</span>}
                  {jumpOffQualified && <span className="rounded-full bg-blue-500/20 border border-blue-400/70 px-4 py-1.5 text-sm font-black text-blue-200">{t("display.jumpOffQualified", "JUMP-OFF QUALIFIED")}</span>}
                </div>
              </motion.div>
            </div>

            <div className="card p-5 md:p-6">
              <div className="text-[#d4af37] uppercase tracking-[0.2em] text-sm font-bold mb-3">{t("display.top5", "TOP 5")}</div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                {leaderboardTop5.map((r) => (
                  <div key={r.entryId} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[#ffe7a3] font-black">#{r.place ?? "—"}</div>
                      <div className="text-xs text-zinc-400">{r.startNumber}</div>
                    </div>
                    <div className="mt-1 text-sm font-bold truncate">{r.riderName}</div>
                    <div className="text-xs text-zinc-400 truncate">{r.horseName}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch">
              <div className="xl:col-span-7 card p-6 md:p-10">
                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 items-center">
                  <div className="h-[220px] w-[220px] mx-auto rounded-3xl border border-neon-violet/35 bg-ink-800/70 overflow-hidden flex items-center justify-center">
                    {live.currentEntry?.rider?.photo ? (
                      <img
                        src={live.currentEntry.rider.photo}
                        alt={live.currentEntry.rider?.name ?? t("entries.rider", "Rider")}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="text-neon-cyan text-sm font-bold tracking-[0.2em]">
                        {t("riders.photo", "Rider Photo").toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="text-center md:text-start">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={live.currentEntry?.id ?? "idle"}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                      >
                        <div className="text-5xl md:text-7xl font-display font-black text-white leading-tight">
                          {live.currentEntry?.rider?.name ?? t("live.noRider")}
                        </div>
                        <div className="mt-3 text-2xl md:text-4xl font-semibold text-neon-cyan/90">
                          {live.currentEntry?.horse?.name ?? "—"}
                        </div>
                        <div className="mt-3 text-lg md:text-2xl text-zinc-300">
                          {live.currentEntry?.rider?.country ?? "—"} {live.currentEntry?.horse?.owner ? `• ${live.currentEntry.horse.owner}` : ""}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-5 card p-6 md:p-8">
                <div className="text-neon-amber uppercase tracking-[0.25em] text-sm font-bold">{t("results.title", "LIVE RESULT")}</div>
                <div className="mt-5 text-6xl md:text-7xl font-black font-mono text-white">
                  {isAccumulator ? (
                    <span dir={rtlAudience ? "ltr" : undefined} className="inline-block unicode-bidi-isolate">
                      {fmtSignedScore(live.accumulatorFinalScore)}
                    </span>
                  ) : (
                    live.faults
                  )}
                </div>
                {isAccumulator && (
                  <motion.div
                    key={live.accumulatorFinalScore}
                    initial={{ scale: 1.08, opacity: 0.75 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="mt-2 text-neon-amber text-lg font-bold"
                  >
                    {t("display.totalPoints", "TOTAL POINTS")}
                  </motion.div>
                )}
                <div className="mt-5 text-5xl md:text-6xl font-mono font-black text-neon-lime">{fmt(live.elapsedMs)}</div>
                <div className="mt-6 text-2xl md:text-3xl font-extrabold">
                  <span
                    className={
                      live.status === "ELIMINATED"
                        ? "text-red-400"
                        : live.status === "RETIRED"
                          ? "text-orange-300"
                          : live.faults > 0
                            ? "text-red-300"
                            : "text-emerald-300"
                    }
                  >
                    {statusLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8 card p-5 md:p-6">
              <div className="text-neon-amber uppercase tracking-[0.2em] text-sm font-bold mb-4">
                {t("live.accumulator.obstacles", "COURSE PROGRESS")}
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${progressCount}, minmax(0, 1fr))` }}>
                {progressItems.map((item) => {
                  const isCurrent = item.n === currentObstacle;
                  const isDone = item.state === "clear" || item.state === "joker";
                  const isRefusal = item.state === "refusal";
                  const isKnockdown = item.state === "knockdown";
                  const base =
                    isDone
                      ? "border-[#22c55e]/80 bg-[#22c55e]/18"
                      : isRefusal
                        ? "border-[#eab308]/80 bg-[#eab308]/18"
                        : isKnockdown
                          ? "border-[#FF0000]/80 bg-[#FF0000]/14"
                          : "border-white/15 bg-transparent";
                  return (
                    <motion.div
                      key={item.n}
                      animate={isCurrent ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                      transition={{ duration: 1.3, repeat: isCurrent ? Infinity : 0 }}
                      className={`rounded-2xl border p-2 text-center ${base}`}
                    >
                      <div className="text-[11px] md:text-xs text-white/80 mb-1 font-bold">{item.n}</div>
                      {(isDone || isRefusal || isKnockdown) && (
                        <div
                          className={`mx-auto inline-flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-full border-2 font-black text-lg md:text-xl ${
                            isDone
                              ? "border-[#22c55e] bg-[#22c55e]/28 text-[#d8ffe9]"
                              : isRefusal
                                ? "border-[#eab308] bg-[#eab308]/28 text-yellow-100"
                                : "border-[#FF0000] bg-[#FF0000]/28 text-white"
                          }`}
                        >
                          {isDone ? "V" : isRefusal ? "R" : "X"}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
