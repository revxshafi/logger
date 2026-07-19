/**
 * Timezone-aware `HH:MM:SS` formatting built on native `Intl.DateTimeFormat`.
 * We lean on the platform here so there's no `moment` (or any date lib) to ship.
 */
import type { TimezoneOption } from "./types";

function buildFormatter(zone: string | undefined): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // h23 makes midnight render "00" instead of "24" (hour12: false alone is locale-dependent)
    hourCycle: "h23",
    timeZone: zone,
  });
}

export function createTimeFormatter(
  timezone: TimezoneOption = "local",
): (date: Date) => string {
  // Intl treats undefined as the runtime's local zone
  const zone = timezone === "local" ? undefined : timezone;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = buildFormatter(zone);
  } catch {
    // Intl throws a RangeError on unknown zones; a typo must not crash the
    // host app, so report it and fall back to local
    console.error(
      `[logger] Invalid timezone "${timezone}" - falling back to the host's local zone.`,
    );
    formatter = buildFormatter(undefined);
  }

  return (date: Date): string => {
    // Intl throws on invalid dates; a transport fed a bad timestamp (e.g. a
    // hand-built LogEntry with new Date(NaN)) should still produce a line
    try {
      return formatter.format(date);
    } catch {
      return "--:--:--";
    }
  };
}
