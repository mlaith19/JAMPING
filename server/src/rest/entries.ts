import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const entriesRouter = Router();

const EntryInput = z.object({
  competitionId: z.string().min(1),
  classId: z.string().min(1),
  horseId: z.string().min(1),
  riderId: z.string().min(1),
  startNumber: z.number().int().min(1).optional(),
  status: z.enum(["REGISTERED", "SCRATCHED", "ACTIVE", "DONE"]).optional(),
});

async function nextStartNumber(classId: string): Promise<number> {
  const max = await prisma.entry.aggregate({
    where: { classId },
    _max: { startNumber: true },
  });
  return (max._max.startNumber ?? 0) + 1;
}

entriesRouter.get("/", async (req, res) => {
  const { competitionId, classId } = req.query as { competitionId?: string; classId?: string };
  const where: any = {};
  if (competitionId) where.competitionId = competitionId;
  if (classId) where.classId = classId;
  const items = await prisma.entry.findMany({
    where,
    include: { horse: true, rider: true, showClass: true, competition: true },
    orderBy: [{ classId: "asc" }, { startNumber: "asc" }],
  });
  res.json(items);
});

entriesRouter.get("/:id", async (req, res) => {
  const item = await prisma.entry.findUnique({
    where: { id: req.params.id },
    include: { horse: true, rider: true, showClass: true, competition: true, runs: true },
  });
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

entriesRouter.post("/", async (req, res) => {
  const data = EntryInput.parse(req.body);
  const startNumber = data.startNumber ?? (await nextStartNumber(data.classId));
  const orderMax = await prisma.entry.aggregate({
    where: { classId: data.classId },
    _max: { orderIndex: true },
  });
  const orderIndex = (orderMax._max.orderIndex ?? -1) + 1;

  const item = await prisma.entry.create({
    data: { ...data, startNumber, orderIndex },
    include: { horse: true, rider: true },
  });
  res.status(201).json(item);
});

entriesRouter.patch("/:id", async (req, res) => {
  const data = EntryInput.partial().parse(req.body);
  const item = await prisma.entry.update({
    where: { id: req.params.id },
    data,
    include: { horse: true, rider: true },
  });
  res.json(item);
});

entriesRouter.delete("/:id", async (req, res) => {
  await prisma.entry.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
