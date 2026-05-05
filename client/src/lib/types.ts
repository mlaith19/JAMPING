export type CompetitionStatus = "DRAFT" | "ACTIVE" | "FINISHED";
export type ScoringType = "FAULTS_TIME" | "TIME_ONLY" | "JUMP_OFF";
export type EntryStatus = "REGISTERED" | "SCRATCHED" | "ACTIVE" | "DONE";
export type RunStatus = "PENDING" | "OK" | "RETIRED" | "ELIMINATED";
export type DeviceType = "START" | "FINISH";
export type HorseSex = "MARE" | "STALLION" | "GELDING";
export type TableType = "A" | "C";
export type RankingMode = "FAULTS_TIME" | "FAULTS_ONLY" | "TIME_ONLY";
export type SecondDisobedienceRule = "FEI" | "LOCAL";

export interface Competition {
  id: string;
  name: string;
  date: string;
  location: string;
  type: "SHOW_JUMPING";
  status: CompetitionStatus;
  language: string;
  currency: string;
  notes?: string | null;
  createdAt: string;
  _count?: { classes: number; entries: number };
}

export interface ShowClass {
  id: string;
  competitionId: string;
  name: string;
  courseHeight: number;
  category: string;
  tableType: TableType;
  courseLengthMeters?: number | null;
  horseSpeedMetersPerMinute?: number;
  maxObstacles?: number;
  tableCDisobedienceWithKnockdownSeconds?: number;
  applyTimeAdditionToClock?: boolean;
  allowedTime: number | null;
  timeLimit: number | null;
  rankingMode: RankingMode;
  hasJumpOff: boolean;
  jumpOffAgainstClock: boolean;
  secondDisobedienceRule: SecondDisobedienceRule;
  knockdownFaults: number;
  firstRefusalFaults: number;
  secondRefusalFaults: number;
  maxRefusalsBeforeElimination: number;
  timeFaultIntervalSeconds: number;
  timeFaultPoints: number;
  jumpOffTimeFaultIntervalSeconds: number;
  jumpOffTimeFaultPoints: number;
  timeLimitMultiplier: number;
  scoringType: ScoringType;
  knockdownPenalty: number;
  refusalPenalty: number;
  startListLocked: boolean;
  active: boolean;
  currentEntryId?: string | null;
  _count?: { entries: number };
}

export interface Horse {
  id: string;
  internalNumber: number;
  name: string;
  yearOfBirth?: number | null;
  sex?: HorseSex | null;
  color?: string | null;
  owner?: string | null;
  notes?: string | null;
}

export interface Rider {
  id: string;
  internalNumber: number;
  name: string;
  phone?: string | null;
  country?: string | null;
  club?: string | null;
  notes?: string | null;
}

export interface Entry {
  id: string;
  competitionId: string;
  classId: string;
  horseId: string;
  riderId: string;
  startNumber: number;
  orderIndex: number;
  status: EntryStatus;
  horse?: Horse;
  rider?: Rider;
  showClass?: ShowClass;
  competition?: Competition;
}

export interface Run {
  id: string;
  entryId: string;
  classId: string;
  faults: number;
  timeMs: number;
  status: RunStatus;
  approved: boolean;
  judgedAt?: string | null;
}

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  online: boolean;
  battery: number;
  lastTriggerAt?: string | null;
}

export interface ResultRow {
  entryId: string;
  startNumber: number;
  horseName: string;
  riderName: string;
  faults: number | null;
  timeMs: number | null;
  status: RunStatus | string;
  approved: boolean;
  place?: number | null;
}
