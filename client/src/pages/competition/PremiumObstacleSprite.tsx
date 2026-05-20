import type { PremiumMapObstacleShape } from "./courseMapPremiumTypes";
import { OBSTACLE_SPRITE_SCALE, obstacleAssetHref, obstacleSpriteAspect } from "./courseAssetPaths";

const BASE_WIDTH = 236;

function MiniCourseFlags({ footY, w }: { footY: number; w: number }) {
  const fy = -footY + 6;
  const xl = -w * 0.38;
  const xr = w * 0.22;
  return (
    <g pointerEvents="none">
      <g transform={`translate(${xl}, ${fy})`}>
        <line x1={0} y1={0} x2={0} y2={22} stroke="#3f3f46" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M0,2 L14,6 L0,10 Z" fill="#b91c1c" stroke="rgba(0,0,0,0.12)" strokeWidth={0.4} />
        <path d="M0,10 L14,14 L0,18 Z" fill="#fafafa" stroke="rgba(0,0,0,0.1)" strokeWidth={0.35} />
      </g>
      <g transform={`translate(${xr}, ${fy})`}>
        <line x1={0} y1={0} x2={0} y2={22} stroke="#3f3f46" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M0,2 L14,6 L0,10 Z" fill="#fafafa" stroke="rgba(0,0,0,0.1)" strokeWidth={0.35} />
        <path d="M0,10 L14,14 L0,18 Z" fill="#b91c1c" stroke="rgba(0,0,0,0.12)" strokeWidth={0.4} />
      </g>
    </g>
  );
}

export function PremiumObstacleSprite({
  shape,
  number,
  isDouble,
}: {
  shape: PremiumMapObstacleShape;
  number: number;
  /** מכפיל קל לקומבינציה / מכשול רחב */
  isDouble?: boolean;
}) {
  const scale = OBSTACLE_SPRITE_SCALE[shape] * (isDouble ? 1.06 : 1);
  const w = BASE_WIDTH * scale;
  const aspect = obstacleSpriteAspect(shape);
  const h = w * aspect;
  const href = obstacleAssetHref(shape);
  const footY = h * 0.82;

  return (
    <g>
      <ellipse cx={0} cy={-footY + h * 0.02} rx={w * 0.38} ry={h * 0.07} fill="rgba(12,10,8,0.2)" filter="url(#spriteAssetDrop)" />
      <image
        href={href}
        x={-w / 2}
        y={-footY}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMax meet"
        filter="url(#spriteAssetDrop)"
      />
      <MiniCourseFlags footY={footY} w={w} />
      <text
        x={0}
        y={-footY + 34}
        textAnchor="middle"
        fill="#1c1917"
        fontSize={15 + scale * 2.2}
        fontWeight="800"
        fontFamily="Georgia, 'Times New Roman', serif"
        stroke="rgba(255,253,248,0.72)"
        strokeWidth="0.4"
        paintOrder="stroke fill"
      >
        {number}
      </text>
    </g>
  );
}
