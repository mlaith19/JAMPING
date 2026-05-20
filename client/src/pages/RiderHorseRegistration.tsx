import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../lib/api";

interface RegistrationForm {
  riderName: string;
  riderBirthDate?: string;
  riderPhone?: string;
  riderCountry?: string;
  riderClub?: string;
  riderPhoto?: string;
  horseName: string;
  horseYearOfBirth?: string;
  horseSex?: "MARE" | "STALLION" | "GELDING" | "";
  horseColor?: string;
  horseOwner?: string;
}

const empty: RegistrationForm = {
  riderName: "",
  horseName: "",
  horseSex: "",
};

export function RiderHorseRegistration() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<RegistrationForm>(empty);

  const save = useMutation({
    mutationFn: async (f: RegistrationForm) => {
      await api.post("/riders", {
        name: f.riderName,
        birthDate: f.riderBirthDate || null,
        photo: f.riderPhoto || null,
        phone: f.riderPhone || null,
        country: f.riderCountry || null,
        club: f.riderClub || null,
      });
      await api.post("/horses", {
        name: f.horseName,
        yearOfBirth: f.horseYearOfBirth ? Number(f.horseYearOfBirth) : null,
        sex: f.horseSex || null,
        color: f.horseColor || null,
        owner: f.horseOwner || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["riders"] });
      qc.invalidateQueries({ queryKey: ["horses"] });
      navigate("/riders");
    },
  });

  return (
    <div>
      <PageHeader
        title={t("riders.registrationTitle", "רישום רוכב + סוס")}
        subtitle={t("riders.registrationSubtitle", "טופס רישום משולב למאגרים")}
        icon={<UserPlus className="w-5 h-5" />}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
        className="card space-y-4 max-w-3xl"
      >
        <h3 className="font-display font-bold text-white">{t("riders.title", "רוכבים")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">{t("common.name")}</label>
            <input
              required
              className="input mt-1"
              value={form.riderName}
              onChange={(e) => setForm({ ...form, riderName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t("riders.birthDate", "תאריך לידה")}</label>
            <input
              type="date"
              className="input mt-1"
              value={form.riderBirthDate ?? ""}
              onChange={(e) => setForm({ ...form, riderBirthDate: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t("riders.phone")}</label>
            <input className="input mt-1" value={form.riderPhone ?? ""} onChange={(e) => setForm({ ...form, riderPhone: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("riders.country")}</label>
            <input className="input mt-1" value={form.riderCountry ?? ""} onChange={(e) => setForm({ ...form, riderCountry: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("riders.club")}</label>
            <input className="input mt-1" value={form.riderClub ?? ""} onChange={(e) => setForm({ ...form, riderClub: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("riders.photo", "תמונת רוכב")}</label>
            <input
              type="file"
              accept="image/*"
              className="input mt-1"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const value = typeof reader.result === "string" ? reader.result : "";
                  setForm((prev) => ({ ...prev, riderPhoto: value }));
                };
                reader.readAsDataURL(file);
              }}
            />
          </div>
        </div>

        <h3 className="font-display font-bold text-white pt-2">{t("horses.title", "סוסים")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">{t("common.name")}</label>
            <input
              required
              className="input mt-1"
              value={form.horseName}
              onChange={(e) => setForm({ ...form, horseName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t("horses.yearOfBirth")}</label>
            <input
              type="number"
              className="input mt-1"
              value={form.horseYearOfBirth ?? ""}
              onChange={(e) => setForm({ ...form, horseYearOfBirth: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t("horses.sex")}</label>
            <select className="select mt-1" value={form.horseSex ?? ""} onChange={(e) => setForm({ ...form, horseSex: e.target.value as any })}>
              <option value="">-</option>
              <option value="MARE">{t("horses.sexOptions.MARE")}</option>
              <option value="STALLION">{t("horses.sexOptions.STALLION")}</option>
              <option value="GELDING">{t("horses.sexOptions.GELDING")}</option>
            </select>
          </div>
          <div>
            <label className="label">{t("horses.color")}</label>
            <input className="input mt-1" value={form.horseColor ?? ""} onChange={(e) => setForm({ ...form, horseColor: e.target.value })} />
          </div>
          <div>
            <label className="label">{t("horses.owner")}</label>
            <input className="input mt-1" value={form.horseOwner ?? ""} onChange={(e) => setForm({ ...form, horseOwner: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={() => navigate("/riders")} className="btn-ghost">
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
