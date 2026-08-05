import { describe, expect, it } from "vitest";
import { createTimeFormatter } from "../src/internal/time";
import { captureDiagnostics, FIXED } from "./helpers";

const INVALID = new Date("nonsense");

describe("createTimeFormatter", () => {
  it("renders time only by default", () => {
    expect(createTimeFormatter("time", "UTC")(FIXED)).toBe("14:05:32");
  });

  it("renders date and time in DD-MM-YYYY order", () => {
    expect(createTimeFormatter("datetime", "UTC")(FIXED)).toBe("04-08-2026 14:05:32");
  });

  it("renders ISO in UTC, ignoring the requested zone", () => {
    expect(createTimeFormatter("iso", "Asia/Dhaka")(FIXED)).toBe("2026-08-04T14:05:32.123Z");
  });

  it("renders nothing for style none", () => {
    expect(createTimeFormatter("none", "UTC")(FIXED)).toBe("");
  });

  it("respects the timezone", () => {
    // Dhaka is UTC+6 year round
    expect(createTimeFormatter("time", "Asia/Dhaka")(FIXED)).toBe("20:05:32");
  });

  it("renders midnight as 00, not 24", () => {
    const midnight = new Date("2026-08-04T00:00:00.000Z");
    expect(createTimeFormatter("time", "UTC")(midnight)).toBe("00:00:00");
  });

  it("defaults to local time in the default style", () => {
    expect(createTimeFormatter()(FIXED)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("yields a fixed-width placeholder for an invalid date", () => {
    expect(createTimeFormatter("time", "UTC")(INVALID)).toBe("--:--:--");
    expect(createTimeFormatter("datetime", "UTC")(INVALID)).toBe("---------- --:--:--");
    expect(createTimeFormatter("iso", "UTC")(INVALID)).toBe("invalid-date");
  });

  it("falls back to local time and reports an unknown zone", () => {
    const diagnostics = captureDiagnostics();
    try {
      const format = createTimeFormatter("time", "Mars/Olympus_Mons");
      expect(format(FIXED)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(diagnostics.codes()).toEqual(["invalid-timezone"]);
    } finally {
      diagnostics.restore();
    }
  });

  it("memoises within a second and recomputes across one", () => {
    const format = createTimeFormatter("time", "UTC");
    expect(format(FIXED)).toBe("14:05:32");
    expect(format(new Date("2026-08-04T14:05:32.900Z"))).toBe("14:05:32");
    expect(format(new Date("2026-08-04T14:05:33.000Z"))).toBe("14:05:33");
  });
});
