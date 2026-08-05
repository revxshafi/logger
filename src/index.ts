/**
 * The package's public surface.
 *
 * Everything exported here is covered by semver; anything under `internal/` is
 * not, & may change in a patch release.
 */
import { Logger } from "./logger";

export { Logger, createLogger } from "./logger";
export { LogRecord } from "./record";

export {
  createDefaultLevels,
  isLevelThreshold,
  isLogLevel,
  LOG_LEVELS,
  SEVERITY,
} from "./levels";

export { devFormat, jsonFormat, prettyFormat } from "./formats";
export {
  ConsoleTransport,
  consoleTransport,
  MemoryTransport,
  memoryTransport,
  StreamTransport,
  streamTransport,
} from "./transports";

export { setDiagnosticsHandler } from "./internal/diagnostics";
export type { Diagnostic, DiagnosticCode, DiagnosticHandler } from "./internal/diagnostics";

/**
 * Force a colour depth for every formatter that auto detects, or pass `null` to
 * return to detection. Useful in tests & in runtimes whose environment lies
 * about terminal support.
 */
export { setColorLevel } from "./internal/ansi";

export type {
  ChildOptions,
  ColorLevel,
  ColorOption,
  ConsoleTransportOptions,
  CreateLoggerOptions,
  DevFormatOptions,
  JsonFormatOptions,
  LazyMessage,
  LevelConfig,
  LevelThreshold,
  LogEntry,
  LogFields,
  LogFormatter,
  LoggerOptions,
  LogLevel,
  LogMeta,
  MemoryTransportOptions,
  MultilineMode,
  PrettyFormatOptions,
  SerializeOptions,
  StreamTransportOptions,
  TimestampStyle,
  TimezoneAwareTransport,
  TimezoneOption,
  Transport,
  TransportErrorHandler,
  WritableLike,
} from "./types";

/**
 * A ready made logger for the common case.
 *
 * This is a **module level singleton**: every package in the dependency tree
 * that imports it shares one instance, so `setLevel`, `setLevelStyle` and
 * `addTransport` on it are process wide. Libraries should call
 * {@link createLogger} instead & let the application own the configuration.
 */
export const logger = new Logger();
