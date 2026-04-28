import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const ridersRouter = Router();

const RiderInput = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  club: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

ridersRouter.get("/", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const items = await prisma.rider.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { country: { contains: q, mode: "insensitive" } },
            { club: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { internalNumber: "asc" },
  });
  res.json(items);
});

ridersRouter.get("/:id", async (req, res) => {
  const item = await prisma.rider.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

ridersRouter.post("/", async (req, res) => {
  const data = RiderInput.parse(req.body);
  const item = await prisma.rider.create({ data });
  res.status(201).json(item);
});

ridersRouter.patch("/:id", async (req, res) => {
  const data = RiderInput.partial().parse(req.body);
  const item = await prisma.rider.update({ where: { id: req.params.id }, data });
  res.json(item);
});

ridersRouter.delete("/:id", async (req, res) => {
  await prisma.rider.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
