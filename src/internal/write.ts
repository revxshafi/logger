/**
 * Getting bytes onto a stream without ever taking the application down with it.
 *
 * Two hazards live here, both of which the previous `console.log`-based
 * implementation was exposed to:
 *
 * - **`printf` handling.** `console.log(line)` runs the line through
 *   `util.format`, which rewrites `%%` to `%`. A message reading `"50%% off"`
 *   printed as `"50% off"`. Writing to the stream is both correct & faster.
 * - **`EPIPE`.** Run `node app.js | head` and the pipe closes early; Node
 *   surfaces that as an `error` *event* on stdout, and an unhandled `error`
 *   event terminates the process. A logger must not be how an application dies.
 */
import { report } from "./diagnostics";
import type { WritableLike } from "../types";

/** Streams already carrying a guard, so listeners are attached at most once. */
const guarded = new WeakSet();

interface EventfulStream {
  on(event: "error", listener: (error: Error & { code?: string }) => void): unknown;
}

function isEventful(stream: WritableLike): stream is WritableLike & EventfulStream {
  return typeof (stream as Partial<EventfulStream>).on === "function";
}

/**
 * Make a stream's asynchronous `error` events non fatal. `EPIPE` & `ERR_STREAM_DESTROYED`
 * are expected when output is piped into a short lived reader & are reported
 * quietly; anything else goes through diagnostics as is.
 */
export function guardStream(stream: WritableLike): void {
  if (!isEventful(stream) || guarded.has(stream)) return;
  guarded.add(stream);
  stream.on("error", (error) => {
    const code = error.code;
    if (code === "EPIPE" || code === "ERR_STREAM_DESTROYED") {
      report("write-error", "output stream closed; further writes are dropped.", error);
      return;
    }
    report("write-error", `output stream failed: ${error.message}`, error);
  });
}

/**
 * Write one line. Synchronous throws (a destroyed stream, a stream whose
 * `write` is not a function) are reported rather than propagated: losing a log
 * line is always better than losing the process.
 */
export function writeLine(stream: WritableLike, line: string, eol: string): void {
  try {
    stream.write(line + eol);
  } catch (error) {
    report("write-error", "failed to write a log line to its stream.", error);
  }
}
