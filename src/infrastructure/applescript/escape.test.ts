import { describe, expect, it } from "vitest";
import { FIELD_SEP, RECORD_SEP } from "./delimiters.js";
import { escapeAppleScriptString, escapeHtml } from "./escape.js";

describe("escapeAppleScriptString", () => {
  it("strips the field separator control character (\\u001f)", () => {
    // A raw FIELD_SEP byte in user content would otherwise corrupt record
    // alignment in parse.ts once the note is stored and later re-listed.
    expect(escapeAppleScriptString(`before${FIELD_SEP}after`)).toBe("beforeafter");
  });

  it("strips the record separator control character (\\u001e)", () => {
    expect(escapeAppleScriptString(`before${RECORD_SEP}after`)).toBe("beforeafter");
  });

  it("strips both delimiters before escaping backslashes and quotes", () => {
    expect(escapeAppleScriptString(`a${FIELD_SEP}"b${RECORD_SEP}\\c`)).toBe('a\\"b\\\\c');
  });

  it("escapes backslashes before quotes so escaping is not double-applied", () => {
    // A literal backslash-quote in input must become \\\" (escaped backslash,
    // then escaped quote) — never \\" (which AppleScript reads as an escaped
    // backslash followed by an unescaped, string-terminating quote).
    expect(escapeAppleScriptString('\\"')).toBe('\\\\\\"');
  });

  it("escapes double quotes", () => {
    expect(escapeAppleScriptString('Say "hello"')).toBe('Say \\"hello\\"');
  });

  it("escapes backslashes", () => {
    expect(escapeAppleScriptString("C:\\Users\\me")).toBe("C:\\\\Users\\\\me");
  });

  it("leaves newlines untouched (caller decides how to represent them)", () => {
    expect(escapeAppleScriptString("line1\nline2")).toBe("line1\nline2");
  });

  it("passes unicode text through unchanged", () => {
    expect(escapeAppleScriptString("café 日本語 emoji 🎉")).toBe("café 日本語 emoji 🎉");
  });

  it("returns an empty string for empty input", () => {
    expect(escapeAppleScriptString("")).toBe("");
  });
});

describe("escapeHtml", () => {
  it("escapes ampersands, less-than, and greater-than", () => {
    expect(escapeHtml("A & B < C > D")).toBe("A &amp; B &lt; C &gt; D");
  });

  it("escapes ampersand before other entities so escaping is not double-applied", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves plain text unchanged", () => {
    expect(escapeHtml("plain text")).toBe("plain text");
  });
});
