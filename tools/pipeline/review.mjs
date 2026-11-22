// The intake of what reviewer agents wrote (`ingest <results-file> --review`, stage 5c). A reviewer is blind to the drafted rule:
// from the rule text and the item structure alone it says, in the closed vocabulary of `rule.assert` (assert.mjs), what must be
// true at the table. The tool compares those assertions with the drafted rule's (its `assert` plus what its entry implies,
// Ruling R9): agreement makes the record `reviewed`, anything else waits for a person in registry/review-queue.json. A review
// never changes the rule, and nothing here writes `evidence` other than `reviewed` (never `evidence.person`).
import { ruleFingerprint, stateOf } from "./registry.mjs";
import { BY, isReaderHandle } from "./schema.mjs";
import { assertProblems, impliedAsserts, normaliseAssert } from "./assert.mjs";
import { RULE_QUOTE_WORDS, quotationCheck } from "./gates.mjs";
import {
  QUEUE_THRESHOLD, cachedText, clip, clipEchoes, confidenceProblem, echo, forbiddenKeyIn, unknownFields, whyProblem, whyQuotes
} from "./intake.mjs";

// The fields of one review result (docs/PIPELINE.md, "Brief for a reviewer agent"); anything else (`evidence`, `verdict`,
// `agrees`, `by`...) is the tools' or a person's.
export const REVIEW_RESULT_FIELDS = Object.freeze(["key", "rule", "assert", "why", "confidence"]);
// The reasons a review-queue entry carries besides a draft's stamp for a person (schema.mjs DRAFTED_FOR_PERSON).
export const REVIEW_REASONS = Object.freeze(["disagreement", "free-text", "low-confidence"]);
const SHOWN_PROBLEMS = 4;
const SHOWN_PROBLEM_CHARS = 200;
const HEX64 = /^[0-9a-f]{64}$/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isFree = (canonical) => canonical.split(";").some((pair) => pair === "given.free=*" || pair === "expect.free=*");

/**
 * The comparison of a drafted rule (`{ entry, assert }`) with a review's assertions (Ruling R9), as data:
 * `{ agrees, onlyDraft, onlyReview, free, implied }`, each list of canonical assertion strings (assert.mjs normaliseAssert).
 * The draft says `normaliseAssert(rule.assert) ∪ impliedAsserts(rule.entry)`; the review says `normaliseAssert(review)`.
 * Tolerated: order, duplicates, an implied assertion the draft left out of `assert` (its entry says it). Not tolerated: any
 * assertion on one side only (`onlyDraft`: the review misses it, an implied one included; `onlyReview`: the review adds it),
 * so a review with fewer or more expectations disagrees, as does any other moment, roll, target, condition, fraction, ending
 * or move. `free` is true when either side holds a `free` text: such a pair never agrees, whatever else matches.
 */
export function compareAsserts(rule, review) {
  const implied = impliedAsserts(rule?.entry);
  const draft = [...new Set([...normaliseAssert(rule?.assert), ...implied])].sort();
  const reviewed = normaliseAssert(review);
  const onlyDraft = draft.filter((a) => !reviewed.includes(a));
  const onlyReview = reviewed.filter((a) => !draft.includes(a));
  const free = [...draft, ...reviewed].some(isFree);
  return { agrees: !onlyDraft.length && !onlyReview.length && !free, onlyDraft, onlyReview, free, implied };
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
  const drafted = record.evidence?.drafted;
  if (!isObject(drafted) || typeof drafted.by !== "string") return "no drafted evidence: only drafted rules are reviewed";
  if (drafted.by.toLowerCase() === by.toLowerCase()) {
    return "the reviewer is the drafter (same handle, case aside): a review must be independent";
  }
  return confidenceProblem(result.confidence) ?? whyProblem(result.why);
}

// The `free` texts of a list of assertions, as [where, text].
const freeTexts = (assertions) => assertions.flatMap((a, i) => ["given", "expect"]
  .filter((part) => typeof a?.[part]?.free === "string").map((part) => [`assert[${i}].${part}.free`, a[part].free]));

// Why the reviewer's strings quote the text, alone or together (why first, then the free texts, and the reverse), or null.
function quotationProblem(why, assertions, text) {
  const quotes = quotationCheck(text);
  const quoted = whyQuotes(why, text, quotes);
  if (quoted) return quoted;
  const frees = freeTexts(assertions);
  for (const [where, value] of frees) {
    if (quotes(value)) return `${where} quotes ${RULE_QUOTE_WORDS} or more consecutive words of the text`;
  }
  const values = frees.map(([, v]) => v);
  if (values.length && (quotes([why, ...values].join(" ")) || quotes([...values, why].join(" ")))) {
    return `why and the free texts together quote ${RULE_QUOTE_WORDS} or more consecutive words of the text`;
  }
  return null;
}

