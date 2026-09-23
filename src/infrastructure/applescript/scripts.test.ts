import { describe, expect, it } from "vitest";
import {
  AS_FIELD_SEP as FIELD_SEP,
  AS_RECORD_SEP as RECORD_SEP,
  FIELD_SEP as RAW_FIELD_SEP,
} from "./delimiters.js";
import {
  appendToNoteScript,
  buildCreateNoteHtml,
  createFolderScript,
  createNoteScript,
  deleteNoteScript,
  DUPLICATE_SENTINEL,
  findNotesByTitleScript,
  getNoteScript,
  listFoldersScript,
  listNotesScript,
  LOCKED_SENTINEL,
  NO_ACCOUNT_SENTINEL,
  searchNotesScript,
  updateNoteScript,
} from "./scripts.js";

describe("buildCreateNoteHtml", () => {
  it("wraps the title in an h1 and each body line in a div", () => {
    const html = buildCreateNoteHtml("Groceries", "Eggs\nMilk");

    expect(html).toBe("<h1>Groceries</h1><div>Eggs</div><div>Milk</div>");
  });

  it("turns an empty line into <div><br></div>", () => {
    const html = buildCreateNoteHtml("Title", "First\n\nThird");

    expect(html).toBe("<h1>Title</h1><div>First</div><div><br></div><div>Third</div>");
  });

  it("escapes &, <, > in both title and body", () => {
    const html = buildCreateNoteHtml("A & B", "<b>bold</b>");

    expect(html).toBe("<h1>A &amp; B</h1><div>&lt;b&gt;bold&lt;/b&gt;</div>");
  });

  it("handles a single-line body with no trailing content", () => {
    const html = buildCreateNoteHtml("Title", "Only line");

    expect(html).toBe("<h1>Title</h1><div>Only line</div>");
  });
});

describe("listFoldersScript", () => {
  it("iterates every account and every folder, emitting id/name/account fields", () => {
    const script = listFoldersScript();

    expect(script).toContain('tell application "Notes"');
    expect(script).toContain("repeat with acct in accounts");
    expect(script).toContain("folders of acct");
    expect(script).toContain(FIELD_SEP);
    expect(script).toContain(RECORD_SEP);
  });
});

describe("listNotesScript", () => {
  it("scopes to every folder when no folder is given", () => {
    const script = listNotesScript(undefined);

    expect(script).toContain("folders of acct");
    expect(script).not.toContain("whose name is");
  });

  it("filters to a single folder by escaped name when given", () => {
    const script = listNotesScript('Ideas "2024"');

    expect(script).toContain("whose name is \"Ideas \\\"2024\\\"\"");
  });

  it("skips password protected notes via the bulk-fetched lockedFlags list", () => {
    const script = listNotesScript(undefined);

    expect(script).toContain("password protected of every note");
    expect(script).toContain("lockedFlags is false");
  });

  it("fetches note properties in bulk per folder instead of per-note Apple Events", () => {
    const script = listNotesScript(undefined);

    expect(script).toContain("id of every note");
    expect(script).toContain("name of every note");
    expect(script).toContain("modification date of every note");
    expect(script).toContain("password protected of every note");
    expect(script).not.toContain("repeat with n in");
  });

  it("never names a variable 'locked' (reserved inside `tell folder`, errors -10006)", () => {
    const script = listNotesScript(undefined);

    expect(script).not.toMatch(/\bset locked\b/);
    expect(script).not.toMatch(/\bitem i of locked\b/);
  });
});

describe("searchNotesScript", () => {
  it("matches on name or plaintext and skips locked notes", () => {
    const script = searchNotesScript("Budget");

    expect(script).toContain('name contains "Budget"');
    expect(script).toContain('plaintext contains "Budget"');
    expect(script).toContain("password protected is false");
  });

  it("does not lowercase or wrap in `ignoring case` (AppleScript `contains` is already case-insensitive)", () => {
    const script = searchNotesScript("Budget");

    expect(script).not.toContain("ignoring case");
  });

  it("escapes double quotes in the query", () => {
    const script = searchNotesScript('say "hi"');

    expect(script).toContain('\\"hi\\"');
  });

  it("resolves the whose-filter inside Notes, then bulk-fetches properties of the matches", () => {
    const script = searchNotesScript("Budget");

    expect(script).toContain("id of (every note whose");
    expect(script).toContain("name of (every note whose");
    expect(script).toContain("modification date of (every note whose");
    expect(script).not.toContain("repeat with n in");
  });
});

