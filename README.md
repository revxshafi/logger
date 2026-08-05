# @revxshafi/logger

[![npm version](https://img.shields.io/npm/v/@revxshafi/logger)](https://www.npmjs.com/package/@revxshafi/logger)
[![npm downloads](https://img.shields.io/npm/dt/@revxshafi/logger)](https://www.npmjs.com/package/@revxshafi/logger)
[![license](https://img.shields.io/npm/l/@revxshafi/logger)](./LICENSE)
[![CI](https://github.com/revxshafi/logger/actions/workflows/ci.yml/badge.svg)](https://github.com/revxshafi/logger/actions/workflows/ci.yml)

Fast, zero-dependency logging for Node.js. Pretty output in development, JSON in
production, structured fields, child loggers, and a transport interface small
enough to implement in five lines. Nothing to configure before it's useful.

```
[12:30:15] [INFO] Application started
[12:30:16] [WARN] [REST] Rate limited retryAfter=30
[12:30:17] [ERROR] [MongoDB] Connection failed
```

- **No dependencies.** Colour, timestamps, and JSON encoding are all built on
  the platform.
- **Cheap when filtered.** A call below the minimum level costs ~25ns and
  allocates nothing.
- **Lazy rendering.** A JSON transport never pays to pretty-print, and a value
  is serialized at most once no matter how many transports read it.
- **Safe with untrusted input.** Terminal escapes are stripped, log-line forgery
  through context tags is impossible, and named fields can be redacted at any
  depth.
- **Typed end to end.** Written in TypeScript; ships ESM, CJS, and types.

## Installation

```bash
npm install @revxshafi/logger
```

Requires Node.js 18 or newer.

## Quick start

```ts
import { logger } from "@revxshafi/logger";

logger.info("Application started");
logger.warn("Rate limited", "REST", { retryAfter: 30 });
logger.error(new Error("Connection failed"), "MongoDB");
```

CommonJS works the same way:

```js
const { logger } = require("@revxshafi/logger");
```

The exported `logger` is ready to use with a console transport already wired up.
It is a **shared singleton**: every module (and every dependency) that imports
it gets the same instance, so `setLevel` and `addTransport` on it are
process-wide. **Libraries should call `createLogger` instead** and let the
application own the configuration.

```ts
import { createLogger } from "@revxshafi/logger";

const log = createLogger({ minLevel: "info", console: { timezone: "UTC" } });
```

## Log calls

Every level method takes the same shape:

```ts
logger.info(message, context?, fields?);
logger.info(message, fields?);
```

- **`message`**: anything. A string, an `Error`, an object, a number. See
  [Serialization](#serialization).
- **`context`**: an optional origin tag, printed as `[MongoDB]`.
- **`fields`**: optional structured data, printed as `key=value` and emitted as
  real JSON properties by the JSON format.

```ts
logger.info("Connected", "MongoDB");
logger.info("Order placed", { orderId: 7741, total: 129.99 });
logger.info("Request complete", "http", { requestId: "01JQ7X", ms: 42 });
```

There are exactly six levels, least to most severe, and the list is not
extensible on purpose: levels describe *severity*, while anything category-like
(`MongoDB`, `payments`) is a **context**.

```ts
logger.trace("Detailed diagnostic information");
logger.debug("Cache warm, 412 keys");
logger.info("Application started");
logger.warn("Rate limit approaching");
logger.error("Database connection failed");
logger.fatal("Unrecoverable, shutting down");
```

`logger.log(level, message, context?, fields?)` takes the level as a value, for
when it's computed.

### Lazy messages

Pass a function and it is only called if the entry will actually be logged, so
an expensive dump costs nothing when it's filtered out:

```ts
logger.debug(() => `state: ${inspect(hugeObject)}`);
```

## Child loggers

`child()` derives a logger that carries a context and fields into every entry.
Contexts compose with `:`, fields merge, and the child follows the parent's
level as it changes.

```ts
const db = logger.child({ context: "db", fields: { pool: "primary" } });

db.info("Pool ready");                          // [db] Pool ready pool=primary
db.child({ context: "tx" }).info("Committed");  // [db:tx] Committed pool=primary
```

Two shorthands:

```ts
logger.scope("cache");            // ≡ child({ context: "cache", replaceContext: true })
logger.with({ requestId: "01JQ7X" }); // ≡ child({ fields: { requestId: "01JQ7X" } })
```

`with()` is the one to reach for per request:

```ts
app.use((req, res, next) => {
  req.log = logger.with({ requestId: req.id, userId: req.user?.id });
  next();
});
```

A child can also pin its own level, independent of the parent:

```ts
const noisy = logger.child({ context: "worker", minLevel: "trace" });
logger.setLevel("warn");  // noisy keeps logging at trace
```

## Filtering by level

Anything below `minLevel` is dropped before it reaches a transport. The default
is `"trace"`, everything logs. `"silent"` switches logging off entirely.

```ts
const log = createLogger({ minLevel: "info" });
log.debug("Not printed");
log.setLevel("warn");
log.info("Not printed anymore");
log.setLevel("silent");   // nothing at all
```

Guard genuinely expensive work with `isLevelEnabled`, though a
[lazy message](#lazy-messages) is usually neater:

```ts
if (log.isLevelEnabled("debug")) log.debug(buildExpensiveReport());
```

Passing something that isn't a level (`setLevel("bogus")`, or a bad `minLevel`
in `createLogger`) throws a `TypeError` immediately rather than silently
logging everything. **Configuration mistakes are loud; only errors inside a log
call are swallowed.**

Individual transports can filter further, so one logger can feed a chatty file
and a quiet console:

```ts
createLogger({
  minLevel: "debug",
  console: { minLevel: "info" },
  transports: [streamTransport({ stream: file })],  // gets debug too
});
```

## Formats

A **format** turns an entry into text, a **transport** decides where that text
goes. The console transport takes a preset name or your own function.

### `pretty` (default)

Aligned, colourized, human-readable.

```
[12:30:15] [INFO] [MongoDB] Connected pool=primary
```

```ts
createLogger({
  console: {
    format: "pretty",
    timestamp: "time",        // "time" | "datetime" | "iso" | "none"
    messageColor: "#2277FF",  // default: the terminal's own colour
    timeColor: "#888888",     // default: dimmed
    multiline: "keep",        // "keep" | "escape" | "indent"
    fields: true,             // render key=value pairs
  },
});
```

### `dev`

A compact layout with a fixed-width, background-filled badge, so messages line
up regardless of level or context length.

```
[ 04-08-2026 12:30:15 ] [INFO ] Application started
[ 04-08-2026 12:30:15 ] [Mongo] Connected
```

```ts
createLogger({ console: { format: "dev", badgeWidth: 5 } });
```

The badge shows the context when there is one, otherwise the level, padded and
truncated to `badgeWidth`. Its background is the level's colour, with black or
white text chosen automatically for contrast.

### `json`

One JSON object per line, for anything that parses logs rather than reads them.

```json
{"time":"2026-08-04T12:30:15.123Z","level":"info","context":"orders","msg":"Order placed","orderId":7741}
```

```ts
createLogger({
  console: { format: "json" },
});

// or configure it
import { jsonFormat } from "@revxshafi/logger";

createLogger({
  console: {
    format: jsonFormat({
      time: "epoch",              // or "iso" (default)
      timeKey: "@timestamp",      // rename any fixed key
      messageKey: "message",
      base: { service: "api" },   // merged into every line
      severity: true,             // numeric level alongside the name
    }),
  },
});
```

The JSON format reaches for the **unserialized** value, so
`logger.info({ orderId: 7 })` emits `"data":{"orderId":7}` rather than a string
containing pretty-printed JSON. Reserved keys always win: a field named `level`
cannot make the stream unparseable.

### Writing your own

A format is just a function.

```ts
import { createLogger, type LogFormatter } from "@revxshafi/logger";

const logfmt: LogFormatter = (entry) =>
  `level=${entry.level} msg=${JSON.stringify(entry.message)}`;

createLogger({ console: { format: logfmt } });
```

## Transports

A transport is any object with `write(entry)`. Every transport gets every entry
that passes the logger's level filter.

```ts
import { logger, type LogEntry, type Transport } from "@revxshafi/logger";

const collected: LogEntry[] = [];
logger.addTransport({ write: (entry) => void collected.push(entry) });
```

Three are built in:

```ts
import { consoleTransport, streamTransport, memoryTransport } from "@revxshafi/logger";

consoleTransport({ format: "dev" });
streamTransport({ stream: fs.createWriteStream("app.log", { flags: "a" }) });
memoryTransport({ limit: 500 });
```

- **`consoleTransport`**: writes to `process.stdout` / `process.stderr`, with
  `warn`/`error`/`fatal` routed to stderr by default (`stderrLevels` changes
  that). It writes to the streams directly rather than through `console`, which
  is faster and avoids `console`'s `printf` handling rewriting a `%%` in your
  message. Set `output: "console"` when something in the runtime intercepts
  `console` to collect logs, as some serverless platforms and test runners do.
- **`streamTransport`**: newline-delimited JSON to any writable. Any object
  with a `write(chunk: string)` method works.
- **`memoryTransport`**: a fixed-size ring buffer, for tests and for exposing
  recent logs on a diagnostics endpoint. `entries()`, `messages()`, `size`,
  `clear()`.

```ts
const buffer = memoryTransport({ limit: 100 });
const log = createLogger({ transports: [buffer] });

app.get("/_logs", (req, res) => res.json(buffer.entries()));
```

`transports` **replaces** the default console transport. Pass `console` as well
to keep both:

```ts
createLogger({ transports: [file] });                    // file only
createLogger({ transports: [file], console: {} });       // file and console
createLogger({ console: false });                        // nowhere, until you add one
```

### Failure handling

If a transport throws, the logger swallows it and keeps going, a broken sink
cannot crash your application or silence the others. Pass `onError` to be told:

```ts
createLogger({
  transports: [flaky],
  onError: (error, transport) => reportToSentry(error),
});
```

Without a handler, failures are reported once through the diagnostics channel
rather than disappearing:

```ts
import { setDiagnosticsHandler } from "@revxshafi/logger";

setDiagnosticsHandler(({ code, message, error }) => {
  // code: "transport-error" | "invalid-timezone" | "invalid-color" | …
});
```

Each distinct diagnostic is reported once per process, so a transport failing on
every line does not itself become a flood.

### Flushing and shutdown

```ts
await log.flush();  // wait for buffered output
await log.close();  // flush, then release resources
```

Both are safe to call on transports that implement neither.

## Serialization

Anything can be logged; the renderer figures it out.

| Input                         | Rendered as                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `string`                      | as-is                                                           |
| `Error`                       | its stack (with `cause` and `AggregateError.errors` when present)|
| plain object / array          | indented JSON, falling back to `util.inspect` when JSON can't    |
| `Map`, `Set`, class instances | `util.inspect`, so contents show instead of `{}`                 |
| `bigint`                      | `123n`                                                          |
| everything else               | `String(value)`                                                 |

Two guarantees hold no matter what you pass:

- **It never throws.** A revoked proxy, an object whose `stack` getter explodes,
  a value from another realm, all render to *something*.
- **It's bounded.** A rendered message is capped (65,536 characters by default)
  with a note saying how much was dropped, so one `logger.debug(hugePayload)`
  can't allocate hundreds of megabytes.

```ts
createLogger({ serialize: { depth: 6, maxLength: 8192 } });
```

## Redaction

Field names listed in `redact` have their values replaced with `"[redacted]"`,
at any depth, matched case-insensitively.

```ts
const log = createLogger({ redact: ["password", "token", "authorization"] });

log.info("Login", { user: { name: "ada", password: "hunter2" } });
// … user={"name":"ada","password":"[redacted]"}
```

This applies to **fields**, not to message text: a secret interpolated into a
string was already a string by the time the logger saw it.

## Untrusted input

Logging data that came from a user is a real attack surface: a message
containing `]0;` can retitle the operator's terminal, and one containing a
newline plus a fake prefix can forge a log line that an analyst reads as
genuine. The console transport handles this:

- **Terminal escapes are stripped** from everything it prints. Colour codes it
  generates itself survive; codes arriving in your data do not.
- **Context tags can never break out** onto a line of their own, newlines in a
  context are neutralized.
- **Message bodies keep their newlines by default**, because stack traces need
  them. For untrusted bodies, `multiline: "escape"` collapses an entry to
  exactly one line with breaks shown as `\n`, so one entry is always one line:

```ts
createLogger({ console: { multiline: "escape" } });
```

`multiline: "indent"` is the middle ground: breaks are kept, but continuation
lines are aligned under the message column so a multi-line body is visibly one
entry.

The `LogEntry` handed to **custom** transports is deliberately raw; a file or
database sink may want the original bytes. Sanitize yourself if your sink is a
terminal.

## Colour

Colour depth is detected per stream (`stdout` being redirected to a file while
`stderr` is still a terminal is handled correctly) and honours `NO_COLOR`,
`FORCE_COLOR`, and `TERM=dumb`. Truecolour is downsampled to 256 or 16 colours
when that's all the terminal supports.

```ts
createLogger({ console: { colors: false } });  // off
createLogger({ console: { colors: true } });   // assume truecolour
createLogger({ console: { colors: 2 } });      // pin to 256 colours

import { setColorLevel } from "@revxshafi/logger";
setColorLevel(0);     // force globally, e.g. in tests
setColorLevel(null);  // back to detection
```

Every level has a colour and a display label, overridable up front or at
runtime. Both forms are partial.

```ts
createLogger({
  levels: {
    info: { color: "#00FFAA", display: "INFO*" },
    error: { color: "#FF5555" },  // display stays "ERROR"
  },
});

logger.setLevelStyle("info", { display: "NOTE" });
logger.listLevels();  // current styles for all six
```

Colours must be `"#RGB"` or `"#RRGGBB"`. An invalid one never crashes or
silently paints things black, the logger reports it and keeps the default.

## Timezones

Timestamps use the platform's `Intl`, so there's no date library to ship.

```ts
const log = createLogger({ console: { timezone: "UTC" } });

log.setTimezone("Asia/Dhaka");  // change in place
log.setTimezone();              // back to the host zone
```

Any IANA zone works, or `"local"`. An invalid zone reports a diagnostic and
falls back to local time rather than crashing. `timestamp: "iso"` always renders
UTC and ignores the zone.

## Attaching to an object

Handy when you pass one client object around and want logging hanging off it:

```ts
logger.attach(client);             // methods land on client.logs
client.logs.info("Bot starting");

logger.attach(client, "log");      // or pick the key
```

Unsafe keys (`__proto__`, `constructor`, `prototype`) throw; overwriting an
existing property reports a diagnostic first.

## API reference

### Logger

| Method | Description |
| --- | --- |
| `trace` `debug` `info` `warn` `error` `fatal` | `(message, context?, fields?)` or `(message, fields?)` |
| `log(level, message, context?, fields?)` | Same, with the level as a value |
| `child(options)` | Derive a logger with composed context and fields |
| `scope(context)` | Derive with a replaced context |
| `with(fields)` | Derive with added fields |
| `level` | Current threshold (getter) |
| `setLevel(level)` | Set the threshold; throws on an invalid level |
| `isLevelEnabled(level)` | Whether a call at this level would be logged |
| `setLevelStyle(level, style)` | Override colour and/or display label |
| `listLevels()` | Current styles for all six levels |
| `setTimezone(timezone?)` | Change the zone on every timezone-aware transport |
| `addTransport(t)` / `removeTransport(t)` / `listTransports()` | Manage sinks |
| `flush()` / `close()` | `Promise<void>`; awaits every transport |
| `attach(target, key?)` | Hang level methods off `target[key]` (default `"logs"`) |

### Exports

**Values**: `createLogger`, `Logger`, `logger`, `LogRecord`,
`consoleTransport`, `ConsoleTransport`, `streamTransport`, `StreamTransport`,
`memoryTransport`, `MemoryTransport`, `prettyFormat`, `devFormat`, `jsonFormat`,
`createDefaultLevels`, `isLogLevel`, `isLevelThreshold`, `LOG_LEVELS`,
`SEVERITY`, `setColorLevel`, `setDiagnosticsHandler`.

**Types**: `LoggerOptions`, `ChildOptions`, `LogLevel`, `LevelThreshold`,
`LevelConfig`, `LogEntry`, `LogFields`, `LogMeta`, `LazyMessage`,
`LogFormatter`, `Transport`, `TimezoneAwareTransport`, `TransportErrorHandler`,
`WritableLike`, `PrettyFormatOptions`, `DevFormatOptions`, `JsonFormatOptions`,
`ConsoleTransportOptions`, `StreamTransportOptions`, `MemoryTransportOptions`,
`SerializeOptions`, `TimestampStyle`, `TimezoneOption`, `MultilineMode`,
`ColorOption`, `ColorLevel`, `Diagnostic`, `DiagnosticCode`,
`DiagnosticHandler`.

Anything under `internal/` is not part of the public API and may change in a
patch release.

## Upgrading from 1.x

Every 1.x call still works. Presentation options moved under `console`, and the
old spellings are deprecated but honoured:

| 1.x | 2.x |
| --- | --- |
| `createLogger({ timezone })` | `createLogger({ console: { timezone } })` |
| `createLogger({ dev: true })` | `createLogger({ console: { format: "dev" } })` |
| `createLogger({ showDate: true })` | `createLogger({ console: { timestamp: "datetime" } })` |
| `createLogger({ devColor })` | `createLogger({ console: { messageColor } })` |
| `createLogger({ default: true })` | `createLogger()` |

There is **one** behavioural change to know about. `LogEntry.message` is now a
lazy getter on the prototype rather than an own property, so serialization only
happens if something reads it:

```ts
// 1.x: worked. 2.x: `message` is missing, spread only copies own properties.
const copy = { ...entry };

// 2.x: use either of these instead.
const text = entry.message;
const copy = entry.toJSON?.();
```

`JSON.stringify(entry)` still includes the message, via `toJSON`. This is what
lets a JSON-only pipeline skip text rendering altogether, which is the dominant
cost in a log call.

`chalk` is gone (colour is generated directly, so the package now has zero
runtime dependencies) and source maps are no longer published. Neither is visible
to calling code.

## Development

```bash
npm test               # run the suite (vitest)
npm run test:coverage  # with coverage; 100% is enforced
npm run typecheck      # tsc --noEmit
npm run lint           # eslint, type-aware
npm run build          # bundle ESM + CJS + types into dist/
npm run bench          # throughput benchmark
npm run verify         # render every feature to a real terminal
```

Before pushing: `npm run typecheck && npm run lint && npm test`. CI runs the same
on Node 18, 20, 22, and 24. Contributing guidelines, design constraints, and the
release process are in [MAINTAINING.md](./MAINTAINING.md).

Security issues: please report privately through a
[GitHub security advisory](https://github.com/revxshafi/logger/security/advisories/new)
rather than a public issue. What the package does and does not defend against is
documented in [MAINTAINING.md](./MAINTAINING.md#threat-model).

## License

[MIT](./LICENSE) © revxshafi
