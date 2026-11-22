// Redrafting against two reviews (Ruling R41). A review-queue entry whose blind second review (Ruling R40) disagreed with the
// draft and read the text as the first review did (`second: { agrees: false, result: "read", withFirst: true }`) holds two
// independent readings of the TEXT that never saw the draft: they stay valid for any later draft of the same record while its
// text and its matched item are unchanged. `batch draft --redraft --against-reviews` cuts those records alone, blind;
// `ingest --draft --redraft --against-reviews` compares the new rule with both stored reviews, by the comparison a review
// ingest uses (review.mjs compareAsserts), and confirms it only when both agree at or above the threshold.
import { ruleFingerprint, stateOf } from "./registry.mjs";
import { AGAINST_RESULTS, REDRAFT_AGAINST_VIA } from "./schema.mjs";
import { SECOND_REVIEW_REASONS, compareAsserts, entryStale, ownerSigned, toleratedOf } from "./review.mjs";
import { atomise, normaliseAssert } from "./assert.mjs";
import { RULE_QUOTE_WORDS, quotationCheck } from "./gates.mjs";
import { isPartial } from "./leaves.mjs";
import { QUEUE_THRESHOLD } from "./intake.mjs";

export { AGAINST_RESULTS, REDRAFT_AGAINST_VIA };
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

/** Why a record is not cut by `batch draft --redraft --against-reviews`, as the cut and its report name it. */
export const AGAINST_SKIP_REASONS = Object.freeze([
  "not in review-queue.json", "other reason", "no second review against the draft", "redrafted against reviews", "owner",
  "legacy", "stale", "not an entry record", "changed since the reviews", "no text"
]);
const [NOT_QUEUED, OTHER, NO_SECOND, MARKED, OWNER, LEGACY, STALE, NOT_ENTRY, CHANGED, NO_TEXT] = AGAINST_SKIP_REASONS;

// The second review that read the text as the first did, against the draft (Ruling R40's mark).
const againstTheDraft = (second) => isObject(second) && second.agrees === false && second.result === "read"
  && second.withFirst === true && Array.isArray(second.assert) && second.assert.length > 0;

/**
 * True when the record's text and matched item are those both reviews read. The registry keeps no fingerprint on a queue
 * entry, so this stands on the ones it keeps on the record: `text.sha256` (inventory dates `textChangedAt` whenever it
 * changes on a record that has a verdict, and drops `evidence.gates`) and, per origin the rule names, the matched item's
 * `items[].data.sha256`, which `evidence.gates.items` records when the gates run (registry.mjs gatedItems; inventory drops
 * the gate evidence when it changes, and the gates keep their `at` while nothing changes). So: no `textChangedAt`, the
 * record `gated` (gate evidence current: rule, emits and item fingerprints those of today), and that evidence dated no
 * later than the second review (`evidence.gates.at` <= `second.at`): gates run again after it, on another text or item or
 * another engine, refuse the record (fail closed).
 */
export function unchangedSinceReviews(entry, record) {
  if (record?.textChangedAt !== undefined) return false;
  if (stateOf(record) !== "gated") return false;
  const gated = Date.parse(record.evidence?.gates?.at);
  const read = Date.parse(entry?.second?.at);
  return Number.isFinite(gated) && Number.isFinite(read) && gated <= read;
}

/**
 * Why a review-queue `entry` and its `record` are not redrafted against the two reviews (Ruling R41), or null when they
 * are: AGAINST_SKIP_REASONS, in that order. Accepted: an entry of reason `disagreement` or `low-confidence` whose `second`
 * says `agrees: false, result: "read", withFirst: true` (with its assertions), no `redraftedAgainst` mark (once only), a rule
 * no owner wrote or signed (review.mjs ownerSigned), not legacy, the entry about the rule as it is, an `entry` record with a
 * text, unchanged since the reviews (unchangedSinceReviews). `owners`: the handles of docs/owners.json, required.
 */
export function againstReviewsSkipReason(entry, record, { owners } = {}) {
  if (!Array.isArray(owners)) throw new TypeError("againstReviewsSkipReason needs owners (the handles of docs/owners.json)");
  if (!isObject(entry) || !isObject(record) || entry.key !== record.key) return NOT_QUEUED;
  if (!SECOND_REVIEW_REASONS.includes(entry.reason)) return OTHER;
  if (!againstTheDraft(entry.second)) return NO_SECOND;
  if (Object.hasOwn(entry, "redraftedAgainst")) return MARKED;
  if (ownerSigned(entry, record, owners)) return OWNER;
  if (record.legacy === true) return LEGACY;
  if (entryStale(entry, record)) return STALE;
  if (record.verdict !== "entry") return NOT_ENTRY;
  if (!unchangedSinceReviews(entry, record)) return CHANGED;
  if (!record.text) return NO_TEXT;
  return null;
}
export const redraftableAgainst = (entry, record, ctx) => againstReviewsSkipReason(entry, record, ctx) === null;

