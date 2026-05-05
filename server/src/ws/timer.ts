type TickHandler = (elapsedMs: number) => void;

export interface TimerState {
  running: boolean;
  startedAt: number | null;
  stoppedAt: number | null;
  elapsedMs: number;
}

export class CompetitionTimer {
  private state: TimerState = {
    running: false,
    startedAt: null,
    stoppedAt: null,
    elapsedMs: 0,
  };
  private interval: NodeJS.Timeout | null = null;
  private tickHandler: TickHandler | null = null;

  onTick(handler: TickHandler) {
    this.tickHandler = handler;
  }

  start(at?: number) {
    if (this.state.running) return this.state;
    const now = at ?? Date.now();
    const resumedElapsed = this.state.elapsedMs > 0 ? this.state.elapsedMs : 0;
    this.state = {
      running: true,
      startedAt: now - resumedElapsed,
      stoppedAt: null,
      elapsedMs: resumedElapsed,
    };
    this.interval = setInterval(() => {
      if (!this.state.running || this.state.startedAt == null) return;
      this.state.elapsedMs = Date.now() - this.state.startedAt;
      this.tickHandler?.(this.state.elapsedMs);
    }, 100);
    return this.state;
  }

  stop(at?: number): TimerState {
    if (!this.state.running || this.state.startedAt == null) return this.state;
    const now = at ?? Date.now();
    this.state.running = false;
    this.state.stoppedAt = now;
    this.state.elapsedMs = now - this.state.startedAt;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    return this.state;
  }

  addMs(ms: number): TimerState {
    if (!Number.isFinite(ms) || ms <= 0) return this.state;
    if (this.state.running && this.state.startedAt != null) {
      this.state.startedAt -= ms;
      this.state.elapsedMs += ms;
    } else {
      this.state.elapsedMs += ms;
    }
    this.tickHandler?.(this.state.elapsedMs);
    return this.state;
  }

  reset() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.state = { running: false, startedAt: null, stoppedAt: null, elapsedMs: 0 };
    return this.state;
  }

  getState(): TimerState {
    return { ...this.state };
  }
}
