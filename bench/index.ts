/**
 * A rough throughput benchmark. Run with `npm run bench`.
 *
 * This is not a comparison against other loggers, it measures this package
 * against itself so a regression shows up as a number that moved. Everything
 * writes to a sink that discards, so what is being timed is the logger &
 * formatter, not the terminal or the disk.
 *
 * Numbers vary a lot between machines, only compare runs on the same box.
 */
import { createLogger, devFormat, jsonFormat, prettyFormat } from "../src/index";
import { LogRecord } from "../src/record";
import type { LogEntry, Transport } from "../src/types";

const ITERATIONS = 200_000;
const WARMUP = 20_000;

/** A sink that costs as close to nothing as a transport can. */
class NullTransport implements Transport {
  seen = 0;
  write(entry: LogEntry): void {
    // touching `message` forces the lazy serialization, otherwise a benchmark
    // of "does nothing" is all we would be measuring
    if (entry.message.length === 0) this.seen += 1;
  }
}

/** A sink that never reads `message`, so serialization stays skipped. */
class CountingTransport implements Transport {
  seen = 0;
  write(_entry: LogEntry): void {
    this.seen += 1;
  }
}

interface Result {
  name: string;
  opsPerSecond: number;
  nsPerOp: number;
}

const results: Result[] = [];

function bench(name: string, iterations: number, run: (index: number) => void): void {
  for (let i = 0; i < WARMUP; i += 1) run(i);
  // a collection landing mid measurement is the usual source of a bogus
  // outlier, so give the previous case's garbage a chance to go first
  global.gc?.();

  const started = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) run(i);
  const elapsedNs = Number(process.hrtime.bigint() - started);

  results.push({
    name,
    opsPerSecond: (iterations / elapsedNs) * 1e9,
    nsPerOp: elapsedNs / iterations,
  });
}

// --- the filtered path -------------------------------------------------
// the cheapest possible call: below the threshold, so it returns before it
// allocates anything. this is what a `logger.debug()` left in hot production
// code actually costs
{
  const logger = createLogger({ console: false, minLevel: "info" });
  bench("filtered out (below minLevel)", ITERATIONS, (i) => {
    logger.debug("a message nobody will see", "bench", { i });
  });

  bench("filtered out (lazy message)", ITERATIONS, () => {
    logger.debug(() => "never built");
  });
}

// --- the delivery path, no formatting ----------------------------------
{
  const sink = new CountingTransport();
  const logger = createLogger({ console: false, transports: [sink] });
  bench("delivered, message never read", ITERATIONS, (i) => {
    logger.info("a message", "bench", { i });
  });
}

// --- the delivery path, with serialization -----------------------------
{
  const sink = new NullTransport();
  const logger = createLogger({ console: false, transports: [sink] });

  bench("delivered, string message", ITERATIONS, () => {
    logger.info("Connected to the database", "db");
  });

  bench("delivered, string + fields", ITERATIONS, (i) => {
    logger.info("Request complete", "http", { requestId: i, ms: 42, ok: true });
  });

  const payload = { orderId: 7741, items: [1, 2, 3], customer: { id: 4021, tier: "gold" } };
  bench("delivered, object message", ITERATIONS, () => {
    logger.info(payload, "orders");
  });

  const error = new Error("connection refused");
  bench("delivered, error message", ITERATIONS, () => {
    logger.error(error, "db");
  });
}

// --- child logger construction -----------------------------------------
{
  const sink = new CountingTransport();
  const logger = createLogger({ console: false, transports: [sink] });
  bench("child() then log", ITERATIONS, (i) => {
    logger.child({ context: "req", fields: { requestId: i } }).info("handled");
  });
  bench("with() then log", ITERATIONS, (i) => {
    logger.with({ requestId: i }).info("handled");
  });
}

// --- the formatters, in isolation --------------------------------------
// formatting is the expensive half, so measure it apart from delivery. a fresh
// record per iteration on purpose, a reused one would have its `message`
// already memoised & the number would flatter us
{
  const fields = { ms: 42, ok: true };
  const now = new Date();
  const record = (): LogRecord => new LogRecord("info", "Request complete", "http", fields, now);
  const pretty = prettyFormat({ colors: false, timezone: "UTC" });
  const prettyColor = prettyFormat({ colors: true, timezone: "UTC" });
  const dev = devFormat({ colors: false, timezone: "UTC" });
  const json = jsonFormat();

  bench("prettyFormat, no colour", ITERATIONS, () => void pretty(record()));
  bench("prettyFormat, truecolor", ITERATIONS, () => void prettyColor(record()));
  bench("devFormat, no colour", ITERATIONS, () => void dev(record()));
  bench("jsonFormat", ITERATIONS, () => void json(record()));
}

// --- redaction overhead -------------------------------------------------
{
  const sink = new NullTransport();
  const plain = createLogger({ console: false, transports: [sink] });
  const redacting = createLogger({
    console: false,
    transports: [sink],
    redact: ["password", "token", "authorization"],
  });
  const userdata = {
    user: { name: "ada", email: "ada@example.com", password: "hunter2" },
    session: { token: "abc123", ttl: 900 },
  };

  bench("nested object, no redaction", ITERATIONS, () => plain.info(userdata));
  bench("nested object, 3 redacted keys", ITERATIONS, () => redacting.info(userdata));
}

// --- report -------------------------------------------------------------
const width = Math.max(...results.map((r) => r.name.length));
const format = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

process.stdout.write(`\nnode ${process.version}, ${format.format(ITERATIONS)} iterations each\n\n`);
for (const { name, opsPerSecond, nsPerOp } of results) {
  const ops = `${format.format(opsPerSecond)} ops/s`.padStart(18);
  const ns = `${nsPerOp.toFixed(0)} ns/op`.padStart(12);
  process.stdout.write(`${name.padEnd(width)}  ${ops}  ${ns}\n`);
}
process.stdout.write("\n");
