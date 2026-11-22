// The intake of what reviewer agents wrote (`ingest <results-file> --review`, stage 5c). A reviewer is blind to the drafted rule:
// from the rule text and the item structure alone it says, in the closed vocabulary of `rule.assert` (assert.mjs), what must be
// true at the table. The tool compares those assertions with the drafted rule's (its `assert` plus what its entry implies,
// Ruling R9): agreement makes the record `reviewed`, anything else waits for a person in registry/review-queue.json. A review
// never changes the rule, and nothing here writes `evidence` other than `reviewed` (never `evidence.person`).
import { ruleFingerprint, stateOf } from "./registry.mjs";
import { BY, REVIEW_TOLERANCES, isReaderHandle } from "./schema.mjs";
import { assertProblems, impliedAsserts, normaliseAssert } from "./assert.mjs";
import { RULE_QUOTE_WORDS, quotationCheck } from "./gates.mjs";
import { ALL_ROLLS, damageRollsOf } from "./draft-keys.mjs";
import {
  QUEUE_THRESHOLD, cachedText, clip, clipEchoes, confidenceProblem, echo, forbiddenKeyIn, unknownFields, whyProblem, whyQuotes
} from "./intake.mjs";

// The fields of one review result (docs/PIPELINE.md, "Brief for a reviewer agent"); anything else (`evidence`, `verdict`,
// `agrees`, `by`...) is the tools' or a person's.
export const REVIEW_RESULT_FIELDS = Object.freeze(["key", "rule", "outcome", "assert", "why", "confidence"]);
// What a reviewer answers: assertions (the default, `outcome` left out), or `person` with no assertion when the closed
// vocabulary cannot say what the entry does (pilot 2: a `free`-only assertion is refused, it says nothing checkable).
export const REVIEW_OUTCOMES = Object.freeze(["assert", "person"]);
// The reasons a review-queue entry carries besides a draft's stamp for a person (schema.mjs DRAFTED_FOR_PERSON).
export const REVIEW_REASONS = Object.freeze(["disagreement", "free-text", "low-confidence", "unexpressed"]);
// What an agreement may have tolerated (Ruling R24), as `evidence.reviewed.tolerated` records it (schema.mjs).
export { REVIEW_TOLERANCES };
const SHOWN_PROBLEMS = 4;
const SHOWN_PROBLEM_CHARS = 200;
const HEX64 = /^[0-9a-f]{64}$/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isFree = (canonical) => canonical.split(";").some((pair) => pair === "given.free=*" || pair === "expect.free=*");

// Ruling R24. The fields of each expectation kind that are optional detail: one side may state them and the other not. Every
// other field is identity (damage `fraction`; move `mode`; condition `applied` / `ended`; roll `mode` / `on` / `for`; `ends`,
// `affects`, `excludes`, `uses`), and every `given` field is identity: a given stated on one side only is another situation.
export const OPTIONAL_DETAIL = Object.freeze({ damage: Object.freeze(["type"]), move: Object.freeze(["distance"]) });

// One canonical assertion as `path → value` pairs (the value as the canonical string spells it: 20 and "20" are one).
const pairsOf = (canonical) => new Map(canonical.split(";").map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]));
const isDetailPath = (path) => {
  const [part, kind, field, ...rest] = path.split(".");
  return part === "expect" && !rest.length && Object.hasOwn(OPTIONAL_DETAIL, kind) && OPTIONAL_DETAIL[kind].includes(field);
};
const kindsOf = (pairs) => [...new Set([...pairs.keys()].filter((p) => p.startsWith("expect.")).map((p) => p.split(".")[1]))]
  .sort().join(",");
const givenOf = (pairs) => [...pairs].filter(([p]) => p.startsWith("given.")).map((x) => x.join("=")).sort().join(";");

/**
 * True when two canonical assertions say the same thing up to optional detail (Ruling R24): the same `given`, the same
 * expectation kinds, every field both state equal, and every field one side states alone a detail of its kind. A `free` text
 * on either side is never matched this way.
 */
