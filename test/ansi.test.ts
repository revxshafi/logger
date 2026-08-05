import { afterEach, describe, expect, it } from "vitest";
import {
  checkColor,
  createStyler,
  createStylerResolver,
  detectColorLevel,
  getColorLevel,
  isHexColor,
  resolveColorLevel,
  setColorLevel,
} from "../src/internal/ansi";
import { captureDiagnostics } from "./helpers";

const ESC = "\u001B";

afterEach(() => {
  setColorLevel(null);
});

describe("isHexColor", () => {
  it("accepts both hex forms and rejects everything else", () => {
    expect(isHexColor("#fff")).toBe(true);
    expect(isHexColor("#FF00AA")).toBe(true);
    expect(isHexColor("#ff00a")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor(0xff00aa)).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });
});

describe("styler", () => {
  it("is a no-op at level 0", () => {
    const styler = createStyler(0);
    expect(styler.enabled).toBe(false);
    expect(styler.hex("#FF0000", "hi")).toBe("hi");
    expect(styler.bgHex("#FF0000", "hi")).toBe("hi");
    expect(styler.dim("hi")).toBe("hi");
  });

  it("emits truecolor at level 3 and expands #RGB", () => {
    const styler = createStyler(3);
    expect(styler.hex("#FF0000", "hi")).toBe(`${ESC}[38;2;255;0;0mhi${ESC}[0m`);
    expect(styler.hex("#f00", "hi")).toBe(`${ESC}[38;2;255;0;0mhi${ESC}[0m`);
  });

  it("downsamples to the 256-colour cube and its greyscale ramp", () => {
    const styler = createStyler(2);
    expect(styler.hex("#FF0000", "x")).toBe(`${ESC}[38;5;196mx${ESC}[0m`);
    // pure greys take the ramp, with the two ends clamped to the cube
    expect(styler.hex("#000000", "x")).toBe(`${ESC}[38;5;16mx${ESC}[0m`);
    expect(styler.hex("#FFFFFF", "x")).toBe(`${ESC}[38;5;231mx${ESC}[0m`);
    expect(styler.hex("#808080", "x")).toBe(`${ESC}[38;5;244mx${ESC}[0m`);
    // a background fill takes the same cube, with contrasting text over it
    expect(styler.bgHex("#FF0000", "x")).toBe(
      `${ESC}[48;5;196m${ESC}[38;5;231mx${ESC}[0m`,
    );
  });

  it("downsamples to the 16 basic colours", () => {
    const styler = createStyler(1);
    expect(styler.hex("#000000", "x")).toBe(`${ESC}[30mx${ESC}[0m`);
    expect(styler.hex("#FFFFFF", "x")).toBe(`${ESC}[97mx${ESC}[0m`);
    expect(styler.hex("#808080", "x")).toBe(`${ESC}[37mx${ESC}[0m`);
    expect(styler.bgHex("#000000", "x")).toBe(`${ESC}[40m${ESC}[97mx${ESC}[0m`);
  });

  it("picks a readable foreground for a background fill", () => {
    const styler = createStyler(3);
    // light background gets black text
    expect(styler.bgHex("#FFFF00", "x")).toContain("38;2;0;0;0m");
    // dark background gets white text
    expect(styler.bgHex("#000080", "x")).toContain("38;2;255;255;255m");
  });

  it("returns text untouched for an unparseable colour", () => {
    const styler = createStyler(3);
    expect(styler.hex("nope", "x")).toBe("x");
    expect(styler.bgHex("nope", "x")).toBe("x");
  });

  it("dims with 22 rather than a full reset, so it can nest", () => {
    expect(createStyler(3).dim("x")).toBe(`${ESC}[2mx${ESC}[22m`);
  });

  it("keeps its caches bounded", () => {
    const styler = createStyler(3);
    for (let i = 0; i < 300; i += 1) {
      const hex = `#${i.toString(16).padStart(6, "0")}`;
      styler.hex(hex, "x");
      styler.bgHex(hex, "x");
    }
    // still correct after the cache was cleared out from under it
    expect(styler.hex("#FF0000", "x")).toBe(`${ESC}[38;2;255;0;0mx${ESC}[0m`);
  });
});

