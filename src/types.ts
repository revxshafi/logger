/**
 * The package's public vocabulary.
 *
 * Every type a consumer can name lives here, & this file imports nothing.
 * Implementation modules depend on it rather than on each other's option
 * shapes, which keeps the module graph acyclic & makes the whole public
 * contract readable in one sitting.
 */

/* -------------------------------------------------------------------------- */
/* Levels                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The fixed set of emittable log levels, least to most severe. New levels
 * cannot be registered at runtime, use a context or a field for categories.
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Anything accepted where a *minimum* level is wanted: the six levels, plus
 * `"silent"` to switch logging off entirely.
 */
export type LevelThreshold = LogLevel | "silent";

/** Per level presentation: badge colour (`#RGB` / `#RRGGBB`) & label. */
export interface LevelConfig {
  color: string;
  display: string;
}

/* -------------------------------------------------------------------------- */
/* Presentation primitives                                                    */
/* -------------------------------------------------------------------------- */

/**
 * An IANA timezone name (`"Asia/Dhaka"`, `"UTC"`), or `"local"` for the host's
 * zone. The union is written this way so editors suggest `"local"` while still
 * accepting any zone string.
 */
export type TimezoneOption = "local" | (string & {});

/** How a timestamp is rendered on a log line. */
export type TimestampStyle =
  /** `14:05:32` */
  | "time"
  /** `04-08-2026 14:05:32` */
  | "datetime"
  /** `2026-08-04T14:05:32.123Z`, always UTC; ignores `timezone`. */
  | "iso"
  /** Omit the timestamp. */
  | "none";

/** How a multi line message body is laid out. */
export type MultilineMode =
  /** Print it as is, across as many lines as it takes. */
  | "keep"
  /** Collapse to one line, showing breaks as `\n`, so one entry is one line. */
  | "escape"
  /** Keep the breaks, but align continuation lines under the message column. */
  | "indent";

/** 0 = no colour, 1 = 16 colours, 2 = 256 colours, 3 = 24 bit truecolour. */
export type ColorLevel = 0 | 1 | 2 | 3;

/**
 * `undefined` auto detects from the target stream, `false` disables colour,
 * `true` assumes truecolour, & a number pins an exact depth.
 */
export type ColorOption = boolean | ColorLevel;

/** How much of a value to render, & how much of the result to keep. */
export interface SerializeOptions {
  /** Object depth handed to `util.inspect`. Default `4`. */
  depth?: number;
  /**
   * Hard cap on a rendered message's length; the excess is replaced with a note
   * saying how much was dropped. `0` disables the cap. Default `65536`.
   */
  maxLength?: number;
}

/* -------------------------------------------------------------------------- */
/* Entries                                                                    */
/* -------------------------------------------------------------------------- */

/** Structured key/value data attached to one entry, or bound to a logger. */
export type LogFields = Record<string, unknown>;

/**
 * A single log record, as handed to every transport.
 *
 * `message` is the rendered text & is always readable. `raw` carries the
 * value the caller actually passed, so a structured transport can encode the
 * object itself instead of re parsing a pretty printed string.
 *
 * On the records the logger creates, `message` is a **lazy, memoised getter**:
 * serialization only happens if something reads it, and only once. Two
 * consequences worth knowing:
 *
 * - `{ ...entry }` will not copy it (spread only takes own properties). Read
 *   `entry.message` directly, or call `entry.toJSON?.()`.
 * - `JSON.stringify(entry)` *does* include it, via `toJSON`.
 *
 * Fields are **not sanitized**: they may contain ANSI escapes or control
 * characters from untrusted input. Terminal bound transports must sanitize;
 * `ConsoleTransport` does.
 */
export interface LogEntry {
  readonly level: LogLevel;
  /** The rendered message text. */
  readonly message: string;
  /** The unserialized value the caller logged, when available. */
  readonly raw?: unknown;
  /** Origin tag, e.g. `"MongoDB"`. Absent when blank or unset. */
  readonly context?: string;
  /** Merged bound & per call structured data, after redaction. */
  readonly fields?: LogFields;
  readonly timestamp: Date;
  /** Present on logger created records; yields a plain, fully realized object. */
  toJSON?(): Record<string, unknown>;
}

/**
 * A message that is only built if it will actually be logged. Lets an
 * expensive dump cost nothing when the level is filtered out:
 * `logger.debug(() => inspect(hugeState))`.
 */
export type LazyMessage = () => unknown;

/**
 * The optional second argument of every log method: a context tag
 * (`logger.info(msg, "MongoDB")`) or structured fields
 * (`logger.info(msg, { userId: 7 })`). Both may be given, in that order.
 */
export type LogMeta = string | LogFields;

