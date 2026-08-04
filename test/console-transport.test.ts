import chalk from "chalk";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleTransport } from "../src/transports/console";
import type { LevelConfig, LogEntry, LogLevel } from "../src/types";

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const strip = (text: string): string => text.replace(ANSI, "");

const NOON = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return { level: "info", message: "hello", timestamp: NOON, ...overrides };
}

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  chalk.level = 3;
});

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const lastCall = (spy: ReturnType<typeof vi.spyOn>): string =>
  String(spy.mock.calls[spy.mock.calls.length - 1]?.[0]);
const lastLine = (): string => lastCall(logSpy);

describe("normal format", () => {
  it("lays out time, badge, context and message", () => {
    const transport = new ConsoleTransport({ timezone: "UTC" });
    transport.write(entry({ context: "db" }));
    expect(strip(lastLine())).toBe("[12:00:00] [INFO] [db] hello");
    transport.write(entry());
    expect(strip(lastLine())).toBe("[12:00:00] [INFO] hello");
  });

  it("colors the badge with the level color and leaves the body plain", () => {
    const transport = new ConsoleTransport({ timezone: "UTC" });
    transport.write(entry());
    const line = lastLine();
    expect(line).toContain("38;2;74;163;255");
    expect(line.endsWith("hello")).toBe(true);
  });

  it("colors the body when messageColor is set", () => {
    const transport = new ConsoleTransport({ timezone: "UTC", messageColor: "#FF0000" });
    transport.write(entry());
    expect(lastLine()).toContain("38;2;255;0;0");
  });

  it("drops an invalid messageColor with a warning", () => {
    const transport = new ConsoleTransport({ timezone: "UTC", messageColor: "#nope-msg" });
    expect(warnSpy).toHaveBeenCalledOnce();
    transport.write(entry());
    expect(lastLine().endsWith("hello")).toBe(true);
  });

  it("falls back for missing or invalid level configs", () => {
    const levels = new Map<LogLevel, LevelConfig>([
      ["warn", { color: "#nope-level", display: "W\nARN" }],
    ]);
    const transport = new ConsoleTransport({ timezone: "UTC", levels });
    transport.write(entry());
    expect(strip(lastLine())).toBe("[12:00:00] [INFO] hello");
    transport.write(entry({ level: "warn" }));
    const line = lastCall(warnSpy);
    expect(strip(line)).toBe("[12:00:00] [W ARN] hello");
    expect(line).toContain("38;2;170;170;170");
  });
});

describe("dev format", () => {
  it("renders the minimal layout with the default color", () => {
    const transport = new ConsoleTransport({ timezone: "UTC", dev: true });
    transport.write(entry());
    expect(strip(lastLine())).toBe("[ 01-01-2024 12:00:00 ] [INFO ] hello");
    expect(lastLine()).toContain("38;2;34;119;255");
  });

  it("colors the timestamp and gives the badge a background", () => {
    const transport = new ConsoleTransport({ timezone: "UTC", dev: true });
    transport.write(entry());
    expect(lastLine()).toContain("38;2;170;255;34");
    expect(lastLine()).toContain("48;2;74;163;255");
  });

  it("honours a custom timeColor", () => {
    const transport = new ConsoleTransport({
      timezone: "UTC",
      dev: true,
      timeColor: "#FF0000",
    });
    transport.write(entry());
    expect(lastLine()).toContain("38;2;255;0;0");
  });

  it("pads and truncates the prefix to a fixed width", () => {
    const transport = new ConsoleTransport({ timezone: "UTC", dev: true });
    transport.write(entry({ context: "db" }));
    expect(strip(lastLine())).toBe("[ 01-01-2024 12:00:00 ] [db   ] hello");
    transport.write(entry({ context: "verylongcontext" }));
    expect(strip(lastLine())).toBe("[ 01-01-2024 12:00:00 ] [veryl] hello");
  });

  it("picks black text on light badges and white on dark", () => {
    const light = new ConsoleTransport({
      timezone: "UTC",
      dev: true,
      levels: new Map<LogLevel, LevelConfig>([["info", { color: "#FFFFFF", display: "INFO" }]]),
    });
    light.write(entry());
    expect(lastLine()).toContain("38;2;0;0;0");

    const dark = new ConsoleTransport({
      timezone: "UTC",
      dev: true,
      levels: new Map<LogLevel, LevelConfig>([["info", { color: "#000000", display: "INFO" }]]),
    });
    dark.write(entry());
    expect(lastLine()).toContain("38;2;255;255;255");
  });

  it("expands shorthand hex badges", () => {
    const transport = new ConsoleTransport({
      timezone: "UTC",
      dev: true,
      levels: new Map<LogLevel, LevelConfig>([["info", { color: "#FFF", display: "INFO" }]]),
    });
    transport.write(entry());
    expect(lastLine()).toContain("48;2;255;255;255");
  });

  it("falls back when the badge color is invalid", () => {
    const transport = new ConsoleTransport({
      timezone: "UTC",
      dev: true,
      levels: new Map<LogLevel, LevelConfig>([["info", { color: "nope", display: "INFO" }]]),
    });
    transport.write(entry());
    expect(lastLine()).toContain("48;2;170;170;170");
  });

  it("prefers the context over the level in the prefix slot", () => {
    const transport = new ConsoleTransport({ timezone: "UTC", dev: true });
    transport.write(entry({ context: "boot" }));
    expect(strip(lastLine())).toBe("[ 01-01-2024 12:00:00 ] [boot ] hello");
  });

  it("resolves devColor, then messageColor, then the default", () => {
    const custom = new ConsoleTransport({ timezone: "UTC", dev: true, devColor: "#00FF00" });
    custom.write(entry());
    expect(lastLine()).toContain("38;2;0;255;0");

    const viaMessage = new ConsoleTransport({
      timezone: "UTC",
      dev: true,
      messageColor: "#FF00FF",
    });
    viaMessage.write(entry());
    expect(lastLine()).toContain("38;2;255;0;255");
  });

  it("warns on an invalid devColor and falls back", () => {
    const transport = new ConsoleTransport({ timezone: "UTC", dev: true, devColor: "#nope-dev" });
    expect(warnSpy).toHaveBeenCalledOnce();
    transport.write(entry());
    expect(lastLine()).toContain("38;2;34;119;255");
  });

  it("renders a placeholder for an invalid timestamp", () => {
    const transport = new ConsoleTransport({ timezone: "UTC", dev: true });
    transport.write(entry({ timestamp: new Date(NaN) }));
    expect(strip(lastLine())).toBe("[ ----- ---- --:--:-- ] [INFO ] hello");
  });
});

