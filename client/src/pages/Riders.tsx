import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, Trash2, Edit3, Search } from "lucide-react";
import { api } from "../lib/api";
import type { Rider } from "../lib/types";
import { PageHeader } from "../components/ui/PageHeader";
import { Modal } from "../components/ui/Modal";

interface RiderForm {
  name: string;
  phone?: string | null;
  country?: string | null;
  club?: string | null;
  notes?: string | null;
}

const empty: RiderForm = { name: "" };

export function Riders() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rider | null>(null);
  const [form, setForm] = useState<RiderForm>(empty);
  const [search, setSearch] = useState("");

  const { data = [] } = useQuery<Rider[]>({
    queryKey: ["riders", search],
    queryFn: () => api.get(`/riders${search ? `?q=${encodeURIComponent(search)}` : ""}`),
  });

  const save = useMutation({
    mutationFn: async (f: RiderForm) => {
      if (editing) return api.patch<Rider>(`/riders/${editing.id}`, f);
      return api.post<Rider>("/riders", f);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["riders"] });
      setOpen(false);
      setEditing(null);
      setForm(empty);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/riders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["riders"] }),
  });

  function startNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function startEdit(r: Rider) {
    setEditing(r);
    setForm({
      name: r.name,
      phone: r.phone ?? "",
      country: r.country ?? "",
      club: r.club ?? "",
      notes: r.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title={t("riders.title")}
        subtitle={t("riders.subtitle")}
        icon={<Users className="w-5 h-5" />}
        actions={
          <button onClick={startNew} className="btn-primary">
            <Plus className="w-4 h-4" /> {t("riders.new")}
          </button>
        }
      />

      <div className="mb-4 relative max-w-md">
        <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-white/40" />
        <input
          placeholder={t("common.search")}
          className="input ps-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("riders.internalNumber")}</th>
              <th>{t("common.name")}</th>
              <th>{t("riders.phone")}</th>
              <th>{t("riders.country")}</th>
              <th>{t("riders.club")}</th>
              <th className="text-end">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td className="font-mono font-bold text-neon-cyan">#{r.internalNumber}</td>
                <td className="font-semibold text-white">{r.name}</td>
                <td className="text-white/65">{r.phone ?? "-"}</td>
                <td className="text-white/65">{r.country ?? "-"}</td>
                <td className="text-white/65">{r.club ?? "-"}</td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => startEdit(r)} className="btn-ghost px-2 py-1.5">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(t("common.confirmDelete"))) remove.mutate(r.id);
                      }}
                      className="btn-ghost px-2 py-1.5 text-red-300 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-white/45">
                  {t("common.none")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t("common.edit") : t("riders.new")}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
          className="space-y-4"
        >
          <div>
            <label className="label">{t("common.name")}</label>
            <input
              required
              className="input mt-1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("riders.phone")}</label>
              <input
                className="input mt-1"
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t("riders.country")}</label>
              <input
                className="input mt-1"
                value={form.country ?? ""}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">{t("riders.club")}</label>
            <input
              className="input mt-1"
              value={form.club ?? ""}
              onChange={(e) => setForm({ ...form, club: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t("common.notes")}</label>
            <textarea
              className="textarea mt-1"
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