/* -------------------------------------------------------------------------- */
/* Formatters                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Turns an entry into the exact text a transport writes (no trailing newline).
 * Formatters own all presentation; transports own only I/O.
 */
export interface LogFormatter {
  (entry: LogEntry): string;
  /**
   * Implemented by formatters that render timestamps, so `Logger.setTimezone`
   * can reach them at runtime.
   */
  setTimezone?(timezone: TimezoneOption): void;
}

/** Shared by the human readable formatters. */
export interface BaseFormatOptions {
  /** Level styles to draw from. Defaults to a fresh copy of the built ins. */
  levels?: Map<LogLevel, LevelConfig>;
  /** IANA zone or `"local"`. Default `"local"`. */
  timezone?: TimezoneOption;
  /** Colour depth. Default: auto detect. */
  colors?: ColorOption;
  /** Stream consulted when auto detecting colour support. */
  stream?: { isTTY?: boolean | undefined };
  /** Layout for multi line bodies. Default `"keep"`. */
  multiline?: MultilineMode;
  /** Append `key=value` pairs for structured fields. Default `true`. */
  fields?: boolean;
}

/** Options for the default human readable format. */
export interface PrettyFormatOptions extends BaseFormatOptions {
  /** Timestamp style. Default `"time"`. */
  timestamp?: TimestampStyle;
  /** Colour for the message body. Default: the terminal's own colour. */
  messageColor?: string;
  /** Colour for the timestamp. Default: dimmed rather than coloured. */
  timeColor?: string;
}

/** Options for the compact `[ time ] [BADGE] message` format. */
export interface DevFormatOptions extends BaseFormatOptions {
  /** Timestamp style. Default `"datetime"`. */
  timestamp?: TimestampStyle;
  /** Colour for the message body. Default `"#2277FF"`. */
  messageColor?: string;
  /** Colour for the timestamp. Default `"#AAFF22"`. */
  timeColor?: string;
  /** Fixed badge width, padded & truncated to fit. Default `5`. */
  badgeWidth?: number;
}

/** Options for newline delimited JSON output. */
export interface JsonFormatOptions {
  /** `"iso"` writes an ISO-8601 string, `"epoch"` milliseconds. Default `"iso"`. */
  time?: "iso" | "epoch";
  /** Property name for the timestamp. Default `"time"`. */
  timeKey?: string;
  /** Property name for the message. Default `"msg"`. */
  messageKey?: string;
  /** Property name for the context. Default `"context"`. */
  contextKey?: string;
  /** Fixed properties merged into every line, e.g. `{ service: "api" }`. */
  base?: LogFields;
  /** Include a numeric `severity` alongside the level name. Default `false`. */
  severity?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Transports                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A sink for log entries. `write` is the only required member; the rest let a
 * transport opt into extra capability.
 */
export interface Transport {
  /** Consume one entry. Must not assume it is called for every entry. */
  write(entry: LogEntry): void;
  /**
   * Drop anything below this level before `write` is called. Lets one logger
   * feed a chatty file & a quiet console.
   */
  minLevel?: LevelThreshold;
  /** Flush buffered output. Awaited by `Logger.flush()`. */
  flush?(): void | Promise<void>;
  /** Release resources. Awaited by `Logger.close()`. */
  close?(): void | Promise<void>;
}

/**
 * Implemented by transports whose output includes timestamps.
 * `Logger.setTimezone` forwards the zone to every transport exposing this.
 */
export interface TimezoneAwareTransport extends Transport {
  setTimezone(timezone?: TimezoneOption): void;
}

/** The minimum a transport needs from a writable stream. */
export interface WritableLike {
  write(chunk: string): unknown;
  isTTY?: boolean | undefined;
}

/** Options shared by the stream backed transports. */
export interface StreamTransportOptions {
  /** Where to write. Required. */
  stream: WritableLike;
  /** How to render entries. Default: {@link JsonFormatOptions}-based JSON. */
  format?: LogFormatter;
  /** Drop anything below this level. */
  minLevel?: LevelThreshold;
  /** Line terminator. Default `"\n"`. */
  eol?: string;
}

/** Options for the built in console transport. */
export interface ConsoleTransportOptions {
  /**
   * How to render entries. A preset name or your own formatter. Default
   * `"pretty"`.
   */
  format?: "pretty" | "dev" | "json" | LogFormatter;
  /** Drop anything below this level. */
  minLevel?: LevelThreshold;
  /**
   * `"stream"` (default) writes to `process.stdout` / `process.stderr`
   * directly: faster, & immune to `console`'s `printf` handling, which
   * rewrites a `%%` in your message to `%`. Choose `"console"` when something
   * in the runtime intercepts `console` to collect logs, some serverless
   * platforms & test runners do.
   */
  output?: "stream" | "console";
  /** Override the stdout stream (tests, or a custom fd). */
  stdout?: WritableLike;
  /** Override the stderr stream. */
  stderr?: WritableLike;
  /** Levels routed to stderr. Default `["warn", "error", "fatal"]`. */
  stderrLevels?: readonly LogLevel[];

