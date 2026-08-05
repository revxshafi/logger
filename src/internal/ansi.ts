/**
 * A very small ANSI styling engine.
 *
 * This exists so the package ships with **zero runtime dependencies**. It used
 * to be `chalk`, which pulled in five transitive packages to do what amounts to
 * string concatenation plus a colour depth check. Owning it also buys three
 * things the wrapper couldn't:
 *
 * - colour depth resolved **per stream** (stdout may be a TTY while stderr is a
 *   pipe), instead of one process wide `chalk.level`;
 * - **bounded** caches, so a caller styling with attacker supplied hex strings
 *   can't grow a `Map` forever;
 * - open/close sequences resolved once per colour & reused, so a log line
 *   costs a few string concatenations and no allocation beyond the result.
 *
 * Only what a logger needs is implemented: 24 bit hex foreground/background,
 * dim & reset => downsampled to 256 or 16 colours when the terminal says
 * that's all it understands.
 */

import { report } from "./diagnostics";
import type { ColorLevel, ColorOption } from "../types";

/** Control Sequence Introducer: `ESC [`. */
const CSI = "\u001B[";
const RESET = `${CSI}0m`;
const DIM_OPEN = `${CSI}2m`;
/** Dim's own reset (22) rather than a full reset, so it can nest. */
const DIM_CLOSE = `${CSI}22m`;

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** True for the two hex forms this module understands: `#RGB` & `#RRGGBB`. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_PATTERN.test(value);
}

/** Expand `#abc` to `[0xaa, 0xbb, 0xcc]`. Assumes {@link isHexColor} passed. */
function parseHex(hex: string): [number, number, number] {
  // `#abc` is expanded to `#aabbcc` so both forms take the same slicing path
  const full =
    hex.length === 4
      ? `#${hex.slice(1).replace(/./g, (digit) => digit + digit)}`
      : hex;
  return [
    parseInt(full.slice(1, 3), 16),
    parseInt(full.slice(3, 5), 16),
    parseInt(full.slice(5, 7), 16),
  ];
}

/** Perceived brightness (ITU-R BT.601 luma), 0-255. */
function luma(r: number, g: number, b: number): number {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** Map 24 bit RGB onto the xterm-256 cube plus its greyscale ramp. */
function rgbTo256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  return (
    16 +
    36 * Math.round((r / 255) * 5) +
    6 * Math.round((g / 255) * 5) +
    Math.round((b / 255) * 5)
  );
}

/**
 * Map 24 bit RGB onto the 16 basic colours, the way `color-convert` does:
 * the HSV value picks black / normal / bright, & the top bit of each channel
 * picks the hue.
 */
function rgbTo16(r: number, g: number, b: number): number {
  // HSV value scaled to 0-2: 0 = black, 1 = normal, 2 = bright
  const value = Math.round((Math.max(r, g, b) / 255) * 2);
  if (value === 0) return 30;
  const code =
    30 + ((Math.round(b / 255) << 2) | (Math.round(g / 255) << 1) | Math.round(r / 255));
  return value === 2 ? code + 60 : code;
}

/** The SGR opening sequence for a foreground colour at the given depth. */
function foregroundOpen(level: ColorLevel, r: number, g: number, b: number): string {
  if (level >= 3) return `${CSI}38;2;${r};${g};${b}m`;
  if (level === 2) return `${CSI}38;5;${rgbTo256(r, g, b)}m`;
  return `${CSI}${rgbTo16(r, g, b)}m`;
}

/** As {@link foregroundOpen}; background codes are their foreground plus 10. */
function backgroundOpen(level: ColorLevel, r: number, g: number, b: number): string {
  if (level >= 3) return `${CSI}48;2;${r};${g};${b}m`;
  if (level === 2) return `${CSI}48;5;${rgbTo256(r, g, b)}m`;
  return `${CSI}${rgbTo16(r, g, b) + 10}m`;
}

/**
 * Caches are capped & cleared wholesale on overflow. Colours come from
 * configuration & so are a tiny fixed set in practice, but a caller is free
 * to pass a fresh colour per call and must not be able to leak memory doing so.
 */
const CACHE_LIMIT = 256;

function cacheSet(cache: Map<string, string>, key: string, value: string): void {
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, value);
}

/** Applies ANSI styles at one fixed colour depth. */
export interface Styler {
  /** The depth this styler emits for; `0` means every method is a no op. */
  readonly level: ColorLevel;
  /** True when {@link level} is above `0`, handy for skipping style work. */
  readonly enabled: boolean;
  /** Colour `text`'s foreground. Unparseable colours are returned unstyled. */
  hex(color: string, text: string): string;
  /**
   * Colour `text`'s background, choosing a black or white foreground from the
   * background's brightness so light badges stay legible.
   */
  bgHex(color: string, text: string): string;
  /** Render `text` dimmed. */
  dim(text: string): string;
}

/** A styler whose methods all return their input; used at level 0. */
const PLAIN: Styler = {
  level: 0,
  enabled: false,
  hex: (_color, text) => text,
  bgHex: (_color, text) => text,
  dim: (text) => text,
};

