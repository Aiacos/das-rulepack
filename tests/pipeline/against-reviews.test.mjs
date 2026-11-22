// Redrafting against two reviews (Ruling R41): a review-queue entry whose second review (Ruling R40) disagreed with the draft
// and read the text as the first review did (`second: { agrees: false, result: "read", withFirst: true }`) holds two blind
// readings of the TEXT, valid for any later draft while the text and the item are unchanged. `batch draft --redraft
// --against-reviews` cuts those records alone, blind; `ingest --draft --redraft --against-reviews` replaces the rule with a
// draft that passes every draft check, then compares it with BOTH stored reviews (the review comparison, no new tolerance):
// both agree at or above the threshold → reviewed by the first reviewer, `via: "redraft-against-reviews"`, the second beside
// it, the entry out of the queue; otherwise the entry stays, its draft brought up to date, marked `redraftedAgainst` (once).
// Synthetic fixtures only: invented entries, invented words.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGAINST_SKIP_REASONS, againstReviewsSkipReason, redraftableAgainst
} from "../../tools/pipeline/against.mjs";
import { AGAINST_RESULTS, REDRAFT_AGAINST_VIA } from "../../tools/pipeline/schema.mjs";
import { cutDraftBatches } from "../../tools/pipeline/batch.mjs";
import { ingestDrafts, withoutRule } from "../../tools/pipeline/draft.mjs";
import { emissionOf } from "../../tools/pipeline/generate.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { normaliseAssert } from "../../tools/pipeline/assert.mjs";
import { dataFingerprint } from "../../tools/pipeline/dumps.mjs";
import {
  emittedFingerprint, gatedItems, loadBook, loadQueue, ruleFingerprint, saveBook, saveQueue, stateOf, validateQueueEntry,
  validateRecord
} from "../../tools/pipeline/registry.mjs";
import { countsLine } from "../../tools/books-progress.mjs";

const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
const AT = "2026-01-01T00:00:00.000Z";
const SECOND_AT = "2026-06-01T00:00:00.000Z";
const LATER = "2026-11-22T00:00:00.000Z";
const A_OFF = "Af11Bf22Cf33Df44";
const E_OFF = "Ef11Ef22Ef33Ef44";
const OWNERS = ["owner"];
const KEY = "tst:spell:frost-glimmer";
const core = {
  version: "9.9.9", facts: ["actor.prone"], identifiers: new Set(), vocabulary: new Set(), validateEntry: () => [],
  moments: ["failedSave", "endOfTurn"], statuses: ["prone"], creatureTypes: ["undead"], moveModes: ["push"],
  effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"], shipped: {}
};
const HALF = { given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } };
const HALF_FIRE = { given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5, type: "fire" } } };
const NONE = { given: { roll: "savedSave" }, expect: { damage: { fraction: 0 } } };
const PRONE = { given: { roll: "failedSave" }, expect: { condition: { applied: "prone" } } };
// The words of the queue that must never reach the drafter: the first reviewer's line and the old rule's prose.
const FIRST_WHY = "the wizzle seems to halve the quux";
const OLD_ADDS = "Zorbly the quux vanishes for the wizzle.";

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "against-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

// The old rule: nothing on a saved save. Both reviewers read half.
const oldRule = () => ({ handledIn: "table", adds: OLD_ADDS, entry: { saveDamage: { [A_OFF]: "none" } },
  origins: ["official"], assert: [NONE] });
const newRule = (over = {}) => ({ handledIn: "table", adds: "A save halves the damage.",
  entry: { saveDamage: { [A_OFF]: "half" } }, origins: ["official"], assert: [HALF], ...over });
// A record as the gates left it before the second review: drafted by `drafter-zz9`, every gate passed.
const gated = (over = {}, { drafted = {}, person, gatesAt = AT } = {}) => {
  const r = {
    key: KEY, name: "Frost Glimmer", kind: "spell", book: "TST", page: 3, edition: "2024", identifier: "frost-glimmer",
    text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
    items: [{ origin: "official", match: "matched", identifier: "frost-glimmer", docId: "Do11Do22Do33Do44",
      activities: [A_OFF], effects: [E_OFF], data: { sha256: "a".repeat(64) } }],
    verdict: "entry", why: "a save changes it", evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9 } },
    rule: oldRule(), ...over
  };
  if (drafted !== null) {
    r.evidence.drafted = { by: "drafter-zz9", at: AT, core: "9.9.9", rule: ruleFingerprint(r.rule), ...drafted };
  }
  if (person) r.evidence.person = { by: person, because: "written by hand", rule: ruleFingerprint(r.rule) };
  r.evidence.gates = { at: gatesAt, core: "9.9.9", rule: ruleFingerprint(r.rule), emits: emittedFingerprint(r),
    passed: ["schema", "validator", "ids", "fixes", "text", "unique"], items: gatedItems(r) };
  return r;
};
// The second review's mark as Ruling R40 leaves it: it read half, as the first did, against the draft.
const secondMark = (over = {}) => ({ by: "reviewer-2", at: SECOND_AT, agrees: false, result: "read", confidence: 0.8,
  assert: [HALF], onlyDraft: normaliseAssert([NONE]), onlyReview: normaliseAssert([HALF]), withFirst: true, ...over });
