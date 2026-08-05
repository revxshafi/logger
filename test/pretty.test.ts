import { describe, expect, it } from "vitest";
import { devFormat, prettyFormat } from "../src/formats/pretty";
import { createDefaultLevels } from "../src/levels";
import { LogRecord } from "../src/record";
import { FIXED, captureDiagnostics, plain } from "./helpers";
import type { LogFields } from "../src/types";

const ESC = "\u001B";

function entry(
  message: unknown,
  context?: string,
  fields?: LogFields,
  level: "info" | "warn" | "error" = "info",
) {
  return new LogRecord(level, message, context, fields, FIXED);
}

describe("prettyFormat", () => {
  const format = prettyFormat({ timezone: "UTC", colors: false });

  it("lays out time, badge, context and message", () => {
    expect(format(entry("Connected", "MongoDB"))).toBe(
      "[14:05:32] [INFO] [MongoDB] Connected",
    );
  });

  it("omits the context when there is none", () => {
    expect(format(entry("Ready"))).toBe("[14:05:32] [INFO] Ready");
  });

  it("appends structured fields as key=value", () => {
    expect(format(entry("Connected", undefined, { db: "primary", retries: 2 }))).toBe(
      "[14:05:32] [INFO] Connected db=primary retries=2",
    );
  });

  it("can omit fields entirely", () => {
    const bare = prettyFormat({ timezone: "UTC", colors: false, fields: false });
    expect(bare(entry("Connected", undefined, { db: "primary" }))).toBe(
      "[14:05:32] [INFO] Connected",
    );
    // an empty field bag adds nothing either
    expect(format(entry("Connected", undefined, {}))).toBe("[14:05:32] [INFO] Connected");
  });

  it("honours the timestamp style", () => {
    expect(prettyFormat({ timezone: "UTC", colors: false, timestamp: "none" })(entry("x"))).toBe(
      "[INFO] x",
    );
    expect(
      prettyFormat({ timezone: "UTC", colors: false, timestamp: "datetime" })(entry("x")),
    ).toBe("[04-08-2026 14:05:32] [INFO] x");
  });

  it("colours only metadata by default", () => {
    const colored = prettyFormat({ timezone: "UTC", colors: 3 });
    const line = colored(entry("Connected", "MongoDB"));
    expect(plain(line)).toBe("[14:05:32] [INFO] [MongoDB] Connected");
    // the message body is left in the terminal's own colour
    expect(line.endsWith("Connected")).toBe(true);
    expect(line).toContain(`${ESC}[2m[14:05:32]${ESC}[22m`);
  });

  it("colours the body and time when asked", () => {
    const colored = prettyFormat({
      timezone: "UTC",
      colors: 3,
      messageColor: "#FF0000",
      timeColor: "#00FF00",
    });
    const line = colored(entry("Connected"));
    expect(line).toContain(`${ESC}[38;2;255;0;0mConnected${ESC}[0m`);
    expect(line).toContain(`${ESC}[38;2;0;255;0m[14:05:32]${ESC}[0m`);
  });

  it("drops an invalid colour rather than rendering it black", () => {
    const diagnostics = captureDiagnostics();
    try {
      const colored = prettyFormat({ timezone: "UTC", colors: 3, messageColor: "red" });
      expect(colored(entry("Connected")).endsWith("Connected")).toBe(true);
      expect(diagnostics.codes()).toEqual(["invalid-color"]);
    } finally {
      diagnostics.restore();
    }
  });

  it("uses the level styles it was given", () => {
    const levels = createDefaultLevels();
    levels.set("info", { color: "#00FFAA", display: "NOTE" });
    const styled = prettyFormat({ timezone: "UTC", colors: false, levels });
    expect(styled(entry("x"))).toBe("[14:05:32] [NOTE] x");
  });

  it("escapes or indents a multi-line body", () => {
    const escaped = prettyFormat({ timezone: "UTC", colors: false, multiline: "escape" });
    expect(escaped(entry("first\nsecond"))).toBe("[14:05:32] [INFO] first\\nsecond");

    const indented = prettyFormat({ timezone: "UTC", colors: false, multiline: "indent" });
    // continuation lines align under the message column
    expect(indented(entry("first\nsecond", "api"))).toBe(
      "[14:05:32] [INFO] [api] first\n                        second",
    );
  });

  it("indents correctly when there is no timestamp", () => {
    const indented = prettyFormat({
      timezone: "UTC",
      colors: false,
      multiline: "indent",
      timestamp: "none",
    });
    expect(indented(entry("first\nsecond"))).toBe("[INFO] first\n       second");
  });

  it("strips terminal escapes from untrusted input", () => {
    const line = format(entry(`before${ESC}[2Jafter`, `api${ESC}[2J`));
    expect(line).not.toContain(`${ESC}[2J`);
  });

  it("keeps a forged newline out of a context tag", () => {
    expect(format(entry("real", "api\n[14:00:00] [INFO] forged"))).not.toContain("\n");
  });

  it("swaps timezone at runtime", () => {
    const switchable = prettyFormat({ timezone: "UTC", colors: false });
    expect(switchable(entry("x"))).toContain("14:05:32");
    switchable.setTimezone!("Asia/Dhaka");
    expect(switchable(entry("x"))).toContain("20:05:32");
  });

  it("works with no options at all", () => {
    expect(plain(prettyFormat()(entry("x")))).toMatch(/^\[\d{2}:\d{2}:\d{2}\] \[INFO\] x$/);
  });
});

