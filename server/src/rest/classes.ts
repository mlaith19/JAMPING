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
  competitionType: z.enum(["STANDARD", "ACCUMULATOR"]).optional(),
  numberOfObstacles: z.union([z.literal(6), z.literal(8), z.literal(10)]).optional(),
  accumulatorMode: z
    .enum(["AGAINST_CLOCK_NO_JUMP_OFF", "AGAINST_CLOCK_WITH_JUMP_OFF", "NOT_AGAINST_CLOCK_WITH_JUMP_OFF"])
    .optional(),
  hasJoker: z.boolean().optional(),
  jokerType: z.enum(["NONE", "SINGLE_JOKER", "DOUBLE_JOKER"]).optional(),
  maxPoints: z.number().int().min(0).max(300).optional(),

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
  competitionType: "STANDARD" | "ACCUMULATOR";
  numberOfObstacles: 6 | 8 | 10;
  accumulatorMode: "AGAINST_CLOCK_NO_JUMP_OFF" | "AGAINST_CLOCK_WITH_JUMP_OFF" | "NOT_AGAINST_CLOCK_WITH_JUMP_OFF";
  hasJoker: boolean;
  jokerType: "NONE" | "SINGLE_JOKER" | "DOUBLE_JOKER";
  maxPoints: number;
}>> {
  if (items.length === 0) return [] as Array<T & {
    courseLengthMeters: number | null;
    horseSpeedMetersPerMinute: number;
    maxObstacles: number;
    tableCDisobedienceWithKnockdownSeconds: number;
    applyTimeAdditionToClock: boolean;
    competitionType: "STANDARD" | "ACCUMULATOR";
    numberOfObstacles: 6 | 8 | 10;
    accumulatorMode: "AGAINST_CLOCK_NO_JUMP_OFF" | "AGAINST_CLOCK_WITH_JUMP_OFF" | "NOT_AGAINST_CLOCK_WITH_JUMP_OFF";
    hasJoker: boolean;
    jokerType: "NONE" | "SINGLE_JOKER" | "DOUBLE_JOKER";
    maxPoints: number;
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
        competitionType: "STANDARD" | "ACCUMULATOR" | null;
        numberOfObstacles: number | null;
        accumulatorMode:
          | "AGAINST_CLOCK_NO_JUMP_OFF"
          | "AGAINST_CLOCK_WITH_JUMP_OFF"
          | "NOT_AGAINST_CLOCK_WITH_JUMP_OFF"
          | null;
        hasJoker: boolean | null;
        jokerType: "NONE" | "SINGLE_JOKER" | "DOUBLE_JOKER" | null;
        maxPoints: number | null;
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
          competitionType: "STANDARD" | "ACCUMULATOR" | null;
          numberOfObstacles: number | null;
          accumulatorMode:
            | "AGAINST_CLOCK_NO_JUMP_OFF"
            | "AGAINST_CLOCK_WITH_JUMP_OFF"
            | "NOT_AGAINST_CLOCK_WITH_JUMP_OFF"
            | null;
          hasJoker: boolean | null;
          jokerType: "NONE" | "SINGLE_JOKER" | "DOUBLE_JOKER" | null;
          maxPoints: number | null;
        }>
      >`SELECT "courseLengthMeters","horseSpeedMetersPerMinute","maxObstacles","tableCDisobedienceWithKnockdownSeconds","applyTimeAdditionToClock","competitionType","numberOfObstacles","accumulatorMode","hasJoker","jokerType","maxPoints" FROM "ShowClass" WHERE "id" = ${item.id} LIMIT 1`;
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
        competitionType: x?.competitionType ?? "STANDARD",
        numberOfObstacles:
          x?.numberOfObstacles === 6 || x?.numberOfObstacles === 8 || x?.numberOfObstacles === 10
            ? x.numberOfObstacles
            : 10,
        accumulatorMode: x?.accumulatorMode ?? "AGAINST_CLOCK_NO_JUMP_OFF",
        hasJoker: x?.hasJoker ?? false,
        jokerType: x?.jokerType ?? "NONE",
        maxPoints: x?.maxPoints ?? 55,
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
      competitionType: "STANDARD",
      numberOfObstacles: 10,
      accumulatorMode: "AGAINST_CLOCK_NO_JUMP_OFF",
      hasJoker: false,
      jokerType: "NONE",
      maxPoints: 55,
    }));
  }
}

function accumulatorMaxPoints(numberOfObstacles: 6 | 8 | 10): number {
  if (numberOfObstacles === 6) return 21;
  if (numberOfObstacles === 8) return 36;
  return 55;
}

function hasAccumulatorFields(data: Partial<z.infer<typeof ClassInput>>): boolean {
  return (
    data.competitionType !== undefined ||
    data.numberOfObstacles !== undefined ||
    data.accumulatorMode !== undefined ||
    data.hasJoker !== undefined ||
    data.jokerType !== undefined ||
    data.maxPoints !== undefined
  );
}

