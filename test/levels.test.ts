import { describe, expect, it } from "vitest";
import {
  createDefaultLevels,
  isLevelThreshold,
  isLogLevel,
  levelConfigFor,
  levelNames,
  LOG_LEVELS,
  SEVERITY,
  THRESHOLD,
} from "../src/levels";

describe("level tables", () => {
  it("orders the six levels by severity", () => {
    const ranks = LOG_LEVELS.map((level) => SEVERITY[level]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("is frozen, so one consumer cannot break filtering for the process", () => {
    expect(Object.isFrozen(LOG_LEVELS)).toBe(true);
    expect(Object.isFrozen(SEVERITY)).toBe(true);
    expect(Object.isFrozen(THRESHOLD)).toBe(true);
  });

  it("puts silent above every level, so a plain compare drops everything", () => {
    expect(THRESHOLD.silent).toBe(Number.POSITIVE_INFINITY);
    expect(SEVERITY.fatal < THRESHOLD.silent).toBe(true);
  });
});

describe("guards", () => {
  it("accepts real levels and rejects everything else", () => {
    expect(isLogLevel("info")).toBe(true);
    expect(isLogLevel("silent")).toBe(false);
    expect(isLogLevel("INFO")).toBe(false);
    expect(isLogLevel(30)).toBe(false);
    // inherited names must not sneak through
    expect(isLogLevel("toString")).toBe(false);
    expect(isLogLevel("constructor")).toBe(false);
  });

  it("accepts silent only as a threshold", () => {
    expect(isLevelThreshold("silent")).toBe(true);
    expect(isLevelThreshold("info")).toBe(true);
    expect(isLevelThreshold("toString")).toBe(false);
  });
});

describe("levelNames", () => {
  it("lists the levels, optionally including silent", () => {
    expect(levelNames()).toBe("trace, debug, info, warn, error, fatal");
    expect(levelNames(true)).toContain("silent");
  });
});

describe("createDefaultLevels", () => {
  it("gives every level a hex colour and a display label", () => {
    const levels = createDefaultLevels();
    expect(levels.size).toBe(LOG_LEVELS.length);
    for (const level of LOG_LEVELS) {
      const config = levels.get(level)!;
      expect(config.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(config.display).toBe(level.toUpperCase());
    }
  });

  it("hands out a fresh map each call, so styling cannot leak between loggers", () => {
    const first = createDefaultLevels();
    const second = createDefaultLevels();
    first.get("info")!.color = "#000000";
    expect(second.get("info")!.color).not.toBe("#000000");
  });
});

describe("levelConfigFor", () => {
  it("returns the configured style when it is usable", () => {
    const levels = createDefaultLevels();
    expect(levelConfigFor(levels, "info")).toBe(levels.get("info"));
  });

  it("synthesises a style for a sparse or missing map", () => {
    expect(levelConfigFor(undefined, "warn")).toEqual({
      color: "#AAAAAA",
      display: "WARN",
    });
    expect(levelConfigFor(new Map(), "warn")).toEqual({
      color: "#AAAAAA",
      display: "WARN",
    });
  });

  it("keeps the label but replaces an unusable colour", () => {
    const levels = new Map([["info", { color: "not-a-colour", display: "INF" }]] as const);
    expect(levelConfigFor(new Map(levels), "info")).toEqual({
      color: "#AAAAAA",
      display: "INF",
    });
  });
});
