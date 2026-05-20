export interface IsoProjectConfig {
  arenaWidthM: number;
  arenaLengthM: number;
  canvasWidth: number;
  canvasHeight: number;
  scale?: number;
  originX?: number;
  originY?: number;
}

export interface IsoPoint {
  x: number;
  y: number;
}

function pctToMeters(xPct: number, yPct: number, widthM: number, lengthM: number) {
  const x = ((xPct - 50) / 46) * (widthM / 2);
  const y = ((50 - yPct) / 42) * (lengthM / 2);
  return { x, y };
}

export function projectPctToIso(
  xPct: number,
  yPct: number,
  zM: number,
  cfg: IsoProjectConfig
): IsoPoint {
  const { x, y } = pctToMeters(xPct, yPct, cfg.arenaWidthM, cfg.arenaLengthM);
  const scale = cfg.scale ?? 8.5;
  const originX = cfg.originX ?? cfg.canvasWidth * 0.5;
  const originY = cfg.originY ?? cfg.canvasHeight * 0.62;
  const sx = (x - y) * 0.866 * scale + originX;
  const sy = (x + y) * 0.5 * scale - zM * scale + originY;
  return { x: sx, y: sy };
}

export function arenaIsoPolygon(cfg: IsoProjectConfig): IsoPoint[] {
  const corners = [
    { xPct: 4, yPct: 8 },
    { xPct: 96, yPct: 8 },
    { xPct: 96, yPct: 92 },
    { xPct: 4, yPct: 92 },
  ];
  return corners.map((c) => projectPctToIso(c.xPct, c.yPct, 0, cfg));
}

/** מסגרת חיצונית מורחבת (דשא / פרימטר אצטדיון) */
export function outerGroundIsoPolygon(cfg: IsoProjectConfig): IsoPoint[] {
  const corners = [
    { xPct: -5, yPct: 1 },
    { xPct: 105, yPct: 1 },
    { xPct: 105, yPct: 99 },
    { xPct: -5, yPct: 99 },
  ];
  return corners.map((c) => projectPctToIso(c.xPct, c.yPct, 0, cfg));
}

export function boundsOfPoints(points: IsoPoint[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}
