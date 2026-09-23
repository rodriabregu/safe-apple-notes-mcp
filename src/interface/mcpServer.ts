import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  clampLimit,
  DEFAULT_LIST_NOTES_LIMIT,
  DEFAULT_SEARCH_NOTES_LIMIT,
  getNoteInputSchema,
  MAX_LIST_NOTES_LIMIT,
  MAX_SEARCH_NOTES_LIMIT,
  TOOL_DEFINITIONS,
} from "../application/toolDefinitions.js";
import { AmbiguousNoteTitleError, NoteLockedError, NoteNotFoundError } from "../domain/errors.js";
import type { NotesRepository } from "../domain/notesRepository.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function domainErrorResult(error: unknown): ToolResult | undefined {
  if (
    error instanceof NoteNotFoundError ||
    error instanceof NoteLockedError ||
    error instanceof AmbiguousNoteTitleError
  ) {
    return { isError: true, content: [{ type: "text", text: error.message }] };
  }
  return undefined;
}

/**
 * Resolves `get_note`'s `id`/`title` input to one note id. This branching
 * (0/1/2+ matches) lives here in the interface layer, not in the
 * repository: the repository only ever reports what matched.
 */
async function resolveNoteId(
  repo: NotesRepository,
  id: string | undefined,
  title: string | undefined
): Promise<string> {
  if (id !== undefined) return id;
  // getNoteInputSchema guarantees title is defined whenever id is not.
  const matches = await repo.findNotesByTitle(title!);
  if (matches.length === 0) throw new NoteNotFoundError(title!);
  if (matches.length > 1) throw new AmbiguousNoteTitleError(title!, matches);
  return matches[0].id;
}

async function handle(work: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await work();
  } catch (error) {
    const mapped = domainErrorResult(error);
    if (mapped) return mapped;
    throw error;
  }
}

/**
 * Builds the MCP server exposing exactly the 6 approved Apple Notes tools.
 * `repo` is the only seam to Notes.app, so this function has no idea whether
 * it is talking to real AppleScript or a test fake.
 */
export function createMcpServer(repo: NotesRepository): McpServer {
  const server = new McpServer({ name: "apple-notes-mcp-lite", version: "0.1.0" });

  server.registerTool(
    "list_folders",
    {
      title: TOOL_DEFINITIONS.list_folders.title,
      description: TOOL_DEFINITIONS.list_folders.description,
      inputSchema: TOOL_DEFINITIONS.list_folders.inputShape,
      annotations: TOOL_DEFINITIONS.list_folders.annotations,
    },
    async () => handle(async () => ok(await repo.listFolders()))
  );

  server.registerTool(
    "list_notes",
    {
      title: TOOL_DEFINITIONS.list_notes.title,
      description: TOOL_DEFINITIONS.list_notes.description,
      inputSchema: TOOL_DEFINITIONS.list_notes.inputShape,
      annotations: TOOL_DEFINITIONS.list_notes.annotations,
    },
    async ({ folder, limit }) =>
      handle(async () =>
        ok(await repo.listNotes(folder, clampLimit(limit, DEFAULT_LIST_NOTES_LIMIT, MAX_LIST_NOTES_LIMIT)))
      )
  );

  server.registerTool(
    "search_notes",
    {
      title: TOOL_DEFINITIONS.search_notes.title,
      description: TOOL_DEFINITIONS.search_notes.description,
      inputSchema: TOOL_DEFINITIONS.search_notes.inputShape,
      annotations: TOOL_DEFINITIONS.search_notes.annotations,
    },
    async ({ query, limit }) =>
      handle(async () =>
        ok(
          await repo.searchNotes(
            query,
            clampLimit(limit, DEFAULT_SEARCH_NOTES_LIMIT, MAX_SEARCH_NOTES_LIMIT)
          )
        )
      )
  );

  server.registerTool(
    "get_note",
    {
      title: TOOL_DEFINITIONS.get_note.title,
      description: TOOL_DEFINITIONS.get_note.description,
      // The raw shape is registered here (not getNoteInputSchema) so
      // tools/list still advertises id/title/format: the SDK's JSON-schema
      // conversion only introspects a raw shape or a genuine ZodObject, and
      // silently reports an empty schema for a refined ZodEffects. The
      // exactly-one-of-id/title refine is applied explicitly below instead.
      inputSchema: TOOL_DEFINITIONS.get_note.inputShape,
      annotations: TOOL_DEFINITIONS.get_note.annotations,
    },
    async (rawArgs) => {
      const parsed = getNoteInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid get_note arguments.";
        return { isError: true, content: [{ type: "text", text: message }] };
      }
      const { id, title, format } = parsed.data;
      return handle(async () => {
        const resolvedId = await resolveNoteId(repo, id, title);
        return ok(await repo.getNote(resolvedId, format ?? "markdown"));
      });
    }
  );

  server.registerTool(
    "create_note",
    {
      title: TOOL_DEFINITIONS.create_note.title,
      description: TOOL_DEFINITIONS.create_note.description,
      inputSchema: TOOL_DEFINITIONS.create_note.inputShape,
      annotations: TOOL_DEFINITIONS.create_note.annotations,
      _meta: TOOL_DEFINITIONS.create_note._meta,
    },
    async ({ title, body, folder }) => handle(async () => ok(await repo.createNote(title, body, folder)))
  );

  server.registerTool(
    "append_to_note",
    {
      title: TOOL_DEFINITIONS.append_to_note.title,
      description: TOOL_DEFINITIONS.append_to_note.description,
      inputSchema: TOOL_DEFINITIONS.append_to_note.inputShape,
      annotations: TOOL_DEFINITIONS.append_to_note.annotations,
      _meta: TOOL_DEFINITIONS.append_to_note._meta,
    },
    async ({ id, text }) => handle(async () => ok(await repo.appendToNote(id, text)))
  );

  return server;
}
