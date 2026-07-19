import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, Logger } from "../src/logger";
import type {
  LogEntry,
  LogLevel,
  TimezoneAwareTransport,
  Transport,
} from "../src/types";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function capture(): { entries: LogEntry[]; transport: Transport } {
  const entries: LogEntry[] = [];
  return { entries, transport: { write: (entry) => entries.push(entry) } };
}

describe("config validation", () => {
  it("rejects an invalid minLevel", () => {
    expect(() => new Logger({ minLevel: "bogus" as LogLevel })).toThrow(TypeError);
  });

  it("rejects unknown keys in levels", () => {
    expect(
      () => new Logger({ levels: { verbose: { color: "#FFF" } } as never }),
    ).toThrow(TypeError);
  });

  it("rejects an invalid setLevel argument", () => {
    const log = new Logger();
    expect(() => log.setLevel("bogus" as LogLevel)).toThrow(TypeError);
  });

  it("rejects an invalid setLevelStyle level", () => {
    const log = new Logger();
    expect(() => log.setLevelStyle("bogus" as LogLevel, {})).toThrow(TypeError);
  });

  it("warns and keeps the default when a constructor level color is invalid", () => {
    const log = new Logger({ levels: { info: { color: "#bad-ctor", display: "II" } } });
    expect(console.warn).toHaveBeenCalledOnce();
    const info = log.listLevels().info;
    expect(info.color).toBe("#4AA3FF");
    expect(info.display).toBe("II");
  });

  it("merges partial style overrides onto defaults", () => {
    const log = new Logger({ levels: { info: { display: "INFO*" } } });
    const info = log.listLevels().info;
    expect(info.display).toBe("INFO*");
    expect(info.color).toBe("#4AA3FF");
  });
});

describe("level filtering", () => {
  it("drops entries below minLevel and honors setLevel", () => {
    const { entries, transport } = capture();
    const log = new Logger({ minLevel: "warn" });
    log.addTransport(transport);
    log.info("dropped");
    log.warn("kept");
    log.error("kept");
    log.fatal("kept");
    expect(entries.map((e) => e.level)).toEqual(["warn", "error", "fatal"]);
    log.setLevel("trace");
    log.trace("now kept");
    log.debug("also kept");
    expect(entries).toHaveLength(5);
  });
});

describe("scope and context", () => {
  it("binds a context, with the per-call context winning", () => {
    const { entries, transport } = capture();
    const log = new Logger();
    log.addTransport(transport);
    const db = log.scope("db");
    db.info("a");
    db.info("b", "override");
    log.info("c");
    expect(entries.map((e) => e.context)).toEqual(["db", "override", undefined]);
  });

  it("treats blank contexts as absent and re-scoping as replacement", () => {
    const { entries, transport } = capture();
    const log = new Logger();
    log.addTransport(transport);
    log.info("a", "   ");
    log.scope("one").scope("two").info("b");
    expect(entries[0].context).toBeUndefined();
    expect(entries[1].context).toBe("two");
  });
});

describe("transport handling", () => {
  it("swallows transport errors and keeps writing to the rest", () => {
    const { entries, transport } = capture();
    const log = new Logger();
    log.addTransport({
      write: () => {
        throw new Error("sink down");
      },
    });
    log.addTransport(transport);
    expect(() => log.info("hi")).not.toThrow();
    expect(entries).toHaveLength(1);
  });

  it("forwards setTimezone only to timezone-aware transports", () => {
    const setTimezone = vi.fn();
    const log = new Logger();
    log.addTransport({ write: () => {} });
    const aware: TimezoneAwareTransport = { write: () => {}, setTimezone };
    log.addTransport(aware);
    log.setTimezone("UTC");
    expect(setTimezone).toHaveBeenCalledWith("UTC");
    log.setTimezone();
    expect(setTimezone).toHaveBeenLastCalledWith("local");
  });
});

describe("listLevels / setLevelStyle", () => {
  it("returns detached copies", () => {
    const log = new Logger();
    const first = log.listLevels();
    first.info.color = "#000000";
    expect(log.listLevels().info.color).toBe("#4AA3FF");
  });

  it("updates shared styles across scopes", () => {
    const log = new Logger();
    log.scope("child").setLevelStyle("warn", { color: "#123456" });
    expect(log.listLevels().warn.color).toBe("#123456");
  });

  it("drops an invalid setLevelStyle color with a warning", () => {
    const log = new Logger();
    log.setLevelStyle("info", { color: "#bad-style" });
    expect(console.warn).toHaveBeenCalledOnce();
    expect(log.listLevels().info.color).toBe("#4AA3FF");
  });

  it("fills defaults when the shared store is missing entries", () => {
    const sparse = new Logger(undefined, {
      levels: new Map(),
      transports: [],
      minLevel: "trace",
    });
    expect(sparse.listLevels().info.color).toBe("#4AA3FF");
    sparse.setLevelStyle("info", { display: "I" });
    expect(sparse.listLevels().info).toEqual({ color: "#AAAAAA", display: "I" });
  });
});

describe("createLogger", () => {
  it("builds default and configured instances", () => {
    expect(createLogger()).toBeInstanceOf(Logger);
    expect(createLogger({ default: true })).toBeInstanceOf(Logger);
    expect(createLogger({ minLevel: "info" })).toBeInstanceOf(Logger);
  });

  it("rejects default:true combined with overrides", () => {
    expect(() =>
      createLogger({ default: true, minLevel: "error" } as never),
    ).toThrow(TypeError);
  });
});
