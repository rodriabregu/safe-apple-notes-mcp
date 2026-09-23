# apple-notes-mcp-lite

A minimal, read-mostly [MCP](https://modelcontextprotocol.io) server for Apple
Notes on macOS. It talks to Notes.app through AppleScript (`osascript`) and
exposes exactly 6 tools — nothing that can delete, overwrite, or reorganize
your notes.

## Why it exists

Most Apple Notes MCP servers expose a large surface: delete, batch operations,
move, rename, folder management. That is a lot of blast radius to hand to an
LLM. This server takes the opposite bet: keep the tool list small enough to
read in one sitting, and make every destructive operation structurally
impossible rather than merely discouraged.

## Safety model

- **Exactly 6 tools.** `list_folders`, `list_notes`, `search_notes`,
  `get_note`, `create_note`, `append_to_note`. Nothing else is registered —
  this is enforced by a test that fails if a tool is ever added.
- **No delete.** There is no tool that removes a note or a folder.
- **No batch operations.** Every tool acts on one note (or lists/searches).
- **No update/overwrite of a body.** `append_to_note` only ever adds content
  to the end of a note; it never replaces or clears what's already there.
- **No move, no folder create/delete/rename.** Folders are read-only from
  this server's perspective.
- **Password-protected notes are skipped in listings** (`list_notes`,
  `search_notes`) and **rejected with a clear error** from `get_note` and
  `append_to_note`. This server never attempts to unlock or bypass a locked
  note.
- **Write tools always prompt.** `create_note` and `append_to_note` carry
  `_meta["anthropic/requiresUserInteraction"]`, so Claude Code (>= 2.1.199)
  always asks for confirmation before calling them, regardless of permission
  mode or allow rules — including bypass mode.

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
      "mcp__apple-notes__append_to_note"
    ]
  }
}
```

The `ask` rules are belt-and-braces for older Claude Code versions that ignore the `_meta` flag.

## Install

```bash
pnpm install
pnpm build
```

## Use with Claude Code

```bash
claude mcp add apple-notes -s user -- node /absolute/path/to/apple-notes-mcp/dist/index.js
```

## Use with Claude Desktop

Add to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "node",
      "args": ["/absolute/path/to/apple-notes-mcp/dist/index.js"]
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

## Tools

| Tool | Input | Output |
| --- | --- | --- |
| `list_folders` | — | `{ id, name, account }[]` for every folder in every account |
| `list_notes` | `folder?`, `limit?` (default 50, max 200) | `{ id, title, folder, modifiedAt }[]`, newest first |
| `search_notes` | `query`, `limit?` (default 20, max 100) | Same shape as `list_notes`; case-insensitive match on title or body |
| `get_note` | `id?`, `title?`, `format?` (`markdown` \| `plaintext` \| `html`, default `markdown`) — exactly one of `id`/`title` | `{ id, title, folder, createdAt, modifiedAt, body }` |
| `create_note` | `title`, `body` (plain text), `folder?` | `{ id, title, folder }` |
| `append_to_note` | `id`, `text` (plain text) | `{ id, title }` |

`create_note` converts the plain-text body to HTML: `<h1>title</h1>` followed
by one `<div>` per line (empty lines become `<div><br></div>`).
`append_to_note` follows the same per-line conversion and appends it to the
existing body — it never touches what was there before.

`get_note` accepts either `id` or `title` (never both) — use `title` when you
don't have the id handy; the match is exact but case-insensitive. If the title
matches more than one note, `get_note` reports the candidate ids instead of
guessing, so you can retry with `id`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `APPLE_NOTES_MCP_TIMEOUT_MS` | `30000` | Timeout for each `osascript` call, in milliseconds. |
| `APPLE_NOTES_MCP_E2E` | unset | Set to `1` to run the real-Notes.app smoke test (`test/e2e`). |

## Development

This project is built with strict TDD: every module has a test file written
and run to red before its implementation exists. Unit tests live next to
their module as `*.test.ts`; the end-to-end test lives in `test/e2e` and is
skipped unless `APPLE_NOTES_MCP_E2E=1`, since it touches the real Notes.app.

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
into the 6 MCP tools without knowing whether it's talking to AppleScript or a
test fake.

## Credits

AppleScript patterns (escaping, delimiter-based record output, timeout
wrapping, password-protected note handling) were informed by reading:

- [sweetrb/apple-notes-mcp](https://github.com/sweetrb/apple-notes-mcp)
- [RafalWilinski/mcp-apple-notes](https://github.com/RafalWilinski/mcp-apple-notes)

This project is a from-scratch, deliberately smaller reimplementation — not a
fork — built around a fixed 6-tool surface.
