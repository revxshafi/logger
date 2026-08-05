import { describe, expect, it } from "vitest";
import { renderFieldValue, safeStringify } from "../src/internal/stringify";

/** A function with no inferable name, as an inline arrow would get one. */
function anonymous(): () => void {
  return () => {};
}

describe("safeStringify", () => {
  it("encodes ordinary values compactly", () => {
    expect(safeStringify({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
    expect(safeStringify(undefined)).toBeUndefined();
  });

  it("encodes values JSON.stringify would throw on", () => {
    expect(safeStringify({ n: 9n })).toBe('{"n":"9n"}');
  });

  it("names functions and symbols instead of dropping them", () => {
    expect(safeStringify({ fn: function named() {} })).toBe('{"fn":"[Function named]"}');
    expect(safeStringify({ fn: () => {} })).toBe('{"fn":"[Function fn]"}');
    expect(safeStringify({ fn: anonymous() })).toBe('{"fn":"[Function anonymous]"}');
    expect(safeStringify({ s: Symbol("tag") })).toBe('{"s":"Symbol(tag)"}');
  });

  it("renders an error as fields rather than as {}", () => {
    const encoded = safeStringify({ err: new Error("bad") });
    expect(encoded).toContain('"message":"bad"');
    expect(encoded).toContain('"name":"Error"');
  });

  it("marks cycles without corrupting diamonds", () => {
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic.self = cyclic;
    expect(safeStringify(cyclic)).toBe('{"name":"root","self":"[Circular]"}');

    // the same object on two branches is not a cycle & must survive intact
    const shared = { id: 1 };
    expect(safeStringify({ left: shared, right: shared })).toBe(
      '{"left":{"id":1},"right":{"id":1}}',
    );
  });

  it("detects a cycle nested several levels down", () => {
    const root: Record<string, unknown> = { a: { b: {} } };
    ((root.a as Record<string, unknown>).b as Record<string, unknown>).back = root;
    expect(safeStringify(root)).toContain("[Circular]");
  });

  it("returns a note instead of throwing on a hostile value", () => {
    const hostile = {
      get boom(): never {
        throw new Error("getter exploded");
      },
    };
    expect(safeStringify(hostile)).toBe('"[unencodable: getter exploded]"');
  });

  it("survives a thrown non-error", () => {
    const hostile = {
      toJSON() {
        throw "just a string";
      },
    };
    expect(safeStringify(hostile)).toBe('"[unencodable: unknown error]"');
  });
});

describe("renderFieldValue", () => {
  it("leaves simple tokens unquoted", () => {
    expect(renderFieldValue("primary")).toBe("primary");
    expect(renderFieldValue("a/b:c@d.e+f-g")).toBe("a/b:c@d.e+f-g");
    expect(renderFieldValue("")).toBe("");
  });

  it("quotes anything ambiguous", () => {
    expect(renderFieldValue("two words")).toBe('"two words"');
    expect(renderFieldValue("has=equals")).toBe('"has=equals"');
  });

  it("renders the remaining primitives", () => {
    expect(renderFieldValue(3)).toBe("3");
    expect(renderFieldValue(true)).toBe("true");
    expect(renderFieldValue(7n)).toBe("7n");
    expect(renderFieldValue(undefined)).toBe("undefined");
    expect(renderFieldValue(null)).toBe("null");
    expect(renderFieldValue(function go() {})).toBe("[Function go]");
    expect(renderFieldValue(anonymous())).toBe("[Function anonymous]");
    expect(renderFieldValue(Symbol("s"))).toBe("Symbol(s)");
  });

  it("renders dates as ISO, and invalid ones as a marker", () => {
    expect(renderFieldValue(new Date("2026-08-04T14:05:32.000Z"))).toBe(
      "2026-08-04T14:05:32.000Z",
    );
    expect(renderFieldValue(new Date("nonsense"))).toBe("invalid-date");
  });

  it("falls back to compact JSON for objects", () => {
    expect(renderFieldValue({ a: 1 })).toBe('{"a":1}');
    expect(renderFieldValue([1, 2])).toBe("[1,2]");
    // an object that encodes to nothing still yields a printable token
    expect(renderFieldValue({ toJSON: () => undefined })).toBe("undefined");
  });
});
