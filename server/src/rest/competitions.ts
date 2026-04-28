import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const competitionsRouter = Router();

const CompetitionInput = z.object({
  name: z.string().min(1),
  date: z.string().datetime().or(z.string().min(1)),
  location: z.string().min(1),
  status: z.enum(["DRAFT", "ACTIVE", "FINISHED"]).optional(),
  language: z.string().min(2).max(5).optional(),
  currency: z.string().min(2).max(5).optional(),
  notes: z.string().optional().nullable(),
});

competitionsRouter.get("/", async (_req, res) => {
  const items = await prisma.competition.findMany({
    orderBy: { date: "desc" },
    include: { _count: { select: { classes: true, entries: true } } },
  });
  res.json(items);
});

competitionsRouter.get("/:id", async (req, res) => {
  const item = await prisma.competition.findUnique({
    where: { id: req.params.id },
    include: {
      classes: { orderBy: { createdAt: "asc" } },
      _count: { select: { entries: true } },
    },
  });
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

competitionsRouter.post("/", async (req, res) => {
  const data = CompetitionInput.parse(req.body);
  const item = await prisma.competition.create({
    data: { ...data, date: new Date(data.date) },
  });
  res.status(201).json(item);
});

competitionsRouter.patch("/:id", async (req, res) => {
  const data = CompetitionInput.partial().parse(req.body);
  const item = await prisma.competition.update({
    where: { id: req.params.id },
    data: { ...data, ...(data.date ? { date: new Date(data.date) } : {}) },
  });
  res.json(item);
});

competitionsRouter.delete("/:id", async (req, res) => {
  await prisma.competition.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
