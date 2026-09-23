import { describe, expect, it } from "vitest";
import {
  AccountNotFoundError,
  AmbiguousNoteTitleError,
  AppleScriptError,
  FolderAlreadyExistsError,
  NoteLockedError,
  NoteNotFoundError,
} from "./errors.js";

describe("NoteNotFoundError", () => {
  it("carries the missing note id in its message", () => {
    const error = new NoteNotFoundError("abc-123");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("NoteNotFoundError");
    expect(error.message).toContain("abc-123");
  });
});

describe("NoteLockedError", () => {
  it("explains the note is password protected", () => {
    const error = new NoteLockedError("abc-123");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("NoteLockedError");
    expect(error.message).toContain("abc-123");
    expect(error.message.toLowerCase()).toContain("password");
  });
});

describe("AmbiguousNoteTitleError", () => {
  it("names the title and lists each candidate as id/folder/modifiedAt", () => {
    const error = new AmbiguousNoteTitleError("Groceries", [
      { id: "id-1", folder: "Personal", modifiedAt: "2024-01-01T00:00:00.000Z" },
      { id: "id-2", folder: "Work", modifiedAt: "2024-02-01T00:00:00.000Z" },
    ]);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AmbiguousNoteTitleError");
    expect(error.message).toContain('Multiple notes match title "Groceries". Use id instead:');
    expect(error.message).toContain("- id-1 (Personal, modified 2024-01-01T00:00:00.000Z)");
    expect(error.message).toContain("- id-2 (Work, modified 2024-02-01T00:00:00.000Z)");
  });
});

describe("AccountNotFoundError", () => {
  it("names the missing account in its message", () => {
    const error = new AccountNotFoundError("Work");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AccountNotFoundError");
    expect(error.message).toContain("Work");
  });
});

describe("FolderAlreadyExistsError", () => {
  it("names the folder and the id of the existing folder", () => {
    const error = new FolderAlreadyExistsError("Recipes", "folder-1");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("FolderAlreadyExistsError");
    expect(error.message).toContain("Recipes");
    expect(error.message).toContain("folder-1");
  });
});

describe("AppleScriptError", () => {
  it("wraps the raw osascript error output", () => {
    const error = new AppleScriptError("some raw osascript stderr");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppleScriptError");
    expect(error.message).toContain("some raw osascript stderr");
  });
});
