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

const app = express();
const server = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, time: Date.now() }));

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
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

registerWs(io);

const PORT = Number(process.env.PORT ?? 4000);
server.listen(PORT, () => {
  console.log(`Show Jumping API listening on http://localhost:${PORT}`);
});
