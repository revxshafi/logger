/**
 * Timestamp rendering, built on the platform's `Intl` so there's no date
 * library to ship.
 *
 * `Intl.DateTimeFormat#format` is not cheap => it is comfortably the most
 * expensive thing a pretty printed log line does. Since the human styles only
 * resolve to second precision, the result is memoised per second: a service
 * logging a thousand lines a second formats once & concatenates 999 times.
 */
import { report } from "./diagnostics";
import type { TimestampStyle, TimezoneOption } from "../types";

/** Same width as the style it replaces, so columns stay aligned. */
const PLACEHOLDER: Record<TimestampStyle, string> = {
  time: "--:--:--",
  datetime: "---------- --:--:--",
  iso: "invalid-date",
  none: "",
};

type Fields = Intl.DateTimeFormatOptions;

const TIME_FIELDS: Fields = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // h23 renders midnight as "00" rather than "24"; hour12:false alone is
  // locale dependent & gets this wrong in some ICU builds
  hourCycle: "h23",
};

const DATE_FIELDS: Fields = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

/**
 * Build an `Intl` formatter, falling back to the host zone when the zone name
 * is rejected. A typo in a config value must not crash the application.
 */
function buildFormatter(
  timezone: TimezoneOption,
  fields: Fields,
): Intl.DateTimeFormat {
  // Intl reads `undefined` as "the runtime's local zone"
  const zone = timezone === "local" ? undefined : timezone;
  try {
    return new Intl.DateTimeFormat("en-GB", { ...fields, timeZone: zone });
  } catch {
    report(
      "invalid-timezone",
      `invalid timezone ${JSON.stringify(timezone)} - falling back to the host's local zone.`,
    );
    return new Intl.DateTimeFormat("en-GB", fields);
  }
}

/**
 * Assemble `DD-MM-YYYY HH:MM:SS` (or just the time) from parts rather than
 * string surgery on a locale's own layout, which would break the moment ICU
 * changed its separators.
 */
function assemble(formatter: Intl.DateTimeFormat, date: Date, withDate: boolean): string {
  const found: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    found[part.type] = part.value;
  }
  const time = `${found.hour}:${found.minute}:${found.second}`;
  return withDate ? `${found.day}-${found.month}-${found.year} ${time}` : time;
}

/** Renders a `Date` as text. */
export type TimeFormatter = (date: Date) => string;

/**
 * One entry cache for `Date#toISOString`, which is expensive enough to matter:
 * it costs about as much as encoding the rest of a JSON line put together.
 * Under load many entries land in the same millisecond, so a burst formats once
 * & looks up the rest. Keyed on the epoch value, not the object, so two
 * distinct `Date`s for the same instant still hit.
 *
 * Returns `null` for an invalid date, `toISOString` would throw a RangeError.
 */
let cachedMs = Number.NaN;
let cachedIso = "";

export function isoTime(date: Date): string | null {
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms !== cachedMs) {
    cachedMs = ms;
    cachedIso = date.toISOString();
  }
  return cachedIso;
}

/**
 * Create a formatter for one style & zone. The returned function is safe to
 * call with an invalid `Date`; it yields a fixed width placeholder rather than
 * throwing, because a hand built `LogEntry` should still produce a log line.
 */
export function createTimeFormatter(
  style: TimestampStyle = "time",
  timezone: TimezoneOption = "local",
): TimeFormatter {
  if (style === "none") return () => "";

  if (style === "iso") {
    return (date: Date): string => isoTime(date) ?? PLACEHOLDER.iso;
  }

  const withDate = style === "datetime";
  const formatter = buildFormatter(timezone,
    withDate ? { ...DATE_FIELDS, ...TIME_FIELDS } : TIME_FIELDS);
  const placeholder = PLACEHOLDER[style];

  // memoised across calls within the same wall clock second
  let cachedSecond = Number.NaN;
  let cachedText = placeholder;

  return (date: Date): string => {
    const ms = date.getTime();
    if (!Number.isFinite(ms)) return placeholder;
    const second = Math.floor(ms / 1000);
    if (second !== cachedSecond) {
      cachedSecond = second;
      cachedText = assemble(formatter, date, withDate);
    }
    return cachedText;
  };
}
