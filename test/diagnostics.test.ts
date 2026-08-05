import { afterEach, describe, expect, it, vi } from "vitest";
import {
  report,
  resetDiagnostics,
  setDiagnosticsHandler,
} from "../src/internal/diagnostics";
import type { Diagnostic } from "../src/internal/diagnostics";

afterEach(() => {
  setDiagnosticsHandler(null);
  resetDiagnostics();
});

describe("report", () => {
  it("delivers code, message and cause to the handler", () => {
    const seen: Diagnostic[] = [];
    setDiagnosticsHandler((diagnostic) => seen.push(diagnostic));
    const cause = new Error("boom");
    report("transport-error", "a transport threw.", cause);
    expect(seen).toEqual([
      { code: "transport-error", message: "a transport threw.", cause },
    ]);
  });

  it("reports each distinct message only once", () => {
    const seen: Diagnostic[] = [];
    setDiagnosticsHandler((diagnostic) => seen.push(diagnostic));
    report("write-error", "same");
    report("write-error", "same");
    report("write-error", "different");
    expect(seen).toHaveLength(2);
  });

  it("clears its dedup set rather than growing without bound", () => {
    const seen: Diagnostic[] = [];
    setDiagnosticsHandler((diagnostic) => seen.push(diagnostic));
    for (let i = 0; i < 600; i += 1) report("write-error", `message ${i}`);
    expect(seen).toHaveLength(600);
    // the first message rolled out of the set, so it is reportable again
    report("write-error", "message 0");
    expect(seen).toHaveLength(601);
  });

  it("survives a handler that throws", () => {
    setDiagnosticsHandler(() => {
      throw new Error("handler is broken");
    });
    expect(() => report("write-error", "anything")).not.toThrow();
  });

  it("writes one line to stderr by default, never to console", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      report("invalid-timezone", "bad zone.", new Error("cause text"));
      expect(write).toHaveBeenCalledWith("[logger] bad zone. (cause text)\n");
      expect(consoleError).not.toHaveBeenCalled();

      report("invalid-timezone", "no cause here.");
      expect(write).toHaveBeenLastCalledWith("[logger] no cause here.\n");
    } finally {
      write.mockRestore();
      consoleError.mockRestore();
    }
  });
});
