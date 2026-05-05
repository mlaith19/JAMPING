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
  courseLengthMeters: z.number().int().min(1).max(6000).nullable().optional(),
  horseSpeedMetersPerMinute: z.number().int().min(50).max(1000).optional(),
  maxObstacles: z.number().int().min(1).max(15).optional(),
  tableCDisobedienceWithKnockdownSeconds: z.number().int().min(1).max(60).optional(),
  applyTimeAdditionToClock: z.boolean().optional(),
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

async function mergeExtraClassFields<T extends { id: string }>(items: T[]): Promise<Array<T & {
  courseLengthMeters: number | null;
  horseSpeedMetersPerMinute: number;
  maxObstacles: number;
  tableCDisobedienceWithKnockdownSeconds: number;
  applyTimeAdditionToClock: boolean;
}>> {
  if (items.length === 0) return [] as Array<T & {
    courseLengthMeters: number | null;
    horseSpeedMetersPerMinute: number;
    maxObstacles: number;
    tableCDisobedienceWithKnockdownSeconds: number;
    applyTimeAdditionToClock: boolean;
  }>;
  try {
    const byId = new Map<
      string,
      {
        courseLengthMeters: number | null;
        horseSpeedMetersPerMinute: number | null;
        maxObstacles: number | null;
        tableCDisobedienceWithKnockdownSeconds: number | null;
        applyTimeAdditionToClock: boolean | null;
      }
    >();
    for (const item of items) {
      const rows = await prisma.$queryRaw<
        Array<{
          courseLengthMeters: number | null;
          horseSpeedMetersPerMinute: number | null;
          maxObstacles: number | null;
          tableCDisobedienceWithKnockdownSeconds: number | null;
          applyTimeAdditionToClock: boolean | null;
        }>
      >`SELECT "courseLengthMeters","horseSpeedMetersPerMinute","maxObstacles","tableCDisobedienceWithKnockdownSeconds","applyTimeAdditionToClock" FROM "ShowClass" WHERE "id" = ${item.id} LIMIT 1`;
      if (rows[0]) byId.set(item.id, rows[0]);
    }
    return items.map((item) => {
      const x = byId.get(item.id);
      return {
        ...item,
        courseLengthMeters: x?.courseLengthMeters ?? null,
        horseSpeedMetersPerMinute: x?.horseSpeedMetersPerMinute ?? 350,
        maxObstacles: x?.maxObstacles ?? 12,
        tableCDisobedienceWithKnockdownSeconds: x?.tableCDisobedienceWithKnockdownSeconds ?? 6,
        applyTimeAdditionToClock: x?.applyTimeAdditionToClock ?? false,
      };
    });
  } catch {
    return items.map((item) => ({
      ...item,
      courseLengthMeters: null,
      horseSpeedMetersPerMinute: 350,
      maxObstacles: 12,
      tableCDisobedienceWithKnockdownSeconds: 6,
      applyTimeAdditionToClock: false,
    }));
  }
}

async function patchExtraClassFields(classId: string, data: Partial<z.infer<typeof ClassInput>>) {
  try {
    if (data.courseLengthMeters !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ShowClass" SET "courseLengthMeters" = $1 WHERE "id" = $2`,
        data.courseLengthMeters,
        classId
      );
    }
    if (data.horseSpeedMetersPerMinute !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ShowClass" SET "horseSpeedMetersPerMinute" = $1 WHERE "id" = $2`,
        data.horseSpeedMetersPerMinute,
        classId
      );
    }
    if (data.maxObstacles !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ShowClass" SET "maxObstacles" = $1 WHERE "id" = $2`,
        data.maxObstacles,
        classId
      );
    }
    if (data.tableCDisobedienceWithKnockdownSeconds !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ShowClass" SET "tableCDisobedienceWithKnockdownSeconds" = $1 WHERE "id" = $2`,
        data.tableCDisobedienceWithKnockdownSeconds,
        classId
      );
    }
    if (data.applyTimeAdditionToClock !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ShowClass" SET "applyTimeAdditionToClock" = $1 WHERE "id" = $2`,
        data.applyTimeAdditionToClock,
        classId
      );
    }
  } catch {
    // Keep backward compatibility when DB/schema is not yet migrated.
  }
}

classesRouter.get("/", async (req, res) => {
  const competitionId = req.query.competitionId as string | undefined;
  const where = competitionId ? { competitionId } : undefined;
  const items = await prisma.showClass.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { entries: true } } },
  });
  res.json(await mergeExtraClassFields(items));
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
  const [merged] = await mergeExtraClassFields([item]);
  res.json(merged);
});

classesRouter.post("/", async (req, res) => {
  const data = ClassInput.parse(req.body);
  const { courseLengthMeters, horseSpeedMetersPerMinute, maxObstacles, tableCDisobedienceWithKnockdownSeconds, applyTimeAdditionToClock, ...rest } = data;
  const item = await prisma.showClass.create({ data: rest });
  await patchExtraClassFields(item.id, {
    ...data,
    courseLengthMeters,
    horseSpeedMetersPerMinute,
    maxObstacles,
    tableCDisobedienceWithKnockdownSeconds,
    applyTimeAdditionToClock,
  });
  const [merged] = await mergeExtraClassFields([item]);
  res.status(201).json(merged);
});

classesRouter.patch("/:id", async (req, res) => {
  const data = ClassInput.partial().parse(req.body);
  const { courseLengthMeters, horseSpeedMetersPerMinute, maxObstacles, tableCDisobedienceWithKnockdownSeconds, applyTimeAdditionToClock, ...rest } = data;
  const item = await prisma.showClass.update({ where: { id: req.params.id }, data: rest });
  await patchExtraClassFields(req.params.id, {
    ...data,
    courseLengthMeters,
    horseSpeedMetersPerMinute,
    maxObstacles,
    tableCDisobedienceWithKnockdownSeconds,
    applyTimeAdditionToClock,
  });
  const [merged] = await mergeExtraClassFields([item]);
  res.json(merged);
});

classesRouter.delete("/:id", async (req, res) => {
  await prisma.showClass.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
