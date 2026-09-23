import { FIELD_SEP, RECORD_SEP } from "./delimiters.js";

const DELIMITER_CHARS = new RegExp(`[${FIELD_SEP}${RECORD_SEP}]`, "g");

/**
 * Escapes a string for safe embedding inside an AppleScript double-quoted
 * string literal.
 *
 * Delimiter control characters (FIELD_SEP/RECORD_SEP) are stripped first.
 * They don't break the AppleScript string itself, but a raw FIELD_SEP or
 * RECORD_SEP byte stored in a note's title/body/folder would corrupt record
 * alignment the next time `parse.ts` splits osascript output on those same
 * bytes — so this boundary is where user content must never carry them.
 *
 * Order matters otherwise: backslashes must be escaped before quotes,
 * otherwise the backslash introduced while escaping a double quote would
 * itself get re-escaped.
 */
export function escapeAppleScriptString(text: string): string {
  return text.replace(DELIMITER_CHARS, "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Escapes text for safe embedding inside HTML content.
 *
 * Order matters: ampersands must be escaped first, otherwise the entities
 * introduced for `<` and `>` would themselves get re-escaped.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
