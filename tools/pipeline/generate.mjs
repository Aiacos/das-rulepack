// Registry records -> the Rule objects of the pack, and the generated scripts/rules/books/*.mjs and scripts/rules/index.mjs.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  NOT_BOOKS, hasLegacyStanding, isPlayed, keyOf, legacyProblem, loadBook, loadLegacy, loadQueue, ruleFingerprint, stateOf
} from "./registry.mjs";
import { editionOf } from "./edition.mjs";
import { RULE_VERDICTS, draftedForPersonReasons, isEngineered } from "./schema.mjs";
import { REVIEW_REASONS, queueHolds } from "./review.mjs";
import { QUEUE_THRESHOLD } from "./intake.mjs";
import { sourceProblems } from "./settle.mjs";
import { identifierProblems } from "./identifiers.mjs";
import { isPartial, leftCounts } from "./leaves.mjs";
import { currentReading, deltaEntry } from "./engine-reading.mjs";

// legacy.json and the queues (registry.mjs NOT_BOOKS) sit beside the books and are not books.
export { NOT_BOOKS };
const GENERATED = /^\/\/ Generated (from registry\/|by npm run build:rules)/;

// A shipped rule as a registry record (legacy: it keeps its status until the gates and a review replace it).
export function recordFromRule(rule, order, note, year) {
  const own = { handledIn: rule.handledIn, adds: rule.adds };
  for (const f of ["entry", "code", "origin", "catalog", "inCore"]) if (f in rule) own[f] = structuredClone(rule[f]);
  const record = {
    key: keyOf({ book: rule.book, kind: rule.kind, name: rule.name }),
    identifier: rule.identifier,
    name: rule.name,
    kind: rule.kind,
    book: rule.book,
    page: rule.page,
    edition: editionOf(rule.book, { year }),
    text: null,
    items: [],
    verdict: rule.handledIn === "code" ? "code" : "entry",
    rule: { ...own, origins: ["ddb-importer"] },
    legacy: true,
    legacyStatus: rule.status,
    evidence: {}
  };
  if (rule.alsoIn) record.alsoIn = structuredClone(rule.alsoIn);
  if (order !== undefined) record.order = order;
  if (note) record.note = note;
  return record;
}

const STATUS_OF_STATE = { played: "played", reviewed: "validated", gated: "validated" };

/**
 * Ruling R27: why a rule that passed its gates is HELD (not registered with DAS · Core) until a person settles it, as the
 * closed list docs/RULES.md prints. `queued`: a review-queue entry about the rule as it is whose reason is neither a review
 * reason nor the record's own stamp (a hand edit): it waits for a person all the same.
 */
export const HELD_REASONS = Object.freeze({
  "engine-text": "the engine already reads this feature's text: to be compared first",
  "engine-changes": "changes the engine's reading: a person decides",
  "engine-already": "the engine already does it",
  "engine-rebinding": "its identifier would drop engine behaviour",
  "not-reviewed": "not reviewed yet",
  "review-stale": "its review is about an older rule",
  disagreement: "review disagrees",
  "low-confidence": "reviewer unsure",
  "free-text": "review holds free text",
  unexpressed: "reviewer could not express it",
  queued: "waits for a person",
  "not-played": "engineered (Ruling R43): no recorded play yet",
  "play-stale": "engineered (Ruling R43): its play is about an older rule"
});

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isEmptyList = (v) => Array.isArray(v) && v.length === 0;
// The review queue by record key: a list of entries (review-queue.json, registry.mjs loadQueue) or a Map already made.
const queueMap = (queue) => (queue instanceof Map ? queue : new Map((Array.isArray(queue) ? queue : []).map((e) => [e?.key, e])));

// What the stored comparison of a current queue entry says, as a held reason, or null when the review agreed in full: the
// assertions matched (`agrees: true`, nothing only on one side, the reviewer expressed the entry) at a confidence the review
// ingest takes (QUEUE_THRESHOLD). Any field absent or of another type fails closed (`disagreement`).
function comparisonHeld(entry) {
  const review = isObject(entry.review) ? entry.review : {};
  if (Array.isArray(review.assert) && review.assert.length === 0) return "unexpressed";
  if (!Array.isArray(review.assert) || !Array.isArray(review.onlyDraft) || !Array.isArray(review.onlyReview)) {
    return "disagreement";
  }
  if (!isEmptyList(review.onlyDraft) || !isEmptyList(review.onlyReview)) return "disagreement";
  // Nothing on one side only, yet no agreement: a free text on a side (review.mjs compareAsserts `free`).
  if (review.agrees === false) return "free-text";
  if (review.agrees !== true) return "disagreement";
  const c = entry.confidence;
  return typeof c === "number" && c >= QUEUE_THRESHOLD && c <= 1 ? null : "low-confidence";
}

