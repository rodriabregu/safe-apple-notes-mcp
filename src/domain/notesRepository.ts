import type {
  AppendedNote,
  CreatedNote,
  DeletedNote,
  Folder,
  Note,
  NoteBodyFormat,
  NoteSummary,
  UpdatedNote,
} from "./note.js";

/**
 * Port for reading and minimally writing Apple Notes data.
 *
 * This is the single seam between the MCP interface layer and whatever talks
 * to Notes.app (AppleScript today, something else tomorrow). Implementations
 * must honor the safety model: password-protected notes are skipped in
 * listings and rejected with a clear error from `getNote`/`appendToNote`.
 */
export interface NotesRepository {
  /** List folders across every account. */
  listFolders(): Promise<Folder[]>;

  /**
   * List notes, most recently modified first.
   * @param folder - Restrict to a single folder by name, when given.
   * @param limit - Maximum notes to return (caller has already clamped this).
   */
  listNotes(folder: string | undefined, limit: number): Promise<NoteSummary[]>;

  /**
   * Case-insensitive search over note title and plaintext body.
   * @param query - Search text.
   * @param limit - Maximum notes to return (caller has already clamped this).
   */
  searchNotes(query: string, limit: number): Promise<NoteSummary[]>;

  /**
   * Find notes with this exact title. AppleScript's `is` comparison for text
   * is case-insensitive, so this also matches a differently-cased title —
   * that is intentional, not worked around. Password-protected notes are
   * excluded, like the other listings. Used by `get_note` to resolve a
   * `title` input to one or more candidate ids.
   */
  findNotesByTitle(title: string): Promise<NoteSummary[]>;

  /**
   * Fetch one note by id, rendered in the requested format.
   * @throws NoteNotFoundError when no note has this id.
   * @throws NoteLockedError when the note is password protected.
   */
  getNote(id: string, format: NoteBodyFormat): Promise<Note>;

  /** Create a note from a plain-text body, converted to simple HTML. */
  createNote(title: string, body: string, folder: string | undefined): Promise<CreatedNote>;

  /**
   * Append plain text to an existing note's body. Never replaces existing
   * content.
   * @throws NoteNotFoundError when no note has this id.
   * @throws NoteLockedError when the note is password protected.
   */
  appendToNote(id: string, text: string): Promise<AppendedNote>;

  /**
   * Delete a single note by id. Notes.app moves it to Recently Deleted,
   * where it stays recoverable for 30 days — this never permanently
   * destroys it. There is no batch or title-based variant.
   * @throws NoteNotFoundError when no note has this id.
   * @throws NoteLockedError when the note is password protected.
   */
  deleteNote(id: string): Promise<DeletedNote>;

  /**
   * Replace an existing note's body (and optionally its title). Unlike
   * appendToNote, this overwrites existing content; the previous body is
   * returned as undo material.
   * @param title - New title; when omitted, the note's existing title is kept.
   * @throws NoteNotFoundError when no note has this id.
   * @throws NoteLockedError when the note is password protected.
   */
  updateNote(id: string, body: string, title: string | undefined): Promise<UpdatedNote>;
}
