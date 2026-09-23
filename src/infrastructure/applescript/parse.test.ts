import { describe, expect, it } from "vitest";
import { FIELD_SEP, RECORD_SEP } from "./delimiters.js";
import {
  parseAppendResult,
  parseCreateResult,
  parseDateParts,
  parseFolderRecords,
  parseGetNoteResult,
  parseNoteSummaryRecords,
} from "./parse.js";

describe("parseDateParts", () => {
  it("parses a Y-M-D-H-m-s string into an ISO date", () => {
    const iso = parseDateParts("2024-3-7-9-5-2");

    expect(iso).toBe(new Date(2024, 2, 7, 9, 5, 2).toISOString());
  });
});

describe("parseFolderRecords", () => {
  it("parses record/field-separated output into Folder objects", () => {
    const raw = [
      ["id-1", "Work", "iCloud"].join(FIELD_SEP),
      ["id-2", "Personal", "iCloud"].join(FIELD_SEP),
    ].join(RECORD_SEP);

    expect(parseFolderRecords(raw)).toEqual([
      { id: "id-1", name: "Work", account: "iCloud" },
      { id: "id-2", name: "Personal", account: "iCloud" },
    ]);
  });

  it("returns an empty array for empty output", () => {
    expect(parseFolderRecords("")).toEqual([]);
  });

  it("ignores the trailing record separator every script emits after its last record", () => {
    // scripts.ts appends RECORD_SEP after every record, including the last
    // one, so real osascript output always ends with a dangling separator.
    const raw = ["id-1", "Work", "iCloud"].join(FIELD_SEP) + RECORD_SEP;

    expect(parseFolderRecords(raw)).toEqual([{ id: "id-1", name: "Work", account: "iCloud" }]);
  });
});

describe("parseNoteSummaryRecords", () => {
  it("parses record/field-separated output into NoteSummary objects", () => {
    const raw = ["id-1", "Groceries", "Personal", "2024-3-7-9-5-2"].join(FIELD_SEP);

    expect(parseNoteSummaryRecords(raw)).toEqual([
      {
        id: "id-1",
        title: "Groceries",
        folder: "Personal",
        modifiedAt: new Date(2024, 2, 7, 9, 5, 2).toISOString(),
      },
    ]);
  });

  it("returns an empty array for empty output", () => {
    expect(parseNoteSummaryRecords("")).toEqual([]);
  });

  it("ignores the trailing record separator every script emits after its last record", () => {
    const raw =
      ["id-1", "Groceries", "Personal", "2024-3-7-9-5-2"].join(FIELD_SEP) + RECORD_SEP;

    expect(parseNoteSummaryRecords(raw)).toEqual([
      {
        id: "id-1",
        title: "Groceries",
        folder: "Personal",
        modifiedAt: new Date(2024, 2, 7, 9, 5, 2).toISOString(),
      },
    ]);
  });

  it("does not throw on a legacy note whose title already contains a stray field separator", () => {
    // escape.ts now strips FIELD_SEP/RECORD_SEP from new note content, but a
    // note created before that fix could already have one of these bytes
    // stored in its title. Splitting such a record on FIELD_SEP misaligns
    // the fields (extra parts shift folder/modifiedAt) — that misalignment
    // is accepted as best-effort for this pre-existing, uncontrollable data;
    // what must never happen is parsing crashing the whole list/search call.
    const raw = ["id-1", `Weird${FIELD_SEP}Title`, "Personal", "2024-3-7-9-5-2"].join(FIELD_SEP);

    expect(() => parseNoteSummaryRecords(raw)).not.toThrow();
  });
});

describe("parseGetNoteResult", () => {
  it("parses a full note record, rejoining any extra fields into the body", () => {
    const raw = [
      "id-1",
      "Groceries",
      "Personal",
      "2024-3-7-9-5-2",
      "2024-3-8-10-6-3",
      "<div>Eggs</div>",
    ].join(FIELD_SEP);

    expect(parseGetNoteResult(raw)).toEqual({
      locked: false,
      id: "id-1",
      title: "Groceries",
      folder: "Personal",
      createdAt: new Date(2024, 2, 7, 9, 5, 2).toISOString(),
      modifiedAt: new Date(2024, 2, 8, 10, 6, 3).toISOString(),
      body: "<div>Eggs</div>",
    });
  });

  it("reports a locked note", () => {
    const raw = ["LOCKED", "id-1"].join(FIELD_SEP);

    expect(parseGetNoteResult(raw)).toEqual({ locked: true, id: "id-1" });
  });
});

describe("parseCreateResult", () => {
  it("strips the leading 'note id ' prefix Notes.app sometimes returns", () => {
    const raw = ["note id id-1", "Groceries", "Personal"].join(FIELD_SEP);

    expect(parseCreateResult(raw)).toEqual({ id: "id-1", title: "Groceries", folder: "Personal" });
  });

  it("accepts a bare id with no prefix", () => {
    const raw = ["id-1", "Groceries", "Personal"].join(FIELD_SEP);

    expect(parseCreateResult(raw)).toEqual({ id: "id-1", title: "Groceries", folder: "Personal" });
  });
});

describe("parseAppendResult", () => {
  it("parses id and title", () => {
    const raw = ["id-1", "Groceries"].join(FIELD_SEP);

    expect(parseAppendResult(raw)).toEqual({ locked: false, id: "id-1", title: "Groceries" });
  });

  it("reports a locked note", () => {
    const raw = ["LOCKED", "id-1"].join(FIELD_SEP);

    expect(parseAppendResult(raw)).toEqual({ locked: true, id: "id-1" });
  });
});