const queued = (r, over = {}) => ({
  key: r.key, reason: "disagreement", by: "reviewer-1", why: FIRST_WHY, confidence: 0.8,
  draft: { by: "drafter-zz9", rule: ruleFingerprint(r.rule), assert: [NONE], implied: normaliseAssert([NONE]) },
  review: { rule: ruleFingerprint(r.rule), assert: [HALF], agrees: false, onlyDraft: normaliseAssert([NONE]),
    onlyReview: normaliseAssert([HALF]), baseline: [], detail: [] },
  second: secondMark(), ...over
});
const ctx = { owners: OWNERS };

describe("redraftableAgainst: two blind reviews against the draft, still valid for the record", () => {
  it("accepts a disagreement or low-confidence entry whose second review read what the first read", () => {
    const r = gated();
    expect(againstReviewsSkipReason(queued(r), r, ctx)).toBeNull();
    expect(redraftableAgainst(queued(r), r, ctx)).toBe(true);
    expect(redraftableAgainst(queued(r, { reason: "low-confidence" }), r, ctx)).toBe(true);
  });

  it("refuses every other entry, each with a reason of the closed list", () => {
    const r = gated();
    const why = (entry, record = r) => againstReviewsSkipReason(entry, record, ctx);
    expect(why(undefined)).toBe("not in review-queue.json");
    expect(why(queued(r, { key: "tst:spell:other" }))).toBe("not in review-queue.json");
    for (const reason of ["free-text", "unexpressed", "noReactions"]) expect(why(queued(r, { reason }))).toBe("other reason");
    const { second, ...unmarked } = queued(r);
    expect(why(unmarked)).toBe("no second review against the draft");
    expect(why(queued(r, { second: secondMark({ withFirst: undefined }) }))).toBe("no second review against the draft");
    expect(why(queued(r, { second: secondMark({ agrees: "unsure" }) }))).toBe("no second review against the draft");
    expect(why(queued(r, { second: { by: "reviewer-2", at: SECOND_AT, agrees: "unsure", result: "missing" } })))
      .toBe("no second review against the draft");
    const mark = { by: "drafter-v1", at: LATER, result: "declined" };
    expect(why(queued(r, { redraftedAgainst: mark }))).toBe("redrafted against reviews");
    const signed = gated({}, { person: "owner" });
    expect(why(queued(signed), signed)).toBe("owner");
    const byOwner = gated({}, { drafted: { by: "OWNER" } });
    expect(why(queued(byOwner), byOwner)).toBe("owner");
    const stamped = gated({}, { drafted: { person: true, because: "noReactions" } });
    expect(why(queued(stamped), stamped)).toBe("owner");
    expect(why(queued(r), { ...r, legacy: true })).toBe("legacy");
    expect(why(queued(r, { draft: { ...queued(r).draft, rule: "e".repeat(64) } }))).toBe("stale");
    expect(why(queued(r), { ...r, verdict: "code" })).toBe("not an entry record");
    expect(why(queued(r), { ...r, text: null })).toBe("no text");
    for (const w of [undefined, null, "other reason", "owner", "stale"]) {
      if (w) expect(AGAINST_SKIP_REASONS).toContain(w);
    }
    expect(() => againstReviewsSkipReason(queued(r), r, {})).toThrow(/owners/);
  });

  it("refuses a record whose text or item changed since the reviews (stale text, stale item)", () => {
    const why = (record) => againstReviewsSkipReason(queued(gated()), record, ctx);
    // Gate evidence written after the second review: the gates ran again on another text or item.
    expect(why(gated({}, { gatesAt: LATER }))).toBe("changed since the reviews");
    // No current gate evidence: inventory dropped it on a text or item change.
    const r = gated();
    expect(why({ ...r, evidence: { ...r.evidence, gates: undefined } })).toBe("changed since the reviews");
    expect(why({ ...r, items: [{ ...r.items[0], data: { sha256: "f".repeat(64) } }] })).toBe("changed since the reviews");
    // The text changed after the verdict: dated by inventory.
    expect(why({ ...r, textChangedAt: AT })).toBe("changed since the reviews");
    expect(AGAINST_SKIP_REASONS).toContain("changed since the reviews");
  });
});

