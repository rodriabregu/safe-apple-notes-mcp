import { describe, expect, it } from "vitest";
import { AmbiguousNoteTitleError, AppleScriptError, NoteLockedError, NoteNotFoundError } from "./errors.js";

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

describe("AppleScriptError", () => {
  it("wraps the raw osascript error output", () => {
    const error = new AppleScriptError("some raw osascript stderr");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppleScriptError");
    expect(error.message).toContain("some raw osascript stderr");
  });
});
