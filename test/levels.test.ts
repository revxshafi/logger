import { describe, expect, it } from "vitest";
import { createDefaultLevels, isLogLevel, LOG_LEVELS, SEVERITY } from "../src/levels";

describe("LOG_LEVELS / SEVERITY", () => {
  it("lists the six levels in severity order", () => {
    expect(LOG_LEVELS).toEqual(["trace", "debug", "info", "warn", "error", "fatal"]);
    for (let i = 1; i < LOG_LEVELS.length; i++) {
      expect(SEVERITY[LOG_LEVELS[i]]).toBeGreaterThan(SEVERITY[LOG_LEVELS[i - 1]]);
    }
  });
});

describe("isLogLevel", () => {
  it("accepts all real levels", () => {
    for (const level of LOG_LEVELS) {
      expect(isLogLevel(level)).toBe(true);
    }
  });

  it("rejects non-levels, non-strings and prototype names", () => {
    expect(isLogLevel("bogus")).toBe(false);
    expect(isLogLevel("toString")).toBe(false);
    expect(isLogLevel(3)).toBe(false);
    expect(isLogLevel(undefined)).toBe(false);
  });
});

describe("createDefaultLevels", () => {
  it("returns a fresh, complete copy each call", () => {
    const a = createDefaultLevels();
    const b = createDefaultLevels();
    expect(a).not.toBe(b);
    for (const level of LOG_LEVELS) {
      expect(a.get(level)).toBeDefined();
      expect(a.get(level)).not.toBe(b.get(level));
    }
    a.get("info")!.color = "#000000";
    expect(b.get("info")!.color).not.toBe("#000000");
  });
});
