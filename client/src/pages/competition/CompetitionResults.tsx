import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { Download, FileText, Send, Medal } from "lucide-react";
import { motion } from "framer-motion";
import { api, downloadUrl } from "../../lib/api";
import type { Competition, ResultRow, ShowClass } from "../../lib/types";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { getSocket } from "../../lib/socket";

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
}

interface ResultsResponse {
  class: ShowClass;
  rows: ResultRow[];
}

const placeColors = [
  "from-yellow-300 to-amber-500",
  "from-slate-200 to-slate-400",
  "from-orange-400 to-orange-600",
];

function fmt(ms: number | null) {
  if (ms == null) return "-";
  return (ms / 1000).toFixed(2);
}

export function CompetitionResults() {
  const { competitionId } = useOutletContext<OutletCtx>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [classId, setClassId] = useState("");

  const { data: classes = [] } = useQuery<ShowClass[]>({
    queryKey: ["classes", competitionId],
    queryFn: () => api.get(`/classes?competitionId=${competitionId}`),
    enabled: !!competitionId,
  });
  const { data } = useQuery<ResultsResponse>({
    queryKey: ["results", classId],
    queryFn: () => api.get(`/results/${classId}`),
    enabled: !!classId,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (!classId) return;
    const s = getSocket();
    const onUpdated = (p: any) => {
      if (p?.classId === classId) {
        qc.invalidateQueries({ queryKey: ["results", classId] });
      }
    };
    s.on("results:updated", onUpdated);
    return () => {
      s.off("results:updated", onUpdated);
    };
  }, [classId, qc]);

  const rows = data?.rows ?? [];
  const podium = rows.filter((r) => r.place && r.place <= 3);

  return (
    <div>
      <div className="card mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="label">{t("entries.class")}</label>
            <select className="select mt-1" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t("common.select")}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {classId && (
            <div className="flex items-center gap-2">
              <a className="btn-ghost" href={downloadUrl(`/results/${classId}/export.xlsx`)} target="_blank" rel="noreferrer">
                <Download className="w-4 h-4" /> {t("results.exportXlsx")}
              </a>
              <a className="btn-ghost" href={downloadUrl(`/results/${classId}/export.pdf`)} target="_blank" rel="noreferrer">
                <FileText className="w-4 h-4" /> {t("results.exportPdf")}
              </a>
              <button className="btn-primary" onClick={() => api.post(`/results/${classId}/publish`)}>
                <Send className="w-4 h-4" /> {t("results.publish")}
              </button>
            </div>
          )}
        </div>
      </div>

      {!classId ? (
        <div className="card text-white/55 text-center py-12">{t("live.selectClass")}</div>
      ) : (
        <>
          {podium.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {podium.map((r, idx) => (
                <motion.div
                  key={r.entryId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="card relative overflow-hidden"
                >
                  <div className={`absolute -top-12 -end-12 w-40 h-40 rounded-full blur-3xl bg-gradient-to-br ${placeColors[idx]} opacity-[0.18]`} />
                  <div className="relative flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${placeColors[idx]} flex items-center justify-center`}>
                      <Medal className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs uppercase tracking-wider text-white/55 font-bold">
                        {t("results.place")} {r.place}
                      </div>
                      <div className="font-display font-bold text-white text-lg truncate">{r.riderName}</div>
                      <div className="text-xs text-white/55 truncate">{r.horseName}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <span className="text-neon-pink font-bold">{r.faults ?? 0} {t("results.faults")}</span>
                        <span className="text-neon-cyan font-mono font-bold">{fmt(r.timeMs)}s</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("results.place")}</th>
                  <th>#</th>
                  <th>{t("entries.rider")}</th>
                  <th>{t("entries.horse")}</th>
                  <th>{t("results.faults")}</th>
                  <th>{t("results.time")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.entryId}>
                    <td className="font-display font-bold text-lg">
                      {r.place ? (
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-neon-violet to-neon-cyan">
                          {r.place}
                        </span>
                      ) : (
                        <span className="text-white/30">-</span>
                      )}
                    </td>
                    <td className="font-mono text-neon-cyan">{r.startNumber}</td>
                    <td className="font-semibold text-white">{r.riderName}</td>
                    <td className="text-white/65">{r.horseName}</td>
                    <td className="font-mono text-neon-pink font-bold">{r.faults ?? "-"}</td>
                    <td className="font-mono text-white/85">{fmt(r.timeMs)}</td>
                    <td><StatusBadge status={String(r.status)} /></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-white/45">{t("common.none")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
