# safe-apple-notes-mcp

A safety-first [MCP](https://modelcontextprotocol.io) server for Apple Notes
on macOS, for people who want to give an AI access to their notes without
handing it the keys to delete or rewrite everything unsupervised. It talks to
Notes.app through AppleScript (`osascript`) and exposes exactly 8 tools, all
scoped to one note per call, with every write and delete tool forcing a human
confirmation. If you want a bigger surface — tags, attachments, checklists,
tables, batch operations — use
[sweetrb/apple-notes-mcp](https://github.com/sweetrb/apple-notes-mcp) instead;
this project deliberately competes on safety, auditability, and size, not
feature count.

## Why it exists

Most Apple Notes MCP servers expose a large surface: batch delete, folder
management, arbitrary overwrites. That is a lot of blast radius to hand to an
LLM. This server takes the opposite bet: keep the tool list small enough to
read in one sitting, make every destructive operation single-note and
undo-friendly, and force a human to confirm it — structurally, not just by
convention.

## Safety model

- **Exactly 8 tools**, enforced by a test that fails if one is ever added:
  `list_folders`, `list_notes`, `search_notes`, `get_note` (read), and
  `create_note`, `append_to_note`, `update_note`, `delete_note` (write).
- **Every write/delete tool carries `anthropic/requiresUserInteraction`.**
  Claude Code (>= 2.1.199) prompts a human before calling any of the four
  write tools — regardless of permission mode or allow rules, including
  bypass mode.
- **No batch operations, ever.** Every tool acts on exactly one note (or
  lists/searches). There is no "delete these notes" or "update all notes in
  folder" tool, and there never will be.
- **`delete_note` never destroys.** Notes.app moves the note to Recently
  Deleted, where it stays recoverable for 30 days.
- **`update_note` returns the previous body as undo material.** Both the
  previous and new body come back as markdown, so the caller always has what
  was overwritten.
- **`append_to_note` never replaces.** It only ever adds content to the end
  of a note.
- **No move, no folder create/delete/rename.** Folders are read-only from
  this server's perspective.
- **Password-protected notes are skipped in listings** (`list_notes`,
  `search_notes`) and **rejected with a clear error** everywhere else
  (`get_note`, `append_to_note`, `update_note`, `delete_note`). This server
  never attempts to unlock or bypass a locked note.
- **No network, no shell.** `osascript` is invoked directly via stdin
  (`execFileSync`, never a shell string), and this server makes no network
  calls and never writes to the Notes SQLite database directly.

## Comparison

Facts about `sweetrb/apple-notes-mcp` below were verified by reading its
source: it annotates tools with `readOnlyHint` only (no `destructiveHint`,
no forced-confirmation metadata) and exposes `batch-delete-notes` and
`delete-folder` alongside a body-replacing `update-note`.

| | `safe-apple-notes-mcp` | `sweetrb/apple-notes-mcp` |
| --- | --- | --- |
| Tool count | 8 | 40+ |
| Batch delete | No | Yes (`batch-delete-notes`, `delete-folder`) |
| Server-forced confirmation on writes | Yes (`anthropic/requiresUserInteraction`) | No |
| `destructiveHint` on destructive tools | Yes | No (only `readOnlyHint` is set) |
| Update returns previous body | Yes (`update_note.previousBody`) | No |
| Tags / attachments / checklists | No | Yes |
| SQLite metadata access | No | Optional, with Full Disk Access |
| Runtime dependencies | 3 | 3 |
| License | MIT | MIT |

## Tools

| Tool | Confirmation required? | Input | Output |
| --- | --- | --- | --- |
| `list_folders` | No | — | `{ id, name, account }[]` for every folder in every account |
| `list_notes` | No | `folder?`, `limit?` (default 50, max 200) | `{ id, title, folder, modifiedAt }[]`, newest first |
| `search_notes` | No | `query`, `limit?` (default 20, max 100) | Same shape as `list_notes`; case-insensitive match on title or body |
| `get_note` | No | `id?`, `title?`, `format?` (`markdown` \| `plaintext` \| `html`, default `markdown`) — exactly one of `id`/`title` | `{ id, title, folder, createdAt, modifiedAt, body }` |
| `create_note` | Yes | `title`, `body` (plain text), `folder?` | `{ id, title, folder }` |
| `append_to_note` | Yes | `id`, `text` (plain text) | `{ id, title }` |
| `update_note` | Yes | `id`, `body` (plain text), `title?` | `{ id, title, folder, previousBody, body }` (both bodies markdown) |
| `delete_note` | Yes | `id` | `{ id, title, folder, recoverableFrom: "Recently Deleted (30 days)" }` |

`create_note` converts the plain-text body to HTML: `<h1>title</h1>`
followed by one `<div>` per line (empty lines become `<div><br></div>`).
`append_to_note` and `update_note` follow the same per-line conversion —
`append_to_note` adds it to the end of the existing body, `update_note`
replaces the body entirely (rebuilding the `<h1>` from the given `title`, or
the note's existing title when omitted).

`get_note` accepts either `id` or `title` (never both) — use `title` when you
don't have the id handy; the match is exact but case-insensitive. If the title
matches more than one note, `get_note` reports the candidate ids instead of
guessing, so you can retry with `id`.

## Install

```bash
pnpm install
pnpm build
```

## Use with Claude Code

```bash
claude mcp add apple-notes -s user -- node /absolute/path/to/dist/index.js
```

## Use with Claude Desktop

Add to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"]
    }
  }
}
```

## Permissions

The first time this server calls into Notes.app, macOS prompts for
Automation permission (System Settings → Privacy & Security → Automation).
Grant it to whichever process launches the server (e.g. Claude Desktop or
your terminal). Without it, every tool call fails with an AppleScript
permission error.

## Recommended Claude Code permissions

```json
{
  "permissions": {
    "allow": [
      "mcp__apple-notes__list_folders",
      "mcp__apple-notes__list_notes",
      "mcp__apple-notes__search_notes",
      "mcp__apple-notes__get_note"
    ],
    "ask": [
      "mcp__apple-notes__create_note",
      "mcp__apple-notes__append_to_note",
      "mcp__apple-notes__update_note",
      "mcp__apple-notes__delete_note"
    ]
  }
}
```

The `ask` rules are belt-and-braces for older Claude Code versions that
ignore the `_meta` flag — the four write/delete tools already carry
`anthropic/requiresUserInteraction`, which forces a prompt on current
versions regardless of permission mode.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `APPLE_NOTES_MCP_TIMEOUT_MS` | `30000` | Timeout for each `osascript` call, in milliseconds. |
| `APPLE_NOTES_MCP_E2E` | unset | Set to `1` to run the real-Notes.app smoke test (`test/e2e`). |

## Development

This project is built with strict TDD: every module has a test file written
and run to red before its implementation exists. Unit tests live next to
their module as `*.test.ts`; the end-to-end test lives in `test/e2e` and is
skipped unless `APPLE_NOTES_MCP_E2E=1`, since it touches the real Notes.app —
it stays strictly read-only, on purpose, even though `delete_note` and
`update_note` exist.

```bash
pnpm test          # run all unit tests
pnpm test:watch    # watch mode
pnpm typecheck      # tsc --noEmit over src and test
pnpm lint           # eslint
pnpm build          # compile src to dist
```

### Architecture

Hexagonal / screaming architecture: `domain` defines the `NotesRepository`
port and the entities; `infrastructure/applescript` is the only adapter that
knows osascript exists; `interface/mcpServer.ts` wires a `NotesRepository`
into the 8 MCP tools without knowing whether it's talking to AppleScript or a
test fake.

## Roadmap

- Folder scoping via an `APPLE_NOTES_MCP_FOLDERS` environment variable, to
  restrict every tool to an allow-listed set of folders.
- A local audit log for every write/delete call (what was called, with what
  arguments, when).
- An optional confined "create" folder, so `create_note` can be restricted to
  a single sandboxed destination.

## Credits

AppleScript patterns (escaping, delimiter-based record output, timeout
wrapping, password-protected note handling) were informed by reading:

- [sweetrb/apple-notes-mcp](https://github.com/sweetrb/apple-notes-mcp)
- [RafalWilinski/mcp-apple-notes](https://github.com/RafalWilinski/mcp-apple-notes)

This project is a from-scratch, deliberately smaller reimplementation — not a
fork — built around a fixed 8-tool surface.
