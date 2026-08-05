import { describe, expect, it, vi } from "vitest";
import { createLogger, Logger } from "../src/logger";
import { MemoryTransport } from "../src/transports/memory";
import { StreamTransport } from "../src/transports/stream";
import { captureDiagnostics, FakeStream, plain } from "./helpers";
import type { LogEntry, Transport } from "../src/types";

/** A logger writing to a memory sink & nothing else. */
function harness(options: Record<string, unknown> = {}) {
  const sink = new MemoryTransport();
  const logger = createLogger({ transports: [sink], ...options });
  return {
    sink,
    logger,
    last: (): LogEntry | undefined => sink.entries()[sink.size - 1],
  };
}

describe("construction", () => {
  it("attaches a console transport when no transports are named", () => {
    const logger = createLogger();
    expect(logger.listTransports()).toHaveLength(1);
  });

  it("does not attach one when transports are named", () => {
    const { logger } = harness();
    expect(logger.listTransports()).toHaveLength(1);
  });

  it("attaches one alongside named transports when asked explicitly", () => {
    const logger = createLogger({ transports: [new MemoryTransport()], console: {} });
    expect(logger.listTransports()).toHaveLength(2);
  });

  it("attaches none when the console is switched off", () => {
    expect(createLogger({ console: false }).listTransports()).toHaveLength(0);
  });

  it("rejects an invalid minimum level rather than failing open", () => {
    expect(() => createLogger({ minLevel: "verbose" as never })).toThrow(TypeError);
    expect(() => createLogger({ minLevel: "verbose" as never })).toThrow(/expected one of/);
  });

  it("rejects serialization bounds that would mangle output", () => {
    expect(() => createLogger({ serialize: { depth: -1 } })).toThrow(/non-negative/);
    expect(() => createLogger({ serialize: { maxLength: Number.NaN } })).toThrow(/non-negative/);
    expect(() => createLogger({ serialize: { depth: "4" as never } })).toThrow(TypeError);
  });

  it("rejects an unknown level key instead of ignoring the style", () => {
    expect(() => createLogger({ levels: { verbose: { color: "#FFF" } } as never })).toThrow(
      /invalid key/,
    );
  });

  it("reports the obsolete default option instead of honouring it", () => {
    const diagnostics = captureDiagnostics();
    try {
      createLogger({ default: true, console: false } as never);
      expect(diagnostics.codes()).toEqual(["deprecated-option"]);
    } finally {
      diagnostics.restore();
    }
  });

  it("is constructible directly as well as through the factory", () => {
    expect(new Logger({ console: false })).toBeInstanceOf(Logger);
  });
});

describe("emitting", () => {
  it("records level, message and time", () => {
    const { logger, last } = harness();
    logger.info("hello");
    expect(last()).toMatchObject({ level: "info", message: "hello" });
    expect(last()!.timestamp).toBeInstanceOf(Date);
  });

  it("exposes all six levels", () => {
    const { logger, sink } = harness();
    logger.trace("a");
    logger.debug("b");
    logger.info("c");
    logger.warn("d");
    logger.error("e");
    logger.fatal("f");
    expect(sink.entries().map((entry) => entry.level)).toEqual([
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ]);
  });

  it("takes a context string or fields as the second argument", () => {
    const { logger, sink } = harness();
    logger.info("a", "db");
    logger.info("b", { userId: 7 });
    logger.info("c", "db", { userId: 7 });
    const [first, second, third] = sink.entries();
    expect(first).toMatchObject({ context: "db", fields: undefined });
    expect(second).toMatchObject({ context: undefined, fields: { userId: 7 } });
    expect(third).toMatchObject({ context: "db", fields: { userId: 7 } });
  });

  it("ignores a meta argument that is neither, but keeps the fields", () => {
    const { logger, last } = harness();
    logger.info("a", null as never, { userId: 7 });
    expect(last()).toMatchObject({ context: undefined, fields: { userId: 7 } });
  });

  it("treats a blank context as no context", () => {
    const { logger, last } = harness();
    logger.info("a", "   ");
    expect(last()!.context).toBeUndefined();
  });

  it("logs at a level chosen at runtime, ignoring an unknown one", () => {
    const { logger, sink } = harness();
    logger.log("warn", "a");
    logger.log("verbose" as never, "b");
    expect(sink.messages()).toEqual(["a"]);
  });

  it("calls a lazy message only when it will be logged", () => {
    const build = vi.fn(() => "expensive");
    const { logger, last } = harness({ minLevel: "info" });
    logger.debug(build);
    expect(build).not.toHaveBeenCalled();
    logger.info(build);
    expect(build).toHaveBeenCalledTimes(1);
    expect(last()!.message).toBe("expensive");
  });

  it("logs the failure when a lazy message throws", () => {
    const diagnostics = captureDiagnostics();
    try {
      const { logger, last } = harness();
      logger.info(() => {
        throw new Error("boom");
      });
      expect(diagnostics.codes()).toEqual(["lazy-message-error"]);
      expect(last()!.message).toContain("boom");
    } finally {
      diagnostics.restore();
    }
  });

  it("passes a function that takes arguments through as a value", () => {
    // only a zero argument thunk is treated as a lazy message
    const { logger, last } = harness();
    logger.info((x: number) => x);
    expect(last()!.message).toContain("=>");
  });

  it("redacts configured keys at any depth", () => {
    const { logger, last } = harness({ redact: ["password"] });
    logger.info("login", { user: { name: "ada", password: "hunter2" } });
    expect(last()!.fields).toEqual({ user: { name: "ada", password: "[redacted]" } });
  });
});