describe("findNotesByTitleScript", () => {
  it("matches on exact name and skips locked notes, using the bulk idiom", () => {
    const script = findNotesByTitleScript("Groceries");

    expect(script).toContain("id of (every note whose");
    expect(script).toContain("name of (every note whose");
    expect(script).toContain("modification date of (every note whose");
    expect(script).toContain('password protected is false and name is "Groceries"');
    expect(script).not.toContain("repeat with n in");
  });

  it("escapes double quotes in the title", () => {
    const script = findNotesByTitleScript('Say "hi"');

    expect(script).toContain('\\"hi\\"');
  });

  it("never names a variable 'locked' (reserved inside `tell folder`, errors -10006)", () => {
    const script = findNotesByTitleScript("Groceries");

    expect(script).not.toMatch(/\bset locked\b/);
  });
});

describe("getNoteScript", () => {
  it("targets the note by id and returns a locked sentinel for protected notes", () => {
    const script = getNoteScript("x-coredata://abc/ICNote/p1");

    expect(script).toContain('note id "x-coredata://abc/ICNote/p1"');
    expect(script).toContain(LOCKED_SENTINEL);
    expect(script).toContain("password protected");
  });

  it("resolves the container into a variable before reading its name", () => {
    // `name of container of n` fails on some real notes (observed: Notes
    // got an error: Can't make name of «class cntr» of «class note» ... into
    // type Unicode text) because `container of n` resolves to a generic
    // `item`-class reference for certain notes. Assigning it to a variable
    // first forces a concrete reference whose `name` resolves reliably.
    const script = getNoteScript("x-coredata://abc/ICNote/p1");

    expect(script).toContain("set containerRef to container of n");
    expect(script).toContain("name of containerRef");
    expect(script).not.toContain("name of container of n");
  });
});

describe("createNoteScript", () => {
  // createNoteScript takes only html + folder: the title never reaches
  // Notes.app as a separate value, only embedded in the html via the <h1>
  // buildCreateNoteHtml already produces.
  it("creates in the default account's default folder when no folder is given", () => {
    const script = createNoteScript("<h1>Title</h1><div>Body</div>", undefined);

    expect(script).toContain("default folder of (default account)");
    expect(script).toContain("make new note");
  });

  it("searches every account for a folder by name when given", () => {
    const script = createNoteScript("<h1>Title</h1><div>Body</div>", "Work");

    expect(script).toContain('name is "Work"');
    expect(script).toContain("repeat with acct in accounts");
  });

  it("strips a title's raw field-separator byte from the generated script", () => {
    // A title containing a raw FIELD_SEP byte must never reach the script:
    // it would later corrupt record alignment in parse.ts once stored and
    // re-listed. buildCreateNoteHtml embeds the title as-is; the stripping
    // happens at the escape.ts boundary when createNoteScript quotes html.
    const html = buildCreateNoteHtml(`Title${RAW_FIELD_SEP}here`, "body");

    const script = createNoteScript(html, undefined);

    expect(script).not.toContain(RAW_FIELD_SEP);
  });

  it("resolves the new note's container into a variable before reading its name", () => {
    // Same failure as getNoteScript: `name of container of newNote` raised
    // "Can't make name of «class cntr» of «class note» ... into type Unicode
    // text" (-1700) on a real create. The note was created but the reply
    // failed, so the tool reported an error for a successful write.
    const script = createNoteScript("<h1>Title</h1><div>Body</div>", undefined);

    expect(script).toContain("set containerRef to container of newNote");
    expect(script).toContain("name of containerRef");
    expect(script).not.toContain("name of container of newNote");
  });
});

describe("appendToNoteScript", () => {
  it("targets the note by id, refuses locked notes, and appends via &", () => {
    const script = appendToNoteScript("x-coredata://abc/ICNote/p1", "<div>more</div>");

    expect(script).toContain('note id "x-coredata://abc/ICNote/p1"');
    expect(script).toContain(LOCKED_SENTINEL);
    expect(script).toContain('(body of n) & "<div>more</div>"');
  });
});

