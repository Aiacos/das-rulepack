// Batch files for reader agents. The tools never call a model: they cut the work into files and ingest what comes back.
// Text is referenced by fingerprint (`textSha`), never embedded, so a batch file is safe to commit.
import { groupBy, ruleFingerprint, stateOf } from "./registry.mjs";
import { queueHolds } from "./review.mjs";
import { MAX_WHY } from "./intake.mjs";
import { ADDS_MAX, ORIGIN_MAX } from "./schema.mjs";
import {
  CONDITION_SHAPE, DRAFT_KEYS, DRAFT_SHAPES, ENTRY_WORD_BUDGET, FIX_PATHS, MAX_FIXES, entryWords, isStructural, zoneProblemsOf
} from "./draft-keys.mjs";
import { AURA_MOMENTS, EMANATION_ON, EXCLUDED_ZONE, ZONE_KEYS, ZONE_MOMENTS, replays } from "./zones.mjs";
import { DRAFT_FACTS, EXCLUDED_FACTS, MAX_CONDITION_FACTS } from "./conditions.mjs";
import { assertShapes } from "./assert.mjs";
import { identifierClashes, quotationCheck } from "./gates.mjs";
import { resolveShape } from "./shapes.mjs";
import { FIX_ENUMS, describeFixTypes } from "./fix-types.mjs";
import * as assertVocabulary from "./assert.mjs";
import { isFormula } from "./assert.mjs";
import { DDB_MONSTER_UNCOVERED, monsterIdentifier, sourceKeysOf } from "./identifiers.mjs";
import { sharedEmbeddedId } from "./settle.mjs";
import { ENDS_EXAMPLES, definitionsFor } from "./definitions.mjs";
import { LEAVES_MAX, LEAVE_REASONS, UNEXPRESSED_MAX } from "./leaves.mjs";
import { beyondOf } from "./reread.mjs";
import { emissionOf } from "./generate.mjs";
import * as sh from "./shapes.mjs";

export const DEFAULT_BATCH_SIZE = 40;

const summary = ({ data, ...item }) => item;
// What a reader needs besides the text: where the entry sits (owner, level, section), its rarity, page and SRD flag, and the
// hint of the rule-based triage (`core-generic`: the engine has a generic entry of that identifier; the text still decides).
const READER_FIELDS = ["owner", "level", "section", "rarity", "page", "srd", "hint"];
/**
 * False for an origin a rule of this record can never name (Ruling R3: a monster feature's DDB Importer item, world ids and
 * generic identifiers): `batch draft` and `batch review` offer it as `{ origin, match, uncovered: "always" }`, with none of
 * its ids, and write no structure for it. Its ids are left out, not only flagged, so a drafter has nothing it could copy into
 * an entry; the origin is still listed so a drafter sees it exists and why it is never named (ingest --draft adds its
 * `uncovered` line itself, draft.mjs).
 */
export const rulableOrigin = (r, origin) => !(r?.kind === "monster" && origin === "ddb-importer");
// `rulable`: the draft and review cut, where an origin no rule can name is offered without its ids (rulableOrigin).
const entryOf = (r, { rulable = false } = {}) => ({
  key: r.key, name: r.name, kind: r.kind, edition: r.edition, textSha: r.text.sha256,
  ...Object.fromEntries(READER_FIELDS.filter((f) => r[f] !== undefined && r[f] !== null).map((f) => [f, r[f]])),
  items: r.items.map((i) => (rulable && !rulableOrigin(r, i.origin)
    ? { origin: i.origin, match: i.match, uncovered: "always" } : summary(i)))
});

// The highest batch number per book among file names of a folder (`<book>-triage-<NNN>.json`; structure files do not count).
export function highestBatches(files, series = "triage") {
  const highest = {};
  for (const f of files) {
    const m = new RegExp(`^(.+)-${series}-(\\d+)(?:\\.results)?\\.json$`).exec(f);
    if (m) highest[m[1]] = Math.max(highest[m[1]] ?? 0, Number(m[2]));
  }
  return highest;
}

