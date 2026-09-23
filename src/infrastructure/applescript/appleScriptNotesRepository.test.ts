import { beforeEach, describe, expect, it } from "vitest";
import { NoteLockedError, NoteNotFoundError } from "../../domain/errors.js";
import { AppleScriptNotesRepository } from "./appleScriptNotesRepository.js";
import { AppleScriptError } from "../../domain/errors.js";
import type { AppleScriptRunner } from "./runner.js";
import { FIELD_SEP, RECORD_SEP } from "./delimiters.js";

class FakeRunner implements AppleScriptRunner {
  calls: string[] = [];
  private queue: Array<{ output?: string; error?: Error }> = [];

  enqueue(output: string): void {
    this.queue.push({ output });
  }

  enqueueError(error: Error): void {
    this.queue.push({ error });
  }

  run(script: string): string {
    this.calls.push(script);
    const next = this.queue.shift();
    if (!next) throw new Error("FakeRunner: no queued response");
    if (next.error) throw next.error;
    return next.output ?? "";
  }
}

describe("AppleScriptNotesRepository", () => {
  let runner: FakeRunner;
  let repo: AppleScriptNotesRepository;

  beforeEach(() => {
    runner = new FakeRunner();
    repo = new AppleScriptNotesRepository(runner);
  });

  describe("listFolders", () => {
    it("parses folder records from the runner output", async () => {
      runner.enqueue(
        [
          ["id-1", "Work", "iCloud"].join(FIELD_SEP),
          ["id-2", "Personal", "iCloud"].join(FIELD_SEP),
        ].join(RECORD_SEP)
      );

      const folders = await repo.listFolders();

      expect(folders).toEqual([
        { id: "id-1", name: "Work", account: "iCloud" },
        { id: "id-2", name: "Personal", account: "iCloud" },
      ]);
    });
  });

  describe("listNotes", () => {
    it("sorts by modification date descending and applies the limit", async () => {
      runner.enqueue(
        [
          ["id-old", "Older", "Personal", "2024-1-1-0-0-0"].join(FIELD_SEP),
          ["id-new", "Newer", "Personal", "2024-6-1-0-0-0"].join(FIELD_SEP),
        ].join(RECORD_SEP)
      );

      const notes = await repo.listNotes(undefined, 1);

      expect(notes).toEqual([
        {
          id: "id-new",
          title: "Newer",
          folder: "Personal",
          modifiedAt: new Date(2024, 5, 1).toISOString(),
        },
      ]);
    });
  });

  describe("searchNotes", () => {
    it("parses and limits matching notes", async () => {
      runner.enqueue(["id-1", "Budget 2024", "Personal", "2024-1-1-0-0-0"].join(FIELD_SEP));

      const notes = await repo.searchNotes("budget", 20);

      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe("Budget 2024");
    });
  });

  describe("findNotesByTitle", () => {
    it("parses exact-title matches, sorted by modification date descending", async () => {
      runner.enqueue(
        [
          ["id-old", "Groceries", "Personal", "2024-1-1-0-0-0"].join(FIELD_SEP),
          ["id-new", "Groceries", "Work", "2024-6-1-0-0-0"].join(FIELD_SEP),
        ].join(RECORD_SEP)
      );

      const notes = await repo.findNotesByTitle("Groceries");

      expect(notes).toEqual([
        {
          id: "id-new",
          title: "Groceries",
          folder: "Work",
          modifiedAt: new Date(2024, 5, 1).toISOString(),
        },
        {
          id: "id-old",
          title: "Groceries",
          folder: "Personal",
          modifiedAt: new Date(2024, 0, 1).toISOString(),
        },
      ]);
    });

    it("returns an empty array when no note matches", async () => {
      runner.enqueue("");

      const notes = await repo.findNotesByTitle("Nonexistent");

      expect(notes).toEqual([]);
    });
  });

  describe("getNote", () => {
    it("returns the note body in plaintext format", async () => {
      runner.enqueue(
        [
          "id-1",
          "Groceries",
          "Personal",
          "2024-1-1-0-0-0",
          "2024-1-2-0-0-0",
          "<h1>Groceries</h1><div>Eggs</div>",
        ].join(FIELD_SEP)
      );

      const note = await repo.getNote("id-1", "plaintext");

      expect(note.body).toBe("Groceries\nEggs");
      expect(note.title).toBe("Groceries");
      expect(note.folder).toBe("Personal");
    });

    it("returns the note body in markdown format", async () => {
      runner.enqueue(
        [
          "id-1",
          "Groceries",
          "Personal",
          "2024-1-1-0-0-0",
          "2024-1-2-0-0-0",
          "<h1>Groceries</h1><div>Eggs</div>",
        ].join(FIELD_SEP)
      );

      const note = await repo.getNote("id-1", "markdown");

      expect(note.body).toContain("# Groceries");
      expect(note.body).toContain("Eggs");
    });

    it("returns the note body in raw html format", async () => {
      runner.enqueue(
        [
          "id-1",
          "Groceries",
          "Personal",
          "2024-1-1-0-0-0",
          "2024-1-2-0-0-0",
          "<h1>Groceries</h1><div>Eggs</div>",
        ].join(FIELD_SEP)
      );

      const note = await repo.getNote("id-1", "html");

      expect(note.body).toBe("<h1>Groceries</h1><div>Eggs</div>");
    });

    it("throws NoteLockedError for a password-protected note", async () => {
      runner.enqueue(["LOCKED", "id-1"].join(FIELD_SEP));

      await expect(repo.getNote("id-1", "markdown")).rejects.toThrow(NoteLockedError);
    });

    it("throws NoteNotFoundError when Notes.app can't find the id", async () => {
      runner.enqueueError(
        new AppleScriptError('Can\'t get note id "x-coredata://x". Invalid index. (-1728)')
      );

      await expect(repo.getNote("x-coredata://x", "markdown")).rejects.toThrow(NoteNotFoundError);
    });

    it("re-throws other AppleScript errors unchanged", async () => {
      runner.enqueueError(new AppleScriptError("Notes.app is not running"));

      await expect(repo.getNote("id-1", "markdown")).rejects.toThrow(AppleScriptError);
    });
  });

  describe("createNote", () => {
    it("builds html from title/body and returns the created note", async () => {
      runner.enqueue(["note id id-1", "Groceries", "Personal"].join(FIELD_SEP));

      const created = await repo.createNote("Groceries", "Eggs\nMilk", "Personal");

      expect(created).toEqual({ id: "id-1", title: "Groceries", folder: "Personal" });
      expect(runner.calls[0]).toContain("<h1>Groceries</h1><div>Eggs</div><div>Milk</div>");
    });
  });

  describe("appendToNote", () => {
    it("appends escaped div lines and returns id/title", async () => {
      runner.enqueue(["id-1", "Groceries"].join(FIELD_SEP));

      const result = await repo.appendToNote("id-1", "Bread\nButter");

      expect(result).toEqual({ id: "id-1", title: "Groceries" });
      expect(runner.calls[0]).toContain("<div>Bread</div><div>Butter</div>");
    });

    it("throws NoteLockedError for a password-protected note", async () => {
      runner.enqueue(["LOCKED", "id-1"].join(FIELD_SEP));

      await expect(repo.appendToNote("id-1", "more text")).rejects.toThrow(NoteLockedError);
    });

    it("throws NoteNotFoundError when Notes.app can't find the id", async () => {
      runner.enqueueError(new AppleScriptError("Can't get note id \"id-1\". Invalid index. (-1728)"));

      await expect(repo.appendToNote("id-1", "more text")).rejects.toThrow(NoteNotFoundError);
    });
  });

  describe("deleteNote", () => {
    it("deletes the note and returns id/title/folder plus the recovery note", async () => {
      runner.enqueue(["id-1", "Groceries", "Personal"].join(FIELD_SEP));

      const result = await repo.deleteNote("id-1");

      expect(result).toEqual({
        id: "id-1",
        title: "Groceries",
        folder: "Personal",
        recoverableFrom: "Recently Deleted (30 days)",
      });
      expect(runner.calls[0]).toContain("delete n");
    });

    it("throws NoteLockedError for a password-protected note", async () => {
      runner.enqueue(["LOCKED", "id-1"].join(FIELD_SEP));

      await expect(repo.deleteNote("id-1")).rejects.toThrow(NoteLockedError);
    });

    it("throws NoteNotFoundError when Notes.app can't find the id", async () => {
      runner.enqueueError(new AppleScriptError("Can't get note id \"id-1\". Invalid index. (-1728)"));

      await expect(repo.deleteNote("id-1")).rejects.toThrow(NoteNotFoundError);
    });
  });

  describe("updateNote", () => {
    it("reads the current body, replaces it, and returns both bodies as markdown", async () => {
      runner.enqueue(
        [
          "id-1",
          "Groceries",
          "Personal",
          "2024-1-1-0-0-0",
          "2024-1-2-0-0-0",
          "<h1>Groceries</h1><div>Eggs</div>",
        ].join(FIELD_SEP)
      );
      runner.enqueue(["id-1", "Groceries"].join(FIELD_SEP));

      const result = await repo.updateNote("id-1", "Bread\nButter", undefined);

      expect(result.id).toBe("id-1");
      expect(result.title).toBe("Groceries");
      expect(result.folder).toBe("Personal");
      expect(result.previousBody).toContain("Eggs");
      expect(result.body).toContain("Bread");
      expect(result.body).toContain("Butter");
      // Second call replaces the body; keeps the existing title as <h1> when
      // no new title was given.
      expect(runner.calls[1]).toContain("<h1>Groceries</h1><div>Bread</div><div>Butter</div>");
      expect(runner.calls[1]).not.toContain("(body of n) &");
    });

    it("uses the given title instead of the note's existing name when provided", async () => {
      runner.enqueue(
        [
          "id-1",
          "Groceries",
          "Personal",
          "2024-1-1-0-0-0",
          "2024-1-2-0-0-0",
          "<h1>Groceries</h1><div>Eggs</div>",
        ].join(FIELD_SEP)
      );
      runner.enqueue(["id-1", "Shopping"].join(FIELD_SEP));

      await repo.updateNote("id-1", "Bread", "Shopping");

      expect(runner.calls[1]).toContain("<h1>Shopping</h1><div>Bread</div>");
    });

    it("throws NoteLockedError when the note is password protected", async () => {
      runner.enqueue(["LOCKED", "id-1"].join(FIELD_SEP));

      await expect(repo.updateNote("id-1", "Bread", undefined)).rejects.toThrow(NoteLockedError);
    });

    it("throws NoteNotFoundError when Notes.app can't find the id", async () => {
      runner.enqueueError(new AppleScriptError("Can't get note id \"id-1\". Invalid index. (-1728)"));

      await expect(repo.updateNote("id-1", "Bread", undefined)).rejects.toThrow(NoteNotFoundError);
    });
  });
});
