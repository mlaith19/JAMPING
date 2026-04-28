import type { Server, Socket } from "socket.io";
import { prisma } from "../db.js";

export function registerDevices(io: Server, socket: Socket) {
  socket.on("device:test_trigger", async ({ deviceId, classId }: { deviceId: string; classId?: string }) => {
    const dev = await prisma.device.update({
      where: { id: deviceId },
      data: { lastTriggerAt: new Date() },
    });
    io.emit("sensor:triggered", { deviceId: dev.id, type: dev.type, at: Date.now() });
    if (classId) {
      io.to(`class:${classId}`).emit("sensor:triggered", {
        classId,
        type: dev.type,
        deviceId: dev.id,
        at: Date.now(),
      });
    }
  });
}
