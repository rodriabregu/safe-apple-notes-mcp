/**
 * Domain types for Apple Notes entities.
 *
 * These types are transport-agnostic: they describe what a note or folder
 * *is*, not how AppleScript or MCP represent it on the wire.
 */

/** A folder that groups notes, scoped to one account (e.g. iCloud, On My Mac). */
export interface Folder {
  id: string;
  name: string;
  account: string;
}

/** Lightweight note metadata, used for listing and searching. */
export interface NoteSummary {
  id: string;
  title: string;
  folder: string;
  modifiedAt: string;
}

/** Supported rendering formats for a note body. */
export type NoteBodyFormat = "markdown" | "plaintext" | "html";

/** A full note, including its body rendered in the requested format. */
export interface Note {
  id: string;
  title: string;
  folder: string;
  createdAt: string;
  modifiedAt: string;
  body: string;
}

/** Result of creating a note. */
export interface CreatedNote {
  id: string;
  title: string;
  folder: string;
}

/** Result of appending text to a note. */
export interface AppendedNote {
  id: string;
  title: string;
}

/** Result of deleting a note. */
export interface DeletedNote {
  id: string;
  title: string;
  folder: string;
  recoverableFrom: string;
}

/** Result of replacing a note's body. `previousBody`/`body` are both markdown. */
export interface UpdatedNote {
  id: string;
  title: string;
  folder: string;
  previousBody: string;
  body: string;
}