// With `only` (a Set of keys: the entries of the queue that have no second reading yet) and `series: "second"`, the batches are
// cut from those records alone and numbered `<book>-second-<NNN>`, on their own count (`after` then holds the highest
// `-second-` numbers). The entries are the same as ever: nothing of the first reading goes in, the second one is blind.
// Records without a verdict (and with text), per book, grouped by kind (only `kind` when given), cut at `size`. The keys of
// `queued` (registry/queue.json: results waiting for a person) are left out: they have no verdict but are not to be read again.
// Ids: <book>-triage-<NNN>; `after` ({ book: highest number in use }) makes the numbering continue, so an id is never reused.
// A record with no matched item in any origin is left out unless `withoutItems`: a reader has nothing to compare its text with.
export function cutBatches(records, options = {}) {
  const { size = DEFAULT_BATCH_SIZE, kind, after = {}, queued = new Set(), withoutItems = false, only, series = "triage" }
    = options;
  const hasItem = (r) => (r.items ?? []).some((i) => i.match === "matched");
  const open = records.filter((r) => !r.verdict && r.text && (!kind || r.kind === kind) && !queued.has(r.key)
    && (!only || only.has(r.key)) && (withoutItems || hasItem(r)));
  const batches = [];
  const counts = new Map(Object.entries(after));
  for (const [book, ofBook] of groupBy(open, (r) => r.book.toLowerCase())) {
    for (const ofKind of groupBy(ofBook, (r) => r.kind).values()) {
      for (let i = 0; i < ofKind.length; i += size) {
        const n = (counts.get(book) ?? 0) + 1;
        counts.set(book, n);
        const id = `${book}-${series}-${String(n).padStart(3, "0")}`;
        batches.push({ id, stage: "triage", entries: ofKind.slice(i, i + size).map(entryOf) });
      }
    }
  }
  return batches;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Draft batches (stage 3). A drafter turns an `entry` record into a rule from the batch file, the private structure file and
// the text cache alone, so the batch carries what it needs: the record's identity, the text fingerprint (never the text), the
// matched origins with their activity and effect ids, the triage `why`, `keys` and `similar`, and up to two example rules.
export const DRAFT_BATCH_SIZE = 20;
// Ruling R13: single-item kinds with activity-id maps first, class features next, monsters last.
export const DRAFT_KIND_ORDER = Object.freeze(["spell", "feat", "option", "species", "background", "item", "feature", "monster"]);
const MAX_EXAMPLES = 3;
const EXAMPLE_STRING_MAX = 100;

const matchedItems = (r) => (r.items ?? []).filter((i) => i?.match === "matched");

// A record no drafter can take to `gated` (the `unique` gate would fail it whatever is drafted): a person decides.
export const CORE_IDENTIFIER = "identifier is DAS · Core's: a person decides inCore";
export const SHARED_IDENTIFIER = "identifier shared with another record";
// A monster feature the engine reads something of (Ruling R29) that no reread found going beyond that reading: a drafter
// would mostly repeat the engine. It goes to a reread first (reread.mjs); `hint: "beyond-engine"` lets it through.
export const ENGINE_READS_FIRST = "engine reads it: reread first";
// Ruling R22: a rule of another edition already holds the identifier: an edition-scoped one (bound through sources) is needed.
export const EDITION_IDENTIFIER = "identifier ruled for another edition: needs an edition-scoped identifier";
// The records that register an identifier with the engine, or will once drafted (verdict entry), under the identifier they
// will have (an unruled monster feature's is its creature-scoped one, Ruling R3).
const willRegister = (r) => Boolean(r?.rule) || r?.verdict === "entry";
const asRegistered = (r) => {
  if (r.rule || r.kind !== "monster") return r;
  try { return { ...r, identifier: monsterIdentifier(r) }; } catch { return r; }
};
/**
 * Map of record key to CORE_IDENTIFIER, SHARED_IDENTIFIER (a twin of the same edition) or EDITION_IDENTIFIER (a rule of
 * another edition holds it, Ruling R22) for the records whose identifier (or alias) the `unique` gate would hold against
 * them (gates.mjs identifierClashes / identifierTwins, the gate's own functions), counting every record that has a rule or
 * the verdict entry; `pending` (keys) are drafts being ingested, ranked after every existing rule. `coreIdentifiers` is
 * gates.mjs engineIdentifiers(core): the table, the code and the system identifiers. Used by `batch draft` (left out) and
 * `ingest --draft` (queued).
 */
export function identifierClashReasons(records, coreIdentifiers, { pending } = {}) {
  const registering = records.filter(willRegister).map(asRegistered);
  const clashes = identifierClashes(registering, { coreIdentifiers, registers: willRegister, pending });
  const reason = (c) => (c.core.length ? CORE_IDENTIFIER : c.shared.length ? SHARED_IDENTIFIER : EDITION_IDENTIFIER);
  return new Map([...clashes].filter(([, c]) => c.core.length || c.shared.length || c.edition.length)
    .map(([key, c]) => [key, reason(c)]));
}

/**
 * Why an `entry` record is not cut into a draft batch, or null when it is: `already ruled`, `queued` (in drafts-queue.json),
 * `no text`, `no matched item` (a drafter has no ids to take), `monster feature that cannot be scoped` (no creature or name,
 * so no identifier can be made: identifiers.mjs monsterIdentifier), and the monster features the gates would fail whatever is
 * drafted: no official item, an official item with no embedded id, or an embedded id that another creature of the package
 * embeds. The last is decided here from `embedded` (settle.mjs embeddedIndex of the package's actors), with the test inventory
 * binds by: the record's own `embeddedShared` flag exists only once a rule is bound. A monster is not decided without it.
 */
export function draftSkipReason(r, { queued = new Set(), embedded, clashes = new Map(), readingOf } = {}) {
  if (r.rule) return "already ruled";
  if (queued.has(r.key)) return "queued";
  if (!r.text) return "no text";
  if (!matchedItems(r).length) return "no matched item";
  if (r.kind === "monster") {
    if (typeof r.owner !== "string" || !r.owner || typeof r.name !== "string" || !r.name) {
      return "monster feature that cannot be scoped";
    }
    try { monsterIdentifier(r); } catch { return "monster feature that cannot be scoped"; }
    // The gates would fail it whatever is drafted (gates.mjs `ids`: SHARED_EMBEDDED; an official item is what the ids bind to).
    const official = matchedItems(r).filter((i) => i.origin === "official");
    if (!official.length) return "monster feature: no official item";
    if (!embedded) throw new TypeError("draftSkipReason: a monster feature needs the actors of the book's package (embedded)");
    const own = official.flatMap((i) => sourceKeysOf(i, "monster"));
    if (!own.length) return "monster feature: official item has no embedded id";
    if (official.some((i) => i.embeddedShared) || own.some((id) => sharedEmbeddedId(embedded, id, r.owner))) {
      return "monster feature: shared embedded id, waits on upstream";
    }
    // `readingOf(record)`: the engine's reading of the official item (null when it reads nothing, undefined when the item is
    // not in the dumps); `batch draft` always gives it.
    if (typeof readingOf === "function" && r.hint !== "beyond-engine") {
      const reading = readingOf(r);
      if (reading !== null && typeof reading === "object" && Object.keys(reading).length) return ENGINE_READS_FIRST;
    }
  }
  // `clashes` (identifierClashReasons of the whole registry): the unique gate would fail it whatever is drafted.
  return clashes.get(r.key) ?? null;
}

/** Why a record is left out of a redraft cut (Ruling R32): every record but a redraftable one. */
export const NOT_REDRAFTABLE = "not redraftable";
/** The mark a redraft leaves on the draft it writes (`evidence.drafted.redrafted`, Ruling R32). */
export const isRedrafted = (r) => r?.evidence?.drafted?.redrafted === true;
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Ruling R32: whether a ruled record is drafted again (`batch draft --redraft`, `ingest --draft --redraft`): a monster
 * feature, not legacy, with a rule whose emission (generate.mjs emissionOf) is held `engine-changes` (it drops or alters
 * what the engine reads), that waits in neither drafts-queue.json (`draftsQueued`) nor review-queue.json (`reviewQueued`),
 * and whose draft does not carry the mark of a redraft (`evidence.drafted.redrafted`: once only). The reading decided on is
 * the stored one (`evidence.reading`, as CI decides), or, with `readingOf(record)`, the one computed now from the engine
 * and the dumps (an `evidence.reading`; none, null: not redraftable, fail closed).
 */
export function redraftable(r, { draftsQueued = new Set(), reviewQueued = new Set(), readingOf } = {}) {
  if (r?.kind !== "monster" || r.legacy === true || !r.rule || isRedrafted(r)) return false;
  if (draftsQueued.has(r.key) || reviewQueued.has(r.key)) return false;
  let candidate = r;
  if (typeof readingOf === "function") {
    const reading = readingOf(r);
    if (!isPlainObject(reading)) return false;
    candidate = { ...r, evidence: { ...r.evidence, reading } };
  }
  return emissionOf(candidate)?.because === "engine-changes";
}

// The strings an example may keep: a 16-character id, a word of the engine's vocabularies, a short formula or dice. Anything
// else (a label, a comment in French, a sentence) is stripped, with the property or list item that held it.
const ID16 = /^[A-Za-z0-9]{16}$/;
const DICE = /^\d+d\d+([+-]\d+)?$/;
const KEY = /^[A-Za-z0-9_]{1,24}$/;
function wordsOf(core) {
  const set = new Set(core?.vocabulary ?? []);
  for (const name of ["moments", "stepTypes", "facts", "statuses", "creatureTypes", "moveModes", "effectEnds", "damageTypes",
    "abilities"]) for (const w of core?.[name] ?? []) set.add(w);
  return set;
}
const plainValue = (s, words) => ID16.test(s) || words.has(s) || DICE.test(s) || isFormula(s) || isStructural(s);
function stripProse(node, words) {
  if (typeof node === "string") return plainValue(node, words) ? node : undefined;
  if (Array.isArray(node)) return node.map((x) => stripProse(x, words)).filter((x) => x !== undefined);
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (!KEY.test(k)) continue;
      const kept = stripProse(v, words);
      if (kept !== undefined) out[k] = kept;
    }
    return out;
  }
  return node;
}

