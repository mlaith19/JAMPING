import type { Server, Socket } from "socket.io";
import { prisma } from "../db.js";
import { CompetitionTimer } from "./timer.js";
import {
  calculateRunResult,
  getKnockdownFaults,
  getRefusalFaults,
  rankRuns,
  type ResultRow,
  shouldEliminateForRefusals,
} from "../lib/scoring.js";

interface LiveRoomState {
  classId: string;
  currentEntryId: string | null;
  jumpOffActive: boolean;
  jumpOffEntryIds: string[];
  sensorArmed: boolean;
  faults: number;
  knockdownCount: number;
  refusalCount: number;
  addedTimeSeconds: number;
  status: "PENDING" | "OK" | "RETIRED" | "ELIMINATED";
  timer: CompetitionTimer;
  accumulatorPoints: number;
  accumulatorPenalties: number;
  accumulatorObstacles: Record<number, { outcome: "CLEAR" | "KNOCKDOWN"; attempt: "NORMAL" | "JOKER" | "JOKER1" | "JOKER2"; notes?: string }>;
  standardObstacles: Record<number, { outcome: "CLEAR" | "KNOCKDOWN"; notes?: string }>;
  timeLimitSeconds: number | null;
}

const rooms = new Map<string, LiveRoomState>();
let ioRef: Server | null = null;

interface ExternalSensorEventInput {
  gateType: "START" | "FINISH";
  eventType: "BEAM_BROKEN";
  deviceId: string;
  timestamp: number;
}

async function getClassTimeAdditionConfig(classId: string): Promise<{
  tableCDisobedienceWithKnockdownSeconds: number;
  applyTimeAdditionToClock: boolean;
}> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{ tableCDisobedienceWithKnockdownSeconds: number | null; applyTimeAdditionToClock: boolean | null }>
    >`SELECT "tableCDisobedienceWithKnockdownSeconds", "applyTimeAdditionToClock" FROM "ShowClass" WHERE "id" = ${classId} LIMIT 1`;
    return {
      tableCDisobedienceWithKnockdownSeconds: rows[0]?.tableCDisobedienceWithKnockdownSeconds ?? 6,
      applyTimeAdditionToClock: rows[0]?.applyTimeAdditionToClock ?? false,
    };
  } catch {
    return { tableCDisobedienceWithKnockdownSeconds: 6, applyTimeAdditionToClock: false };
  }
}

function applyRefusalFault(room: LiveRoomState, cls: any) {
  const nextRefusalCount = room.refusalCount + 1;
  // If this refusal exceeds the allowed max, eliminate without adding extra refusal points.
  if (shouldEliminateForRefusals(cls, nextRefusalCount)) {
    room.status = "ELIMINATED";
    return;
  }
  room.refusalCount = nextRefusalCount;
  room.faults += getRefusalFaults(cls, room.refusalCount);
}

function stopTimerForTerminalStatus(room: LiveRoomState) {
  if (room.status === "ELIMINATED" || room.status === "RETIRED") {
    room.timer.stop();
  }
}

function syncAccumulatorPenaltyIfNeeded(room: LiveRoomState, cls: any) {
  if ((cls as any)?.competitionType !== "ACCUMULATOR") return;
  room.accumulatorPenalties = room.faults;
}

function emitBell(classId: string, reason: "REFUSAL" | "ELIMINATION" | "TIME_LIMIT") {
  if (!ioRef) return;
  ioRef.to(`class:${classId}`).emit("bell:ring", { classId, reason, at: Date.now() });
}

async function syncRoomRuleConfig(classId: string, room: LiveRoomState) {
  try {
    const cls = await prisma.showClass.findUnique({
      where: { id: classId },
      select: { timeLimit: true },
    });
    room.timeLimitSeconds = cls?.timeLimit ?? null;
  } catch {
    room.timeLimitSeconds = null;
  }
}

function getOrCreateRoom(io: Server, classId: string): LiveRoomState {
  let r = rooms.get(classId);
  if (r) return r;
  const timer = new CompetitionTimer();
  timer.onTick((elapsedMs) => {
    io.to(`class:${classId}`).emit("timer:tick", { classId, elapsedMs });
    const room = rooms.get(classId);
    if (!room) return;
    if (room.status === "ELIMINATED" || room.status === "RETIRED") return;
    if (!room.timeLimitSeconds || room.timeLimitSeconds <= 0) return;
    if (elapsedMs <= room.timeLimitSeconds * 1000) return;
    room.status = "ELIMINATED";
    const s = room.timer.stop();
    emitBell(classId, "TIME_LIMIT");
    io.to(`class:${classId}`).emit("fault:added", {
      classId,
      type: "ELIMINATION",
      faults: room.faults,
      status: room.status,
      knockdownCount: room.knockdownCount,
      refusalCount: room.refusalCount,
      addedTimeSeconds: room.addedTimeSeconds,
    });
    io.to(`class:${classId}`).emit("timer:stopped", { classId, elapsedMs: s.elapsedMs });
  });
  r = {
    classId,
    currentEntryId: null,
    jumpOffActive: false,
    jumpOffEntryIds: [],
    sensorArmed: false,
    faults: 0,
    knockdownCount: 0,
    refusalCount: 0,
    addedTimeSeconds: 0,
    status: "PENDING",
    timer,
    accumulatorPoints: 0,
    accumulatorPenalties: 0,
    accumulatorObstacles: {},
    standardObstacles: {},
    timeLimitSeconds: null,
  };
  rooms.set(classId, r);
  return r;
}

