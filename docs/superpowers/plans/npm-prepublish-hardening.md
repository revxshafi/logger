# Pre-publish audit, hardening & refactor — @revxshafi/logger

On approval this document is first materialized at `docs/superpowers/plans/npm-prepublish-hardening.md` (Phase 2 deliverable), then executed (Phase 3).

---

## PHASE 1 — AUDIT REPORT

Every finding below marked **[confirmed]** was reproduced empirically against the built package, not just read from source.

### Critical

- **C1 — `serialize()` can crash the host app.** [confirmed] `emit()` calls `serialize(message)` *outside* the per-transport try/catch (src/logger.ts:217-227). A hostile-but-realistic object crashes the caller:
  - `Error` whose `stack` getter throws → `log.error(e)` throws into user code.
  - A revoked `Proxy` → `Object.getPrototypeOf` throws.
  This violates the library's own stated guarantee ("a logging call must never crash the host"). **Fix:** wrap serialization in try/catch with an `inspect`-then-placeholder fallback chain, and treat the whole of `emit()` as must-not-throw.

- **C2 — Types resolution masquerade (packaging).** Top-level `"types": "./dist/index.d.ts"` (ESM-flavored declarations) is paired with `"main": "./dist/index.cjs"` under `"type": "module"`. Node10/`types`-fallback consumers resolve CJS runtime + ESM types — the classic ATTW "masquerading" failure. **Fix:** top-level `types` → `./dist/index.d.cts` (matches `main`); `exports` map is already correct per-condition. Verify with `@arethetypeswrong/cli` + `publint` (both available through the package firewall — checked).

### Warning

- **W1 — ANSI / control-character injection.** [confirmed] Logged data and the `context` string pass raw to the terminal: `log.info(userInput)` containing `ESC[2J` clears the screen; `ESC]0;…BEL` sets the window title; `\r` + fake timestamp forges log lines. Classic log-injection sink. **Fix:** sanitize in `ConsoleTransport.write` — strip C0 controls (keep `\t` `\n` `\r` in message for stack traces), strip all ESC sequences *except* SGR color codes (`ESC[…m`, linear regex, no ReDoS) so pre-colored messages still render; context is a single token → also strip `\r`/`\n` there. `LogEntry` stays raw (documented) so custom transports decide for themselves.

- **W2 — `chalk.hex()` failure modes.** [confirmed] `chalk.hex(undefined)` **throws** (`Cannot read properties of undefined`), and invalid strings (`"#ZZZZZZ"`, `"blue"`) silently render **black** (`38;2;0;0;0`). Reachable via `setLevelStyle("info", { color: undefined })` (JS, or TS without `exactOptionalPropertyTypes`) and via config typos. Inside `Logger` the blanket catch turns the throw into *silent log loss*; a standalone `ConsoleTransport` crashes. **Fix:** validate `#RGB`/`#RRGGBB` at every boundary (constructor `levels`, `setLevelStyle`, `devColor`, `messageColor`); invalid → warn once + fall back to the level default.

- **W3 — Fail-open runtime validation (JS consumers).** [confirmed]
  - `setLevel("bogus")` → `indexOf` = −1 → **everything** logs (fails open, silently).
  - Constructor `minLevel` has the same hole; bogus keys in `levels` are silently ignored; `setLevelStyle("bogus", …)` inserts junk into the shared level store.
  - `createLogger({ default: true, minLevel: "error" })` from JS silently **drops** the override [confirmed] — TS rejects it, JS gets a logger that claims defaults while the caller believes otherwise.
  **Fix:** `TypeError` at config boundaries (config-time programmer errors should be loud; log-time errors stay swallowed). Add an `isLogLevel` guard.

- **W4 — `verify.ts` is never typechecked.** `tsconfig.include: ["src"]` — the smoke script drifted from the API once already this week. **Fix:** widen `include` to cover `verify.ts` + new `test/`.

