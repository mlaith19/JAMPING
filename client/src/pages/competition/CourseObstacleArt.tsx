/** סכימת מכשול לתצוגת עריכה (מבט תוכנית) — SVG קומפקטי או מלא */

export type CourseObstacleShape =
  | "vertical"
  | "oxer"
  | "triple"
  | "wall"
  | "water"
  | "liverpool"
  | "combination"
  | "gate"
  | "plank";

const DEFAULT_H_REF = 1.3;

export function CourseObstacleArt({
  shape,
  color,
  compact,
  obstacleHeightM,
}: {
  shape: CourseObstacleShape;
  color: string;
  compact?: boolean;
  obstacleHeightM?: number;
}) {
  const w = compact ? 44 : 172;
  const h = compact ? 44 : 124;
  const heightScale = Math.max(0.55, Math.min(1.45, (obstacleHeightM ?? DEFAULT_H_REF) / 1.3));
  const stroke = compact ? Math.max(2.2, Math.min(3.6, heightScale * 2.6)) : 3;
  const rail = compact ? Math.max(2.6, Math.min(4.2, heightScale * 3.1)) : 4;
  const pole = (cx: number, y1: number, y2: number) => (
    <line x1={cx} y1={y1} x2={cx} y2={y2} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
  );
  const bar = (x1: number, x2: number, y: number, thick = rail) => (
    <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={thick} strokeLinecap="round" />
  );

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 72 88"
      preserveAspectRatio={compact ? "xMidYMid meet" : "none"}
      className="overflow-visible"
      style={{ transform: `scaleY(${heightScale})`, transformOrigin: "50% 100%" }}
      aria-hidden
    >
      {shape === "vertical" && (
        <>
          {pole(22, 28, 78)}
          {pole(50, 28, 78)}
          {bar(22, 50, 32)}
          <ellipse cx={36} cy={82} rx={22} ry={4} fill="rgba(255,255,255,0.06)" />
        </>
      )}
      {shape === "oxer" && (
        <>
          {pole(18, 34, 76)}
          {pole(54, 34, 76)}
          {bar(18, 54, 36, 3.5)}
          {bar(20, 52, 44, 3.5)}
          <ellipse cx={36} cy={82} rx={24} ry={4} fill="rgba(255,255,255,0.06)" />
        </>
      )}
      {shape === "triple" && (
        <>
          {pole(16, 40, 78)}
          {pole(56, 40, 78)}
          {bar(16, 34, 36, 3)}
          {bar(18, 38, 46, 3)}
          {bar(20, 42, 56, 3)}
          <ellipse cx={36} cy={82} rx={24} ry={4} fill="rgba(255,255,255,0.06)" />
        </>
      )}
      {shape === "wall" && (
        <>
          <rect x={14} y={34} width={44} height={38} rx={3} fill={`${color}55`} stroke={color} strokeWidth={2} />
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={18 + i * 9} y1={38} x2={18 + i * 9} y2={68} stroke={`${color}99`} strokeWidth={1} opacity={0.5} />
          ))}
          <ellipse cx={36} cy={78} rx={22} ry={4} fill="rgba(255,255,255,0.06)" />
        </>
      )}
      {shape === "gate" && (
        <>
          {pole(20, 30, 78)}
          {pole(52, 30, 78)}
          <rect x={17} y={38} width={38} height={26} rx={3} fill={`${color}55`} stroke={color} strokeWidth={2} />
          <line x1={17} y1={46} x2={55} y2={46} stroke={`${color}99`} strokeWidth={1.4} />
          <line x1={17} y1={54} x2={55} y2={54} stroke={`${color}99`} strokeWidth={1.4} />
          <ellipse cx={36} cy={82} rx={22} ry={4} fill="rgba(255,255,255,0.06)" />
        </>
      )}
      {shape === "plank" && (
        <>
          {pole(20, 30, 76)}
          {pole(52, 30, 76)}
          <rect x={16} y={38} width={40} height={9} rx={3} fill={`${color}cc`} stroke="#fff" strokeWidth={1} />
          <rect x={16} y={49} width={40} height={9} rx={3} fill={`${color}aa`} stroke="#fff" strokeWidth={1} />
          <ellipse cx={36} cy={82} rx={22} ry={4} fill="rgba(255,255,255,0.06)" />
        </>
      )}
      {shape === "water" && (
        <>
          <ellipse cx={36} cy={58} rx={compact ? 20 : 28} ry={compact ? 10 : 14} fill={`${color}44`} stroke={color} strokeWidth={compact ? 2.6 : 2} />
          <ellipse cx={36} cy={56} rx={compact ? 16 : 24} ry={compact ? 7 : 10} fill={`${color}77`} opacity={0.6} />
          <path d="M12 58 Q24 52 36 58 T60 58" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.2} />
        </>
      )}
      {shape === "liverpool" && (
        <>
          {pole(20, 30, 72)}
          {pole(52, 30, 72)}
          {bar(20, 52, 34)}
          <rect x={14} y={58} width={44} height={14} rx={3} fill={`${color}55`} stroke={color} strokeWidth={1.5} />
          <rect x={16} y={60} width={40} height={8} rx={2} fill={`${color}88`} opacity={0.5} />
        </>
      )}
      {shape === "combination" && (
        <>
          {pole(20, 32, 74)}
          {pole(36, 32, 74)}
          {bar(20, 36, 36)}
          {pole(48, 38, 76)}
          {pole(62, 38, 76)}
          {bar(48, 62, 44)}
          <ellipse cx={41} cy={82} rx={26} ry={4} fill="rgba(255,255,255,0.06)" />
        </>
      )}
    </svg>
  );
}