// What a drafter sees of an example rule: the drafter keys only (no prose key of the engine), nothing but ids, engine words,
// formulas and numbers, within the word budget. null when nothing of it is left.
function exampleEntry(entry, words) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
  const kept = fitZones(stripProse(Object.fromEntries(Object.entries(entry).filter(([k]) => Object.hasOwn(DRAFT_KEYS, k))),
    words));
  if (!Object.keys(kept).length) return null;
  const long = (n) => (typeof n === "string" ? n.length > EXAMPLE_STRING_MAX
    : Array.isArray(n) ? n.some(long) : n !== null && typeof n === "object" ? Object.entries(n).some(([k, v]) => long(k) || long(v))
      : false);
  return long(kept) || entryWords(kept).size > ENTRY_WORD_BUDGET ? null : kept;
}

// Ruling R33: an example keeps a zone or aura key only in the drafter's shape (no `changes` text, no radius formula...), and
// only the replay declarations a drafter may write: what the engine's own entries do beyond it is not shown as a model.
function fitZones(entry) {
  const out = { ...entry };
  for (const key of Object.keys(ZONE_KEYS)) {
    if (Object.hasOwn(out, key) && zoneProblemsOf({ [key]: out[key] }).length) delete out[key];
  }
  if (Array.isArray(out.triggers)) {
    const fit = out.triggers.filter((d) => !replays(d) || !zoneProblemsOf({ triggers: [d] }).length);
    if (fit.length) out.triggers = fit;
    else delete out.triggers;
  }
  return out;
}

