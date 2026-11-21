// Reader for the 5etools dataset (RULEPACK_DATASET points at its data/ folder).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { plainText } from "./text.mjs";
import { editionOf } from "./edition.mjs";

// `year` is the book's year from docs/books.json, when the caller knows it.
export function readSpells(datasetDir, bookCode, { year } = {}) {
  const file = join(datasetDir, "spells", `spells-${bookCode.toLowerCase()}.json`);
  const spells = JSON.parse(readFileSync(file, "utf8")).spell ?? [];
  const edition = editionOf(bookCode, { year, flagged: spells.some((s) => s.srd52 || s.basicRules2024) });
  return spells.map((s) => ({
    name: s.name,
    book: bookCode,
    page: s.page,
    edition,
    srd: Boolean(s.srd52 || s.srd),
    level: s.level,
    school: s.school,
    text: plainText(s.entries),
  }));
}
