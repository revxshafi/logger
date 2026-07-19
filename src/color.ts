import chalk from "chalk";

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** True for the only forms `chalk.hex` renders faithfully: `#RGB` / `#RRGGBB`. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/**
 * Config-time color guard: invalid values are reported and dropped, so a typo
 * can't silently turn output black (chalk renders unparseable hex as #000000).
 */
export function checkColor(color: string | undefined, where: string): string | undefined {
  if (color === undefined || isHexColor(color)) {
    return color;
  }
  console.warn(
    `[logger] ${where}: invalid color ${JSON.stringify(color)} - expected "#RGB" or "#RRGGBB"; ignoring.`,
  );
  return undefined;
}

// the cache key includes chalk.level, so anyone flipping it at runtime
// (tests do) won't get stylers frozen at the old level
const stylers = new Map<string, (text: string) => string>();
const warned = new Set<string>();

/**
 * Color `text` with `color`, falling back when it's invalid — `chalk.hex`
 * throws on undefined and renders junk as black, so no unvalidated string
 * may reach it. Warns once per distinct bad value.
 */
export function styleHex(color: string | undefined, fallback: string, text: string): string {
  let hex: string;
  if (isHexColor(color)) {
    hex = color;
  } else {
    const seen = String(color);
    if (!warned.has(seen)) {
      warned.add(seen);
      console.warn(`[logger] Invalid color ${JSON.stringify(color)} - using ${fallback}.`);
    }
    hex = fallback;
  }
  const key = `${chalk.level}:${hex}`;
  let styler = stylers.get(key);
  if (!styler) {
    styler = chalk.hex(hex);
    stylers.set(key, styler);
  }
  return styler(text);
}
