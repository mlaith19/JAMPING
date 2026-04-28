import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { broadcast } from "../ws/index.js";

export const devicesRouter = Router();

const DeviceInput = z.object({
  name: z.string().min(1),
  type: z.enum(["START", "FINISH"]),
  online: z.boolean().optional(),
  battery: z.number().int().min(0).max(100).optional(),
});

devicesRouter.get("/", async (_req, res) => {
  const items = await prisma.device.findMany({ orderBy: { type: "asc" } });
  res.json(items);
});

devicesRouter.post("/", async (req, res) => {
  const data = DeviceInput.parse(req.body);
  const item = await prisma.device.create({ data });
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
    data: { online: true, battery: 100, lastTriggerAt: null },
  });
  broadcast("device:status", item);
  res.json(item);
});

devicesRouter.delete("/:id", async (req, res) => {
  await prisma.device.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
