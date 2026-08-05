/**
 * The level set & its ordering.
 *
 * The six emittable levels are fixed & not extensible. Levels describe
 * *severity*; anything category shaped (`MongoDB`, `Commands`) belongs in a
 * context or a field, not in a new level. Keeping the set closed is what lets
 * severity comparison be a numeric lookup and keeps `LogLevel` a useful union
 * for callers.
 */
import type { LevelConfig, LevelThreshold, LogLevel } from "./types";

/** The six levels in severity order, safe to iterate. */
export const LOG_LEVELS: readonly LogLevel[] = Object.freeze([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

/**
 * Severity rank per level, precomputed so filtering is a property read rather
 * than an `indexOf` on every call. Frozen because a consumer mutating it would
 * silently corrupt filtering for every logger in the process.
 */
export const SEVERITY: Readonly<Record<LogLevel, number>> = Object.freeze({
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
});

/**
 * Ranks for everything accepted as a *threshold*, which is the six levels plus
 * `"silent"`. Silent sits above `fatal` at infinity, so the ordinary
 * `severity < threshold` comparison drops everything with no special case.
 */
export const THRESHOLD: Readonly<Record<LevelThreshold, number>> = Object.freeze({
  ...SEVERITY,
  silent: Number.POSITIVE_INFINITY,
});

/** Runtime guard for an untrusted level string (JS callers, config files, CLI). */
export function isLogLevel(value: unknown): value is LogLevel {
  // own property check, so inherited names like "toString" don't pass
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SEVERITY, value);
}

/** As {@link isLogLevel}, but `"silent"` is allowed too. */
export function isLevelThreshold(value: unknown): value is LevelThreshold {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(THRESHOLD, value)
  );
}

/** Human readable list for error messages. */
export function levelNames(includeSilent = false): string {
  return includeSilent ? [...LOG_LEVELS, "silent"].join(", ") : LOG_LEVELS.join(", ");
}

/**
 * Build a fresh copy of the default level styles. Returns a new `Map` with new
 * config objects each call, so one logger's styling can never leak into
 * another's.
 */
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

/** Used when a level has no style, or the style it has is unusable. */
const FALLBACK_COLOR = "#AAAAAA";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Resolve the style a formatter should draw a level with, tolerating a
 * hand built map that is sparse or holds a malformed colour. Formatters render
 * whatever they're given, so normalising here keeps a bad config from silently
 * painting output black rather than crashing.
 */
export function levelConfigFor(
  levels: Map<LogLevel, LevelConfig> | undefined,
  level: LogLevel,
): LevelConfig {
  const found = levels?.get(level);
  if (found === undefined) {
    return { color: FALLBACK_COLOR, display: level.toUpperCase() };
  }
  if (HEX.test(found.color)) return found;
  return { color: FALLBACK_COLOR, display: found.display };
}
