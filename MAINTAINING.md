# Maintaining

Notes for working on the package itself. If you just want to use it, the
[README](./README.md) is the place to be.

This is a small package with a deliberately small surface area, so the bar for
adding to it is high. Bug reports, failing test cases, and fixes are always
welcome.

## Getting set up

```bash
git clone https://github.com/revxshafi/logger.git
cd logger
npm ci
npm test
```

Node.js 18 or newer. There are no runtime dependencies and there should not be
any, see [Design constraints](#design-constraints).

## The commands

```bash
npm test               # run the suite
npm run test:watch     # …in watch mode
npm run test:coverage  # with coverage; 100% is enforced
npm run typecheck      # tsc --noEmit
npm run lint           # eslint, type-aware
npm run lint:fix       # …with autofix
npm run build          # bundle ESM + CJS + types into dist/
npm run lint:package   # publint + @arethetypeswrong/cli
npm run bench          # throughput benchmark
npm run verify         # render every feature to a real terminal
```

Before opening a pull request, `npm run typecheck && npm run lint && npm test`
should all pass. CI runs the same checks on Node 18, 20, 22, and 24.

## Design constraints

These are the rules the package is built around. A change that breaks one of
them needs a strong argument.

**No runtime dependencies.** Colour, timestamps, and JSON encoding are all built
on the platform. A logger sits in the dependency tree of everything, so every
transitive package it pulls in is a supply chain surface for every consumer.

**A log call must never throw.** Whatever a caller passes, a revoked proxy, an
object whose `stack` getter explodes, a value from another realm, has to render
to *something*. The same goes for transports: if one throws, the logger swallows
it and keeps going.

**Configuration mistakes are loud; runtime failures are quiet.** An invalid
`minLevel` throws a `TypeError` immediately, because silently logging everything
is worse than a crash at startup. An error inside a *log call* is reported
through the diagnostics channel and never propagates.

**Cost scales with what's actually logged.** A filtered out call should allocate
nothing. A structured transport should never pay to pretty-print. If you're
adding work to the hot path, `npm run bench` before and after.

**Untrusted input is assumed.** Terminal escapes are stripped, context tags
cannot forge a log line, and rendered messages are length bounded. New formatters
and terminal bound transports inherit this obligation.

**Presentation lives in formatters, I/O lives in transports.** If you find
yourself writing layout code in a transport, it belongs in a formatter.

## Tests

The suite enforces **100% statement, branch, function, and line coverage**. This
is not decorative, it exists so that dead code gets noticed. When you hit a gap:

- If the code is genuinely unreachable, delete it.
- If it's a defensive branch that can't be triggered from the public API, mark
  it with a `/* c8 ignore */` pragma **and a comment saying why**.
- Otherwise, write the test.

Do not lower a threshold to make a build pass.

Tests live in `test/`, mirroring `src/`. Shared fixtures are in
`test/helpers.ts`, notably `FakeStream` (a `WritableLike` that collects lines)
and `FIXED` (a frozen timestamp), which together keep output assertions exact
rather than approximate.

Prefer asserting on the exact rendered line over a `toContain`. Several real
bugs in this package were formatting regressions that a substring check would
have let through.

## Code style

`eslint.config.js` is the authority; `npm run lint` is the check. A few things
it can't enforce:

- **Comments explain *why*, not *what*.** If a comment restates the line below
  it, delete it. If a piece of code looks wrong until you know some constraint,
  that constraint is what the comment is for.
- **Public API members get a doc comment.** Everything a consumer can name should
  be documented at the definition, not only in the README.
- **`src/internal/` is not public.** It's excluded from the exports map and may
  change in a patch release. Anything a consumer needs belongs in `src/types.ts`
  and the `src/index.ts` export list.

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
loosely: `feat:`, `fix:`, `perf:`, `docs:`, `test:`, `chore:`, `ci:`. The subject
line should say what changed and, where it isn't obvious, why.

In a pull request, please include:

- What problem it solves. A failing test is the clearest possible statement of a
  bug.
- Whether it changes public behaviour, and if so, how a consumer would notice.
- Benchmark numbers if it touches the hot path.

## Reporting bugs

Open an issue with a minimal reproduction: the shortest program that shows the
problem, the Node version, and what you expected instead. If it's a formatting
issue, paste the literal output rather than a screenshot.

For anything security related, see [Reporting a vulnerability](#reporting-a-vulnerability)
below. Please don't open a public issue.

## Reporting a vulnerability

Please report security issues privately, **not** through a public issue.

- Open a [private security advisory](https://github.com/revxshafi/logger/security/advisories/new)
  on GitHub, or
- Email <reversalxp@gmail.com>.

Please include a description of the issue, the version affected, and a minimal
reproduction if you have one. You'll get an acknowledgement within a few days.
If the report is confirmed, a fix and an advisory will follow, and you'll be
credited unless you'd rather not be.

Supported versions: **2.x** yes, **1.x** no.

Fixes ship as a patch release with an accompanying GitHub advisory. If a fix
requires a breaking change, the advisory will say so and explain the migration.

## Threat model

A logger's job is to render values it does not control into an output nobody
audits. That makes a few classes of problem this package's responsibility.

**What is defended against:**

- **Terminal escape injection.** Control characters and ANSI escape sequences
  arriving in logged data are stripped before the console transport prints them,
  so logged input cannot clear an operator's screen, retitle their window, or
  drive the terminal in any other way. Colour codes the formatter generates
  itself survive; codes arriving in your data do not.
- **Log forgery.** A newline in a context tag cannot emit what looks like a
  second, genuine log line. For message *bodies*, newlines are preserved by
  default because stack traces need them; `multiline: "escape"` guarantees one
  entry is exactly one line and is the right setting when bodies are untrusted.
- **Prototype pollution.** A field named `__proto__` becomes an ordinary own
  property in JSON output rather than reassigning a prototype. `attach()` rejects
  `__proto__`, `constructor`, and `prototype` as target keys.
- **Unbounded memory from a single call.** Rendered messages are length capped
  (65,536 characters by default, configurable via `serialize.maxLength`) and
  object depth is bounded, so one call cannot allocate unboundedly.
  `memoryTransport` is a fixed size ring buffer for the same reason.
- **Crashes from hostile values.** Serialization never throws, whatever it is
  handed. Writing to a closed pipe does not terminate the process.
- **Denial of service through a broken sink.** A transport that throws is
  isolated: the logger reports it once and keeps going.
- **Supply chain surface.** The package has zero runtime dependencies. Releases
  are published through GitHub OIDC trusted publishing with provenance
  attestations, so there is no long lived npm token to steal.

**What is not:**

- **Secrets you log on purpose.** `redact` matches field *names*, at any depth,
  it cannot find a credential interpolated into a message string, because that
  was already a string by the time the logger saw it.
- **Entries handed to custom transports.** These are deliberately raw: a file or
  database sink may want the original bytes. If your custom transport writes to
  a terminal, sanitize there.
- **Log volume as a resource.** Rate limiting is an application concern; the
  logger will faithfully write whatever it's asked to.
- **What happens to logs downstream.** Access control, retention, and transport
  level encryption are all the responsibility of wherever the lines end up.

## Releasing

Maintainers only. Publishing runs from a GitHub release, through trusted
publishing (OIDC), with provenance attestations. There is no long lived npm
token anywhere.

1. Update `CHANGELOG.md`.
2. Bump the version in `package.json`.
3. Tag and create a GitHub release; the workflow verifies and publishes.

## License

Contributions are licensed under [MIT](./LICENSE), the same as the project.
