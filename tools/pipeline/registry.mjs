// Registry records, their fingerprints and derived state, and their on-disk form (one JSON file per book).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VERDICTS, STATES, ORIGINS, MATCHES, KINDS, validateRecord } from "./schema.mjs";

export { VERDICTS, STATES, ORIGINS, MATCHES, KINDS, validateRecord };

// Accents are dropped before slugging (NFD, then the combining marks removed): "Flèche" is "fleche", not "fl-che".
export const slug = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/['’]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Groups `list` by `keyOf(item)` into a Map of arrays, in first-seen order (Map.groupBy needs Node 21; the pack runs on 20). */
export function groupBy(list, keyOf) {
  return list.reduce((groups, item) => {
    const key = keyOf(item);
    if (groups.has(key)) groups.get(key).push(item);
    else groups.set(key, [item]);
    return groups;
  }, new Map());
}

// `owner` ("Class" or "Class/Subclass": each part is slugged) is part of the key of features, species (traits) and monsters;
// `level` is part of the key of features only (a spell's level or an item's rarity never is). Both come between the kind
// and the name, joined by "/". A name or an owner part that slugs to nothing cannot make a key.
const OWNED_KINDS = ["feature", "species", "monster"];
export function keyOf({ book, kind, name, creature, owner, level }) {
  const head = [book.toLowerCase(), slug(kind), ...(creature ? [slug(creature)] : [])];
  const ownerParts = owner && OWNED_KINDS.includes(kind) ? String(owner).split("/").map(slug) : [];
  const levelParts = kind === "feature" && level != null ? [String(level)] : [];
  const tail = slug(name);
  if (!tail) throw new Error(`keyOf: the name ${JSON.stringify(name)} has no letters or digits`);
  if (ownerParts.some((p) => !p)) throw new Error(`keyOf: the owner ${JSON.stringify(owner)} has an empty part`);
  const scoped = [...(ownerParts.length ? [ownerParts.join("/")] : []), ...levelParts, tail];
  return `${head.join(":")}:${scoped.join("/")}`;
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const ruleFingerprint = (rule) => createHash("sha256").update(canonical(rule)).digest("hex");

// What the generated module emits for a legacy rule, besides its evidence-derived parts: legacy standing hangs on all of it.
const LEGACY_FIELDS = ["identifier", "name", "book", "page", "kind", "verdict", "legacyStatus", "alsoIn", "rule"];
/** The fingerprint legacy.json stores for a legacy record: a canonical hash of everything its module entry is made of. */
export const legacyFingerprint = (record) =>
  ruleFingerprint(Object.fromEntries(LEGACY_FIELDS.map((f) => [f, record?.[f]])));

const REQUIRED_GATES = ["schema", "validator", "ids", "fixes", "text"];

// The state is always derived from the evidence, never read from a stored field. `core` is accepted for the callers that
// know which engine they gate against; the gates carry their own fingerprint of the rule, which is what staleness hangs on.
export function stateOf(record, { core } = {}) {
  if (!record.verdict) return "inventoried";
  if (!record.rule) return "triaged";
  const gates = record.evidence?.gates;
  const passed = Array.isArray(gates?.passed) ? gates.passed : [];
  if (gates?.rule !== ruleFingerprint(record.rule) || !REQUIRED_GATES.every((g) => passed.includes(g))) return "drafted";
  if (!record.evidence.reviewed?.agrees) return "gated";
  return isPlayed(record.evidence.played) ? "played" : "reviewed";
}

// A play counts only with what it was played on: a hand-typed `played: {}` or `played: true` does not.
const PLAYED_FIELDS = ["scenario", "core", "world", "at"];
export const isPlayed = (played) =>
  played !== null && typeof played === "object" && PLAYED_FIELDS.every((f) => typeof played[f] === "string" && played[f] !== "");

/**
 * legacy.json: `{ "<record key>": "<legacyFingerprint of the record at migration>" }`, as a Map. A missing file is an empty Map.
 * Throws on a file that is not such an object.
 */
export function loadLegacy(dir) {
  const file = join(dir, "legacy.json");
  if (!existsSync(file)) return new Map();
  let map;
  try { map = JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new Error(`${file}: ${e.message}`); }
  const valid = map !== null && typeof map === "object" && !Array.isArray(map)
    && Object.values(map).every((v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v));
  if (!valid) throw new Error(`${file}: must be an object of record key to the 64-hex fingerprint of the record at migration`);
  return new Map(Object.entries(map));
}

/**
 * Why a record that says `legacy: true` has no legacy standing, or null when it has it (or does not claim it). Standing needs
 * the key in legacy.json (`legacy`, a Map) and, unchanged since migration, everything the generated module emits for the
 * record: its rule, identifier, name, book, page, kind, verdict, legacyStatus and alsoIn (same legacyFingerprint).
 */
export function legacyProblem(record, legacy) {
  if (record?.legacy !== true) return null;
  const stored = legacy?.get(record.key);
  if (stored === undefined) return `legacy: ${record.key} is not in legacy.json`;
  if (stored !== legacyFingerprint(record)) return `legacy: ${record.key} changed since migration`;
  return null;
}
export const hasLegacyStanding = (record, legacy) => record?.legacy === true && legacyProblem(record, legacy) === null;

const fileOf = (dir, code) => join(dir, `${code.toLowerCase()}.json`);

export function loadBook(dir, code) {
  const { book, note, records } = JSON.parse(readFileSync(fileOf(dir, code), "utf8"));
  return { book, ...(note === undefined ? {} : { note }), records: records.map(({ state, ...record }) => record) };
}

// legacy.json and queue.json live beside the books in the registry folder, so no book may take those names.
export const RESERVED_BOOKS = Object.freeze(["legacy", "queue"]);
export const isReservedBook = (code) => RESERVED_BOOKS.includes(String(code).toLowerCase());

// A book code: an upper-case letter, then 1 to 9 upper-case letters or digits. Its lower-case form names the file, and
// generate.mjs also imports the book under it (so it must not be a reserved word there).
export const BOOK_CODE = /^[A-Z][A-Z0-9]{1,9}$/;

// `note` is the book-level comment (the header of the generated module); it is written only when there is one.
export function saveBook(dir, { book, note, records }) {
  if (isReservedBook(book)) throw new Error(`"${book}" is reserved: registry/${String(book).toLowerCase()}.json is not a book`);
  if (typeof book !== "string" || !BOOK_CODE.test(book)) {
    throw new Error(`book code ${JSON.stringify(book)} must match ${BOOK_CODE}`);
  }
  const keys = new Set();
  for (const r of records) {
    const errors = validateRecord(r);
    if (errors.length) throw new Error(`${r?.key ?? "record"}: ${errors.join("; ")}`);
    if (r.book !== book) throw new Error(`${r.key}: book ${JSON.stringify(r.book)} is not the book of the file, ${book}`);
    if (keys.has(r.key)) throw new Error(`${r.key}: two records share this key`);
    keys.add(r.key);
  }
  const sorted = [...records].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const withState = sorted.map(({ state, ...r }) => ({ ...r, state: stateOf(r) }));
  const out = { book, ...(note === undefined ? {} : { note }), records: withState };
  mkdirSync(dir, { recursive: true });
  writeFileSync(fileOf(dir, book), `${JSON.stringify(out, null, 2)}\n`);
}