// The candidates examples are taken from: DAS · Core's shipped entries, then the pack's rules that stand gated.
const standsGated = (r) => stateOf(r) !== "drafted" && stateOf(r) !== "triaged";
function exampleCandidates(records, { core, ruled = records, gated = standsGated }) {
  const out = new Map();
  for (const [identifier, entry] of Object.entries(core?.shipped ?? {})) out.set(identifier, entry);
  for (const r of ruled) if (r.rule?.entry && gated(r)) out.set(r.identifier, r.rule.entry);
  const byKey = new Map(ruled.concat(records).map((r) => [r.key, r.identifier]));
  const candidates = [...out].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([identifier, entry]) => ({ identifier, entry: exampleEntry(entry, wordsOf(core)) })).filter((c) => c.entry);
  // The canonical example of each key, and which keys the shipped rules of each kind of record use most (ties: by name).
  const keyExamples = keyExamplesOf(core);
  const shipped = core?.shipped ?? {};
  const byKind = new Map();
  for (const r of ruled.concat(records)) {
    if (!Object.hasOwn(shipped, r.identifier)) continue;
    const count = byKind.get(r.kind) ?? new Map();
    for (const k of Object.keys(exampleEntry(shipped[r.identifier], wordsOf(core)) ?? {})) count.set(k, (count.get(k) ?? 0) + 1);
    byKind.set(r.kind, count);
  }
  const overall = new Map();
  for (const entry of Object.values(shipped)) {
    for (const k of Object.keys(exampleEntry(entry, wordsOf(core)) ?? {})) overall.set(k, (overall.get(k) ?? 0) + 1);
  }
  const common = (kind) => {
    const count = byKind.get(kind)?.size ? byKind.get(kind) : overall;
    return [...count].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)).map(([k]) => k);
  };
  return { candidates, resolve: (s) => byKey.get(s) ?? s, keyExamples, common };
}

/**
 * The canonical example of each drafter key: the shortest of DAS · Core's shipped entries that use it (ties: by identifier),
 * stripped to ids, engine words, formulas and numbers. `{ <key>: { identifier, entry } }`, only for the keys some entry uses.
 */
