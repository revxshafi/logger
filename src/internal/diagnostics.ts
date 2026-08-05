/**
 * The logger's own complaints channel.
 *
 * A library must never be the reason an application prints something the
 * operator can't turn off, & it must never write to the very `console` the
 * host may have replaced. Every internal problem (a bad colour in the config,
 * an unknown timezone, a transport that threw) is reported here instead of
 * going straight to `console.warn`.
 *
 * Two properties matter:
 *
 * - **Overridable.** {@link setDiagnosticsHandler} lets an app route these into
 *   its own error tracking, or silence them entirely.
 * - **Deduplicated.** A transport failing on every line would otherwise emit a
 *   warning per log call. Each distinct `code:message` pair is reported once.
 */

/** Machine readable reasons a diagnostic can be raised. */
export type DiagnosticCode =
  | "invalid-color"
  | "invalid-timezone"
  | "transport-error"
  | "transport-flush-error"
  | "transport-close-error"
  | "write-error"
  | "attach-overwrite"
  | "lazy-message-error"
  | "deprecated-option";

/** A single internal problem, as handed to a {@link DiagnosticHandler}. */
export interface Diagnostic {
  /** Stable identifier, safe to switch on. */
  readonly code: DiagnosticCode;
  /** Human readable description, already includes the offending value. */
  readonly message: string;
  /** The underlying throwable, when the diagnostic came from a `catch`. */
  readonly cause?: unknown;
}

/** Receives every internal problem the logger runs into. */
export type DiagnosticHandler = (diagnostic: Diagnostic) => void;

/**
 * Writes to `process.stderr` directly rather than `console.error`, so a host
 * that has patched or captured `console` doesn't get log shaped noise mixed
 * into its own output, & so diagnostics keep working during shutdown.
 */
function defaultHandler(diagnostic: Diagnostic): void {
  const suffix =
    diagnostic.cause instanceof Error ? ` (${diagnostic.cause.message})` : "";
  try {
    process.stderr.write(`[logger] ${diagnostic.message}${suffix}\n`);
    /* c8 ignore next 3 -- only reachable on a broken/closed stderr */
  } catch {
    // stderr itself is gone; there is genuinely nowhere left to report
  }
}

let handler: DiagnosticHandler = defaultHandler;

/**
 * Route internal warnings somewhere else, or pass `null` to restore the default
 * (a single line on stderr). Pass `() => {}` to silence them.
 */
export function setDiagnosticsHandler(next: DiagnosticHandler | null): void {
  handler = next ?? defaultHandler;
}

/** Deduplication keys seen so far, capped so this can never grow unbounded. */
const seen = new Set<string>();
const SEEN_LIMIT = 512;

/** Forget which diagnostics have already been reported. Exposed for tests. */
export function resetDiagnostics(): void {
  seen.clear();
}

/**
 * Report an internal problem at most once per distinct `code` + `message`.
 * Never throws: a broken handler must not take down the logging call that
 * happened to trip over it.
 */
export function report(code: DiagnosticCode, message: string, cause?: unknown): void {
  const key = `${code}:${message}`;
  if (seen.has(key)) return;
  if (seen.size >= SEEN_LIMIT) seen.clear();
  seen.add(key);
  try {
    handler({ code, message, cause });
  } catch {
    // a handler that throws is the host's bug, & not worth escalating here
  }
}
