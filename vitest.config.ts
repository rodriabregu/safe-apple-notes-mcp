import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    reporters: ["default"],
    // The default "forks" pool hangs when a test calls
    // execFileSync("osascript", ...): the child process's stdio wiring
    // deadlocks inside a forked worker, even for a fast script (observed
    // hanging past 30s on `listFoldersScript`). "threads" runs osascript
    // fine (414ms for the same script) since execFileSync's synchronous
    // child_process pipe handling doesn't fight the pool's own IPC.
    pool: "threads",
  },
});
