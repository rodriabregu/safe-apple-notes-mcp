import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  clampLimit,
  DEFAULT_LIST_NOTES_LIMIT,
  DEFAULT_SEARCH_NOTES_LIMIT,
  getNoteInputSchema,
  MAX_LIST_NOTES_LIMIT,
  MAX_SEARCH_NOTES_LIMIT,
  REQUIRES_USER_INTERACTION_META,
  TOOL_DEFINITIONS,
} from "./toolDefinitions.js";

describe("TOOL_DEFINITIONS", () => {
  it("exposes exactly the eight approved tools and nothing else", () => {
    expect(Object.keys(TOOL_DEFINITIONS).sort()).toEqual(
      [
        "append_to_note",
        "create_note",
        "delete_note",
        "get_note",
        "list_folders",
        "list_notes",
        "search_notes",
        "update_note",
      ].sort()
    );
  });

  it("gives every tool a title and a description", () => {
    for (const def of Object.values(TOOL_DEFINITIONS)) {
      expect(def.title.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });
});

describe("list_notes input schema", () => {
  const schema = z.object(TOOL_DEFINITIONS.list_notes.inputShape);

  it("accepts an empty input", () => {
    expect(schema.parse({}).folder).toBeUndefined();
  });

  it("accepts folder and limit", () => {
    expect(schema.parse({ folder: "Work", limit: 10 })).toEqual({ folder: "Work", limit: 10 });
  });

  it("rejects a non-integer limit", () => {
    expect(() => schema.parse({ limit: 1.5 })).toThrow();
  });
});

describe("search_notes input schema", () => {
  const schema = z.object(TOOL_DEFINITIONS.search_notes.inputShape);

  it("requires a non-empty query", () => {
    expect(() => schema.parse({})).toThrow();
    expect(() => schema.parse({ query: "" })).toThrow();
    expect(schema.parse({ query: "budget" }).query).toBe("budget");
  });
});

describe("get_note input shape", () => {
  const schema = z.object(TOOL_DEFINITIONS.get_note.inputShape);

  it("accepts id alone, defaulting format to undefined (server applies markdown default)", () => {
    const parsed = schema.parse({ id: "abc" });
    expect(parsed.id).toBe("abc");
    expect(parsed.title).toBeUndefined();
    expect(parsed.format).toBeUndefined();
  });

  it("accepts title alone", () => {
    expect(schema.parse({ title: "Groceries" }).title).toBe("Groceries");
  });

  it("only accepts markdown, plaintext, or html for format", () => {
    expect(() => schema.parse({ id: "abc", format: "pdf" })).toThrow();
    expect(schema.parse({ id: "abc", format: "html" }).format).toBe("html");
  });
});

describe("getNoteInputSchema (exactly one of id/title)", () => {
  it("rejects neither id nor title", () => {
    expect(() => getNoteInputSchema.parse({})).toThrow(/exactly one of id or title/i);
  });

  it("rejects both id and title", () => {
    expect(() => getNoteInputSchema.parse({ id: "abc", title: "Groceries" })).toThrow(
      /exactly one of id or title/i
    );
  });

  it("accepts id alone", () => {
    expect(getNoteInputSchema.parse({ id: "abc" })).toEqual({ id: "abc" });
  });

  it("accepts title alone", () => {
    expect(getNoteInputSchema.parse({ title: "Groceries" })).toEqual({ title: "Groceries" });
  });
});

describe("create_note input schema", () => {
  const schema = z.object(TOOL_DEFINITIONS.create_note.inputShape);

  it("requires title and body, folder is optional", () => {
    expect(() => schema.parse({ body: "text" })).toThrow();
    expect(schema.parse({ title: "T", body: "B" }).folder).toBeUndefined();
  });
});

describe("append_to_note input schema", () => {
  const schema = z.object(TOOL_DEFINITIONS.append_to_note.inputShape);

  it("requires id and non-empty text", () => {
    expect(() => schema.parse({ id: "abc", text: "" })).toThrow();
    expect(schema.parse({ id: "abc", text: "more" })).toEqual({ id: "abc", text: "more" });
  });
});

describe("delete_note input schema", () => {
  const schema = z.object(TOOL_DEFINITIONS.delete_note.inputShape);

  it("requires only id", () => {
    expect(() => schema.parse({})).toThrow();
    expect(schema.parse({ id: "abc" })).toEqual({ id: "abc" });
  });

  it("accepts no other fields in its shape", () => {
    expect(Object.keys(TOOL_DEFINITIONS.delete_note.inputShape)).toEqual(["id"]);
  });
});

describe("delete_note annotations", () => {
  it("is destructive, non-idempotent, and requires user interaction", () => {
    expect(TOOL_DEFINITIONS.delete_note.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
    expect(TOOL_DEFINITIONS.delete_note._meta).toEqual({
      [REQUIRES_USER_INTERACTION_META]: true,
    });
  });
});

describe("update_note input schema", () => {
  const schema = z.object(TOOL_DEFINITIONS.update_note.inputShape);

  it("requires id and body, title is optional", () => {
    expect(() => schema.parse({ id: "abc" })).toThrow();
    expect(schema.parse({ id: "abc", body: "text" }).title).toBeUndefined();
  });

  it("accepts an optional title", () => {
    expect(schema.parse({ id: "abc", body: "text", title: "New title" })).toEqual({
      id: "abc",
      body: "text",
      title: "New title",
    });
  });
});

describe("update_note annotations", () => {
  it("is destructive, non-idempotent, and requires user interaction", () => {
    expect(TOOL_DEFINITIONS.update_note.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
    expect(TOOL_DEFINITIONS.update_note._meta).toEqual({
      [REQUIRES_USER_INTERACTION_META]: true,
    });
  });
});

describe("create_note and append_to_note are not annotated destructive", () => {
  it.each(["create_note", "append_to_note"] as const)("%s destructiveHint is false", (name) => {
    expect(TOOL_DEFINITIONS[name].annotations.destructiveHint).toBe(false);
  });
});

describe("clampLimit", () => {
  it("returns the default when limit is undefined", () => {
    expect(clampLimit(undefined, DEFAULT_LIST_NOTES_LIMIT, MAX_LIST_NOTES_LIMIT)).toBe(
      DEFAULT_LIST_NOTES_LIMIT
    );
  });

  it("caps at the maximum", () => {
    expect(clampLimit(9999, DEFAULT_LIST_NOTES_LIMIT, MAX_LIST_NOTES_LIMIT)).toBe(
      MAX_LIST_NOTES_LIMIT
    );
  });

  it("passes through a value within range", () => {
    expect(clampLimit(10, DEFAULT_SEARCH_NOTES_LIMIT, MAX_SEARCH_NOTES_LIMIT)).toBe(10);
  });

  it("floors below 1 to 1", () => {
    expect(clampLimit(0, DEFAULT_SEARCH_NOTES_LIMIT, MAX_SEARCH_NOTES_LIMIT)).toBe(1);
  });
});
