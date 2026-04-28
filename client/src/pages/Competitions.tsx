import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Trophy, Calendar, MapPin, ArrowRight, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import type { Competition, CompetitionStatus } from "../lib/types";
import { PageHeader } from "../components/ui/PageHeader";
import { Modal } from "../components/ui/Modal";
import { StatusBadge } from "../components/ui/StatusBadge";
import { EmptyState } from "../components/ui/EmptyState";

interface FormState {
  name: string;
  date: string;
  location: string;
  language: string;
  currency: string;
  status: CompetitionStatus;
}

const empty: FormState = {
  name: "",
  date: new Date().toISOString().slice(0, 10),
  location: "",
  language: "en",
  currency: "USD",
  status: "DRAFT",
};

export function Competitions() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);

  const { data = [], isLoading } = useQuery<Competition[]>({
    queryKey: ["competitions"],
    queryFn: () => api.get("/competitions"),
  });

  const create = useMutation({
    mutationFn: (data: FormState) =>
      api.post<Competition>("/competitions", { ...data, date: new Date(data.date).toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitions"] });
      setOpen(false);
      setForm(empty);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/competitions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitions"] }),
  });

  return (
    <div>
      <PageHeader
        title={t("competitions.title")}
        subtitle={t("competitions.subtitle")}
        icon={<Trophy className="w-5 h-5" />}
        actions={
          <button onClick={() => setOpen(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> {t("competitions.new")}
          </button>
        }
      />

      {isLoading ? (
        <div className="card text-white/55">{t("common.loading")}</div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={<Trophy className="w-7 h-7" />}
          title={t("competitions.noItems")}
          action={
            <button onClick={() => setOpen(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> {t("competitions.new")}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.map((c, idx) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="card relative group overflow-hidden"
            >
              <div className="absolute -top-16 -end-16 w-48 h-48 rounded-full blur-3xl bg-neon-violet/[0.06] group-hover:bg-neon-violet/[0.12] transition" />
              <div className="relative">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display font-bold text-xl text-white">{c.name}</h3>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-white/65">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-neon-cyan" />
                    {new Date(c.date).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-neon-pink" />
                    {c.location}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-white/45">
                  <div>
                    {c._count?.classes ?? 0} classes · {c._count?.entries ?? 0} entries
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Link to={`/competitions/${c.id}`} className="btn-primary flex-1">
                    {t("competitions.openDetail")} <ArrowRight className="w-4 h-4 flip-x" />
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm(t("common.confirmDelete"))) remove.mutate(c.id);
                    }}
                    className="btn-ghost px-3"
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t("competitions.create")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(form);
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
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={create.isPending} className="btn-primary">
              {t("competitions.create")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
