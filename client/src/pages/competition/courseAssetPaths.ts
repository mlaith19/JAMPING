import type { PremiumMapObstacleShape } from "./courseMapPremiumTypes";

export const COURSE_ASSETS = "/course-assets";

export const ARENA_ASSETS = {
  grassField: `${COURSE_ASSETS}/arena/grass-field.svg`,
  sandSurface: `${COURSE_ASSETS}/arena/sand-surface.svg`,
  bushCluster: `${COURSE_ASSETS}/arena/bush-cluster.svg`,
} as const;

export const MARKER_ASSETS = {
  start: `${COURSE_ASSETS}/markers/start.svg`,
  finish: `${COURSE_ASSETS}/markers/finish.svg`,
} as const;

const OBSTACLE_FILE: Record<PremiumMapObstacleShape, string> = {
  vertical: "vertical",
  oxer: "oxer",
  triple: "triple",
  liverpool: "liverpool",
  wall: "wall",
  gate: "gate",
  combination: "combination",
  water: "water",
  plank: "plank",
};

/** נכס יחיד לכל סוג — זווית איזומטרית קבועה (ללא וריאנטים). */
export function obstacleAssetHref(shape: PremiumMapObstacleShape): string {
  return `${COURSE_ASSETS}/obstacles/${OBSTACLE_FILE[shape]}.svg`;
}

/** קנה מידה יחסי לפי סוג — התאמה לאמנות; החלף לפי הנכסים שלך */
export const OBSTACLE_SPRITE_SCALE: Record<PremiumMapObstacleShape, number> = {
  vertical: 1.05,
  oxer: 1.12,
  triple: 1.16,
  liverpool: 1.12,
  wall: 0.98,
  gate: 1.02,
  combination: 1.22,
  water: 1.28,
  plank: 1.08,
};

/** יחס גובה/רוחב לפי viewBox ברירת המחדל (400×320) */
export const OBSTACLE_SPRITE_ASPECT = 320 / 400;

/** יוצא מן הכלל — נכס רחב יותר */
export function obstacleSpriteAspect(shape: PremiumMapObstacleShape): number {
  if (shape === "combination") return 320 / 480;
  return OBSTACLE_SPRITE_ASPECT;
}