function resetRun(room: LiveRoomState) {
  room.faults = 0;
  room.knockdownCount = 0;
  room.refusalCount = 0;
  room.addedTimeSeconds = 0;
  room.status = "PENDING";
  room.sensorArmed = false;
  room.timer.reset();
  room.accumulatorPoints = 0;
  room.accumulatorPenalties = 0;
  room.accumulatorObstacles = {};
  room.standardObstacles = {};
}

function resetJumpOff(room: LiveRoomState) {
  room.jumpOffActive = false;
  room.jumpOffEntryIds = [];
}

function readRunDetails(details: unknown): {
  knockdownCount?: number;
  refusalCount?: number;
  isJumpOff?: boolean;
} {
  if (!details || typeof details !== "object") return {};
  const d = details as Record<string, unknown>;
  return {
    knockdownCount: typeof d.knockdownCount === "number" ? d.knockdownCount : undefined,
    refusalCount: typeof d.refusalCount === "number" ? d.refusalCount : undefined,
    isJumpOff: typeof d.isJumpOff === "boolean" ? d.isJumpOff : undefined,
  };
}

function calculateAccumulatorPoints(
  obstacleCount: number,
  hasJoker: boolean,
  jokerType: "NONE" | "SINGLE_JOKER" | "DOUBLE_JOKER",
  obstacles: Record<number, { outcome: "CLEAR" | "KNOCKDOWN"; attempt: "NORMAL" | "JOKER" | "JOKER1" | "JOKER2" }>
): number {
  let total = 0;
  for (let i = 1; i <= obstacleCount; i++) {
    const o = obstacles[i];
    if (!o) continue;
    const isLast = i === obstacleCount;
    if (!isLast || !hasJoker) {
      if (o.outcome === "CLEAR") total += i;
      continue;
    }
    if (o.attempt === "NORMAL") {
      if (o.outcome === "CLEAR") total += i;
      continue;
    }
    if (jokerType === "SINGLE_JOKER" || o.attempt === "JOKER") {
      const pts = i * 2;
      total += o.outcome === "CLEAR" ? pts : -pts;
      continue;
    }
    if (jokerType === "DOUBLE_JOKER") {
      const pts = o.attempt === "JOKER1" ? i * 1.5 : i * 2;
      total += o.outcome === "CLEAR" ? pts : -pts;
    }
  }
  return total;
}

async function getJumpOffCandidates(classId: string): Promise<string[]> {
  const cls = await prisma.showClass.findUnique({
    where: { id: classId },
    include: {
      entries: {
        include: {
          runs: { orderBy: { createdAt: "desc" } },
          horse: true,
          rider: true,
        },
      },
    },
  });
  if (!cls || !cls.hasJumpOff) return [];

  const mainRows = cls.entries
    .map((e) => {
      const mainRun = e.runs.find((r) => !readRunDetails(r.details).isJumpOff);
      if (!mainRun) return null;
      const d = readRunDetails(mainRun.details);
      const calc = calculateRunResult({
        obstacleFaults: mainRun.faults,
        knockdownCount: d.knockdownCount,
        refusalCount: d.refusalCount,
        timeMs: mainRun.timeMs,
        status: mainRun.status,
        allowedTimeSeconds: cls.allowedTime,
        rules: cls,
        isJumpOff: false,
      });
      return {
        entryId: e.id,
        startNumber: e.startNumber,
        horseName: e.horse.name,
        riderName: e.rider.name,
        faults: calc.faults,
        timeMs: calc.timeMs,
        status: calc.status,
        approved: mainRun.approved ?? false,
      };
    })
    .filter((r) => r !== null) as ResultRow[];

  const rankingMode = ((cls as any).rankingMode ?? cls.scoringType ?? "FAULTS_TIME") as
    | "FAULTS_TIME"
    | "FAULTS_ONLY"
    | "TIME_ONLY";
  const ranked = rankRuns(mainRows, rankingMode);
  const okRows = ranked.filter((r) => r.status === "OK");
  if (okRows.length < 2) return [];

  const best = okRows[0];
  if ((cls as any).competitionType === "TIME_60_80") {
    const targetSec = Number((cls as any).targetTimeSeconds ?? cls.allowedTime ?? 40);
    const targetMs = Math.max(1, targetSec) * 1000;
    const bestDiff = Math.abs((best.timeMs ?? Number.MAX_SAFE_INTEGER) - targetMs);
    const tied = okRows.filter((r) => {
      const d = Math.abs((r.timeMs ?? Number.MAX_SAFE_INTEGER) - targetMs);
      return d === bestDiff;
    });
    return tied.length > 1 ? tied.map((r) => r.entryId) : [];
  }
  const mode = cls.rankingMode;
  const tableType = cls.tableType;

  const tied = okRows.filter((r) => {
    if (tableType === "C" || mode === "TIME_ONLY") {
      return (r.timeMs ?? Number.MAX_SAFE_INTEGER) === (best.timeMs ?? Number.MAX_SAFE_INTEGER);
    }
    if (mode === "FAULTS_ONLY") {
      return (r.faults ?? Number.MAX_SAFE_INTEGER) === (best.faults ?? Number.MAX_SAFE_INTEGER);
    }
    return (
      (r.faults ?? Number.MAX_SAFE_INTEGER) === (best.faults ?? Number.MAX_SAFE_INTEGER) &&
      (r.timeMs ?? Number.MAX_SAFE_INTEGER) === (best.timeMs ?? Number.MAX_SAFE_INTEGER)
    );
  });

  return tied.length > 1 ? tied.map((r) => r.entryId) : [];
}

