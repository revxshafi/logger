import { Logger } from "./logger";

export { Logger, createLogger } from "./logger";
export { LOG_LEVELS, createDefaultLevels, isLogLevel } from "./levels";
export { ConsoleTransport } from "./transports/console";
export type { ConsoleTransportOptions } from "./transports/console";
export type {
  LoggerOptions,
  DefaultLoggerOptions,
  CreateLoggerOptions,
  LogLevel,
  LevelConfig,
  TimezoneOption,
  LogEntry,
  Transport,
  TimezoneAwareTransport,
} from "./types";

/**
 * Ready-to-use default instance for the common case.
 *
 * This is a **module-level singleton**: every package in the dependency tree
 * that imports it gets the same instance, so `setLevel` / `setLevelStyle` /
 * `addTransport` here are process-wide. Use `createLogger()` for an isolated
 * instance.
 */
export const logger = new Logger();
