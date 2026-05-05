import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { Competition } from "../../lib/types";

type Judge = {
  id: string;
  name: string;
  country?: string;
  club?: string;
};

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
}

const REGISTRY_KEY = "judges-registry-v1";
const CLASS_JUDGES_MAP_KEY = "class-judges-map-v1";

function readRegistry(): Judge[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Judge[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRegistry(judges: Judge[]) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(judges));
}

function readClassJudgesMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(CLASS_JUDGES_MAP_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeClassJudgesMap(map: Record<string, string[]>) {
  localStorage.setItem(CLASS_JUDGES_MAP_KEY, JSON.stringify(map));
}

export function CompetitionJudges() {
  const { t } = useTranslation();
  const { competitionId: _competitionId } = useOutletContext<OutletCtx>();
  const [searchParams] = useSearchParams();
  const [classId, setClassId] = useState(searchParams.get("classId") ?? "");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [newClub, setNewClub] = useState("");
  const [registry, setRegistry] = useState<Judge[]>(() => readRegistry());
  const [classJudgesMap, setClassJudgesMap] = useState<Record<string, string[]>>(() => readClassJudgesMap());

  useEffect(() => {
    const fromUrl = searchParams.get("classId") ?? "";
    if (fromUrl !== classId) setClassId(fromUrl);
  }, [searchParams, classId]);

  const filteredRegistry = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return registry;
    return registry.filter(
      (j) =>
        j.name.toLowerCase().includes(q) ||
        (j.country ?? "").toLowerCase().includes(q) ||
        (j.club ?? "").toLowerCase().includes(q)
    );
  }, [registry, search]);

  const assignedIds = classId ? classJudgesMap[classId] ?? [] : [];
  const assignedJudges = assignedIds
    .map((id) => registry.find((j) => j.id === id))
    .filter((x): x is Judge => !!x);

  function assignJudge(judgeId: string) {
    if (!classId) return;
    const prev = classJudgesMap[classId] ?? [];
    if (prev.includes(judgeId)) return;
    const next = { ...classJudgesMap, [classId]: [...prev, judgeId] };
    setClassJudgesMap(next);
    writeClassJudgesMap(next);
  }

  function unassignJudge(judgeId: string) {
    if (!classId) return;
    const prev = classJudgesMap[classId] ?? [];
    const next = { ...classJudgesMap, [classId]: prev.filter((id) => id !== judgeId) };
    setClassJudgesMap(next);
    writeClassJudgesMap(next);
  }

  function createAndAssignJudge() {
    const name = newName.trim();
    if (!name || !classId) return;
    const judge: Judge = {
      id: crypto.randomUUID(),
      name,
      country: newCountry.trim() || undefined,
      club: newClub.trim() || undefined,
    };
    const nextRegistry = [...registry, judge];
    setRegistry(nextRegistry);
    writeRegistry(nextRegistry);
    assignJudge(judge.id);
    setNewName("");
    setNewCountry("");
    setNewClub("");
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-display font-bold text-white text-lg">{t("nav.judges")}</h2>
        <p className="text-sm text-white/60 mt-2">{t("judges.subtitle")}</p>
      </div>

      {!classId ? (
        <div className="card text-white/55 text-center py-10">{t("live.selectClass")}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-white">{t("judges.selected")}</h3>
                <span className="text-xs text-white/50">{assignedJudges.length}</span>
              </div>
              {assignedJudges.length === 0 ? (
                <div className="text-sm text-white/50">{t("live.readiness.noJudges")}</div>
              ) : (
                <div className="space-y-2">
                  {assignedJudges.map((j) => (
                    <div
                      key={j.id}
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">{j.name}</div>
                        <div className="text-xs text-white/55 truncate">{[j.country, j.club].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      <button type="button" className="btn-ghost" onClick={() => unassignJudge(j.id)}>
                        {t("common.delete")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card space-y-3">
              <h3 className="font-semibold text-white">{t("judges.addFromRiders")}</h3>
              <input
                className="input"
                placeholder={t("common.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {filteredRegistry.map((j) => {
                  const isAssigned = assignedIds.includes(j.id);
                  return (
                    <div
                      key={j.id}
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">{j.name}</div>
                        <div className="text-xs text-white/55 truncate">{[j.country, j.club].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      <button type="button" className={isAssigned ? "btn-ghost" : "btn-primary"} onClick={() => assignJudge(j.id)} disabled={isAssigned}>
                        {isAssigned ? t("common.yes") : t("judges.add")}
                      </button>
                    </div>
                  );
                })}
                {filteredRegistry.length === 0 && (
                  <div className="text-sm text-white/50">{t("judges.emptyRegistry")}</div>
                )}
              </div>
            </div>
          </div>

          <div className="card grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="label">{t("common.name")}</label>
              <input className="input mt-1" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <label className="label">{t("riders.country")}</label>
              <input className="input mt-1" value={newCountry} onChange={(e) => setNewCountry(e.target.value)} />
            </div>
            <div>
              <label className="label">{t("riders.club")}</label>
              <input className="input mt-1" value={newClub} onChange={(e) => setNewClub(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button type="button" className="btn-primary w-full" disabled={!newName.trim()} onClick={createAndAssignJudge}>
                {t("judges.add")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