// How a new rule stands against one stored review: agreeing at or above the threshold of that reviewer's own confidence,
// agreeing below it ("unsure"), or not agreeing.
const standing = (comparison, confidence) => (!comparison.agrees ? false : confidence >= QUEUE_THRESHOLD ? true : "unsure");

// The free texts of a rule's assertions (they would sit in the queue entry beside the first reviewer's `why`).
const freeTexts = (assertions) => list(assertions).flatMap((a) => ["given", "expect"]
  .map((part) => a?.[part]?.free).filter((v) => typeof v === "string"));

/**
 * The outcome of a new rule (on `next`, the record as the draft ingest would write it) against the two reviews `entry`
 * stores (the first: `review.assert`, `confidence`, `by`; the second: `second.assert`, `.confidence`, `.by`, `.at`),
 * compared as a review ingest compares (compareAsserts, the official `structure` for the baseline; no new tolerance):
 * - `{ confirm: record }` when both agree at or above the threshold and the draft is not stamped for a person:
 *   `evidence.reviewed = { by: <first>, at, agrees: true, rule, confidence: <first's>, tolerated?, via:
 *   "redraft-against-reviews", second: { by, at, confidence, assert, tolerated? } }`;
 * - `{ keep: entry }` otherwise: the entry with its `draft` and `review` about the new rule (the first review compared with
 *   it), its `reason` (the draft's stamp for a person, else `disagreement` when either comparison differs, `free-text` when
 *   only a free text stands between them, `low-confidence` when a reviewer was unsure), its `by`, `why`, `confidence` and
 *   `second` as they were, plus `redraftedAgainst: { by, at, result: "compared", agreesFirst, agreesSecond }`;
 * - `{ reject }` when the entry so kept would quote the text (the first `why` with the new draft's free texts).
 * `by` and `at`: the drafter's handle and the ingest's date. `text`: the record's cached text.
 */
export function againstOutcome(entry, next, { by, at, structure = null, text }) {
  const rule = next.rule;
  const fingerprint = ruleFingerprint(rule);
  const first = compareAsserts(rule, list(entry.review?.assert), { structure });
  const second = compareAsserts(rule, list(entry.second?.assert), { structure });
  const agreesFirst = standing(first, entry.confidence);
  const agreesSecond = standing(second, entry.second?.confidence);
  const drafted = next.evidence?.drafted ?? {};
  const forPerson = drafted.person === true ? drafted.because : null;
  if (agreesFirst === true && agreesSecond === true && !forPerson) {
    const record = structuredClone(next);
    const own = toleratedOf(first);
    const theirs = toleratedOf(second);
    record.evidence.reviewed = { by: entry.by, at, agrees: true, rule: fingerprint, confidence: entry.confidence,
      ...(own ? { tolerated: own } : {}), via: REDRAFT_AGAINST_VIA,
      second: { by: entry.second.by, at: entry.second.at, confidence: entry.second.confidence,
        assert: normaliseAssert(atomise(entry.second.assert)), ...(theirs ? { tolerated: theirs } : {}) } };
    return { confirm: record };
  }
  const frees = freeTexts(rule.assert);
  if (frees.length && typeof text === "string") {
    const quotes = quotationCheck(text);
    if (quotes([entry.why, ...frees].join(" ")) || quotes([...frees, entry.why].join(" "))) {
      return { reject: `the first review's why and the draft's free texts together quote ${RULE_QUOTE_WORDS} or more`
        + " consecutive words of the text" };
    }
  }
  const differs = [first, second].some((c) => c.onlyDraft.length || c.onlyReview.length);
  const reason = forPerson
    ?? (differs ? "disagreement" : [first, second].some((c) => c.free) ? "free-text" : "low-confidence");
  const kept = structuredClone(entry);
  kept.reason = reason;
  kept.draft = { by: drafted.by, rule: fingerprint, assert: structuredClone(list(rule.assert)), implied: first.implied,
    ...(isPartial(rule) ? { leaves: structuredClone(rule.leaves) } : {}) };
  kept.review = { rule: fingerprint, assert: structuredClone(list(entry.review?.assert)), agrees: first.agrees,
    onlyDraft: first.onlyDraft, onlyReview: first.onlyReview, baseline: first.baseline, detail: first.detail,
    ...(first.left.length ? { left: first.left } : {}) };
  kept.redraftedAgainst = { by, at, result: "compared", agreesFirst, agreesSecond };
  return { keep: kept };
}

/** The entry as it was, plus the mark of a redraft against its reviews that took nothing (`result`: declined, rejected, missing). */
export const againstMark = (entry, { by, at, result }) => {
  if (!AGAINST_RESULTS.includes(result) || result === "compared") throw new TypeError(`againstMark: result ${result}`);
  return { ...structuredClone(entry), redraftedAgainst: { by, at, result } };
};
