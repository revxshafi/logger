/**
 * Newline delimited JSON, for anything that parses logs rather than reads them.
 *
 * This format is the reason `LogEntry` carries `raw` alongside `message`. Given
 * `logger.info({ orderId: 7 })`, a text formatter wants pretty printed JSON in
 * a string; a log pipeline wants the object. Reaching for `raw` here also means
 * the pretty printer's work is never done for a service that only ships JSON.
 */
import { types } from "node:util";
import { safeStringify } from "../internal/stringify";
import { isoTime } from "../internal/time";
import { SEVERITY } from "../levels";
import type { JsonFormatOptions, LogEntry, LogFormatter } from "../types";

/** ISO string or epoch millis, `null` when the entry carries an invalid `Date`. */
function timeValue(timestamp: Date, style: "iso" | "epoch"): string | number | null {
  if (style === "epoch") {
    const ms = timestamp.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return isoTime(timestamp);
}

function isErrorLike(value: unknown): value is Error {
  // `Error.isError` would be the modern spelling but only lands in Node 24
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return value instanceof Error || types.isNativeError(value);
}

/**
 * Assign a caller supplied key without letting `__proto__` reassign the
 * object's prototype.
 *
 * The obvious defence is to build the line on `Object.create(null)`, & that is
 * what this used to do, but a null prototype object is a dictionary mode
 * object in V8, which made both the property writes & `JSON.stringify` roughly
 * 4x slower. `defineProperty` on the one dangerous key buys the same guarantee
 * for the cost of a string compare per field.
 */
function put(out: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    // an own, enumerable `__proto__`, so it serializes as data rather than
    // walking up the prototype chain
    Object.defineProperty(out, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    return;
  }
  out[key] = value;
}

/**
 * One JSON object per entry, with fixed keys first so a human skimming the
 * stream still sees time & level at the start of every line.
 *
 * Reserved keys win over structured fields: a field literally named `level`
 * would otherwise make the stream unparseable for whatever consumes it.
 */
export function jsonFormat(options: JsonFormatOptions = {}): LogFormatter {
  const {
    time: timeStyle = "iso",
    timeKey = "time",
    messageKey = "msg",
    contextKey = "context",
    base,
    severity = false,
  } = options;

  return (entry: LogEntry): string => {
    const out: Record<string, unknown> = {};

    put(out, timeKey, timeValue(entry.timestamp, timeStyle));
    out.level = entry.level;
    if (severity) out.severity = SEVERITY[entry.level];
    if (entry.context !== undefined) put(out, contextKey, entry.context);

    const raw = entry.raw;
    if (isErrorLike(raw)) {
      put(out, messageKey, raw.message);
      out.err = { type: raw.name, message: raw.message, stack: raw.stack };
    } else if (typeof raw === "object" && raw !== null) {
      // keep the object structured rather than embedding its rendered text
      out.data = raw;
    } else {
      put(out, messageKey, entry.message);
    }

    // `Object.hasOwn`, not `in`: `in` would see inherited keys like `toString` &
    // silently drop a field genuinely named that
    if (base !== undefined) {
      for (const key of Object.keys(base)) {
        if (!Object.hasOwn(out, key)) put(out, key, base[key]);
      }
    }
    if (entry.fields !== undefined) {
      for (const key of Object.keys(entry.fields)) {
        if (!Object.hasOwn(out, key)) put(out, key, entry.fields[key]);
      }
    }

    // every value went through the cycle safe replacer, so a result always exists
    /* c8 ignore next -- the fallback is unreachable, and cheaper than a cast */
    return safeStringify(out) ?? "{}";
  };
}
