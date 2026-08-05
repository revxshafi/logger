# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0]

A full rewrite of the internals. The public API is almost entirely
backward-compatible (every 1.x call still works) but the architecture, the
performance profile, and the security posture are all new, and the package no
longer has any runtime dependencies.

### Removed

- **The `chalk` dependency.** Colour is now generated directly. The package has
  **zero runtime dependencies**, which removes a transitive supply-chain surface
  and shrinks install size. Colour support is detected per stream and downsampled
  to 256 or 16 colours when that's all the terminal handles; `NO_COLOR`,
  `FORCE_COLOR`, and `TERM=dumb` are honoured.
- **`createLogger({ default: true })`.** It only ever meant `createLogger()`.
  Calls still work (the key is ignored) but it is no longer documented or typed
  as a distinct shape.
- **Source maps from the published tarball.** They pointed at `../src`, which
  never shipped, so they were broken for every consumer and roughly 40kB of dead
  weight.

### Added

- **Structured fields.** Every level method takes an optional third argument of
  `key=value` data, rendered on the line and emitted as real JSON properties.
- **Child loggers.** `child()` derives a logger with composed context and merged
  fields; `with(fields)` and `scope(context)` are shorthands. Children follow the
  parent's level unless pinned with `minLevel`.
- **A formatter layer.** `prettyFormat`, `devFormat`, and `jsonFormat` are
  separate, exported, and independently usable. Formatters own all presentation;
  transports own only I/O.
- **JSON output.** `format: "json"` emits newline-delimited JSON. It reads the
  *unserialized* value, so a logged object stays structured instead of being
  embedded as pretty-printed text.
- **Two new transports.** `streamTransport` writes NDJSON to any writable;
  `memoryTransport` is a fixed-size ring buffer for tests and diagnostics
  endpoints.
- **Per-transport level filtering.** A `minLevel` on a transport lets one logger
  feed a chatty file and a quiet console.
- **Redaction.** `redact: ["password", "token"]` replaces matching field values
  with `"[redacted]"` at any depth, case-insensitively, with cycle-safe traversal
  that does not mistake a diamond reference for a cycle.
- **Lazy messages.** `logger.debug(() => expensive())` only calls the function if
  the entry will actually be logged.
- **`"silent"` as a level threshold**, to switch a logger off entirely.
- **A diagnostics channel.** `setDiagnosticsHandler` surfaces internal problems
  (a transport throwing, an invalid timezone, a bad colour) with a stable code.
  Each distinct diagnostic reports once per process, so a transport failing on
  every line does not itself become a flood.
- **`onError`**, called when a transport throws, alongside the existing
  guarantee that a broken sink cannot crash the process.
- **`flush()` and `close()`**, awaiting every transport that implements them.
- **`removeTransport`, `listTransports`, `isLevelEnabled`**, and a `level`
  getter.
- **Bounded serialization.** `serialize: { depth, maxLength }` caps rendered
  message size (65,536 characters by default) so one `logger.debug(hugePayload)`
  cannot allocate hundreds of megabytes.
- **`multiline` modes.** `"keep"` (default), `"escape"` (one entry is always one
  line), and `"indent"` (continuation lines aligned under the message column).
- **`timestamp` styles**: `"time"`, `"datetime"`, `"iso"`, `"none"`, replacing
  the `showDate` boolean.
- **`stderrLevels`**, to control which levels are routed to stderr.
- **`setColorLevel`**, to force or release colour detection globally.

### Changed

- **Presentation options moved under `console`.** The 1.x spellings are
  deprecated but still honoured, so no call needs to change:

  | 1.x | 2.x |
  | --- | --- |
  | `{ timezone }` | `{ console: { timezone } }` |
  | `{ dev: true }` | `{ console: { format: "dev" } }` |
  | `{ showDate: true }` | `{ console: { timestamp: "datetime" } }` |
  | `{ devColor }` | `{ console: { messageColor } }` |
  | `{ timeColor }` | `{ console: { timeColor } }` |
  | `{ messageColor }` | `{ console: { messageColor } }` |

- **`LogEntry.message` is a lazy, memoized getter** rather than an eagerly-built
  string, and entries now carry `raw`, the unserialized value. A structured
  transport reads `raw` and never pays to pretty-print; a value is rendered at
  most once no matter how many transports read it.

  **This is the one behavioural break worth knowing about.** `{ ...entry }` no
  longer copies `message`, because spread only takes own properties. Read
  `entry.message` directly, or use `entry.toJSON?.()`. `JSON.stringify(entry)`
  still includes it, via `toJSON`.

- **The console transport writes to `process.stdout` / `process.stderr`
  directly** instead of through `console`. This is faster and avoids `console`'s
  `printf` handling silently rewriting a `%%` in a message to `%`. Pass
  `output: "console"` when something in the runtime intercepts `console` to
  collect logs, as some serverless platforms and test runners do.
