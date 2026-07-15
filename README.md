# @revxshafi/logger

![npm version](https://img.shields.io/npm/v/@revxshafi/logger)
![npm downloads](https://img.shields.io/npm/dt/@revxshafi/logger)
![license](https://img.shields.io/npm/l/@revxshafi/logger)

> Flexible, colorful, and easy-to-use logging for Node.js — a small set of
> fixed log levels, context tags, scoped loggers, timezone-aware timestamps,
> and pluggable transports. Written in TypeScript, ships ESM + CJS + types.

---

## Table of Contents

- [Installation](#installation)
- [Features](#features)
- [Quick Start](#quick-start)
- [Log Levels](#log-levels)
- [Context Tags](#context-tags)
- [Scoped Loggers](#scoped-loggers)
- [Timezones](#timezones)
- [Styling Levels](#styling-levels)
- [Serialization](#serialization)
- [Transports](#transports)
- [Attaching to an Object](#attaching-to-an-object)
- [API Reference](#api-reference)
- [License](#license)

---

## Installation

```bash
npm install @revxshafi/logger
```

---

## Features

- 🎚 **Six fixed log levels** — `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- 🏷 **Context tags** — separate *severity* from *category*
- 🔭 **Scoped loggers** — pre-bind a context once
- 🌍 **Timezone-aware timestamps** — native `Intl`, no `moment`
- 🎨 **Metadata-only coloring** — JSON and stack traces stay readable
- 🔌 **Pluggable transports** — `ConsoleTransport` ships; add your own
- 🧾 **Smart serialization** — strings, objects, and `Error`s handled automatically
- 📦 **TypeScript-first** — strict types, ESM + CJS builds, bundled `.d.ts`

---

## Quick Start

```ts
import { logger } from "@revxshafi/logger";

logger.info("Application started");
logger.warn("Rate limit detected");
logger.error("Database connection failed");
```

```
[12:30:15] [INFO] Application started
[12:30:16] [WARN] Rate limit detected
[12:30:17] [ERROR] Database connection failed
```

CommonJS works too:

```js
const { logger } = require("@revxshafi/logger");
```

---

## Log Levels

There are exactly six levels — fixed, not extensible. Categories like
`MongoDB` or `Commands` are **contexts**, not levels (see below).

```ts
logger.trace("Detailed diagnostic information");
logger.debug("Debug information");
logger.info("Application started");
logger.warn("Rate limit detected");
logger.error("Database connection failed");
logger.fatal("Application crashed");
```

---

## Context Tags

Pass an optional second argument to tag a message with a context. It's omitted
entirely when not provided (you'll never see `[undefined]`).

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

---

## Scoped Loggers

Create a child logger with a fixed context:

```ts
const mongo = logger.scope("MongoDB");

mongo.info("Connected");
mongo.error("Connection failed");
```

```
[12:30:15] [INFO] [MongoDB] Connected
[12:30:16] [ERROR] [MongoDB] Connection failed
```

A per-call context overrides the scope, and re-scoping overrides rather than
composing:

```ts
mongo.info("Reconnecting", "Retry"); // [INFO] [Retry] Reconnecting
mongo.scope("Cache").info("Warmed"); // [INFO] [Cache] Warmed
```

Scoped loggers share configuration and transports with their parent.

---

## Timezones

Configure a timezone when constructing a `Logger`. Timestamps are always
`HH:MM:SS`, 24-hour.

```ts
import { Logger } from "@revxshafi/logger";

const dhaka = new Logger({ timezone: "Asia/Dhaka" }); // any IANA zone
const local = new Logger();                            // { timezone: "local" }
```

---

## Styling Levels

Each level has a badge color and display label. Only metadata is colored — the
timestamp is dimmed, the level badge is colored per its config, the context is
dimmed, and the **message body keeps the default terminal color**.

```ts
logger.setLevelStyle("info", { color: "#00FFAA", display: "INFO*" });

console.log(logger.listLevels());
// { trace: {...}, debug: {...}, info: { color: '#00FFAA', display: 'INFO*' }, ... }
```

---

## Serialization

Inputs are typed `unknown` and handled by shape:

| Input          | Output                                             |
| -------------- | -------------------------------------------------- |
| `Error`        | `message` + newline + `stack`                      |
| plain object   | `JSON.stringify(value, null, 2)` (falls back to `String` on failure, e.g. circular refs) |
| everything else | `String(value)`                                   |

```ts
logger.error(new Error("Something broke"));
logger.debug({ user: "john", action: "login" });
logger.info(42);
```

---

## Transports

A transport is any object with a `write(entry: LogEntry)` method. The default
logger wires up a `ConsoleTransport` automatically; add more with
`addTransport`.

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

> File / Discord webhook / DB transports aren't included — the interface is here
> so you can bolt them on without touching the core.

---

## Attaching to an Object

Bolt logging methods onto an external object (handy for Discord-bot clients):

```ts
logger.attach(client);            // default key "logs"
client.logs.info("Bot starting"); // client.logs.<level>(message, context?)

logger.attach(client, "log");     // custom key
client.log.warn("Rate limited");
```

---

## API Reference

### Level methods

`logger.trace(message, context?)`, `.debug`, `.info`, `.warn`, `.error`, `.fatal`
— `message` is `unknown`, `context` is an optional `string`.

### Other methods

- `scope(context: string): Logger` — child logger with a fixed context
- `setLevelStyle(level, style: Partial<LevelConfig>): void` — override color/display
- `listLevels(): Record<LogLevel, LevelConfig>` — current styles
- `addTransport(transport: Transport): void` — add a log sink
- `attach(target, key?): void` — attach `target[key].<level>()` methods (default key `"logs"`)

### Constructor

```ts
new Logger({ timezone?: string /* IANA zone or "local" */ });
```

### Exports

`Logger`, `logger` (default instance), `ConsoleTransport`, and the types
`LoggerOptions`, `LogLevel`, `LevelConfig`, `LogEntry`, `Transport`,
`TimezoneOption`, plus the `LOG_LEVELS` constant.

---

## License

[MIT](./LICENSE) © revxshafi
