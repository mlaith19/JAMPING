export interface PathPoint {
  xPct: number;
  yPct: number;
}

function interpolate(a: PathPoint, b: PathPoint, t: number): PathPoint {
  return { xPct: a.xPct + (b.xPct - a.xPct) * t, yPct: a.yPct + (b.yPct - a.yPct) * t };
}

export function buildCurvedCoursePath(points: PathPoint[], stepsPerSegment = 14): PathPoint[] {
  if (points.length < 2) return points;
  const out: PathPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const prev = points[i - 1] ?? a;
    const next = points[i + 2] ?? b;
    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      const p0 = interpolate(prev, a, t);
      const p1 = interpolate(a, b, t);
      const p2 = interpolate(b, next, t);
      const q0 = interpolate(p0, p1, t);
      const q1 = interpolate(p1, p2, t);
      out.push(interpolate(q0, q1, t));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** מסלול שידור — עקומות Bezier קוביות דרך נקודות מוקלטות (מרחב מסך) */
export function pointsToBroadcastSplineD(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