/**
 * Ruling R27, the one decision of what is registered with the engine. `null` when the record registers nothing whatever its
 * review: no rule, a verdict other than entry or code, `legacy: true` without standing (generate refuses it), or not gated.
 * Otherwise `{ emitted: true, because }` — `legacy` (standing, as before the ruling, whatever its state), `reviewed` (a review
 * about the rule as it is agrees: an agent's, exact or tolerated, or an owner's review-accept), `stamp-agreed` (the record
 * waits in review-queue.json, about the rule as it is, only because of its own stamp, `evidence.drafted.because` with
 * `person: true`, and the stored comparison agrees in full: comparisonHeld) — or `{ emitted: false, because }`, a key of
 * HELD_REASONS: a gated rule never reviewed, queued as disagreement, low-confidence, free-text or unexpressed, or whose queue
 * entry is about an older rule. `queue`: review-queue.json (a list or a Map by key); left out, nothing can be confirmed
 * from it and a stamped rule is held. A monster rule (Rulings R28, R29) is first held by its stored comparison with the
 * engine's reading (`evidence.reading`): `engine-text` (none current), `engine-changes`, `engine-already`, `engine-rebinding`.
 * An engineered rule (Ruling R43) is emitted as `played` only, or held as `not-played` / `play-stale`; reviews are not read.
 */
export function emissionOf(record, { legacy, queue, monsterRules = false } = {}) {
  if (!isObject(record) || !record.rule || !RULE_VERDICTS.includes(record.verdict)) return null;
  if (record.legacy === true) return hasLegacyStanding(record, legacy) ? { emitted: true, because: "legacy" } : null;
  // Rulings R28 and R29: DAS · Core derives entries for monster features from their English text by itself (its "text"
  // layer), and merges a pack rule over that reading key by key (`triggers` replaced whole). A monster rule is registered only
  // through the comparison stored on it (`evidence.reading`, about the rule and the item as they are; written by `npm run
  // gates`): none current holds it ("engine-text"), a key that changes the reading holds it for a person (a superset
  // `triggers` is no change), and nothing left to add holds it as done by the engine. What remains is its delta, then R27.
  // `monsterRules: true` lifts the hold: only the tests of the mechanics pass it.
  if (record.kind === "monster" && monsterRules !== true) {
    const reading = currentReading(record);
    if (!reading) return { emitted: false, because: "engine-text" };
    if (reading.changes.length) return { emitted: false, because: "engine-changes" };
    if (!reading.delta.length) return { emitted: false, because: "engine-already" };
    // Fix round 1: binding the item to the rule's identifier (`sources`) drops the engine's own entry under the item's
    // original identifier and reads its text under the new one: what cannot be carried over holds the rule.
    if ((Array.isArray(reading.dropped) && reading.dropped.length) || reading.code === true) {
      return { emitted: false, because: "engine-rebinding" };
    }
  }
  const state = stateOf(record);
  // Ruling R43: an engineered rule is emitted only through a recorded play about the rule as it is, never on its gates alone
  // nor by any review: `played`, or held as `not-played` (no play) or `play-stale` (a play about an older rule).
  if (isEngineered(record.rule)) {
    if (state === "played") return { emitted: true, because: "played" };
    if (state !== "gated") return null;
    return { emitted: false, because: isPlayed(record.evidence?.played) ? "play-stale" : "not-played" };
  }
  if (state === "reviewed" || state === "played") return { emitted: true, because: "reviewed" };
  if (state !== "gated") return null;
  const held = (because) => ({ emitted: false, because });
  const entry = queueMap(queue).get(record.key);
  if (isObject(entry)) {
    const fingerprint = ruleFingerprint(record.rule);
    if (!queueHolds(entry, record) || entry.draft?.rule !== fingerprint) return held("review-stale");
    if (REVIEW_REASONS.includes(entry.reason)) return held(entry.reason);
    const drafted = record.evidence?.drafted;
    const stamped = draftedForPersonReasons().includes(entry.reason) && isObject(drafted) && drafted.person === true
      && drafted.because === entry.reason;
    if (!stamped) return held("queued");
    const why = comparisonHeld(entry);
    return why ? held(why) : { emitted: true, because: "stamp-agreed" };
  }
  // A review about the rule as it is that says it does not agree (stateOf leaves such a record gated).
  const reviewed = record.evidence?.reviewed;
  if (isObject(reviewed) && reviewed.agrees === false && reviewed.rule === ruleFingerprint(record.rule)) {
    return held("disagreement");
  }
  return held("not-reviewed");
}

