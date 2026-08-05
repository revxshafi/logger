/**
 * The logger itself: level filtering, context & field inheritance, and fan out
 * to transports.
 *
 * Everything about *presentation* has been moved out, this file no longer
 * knows what a log line looks like, which colour a level is drawn in, or what a
 * timestamp format is. It decides what gets logged & what data an entry
 * carries; formatters decide how it reads; transports decide where it goes.
 *
 * Two invariants hold throughout:
 *
 * - **A log call never throws.** Configuration errors are loud, at construction
 *   time, where a developer sees them. Runtime failures (a transport that
 *   throws, a lazy message that throws, a closed stream) are reported through
 *   the diagnostics channel & never propagate into the caller's code path.
 * - **Work is skipped, not just discarded.** A filtered out call allocates
 *   nothing; a call that survives filtering still doesn't render its message
 *   until a transport reads it.
 */
import { checkColor } from "./internal/ansi";
import { report } from "./internal/diagnostics";
import { createRedactor } from "./internal/redact";
import {
  createDefaultLevels,
  isLevelThreshold,
  isLogLevel,
  levelNames,
  LOG_LEVELS,
  SEVERITY,
  THRESHOLD,
} from "./levels";
import { LogRecord } from "./record";
import { ConsoleTransport } from "./transports/console";
import type {
  ChildOptions,
  ConsoleTransportOptions,
  CreateLoggerOptions,
  LevelConfig,
  LevelThreshold,
  LogFields,
  LoggerOptions,
  LogLevel,
  LogMeta,
  SerializeOptions,
  TimezoneAwareTransport,
  TimezoneOption,
  Transport,
  TransportErrorHandler,
} from "./types";

/**
 * State shared by a root logger & every logger descended from it. Children
 * are thin views over one core, so `addTransport` / `setLevelStyle` / `setLevel`
 * from anywhere in the family reach the whole family.
 */
interface LoggerCore {
  levels: Map<LogLevel, LevelConfig>;
  transports: Transport[];
  /** Numeric form of {@link minLevel}; compared on every call. */
  threshold: number;
  minLevel: LevelThreshold;
  serialize: SerializeOptions | undefined;
  redact: ((fields: LogFields) => LogFields) | undefined;
  onError: TransportErrorHandler | undefined;
}

/** What a child inherits. Not exported: `new Logger(opts)` is the only public shape. */
interface Inherited {
  core: LoggerCore;
  context: string | undefined;
  fields: LogFields | undefined;
  /** A level pinned by {@link ChildOptions.minLevel}, independent of the core. */
  pinned: LevelThreshold | undefined;
}

function isTimezoneAware(transport: Transport): transport is TimezoneAwareTransport {
  return typeof (transport as Partial<TimezoneAwareTransport>).setTimezone === "function";
}