async function patchExtraClassFields(classId: string, data: Partial<z.infer<typeof ClassInput>>): Promise<boolean> {
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
    if (data.competitionType !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ShowClass" SET "competitionType" = $1::"ClassCompetitionType" WHERE "id" = $2`,
        data.competitionType,
        classId
      );
    }
    if (data.numberOfObstacles !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ShowClass" SET "numberOfObstacles" = $1 WHERE "id" = $2`,
        data.numberOfObstacles,
        classId
      );
    }
    if (data.accumulatorMode !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ShowClass" SET "accumulatorMode" = $1::"AccumulatorMode" WHERE "id" = $2`,
        data.accumulatorMode,
        classId
      );
    }
    if (data.hasJoker !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ShowClass" SET "hasJoker" = $1 WHERE "id" = $2`,
        data.hasJoker,
        classId
      );
    }
    if (data.jokerType !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ShowClass" SET "jokerType" = $1::"JokerType" WHERE "id" = $2`,
        data.jokerType,
        classId
      );
    }
    if (data.maxPoints !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ShowClass" SET "maxPoints" = $1 WHERE "id" = $2`,
        data.maxPoints,
        classId
      );
    }
    return true;
  } catch {
    // Keep backward compatibility when DB/schema is not yet migrated.
    return false;
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
  const normalized = { ...data };
  if (normalized.competitionType === "ACCUMULATOR") {
    const count = (normalized.numberOfObstacles ?? 10) as 6 | 8 | 10;
    normalized.numberOfObstacles = count;
    normalized.maxPoints = accumulatorMaxPoints(count);
    if (!normalized.hasJoker) normalized.jokerType = "NONE";
    if (normalized.jokerType === "DOUBLE_JOKER") normalized.hasJoker = true;
  }
  const {
    courseLengthMeters,
    horseSpeedMetersPerMinute,
    maxObstacles,
    tableCDisobedienceWithKnockdownSeconds,
    applyTimeAdditionToClock,
    competitionType,
    numberOfObstacles,
    accumulatorMode,
    hasJoker,
    jokerType,
    maxPoints,
    ...rest
  } = normalized;
  const item = await prisma.showClass.create({ data: rest });
  const extraPatchOk = await patchExtraClassFields(item.id, {
    ...normalized,
    courseLengthMeters,
    horseSpeedMetersPerMinute,
    maxObstacles,
    tableCDisobedienceWithKnockdownSeconds,
    applyTimeAdditionToClock,
    competitionType,
    numberOfObstacles,
    accumulatorMode,
    hasJoker,
    jokerType,
    maxPoints,
  });
  if (!extraPatchOk && hasAccumulatorFields(normalized)) {
    return res.status(409).json({
      error: "Accumulator fields are not available in database yet. Please run Prisma migration and generate.",
    });
  }
  const [merged] = await mergeExtraClassFields([item]);
  res.status(201).json(merged);
});

classesRouter.patch("/:id", async (req, res) => {
  const data = ClassInput.partial().parse(req.body);
  const current = await mergeExtraClassFields(
    (await prisma.showClass.findMany({ where: { id: req.params.id }, take: 1 })) as Array<{ id: string }>
  );
  const mergedCurrent = current[0];
  const normalized = { ...data };
  const nextCompetitionType = normalized.competitionType ?? mergedCurrent?.competitionType ?? "STANDARD";
  const nextHasJoker = normalized.hasJoker ?? mergedCurrent?.hasJoker ?? false;
  const nextJokerType = normalized.jokerType ?? mergedCurrent?.jokerType ?? "NONE";
  const nextCount = (normalized.numberOfObstacles ??
    mergedCurrent?.numberOfObstacles ??
    10) as 6 | 8 | 10;
  if (nextCompetitionType === "ACCUMULATOR") {
    normalized.numberOfObstacles = nextCount;
    normalized.maxPoints = accumulatorMaxPoints(nextCount);
    if (!nextHasJoker) normalized.jokerType = "NONE";
    if (nextJokerType === "DOUBLE_JOKER") normalized.hasJoker = true;
  }
  const {
    courseLengthMeters,
    horseSpeedMetersPerMinute,
    maxObstacles,
    tableCDisobedienceWithKnockdownSeconds,
    applyTimeAdditionToClock,
    competitionType,
    numberOfObstacles,
    accumulatorMode,
    hasJoker,
    jokerType,
    maxPoints,
    ...rest
  } = normalized;
  const item = await prisma.showClass.update({ where: { id: req.params.id }, data: rest });
  const extraPatchOk = await patchExtraClassFields(req.params.id, {
    ...normalized,
    courseLengthMeters,
    horseSpeedMetersPerMinute,
    maxObstacles,
    tableCDisobedienceWithKnockdownSeconds,
    applyTimeAdditionToClock,
    competitionType,
    numberOfObstacles,
    accumulatorMode,
    hasJoker,
    jokerType,
    maxPoints,
  });
  if (!extraPatchOk && hasAccumulatorFields(normalized)) {
    return res.status(409).json({
      error: "Accumulator fields are not available in database yet. Please run Prisma migration and generate.",
    });
  }
  const [merged] = await mergeExtraClassFields([item]);
  res.json(merged);
});

classesRouter.delete("/:id", async (req, res) => {
  await prisma.showClass.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