/**
 * The Rule a record registers, or null: whenever emissionOf does not emit it (Ruling R27: not gated, held for a person,
 * a verdict other than entry or code, `legacy: true` without legacy standing; `legacy`: legacy.json as a Map, see
 * registry.mjs loadLegacy; `queue`: review-queue.json). A legacy record keeps its old status, or "played" once a complete
 * play is recorded.
 */
export function ruleFromRecord(record, { legacy, queue, monsterRules = false } = {}) {
  if (emissionOf(record, { legacy, queue, monsterRules })?.emitted !== true) return null;
  const status = record.legacy === true
    ? (isPlayed(record.evidence?.played) ? "played" : record.legacyStatus) : STATUS_OF_STATE[stateOf(record)];
  if (!status) return null;
  const { rule } = record;
  if (record.page === null || record.page === undefined) {
    throw new Error(`${record.key}: the record has no page, so its rule cannot be emitted`);
  }
  const out = { identifier: record.identifier, name: record.name, book: record.book, page: record.page, kind: record.kind, status };
  out.handledIn = rule.handledIn;
  for (const f of ["origin"]) if (f in rule) out[f] = structuredClone(rule[f]);
  if (record.alsoIn) out.alsoIn = structuredClone(record.alsoIn);
  for (const f of ["catalog", "inCore"]) if (f in rule) out[f] = rule[f];
  out.adds = rule.adds;
  for (const f of ["code", "entry"]) if (f in rule) out[f] = structuredClone(rule[f]);
  // Ruling R29: a monster rule registers only its delta against the engine's reading (emissionOf checked it stands).
  if (record.kind === "monster" && monsterRules !== true && out.entry) {
    const reading = currentReading(record);
    out.entry = deltaEntry(rule.entry, reading);
    // Fix round 1: the engine keys the rebinding would drop, carried over: named here, their values taken from the engine's
    // own shipped entry under `from` when the pack registers (scripts/carry.mjs), never copied into the repository.
    if (Array.isArray(reading.carried) && reading.carried.length) {
      out.carries = { from: reading.original, keys: [...reading.carried] };
    }
  }
  // Ruling R2: the other identifiers the entry is registered under (left out when there are none).
  const aliases = aliasesOf(record);
  if (aliases.length) out.alsoAs = aliases;
  // Ruling R5: the matched origins the rule does not cover, shown in docs/RULES.md (left out when there are none).
  if (Array.isArray(rule.uncovered) && rule.uncovered.length) out.uncovered = structuredClone(rule.uncovered);
  // Ruling R25: a partial rule says how many expectations it leaves to the table, by reason (docs/RULES.md). `leaves` itself
  // is emitted nowhere: the entry is what is registered, and it is the rule's own.
  if (isPartial(rule)) out.partial = leftCounts(rule.leaves);
  return out;
}

// The aliases of a record's rule, in their order.
const aliasesOf = (record) => (Array.isArray(record.rule?.alsoAs) ? record.rule.alsoAs.map((a) => a.identifier) : []);

/**
 * The `sources` of the records whose rule is emitted: `{ docId: identifier }`, what the pack registers beside its table so that
 * the engine knows an item by its document id. A record that registers no rule binds nothing.
 */
export function sourcesOf(records, { legacy, queue } = {}) {
  const out = {};
  const byKey = queueMap(queue);
  for (const record of records) {
    const problems = sourceProblems(record);
    if (problems.length) throw new Error(`${record.key}: ${problems.join("; ")}`);
    if (!record.sources || !ruleFromRecord(record, { legacy, queue: byKey })) continue;
    for (const [docId, identifier] of Object.entries(record.sources)) {
      if (out[docId] !== undefined && out[docId] !== identifier) {
        throw new Error(`${record.key}: the document ${docId} is bound to ${identifier} and to ${out[docId]}`);
      }
      out[docId] = identifier;
    }
  }
  return out;
}

const byOrder = (a, b) => {
  const [x, y] = [a.order ?? Infinity, b.order ?? Infinity];
  if (x !== y) return x < y ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
};

const indent = (text, pad) => text.split("\n").map((l) => pad + l).join("\n");

