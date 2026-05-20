import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      // WebSocket first; polling helps when the dev proxy drops WS upgrades
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}
