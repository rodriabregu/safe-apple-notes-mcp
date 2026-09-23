import type {
  AppendedNote,
  CreatedNote,
  Folder,
  Note,
  NoteBodyFormat,
  NoteSummary,
} from "../../domain/note.js";
import type { NotesRepository } from "../../domain/notesRepository.js";
import { AppleScriptError, NoteLockedError, NoteNotFoundError } from "../../domain/errors.js";
import { htmlToMarkdown, htmlToPlaintext } from "../markdown/htmlToMarkdown.js";
import {
  parseAppendResult,
  parseCreateResult,
  parseFolderRecords,
  parseGetNoteResult,
  parseNoteSummaryRecords,
  type ParsedNoteSummary,
} from "./parse.js";
import type { AppleScriptRunner } from "./runner.js";
import {
  appendToNoteScript,
  buildAppendHtml,
  buildCreateNoteHtml,
  createNoteScript,
  findNotesByTitleScript,
  getNoteScript,
  listFoldersScript,
  listNotesScript,
  searchNotesScript,
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
}
