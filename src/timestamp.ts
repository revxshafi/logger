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
    hour12: false,
    timeZone: zone,
  });
}

export function createTimeFormatter(
  timezone: TimezoneOption = "local",
): (date: Date) => string {
  // `undefined` tells Intl to use the runtime's local zone.
  const zone = timezone === "local" ? undefined : timezone;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = buildFormatter(zone);
  } catch {
    // An unknown zone makes Intl throw a RangeError. A logger must never
    // crash the host app over a typo, so report it and fall back to local.
    console.error(
      `[logger] Invalid timezone "${timezone}" — falling back to the host's local zone.`,
    );
    formatter = buildFormatter(undefined);
  }

  return (date: Date): string => formatter.format(date);
}
