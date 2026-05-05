import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { Competition, RankingMode, SecondDisobedienceRule, ShowClass, TableType } from "../../lib/types";

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
}

type RulesForm = {
  tableType: TableType;
  courseLengthMeters: number | null;
  horseSpeedMetersPerMinute: number;
  maxObstacles: number;
  tableCDisobedienceWithKnockdownSeconds: number;
  applyTimeAdditionToClock: boolean;
  rankingMode: RankingMode;
  allowedTime: number | null;
  timeLimit: number | null;
  timeLimitMultiplier: number;
  secondDisobedienceRule: SecondDisobedienceRule;
  hasJumpOff: boolean;
  jumpOffAgainstClock: boolean;
  knockdownFaults: number;
  firstRefusalFaults: number;
  secondRefusalFaults: number;
  maxRefusalsBeforeElimination: number;
  timeFaultIntervalSeconds: number;
  timeFaultPoints: number;
  jumpOffTimeFaultIntervalSeconds: number;
  jumpOffTimeFaultPoints: number;
};

function sanitizePositiveInt(value: number | null | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const n = Math.round(Number(value));
  return n > 0 ? n : fallback;
}

function sanitizeMultiplier(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 2;
  const n = Number(value);
  if (n <= 1) return 1.1;
  return Number(n.toFixed(2));
}

function allowedTimeFromCourse(courseLengthMeters: number | null, horseSpeedMetersPerMinute: number): number | null {
  if (!courseLengthMeters || courseLengthMeters <= 0) return null;
  const sec = (courseLengthMeters * 60) / horseSpeedMetersPerMinute;
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.round(sec);
}

function timeLimitFromAllowed(allowedTime: number | null, multiplier: number): number | null {
  if (!allowedTime || allowedTime <= 0) return null;
  const t = allowedTime * multiplier;
  if (!Number.isFinite(t) || t <= 0) return null;
  return Math.round(t);
}

function toForm(c: ShowClass): RulesForm {
  const courseLengthMeters = c.courseLengthMeters ?? null;
  const horseSpeedMetersPerMinute = sanitizePositiveInt(c.horseSpeedMetersPerMinute, 350);
  const timeLimitMultiplier = sanitizeMultiplier(c.timeLimitMultiplier);
  const allowedTime = allowedTimeFromCourse(courseLengthMeters, horseSpeedMetersPerMinute) ?? c.allowedTime ?? null;
  return {
    tableType: c.tableType,
    courseLengthMeters,
    horseSpeedMetersPerMinute,
    maxObstacles: Math.min(15, sanitizePositiveInt(c.maxObstacles, 12)),
    tableCDisobedienceWithKnockdownSeconds: sanitizePositiveInt(c.tableCDisobedienceWithKnockdownSeconds, 6),
    applyTimeAdditionToClock: !!c.applyTimeAdditionToClock,
    rankingMode: c.rankingMode,
    allowedTime,
    timeLimit: timeLimitFromAllowed(allowedTime, timeLimitMultiplier),
    timeLimitMultiplier,
    secondDisobedienceRule: c.secondDisobedienceRule,
    hasJumpOff: c.hasJumpOff,
    jumpOffAgainstClock: c.jumpOffAgainstClock,
    knockdownFaults: c.knockdownFaults,
    firstRefusalFaults: c.firstRefusalFaults,
    secondRefusalFaults: c.secondRefusalFaults,
    maxRefusalsBeforeElimination: c.maxRefusalsBeforeElimination,
    timeFaultIntervalSeconds: c.timeFaultIntervalSeconds,
    timeFaultPoints: c.timeFaultPoints,
    jumpOffTimeFaultIntervalSeconds: c.jumpOffTimeFaultIntervalSeconds,
    jumpOffTimeFaultPoints: c.jumpOffTimeFaultPoints,
  };
}

function readApiError(err: unknown): string {
  if (!(err instanceof Error)) return "Save failed";
  try {
    const parsed = JSON.parse(err.message) as { error?: string };
    return parsed.error ?? err.message;
  } catch {
    return err.message;
  }
}

