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
  /**
   * Least severe level that gets logged; anything below is dropped.
   * Defaults to "trace" (log everything).
   */
  minLevel?: LogLevel;
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

/**
 * Optionally implemented by transports whose output includes timestamps.
 * `Logger.setTimezone` forwards the zone to every transport exposing this.
 */
export interface TimezoneAwareTransport extends Transport {
  setTimezone(timezone?: TimezoneOption): void;
}