export function registerLive(io: Server, socket: Socket) {
  ioRef = io;
  async function persistCurrentRunIfNeeded(classId: string, room: LiveRoomState): Promise<boolean> {
    if (!room.currentEntryId) return false;
    const t = room.timer.getState();
    const hasLiveData =
      t.elapsedMs > 0 ||
      room.faults > 0 ||
      room.status !== "PENDING" ||
      Object.keys(room.accumulatorObstacles).length > 0 ||
      Object.keys(room.standardObstacles).length > 0;
    if (!hasLiveData) return false;

    const isJumpOff = room.jumpOffActive && room.jumpOffEntryIds.includes(room.currentEntryId);
    const run = await prisma.run.create({
      data: {
        entryId: room.currentEntryId,
        classId,
        faults: room.faults,
        timeMs: t.elapsedMs,
        status: room.status === "PENDING" ? "OK" : (room.status as any),
        approved: true,
        judgedAt: new Date(),
        details: {
          knockdownCount: room.knockdownCount,
          refusalCount: room.refusalCount,
          isJumpOff,
          accumulator: {
            points: room.accumulatorPoints,
            penalties: room.accumulatorPenalties,
            finalScore: room.accumulatorPoints - room.accumulatorPenalties,
            obstacles: room.accumulatorObstacles,
          },
          standard: {
            obstacles: room.standardObstacles,
          },
        },
      },
    });
    await prisma.entry.update({
      where: { id: room.currentEntryId },
      data: { status: "DONE" },
    });
    io.to(`class:${classId}`).emit("result:approved", { classId, run });
    io.emit("results:updated", { classId });
    return true;
  }

  socket.on("class:join", async ({ classId }: { classId: string }) => {
    if (!classId) return;
    socket.join(`class:${classId}`);
    const room = getOrCreateRoom(io, classId);
    await syncRoomRuleConfig(classId, room);
    socket.emit("class:state", {
      classId,
      currentEntryId: room.currentEntryId,
      sensorArmed: room.sensorArmed,
      faults: room.faults,
      knockdownCount: room.knockdownCount,
      refusalCount: room.refusalCount,
      addedTimeSeconds: room.addedTimeSeconds,
      status: room.status,
      timer: room.timer.getState(),
      accumulator: {
        points: room.accumulatorPoints,
        penalties: room.accumulatorPenalties,
        obstacles: room.accumulatorObstacles,
      },
      standard: {
        obstacles: room.standardObstacles,
      },
    });
  });

  socket.on("class:leave", ({ classId }: { classId: string }) => {
    socket.leave(`class:${classId}`);
  });

  socket.on("class:start", async ({ classId }: { classId: string }) => {
    if (!classId) return;
    await prisma.showClass.update({ where: { id: classId }, data: { active: true } });
    const room = getOrCreateRoom(io, classId);
    await syncRoomRuleConfig(classId, room);
    resetJumpOff(room);
    resetRun(room);
    io.to(`class:${classId}`).emit("class:started", { classId });
  });

  socket.on("class:end", async ({ classId }: { classId: string }) => {
    await prisma.showClass.update({
      where: { id: classId },
      data: { active: false, currentEntryId: null },
    });
    const room = rooms.get(classId);
    if (room) {
      room.currentEntryId = null;
      resetJumpOff(room);
      resetRun(room);
    }
    io.to(`class:${classId}`).emit("class:ended", { classId });
  });

  socket.on(
    "entry:pick",
    async ({
      classId,
      entryId,
    }: {
      classId: string;
      entryId: string;
    }) => {
      if (!classId || !entryId) return;
      const entry = await prisma.entry.findFirst({
        where: {
          id: entryId,
          classId,
          status: { in: ["REGISTERED", "ACTIVE", "DONE"] },
        },
        include: { horse: true, rider: true },
      });
      if (!entry) return;

      await prisma.entry.updateMany({
        where: { classId, status: "ACTIVE" },
        data: { status: "REGISTERED" },
      });
      await prisma.entry.update({
        where: { id: entry.id },
        data: { status: "ACTIVE" },
      });
      await prisma.showClass.update({
        where: { id: classId },
        data: { currentEntryId: entry.id },
      });

      const room = getOrCreateRoom(io, classId);
      await syncRoomRuleConfig(classId, room);
      room.currentEntryId = entry.id;
      resetRun(room);
      io.to(`class:${classId}`).emit("rider:current", { classId, entry });
    }
  );

  socket.on("rider:next", async ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    await syncRoomRuleConfig(classId, room);
    if (room.currentEntryId) {
      const persisted = await persistCurrentRunIfNeeded(classId, room);
      if (!persisted) {
        await prisma.entry.update({
          where: { id: room.currentEntryId },
          data: { status: "DONE" },
        });
      }
    }

    if (room.jumpOffActive && room.jumpOffEntryIds.length > 0) {
      const entries = await prisma.entry.findMany({
        where: { id: { in: room.jumpOffEntryIds } },
        include: { horse: true, rider: true },
        orderBy: { orderIndex: "asc" },
      });
      const jumpRuns = await prisma.run.findMany({
        where: { classId, entryId: { in: room.jumpOffEntryIds } },
        orderBy: { createdAt: "desc" },
      });
      const doneIds = new Set(
        jumpRuns
          .filter((r) => readRunDetails(r.details).isJumpOff)
          .map((r) => r.entryId)
      );

      const next =
        entries.find((e) => e.id !== room.currentEntryId && !doneIds.has(e.id)) ?? null;
      if (!next) {
        resetJumpOff(room);
        room.currentEntryId = null;
        io.to(`class:${classId}`).emit("jumpoff:completed", { classId });
        io.to(`class:${classId}`).emit("rider:current", { classId, entry: null });
        return;
      }

      await prisma.entry.update({ where: { id: next.id }, data: { status: "ACTIVE" } });
      await prisma.showClass.update({ where: { id: classId }, data: { currentEntryId: next.id } });
      room.currentEntryId = next.id;
      resetRun(room);
      io.to(`class:${classId}`).emit("rider:current", { classId, entry: next });
      return;
    }

    const entries = await prisma.entry.findMany({
      where: { classId, status: { in: ["REGISTERED", "ACTIVE", "DONE"] } },
      include: { horse: true, rider: true },
      orderBy: { orderIndex: "asc" },
    });
    const next = entries.find((e) => e.id !== room.currentEntryId) ?? entries[0];
    if (!next) {
      io.to(`class:${classId}`).emit("rider:current", { classId, entry: null });
      return;
    }
    await prisma.entry.update({ where: { id: next.id }, data: { status: "ACTIVE" } });
    await prisma.showClass.update({ where: { id: classId }, data: { currentEntryId: next.id } });
    room.currentEntryId = next.id;
    resetRun(room);
    io.to(`class:${classId}`).emit("rider:current", { classId, entry: next });
  });

  socket.on("jumpoff:start", async ({ classId }: { classId: string }) => {
    if (!classId) return;
    const room = getOrCreateRoom(io, classId);
    const entryIds = await getJumpOffCandidates(classId);
    if (entryIds.length < 2) {
      io.to(`class:${classId}`).emit("jumpoff:not_required", { classId });
      return;
    }

    room.jumpOffActive = true;
    room.jumpOffEntryIds = entryIds;
    resetRun(room);

    const first = await prisma.entry.findFirst({
      where: { id: entryIds[0], classId },
      include: { horse: true, rider: true },
    });
    if (!first) return;

    await prisma.entry.updateMany({
      where: { classId, status: "ACTIVE" },
      data: { status: "REGISTERED" },
    });
    await prisma.entry.update({ where: { id: first.id }, data: { status: "ACTIVE" } });
    await prisma.showClass.update({
      where: { id: classId },
      data: { currentEntryId: first.id },
    });

    room.currentEntryId = first.id;
    io.to(`class:${classId}`).emit("jumpoff:started", { classId, entryIds });
    io.to(`class:${classId}`).emit("rider:current", { classId, entry: first });
  });

  socket.on("sensor:arm", ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    room.sensorArmed = true;
    io.to(`class:${classId}`).emit("sensor:armed", { classId });
  });

  socket.on("sensor:disarm", ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    room.sensorArmed = false;
    io.to(`class:${classId}`).emit("sensor:disarmed", { classId });
  });

  socket.on("sensor:trigger", ({ classId, type }: { classId: string; type: "START" | "FINISH" }) => {
    const room = getOrCreateRoom(io, classId);
    if (type === "START") {
      if (!room.sensorArmed) return;
      room.timer.start();
      room.sensorArmed = false;
      io.to(`class:${classId}`).emit("timer:started", { classId });
    } else if (type === "FINISH") {
      const s = room.timer.stop();
      io.to(`class:${classId}`).emit("timer:stopped", { classId, elapsedMs: s.elapsedMs });
    }
    io.to(`class:${classId}`).emit("sensor:triggered", { classId, type, at: Date.now() });
  });

  socket.on("timer:manual_start", ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    room.timer.start();
    io.to(`class:${classId}`).emit("timer:started", { classId });
  });

  socket.on("timer:manual_stop", ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    const s = room.timer.stop();
    io.to(`class:${classId}`).emit("timer:stopped", { classId, elapsedMs: s.elapsedMs });
  });

  socket.on("timer:pause", ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    if (!room.timer.getState().running) {
      return;
    }
    // Stop immediately to avoid duplicate processing on rapid double-click.
    room.timer.stop();
    void (async () => {
      const cls = await prisma.showClass.findUnique({ where: { id: classId } });
      const cfg = await getClassTimeAdditionConfig(classId);
      if (cls) {
        applyRefusalFault(room, cls);
        syncAccumulatorPenaltyIfNeeded(room, cls);
        if (room.status === "ELIMINATED") {
          emitBell(classId, "ELIMINATION");
        }
      }
      // If pause already caused elimination, do not add any legal time.
      if (room.status !== "ELIMINATED" && cfg.applyTimeAdditionToClock) {
        room.timer.addMs(cfg.tableCDisobedienceWithKnockdownSeconds * 1000);
        room.addedTimeSeconds += cfg.tableCDisobedienceWithKnockdownSeconds;
      }
      if (cls) {
        io.to(`class:${classId}`).emit("fault:added", {
          classId,
          type: "REFUSAL",
          faults: room.faults,
          status: room.status,
          knockdownCount: room.knockdownCount,
          refusalCount: room.refusalCount,
          addedTimeSeconds: room.addedTimeSeconds,
        });
        if ((cls as any).competitionType === "ACCUMULATOR") {
          io.to(`class:${classId}`).emit("accumulator:updated", {
            classId,
            points: room.accumulatorPoints,
            penalties: room.accumulatorPenalties,
            finalScore: room.accumulatorPoints - room.accumulatorPenalties,
            obstacles: room.accumulatorObstacles,
          });
        }
      }
      const s = room.timer.getState();
      io.to(`class:${classId}`).emit("timer:paused", {
        classId,
        elapsedMs: s.elapsedMs,
        addedTimeSeconds: room.addedTimeSeconds,
      });
    })().catch(() => {
      const s = room.timer.getState();
      io.to(`class:${classId}`).emit("timer:paused", {
        classId,
        elapsedMs: s.elapsedMs,
        addedTimeSeconds: room.addedTimeSeconds,
      });
    });
  });

  socket.on("timer:reset", ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    resetRun(room);
    io.to(`class:${classId}`).emit("timer:reset", { classId });
  });

  socket.on("timer:add_ms", ({ classId, ms }: { classId: string; ms: number }) => {
    const room = getOrCreateRoom(io, classId);
    const safeMs = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
    if (safeMs <= 0) return;
    const s = room.timer.addMs(safeMs);
    io.to(`class:${classId}`).emit("timer:tick", { classId, elapsedMs: s.elapsedMs });
  });

  socket.on("timer:set_ms", ({ classId, ms }: { classId: string; ms: number }) => {
    const room = getOrCreateRoom(io, classId);
    const safeMs = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
    const s = room.timer.setMs(safeMs);
    io.to(`class:${classId}`).emit("timer:tick", { classId, elapsedMs: s.elapsedMs });
    if (!s.running) {
      io.to(`class:${classId}`).emit("timer:stopped", { classId, elapsedMs: s.elapsedMs });
    }
  });

  socket.on(
    "live:manual_edit",
    async ({
      classId,
      elapsedMs,
      faults,
      refusalCount,
      knockdownCount,
      accumulatorPenalties,
      accumulatorPoints,
    }: {
      classId: string;
      elapsedMs?: number;
      faults?: number;
      refusalCount?: number;
      knockdownCount?: number;
      accumulatorPenalties?: number;
      accumulatorPoints?: number;
    }) => {
      const room = getOrCreateRoom(io, classId);
      const cls = await prisma.showClass.findUnique({ where: { id: classId } });
      if (!cls) return;

      const safeMs = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs!)) : room.timer.getState().elapsedMs;
      const safeFaults = Number.isFinite(faults) ? Math.max(0, Math.floor(faults!)) : room.faults;
      const safeRefusal = Number.isFinite(refusalCount) ? Math.max(0, Math.floor(refusalCount!)) : room.refusalCount;
      const safeKnockdown = Number.isFinite(knockdownCount) ? Math.max(0, Math.floor(knockdownCount!)) : room.knockdownCount;

      room.timer.setMs(safeMs);
      room.faults = safeFaults;
      room.refusalCount = safeRefusal;
      room.knockdownCount = safeKnockdown;
      room.status = shouldEliminateForRefusals(cls, room.refusalCount) ? "ELIMINATED" : "PENDING";

      if ((cls as any).competitionType === "ACCUMULATOR") {
        const safePenalties = Number.isFinite(accumulatorPenalties)
          ? Math.max(0, Math.floor(accumulatorPenalties!))
          : room.faults;
        const safePoints = Number.isFinite(accumulatorPoints)
          ? Math.max(0, Math.floor(accumulatorPoints!))
          : room.accumulatorPoints;
        room.accumulatorPenalties = safePenalties;
        room.accumulatorPoints = safePoints;
        room.faults = safePenalties;
      } else {
        room.accumulatorPenalties = room.faults;
      }

      stopTimerForTerminalStatus(room);
      const timerState = room.timer.getState();
      io.to(`class:${classId}`).emit("timer:tick", { classId, elapsedMs: timerState.elapsedMs });
      if (!timerState.running) {
        io.to(`class:${classId}`).emit("timer:stopped", { classId, elapsedMs: timerState.elapsedMs });
      }
      io.to(`class:${classId}`).emit("fault:added", {
        classId,
        type: "KNOCKDOWN",
        faults: room.faults,
        status: room.status,
        knockdownCount: room.knockdownCount,
        refusalCount: room.refusalCount,
        addedTimeSeconds: room.addedTimeSeconds,
      });
      if ((cls as any).competitionType === "ACCUMULATOR") {
        io.to(`class:${classId}`).emit("accumulator:updated", {
          classId,
          points: room.accumulatorPoints,
          penalties: room.accumulatorPenalties,
          finalScore: room.accumulatorPoints - room.accumulatorPenalties,
          obstacles: room.accumulatorObstacles,
        });
      }
    }
  );

  socket.on("accumulator:set_penalties", async ({ classId, penalties }: { classId: string; penalties: number }) => {
    const room = getOrCreateRoom(io, classId);
    const cls = await prisma.showClass.findUnique({ where: { id: classId } });
    if (!cls || (cls as any).competitionType !== "ACCUMULATOR") return;
    const safePenalties = Number.isFinite(penalties) ? Math.max(0, Math.floor(penalties)) : 0;
    room.accumulatorPenalties = safePenalties;
    room.faults = safePenalties;
    io.to(`class:${classId}`).emit("fault:added", {
      classId,
      type: "KNOCKDOWN",
      faults: room.faults,
      status: room.status,
      knockdownCount: room.knockdownCount,
      refusalCount: room.refusalCount,
      addedTimeSeconds: room.addedTimeSeconds,
    });
    io.to(`class:${classId}`).emit("accumulator:updated", {
      classId,
      points: room.accumulatorPoints,
      penalties: room.accumulatorPenalties,
      finalScore: room.accumulatorPoints - room.accumulatorPenalties,
      obstacles: room.accumulatorObstacles,
    });
  });

  socket.on("accumulator:set_points", async ({ classId, points }: { classId: string; points: number }) => {
    const room = getOrCreateRoom(io, classId);
    const cls = await prisma.showClass.findUnique({ where: { id: classId } });
    if (!cls || (cls as any).competitionType !== "ACCUMULATOR") return;
    const safePoints = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
    room.accumulatorPoints = safePoints;
    io.to(`class:${classId}`).emit("accumulator:updated", {
      classId,
      points: room.accumulatorPoints,
      penalties: room.accumulatorPenalties,
      finalScore: room.accumulatorPoints - room.accumulatorPenalties,
      obstacles: room.accumulatorObstacles,
    });
  });

  socket.on(
    "fault:add",
    async ({
      classId,
      type,
    }: {
      classId: string;
      type: "KNOCKDOWN" | "REFUSAL" | "ELIMINATION" | "RETIRED";
    }) => {
      const room = getOrCreateRoom(io, classId);
      const cls = await prisma.showClass.findUnique({ where: { id: classId } });
      if (!cls) return;

      if (type === "KNOCKDOWN") {
        room.knockdownCount += 1;
        if ((cls as any).competitionType !== "ACCUMULATOR") {
          room.faults += getKnockdownFaults(cls);
        }
      } else if (type === "REFUSAL") {
        applyRefusalFault(room, cls);
        if (room.status === "ELIMINATED") {
          emitBell(classId, "ELIMINATION");
        }
      } else if (type === "ELIMINATION") {
        room.status = "ELIMINATED";
        emitBell(classId, "ELIMINATION");
      } else if (type === "RETIRED") {
        room.status = "RETIRED";
      }
      syncAccumulatorPenaltyIfNeeded(room, cls);
      stopTimerForTerminalStatus(room);

      io.to(`class:${classId}`).emit("fault:added", {
        classId,
        type,
        faults: room.faults,
        status: room.status,
        knockdownCount: room.knockdownCount,
        refusalCount: room.refusalCount,
        addedTimeSeconds: room.addedTimeSeconds,
      });
      if ((cls as any).competitionType === "ACCUMULATOR") {
        io.to(`class:${classId}`).emit("accumulator:updated", {
          classId,
          points: room.accumulatorPoints,
          penalties: room.accumulatorPenalties,
          finalScore: room.accumulatorPoints - room.accumulatorPenalties,
          obstacles: room.accumulatorObstacles,
        });
      }
      if (room.status === "ELIMINATED" || room.status === "RETIRED") {
        const s = room.timer.getState();
        io.to(`class:${classId}`).emit("timer:stopped", { classId, elapsedMs: s.elapsedMs });
      }
    }
  );

  socket.on(
    "standard:obstacle",
    async ({
      classId,
      obstacleNumber,
      outcome,
      notes,
    }: {
      classId: string;
      obstacleNumber: number;
      outcome: "CLEAR" | "KNOCKDOWN";
      notes?: string;
    }) => {
      const room = getOrCreateRoom(io, classId);
      const cls = await prisma.showClass.findUnique({ where: { id: classId } });
      if (!cls || (cls as any).competitionType === "ACCUMULATOR") return;
      const obstacleCount = Math.max(1, (cls as any).maxObstacles ?? 12);
      if (obstacleNumber < 1 || obstacleNumber > obstacleCount) return;
      room.standardObstacles[obstacleNumber] = { outcome, notes };
      io.to(`class:${classId}`).emit("standard:updated", {
        classId,
        obstacles: room.standardObstacles,
      });
    }
  );

  socket.on(
    "standard:clear",
    async ({ classId, obstacleNumber }: { classId: string; obstacleNumber: number }) => {
      const room = getOrCreateRoom(io, classId);
      const cls = await prisma.showClass.findUnique({ where: { id: classId } });
      if (!cls || (cls as any).competitionType === "ACCUMULATOR") return;
      const obstacleCount = Math.max(1, (cls as any).maxObstacles ?? 12);
      if (obstacleNumber < 1 || obstacleNumber > obstacleCount) return;
      delete room.standardObstacles[obstacleNumber];
      io.to(`class:${classId}`).emit("standard:updated", {
        classId,
        obstacles: room.standardObstacles,
      });
    }
  );

  socket.on(
    "accumulator:obstacle",
    async ({
      classId,
      obstacleNumber,
      outcome,
      attempt,
      notes,
    }: {
      classId: string;
      obstacleNumber: number;
      outcome: "CLEAR" | "KNOCKDOWN";
      attempt?: "NORMAL" | "JOKER" | "JOKER1" | "JOKER2";
      notes?: string;
    }) => {
      const room = getOrCreateRoom(io, classId);
      const cls = await prisma.showClass.findUnique({ where: { id: classId } });
      if (!cls || (cls as any).competitionType !== "ACCUMULATOR") return;
      const obstacleCount = (cls as any).numberOfObstacles ?? 10;
      if (obstacleNumber < 1 || obstacleNumber > obstacleCount) return;
      const isLast = obstacleNumber === obstacleCount;
      const normalizedAttempt = isLast ? attempt ?? "NORMAL" : "NORMAL";
      room.accumulatorObstacles[obstacleNumber] = { outcome, attempt: normalizedAttempt, notes };
      room.accumulatorPoints = calculateAccumulatorPoints(
        obstacleCount,
        !!(cls as any).hasJoker,
        ((cls as any).jokerType ?? "NONE") as "NONE" | "SINGLE_JOKER" | "DOUBLE_JOKER",
        room.accumulatorObstacles
      );
      room.accumulatorPenalties = room.faults;
      io.to(`class:${classId}`).emit("accumulator:updated", {
        classId,
        points: room.accumulatorPoints,
        penalties: room.accumulatorPenalties,
        finalScore: room.accumulatorPoints - room.accumulatorPenalties,
        obstacles: room.accumulatorObstacles,
      });
    }
  );

  socket.on("accumulator:undo", async ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    const cls = await prisma.showClass.findUnique({ where: { id: classId } });
    if (!cls || (cls as any).competitionType !== "ACCUMULATOR") return;

    const touched = Object.keys(room.accumulatorObstacles)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => b - a);
    const last = touched[0];
    if (!last) return;
    delete room.accumulatorObstacles[last];

    const obstacleCount = (cls as any).numberOfObstacles ?? 10;
    room.accumulatorPoints = calculateAccumulatorPoints(
      obstacleCount,
      !!(cls as any).hasJoker,
      ((cls as any).jokerType ?? "NONE") as "NONE" | "SINGLE_JOKER" | "DOUBLE_JOKER",
      room.accumulatorObstacles
    );
    room.accumulatorPenalties = room.faults;

    io.to(`class:${classId}`).emit("accumulator:updated", {
      classId,
      points: room.accumulatorPoints,
      penalties: room.accumulatorPenalties,
      finalScore: room.accumulatorPoints - room.accumulatorPenalties,
      obstacles: room.accumulatorObstacles,
    });
  });

  socket.on(
    "accumulator:clear",
    async ({ classId, obstacleNumber }: { classId: string; obstacleNumber: number }) => {
      const room = getOrCreateRoom(io, classId);
      const cls = await prisma.showClass.findUnique({ where: { id: classId } });
      if (!cls || (cls as any).competitionType !== "ACCUMULATOR") return;
      const obstacleCount = (cls as any).numberOfObstacles ?? 10;
      if (obstacleNumber < 1 || obstacleNumber > obstacleCount) return;

      delete room.accumulatorObstacles[obstacleNumber];
      room.accumulatorPoints = calculateAccumulatorPoints(
        obstacleCount,
        !!(cls as any).hasJoker,
        ((cls as any).jokerType ?? "NONE") as "NONE" | "SINGLE_JOKER" | "DOUBLE_JOKER",
        room.accumulatorObstacles
      );
      room.accumulatorPenalties = room.faults;

      io.to(`class:${classId}`).emit("accumulator:updated", {
        classId,
        points: room.accumulatorPoints,
        penalties: room.accumulatorPenalties,
        finalScore: room.accumulatorPoints - room.accumulatorPenalties,
        obstacles: room.accumulatorObstacles,
      });
    }
  );

  socket.on("result:approve", async ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    await persistCurrentRunIfNeeded(classId, room);
  });
}