describe("batch draft --redraft --against-reviews: those records alone, as ordinary blind draft entries", () => {
  const other = () => gated({ key: "tst:spell:cold-snap", name: "Cold Snap", identifier: "cold-snap" });
  const cut = (records, queue, over = {}) => cutDraftBatches(records, { core, redraft: true, againstReviews: true,
    reviewQueue: queue, owners: OWNERS, ...over });

  it("cuts only the redraftable entries, marked redraft and againstReviews, in the draft series", () => {
    const a = gated();
    const b = other();
    const batches = cut([a, b], [queued(a), queued(b, { redraftedAgainst: { by: "d-1", at: LATER, result: "missing" } })],
      { after: { tst: 4 } });
    expect(batches.map((x) => x.id)).toEqual(["tst-draft-005"]);
    expect(batches[0]).toMatchObject({ stage: "draft", redraft: true, againstReviews: true });
    expect(batches[0].entries.map((e) => e.key)).toEqual([KEY]);
    expect(cut([a], [])).toEqual([]);
  });

  it("is blind: nothing of the old draft, of either review, of the queue's reason or why", () => {
    const r = gated();
    const [batch] = cut([r], [queued(r)]);
    const text = JSON.stringify(batch);
    for (const word of [FIRST_WHY, OLD_ADDS, "reviewer-1", "reviewer-2", "drafter-zz9", "disagreement", "withFirst",
      "savedSave", "none"]) {
      expect(text).not.toContain(word);
    }
    // The same entry as a plain cut gives for the record without its rule.
    const [plain] = cutDraftBatches([withoutRule(r)], { core });
    expect(batch.entries).toEqual(plain.entries);
  });

  it("goes with redraft only, and needs the owners", () => {
    expect(() => cutDraftBatches([gated()], { core, againstReviews: true, reviewQueue: [], owners: OWNERS }))
      .toThrow(/redraft/);
    expect(() => cutDraftBatches([gated()], { core, redraft: true, againstReviews: true, reviewQueue: [] }))
      .toThrow(/owners/);
  });
});

const run = (records, results, queue, over = {}) => ingestDrafts(records, results, {
  textDir, by: "drafter-v041", at: LATER, core, offered: new Set(records.map((r) => r.key)), redraft: true,
  againstReviews: true, reviewQueue: queue, owners: OWNERS, ...over
});
const result = (over = {}) => ({ key: KEY, outcome: "rule", why: "half on a save", confidence: 0.9, rule: newRule(),
  ...over });
// The record once `npm run gates` passed on the new rule.
const regated = (r) => ({ ...r, evidence: { ...r.evidence, gates: { at: LATER, core: "9.9.9", rule: ruleFingerprint(r.rule),
  emits: emittedFingerprint(r), passed: ["schema", "validator", "ids", "fixes", "text", "unique"], items: gatedItems(r) } } });

describe("ingest --draft --redraft --against-reviews: a new rule that agrees with both reviews", () => {
  it("replaces the rule and is reviewed by the first reviewer, the second beside it; the entry leaves the queue", () => {
    const r = gated();
    const out = run([r], [result()], [queued(r)]);
    expect(out.rejected).toEqual([]);
    expect(out.applied).toEqual([KEY]);
    expect(out.confirmed).toEqual([KEY]);
    expect(out.kept).toEqual([]);
    expect(out.marked).toEqual([]);
    expect(out.queued).toEqual([]);
    const [next] = out.records;
    expect(next.rule).toMatchObject({ entry: { saveDamage: { [A_OFF]: "half" } }, assert: [HALF] });
    expect(next.evidence.drafted).toMatchObject({ by: "drafter-v041", at: LATER, redrafted: true });
    expect(next.evidence.reviewed).toEqual({ by: "reviewer-1", at: LATER, agrees: true, rule: ruleFingerprint(next.rule),
      confidence: 0.8, via: REDRAFT_AGAINST_VIA, second: { by: "reviewer-2", at: SECOND_AT, confidence: 0.8,
        assert: normaliseAssert([HALF]) } });
    expect(REDRAFT_AGAINST_VIA).toBe("redraft-against-reviews");
    expect(next.evidence).not.toHaveProperty("gates");
    expect(validateRecord(next)).toEqual([]);
    expect(stateOf(next)).toBe("drafted");
    expect(stateOf(regated(next))).toBe("reviewed");
  });

  it("uses the review comparison as it is: a tolerated detail is recorded for each review", () => {
    const r = gated();
    const out = run([r], [result({ rule: newRule({ assert: [HALF_FIRE] }) })], [queued(r)]);
    expect(out.confirmed).toEqual([KEY]);
    const { reviewed } = out.records[0].evidence;
    const pair = [normaliseAssert([HALF_FIRE])[0], normaliseAssert([HALF])[0]];
    expect(reviewed.tolerated).toEqual({ baseline: [], detail: [pair] });
    expect(reviewed.second.tolerated).toEqual({ baseline: [], detail: [pair] });
    expect(validateRecord(out.records[0])).toEqual([]);
  });
});

