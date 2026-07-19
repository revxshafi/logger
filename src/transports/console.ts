import chalk from "chalk";
import { checkColor, styleHex } from "../color";
import { createDefaultLevels } from "../levels";
import { sanitizeInline, sanitizeMessage } from "../sanitize";
import { createTimeFormatter } from "../timestamp";
import type {
  LevelConfig,
  LogEntry,
  LogLevel,
  TimezoneAwareTransport,
  TimezoneOption,
} from "../types";

export interface ConsoleTransportOptions {
  timezone?: TimezoneOption;
  /**
   * Resolver for a level's style. A `Logger` passes its shared map so
   * `setLevelStyle` reaches this transport; standalone construction gets a
   * fresh copy of the defaults.
   */
  levels?: Map<LogLevel, LevelConfig>;
  /** Minimal `[ time ] [prefix] message` layout — see `LoggerOptions.dev`. */
  dev?: boolean;
  /** Message color in dev mode; defaults to `"#2277FF"`. */
  devColor?: string;
  /** Message color in the normal format; dev-mode fallback when `devColor` is unset. */
  messageColor?: string;
}

/**
 * Writes entries to `console`. Only metadata is colored — the timestamp is
 * dimmed, the level badge is colored per its `LevelConfig`, the context is
 * dimmed, and the message body keeps the default terminal color so JSON and
 * stack traces stay readable.
 */
export class ConsoleTransport implements TimezoneAwareTransport {
  private formatTime: (date: Date) => string;
  private readonly levels: Map<LogLevel, LevelConfig>;
  private readonly dev: boolean;
  private readonly devColor: string;
  private readonly messageColor?: string;

  constructor(options: ConsoleTransportOptions = {}) {
    this.formatTime = createTimeFormatter(options.timezone);
    this.levels = options.levels ?? createDefaultLevels();
    this.dev = options.dev ?? false;
    // validate at the boundary so chalk.hex never sees junk (it throws on
    // undefined and renders invalid strings as black)
    const messageColor = checkColor(options.messageColor, "messageColor");
    this.devColor = checkColor(options.devColor, "devColor") ?? messageColor ?? "#2277FF";
    this.messageColor = messageColor;
  }

  /** Swap the timezone at runtime; rebuilds the underlying `Intl` formatter. */
  setTimezone(timezone: TimezoneOption = "local"): void {
    this.formatTime = createTimeFormatter(timezone);
  }

  write(entry: LogEntry): void {
    const config = this.levels.get(entry.level);
    // entry fields arrive raw (custom transports get untouched data); this is
    // the terminal boundary, so sanitize everything user-controlled here
    const message = sanitizeMessage(entry.message);
    const display = sanitizeInline(config?.display ?? entry.level.toUpperCase());
    const context =
      entry.context !== undefined ? sanitizeInline(entry.context) : undefined;

    let line: string;
    if (this.dev) {
      // the context takes the single prefix slot, the level fills in when absent
      const prefix = context ?? display;
      line = `[ ${this.formatTime(entry.timestamp)} ] [${prefix}] ${styleHex(this.devColor, "#2277FF", message)}`;
    } else {
      const time = chalk.dim(`[${this.formatTime(entry.timestamp)}]`);
      const badge = styleHex(config?.color, "#AAAAAA", `[${display}]`);
      const contextTag = context !== undefined ? ` ${chalk.dim(`[${context}]`)}` : "";
      const body = this.messageColor
        ? styleHex(this.messageColor, "#AAAAAA", message)
        : message;
      line = `${time} ${badge}${contextTag} ${body}`;
    }

    if (entry.level === "error" || entry.level === "fatal") {
      console.error(line);
    } else if (entry.level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}
