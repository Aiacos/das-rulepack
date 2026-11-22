// Ruling R25: partial rules. A draft may declare, as data in the closed assertion vocabulary, what its entry expects that the
// rule does not automate (`rule.leaves`); review then compares only what the rule claims, and a review assertion matched by a
// `leaves` assertion is recorded under `left`. Synthetic fixtures only: invented creatures, invented words.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareAsserts, ingestReviews } from "../../tools/pipeline/review.mjs";
import { ingestDrafts, DRAFT_RULE_FIELDS } from "../../tools/pipeline/draft.mjs";
import { cutReviewBatches, draftVocabulary, reviewVocabulary } from "../../tools/pipeline/batch.mjs";
import { LEAVES_MAX, LEAVE_REASONS, leftCounts, leavesProblems } from "../../tools/pipeline/leaves.mjs";
import { normaliseAssert } from "../../tools/pipeline/assert.mjs";
import { gateSchema, gateValidator } from "../../tools/pipeline/gates.mjs";
import { ruleFromRecord } from "../../tools/pipeline/generate.mjs";
import { checksOf } from "../../tools/pipeline/scenarios.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import {
  emittedFingerprint, gatedItems, ruleFingerprint, stateOf, validateQueueEntry, validateRecord
} from "../../tools/pipeline/registry.mjs";
import { countsLine, partialNote } from "../../tools/books-progress.mjs";
import { variants } from "./fixtures/shapes.mjs";

const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
const AT = "2026-01-01T00:00:00.000Z";
const A_OFF = "Af11Bf22Cf33Df44";
const E_OFF = "Ef11Ef22Ef33Ef44";
const core = {
  version: "9.9.9", facts: ["actor.prone"], identifiers: new Set(), vocabulary: new Set(), validateEntry: () => [],
  moments: ["failedSave", "savedSave", "hit", "leavesReach", "isDamaged"], statuses: ["prone", "restrained"],
  creatureTypes: ["undead"], moveModes: ["push"], effectEnds: ["bearerTurnEnd", "currentTurnEnd"],
  damageTypes: ["bludgeoning", "thunder"]
};
const a = (given, expect, extra = {}) => ({ given, expect, ...extra });
const FS = { roll: "failedSave" };
const SS = { roll: "savedSave" };
const c1 = (x) => normaliseAssert([{ given: x.given, expect: x.expect }])[0];
// A save activity that deals bludgeoning damage and applies an effect that knocks prone (structure.mjs structureOf).
const STRUCTURE = { activities: [{ id: A_OFF, type: "save", activation: "bonus", save: { ability: ["dex"] }, onSave: "none",
  damage: [{ number: 2, denomination: 6, types: ["bludgeoning"] }], effects: [E_OFF] }],
effects: [{ id: E_OFF, statuses: ["prone"] }] };

// The pilot's centaur-like case (invented names): the rule says prone on a failed save; it leaves out "no damage on a saved
// save" and "the move provokes no opportunity attacks" as no-key (an entry with noOpportunity would do the second itself:
// fix round 1, below).
const PRONE = a(FS, { condition: { applied: "prone" } });
const NONE_ON_SAVE = a(SS, { damage: { fraction: 0 } }, { because: "no-key" });
const NO_OA = a({}, { denies: "opportunityAttacks" }, { because: "no-key" });
const CHARGE = { entry: {}, assert: [PRONE], leaves: [NONE_ON_SAVE, NO_OA] };
const CHARGE_REVIEW = [
  a(FS, { damage: { fraction: 1, type: "bludgeoning" } }), PRONE, a(SS, { damage: { fraction: 0 } }),
  a({}, { denies: "opportunityAttacks" })
];

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "partial-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const gated = (r) => {
  r.evidence = { ...r.evidence, drafted: { by: "drafter-zz9", at: AT, core: "9.9.9", rule: ruleFingerprint(r.rule) } };
  r.evidence.gates = { at: AT, core: "9.9.9", rule: ruleFingerprint(r.rule), emits: emittedFingerprint(r),
    passed: ["schema", "validator", "ids", "fixes", "text", "unique"], items: gatedItems(r) };
  return r;
};
const monster = (rule) => ({
  key: "tst:monster:hoofed-runner/bonus/trample-dash", name: "Trample Dash", kind: "monster", book: "TST", page: 7,
  edition: "2024", identifier: "tst-hoofed-runner-trample-dash", owner: "Hoofed Runner",
  text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
  items: [{ origin: "official", match: "matched", identifier: "trample-dash", docId: "Do11Do22Do33Do44", activities: [A_OFF],
    effects: [E_OFF], data: { sha256: "a".repeat(64) } }],
  verdict: "entry", why: "x", evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9 } },
  rule: { handledIn: "table", adds: "Zorbly the quux.", origins: ["official"], ...rule }
});
const runReview = (records, results) => ingestReviews(records, results, {
  textDir, by: "reviewer-1", at: AT, core, offered: new Map(records.map((r) => [r.key, ruleFingerprint(r.rule)])),
  structures: new Map(records.map((r) => [r.key, STRUCTURE]))
});
const schemaOf = (leaves, over = {}) => validateRecord(monster({ entry: {}, assert: [PRONE], leaves,
  ...over }));

