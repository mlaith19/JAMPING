import { Router } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../db.js";
import { calculateRunResult, rankRuns } from "../lib/scoring.js";

export const resultsRouter = Router();

function readDetails(details: unknown): {
  knockdownCount?: number;
  refusalCount?: number;
} {
  if (!details || typeof details !== "object") return {};
  const d = details as Record<string, unknown>;
  return {
    knockdownCount:
      typeof d.knockdownCount === "number" ? d.knockdownCount : undefined,
    refusalCount:
      typeof d.refusalCount === "number" ? d.refusalCount : undefined,
  };
}

async function getRankedResults(classId: string) {
  const cls = await prisma.showClass.findUnique({
    where: { id: classId },
    include: {
      entries: {
        include: {
          horse: true,
          rider: true,
          runs: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!cls) return null;

  const rows = cls.entries.map((e) => {
    const run = e.runs[0];
    if (!run) {
      return {
        entryId: e.id,
        startNumber: e.startNumber,
        horseName: e.horse.name,
        riderName: e.rider.name,
        faults: null,
        timeMs: null,
        status: "PENDING" as const,
        approved: false,
      };
    }

    const { knockdownCount, refusalCount } = readDetails(run.details);

    const calc = calculateRunResult({
      obstacleFaults: run.faults,
      knockdownCount,
      refusalCount,
      timeMs: run.timeMs,
      status: run.status,
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
      approved: run.approved ?? false,
    };
  });

  const ranked = rankRuns(rows, cls.scoringType);
  return { class: cls, rows: ranked };
}

resultsRouter.get("/:classId", async (req, res) => {
  const data = await getRankedResults(req.params.classId);
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

resultsRouter.get("/:classId/export.xlsx", async (req, res) => {
  const data = await getRankedResults(req.params.classId);
  if (!data) return res.status(404).json({ error: "Not found" });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Results");
  ws.columns = [
    { header: "Place", key: "place", width: 8 },
    { header: "No.", key: "startNumber", width: 8 },
    { header: "Rider", key: "riderName", width: 26 },
    { header: "Horse", key: "horseName", width: 22 },
    { header: "Faults", key: "faults", width: 10 },
    { header: "Time", key: "time", width: 12 },
    { header: "Status", key: "status", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const row of data.rows) {
    ws.addRow({
      place: row.place ?? "",
      startNumber: row.startNumber,
      riderName: row.riderName,
      horseName: row.horseName,
      faults: row.faults ?? "",
      time: row.timeMs != null ? (row.timeMs / 1000).toFixed(2) : "",
      status: row.status,
    });
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="results-${data.class.name.replace(/[^\w-]+/g, "_")}.xlsx"`
  );
  await wb.xlsx.write(res);
  res.end();
});

resultsRouter.get("/:classId/export.pdf", async (req, res) => {
  const data = await getRankedResults(req.params.classId);
  if (!data) return res.status(404).json({ error: "Not found" });

  const doc = new PDFDocument({ margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="results-${data.class.name.replace(/[^\w-]+/g, "_")}.pdf"`
  );
  doc.pipe(res);

  doc.fontSize(20).text(data.class.name, { align: "center" });
  doc
    .fontSize(11)
    .text(
      `Course: ${data.class.courseHeight}cm  |  Time: ${data.class.allowedTime ?? "—"}s  |  Scoring: ${data.class.scoringType}`,
      { align: "center" }
    );
  doc.moveDown();

  const headers = ["Place", "No.", "Rider", "Horse", "Faults", "Time", "Status"];
  const widths = [50, 40, 130, 110, 50, 60, 70];
  let x = 40;
  doc.font("Helvetica-Bold").fontSize(11);
  headers.forEach((h, i) => {
    doc.text(h, x, doc.y, { width: widths[i], continued: i < headers.length - 1 });
    x += widths[i];
  });
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(10);

  for (const r of data.rows) {
    x = 40;
    const cells = [
      r.place ? `${r.place}` : "-",
      `${r.startNumber}`,
      r.riderName,
      r.horseName,
      r.faults != null ? `${r.faults}` : "-",
      r.timeMs != null ? `${(r.timeMs / 1000).toFixed(2)}` : "-",
      r.status,
    ];
    cells.forEach((c, i) => {
      doc.text(c, x, doc.y, { width: widths[i], continued: i < cells.length - 1 });
      x += widths[i];
    });
    doc.moveDown(0.3);
  }

  doc.end();
});

resultsRouter.post("/:classId/publish", async (req, res) => {
  const cls = await prisma.showClass.update({
    where: { id: req.params.classId },
    data: { active: false },
  });
  res.json(cls);
});
