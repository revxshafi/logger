import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimeFormatter } from "../src/timestamp";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createTimeFormatter", () => {
  it("formats UTC times as HH:MM:SS", () => {
    const format = createTimeFormatter("UTC");
    expect(format(new Date(Date.UTC(2024, 0, 1, 15, 4, 5)))).toBe("15:04:05");
  });

  it("renders midnight as 00, not 24", () => {
    const format = createTimeFormatter("UTC");
    expect(format(new Date(Date.UTC(2024, 0, 1, 0, 0, 0)))).toBe("00:00:00");
  });

  it("supports named IANA zones", () => {
    const format = createTimeFormatter("Asia/Dhaka");
    expect(format(new Date(Date.UTC(2024, 0, 1, 0, 0, 0)))).toBe("06:00:00");
  });

  it("uses the local zone by default and for 'local'", () => {
    const date = new Date(2024, 0, 1, 9, 8, 7);
    expect(createTimeFormatter()(date)).toBe("09:08:07");
    expect(createTimeFormatter("local")(date)).toBe("09:08:07");
  });

  it("renders a placeholder for invalid dates instead of throwing", () => {
    const format = createTimeFormatter("UTC");
    expect(format(new Date(NaN))).toBe("--:--:--");
  });

  it("reports invalid zones and falls back to local instead of throwing", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const format = createTimeFormatter("Not/AZone");
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).toContain("Not/AZone");
    expect(format(new Date())).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
