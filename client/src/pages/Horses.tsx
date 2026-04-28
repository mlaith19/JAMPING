import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Activity, Trash2, Edit3, Search } from "lucide-react";
import { api } from "../lib/api";
import type { Horse, HorseSex } from "../lib/types";
import { PageHeader } from "../components/ui/PageHeader";
import { Modal } from "../components/ui/Modal";

interface HorseForm {
  name: string;
  yearOfBirth?: number | null;
  sex?: HorseSex | null;
  color?: string | null;
  owner?: string | null;
  notes?: string | null;
}

const empty: HorseForm = { name: "" };

export function Horses() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Horse | null>(null);
  const [form, setForm] = useState<HorseForm>(empty);
  const [search, setSearch] = useState("");

  const { data = [] } = useQuery<Horse[]>({
    queryKey: ["horses", search],
    queryFn: () => api.get(`/horses${search ? `?q=${encodeURIComponent(search)}` : ""}`),
  });

  const save = useMutation({
    mutationFn: async (f: HorseForm) => {
      if (editing) return api.patch<Horse>(`/horses/${editing.id}`, f);
      return api.post<Horse>("/horses", f);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["horses"] });
      setOpen(false);
      setEditing(null);
      setForm(empty);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/horses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["horses"] }),
  });

  function startNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function startEdit(h: Horse) {
    setEditing(h);
    setForm({
      name: h.name,
      yearOfBirth: h.yearOfBirth ?? null,
      sex: h.sex ?? null,
      color: h.color ?? "",
      owner: h.owner ?? "",
      notes: h.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title={t("horses.title")}
        subtitle={t("horses.subtitle")}
        icon={<Activity className="w-5 h-5" />}
        actions={
          <button onClick={startNew} className="btn-primary">
            <Plus className="w-4 h-4" /> {t("horses.new")}
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
              <th>{t("horses.internalNumber")}</th>
              <th>{t("common.name")}</th>
              <th>{t("horses.yearOfBirth")}</th>
              <th>{t("horses.sex")}</th>
              <th>{t("horses.color")}</th>
              <th>{t("horses.owner")}</th>
              <th className="text-end">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((h) => (
              <tr key={h.id}>
                <td className="font-mono font-bold text-neon-cyan">#{h.internalNumber}</td>
                <td className="font-semibold text-white">{h.name}</td>
                <td className="text-white/65">{h.yearOfBirth ?? "-"}</td>
                <td className="text-white/65">{h.sex ? t(`horses.sexOptions.${h.sex}`) : "-"}</td>
                <td className="text-white/65">{h.color ?? "-"}</td>
                <td className="text-white/65">{h.owner ?? "-"}</td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => startEdit(h)} className="btn-ghost px-2 py-1.5">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(t("common.confirmDelete"))) remove.mutate(h.id);
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
                <td colSpan={7} className="text-center py-8 text-white/45">
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
        title={editing ? t("common.edit") : t("horses.new")}
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
              <label className="label">{t("horses.yearOfBirth")}</label>
              <input
                type="number"
                className="input mt-1"
                value={form.yearOfBirth ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    yearOfBirth: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div>
              <label className="label">{t("horses.sex")}</label>
              <select
                className="select mt-1"
                value={form.sex ?? ""}
                onChange={(e) =>
                  setForm({ ...form, sex: (e.target.value || null) as HorseSex | null })
                }
              >
                <option value="">-</option>
                <option value="MARE">{t("horses.sexOptions.MARE")}</option>
                <option value="STALLION">{t("horses.sexOptions.STALLION")}</option>
                <option value="GELDING">{t("horses.sexOptions.GELDING")}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("horses.color")}</label>
              <input
                className="input mt-1"
                value={form.color ?? ""}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t("horses.owner")}</label>
              <input
                className="input mt-1"
                value={form.owner ?? ""}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
              />
            </div>
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
