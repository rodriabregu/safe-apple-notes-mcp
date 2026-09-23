/** A note id did not match any note in Notes.app. */
export class NoteNotFoundError extends Error {
  constructor(id: string) {
    super(`No note found with id "${id}"`);
    this.name = "NoteNotFoundError";
  }
}

/** The targeted note is password protected and cannot be read or modified. */
export class NoteLockedError extends Error {
  constructor(id: string) {
    super(`Note "${id}" is password protected and cannot be accessed`);
    this.name = "NoteLockedError";
  }
}

/** A candidate note surfaced when a title lookup matched more than one note. */
export interface AmbiguousNoteCandidate {
  id: string;
  folder: string;
  modifiedAt: string;
}

/**
 * A `get_note` title lookup matched more than one note. Nothing was fetched
 * — the caller must retry with one of the listed ids.
 */
export class AmbiguousNoteTitleError extends Error {
  constructor(title: string, candidates: AmbiguousNoteCandidate[]) {
    const lines = candidates.map(
      (c) => `- ${c.id} (${c.folder}, modified ${c.modifiedAt})`
    );
    super(`Multiple notes match title "${title}". Use id instead:\n${lines.join("\n")}`);
    this.name = "AmbiguousNoteTitleError";
  }
}

/** osascript failed, timed out, or Notes.app reported an unexpected error. */
export class AppleScriptError extends Error {
  constructor(raw: string) {
    super(`AppleScript execution failed: ${raw}`);
    this.name = "AppleScriptError";
  }
}

/** No account with this name exists in Notes.app. */
export class AccountNotFoundError extends Error {
  constructor(account: string) {
    super(`No account found with name "${account}"`);
    this.name = "AccountNotFoundError";
  }
}

/** A folder with this name already exists in the target account. */
export class FolderAlreadyExistsError extends Error {
  constructor(name: string, existingId: string) {
    super(`Folder "${name}" already exists (id "${existingId}")`);
    this.name = "FolderAlreadyExistsError";
  }
}
