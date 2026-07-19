import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_LEVELS } from "../src/levels";
import { Logger } from "../src/logger";
import type { LogEntry } from "../src/types";

type Attached = Record<string, (message: unknown, context?: string) => void>;

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

describe("attach", () => {
  it("works on class instances and exposes all six levels", () => {
    class Client {}
    const client = new Client();
    log.attach(client);
    const logs = (client as Client & { logs: Attached }).logs;
    for (const level of LOG_LEVELS) {
      logs[level](`msg-${level}`, "bot");
    }
    expect(entries.map((e) => e.level)).toEqual([...LOG_LEVELS]);
    expect(entries[0].context).toBe("bot");
  });

  it("supports a custom key", () => {
    const target: { log?: Attached } = {};
    log.attach(target, "log");
    target.log!.info("hi");
    expect(entries[0].message).toBe("hi");
  });

  it("rejects prototype-polluting keys", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      expect(() => log.attach({}, key)).toThrow(TypeError);
    }
  });

  it("warns when overwriting an existing property", () => {
    const target = { logs: "already here" };
    log.attach(target);
    expect(console.warn).toHaveBeenCalledOnce();
    expect((target as unknown as { logs: Attached }).logs.info).toBeTypeOf("function");
  });
});