  /* Presentation, used when `format` is a preset name rather than a function. */
  /** Level styles; a `Logger` passes its shared map so restyling reaches here. */
  levels?: Map<LogLevel, LevelConfig>;
  /** IANA zone or `"local"`. */
  timezone?: TimezoneOption;
  /** Timestamp style; defaults to the chosen preset's own default. */
  timestamp?: TimestampStyle;
  /** Colour depth. Default: auto detect from the target stream. */
  colors?: ColorOption;
  /** Layout for multi line bodies. */
  multiline?: MultilineMode;
  /** Render structured fields as `key=value`. Default `true`. */
  fields?: boolean;
  /** Message body colour. */
  messageColor?: string;
  /** Timestamp colour. */
  timeColor?: string;
  /** Badge width for `format: "dev"`. Default `5`. */
  badgeWidth?: number;

  /* Deprecated 1.x spellings, still honoured. */
  /** @deprecated Use `format: "dev"`. */
  dev?: boolean;
  /** @deprecated Use `messageColor`. */
  devColor?: string;
  /** @deprecated Use `timestamp: "datetime"` / `"time"`. */
  showDate?: boolean;
}

/** Options for the in memory transport. */
export interface MemoryTransportOptions {
  /** Keep at most this many entries, discarding oldest first. Default `1000`. */
  limit?: number;
  /** Drop anything below this level. */
  minLevel?: LevelThreshold;
}

/* -------------------------------------------------------------------------- */
/* Logger                                                                     */
/* -------------------------------------------------------------------------- */

/** Called when a transport throws while writing, flushing, or closing. */
export type TransportErrorHandler = (error: unknown, transport: Transport) => void;

export interface LoggerOptions {
  /**
   * Least severe level that gets logged; anything below is dropped before it
   * reaches a transport. `"silent"` disables logging. Default `"trace"`.
   */
  minLevel?: LevelThreshold;
  /**
   * Per level style overrides, merged onto the defaults, name only the levels
   * and the fields, you want to change:
   * `{ info: { color: "#00FFAA", display: "INFO*" } }`
   */
  levels?: Partial<Record<LogLevel, Partial<LevelConfig>>>;
  /** Context tag for this logger, as if `scope()` had been called on it. */
  context?: string;
  /** Structured data attached to every entry from this logger. */
  fields?: LogFields;
  /**
   * Field names whose values are replaced with `"[redacted]"`, at any depth.
   * Matched case insensitively. Applies to `fields`, not to message text.
   */
  redact?: readonly string[];
  /** Bounds on message rendering. See {@link SerializeOptions}. */
  serialize?: SerializeOptions;
  /**
   * Notified when a transport throws. Without one, failures are reported once
   * through the diagnostics channel rather than silently swallowed.
   */
  onError?: TransportErrorHandler;
  /**
   * Use exactly these transports instead of the default console transport. A
   * console transport is added on top only if `console` is also given.
   */
  transports?: readonly Transport[];
  /**
   * Options for the built in console transport, or `false` for a logger that
   * writes nowhere until you add a transport.
   */
  console?: ConsoleTransportOptions | false;

  /* Deprecated 1.x spellings, forwarded to `console`. */
  /** @deprecated Use `console: { timezone }`. */
  timezone?: TimezoneOption;
  /** @deprecated Use `console: { format: "dev" }`. */
  dev?: boolean;
  /** @deprecated Use `console: { messageColor }`. */
  devColor?: string;
  /** @deprecated Use `console: { messageColor }`. */
  messageColor?: string;
  /** @deprecated Use `console: { timeColor }`. */
  timeColor?: string;
  /** @deprecated Use `console: { timestamp: "datetime" }`. */
  showDate?: boolean;
}

/** Options for a child logger. */
export interface ChildOptions {
  /**
   * Context tag. Composed onto the parent's with `:` unless
   * {@link ChildOptions.replaceContext} is set.
   */
  context?: string;
  /** Replace the parent's context rather than composing onto it. */
  replaceContext?: boolean;
  /** Fields merged onto the parent's; the child's win on conflict. */
  fields?: LogFields;
  /**
   * Pin this child (and its own children) to a level, independent of the
   * parent. Without it, the child follows the parent's level as it changes.
   */
  minLevel?: LevelThreshold;
}

/** @deprecated `createLogger` takes {@link LoggerOptions}; this is an alias. */
export type CreateLoggerOptions = LoggerOptions;
