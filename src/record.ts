/**
 * The concrete log record the logger hands to transports.
 *
 * The interesting part is that `message` is a **lazy, memoised getter defined
 * on the prototype**. Rendering a value to text is the single most expensive
 * step in a log call, & a structured transport (JSON to a file, a shipper, a
 * database) has no use for the pretty printed string, it wants `raw`. Making
 * the text on demand means those pipelines never pay for it, while a console
 * transport pays exactly once no matter how many sinks read it.
 *
 * A prototype getter, rather than a per instance `Object.defineProperty`, keeps
 * record construction to a plain allocation.
 */
import { serialize } from "./internal/serialize";
import type { LogEntry, LogFields, LogLevel, SerializeOptions } from "./types";

export class LogRecord implements LogEntry {
  readonly level: LogLevel;
  readonly raw: unknown;
  readonly context: string | undefined;
  readonly fields: LogFields | undefined;
  readonly timestamp: Date;

  /** Memoised render of {@link raw}; `undefined` until something asks. */
  private text: string | undefined;
  private readonly options: SerializeOptions | undefined;

  constructor(
    level: LogLevel,
    raw: unknown,
    context: string | undefined,
    fields: LogFields | undefined,
    timestamp: Date,
    options?: SerializeOptions,
  ) {
    this.level = level;
    this.raw = raw;
    this.context = context;
    this.fields = fields;
    this.timestamp = timestamp;
    this.options = options;
  }

  get message(): string {
    // `??=` is right here: a legitimately empty render must not be recomputed
    return (this.text ??= serialize(this.raw, this.options));
  }

  /**
   * A plain, fully realized object => so `JSON.stringify(entry)` includes the
   * message a getter would otherwise hide. `raw` is deliberately left out: it
   * may be circular, enormous, or both.
   */
  toJSON(): Record<string, unknown> {
    return {
      level: this.level,
      message: this.message,
      ...(this.context !== undefined && { context: this.context }),
      ...(this.fields !== undefined && { fields: this.fields }),
      timestamp: this.timestamp,
    };
  }
}