- **W5 — Sourcemaps ship broken and double the tarball.** [confirmed: 89 kB unpacked, ~40 kB of it maps] Maps reference `../src/*` which is excluded from the tarball → every consumer gets dangling maps. **Fix:** `sourcemap: false` in tsup.

- **W6 — `engines: ">=16"`** — Node 16 has been EOL since 2023. **Fix:** `">=18"`.

- **W7 — `.npmignore` is redundant and a footgun** beside `files: ["dist"]` (`files` wins today, but an ignore file that *looks* authoritative invites future mistakes). **Fix:** delete it. (Tracked in git, so this is a git rm.)

- **W8 — Mutable module-level singleton `logger`.** Any consumer's `addTransport`/`setLevel` mutates the instance shared across the whole dependency tree. This is a common, accepted pattern (`debug`, `consola`) — **keep it**, but document the sharing explicitly in the README.

### Optimization

- **O1** — `LOG_LEVELS.indexOf(level)` twice per `emit` → precompute a `SEVERITY: Record<LogLevel, number>` once.
- **O2** — `chalk.hex(color)` builds a fresh styler on every `write` → cache stylers per hex string.
- **O3** — `sideEffects: false` for bundler tree-shaking (the `logger` singleton construction is pure).
- **O4** — `exports["./package.json"] = "./package.json"` (tooling convention).

### Architectural

- **A1 — `attach(target: Record<string, unknown>)` rejects class instances** — the README's own headline use case (`client.logs.info` on a Discord `Client`) doesn't compile without a cast. **Fix:** `attach<T extends object>(target: T, key?: string)`. Breaking-safe: package is unpublished.
- **A2 — No test suite.** `verify.ts` is eyeball-only; nothing is asserted. **Fix:** vitest + `@vitest/coverage-v8`, 100 % thresholds on `src/` (see TDD map below). `verify.ts` stays — the Replit run button executes it (`.replit` → `tsx verify.ts`) — demoted to a visual demo.
- **A3 — `prepublishOnly` only builds.** **Fix:** `typecheck && test && build && publint && attw`.
- **A4 — Full structural redesign: NOT warranted.** ~350 LOC, single transport, clean module split (`types` / `levels` / `timestamp` / `logger` / `transports/`). A "professional-grade re-architecture" here would be churn, not engineering. The `Map<LogLevel, LevelConfig>` shared-store design stays — shared-reference semantics are exactly what `setLevelStyle` needs.

### Explicitly rejected

- Rewriting to `Record` level-stores, plugin systems, event emitters, worker-thread transports — all disproportionate to scope.
- ESLint/Prettier setup — no linter is configured; adding one is a separate decision, not a pre-publish gate. (Flag to user, not done here.)
- Comment policy: per user decision, JSDoc on public APIs **and** the sparse `// … => …` decision one-liners are kept; everything else goes.

---

## PHASE 2 — ROADMAP (file-by-file, TDD-mapped)

Order: tests are written first per area, red → green.

### New files