// How a data fix is written (`fixes.shape`): the leaves of `fixes.paths.activity` go under their activity's own path, an
// effect's under the effect's id; and three invented fixes the drafter check accepts (`fixes.examples`).
export const FIX_SHAPE = Object.freeze({
  activity: { path: "system.activities.<activity id>.<a leaf of paths.activity>", from: "the value today", value: "the new value" },
  item: { path: "<a leaf of paths.item>", from: "the value today", value: "the new value" },
  effect: { effect: "<effect id>", path: "<a leaf of paths.effect>", from: "the value today", value: "the new value" }
});
export const FIX_EXAMPLES = Object.freeze([
  { path: "system.activities.Ac00Ac11Ac22Ac33.save.ability", from: [], value: ["wis"] },
  { path: "system.target.affects.type", from: "object", value: "creature" },
  { effect: "Ef00Ef11Ef22Ef33", path: "statuses", from: [], value: ["prone"] }
]);

export function keyExamplesOf(core) {
  const words = wordsOf(core);
  const stripped = Object.entries(core?.shipped ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([identifier, entry]) => ({ identifier, entry: exampleEntry(entry, words) })).filter((c) => c.entry);
  const out = {};
  for (const key of Object.keys(DRAFT_KEYS)) {
    const best = stripped.filter((c) => Object.hasOwn(c.entry, key))
      .sort((a, b) => JSON.stringify(a.entry).length - JSON.stringify(b.entry).length)[0];
    if (best) out[key] = { identifier: best.identifier, entry: best.entry };
  }
  return out;
}

function examplesFor(r, { candidates, resolve, keyExamples, common }) {
  const triaged = r.evidence?.triaged ?? {};
  const byIdentifier = new Map(candidates.map((c) => [c.identifier, c]));
  const picked = [];
  for (const s of triaged.similar ?? []) {
    const c = byIdentifier.get(resolve(s));
    if (c && !picked.includes(c)) picked.push(c);
  }
  if (picked.length < MAX_EXAMPLES) {
    const wanted = new Set((triaged.keys ?? []).map((k) => String(k).split(".")[0]));
    const scored = candidates.filter((c) => !picked.includes(c))
      .map((c) => ({ c, n: Object.keys(c.entry).filter((k) => wanted.has(k)).length })).filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    for (const { c } of scored) if (picked.length < MAX_EXAMPLES) picked.push(c);
  }
  const out = picked.slice(0, MAX_EXAMPLES).map(({ identifier, entry }) => ({ identifier, entry }));
  // Whatever triage left in `keys` and `similar`, an entry gets the canonical examples of the keys the shipped rules of its
  // kind use most.
  for (const key of common(r.kind)) {
    if (out.length >= MAX_EXAMPLES) break;
    const example = keyExamples[key];
    if (example && !out.some((o) => o.identifier === example.identifier)) out.push(example);
  }
  return out;
}

// `beyondEngine`: what a reread found the text asks beyond the engine's reading (reread.mjs beyondOf), as assertions of the
// closed vocabulary with no free text: a hint of what the rule is to add.
const draftEntryOf = (r, examples, why) => {
  const beyond = r.kind === "monster" ? beyondOf(r) : null;
  return {
    ...entryOf(r, { rulable: true }), identifier: r.kind === "monster" ? monsterIdentifier(r) : r.identifier,
    keys: r.evidence?.triaged?.keys ?? [], similar: r.evidence?.triaged?.similar ?? [],
    ...(why ? { why } : {}), ...(beyond ? { beyondEngine: structuredClone(beyond) } : {}), examples
  };
};

// The triage `why` is the reader's own words, ingest refuses 8 or more consecutive words of the text; an older `why` may
// predate that limit, so a drafter gets it only when it passes the check a rule's strings face (gates.mjs quotationCheck).
// Without the text it is withheld (fail closed).
function whyFor(r, textOf, report) {
  if (!r.why) return undefined;
  let text = null;
  try { text = typeof textOf === "function" ? textOf(r) : null; } catch { text = null; }
  if (typeof text === "string" && !quotationCheck(text)(r.why)) return r.why;
  report.whyWithheld = (report.whyWithheld ?? 0) + 1;
  return undefined;
}

