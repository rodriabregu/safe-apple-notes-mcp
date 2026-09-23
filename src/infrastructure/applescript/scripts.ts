/**
 * Pure functions that build AppleScript source for each Notes.app operation.
 *
 * Nothing here executes anything — these functions only return strings, so
 * they can be unit tested without osascript. Execution is {@link OsascriptRunner}'s
 * job.
 */
import { AS_FIELD_SEP, AS_RECORD_SEP } from "./delimiters.js";
import { escapeAppleScriptString, escapeHtml } from "./escape.js";

/** Sentinel returned by scripts that reject a password-protected note. */
export const LOCKED_SENTINEL = "LOCKED";

function quote(value: string): string {
  return `"${escapeAppleScriptString(value)}"`;
}

/**
 * Locale-independent AppleScript expression that renders a date variable as
 * "Y-M-D-H-m-s", parsed back by {@link parseDateParts} in parse.ts.
 */
function dateParts(varName: string): string {
  return (
    `((year of ${varName}) as text) & "-" & ((month of ${varName}) as integer as text) & "-" & ` +
    `((day of ${varName}) as text) & "-" & ((hours of ${varName}) as text) & "-" & ` +
    `((minutes of ${varName}) as text) & "-" & ((seconds of ${varName}) as text)`
  );
}

/**
 * Renders each line of plain text as a Notes.app-style `<div>` paragraph.
 * An empty line becomes `<div><br></div>`, matching how Notes.app itself
 * represents a blank paragraph.
 */
function linesToDivs(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      const escaped = escapeHtml(line);
      return escaped.length === 0 ? "<div><br></div>" : `<div>${escaped}</div>`;
    })
    .join("");
}

/**
 * Builds the HTML body Notes.app stores for a newly created note: an `<h1>`
 * title followed by one `<div>` per body line.
 */
export function buildCreateNoteHtml(title: string, body: string): string {
  return `<h1>${escapeHtml(title)}</h1>${linesToDivs(body)}`;
}

/**
 * Builds the HTML fragment appended to an existing note's body: one `<div>`
 * per line of plain text, with no heading.
 */
export function buildAppendHtml(text: string): string {
  return linesToDivs(text);
}

/** Lists every folder across every account, as `id, name, account` records. */
export function listFoldersScript(): string {
  return `
tell application "Notes"
  set out to ""
  repeat with acct in accounts
    set acctName to name of acct
    repeat with f in folders of acct
      set out to out & (id of f) & ${AS_FIELD_SEP} & (name of f) & ${AS_FIELD_SEP} & acctName & ${AS_RECORD_SEP}
    end repeat
  end repeat
  return out
end tell`;
}

/**
 * Builds the inner-loop AppleScript that turns bulk-fetched `ids`/`names`/
 * `mods` list variables (plus an optional `lockedFlags` list, already
 * filtered out when absent) into delimited records, appended to `out`.
 *
 * The loop variable is deliberately never named `locked`: that identifier is
 * reserved inside `tell <folder>` by the Notes.app AppleScript dictionary and
 * raises error -10006 ("Can't set locked...") if reused.
 */
function bulkRecordLoop(countExpr: string, guardExpr: string | undefined): string {
  const body = `
        set md to item i of mods
        set out to out & (item i of ids) & ${AS_FIELD_SEP} & (item i of names) & ${AS_FIELD_SEP} & folderName & ${AS_FIELD_SEP} & ${dateParts("md")} & ${AS_RECORD_SEP}`;
  return `
      repeat with i from 1 to ${countExpr}
        ${guardExpr ? `if ${guardExpr} then${body}\n        end if` : body.trim()}
      end repeat`;
}

/**
 * Lists notes across every account, optionally restricted to one folder by
 * name. Properties are fetched in bulk per folder (`id of every note`, etc.)
 * — one Apple Event per property per folder, instead of one per property per
 * note — because per-note round trips make this unusably slow on a library
 * of more than a few hundred notes. Password-protected notes are excluded in
 * TypeScript-visible AppleScript by filtering on the bulk-fetched
 * `lockedFlags` list. Sorting and the caller's limit are applied afterwards,
 * in TypeScript.
 */
export function listNotesScript(folder: string | undefined): string {
  const folderExpr =
    folder !== undefined
      ? `(every folder of acct whose name is ${quote(folder)})`
      : `(folders of acct)`;
  return `
tell application "Notes"
  set out to ""
  repeat with acct in accounts
    repeat with f in ${folderExpr}
      set folderName to name of f
      tell f
        set noteCount to count of notes
        if noteCount > 0 then
          set ids to id of every note
          set names to name of every note
          set mods to modification date of every note
          set lockedFlags to password protected of every note
${bulkRecordLoop("noteCount", "item i of lockedFlags is false")}
        end if
      end tell
    end repeat
  end repeat
  return out
end tell`;
}