export function CompetitionClassRules() {
  const { t } = useTranslation();
  const { competitionId } = useOutletContext<OutletCtx>();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [classId, setClassId] = useState(searchParams.get("classId") ?? "");
  const [form, setForm] = useState<RulesForm | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { data: classes = [] } = useQuery<ShowClass[]>({
    queryKey: ["classes", competitionId],
    queryFn: () => api.get(`/classes?competitionId=${competitionId}`),
    enabled: !!competitionId,
  });

  useEffect(() => {
    const fromUrl = searchParams.get("classId") ?? "";
    if (fromUrl !== classId) setClassId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const selected = classes.find((c) => c.id === classId);
    if (selected) setForm(toForm(selected));
    else setForm(null);
  }, [classes, classId]);

  function recalc(next: RulesForm): RulesForm {
    const allowed = allowedTimeFromCourse(next.courseLengthMeters, next.horseSpeedMetersPerMinute);
    const timeLimit = timeLimitFromAllowed(allowed, next.timeLimitMultiplier);
    return { ...next, allowedTime: allowed, timeLimit };
  }

  const save = useMutation({
    mutationFn: () => {
      if (!form || !classId) throw new Error("No class selected");
      return api.patch(`/classes/${classId}`, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes", competitionId] });
      qc.invalidateQueries({ queryKey: ["classDetail", classId] });
      setNotice({ type: "success", text: t("classes.rules.saveSuccess", "Saved successfully") });
    },
    onError: (err) => {
      setNotice({ type: "error", text: readApiError(err) });
    },
  });

  return (
    <div className="space-y-4">
      {!form ? (
        <div className="card text-white/55 text-center py-10">{t("live.selectClass")}</div>
      ) : (
        <form
          className="card space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {notice && (
            <div
              className={`rounded-xl border px-3 py-2 text-sm ${
                notice.type === "success"
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border-red-400/40 bg-red-500/15 text-red-200"
              }`}
            >
              {notice.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <div>
              <label className="label">{t("classes.secondDisobedience")}</label>
              <select
                className="select mt-1"
                value={form.secondDisobedienceRule}
                onChange={(e) =>
                  setForm({ ...form, secondDisobedienceRule: e.target.value as SecondDisobedienceRule })
                }
              >
                <option value="FEI">{t("classes.secondDisobedienceRules.FEI")}</option>
                <option value="LOCAL">{t("classes.secondDisobedienceRules.LOCAL")}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="label">{t("classes.courseLengthMeters", "אורך מסלול (מטר)")}</label>
              <input
                type="number"
                min={1}
                className="input mt-1"
                value={form.courseLengthMeters ?? ""}
                onChange={(e) =>
                  setForm(
                    recalc({
                      ...form,
                      courseLengthMeters: e.target.value ? sanitizePositiveInt(Number(e.target.value), 1) : null,
                    })
                  )
                }
              />
            </div>
            <div>
              <label className="label">{t("classes.horseSpeedMetersPerMinute", "מהירות סוס (מטר/דקה)")}</label>
              <input
                type="number"
                min={50}
                className="input mt-1"
                value={form.horseSpeedMetersPerMinute}
                onChange={(e) =>
                  setForm(
                    recalc({
                      ...form,
                      horseSpeedMetersPerMinute: sanitizePositiveInt(Number(e.target.value), 350),
                    })
                  )
                }
              />
            </div>
            <div>
              <label className="label">{t("classes.allowedTime")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.allowedTime ?? ""}
                readOnly
              />
              <div className="text-[11px] text-white/50 mt-1">
                {t("classes.allowedTimeCourseFormula", "נוסחה: אורך מסלול × 60 / מהירות סוס")}
              </div>
            </div>
            <div>
              <label className="label">{t("classes.timeLimit")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.timeLimit ?? ""}
                readOnly
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.timeLimitMultiplier")}</label>
              <input
                type="number"
                step={0.1}
                min={1}
                className="input mt-1"
                value={form.timeLimitMultiplier}
                onChange={(e) =>
                  setForm(
                    recalc({
                      ...form,
                      timeLimitMultiplier: sanitizeMultiplier(Number(e.target.value)),
                    })
                  )
                }
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={form.hasJumpOff}
                  onChange={(e) => setForm({ ...form, hasJumpOff: e.target.checked })}
                />
                {t("classes.hasJumpOff")}
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={form.jumpOffAgainstClock}
                  onChange={(e) => setForm({ ...form, jumpOffAgainstClock: e.target.checked })}
                />
                {t("classes.jumpOffAgainstClock")}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">{t("classes.maxObstacles", "מקסימום מכשולים")}</label>
              <input
                type="number"
                min={1}
                max={15}
                className="input mt-1"
                value={form.maxObstacles}
                onChange={(e) => setForm({ ...form, maxObstacles: Math.min(15, sanitizePositiveInt(Number(e.target.value), 12)) })}
              />
              <div className="text-[11px] text-white/50 mt-1">
                {t("classes.maxObstaclesHint", "מותר לבחור עד 15 מכשולים")}
              </div>
            </div>
            <div>
              <label className="label">{t("classes.timeAdditionSeconds", "תוספת זמן (שניות)")}</label>
              <input
                type="number"
                min={1}
                className="input mt-1"
                value={form.tableCDisobedienceWithKnockdownSeconds}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tableCDisobedienceWithKnockdownSeconds: sanitizePositiveInt(Number(e.target.value), 6),
                  })
                }
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={form.applyTimeAdditionToClock}
                  onChange={(e) => setForm({ ...form, applyTimeAdditionToClock: e.target.checked })}
                />
                {t("classes.applyTimeAdditionToClock", "אם מסומן, תוספת הזמן תתווסף ישירות לשעון בעת Pause")}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">{t("classes.rules.knockdownFaults")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.knockdownFaults}
                onChange={(e) => setForm({ ...form, knockdownFaults: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.firstRefusalFaults")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.firstRefusalFaults}
                onChange={(e) => setForm({ ...form, firstRefusalFaults: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.secondRefusalFaults")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.secondRefusalFaults}
                onChange={(e) => setForm({ ...form, secondRefusalFaults: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.maxRefusalsBeforeElimination")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.maxRefusalsBeforeElimination}
                onChange={(e) => setForm({ ...form, maxRefusalsBeforeElimination: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.timeFaultIntervalSeconds")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.timeFaultIntervalSeconds}
                onChange={(e) => setForm({ ...form, timeFaultIntervalSeconds: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.timeFaultPoints")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.timeFaultPoints}
                onChange={(e) => setForm({ ...form, timeFaultPoints: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.jumpOffTimeFaultIntervalSeconds")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.jumpOffTimeFaultIntervalSeconds}
                onChange={(e) => setForm({ ...form, jumpOffTimeFaultIntervalSeconds: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.jumpOffTimeFaultPoints")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.jumpOffTimeFaultPoints}
                onChange={(e) => setForm({ ...form, jumpOffTimeFaultPoints: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? t("classes.rules.saving", "Saving...") : t("common.save")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
