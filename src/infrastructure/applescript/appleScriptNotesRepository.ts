import type {
  AppendedNote,
  CreatedNote,
  DeletedNote,
  Folder,
  Note,
  NoteBodyFormat,
  NoteSummary,
  UpdatedNote,
} from "../../domain/note.js";
import type { NotesRepository } from "../../domain/notesRepository.js";
import {
  AccountNotFoundError,
  AppleScriptError,
  FolderAlreadyExistsError,
  NoteLockedError,
  NoteNotFoundError,
} from "../../domain/errors.js";
import { htmlToMarkdown, htmlToPlaintext } from "../markdown/htmlToMarkdown.js";
import {
  parseAppendResult,
  parseCreateFolderResult,
  parseCreateResult,
  parseDeleteResult,
  parseFolderRecords,
  parseGetNoteResult,
  parseNoteSummaryRecords,
  parseUpdateResult,
  type ParsedNoteSummary,
} from "./parse.js";
import type { AppleScriptRunner } from "./runner.js";
import {
  appendToNoteScript,
  buildAppendHtml,
  buildCreateNoteHtml,
  createFolderScript,
  createNoteScript,
  deleteNoteScript,
  findNotesByTitleScript,
  getNoteScript,
  listFoldersScript,
  listNotesScript,
  searchNotesScript,
  updateNoteScript,
} from "./scripts.js";

/** Matches the Notes.app error raised when a note id no longer resolves. */
const NOT_FOUND_PATTERN = /-1728|can'?t get note id/i;

function sortByModifiedDesc(notes: ParsedNoteSummary[]): ParsedNoteSummary[] {
  return [...notes].sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
}

/** {@link NotesRepository} backed by osascript calls to Notes.app. */
export class AppleScriptNotesRepository implements NotesRepository {
  constructor(private readonly runner: AppleScriptRunner) {}

  private runOrTranslateNotFound(script: string, id: string): string {
    try {
      return this.runner.run(script);
    } catch (error) {
      if (error instanceof AppleScriptError && NOT_FOUND_PATTERN.test(error.message)) {
        throw new NoteNotFoundError(id);
      }
      throw error;
    }
  }

  async listFolders(): Promise<Folder[]> {
    const raw = this.runner.run(listFoldersScript());
    return parseFolderRecords(raw);
  }

  async listNotes(folder: string | undefined, limit: number): Promise<NoteSummary[]> {
    const raw = this.runner.run(listNotesScript(folder));
    const parsed = parseNoteSummaryRecords(raw);
    return sortByModifiedDesc(parsed).slice(0, limit);
  }

  async searchNotes(query: string, limit: number): Promise<NoteSummary[]> {
    const raw = this.runner.run(searchNotesScript(query));
    const parsed = parseNoteSummaryRecords(raw);
    return sortByModifiedDesc(parsed).slice(0, limit);
  }

  async findNotesByTitle(title: string): Promise<NoteSummary[]> {
    const raw = this.runner.run(findNotesByTitleScript(title));
    const parsed = parseNoteSummaryRecords(raw);
    return sortByModifiedDesc(parsed);
  }

  async getNote(id: string, format: NoteBodyFormat): Promise<Note> {
    const raw = this.runOrTranslateNotFound(getNoteScript(id), id);
    const parsed = parseGetNoteResult(raw);
    if (parsed.locked) throw new NoteLockedError(parsed.id);

    const body =
      format === "html"
        ? parsed.body
        : format === "plaintext"
          ? htmlToPlaintext(parsed.body)
          : htmlToMarkdown(parsed.body);

    return {
      id: parsed.id,
      title: parsed.title,
      folder: parsed.folder,
      createdAt: parsed.createdAt,
      modifiedAt: parsed.modifiedAt,
      body,
    };
  }

  async createNote(
    title: string,
    body: string,
    folder: string | undefined
  ): Promise<CreatedNote> {
    const html = buildCreateNoteHtml(title, body);
    const raw = this.runner.run(createNoteScript(html, folder));
    return parseCreateResult(raw);
  }

  async appendToNote(id: string, text: string): Promise<AppendedNote> {
    const fragment = buildAppendHtml(text);
    const raw = this.runOrTranslateNotFound(appendToNoteScript(id, fragment), id);
    const parsed = parseAppendResult(raw);
    if (parsed.locked) throw new NoteLockedError(parsed.id);
    return { id: parsed.id, title: parsed.title };
  }

  async deleteNote(id: string): Promise<DeletedNote> {
    const raw = this.runOrTranslateNotFound(deleteNoteScript(id), id);
    const parsed = parseDeleteResult(raw);
    if (parsed.locked) throw new NoteLockedError(parsed.id);
    return {
      id: parsed.id,
      title: parsed.title,
      folder: parsed.folder,
      recoverableFrom: "Recently Deleted (30 days)",
    };
  }

  async updateNote(id: string, body: string, title: string | undefined): Promise<UpdatedNote> {
    // Read the current body first so it can be returned as undo material —
    // this also gives us the note's folder and, when no new title is given,
    // its existing name to keep as the <h1>.
    const currentRaw = this.runOrTranslateNotFound(getNoteScript(id), id);
    const current = parseGetNoteResult(currentRaw);
    if (current.locked) throw new NoteLockedError(current.id);

    const newTitle = title ?? current.title;
    const html = buildCreateNoteHtml(newTitle, body);
    const updateRaw = this.runOrTranslateNotFound(updateNoteScript(id, html), id);
    const updated = parseUpdateResult(updateRaw);
    if (updated.locked) throw new NoteLockedError(updated.id);

    return {
      id: updated.id,
      title: updated.title,
      folder: current.folder,
      previousBody: htmlToMarkdown(current.body),
      body: htmlToMarkdown(html),
    };
  }

  async createFolder(name: string, account: string | undefined): Promise<Folder> {
    const raw = this.runner.run(createFolderScript(name, account));
    const parsed = parseCreateFolderResult(raw);
    if (parsed.outcome === "noAccount") throw new AccountNotFoundError(parsed.account);
    if (parsed.outcome === "duplicate") throw new FolderAlreadyExistsError(name, parsed.existingId);
    return { id: parsed.id, name: parsed.name, account: parsed.account };
  }
}
