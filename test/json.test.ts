import { describe, expect, it } from "vitest";
import { jsonFormat } from "../src/formats/json";
import { LogRecord } from "../src/record";
import { FIXED } from "./helpers";
import type { LogFields } from "../src/types";

const format = jsonFormat();

function parse(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

function entry(
  message: unknown,
  context?: string,
  fields?: LogFields,
  level: "info" | "error" = "info",
) {
  return new LogRecord(level, message, context, fields, FIXED);
}

describe("jsonFormat", () => {
  it("puts time and level first, then the message", () => {
    const line = format(entry("Connected", "MongoDB"));
    expect(parse(line)).toEqual({
      time: "2026-08-04T14:05:32.123Z",
      level: "info",
      context: "MongoDB",
      msg: "Connected",
    });
    // fixed keys lead, so a human skimming the stream sees them first
    expect(Object.keys(parse(line))).toEqual(["time", "level", "context", "msg"]);
  });

  it("keeps an object structured instead of embedding rendered text", () => {
    const parsed = parse(format(entry({ orderId: 7, items: [1, 2] })));
    expect(parsed.data).toEqual({ orderId: 7, items: [1, 2] });
    expect(parsed).not.toHaveProperty("msg");
  });

  it("splits an error into a message and an err object", () => {
    const parsed = parse(format(entry(new Error("kaboom"), undefined, undefined, "error")));
    expect(parsed.msg).toBe("kaboom");
    expect(parsed.err).toMatchObject({ type: "Error", message: "kaboom" });
    expect((parsed.err as { stack: string }).stack).toContain("kaboom");
  });

  it("merges base and per-entry fields", () => {
    const withBase = jsonFormat({ base: { service: "api" } });
    expect(parse(withBase(entry("x", undefined, { requestId: "r1" })))).toMatchObject({
      service: "api",
      requestId: "r1",
    });
  });

  it("refuses to let a field overwrite a reserved key", () => {
    const withBase = jsonFormat({ base: { level: "spoofed" } });
    const parsed = parse(withBase(entry("x", undefined, { level: "also-spoofed", msg: "no" })));
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("x");
  });

  it("makes a __proto__ field an ordinary property", () => {
    const parsed = parse(format(entry("x", undefined, { ["__proto__"]: { polluted: true } })));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(JSON.stringify(parsed)).toContain("polluted");
  });

  it("keeps a field whose name collides with an inherited property", () => {
    // `key in out` would see Object.prototype.toString & drop this silently
    const parsed = parse(format(entry("x", undefined, { toString: "kept", valueOf: 1 })));
    expect(Object.entries(parsed)).toContainEqual(["toString", "kept"]);
    expect(Object.entries(parsed)).toContainEqual(["valueOf", 1]);
  });

  it("renames keys on request", () => {
    const renamed = jsonFormat({
      timeKey: "@timestamp",
      messageKey: "message",
      contextKey: "logger",
    });
    expect(parse(renamed(entry("x", "api")))).toEqual({
      "@timestamp": "2026-08-04T14:05:32.123Z",
      level: "info",
      logger: "api",
      message: "x",
    });
  });

  it("writes epoch milliseconds on request", () => {
    expect(parse(jsonFormat({ time: "epoch" })(entry("x"))).time).toBe(FIXED.getTime());
  });

  it("adds a numeric severity on request", () => {
    expect(parse(jsonFormat({ severity: true })(entry("x"))).severity).toBe(30);
    expect(parse(format(entry("x")))).not.toHaveProperty("severity");
  });

  it("writes null for an invalid timestamp rather than throwing", () => {
    const broken = new LogRecord("info", "x", undefined, undefined, new Date("nonsense"));
    expect(parse(format(broken)).time).toBeNull();
    expect(parse(jsonFormat({ time: "epoch" })(broken)).time).toBeNull();
  });

  it("encodes values plain JSON would reject", () => {
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic.self = cyclic;
    expect(parse(format(entry(cyclic))).data).toEqual({ name: "root", self: "[Circular]" });
    expect(parse(format(entry("x", undefined, { n: 1n }))).n).toBe("1n");
  });

  it("still emits a parseable line for a hostile value", () => {
    const hostile = {
      get boom(): never {
        throw new Error("getter exploded");
      },
    };
    expect(() => parse(format(entry("x", undefined, { hostile })))).not.toThrow();
  });
});
