/**
 * The human readable formats.
 *
 * Formatters own every presentation decision & return a finished line;
 * transports own only I/O. That split is why adding a layout no longer means
 * threading another boolean through the logger, its options type, & the
 * console transport => which is exactly how `dev`, `devColor`, `timeColor` and
 * `showDate` accumulated in the first place.
 */
import { checkColor, createStylerResolver, type Styler } from "../internal/ansi";
import {
  applyMultiline,
  sanitizeInline,
  sanitizeMessage,
} from "../internal/sanitize";
import { renderFieldValue } from "../internal/stringify";
import { createTimeFormatter } from "../internal/time";
import { levelConfigFor } from "../levels";
import type {
  DevFormatOptions,
  LogEntry,
  LogFields,
  LogFormatter,
  PrettyFormatOptions,
  TimestampStyle,
  TimezoneOption,
} from "../types";

const DEV_TIME_COLOR = "#AAFF22";
const DEV_MESSAGE_COLOR = "#2277FF";
const DEV_BADGE_WIDTH = 5;

/**
 * Render structured data as a trailing `key=value` run. Keys & values are
 * both untrusted, so both are flattened to a single line.
 */
function renderFields(fields: LogFields, styler: Styler): string {
  let out = "";
  for (const key of Object.keys(fields)) {
    const value = sanitizeInline(renderFieldValue(fields[key]));
    out += `${out === "" ? "" : " "}${sanitizeInline(key)}=${value}`;
  }
  return out === "" ? "" : styler.dim(out);
}

/**
 * The default layout: `[14:05:32] [INFO] [MongoDB] Connected db=primary`.
 *
 * Only metadata is coloured. The message body keeps the terminal's own colour
 * unless asked otherwise, so JSON & stack traces stay legible against any
 * background.
 */
export function prettyFormat(options: PrettyFormatOptions = {}): LogFormatter {
  const { levels, multiline = "keep", fields: showFields = true } = options;
  const style = options.timestamp ?? "time";
  const messageColor = checkColor(options.messageColor, "messageColor");
  const timeColor = checkColor(options.timeColor, "timeColor");
  const resolveStyler = createStylerResolver(options.colors, options.stream);

  let formatTime = createTimeFormatter(style, options.timezone);

  const format: LogFormatter = (entry: LogEntry): string => {
    const styler = resolveStyler();
    const config = levelConfigFor(levels, entry.level);
    const wantWidth = multiline === "indent";

    let line = "";
    let width = 0;

    const time = formatTime(entry.timestamp);
    if (time !== "") {
      const plain = `[${time}]`;
      line = (timeColor !== undefined ? styler.hex(timeColor, plain) : styler.dim(plain)) + " ";
      if (wantWidth) width += plain.length + 1;
    }

    const badge = `[${sanitizeInline(config.display)}]`;
    line += styler.hex(config.color, badge);
    if (wantWidth) width += badge.length;

    if (entry.context !== undefined) {
      const context = `[${sanitizeInline(entry.context)}]`;
      line += ` ${styler.dim(context)}`;
      if (wantWidth) width += context.length + 1;
    }

    let body = sanitizeMessage(entry.message);
    if (multiline !== "keep") {
      body = applyMultiline(body, multiline, " ".repeat(width + 1));
    }
    line += ` ${messageColor !== undefined ? styler.hex(messageColor, body) : body}`;

    if (showFields && entry.fields !== undefined) {
      const rendered = renderFields(entry.fields, styler);
      if (rendered !== "") line += ` ${rendered}`;
    }
    return line;
  };

  format.setTimezone = (timezone: TimezoneOption): void => {
    formatTime = createTimeFormatter(style, timezone);
  };
  return format;
}

/**
 * A compact layout with a fixed width badge, so message bodies line up down the
 * left edge: `[ 04-08-2026 14:05:32 ] [Mongo] Connected`.
 *
 * The badge holds the context when there is one & the level otherwise, drawn
 * as a background fill with black or white text picked for contrast.
 */
export function devFormat(options: DevFormatOptions = {}): LogFormatter {
  const {
    levels,
    multiline = "keep",
    fields: showFields = true,
    badgeWidth = DEV_BADGE_WIDTH,
  } = options;
  const style: TimestampStyle = options.timestamp ?? "datetime";
  const messageColor = checkColor(options.messageColor, "messageColor") ?? DEV_MESSAGE_COLOR;
  const timeColor = checkColor(options.timeColor, "timeColor") ?? DEV_TIME_COLOR;
  const resolveStyler = createStylerResolver(options.colors, options.stream);
  // a zero or negative width would silently swallow the badge
  const width = Math.max(1, Math.trunc(badgeWidth));

  let formatTime = createTimeFormatter(style, options.timezone);

  const format: LogFormatter = (entry: LogEntry): string => {
    const styler = resolveStyler();
    const config = levelConfigFor(levels, entry.level);

    // the context owns the single badge slot; the level fills in when absent
    const label = sanitizeInline(entry.context ?? config.display);
    const prefix = label.padEnd(width).slice(0, width);

    let line = "";
    let visible = 0;
    const time = formatTime(entry.timestamp);
    if (time !== "") {
      line = `[ ${styler.hex(timeColor, time)} ] `;
      visible += time.length + 5;
    }
    line += `[${styler.bgHex(config.color, prefix)}]`;
    visible += width + 2;

    let body = sanitizeMessage(entry.message);
    if (multiline !== "keep") {
      body = applyMultiline(body, multiline, " ".repeat(visible + 1));
    }
    line += ` ${styler.hex(messageColor, body)}`;

    if (showFields && entry.fields !== undefined) {
      const rendered = renderFields(entry.fields, styler);
      if (rendered !== "") line += ` ${rendered}`;
    }
    return line;
  };

  format.setTimezone = (timezone: TimezoneOption): void => {
    formatTime = createTimeFormatter(style, timezone);
  };
  return format;
}
