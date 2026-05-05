import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, Minimize2 } from "lucide-react";
import { api } from "../../lib/api";
import type { Entry, ResultRow, ShowClass } from "../../lib/types";
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
}

const initLive: LiveState = { currentEntry: null, faults: 0, status: "PENDING", elapsedMs: 0, running: false };

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.${String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}`;
}

export function AudienceDisplay() {
  const { classId = "" } = useParams<{ classId: string }>();
  const { t, i18n } = useTranslation();
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
  });

  useEffect(() => {
    if (!classDetail?.entries?.length || !roomEntryId) return;
    const e = classDetail.entries.find((x) => x.id === roomEntryId);
    if (e) setLive((prev) => ({ ...prev, currentEntry: e }));
  }, [classDetail, roomEntryId]);

  useEffect(() => {
    if (!classId) return;
    const s = getSocket();
    s.emit("class:join", { classId });
    const onState = (p: any) => {
      if (p.classId !== classId) return;
      if (p.currentEntryId !== undefined) setRoomEntryId(p.currentEntryId ?? null);
      setLive((prev) => ({
        ...prev,
        faults: p.faults ?? prev.faults,
        status: p.status ?? prev.status,
        elapsedMs: p.timer?.elapsedMs ?? prev.elapsedMs,
        running: p.timer?.running ?? prev.running,
      }));
    };
    const onTick = (p: any) => p.classId === classId && setLive((prev) => ({ ...prev, elapsedMs: p.elapsedMs, running: true }));
    const onStop = (p: any) => p.classId === classId && setLive((prev) => ({ ...prev, running: false, elapsedMs: p.elapsedMs }));
    const onReset = (p: any) => p.classId === classId && setLive((prev) => ({ ...prev, running: false, elapsedMs: 0, faults: 0, status: "PENDING" }));
    const onCurrent = (p: any) => {
      if (p.classId !== classId) return;
      setRoomEntryId(p.entry?.id ?? null);
      setLive((prev) => ({ ...prev, currentEntry: p.entry, faults: 0, status: "PENDING", elapsedMs: 0, running: false }));
    };
    const onFault = (p: any) => p.classId === classId && setLive((prev) => ({ ...prev, faults: p.faults, status: p.status }));
    const onResultsUpdated = (p: { classId?: string }) => {
      if (p?.classId !== classId) return;
      qc.invalidateQueries({ queryKey: ["results", classId] });
    };
    s.on("class:state", onState);
    s.on("timer:tick", onTick);
    s.on("timer:stopped", onStop);
    s.on("timer:reset", onReset);
    s.on("rider:current", onCurrent);
    s.on("fault:added", onFault);
    s.on("result:approved", onResultsUpdated);
    s.on("results:updated", onResultsUpdated);
    return () => {
      s.emit("class:leave", { classId });
      s.off("class:state", onState);
      s.off("timer:tick", onTick);
      s.off("timer:stopped", onStop);
      s.off("timer:reset", onReset);
      s.off("rider:current", onCurrent);
      s.off("fault:added", onFault);
      s.off("result:approved", onResultsUpdated);
      s.off("results:updated", onResultsUpdated);
    };
  }, [classId, qc]);

  const rows = resultsPayload?.rows ?? [];
  const rankedRows = useMemo(() => {
    const sorted = [...rows];
    sorted.sort((a, b) => (a.place ?? 9999) - (b.place ?? 9999) || a.startNumber - b.startNumber);
    return sorted;
  }, [rows]);

  return (
    <div
      ref={rootRef}
      className="min-h-[100dvh] bg-[#06060d] text-white selection:bg-cyan-500/30 overflow-x-hidden box-border [&:fullscreen]:min-h-[100vh] [&:fullscreen]:h-auto [&:fullscreen]:max-h-none [&:fullscreen]:overflow-y-auto [&:fullscreen]:overscroll-y-contain [&:fullscreen]:pb-10"
      dir={rtlAudience ? "rtl" : "ltr"}
    >
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        className="fixed top-3 sm:top-5 start-3 sm:start-5 z-[200] inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-zinc-950/90 px-3 py-2.5 sm:px-4 sm:py-3 text-sm font-bold text-white"
        aria-pressed={fullscreen}
      >
        {fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        <span className="max-sm:sr-only">{fullscreen ? t("display.fullscreenExit") : t("display.fullscreen")}</span>
      </button>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-8 md:px-12 py-6 md:py-10 flex flex-col xl:flex-row gap-8 xl:gap-12 min-h-min">
        <main className={`flex-1 min-w-0 flex flex-col items-center text-center xl:py-4 min-h-min ${fullscreen ? "justify-start py-2 xl:justify-start xl:py-6" : "justify-center"}`}>
          <AnimatePresence mode="wait">
            <motion.div key={live.currentEntry?.id ?? "idle"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-4xl">
              {live.currentEntry ? (
                <>
                  <h1 className="mt-6 text-4xl sm:text-5xl md:text-7xl font-black font-display">{live.currentEntry.rider?.name ?? "—"}</h1>
                  <p className="mt-3 text-2xl sm:text-3xl md:text-5xl text-cyan-200/90">{live.currentEntry.horse?.name ?? "—"}</p>
                  <div className="mt-8 text-7xl sm:text-8xl md:text-[10rem] font-mono font-black">{fmt(live.elapsedMs)}</div>
                  <div className="mt-6 text-5xl font-black text-fuchsia-400">{live.faults}</div>
                </>
              ) : (
                <div className="py-20 text-3xl text-zinc-600">{t("live.noRider")}</div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <aside className="w-full xl:w-[min(100%,28rem)] shrink-0 xl:pt-6 flex flex-col min-h-0">
          <div className={`rounded-3xl border border-white/10 bg-zinc-900/80 backdrop-blur-md shadow-2xl shadow-black/50 flex flex-col min-h-[12rem] ${fullscreen ? "max-h-[min(70vh,36rem)] xl:max-h-[min(92vh,calc(100vh-10rem))]" : "max-h-[min(70vh,36rem)] xl:max-h-[calc(100dvh-5rem)]"}`}>
            <h2 className="text-lg md:text-xl font-black uppercase tracking-[0.25em] text-zinc-400 px-5 md:px-6 pt-5 md:pt-6 pb-4 shrink-0 border-b border-white/[0.06] text-center w-full">
              {t("display.leaderboard")}
            </h2>
            <div className="overflow-y-auto overflow-x-auto min-h-0 flex-1 px-3 pb-4 md:px-5 md:pb-5 xl:pb-6 overscroll-contain">
              <ol className="space-y-2">
                {rankedRows.map((r) => (
                  <li key={r.entryId} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-black text-neon-violet">{r.place ?? "—"}</span>
                      <span className="font-mono text-xs text-neon-cyan font-bold">#{r.startNumber}</span>
                    </div>
                    <div className="text-sm font-semibold text-white truncate">{r.riderName}</div>
                    <div className="text-[11px] text-white/50 truncate">{r.horseName}</div>
                  </li>
                ))}
                {rankedRows.length === 0 && <li className="text-center py-10 text-zinc-500">{t("common.none")}</li>}
              </ol>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