describe("ingest --draft --redraft --against-reviews: a new rule that does not agree with both", () => {
  const expectKept = (out, was, { reason, agreesFirst, agreesSecond }) => {
    expect(out.rejected).toEqual([]);
    expect(out.confirmed).toEqual([]);
    expect(out.applied).toEqual([KEY]);
    expect(out.marked).toEqual([]);
    expect(out.kept).toHaveLength(1);
    const [entry] = out.kept;
    const [next] = out.records;
    const fp = ruleFingerprint(next.rule);
    expect(entry).toMatchObject({ key: KEY, reason, by: "reviewer-1", why: FIRST_WHY, confidence: was.confidence,
      second: was.second, redraftedAgainst: { by: "drafter-v041", at: LATER, result: "compared", agreesFirst,
        agreesSecond } });
    expect(entry.draft).toMatchObject({ by: "drafter-v041", rule: fp, assert: next.rule.assert });
    expect(entry.review).toMatchObject({ rule: fp, assert: was.review.assert });
    expect(validateQueueEntry(entry, { queue: "review", vocabulary: core })).toEqual([]);
    expect(next.evidence).not.toHaveProperty("reviewed");
    expect(next.evidence.drafted.redrafted).toBe(true);
    return { entry, next };
  };

  it("agrees with the first only: the new rule is kept, the entry stays a disagreement, its draft brought up to date", () => {
    const r = gated();
    const queue = [queued(r, { second: secondMark({ assert: [HALF, PRONE] }) })];
    const out = run([r], [result()], queue);
    const { entry, next } = expectKept(out, queue[0], { reason: "disagreement", agreesFirst: true, agreesSecond: false });
    expect(entry.review).toMatchObject({ agrees: true, onlyDraft: [], onlyReview: [] });
    expect(entry.second).toEqual(queue[0].second);
    // Held for a person, as any disagreement, once the gates pass on the new rule.
    expect(emissionOf(regated(next), { queue: out.kept })).toEqual({ emitted: false, because: "disagreement" });
  });

  it("agrees with neither: a disagreement, with the comparison against the first", () => {
    const r = gated();
    const out = run([r], [result({ rule: newRule({ entry: { saveDamage: { [A_OFF]: "none" } }, assert: [NONE] }) })],
      [queued(r)]);
    const { entry } = expectKept(out, queued(r), { reason: "disagreement", agreesFirst: false, agreesSecond: false });
    expect(entry.review).toMatchObject({ agrees: false, onlyDraft: normaliseAssert([NONE]),
      onlyReview: normaliseAssert([HALF]) });
  });

  it("a reviewer below the threshold makes an agreement unsure: kept, low-confidence", () => {
    const r = gated();
    const unsure = queued(r, { second: secondMark({ confidence: 0.6 }) });
    expectKept(run([r], [result()], [unsure]), unsure, { reason: "low-confidence", agreesFirst: true, agreesSecond: "unsure" });
    const low = queued(r, { confidence: 0.65 });
    expectKept(run([r], [result()], [low]), low, { reason: "low-confidence", agreesFirst: "unsure", agreesSecond: true });
  });
});