export function sameUpToDetail(x, y) {
  if (isFree(x) || isFree(y)) return x === y;
  const a = pairsOf(x);
  const b = pairsOf(y);
  if (givenOf(a) !== givenOf(b) || kindsOf(a) !== kindsOf(b)) return false;
  for (const path of new Set([...a.keys(), ...b.keys()])) {
    if (a.has(path) && b.has(path)) { if (a.get(path) !== b.get(path)) return false; }
    else if (!isDetailPath(path)) return false;
  }
  return true;
}
/**
 * True when a review assertion `r` matches a draft-side assertion `d` (stated or implied) up to detail, in the safe direction
 * only (fix round 1): a detail the draft states and the review leaves out is tolerated (the reviewer is less specific); a
 * `distance` the review states and the draft does not is never taken (the draft side must pin it: an implied step distance,
 * which absorbs a stated move without one, matches exactly), and a damage `type` stated on one side only is not tolerated for
 * a `given` listed in `strictTypes` (two or more draft-side damage assertions of that given with different fractions: which
 * activity gets which result would hang on the type).
 */
export function draftMatches(d, r, { strictTypes = new Set() } = {}) {
  if (!sameUpToDetail(d, r)) return false;
  const a = pairsOf(d);
  const b = pairsOf(r);
  const strict = strictTypes.has(givenOf(a));
  for (const path of b.keys()) if (!a.has(path) && (path === "expect.move.distance" || (strict && path === "expect.damage.type"))) {
    return false;
  }
  return !(strict && a.has("expect.damage.type") && !b.has("expect.damage.type"));
}
// The givens whose draft-side damage assertions differ in fraction (draftMatches `strictTypes`).
function strictTypesOf(draft) {
  const fractions = new Map();
  for (const c of draft) {
    const p = pairsOf(c);
    if (!p.has("expect.damage.fraction")) continue;
    const g = givenOf(p);
    fractions.set(g, (fractions.get(g) ?? new Set()).add(p.get("expect.damage.fraction")));
  }
  return new Set([...fractions].filter(([, f]) => f.size > 1).map(([g]) => g));
}

// `x` says less than `y` and nothing else: the same up to detail, every pair of `x` in `y`, `y` longer.
const weaker = (x, y) => x !== y && sameUpToDetail(x, y) && [...pairsOf(x)].every(([p, v]) => pairsOf(y).get(p) === v);

// A side read as its strongest assertions: one that only says less than another of the same side ("push" beside "push 20
// feet") is absorbed by it and shares its fate. Returns `{ kept, absorbedBy }` (absorbed → the kept one that absorbs it).
function absorb(list) {
  const kept = list.filter((x) => !list.some((y) => weaker(x, y)));
  const absorbedBy = new Map(list.filter((x) => !kept.includes(x)).map((x) => [x, kept.find((y) => weaker(x, y))]));
  return { kept, absorbedBy };
}

// The rolls whose own damage is the item's (Ruling R24): what an activity of that type deals on that roll unless a rule says
// otherwise.
const BASELINE_ACTIVITY = Object.freeze({ hit: "attack", failedSave: "save" });
/**
 * True when a review-only canonical assertion only states the item's own baseline (Ruling R24): `damage.fraction = 1`, with or
 * without a `type`, given `hit` or `failedSave` alone, where the official item's structure (structure.mjs structureOf) has an
 * activity of that roll (an attack for `hit`, a save for `failedSave`) that deals damage (of that type, when one is stated),
 * the draft says nothing of the damage in that situation or in every situation (`given: {}`, noDamage), and the entry
 * changes no damage on that roll (draft-keys.mjs damageRollsOf: a damage step, saveDamage on a saved save, noDamage...).
 * Never anything else.
 */
export function isBaseline(canonical, { structure, draft = [], entry = {} } = {}) {
  if (isFree(canonical)) return false;
  const pairs = pairsOf(canonical);
  const roll = pairs.get("given.roll");
  const kind = Object.hasOwn(BASELINE_ACTIVITY, roll) ? BASELINE_ACTIVITY[roll] : undefined;
  // Fix round 1 (L3): never where the entry changes the item's damage on that roll (draft-keys.mjs DAMAGE_ROLLS).
  const touched = damageRollsOf(entry);
  if (touched === ALL_ROLLS || touched.includes(roll)) return false;
  if (!kind || givenOf(pairs) !== `given.roll=${roll}` || pairs.get("expect.damage.fraction") !== "1") return false;
  if (![...pairs.keys()].every((p) => p.startsWith("given.") || p === "expect.damage.fraction" || p === "expect.damage.type")) {
    return false;
  }
  const saysDamage = (c) => {
    const d = pairsOf(c);
    return [...d.keys()].some((p) => p.startsWith("expect.damage.")) && (givenOf(d) === "" || givenOf(d) === givenOf(pairs));
  };
  if (draft.some(saysDamage)) return false;
  const type = pairs.get("expect.damage.type");
  const activities = Array.isArray(structure?.activities) ? structure.activities : [];
  return activities.some((a) => a?.type === kind && Array.isArray(a.damage) && a.damage.length
    && (type === undefined || a.damage.some((p) => Array.isArray(p?.types) && p.types.includes(type))));
}

