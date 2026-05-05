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

function getOrCreateRoom(io: Server, classId: string): LiveRoomState {
  let r = rooms.get(classId);
  if (r) return r;
  const timer = new CompetitionTimer();
  timer.onTick((elapsedMs) => {
    io.to(`class:${classId}`).emit("timer:tick", { classId, elapsedMs });
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

  const ranked = rankRuns(mainRows, cls.scoringType);
  const okRows = ranked.filter((r) => r.status === "OK");
  if (okRows.length < 2) return [];

  const best = okRows[0];
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
  socket.on("class:join", async ({ classId }: { classId: string }) => {
    if (!classId) return;
    socket.join(`class:${classId}`);
    const room = getOrCreateRoom(io, classId);
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
    });
  });

  socket.on("class:leave", ({ classId }: { classId: string }) => {
    socket.leave(`class:${classId}`);
  });

  socket.on("class:start", async ({ classId }: { classId: string }) => {
    if (!classId) return;
    await prisma.showClass.update({ where: { id: classId }, data: { active: true } });
    const room = getOrCreateRoom(io, classId);
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
      room.currentEntryId = entry.id;
      resetRun(room);
      io.to(`class:${classId}`).emit("rider:current", { classId, entry });
    }
  );

  socket.on("rider:next", async ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);

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
    if (room.currentEntryId) {
      await prisma.entry.update({
        where: { id: room.currentEntryId },
        data: { status: "DONE" },
      });
    }
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
    void (async () => {
      const cfg = await getClassTimeAdditionConfig(classId);
      if (cfg.applyTimeAdditionToClock) {
        room.timer.addMs(cfg.tableCDisobedienceWithKnockdownSeconds * 1000);
        room.addedTimeSeconds += cfg.tableCDisobedienceWithKnockdownSeconds;
      }
      const s = room.timer.stop();
      io.to(`class:${classId}`).emit("timer:paused", {
        classId,
        elapsedMs: s.elapsedMs,
        addedTimeSeconds: room.addedTimeSeconds,
      });
      io.to(`class:${classId}`).emit("timer:stopped", { classId, elapsedMs: s.elapsedMs });
    })().catch(() => {
      const s = room.timer.stop();
      io.to(`class:${classId}`).emit("timer:paused", {
        classId,
        elapsedMs: s.elapsedMs,
        addedTimeSeconds: room.addedTimeSeconds,
      });
      io.to(`class:${classId}`).emit("timer:stopped", { classId, elapsedMs: s.elapsedMs });
    });
  });

  socket.on("timer:reset", ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    resetRun(room);
    io.to(`class:${classId}`).emit("timer:reset", { classId });
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
        room.faults += getKnockdownFaults(cls);
      } else if (type === "REFUSAL") {
        room.refusalCount += 1;
        room.faults += getRefusalFaults(cls, room.refusalCount);
        if (shouldEliminateForRefusals(cls, room.refusalCount)) {
          room.status = "ELIMINATED";
        }
      } else if (type === "ELIMINATION") {
        room.status = "ELIMINATED";
      } else if (type === "RETIRED") {
        room.status = "RETIRED";
      }

      io.to(`class:${classId}`).emit("fault:added", {
        classId,
        type,
        faults: room.faults,
        status: room.status,
        knockdownCount: room.knockdownCount,
        refusalCount: room.refusalCount,
        addedTimeSeconds: room.addedTimeSeconds,
      });
    }
  );

  socket.on("result:approve", async ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    if (!room.currentEntryId) return;
    const t = room.timer.getState();
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
        },
      },
    });
    await prisma.entry.update({
      where: { id: room.currentEntryId },
      data: { status: "DONE" },
    });
    io.to(`class:${classId}`).emit("result:approved", { classId, run });
    io.emit("results:updated", { classId });
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
