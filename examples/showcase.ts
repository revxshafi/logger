/**
 * Every feature, rendered to a real terminal. Run with `npm run verify`.
 *
 * This is a smoke test you read rather than assert on: the automated suite
 * proves behaviour, this proves it *looks* right.
 */
import {
  createLogger,
  logger,
  memoryTransport,
  streamTransport,
  type LogEntry,
} from "../src/index";

function heading(title: string): void {
  process.stdout.write(`\n\u001B[1m── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}\u001B[0m\n`);
}

heading("all six levels");
logger.trace("Detailed diagnostic information");
logger.debug("Cache warm, 412 keys");
logger.info("Application started");
logger.warn("Rate limit approaching");
logger.error("Database connection failed");
logger.fatal("Unrecoverable, shutting down");

heading("context tags and structured fields");
logger.info("Connected", "MongoDB");
logger.warn("Rate limited", "REST", { retryAfter: 30 });
logger.info("Order placed", { orderId: 7741, items: 3, total: 129.99 });

heading("child loggers compose context, scope replaces it");
const db = logger.child({ context: "db", fields: { pool: "primary" } });
db.info("Pool ready");
db.child({ context: "tx" }).info("Transaction committed");
db.scope("cache").info("Context replaced, fields kept");

heading("request-scoped fields");
const request = logger.with({ requestId: "01JQ7X", userId: 4021 });
request.info("Handling request");
request.info("Request complete", { ms: 42 });

heading("dev format: fixed-width badge, colour-filled");
const dev = createLogger({ console: { format: "dev" } });
dev.info("Listening on :3000", "http");
dev.warn("Slow query", "db");
dev.error("Upstream timeout", "payments");

heading("json format");
createLogger({ console: { format: "json" } }).info("Order placed", "orders", {
  orderId: 7741,
});

heading("errors keep their stack, objects stay structured");
logger.error(new Error("connection refused"), "db");
logger.info({ region: "eu-west-1", replicas: [1, 2, 3] });

heading("lazy messages, only built when they will be logged");
const quiet = createLogger({ minLevel: "info" });
quiet.debug(() => {
  throw new Error("never evaluated");
});
quiet.info(() => `computed at ${new Date().toISOString()}`);

heading("redaction by key, at any depth");
createLogger({ redact: ["password", "token"] }).info("Login", {
  user: { name: "ada", password: "hunter2" },
  session: { token: "abc123", ttl: 900 },
});

heading("terminal escapes stripped, forged lines contained");
// a control sequence is defanged wherever it appears, body left as evidence
logger.warn("\u001B[2Jclear-screen attempt", "audit");
// a newline inside the context tag can never break out onto its own line
logger.warn("real", "audit\n[00:00:00] [INFO] forged");
// in the message body a newline survives by default (stack traces need it),
// multiline: "escape" is the setting for untrusted input
logger.warn("real\n[00:00:00] [INFO] forged line", "audit");
createLogger({ console: { multiline: "escape" } }).warn(
  "real\n[00:00:00] [INFO] forged line",
  "audit",
);

heading("timezones, switchable in place");
const zoned = createLogger({ console: { timezone: "UTC", timestamp: "datetime" } });
zoned.info("Rendered in UTC");
zoned.setTimezone("Asia/Dhaka");
zoned.info("Same logger, now Asia/Dhaka");
zoned.setTimezone("Not/AZone");
zoned.info("Invalid zone falls back to local, no crash");

heading("memory transport, for tests and diagnostics endpoints");
const buffer = memoryTransport({ limit: 3 });
const buffered = createLogger({ console: false, transports: [buffer] });
for (const n of [1, 2, 3, 4, 5]) buffered.info(`entry ${n}`);
logger.info(`buffer holds the last ${buffer.size}: ${buffer.messages().join(", ")}`);

heading("stream transport, NDJSON to any writable");
const lines: string[] = [];
createLogger({
  console: false,
  transports: [
    streamTransport({
      stream: { write: (chunk: string) => (lines.push(chunk), true) },
    }),
  ],
}).info("shipped", "api", { bytes: 4096 });
process.stdout.write(lines.join(""));

heading("a broken transport cannot take the process down");
const fragile = createLogger({
  console: false,
  onError: (error) => {
    logger.warn(`transport failed but we are still alive: ${String(error)}`);
  },
  transports: [
    {
      write(_entry: LogEntry): void {
        throw new Error("sink exploded");
      },
    },
  ],
});
fragile.info("this write fails");

heading("attach");
const client: Record<string, unknown> = {};
logger.child({ context: "bot" }).attach(client);
(client as { logs: { info(message: string): void } }).logs.info("Logged in");

process.stdout.write("\n");