describe("ingest --draft --redraft --against-reviews: one chance", () => {
  const unchanged = (out, r, entry, result, by = "drafter-v041") => {
    expect(out.applied).toEqual([]);
    expect(out.confirmed).toEqual([]);
    expect(out.kept).toEqual([]);
    expect(out.queued).toEqual([]);
    expect(out.records).toEqual([r]);
    expect(out.marked).toEqual([{ ...entry, redraftedAgainst: { by, at: LATER, result } }]);
    expect(validateQueueEntry(out.marked[0], { queue: "review", vocabulary: core })).toEqual([]);
  };

  it("a decline, a clash or a low confidence keeps the record and the entry exactly as they were, marked", () => {
    const r = gated();
    for (const outcome of ["person", "code", "engine"]) {
      const out = run([r], [{ key: KEY, outcome, why: "cannot say it", confidence: 0.9 }], [queued(r)]);
      expect(out.declined).toEqual([KEY]);
      unchanged(out, r, queued(r), "declined");
    }
    unchanged(run([r], [result({ confidence: 0.5 })], [queued(r)]), r, queued(r), "declined");
  });

  it("a rejected or a missing result keeps them as they were, marked", () => {
    const r = gated();
    const rejected = run([r], [result({ rule: newRule({ handledIn: "code" }) })], [queued(r)]);
    expect(rejected.rejected).toHaveLength(1);
    unchanged(rejected, r, queued(r), "rejected");
    unchanged(run([r], [], [queued(r)]), r, queued(r), "missing");
    // A drafter who signed one of the two reviews is no independent drafter.
    const reviewer = run([r], [result()], [queued(r)], { by: "REVIEWER-2" });
    expect(reviewer.rejected[0].reason).toMatch(/review/);
    unchanged(reviewer, r, queued(r), "rejected", "REVIEWER-2");
  });

  it("a marked entry, or a record changed since the reviews, is refused and not marked again", () => {
    const r = gated();
    const marked = queued(r, { redraftedAgainst: { by: "drafter-v040", at: SECOND_AT, result: "declined" } });
    const again = run([r], [result()], [marked]);
    expect(again.rejected[0].reason).toMatch(/not redraftable against its reviews/);
    expect(again.marked).toEqual([]);
    expect(again.records).toEqual([r]);
    const moved = gated({}, { gatesAt: LATER });
    const stale = run([moved], [result()], [queued(moved)]);
    expect(stale.rejected[0].reason).toMatch(/not redraftable against its reviews/);
    expect(stale.marked).toEqual([]);
  });

  it("needs redraft and the owners; without againstReviews a queued ruled record is refused as ever", () => {
    const r = gated();
    expect(() => run([r], [], [queued(r)], { redraft: false })).toThrow(/redraft/);
    expect(() => run([r], [], [queued(r)], { owners: undefined })).toThrow(/owners/);
    const plain = run([r], [result()], [queued(r)], { againstReviews: false,
      reviewQueued: new Set([KEY]) });
    expect(plain.rejected[0].reason).toMatch(/not redraftable/);
  });
});

describe("schema: evidence.reviewed via redraft-against-reviews, the queue mark redraftedAgainst", () => {
  const confirmed = () => run([gated()], [result()], [queued(gated())]).records[0];

  it("via redraft-against-reviews goes with second (closed), never with first", () => {
    const r = confirmed();
    const bad = (reviewed) => validateRecord({ ...r, evidence: { ...r.evidence, reviewed } }).join(" ");
    const { via, second, ...plain } = r.evidence.reviewed;
    expect(bad({ ...plain, via, second })).toBe("");
    expect(bad({ ...plain, via })).toMatch(/second/);
    expect(bad({ ...plain, second })).toMatch(/second/);
    expect(bad({ ...plain, via: "second-review", second })).toMatch(/second|first/);
    const first = { by: "reviewer-1", confidence: 0.8, reason: "disagreement", assert: [], onlyDraft: [], onlyReview: [] };
    expect(bad({ ...plain, via, second, first })).toMatch(/first/);
    expect(bad({ ...plain, via, second: { ...second, why: "prose" } })).toMatch(/second/);
    expect(bad({ ...plain, via, second: { ...second, assert: ["not canonical"] } })).toMatch(/second/);
    expect(bad({ ...plain, via, second: { ...second, assert: [] } })).toMatch(/second/);
    expect(bad({ ...plain, via, second: { ...second, confidence: 2 } })).toMatch(/second/);
    expect(bad({ ...plain, via, second: { ...second, by: "Reviewer-1" } })).toMatch(/second/);
    expect(bad({ ...plain, via, second: { ...second, tolerated: { baseline: [], detail: [] } } })).toMatch(/second/);
  });

  it("redraftedAgainst: in review-queue.json only, beside a second mark, closed per result", () => {
    const r = gated();
    const ok = (mark, entry = queued(r), queue = "review") =>
      validateQueueEntry({ ...entry, redraftedAgainst: mark }, { queue, vocabulary: core }).join(" ");
    expect(AGAINST_RESULTS).toEqual(["compared", "declined", "rejected", "missing"]);
    const compared = { by: "drafter-v041", at: LATER, result: "compared", agreesFirst: true, agreesSecond: "unsure" };
    expect(ok(compared)).toBe("");
    for (const result of ["declined", "rejected", "missing"]) expect(ok({ by: "d-1", at: LATER, result })).toBe("");
    expect(ok(compared, queued(r), "drafts")).toMatch(/redraftedAgainst/);
    const { second, ...withoutSecond } = queued(r);
    expect(ok(compared, withoutSecond)).toMatch(/redraftedAgainst/);
    expect(ok({ ...compared, result: "lost" })).toMatch(/redraftedAgainst\.result/);
    expect(ok({ ...compared, agreesFirst: "yes" })).toMatch(/redraftedAgainst\.agreesFirst/);
    expect(ok({ ...compared, agreesFirst: true, agreesSecond: true })).toMatch(/redraftedAgainst/);
    expect(ok({ by: "d-1", at: LATER, result: "declined", agreesFirst: false })).toMatch(/redraftedAgainst\.agreesFirst/);
    expect(ok({ by: "d-1", at: LATER, result: "compared" })).toMatch(/redraftedAgainst/);
    expect(ok({ ...compared, why: "prose" })).toMatch(/redraftedAgainst\.why/);
    expect(ok({ ...compared, by: "rule" })).toMatch(/redraftedAgainst\.by/);
    expect(ok({ ...compared, at: "" })).toMatch(/redraftedAgainst\.at/);
  });
});

