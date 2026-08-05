import { describe, expect, it, vi } from "vitest";
import { LogRecord } from "../src/record";
import { FIXED } from "./helpers";

describe("LogRecord", () => {
  it("carries the raw value alongside the rendered text", () => {
    const raw = { orderId: 7 };
    const record = new LogRecord("info", raw, "orders", { attempt: 1 }, FIXED);
    expect(record.raw).toBe(raw);
    expect(record.level).toBe("info");
    expect(record.context).toBe("orders");
    expect(record.fields).toEqual({ attempt: 1 });
    expect(record.timestamp).toBe(FIXED);
  });

  it("does not serialize until something reads the message", () => {
    const toJSON = vi.fn(() => ({ read: true }));
    const record = new LogRecord("info", { toJSON }, undefined, undefined, FIXED);
    expect(toJSON).not.toHaveBeenCalled();
    expect(record.message).toBe('{\n  "read": true\n}');
    expect(toJSON).toHaveBeenCalledTimes(1);
  });

  it("serializes at most once, even for an empty render", () => {
    const toString = vi.fn(() => "");
    const record = new LogRecord("info", { toString }, undefined, undefined, FIXED);
    expect(record.message).toBe("{}");
    expect(record.message).toBe("{}");

    const counted = vi.fn(() => "text");
    const other = new LogRecord(
      "info",
      { toJSON: counted },
      undefined,
      undefined,
      FIXED,
    );
    expect(other.message).toBe(other.message);
    expect(counted).toHaveBeenCalledTimes(1);
  });

  it("honours the serialize bounds it was given", () => {
    const record = new LogRecord("info", "x".repeat(50), undefined, undefined, FIXED, {
      maxLength: 5,
    });
    expect(record.message).toContain("[truncated 45 characters]");
  });

  it("keeps the message visible to JSON.stringify despite the getter", () => {
    const record = new LogRecord("warn", "hello", "api", { a: 1 }, FIXED);
    const parsed = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
    expect(parsed).toEqual({
      level: "warn",
      message: "hello",
      context: "api",
      fields: { a: 1 },
      timestamp: FIXED.toISOString(),
    });
  });

  it("omits absent context and fields, and never emits raw", () => {
    const record = new LogRecord("info", { big: true }, undefined, undefined, FIXED);
    const json = record.toJSON();
    expect(Object.keys(json)).toEqual(["level", "message", "timestamp"]);
    expect(json).not.toHaveProperty("raw");
  });
});