/**
 * Draft batches `{ id: "<book>-draft-<NNN>", stage: "draft", entries }`: the `entry` records with no rule that draftSkipReason
 * accepts, per book, one kind per batch (kinds in DRAFT_KIND_ORDER), records with a matched official item first, cut at `size`.
 * With `redraft` (Ruling R32), only the records `redraftable` accepts (`queued` and `reviewQueued` the keys of the two queues,
 * `currentReadingOf` the reading computed now), in batches marked `redraft: true` of the same draft series and the same
 * entries; no rule of a record cut is ever offered as an example (the drafter is blind to the rule it replaces).
 * `queued` (keys of drafts-queue.json) are left out; `after` ({ book: highest number }) makes the numbering continue.
 * `embedded` (settle.mjs embeddedIndex of the package's actors) is required when a monster feature is among the records.
 * `textOf(record)` gives the cached text (the `why` of an entry is kept only when it does not quote it; `report.whyWithheld`
 * counts the others). `core` is loadCore's result (`shipped`, for the examples); `ruled` the records examples may come from
 * (default: `records`),
 * `gated(record)` which of them stand gated.
 */
export function cutDraftBatches(records, options = {}) {
  const {
    size = DRAFT_BATCH_SIZE, kind, after = {}, queued = new Set(), core, ruled, gated, embedded, textOf, report = {},
    clashes = new Map(), readingOf, redraft = false, reviewQueued = new Set(), currentReadingOf
  } = options;
  const open = records.filter((r) => r.verdict === "entry" && (!kind || r.kind === kind) && (redraft
    ? redraftable(r, { draftsQueued: queued, reviewQueued, readingOf: currentReadingOf })
    : draftSkipReason(r, { queued, embedded, clashes, readingOf }) === null));
  // A redraft is blind: the rules it replaces are no examples.
  const blind = new Set(redraft ? open.map((r) => r.key) : []);
  const unseen = (list) => list.filter((r) => !blind.has(r.key));
  const pool = exampleCandidates(unseen(records), { core, ruled: unseen(ruled ?? records), ...(gated ? { gated } : {}) });
  const official = (r) => matchedItems(r).some((i) => i.origin === "official");
  const rank = (k) => (DRAFT_KIND_ORDER.includes(k) ? DRAFT_KIND_ORDER.indexOf(k) : DRAFT_KIND_ORDER.length);
  const batches = [];
  const counts = new Map(Object.entries(after));
  for (const [book, ofBook] of groupBy(open, (r) => r.book.toLowerCase())) {
    const kinds = [...groupBy(ofBook, (r) => r.kind)].sort(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
    for (const [, ofKind] of kinds) {
      const sorted = [...ofKind.filter(official), ...ofKind.filter((r) => !official(r))];
      for (let i = 0; i < sorted.length; i += size) {
        const n = (counts.get(book) ?? 0) + 1;
        counts.set(book, n);
        const id = `${book}-draft-${String(n).padStart(3, "0")}`;
        const entries = sorted.slice(i, i + size)
          .map((r) => draftEntryOf(r, examplesFor(r, pool), whyFor(r, textOf, report)));
        batches.push({ id, stage: "draft", ...(redraft ? { redraft: true } : {}), entries });
      }
    }
  }
  return batches;
}

// The fields of an assertion shape but `free` (Ruling R25: no free text in leaves).
const withoutFree = (fields) => Object.fromEntries(Object.entries(fields).filter(([k]) => k !== "free"));

/** `<book>-draft-report.json`: counts only (no key, no name): the batches, the entries cut, each reason with its count. */
export const draftReport = (book, batches, leftOut, whyWithheld = 0) => ({
  book, batches: batches.length, cut: batches.reduce((n, b) => n + b.entries.length, 0),
  leftOut: Object.fromEntries(Object.entries(leftOut).sort()), whyWithheld
});

/**
 * The words a drafter may use, from the engine and this pack's own limits (`draft-vocabulary.json`, written with each cut):
 * no record, no text, no dump content, so it is safe to commit. `core` is loadCore's result.
 */
export function draftVocabulary(core) {
  const copy = (l) => [...(l ?? [])];
  const engineLists = {
    moments: copy(core.moments), statuses: copy(core.statuses), creatureTypes: copy(core.creatureTypes),
    moveModes: copy(core.moveModes), effectEnds: copy(core.effectEnds), damageTypes: copy(core.damageTypes),
    sizes: copy(core.sizes)
  };
  return {
    draftKeys: Object.fromEntries(Object.entries(DRAFT_KEYS).map(([k, v]) => [k, { ...v }])),
    engine: {
      moments: copy(core.moments), stepTypes: copy(core.stepTypes), facts: copy(core.facts), statuses: copy(core.statuses),
      creatureTypes: copy(core.creatureTypes), moveModes: copy(core.moveModes), effectEnds: copy(core.effectEnds),
      damageTypes: copy(core.damageTypes), abilities: copy(core.abilities), sizes: copy(core.sizes)
    },
    assert: {
      shapes: Object.fromEntries(Object.entries(assertShapes()).map(([part, fields]) => [part,
        Object.fromEntries(Object.entries(fields).map(([k, s]) => [k, resolveShape(s, engineLists)]))])),
      rolls: copy(assertVocabulary.ROLLS), fractions: copy(assertVocabulary.FRACTIONS),
      rollModes: copy(assertVocabulary.ROLL_MODES), rollOn: copy(assertVocabulary.ROLL_ON),
      rollFor: copy(assertVocabulary.ROLL_FOR), affects: copy(assertVocabulary.AFFECTS),
      givenFields: copy(assertVocabulary.GIVEN_FIELDS), expectFields: copy(assertVocabulary.AGENT_EXPECT_FIELDS),
      denies: copy(assertVocabulary.DENIES), subjected: copy(assertVocabulary.SUBJECTED), auraMoments: copy(AURA_MOMENTS)
    },
    // The value shape of every field of an assertion and of every drafter key, engine words resolved (shapes.mjs).
    draftShapes: Object.fromEntries(Object.entries(DRAFT_SHAPES).map(([k, s]) => [k, resolveShape(s, engineLists)])),
    // Ruling R30: what a trigger's `if` may name (conditions.mjs): each allowed fact with its subject, the given field that
    // says it in an assertion and its argument's shape (engine words resolved), at most `max` per trigger; the facts left out
    // with why.
    conditions: {
      max: MAX_CONDITION_FACTS,
      facts: Object.fromEntries(Object.entries(DRAFT_FACTS).map(([name, f]) => [name, { subject: f.subject, given: f.given,
        ...(Object.hasOwn(f, "value") ? { value: f.value } : {}), arg: resolveShape(CONDITION_SHAPE.facts[name], engineLists) }])),
      excluded: { ...EXCLUDED_FACTS }
    },
    // Ruling R33: the zone and aura keys (zones.mjs): what each does at the table and where that was read, the moments a
    // replay and an emanation may name, the aura moment words of `given.moment`, and what the engine also takes with why not.
    zones: {
      keys: JSON.parse(JSON.stringify(ZONE_KEYS)), zoneMoments: copy(ZONE_MOMENTS), emanationOn: copy(EMANATION_ON),
      auraMoments: copy(AURA_MOMENTS), excluded: { ...EXCLUDED_ZONE }
    },
    keyExamples: keyExamplesOf(core),
    // Ruling R3: a monster feature names the official origin only; its DDB Importer item is uncovered with this reason
    // (ingest --draft adds the line when it is left out, and rejects a rule that names ddb-importer in `origins`).
    monsters: { origins: ["official"], uncovered: [{ origin: "ddb-importer", because: DDB_MONSTER_UNCOVERED }] },
    fixes: {
      paths: JSON.parse(JSON.stringify(FIX_PATHS)), enums: JSON.parse(JSON.stringify(FIX_ENUMS)), types: describeFixTypes(),
      max: MAX_FIXES, shape: JSON.parse(JSON.stringify(FIX_SHAPE)), examples: JSON.parse(JSON.stringify(FIX_EXAMPLES))
    },
    limits: {
      addsMax: ADDS_MAX, originMax: ORIGIN_MAX, freeMax: assertVocabulary.FREE_MAX, quoteWords: 8, entryWords: ENTRY_WORD_BUDGET
    },
    // Ruling R25: what a partial rule leaves to the table (`rule.leaves`), as data: an assertion of the shapes above without
    // `free` (and an optional `because`), or an `unexpressed` reason with a count. The drafter's only.
    leaves: {
      max: LEAVES_MAX, because: [...LEAVE_REASONS], unexpressedMax: UNEXPRESSED_MAX,
      shapes: {
        assertion: resolveShape(sh.object({
          given: sh.object({}, withoutFree(assertShapes().given)),
          expect: sh.object({}, withoutFree(assertShapes().expect), { atLeastOne: true })
        }, { because: sh.values(LEAVE_REASONS) }), engineLists),
        unexpressed: resolveShape(sh.object({ unexpressed: sh.values(LEAVE_REASONS),
          count: Object.freeze({ type: "number", min: 1, max: UNEXPRESSED_MAX, int: true, formula: false }) }), engineLists)
      }
    },
    // What each closed word means, and where the meaning comes from (definitions.mjs): one reading for drafter and reviewer.
    definitions: definitionsFor(),
    endsExamples: JSON.parse(JSON.stringify(ENDS_EXAMPLES))
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Review batches (stage 5). A reviewer is blind to the draft: an entry is a triage entry (the record's facts, its matched
// origins with their ids, the text fingerprint) plus `rule`, the fingerprint of the rule under review, which ties the answer
// to that rule. Nothing of the drafted rule goes in: no entry, no assertion, no `adds`, no drafter handle, no triage `keys`.
export const REVIEW_BATCH_SIZE = 30;

/**
 * Why a record that has a rule is not cut into a review batch, or null when it is: `no rule`, `legacy` (it leaves legacy
 * through a person), `not gated (<state>)` (a rule the gates do not pass is not worth reviewing; a reviewed or played one is
 * done), `queued` (an entry of review-queue.json about the rule as it is, review.mjs queueHolds: it waits for a person),
 * `no text`, `no assertion`. A person's own rule (no drafted evidence) is cut like any other.
 */
export function reviewSkipReason(r, { queue = [] } = {}) {
  if (!r?.rule) return "no rule";
  if (r.legacy === true) return "legacy";
  const state = stateOf(r);
  if (state !== "gated") return `not gated (${state})`;
  if (queue.some((q) => q?.key === r.key && queueHolds(q, r))) return "queued";
  if (!r.text) return "no text";
  if (!Array.isArray(r.rule.assert) || !r.rule.assert.length) return "no assertion";
  return null;
}

/**
 * Review batches `{ id: "<book>-review-<NNN>", stage: "review", entries }`: the records reviewSkipReason accepts, per book,
 * one kind per batch (kinds in DRAFT_KIND_ORDER), cut at `size` (Ruling R8: 30). `queue` is review-queue.json; `after` ({ book:
 * highest number }) makes the numbering continue.
 */
export function cutReviewBatches(records, options = {}) {
  const { size = REVIEW_BATCH_SIZE, kind, after = {}, queue = [] } = options;
  const open = records.filter((r) => (!kind || r.kind === kind) && reviewSkipReason(r, { queue }) === null);
  const rank = (k) => (DRAFT_KIND_ORDER.includes(k) ? DRAFT_KIND_ORDER.indexOf(k) : DRAFT_KIND_ORDER.length);
  const batches = [];
  const counts = new Map(Object.entries(after));
  for (const [book, ofBook] of groupBy(open, (r) => r.book.toLowerCase())) {
    const kinds = [...groupBy(ofBook, (r) => r.kind)].sort(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
    for (const [, ofKind] of kinds) {
      for (let i = 0; i < ofKind.length; i += size) {
        const n = (counts.get(book) ?? 0) + 1;
        counts.set(book, n);
        const id = `${book}-review-${String(n).padStart(3, "0")}`;
        const entries = ofKind.slice(i, i + size).map((r) => ({ ...entryOf(r, { rulable: true }), rule: ruleFingerprint(r.rule) }));
        batches.push({ id, stage: "review", entries });
      }
    }
  }
  return batches;
}

/** `<book>-review-report.json`: counts only, like the draft report (the batches, the entries cut, each reason left out). */
export const reviewReport = (book, batches, leftOut) => ({
  book, batches: batches.length, cut: batches.reduce((n, b) => n + b.entries.length, 0),
  leftOut: Object.fromEntries(Object.entries(leftOut).sort())
});

/**
 * What a reviewer may write (`review-vocabulary.json`): the assertion vocabulary of the drafter's (draftVocabulary) and the
 * engine words it names, with the limits of its strings. No drafter key, no example rule: engine data only.
 */
export function reviewVocabulary(core) {
  const { engine, assert, limits, endsExamples } = draftVocabulary(core);
  const words = ["moments", "statuses", "creatureTypes", "moveModes", "effectEnds", "damageTypes", "sizes"];
  return {
    engine: Object.fromEntries(words.map((w) => [w, engine[w]])), assert,
    limits: { freeMax: limits.freeMax, quoteWords: limits.quoteWords, whyMax: MAX_WHY },
    definitions: definitionsFor({ review: true }), endsExamples
  };
}

/**
 * What a rereader may write (`reread-vocabulary.json`): the reviewer's (reviewVocabulary), and `unexpressed`, the reasons of
 * leaves.mjs LEAVE_REASONS (the one list a partial rule's leaves use too), each defined in `definitions.leavesBecause`.
 */
export function rereadVocabulary(core) {
  const review = reviewVocabulary(core);
  return { ...review, unexpressed: [...LEAVE_REASONS],
    definitions: { ...review.definitions, leavesBecause: definitionsFor().leavesBecause } };
}