describe("devFormat", () => {
  const format = devFormat({ timezone: "UTC", colors: false });

  it("lays out a fixed-width badge after the date and time", () => {
    expect(format(entry("Connected", "Mongo"))).toBe(
      "[ 04-08-2026 14:05:32 ] [Mongo] Connected",
    );
  });

  it("pads and truncates the badge so bodies line up", () => {
    expect(format(entry("x", "db"))).toContain("[db   ]");
    expect(format(entry("x", "a-very-long-context"))).toContain("[a-ver]");
  });

  it("falls back to the level when there is no context", () => {
    expect(format(entry("x"))).toContain("[INFO ]");
  });

  it("respects a custom badge width, refusing a useless one", () => {
    expect(devFormat({ timezone: "UTC", colors: false, badgeWidth: 8 })(entry("x", "db"))).toContain(
      "[db      ]",
    );
    // a zero or negative width would swallow the badge entirely
    expect(devFormat({ timezone: "UTC", colors: false, badgeWidth: 0 })(entry("x", "db"))).toContain(
      "[d]",
    );
  });

  it("draws the badge as a background fill with contrasting text", () => {
    const colored = devFormat({ timezone: "UTC", colors: 3 });
    const line = colored(entry("x", "db"));
    expect(line).toContain("48;2;");
    expect(plain(line)).toBe("[ 04-08-2026 14:05:32 ] [db   ] x");
  });

  it("colours the message and time by default", () => {
    const colored = devFormat({ timezone: "UTC", colors: 3 });
    const line = colored(entry("x"));
    expect(line).toContain(`${ESC}[38;2;34;119;255mx${ESC}[0m`);
    expect(line).toContain(`${ESC}[38;2;170;255;34m04-08-2026 14:05:32${ESC}[0m`);
  });

  it("appends fields and honours the multiline mode", () => {
    expect(format(entry("x", "db", { rows: 3 }))).toContain("rows=3");
    const bare = devFormat({ timezone: "UTC", colors: false, fields: false });
    expect(bare(entry("x", "db", { rows: 3 }))).not.toContain("rows=3");

    const escaped = devFormat({ timezone: "UTC", colors: false, multiline: "escape" });
    expect(escaped(entry("a\nb", "db"))).toContain("a\\nb");

    const indented = devFormat({ timezone: "UTC", colors: false, multiline: "indent" });
    expect(indented(entry("a\nb", "db"))).toBe(
      "[ 04-08-2026 14:05:32 ] [db   ] a\n                                b",
    );
  });

  it("can drop the timestamp", () => {
    const bare = devFormat({ timezone: "UTC", colors: false, timestamp: "none" });
    expect(bare(entry("x", "db"))).toBe("[db   ] x");
  });

  it("swaps timezone at runtime", () => {
    const switchable = devFormat({ timezone: "UTC", colors: false });
    switchable.setTimezone!("Asia/Dhaka");
    expect(switchable(entry("x"))).toContain("20:05:32");
  });

  it("works with no options at all", () => {
    expect(plain(devFormat()(entry("x")))).toMatch(/\[INFO \] x$/);
  });
});
