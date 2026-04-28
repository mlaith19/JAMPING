import type { Server, Socket } from "socket.io";
import { prisma } from "../db.js";
import { CompetitionTimer } from "./timer.js";
import {
  getKnockdownFaults,
  getRefusalFaults,
  shouldEliminateForRefusals,
} from "../lib/scoring.js";

interface LiveRoomState {
  classId: string;
  currentEntryId: string | null;
  sensorArmed: boolean;
  faults: number;
  knockdownCount: number;
  refusalCount: number;
  status: "PENDING" | "OK" | "RETIRED" | "ELIMINATED";
  timer: CompetitionTimer;
}

const rooms = new Map<string, LiveRoomState>();

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
    sensorArmed: false,
    faults: 0,
    knockdownCount: 0,
    refusalCount: 0,
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
  room.status = "PENDING";
  room.sensorArmed = false;
  room.timer.reset();
}

export function registerLive(io: Server, socket: Socket) {
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
      resetRun(room);
    }
    io.to(`class:${classId}`).emit("class:ended", { classId });
  });

  socket.on("rider:next", async ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    const entries = await prisma.entry.findMany({
      where: { classId, status: { in: ["REGISTERED", "ACTIVE"] } },
      include: { horse: true, rider: true },
      orderBy: { orderIndex: "asc" },
    });
    if (room.currentEntryId) {
      await prisma.entry.update({
        where: { id: room.currentEntryId },
        data: { status: "DONE" },
      });
    }
    const next = entries.find((e) => e.id !== room.currentEntryId && e.status !== "DONE") ?? entries[0];
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
      });
    }
  );

  socket.on("result:approve", async ({ classId }: { classId: string }) => {
    const room = getOrCreateRoom(io, classId);
    if (!room.currentEntryId) return;
    const t = room.timer.getState();
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