function buildStyler(level: ColorLevel): Styler {
  const foreground = new Map<string, string>();
  const background = new Map<string, string>();

  return {
    level,
    enabled: true,
    hex(color: string, text: string): string {
      let open = foreground.get(color);
      if (open === undefined) {
        if (!isHexColor(color)) return text;
        const [r, g, b] = parseHex(color);
        open = foregroundOpen(level, r, g, b);
        cacheSet(foreground, color, open);
      }
      return open + text + RESET;
    },
    bgHex(color: string, text: string): string {
      let open = background.get(color);
      if (open === undefined) {
        if (!isHexColor(color)) return text;
        const [r, g, b] = parseHex(color);
        // >= 140 reads as a light background, so switch the text to black
        const fg = luma(r, g, b) >= 140 ? 0 : 255;
        open =
          backgroundOpen(level, r, g, b) + foregroundOpen(level, fg, fg, fg);
        cacheSet(background, color, open);
      }
      return open + text + RESET;
    },
    dim(text: string): string {
      return DIM_OPEN + text + DIM_CLOSE;
    },
  };
}

const stylers = new Map<ColorLevel, Styler>([[0, PLAIN]]);

/** Get the shared {@link Styler} for a colour depth. */
export function createStyler(level: ColorLevel): Styler {
  let styler = stylers.get(level);
  if (!styler) {
    styler = buildStyler(level);
    stylers.set(level, styler);
  }
  return styler;
}

/** Just enough of a stream for colour detection. */
export interface StreamLike {
  isTTY?: boolean | undefined;
}

/** CI providers that render ANSI colour but do not report a TTY. */
const COLOR_CAPABLE_CI = [
  "GITHUB_ACTIONS",
  "GITEA_ACTIONS",
  "GITLAB_CI",
  "CIRCLECI",
  "TRAVIS",
  "APPVEYOR",
  "BUILDKITE",
  "DRONE",
  "TEAMCITY_VERSION",
];

/**
 * Work out what a stream supports, honouring the `NO_COLOR` & `FORCE_COLOR`
 * conventions. Explicit environment settings win over TTY detection, which is
 * what lets `FORCE_COLOR=3` colour a piped log file & `NO_COLOR=1` strip
 * colour from an interactive terminal.
 */
export function detectColorLevel(
  stream?: StreamLike,
  env: Record<string, string | undefined> = process.env,
): ColorLevel {
  // https://no-color.org: any non empty value disables colour
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return 0;

  const force = env.FORCE_COLOR;
  if (force !== undefined) {
    if (force === "0" || force === "false") return 0;
    if (force === "1" || force === "true" || force === "") return 1;
    if (force === "2") return 2;
    return 3;
  }

  if (env.TERM === "dumb") return 0;

  if (stream?.isTTY !== true) {
    // not a terminal: only trust CI providers known to interpret escapes
    if (env.CI !== undefined && COLOR_CAPABLE_CI.some((key) => env[key] !== undefined)) {
      return 1;
    }
    return 0;
  }

  const colorterm = env.COLORTERM;
  if (colorterm === "truecolor" || colorterm === "24bit") return 3;

  const term = env.TERM ?? "";
  if (/-256(color)?$/i.test(term)) return 2;
  if (/^(screen|xterm|vt100|vt220|rxvt|konsole|gnome|alacritty|putty|cygwin|linux|ansi)/i.test(term)) {
    return 1;
  }
  // a TTY that won't say what it is still almost certainly does 16 colours
  return 1;
}

let override: ColorLevel | null = null;
/** Bumped by {@link setColorLevel} so cached stylers know to re resolve. */
let version = 0;

/**
 * Force a colour depth process wide, or pass `null` to go back to
 * auto detection. Mainly for tests & for apps that expose a `--color` flag.
 */
export function setColorLevel(level: ColorLevel | null): void {
  override = level;
  version += 1;
}

/** The forced colour depth, or `null` when detection is in charge. */
export function getColorLevel(): ColorLevel | null {
  return override;
}

/**
 * Turn a `colors` option into a concrete depth. `true` means "assume a modern
 * terminal" (truecolour) rather than "whatever was detected", because a caller
 * who explicitly asks for colour on a piped stream wants the hex they
 * configured, not an 8-colour approximation of it.
 */
export function resolveColorLevel(option: ColorOption | undefined, stream?: StreamLike): ColorLevel {
  if (option === false) return 0;
  if (option === true) return 3;
  if (typeof option === "number") return option;
  return override ?? detectColorLevel(stream);
}

/**
 * Config time colour guard. An invalid value is reported & dropped rather
 * than passed through, because a typo would otherwise render as black text on a
 * black terminal & look like the logger had broken.
 */
export function checkColor(color: string | undefined, where: string): string | undefined {
  if (color === undefined || isHexColor(color)) return color;
  report(
    "invalid-color",
    `${where}: invalid colour ${JSON.stringify(color)} - expected "#RGB" or "#RRGGBB"; ignoring.`,
  );
  return undefined;
}

/**
 * A styler that follows {@link setColorLevel} after the fact, so an app that
 * parses `--no-color` *after* building its logger still gets plain output. The
 * check is an integer compare per line; re detection only happens on a change.
 */
export function createStylerResolver(
  colors: ColorOption | undefined,
  stream?: StreamLike,
): () => Styler {
  let seen = version;
  let styler = createStyler(resolveColorLevel(colors, stream));
  return () => {
    if (seen !== version) {
      seen = version;
      styler = createStyler(resolveColorLevel(colors, stream));
    }
    return styler;
  };
}