describe("rule.leaves: schema", () => {
  it("the centaur-like rule is valid, and leaves is part of the rule fingerprint", () => {
    expect(schemaOf(CHARGE.leaves)).toEqual([]);
    const without = monster({ entry: CHARGE.entry, assert: CHARGE.assert });
    expect(ruleFingerprint(monster(CHARGE).rule)).not.toBe(ruleFingerprint(without.rule));
  });
  it("an unexpressed item is a closed reason with a count, never text", () => {
    expect(schemaOf([{ unexpressed: "immunity-after-save", count: 1 }, { unexpressed: "healing-block", count: 2 }])).toEqual([]);
    for (const bad of [{ unexpressed: "immunity-after-save" }, { unexpressed: "immunity-after-save", count: 0 },
      { unexpressed: "immunity-after-save", count: 7 }, { unexpressed: "immune for a day", count: 1 },
      { unexpressed: "no-key", count: 1, because: "no-key" }, { unexpressed: "no-key", count: 1.5 }]) {
      expect(schemaOf([bad]).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });
  it(`more than ${LEAVES_MAX} items fail the schema`, () => {
    const many = ["savedSave", "hit", "isDamaged", "leavesReach", "failedSave", "savedSave", "hit"]
      .map((m, i) => a({ moment: m }, { uses: { spent: i + 1 } }));
    expect(schemaOf(many.slice(0, LEAVES_MAX))).toEqual([]);
    expect(schemaOf(many).join(" ")).toMatch(/at most 6/);
  });
  it("free text or an unknown reason in leaves fails the schema", () => {
    expect(schemaOf([a(SS, { damage: { fraction: 0 }, free: "none on a save" })]).join(" ")).toMatch(/free/);
    expect(schemaOf([a({ ...SS, free: "a save" }, { damage: { fraction: 0 } })]).join(" ")).toMatch(/free/);
    expect(schemaOf([a(SS, { damage: { fraction: 0 } }, { because: "too hard" })]).join(" ")).toMatch(/because/);
    expect(schemaOf([a(SS, { damage: { fraction: 0 } }, { why: "no-key" })]).join(" ")).toMatch(/why/);
    expect(schemaOf([a(SS, { damage: { fraction: 0 } }, { because: "constructor" })]).length).toBeGreaterThan(0);
    expect(schemaOf("no damage on a save").length).toBeGreaterThan(0);
    expect(schemaOf([{ toString: "no-key" }]).length).toBeGreaterThan(0);
  });
  it("a leaves item twice, or an origin the rule does not name, fails the schema", () => {
    expect(schemaOf([NONE_ON_SAVE, NONE_ON_SAVE]).join(" ")).toMatch(/twice/);
    expect(schemaOf([a({ roll: "savedSave", origin: "ddb-importer" }, { damage: { fraction: 0 } })]).length).toBeGreaterThan(0);
  });
  it("a rule whose assert is empty or only the item's own damage cannot have leaves", () => {
    const baselineOnly = [a({ roll: "hit" }, { damage: { fraction: 1, type: "thunder" } }), a(FS, { damage: { fraction: 1 } })];
    expect(schemaOf([NONE_ON_SAVE], { entry: {}, assert: baselineOnly }).join(" ")).toMatch(/empty rule/);
    expect(schemaOf([NONE_ON_SAVE], { entry: {}, assert: [] }).join(" ")).toMatch(/empty rule/);
    // An implied assertion counts: saveDamage says something by itself.
    expect(schemaOf([NO_OA], { entry: { saveDamage: { [A_OFF]: "half" } }, assert: baselineOnly })).toEqual([]);
    // And a legacy rule without assert cannot carry leaves either.
    const legacy = monster({ entry: {}, leaves: [NONE_ON_SAVE] });
    delete legacy.rule.assert;
    legacy.legacy = true;
    expect(validateRecord(legacy).join(" ")).toMatch(/empty rule/);
  });
});

describe("rule.leaves: gates", () => {
  it("a leaves item the rule states or implies is a gate failure", () => {
    expect(gateSchema(monster({ ...CHARGE, leaves: [PRONE] }), { core }).join(" ")).toMatch(/states or implies/);
    // Up to optional detail: a typed leave of an untyped stated assertion is the same.
    const typed = a(FS, { condition: { applied: "prone" } });
    expect(gateSchema(monster({ ...CHARGE, leaves: [typed] }), { core }).length).toBeGreaterThan(0);
    // Implied by the entry: saveDamage says a saved save halves the damage.
    const half = monster({ entry: { saveDamage: { [A_OFF]: "half" } }, assert: [PRONE],
      leaves: [a(SS, { damage: { fraction: 0.5, type: "bludgeoning" } })] });
    expect(gateSchema(half, { core }).join(" ")).toMatch(/states or implies/);
    // Another fraction of the same damage is a contradiction too.
    const none = monster({ entry: { saveDamage: { [A_OFF]: "half" } }, assert: [PRONE],
      leaves: [a(SS, { damage: { fraction: 0 } })] });
    expect(gateSchema(none, { core }).join(" ")).toMatch(/says otherwise/);
  });
  it("the validator gate checks the words of leaves against the engine", () => {
    const bad = monster({ ...CHARGE, leaves: [a(FS, { condition: { applied: "dazzled" } }, { because: "no-key" })] });
    expect(validateRecord(bad)).toEqual([]);
    expect(gateValidator(bad, { core }).join(" ")).toMatch(/rule\.leaves\[0\]\.expect\.condition\.applied/);
    expect(gateValidator(monster(CHARGE), { core })).toEqual([]);
  });
});

describe("compareAsserts with leaves (Ruling R25)", () => {
  it("the centaur-like case agrees, the review-only assertions recorded under left", () => {
    const c = compareAsserts(CHARGE, CHARGE_REVIEW, { structure: STRUCTURE });
    expect(c).toMatchObject({ agrees: true, onlyDraft: [], onlyReview: [], free: false });
    expect(c.baseline).toEqual([c1(CHARGE_REVIEW[0])]);
    expect(c.left).toEqual([
      { leaves: c1(NO_OA), review: c1(CHARGE_REVIEW[3]) }, { leaves: c1(NONE_ON_SAVE), review: c1(CHARGE_REVIEW[2]) }
    ].sort((x, y) => (x.leaves < y.leaves ? -1 : 1)));
  });
  it("fix round 1: with noOpportunity in the entry the review's no-opportunity assertion is matched, not left", () => {
    const own = { entry: { noOpportunity: "afterUse" }, assert: [PRONE], leaves: [NONE_ON_SAVE] };
    const c = compareAsserts(own, CHARGE_REVIEW, { structure: STRUCTURE });
    expect(c).toMatchObject({ agrees: true, onlyDraft: [], onlyReview: [] });
    expect(c.implied).toEqual([c1(a({}, { denies: "opportunityAttacks" }))]);
    expect(c.left).toEqual([{ leaves: c1(NONE_ON_SAVE), review: c1(CHARGE_REVIEW[2]) }]);
  });
  it("without leaves the same review is a disagreement", () => {
    const c = compareAsserts({ ...CHARGE, leaves: undefined }, CHARGE_REVIEW, { structure: STRUCTURE });
    expect(c.agrees).toBe(false);
    expect(c.onlyReview).toEqual(normaliseAssert([CHARGE_REVIEW[2], CHARGE_REVIEW[3]]));
    expect(c.left).toEqual([]);
  });
  it("a review assertion neither matched, baseline nor left is still a disagreement", () => {
    const extra = a(FS, { condition: { applied: "restrained" } });
    const c = compareAsserts(CHARGE, [...CHARGE_REVIEW, extra], { structure: STRUCTURE });
    expect(c.agrees).toBe(false);
    expect(c.onlyReview).toEqual([c1(extra)]);
  });
  it("a leaves item the review does not mention is fine; an unexpressed item matches nothing", () => {
    const c = compareAsserts({ ...CHARGE, leaves: [...CHARGE.leaves, { unexpressed: "immunity-after-save", count: 1 }] },
      CHARGE_REVIEW.slice(0, 3), { structure: STRUCTURE });
    expect(c.agrees).toBe(true);
    expect(c.left).toEqual([{ leaves: c1(NONE_ON_SAVE), review: c1(CHARGE_REVIEW[2]) }]);
  });
  it("two endings of the same effect stay a disagreement, whatever leaves says", () => {
    const draft = { entry: {}, assert: [PRONE, a(FS, { ends: "bearerTurnEnd" })], leaves: [a(FS, { ends: "currentTurnEnd" })] };
    const c = compareAsserts(draft, [PRONE, a(FS, { ends: "currentTurnEnd" })], { structure: STRUCTURE });
    expect(c.agrees).toBe(false);
    expect(c.onlyDraft).toEqual([c1(a(FS, { ends: "bearerTurnEnd" }))]);
  });
  it("matching through leaves is the same as through the draft: one to one, a distance the leave does not pin is not taken", () => {
    const push = { entry: {}, assert: [PRONE], leaves: [a(SS, { move: { mode: "push" } })] };
    expect(compareAsserts(push, [PRONE, a(SS, { move: { mode: "push", distance: 5 } })]).agrees).toBe(false);
    const one = { entry: {}, assert: [PRONE], leaves: [a(SS, { damage: { fraction: 0 } })] };
    const c = compareAsserts(one, [PRONE, a(SS, { damage: { fraction: 0, type: "thunder" } }),
      a(SS, { damage: { fraction: 0, type: "bludgeoning" } })]);
    expect(c.agrees).toBe(false);
    expect(c.left.length).toBe(1);
  });
});

describe("ingestReviews with leaves", () => {
  it("an agreement through leaves is reviewed, partial: tolerated.left holds the pairs and the gates run again", () => {
    const r = gated(monster(CHARGE));
    expect(stateOf(r)).toBe("gated");
    const out = runReview([r], [{ key: r.key, rule: ruleFingerprint(r.rule), assert: CHARGE_REVIEW, why: "prone, no damage on a"
      + " save", confidence: 0.9 }]);
    expect(out.rejected).toEqual([]);
    expect(out.agreed).toEqual([r.key]);
    expect(out.tolerated).toEqual([r.key]);
    expect(out.partial).toEqual([r.key]);
    const next = out.records[0];
    expect(next.evidence.reviewed.tolerated.left).toEqual([[c1(NO_OA), c1(CHARGE_REVIEW[3])],
      [c1(NONE_ON_SAVE), c1(CHARGE_REVIEW[2])]].sort((x, y) => (x[0] < y[0] ? -1 : 1)));
    expect(validateRecord(next)).toEqual([]);
    // Same protection as the other tolerances: part of emits, so the record is drafted until the gates pass again.
    expect(stateOf(next)).toBe("drafted");
    const forged = structuredClone(next);
    forged.evidence.reviewed.tolerated.left = [["the move is free", "x"]];
    expect(validateRecord(forged).join(" ")).toMatch(/tolerated/);
  });
  it("a disagreement keeps the draft's leaves and the review's left in the queue entry, as data", () => {
    const r = gated(monster(CHARGE));
    const extra = a(FS, { condition: { applied: "restrained" } });
    const out = runReview([r], [{ key: r.key, rule: ruleFingerprint(r.rule), assert: [...CHARGE_REVIEW, extra], why: "w",
      confidence: 0.9 }]);
    expect(out.disagreed.length).toBe(1);
    const q = out.disagreed[0];
    expect(q.reason).toBe("disagreement");
    expect(q.draft.leaves).toEqual(CHARGE.leaves);
    expect(q.review.left.length).toBe(2);
    expect(validateQueueEntry(q, { queue: "review", vocabulary: core })).toEqual([]);
    const forged = structuredClone(q);
    forged.draft.leaves = [{ unexpressed: "a day of immunity", count: 1 }];
    expect(validateQueueEntry(forged, { queue: "review", vocabulary: core }).length).toBeGreaterThan(0);
  });
  it("the review batch carries nothing of leaves", () => {
    const r = gated(monster({ ...CHARGE, leaves: [...CHARGE.leaves, { unexpressed: "healing-block", count: 1 }] }));
    const [batch] = cutReviewBatches([r]);
    const text = JSON.stringify(batch);
    expect(text).not.toMatch(/leaves|no-key|healing-block|denies|opportunityAttacks|Zorbly/);
    const vocabulary = JSON.stringify(reviewVocabulary({ ...core, stepTypes: [], abilities: [], shipped: {} }));
    expect(vocabulary).not.toMatch(/"leaves"|leavesBecause|no-key|healing-block/);
  });
});

describe("leaves at draft time, in the vocabulary and in the outputs", () => {
  it("a drafter may write leaves; one that contradicts the rule is rejected", () => {
    expect(DRAFT_RULE_FIELDS).toContain("leaves");
    const base = { ...monster({}), kind: "spell", key: "tst:spell:trample-dash", identifier: "trample-dash", owner: undefined };
    delete base.rule;
    delete base.owner;
    const result = (leaves) => ({ key: base.key, outcome: "rule", why: "prone; the rest by hand", confidence: 0.9,
      rule: { handledIn: "table", adds: "Prone on a failed save.", entry: { noOpportunity: "afterUse" }, origins: ["official"],
        assert: [PRONE], leaves } });
    // Fix round 1: noOpportunity says the move provokes none, so the rule does it: only the saved save is left out.
    const opts = { textDir, by: "drafter-1", at: AT, core, offered: new Set([base.key]), structures: new Map([[base.key,
      STRUCTURE]]) };
    const ok = ingestDrafts([base], [result([NONE_ON_SAVE])], opts);
    expect(ok.rejected).toEqual([]);
    expect(ok.records[0].rule.leaves).toEqual([NONE_ON_SAVE]);
    expect(ok.partial).toEqual([base.key]);
    for (const leaves of [[PRONE], [NONE_ON_SAVE, NO_OA]]) {
      expect(ingestDrafts([base], [result(leaves)], opts).rejected[0].reason).toMatch(/states or implies/);
    }
  });
  it("the drafter's vocabulary explains leaves; definitions name every reason", () => {
    const v = draftVocabulary({ ...core, stepTypes: [], abilities: [], shipped: {} });
    expect(v.leaves).toMatchObject({ max: LEAVES_MAX, because: [...LEAVE_REASONS] });
    expect(Object.keys(v.definitions.leavesBecause).sort()).toEqual([...LEAVE_REASONS].sort());
    expect(reviewVocabulary({ ...core, stepTypes: [], abilities: [], shipped: {} }).definitions.leavesBecause).toBeUndefined();
  });
  it("leaves is emitted nowhere at runtime: the entry and the scenario checks are the rule's own", () => {
    const r = gated(monster(CHARGE));
    // Ruling R27: a rule is emitted once a review of it agrees.
    r.evidence.reviewed = { by: "reviewer-zz9", at: AT, agrees: true, rule: ruleFingerprint(r.rule), confidence: 0.9 };
    const rule = ruleFromRecord(r, { legacy: new Map(), monsterRules: true });
    expect(rule.entry).toEqual(CHARGE.entry);
    expect(JSON.stringify(rule.entry)).not.toMatch(/leaves|no-key/);
    expect(rule.partial).toEqual({ "no-key": 2 });
    expect(checksOf(r.rule)).toEqual(normaliseAssert([PRONE]));
  });
  it("counts by reason; docs/RULES.md says partial with the counts, and counts partial rules apart", () => {
    expect(leftCounts([NONE_ON_SAVE, a(SS, { uses: { spent: 1 } }), { unexpressed: "healing-block", count: 2 }]))
      .toEqual({ "healing-block": 2, "no-key": 1, unstated: 1 });
    const rule = { book: "TST", identifier: "x", status: "validated", partial: { "healing-block": 2, "no-key": 1 } };
    expect(partialNote(rule)).toBe(" Partial: 3 expectations left to the table (healing-block 2, no-key 1).");
    expect(partialNote({ book: "TST", identifier: "y", status: "validated" })).toBe("");
    expect(countsLine([rule, { book: "TST", identifier: "y", status: "played" }]))
      .toBe("2 rules: 1 played, 1 validated. 1 of them partial (part of the entry left to the table).");
  });
  it("every value the vocabulary's leaves shapes describe is one leavesProblems accepts", () => {
    const v = draftVocabulary({ ...core, stepTypes: [], abilities: [], shipped: {} });
    const values = [...variants(v.leaves.shapes.assertion), ...variants(v.leaves.shapes.unexpressed)];
    expect(values.length).toBeGreaterThan(20);
    for (const value of values) {
      expect(leavesProblems([value], { vocabulary: core }), JSON.stringify(value)).toEqual([]);
    }
    expect(JSON.stringify(v.leaves)).not.toMatch(/"free"/);
  });
  it("leavesProblems is the one check, also with the engine's words", () => {
    expect(leavesProblems(CHARGE.leaves, { vocabulary: core, origins: ["official"] })).toEqual([]);
    expect(leavesProblems([a(FS, { move: { mode: "spin" } })], { vocabulary: core }).join(" ")).toMatch(/move\.mode/);
  });
});
