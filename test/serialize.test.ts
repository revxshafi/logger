import { describe, expect, it } from "vitest";
import { serialize } from "../src/internal/serialize";

describe("serialize", () => {
  it("passes strings through untouched", () => {
    expect(serialize("hello")).toBe("hello");
  });

  it("renders primitives the way a reader expects", () => {
    expect(serialize(42)).toBe("42");
    expect(serialize(true)).toBe("true");
    expect(serialize(null)).toBe("null");
    expect(serialize(undefined)).toBe("undefined");
    expect(serialize(10n)).toBe("10n");
    expect(serialize(Symbol("tag"))).toBe("Symbol(tag)");
  });

  it("prints an error's stack rather than duplicating its message", () => {
    const error = new Error("kaboom");
    const text = serialize(error);
    expect(text).toContain("Error: kaboom");
    expect(text.indexOf("kaboom")).toBe(text.lastIndexOf("kaboom"));
  });

  it("falls back to the message when there is no stack", () => {
    const error = new Error("no stack");
    error.stack = undefined;
    expect(serialize(error)).toBe("no stack");
  });

  it("shows a cause chain, which a stack alone would hide", () => {
    const error = new Error("outer", { cause: new Error("inner") });
    expect(serialize(error)).toContain("inner");
  });

  it("shows the members of an AggregateError", () => {
    const error = new AggregateError([new Error("first")], "many");
    expect(serialize(error)).toContain("first");
  });

  it("ignores a hostile property getter while probing an error", () => {
    const error = new Error("hostile");
    Object.defineProperty(error, "cause", {
      get() {
        throw new Error("nope");
      },
    });
    expect(serialize(error)).toContain("hostile");
  });

  it("pretty-prints plain objects and arrays", () => {
    expect(serialize({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(serialize([1, 2])).toBe("[\n  1,\n  2\n]");
    expect(serialize(Object.create(null))).toBe("{}");
  });

  it("uses inspect for shapes JSON would flatten to {}", () => {
    expect(serialize(new Map([["k", 1]]))).toContain("Map(1)");
    expect(serialize(new Set([1]))).toContain("Set(1)");
    expect(serialize(/ab+c/)).toBe("/ab+c/");
  });

  it("falls back to inspect when stringify refuses", () => {
    // toJSON returning undefined makes JSON.stringify yield undefined
    expect(serialize({ toJSON: () => undefined })).toContain("toJSON");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(serialize(cyclic)).toContain("[Circular");
    expect(serialize({ big: 1n })).toContain("1n");
  });

  it("survives a value that defeats every ordinary path", () => {
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    expect(() => serialize(revocable.proxy)).not.toThrow();
  });

  it("truncates a huge render and says how much was dropped", () => {
    const text = serialize("x".repeat(100), { maxLength: 10 });
    expect(text.startsWith("x".repeat(10))).toBe(true);
    expect(text).toContain("[truncated 90 characters]");
  });

  it("treats maxLength 0 as no limit", () => {
    expect(serialize("x".repeat(100), { maxLength: 0 })).toHaveLength(100);
  });

  it("honours the depth bound", () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    expect(serialize(new Map([["deep", deep]]), { depth: 1 })).toContain("[Object]");
  });
});
