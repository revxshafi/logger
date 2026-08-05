import type { MultilineMode } from "../types";

/**
 * Terminal output safety.
 *
 * Logged data is untrusted. A string carrying escape sequences can clear the
 * operator's screen, retitle their window, move the cursor to overwrite earlier
 * lines, or (with enough newlines) forge log entries that look like they came
 * from the application. Anything bound for a terminal passes through here
 * first; the `LogEntry` handed to custom transports stays raw, because a file
 * or database sink may legitimately want the original bytes.
 */

/**
 * Matches either a complete SGR (colour/style) sequence, which is captured and
 * kept, or a single control character, which is dropped.
 *
 * Colour sequences survive so that pre styled messages still render. Stripping
 * only the `ESC` of any other sequence leaves its body as visible text => a
 * clear screen becomes the literal `[2J`, which is harmless to the terminal
 * & preserves evidence of the attempt.
 */
const SGR_OR_CONTROL =
  /(\u001B\[[0-9;]*m)|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * The same character class as above, without the SGR alternative & without
 * the `g` flag: a cheap "is there anything to do?" probe. The overwhelming
 * majority of log lines are clean, & this lets them skip the rewrite (and its
 * allocation) entirely.
 */
const HAS_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

const BREAKS = /[\t\n\r]/g;
const NEWLINES = /\r\n|[\n\r]/g;
// `test()` on a /g regex advances `lastIndex` & so gives different answers on
// repeat calls; the probes below are deliberately non global.
const HAS_BREAK = /[\t\n\r]/;
const HAS_NEWLINE = /[\n\r]/;

/** Strip terminal control characters, keeping `\t` `\n` `\r` & SGR colours. */
export function sanitizeMessage(text: string): string {
  if (!HAS_CONTROL.test(text)) return text;
  return text.replace(SGR_OR_CONTROL, (_match, sgr: string | undefined) => sgr ?? "");
}

/** For single token fields (context tag, level badge): no line breaks either. */
export function sanitizeInline(text: string): string {
  const cleaned = sanitizeMessage(text);
  return HAS_BREAK.test(cleaned) ? cleaned.replace(BREAKS, " ") : cleaned;
}

/**
 * Collapse a message onto a single line. Worth doing when log lines are
 * consumed line by line downstream, where a stack trace would otherwise arrive
 * as twenty unrelated looking entries, & where an attacker could inject a
 * newline to forge one.
 */
export function escapeBreaks(text: string): string {
  if (!HAS_BREAK.test(text)) return text;
  return text.replace(BREAKS, (char) =>
    char === "\n" ? "\\n" : char === "\r" ? "\\r" : "\\t",
  );
}

/** Indent every line after the first, so a stack trace lines up under itself. */
export function indentBreaks(text: string, indent: string): string {
  if (!HAS_NEWLINE.test(text)) return text;
  return text.replace(NEWLINES, `\n${indent}`);
}

/** Apply a {@link MultilineMode} to an already sanitized message body. */
export function applyMultiline(
  text: string,
  mode: MultilineMode,
  indent: string,
): string {
  if (mode === "escape") return escapeBreaks(text);
  if (mode === "indent") return indentBreaks(text, indent);
  return text;
}
