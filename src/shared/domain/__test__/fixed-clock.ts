import type { Clock } from '../clock';

/** Deterministic clock for tests: returns the same instant until advanced. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(start = new Date('2026-01-15T10:00:00.000Z')) {
    this.current = start;
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