function findArmedClassId(): string | null {
  for (const [classId, room] of rooms.entries()) {
    if (room.sensorArmed) return classId;
  }
  return null;
}

function findRunningClassId(): string | null {
  for (const [classId, room] of rooms.entries()) {
    if (room.timer.getState().running) return classId;
  }
  return null;
}

export function handleExternalSensorEvent(input: ExternalSensorEventInput) {
  if (!ioRef || input.eventType !== "BEAM_BROKEN") return false;

  if (input.gateType === "START") {
    console.log("External START trigger received", input);
    const classId = findArmedClassId();
    if (!classId) {
      console.log("Device event ignored: no armed class");
      return false;
    }

    const room = rooms.get(classId);
    if (!room || !room.sensorArmed) {
      console.log("Device event ignored: no armed class");
      return false;
    }

    room.timer.start();
    room.sensorArmed = false;
    ioRef.to(`class:${classId}`).emit("timer:started", { classId });
    ioRef.to(`class:${classId}`).emit("sensor:triggered", {
      classId,
      type: "START",
      at: Date.now(),
      external: true,
      deviceId: input.deviceId,
      timestamp: input.timestamp,
    });
    console.log("Timer started from device", { classId, deviceId: input.deviceId });
    return true;
  }

  console.log("External FINISH trigger received", input);
  const classId = findRunningClassId() ?? findArmedClassId();
  if (!classId) {
    console.log("Device event ignored: no armed class");
    return false;
  }

  const room = rooms.get(classId);
  if (!room) {
    console.log("Device event ignored: no armed class");
    return false;
  }

  const timerState = room.timer.getState();
  if (!timerState.running) {
    console.log("Device event ignored: no armed class");
    return false;
  }

  const s = room.timer.stop();
  ioRef.to(`class:${classId}`).emit("timer:stopped", { classId, elapsedMs: s.elapsedMs });
  ioRef.to(`class:${classId}`).emit("sensor:triggered", {
    classId,
    type: "FINISH",
    at: Date.now(),
    external: true,
    deviceId: input.deviceId,
    timestamp: input.timestamp,
  });
  console.log("Timer stopped from device", { classId, deviceId: input.deviceId });
  return true;
}
