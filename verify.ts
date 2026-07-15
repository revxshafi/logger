/**
 * Smoke test for @revxshafi/logger — exercises every feature in the spec.
 * Run with: npm run verify
 */
import { Logger, logger, ConsoleTransport, type LogEntry, type Transport } from "./src/index";

console.log("=== All six levels ===");
logger.trace("Detailed diagnostic information");
logger.debug("Debug information");
logger.info("Application started");
logger.warn("Rate limit detected");
logger.error("Database connection failed");
logger.fatal("Application crashed");

console.log("\n=== Context tags ===");
logger.info("Connected", "MongoDB");
logger.warn("Rate limited", "REST");
logger.error("Failed to register command", "Commands");

console.log("\n=== Scoped loggers ===");
const mongo = logger.scope("MongoDB");
mongo.info("Connected");
mongo.error("Connection failed");
// Per-call context overrides the scope:
mongo.info("Overridden context", "Override");
// Re-scoping overrides rather than composing:
const reScoped = mongo.scope("Cache");
reScoped.info("Now under Cache");

console.log("\n=== Timezone config ===");
const dhaka = new Logger({ timezone: "Asia/Dhaka" });
dhaka.info("Timestamp rendered in Asia/Dhaka");
const utc = new Logger({ timezone: "UTC" });
utc.info("Timestamp rendered in UTC");

console.log("\n=== Serialization: Error ===");
logger.error(new Error("boom with a stack trace"));

console.log("\n=== Serialization: plain object ===");
logger.debug({ user: "john", action: "login", nested: { ok: true } });

console.log("\n=== Serialization: other primitives ===");
logger.info(42);
logger.info(true);
logger.info(null);
logger.info(undefined);

console.log("\n=== Serialization: circular object keeps its fields via util.inspect ===");
const circular: Record<string, unknown> = { name: "loop" };
circular.self = circular;
logger.debug(circular);

console.log("\n=== setLevelStyle / listLevels ===");
logger.setLevelStyle("info", { color: "#00FFAA", display: "INFO*" });
logger.info("Info now uses a custom style");
console.log("listLevels():", logger.listLevels());

console.log("\n=== Custom transport ===");
const collected: LogEntry[] = [];
const memoryTransport: Transport = {
  write(entry) {
    collected.push(entry);
  },
};
const withTransport = new Logger();
withTransport.addTransport(memoryTransport);
withTransport.info("Captured by memory transport", "Test");
console.log("Collected entries:", collected.length, "->", collected[0]?.message);

console.log("\n=== attach() ===");
const client: Record<string, unknown> = {};
logger.attach(client);
const logs = client.logs as Record<string, (m: unknown, c?: string) => void>;
logs.info("Attached via client.logs.info", "Attach");

console.log("\n=== Custom attach key ===");
logger.attach(client, "log");
const altLogs = client.log as Record<string, (m: unknown, c?: string) => void>;
altLogs.warn("Attached via client.log.warn");

console.log("\n=== Edge: blank context is dropped (no empty [] badge) ===");
logger.info("Empty-string context", "");
logger.info("Whitespace-only context", "   ");

console.log("\n=== Edge: a throwing transport can't crash the caller or mute others ===");
let survivorRan = false;
const resilient = new Logger();
resilient.addTransport({
  write() {
    throw new Error("transport blew up");
  },
});
resilient.addTransport({
  write() {
    survivorRan = true;
  },
});
resilient.info("Logging through a broken transport");
console.log("Survivor transport ran despite the failure:", survivorRan);

console.log("\n=== Edge: toJSON()=>undefined never prints the literal 'undefined' ===");
logger.info({ toJSON: () => undefined });

// keeps ConsoleTransport referenced so the import isn't flagged unused
void ConsoleTransport;

console.log("\n✅ Verify script completed.");
