import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type Judge = {
  id: string;
  name: string;
  country?: string;
  club?: string;
};

const STORAGE_KEY = "judges-registry-v1";

function readJudges(): Judge[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Judge[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJudges(items: Judge[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function Judges() {
  const { t } = useTranslation();
  const [judges, setJudges] = useState<Judge[]>(() => readJudges());
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [club, setClub] = useState("");

  const canAdd = useMemo(() => name.trim().length > 0, [name]);

  function addJudge() {
    if (!canAdd) return;
    const next: Judge = {
      id: crypto.randomUUID(),
      name: name.trim(),
      country: country.trim() || undefined,
      club: club.trim() || undefined,
    };
    const updated = [...judges, next];
    setJudges(updated);
    writeJudges(updated);
    setName("");
    setCountry("");
    setClub("");
  }

  function removeJudge(id: string) {
    const updated = judges.filter((j) => j.id !== id);
    setJudges(updated);
    writeJudges(updated);
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="font-display font-bold text-white text-xl">{t("nav.judges")}</h1>
        <p className="text-sm text-white/60 mt-1">{t("judges.subtitle")}</p>
      </div>

      <div className="card grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="label">{t("common.name")}</label>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("riders.country")}</label>
          <input className="input mt-1" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("riders.club")}</label>
          <input className="input mt-1" value={club} onChange={(e) => setClub(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button type="button" className="btn-primary w-full" onClick={addJudge} disabled={!canAdd}>
            {t("judges.add")}
          </button>
        </div>
      </div>

      <div className="card">
        {judges.length === 0 ? (
          <div className="text-white/50 text-sm">{t("judges.emptyRegistry")}</div>
        ) : (
          <div className="space-y-2">
            {judges.map((j) => (
              <div key={j.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">{j.name}</div>
                  <div className="text-xs text-white/55 truncate">
                    {[j.country, j.club].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <button type="button" className="btn-ghost" onClick={() => removeJudge(j.id)}>
                  {t("common.delete")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
