// Registry records, their fingerprints and derived state, and their on-disk form (one JSON file per book).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VERDICTS, STATES, ORIGINS, MATCHES, KINDS, isReaderHandle, validateRecord } from "./schema.mjs";
import { assertProblems, normaliseAssert } from "./assert.mjs";

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
// `level` is part of the key of features only (a spell's level or an item's rarity never is); `section` (trait, action...)
// that of monsters, after the creature. They come between the kind and the name, joined by "/". `occurrence` (2, 3, ...)
// numbers a name repeated within one creature and section: "name#2". A name or an owner part that slugs to nothing cannot
// make a key.
const OWNED_KINDS = ["feature", "species", "monster"];
export function keyOf({ book, kind, name, creature, owner, section, level, occurrence }) {
  const head = [book.toLowerCase(), slug(kind), ...(creature ? [slug(creature)] : [])];
  // A creature's name is one part, whatever characters it holds; a class/subclass owner is split at "/".
  const ownerParts = !owner || !OWNED_KINDS.includes(kind) ? []
    : kind === "monster" ? [slug(owner)] : String(owner).split("/").map(slug);
  if (kind === "monster" && !section) throw new Error("keyOf: a monster feature needs its section");
  const levelParts = kind === "feature" && level != null ? [String(level)] : [];
  const sectionParts = kind === "monster" && section ? [slug(section)] : [];
  const tail = slug(name) && Number.isInteger(occurrence) && occurrence > 1 ? `${slug(name)}#${occurrence}` : slug(name);
  if (!tail) throw new Error(`keyOf: the name ${JSON.stringify(name)} has no letters or digits`);
  if (ownerParts.some((p) => !p)) throw new Error(`keyOf: the owner ${JSON.stringify(owner)} has an empty part`);
  const scoped = [...(ownerParts.length ? [ownerParts.join("/")] : []), ...sectionParts, ...levelParts, tail];
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

// What a gated record emits besides its rule (generate.mjs ruleFromRecord, and its `sources` in SOURCES): the gate evidence
// stands on all of it, so that an identifier or a source edited after the gates makes the record `drafted` again. `note` and
// `order` (a comment, a position in the module) do not change what is registered.
const EMITTED_FIELDS = ["identifier", "name", "book", "page", "kind", "alsoIn", "sources"];
/**
 * The fingerprint `evidence.gates.emits` stores: a canonical hash of the record fields its emitted rule is made of, and of
 * `evidence.person` (the signature that lets the gates pass what a drafter may not write: adding or changing it after the
 * gates makes their evidence stale), and of the draft's `evidence.drafted.person` / `because` stamp (Ruling R15: removing it
 * makes the evidence stale too), and of `evidence.reviewed.because` and `evidence.played.because` (the lines of a person's
 * review-accept and hand play, written after the gates: the text gate must read them before the evidence stands again,
 * under --ci too). Absent, they leave the hash as it was (`canonical` drops undefined fields). The rest of `evidence.played`
 * (written from the runner's log) is held by the schema to ids, a version, a world handle and fingerprints: no prose can
 * sit there, so it does not touch this fingerprint and a play from the log keeps the gates standing.
 */
export const emittedFingerprint = (record) => ruleFingerprint({
  ...Object.fromEntries(EMITTED_FIELDS.map((f) => [f, record?.[f]])), person: record?.evidence?.person,
  forPerson: forPersonOf(record?.evidence?.drafted), reviewedBecause: record?.evidence?.reviewed?.because,
  playedBecause: record?.evidence?.played?.because
});
// The draft's "a person reads it at review" stamp (Ruling R15; schema.mjs DRAFTED_FOR_PERSON), or undefined when it has none.
const forPersonOf = (d) =>
  (d !== null && typeof d === "object" && (d.person !== undefined || d.because !== undefined)
    ? { person: d.person, because: d.because } : undefined);

/**
 * The items the gates check, as `evidence.gates.items` records them: per origin the rule names, the data fingerprint of the
 * record's matched item of that origin (an origin whose item has no data, a legacy record's, is left out).
 */
export function gatedItems(record) {
  const out = {};
  const origins = Array.isArray(record?.rule?.origins) ? record.rule.origins : [];
  for (const origin of origins) {
    const item = (record.items ?? [])
      .find((i) => i?.origin === origin && i.match === "matched" && typeof i.data?.sha256 === "string");
    if (item) out[origin] = item.data.sha256;
  }
  return out;
}

/**
 * True when gate evidence stands for the record as it is: the fingerprint of its rule and of what it emits besides (`emits`,
 * emittedFingerprint), and for every origin the rule names the
 * same matched item (by data fingerprint) as when the gates ran. Moving an item to another document, or changing its data,
 * makes the evidence stale whoever did it.
 */
export function evidenceIsCurrent(record, gates) {
  if (!gates || gates.rule !== ruleFingerprint(record.rule) || gates.emits !== emittedFingerprint(record)) return false;
  const recorded = gates.items ?? {};
  if (recorded === null || typeof recorded !== "object" || Array.isArray(recorded)) return false;
  return canonical(recorded) === canonical(gatedItems(record));
}

// Evidence about the rule (a review, a play) counts only while its `rule` is the fingerprint of the rule as it is: editing the
// rule makes it stale. A legacy record keeps today's behaviour: a review or a play written before the stamp existed (no `rule`)
// still counts; one that carries a stamp is held to it. `record.legacy` is the record's own flag (stateOf has no legacy.json):
// a forged flag earns nothing, since the legacy gate fails it and generate refuses it (legacyProblem).
const aboutThisRule = (record, evidence) =>
  typeof evidence?.rule === "string" ? evidence.rule === ruleFingerprint(record.rule) : record.legacy === true;

// The state is always derived from the evidence, never read from a stored field. `core` is accepted for the callers that
// know which engine they gate against; the gates carry their own fingerprint of the rule, which is what staleness hangs on.
export function stateOf(record, { core } = {}) {
  if (!record.verdict) return "inventoried";
  if (!record.rule) return "triaged";
  const gates = record.evidence?.gates;
  const passed = Array.isArray(gates?.passed) ? gates.passed : [];
  if (!evidenceIsCurrent(record, gates) || !REQUIRED_GATES.every((g) => passed.includes(g))) return "drafted";
  const { reviewed, played } = record.evidence;
  if (reviewed?.agrees !== true || !aboutThisRule(record, reviewed)) return "gated";
  return isPlayed(played) && aboutThisRule(record, played) ? "played" : "reviewed";
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
/** The file of a book in the registry folder. */
export const bookFile = fileOf;

export function loadBook(dir, code) {
  const { book, note, records } = JSON.parse(readFileSync(fileOf(dir, code), "utf8"));
  return { book, ...(note === undefined ? {} : { note }), records: records.map(({ state, ...record }) => record) };
}

// The queues a person reads, beside queue.json (Ruling R7): drafts that are not rules (outcome person, code, engine, low
// confidence) and reviews that do not agree. Each is an array of { key, reason, by, why, confidence, draft?, review? }.
export const QUEUE_FILES = Object.freeze({ drafts: "drafts-queue.json", review: "review-queue.json" });
// The files of the registry folder that are not books: every reader of registry/*.json leaves them out.
export const NOT_BOOKS = Object.freeze(["legacy.json", "queue.json", ...Object.values(QUEUE_FILES)]);
// legacy.json and the queues live beside the books in the registry folder, so no book may take those names.
export const RESERVED_BOOKS = Object.freeze(NOT_BOOKS.map((f) => f.slice(0, -5)));
export const isReservedBook = (code) => RESERVED_BOOKS.includes(String(code).toLowerCase());

// A book code: an upper-case letter, then 1 to 9 upper-case letters or digits. Its lower-case form names the file, and
// generate.mjs also imports the book under it (so it must not be a reserved word there).
export const BOOK_CODE = /^[A-Z][A-Z0-9]{1,9}$/;

// Why a book cannot be saved (what `saveBook` checks first), or null.
export function checkBook({ book, records }) {
  if (isReservedBook(book)) return `"${book}" is reserved: registry/${String(book).toLowerCase()}.json is not a book`;
  if (typeof book !== "string" || !BOOK_CODE.test(book)) return `book code ${JSON.stringify(book)} must match ${BOOK_CODE}`;
  const keys = new Set();
  for (const r of records) {
    const errors = validateRecord(r);
    if (errors.length) return `${r?.key ?? "record"}: ${errors.join("; ")}`;
    if (r.book !== book) return `${r.key}: book ${JSON.stringify(r.book)} is not the book of the file, ${book}`;
    if (keys.has(r.key)) return `${r.key}: two records share this key`;
    keys.add(r.key);
  }
  return null;
}

// `note` is the book-level comment (the header of the generated module); it is written only when there is one.
/** The content of a book file (records sorted by key, each with its derived state); throws when checkBook refuses it. */
export function bookText({ book, note, records }) {
  const invalid = checkBook({ book, records });
  if (invalid) throw new Error(invalid);
  const sorted = [...records].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const withState = sorted.map(({ state, ...r }) => ({ ...r, state: stateOf(r) }));
  const out = { book, ...(note === undefined ? {} : { note }), records: withState };
  return `${JSON.stringify(out, null, 2)}\n`;
}

export function saveBook(dir, { book, note, records }) {
  const text = bookText({ book, note, records });
  mkdirSync(dir, { recursive: true });
  writeFileSync(fileOf(dir, book), text);
}

/**
 * Writes several files as one step: every file is first written under a temporary name beside it, then all are renamed over
 * their targets. A write that fails removes the temporary files already written and throws: no target has changed. `write`,
 * `rename` and `remove` are injectable for tests. A rename is atomic per file on one file system; should one fail after
 * others succeeded, the error names what was and was not replaced.
 */
export function writeFilesAtomically(files, { write = writeFileSync, rename = renameSync, remove = rmSync } = {}) {
  const temporary = [];
  try {
    for (const [path, text] of files) {
      const tmp = `${path}.${process.pid}.tmp`;
      temporary.push(tmp);
      write(tmp, text);
    }
  } catch (e) {
    for (const tmp of temporary) { try { remove(tmp, { force: true }); } catch { /* best effort */ } }
    throw e;
  }
  const done = [];
  files.forEach(([path], i) => {
    try { rename(temporary[i], path); done.push(path); } catch (e) {
      const left = files.map(([p]) => p).filter((p) => !done.includes(p));
      for (const tmp of temporary.slice(i)) { try { remove(tmp, { force: true }); } catch { /* best effort */ } }
      throw new Error(`rename failed at ${path}: ${e.message}; replaced: ${done.join(", ") || "nothing"}; not replaced: `
        + left.join(", "));
    }
  });
}

const QUEUE_FIELDS = ["key", "reason", "by", "why", "confidence", "draft", "review"];
// The shape of a record key (keyOf): `<book>:<kind>:<scoped name>`, lower case.
export const RECORD_KEY = /^[a-z][a-z0-9]{1,9}:[a-z]+:[a-z0-9][a-z0-9/#-]*$/;

const HEX = /^[0-9a-f]{64}$/;
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const ASSERT_PART = /^[A-Za-z]{1,24}$/;
// One canonical assertion string (assert.mjs normaliseAssert: sorted `path=value` pairs) read back as an assertion, or null.
export function assertionOfCanonical(canonical) {
  if (typeof canonical !== "string" || !canonical || canonical.length > 400) return null;
  const out = { given: {}, expect: {} };
  for (const pair of canonical.split(";")) {
    const i = pair.indexOf("=");
    const path = i > 0 ? pair.slice(0, i).split(".") : [];
    if (path.length < 2 || !Object.hasOwn(out, path[0]) || !path.every((p) => ASSERT_PART.test(p))) return null;
    let node = out[path[0]];
    for (const p of path.slice(1, -1)) {
      if (!Object.hasOwn(node, p)) node[p] = {};
      node = node[p];
      if (!isPlainObject(node)) return null;
    }
    const raw = pair.slice(i + 1);
    node[path.at(-1)] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  }
  return out;
}
// The problems of a list of canonical assertion strings: each must read back as a valid assertion and canonicalise to itself.
function canonicalListProblems(list, at, vocabulary) {
  if (!Array.isArray(list)) return [`${at}: must be an array of canonical assertions`];
  return list.flatMap((c, i) => {
    const a = assertionOfCanonical(c);
    const ok = a && !assertProblems([a], { vocabulary }).length && normaliseAssert([a])[0] === c;
    return ok ? [] : [`${at}[${i}]: not a canonical assertion of the closed vocabulary`];
  });
}
// What a review-queue entry holds besides its own fields (review.mjs): the draft's and the review's assertions, the
// comparison as canonical strings, the handles and fingerprints. Closed keys; the assertions and their words checked (against
// the engine's enumerations when `vocabulary` is given), so a hand-edited entry cannot hold prose there.
function reviewEntryProblems(entry, vocabulary) {
  const errors = [];
  const part = (name, fields, check) => {
    const v = entry[name];
    if (!isPlainObject(v)) return errors.push(`${name}: must be { ${fields.join(", ")} }`);
    for (const f of Object.keys(v)) if (!fields.includes(f)) errors.push(`${name}.${f}: unknown field`);
    if (typeof v.rule !== "string" || !HEX.test(v.rule)) errors.push(`${name}.rule: must be 64 hex characters`);
    check(v);
  };
  const asserts = (v, at) => errors.push(...assertProblems(v, { vocabulary, at }));
  part("draft", ["by", "person", "rule", "assert", "implied"], (d) => {
    for (const f of ["by", "person"]) if (Object.hasOwn(d, f) && !isReaderHandle(d[f])) errors.push(`draft.${f}: a handle`);
    asserts(d.assert, "draft.assert");
    errors.push(...canonicalListProblems(d.implied, "draft.implied", vocabulary));
  });
  // `baseline` and `detail` (Ruling R24: what the comparison tolerated) are absent from entries queued before it.
  part("review", ["rule", "assert", "agrees", "onlyDraft", "onlyReview", "baseline", "detail"], (r) => {
    asserts(r.assert, "review.assert");
    if (typeof r.agrees !== "boolean") errors.push("review.agrees: must be a boolean");
    for (const f of ["onlyDraft", "onlyReview"]) errors.push(...canonicalListProblems(r[f], `review.${f}`, vocabulary));
    if (Object.hasOwn(r, "baseline")) errors.push(...canonicalListProblems(r.baseline, "review.baseline", vocabulary));
    if (Object.hasOwn(r, "detail")) {
      const pair = (p) => isPlainObject(p) && Object.keys(p).length === 2 && Object.hasOwn(p, "draft")
        && Object.hasOwn(p, "review");
      if (!Array.isArray(r.detail) || !r.detail.every(pair)) errors.push("review.detail: must be an array of { draft, review }");
      else {
        r.detail.forEach((p, i) => errors.push(...canonicalListProblems([p.draft, p.review], `review.detail[${i}]`, vocabulary)));
      }
    }
  });
  return errors;
}

/**
 * The problems of one entry of drafts-queue.json or review-queue.json, or []. With `queue: "review"` the entry's `draft` and
 * `review` are held to their shape too (reviewEntryProblems; `vocabulary`: the engine's enumerations, loadCore).
 */
export function validateQueueEntry(entry, { queue, vocabulary } = {}) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return ["entry: must be an object"];
  const errors = [];
  if (typeof entry.key !== "string" || !RECORD_KEY.test(entry.key)) errors.push("key: must be a record key (<book>:<kind>:<name>)");
  for (const f of ["reason", "why"]) {
    if (typeof entry[f] !== "string" || !entry[f]) errors.push(`${f}: must be a non-empty string`);
  }
  if (!isReaderHandle(entry.by)) errors.push("by: must be a reader handle (not \"rule\")");
  const c = entry.confidence;
  if (!(typeof c === "number" && c >= 0 && c <= 1)) errors.push("confidence: must be a number from 0 to 1");
  for (const f of ["draft", "review"]) {
    if (f in entry && (entry[f] === null || typeof entry[f] !== "object" || Array.isArray(entry[f]))) {
      errors.push(`${f}: must be an object`);
    }
  }
  for (const f of Object.keys(entry)) if (!QUEUE_FIELDS.includes(f)) errors.push(`${f}: unknown field`);
  if (queue === "review" && !errors.length) errors.push(...reviewEntryProblems(entry, vocabulary));
  return errors;
}

const TRIAGE_QUEUE_FIELDS = ["key", "verdict", "why", "confidence", "by", "reason", "second", "third"];
const READING_FIELDS = ["verdict", "why", "confidence", "by"];
const isConfidence = (c) => typeof c === "number" && c >= 0 && c <= 1;

// One reading of a queue.json entry: its own, or its `second` / `third`.
function readingProblems(r, at, fields, errors) {
  if (!VERDICTS.includes(r.verdict)) errors.push(`${at}verdict: must be one of ${VERDICTS.join(", ")}`);
  if (typeof r.why !== "string" || !r.why) errors.push(`${at}why: must be a non-empty string`);
  if (!isConfidence(r.confidence)) errors.push(`${at}confidence: must be a number from 0 to 1`);
  if (!isReaderHandle(r.by)) errors.push(`${at}by: must be a reader handle (not "rule")`);
  for (const f of Object.keys(r)) if (!fields.includes(f)) errors.push(`${at}${f}: unknown field`);
}

/** The problems of one entry of registry/queue.json (triage results waiting for a person), or []. */
export function validateTriageQueueEntry(entry) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return ["entry: must be an object"];
  const errors = [];
  if (typeof entry.key !== "string" || !RECORD_KEY.test(entry.key)) errors.push("key: must be a record key (<book>:<kind>:<name>)");
  if (typeof entry.reason !== "string" || !entry.reason) errors.push("reason: must be a non-empty string");
  readingProblems(entry, "", TRIAGE_QUEUE_FIELDS, errors);
  for (const f of ["second", "third"]) {
    if (!(f in entry)) continue;
    const r = entry[f];
    if (r === null || typeof r !== "object" || Array.isArray(r)) errors.push(`${f}: must be { ${READING_FIELDS.join(", ")} }`);
    else readingProblems(r, `${f}.`, READING_FIELDS, errors);
  }
  return errors;
}

const queueFile = (dir, name) => {
  if (!Object.hasOwn(QUEUE_FILES, name)) {
    throw new Error(`unknown queue ${JSON.stringify(name)} (${Object.keys(QUEUE_FILES).join(", ")})`);
  }
  return join(dir, QUEUE_FILES[name]);
};

/**
 * The entries of a queue (`name`: drafts or review); a missing file is an empty queue. Throws, naming the file, on a file
 * that does not parse, is no array, or holds an entry that validateQueueEntry refuses.
 */
export function loadQueue(dir, name, { vocabulary } = {}) {
  const file = queueFile(dir, name);
  if (!existsSync(file)) return [];
  let list;
  try { list = JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new Error(`${file}: ${e.message}`); }
  if (!Array.isArray(list)) throw new Error(`${file}: must be an array of queue entries`);
  list.forEach((e, i) => {
    const errors = validateQueueEntry(e, { queue: name, vocabulary });
    if (errors.length) throw new Error(`${file}: entry ${i}: ${errors.join("; ")}`);
  });
  return list;
}

/** The file of a queue (`name`: drafts or review) in the registry folder. */
export const queuePath = (dir, name) => queueFile(dir, name);

/** The content of a queue file: every entry checked, sorted by key; one key appears once. Throws otherwise. */
export function queueText(name, entries) {
  queueFile("", name);
  const keys = new Set();
  for (const e of entries) {
    const errors = validateQueueEntry(e, { queue: name });
    if (errors.length) throw new Error(`${QUEUE_FILES[name]}: ${e?.key ?? "entry"}: ${errors.join("; ")}`);
    if (keys.has(e.key)) throw new Error(`${QUEUE_FILES[name]}: ${e.key} is listed twice`);
    keys.add(e.key);
  }
  const sorted = [...entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/** Writes a queue, every entry checked, sorted by key; one key appears once. */
export function saveQueue(dir, name, entries) {
  const text = queueText(name, entries);
  mkdirSync(dir, { recursive: true });
  writeFileSync(queueFile(dir, name), text);
}
