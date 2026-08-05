import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { guardStream, writeLine } from "../src/internal/write";
import { captureDiagnostics, FakeStream } from "./helpers";
import type { WritableLike } from "../src/types";

/** A stream that emits `error` events the way a real socket or pipe does. */
class EventfulStream extends EventEmitter implements WritableLike {
  readonly chunks: string[] = [];
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
}

describe("writeLine", () => {
  it("appends the line terminator", () => {
    const stream = new FakeStream();
    writeLine(stream, "hello", "\n");
    expect(stream.chunks).toEqual(["hello\n"]);
  });

  it("reports a synchronous failure rather than propagating it", () => {
    const diagnostics = captureDiagnostics();
    const broken: WritableLike = {
      write() {
        throw new Error("stream is destroyed");
      },
    };
    try {
      expect(() => writeLine(broken, "hello", "\n")).not.toThrow();
      expect(diagnostics.codes()).toEqual(["write-error"]);
    } finally {
      diagnostics.restore();
    }
  });
});

describe("guardStream", () => {
  it("turns a fatal error event into a diagnostic", () => {
    const diagnostics = captureDiagnostics();
    const stream = new EventfulStream();
    try {
      guardStream(stream);
      // without a listener, this would terminate the process
      stream.emit("error", Object.assign(new Error("broken pipe"), { code: "EPIPE" }));
      expect(diagnostics.entries[0]?.message).toContain("output stream closed");

      stream.emit("error", new Error("disk full"));
      expect(diagnostics.entries[1]?.message).toContain("disk full");
    } finally {
      diagnostics.restore();
    }
  });

  it("treats a destroyed stream like a closed pipe", () => {
    const diagnostics = captureDiagnostics();
    const stream = new EventfulStream();
    try {
      guardStream(stream);
      stream.emit(
        "error",
        Object.assign(new Error("write after end"), { code: "ERR_STREAM_DESTROYED" }),
      );
      expect(diagnostics.entries[0]?.message).toContain("output stream closed");
    } finally {
      diagnostics.restore();
    }
  });

  it("attaches at most one listener per stream", () => {
    const stream = new EventfulStream();
    guardStream(stream);
    guardStream(stream);
    guardStream(stream);
    expect(stream.listenerCount("error")).toBe(1);
  });

  it("ignores a stream with no event support", () => {
    expect(() => guardStream(new FakeStream())).not.toThrow();
  });
});
