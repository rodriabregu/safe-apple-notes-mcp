import { describe, expect, it } from "vitest";
import { htmlToMarkdown, htmlToPlaintext } from "./htmlToMarkdown.js";

describe("htmlToMarkdown", () => {
  it("converts a heading and div paragraphs to markdown", () => {
    const markdown = htmlToMarkdown("<h1>Groceries</h1><div>Eggs</div><div>Milk</div>");

    expect(markdown).toContain("# Groceries");
    expect(markdown).toContain("Eggs");
    expect(markdown).toContain("Milk");
  });

  it("converts bold and italic formatting", () => {
    const markdown = htmlToMarkdown("<div><b>bold</b> and <i>italic</i></div>");

    expect(markdown).toContain("**bold**");
    expect(markdown).toContain("_italic_");
  });

  it("has no leading or trailing whitespace", () => {
    const markdown = htmlToMarkdown("<div>Hello</div>");

    expect(markdown).toBe(markdown.trim());
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToMarkdown("")).toBe("");
  });

  it("collapses runs of empty divs into at most one blank line", () => {
    const markdown = htmlToMarkdown("<div>First</div><div><br></div><div><br></div><div>Third</div>");

    expect(markdown).not.toMatch(/\n{3,}/);
  });
});

describe("htmlToPlaintext", () => {
  it("strips tags and turns block elements into line breaks", () => {
    const text = htmlToPlaintext("<h1>Groceries</h1><div>Eggs</div><div>Milk</div>");

    expect(text).toBe("Groceries\nEggs\nMilk");
  });

  it("decodes common HTML entities", () => {
    const text = htmlToPlaintext("<div>Tom &amp; Jerry &lt;3&gt; &quot;fun&quot;</div>");

    expect(text).toBe('Tom & Jerry <3> "fun"');
  });

  it("turns <br> into a newline", () => {
    const text = htmlToPlaintext("<div>Line1<br>Line2</div>");

    expect(text).toBe("Line1\nLine2");
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToPlaintext("")).toBe("");
  });
});
