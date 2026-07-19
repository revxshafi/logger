import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConsoleTransport,
  createDefaultLevels,
  createLogger,
  isLogLevel,
  LOG_LEVELS,
  Logger,
  logger,
} from "../src/index";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public surface", () => {
  it("exports the expected API", () => {
    expect(logger).toBeInstanceOf(Logger);
    expect(createLogger).toBeTypeOf("function");
    expect(ConsoleTransport).toBeTypeOf("function");
    expect(createDefaultLevels).toBeTypeOf("function");
    expect(isLogLevel).toBeTypeOf("function");
    expect(LOG_LEVELS).toHaveLength(6);
  });

  it("ships a working singleton", () => {
    logger.info("singleton works");
    expect(console.log).toHaveBeenCalledOnce();
  });
});
