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

const bgStylers = new Map<string, (text: string) => string>();

/**
 * Background-color `text`, picking readable black or white foreground from the
 * background's perceived brightness so light badges stay legible.
 */
export function styleBgHex(color: string | undefined, fallback: string, text: string): string {
  const hex = isHexColor(color) ? color : fallback;
  const key = `${chalk.level}:${hex}`;
  let styler = bgStylers.get(key);
  if (!styler) {
    const full =
      hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;
    const r = parseInt(full.slice(1, 3), 16);
    const g = parseInt(full.slice(3, 5), 16);
    const b = parseInt(full.slice(5, 7), 16);
    // ITU-R BT.601 luma; >=140 reads as light, so switch to black text
    const fg = (r * 299 + g * 587 + b * 114) / 1000 >= 140 ? "#000000" : "#FFFFFF";
    const bg = chalk.bgHex(full);
    const text2 = chalk.hex(fg);
    styler = (value: string): string => bg(text2(value));
    bgStylers.set(key, styler);
  }
  return styler(text);
}
