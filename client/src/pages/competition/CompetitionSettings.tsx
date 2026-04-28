import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Save, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import type { Competition, CompetitionStatus } from "../../lib/types";

interface OutletCtx {
  competitionId: string;
  competition?: Competition;
}

export function CompetitionSettings() {
  const { competitionId, competition } = useOutletContext<OutletCtx>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    date: "",
    location: "",
    status: "DRAFT" as CompetitionStatus,
    language: "en",
    currency: "USD",
    notes: "",
  });

  useEffect(() => {
    if (competition) {
      setForm({
        name: competition.name,
        date: competition.date.slice(0, 10),
        location: competition.location,
        status: competition.status,
        language: competition.language,
        currency: competition.currency,
        notes: competition.notes ?? "",
      });
    }
  }, [competition]);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/competitions/${competitionId}`, {
        ...form,
        date: new Date(form.date).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competition", competitionId] });
      qc.invalidateQueries({ queryKey: ["competitions"] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/competitions/${competitionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitions"] });
      navigate("/competitions");
    },
  });

  return (
    <div className="card max-w-2xl">
      <h2 className="font-display font-bold text-xl text-white mb-4">{t("nav.settings")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-4"
      >
        <div>
          <label className="label">{t("competitions.name")}</label>
          <input
            required
            className="input mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("common.date")}</label>
            <input
              type="date"
              required
              className="input mt-1"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t("common.status")}</label>
            <select
              className="select mt-1"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as CompetitionStatus })}
            >
              <option value="DRAFT">{t("status.DRAFT")}</option>
              <option value="ACTIVE">{t("status.ACTIVE")}</option>
              <option value="FINISHED">{t("status.FINISHED")}</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">{t("common.location")}</label>
          <input
            required
            className="input mt-1"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("common.language")}</label>
            <select
              className="select mt-1"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
            >
              <option value="en">English</option>
              <option value="he">עברית</option>
              <option value="ar">العربية</option>
            </select>
          </div>
          <div>
            <label className="label">{t("common.currency")}</label>
            <input
              className="input mt-1"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="label">{t("common.notes")}</label>
          <textarea
            rows={3}
            className="textarea mt-1"
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => {
              if (confirm(t("common.confirmDelete"))) remove.mutate();
            }}
            className="btn-danger"
          >
            <Trash2 className="w-4 h-4" /> {t("common.delete")}
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            <Save className="w-4 h-4" /> {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
