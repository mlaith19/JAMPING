export type ScoringType = "FAULTS_TIME" | "TIME_ONLY" | "JUMP_OFF";
export type RunStatus = "PENDING" | "OK" | "RETIRED" | "ELIMINATED";

export interface ScoringRules {
  knockdownFaults: number;
  firstRefusalFaults: number;
  secondRefusalFaults: number;
  maxRefusalsBeforeElimination: number;
  timeFaultIntervalSeconds: number;
  timeFaultPoints: number;
  jumpOffTimeFaultIntervalSeconds: number;
  jumpOffTimeFaultPoints: number;
  timeLimitMultiplier: number;
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

export function getKnockdownFaults(rules: ScoringRules): number {
  return rules.knockdownFaults;
}

export function getRefusalFaults(rules: ScoringRules, refusalNumber: number): number {
  if (refusalNumber <= 1) return rules.firstRefusalFaults;
  if (refusalNumber === 2) return rules.secondRefusalFaults;
  return 0;
}

export function shouldEliminateForRefusals(
  rules: ScoringRules,
  refusalCount: number
): boolean {
  return refusalCount > rules.maxRefusalsBeforeElimination;
}

export function getTimeFaults(
  timeMs: number,
  allowedTimeSeconds: number | null | undefined,
  rules: ScoringRules
): number {
  if (allowedTimeSeconds == null || allowedTimeSeconds <= 0) return 0;
  if (rules.timeFaultIntervalSeconds <= 0) return 0;
  const overSec = timeMs / 1000 - allowedTimeSeconds;
  if (overSec <= 0) return 0;
  return Math.ceil(overSec / rules.timeFaultIntervalSeconds) * rules.timeFaultPoints;
}

export function getJumpOffTimeFaults(
  timeMs: number,
  allowedTimeSeconds: number | null | undefined,
  rules: ScoringRules
): number {
  if (allowedTimeSeconds == null || allowedTimeSeconds <= 0) return 0;
  if (rules.jumpOffTimeFaultIntervalSeconds <= 0) return 0;
  const overSec = timeMs / 1000 - allowedTimeSeconds;
  if (overSec <= 0) return 0;
  return (
    Math.ceil(overSec / rules.jumpOffTimeFaultIntervalSeconds) *
    rules.jumpOffTimeFaultPoints
  );
}

export function getTimeLimitSeconds(
  allowedTimeSeconds: number | null | undefined,
  rules: ScoringRules
): number | null {
  if (allowedTimeSeconds == null || allowedTimeSeconds <= 0) return null;
  return allowedTimeSeconds * rules.timeLimitMultiplier;
}

export interface RunCalculationInput {
  obstacleFaults?: number;
  knockdownCount?: number;
  refusalCount?: number;
  timeMs: number;
  status: RunStatus | string;
  allowedTimeSeconds: number | null | undefined;
  rules: ScoringRules;
  isJumpOff?: boolean;
}

export interface RunCalculation {
  obstacleFaults: number;
  timeFaults: number;
  faults: number;
  timeMs: number;
  status: RunStatus;
  timeLimitSeconds: number | null;
  exceededTimeLimit: boolean;
  eliminatedForRefusals: boolean;
}

export function calculateRunResult(input: RunCalculationInput): RunCalculation {
  const timeLimitSeconds = getTimeLimitSeconds(input.allowedTimeSeconds, input.rules);

  if (input.status === "RETIRED") {
    const obstacleFaults = computeObstacleFaults(input);
    return {
      obstacleFaults,
      timeFaults: 0,
      faults: obstacleFaults,
      timeMs: input.timeMs,
      status: "RETIRED",
      timeLimitSeconds,
      exceededTimeLimit: false,
      eliminatedForRefusals: false,
    };
  }

  const obstacleFaults = computeObstacleFaults(input);

  const eliminatedForRefusals =
    input.refusalCount != null &&
    shouldEliminateForRefusals(input.rules, input.refusalCount);

  const timeFaults = input.isJumpOff
    ? getJumpOffTimeFaults(input.timeMs, input.allowedTimeSeconds, input.rules)
    : getTimeFaults(input.timeMs, input.allowedTimeSeconds, input.rules);

  const exceededTimeLimit =
    timeLimitSeconds != null && input.timeMs / 1000 > timeLimitSeconds;

  let status: RunStatus;
  if (input.status === "ELIMINATED" || eliminatedForRefusals || exceededTimeLimit) {
    status = "ELIMINATED";
  } else if (input.status === "PENDING") {
    status = "PENDING";
  } else {
    status = "OK";
  }

  return {
    obstacleFaults,
    timeFaults,
    faults: obstacleFaults + timeFaults,
    timeMs: input.timeMs,
    status,
    timeLimitSeconds,
    exceededTimeLimit,
    eliminatedForRefusals,
  };
}

function computeObstacleFaults(input: RunCalculationInput): number {
  if (input.knockdownCount != null || input.refusalCount != null) {
    const knockdowns = input.knockdownCount ?? 0;
    const refusals = input.refusalCount ?? 0;
    let f = knockdowns * getKnockdownFaults(input.rules);
    for (let i = 1; i <= refusals; i++) {
      f += getRefusalFaults(input.rules, i);
    }
    return f;
  }
  return input.obstacleFaults ?? 0;
}

export function rankRuns(rows: ResultRow[], scoring: ScoringType): ResultRow[] {
  const scored = rows.map((r) => ({ ...r }));
  const valid = scored.filter(
    (r) => r.status === "OK" && r.faults != null && r.timeMs != null
  );
  const invalid = scored.filter(
    (r) => !(r.status === "OK" && r.faults != null && r.timeMs != null)
  );

  let sorted: ResultRow[];
  if (scoring === "TIME_ONLY") {
    sorted = [...valid].sort((a, b) => a.timeMs! - b.timeMs!);
  } else {
    sorted = [...valid].sort((a, b) => {
      if ((a.faults ?? 0) !== (b.faults ?? 0)) return (a.faults ?? 0) - (b.faults ?? 0);
      return (a.timeMs ?? 0) - (b.timeMs ?? 0);
    });
  }

  sorted.forEach((r, i) => (r.place = i + 1));
  const tail = invalid.map((r) => ({ ...r, place: null }));
  return [...sorted, ...tail];
}
