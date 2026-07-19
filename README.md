# @revxshafi/logger

[![npm version](https://img.shields.io/npm/v/@revxshafi/logger)](https://www.npmjs.com/package/@revxshafi/logger)
[![npm downloads](https://img.shields.io/npm/dt/@revxshafi/logger)](https://www.npmjs.com/package/@revxshafi/logger)
[![license](https://img.shields.io/npm/l/@revxshafi/logger)](./LICENSE)
[![CI](https://github.com/revxshafi/logger/actions/workflows/ci.yml/badge.svg)](https://github.com/revxshafi/logger/actions/workflows/ci.yml)

A small, colorful logger for Node.js. Six fixed levels, context tags, scoped
loggers, timezone-aware timestamps, and pluggable transports — nothing you have
to configure before it's useful. Written in TypeScript; ships ESM, CJS, and
types.

```
[12:30:15] [INFO] Application started
[12:30:16] [WARN] [REST] Rate limited
[12:30:17] [ERROR] [MongoDB] Connection failed
```

## Installation

```bash
npm install @revxshafi/logger
```

Requires Node.js 18 or newer.

## Quick start

```ts
import { logger } from "@revxshafi/logger";

logger.info("Application started");
logger.warn("Rate limit detected");
logger.error("Database connection failed");
```

CommonJS works the same way:

```js
const { logger } = require("@revxshafi/logger");
```

That's the whole setup. The exported `logger` is a ready-to-use instance with a
console transport already wired up. Note that it's a **shared singleton**:
every module (and every dependency) that imports it gets the same instance, so
`setLevel`, `setLevelStyle`, and `addTransport` on it apply process-wide. Want
your own isolated configuration? Build the whole thing in one line with
`createLogger`:

```ts
import { createLogger } from "@revxshafi/logger";

const logger = createLogger({ timezone: "UTC", minLevel: "info" });
```

## One-line configuration

`createLogger` takes everything at once — timezone, minimum level, and level
styles — so there's no follow-up setup code:

```ts
import { createLogger } from "@revxshafi/logger";

const logger = createLogger({
  timezone: "UTC",
  minLevel: "info",
  levels: {
    info: { color: "#00FFAA", display: "INFO*" },
    error: { color: "#FF5555" }, // partial: display stays "ERROR"
  },
});
```

`levels` merges onto the defaults, so you only mention the levels — and the
fields — you want to change.

If you want to be explicit about *not* configuring anything:

```ts
const logger = createLogger({ default: true }); // ≡ createLogger()
```

`{ default: true }` can't be combined with other options — TypeScript rejects
`createLogger({ default: true, timezone: "UTC" })` at compile time, and the
same call from JavaScript throws a `TypeError` at runtime, so a config can't
claim to be "default" while overriding things.

(`new Logger(options)` still works and takes the same options; `createLogger`
is the recommended spelling.)

## Log levels

There are exactly six, and the list isn't extensible — that's on purpose. Levels
describe *severity*; anything category-like (`MongoDB`, `Commands`) is a
**context**, covered below.

```ts
logger.trace("Detailed diagnostic information");
logger.debug("Debug information");
logger.info("Application started");
logger.warn("Rate limit detected");
logger.error("Database connection failed");
logger.fatal("Application crashed");
```

## Context tags

Pass an optional second argument to tag a message with where it came from. Leave
it off and the tag is simply omitted — you'll never see a stray `[undefined]`.

```ts
logger.info("Connected", "MongoDB");
logger.warn("Rate limited", "REST");
logger.error("Failed to register command", "Commands");
```

```
[12:30:15] [INFO] [MongoDB] Connected
[12:30:16] [WARN] [REST] Rate limited
[12:30:17] [ERROR] [Commands] Failed to register command
```

## Scoped loggers

If a whole module logs under the same context, bind it once with `scope()`:

```ts
const mongo = logger.scope("MongoDB");

mongo.info("Connected");       // [INFO] [MongoDB] Connected
mongo.error("Connection failed");
```

Two rules worth knowing:

- A per-call context wins over the scope: `mongo.info("Reconnecting", "Retry")`
  prints `[Retry]`, not `[MongoDB]`.
- Re-scoping replaces the context rather than nesting it:
  `mongo.scope("Cache")` logs under `[Cache]` alone.

Scoped loggers share configuration and transports with the logger they came
from, so styling and transport changes apply to the whole family.

## Timezones

Timestamps are always 24-hour `HH:MM:SS`, formatted with the built-in `Intl`
API — no `moment`, no extra dependency. Set the zone up front in
`createLogger`, or change it later on the logger you already have:

```ts
import { logger, createLogger } from "@revxshafi/logger";

logger.setTimezone("Asia/Dhaka");          // change the default logger in place
logger.setTimezone();                      // no argument → back to the host zone

const utc = createLogger({ timezone: "UTC" }); // or set it at construction time
```

`timezone` accepts any IANA zone (`"Asia/Dhaka"`, `"UTC"`, …) or `"local"`,
which follows the host. Both `createLogger()` and a bare `setTimezone()`
default to `"local"`. An invalid zone never crashes your app: the logger prints
an error naming the bad zone and falls back to the host's local time.

## Filtering by level

Set a minimum level and anything less severe is dropped before it reaches any
transport. The default is `"trace"` — everything logs.

```ts
const log = createLogger({ minLevel: "info" }); // set it at construction…
log.debug("Not printed");
log.info("Printed");

log.setLevel("warn");                          // …or change it later
log.info("Not printed anymore");
```

Scoped loggers share the minimum level with the logger they came from, so one
`setLevel()` call quiets the whole family.

Passing something that isn't a level — `setLevel("bogus")`, or an invalid
`minLevel` / `levels` key in `createLogger` — throws a `TypeError` immediately
rather than silently logging everything. Config mistakes are loud; only
log-*call* errors are swallowed.

## Styling levels

Every level has a color and a display label. Only the metadata is colored — the
timestamp is dimmed, the badge takes the level's color, the context is dimmed,
and the **message body stays your terminal's default color** so JSON and stack
traces remain readable.

Set styles up front in `createLogger({ levels: {...} })` (see
[One-line configuration](#one-line-configuration)), or change them at runtime:

```ts
logger.setLevelStyle("info", { color: "#00FFAA", display: "INFO*" });

logger.listLevels();
// { trace: {...}, debug: {...}, info: { color: "#00FFAA", display: "INFO*" }, ... }
```

Both forms are partial: omitted fields keep their current value.

Colors must be `"#RGB"` or `"#RRGGBB"` hex strings. An invalid color never
crashes or silently paints things black — the logger warns and keeps the
level's default color instead.

By default the message body keeps your terminal's default color. If you want it
colored too, set `messageColor`:

```ts
const logger = createLogger({ messageColor: "#2277FF" });
```

## Dev format

A minimal, personal preset — one flag swaps the console output for an
old-school layout with a plain time, a single prefix slot, and a colored
message body:

```ts
const logger = createLogger({ dev: true });

logger.info("Application started");            // [ 12:30:15 ] [INFO] Application started
logger.info("Connected", "MongoDB");           // [ 12:30:15 ] [MongoDB] Connected
```

The prefix is the context when there is one, otherwise the level. The message
is colored `#2277FF`; override it with `devColor` (or `messageColor`, which
`devColor` falls back to). Level styles and dimming don't apply in this mode —
everything else (filtering, scoping, timezones, transports) works as usual.

```ts
const logger = createLogger({ dev: true, devColor: "#FF8800" });
```

## Serialization

You can log anything; the logger figures out how to render it.

| Input           | Rendered as                                                        |
| --------------- | ------------------------------------------------------------------ |
| `string`        | as-is                                                              |
| `Error`         | its stack trace (which includes the message)                       |
| plain object / array | `JSON.stringify(value, null, 2)`, falling back to `util.inspect` for circular refs, `BigInt`, and friends |
| `Map`, `Set`, class instances | `util.inspect`, so their contents show instead of `{}` |
| `bigint`        | `123n`                                                             |
| everything else | `String(value)`                                                    |

```ts
logger.error(new Error("Something broke"));
logger.debug({ user: "john", action: "login" });
logger.info(42);
```

The `util.inspect` fallback means a circular or otherwise un-stringifiable
object still shows its fields instead of collapsing to `[object Object]`.

## Transports

A transport is any object with a `write(entry: LogEntry)` method. The default
logger already has a `ConsoleTransport`; add more with `addTransport`, and every
transport receives each entry. `ConsoleTransport` can also be constructed
standalone — `new ConsoleTransport({ timezone: "UTC" })` — and uses the default
level styles unless you pass a `levels` map (exported as `createDefaultLevels`).

```ts
import { logger, type LogEntry, type Transport } from "@revxshafi/logger";

const memory: LogEntry[] = [];
const memoryTransport: Transport = {
  write(entry) {
    memory.push(entry);
  },
};

logger.addTransport(memoryTransport);
```

```ts
interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  timestamp: Date;
}
```

If one transport throws, the logger swallows the error and keeps going — a
broken sink can't crash your app or silence the others. `ConsoleTransport`
itself is defensive too: a hand-built entry with an invalid `Date` timestamp
doesn't throw, the time simply renders as `--:--:--`.

File, webhook, and database transports aren't bundled. The interface is here so
you can add them without touching the core.

### A note on untrusted input

`ConsoleTransport` sanitizes what it prints: control characters and terminal
escape sequences in logged data are stripped (SGR color codes are kept, and
`\t`/`\n`/`\r` survive in the message body), so logging user input can't clear
the consumer's screen, retitle the window, or forge log lines. The `LogEntry`
handed to **custom** transports is intentionally raw — a file or database sink
may want the original bytes — so sanitize there yourself if your sink is a
terminal.

## Attaching to an object

Handy when you pass a single client object around (Discord bots, for one) and
want logging hanging off it:

```ts
logger.attach(client);             // methods land on client.logs
client.logs.info("Bot starting");  // client.logs.<level>(message, context?)

logger.attach(client, "log");      // or pick your own key
client.log.warn("Rate limited");
```

## API reference

**Level methods** — `trace`, `debug`, `info`, `warn`, `error`, `fatal`, each
`(message: unknown, context?: string)`.

**Everything else:**

- `scope(context: string): Logger` — child logger with a fixed context
- `setLevel(level: LogLevel): void` — set the minimum level; less severe calls are dropped
- `setLevelStyle(level, style: Partial<LevelConfig>): void` — override color/display
- `setTimezone(timezone?: string): void` — change the timestamp zone in place (IANA zone or `"local"`; omit to reset to local)
- `listLevels(): Record<LogLevel, LevelConfig>` — current styles
- `addTransport(transport: Transport): void` — add a log sink
- `attach(target, key?): void` — attach `target[key].<level>()` methods (default key `"logs"`); warns when overwriting an existing property and throws on unsafe keys like `"__proto__"`

**Construction:**

```ts
createLogger({
  timezone?: string,     // IANA zone or "local"
  minLevel?: LogLevel,   // least severe level to log; default "trace"
  levels?: Partial<Record<LogLevel, Partial<LevelConfig>>>, // style overrides
  dev?: boolean,         // minimal [ time ] [prefix] message layout
  devColor?: string,     // message color in dev mode; default "#2277FF"
  messageColor?: string, // message color in the normal format
});

createLogger({ default: true }); // explicit defaults; ≡ createLogger()
new Logger(options);             // same options, class form
```

**Exports:** `createLogger`, `Logger`, `logger` (the default instance),
`ConsoleTransport`, `createDefaultLevels`, `isLogLevel` (runtime guard for
level strings), the `LOG_LEVELS` constant, and the
types `LoggerOptions`, `DefaultLoggerOptions`, `CreateLoggerOptions`,
`LogLevel`, `LevelConfig`, `LogEntry`, `Transport`, `TimezoneAwareTransport`,
`ConsoleTransportOptions`, and `TimezoneOption`.

## Development

```bash
npm test               # run the test suite (vitest)
npm run test:coverage  # tests with coverage (100% enforced)
npm run typecheck      # tsc --noEmit
npm run build          # bundle ESM + CJS + types into dist/
npm run verify         # visual demo of every feature
```

CI runs the same checks on Node 18, 20, and 22 for every push and pull
request, plus `publint`, `@arethetypeswrong/cli`, and an `npm pack` dry run.

## License

[MIT](./LICENSE) © revxshafi
