#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AppleScriptNotesRepository } from "./infrastructure/applescript/appleScriptNotesRepository.js";
import { OsascriptRunner } from "./infrastructure/applescript/runner.js";
import { createMcpServer } from "./interface/mcpServer.js";

async function main(): Promise<void> {
  const repository = new AppleScriptNotesRepository(new OsascriptRunner());
  const server = createMcpServer(repository);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("safe-apple-notes-mcp failed to start:", error);
  process.exit(1);
});