- **Colour is resolved per stream.** `node app.js > out.log` leaves stderr a TTY
  while stdout is a file; warnings stay coloured in that case.
- **`scope()` is now a thin wrapper over `child()`** rather than its own
  mechanism. Behaviour is unchanged: it replaces the context rather than nesting.
- **Errors render with their `cause` chain** and `AggregateError.errors` when
  present, rather than the stack alone.
- **Build target raised to ES2022** (`engines` remains `>=18`).

### Fixed

- **Unbounded memory from a single log call.** 1.x had no cap on rendered
  message length or on nested string length, so one `logger.debug(hugePayload)`
  could allocate hundreds of megabytes of string. Output is now capped (65,536
  characters by default) with a note saying how much was dropped.
- **`EPIPE` could terminate the process.** Writing to a closed pipe emits an
  `error` event on the stream, and an unhandled one is fatal: `node app.js |
  head` was enough to trigger it. Streams are now guarded with an idempotent
  listener tracked in a `WeakSet`.
- **`%%` in a message was silently rewritten to `%`.** 1.x wrote through
  `console.log`, which runs `util.format` on a single string argument. The
  console transport now writes to the streams directly.
- **Colour was decided once for the whole transport.** With `node app.js >
  out.log`, stderr is still a TTY but warnings came out uncoloured. Colour is
  now resolved per stream.
- **Prototype pollution via JSON field names.** New surface in 2.0: a field
  literally named `__proto__` is written as an own, enumerable property rather
  than reassigning the object's prototype.
- **A field named `toString` was silently dropped** from JSON output, because
  the reserved-key check used `in`, which sees inherited properties. Also new in
  2.0, found by benchmarking.
- **An error's `cause` chain and `AggregateError.errors` were invisible.** 1.x
  printed the stack alone, which omits both.
- **An invalid level was accepted silently**, so a typo in `minLevel` logged
  everything. Invalid configuration now throws a `TypeError` naming the option.
  Errors inside a *log call* are still swallowed, configuration mistakes are
  loud, runtime logging failures are not.
- **`badgeWidth` was unreachable** through the console transport; it is now
  forwarded to the dev format.
- **Internal warnings went to `console.warn` unconditionally**, which is both
  uncontrollable and ironic in a logging library. They now go through the
  diagnostics channel, deduplicated per process.

### Performance

Measured with `npm run bench` (see [bench/index.ts](./bench/index.ts)); absolute
numbers vary by machine, ratios are what matter.

- **A filtered-out call costs ~25ns** and allocates nothing, so leaving
  `logger.debug()` in a hot path is close to free.
- **JSON formatting is ~1.9x faster** than the first 2.0 implementation. Two
  causes: building the line on `Object.create(null)` put V8 into dictionary mode,
  making both property writes and `JSON.stringify` roughly 4x slower, replaced
  with a plain object plus a targeted `__proto__` guard, which is equally safe.
  And `Date#toISOString` cost about as much as encoding the rest of the line;
  it is now memoized per millisecond.
- **Timestamps are memoized per second** in the human-readable formats.
  `Intl.DateTimeFormat#format` is the most expensive part of a pretty line, and
  a service logging a thousand lines a second now formats once.
- **A structured pipeline never pretty-prints.** With `raw` on the entry and a
  lazy `message`, a JSON-only service skips text rendering entirely.

### Internal

- Test suite rewritten: 240 tests across 15 files, **100% statement, branch,
  function, and line coverage**, enforced by the Vitest thresholds. Coverage gaps
  were closed by deleting dead code or adding real assertions, never by relaxing
  a threshold.
- ESLint 9 flat config with type-aware `strictTypeChecked` rules.
- `noUncheckedIndexedAccess` enabled.
- CI now runs lint and typecheck as their own job, tests on Node 18, 20, 22, and
  24, and package checks (`publint`, `@arethetypeswrong/cli`, `npm pack`)
  separately. Concurrency cancellation and least-privilege permissions added.
- `npm publish` now emits provenance attestations.
- Added `npm run bench` and `npm run verify` (renders every feature to a real
  terminal).

## [1.2.1]

### Fixed

- `LOG_LEVELS` is frozen, matching its `readonly` type contract.

### Changed

- Publishing to npm uses trusted publishing (OIDC) rather than a long-lived
  token.
- Richer dev format: coloured date-time and badge backgrounds.

## [1.2.0]

### Added

- `minLevel` filtering.
- `attach()` hazard checks and sanitization of logged output.

### Fixed

- A crash on an invalid timezone.
- Circular and `BigInt` values serialized to `[object Object]`.

## [1.0.0]

Initial release.

[2.0.0]: https://github.com/revxshafi/logger/releases/tag/v2.0.0
[1.2.1]: https://github.com/revxshafi/logger/releases/tag/v1.2.1
[1.2.0]: https://github.com/revxshafi/logger/releases/tag/v1.2.0
[1.0.0]: https://github.com/revxshafi/logger/releases/tag/v1.0.0
