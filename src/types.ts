/**
 * The fixed, non-extensible set of log levels, ordered from least to most
 * severe. Callers cannot register new levels at runtime; use the context tag
 * to express categories or components instead.
 */
export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

/** Per-level presentation: badge color (chalk hex) and display text. */
export interface LevelConfig {
  color: string;
  display: string;
}

/** `"local"` uses the host timezone; anything else is treated as an IANA zone. */
export type TimezoneOption = string;

export interface LoggerOptions {
  /** IANA zone e.g. "Asia/Dhaka", or "local" (default). */
  timezone?: TimezoneOption;
}

/** A single, fully-resolved log record handed to every transport. */
export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  timestamp: Date;
}

/**
 * A sink for log entries. Only `ConsoleTransport` ships today; the interface
 * exists so File / Discord / DB transports can be bolted on later without
 * touching the core.
 */
export interface Transport {
  write(entry: LogEntry): void;
}
