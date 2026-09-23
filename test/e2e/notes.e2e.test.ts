import { describe, expect, it } from "vitest";
import { AppleScriptNotesRepository } from "../../src/infrastructure/applescript/appleScriptNotesRepository.js";
import { OsascriptRunner } from "../../src/infrastructure/applescript/runner.js";

/**
 * Real Notes.app smoke test. Skipped by default — set
 * APPLE_NOTES_MCP_E2E=1 to run it. Read-only on purpose: it must never
 * create, modify, or delete a note.
 */
describe.skipIf(process.env.APPLE_NOTES_MCP_E2E !== "1")("Apple Notes e2e", () => {
  const repo = new AppleScriptNotesRepository(new OsascriptRunner());

  it("lists folders from the real Notes.app", async () => {
    const folders = await repo.listFolders();

    expect(Array.isArray(folders)).toBe(true);
    for (const folder of folders) {
      expect(typeof folder.id).toBe("string");
      expect(typeof folder.name).toBe("string");
      expect(typeof folder.account).toBe("string");
    }
  });

  it("lists notes from the real Notes.app", async () => {
    const notes = await repo.listNotes(undefined, 5);

    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBeLessThanOrEqual(5);
    for (const note of notes) {
      expect(typeof note.id).toBe("string");
      expect(typeof note.title).toBe("string");
      expect(typeof note.folder).toBe("string");
      expect(typeof note.modifiedAt).toBe("string");
    }
  });

  it("searches notes in the real Notes.app", async () => {
    const notes = await repo.searchNotes("a", 5);

    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBeLessThanOrEqual(5);
  });

  it("gets one real note by id, read-only", async () => {
    const [first] = await repo.listNotes(undefined, 1);
    expect(first).toBeDefined();

    const note = await repo.getNote(first.id, "markdown");

    expect(typeof note.body).toBe("string");
    expect(note.title).toBe(first.title);
  });

  it("finds a real note by its exact title", async () => {
    const [first] = await repo.listNotes(undefined, 1);
    expect(first).toBeDefined();

    const matches = await repo.findNotesByTitle(first.title);

    expect(matches.map((m) => m.id)).toContain(first.id);
  });
});