describe("level filtering", () => {
  it("drops calls below the threshold", () => {
    const { logger, sink } = harness({ minLevel: "warn" });
    logger.info("dropped");
    logger.warn("kept");
    expect(sink.messages()).toEqual(["kept"]);
  });

  it("does not render a message it will not log", () => {
    const { logger } = harness({ minLevel: "error" });
    const hostile = {
      toString() {
        throw new Error("must not be called");
      },
    };
    expect(() => logger.info(hostile)).not.toThrow();
  });

  it("drops everything when silent", () => {
    const { logger, sink } = harness({ minLevel: "silent" });
    logger.fatal("dropped");
    expect(sink.size).toBe(0);
    expect(logger.level).toBe("silent");
  });

  it("reports the level in force", () => {
    const { logger } = harness({ minLevel: "debug" });
    expect(logger.level).toBe("debug");
    logger.setLevel("error");
    expect(logger.level).toBe("error");
  });

  it("answers whether a level is enabled", () => {
    const { logger } = harness({ minLevel: "warn" });
    expect(logger.isLevelEnabled("info")).toBe(false);
    expect(logger.isLevelEnabled("error")).toBe(true);
    expect(logger.isLevelEnabled("verbose" as never)).toBe(false);
  });

  it("rejects an invalid level on setLevel", () => {
    const { logger } = harness();
    expect(() => logger.setLevel("loud" as never)).toThrow(TypeError);
  });

  it("moves the whole family when set on an unpinned logger", () => {
    const { logger, sink } = harness();
    const child = logger.child({ context: "db" });
    child.setLevel("error");
    logger.info("dropped");
    child.info("dropped too");
    expect(sink.size).toBe(0);
    expect(logger.level).toBe("error");
  });

  it("moves only the pin on a logger pinned by child({ minLevel })", () => {
    const { logger, sink } = harness();
    const quiet = logger.child({ minLevel: "error" });
    quiet.info("dropped");
    logger.info("kept");
    expect(sink.messages()).toEqual(["kept"]);

    quiet.setLevel("trace");
    quiet.trace("now kept");
    expect(logger.level).toBe("trace");
    expect(sink.messages()).toEqual(["kept", "now kept"]);
  });

  it("rejects an invalid pin", () => {
    const { logger } = harness();
    expect(() => logger.child({ minLevel: "loud" as never })).toThrow(/child.minLevel/);
  });
});

describe("derivation", () => {
  it("replaces the context with scope()", () => {
    const { logger, sink } = harness({ context: "app" });
    logger.scope("db").info("a");
    expect(sink.entries()[0]!.context).toBe("db");
  });

  it("composes the context with child()", () => {
    const { logger, sink } = harness();
    const db = logger.child({ context: "db" });
    db.child({ context: "tx" }).info("a");
    expect(sink.entries()[0]!.context).toBe("db:tx");
  });

  it("keeps the parent context when a child names none", () => {
    const { logger, sink } = harness({ context: "app" });
    logger.child({ fields: { a: 1 } }).info("x");
    expect(sink.entries()[0]!.context).toBe("app");
  });

  it("drops the inherited context when asked to replace it", () => {
    const { logger, sink } = harness({ context: "app" });
    logger.child({ context: "db", replaceContext: true }).info("a");
    logger.child({ replaceContext: true }).info("b");
    expect(sink.entries().map((entry) => entry.context)).toEqual(["db", undefined]);
  });

  it("merges fields down the chain, with the newest winning", () => {
    const { logger, sink } = harness({ fields: { app: "api", env: "dev" } });
    logger.child({ fields: { env: "prod" } }).info("a", { req: 1 });
    expect(sink.entries()[0]!.fields).toEqual({ app: "api", env: "prod", req: 1 });
  });

  it("has a shorthand for fields alone", () => {
    const { logger, sink } = harness();
    logger.with({ requestId: "abc" }).info("a");
    expect(sink.entries()[0]!.fields).toEqual({ requestId: "abc" });
  });

  it("keeps a pin across scope() and further children", () => {
    const { logger, sink } = harness();
    const quiet = logger.child({ minLevel: "error" });
    quiet.scope("db").info("dropped");
    quiet.child({ context: "tx" }).info("dropped too");
    expect(sink.size).toBe(0);
  });

  it("shares transports with its children", () => {
    const { logger, sink } = harness();
    const child = logger.child({ context: "db" });
    const extra = new MemoryTransport();
    child.addTransport(extra);
    logger.info("a");
    expect(extra.messages()).toEqual(["a"]);
    expect(sink.messages()).toEqual(["a"]);
  });
});

