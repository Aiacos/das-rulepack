// Reader for the 5etools dataset (RULEPACK_DATASET points at its data/ folder), one reader for every kind of entry.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { plainText } from "./text.mjs";
import { editionOf } from "./edition.mjs";
import { KIND_TABLE } from "./kinds.mjs";

const isNode = (n) => n !== null && typeof n === "object";
// A node that only points at another record (refClassFeature, refSubclassFeature, refOptionalfeature, refFeat): the
// referenced entry is a record of its own, so its text is never repeated in the one that points at it.
const isRef = (n) => isNode(n) && typeof n.type === "string" && n.type.startsWith("ref");

function withoutRefs(node) {
  if (Array.isArray(node)) return node.filter((n) => !isRef(n)).map(withoutRefs);
  if (!isNode(node)) return node;
  const out = { ...node };
  for (const key of ["entry", "entries", "items"]) if (key in out) out[key] = withoutRefs(out[key]);
  return out;
}

const textOf = (entries) => plainText(withoutRefs(entries));
const sameBook = (entry, book) => String(entry.source ?? book).toUpperCase() === book.toUpperCase();
const isFlagged = (e) => Boolean(e.srd52 || e.basicRules2024);

function rawEntriesOf(datasetDir, book, kind) {
  const row = KIND_TABLE[kind];
  const raw = [];
  for (const rel of row.files(book, datasetDir)) {
    const file = join(datasetDir, rel);
    if (!existsSync(file)) continue;
    raw.push(...row.list(JSON.parse(readFileSync(file, "utf8"))).filter((e) => sameBook(e, book)));
  }
  return raw;
}

// What every record of a kind shares: name, kind, book, page, edition, srd flag; then what the kind adds.
function base(e, name, kind, book, edition) {
  return {
    name, kind, book, page: e.page, edition, srd: Boolean(e.srd52 || e.srd),
    ...(e._copy?.name ? { copyOf: String(e._copy.name) } : {}),
  };
}

function readFeature(e, book, edition) {
  const owner = e.featureOf === "subclass" ? `${e.className}/${e.subclassShortName}` : e.className;
  return [{ ...base(e, e.name, "feature", book, edition), owner, level: e.level, text: textOf(e.entries) }];
}

// A species is its unnamed remainder; each named sub-entry of its `entries` is a trait with its own text.
function readSpecies(e, book, edition) {
  const name = e.speciesOf === "subrace" ? subraceName(e) : e.name;
  if (!name) return [];
  const entries = Array.isArray(e.entries) ? e.entries : [];
  const named = (n) => isNode(n) && !Array.isArray(n) && typeof n.name === "string" && !isRef(n);
  const species = { ...base(e, name, "species", book, edition), text: textOf(entries.filter((n) => !named(n))) };
  const traits = entries.filter(named).map((t) => ({
    ...base(e, t.name, "species", book, edition), owner: name, text: textOf(t.entries ?? t.entry),
  }));
  return [species, ...traits];
}

// "Race (Subrace)" when the subrace says which race it belongs to; a subrace without a name is not an entry.
function subraceName(e) {
  const race = e.raceName ?? e._copy?.raceName;
  if (!e.name) return null;
  return race ? `${race} (${e.name})` : e.name;
}

function readOne(kind, e, book, edition) {
  if (kind === "feature") return readFeature(e, book, edition);
  if (kind === "species") return readSpecies(e, book, edition);
  const entry = { ...base(e, e.name, kind, book, edition), text: textOf(e.entries) };
  if (kind === "spell") Object.assign(entry, { level: e.level, school: e.school });
  if (kind === "item" && e.rarity !== undefined) entry.rarity = e.rarity;
  return [entry];
}

/**
 * Every entry of `bookCode` for one kind: `[{ name, kind, book, page, edition, srd, text, owner?, level?, rarity?, school?,
 * copyOf? }]`. A file the dataset does not have contributes nothing. Entries of other books in a shared file are left out.
 * `year` is the book's year from docs/books.json, when the caller knows it.
 */
export function readEntries(datasetDir, bookCode, kind, { year } = {}) {
  if (kind === "monster") throw new Error("Kind \"monster\": its reader is not built yet");
  if (!Object.hasOwn(KIND_TABLE, kind)) throw new Error(`Kind ${JSON.stringify(kind)} cannot be read from the dataset`);
  const raw = rawEntriesOf(datasetDir, bookCode, kind);
  const edition = editionOf(bookCode, { year, flagged: raw.some(isFlagged) });
  return raw.flatMap((e) => readOne(kind, e, bookCode, edition));
}

// Kept as it was: a missing spell file is an error (ENOENT), not an empty book.
export function readSpells(datasetDir, bookCode, { year } = {}) {
  readFileSync(join(datasetDir, KIND_TABLE.spell.files(bookCode)[0]), "utf8");
  return readEntries(datasetDir, bookCode, "spell", { year }).map(({ kind, ...spell }) => spell);
}
