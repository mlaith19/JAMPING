import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server as IOServer } from "socket.io";

import { competitionsRouter } from "./rest/competitions.js";
import { classesRouter } from "./rest/classes.js";
import { horsesRouter } from "./rest/horses.js";
import { ridersRouter } from "./rest/riders.js";
import { entriesRouter } from "./rest/entries.js";
import { startListRouter } from "./rest/startlist.js";
import { resultsRouter } from "./rest/results.js";
import { devicesRouter } from "./rest/devices.js";

import { registerWs } from "./ws/index.js";
import { prisma } from "./db.js";

const app = express();
const server = http.createServer(app);

const isProd = process.env.NODE_ENV === "production";
/** Comma-separated in .env, e.g. http://localhost:5173,http://localhost:5174 */
const explicitOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const localhostOrigin =
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/)?$/i;

const corsOriginResolver = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => {
  if (!origin) {
    callback(null, true);
    return;
  }
  if (explicitOrigins.includes(origin)) {
    callback(null, true);
    return;
  }
  if (!isProd && localhostOrigin.test(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`CORS blocked origin: ${origin}`));
};

app.use(cors({ origin: corsOriginResolver, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, time: Date.now() }));
app.get("/api/health/database", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, database: "up", time: Date.now() });
  } catch (err: any) {
    res.status(503).json({ ok: false, database: "down", error: err?.message ?? "DB unavailable" });
  }
});

app.use("/api/competitions", competitionsRouter);
app.use("/api/classes", classesRouter);
app.use("/api/horses", horsesRouter);
app.use("/api/riders", ridersRouter);
app.use("/api/entries", entriesRouter);
app.use("/api/startlist", startListRouter);
app.use("/api/results", resultsRouter);
app.use("/api/devices", devicesRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("API error:", err);
  res.status(err.status ?? 500).json({ error: err.message ?? "Internal error" });
});

const io = new IOServer(server, {
  cors: { origin: corsOriginResolver, methods: ["GET", "POST"], credentials: true },
});

registerWs(io);

const PORT = Number(process.env.PORT ?? 4000);

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[server] Port ${PORT} is already in use. Close the other Node process using this port or set PORT in .env.`,
    );
  } else {
    console.error("[server] HTTP error:", err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Show Jumping API listening on http://localhost:${PORT}`);
});
