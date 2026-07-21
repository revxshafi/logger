import type { LevelConfig, LogLevel } from "./types";

/** The six levels in severity order — handy for iteration. */
export const LOG_LEVELS: readonly LogLevel[] = Object.freeze([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

/** Severity rank per level — precomputed so `emit` avoids `indexOf` per call. */
export const SEVERITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

/** Runtime guard for untrusted level strings (JS callers, user input). */
export function isLogLevel(value: unknown): value is LogLevel {
  // own-property check so prototype names like "toString" don't pass
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(SEVERITY, value)
  );
}

/** Build a fresh copy of the default level styles. */
export function createDefaultLevels(): Map<LogLevel, LevelConfig> {
  return new Map<LogLevel, LevelConfig>([
    ["trace", { color: "#8A8A8A", display: "TRACE" }],
    ["debug", { color: "#90EE90", display: "DEBUG" }],
    ["info", { color: "#4AA3FF", display: "INFO" }],
    ["warn", { color: "#FFCC00", display: "WARN" }],
    ["error", { color: "#FF4D4D", display: "ERROR" }],
    ["fatal", { color: "#FF00AA", display: "FATAL" }],
  ]);
}
