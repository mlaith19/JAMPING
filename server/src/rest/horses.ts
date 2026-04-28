import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const horsesRouter = Router();

const HorseInput = z.object({
  name: z.string().min(1),
  yearOfBirth: z.number().int().min(1980).max(2100).optional().nullable(),
  sex: z.enum(["MARE", "STALLION", "GELDING"]).optional().nullable(),
  color: z.string().optional().nullable(),
  owner: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

horsesRouter.get("/", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const items = await prisma.horse.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { owner: { contains: q, mode: "insensitive" } }] } : undefined,
    orderBy: { internalNumber: "asc" },
  });
  res.json(items);
});

horsesRouter.get("/:id", async (req, res) => {
  const item = await prisma.horse.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

horsesRouter.post("/", async (req, res) => {
  const data = HorseInput.parse(req.body);
  const item = await prisma.horse.create({ data });
  res.status(201).json(item);
});

horsesRouter.patch("/:id", async (req, res) => {
  const data = HorseInput.partial().parse(req.body);
  const item = await prisma.horse.update({ where: { id: req.params.id }, data });
  res.json(item);
});

horsesRouter.delete("/:id", async (req, res) => {
  await prisma.horse.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
