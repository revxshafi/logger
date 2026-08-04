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
  /** See {@link DefaultLoggerOptions} — `default: true` excludes overrides. */
  default?: never;
  /** IANA zone e.g. "Asia/Dhaka", or "local" (default). */
  timezone?: TimezoneOption;
  /**
   * Least severe level that gets logged; anything below is dropped.
   * Defaults to "trace" (log everything).
   */
  minLevel?: LogLevel;
  /**
   * Per-level style overrides, merged onto the defaults — override only the
   * levels (and only the fields) you care about:
   * `{ info: { color: "#00FFAA", display: "INFO*" } }`
   */
  levels?: Partial<Record<LogLevel, Partial<LevelConfig>>>;
  /**
   * Switch console output to a minimal dev layout:
   * `[ DD-MM-YYYY HH:MM:SS ] [PREFIX] message`, where the timestamp is green,
   * the prefix is a background-colored badge holding the context (or the level
   * when there's no context), and the message body is colored. Meant as a
   * personal preset; level styles and dimming don't apply in this mode.
   */
  dev?: boolean;
  /** Chalk hex for the message body in dev mode. Defaults to `"#2277FF"`. */
  devColor?: string;
  /** Chalk hex for the dev-mode timestamp. Defaults to `"#AAFF22"`. */
  timeColor?: string;
  /**
   * Prefix timestamps with the date: `DD-MM-YYYY HH:MM:SS` instead of
   * `HH:MM:SS`. Defaults to `true` in dev mode and `false` otherwise.
   */
  showDate?: boolean;
  /**
   * Chalk hex for the message body in the normal format, which otherwise
   * keeps the terminal's default color. In dev mode it acts as a fallback
   * when `devColor` isn't set.
   */
  messageColor?: string;
}

/**
 * Explicit opt-in to the default configuration:
 * `createLogger({ default: true })` ≡ `createLogger()`. The `never` fields
 * make it a compile-time error to combine `default: true` with overrides,
 * so a config can't claim to be "default" while changing things.
 */
export interface DefaultLoggerOptions {
  default: true;
  timezone?: never;
  minLevel?: never;
  levels?: never;
  dev?: never;
  devColor?: never;
  timeColor?: never;
  showDate?: never;
  messageColor?: never;
}

/** What `createLogger` accepts: nothing, a config object, or `{ default: true }`. */
export type CreateLoggerOptions = LoggerOptions | DefaultLoggerOptions;

/**
 * A single, fully-resolved log record handed to every transport.
 *
 * Fields are **not sanitized**: `message` and `context` may contain ANSI
 * escapes or control characters from untrusted input. `ConsoleTransport`
 * sanitizes at write time; custom transports must decide for their own sink.
 */
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