// The text of scripts/rules/books/<code>.mjs, or null when no record of the book is emitted.
export function bookModuleSource(code, records, note, { legacy, queue } = {}) {
  const blocks = [];
  const byKey = queueMap(queue);
  for (const record of [...records].sort(byOrder)) {
    const rule = ruleFromRecord(record, { legacy, queue: byKey });
    if (!rule) continue;
    const { book, ...rest } = rule;
    const note = record.note ? `${record.note.split("\n").map((l) => `  // ${l}`.trimEnd()).join("\n")}\n` : "";
    blocks.push(`${note}${indent(JSON.stringify(rest, null, 2), "  ")}`);
  }
  if (!blocks.length) return null;
  return [
    `// Generated from registry/${code.toLowerCase()}.json by npm run build:rules — do not edit.`,
    ...(note ? [`/**\n${note.split("\n").map((l) => ` * ${l}`.trimEnd()).join("\n")}\n */`] : []),
    'import { book } from "../book.mjs";',
    "",
    `export const BOOK = ${JSON.stringify(code)};`,
    "",
    `export const RULES = book(BOOK, [\n${blocks.join(",\n\n")}\n]);`,
    ""
  ].join("\n");
}

const sourcesLiteral = (sources) => {
  const keys = Object.keys(sources).sort();
  return keys.length ? `{\n${keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(sources[k])}`).join(",\n")}\n}` : "{}";
};

// Words that cannot name the import of a book module.
const RESERVED_WORDS = new Set(("await break case catch class const continue debugger default delete do else enum export extends "
  + "false finally for function if implements import in instanceof interface let new null package private protected public "
  + "return static super switch this throw true try typeof var void while with yield").split(" "));
const JS_NAME = /^[a-z_$][a-z0-9_$]*$/;

// The text of scripts/rules/index.mjs for the given lowercase book codes.
export function indexSource(codes, sources = {}) {
  for (const code of codes) {
    if (!JS_NAME.test(code) || RESERVED_WORDS.has(code)) {
      throw new Error(`book code ${JSON.stringify(code)}: its lower-case form must be a JavaScript identifier to be imported`);
    }
  }
  const names = codes.join(", ");
  return `// Generated by npm run build:rules from the books of registry/ — do not edit.
/**
 * Every rule of the pack, from the per-book modules in ./books/, and the table registered with DAS · Core.
 *
 * The rules live in registry/<book>.json; \`npm run build:rules\` writes the modules of ./books/ and this list.
 */
${codes.map((c) => `import * as ${c} from "./books/${c}.mjs";`).join("\n")}

/** The book modules, each \`{ BOOK, RULES }\`. */
export const BOOKS = Object.freeze([${names}]);

/** Every rule of the pack, with its book, page, kind and status. @type {readonly import("./book.mjs").Rule[]} */
export const RULES = Object.freeze(BOOKS.flatMap(module => module.RULES));

/** The entries of the rules of one kind, by identifier. */
function entriesOf(kind) {
  return Object.freeze(Object.fromEntries(RULES.filter(rule => rule.entry && (rule.kind === kind))
    .map(rule => [rule.identifier, rule.entry])));
}

/** Declarative rules for spells, by dnd5e identifier. */
export const SPELLS = entriesOf("spell");
/** Senses, declared with the engine's generic \`sense\` block. */
export const SENSES = entriesOf("sense");
/** Class features where an entry of DAS · Core is completed, key by key. */
export const FEATURES = entriesOf("feature");

/** The table registered with DAS · Core: every rule that has an entry, by identifier and by each of its aliases (\`alsoAs\`). */
export const TABLE = Object.freeze(Object.fromEntries(RULES.filter(rule => rule.entry)
  .flatMap(rule => [rule.identifier, ...(rule.alsoAs ?? [])].map(identifier => [identifier, rule.entry]))));

