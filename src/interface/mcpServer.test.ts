import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { REQUIRES_USER_INTERACTION_META } from "../application/toolDefinitions.js";
import { InMemoryNotesRepository } from "../../test/fakes/inMemoryNotesRepository.js";
import { createMcpServer } from "./mcpServer.js";

const READ_TOOL_NAMES = ["list_folders", "list_notes", "search_notes", "get_note"];
const WRITE_TOOL_NAMES = ["create_note", "append_to_note", "update_note", "delete_note", "create_folder"];
const NON_DESTRUCTIVE_WRITE_TOOL_NAMES = ["create_note", "append_to_note", "create_folder"];
const DESTRUCTIVE_WRITE_TOOL_NAMES = ["update_note", "delete_note"];

async function connectedClient(repo: InMemoryNotesRepository) {
  const server = createMcpServer(repo);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  const block = result.content[0];
  if (!block || block.type !== "text" || block.text === undefined) {
    throw new Error("expected a text content block");
  }
  return block.text;
}

describe("createMcpServer", () => {
  let repo: InMemoryNotesRepository;

  beforeEach(() => {
    repo = new InMemoryNotesRepository();
  });

  it("exposes exactly the 9 approved tools and no others", async () => {
    const client = await connectedClient(repo);

    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "append_to_note",
        "create_folder",
        "create_note",
        "delete_note",
        "get_note",
        "list_folders",
        "list_notes",
        "search_notes",
        "update_note",
      ].sort()
    );
  });

  it("get_note advertises id, title, and format in its tools/list JSON schema", async () => {
    // Regression guard: registering the refined (post-.refine()) zod schema
    // directly as inputSchema makes the SDK's normalizeObjectSchema() (which
    // only recognizes a raw shape or a genuine ZodObject, not a ZodEffects)
    // fall back to an empty object schema — real MCP clients would then see
    // get_note as taking no parameters at all.
    const client = await connectedClient(repo);

    const { tools } = await client.listTools();
    const getNote = tools.find((t) => t.name === "get_note");

    expect(Object.keys(getNote?.inputSchema.properties ?? {}).sort()).toEqual([
      "format",
      "id",
      "title",
    ]);
  });

  it.each(READ_TOOL_NAMES)(
    "%s is annotated read-only and does not require user interaction",
    async (name) => {
      const client = await connectedClient(repo);

      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === name);

      expect(tool?.annotations?.readOnlyHint).toBe(true);
      expect(tool?.annotations?.destructiveHint).toBe(false);
      expect(tool?.annotations?.openWorldHint).toBe(false);
      expect(tool?._meta?.[REQUIRES_USER_INTERACTION_META]).not.toBe(true);
    }
  );

  it.each(WRITE_TOOL_NAMES)(
    "%s is annotated as a write, non-idempotent, and strictly requires user interaction",
    async (name) => {
      const client = await connectedClient(repo);

      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === name);

      expect(tool?.annotations?.readOnlyHint).toBe(false);
      expect(tool?.annotations?.idempotentHint).toBe(false);
      expect(tool?.annotations?.openWorldHint).toBe(false);
      expect(tool?._meta?.[REQUIRES_USER_INTERACTION_META]).toBe(true);
    }
  );

  it.each(NON_DESTRUCTIVE_WRITE_TOOL_NAMES)(
    "%s is not annotated destructive",
    async (name) => {
      const client = await connectedClient(repo);

      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === name);

      expect(tool?.annotations?.destructiveHint).toBe(false);
    }
  );

  it.each(DESTRUCTIVE_WRITE_TOOL_NAMES)("%s is annotated destructive", async (name) => {
    const client = await connectedClient(repo);

    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === name);

    expect(tool?.annotations?.destructiveHint).toBe(true);
  });

  it("list_folders returns folders from the repository", async () => {
    repo.seedFolder({ id: "f1", name: "Work", account: "iCloud" });
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "list_folders", arguments: {} });

    expect(JSON.parse(textOf(result as never))).toEqual([
      { id: "f1", name: "Work", account: "iCloud" },
    ]);
  });

  it("list_notes returns notes sorted by modification date desc", async () => {
    repo.seedNote({ title: "Older", folder: "Personal", modifiedAt: new Date(2024, 0, 1).toISOString() });
    repo.seedNote({ title: "Newer", folder: "Personal", modifiedAt: new Date(2024, 5, 1).toISOString() });
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "list_notes", arguments: {} });
    const notes = JSON.parse(textOf(result as never));

    expect(notes.map((n: { title: string }) => n.title)).toEqual(["Newer", "Older"]);
  });

  it("search_notes matches by title", async () => {
    repo.seedNote({ title: "Budget 2024", folder: "Personal" });
    repo.seedNote({ title: "Recipes", folder: "Personal" });
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "search_notes", arguments: { query: "budget" } });
    const notes = JSON.parse(textOf(result as never));

    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("Budget 2024");
  });

  it("get_note defaults to markdown format", async () => {
    const stored = repo.seedNote({ title: "Groceries", folder: "Personal", plaintext: "Eggs" });
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "get_note", arguments: { id: stored.id } });
    const note = JSON.parse(textOf(result as never));

    expect(note.body).toContain("# Groceries");
    expect(note.body).toContain("Eggs");
  });

  it("get_note returns an MCP tool error for a locked note", async () => {
    const stored = repo.seedNote({ title: "Secret", folder: "Personal", locked: true });
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "get_note", arguments: { id: stored.id } });

    expect(result.isError).toBe(true);
    expect(textOf(result as never).toLowerCase()).toContain("password");
  });

  it("get_note returns an MCP tool error for an unknown id", async () => {
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "get_note", arguments: { id: "missing" } });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain("missing");
  });

  it("get_note resolves a unique title to its note", async () => {
    repo.seedNote({ title: "Groceries", folder: "Personal", plaintext: "Eggs" });
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "get_note", arguments: { title: "Groceries" } });
    const note = JSON.parse(textOf(result as never));

    expect(note.title).toBe("Groceries");
    expect(note.body).toContain("Eggs");
  });

  it("get_note returns an MCP tool error when no note matches the title", async () => {
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "get_note", arguments: { title: "Nonexistent" } });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain("Nonexistent");
  });

  it("get_note returns an MCP tool error listing candidates when the title is ambiguous", async () => {
    repo.seedNote({
      title: "Groceries",
      folder: "Personal",
      modifiedAt: new Date(2024, 0, 1).toISOString(),
    });
    repo.seedNote({
      title: "Groceries",
      folder: "Work",
      modifiedAt: new Date(2024, 5, 1).toISOString(),
    });
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "get_note", arguments: { title: "Groceries" } });
    const text = textOf(result as never);

    expect(result.isError).toBe(true);
    expect(text).toContain('Multiple notes match title "Groceries". Use id instead:');
    expect(text).toContain("Personal");
    expect(text).toContain("Work");
  });

  it("get_note reports a validation error for a call with neither id nor title", async () => {
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "get_note", arguments: {} });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain("Provide exactly one of id or title.");
  });

  it("get_note reports a validation error for a call with both id and title", async () => {
    const stored = repo.seedNote({ title: "Groceries", folder: "Personal" });
    const client = await connectedClient(repo);

    const result = await client.callTool({
      name: "get_note",
      arguments: { id: stored.id, title: "Groceries" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain("Provide exactly one of id or title.");
  });

  it("create_note creates a note via the repository", async () => {
    const client = await connectedClient(repo);

    const result = await client.callTool({
      name: "create_note",
      arguments: { title: "Shopping", body: "Milk\nEggs", folder: "Personal" },
    });
    const created = JSON.parse(textOf(result as never));

    expect(created).toEqual({ id: expect.any(String), title: "Shopping", folder: "Personal" });
  });

  it("append_to_note appends text and returns id/title", async () => {
    const stored = repo.seedNote({ title: "Shopping", folder: "Personal", plaintext: "Milk" });
    const client = await connectedClient(repo);

    const result = await client.callTool({
      name: "append_to_note",
      arguments: { id: stored.id, text: "Eggs" },
    });
    const appended = JSON.parse(textOf(result as never));

    expect(appended).toEqual({ id: stored.id, title: "Shopping" });
  });

  it("append_to_note returns an MCP tool error for a locked note", async () => {
    const stored = repo.seedNote({ title: "Secret", folder: "Personal", locked: true });
    const client = await connectedClient(repo);

    const result = await client.callTool({
      name: "append_to_note",
      arguments: { id: stored.id, text: "more" },
    });

    expect(result.isError).toBe(true);
  });

  it("delete_note deletes the note and returns id/title/folder plus the recovery note", async () => {
    const stored = repo.seedNote({ title: "Shopping", folder: "Personal" });
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "delete_note", arguments: { id: stored.id } });
    const deleted = JSON.parse(textOf(result as never));

    expect(deleted).toEqual({
      id: stored.id,
      title: "Shopping",
      folder: "Personal",
      recoverableFrom: "Recently Deleted (30 days)",
    });
    const remaining = await client.callTool({ name: "list_notes", arguments: {} });
    expect(JSON.parse(textOf(remaining as never))).toEqual([]);
  });

  it("delete_note returns an MCP tool error for an unknown id", async () => {
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "delete_note", arguments: { id: "missing" } });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain("missing");
  });

  it("delete_note returns an MCP tool error for a locked note", async () => {
    const stored = repo.seedNote({ title: "Secret", folder: "Personal", locked: true });
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "delete_note", arguments: { id: stored.id } });

    expect(result.isError).toBe(true);
    expect(textOf(result as never).toLowerCase()).toContain("password");
  });

  it("update_note replaces the body and returns the previous body as undo material", async () => {
    const stored = repo.seedNote({ title: "Shopping", folder: "Personal", plaintext: "Milk" });
    const client = await connectedClient(repo);

    const result = await client.callTool({
      name: "update_note",
      arguments: { id: stored.id, body: "Bread" },
    });
    const updated = JSON.parse(textOf(result as never));

    expect(updated.id).toBe(stored.id);
    expect(updated.title).toBe("Shopping");
    expect(updated.folder).toBe("Personal");
    expect(updated.previousBody).toContain("Milk");
    expect(updated.body).toContain("Bread");
  });

  it("update_note accepts an optional new title", async () => {
    const stored = repo.seedNote({ title: "Shopping", folder: "Personal", plaintext: "Milk" });
    const client = await connectedClient(repo);

    const result = await client.callTool({
      name: "update_note",
      arguments: { id: stored.id, body: "Bread", title: "Groceries" },
    });
    const updated = JSON.parse(textOf(result as never));

    expect(updated.title).toBe("Groceries");
  });

  it("update_note returns an MCP tool error for an unknown id", async () => {
    const client = await connectedClient(repo);

    const result = await client.callTool({
      name: "update_note",
      arguments: { id: "missing", body: "Bread" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain("missing");
  });

  it("update_note returns an MCP tool error for a locked note", async () => {
    const stored = repo.seedNote({ title: "Secret", folder: "Personal", locked: true });
    const client = await connectedClient(repo);

    const result = await client.callTool({
      name: "update_note",
      arguments: { id: stored.id, body: "Bread" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never).toLowerCase()).toContain("password");
  });

  it("create_folder creates a folder via the repository", async () => {
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "create_folder", arguments: { name: "Recipes" } });
    const created = JSON.parse(textOf(result as never));

    expect(created).toEqual({ id: expect.any(String), name: "Recipes", account: "iCloud" });
  });

  it("create_folder returns an MCP tool error naming the existing folder's id for a duplicate", async () => {
    const existing = repo.seedFolder({ id: "folder-1", name: "Recipes", account: "iCloud" });
    const client = await connectedClient(repo);

    const result = await client.callTool({ name: "create_folder", arguments: { name: "Recipes" } });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(existing.id);
  });

  it("create_folder returns an MCP tool error for an unknown account", async () => {
    const client = await connectedClient(repo);

    const result = await client.callTool({
      name: "create_folder",
      arguments: { name: "Recipes", account: "Nonexistent" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain("Nonexistent");
  });
});
