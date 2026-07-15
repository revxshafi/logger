import { inspect, types } from "node:util";
import { createDefaultLevels, LOG_LEVELS } from "./levels";
import { ConsoleTransport } from "./transports/console";
import type {
  LevelConfig,
  LogEntry,
  LoggerOptions,
  LogLevel,
  TimezoneAwareTransport,
  TimezoneOption,
  Transport,
} from "./types";

/**
 * State shared between a root logger and every logger it spawns via `scope()`.
 * Scoped loggers are thin views over the same core, so `setLevelStyle` /
 * `addTransport` / `setLevel` from any of them affect the whole family.
 */
interface LoggerCore {
  levels: Map<LogLevel, LevelConfig>;
  transports: Transport[];
  minLevel: LogLevel;
}

/** True when `transport` opts into runtime timezone changes. */
function isTimezoneAware(transport: Transport): transport is TimezoneAwareTransport {
  return typeof (transport as Partial<TimezoneAwareTransport>).setTimezone === "function";
}

/** Turn an arbitrary value into a printable string without using `any`. */
function serialize(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  // `types.isNativeError` also catches errors from other realms (workers, vm)
  // that fail an `instanceof` check.
  if (data instanceof Error || types.isNativeError(data)) {
    // On V8 the stack already starts with "Error: <message>" — returning both
    // would print the message twice.
    return data.stack ?? data.message;
  }
  if (typeof data === "bigint") {
    // Match how `inspect` renders bigints nested inside objects.
    return `${data}n`;
  }
  if (data !== null && typeof data === "object") {
    // JSON.stringify "succeeds" on Map/Set/RegExp and other class instances
    // by collapsing them to "{}" — only trust it for plain objects and arrays.
    const proto: unknown = Object.getPrototypeOf(data);
    const isPlain =
      Array.isArray(data) || proto === Object.prototype || proto === null;
    if (isPlain) {
      try {
        // JSON.stringify returns undefined for e.g. { toJSON: () => undefined };
        // treat that like a failure and fall through to inspect.
        const json = JSON.stringify(data, null, 2);
        if (json !== undefined) {
          return json;
        }
      } catch {
        // circular refs, BigInt, etc. => JSON.stringify throws; inspect handles them.
      }
    }
    // Show the object's fields instead of a useless "[object Object]" or "{}".
    return inspect(data, { depth: 4, breakLength: 80 });
  }
  return String(data);
}

/** A blank or whitespace-only context is treated as no context at all. */
function normalizeContext(context: string | undefined): string | undefined {
  if (typeof context !== "string") {
    return undefined;
  }
  const trimmed = context.trim();
  return trimmed === "" ? undefined : trimmed;
}

export class Logger {
  private readonly core: LoggerCore;
  private readonly context?: string;

  constructor(options?: LoggerOptions);
  /** Internal: used by `scope()` to share the core with a bound context. */
  constructor(options: LoggerOptions | undefined, core: LoggerCore, context?: string);
  constructor(options?: LoggerOptions, core?: LoggerCore, context?: string) {
    if (core) {
      this.core = core;
      this.context = context;
      return;
    }

    const levels = createDefaultLevels();
    this.core = {
      levels,
      transports: [new ConsoleTransport({ timezone: options?.timezone, levels })],
      minLevel: options?.minLevel ?? "trace",
    };
  }

  // --- Level methods --------------------------------------------------------

  trace(message: unknown, context?: string): void {
    this.emit("trace", message, context);
  }
  debug(message: unknown, context?: string): void {
    this.emit("debug", message, context);
  }
  info(message: unknown, context?: string): void {
    this.emit("info", message, context);
  }
  warn(message: unknown, context?: string): void {
    this.emit("warn", message, context);
  }
  error(message: unknown, context?: string): void {
    this.emit("error", message, context);
  }
  fatal(message: unknown, context?: string): void {
    this.emit("fatal", message, context);
  }

  // --- Scoping --------------------------------------------------------------

  /**
   * Create a child logger with a fixed context. Calling `scope()` again
   * overrides the context rather than composing.
   */
  scope(context: string): Logger {
    return new Logger(undefined, this.core, context);
  }

  // --- Configuration --------------------------------------------------------

  setLevelStyle(level: LogLevel, style: Partial<LevelConfig>): void {
    const current = this.core.levels.get(level);
    const base: LevelConfig = current ?? {
      color: "#AAAAAA",
      display: level.toUpperCase(),
    };
    this.core.levels.set(level, { ...base, ...style });
  }

  /**
   * Change the timestamp timezone on every transport that supports it, so you
   * don't have to construct a fresh `Logger` just to switch zones. Called with
   * no argument, it resets to the host's local zone.
   */
  setTimezone(timezone: TimezoneOption = "local"): void {
    for (const transport of this.core.transports) {
      if (isTimezoneAware(transport)) {
        transport.setTimezone(timezone);
      }
    }
  }

  /**
   * Set the minimum level that gets logged; anything less severe is dropped.
   * Shared with every scoped logger in the family.
   */
  setLevel(level: LogLevel): void {
    this.core.minLevel = level;
  }

  listLevels(): Record<LogLevel, LevelConfig> {
    // Seed with defaults so the return type is honest even if the shared map
    // were ever missing an entry, then overlay the current styles.
    const out = {} as Record<LogLevel, LevelConfig>;
    const defaults = createDefaultLevels();
    for (const level of LOG_LEVELS) {
      const config = this.core.levels.get(level) ?? defaults.get(level);
      if (config) {
        out[level] = { ...config };
      }
    }
    return out;
  }

  addTransport(transport: Transport): void {
    this.core.transports.push(transport);
  }

  /**
   * Bolt logging methods onto an external object, e.g. `client.logs.info(...)`.
   * Handy for bot clients that pass a single object around everywhere.
   * Overwrites an existing property at `key` (with a warning); rejects
   * `__proto__`-style keys that would mutate the prototype instead.
   */
  attach(target: Record<string, unknown>, key = "logs"): void {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new TypeError(`attach(): "${key}" is not a safe property key`);
    }
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      console.warn(`[logger] attach(): overwriting existing property "${key}"`);
    }
    const logs: Record<string, (message: unknown, context?: string) => void> = {};
    for (const level of LOG_LEVELS) {
      logs[level] = (message: unknown, context?: string): void =>
        this.emit(level, message, context);
    }
    // defineProperty writes an own property even for exotic keys.
    Object.defineProperty(target, key, {
      value: logs,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  // --- Internals ------------------------------------------------------------

  private emit(level: LogLevel, message: unknown, context?: string): void {
    // Drop anything below the family-wide minimum level.
    if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(this.core.minLevel)) {
      return;
    }
    const entry: LogEntry = {
      level,
      message: serialize(message),
      // a per-call context overrides the scoped one; fall back to the scope
      context: normalizeContext(context) ?? normalizeContext(this.context),
      timestamp: new Date(),
    };
    for (const transport of this.core.transports) {
      // a logging call must never crash the host app, and one broken sink
      // must not stop the others => swallow per-transport failures
      try {
        transport.write(entry);
      } catch {
        // nothing safe to do here; a throw would defeat the purpose
      }
    }
  }
}