/**
 * Searches notes across every account for a match on the name or plaintext
 * body. AppleScript's `contains` operator is already case-insensitive, so
 * the query is not lowercased and the script does not wrap it in
 * `ignoring case`. The `whose` filter (including the password-protected
 * exclusion) is resolved once inside Notes.app per folder, then properties
 * of the filtered reference are fetched in bulk — the same bulk idiom as
 * {@link listNotesScript}, for the same performance reason.
 */
export function searchNotesScript(query: string): string {
  const safeQuery = quote(query);
  const whose = `every note whose password protected is false and (name contains ${safeQuery} or plaintext contains ${safeQuery})`;
  return `
tell application "Notes"
  set out to ""
  repeat with acct in accounts
    repeat with f in (folders of acct)
      set folderName to name of f
      tell f
        set ids to id of (${whose})
        set names to name of (${whose})
        set mods to modification date of (${whose})
${bulkRecordLoop("count of ids", undefined)}
      end tell
    end repeat
  end repeat
  return out
end tell`;
}

/**
 * Finds notes with this exact title, across every account. AppleScript's
 * `is` comparison for text is case-insensitive, so "groceries" matches a
 * note titled "Groceries" too — this is intentional and left as-is, not
 * worked around. Password-protected notes are excluded. Uses the same bulk
 * idiom as {@link listNotesScript}/{@link searchNotesScript} and emits the
 * same record shape, so `parse.ts`'s `parseNoteSummaryRecords` is reused
 * unchanged.
 */
export function findNotesByTitleScript(title: string): string {
  const safeTitle = quote(title);
  const whose = `every note whose password protected is false and name is ${safeTitle}`;
  return `
tell application "Notes"
  set out to ""
  repeat with acct in accounts
    repeat with f in (folders of acct)
      set folderName to name of f
      tell f
        set ids to id of (${whose})
        set names to name of (${whose})
        set mods to modification date of (${whose})
${bulkRecordLoop("count of ids", undefined)}
      end tell
    end repeat
  end repeat
  return out
end tell`;
}

/**
 * Fetches one note's metadata and HTML body by id. Returns a
 * {@link LOCKED_SENTINEL}-prefixed record instead of the body when the note
 * is password protected.
 */
export function getNoteScript(id: string): string {
  const safeId = quote(id);
  return `
tell application "Notes"
  set n to note id ${safeId}
  if password protected of n then
    return "${LOCKED_SENTINEL}" & ${AS_FIELD_SEP} & (id of n)
  end if
  set cd to creation date of n
  set md to modification date of n
  set containerRef to container of n
  set folderName to name of containerRef
  return (id of n) & ${AS_FIELD_SEP} & (name of n) & ${AS_FIELD_SEP} & folderName & ${AS_FIELD_SEP} & ${dateParts("cd")} & ${AS_FIELD_SEP} & ${dateParts("md")} & ${AS_FIELD_SEP} & (body of n)
end tell`;
}

/**
 * Creates a note from pre-built HTML. When `folder` is given, every account
 * is searched for a folder with that exact name; otherwise the note is
 * created in the default account's default folder.
 *
 * There is no separate `title` parameter: Notes.app derives the note's title
 * from the first line of `html` (the `<h1>` {@link buildCreateNoteHtml}
 * produces), so a title value here would never be used.
 */
export function createNoteScript(html: string, folder: string | undefined): string {
  const safeHtml = quote(html);
  const locate =
    folder !== undefined
      ? `
  set targetFolder to missing value
  repeat with acct in accounts
    set matches to (every folder of acct whose name is ${quote(folder)})
    if (count of matches) > 0 then
      set targetFolder to item 1 of matches
      exit repeat
    end if
  end repeat
  if targetFolder is missing value then error "Folder not found: ${escapeAppleScriptString(folder)}"`
      : `
  set targetFolder to default folder of (default account)`;
  return `
tell application "Notes"${locate}
  set newNote to make new note at targetFolder with properties {body:${safeHtml}}
  set containerRef to container of newNote
  return (id of newNote) & ${AS_FIELD_SEP} & (name of newNote) & ${AS_FIELD_SEP} & (name of containerRef)
end tell`;
}

/**
 * Appends an HTML fragment to an existing note's body. Returns a
 * {@link LOCKED_SENTINEL}-prefixed record instead of appending when the note
 * is password protected.
 */
export function appendToNoteScript(id: string, htmlFragment: string): string {
  const safeId = quote(id);
  const safeFragment = quote(htmlFragment);
  return `
tell application "Notes"
  set n to note id ${safeId}
  if password protected of n then
    return "${LOCKED_SENTINEL}" & ${AS_FIELD_SEP} & (id of n)
  end if
  set body of n to (body of n) & ${safeFragment}
  return (id of n) & ${AS_FIELD_SEP} & (name of n)
end tell`;
}