// One result: `{ reject: reason }`, `{ queue: entry }` or `{ apply: { record, next } }`. May throw (the caller catches).
function takeResult(result, ctx) {
  const { byKey, offered, queued, textOf, core, by, at, seen } = ctx;
  if (!isObject(result)) return { reject: "result must be an object" };
  const forbidden = forbiddenKeyIn(result);
  if (forbidden) return { reject: `a key named ${forbidden.split(/[.[]/).pop()} (at ${forbidden})` };
  if (seen.has(result.key)) return { reject: "the key appears twice in this file" };
  seen.add(result.key);
  const record = byKey.get(result.key);
  const reason = resultProblem(record, result, { offered, queued, by });
  if (reason) return { reject: reason };
  if (!Array.isArray(result.assert) || !result.assert.length) {
    return { reject: "assert: required, a non-empty array of { given, expect }" };
  }
  const problems = assertProblems(result.assert, { vocabulary: core, at: "assert" });
  if (problems.length) {
    const shown = problems.slice(0, SHOWN_PROBLEMS).map((p) => p.slice(0, SHOWN_PROBLEM_CHARS));
    const more = problems.length > SHOWN_PROBLEMS ? ` (and ${problems.length - SHOWN_PROBLEMS} more)` : "";
    return { reject: `${shown.join("; ")}${more}` };
  }
  const text = textOf(record);
  if (text === null) return { reject: "no text in the cache: nothing to check the result against" };
  const quoted = quotationProblem(result.why, result.assert, text);
  if (quoted) return { reject: quoted };

  const fingerprint = ruleFingerprint(record.rule);
  const comparison = compareAsserts(record.rule, result.assert);
  const drafted = record.evidence.drafted;
  // Rulings R15, R21: a draft stamped for a person goes to one whatever the review says, with the comparison attached.
  const forPerson = drafted.person === true ? drafted.because : null;
  const queueReason = forPerson ?? (comparison.onlyDraft.length || comparison.onlyReview.length ? "disagreement"
    : comparison.free ? "free-text" : result.confidence < QUEUE_THRESHOLD ? "low-confidence" : null);
  if (queueReason) {
    return { queue: {
      key: result.key, reason: queueReason, by, why: result.why, confidence: result.confidence,
      draft: { by: drafted.by, rule: fingerprint, assert: structuredClone(record.rule.assert ?? []), implied: comparison.implied },
      review: { rule: fingerprint, assert: structuredClone(result.assert), agrees: comparison.agrees,
        onlyDraft: comparison.onlyDraft, onlyReview: comparison.onlyReview }
    } };
  }
  const next = structuredClone(record);
  next.evidence = { ...next.evidence, reviewed: { by, at, agrees: true, rule: fingerprint, confidence: result.confidence } };
  return { apply: { record, next } };
}

/**
 * Applies reviewer results to a copy of `records` (Task 6, docs/PIPELINE.md "Ingesting reviews"). For each result:
 * - rejected (`rejected`, `{ key, reason }`; nothing of it kept, nothing queued) when it is not an object or holds a key named
 *   __proto__, constructor or prototype; has a field outside REVIEW_RESULT_FIELDS (`evidence` included, own properties only);
 *   repeats a key of the file; names no record, a key the batch did not offer (`offered`, required: a Map of the batch
 *   file's keys to the rule fingerprint each entry carried), a legacy record or one without a rule; its `rule` is not the
 *   fingerprint the batch gave, or is no longer the record's (the rule changed after the cut: stale); the record waits in
 *   review-queue.json (an entry about the rule as it is, queueHolds), is not `gated`, has no drafted evidence, or was drafted
 *   under the reviewer's handle (case aside); the confidence is outside 0..1, `why` is not one line of at most 200 characters;
 *   `assert` is not a non-empty list valid against the engine's enumerations (`core`); the text is not in the cache; `why`,
 *   any `free` text, or `why` and the free texts together (either order) quote 8 words of the text;
 * - queued (`disagreed`, entries of review-queue.json, the comparison attached as data: `draft: { by, rule, assert, implied }`,
 *   `review: { rule, assert, agrees, onlyDraft, onlyReview }`) when the draft is stamped for a person (reason: its
 *   `because`, Rulings R15, R21, agreement included), or else the assertions differ (`disagreement`), hold a free text
 *   (`free-text`) or the confidence is below 0.7 (`low-confidence`);
 * - agreed otherwise: `evidence.reviewed = { by, at, agrees: true, rule, confidence }`, `rule` the rule's fingerprint. The
 *   rule is never changed.
 * `queue` is review-queue.json. Any exception on one result becomes its rejection (`internal: …`). A rejection repeats at most
 * 80 characters of any reviewer string. Inputs unchanged.
 */
export function ingestReviews(records, results, options = {}) {
  const { textDir, by, at = new Date().toISOString(), core, queue = [], offered } = options;
  if (!isReaderHandle(by)) throw new Error(`by must match ${BY} and not be "rule"`);
  if (!core || typeof core !== "object") throw new TypeError("ingestReviews needs core (loadCore: the engine's enumerations)");
  if (!(offered instanceof Map)) throw new TypeError("ingestReviews needs offered (a Map of the batch file's keys to rules)");
  const out = structuredClone(records);
  const context = {
    byKey: new Map(out.map((r) => [r.key, r])), offered, queued: new Map(queue.map((q) => [q?.key, q])),
    textOf: cachedText(textDir), core, by, at, seen: new Set()
  };
  const agreed = [];
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
    }
  }
  return { records: out, agreed, disagreed, rejected };
}
