import TurndownService from "turndown";

const turndownService = new TurndownService({ headingStyle: "atx" });

function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Converts a Notes.app HTML body into Markdown. */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  return tidy(turndownService.turndown(html));
}

const BLOCK_OPEN_TAGS = /<(?:div|p|li|h[1-6])(?:\s[^>]*)?>/gi;
const BLOCK_CLOSE_TAGS = /<\/(?:div|p|li|h[1-6])>/gi;

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (match) => HTML_ENTITIES[match] ?? match);
}

/** Converts a Notes.app HTML body into plain text, one line per block element. */
export function htmlToPlaintext(html: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(BLOCK_OPEN_TAGS, "\n")
    .replace(BLOCK_CLOSE_TAGS, "");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  const decoded = decodeEntities(stripped);
  return decoded
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, all) => line.length > 0 || all[index - 1] !== "")
    .join("\n")
    .trim();
}
