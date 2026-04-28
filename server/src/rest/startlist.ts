import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { broadcast } from "../ws/index.js";

export const startListRouter = Router();

startListRouter.get("/:classId", async (req, res) => {
  const cls = await prisma.showClass.findUnique({
    where: { id: req.params.classId },
    include: {
      entries: {
        include: { horse: true, rider: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
  if (!cls) return res.status(404).json({ error: "Not found" });
  res.json({ classId: cls.id, locked: cls.startListLocked, entries: cls.entries });
});

const ReorderInput = z.object({
  order: z.array(z.string().min(1)),
});

startListRouter.patch("/:classId", async (req, res) => {
  const { order } = ReorderInput.parse(req.body);
  await prisma.$transaction(
    order.map((entryId, idx) =>
      prisma.entry.update({ where: { id: entryId }, data: { orderIndex: idx } })
    )
  );
  broadcast("startlist:updated", { classId: req.params.classId });
  res.json({ ok: true });
});

startListRouter.post("/:classId/shuffle", async (req, res) => {
  const entries = await prisma.entry.findMany({ where: { classId: req.params.classId } });
  const ids = entries.map((e) => e.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  await prisma.$transaction(
    ids.map((id, idx) => prisma.entry.update({ where: { id }, data: { orderIndex: idx } }))
  );
  broadcast("startlist:updated", { classId: req.params.classId });
  res.json({ ok: true });
});

startListRouter.post("/:classId/lock", async (req, res) => {
  const cls = await prisma.showClass.update({
    where: { id: req.params.classId },
    data: { startListLocked: true },
  });
  broadcast("startlist:locked", { classId: cls.id });
  res.json(cls);
});

startListRouter.post("/:classId/unlock", async (req, res) => {
  const cls = await prisma.showClass.update({
    where: { id: req.params.classId },
    data: { startListLocked: false },
  });
  broadcast("startlist:unlocked", { classId: cls.id });
  res.json(cls);
});
