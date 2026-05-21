import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { broadcast } from "../ws/index.js";
import { handleExternalSensorEvent } from "../ws/live.js";

const HEARTBEAT_TIMEOUT_MS = 30_000;
const lastHeartbeat = new Map<string, number>();

export function recordHeartbeat(deviceId: string) {
  lastHeartbeat.set(deviceId, Date.now());
}

export function startHeartbeatWatcher() {
  setInterval(async () => {
    const now = Date.now();
    for (const [deviceId, last] of lastHeartbeat.entries()) {
      if (now - last > HEARTBEAT_TIMEOUT_MS) {
        lastHeartbeat.delete(deviceId);
        const updated = await prisma.device.update({
          where: { id: deviceId },
          data: { online: false },
        }).catch(() => null);
        if (updated) broadcast("device:status", updated);
      }
    }
  }, 10_000);
}

export const devicesRouter = Router();

const DEVICE_TYPES = ["START", "FINISH", "OBSTACLE", "RECEIVER"] as const;

const DeviceInput = z.object({
  name: z.string().min(1),
  type: z.enum(DEVICE_TYPES),
  online: z.boolean().optional(),
  battery: z.number().int().min(0).max(100).optional(),
  obstacleNumber: z.number().int().min(0).max(15).optional(),
  vl53FallenMm: z.number().int().min(10).max(2000).optional(),
});

devicesRouter.get("/", async (_req, res) => {
  const items = await prisma.device.findMany({ orderBy: { type: "asc" } });
  res.json(items);
});

devicesRouter.post("/", async (req, res) => {
  const data = DeviceInput.parse(req.body);
  const item = await prisma.device.create({
    data: {
      ...data,
      online: data.online ?? false,
    },
  });
  res.status(201).json(item);
});

devicesRouter.patch("/:id", async (req, res) => {
  const data = DeviceInput.partial().parse(req.body);
  const item = await prisma.device.update({ where: { id: req.params.id }, data });
  broadcast("device:status", item);
  res.json(item);
});

devicesRouter.post("/:id/test", async (req, res) => {
  const dev = await prisma.device.update({
    where: { id: req.params.id },
    data: { lastTriggerAt: new Date() },
  });
  broadcast("sensor:triggered", { deviceId: dev.id, type: dev.type, manual: true, at: Date.now() });
  res.json(dev);
});

devicesRouter.post("/:id/reset", async (req, res) => {
  const item = await prisma.device.update({
    where: { id: req.params.id },
    data: { online: false, battery: 100, lastTriggerAt: null },
  });
  broadcast("device:status", item);
  res.json(item);
});

devicesRouter.delete("/:id", async (req, res) => {
  await prisma.device.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

const TriggerInput = z.object({
  gateType: z.enum(["START", "FINISH"]),
  timestamp: z.number().int().optional(),
});

devicesRouter.post("/:id/trigger", async (req, res) => {
  const dev = await prisma.device.findUnique({ where: { id: req.params.id } });
  if (!dev) return res.status(404).json({ error: "Device not found" });

  const { gateType, timestamp } = TriggerInput.parse(req.body);

  const now = new Date();
  await prisma.device.update({
    where: { id: req.params.id },
    data: { lastTriggerAt: now, online: true },
  });

  const handled = handleExternalSensorEvent({
    gateType,
    eventType: "BEAM_BROKEN",
    deviceId: dev.id,
    timestamp: timestamp ?? Date.now(),
  });

  broadcast("device:status", { ...dev, online: true, lastTriggerAt: now });
  res.json({ ok: true, handled, deviceId: dev.id, gateType });
});

const ObstacleInput = z.object({
  obstacleNumber: z.number().int().min(1).max(15),
  photoTriggered: z.boolean(),
  fallen: z.boolean(),
  timestamp: z.number().int().optional(),
});

devicesRouter.post("/:id/obstacle", async (req, res) => {
  const dev = await prisma.device.findUnique({ where: { id: req.params.id } });
  if (!dev) return res.status(404).json({ error: "Device not found" });

  const data = ObstacleInput.parse(req.body);
  const now = new Date();

  await prisma.device.update({
    where: { id: req.params.id },
    data: { lastTriggerAt: now, online: true },
  });

  broadcast("obstacle:event", {
    deviceId: dev.id,
    obstacleNumber: data.obstacleNumber,
    photoTriggered: data.photoTriggered,
    fallen: data.fallen,
    at: data.timestamp ?? Date.now(),
  });

  broadcast("device:status", { ...dev, online: true, lastTriggerAt: now });
  res.json({ ok: true });
});

const HeartbeatInput = z.object({
  battery: z.number().int().min(0).max(100).optional(),
  rssi: z.number().int().optional(),
  type: z.enum(DEVICE_TYPES).optional(),
  obstacleNumber: z.number().int().min(0).max(15).optional(),
  ssid: z.string().optional(),
  ip: z.string().optional(),
  vl53Baseline: z.number().int().min(0).max(10000).optional(),
});

devicesRouter.post("/:id/heartbeat", async (req, res) => {
  const { battery, rssi, type, obstacleNumber, ssid, ip, vl53Baseline } = HeartbeatInput.parse(req.body);

  let dev = await prisma.device.findUnique({ where: { id: req.params.id } });

  if (!dev) {
    // Auto-register: create device with the ID the ESP32 sent
    dev = await prisma.device.create({
      data: {
        id: req.params.id,
        name: req.params.id,
        type: (type ?? "START") as any,
        online: true,
        battery: battery ?? 100,
        obstacleNumber: obstacleNumber ?? null,
        wifiSsid: ssid ?? null,
        rssi: rssi ?? null,
        ipAddress: ip ?? null,
      },
    });
    broadcast("device:status", dev);
    broadcast("device:registered", dev);
    console.log(`[devices] Auto-registered: ${dev.id} (${dev.type})`);
  } else {
    const updateData: Record<string, any> = { online: true };
    if (battery !== undefined) updateData.battery = battery;
    if (ssid !== undefined) updateData.wifiSsid = ssid;
    if (rssi !== undefined) updateData.rssi = rssi;
    if (ip !== undefined) updateData.ipAddress = ip;

    dev = await prisma.device.update({
      where: { id: req.params.id },
      data: updateData,
    });
    broadcast("device:status", { ...dev, rssi });
  }

  recordHeartbeat(req.params.id);

  if (vl53Baseline !== undefined) {
    broadcast("device:vl53reading", {
      deviceId: req.params.id,
      mm: vl53Baseline,
      at: Date.now(),
    });
  }

  res.json({
    ok: true,
    serverTime: Date.now(),
    config: {
      vl53FallenMm: dev.vl53FallenMm,
    },
  });
});