// A one-to-one matching of the drafts to the reviews that say the same up to detail (augmenting paths; the lists are short).
// Reviews that could be baseline are tried last, so that a match uses them only when nothing else serves.
function matchUpToDetail(drafts, reviews, isLast, strictTypes) {
  const ordered = [...reviews.filter((r) => !isLast(r)), ...reviews.filter(isLast)];
  const owner = new Map();
  const tryDraft = (d, seen) => {
    for (const r of ordered) {
      if (seen.has(r) || !draftMatches(d, r, { strictTypes })) continue;
      seen.add(r);
      if (!owner.has(r) || tryDraft(owner.get(r), seen)) { owner.set(r, d); return true; }
    }
    return false;
  };
  for (const d of drafts) tryDraft(d, new Set());
  return new Map([...owner].map(([r, d]) => [d, r]));
}

const byDraft = (x, y) => (x.draft < y.draft ? -1 : x.draft > y.draft ? 1 : x.review < y.review ? -1 : 1);

/**
 * The comparison of a drafted rule (`{ entry, assert }`) with a review's assertions (Rulings R9, R24), as data:
 * `{ agrees, onlyDraft, onlyReview, free, implied, baseline, detail }`, lists of canonical assertion strings (assert.mjs
 * normaliseAssert) and `detail` a list of `{ draft, review }` pairs of them.
 * The draft says `normaliseAssert(rule.assert) ∪ impliedAsserts(rule.entry)`; the review says `normaliseAssert(review)`.
 * Each side is read as its strongest assertions (one that says less than another of its side is absorbed by it). Then every
 * draft assertion must be matched by a distinct review assertion, equal or the same up to optional detail (sameUpToDetail:
 * a damage `type`, a move `distance`), and every review assertion must be matched or be the item's own baseline (isBaseline,
 * decided from `structure`, the official item's structure; without it nothing is baseline). A draft assertion is never
 * ignored. `onlyDraft` / `onlyReview` are what is left unmatched, `baseline` the review assertions ignored, `detail` the pairs
 * matched up to detail (absorbed assertions included). `free` is true when either side holds a `free` text: such a pair never
 * agrees, whatever else matches.
 */
export function compareAsserts(rule, review, { structure = null } = {}) {
  const implied = impliedAsserts(rule?.entry, { structure });
  const draft = [...new Set([...normaliseAssert(rule?.assert), ...implied])].sort();
  const reviewed = normaliseAssert(review);
  const free = [...draft, ...reviewed].some(isFree);
  const strictTypes = strictTypesOf(draft);
  const d = absorb(draft);
  const r = absorb(reviewed);
  const exact = d.kept.filter((x) => r.kept.includes(x));
  const baselineOf = (c) => isBaseline(c, { structure, draft, entry: rule?.entry });
  const matched = new Map(exact.map((x) => [x, x]));
  const loose = matchUpToDetail(d.kept.filter((x) => !matched.has(x)), r.kept.filter((x) => !exact.includes(x)), baselineOf,
    strictTypes);
  for (const [x, y] of loose) matched.set(x, y);
  const detail = [...loose].map(([x, y]) => ({ draft: x, review: y }));
  // An absorbed draft assertion shares the match of the one that absorbs it; an absorbed review one is matched with it.
  for (const [x, by] of d.absorbedBy) {
    if (!matched.has(by)) continue;
    matched.set(x, matched.get(by));
    detail.push({ draft: x, review: matched.get(by) });
  }
  const reviewMatched = new Set(matched.values());
  for (const [y, by] of r.absorbedBy) {
    const partner = [...matched].find(([, z]) => z === by)?.[0];
    if (partner !== undefined) { reviewMatched.add(y); detail.push({ draft: partner, review: y }); }
  }
  const onlyDraft = draft.filter((x) => !matched.has(x));
  const left = reviewed.filter((y) => !reviewMatched.has(y));
  const baseline = left.filter(baselineOf);
  const onlyReview = left.filter((y) => !baseline.includes(y));
  return {
    agrees: !onlyDraft.length && !onlyReview.length && !free, onlyDraft, onlyReview, free, implied, baseline,
    detail: detail.filter((p) => p.draft !== p.review).sort(byDraft)
  };
}

