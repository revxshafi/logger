import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../src/logger";
import type { LogEntry } from "../src/types";

let entries: LogEntry[];
let log: Logger;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  entries = [];
  log = new Logger();
  log.addTransport({ write: (entry) => entries.push(entry) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function serialized(value: unknown): string {
  log.info(value);
  return entries[entries.length - 1].message;
}

describe("serialize (via Logger)", () => {
  it("passes strings through untouched", () => {
    expect(serialized("plain")).toBe("plain");
  });

  it("uses the stack for errors, falling back to the message", () => {
    const err = new Error("boom");
    expect(serialized(err)).toBe(err.stack);
    const stackless = new Error("no stack");
    stackless.stack = undefined;
    expect(serialized(stackless)).toBe("no stack");
  });

  it("recognizes cross-realm errors", () => {
    const foreign: unknown = runInNewContext("new Error('other realm')");
    expect(foreign instanceof Error).toBe(false);
    expect(serialized(foreign)).toContain("other realm");
  });

  it("renders bigints with the n suffix", () => {
    expect(serialized(123n)).toBe("123n");
  });

  it("pretty-prints plain objects and arrays as JSON", () => {
    expect(serialized({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
    expect(serialized([1, 2])).toBe(JSON.stringify([1, 2], null, 2));
    expect(serialized(Object.assign(Object.create(null), { x: 1 }))).toContain('"x": 1');
  });

  it("falls back to inspect when JSON.stringify throws or returns undefined", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(serialized(circular)).toContain("[Circular");
    expect(serialized({ big: 10n })).toContain("10n");
    expect(serialized({ toJSON: () => undefined })).toContain("toJSON");
  });

  it("uses inspect for non-plain objects", () => {
    expect(serialized(new Map([["k", "v"]]))).toContain("Map");
    class Widget {
      size = 3;
    }
    expect(serialized(new Widget())).toContain("Widget");
  });

  it("stringifies remaining primitives", () => {
    expect(serialized(42)).toBe("42");
    expect(serialized(true)).toBe("true");
    expect(serialized(null)).toBe("null");
    expect(serialized(undefined)).toBe("undefined");
    expect(serialized(Symbol("tag"))).toBe("Symbol(tag)");
  });

  it("survives an error whose stack getter throws", () => {
    const hostile: unknown = Object.create(Error.prototype, {
      stack: {
        get() {
          throw new Error("gotcha");
        },
      },
    });
    expect(() => log.info(hostile)).not.toThrow();
    expect(typeof entries[0].message).toBe("string");
  });

  it("survives a revoked proxy", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(() => log.info(proxy)).not.toThrow();
    expect(entries[0].message).toContain("Revoked");
  });
});
