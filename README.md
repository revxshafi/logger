# @revxshafi/logger

[![npm version](https://img.shields.io/npm/v/@revxshafi/logger)](https://www.npmjs.com/package/@revxshafi/logger)
[![npm downloads](https://img.shields.io/npm/dt/@revxshafi/logger)](https://www.npmjs.com/package/@revxshafi/logger)
[![license](https://img.shields.io/npm/l/@revxshafi/logger)](./LICENSE)

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
console transport already wired up. Reach for `new Logger()` only when you want
a separate configuration (a different timezone, its own transports).

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
API — no `moment`, no extra dependency. Set the zone up front when you construct
a `Logger`, or change it later on the one you already have:

```ts
import { logger, Logger } from "@revxshafi/logger";

logger.setTimezone("Asia/Dhaka");          // change the default logger in place
logger.setTimezone();                      // no argument → back to the host zone

const utc = new Logger({ timezone: "UTC" }); // or set it at construction time
```

`timezone` accepts any IANA zone (`"Asia/Dhaka"`, `"UTC"`, …) or `"local"`,
which follows the host. Both `new Logger()` and a bare `setTimezone()` default
to `"local"`. An invalid zone never crashes your app: the logger prints an
error naming the bad zone and falls back to the host's local time.

## Filtering by level

Set a minimum level and anything less severe is dropped before it reaches any
transport. The default is `"trace"` — everything logs.

```ts
const log = new Logger({ minLevel: "info" }); // set it at construction…
log.debug("Not printed");
log.info("Printed");

log.setLevel("warn");                          // …or change it later
log.info("Not printed anymore");
```

Scoped loggers share the minimum level with the logger they came from, so one
`setLevel()` call quiets the whole family.

## Styling levels

Every level has a color and a display label. Only the metadata is colored — the
timestamp is dimmed, the badge takes the level's color, the context is dimmed,
and the **message body stays your terminal's default color** so JSON and stack
traces remain readable.

```ts
logger.setLevelStyle("info", { color: "#00FFAA", display: "INFO*" });

logger.listLevels();
// { trace: {...}, debug: {...}, info: { color: "#00FFAA", display: "INFO*" }, ... }
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
broken sink can't crash your app or silence the others.

File, webhook, and database transports aren't bundled. The interface is here so
you can add them without touching the core.

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

**Constructor:**

```ts
new Logger({
  timezone?: string,  // IANA zone or "local"
  minLevel?: LogLevel // least severe level to log; default "trace"
});
```

**Exports:** `Logger`, `logger` (the default instance), `ConsoleTransport`,
`createDefaultLevels`, the `LOG_LEVELS` constant, and the types `LoggerOptions`,
`LogLevel`, `LevelConfig`, `LogEntry`, `Transport`, `TimezoneAwareTransport`,
`ConsoleTransportOptions`, and `TimezoneOption`.

## License

[MIT](./LICENSE) © revxshafi