describe("emission and the RULES.md count", () => {
  it("a confirmed rule ships as reviewed once the gates pass on it", () => {
    const out = run([gated()], [result()], [queued(gated())]);
    expect(emissionOf(out.records[0], { queue: [] })).toBeNull();
    expect(emissionOf(regated(out.records[0]), { queue: [] })).toEqual({ emitted: true, because: "reviewed" });
  });

  it("countsLine counts the rules a redraft against two reviews settled, beside the second-review count", () => {
    const rules = ["a", "b", "c"].map((identifier) => ({ book: "TST", identifier, status: "validated" }));
    expect(countsLine(rules, { second: new Set(["TST|a"]), against: new Set(["TST|b", "TST|c"]) }))
      .toBe("3 rules: 0 played, 3 validated. 1 of them settled by a second review (Ruling R40). 2 of them settled by a"
        + " redraft that agrees with two reviews (Ruling R41).");
    expect(countsLine(rules)).toBe("3 rules: 0 played, 3 validated.");
  });
});

const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/monster-layer.mjs"))
  ? process.env.DAS_CORE : null;
const PUSH = "<p>Strength Saving Throw: DC 12, one creature within 5 feet. Failure: 7 Bludgeoning damage. If the target is"
  + " Medium or smaller, it has the Prone condition.</p>";