describe("showDate", () => {
  it("stays off in the normal format by default", () => {
    const transport = new ConsoleTransport({ timezone: "UTC" });
    transport.write(entry());
    expect(strip(lastLine())).toBe("[12:00:00] [INFO] hello");
  });

  it("adds the date to the normal format when enabled", () => {
    const transport = new ConsoleTransport({ timezone: "UTC", showDate: true });
    transport.write(entry());
    expect(strip(lastLine())).toBe("[01-01-2024 12:00:00] [INFO] hello");
  });

  it("can be turned off in dev mode", () => {
    const transport = new ConsoleTransport({ timezone: "UTC", dev: true, showDate: false });
    transport.write(entry());
    expect(strip(lastLine())).toBe("[ 12:00:00 ] [INFO ] hello");
  });

  it("survives a timezone swap", () => {
    const transport = new ConsoleTransport({ timezone: "UTC", showDate: true });
    transport.setTimezone("Asia/Kolkata");
    transport.write(entry());
    expect(strip(lastLine())).toBe("[01-01-2024 17:30:00] [INFO] hello");
  });
});

describe("sanitization", () => {
  it("strips escape sequences from the message and flattens the context", () => {
    const transport = new ConsoleTransport({ timezone: "UTC" });
    transport.write(entry({ message: `x${ESC}[2Jy`, context: "a\nb" }));
    expect(strip(lastLine())).toBe("[12:00:00] [INFO] [a b] x[2Jy");
  });
});

describe("hostile entries", () => {
  it("survives an invalid Date timestamp", () => {
    const transport = new ConsoleTransport({ timezone: "UTC" });
    transport.write(entry({ timestamp: new Date(NaN) }));
    expect(strip(lastLine())).toBe("[--:--:--] [INFO] hello");
  });
});

describe("stderr routing", () => {
  it("routes error/fatal to console.error, warn to console.warn, rest to console.log", () => {
    const transport = new ConsoleTransport({ timezone: "UTC" });
    transport.write(entry({ level: "error" }));
    transport.write(entry({ level: "fatal" }));
    transport.write(entry({ level: "warn" }));
    transport.write(entry({ level: "trace" }));
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledOnce();
  });
});

describe("setTimezone", () => {
  it("rebuilds the formatter at runtime", () => {
    const transport = new ConsoleTransport({ timezone: "UTC" });
    transport.write(entry());
    expect(strip(lastLine())).toContain("12:00:00");
    transport.setTimezone("Asia/Dhaka");
    transport.write(entry());
    expect(strip(lastLine())).toContain("18:00:00");
    transport.setTimezone();
    transport.write(entry());
    expect(strip(lastLine())).toMatch(/^\[\d{2}:\d{2}:\d{2}\]/);
  });
});