describe("detectColorLevel", () => {
  const tty = { isTTY: true };
  const pipe = { isTTY: false };

  it("honours NO_COLOR for any non-empty value", () => {
    expect(detectColorLevel(tty, { NO_COLOR: "1" })).toBe(0);
    expect(detectColorLevel(tty, { NO_COLOR: "" })).toBe(1);
  });

  it("maps FORCE_COLOR onto a depth", () => {
    expect(detectColorLevel(pipe, { FORCE_COLOR: "0" })).toBe(0);
    expect(detectColorLevel(pipe, { FORCE_COLOR: "false" })).toBe(0);
    expect(detectColorLevel(pipe, { FORCE_COLOR: "1" })).toBe(1);
    expect(detectColorLevel(pipe, { FORCE_COLOR: "true" })).toBe(1);
    expect(detectColorLevel(pipe, { FORCE_COLOR: "" })).toBe(1);
    expect(detectColorLevel(pipe, { FORCE_COLOR: "2" })).toBe(2);
    expect(detectColorLevel(pipe, { FORCE_COLOR: "3" })).toBe(3);
  });

  it("treats a dumb terminal as colourless", () => {
    expect(detectColorLevel(tty, { TERM: "dumb" })).toBe(0);
  });

  it("colours known CI providers despite there being no TTY", () => {
    expect(detectColorLevel(pipe, { CI: "true", GITHUB_ACTIONS: "true" })).toBe(1);
    expect(detectColorLevel(pipe, { CI: "true" })).toBe(0);
    expect(detectColorLevel(undefined, {})).toBe(0);
  });

  it("reads the terminal's own advertisement", () => {
    expect(detectColorLevel(tty, { COLORTERM: "truecolor" })).toBe(3);
    expect(detectColorLevel(tty, { COLORTERM: "24bit" })).toBe(3);
    expect(detectColorLevel(tty, { TERM: "xterm-256color" })).toBe(2);
    expect(detectColorLevel(tty, { TERM: "xterm" })).toBe(1);
    expect(detectColorLevel(tty, { TERM: "something-odd" })).toBe(1);
    expect(detectColorLevel(tty, {})).toBe(1);
  });

  it("defaults to the process environment", () => {
    expect(typeof detectColorLevel()).toBe("number");
  });
});

describe("resolveColorLevel", () => {
  it("takes an explicit option over detection", () => {
    expect(resolveColorLevel(false, { isTTY: true })).toBe(0);
    expect(resolveColorLevel(true, { isTTY: false })).toBe(3);
    expect(resolveColorLevel(2, { isTTY: false })).toBe(2);
  });

  it("falls back to the process-wide override, then to detection", () => {
    expect(getColorLevel()).toBeNull();
    setColorLevel(2);
    expect(getColorLevel()).toBe(2);
    expect(resolveColorLevel(undefined, { isTTY: false })).toBe(2);
    setColorLevel(null);
    expect(resolveColorLevel(undefined, { isTTY: false })).toBe(0);
  });
});

describe("createStylerResolver", () => {
  it("re-resolves only after the override changes", () => {
    const resolve = createStylerResolver(undefined, { isTTY: false });
    const first = resolve();
    expect(first.level).toBe(0);
    expect(resolve()).toBe(first);

    setColorLevel(3);
    const second = resolve();
    expect(second.level).toBe(3);
    expect(resolve()).toBe(second);
  });

  it("ignores the override when a depth was pinned explicitly", () => {
    const resolve = createStylerResolver(1, { isTTY: false });
    setColorLevel(3);
    expect(resolve().level).toBe(1);
  });
});

describe("checkColor", () => {
  it("passes valid colours and undefined through", () => {
    expect(checkColor("#abc", "where")).toBe("#abc");
    expect(checkColor(undefined, "where")).toBeUndefined();
  });

  it("reports and drops an invalid colour", () => {
    const diagnostics = captureDiagnostics();
    try {
      expect(checkColor("rebeccapurple", "levels.info.color")).toBeUndefined();
      expect(diagnostics.codes()).toEqual(["invalid-color"]);
      expect(diagnostics.entries[0]?.message).toContain("levels.info.color");
    } finally {
      diagnostics.restore();
    }
  });
});
