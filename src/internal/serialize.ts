/**
 * Turning arbitrary values into printable text.
 *
 * Two rules govern everything here:
 *
 * 1. **It must never throw.** A logging call is not a place an application can
 *    afford a crash, & the values reaching it are often the weird ones: a
 *    revoked proxy, an object whose `stack` getter throws, something from
 *    another realm.
 * 2. **It must be bounded.** Logging a deeply nested or enormous object should
 *    cost a predictable amount of memory. Without a cap, one
 *    `logger.debug(hugePayload)` can allocate hundreds of megabytes of string.
 */
import { inspect, types } from "node:util";
import type { SerializeOptions } from "../types";

const DEFAULT_DEPTH = 4;
const DEFAULT_MAX_LENGTH = 65_536;

/** Keeps a single oversized string inside an object from dominating the line. */
const MAX_NESTED_STRING = 8_192;

/** Cut `text` down to `max`, saying how much was dropped. */
function truncate(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  return `${text.slice(0, max)}… [truncated ${text.length - max} characters]`;
}

/**
 * True when the value is a plain object or array => the only shapes
 * `JSON.stringify` renders faithfully. `Map`, `Set`, `RegExp` & class
 * instances all collapse to `{}`, so they go to `inspect` instead.
 */
function isPlainData(value: object): boolean {
  if (Array.isArray(value)) return true;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * True when an error carries information its `stack` alone won't show, so it's
 * worth the slower `inspect` path: a `cause` chain, or `AggregateError.errors`.
 */
function hasExtraErrorDetail(error: Error): boolean {
  try {
    if ("cause" in error && error.cause !== undefined) return true;
    const { errors } = error as { errors?: unknown };
    return Array.isArray(errors) && errors.length > 0;
  } catch {
    // a hostile getter: fall back to the plain stack
    return false;
  }
}

function render(value: unknown, depth: number): string {
  if (typeof value === "string") return value;

  // errors from another realm (worker, vm) fail `instanceof`, so ask util too.
  // `Error.isError` would be the modern spelling but only lands in Node 24.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  if (value instanceof Error || types.isNativeError(value)) {
    const error = value;
    if (hasExtraErrorDetail(error)) {
      // inspect renders `[cause]` & aggregated errors; the stack does not
      return inspect(error, { depth });
    }
    // a V8 stack already starts with "Error: <message>", printing the message
    // separately would duplicate it
    return error.stack ?? error.message;
  }

  if (typeof value === "bigint") {
    // match how inspect renders bigints nested inside objects
    return `${value}n`;
  }

  if (value !== null && typeof value === "object") {
    if (isPlainData(value)) {
      try {
        // stringify gives back undefined for e.g. `{ toJSON: () => undefined }`,
        // & throws on circular refs & bigints, fall through on both
        const json = JSON.stringify(value, null, 2) as string | undefined;
        if (json !== undefined) return json;
      } catch {
        // circular refs & friends; inspect handles them
      }
    }
    return inspect(value, {
      depth,
      breakLength: 80,
      maxStringLength: MAX_NESTED_STRING,
    });
  }

  return String(value);
}

/**
 * Render `value` as text. Falls back through progressively more defensive
 * strategies rather than ever propagating a throw.
 */
export function serialize(value: unknown, options?: SerializeOptions): string {
  const depth = options?.depth ?? DEFAULT_DEPTH;
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH;

  let text: string;
  try {
    text = render(value, depth);
  } catch {
    // hostile values (a throwing `stack` getter, a revoked proxy) land here;
    // inspect survives everything probed, rendering e.g. "<Revoked Proxy>"
    try {
      text = inspect(value, { depth: 1 });
      /* c8 ignore next 3 -- no known value defeats both paths */
    } catch {
      text = "[unserializable value]";
    }
  }
  return truncate(text, maxLength);
}