describe("deleteNoteScript", () => {
  it("targets the note by id and returns a locked sentinel for protected notes", () => {
    const script = deleteNoteScript("x-coredata://abc/ICNote/p1");

    expect(script).toContain('note id "x-coredata://abc/ICNote/p1"');
    expect(script).toContain(LOCKED_SENTINEL);
    expect(script).toContain("password protected");
  });

  it("resolves the container into a variable before reading its name", () => {
    // Same failure mode as getNoteScript/createNoteScript: `name of
    // container of n` fails on some real notes with a generic `item`-class
    // reference. Assigning it to a variable first forces a concrete
    // reference whose `name` resolves reliably.
    const script = deleteNoteScript("x-coredata://abc/ICNote/p1");

    expect(script).toContain("set containerRef to container of n");
    expect(script).toContain("name of containerRef");
    expect(script).not.toContain("name of container of n");
  });

  it("captures id, name, and folder before deleting, so the return value survives the delete", () => {
    const script = deleteNoteScript("x-coredata://abc/ICNote/p1");
    const captureIndex = script.indexOf("set noteName to name of n");
    const deleteIndex = script.indexOf("delete n");

    expect(captureIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(-1);
    expect(captureIndex).toBeLessThan(deleteIndex);
  });
});

describe("updateNoteScript", () => {
  it("targets the note by id and returns a locked sentinel for protected notes", () => {
    const script = updateNoteScript("x-coredata://abc/ICNote/p1", "<h1>Title</h1><div>Body</div>");

    expect(script).toContain('note id "x-coredata://abc/ICNote/p1"');
    expect(script).toContain(LOCKED_SENTINEL);
    expect(script).toContain("password protected");
  });

  it("replaces the body with the given html, instead of appending to it", () => {
    const script = updateNoteScript("id-1", "<h1>Title</h1><div>Body</div>");

    expect(script).toContain('set body of n to "<h1>Title</h1><div>Body</div>"');
    expect(script).not.toContain("(body of n) &");
  });
});

describe("body replacement is exclusive to updateNoteScript", () => {
  it("is the only script builder that produces a literal `set body of n to \"` (a body " +
    "replacement, not an append via `(body of n) & ...`)", () => {
    const REPLACE_BODY_PATTERN = 'set body of n to "';
    const scripts: Record<string, string> = {
      listFoldersScript: listFoldersScript(),
      listNotesScript: listNotesScript(undefined),
      searchNotesScript: searchNotesScript("q"),
      findNotesByTitleScript: findNotesByTitleScript("t"),
      getNoteScript: getNoteScript("id-1"),
      createNoteScript: createNoteScript("<h1>T</h1>", undefined),
      appendToNoteScript: appendToNoteScript("id-1", "<div>x</div>"),
      deleteNoteScript: deleteNoteScript("id-1"),
      updateNoteScript: updateNoteScript("id-1", "<h1>T</h1><div>x</div>"),
      createFolderScript: createFolderScript("Recipes", undefined),
    };

    const producers = Object.entries(scripts)
      .filter(([, script]) => script.includes(REPLACE_BODY_PATTERN))
      .map(([name]) => name);

    expect(producers).toEqual(["updateNoteScript"]);
  });
});

describe("createFolderScript", () => {
  it("uses the default account when no account is given", () => {
    const script = createFolderScript("Recipes", undefined);

    expect(script).toContain("set acct to default account");
    expect(script).not.toContain("exists account");
  });

  it("targets an explicit account by name, checking it exists first", () => {
    const script = createFolderScript("Recipes", "Work");

    expect(script).toContain('exists account "Work"');
    expect(script).toContain('set acct to account "Work"');
  });

  it("returns the NO_ACCOUNT sentinel when the named account doesn't exist", () => {
    const script = createFolderScript("Recipes", "Work");

    expect(script).toContain(NO_ACCOUNT_SENTINEL);
    expect(script).toContain("if not (exists account");
  });

  it("returns the DUPLICATE sentinel with the existing folder's id when the folder already exists", () => {
    const script = createFolderScript("Recipes", undefined);

    expect(script).toContain("exists folder \"Recipes\" of acct");
    expect(script).toContain(DUPLICATE_SENTINEL);
    expect(script).toContain('(id of folder "Recipes" of acct)');
  });

  it("creates the folder in the resolved account and returns id/name/account", () => {
    const script = createFolderScript("Recipes", undefined);

    expect(script).toContain("tell acct to set f to make new folder with properties {name:\"Recipes\"}");
    expect(script).toContain("(id of f)");
    expect(script).toContain("(name of f)");
    expect(script).toContain("(name of acct)");
  });

  it("escapes double quotes in the folder name and account name", () => {
    const script = createFolderScript('Say "hi"', 'My "Work"');

    expect(script).toContain('\\"hi\\"');
    expect(script).toContain('\\"Work\\"');
  });

  it("never contains delete or rename — this tool only creates folders", () => {
    const script = createFolderScript("Recipes", "Work");

    expect(script.toLowerCase()).not.toContain("delete");
    expect(script.toLowerCase()).not.toContain("rename");
  });
});
