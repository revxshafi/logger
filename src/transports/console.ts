import chalk from "chalk";
import { createDefaultLevels } from "../levels";
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

  constructor(options: ConsoleTransportOptions = {}) {
    this.formatTime = createTimeFormatter(options.timezone);
    this.levels = options.levels ?? createDefaultLevels();
  }

  /** Swap the timezone at runtime; rebuilds the underlying `Intl` formatter. */
  setTimezone(timezone: TimezoneOption = "local"): void {
    this.formatTime = createTimeFormatter(timezone);
  }

  write(entry: LogEntry): void {
    const time = chalk.dim(`[${this.formatTime(entry.timestamp)}]`);

    const config = this.levels.get(entry.level);
    const display = config?.display ?? entry.level.toUpperCase();
    const color = config?.color ?? "#AAAAAA";
    const badge = chalk.hex(color)(`[${display}]`);

    const context =
      entry.context !== undefined ? ` ${chalk.dim(`[${entry.context}]`)}` : "";

    // Route by severity so warn/error/fatal hit stderr.
    const line = `${time} ${badge}${context} ${entry.message}`;
    if (entry.level === "error" || entry.level === "fatal") {
      console.error(line);
    } else if (entry.level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}