/**
 * True when a review-queue entry still holds its record: it is about the rule as it is (`review.rule`, its fingerprint). A
 * person who edits the rule settles the entry that way (every evidence goes stale): the record is then reviewed anew.
 */
export const queueHolds = (entry, record) =>
  isObject(entry?.review) && typeof entry.review.rule === "string" && isObject(record?.rule)
  && entry.review.rule === ruleFingerprint(record.rule);

// Why a result cannot be taken at all, before its assertions are looked at, or null.
function resultProblem(record, result, { offered, queued, by }) {
  const extra = unknownFields(result, REVIEW_RESULT_FIELDS);
  if (extra.length) return `unknown field ${echo(extra[0])}`;
  if (!record) return `unknown key ${echo(result.key)}`;
  if (!offered.has(result.key)) return "not offered by this batch (its key is not an entry of the batch file)";
  if (record.legacy === true) return "legacy record: it leaves legacy through a person, never through a review";
  if (!isObject(record.rule)) return "the record has no rule: nothing to review";
  if (typeof result.rule !== "string" || !HEX64.test(result.rule)) {
    return "rule must be the fingerprint the batch entry gave (64 hex characters)";
  }
  if (result.rule !== offered.get(result.key)) return "rule is not the rule this batch offered for the key";
  // Review Focus 4: a rule edited after the batch was cut is not the rule reviewed: the review does not apply to it.
  if (result.rule !== ruleFingerprint(record.rule)) {
    return "stale: the rule changed after the batch was cut (cut a new review batch for the rule as it is)";
  }
  const held = queued.get(result.key);
  if (held && queueHolds(held, record)) return "the record waits for a person in review-queue.json";
  const state = stateOf(record);
  if (state !== "gated") return `the state is ${state}, not gated: only gated rules are reviewed`;
  if (authorsOf(record).some((h) => h.toLowerCase() === by.toLowerCase())) {
    return "the reviewer is an author of the rule (its drafter or the person who signed it, case aside): a review must be"
      + " independent";
  }
  return confidenceProblem(result.confidence) ?? whyProblem(result.why);
}

// The handles recorded on a rule: who drafted it (evidence.drafted.by) and who signed it (evidence.person.by), when present.
// A rule a person wrote or edited after the draft is reviewed as it is, by someone who is neither.
export const authorsOf = (record) => [record?.evidence?.drafted?.by, record?.evidence?.person?.by]
  .filter((h) => typeof h === "string" && h !== "");

// The `free` texts of a list of assertions, as [where, text].
const freeTexts = (assertions) => assertions.flatMap((a, i) => ["given", "expect"]
  .filter((part) => typeof a?.[part]?.free === "string").map((part) => [`assert[${i}].${part}.free`, a[part].free]));

// Why the reviewer's strings quote the text, alone, or together with everything a queue entry would store beside them (the
// draft's free texts): read as stored (draft, why, review), in reverse, and with `why` first or last; or null.
function quotationProblem(why, assertions, text, draftAssertions) {
  const quotes = quotationCheck(text);
  const quoted = whyQuotes(why, text, quotes);
  if (quoted) return quoted;
  const frees = freeTexts(assertions);
  for (const [where, value] of frees) {
    if (quotes(value)) return `${where} quotes ${RULE_QUOTE_WORDS} or more consecutive words of the text`;
  }
  const mine = frees.map(([, v]) => v);
  const draft = freeTexts(Array.isArray(draftAssertions) ? draftAssertions : []).map(([, v]) => v);
  if (!mine.length && !draft.length) return null;
  const orders = [[...draft, why, ...mine], [...mine, why, ...draft], [why, ...draft, ...mine], [...draft, ...mine, why]];
  return orders.some((o) => quotes(o.join(" ")))
    ? `why and the free texts (the draft's included) together quote ${RULE_QUOTE_WORDS} or more consecutive words of the text`
    : null;
}

