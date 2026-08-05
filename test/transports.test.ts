import { describe, expect, it, vi } from "vitest";
import { ConsoleTransport, consoleTransport } from "../src/transports/console";
import { MemoryTransport, memoryTransport } from "../src/transports/memory";
import { StreamTransport, streamTransport } from "../src/transports/stream";
import { jsonFormat, prettyFormat } from "../src/formats";
import { LogRecord } from "../src/record";
import { captureDiagnostics, FakeStream, FIXED, plain } from "./helpers";
import type { LogLevel } from "../src/types";

function entry(message: unknown, level: LogLevel = "info", context?: string) {
  return new LogRecord(level, message, context, undefined, FIXED);
}

describe("ConsoleTransport", () => {
  function build(options = {}) {
    const stdout = new FakeStream();
    const stderr = new FakeStream();
    return {
      stdout,
      stderr,
      transport: new ConsoleTransport({
        stdout,
        stderr,
        timezone: "UTC",
        colors: false,
        ...options,
      }),
    };
  }

  it("writes to the stream directly, not through console", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { stdout, transport } = build();
    try {
      transport.write(entry("Connected", "info", "db"));
      expect(stdout.lines).toEqual(["[14:05:32] [INFO] [db] Connected"]);
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("does not mangle a percent sign the way console.log would", () => {
    const { stdout, transport } = build();
    transport.write(entry("50%% off, 100% sure"));
    expect(stdout.lines[0]).toContain("50%% off, 100% sure");
  });

  it("routes warn and above to stderr", () => {
    const { stdout, stderr, transport } = build();
    transport.write(entry("a", "info"));
    transport.write(entry("b", "warn"));
    transport.write(entry("c", "error"));
    transport.write(entry("d", "fatal"));
    expect(stdout.lines).toHaveLength(1);
    expect(stderr.lines).toHaveLength(3);
  });

  it("accepts a custom stderr routing", () => {
    const { stdout, stderr, transport } = build({ stderrLevels: ["fatal"] });
    transport.write(entry("a", "error"));
    transport.write(entry("b", "fatal"));
    expect(stdout.lines).toHaveLength(1);
    expect(stderr.lines).toHaveLength(1);
  });

  it("honours its own minimum level", () => {
    const { stdout, transport } = build({ minLevel: "warn" });
    transport.write(entry("dropped", "info"));
    expect(stdout.lines).toEqual([]);
    expect(transport.minLevel).toBe("warn");
  });

  it("resolves colour per stream, since one may be a TTY and the other not", () => {
    const stdout = new FakeStream(false);
    const stderr = new FakeStream(true);
    const transport = new ConsoleTransport({
      stdout,
      stderr,
      timezone: "UTC",
      // FORCE_COLOR style detection is bypassed by pinning nothing: the streams
      // decide, & only the TTY one gets colour
      colors: undefined,
    });
    transport.write(entry("plain", "info"));
    transport.write(entry("colored", "error"));
    expect(stdout.lines[0]).toBe(plain(stdout.lines[0]!));
  });

  it("selects a preset by name", () => {
    const { stdout } = (() => {
      const built = build({ format: "dev" });
      built.transport.write(entry("x", "info", "db"));
      return built;
    })();
    expect(stdout.lines[0]).toBe("[ 04-08-2026 14:05:32 ] [db   ] x");

    const json = build({ format: "json" });
    json.transport.write(entry("x"));
    expect(JSON.parse(json.stdout.lines[0]!)).toMatchObject({ msg: "x", level: "info" });
  });

  it("forwards badgeWidth to the dev preset", () => {
    const { stdout, transport } = build({ format: "dev", badgeWidth: 8 });
    transport.write(entry("x", "info", "db"));
    expect(stdout.lines[0]).toBe("[ 04-08-2026 14:05:32 ] [db      ] x");
  });

  it("accepts a formatter function", () => {    const { stdout, transport } = build({ format: (e: LogRecord) => `custom:${e.message}` });
    transport.write(entry("x"));
    expect(stdout.lines).toEqual(["custom:x"]);
  });

  it("honours the deprecated dev and showDate spellings", () => {
    const dev = build({ dev: true });
    dev.transport.write(entry("x", "info", "db"));
    expect(dev.stdout.lines[0]).toContain("[db   ]");

    const dated = build({ showDate: true });
    dated.transport.write(entry("x"));
    expect(dated.stdout.lines[0]).toContain("04-08-2026 14:05:32");

    const undated = build({ showDate: false });
    undated.transport.write(entry("x"));
    expect(undated.stdout.lines[0]).toBe("[14:05:32] [INFO] x");
  });

  it("honours the deprecated devColor spelling", () => {
    const { stdout, transport } = build({ colors: 3, devColor: "#FF0000" });
    transport.write(entry("x"));
    expect(stdout.lines[0]).toContain("38;2;255;0;0m");
  });

  it("routes through console when asked", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const transport = new ConsoleTransport({ output: "console", timezone: "UTC", colors: false });
      transport.write(entry("a", "info"));
      transport.write(entry("b", "warn"));
      transport.write(entry("c", "error"));
      expect(log).toHaveBeenCalledWith("[14:05:32] [INFO] a");
      expect(warn).toHaveBeenCalledWith("[14:05:32] [WARN] b");
      expect(error).toHaveBeenCalledWith("[14:05:32] [ERROR] c");
    } finally {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("forwards a timezone change to both stream formatters", () => {
    const { stdout, stderr, transport } = build();
    transport.setTimezone("Asia/Dhaka");
    transport.write(entry("a", "info"));
    transport.write(entry("b", "error"));
    expect(stdout.lines[0]).toContain("20:05:32");
    expect(stderr.lines[0]).toContain("20:05:32");

    transport.setTimezone();
    expect(() => transport.write(entry("c"))).not.toThrow();
  });

  it("forwards a timezone change to a shared json formatter exactly once", () => {
    const { stdout, transport } = build({ format: "json" });
    expect(() => transport.setTimezone("UTC")).not.toThrow();
    transport.write(entry("x"));
    expect(stdout.lines).toHaveLength(1);
  });

  it("defaults to the process streams", () => {
    const transport = new ConsoleTransport({ colors: false });
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      transport.write(entry("x"));
      expect(write).toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("has a factory shorthand", () => {
    expect(consoleTransport()).toBeInstanceOf(ConsoleTransport);
  });
});

describe("StreamTransport", () => {
  it("defaults to JSON, because a non-terminal stream is read by a program", () => {
    const stream = new FakeStream();
    new StreamTransport({ stream }).write(entry("x", "info", "api"));
    expect(JSON.parse(stream.lines[0]!)).toMatchObject({
      level: "info",
      context: "api",
      msg: "x",
    });
  });

  it("accepts any formatter and line terminator", () => {
    const stream = new FakeStream();
    new StreamTransport({
      stream,
      format: prettyFormat({ timezone: "UTC", colors: false }),
      eol: "\r\n",
    }).write(entry("x"));
    expect(stream.chunks).toEqual(["[14:05:32] [INFO] x\r\n"]);
  });

  it("honours its own minimum level", () => {
    const stream = new FakeStream();
    const transport = new StreamTransport({ stream, minLevel: "error" });
    transport.write(entry("dropped", "warn"));
    transport.write(entry("kept", "error"));
    expect(stream.lines).toHaveLength(1);
    expect(transport.minLevel).toBe("error");
  });

  it("reports a write failure rather than propagating it", () => {
    const diagnostics = captureDiagnostics();
    try {
      const transport = new StreamTransport({
        stream: {
          write() {
            throw new Error("closed");
          },
        },
      });
      expect(() => transport.write(entry("x"))).not.toThrow();
      expect(diagnostics.codes()).toEqual(["write-error"]);
    } finally {
      diagnostics.restore();
    }
  });

  it("forwards a timezone change to a formatter that renders one", () => {
    const stream = new FakeStream();
    const transport = new StreamTransport({
      stream,
      format: prettyFormat({ timezone: "UTC", colors: false }),
    });
    transport.setTimezone("Asia/Dhaka");
    transport.write(entry("x"));
    expect(stream.lines[0]).toContain("20:05:32");

    // a formatter with no timestamp simply ignores it
    const other = new StreamTransport({ stream, format: jsonFormat() });
    expect(() => other.setTimezone()).not.toThrow();
  });

  it("has a factory shorthand", () => {
    expect(streamTransport({ stream: new FakeStream() })).toBeInstanceOf(StreamTransport);
  });
});

describe("MemoryTransport", () => {
  it("retains entries in order", () => {
    const transport = new MemoryTransport();
    transport.write(entry("first"));
    transport.write(entry("second"));
    expect(transport.size).toBe(2);
    expect(transport.messages()).toEqual(["first", "second"]);
  });

  it("discards the oldest entries once full", () => {
    const transport = new MemoryTransport({ limit: 2 });
    transport.write(entry("a"));
    transport.write(entry("b"));
    transport.write(entry("c"));
    expect(transport.size).toBe(2);
    expect(transport.messages()).toEqual(["b", "c"]);
  });

  it("refuses a limit that would make it useless", () => {
    expect(new MemoryTransport({ limit: 0 }).limit).toBe(1);
    expect(new MemoryTransport({ limit: -5 }).limit).toBe(1);
    expect(new MemoryTransport({ limit: 2.7 }).limit).toBe(2);
  });

  it("honours its own minimum level", () => {
    const transport = new MemoryTransport({ minLevel: "error" });
    transport.write(entry("dropped", "warn"));
    transport.write(entry("kept", "error"));
    expect(transport.messages()).toEqual(["kept"]);
  });

  it("filters by level", () => {
    const transport = new MemoryTransport();
    transport.write(entry("a", "info"));
    transport.write(entry("b", "error"));
    expect(transport.ofLevel("error").map((e) => e.message)).toEqual(["b"]);
  });

  it("returns a snapshot later writes cannot mutate", () => {
    const transport = new MemoryTransport();
    transport.write(entry("a"));
    const snapshot = transport.entries();
    transport.write(entry("b"));
    expect(snapshot).toHaveLength(1);
  });

  it("releases what it holds when cleared", () => {
    const transport = new MemoryTransport({ limit: 2 });
    transport.write(entry("a"));
    transport.clear();
    expect(transport.size).toBe(0);
    expect(transport.entries()).toEqual([]);
    // & it keeps working afterwards
    transport.write(entry("b"));
    expect(transport.messages()).toEqual(["b"]);
  });

  it("has a factory shorthand", () => {
    expect(memoryTransport()).toBeInstanceOf(MemoryTransport);
  });
});
