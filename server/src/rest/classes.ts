import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const classesRouter = Router();

const ClassInput = z.object({
  competitionId: z.string().min(1),
  name: z.string().min(1),
  courseHeight: z.number().int().min(40).max(220).optional(),
  category: z.string().min(1).optional(),

  // Class meta (table type / mode)
  tableType: z.enum(["A", "C"]).optional(),
  allowedTime: z.number().int().min(1).max(3600).nullable().optional(),
  timeLimit: z.number().int().min(1).max(7200).nullable().optional(),
  rankingMode: z.enum(["FAULTS_TIME", "FAULTS_ONLY", "TIME_ONLY"]).optional(),
  hasJumpOff: z.boolean().optional(),
  jumpOffAgainstClock: z.boolean().optional(),
  secondDisobedienceRule: z.enum(["FEI", "LOCAL"]).optional(),

  // Scoring Rules — per ShowClass, configurable
  knockdownFaults: z.number().int().min(0).max(50).optional(),
  firstRefusalFaults: z.number().int().min(0).max(50).optional(),
  secondRefusalFaults: z.number().int().min(0).max(50).optional(),
  maxRefusalsBeforeElimination: z.number().int().min(1).max(10).optional(),
  timeFaultIntervalSeconds: z.number().int().min(1).max(60).optional(),
  timeFaultPoints: z.number().int().min(0).max(20).optional(),
  jumpOffTimeFaultIntervalSeconds: z.number().int().min(1).max(60).optional(),
  jumpOffTimeFaultPoints: z.number().int().min(0).max(20).optional(),
  timeLimitMultiplier: z.number().min(1).max(10).optional(),

  // Legacy / kept for back-compat
  scoringType: z.enum(["FAULTS_TIME", "TIME_ONLY", "JUMP_OFF"]).optional(),
  knockdownPenalty: z.number().int().min(0).max(20).optional(),
  refusalPenalty: z.number().int().min(0).max(20).optional(),
  eliminationRules: z.any().optional(),
});

classesRouter.get("/", async (req, res) => {
  const competitionId = req.query.competitionId as string | undefined;
  const where = competitionId ? { competitionId } : undefined;
  const items = await prisma.showClass.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { entries: true } } },
  });
  res.json(items);
});

classesRouter.get("/:id", async (req, res) => {
  const item = await prisma.showClass.findUnique({
    where: { id: req.params.id },
    include: {
      entries: {
        include: { horse: true, rider: true },
        orderBy: { orderIndex: "asc" },
      },
      runs: true,
    },
  });
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

classesRouter.post("/", async (req, res) => {
  const data = ClassInput.parse(req.body);
  const item = await prisma.showClass.create({ data });
  res.status(201).json(item);
});

classesRouter.patch("/:id", async (req, res) => {
  const data = ClassInput.partial().parse(req.body);
  const item = await prisma.showClass.update({ where: { id: req.params.id }, data });
  res.json(item);
});

classesRouter.delete("/:id", async (req, res) => {
  await prisma.showClass.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