/** Document id → identifier, for the items of the rules above whose own identifier is not theirs; passed as \`sources\`. */
export const SOURCES = Object.freeze(${sourcesLiteral(sources)});
`;
}

/**
 * Writes (or, with `check`, only compares) the generated files under `out`: books/<code>.mjs for every registry book that has an
 * emitted rule, and index.mjs. Generated files of books/ that no registry book accounts for are removed (reported when checking).
 * Throws, before writing anything, when a record says `legacy: true` without legacy standing (registry/legacy.json), or has a
 * rule under a verdict other than entry or code, or review-queue.json is invalid. A rule emissionOf holds is not written
 * (Ruling R27); it still owns its identifier for the unique gate and `batch draft` (gates.mjs identifierTwins).
 * @returns {{ written: string[], differing: string[] }}  Paths relative to `out`.
 */
export function generate({ registry, out, check = false }) {
  const files = existsSync(registry)
    ? readdirSync(registry).filter((f) => f.endsWith(".json") && !NOT_BOOKS.includes(f)).sort() : [];
  const legacy = existsSync(registry) ? loadLegacy(registry) : new Map();
  // Ruling R27: what review-queue.json says decides which gated rules are held (emissionOf).
  const queue = queueMap(existsSync(registry) ? loadQueue(registry, "review") : []);
  const wanted = new Map();
  const refused = [];
  const sources = {};
  const emitted = new Map();
  for (const f of files) {
    const code = f.slice(0, -5);
    const { book, note, records } = loadBook(registry, code);
    refused.push(...records.map((r) => legacyProblem(r, legacy)).filter(Boolean));
    // A rule under another verdict would silently drop out of the pack. A rule's identifiers are checked as the schema gate
    // checks them (identifiers.mjs identifierProblems), whatever its state: an edit made after the gates is refused here too.
    for (const r of records) {
      if (r.rule && !RULE_VERDICTS.includes(r.verdict)) refused.push(`${r.key}: has a rule but the verdict ${r.verdict}`);
      const problems = r.rule ? identifierProblems(r) : [];
      if (problems.length) refused.push(`${r.key}: ${problems.join("; ")}`);
    }
    const source = bookModuleSource(book, records, note, { legacy, queue });
    if (source) wanted.set(`books/${code}.mjs`, source);
    if (!refused.length) {
      try {
        for (const [docId, identifier] of Object.entries(sourcesOf(records, { legacy, queue }))) {
          if (sources[docId] !== undefined && sources[docId] !== identifier) refused.push(`${docId}: bound to two identifiers`);
          sources[docId] = identifier;
        }
      } catch (e) { refused.push(e.message); }
    }
    // Two emitted rules must never register one identifier, aliases included.
    for (const r of records) {
      if (!ruleFromRecord(r, { legacy, queue })) continue;
      for (const id of new Set([r.identifier, ...aliasesOf(r)].map((x) => String(x).trim().toLowerCase()))) {
        if (emitted.has(id)) refused.push(`${r.key}: shares the identifier ${id} with ${emitted.get(id)}`);
        else emitted.set(id, r.key);
      }
    }
  }
  if (refused.length) throw new Error(`Refusing to generate: ${refused.join("; ")}`);
  wanted.set("index.mjs", indexSource([...wanted.keys()].map((p) => p.slice(6, -4)), sources));

  const booksDir = join(out, "books");
  const stale = existsSync(booksDir)
    ? readdirSync(booksDir).filter((f) => f.endsWith(".mjs") && !wanted.has(`books/${f}`)
      && GENERATED.test(readFileSync(join(booksDir, f), "utf8"))).map((f) => `books/${f}`)
    : [];

  const differing = [];
  const written = [];
  for (const [path, source] of wanted) {
    const file = join(out, path);
    if (existsSync(file) && readFileSync(file, "utf8") === source) continue;
    differing.push(path);
    if (!check) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, source);
      written.push(path);
    }
  }
  for (const path of stale) {
    differing.push(path);
    if (!check) rmSync(join(out, path));
  }
  return { written, differing: check ? differing : [] };
}

/**
 * Ruling R27, read back from the generated modules: one line for each record emissionOf holds whose book module registers it
 * all the same (its identifier or an alias, in the module of its book). `modules`: `{ <BOOK>: RULES }`, the RULES export of
 * each generated book module there is. `gates --ci` fails on any line, so a held rule added to a module by hand is seen there
 * as well as by `build:rules -- --check`.
 */
export function shippedHeld(records, { legacy, queue, modules = {} } = {}) {
  const byKey = queueMap(queue);
  const out = [];
  for (const record of records) {
    const emission = emissionOf(record, { legacy, queue: byKey });
    const rules = Object.hasOwn(modules, record.book) ? modules[record.book] : null;
    if (!emission || emission.emitted || !Array.isArray(rules)) continue;
    const mine = new Set([record.identifier, ...aliasesOf(record)].map((x) => String(x).trim().toLowerCase()));
    const registered = rules.some((rule) => [rule?.identifier, ...(Array.isArray(rule?.alsoAs) ? rule.alsoAs : [])]
      .some((x) => mine.has(String(x).trim().toLowerCase())));
    if (registered) {
      out.push(`emit: ${record.key} is held (${HELD_REASONS[emission.because]}) but the generated module of ${record.book}`
        + " registers it");
    }
  }
  return out;
}
