import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import type {
  AccumulatorMode,
  ClassCompetitionType,
  Competition,
  JokerType,
  RankingMode,
  SecondDisobedienceRule,
  ShowClass,
  TableType,
} from "../../lib/types";

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
}

type RulesForm = {
  competitionType: ClassCompetitionType;
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
  numberOfObstacles: 6 | 8 | 10;
  accumulatorMode: AccumulatorMode;
  hasJoker: boolean;
  jokerType: JokerType;
  maxPoints: number;
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

function getAccumulatorMaxPoints(obstacles: 6 | 8 | 10): number {
  if (obstacles === 6) return 21;
  if (obstacles === 8) return 36;
  return 55;
}

function toForm(c: ShowClass): RulesForm {
  const courseLengthMeters = c.courseLengthMeters ?? null;
  const horseSpeedMetersPerMinute = sanitizePositiveInt(c.horseSpeedMetersPerMinute, 350);
  const timeLimitMultiplier = sanitizeMultiplier(c.timeLimitMultiplier);
  const allowedTime = allowedTimeFromCourse(courseLengthMeters, horseSpeedMetersPerMinute) ?? c.allowedTime ?? null;
  return {
    competitionType: c.competitionType ?? "STANDARD",
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
    numberOfObstacles: c.numberOfObstacles ?? 10,
    accumulatorMode: c.accumulatorMode ?? "AGAINST_CLOCK_NO_JUMP_OFF",
    hasJoker: c.hasJoker ?? false,
    jokerType: c.jokerType ?? "NONE",
    maxPoints: c.maxPoints ?? getAccumulatorMaxPoints(c.numberOfObstacles ?? 10),
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
    return { ...next, allowedTime: allowed, timeLimit, maxPoints: getAccumulatorMaxPoints(next.numberOfObstacles) };
  }

  const save = useMutation({
    mutationFn: () => {
      if (!form || !classId) throw new Error("No class selected");
      if (form.competitionType === "ACCUMULATOR") {
        if (![6, 8, 10].includes(form.numberOfObstacles)) {
          throw new Error(t("classes.accumulator.errors.invalidObstacleCount", "Number of obstacles must be 6, 8, or 10"));
        }
        if (!form.hasJoker && form.jokerType !== "NONE") {
          throw new Error(t("classes.accumulator.errors.jokerRequiresEnabled", "Joker type requires joker enabled"));
        }
        if (form.hasJoker && form.jokerType === "NONE") {
          throw new Error(t("classes.accumulator.errors.jokerTypeRequired", "Select a joker type when joker is enabled"));
        }
      }
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
          className="card space-y-3"
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

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
            <div>
              <label className="label">{t("classes.competitionType", "סוג תחרות")}</label>
              <select
                className="select mt-1 !h-9 !py-0 text-sm"
                value={form.competitionType}
                onChange={(e) => setForm({ ...form, competitionType: e.target.value as ClassCompetitionType })}
              >
                <option value="STANDARD">{t("classes.competitionTypes.STANDARD", "Standard")}</option>
                <option value="ACCUMULATOR">{t("classes.competitionTypes.ACCUMULATOR", "Accumulator (FEI 229)")}</option>
              </select>
            </div>
            <div>
              <label className="label">{t("classes.tableType")}</label>
              <select
                className="select mt-1 !h-9 !py-0 text-sm"
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
                className="select mt-1 !h-9 !py-0 text-sm"
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
                className="select mt-1 !h-9 !py-0 text-sm"
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

          {form.competitionType === "ACCUMULATOR" ? (
            <div className="rounded-2xl border border-neon-cyan/30 bg-neon-cyan/[0.04] p-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
              <div>
                <label className="label">{t("classes.accumulator.numberOfObstacles", "מספר מכשולים")}</label>
                <select
                  className="select mt-1 !h-9 !py-0 text-sm"
                  value={form.numberOfObstacles}
                  onChange={(e) => setForm(recalc({ ...form, numberOfObstacles: Number(e.target.value) as 6 | 8 | 10 }))}
                >
                  <option value={6}>6</option>
                  <option value={8}>8</option>
                  <option value={10}>10</option>
                </select>
              </div>
              <div>
                <label className="label">{t("classes.accumulator.maxPoints", "מקסימום נקודות")}</label>
                <input type="number" className="input mt-1 !h-9 !py-0 text-sm" value={form.maxPoints} readOnly />
              </div>
              <div>
                <label className="label">{t("classes.accumulator.mode", "מצב מצטבר")}</label>
                <select
                  className="select mt-1 !h-9 !py-0 text-sm"
                  value={form.accumulatorMode}
                  onChange={(e) => setForm({ ...form, accumulatorMode: e.target.value as AccumulatorMode })}
                >
                  <option value="AGAINST_CLOCK_NO_JUMP_OFF">
                    {t("classes.accumulator.modes.AGAINST_CLOCK_NO_JUMP_OFF", "Against Clock (No Jump-Off)")}
                  </option>
                  <option value="AGAINST_CLOCK_WITH_JUMP_OFF">
                    {t("classes.accumulator.modes.AGAINST_CLOCK_WITH_JUMP_OFF", "Against Clock (With Jump-Off)")}
                  </option>
                  <option value="NOT_AGAINST_CLOCK_WITH_JUMP_OFF">
                    {t(
                      "classes.accumulator.modes.NOT_AGAINST_CLOCK_WITH_JUMP_OFF",
                      "Not Against Clock (With Jump-Off)"
                    )}
                  </option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/85 mt-5">
                  <input
                    type="checkbox"
                    className="accent-neon-cyan"
                    checked={form.hasJoker}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        hasJoker: e.target.checked,
                        jokerType: e.target.checked ? (form.jokerType === "NONE" ? "SINGLE_JOKER" : form.jokerType) : "NONE",
                      })
                    }
                  />
                  {t("classes.accumulator.hasJoker", "כולל Joker במכשול האחרון")}
                </label>
              </div>
              <div>
                <label className="label">{t("classes.accumulator.jokerType", "סוג Joker")}</label>
                <select
                  className="select mt-1 !h-9 !py-0 text-sm"
                  value={form.jokerType}
                  disabled={!form.hasJoker}
                  onChange={(e) => setForm({ ...form, jokerType: e.target.value as JokerType })}
                >
                  <option value="NONE">{t("classes.accumulator.jokerTypes.NONE", "None")}</option>
                  <option value="SINGLE_JOKER">{t("classes.accumulator.jokerTypes.SINGLE_JOKER", "Single Joker (200%)")}</option>
                  <option value="DOUBLE_JOKER">{t("classes.accumulator.jokerTypes.DOUBLE_JOKER", "Double Joker (150% / 200%)")}</option>
                </select>
                <div className="text-[11px] text-white/50 mt-1">
                  {t("classes.accumulator.jokerPositionHint", "Joker ממוקם במכשול האחרון בלבד")}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
            <div>
              <label className="label">{t("classes.courseLengthMeters", "אורך מסלול (מטר)")}</label>
              <input
                type="number"
                min={1}
                className="input mt-1 !h-9 !py-0 text-sm"
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
                className="input mt-1 !h-9 !py-0 text-sm"
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
                className="input mt-1 !h-9 !py-0 text-sm"
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
                className="input mt-1 !h-9 !py-0 text-sm"
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
                className="input mt-1 !h-9 !py-0 text-sm"
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
            <div className="col-span-2 md:col-span-3 xl:col-span-5 grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
              <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  className="accent-neon-cyan"
                  checked={form.hasJumpOff}
                  onChange={(e) => setForm({ ...form, hasJumpOff: e.target.checked })}
                />
                {t("classes.hasJumpOff")}
              </label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  className="accent-neon-cyan"
                  checked={form.jumpOffAgainstClock}
                  onChange={(e) => setForm({ ...form, jumpOffAgainstClock: e.target.checked })}
                />
                {t("classes.jumpOffAgainstClock")}
              </label>
            </div>
          </div>
          )}

          {form.competitionType !== "ACCUMULATOR" && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
            <div>
              <label className="label">{t("classes.maxObstacles", "מקסימום מכשולים")}</label>
              <input
                type="number"
                min={1}
                max={15}
                className="input mt-1 !h-9 !py-0 text-sm"
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
                className="input mt-1 !h-9 !py-0 text-sm"
                value={form.tableCDisobedienceWithKnockdownSeconds}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tableCDisobedienceWithKnockdownSeconds: sanitizePositiveInt(Number(e.target.value), 6),
                  })
                }
              />
            </div>
            <div className="col-span-2 md:col-span-3 xl:col-span-3 flex items-end">
              <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  className="accent-neon-cyan"
                  checked={form.applyTimeAdditionToClock}
                  onChange={(e) => setForm({ ...form, applyTimeAdditionToClock: e.target.checked })}
                />
                {t("classes.applyTimeAdditionToClock", "אם מסומן, תוספת הזמן תתווסף ישירות לשעון בעת Pause")}
              </label>
            </div>
          </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
            <div>
              <label className="label">{t("classes.rules.knockdownFaults")}</label>
              <input
                type="number"
                className="input mt-1 !h-9 !py-0 text-sm"
                value={form.knockdownFaults}
                onChange={(e) => setForm({ ...form, knockdownFaults: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.firstRefusalFaults")}</label>
              <input
                type="number"
                className="input mt-1 !h-9 !py-0 text-sm"
                value={form.firstRefusalFaults}
                onChange={(e) => setForm({ ...form, firstRefusalFaults: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.secondRefusalFaults")}</label>
              <input
                type="number"
                className="input mt-1 !h-9 !py-0 text-sm"
                value={form.secondRefusalFaults}
                onChange={(e) => setForm({ ...form, secondRefusalFaults: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.maxRefusalsBeforeElimination")}</label>
              <input
                type="number"
                className="input mt-1 !h-9 !py-0 text-sm"
                value={form.maxRefusalsBeforeElimination}
                onChange={(e) => setForm({ ...form, maxRefusalsBeforeElimination: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.timeFaultIntervalSeconds")}</label>
              <input
                type="number"
                className="input mt-1 !h-9 !py-0 text-sm"
                value={form.timeFaultIntervalSeconds}
                onChange={(e) => setForm({ ...form, timeFaultIntervalSeconds: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.timeFaultPoints")}</label>
              <input
                type="number"
                className="input mt-1 !h-9 !py-0 text-sm"
                value={form.timeFaultPoints}
                onChange={(e) => setForm({ ...form, timeFaultPoints: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.jumpOffTimeFaultIntervalSeconds")}</label>
              <input
                type="number"
                className="input mt-1 !h-9 !py-0 text-sm"
                value={form.jumpOffTimeFaultIntervalSeconds}
                onChange={(e) => setForm({ ...form, jumpOffTimeFaultIntervalSeconds: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">{t("classes.rules.jumpOffTimeFaultPoints")}</label>
              <input
                type="number"
                className="input mt-1 !h-9 !py-0 text-sm"
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
