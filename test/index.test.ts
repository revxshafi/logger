import { describe, expect, it } from "vitest";
import * as api from "../src/index";

describe("public surface", () => {
  it("exports the values a consumer builds on", () => {
    for (const name of [
      "Logger",
      "createLogger",
      "LogRecord",
      "createDefaultLevels",
      "isLevelThreshold",
      "isLogLevel",
      "LOG_LEVELS",
      "SEVERITY",
      "devFormat",
      "jsonFormat",
      "prettyFormat",
      "ConsoleTransport",
      "consoleTransport",
      "MemoryTransport",
      "memoryTransport",
      "StreamTransport",
      "streamTransport",
      "setDiagnosticsHandler",
      "setColorLevel",
      "logger",
    ]) {
      expect(api, name).toHaveProperty(name);
    }
  });

  it("exports nothing beyond that, new names are a deliberate act", () => {
    expect(Object.keys(api).sort()).toEqual([
      "ConsoleTransport",
      "LOG_LEVELS",
      "LogRecord",
      "Logger",
      "MemoryTransport",
      "SEVERITY",
      "StreamTransport",
      "consoleTransport",
      "createDefaultLevels",
      "createLogger",
      "devFormat",
      "isLevelThreshold",
      "isLogLevel",
      "jsonFormat",
      "logger",
      "memoryTransport",
      "prettyFormat",
      "setColorLevel",
      "setDiagnosticsHandler",
      "streamTransport",
    ]);
  });

  it("has no default export, so `import logger from` is a visible error", () => {
    expect((api as Record<string, unknown>).default).toBeUndefined();
  });

  it("ships a ready-made singleton that logs", () => {
    expect(api.logger).toBeInstanceOf(api.Logger);
    expect(api.logger.level).toBe("trace");
  });
});
