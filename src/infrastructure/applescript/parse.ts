/**
 * Pure parsers from delimited osascript output to plain data objects.
 * Mirror image of scripts.ts: these functions never touch the network,
 * a process, or the filesystem.
 */
import { FIELD_SEP, RECORD_SEP } from "./delimiters.js";
import { LOCKED_SENTINEL } from "./scripts.js";

/**
 * Parses a locale-independent "Y-M-D-H-m-s" date string into an ISO string.
 *
 * Falls back to the Unix epoch instead of throwing when `raw` is missing or
 * not a valid date-parts string. This happens for legacy records whose
 * fields got shifted by a stray delimiter byte in older, uncontrollable data
 * (see the "legacy note" test in parse.test.ts) — alignment for those
 * records is best-effort, but parsing must never crash the whole
 * list/search call over one bad note.
 */
export function parseDateParts(raw: string | undefined): string {
  const [y, mo, d, h, mi, s] = (raw ?? "").split("-").map(Number);
  const date = new Date(y, (mo ?? 1) - 1, d, h, mi, s);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function splitRecords(raw: string): string[] {
  if (raw.trim().length === 0) return [];
  // Every script appends RECORD_SEP after each record, including the last
  // one, so real output always ends with a dangling separator that would
  // otherwise split into one trailing empty-string record.
  return raw.split(RECORD_SEP).filter((record) => record.length > 0);
}

export interface ParsedFolder {
  id: string;
  name: string;
  account: string;
}

export function parseFolderRecords(raw: string): ParsedFolder[] {
  return splitRecords(raw).map((record) => {
    const [id, name, account] = record.split(FIELD_SEP);
    return { id, name, account };
  });
}

export interface ParsedNoteSummary {
  id: string;
  title: string;
  folder: string;
  modifiedAt: string;
}

export function parseNoteSummaryRecords(raw: string): ParsedNoteSummary[] {
  return splitRecords(raw).map((record) => {
    const [id, title, folder, modified] = record.split(FIELD_SEP);
    return { id, title, folder, modifiedAt: parseDateParts(modified) };
  });
}

export type ParsedGetNoteResult =
  | { locked: true; id: string }
  | {
      locked: false;
      id: string;
      title: string;
      folder: string;
      createdAt: string;
      modifiedAt: string;
      body: string;
    };

export function parseGetNoteResult(raw: string): ParsedGetNoteResult {
  const parts = raw.split(FIELD_SEP);
  if (parts[0] === LOCKED_SENTINEL) {
    return { locked: true, id: parts[1] };
  }
  const [id, title, folder, created, modified, ...bodyParts] = parts;
  return {
    locked: false,
    id,
    title,
    folder,
    createdAt: parseDateParts(created),
    modifiedAt: parseDateParts(modified),
    // Body is the last field; rejoin in the extremely unlikely case it
    // contained the field separator itself.
    body: bodyParts.join(FIELD_SEP),
  };
}

export interface ParsedCreateResult {
  id: string;
  title: string;
  folder: string;
}

const NOTE_ID_PREFIX = "note id ";

export function parseCreateResult(raw: string): ParsedCreateResult {
  const [rawId, title, folder] = raw.split(FIELD_SEP);
  const id = rawId.startsWith(NOTE_ID_PREFIX) ? rawId.slice(NOTE_ID_PREFIX.length) : rawId;
  return { id, title, folder };
}

export type ParsedAppendResult =
  | { locked: true; id: string }
  | { locked: false; id: string; title: string };

export function parseAppendResult(raw: string): ParsedAppendResult {
  const parts = raw.split(FIELD_SEP);
  if (parts[0] === LOCKED_SENTINEL) {
    return { locked: true, id: parts[1] };
  }
  const [id, title] = parts;
  return { locked: false, id, title };
}