// One result: `{ reject: reason }`, `{ queue: entry }` or `{ apply: { record, next } }`. May throw (the caller catches).
function takeResult(result, ctx) {
  const { byKey, offered, queued, textOf, core, by, at, seen, structures } = ctx;
  if (!isObject(result)) return { reject: "result must be an object" };
  const forbidden = forbiddenKeyIn(result);
  if (forbidden) return { reject: `a key named ${forbidden.split(/[.[]/).pop()} (at ${forbidden})` };
  if (seen.has(result.key)) return { reject: "the key appears twice in this file" };
  seen.add(result.key);
  const record = byKey.get(result.key);
  const reason = resultProblem(record, result, { offered, queued, by });
  if (reason) return { reject: reason };
  if (Object.hasOwn(result, "outcome") && !REVIEW_OUTCOMES.includes(result.outcome)) {
    return { reject: `unknown outcome ${echo(result.outcome)} (${REVIEW_OUTCOMES.join(" or ")})` };
  }
  const unexpressed = result.outcome === "person";
  if (unexpressed && Object.hasOwn(result, "assert")) {
    return { reject: "outcome person carries no assert: it says the closed vocabulary cannot express the entry" };
  }
  if (!unexpressed && (!Array.isArray(result.assert) || !result.assert.length)) {
    return { reject: "assert: required, a non-empty array of { given, expect } (or outcome person, with no assert)" };
  }
  const assertions = unexpressed ? [] : result.assert;
  const problems = assertProblems(assertions, { vocabulary: core, at: "assert" });
  if (problems.length) {
    const shown = problems.slice(0, SHOWN_PROBLEMS).map((p) => p.slice(0, SHOWN_PROBLEM_CHARS));
    const more = problems.length > SHOWN_PROBLEMS ? ` (and ${problems.length - SHOWN_PROBLEMS} more)` : "";
    return { reject: `${shown.join("; ")}${more}` };
  }
  const text = textOf(record);
  if (text === null) return { reject: "no text in the cache: nothing to check the result against" };
  const quoted = quotationProblem(result.why, assertions, text, record.rule.assert);
  if (quoted) return { reject: quoted };

  const fingerprint = ruleFingerprint(record.rule);
  const comparison = compareAsserts(record.rule, assertions, { structure: structures.get(result.key) ?? null });
  const drafted = isObject(record.evidence?.drafted) ? record.evidence.drafted : {};
  const signed = record.evidence?.person;
  // Rulings R15, R21: a draft stamped for a person goes to one whatever the review says, with the comparison attached.
  const forPerson = drafted.person === true ? drafted.because : null;
  const queueReason = forPerson ?? (unexpressed ? "unexpressed"
    : comparison.onlyDraft.length || comparison.onlyReview.length ? "disagreement"
      : comparison.free ? "free-text" : result.confidence < QUEUE_THRESHOLD ? "low-confidence" : null);
  if (queueReason) {
    return { queue: {
      key: result.key, reason: queueReason, by, why: result.why, confidence: result.confidence,
      draft: { ...(typeof drafted.by === "string" ? { by: drafted.by } : {}),
        ...(typeof signed?.by === "string" ? { person: signed.by } : {}), rule: fingerprint,
        assert: structuredClone(record.rule.assert ?? []), implied: comparison.implied },
      review: { rule: fingerprint, assert: structuredClone(assertions), agrees: comparison.agrees,
        onlyDraft: comparison.onlyDraft, onlyReview: comparison.onlyReview, baseline: comparison.baseline,
        detail: comparison.detail }
    } };
  }
  const next = structuredClone(record);
  // Ruling R24 (fix round 1, V): an agreement that tolerated anything keeps what it tolerated, as canonical strings: the
  // review assertions taken as baseline and the [draft, review] pairs matched up to detail. Part of `emits`: the gates run
  // again before the record stands as reviewed (registry.mjs emittedFingerprint).
  const tolerated = comparison.baseline.length || comparison.detail.length
    ? { baseline: [...comparison.baseline], detail: comparison.detail.map((p) => [p.draft, p.review]) } : null;
  next.evidence = { ...next.evidence, reviewed: { by, at, agrees: true, rule: fingerprint, confidence: result.confidence,
    ...(tolerated ? { tolerated } : {}) } };
  return { apply: { record, next, tolerated: tolerated !== null } };
}

