/**
 * Timezone-aware `HH:MM:SS` formatting built on native `Intl.DateTimeFormat`.
 * We lean on the platform here so there's no `moment` (or any date lib) to ship.
 */
import type { TimezoneOption } from "./types";

export function createTimeFormatter(
  timezone: TimezoneOption = "local",
): (date: Date) => string {
  // `undefined` tells Intl to use the runtime's local zone.
  const zone = timezone === "local" ? undefined : timezone;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: zone,
  });

  return (date: Date): string => formatter.format(date);
}