/** A blank or whitespace only context is treated as no context at all. */
function normalizeContext(context: unknown): string | undefined {
  if (typeof context !== "string") return undefined;
  const trimmed = context.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** `undefined` when there is nothing to merge, so entries stay allocation free. */
function mergeFields(
  base: LogFields | undefined,
  extra: LogFields | undefined,
): LogFields | undefined {
  if (base === undefined) return extra;
  if (extra === undefined) return base;
  return { ...base, ...extra };
}

/** Narrow an untrusted value to a level, or throw naming the option that was wrong. */
function checkThreshold(value: unknown, where: string): LevelThreshold {
  if (!isLevelThreshold(value)) {
    throw new TypeError(
      `${where}: invalid level ${JSON.stringify(value)} — expected one of: ${levelNames(true)}`,
    );
  }
  return value;
}

/** Reject a bound that would quietly mangle output (`NaN`, `-1`, `"4"`). */
function checkBound(value: unknown, where: string): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${where}: expected a non-negative number, got ${JSON.stringify(value)}`);
  }
}

/**
 * Read a level's style. The map is seeded from the defaults & never has
 * entries removed, so every known level is present => the assertion states that
 * invariant in one place rather than at each call site.
 */
function styleOf(levels: Map<LogLevel, LevelConfig>, level: LogLevel): LevelConfig {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return levels.get(level)!;
}

/** Apply partial level style overrides onto a fresh copy of the defaults. */
function buildLevels(overrides: LoggerOptions["levels"]): Map<LogLevel, LevelConfig> {
  const levels = createDefaultLevels();
  if (overrides === undefined) return levels;
  for (const key of Object.keys(overrides)) {
    // a silent typo would leave the caller believing their style applied
    if (!isLogLevel(key)) {
      throw new TypeError(
        `levels: invalid key ${JSON.stringify(key)} — expected one of: ${levelNames()}`,
      );
    }
    const style = { ...overrides[key] };
    if (checkColor(style.color, `levels.${key}.color`) === undefined) delete style.color;
    // partial overrides keep the default colour/display for omitted fields
    levels.set(key, { ...styleOf(levels, key), ...style });
  }
  return levels;
}

/**
 * Fold the deprecated flat 1.x options into the nested `console` block. They
 * stay supported because breaking every existing call site to rename a boolean
 * is not a trade worth making; nested spellings win where both are given.
 */
function consoleOptionsFrom(
  options: LoggerOptions,
  levels: Map<LogLevel, LevelConfig>,
): ConsoleTransportOptions {
  // only called when a console transport is wanted, so `console` is not `false`
  const nested = (options.console as ConsoleTransportOptions | undefined) ?? {};
  return {
    ...nested,
    levels: nested.levels ?? levels,
    timezone: nested.timezone ?? options.timezone,
    dev: nested.dev ?? options.dev,
    devColor: nested.devColor ?? options.devColor,
    messageColor: nested.messageColor ?? options.messageColor,
    timeColor: nested.timeColor ?? options.timeColor,
    showDate: nested.showDate ?? options.showDate,
  };
}

export class Logger {
  private readonly core: LoggerCore;
  private readonly boundContext: string | undefined;
  private readonly boundFields: LogFields | undefined;
  private pinned: LevelThreshold | undefined;

  constructor(options?: LoggerOptions);
  /** @internal Used by `scope()` & `child()`; not part of the public API. */
  constructor(options: undefined, inherited: Inherited);
  constructor(options: LoggerOptions = {}, inherited?: Inherited) {
    if (inherited !== undefined) {
      this.core = inherited.core;
      this.boundContext = inherited.context;
      this.boundFields = inherited.fields;
      this.pinned = inherited.pinned;
      return;
    }

    if ((options as { default?: unknown }).default !== undefined) {
      report(
        "deprecated-option",
        'createLogger({ default: true }) is obsolete and ignored — call createLogger() with no arguments.',
      );
    }

    const minLevel = checkThreshold(options.minLevel ?? "trace", "minLevel");
    checkBound(options.serialize?.depth, "serialize.depth");
    checkBound(options.serialize?.maxLength, "serialize.maxLength");

    const levels = buildLevels(options.levels);
    const transports: Transport[] = options.transports ? [...options.transports] : [];
    // the console transport is implicit only when nothing else was named; asking
    // for both is explicit (`{ transports: [...], console: {} }`)
    const wantConsole =
      options.console !== false && (options.transports === undefined || options.console !== undefined);
    if (wantConsole) {
      transports.push(new ConsoleTransport(consoleOptionsFrom(options, levels)));
    }

    this.core = {
      levels,
      transports,
      threshold: THRESHOLD[minLevel],
      minLevel,
      serialize: options.serialize,
      redact: createRedactor(options.redact),
      onError: options.onError,
    };
    this.boundContext = normalizeContext(options.context);
    this.boundFields = options.fields;
    this.pinned = undefined;
  }

  /* ---------------------------------------------------------------------- */
  /* Emitting                                                               */
  /* ---------------------------------------------------------------------- */

  trace(message: unknown, meta?: LogMeta, fields?: LogFields): void {
    this.emit("trace", message, meta, fields);
  }
  debug(message: unknown, meta?: LogMeta, fields?: LogFields): void {
    this.emit("debug", message, meta, fields);
  }
  info(message: unknown, meta?: LogMeta, fields?: LogFields): void {
    this.emit("info", message, meta, fields);
  }
  warn(message: unknown, meta?: LogMeta, fields?: LogFields): void {
    this.emit("warn", message, meta, fields);
  }
  error(message: unknown, meta?: LogMeta, fields?: LogFields): void {
    this.emit("error", message, meta, fields);
  }
  fatal(message: unknown, meta?: LogMeta, fields?: LogFields): void {
    this.emit("fatal", message, meta, fields);
  }

  /** Log at a level chosen at runtime. Unknown levels are ignored, not thrown. */
  log(level: LogLevel, message: unknown, meta?: LogMeta, fields?: LogFields): void {
    if (!isLogLevel(level)) return;
    this.emit(level, message, meta, fields);
  }

  /* ---------------------------------------------------------------------- */
  /* Derivation                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * A child logger with a fixed context, replacing any context already bound.
   * Retained from 1.x; {@link child} is the composing form.
   */
  scope(context: string): Logger {
    return new Logger(undefined, {
      core: this.core,
      context: normalizeContext(context),
      fields: this.boundFields,
      pinned: this.pinned,
    });
  }

  /**
   * A child logger inheriting this one's context & fields.
   *
   * ```ts
   * const db = logger.child({ context: "db", fields: { pool: "primary" } });
   * const tx = db.child({ context: "tx" });   // context: "db:tx"
   * ```
   */
  child(options: ChildOptions = {}): Logger {
    const own = normalizeContext(options.context);
    let context: string | undefined;
    if (options.replaceContext === true) context = own;
    else if (own === undefined) context = this.boundContext;
    else context = this.boundContext === undefined ? own : `${this.boundContext}:${own}`;

    return new Logger(undefined, {
      core: this.core,
      context,
      fields: mergeFields(this.boundFields, options.fields),
      pinned: options.minLevel === undefined ? this.pinned : checkThreshold(options.minLevel, "child.minLevel"),
    });
  }

  /** Shorthand for `child({ fields })`. */
  with(fields: LogFields): Logger {
    return this.child({ fields });
  }

  /* ---------------------------------------------------------------------- */
  /* Configuration                                                          */
  /* ---------------------------------------------------------------------- */

  /** The threshold in force for this logger, its own pin, or the family's. */
  get level(): LevelThreshold {
    return this.pinned ?? this.core.minLevel;
  }

  /**
   * Set the minimum level that gets logged. On a logger pinned by
   * `child({ minLevel })` this moves that pin; anywhere else it moves the level
   * for the whole family, as it did in 1.x.
   */
  setLevel(level: LevelThreshold): void {
    // failing open would silently log everything, so an invalid level is loud
    checkThreshold(level, "setLevel");
    if (this.pinned !== undefined) {
      this.pinned = level;
      return;
    }
    this.core.threshold = THRESHOLD[level];
    this.core.minLevel = level;
  }

  /** Whether a call at `level` would reach any transport. */
  isLevelEnabled(level: LogLevel): boolean {
    return isLogLevel(level) && SEVERITY[level] >= this.threshold;
  }

  setLevelStyle(level: LogLevel, style: Partial<LevelConfig>): void {
    if (!isLogLevel(level)) {
      throw new TypeError(
        `setLevelStyle: invalid level ${JSON.stringify(level)} — expected one of: ${levelNames()}`,
      );
    }
    const next = { ...style };
    if (checkColor(next.color, `setLevelStyle(${level})`) === undefined) delete next.color;
    this.core.levels.set(level, { ...styleOf(this.core.levels, level), ...next });
  }

  /** A snapshot of the level styles in force. Mutating it changes nothing. */
  listLevels(): Record<LogLevel, LevelConfig> {
    const out = {} as Record<LogLevel, LevelConfig>;
    for (const level of LOG_LEVELS) {
      out[level] = { ...styleOf(this.core.levels, level) };
    }
    return out;
  }

  /**
   * Change the timestamp zone on every transport that renders one, so switching
   * zones doesn't mean rebuilding the logger. No argument resets to local time.
   */
  setTimezone(timezone: TimezoneOption = "local"): void {
    for (const transport of this.core.transports) {
      if (isTimezoneAware(transport)) transport.setTimezone(timezone);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Transports                                                             */
  /* ---------------------------------------------------------------------- */

  addTransport(transport: Transport): void {
    // a JavaScript caller can pass anything here, whatever the signature says
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (transport === null || typeof transport !== "object" || typeof transport.write !== "function") {
      throw new TypeError("addTransport: expected an object with a write(entry) method");
    }
    this.core.transports.push(transport);
  }

  /** Detach a transport. Returns whether it was attached in the first place. */
  removeTransport(transport: Transport): boolean {
    const index = this.core.transports.indexOf(transport);
    if (index === -1) return false;
    this.core.transports.splice(index, 1);
    return true;
  }

  /** The transports in play, as a snapshot. */
  listTransports(): readonly Transport[] {
    return [...this.core.transports];
  }

  /**
   * Wait for every transport that buffers to drain. Safe to call on a logger
   * whose transports are all synchronous, it simply resolves.
   */
  async flush(): Promise<void> {
    await Promise.all(
      this.core.transports.map(async (transport) => {
        try {
          await transport.flush?.();
        } catch (error) {
          report("transport-flush-error", "a transport failed while flushing.", error);
        }
      }),
    );
  }

  /** Flush, then release every transport's resources. */
  async close(): Promise<void> {
    await this.flush();
    await Promise.all(
      this.core.transports.map(async (transport) => {
        try {
          await transport.close?.();
        } catch (error) {
          report("transport-close-error", "a transport failed while closing.", error);
        }
      }),
    );
  }

  /**
   * Bolt logging methods onto an existing object, e.g. `client.logs.info(...)`,
   * convenient for bot clients & framework objects passed around everywhere.
   * Rejects keys that would reach the prototype rather than the object.
   */
  attach(target: object, key = "logs"): void {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new TypeError(`attach: "${key}" is not a safe property key`);
    }
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      report("attach-overwrite", `attach(): overwriting existing property "${key}".`);
    }
    const logs: Record<string, (message: unknown, meta?: LogMeta, fields?: LogFields) => void> = {};
    for (const level of LOG_LEVELS) {
      logs[level] = (message, meta, fields): void => {
        this.emit(level, message, meta, fields);
      };
    }
    // defineProperty always creates an own property, even for exotic keys
    Object.defineProperty(target, key, {
      value: logs,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  private get threshold(): number {
    return this.pinned === undefined ? this.core.threshold : THRESHOLD[this.pinned];
  }

  private emit(level: LogLevel, message: unknown, meta?: LogMeta, extra?: LogFields): void {
    // the only work a filtered out call does: two property reads & a compare
    if (SEVERITY[level] < this.threshold) return;

    let context: string | undefined;
    let callFields: LogFields | undefined;
    if (typeof meta === "string") {
      context = meta;
      callFields = extra;
      // `null` is not in the declared type but is what a JS caller passes when
      // they mean "no context, just fields"
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (meta !== null && typeof meta === "object") {
      callFields = meta;
    } else {
      callFields = extra;
    }

    let raw = message;
    if (typeof raw === "function" && raw.length === 0) {
      // a thunk is only built when it will actually be logged
      try {
        raw = (raw as () => unknown)();
      } catch (error) {
        report("lazy-message-error", "a lazy message threw; logging the failure instead.", error);
        raw = error;
      }
    }

    let fields = mergeFields(this.boundFields, callFields);
    if (fields !== undefined && this.core.redact !== undefined) {
      fields = this.core.redact(fields);
    }

    const record = new LogRecord(
      level,
      raw,
      // a per call context wins over the bound one
      normalizeContext(context) ?? this.boundContext,
      fields,
      new Date(),
      this.core.serialize,
    );

    const severity = SEVERITY[level];
    for (const transport of this.core.transports) {
      // honoured here as well as inside the built in transports, so a
      // third party transport gets per transport levels for free
      const min = transport.minLevel;
      if (min !== undefined && isLevelThreshold(min) && severity < THRESHOLD[min]) continue;
      try {
        transport.write(record);
      } catch (error) {
        this.reportTransportError(error, transport);
      }
    }
  }

  /** One broken sink must not stop the others, or reach the caller. */
  private reportTransportError(error: unknown, transport: Transport): void {
    const handler = this.core.onError;
    if (handler === undefined) {
      report("transport-error", "a transport threw while writing an entry.", error);
      return;
    }
    try {
      handler(error, transport);
    } catch (handlerError) {
      report("transport-error", "the onError handler itself threw.", handlerError);
    }
  }
}

/**
 * Build a logger. Equivalent to `new Logger(options)`, kept as the documented
 * entry point:
 *
 * ```ts
 * const logger = createLogger();
 * const json   = createLogger({ console: { format: "json" }, minLevel: "info" });
 * ```
 */
export function createLogger(options?: CreateLoggerOptions): Logger {
  return new Logger(options);
}
