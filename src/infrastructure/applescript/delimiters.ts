/**
 * Delimiters used to encode AppleScript record output.
 *
 * ASCII control characters (unit/record separators) can't appear in note
 * titles, folder names, or plaintext, unlike printable delimiters such as
 * "|" or ",", which do collide with real content.
 */

/** Separates fields within one record. In AppleScript: `character id 31`. */
export const FIELD_SEP = "\u001f";

/** Separates records within a list. In AppleScript: `character id 30`. */
export const RECORD_SEP = "\u001e";

/** AppleScript source expression for {@link FIELD_SEP}. */
export const AS_FIELD_SEP = "(character id 31)";

/** AppleScript source expression for {@link RECORD_SEP}. */
export const AS_RECORD_SEP = "(character id 30)";
