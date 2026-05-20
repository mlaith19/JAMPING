/** צורת מכשול לוויזואליזציה במפת פרימיום / איור */
export type PremiumMapObstacleShape =
  | "vertical"
  | "oxer"
  | "triple"
  | "wall"
  | "water"
  | "liverpool"
  | "combination"
  | "gate"
  | "plank";

export type PremiumObstacleKind =
  | "vertical"
  | "oxer"
  | "triple_bar"
  | "liverpool"
  | "wall"
  | "gate"
  | "combination"
  | "plank"
  | "water_jump";

export interface PremiumArenaModel {
  widthM: number;
  lengthM: number;
  sandTone: string;
}

export interface PremiumObstacleModel {
  id: string;
  number: number;
  name: string;
  kind: PremiumObstacleKind;
  xPct: number;
  yPct: number;
  rotationDeg: number;
  color: string;
  heightM?: number;
  widthM?: number;
  isCombination?: boolean;
  note?: string;
}

export interface PremiumCourseModel {
  arena: PremiumArenaModel;
  obstacles: PremiumObstacleModel[];
  start: { xPct: number; yPct: number };
  finish: { xPct: number; yPct: number };
}

export function toPremiumObstacleKind(templateId: string): PremiumObstacleKind {
  switch (templateId) {
    case "vertical":
      return "vertical";
    case "oxer":
      return "oxer";
    case "triple":
      return "triple_bar";
    case "wall":
      return "wall";
    case "gate":
      return "gate";
    case "plank":
      return "plank";
    case "water":
      return "water_jump";
    case "liverpool":
      return "liverpool";
    case "combination":
      return "combination";
    default:
      return "vertical";
  }
}
