import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { Plus, Trash2, Hash } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/api";
import type { Competition, Entry, EntryStatus, Horse, Rider, ShowClass } from "../../lib/types";
import { StatusBadge } from "../../components/ui/StatusBadge";

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
}

export function CompetitionEntries() {
  const { competitionId } = useOutletContext<OutletCtx>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [classId, setClassId] = useState<string>("");
  const [horseId, setHorseId] = useState<string>("");
  const [riderId, setRiderId] = useState<string>("");
  const [overrideNum, setOverrideNum] = useState<string>("");

  const { data: classes = [] } = useQuery<ShowClass[]>({
    queryKey: ["classes", competitionId],
    queryFn: () => api.get(`/classes?competitionId=${competitionId}`),
    enabled: !!competitionId,
  });
  const { data: horses = [] } = useQuery<Horse[]>({
    queryKey: ["horses"],
    queryFn: () => api.get("/horses"),
  });
  const { data: riders = [] } = useQuery<Rider[]>({
    queryKey: ["riders"],
    queryFn: () => api.get("/riders"),
  });
  const { data: entries = [] } = useQuery<Entry[]>({
    queryKey: ["entries", competitionId, classId],
    queryFn: () => {
      const qs = new URLSearchParams({ competitionId });
      if (classId) qs.set("classId", classId);
      return api.get(`/entries?${qs}`);
    },
    enabled: !!competitionId,
  });

  const register = useMutation({
    mutationFn: () =>
      api.post<Entry>("/entries", {
        competitionId,
        classId,
        horseId,
        riderId,
        ...(overrideNum ? { startNumber: Number(overrideNum) } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entries", competitionId] });
      setHorseId("");
      setRiderId("");
      setOverrideNum("");
    },
  });

  const updateStatus = useMutation({
    mutationFn: (vars: { id: string; status: EntryStatus }) =>
      api.patch(`/entries/${vars.id}`, { status: vars.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entries", competitionId] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/entries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entries", competitionId] }),
  });

  const canRegister = !!classId && !!horseId && !!riderId;
  const filtered = useMemo(
    () => (classId ? entries.filter((e) => e.classId === classId) : entries),
    [entries, classId]
  );

  return (
    <div>
      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label">{t("entries.class")}</label>
            <select className="select mt-1" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t("common.all")}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t("entries.horse")}</label>
            <select className="select mt-1" value={horseId} onChange={(e) => setHorseId(e.target.value)}>
              <option value="">-</option>
              {horses.map((h) => (
                <option key={h.id} value={h.id}>#{h.internalNumber} · {h.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t("entries.rider")}</label>
            <select className="select mt-1" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
              <option value="">-</option>
              {riders.map((r) => (
                <option key={r.id} value={r.id}>#{r.internalNumber} · {r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t("entries.startNumber")}</label>
            <div className="relative flex-1 mt-1">
              <Hash className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-white/40" />
              <input
                type="number"
                placeholder="auto"
                className="input ps-9"
                value={overrideNum}
                onChange={(e) => setOverrideNum(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <button
            disabled={!canRegister || register.isPending}
            onClick={() => register.mutate()}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> {t("entries.register")}
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t("entries.class")}</th>
              <th>{t("entries.rider")}</th>
              <th>{t("entries.horse")}</th>
              <th>{t("common.status")}</th>
              <th className="text-end">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {filtered.map((e) => (
                <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <td className="font-mono font-bold text-neon-cyan">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-neon-violet/20 to-neon-cyan/20 border border-white/10 text-white">
                      {e.startNumber}
                    </div>
                  </td>
                  <td className="text-white/75">{e.showClass?.name}</td>
                  <td className="font-semibold text-white">{e.rider?.name}</td>
                  <td className="text-white/75">{e.horse?.name}</td>
                  <td>
                    <select
                      value={e.status}
                      onChange={(ev) => updateStatus.mutate({ id: e.id, status: ev.target.value as EntryStatus })}
                      className="select py-1.5 text-xs"
                    >
                      <option value="REGISTERED">{t("status.REGISTERED")}</option>
                      <option value="ACTIVE">{t("status.ACTIVE")}</option>
                      <option value="SCRATCHED">{t("status.SCRATCHED")}</option>
                      <option value="DONE">{t("status.DONE")}</option>
                    </select>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <StatusBadge status={e.status} />
                      <button
                        onClick={() => {
                          if (confirm(t("common.confirmDelete"))) remove.mutate(e.id);
                        }}
                        className="btn-ghost px-2 py-1.5 text-red-300 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-white/45">{t("common.none")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
