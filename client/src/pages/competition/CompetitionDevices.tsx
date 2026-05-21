import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import {
  Zap, RotateCcw, Trash2, Battery, BatteryLow,
  Radio, RadioTower, Target, Antenna, Settings2, Wifi,
  SignalHigh, Server, Network,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/api";
import type { Device, DeviceType, ShowClass } from "../../lib/types";
import { Modal } from "../../components/ui/Modal";
import { getSocket } from "../../lib/socket";

interface OutletCtx { competitionId: string; }

const DEVICE_ICON: Record<DeviceType, React.ElementType> = {
  START: Radio,
  FINISH: RadioTower,
  OBSTACLE: Target,
  RECEIVER: Antenna,
};

interface SettingsForm {
  name: string;
  type: DeviceType;
  obstacleNumber: number;
  vl53FallenMm: number;
}

export function CompetitionDevices() {
  const { t } = useTranslation();
  const { competitionId } = useOutletContext<OutletCtx>();
  const qc = useQueryClient();
  const [flash, setFlash] = useState<string | null>(null);
  const [settingsDevice, setSettingsDevice] = useState<Device | null>(null);
  const [settingsForm, setSettingsForm] = useState<SettingsForm>({ name: "", type: "START", obstacleNumber: 1, vl53FallenMm: 80 });

  const { data = [] } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => api.get("/devices"),
  });

  const { data: health } = useQuery<{ ips: string[]; port: number; mdns: string }>({
    queryKey: ["health"],
    queryFn: () => api.get("/health"),
    staleTime: 60_000,
  });

  const { data: classes = [] } = useQuery<ShowClass[]>({
    queryKey: ["classes", competitionId],
    queryFn: () => api.get(`/classes?competitionId=${competitionId}`),
    enabled: !!competitionId,
    staleTime: 30_000,
  });

  const maxObstacleNum = classes.reduce((acc, c) => Math.max(acc, c.maxObstacles ?? 12), 1);

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
    s.on("device:registered", onStatus);
    return () => {
      s.off("sensor:triggered", onTrigger);
      s.off("device:status", onStatus);
      s.off("device:registered", onStatus);
    };
  }, [qc]);

  const test = useMutation({ mutationFn: (id: string) => api.post(`/devices/${id}/test`) });
  const reset = useMutation({
    mutationFn: (id: string) => api.post(`/devices/${id}/reset`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SettingsForm }) => {
      const payload: Record<string, unknown> = { name: data.name, type: data.type };
      if (data.type === "OBSTACLE") {
        payload.obstacleNumber = data.obstacleNumber;
        payload.vl53FallenMm = data.vl53FallenMm;
      } else {
        payload.obstacleNumber = 0;
      }
      return api.patch(`/devices/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      setSettingsDevice(null);
    },
  });

  const applyVl53 = useMutation({
    mutationFn: ({ id, vl53FallenMm }: { id: string; vl53FallenMm: number }) =>
      api.patch(`/devices/${id}`, { vl53FallenMm }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });

  function openSettings(d: Device) {
    setSettingsDevice(d);
    setSettingsForm({
      name: d.name,
      type: d.type,
      obstacleNumber: d.obstacleNumber ?? 1,
      vl53FallenMm: d.vl53FallenMm ?? 80,
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-xl text-white">{t("devices.title")}</h2>
        {health && (
          <div className="flex items-center gap-3 text-xs text-white/50">
            <span className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-neon-cyan/70" />
              <span className="font-mono text-white/70">{health.mdns}:{health.port}</span>
            </span>
            {health.ips.map((ip) => (
              <span key={ip} className="flex items-center gap-1 font-mono text-white/40">
                <Network className="w-3 h-3" />{ip}:{health.port}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence>
          {data.map((d) => {
            const isFlash = flash === d.id;
            const Icon = DEVICE_ICON[d.type] ?? Radio;
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
                        <div className="text-xs text-white/50">
                          {d.type}
                          {d.type === "OBSTACLE" && d.obstacleNumber != null && ` #${d.obstacleNumber}`}
                        </div>
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

                  {/* Network info row */}
                  {(d.ipAddress || d.wifiSsid || d.rssi != null) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 px-1">
                      {d.ipAddress && (
                        <span className="flex items-center gap-1 text-[11px] font-mono text-neon-cyan/60">
                          <Network className="w-3 h-3" /> {d.ipAddress}
                        </span>
                      )}
                      {d.wifiSsid && (
                        <span className="flex items-center gap-1 text-[11px] text-white/40">
                          <Wifi className="w-3 h-3" /> {d.wifiSsid}
                        </span>
                      )}
                      {d.rssi != null && (
                        <span className="flex items-center gap-1 text-[11px] text-white/40">
                          <SignalHigh className="w-3 h-3" /> {d.rssi} dBm
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    <button onClick={() => test.mutate(d.id)} className="btn-warn flex-1">
                      <Zap className="w-4 h-4" /> {t("devices.test")}
                    </button>
                    <button
                      onClick={() => openSettings(d)}
                      className="btn-ghost"
                      title="Settings"
                    >
                      <Settings2 className="w-4 h-4" />
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
          <div className="card text-white/55 text-center py-12 col-span-full">
            {t("devices.waitingForDevices", "No devices yet — power on a sensor unit to register it automatically")}
          </div>
        )}
      </div>

      {/* Settings modal */}
      <Modal
        open={settingsDevice != null}
        onClose={() => setSettingsDevice(null)}
        title={`Settings — ${settingsDevice?.name ?? ""}`}
      >
        {settingsDevice && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({ id: settingsDevice.id, data: settingsForm as SettingsForm });
            }}
            className="space-y-4"
          >
            {/* Read-only info */}
            <div className="glass rounded-xl p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-white/50">ID</span>
                <span className="font-mono text-white/80 text-xs">{settingsDevice.id}</span>
              </div>
              {settingsDevice.ipAddress && (
                <div className="flex justify-between">
                  <span className="text-white/50">IP</span>
                  <span className="font-mono text-neon-cyan/80 text-xs">{settingsDevice.ipAddress}</span>
                </div>
              )}
              {settingsDevice.wifiSsid && (
                <div className="flex justify-between">
                  <span className="text-white/50">WiFi</span>
                  <span className="text-white/80">{settingsDevice.wifiSsid}</span>
                </div>
              )}
              {settingsDevice.rssi != null && (
                <div className="flex justify-between">
                  <span className="text-white/50">Signal</span>
                  <span className="text-white/80">{settingsDevice.rssi} dBm</span>
                </div>
              )}
            </div>

            {/* Device type selector — always shown */}
            <div>
              <label className="label">Device Type</label>
              <select
                className="input mt-1"
                style={{ background: "#1f2937", color: "#f9fafb" }}
                value={settingsForm.type}
                onChange={(e) => {
                  const t = e.target.value as DeviceType;
                  setSettingsForm({ ...settingsForm, type: t, obstacleNumber: t === "OBSTACLE" ? (settingsForm.obstacleNumber || 1) : 0 });
                }}
              >
                <option value="START">START — שער כניסה ↑</option>
                <option value="FINISH">FINISH — שער יציאה ↓</option>
                <option value="OBSTACLE">OBSTACLE — מכשול</option>
                <option value="RECEIVER">RECEIVER — מקלט NRF</option>
              </select>
            </div>

            {/* Name */}
            <div>
              <label className="label">Display Name</label>
              <input
                className="input mt-1"
                value={settingsForm.name}
                onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                required
              />
            </div>

            {/* Obstacle number + VL53 — obstacle only */}
            {settingsForm.type === "OBSTACLE" && (
              <>
                <div>
                  <label className="label">Obstacle Number (1–{maxObstacleNum})</label>
                  <select
                    className="input mt-1"
                    style={{ background: "#1f2937", color: "#f9fafb" }}
                    value={settingsForm.obstacleNumber || 1}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, obstacleNumber: Number(e.target.value) })
                    }
                  >
                    {Array.from({ length: maxObstacleNum }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">VL53 Fallen Threshold (cm)</label>
                  <p className="text-xs text-white/40 mb-2">
                    How many cm the bar must rise for the sensor to detect a fall
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={200}
                      step={1}
                      value={Math.round(settingsForm.vl53FallenMm / 10)}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, vl53FallenMm: Number(e.target.value) * 10 })
                      }
                      className="flex-1 accent-[#22d3ee]"
                    />
                    <span className="font-mono text-white/90 text-sm w-14 text-center shrink-0">
                      {Math.round(settingsForm.vl53FallenMm / 10)} cm
                    </span>
                    <button
                      type="button"
                      className="btn-primary !py-1.5 !px-4 text-sm shrink-0"
                      onClick={() =>
                        applyVl53.mutate({ id: settingsDevice!.id, vl53FallenMm: settingsForm.vl53FallenMm })
                      }
                      disabled={applyVl53.isPending}
                    >
                      {applyVl53.isPending ? "…" : "Set"}
                    </button>
                  </div>
                  <p className="text-[11px] text-white/30 mt-1.5">
                    Saved: {Math.round((settingsDevice.vl53FallenMm ?? 80) / 10)} cm · Applied on next heartbeat
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setSettingsDevice(null)} className="btn-ghost">
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn-primary" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
