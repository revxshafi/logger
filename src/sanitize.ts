/**
 * Terminal-output sanitization. Logged data is untrusted: a string containing
 * escape sequences can clear the consumer's screen, retitle the window, or
 * forge log lines. `LogEntry` itself stays raw -- this is applied by
 * `ConsoleTransport`, the one sink that writes to a terminal.
 */

// keep SGR color codes (ESC[...m) so pre-colored messages still render; strip
// every other C0/C1 control plus DEL. Stripping only the ESC byte leaves the
// sequence body visible (e.g. "[2J"), which is harmless and handy for forensics.
const SGR_OR_CONTROL =
  /(\u001B\[[0-9;]*m)|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

const INLINE_BREAKS = /[\t\n\r]/g;

/** Strip terminal control characters, keeping `\t` `\n` `\r` and SGR colors. */
export function sanitizeMessage(text: string): string {
  return text.replace(SGR_OR_CONTROL, (_match, sgr: string | undefined) => sgr ?? "");
}

/** For single-token fields (context tag, level badge): no line breaks either. */
export function sanitizeInline(text: string): string {
  return sanitizeMessage(text).replace(INLINE_BREAKS, " ");
}
