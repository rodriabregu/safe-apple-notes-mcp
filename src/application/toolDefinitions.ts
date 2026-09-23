import { z } from "zod";

/**
 * Single source of truth for the 6 approved MCP tools: their zod input
 * shapes and human-readable descriptions. `mcpServer.ts` registers exactly
 * these tools and nothing else — the product's entire attack surface.
 */

export const DEFAULT_LIST_NOTES_LIMIT = 50;
export const MAX_LIST_NOTES_LIMIT = 200;
export const DEFAULT_SEARCH_NOTES_LIMIT = 20;
export const MAX_SEARCH_NOTES_LIMIT = 100;

/**
 * `_meta` key Claude Code (>= 2.1.199) reads from `tools/list` to prompt the
 * user before every call to a tool, regardless of permission mode or allow
 * rules — even in bypass mode. Set to strict boolean `true` on both write
 * tools; deliberately absent (not `false`) on read tools.
 */
export const REQUIRES_USER_INTERACTION_META = "anthropic/requiresUserInteraction";

/** Annotations for a tool that only ever reads Notes.app data. */
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

/**
 * Annotations for a tool that writes to Notes.app. Never destructive (no
 * delete/overwrite) and never idempotent (each call adds a note or content).
 */
const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

/** `_meta` carried by both write tools; forces a user prompt on every call. */
const REQUIRES_USER_INTERACTION = { [REQUIRES_USER_INTERACTION_META]: true } as const;

/** Clamps an optional limit to `[1, max]`, defaulting to `fallback` when unset. */
export function clampLimit(
  limit: number | undefined,
  fallback: number,
  max: number
): number {
  const value = limit ?? fallback;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

export const TOOL_DEFINITIONS = {
  list_folders: {
    title: "List folders",
    description: "List every Notes.app folder across every account.",
    inputShape: {},
    annotations: READ_ONLY_ANNOTATIONS,
  },
  list_notes: {
    title: "List notes",
    description:
      "List notes, most recently modified first. Optionally restrict to one folder. " +
      `Password-protected notes are skipped. Limit defaults to ${DEFAULT_LIST_NOTES_LIMIT}, max ${MAX_LIST_NOTES_LIMIT}.`,
    inputShape: {
      folder: z.string().min(1).optional().describe("Restrict results to this folder name."),
      limit: z
        .number()
        .int()
        .positive()
        .max(MAX_LIST_NOTES_LIMIT)
        .optional()
        .describe(`Maximum notes to return (default ${DEFAULT_LIST_NOTES_LIMIT}, max ${MAX_LIST_NOTES_LIMIT}).`),
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  search_notes: {
    title: "Search notes",
    description:
      "Case-insensitive search over note title and plaintext body. Password-protected notes are " +
      `skipped. Limit defaults to ${DEFAULT_SEARCH_NOTES_LIMIT}, max ${MAX_SEARCH_NOTES_LIMIT}.`,
    inputShape: {
      query: z.string().min(1).describe("Text to search for in the note title or body."),
      limit: z
        .number()
        .int()
        .positive()
        .max(MAX_SEARCH_NOTES_LIMIT)
        .optional()
        .describe(`Maximum notes to return (default ${DEFAULT_SEARCH_NOTES_LIMIT}, max ${MAX_SEARCH_NOTES_LIMIT}).`),
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  get_note: {
    title: "Get note",
    description:
      "Fetch one note by id or by exact title, rendered as markdown, plaintext, or raw html. " +
      "Exactly one of id or title must be given. A title match is case-insensitive; if it " +
      "matches more than one note, the tool reports the candidates instead of guessing. " +
      "Fails with a clear error if the note is password protected.",
    inputShape: {
      id: z.string().min(1).optional().describe("Note id, as returned by list_notes or search_notes."),
      title: z
        .string()
        .min(1)
        .optional()
        .describe("Exact note title (case-insensitive). Use when the id is not known."),
      format: z
        .enum(["markdown", "plaintext", "html"])
        .optional()
        .describe("Body rendering format (default markdown)."),
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  create_note: {
    title: "Create note",
    description:
      "Create a new note from a plain-text body. Each line becomes its own paragraph; the " +
      "title is rendered as a heading.",
    inputShape: {
      title: z.string().min(1).describe("Note title."),
      body: z.string().describe("Plain-text body. Each line becomes one paragraph."),
      folder: z
        .string()
        .min(1)
        .optional()
        .describe("Folder to create the note in (default account folder if omitted)."),
    },
    annotations: WRITE_ANNOTATIONS,
    _meta: REQUIRES_USER_INTERACTION,
  },
  append_to_note: {
    title: "Append to note",
    description:
      "Append plain text to an existing note's body. Never replaces existing content. Fails " +
      "with a clear error if the note is password protected.",
    inputShape: {
      id: z.string().min(1).describe("Id of the note to append to."),
      text: z.string().min(1).describe("Plain text to append. Each line becomes one paragraph."),
    },
    annotations: WRITE_ANNOTATIONS,
    _meta: REQUIRES_USER_INTERACTION,
  },
} as const;

export type ToolName = keyof typeof TOOL_DEFINITIONS;

/**
 * `get_note`'s actual registered input schema: the raw shape above, plus a
 * cross-field refinement requiring exactly one of `id`/`title`. Kept
 * separate from `inputShape` because the other tools' shapes are validated
 * directly with `z.object(shape)` in tests and don't need this refine.
 */
export const getNoteInputSchema = z
  .object(TOOL_DEFINITIONS.get_note.inputShape)
  .refine((value) => (value.id !== undefined) !== (value.title !== undefined), {
    message: "Provide exactly one of id or title.",
  });