| File | Purpose |
|---|---|
| `docs/superpowers/plans/npm-prepublish-hardening.md` | This document (Phase 2 deliverable). |
| `src/sanitize.ts` | `sanitizeMessage()` (strip C0 except `\t\n\r`; strip non-SGR ESC), `sanitizeContext()` (also strips `\r\n`). Internal, not exported from index. |
| `src/color.ts` | `isHexColor()` (`#RGB`/`#RRGGBB`), `resolveHex()` with warn-once + fallback, styler cache (O2). Internal. |
| `vitest.config.ts` | Coverage provider v8, `thresholds: { lines/branches/functions/statements: 100 }`, scope `src/**`. |
| `test/serialize.test.ts` | C1: hostile `stack` getter, revoked proxy, circular, `toJSON → undefined`, nested bigint, function, symbol, Map/Set via inspect, cross-realm error. |
| `test/logger.test.ts` | W3: bogus `setLevel`/`minLevel`/`setLevelStyle`/`levels` keys throw; `default:true`+overrides throws from JS. Filtering, scope precedence, transport-error swallowing, `listLevels` copy semantics. |
| `test/attach.test.ts` | A1: class instance target, `__proto__`/`constructor`/`prototype` rejection, overwrite warning, all six methods bound. |
| `test/sanitize.test.ts` | W1: ESC[2J stripped, OSC stripped, SGR preserved, `\n` kept in message, `\n` stripped from context, C0 stripped. |
| `test/console-transport.test.ts` | Layout assertions (ANSI-stripped), dev format + prefix fallback, `devColor`/`messageColor` chain, stderr routing, W2 invalid-hex fallback + warn-once, `setTimezone`. |
| `test/timestamp.test.ts` | UTC/named zone, invalid zone → error line + local fallback, midnight renders `00`, B3 `hourCycle` pin. |
| `test/levels.test.ts` + `test/index.test.ts` | Default styles fresh-copy semantics; public export surface incl. singleton. |
| `.github/workflows/ci.yml` | GitHub Actions CI: on push/PR to `main` — checkout, setup-node (matrix: 18 / 20 / 22, npm cache), `npm ci`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, `npx publint`, `npx attw --pack .`, `npm pack --dry-run`. One job, matrix over Node versions. |

### Modified files

- **`src/logger.ts`** — C1: `serialize` wrapped (`inspect` fallback → `"<unserializable>"` placeholder); `emit` hardened end-to-end. W3: validate `minLevel`, `levels` keys, `setLevel`, `setLevelStyle` (TypeError). O1: `SEVERITY` record replaces `indexOf`. A1: generic `attach<T extends object>`. `createLogger`: runtime throw when `default: true` is combined with overrides. Comment sweep per policy.
- **`src/transports/console.ts`** — W1: sanitize message/context at write. W2/O2: `resolveHex` + styler cache for badge, `devColor`, `messageColor`. Validate colors in constructor.
- **`src/levels.ts`** — add `SEVERITY`, `isLogLevel()` guard.
- **`src/timestamp.ts`** — pin `hourCycle: "h23"` (replaces `hour12: false`; drop the redundant flag).
- **`src/types.ts`** — JSDoc note on `LogEntry` being unsanitized for custom transports. No shape changes.
- **`src/index.ts`** — JSDoc on `logger` singleton documenting shared mutability (W8). Export `isLogLevel` (useful to consumers validating user input).
- **`package.json`** — C2: `types` → `./dist/index.d.cts`. W6: engines `>=18`. O3: `sideEffects: false`. O4: `./package.json` export. A3: scripts `test`, `test:coverage`, `prepublishOnly": "npm run typecheck && npm run test && npm run build && npx publint && npx attw --pack ."`. devDeps: `vitest`, `@vitest/coverage-v8`, `publint`, `@arethetypeswrong/cli`.
- **`tsconfig.json`** — W4: `include: ["src", "test", "verify.ts", "vitest.config.ts"]`.
- **`tsup.config.ts`** — W5: `sourcemap: false`.
- **`README.md`** — singleton-sharing note, security note (console output sanitized; `LogEntry` raw for custom transports), config-validation errors documented, engines bump. No API examples change.
- **Deleted:** `.npmignore` (W7). `verify.ts` kept as demo.

### Ship gates (Phase 3 exit criteria)

1. `tsc --noEmit` clean (now covering `test/` + `verify.ts`).
2. `vitest run --coverage` — all green, **100 %** lines/branches/functions/statements on `src/`.
3. `npm run build` — no warnings; no `.map` files emitted.
4. `npx publint` — zero errors; `npx attw --pack .` — zero problems.
5. `npm pack --dry-run` — expect ~6 files, roughly half the current 89 kB unpacked.
6. `npm run verify` — demo still renders correctly.
