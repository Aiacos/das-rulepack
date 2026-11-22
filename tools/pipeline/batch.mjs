// Batch files for reader agents. The tools never call a model: they cut the work into files and ingest what comes back.
// Text is referenced by fingerprint (`textSha`), never embedded, so a batch file is safe to commit.
import { groupBy, stateOf } from "./registry.mjs";
import { ADDS_MAX, ORIGIN_MAX } from "./schema.mjs";
import { DRAFT_KEYS, ENTRY_WORD_BUDGET, FIX_PATHS, MAX_FIXES, entryWords, isStructural } from "./draft-keys.mjs";
import { FIX_ENUMS, describeFixTypes } from "./fix-types.mjs";
import * as assertVocabulary from "./assert.mjs";
import { isFormula } from "./assert.mjs";
import { monsterIdentifier } from "./identifiers.mjs";

export const DEFAULT_BATCH_SIZE = 40;

const summary = ({ data, ...item }) => item;
// What a reader needs besides the text: where the entry sits (owner, level, section), its rarity, page and SRD flag, and the
// hint of the rule-based triage (`core-generic`: the engine has a generic entry of that identifier; the text still decides).
const READER_FIELDS = ["owner", "level", "section", "rarity", "page", "srd", "hint"];
const entryOf = (r) => ({
  key: r.key, name: r.name, kind: r.kind, edition: r.edition, textSha: r.text.sha256,
  ...Object.fromEntries(READER_FIELDS.filter((f) => r[f] !== undefined && r[f] !== null).map((f) => [f, r[f]])),
  items: r.items.map(summary)
});

// The highest batch number per book among file names of a folder (`<book>-triage-<NNN>.json`; structure files do not count).
export function highestBatches(files, series = "triage") {
  const highest = {};
  for (const f of files) {
    const m = new RegExp(`^(.+)-${series}-(\\d+)\\.json$`).exec(f);
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
const MAX_EXAMPLES = 2;
const EXAMPLE_STRING_MAX = 100;

const matchedItems = (r) => (r.items ?? []).filter((i) => i?.match === "matched");

/**
 * Why an `entry` record is not cut into a draft batch, or null when it is: `already ruled`, `queued` (in drafts-queue.json),
 * `no text`, `no matched item` (a drafter has no ids to take), `monster feature that cannot be scoped` (no creature or name,
 * so no identifier can be made: identifiers.mjs monsterIdentifier).
 */
export function draftSkipReason(r, { queued = new Set() } = {}) {
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
    if (official.some((i) => i.embeddedShared)) return "monster feature: shared embedded id, waits on upstream";
  }
  return null;
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
  const kept = stripProse(Object.fromEntries(Object.entries(entry).filter(([k]) => Object.hasOwn(DRAFT_KEYS, k))), words);
  if (!Object.keys(kept).length) return null;
  const long = (n) => (typeof n === "string" ? n.length > EXAMPLE_STRING_MAX
    : Array.isArray(n) ? n.some(long) : n !== null && typeof n === "object" ? Object.entries(n).some(([k, v]) => long(k) || long(v))
      : false);
  return long(kept) || entryWords(kept).size > ENTRY_WORD_BUDGET ? null : kept;
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
  return { candidates, resolve: (s) => byKey.get(s) ?? s };
}

function examplesFor(r, { candidates, resolve }) {
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
  return picked.slice(0, MAX_EXAMPLES).map(({ identifier, entry }) => ({ identifier, entry }));
}

const draftEntryOf = (r, examples) => ({
  ...entryOf(r), identifier: r.kind === "monster" ? monsterIdentifier(r) : r.identifier,
  keys: r.evidence?.triaged?.keys ?? [], similar: r.evidence?.triaged?.similar ?? [],
  ...(r.why ? { why: r.why } : {}), examples
});

/**
 * Draft batches `{ id: "<book>-draft-<NNN>", stage: "draft", entries }`: the `entry` records with no rule that draftSkipReason
 * accepts, per book, one kind per batch (kinds in DRAFT_KIND_ORDER), records with a matched official item first, cut at `size`.
 * `queued` (keys of drafts-queue.json) are left out; `after` ({ book: highest number }) makes the numbering continue.
 * `core` is loadCore's result (`shipped`, for the examples); `ruled` the records examples may come from (default: `records`),
 * `gated(record)` which of them stand gated.
 */
export function cutDraftBatches(records, options = {}) {
  const { size = DRAFT_BATCH_SIZE, kind, after = {}, queued = new Set(), core, ruled, gated } = options;
  const open = records.filter((r) => r.verdict === "entry" && (!kind || r.kind === kind)
    && draftSkipReason(r, { queued }) === null);
  const pool = exampleCandidates(records, { core, ...(ruled ? { ruled } : {}), ...(gated ? { gated } : {}) });
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
        batches.push({ id, stage: "draft", entries: sorted.slice(i, i + size).map((r) => draftEntryOf(r, examplesFor(r, pool))) });
      }
    }
  }
  return batches;
}

/**
 * The words a drafter may use, from the engine and this pack's own limits (`draft-vocabulary.json`, written with each cut):
 * no record, no text, no dump content, so it is safe to commit. `core` is loadCore's result.
 */
export function draftVocabulary(core) {
  const copy = (l) => [...(l ?? [])];
  return {
    draftKeys: Object.fromEntries(Object.entries(DRAFT_KEYS).map(([k, v]) => [k, { ...v }])),
    engine: {
      moments: copy(core.moments), stepTypes: copy(core.stepTypes), facts: copy(core.facts), statuses: copy(core.statuses),
      creatureTypes: copy(core.creatureTypes), moveModes: copy(core.moveModes), effectEnds: copy(core.effectEnds),
      damageTypes: copy(core.damageTypes), abilities: copy(core.abilities)
    },
    assert: {
      rolls: copy(assertVocabulary.ROLLS), fractions: copy(assertVocabulary.FRACTIONS),
      rollModes: copy(assertVocabulary.ROLL_MODES), rollOn: copy(assertVocabulary.ROLL_ON),
      rollFor: copy(assertVocabulary.ROLL_FOR), affects: copy(assertVocabulary.AFFECTS),
      givenFields: copy(assertVocabulary.GIVEN_FIELDS), expectFields: copy(assertVocabulary.EXPECT_FIELDS)
    },
    fixes: {
      paths: JSON.parse(JSON.stringify(FIX_PATHS)), enums: JSON.parse(JSON.stringify(FIX_ENUMS)), types: describeFixTypes(),
      max: MAX_FIXES
    },
    limits: {
      addsMax: ADDS_MAX, originMax: ORIGIN_MAX, freeMax: assertVocabulary.FREE_MAX, quoteWords: 8, entryWords: ENTRY_WORD_BUDGET
    }
  };
}
