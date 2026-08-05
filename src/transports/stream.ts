/**
 * A transport for any writable stream: a file handle, a socket, a passthrough
 * in a test.
 *
 * It holds no presentation logic at all => the formatter decides what the line
 * says, this decides where the bytes go. Defaults to JSON, because a stream
 * that is not a terminal is almost always read by a program.
 */
import { guardStream, writeLine } from "../internal/write";
import { jsonFormat } from "../formats/json";
import { SEVERITY, THRESHOLD } from "../levels";
import type {
  LevelThreshold,
  LogEntry,
  LogFormatter,
  StreamTransportOptions,
  TimezoneAwareTransport,
  TimezoneOption,
  WritableLike,
} from "../types";

export class StreamTransport implements TimezoneAwareTransport {
  readonly minLevel: LevelThreshold | undefined;

  private readonly stream: WritableLike;
  private readonly format: LogFormatter;
  private readonly eol: string;
  private readonly threshold: number;

  constructor(options: StreamTransportOptions) {
    this.stream = options.stream;
    this.format = options.format ?? jsonFormat();
    this.eol = options.eol ?? "\n";
    this.minLevel = options.minLevel;
    this.threshold = options.minLevel === undefined ? 0 : THRESHOLD[options.minLevel];
    guardStream(this.stream);
  }

  write(entry: LogEntry): void {
    if (SEVERITY[entry.level] < this.threshold) return;
    writeLine(this.stream, this.format(entry), this.eol);
  }

  /** Forwarded to the formatter, which is what actually renders the time. */
  setTimezone(timezone: TimezoneOption = "local"): void {
    this.format.setTimezone?.(timezone);
  }
}

/** Convenience wrapper, for symmetry with the formatter factories. */
export function streamTransport(options: StreamTransportOptions): StreamTransport {
  return new StreamTransport(options);
}
