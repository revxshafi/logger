/**
 * Field redaction.
 *
 * Secrets reach logs through structured fields far more often than through
 * message text => an object is passed whole, & three commits later it grows an
 * `authorization` property. Matching by key name at any depth catches that case
 * without the caller having to enumerate paths.
 *
 * Only plain objects & arrays are traversed. Cloning a class instance would
 * change its behaviour for whatever reads the entry afterwards, so those are
 * passed through untouched, a caveat worth knowing when logging model objects.
 */
import type { LogFields } from "../types";

const MASK = "[redacted]";

/**
 * Depth past which traversal stops. A cycle can't get here (see `seen` below),
 * so this only bounds absurdly deep input. The subtree is masked rather than
 * copied: a missed secret is worse than a lost detail.
 */
const MAX_DEPTH = 32;
const TRUNCATED = "[truncated]";

function isTraversable(value: unknown): value is Record<string, unknown> | unknown[] {
  if (typeof value !== "object" || value === null) return false;
  if (Array.isArray(value)) return true;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Build a redactor for `keys`, or `undefined` when there is nothing to redact,
 * letting the caller skip the work entirely rather than run an identity clone.
 */
export function createRedactor(
  keys: readonly string[] | undefined,
): ((fields: LogFields) => LogFields) | undefined {
  if (keys === undefined || keys.length === 0) return undefined;

  const targets = new Set<string>();
  for (const key of keys) {
    if (typeof key === "string" && key !== "") targets.add(key.toLowerCase());
  }
  if (targets.size === 0) return undefined;

  return function redact(fields: LogFields): LogFields {
    // shared across one call so a diamond is cloned once & a cycle terminates
    const seen = new WeakMap<object, unknown>();

    function walk(value: unknown, depth: number): unknown {
      if (!isTraversable(value)) return value;
      const cached = seen.get(value);
      if (cached !== undefined) return cached;
      if (depth > MAX_DEPTH) return TRUNCATED;

      if (Array.isArray(value)) {
        const out: unknown[] = [];
        seen.set(value, out);
        for (const item of value) out.push(walk(item, depth + 1));
        return out;
      }

      const out: Record<string, unknown> = {};
      seen.set(value, out);
      for (const key of Object.keys(value)) {
        out[key] = targets.has(key.toLowerCase()) ? MASK : walk(value[key], depth + 1);
      }
      return out;
    }

    return walk(fields, 0) as LogFields;
  };
}
