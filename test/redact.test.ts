import { describe, expect, it } from "vitest";
import { createRedactor } from "../src/internal/redact";

describe("createRedactor", () => {
  it("returns undefined when there is nothing to redact", () => {
    expect(createRedactor(undefined)).toBeUndefined();
    expect(createRedactor([])).toBeUndefined();
    expect(createRedactor(["", ""])).toBeUndefined();
  });

  it("masks matching keys case-insensitively", () => {
    const redact = createRedactor(["Password"])!;
    expect(redact({ password: "hunter2", user: "ana" })).toEqual({
      password: "[redacted]",
      user: "ana",
    });
  });

  it("masks at any depth, including inside arrays", () => {
    const redact = createRedactor(["token"])!;
    expect(
      redact({ auth: { token: "abc", kind: "bearer" }, list: [{ token: "def" }] }),
    ).toEqual({
      auth: { token: "[redacted]", kind: "bearer" },
      list: [{ token: "[redacted]" }],
    });
  });

  it("does not mutate the caller's object", () => {
    const redact = createRedactor(["secret"])!;
    const original = { secret: "value", nested: { secret: "value" } };
    const result = redact(original);
    expect(original.secret).toBe("value");
    expect(original.nested.secret).toBe("value");
    expect(result).not.toBe(original);
  });

  it("passes class instances through rather than cloning them", () => {
    class Model {
      constructor(readonly token: string) {}
    }
    const redact = createRedactor(["token"])!;
    const model = new Model("abc");
    const result = redact({ model }) as { model: Model };
    // cloning would change how the instance behaves for whatever reads it later
    expect(result.model).toBe(model);
  });

  it("terminates on a cycle, cloning the shared node once", () => {
    const redact = createRedactor(["secret"])!;
    const node: Record<string, unknown> = { secret: "x" };
    node.self = node;
    const result = redact(node) as Record<string, unknown>;
    expect(result.secret).toBe("[redacted]");
    expect(result.self).toBe(result);
  });

  it("truncates rather than descending forever", () => {
    const redact = createRedactor(["secret"])!;
    let deep: Record<string, unknown> = { secret: "leaf" };
    for (let i = 0; i < 40; i += 1) deep = { next: deep };
    expect(JSON.stringify(redact(deep))).toContain("[truncated]");
  });

  it("leaves primitives and null alone", () => {
    const redact = createRedactor(["secret"])!;
    expect(redact({ a: 1, b: null, c: undefined, d: "text" })).toEqual({
      a: 1,
      b: null,
      c: undefined,
      d: "text",
    });
  });

  it("ignores non-string entries in the key list", () => {
    const redact = createRedactor(["token", 42 as unknown as string])!;
    expect(redact({ token: "x" })).toEqual({ token: "[redacted]" });
  });
});
