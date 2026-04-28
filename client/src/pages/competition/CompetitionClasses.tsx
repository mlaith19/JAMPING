import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { Plus, Trash2, Edit3 } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "../../lib/api";
import type {
  Competition,
  RankingMode,
  ScoringType,
  SecondDisobedienceRule,
  ShowClass,
  TableType,
} from "../../lib/types";
import { Modal } from "../../components/ui/Modal";

interface ClassForm {
  name: string;
  courseHeight: number;
  category: string;
  allowedTime: number | null;
  timeLimit: number | null;
  tableType: TableType;
  rankingMode: RankingMode;
  hasJumpOff: boolean;
  jumpOffAgainstClock: boolean;
  secondDisobedienceRule: SecondDisobedienceRule;
  scoringType: ScoringType;
  knockdownFaults: number;
  firstRefusalFaults: number;
  secondRefusalFaults: number;
  maxRefusalsBeforeElimination: number;
  timeFaultIntervalSeconds: number;
  timeFaultPoints: number;
  jumpOffTimeFaultIntervalSeconds: number;
  jumpOffTimeFaultPoints: number;
  timeLimitMultiplier: number;
}

const defaultForm: ClassForm = {
  name: "",
  courseHeight: 110,
  category: "Open",
  allowedTime: 80,
  timeLimit: 160,
  tableType: "A",
  rankingMode: "FAULTS_TIME",
  hasJumpOff: false,
  jumpOffAgainstClock: false,
  secondDisobedienceRule: "FEI",
  scoringType: "FAULTS_TIME",
  knockdownFaults: 4,
  firstRefusalFaults: 4,
  secondRefusalFaults: 8,
  maxRefusalsBeforeElimination: 2,
  timeFaultIntervalSeconds: 4,
  timeFaultPoints: 1,
  jumpOffTimeFaultIntervalSeconds: 1,
  jumpOffTimeFaultPoints: 1,
  timeLimitMultiplier: 2.0,
};

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
}

function formFromClass(c: ShowClass): ClassForm {
  return {
    name: c.name,
    courseHeight: c.courseHeight,
    category: c.category,
    allowedTime: c.allowedTime,
    timeLimit: c.timeLimit,
    tableType: c.tableType,
    rankingMode: c.rankingMode,
    hasJumpOff: c.hasJumpOff,
    jumpOffAgainstClock: c.jumpOffAgainstClock,
    secondDisobedienceRule: c.secondDisobedienceRule,
    scoringType: c.scoringType,
    knockdownFaults: c.knockdownFaults,
    firstRefusalFaults: c.firstRefusalFaults,
    secondRefusalFaults: c.secondRefusalFaults,
    maxRefusalsBeforeElimination: c.maxRefusalsBeforeElimination,
    timeFaultIntervalSeconds: c.timeFaultIntervalSeconds,
    timeFaultPoints: c.timeFaultPoints,
    jumpOffTimeFaultIntervalSeconds: c.jumpOffTimeFaultIntervalSeconds,
    jumpOffTimeFaultPoints: c.jumpOffTimeFaultPoints,
    timeLimitMultiplier: c.timeLimitMultiplier,
  };
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05] transition"
    >
      <span className="text-sm text-white/85">{label}</span>
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
          checked ? "bg-gradient-to-r from-neon-violet to-neon-cyan" : "bg-white/15"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

