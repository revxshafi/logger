import { createDefaultLevels, LOG_LEVELS } from "./levels";
import { ConsoleTransport } from "./transports/console";
import type {
  LevelConfig,
  LogEntry,
  LoggerOptions,
  LogLevel,
  Transport,
} from "./types";

/**
 * State shared between a root logger and every logger it spawns via `scope()`.
 * Scoped loggers are thin views over the same core, so `setLevelStyle` /
 * `addTransport` from any of them affect the whole family.
 */
interface LoggerCore {
  levels: Map<LogLevel, LevelConfig>;
  transports: Transport[];
}

/** Turn an arbitrary value into a printable string without using `any`. */
function serialize(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof Error) {
    return data.stack ? `${data.message}\n${data.stack}` : data.message;
  }
  if (data !== null && typeof data === "object") {
    try {
      // JSON.stringify returns undefined for e.g. { toJSON: () => undefined }
      const json = JSON.stringify(data, null, 2);
      return json ?? String(data);
    } catch {
      // circular refs, BigInt, etc. => JSON.stringify throws, so fall back
      return String(data);
    }
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

  listLevels(): Record<LogLevel, LevelConfig> {
    const out = {} as Record<LogLevel, LevelConfig>;
    for (const level of LOG_LEVELS) {
      const config = this.core.levels.get(level);
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
   */
  attach(target: Record<string, unknown>, key = "logs"): void {
    const logs: Record<string, (message: unknown, context?: string) => void> = {};
    for (const level of LOG_LEVELS) {
      logs[level] = (message: unknown, context?: string): void =>
        this.emit(level, message, context);
    }
    target[key] = logs;
  }

  // --- Internals ------------------------------------------------------------

  private emit(level: LogLevel, message: unknown, context?: string): void {
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