describe("transports", () => {
  it("rejects anything that cannot be written to", () => {
    const { logger } = harness();
    expect(() => logger.addTransport(null as never)).toThrow(/write\(entry\)/);
    expect(() => logger.addTransport({} as never)).toThrow(TypeError);
    expect(() => logger.addTransport("stdout" as never)).toThrow(TypeError);
  });

  it("detaches one, reporting whether it was attached", () => {
    const { logger, sink } = harness();
    expect(logger.removeTransport(sink)).toBe(true);
    expect(logger.removeTransport(sink)).toBe(false);
    expect(logger.listTransports()).toEqual([]);
  });

  it("returns a snapshot of the list", () => {
    const { logger, sink } = harness();
    const list = logger.listTransports();
    logger.addTransport(new MemoryTransport());
    expect(list).toEqual([sink]);
  });

  it("honours a per-transport minimum level even on a third-party transport", () => {
    const seen: string[] = [];
    const custom: Transport = {
      minLevel: "error",
      write: (entry: LogEntry) => void seen.push(entry.level),
    };
    const { logger } = harness();
    logger.addTransport(custom);
    logger.info("a");
    logger.error("b");
    expect(seen).toEqual(["error"]);
  });

  it("ignores a nonsense minLevel on a third-party transport", () => {
    const seen: string[] = [];
    const { logger } = harness();
    logger.addTransport({
      minLevel: "loud" as never,
      write: (entry: LogEntry) => void seen.push(entry.level),
    });
    logger.info("a");
    expect(seen).toEqual(["info"]);
  });

  it("keeps writing to the others when one throws", () => {
    const diagnostics = captureDiagnostics();
    try {
      const { logger, sink } = harness();
      logger.addTransport({
        write() {
          throw new Error("sink down");
        },
      });
      const tail = new MemoryTransport();
      logger.addTransport(tail);
      expect(() => logger.info("a")).not.toThrow();
      expect(sink.messages()).toEqual(["a"]);
      expect(tail.messages()).toEqual(["a"]);
      expect(diagnostics.codes()).toEqual(["transport-error"]);
    } finally {
      diagnostics.restore();
    }
  });

  it("routes a transport failure to onError when one is given", () => {
    const onError = vi.fn();
    const logger = createLogger({
      console: false,
      onError,
      transports: [
        {
          write() {
            throw new Error("sink down");
          },
        },
      ],
    });
    logger.info("a");
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toBe("sink down");
  });

  it("reports an onError handler that itself throws", () => {
    const diagnostics = captureDiagnostics();
    try {
      const logger = createLogger({
        console: false,
        onError() {
          throw new Error("handler down");
        },
        transports: [
          {
            write() {
              throw new Error("sink down");
            },
          },
        ],
      });
      expect(() => logger.info("a")).not.toThrow();
      expect(diagnostics.entries[0]!.message).toContain("onError handler itself threw");
    } finally {
      diagnostics.restore();
    }
  });

  it("flushes and closes every transport", async () => {
    const flush = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const logger = createLogger({ console: false, transports: [{ write() {}, flush, close }] });
    await logger.close();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("resolves even when transports do not implement flush or close", async () => {
    const { logger } = harness();
    await expect(logger.close()).resolves.toBeUndefined();
  });

  it("reports a flush or close failure rather than rejecting", async () => {
    const diagnostics = captureDiagnostics();
    try {
      const logger = createLogger({
        console: false,
        transports: [
          {
            write() {},
            flush() {
              throw new Error("flush down");
            },
            close() {
              throw new Error("close down");
            },
          },
        ],
      });
      await expect(logger.close()).resolves.toBeUndefined();
      expect(diagnostics.codes()).toEqual(["transport-flush-error", "transport-close-error"]);
    } finally {
      diagnostics.restore();
    }
  });
});

describe("level styles", () => {
  it("applies partial overrides onto the defaults", () => {
    const logger = createLogger({ console: false, levels: { info: { display: "NOTE" } } });
    expect(logger.listLevels().info).toMatchObject({ display: "NOTE" });
    expect(logger.listLevels().info.color).toBeDefined();
  });

  it("drops an invalid colour rather than emitting a broken escape", () => {
    const diagnostics = captureDiagnostics();
    try {
      const logger = createLogger({ console: false, levels: { info: { color: "burgundy" } } });
      expect(logger.listLevels().info.color).toBe("#4AA3FF");
      expect(diagnostics.codes()).toEqual(["invalid-color"]);
    } finally {
      diagnostics.restore();
    }
  });

  it("restyles a level after construction", () => {
    const stream = new FakeStream();
    const logger = createLogger({
      console: { stdout: stream, stderr: stream, timezone: "UTC", colors: false },
    });
    logger.setLevelStyle("info", { display: "NOTE" });
    logger.info("a");
    expect(plain(stream.lines[0]!)).toContain("[NOTE]");
  });

  it("rejects an unknown level", () => {
    const { logger } = harness();
    expect(() => logger.setLevelStyle("verbose" as never, {})).toThrow(/invalid level/);
  });

  it("ignores an invalid colour on restyle", () => {
    const diagnostics = captureDiagnostics();
    try {
      const { logger } = harness();
      logger.setLevelStyle("info", { color: 42 as never });
      expect(logger.listLevels().info.color).toBe("#4AA3FF");
      expect(diagnostics.codes()).toEqual(["invalid-color"]);
    } finally {
      diagnostics.restore();
    }
  });

  it("returns a snapshot that cannot be used to mutate state", () => {
    const { logger } = harness();
    logger.listLevels().info.display = "MUTATED";
    expect(logger.listLevels().info.display).toBe("INFO");
  });
});

describe("timezone", () => {
  it("reaches every transport that renders a timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T14:05:32.123Z"));
    try {
      const stream = new FakeStream();
      const logger = createLogger({
        console: { stdout: stream, stderr: stream, timezone: "UTC", colors: false },
        // a transport with no setTimezone is simply skipped
        transports: [new MemoryTransport()],
      });
      logger.info("before");
      logger.setTimezone("Asia/Dhaka");
      logger.info("after");
      expect(stream.lines[0]).toContain("[14:05:32]");
      expect(stream.lines[1]).toContain("[20:05:32]");
      expect(() => logger.setTimezone()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is settable at construction through the deprecated flat option", () => {
    const stream = new FakeStream();
    const logger = createLogger({
      timezone: "UTC",
      console: { stdout: stream, stderr: stream, colors: false, timestamp: "datetime" },
    });
    logger.info("a");
    expect(stream.lines[0]).toMatch(/\d{2}-\d{2}-\d{4}/);
  });
});

describe("attach", () => {
  it("bolts logging methods onto an object", () => {
    const { logger, sink } = harness();
    const client: { logs?: Record<string, (message: unknown) => void> } = {};
    logger.attach(client);
    client.logs!.info!("a");
    client.logs!.error!("b");
    expect(sink.messages()).toEqual(["a", "b"]);
  });

  it("uses a custom key", () => {
    const { logger, sink } = harness();
    const client: Record<string, never> = {};
    logger.attach(client, "log");
    (client as never as { log: { warn(m: string): void } }).log.warn("a");
    expect(sink.messages()).toEqual(["a"]);
  });

  it("refuses a key that would reach the prototype", () => {
    const { logger } = harness();
    for (const key of ["__proto__", "constructor", "prototype"]) {
      expect(() => logger.attach({}, key)).toThrow(/not a safe property key/);
    }
  });

  it("warns before overwriting an existing property", () => {
    const diagnostics = captureDiagnostics();
    try {
      const { logger } = harness();
      logger.attach({ logs: "mine" });
      expect(diagnostics.codes()).toEqual(["attach-overwrite"]);
    } finally {
      diagnostics.restore();
    }
  });

  it("carries the bound context of the logger it came from", () => {
    const { logger, sink } = harness();
    const client: Record<string, unknown> = {};
    logger.child({ context: "db" }).attach(client);
    (client as { logs: { info(m: string): void } }).logs.info("a");
    expect(sink.entries()[0]!.context).toBe("db");
  });
});

describe("end to end", () => {
  it("writes JSON a machine can parse, with inherited context and fields", () => {
    const stream = new FakeStream();
    const logger = createLogger({
      console: false,
      redact: ["token"],
      transports: [new StreamTransport({ stream })],
    }).child({ context: "api", fields: { service: "auth" } });

    logger.info("request handled", { token: "secret", ms: 12 });

    expect(JSON.parse(stream.lines[0]!)).toMatchObject({
      level: "info",
      context: "api",
      msg: "request handled",
      service: "auth",
      token: "[redacted]",
      ms: 12,
    });
  });
});
