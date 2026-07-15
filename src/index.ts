import { Logger } from "./logger";

export { Logger } from "./logger";
export { LOG_LEVELS, createDefaultLevels } from "./levels";
export { ConsoleTransport } from "./transports/console";
export type { ConsoleTransportOptions } from "./transports/console";
export type {
  LoggerOptions,
  LogLevel,
  LevelConfig,
  TimezoneOption,
  LogEntry,
  Transport,
  TimezoneAwareTransport,
} from "./types";

/** Ready-to-use default instance for the common case. */
export const logger = new Logger();
