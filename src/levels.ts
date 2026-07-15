import type { LevelConfig, LogLevel } from "./types";

/** The six levels in severity order — handy for iteration. */
export const LOG_LEVELS: readonly LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];

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
