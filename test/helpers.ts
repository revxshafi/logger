import { setDiagnosticsHandler, resetDiagnostics } from "../src/internal/diagnostics";
import type { Diagnostic } from "../src/internal/diagnostics";
import type { WritableLike } from "../src/types";

/** A stream that keeps what was written to it. */
export class FakeStream implements WritableLike {
  readonly chunks: string[] = [];
  isTTY: boolean | undefined;

  constructor(isTTY?: boolean) {
    this.isTTY = isTTY;
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  /** Written lines, without their trailing newline. */
  get lines(): string[] {
    return this.chunks.map((chunk) => chunk.replace(/\n$/, ""));
  }

  get text(): string {
    return this.chunks.join("");
  }
}

/**
 * Collect diagnostics raised during `run`. Dedup state is reset first, since it
 * is process wide & would otherwise swallow a repeat of an earlier test's
 * message.
 */
export function captureDiagnostics(): {
  entries: Diagnostic[];
  restore: () => void;
  codes: () => string[];
} {
  const entries: Diagnostic[] = [];
  resetDiagnostics();
  setDiagnosticsHandler((diagnostic) => entries.push(diagnostic));
  return {
    entries,
    codes: () => entries.map((entry) => entry.code),
    restore: () => {
      setDiagnosticsHandler(null);
      resetDiagnostics();
    },
  };
}

/** Strip ANSI SGR sequences, for asserting on text rather than styling. */
export function plain(text: string): string {
  return text.replace(/\u001B\[[0-9;]*m/g, "");
}

/** A fixed instant, so timestamp assertions are stable. */
export const FIXED = new Date("2026-08-04T14:05:32.123Z");
