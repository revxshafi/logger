/**
 * The default transport: entries to the terminal.
 *
 * In 1.x this class also decided what a line looked like, which is why it grew
 * two hand written layouts & a `dev` boolean gating them. Layout now lives in
 * the formatters; what remains here is routing & I/O => which stream a level
 * goes to, & how the bytes get there.
 *
 * Colour is resolved per stream rather than once for the transport. `node app.js
 * > out.log` leaves stderr a TTY while stdout is a file, & warnings should
 * still be coloured in that case.
 */
import { jsonFormat } from "../formats/json";
import { devFormat, prettyFormat } from "../formats/pretty";
import { guardStream, writeLine } from "../internal/write";
import { SEVERITY, THRESHOLD } from "../levels";
import type {
  ConsoleTransportOptions,
  LevelThreshold,
  LogEntry,
  LogFormatter,
  LogLevel,
  TimestampStyle,
  TimezoneAwareTransport,
  TimezoneOption,
  WritableLike,
} from "../types";

const DEFAULT_STDERR_LEVELS: readonly LogLevel[] = ["warn", "error", "fatal"];

/** Which preset to use, honouring the deprecated `dev` boolean. */
function resolvePreset(
  options: ConsoleTransportOptions,
): "pretty" | "dev" | "json" | LogFormatter {
  if (options.format !== undefined) return options.format;
  if (options.dev === true) return "dev";
  return "pretty";
}

/** `showDate` predates `timestamp` and only ever chose between two styles. */
function resolveTimestamp(options: ConsoleTransportOptions): TimestampStyle | undefined {
  if (options.timestamp !== undefined) return options.timestamp;
  if (options.showDate === true) return "datetime";
  if (options.showDate === false) return "time";
  return undefined;
}

export class ConsoleTransport implements TimezoneAwareTransport {
  readonly minLevel: LevelThreshold | undefined;

  private readonly stdout: WritableLike;
  private readonly stderr: WritableLike;
  private readonly stderrLevels: ReadonlySet<LogLevel>;
  private readonly outFormat: LogFormatter;
  private readonly errFormat: LogFormatter;
  private readonly useConsole: boolean;
  private readonly threshold: number;

  constructor(options: ConsoleTransportOptions = {}) {
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
    this.stderrLevels = new Set(options.stderrLevels ?? DEFAULT_STDERR_LEVELS);
    this.useConsole = options.output === "console";
    this.minLevel = options.minLevel;
    this.threshold = options.minLevel === undefined ? 0 : THRESHOLD[options.minLevel];

    const preset = resolvePreset(options);
    if (typeof preset === "function") {
      // a caller supplied formatter is used verbatim, for both streams
      this.outFormat = preset;
      this.errFormat = preset;
    } else if (preset === "json") {
      // no colour to detect, so one formatter serves both streams
      this.outFormat = jsonFormat();
      this.errFormat = this.outFormat;
    } else {
      this.outFormat = buildPreset(preset, options, this.stdout);
      this.errFormat = buildPreset(preset, options, this.stderr);
    }

    if (!this.useConsole) {
      guardStream(this.stdout);
      guardStream(this.stderr);
    }
  }

  write(entry: LogEntry): void {
    if (SEVERITY[entry.level] < this.threshold) return;

    const toStderr = this.stderrLevels.has(entry.level);
    const line = (toStderr ? this.errFormat : this.outFormat)(entry);

    if (!this.useConsole) {
      writeLine(toStderr ? this.stderr : this.stdout, line, "\n");
      return;
    }

    // resolved at call time rather than construction: intercepting `console` is
    // the only reason to be in this branch, & interception can happen late
    if (!toStderr) console.log(line);
    else if (entry.level === "warn") console.warn(line);
    else console.error(line);
  }

  /** Forwarded to whichever formatters render a timestamp. */
  setTimezone(timezone: TimezoneOption = "local"): void {
    this.outFormat.setTimezone?.(timezone);
    if (this.errFormat !== this.outFormat) this.errFormat.setTimezone?.(timezone);
  }
}

/** One preset formatter, bound to the stream whose colour support it should follow. */
function buildPreset(
  preset: "pretty" | "dev",
  options: ConsoleTransportOptions,
  stream: WritableLike,
): LogFormatter {
  const shared = {
    levels: options.levels,
    timezone: options.timezone,
    timestamp: resolveTimestamp(options),
    colors: options.colors,
    stream,
    multiline: options.multiline,
    fields: options.fields,
    messageColor: options.messageColor ?? options.devColor,
    timeColor: options.timeColor,
  };
  // badgeWidth is dev only, prettyFormat has no such option to ignore it
  return preset === "dev"
    ? devFormat({ ...shared, badgeWidth: options.badgeWidth })
    : prettyFormat(shared);
}

/** Convenience wrapper, for symmetry with the formatter factories. */
export function consoleTransport(options?: ConsoleTransportOptions): ConsoleTransport {
  return new ConsoleTransport(options);
}
