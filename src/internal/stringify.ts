/**
 * Compact, total JSON encoding.
 *
 * `JSON.stringify` throws on circular references & on `BigInt`, drops
 * functions & `undefined`, and renders an `Error` as `{}` => all of which are
 * routine in log data. Everything here is chosen so that a structured line is
 * always produced, even from hostile input.
 */

/** Stand in for a value that appears twice on the same branch of the tree. */
const CIRCULAR = "[Circular]";

/**
 * Cycle safe, `BigInt`-safe replacer.
 *
 * Cycles are found by tracking the chain of *ancestors*, not every object seen.
 * The naive `WeakSet` version mislabels a diamond (the same object referenced
 * twice from different branches) as circular, which quietly corrupts data that
 * was perfectly fine to encode. `JSON.stringify` calls a replacer with `this`
 * bound to the holder, which is what makes unwinding the chain possible.
 */
function createReplacer(): (this: unknown, key: string, value: unknown) => unknown {
  const ancestors: unknown[] = [];

  return function replacer(this: unknown, _key: string, value: unknown): unknown {
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "function") {
      return `[Function ${(value as { name?: string }).name || "anonymous"}]`;
    }
    if (typeof value === "symbol") return value.toString();
    if (typeof value !== "object" || value === null) return value;

    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }

    // unwind to the holder of the property currently being visited
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(value)) return CIRCULAR;
    ancestors.push(value);
    return value;
  };
}

/**
 * Encode `value` as compact JSON, never throwing. Returns `undefined` only when
 * the value has no JSON representation at all (a bare `undefined`).
 *
 * The replacer runs on every call & roughly doubles encoding cost, which looks
 * like an easy win to skip, it isn't. Plain stringify silently *drops*
 * function & symbol values & flattens an `Error` to `{}`, and neither shows
 * up in the output as anything you could detect & retry on. Losing a key is
 * worse than the nanoseconds.
 */
export function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, createReplacer());
  } catch (error) {
    // a throwing getter or `toJSON`, or a revoked proxy
    const reason = error instanceof Error ? error.message : "unknown error";
    return JSON.stringify(`[unencodable: ${reason}]`);
  }
}

/** True when a token can go into a `key=value` pair without being quoted. */
const BARE_TOKEN = /^[\w.:@/+-]*$/;

/**
 * Render one field value for a `key=value` pair on a human readable line.
 * Always one line, always quoted when it would otherwise be ambiguous.
 */
export function renderFieldValue(value: unknown): string {
  switch (typeof value) {
    case "string":
      return BARE_TOKEN.test(value) ? value : JSON.stringify(value);
    case "number":
    case "boolean":
      return String(value);
    case "bigint":
      return `${value}n`;
    case "undefined":
      return "undefined";
    case "function":
      return `[Function ${value.name || "anonymous"}]`;
    case "symbol":
      return value.toString();
    default:
      if (value === null) return "null";
      if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? value.toISOString() : "invalid-date";
      }
      return safeStringify(value) ?? "undefined";
  }
}
