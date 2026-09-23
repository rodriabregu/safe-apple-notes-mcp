import { execFileSync } from "node:child_process";
import { AppleScriptError } from "../../domain/errors.js";

/** Runs AppleScript source and returns its trimmed textual result. */
export interface AppleScriptRunner {
  run(script: string): string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** 16 MB is generous headroom for note listings and bodies. */
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

/**
 * Resolves the osascript timeout in milliseconds: `APPLE_NOTES_MCP_TIMEOUT_MS`
 * when it is set to a positive number, otherwise the 30s default.
 */
export function resolveTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.APPLE_NOTES_MCP_TIMEOUT_MS;
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_TIMEOUT_MS;
}

/**
 * Wraps a script body in AppleScript's own `with timeout of N seconds` block
 * so a stuck Apple Event aborts from inside Notes.app's dispatch, rather than
 * relying solely on the outer process kill.
 */
function wrapWithTimeout(script: string, timeoutMs: number): string {
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  return `with timeout of ${seconds} seconds\n${script}\nend timeout`;
}

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const withDetails = error as { stderr?: Buffer | string; message?: string };
    if (withDetails.stderr && withDetails.stderr.toString().trim().length > 0) {
      return withDetails.stderr.toString().trim();
    }
    if (withDetails.message) return withDetails.message;
  }
  return String(error);
}

/** Runs AppleScript via `osascript -` (stdin), never via a shell string. */
export class OsascriptRunner implements AppleScriptRunner {
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = resolveTimeoutMs()) {
    this.timeoutMs = timeoutMs;
  }

  run(script: string): string {
    try {
      const output = execFileSync("osascript", ["-"], {
        input: wrapWithTimeout(script, this.timeoutMs),
        encoding: "utf8",
        timeout: this.timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: MAX_BUFFER_BYTES,
      });
      return output.trim();
    } catch (error) {
      throw new AppleScriptError(extractErrorMessage(error));
    }
  }
}