describe("batch draft --redraft --against-reviews and ingest on the command line", () => {
  let tmp;
  let env;
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  const write = (name, body) => {
    const file = join(tmp, "out", name);
    writeFileSync(file, JSON.stringify(body));
    return file;
  };
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "against-cli-"));
    for (const d of ["dumps", "text", "out"]) mkdirSync(join(tmp, d));
    env = { PATH: process.env.PATH, RULEPACK_REGISTRY: join(tmp, "registry") };
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("refuses --against-reviews without --redraft, outside batch draft and ingest --draft, and on unmarked batches", () => {
    saveBook(join(tmp, "registry"), { book: "XMM", records: [] });
    const cut = (extra) => cli(["batch", "draft", "XMM", "--out", join(tmp, "o"), "--structure", join(tmp, "p"), ...extra]);
    expect(cut(["--against-reviews"]).status).toBe(2);
    expect(cut(["--against-reviews", "--reoffer"]).status).toBe(2);
    const review = cli(["batch", "review", "XMM", "--out", join(tmp, "o"), "--structure", join(tmp, "p"),
      "--against-reviews"]);
    expect(review.status).toBe(2);
    for (const mode of [["--draft", "--batch", "y.json"], ["--review", "--batch", "y.json"], []]) {
      const r = cli(["ingest", "x.json", ...mode, "--against-reviews"]);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--against-reviews/);
    }
    env = { ...env, RULEPACK_DUMPS: join(tmp, "dumps"), RULEPACK_TEXT: join(tmp, "text"), DAS_CORE: join(tmp, "nowhere") };
    const redraftOnly = write("xmm-draft-001.json", { id: "xmm-draft-001", stage: "draft", redraft: true,
      entries: [{ key: "xmm:spell:a" }] });
    const marked = write("xmm-draft-002.json", { id: "xmm-draft-002", stage: "draft", redraft: true, againstReviews: true,
      entries: [{ key: "xmm:spell:a" }] });
    const r1 = cli(["ingest", write("a.results.json", { batch: "xmm-draft-001", by: "drafter-2", results: [] }), "--draft",
      "--redraft", "--against-reviews", "--batch", redraftOnly]);
    expect(r1.status).toBe(2);
    expect(r1.stderr).toMatch(/not an against-reviews batch/);
    const r2 = cli(["ingest", write("b.results.json", { batch: "xmm-draft-002", by: "drafter-2", results: [] }), "--draft",
      "--redraft", "--batch", marked]);
    expect(r2.status).toBe(2);
    expect(r2.stderr).toMatch(/against-reviews/);
  });

  describe.skipIf(!CORE_DIR)("with the real engine", () => {
    const SAVE = "Rs00Rs11Rs22Rs33";
    const ACT = "tstGlimmerDrake0";
    const DOC = "mmGustSlam000000";
    const gust = "xmm:monster:glimmer-drake/action/gust-slam";
    const scoped = "xmm-glimmer-drake-gust-slam";
    const TEXT = "The drake beats its wings at one foe nearby; a small foe that fails is knocked flat.";
    const TSHA = "e".repeat(64);
    const doc = { _id: DOC, name: "Gust Slam", type: "feat", flags: {},
      system: { identifier: "gust-slam", description: { value: PUSH }, activities: { [SAVE]: { _id: SAVE, type: "save",
        name: "", activation: { type: "action", condition: "" }, effects: [], damage: { onSave: "half", parts: [] },
        range: { value: "5", units: "ft", special: "" }, target: { template: { type: "", size: "" },
          affects: { type: "creature", count: "1", special: "" } } } } },
      effects: [] };
    // The old rule halves on a save; both reviewers read the foe knocked flat on a failed save.
    const old = { handledIn: "table", adds: OLD_ADDS, origins: ["official"], origin: "Glimmer Drake",
      entry: { saveDamage: { [SAVE]: "half" } }, assert: [HALF] };
    const record = () => {
      const r = { key: gust, name: "Gust Slam", kind: "monster", book: "XMM", page: 3, edition: "2024",
        owner: "Glimmer Drake", section: "action", identifier: scoped, sources: { [DOC]: scoped },
        text: { sha256: TSHA, source: "5etools", chars: TEXT.length }, verdict: "entry", why: "a reader asked for a rule",
        items: [{ origin: "official", match: "matched", identifier: "gust-slam", docId: `${ACT}.${DOC}`, activities: [SAVE],
          effects: [], data: { sha256: dataFingerprint(doc) } }],
        rule: old, evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.8 },
          drafted: { by: "drafter-1", at: AT, core: "9.9.9", rule: ruleFingerprint(old) } } };
      r.evidence.gates = { at: AT, core: "9.9.9", rule: ruleFingerprint(old), emits: emittedFingerprint(r),
        passed: ["schema", "validator", "ids", "fixes", "text"], items: gatedItems(r) };
      return r;
    };
    const entry = () => ({ key: gust, reason: "disagreement", by: "reviewer-1", why: FIRST_WHY, confidence: 0.8,
      draft: { by: "drafter-1", rule: ruleFingerprint(old), assert: [HALF], implied: normaliseAssert([HALF]) },
      review: { rule: ruleFingerprint(old), assert: [PRONE], agrees: false, onlyDraft: normaliseAssert([HALF]),
        onlyReview: normaliseAssert([PRONE]), baseline: [], detail: [] },
      second: { by: "reviewer-2", at: SECOND_AT, agrees: false, result: "read", confidence: 0.75, assert: [PRONE],
        onlyDraft: normaliseAssert([HALF]), onlyReview: normaliseAssert([PRONE]), withFirst: true } });
    beforeEach(() => {
      writeFileSync(join(tmp, "text", `${TSHA}.txt`), TEXT);
      writeFileSync(join(tmp, "dumps", "dnd-monster-manual.actors.json"), JSON.stringify([
        { _id: ACT, name: "Glimmer Drake", type: "npc", system: {}, items: [doc] }]));
      env = { ...env, RULEPACK_DUMPS: join(tmp, "dumps"), RULEPACK_TEXT: join(tmp, "text"), DAS_CORE: CORE_DIR };
      saveBook(join(tmp, "registry"), { book: "XMM", records: [record()] });
      saveQueue(join(tmp, "registry"), "review", [entry()]);
    });

    it("cuts the entry once, blind; a rule both reviews agree with is confirmed and leaves the queue", () => {
      expect(stateOf(record())).toBe("gated");
      const out = join(tmp, "out");
      const priv = join(tmp, "private");
      const args = ["batch", "draft", "XMM", "--out", out, "--structure", priv, "--redraft"];
      const redraft = cli(args);
      expect(redraft.status, redraft.stderr).toBe(0);
      expect(redraft.stdout).toMatch(/0 batches/);
      const cut = cli([...args, "--against-reviews"]);
      expect(cut.status, cut.stderr).toBe(0);
      const batch = JSON.parse(readFileSync(join(out, "xmm-draft-001.json"), "utf8"));
      expect(batch).toMatchObject({ id: "xmm-draft-001", stage: "draft", redraft: true, againstReviews: true });
      expect(batch.entries.map((e) => e.key)).toEqual([gust]);
      const seen = JSON.stringify(batch) + readFileSync(join(priv, "xmm-draft-001.structure.json"), "utf8");
      for (const word of [FIRST_WHY, OLD_ADDS, "reviewer-1", "reviewer-2", "disagreement"]) expect(seen).not.toContain(word);
      expect(JSON.parse(readFileSync(join(out, "xmm-draft-against-reviews-report.json"), "utf8")))
        .toMatchObject({ book: "XMM", batches: 1, cut: 1 });
      const rule = { handledIn: "table", adds: "Knocked flat on a failed save.", origins: ["official"],
        entry: { triggers: [{ on: "failedSave", do: [{ type: "status", status: "prone" }] }] }, assert: [PRONE] };
      const file = write("xmm-draft-001.results.json", { batch: "xmm-draft-001", by: "drafter-v041", results: [
        { key: gust, outcome: "rule", why: "prone on a failed save", confidence: 0.9, rule }] });
      const taken = cli(["ingest", file, "--draft", "--redraft", "--against-reviews", "--batch",
        join(out, "xmm-draft-001.json")]);
      expect(taken.status, taken.stdout + taken.stderr).toBe(0);
      expect(JSON.parse(taken.stdout)).toMatchObject({ applied: 1, confirmed: 1, kept: 0, declined: 0, marked: 0,
        rejected: [] });
      expect(loadQueue(join(tmp, "registry"), "review")).toEqual([]);
      const [after] = loadBook(join(tmp, "registry"), "XMM").records;
      expect(after.rule.entry).toEqual(rule.entry);
      expect(after.evidence.reviewed).toMatchObject({ by: "reviewer-1", via: "redraft-against-reviews",
        second: { by: "reviewer-2", assert: normaliseAssert([PRONE]) } });
      const again = cli([...args, "--against-reviews"]);
      expect(again.status, again.stderr).toBe(0);
      expect(again.stdout).toMatch(/0 batches/);
      expect(again.stdout).toMatch(/not in review-queue\.json/);
      expect(readdirSync(out)).not.toContain("xmm-draft-002.json");
    });

    it("a decline marks the entry and keeps everything as it was; the entry is not cut again", () => {
      const out = join(tmp, "out");
      const args = ["batch", "draft", "XMM", "--out", out, "--structure", join(tmp, "private"), "--redraft",
        "--against-reviews"];
      expect(cli(args).status).toBe(0);
      const file = write("xmm-draft-001.results.json", { batch: "xmm-draft-001", by: "drafter-v041", results: [
        { key: gust, outcome: "person", why: "the size limit cannot be said", confidence: 0.8 }] });
      const taken = cli(["ingest", file, "--draft", "--redraft", "--against-reviews", "--batch",
        join(out, "xmm-draft-001.json")]);
      expect(taken.status, taken.stderr).toBe(0);
      expect(JSON.parse(taken.stdout)).toMatchObject({ applied: 0, confirmed: 0, declined: 1, marked: 1 });
      expect(loadQueue(join(tmp, "registry"), "review")).toEqual([{ ...entry(),
        redraftedAgainst: { by: "drafter-v041", at: expect.any(String), result: "declined" } }]);
      expect(loadQueue(join(tmp, "registry"), "drafts")).toEqual([]);
      expect(loadBook(join(tmp, "registry"), "XMM").records[0].rule).toEqual(old);
      const again = cli(args);
      expect(again.stdout).toMatch(/0 batches/);
      expect(again.stdout).toMatch(/redrafted against reviews/);
    });
  });
});
