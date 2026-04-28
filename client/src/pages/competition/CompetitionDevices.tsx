import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Zap, RotateCcw, Trash2, Battery, BatteryLow, Radio, RadioTower } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/api";
import type { Device, DeviceType } from "../../lib/types";
import { Modal } from "../../components/ui/Modal";
import { getSocket } from "../../lib/socket";

interface DeviceForm {
  name: string;
  type: DeviceType;
}

export function CompetitionDevices() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DeviceForm>({ name: "", type: "START" });
  const [flash, setFlash] = useState<string | null>(null);

  const { data = [] } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => api.get("/devices"),
  });

  useEffect(() => {
    const s = getSocket();
    const onTrigger = (p: any) => {
      if (!p?.deviceId) return;
      setFlash(p.deviceId);
      setTimeout(() => setFlash(null), 800);
      qc.invalidateQueries({ queryKey: ["devices"] });
    };
    const onStatus = () => qc.invalidateQueries({ queryKey: ["devices"] });
    s.on("sensor:triggered", onTrigger);
    s.on("device:status", onStatus);
    return () => {
      s.off("sensor:triggered", onTrigger);
      s.off("device:status", onStatus);
    };
  }, [qc]);

  const create = useMutation({
    mutationFn: (f: DeviceForm) => api.post("/devices", f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      setOpen(false);
      setForm({ name: "", type: "START" });
    },
  });
  const test = useMutation({ mutationFn: (id: string) => api.post(`/devices/${id}/test`) });
  const reset = useMutation({
    mutationFn: (id: string) => api.post(`/devices/${id}/reset`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-xl text-white">{t("devices.title")}</h2>
        <button onClick={() => setOpen(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> {t("devices.add")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence>
          {data.map((d) => {
            const isFlash = flash === d.id;
            const Icon = d.type === "START" ? Radio : RadioTower;
            const lowBattery = d.battery < 20;
            return (
              <motion.div
                key={d.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  boxShadow: isFlash
                    ? "0 0 60px -4px rgba(34, 211, 238, 0.85)"
                    : "0 0 0 0 rgba(0,0,0,0)",
                }}
                transition={{ duration: 0.4 }}
                exit={{ opacity: 0 }}
                className="card relative overflow-hidden"
              >
                <div className="absolute -top-12 -end-12 w-40 h-40 rounded-full blur-3xl bg-neon-cyan/[0.06]" />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl glass flex items-center justify-center text-neon-cyan">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-display font-bold text-white">{d.name}</div>
                        <div className="text-xs text-white/50">{d.type}</div>
                      </div>
                    </div>
                    <span className={d.online ? "badge-lime" : "badge-mute"}>
                      {d.online ? t("devices.online") : t("devices.offline")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <div className="glass p-3 flex items-center gap-2">
                      {lowBattery ? (
                        <BatteryLow className="w-4 h-4 text-red-400" />
                      ) : (
                        <Battery className="w-4 h-4 text-emerald-400" />
                      )}
                      <div>
                        <div className="text-[10px] text-white/45 uppercase">{t("devices.battery")}</div>
                        <div className="font-display font-bold text-white">{d.battery}%</div>
                      </div>
                    </div>
                    <div className="glass p-3">
                      <div className="text-[10px] text-white/45 uppercase">{t("devices.lastTrigger")}</div>
                      <div className="font-mono text-white/85 text-xs">
                        {d.lastTriggerAt ? new Date(d.lastTriggerAt).toLocaleTimeString() : t("devices.never")}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button onClick={() => test.mutate(d.id)} className="btn-warn flex-1">
                      <Zap className="w-4 h-4" /> {t("devices.test")}
                    </button>
                    <button onClick={() => reset.mutate(d.id)} className="btn-ghost">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(t("common.confirmDelete"))) remove.mutate(d.id);
                      }}
                      className="btn-ghost text-red-300 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {data.length === 0 && (
          <div className="card text-white/55 text-center py-12 col-span-full">{t("common.none")}</div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("devices.add")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(form);
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
          <div>
            <label className="label">{t("common.type")}</label>
            <select
              className="select mt-1"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as DeviceType })}
            >
              <option value="START">START</option>
              <option value="FINISH">FINISH</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary">{t("common.create")}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
