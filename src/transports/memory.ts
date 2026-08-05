/**
 * An in memory sink, mostly for tests & for surfacing recent logs in a
 * diagnostics endpoint.
 *
 * It is a fixed size ring buffer, not a growing array: a long lived process
 * attaching one of these must not accumulate every entry it ever logged. Note
 * that a retained entry also retains its `raw` value, so the buffer keeps the
 * logged objects alive until they roll out of it, keep `limit` modest when the
 * things being logged are large.
 */
import { SEVERITY, THRESHOLD } from "../levels";
import type { LevelThreshold, LogEntry, LogLevel, MemoryTransportOptions, Transport } from "../types";

const DEFAULT_LIMIT = 1000;

export class MemoryTransport implements Transport {
  readonly minLevel: LevelThreshold | undefined;
  /** Maximum retained entries. */
  readonly limit: number;

  private readonly buffer: (LogEntry | undefined)[];
  private next = 0;
  private count = 0;
  private readonly threshold: number;

  constructor(options: MemoryTransportOptions = {}) {
    // a zero or fractional limit would make the buffer meaningless
    this.limit = Math.max(1, Math.trunc(options.limit ?? DEFAULT_LIMIT));
    this.buffer = new Array<LogEntry | undefined>(this.limit);
    this.minLevel = options.minLevel;
    this.threshold = options.minLevel === undefined ? 0 : THRESHOLD[options.minLevel];
  }

  write(entry: LogEntry): void {
    if (SEVERITY[entry.level] < this.threshold) return;
    this.buffer[this.next] = entry;
    this.next = (this.next + 1) % this.limit;
    if (this.count < this.limit) this.count += 1;
  }

  /** How many entries are currently retained. */
  get size(): number {
    return this.count;
  }

  /** Retained entries, oldest first. A snapshot: later writes do not mutate it. */
  entries(): LogEntry[] {
    const out: LogEntry[] = [];
    const start = this.count < this.limit ? 0 : this.next;
    for (let i = 0; i < this.count; i += 1) {
      const entry = this.buffer[(start + i) % this.limit];
      if (entry !== undefined) out.push(entry);
    }
    return out;
  }

  /** Rendered messages, oldest first. Forces serialization of each entry. */
  messages(): string[] {
    return this.entries().map((entry) => entry.message);
  }

  /** Retained entries at one level, oldest first. */
  ofLevel(level: LogLevel): LogEntry[] {
    return this.entries().filter((entry) => entry.level === level);
  }

  /** Drop everything, releasing the entries & the values they hold. */
  clear(): void {
    this.buffer.fill(undefined);
    this.next = 0;
    this.count = 0;
  }
}

/** Convenience wrapper, for symmetry with the formatter factories. */
export function memoryTransport(options?: MemoryTransportOptions): MemoryTransport {
  return new MemoryTransport(options);
}
