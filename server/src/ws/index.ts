import type { Server } from "socket.io";
import { registerLive } from "./live.js";
import { registerDevices } from "./devices.js";

let ioRef: Server | null = null;

export function registerWs(io: Server) {
  ioRef = io;
  io.on("connection", (socket) => {
    console.log(`WS connected: ${socket.id}`);
    socket.emit("hello", { id: socket.id });

    registerLive(io, socket);
    registerDevices(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`WS disconnected: ${socket.id} (${reason})`);
    });
  });
}

export function broadcast(event: string, payload: unknown) {
  if (!ioRef) return;
  ioRef.emit(event, payload);
}
