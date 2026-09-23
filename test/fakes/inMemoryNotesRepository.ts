import {
  AccountNotFoundError,
  FolderAlreadyExistsError,
  NoteLockedError,
  NoteNotFoundError,
} from "../../src/domain/errors.js";
import type {
  AppendedNote,
  CreatedNote,
  DeletedNote,
  Folder,
  Note,
  NoteBodyFormat,
  NoteSummary,
  UpdatedNote,
} from "../../src/domain/note.js";
import type { NotesRepository } from "../../src/domain/notesRepository.js";

interface StoredNote {
  id: string;
  title: string;
  folder: string;
  createdAt: string;
  modifiedAt: string;
  bodyHtml: string;
  plaintext: string;
  locked: boolean;
}

function toSummary(note: StoredNote): NoteSummary {
  return { id: note.id, title: note.title, folder: note.folder, modifiedAt: note.modifiedAt };
}

/**
 * In-process fake implementation of {@link NotesRepository}, used to exercise
 * `mcpServer.ts` without touching Notes.app.
 */
/** Every account known to this fake; matches this codebase's verified fact
 * that "iCloud" is the only account on the reference Mac, while still
 * allowing tests to register more via {@link InMemoryNotesRepository.seedAccount}. */
const DEFAULT_ACCOUNT = "iCloud";

export class InMemoryNotesRepository implements NotesRepository {
  private readonly folders: Folder[] = [];
  private readonly notes: StoredNote[] = [];
  private readonly accounts = new Set<string>([DEFAULT_ACCOUNT]);
  private nextId = 1;
  private nextFolderId = 1;

  seedFolder(folder: Folder): Folder {
    this.folders.push(folder);
    this.accounts.add(folder.account);
    return folder;
  }

  seedAccount(name: string): void {
    this.accounts.add(name);
  }

  seedNote(
    note: Partial<Omit<StoredNote, "id">> & { title: string; folder: string }
  ): StoredNote {
    const stored: StoredNote = {
      id: `note-${this.nextId++}`,
      title: note.title,
      folder: note.folder,
      createdAt: note.createdAt ?? new Date(2024, 0, 1).toISOString(),
      modifiedAt: note.modifiedAt ?? new Date(2024, 0, 1).toISOString(),
      bodyHtml: note.bodyHtml ?? `<h1>${note.title}</h1>`,
      plaintext: note.plaintext ?? note.title,
      locked: note.locked ?? false,
    };
    this.notes.push(stored);
    return stored;
  }

  async listFolders(): Promise<Folder[]> {
    return [...this.folders];
  }

  async listNotes(folder: string | undefined, limit: number): Promise<NoteSummary[]> {
    return this.notes
      .filter((note) => !note.locked)
      .filter((note) => folder === undefined || note.folder === folder)
      .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1))
      .slice(0, limit)
      .map(toSummary);
  }

  async searchNotes(query: string, limit: number): Promise<NoteSummary[]> {
    const needle = query.toLowerCase();
    return this.notes
      .filter((note) => !note.locked)
      .filter(
        (note) =>
          note.title.toLowerCase().includes(needle) || note.plaintext.toLowerCase().includes(needle)
      )
      .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1))
      .slice(0, limit)
      .map(toSummary);
  }

  async findNotesByTitle(title: string): Promise<NoteSummary[]> {
    const needle = title.toLowerCase();
    return this.notes
      .filter((note) => !note.locked)
      .filter((note) => note.title.toLowerCase() === needle)
      .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1))
      .map(toSummary);
  }

  async getNote(id: string, format: NoteBodyFormat): Promise<Note> {
    const note = this.notes.find((n) => n.id === id);
    if (!note) throw new NoteNotFoundError(id);
    if (note.locked) throw new NoteLockedError(id);

    const body =
      format === "html"
        ? note.bodyHtml
        : format === "plaintext"
          ? note.plaintext
          : `# ${note.title}\n\n${note.plaintext}`;

    return {
      id: note.id,
      title: note.title,
      folder: note.folder,
      createdAt: note.createdAt,
      modifiedAt: note.modifiedAt,
      body,
    };
  }

  async createNote(title: string, body: string, folder: string | undefined): Promise<CreatedNote> {
    const targetFolder = folder ?? "Notes";
    const stored = this.seedNote({
      title,
      folder: targetFolder,
      plaintext: body,
      bodyHtml: `<h1>${title}</h1><div>${body}</div>`,
    });
    return { id: stored.id, title: stored.title, folder: stored.folder };
  }

  async appendToNote(id: string, text: string): Promise<AppendedNote> {
    const note = this.notes.find((n) => n.id === id);
    if (!note) throw new NoteNotFoundError(id);
    if (note.locked) throw new NoteLockedError(id);
    note.plaintext = `${note.plaintext}\n${text}`;
    note.bodyHtml = `${note.bodyHtml}<div>${text}</div>`;
    return { id: note.id, title: note.title };
  }

  async deleteNote(id: string): Promise<DeletedNote> {
    const index = this.notes.findIndex((n) => n.id === id);
    if (index === -1) throw new NoteNotFoundError(id);
    const note = this.notes[index];
    if (note.locked) throw new NoteLockedError(id);
    this.notes.splice(index, 1);
    return {
      id: note.id,
      title: note.title,
      folder: note.folder,
      recoverableFrom: "Recently Deleted (30 days)",
    };
  }

  async updateNote(id: string, body: string, title: string | undefined): Promise<UpdatedNote> {
    const note = this.notes.find((n) => n.id === id);
    if (!note) throw new NoteNotFoundError(id);
    if (note.locked) throw new NoteLockedError(id);
    const previousBody = `# ${note.title}\n\n${note.plaintext}`;
    const newTitle = title ?? note.title;
    note.title = newTitle;
    note.plaintext = body;
    note.bodyHtml = `<h1>${newTitle}</h1><div>${body}</div>`;
    return {
      id: note.id,
      title: note.title,
      folder: note.folder,
      previousBody,
      body: `# ${newTitle}\n\n${body}`,
    };
  }

  async createFolder(name: string, account: string | undefined): Promise<Folder> {
    const acctName = account ?? DEFAULT_ACCOUNT;
    if (!this.accounts.has(acctName)) throw new AccountNotFoundError(acctName);

    const existing = this.folders.find((f) => f.name === name && f.account === acctName);
    if (existing) throw new FolderAlreadyExistsError(name, existing.id);

    const folder: Folder = { id: `folder-${this.nextFolderId++}`, name, account: acctName };
    this.folders.push(folder);
    return folder;
  }
}
