import { describe, expect, it } from "vitest";
import { AppleScriptError } from "../../domain/errors.js";
import { OsascriptRunner, resolveTimeoutMs } from "./runner.js";

describe("OsascriptRunner", () => {
  it("runs a script via osascript and returns trimmed stdout", () => {
    const runner = new OsascriptRunner();

    const result = runner.run('return "hello"');

    expect(result).toBe("hello");
  });

  it("throws AppleScriptError with the AppleScript error text when the script fails", () => {
    const runner = new OsascriptRunner();

    expect(() => runner.run('error "boom"')).toThrow(AppleScriptError);
    try {
      runner.run('error "boom"');
      throw new Error("expected run() to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppleScriptError);
      expect((error as Error).message).toContain("boom");
    }
  });

  it("wraps the script so a runaway AppleScript aborts instead of hanging forever", () => {
    // A tiny timeout plus a script that never returns proves the `with
    // timeout of N seconds` wrapper is actually applied, without waiting
    // out a full default timeout in the test suite.
    const runner = new OsascriptRunner(1000);

    const start = Date.now();
    expect(() => runner.run("delay 30")).toThrow();
    expect(Date.now() - start).toBeLessThan(10_000);
  });
});

describe("resolveTimeoutMs", () => {
  it("defaults to 30000 when the env var is unset", () => {
    expect(resolveTimeoutMs({})).toBe(30_000);
  });

  it("uses APPLE_NOTES_MCP_TIMEOUT_MS when it is a positive number", () => {
    expect(resolveTimeoutMs({ APPLE_NOTES_MCP_TIMEOUT_MS: "5000" })).toBe(5000);
  });

  it("falls back to the default for a non-numeric value", () => {
    expect(resolveTimeoutMs({ APPLE_NOTES_MCP_TIMEOUT_MS: "not-a-number" })).toBe(30_000);
  });

  it("falls back to the default for a non-positive value", () => {
    expect(resolveTimeoutMs({ APPLE_NOTES_MCP_TIMEOUT_MS: "-5" })).toBe(30_000);
  });
});