/**
 * Applies reviewer results to a copy of `records` (Task 6, docs/PIPELINE.md "Ingesting reviews"). For each result:
 * - rejected (`rejected`, `{ key, reason }`; nothing of it kept, nothing queued) when it is not an object or holds a key named
 *   __proto__, constructor or prototype; has a field outside REVIEW_RESULT_FIELDS (`evidence` included, own properties only);
 *   repeats a key of the file; names no record, a key the batch did not offer (`offered`, required: a Map of the batch
 *   file's keys to the rule fingerprint each entry carried), a legacy record or one without a rule; its `rule` is not the
 *   fingerprint the batch gave, or is no longer the record's (the rule changed after the cut: stale); the record waits in
 *   review-queue.json (an entry about the rule as it is, queueHolds), is not `gated`, or names the reviewer's handle among
 *   its authors (authorsOf: evidence.drafted.by, evidence.person.by; case aside); the confidence is outside 0..1, `why` is
 *   not one line of at most 200 characters;
 *   its `outcome` is neither absent, `assert` nor `person`; `assert` is not a non-empty list valid against the engine's
 *   enumerations (`core`), or is present with outcome `person`; the text is not in the cache; `why`, any `free` text, or
 *   `why` and the free texts of the review and the draft together (as a queue entry stores them) quote 8 words of the text;
 * - queued (`disagreed`, entries of review-queue.json, the comparison attached as data: `draft: { by?, person?, rule, assert,
 *   implied }`, `review: { rule, assert, agrees, onlyDraft, onlyReview, baseline, detail }`) when the draft is stamped for a
 *   person (reason: its `because`, Rulings R15, R21, agreement included), or else the reviewer answered outcome `person`
 *   (`unexpressed`, its `assert` stored as []), the assertions differ (`disagreement`, compareAsserts with Ruling R24's
 *   tolerances), hold a free text (`free-text`) or the confidence is below 0.7 (`low-confidence`);
 * - agreed otherwise: `evidence.reviewed = { by, at, agrees: true, rule, confidence, tolerated? }`, `rule` the rule's
 *   fingerprint, `tolerated` (only when R24 tolerated anything) `{ baseline: [review], detail: [[draft, review]] }` as
 *   canonical strings; such keys are also listed in `tolerated` of the return value (their gate evidence goes stale: `emits`
 *   covers the field). The rule is never changed.
 * `structures` (a Map of record key to the official item's structure, structure.mjs structureOf; default empty) is what the
 * baseline of R24 is decided from: a record without one gets no baseline.
 * `queue` is review-queue.json. Any exception on one result becomes its rejection (`internal: …`). A rejection repeats at most
 * 80 characters of any reviewer string. Inputs unchanged.
 */
export function ingestReviews(records, results, options = {}) {
  const { textDir, by, at = new Date().toISOString(), core, queue = [], offered, structures = new Map() } = options;
  if (!isReaderHandle(by)) throw new Error(`by must match ${BY} and not be "rule"`);
  if (!core || typeof core !== "object") throw new TypeError("ingestReviews needs core (loadCore: the engine's enumerations)");
  if (!(offered instanceof Map)) throw new TypeError("ingestReviews needs offered (a Map of the batch file's keys to rules)");
  if (!(structures instanceof Map)) throw new TypeError("structures must be a Map of record key to the official structure");
  const out = structuredClone(records);
  const context = {
    byKey: new Map(out.map((r) => [r.key, r])), offered, queued: new Map(queue.map((q) => [q?.key, q])),
    textOf: cachedText(textDir), core, by, at, seen: new Set(), structures
  };
  const agreed = [];
  const tolerated = [];
  const disagreed = [];
  const rejected = [];
  for (const result of Array.isArray(results) ? results : []) {
    let outcome;
    try { outcome = takeResult(result, context); } catch (e) { outcome = { reject: `internal: ${clip(e?.message ?? e)}` }; }
    if (outcome.reject !== undefined) {
      let key = null;
      try { key = typeof result?.key === "string" ? clip(result.key) : null; } catch { key = null; }
      rejected.push({ key, reason: clipEchoes(outcome.reject, result) });
    } else if (outcome.queue) disagreed.push(outcome.queue);
    else {
      const { record, next } = outcome.apply;
      Object.keys(record).forEach((k) => delete record[k]);
      Object.assign(record, next);
      agreed.push(next.key);
      if (outcome.apply.tolerated) tolerated.push(next.key);
    }
  }
  return { records: out, agreed, tolerated, disagreed, rejected };
}
