import chalk from "chalk";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { checkColor, isHexColor, styleHex } from "../src/color";

beforeAll(() => {
  chalk.level = 3;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isHexColor", () => {
  it("accepts #RGB and #RRGGBB", () => {
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("#A1B2C3")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isHexColor("blue")).toBe(false);
    expect(isHexColor("#ZZZZZZ")).toBe(false);
    expect(isHexColor("#abcd")).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
    expect(isHexColor(42)).toBe(false);
  });
});

describe("checkColor", () => {
  it("passes undefined and valid colors through", () => {
    expect(checkColor(undefined, "x")).toBeUndefined();
    expect(checkColor("#123456", "x")).toBe("#123456");
  });

  it("warns and drops invalid colors", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(checkColor("not-a-color", "myOption")).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("myOption");
  });
});

describe("styleHex", () => {
  it("colors text with a valid hex and caches the styler", () => {
    const first = styleHex("#00FF00", "#AAAAAA", "hi");
    const second = styleHex("#00FF00", "#AAAAAA", "hi");
    expect(first).toContain("38;2;0;255;0");
    expect(second).toBe(first);
  });

  it("falls back on invalid colors and warns only once per value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out1 = styleHex("#WAT-color", "#FF0000", "x");
    const out2 = styleHex("#WAT-color", "#FF0000", "x");
    expect(out1).toContain("38;2;255;0;0");
    expect(out2).toBe(out1);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("falls back when the color is undefined", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(styleHex(undefined, "#0000FF", "x")).toContain("38;2;0;0;255");
    expect(warn).toHaveBeenCalledOnce();
  });
});