export function CompetitionClasses() {
  const { competitionId } = useOutletContext<OutletCtx>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ShowClass | null>(null);
  const [form, setForm] = useState<ClassForm>(defaultForm);
  const [timeLimitTouched, setTimeLimitTouched] = useState(false);

  const { data: classes = [] } = useQuery<ShowClass[]>({
    queryKey: ["classes", competitionId],
    queryFn: () => api.get(`/classes?competitionId=${competitionId}`),
    enabled: !!competitionId,
  });

  const save = useMutation({
    mutationFn: async (data: ClassForm) => {
      if (editing) {
        return api.patch<ShowClass>(`/classes/${editing.id}`, data);
      }
      return api.post<ShowClass>("/classes", { ...data, competitionId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes", competitionId] });
      qc.invalidateQueries({ queryKey: ["classes", competitionId, undefined] });
      closeModal();
    },
  });

  const removeClass = useMutation({
    mutationFn: (cid: string) => api.del(`/classes/${cid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes", competitionId] }),
  });

  function startNew() {
    setEditing(null);
    setForm(defaultForm);
    setTimeLimitTouched(false);
    setOpen(true);
  }
  function startEdit(c: ShowClass) {
    setEditing(c);
    setForm(formFromClass(c));
    setTimeLimitTouched(true); // existing class — don't auto-recalc
    setOpen(true);
  }
  function closeModal() {
    setOpen(false);
    setEditing(null);
    setForm(defaultForm);
    setTimeLimitTouched(false);
  }

  function setAllowedTime(v: string) {
    const num = v === "" ? null : Number(v);
    setForm((f) => ({
      ...f,
      allowedTime: num,
      timeLimit: timeLimitTouched
        ? f.timeLimit
        : num != null && num > 0
        ? Math.round(num * f.timeLimitMultiplier)
        : null,
    }));
  }
  function setTimeLimit(v: string) {
    setTimeLimitTouched(true);
    setForm((f) => ({ ...f, timeLimit: v === "" ? null : Number(v) }));
  }
  function setTimeLimitMultiplier(v: string) {
    const num = v === "" ? 2 : Number(v);
    setForm((f) => ({
      ...f,
      timeLimitMultiplier: num,
      timeLimit:
        timeLimitTouched
          ? f.timeLimit
          : f.allowedTime != null && f.allowedTime > 0
          ? Math.round(f.allowedTime * num)
          : f.timeLimit,
    }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-xl text-white">{t("classes.title")}</h2>
        <button onClick={startNew} className="btn-primary">
          <Plus className="w-4 h-4" /> {t("classes.add")}
        </button>
      </div>

      {classes.length === 0 ? (
        <div className="card text-white/55 text-center py-10">{t("common.none")}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {classes.map((c, idx) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.03 }}
              className="card"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display font-bold text-white text-lg">{c.name}</div>
                  <div className="text-xs text-white/55 mt-0.5">{c.category}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(c)}
                    aria-label={t("common.edit")}
                    title={t("common.edit")}
                    className="p-1.5 rounded-lg text-white/45 hover:text-neon-cyan hover:bg-white/[0.05] transition"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(t("common.confirmDelete"))) removeClass.mutate(c.id);
                    }}
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                    className="p-1.5 rounded-lg text-white/45 hover:text-red-400 hover:bg-white/[0.05] transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div className="glass p-2">
                  <div className="text-[10px] text-white/45 uppercase">cm</div>
                  <div className="text-lg font-display font-bold text-neon-cyan">{c.courseHeight}</div>
                </div>
                <div className="glass p-2">
                  <div className="text-[10px] text-white/45 uppercase">sec</div>
                  <div className="text-lg font-display font-bold text-neon-amber">
                    {c.allowedTime ?? "—"}
                  </div>
                </div>
                <div className="glass p-2">
                  <div className="text-[10px] text-white/45 uppercase">kd</div>
                  <div className="text-lg font-display font-bold text-neon-pink">+{c.knockdownFaults}</div>
                </div>
              </div>
              <div className="mt-3">
                <span className="badge-violet">{t(`classes.scoringTypes.${c.scoringType}`)}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={closeModal}
        title={editing ? t("classes.edit") : t("classes.add")}
        width="max-w-5xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
          className="space-y-4"
        >
          {/* Row 1 — basic info */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <label className="label">{t("common.name")}</label>
              <input
                required
                className="input mt-1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t("classes.tableType")}</label>
              <select
                className="select mt-1"
                value={form.tableType}
                onChange={(e) => setForm({ ...form, tableType: e.target.value as TableType })}
              >
                <option value="A">{t("classes.tableTypes.A")}</option>
                <option value="C">{t("classes.tableTypes.C")}</option>
              </select>
            </div>
            <div>
              <label className="label">{t("classes.category")}</label>
              <input
                className="input mt-1"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rankingMode")}</label>
              <select
                className="select mt-1"
                value={form.rankingMode}
                onChange={(e) => setForm({ ...form, rankingMode: e.target.value as RankingMode })}
              >
                <option value="FAULTS_TIME">{t("classes.rankingModes.FAULTS_TIME")}</option>
                <option value="FAULTS_ONLY">{t("classes.rankingModes.FAULTS_ONLY")}</option>
                <option value="TIME_ONLY">{t("classes.rankingModes.TIME_ONLY")}</option>
              </select>
            </div>
          </div>

          {/* Row 2 — time + rules */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="label">{t("classes.courseHeight")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.courseHeight}
                onChange={(e) => setForm({ ...form, courseHeight: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.allowedTime")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.allowedTime ?? ""}
                onChange={(e) => setAllowedTime(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t("classes.timeLimit")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.timeLimit ?? ""}
                onChange={(e) => setTimeLimit(e.target.value)}
              />
              <div className="text-[10px] text-white/40 mt-1">{t("classes.timeLimitAuto")}</div>
            </div>
            <div>
              <label className="label">{t("classes.rules.timeLimitMultiplier")}</label>
              <input
                type="number"
                step={0.1}
                min={1}
                className="input mt-1"
                value={form.timeLimitMultiplier}
                onChange={(e) => setTimeLimitMultiplier(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t("classes.secondDisobedience")}</label>
              <select
                className="select mt-1"
                value={form.secondDisobedienceRule}
                onChange={(e) =>
                  setForm({
                    ...form,
                    secondDisobedienceRule: e.target.value as SecondDisobedienceRule,
                  })
                }
              >
                <option value="FEI">{t("classes.secondDisobedienceRules.FEI")}</option>
                <option value="LOCAL">{t("classes.secondDisobedienceRules.LOCAL")}</option>
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Toggle
              checked={form.hasJumpOff}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  hasJumpOff: v,
                  jumpOffAgainstClock: v ? f.jumpOffAgainstClock : false,
                }))
              }
              label={t("classes.hasJumpOff")}
            />
            <Toggle
              checked={form.jumpOffAgainstClock}
              onChange={(v) => setForm({ ...form, jumpOffAgainstClock: v })}
              label={t("classes.jumpOffAgainstClock")}
            />
          </div>

          {/* Scoring Rules */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
            <div className="font-display font-bold text-white text-sm">{t("classes.scoringRules")}</div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="label">{t("classes.rules.knockdownFaults")}</label>
                <input
                  type="number"
                  min={0}
                  className="input mt-1"
                  value={form.knockdownFaults}
                  onChange={(e) => setForm({ ...form, knockdownFaults: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">{t("classes.rules.firstRefusalFaults")}</label>
                <input
                  type="number"
                  min={0}
                  className="input mt-1"
                  value={form.firstRefusalFaults}
                  onChange={(e) => setForm({ ...form, firstRefusalFaults: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">{t("classes.rules.secondRefusalFaults")}</label>
                <input
                  type="number"
                  min={0}
                  className="input mt-1"
                  value={form.secondRefusalFaults}
                  onChange={(e) => setForm({ ...form, secondRefusalFaults: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">{t("classes.rules.maxRefusalsBeforeElimination")}</label>
                <input
                  type="number"
                  min={1}
                  className="input mt-1"
                  value={form.maxRefusalsBeforeElimination}
                  onChange={(e) =>
                    setForm({ ...form, maxRefusalsBeforeElimination: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="label">{t("classes.rules.timeFaultIntervalSeconds")}</label>
                <input
                  type="number"
                  min={1}
                  className="input mt-1"
                  value={form.timeFaultIntervalSeconds}
                  onChange={(e) =>
                    setForm({ ...form, timeFaultIntervalSeconds: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="label">{t("classes.rules.timeFaultPoints")}</label>
                <input
                  type="number"
                  min={0}
                  className="input mt-1"
                  value={form.timeFaultPoints}
                  onChange={(e) => setForm({ ...form, timeFaultPoints: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">{t("classes.rules.jumpOffTimeFaultIntervalSeconds")}</label>
                <input
                  type="number"
                  min={1}
                  className="input mt-1"
                  value={form.jumpOffTimeFaultIntervalSeconds}
                  onChange={(e) =>
                    setForm({ ...form, jumpOffTimeFaultIntervalSeconds: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="label">{t("classes.rules.jumpOffTimeFaultPoints")}</label>
                <input
                  type="number"
                  min={0}
                  className="input mt-1"
                  value={form.jumpOffTimeFaultPoints}
                  onChange={(e) =>
                    setForm({ ...form, jumpOffTimeFaultPoints: Number(e.target.value) })
                  }
                />
              </div>
              <div className="hidden md:block" />
              <div className="hidden md:block" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={closeModal} className="btn-ghost">
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {editing ? t("common.save") : t("common.create")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
