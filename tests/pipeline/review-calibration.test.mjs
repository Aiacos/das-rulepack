import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REVIEW_REASONS, REVIEW_RESULT_FIELDS, REVIEW_TOLERANCES, compareAsserts, ingestReviews }
  from "../../tools/pipeline/review.mjs";
import { cutDraftBatches, cutReviewBatches, draftVocabulary, rulableOrigin } from "../../tools/pipeline/batch.mjs";
import { ingestDrafts } from "../../tools/pipeline/draft.mjs";
import { DDB_MONSTER_UNCOVERED } from "../../tools/pipeline/identifiers.mjs";
import { embeddedIndex } from "../../tools/pipeline/settle.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { normaliseAssert } from "../../tools/pipeline/assert.mjs";
import {
  emittedFingerprint, gatedItems, loadBook, loadQueue, queueText, ruleFingerprint, saveBook, stateOf, validateQueueEntry,
  validateRecord
} from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented creatures, invented words. Ruling R24 (agreement tolerances) and the monster rules of R3.
const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
const AT = "2026-01-01T00:00:00.000Z";
const A_OFF = "Af11Bf22Cf33Df44";
const core = {
  version: "9.9.9", facts: ["actor.prone"], identifiers: new Set(), vocabulary: new Set(), validateEntry: () => [],
  moments: ["failedSave", "endOfTurn", "startOfTurn", "hit"], statuses: ["prone", "blinded"], creatureTypes: ["undead"],
  moveModes: ["push", "pull"], effectEnds: ["bearerTurnEnd"], damageTypes: ["fire", "force", "thunder", "cold"]
};

const a = (given, expect) => ({ given, expect });
const FS = { roll: "failedSave" };
const SS = { roll: "savedSave" };
const HIT = { roll: "hit" };
// What the item's own data does (structure.mjs structureOf): a save activity that deals thunder damage, an attack that deals
// force and fire damage, a utility activity that deals none.
const SAVE_DAMAGE = { activities: [{ id: A_OFF, type: "save", activation: "action", save: { ability: ["str"] }, onSave: "half",
  damage: [{ number: 4, denomination: 10, types: ["thunder"] }], effects: [] }], effects: [] };
const ATTACK_DAMAGE = { activities: [{ id: A_OFF, type: "attack", activation: "action",
  damage: [{ number: 3, denomination: 6, types: ["force"] }, { number: 5, denomination: 6, types: ["fire"] }], effects: [] }],
effects: [] };
const NO_DAMAGE = { activities: [{ id: A_OFF, type: "utility", activation: "action", damage: [], effects: [] }], effects: [] };

// The two rules of the pilot, as drafted (their entries and assertions; the ids are invented).
const WHIRLWIND = {
  entry: { saveDamage: { [A_OFF]: "half" },
    triggers: [{ on: "failedSave", do: [{ type: "move", mode: "push", distance: 20, units: "ft" }] }] },
  assert: [a(FS, { move: { mode: "push" } }), a(FS, { condition: { applied: "prone" } }), a(SS, { damage: { fraction: 0.5 } })]
};
const WHIRLWIND_REVIEW = [
  a(FS, { damage: { fraction: 1, type: "thunder" } }), a(FS, { condition: { applied: "prone" } }),
  a(FS, { move: { mode: "push", distance: 20 } }), a(SS, { damage: { fraction: 0.5, type: "thunder" } })
];
const FLAME_WHIP = {
  entry: { triggers: [{ on: "hit", do: [{ type: "move", mode: "pull", distance: 25, units: "ft" }] }] },
  assert: [a(HIT, { move: { mode: "pull" } }), a(HIT, { condition: { applied: "prone" } })]
};
const FLAME_WHIP_REVIEW = [
  a(HIT, { damage: { fraction: 1, type: "force" } }), a(HIT, { damage: { fraction: 1, type: "fire" } }),
  a(HIT, { move: { mode: "pull", distance: 25 } }), a(HIT, { condition: { applied: "prone" } })
];
const c1 = (x) => normaliseAssert([x])[0];

describe("compareAsserts: the pilot's two rules agree under Ruling R24", () => {
  it("Whirlwind: optional detail (type, distance) and the failed save's own full damage are tolerated", () => {
    const c = compareAsserts(WHIRLWIND, WHIRLWIND_REVIEW, { structure: SAVE_DAMAGE });
    expect(c).toMatchObject({ agrees: true, onlyDraft: [], onlyReview: [], free: false });
    expect(c.baseline).toEqual([c1(a(FS, { damage: { fraction: 1, type: "thunder" } }))]);
    expect(c.detail).toEqual([
      { draft: c1(a(FS, { move: { mode: "push" } })), review: c1(a(FS, { move: { mode: "push", distance: 20 } })) },
      { draft: c1(a(SS, { damage: { fraction: 0.5 } })), review: c1(a(SS, { damage: { fraction: 0.5, type: "thunder" } })) }
    ].sort((x, y) => (x.draft < y.draft ? -1 : 1)));
  });
  it("Flame Whip: the hit's own force and fire damage are baseline, the pull's distance is detail", () => {
    const c = compareAsserts(FLAME_WHIP, FLAME_WHIP_REVIEW, { structure: ATTACK_DAMAGE });
    expect(c).toMatchObject({ agrees: true, onlyDraft: [], onlyReview: [] });
    expect(c.baseline).toEqual(normaliseAssert(FLAME_WHIP_REVIEW.slice(0, 2)));
    expect(c.detail).toEqual([
      { draft: c1(a(HIT, { move: { mode: "pull" } })), review: c1(a(HIT, { move: { mode: "pull", distance: 25 } })) }
    ]);
  });
  it("without the item's structure nothing is baseline: the pilot's rules then disagree on the damage only", () => {
    const c = compareAsserts(FLAME_WHIP, FLAME_WHIP_REVIEW);
    expect(c.agrees).toBe(false);
    expect(c.onlyReview).toEqual(normaliseAssert(FLAME_WHIP_REVIEW.slice(0, 2)));
    expect(c.onlyDraft).toEqual([]);
    expect(c.baseline).toEqual([]);
  });
  it("exact agreement tolerates nothing and lists nothing", () => {
    const c = compareAsserts({ entry: {}, assert: [a(FS, { condition: { applied: "prone" } })] },
      [a(FS, { condition: { applied: "prone" } })], { structure: SAVE_DAMAGE });
    expect(c).toMatchObject({ agrees: true, baseline: [], detail: [] });
  });
  it("a numeric distance and its formula spelling match exactly, as before", () => {
    const c = compareAsserts({ entry: {}, assert: [a(FS, { move: { mode: "push", distance: 20 } })] },
      [a(FS, { move: { mode: "push", distance: "20" } })]);
    expect(c).toMatchObject({ agrees: true, detail: [] });
  });
});

describe("compareAsserts: what still disagrees under Ruling R24", () => {
  const draft = (assert, entry = {}) => ({ entry, assert });
  const disagrees = (d, r, structure = SAVE_DAMAGE) => {
    const c = compareAsserts(d, r, { structure });
    expect(c.agrees).toBe(false);
    return c;
  };
  it("a review that adds a condition the draft lacks", () => {
    const c = disagrees(WHIRLWIND, [...WHIRLWIND_REVIEW, a(FS, { condition: { applied: "blinded" } })]);
    expect(c.onlyReview).toEqual([c1(a(FS, { condition: { applied: "blinded" } }))]);
  });
  it("a draft push the review lacks", () => {
    const c = disagrees(WHIRLWIND, WHIRLWIND_REVIEW.filter((x) => !x.expect.move));
    expect(c.onlyDraft).toContain(c1(a(FS, { move: { mode: "push", distance: 20 } })));
  });
  it("the same kind with another fraction (0.5 against 0)", () => {
    const c = disagrees(draft([a(SS, { damage: { fraction: 0.5 } })]), [a(SS, { damage: { fraction: 0, type: "fire" } })]);
    expect(c.onlyDraft).toEqual([c1(a(SS, { damage: { fraction: 0.5 } }))]);
    expect(c.detail).toEqual([]);
  });
  it("both state a distance and differ", () => {
    disagrees(draft([a(FS, { move: { mode: "push", distance: 20 } })]), [a(FS, { move: { mode: "push", distance: 25 } })]);
  });
  it("both state a damage type and differ", () => {
    disagrees(draft([a(SS, { damage: { fraction: 0.5, type: "fire" } })]), [a(SS, { damage: { fraction: 0.5, type: "cold" } })]);
  });
  it("another move mode, or a condition ended where the draft applies one, is not detail", () => {
    disagrees(draft([a(FS, { move: { mode: "push" } })]), [a(FS, { move: { mode: "pull", distance: 20 } })]);
    disagrees(draft([a(FS, { condition: { applied: "prone" } })]),
      [a(FS, { condition: { applied: "prone", ended: "blinded" } })]);
    disagrees(draft([a(FS, { condition: { applied: "prone" } })]), [a(FS, { condition: { applied: "prone" }, affects: "target" })]);
  });
  it("a review-only full damage on a failed save when the item has no save activity with damage", () => {
    const review = [a(FS, { condition: { applied: "prone" } }), a(FS, { damage: { fraction: 1 } })];
    const d = draft([a(FS, { condition: { applied: "prone" } })]);
    const c = disagrees(d, review, NO_DAMAGE);
    expect(c.onlyReview).toEqual([c1(a(FS, { damage: { fraction: 1 } }))]);
    expect(c.baseline).toEqual([]);
    // An attack that deals damage is no baseline for a failed save, nor a save activity for a hit.
    disagrees(d, review, ATTACK_DAMAGE);
    disagrees(draft([a(HIT, { condition: { applied: "prone" } })]),
      [a(HIT, { condition: { applied: "prone" } }), a(HIT, { damage: { fraction: 1 } })], SAVE_DAMAGE);
    // A type the activity does not deal is not its baseline.
    disagrees(d, [a(FS, { condition: { applied: "prone" } }), a(FS, { damage: { fraction: 1, type: "fire" } })]);
  });
  it("a review-only half damage on a saved save is never baseline", () => {
    const c = disagrees(draft([a(FS, { condition: { applied: "prone" } })]),
      [a(FS, { condition: { applied: "prone" } }), a(SS, { damage: { fraction: 0.5 } })]);
    expect(c.baseline).toEqual([]);
  });
  it("a review-only full damage is not baseline when the draft says otherwise of that damage", () => {
    // The draft says the activity's damage is not rolled (noDamage): a review's full damage on the hit contradicts it.
    disagrees(draft([a({}, { damage: { fraction: 0 } }), a(HIT, { condition: { applied: "prone" } })]),
      [a({}, { damage: { fraction: 0 } }), a(HIT, { condition: { applied: "prone" } }), a(HIT, { damage: { fraction: 1 } })],
      ATTACK_DAMAGE);
  });
  it("a draft-only full damage is never ignored", () => {
    const c = disagrees(draft([a(HIT, { damage: { fraction: 1 } }), a(HIT, { condition: { applied: "prone" } })]),
      [a(HIT, { condition: { applied: "prone" } })], ATTACK_DAMAGE);
    expect(c.onlyDraft).toEqual([c1(a(HIT, { damage: { fraction: 1 } }))]);
  });
  it("another given (hit against failedSave), or a given detail on one side only", () => {
    disagrees(draft([a(HIT, { condition: { applied: "prone" } })]), [a(FS, { condition: { applied: "prone" } })]);
    disagrees(draft([a(FS, { condition: { applied: "prone" } })]),
      [a({ roll: "failedSave", targetType: "undead" }, { condition: { applied: "prone" } })]);
  });
  it("one review assertion never matches two different draft assertions", () => {
    const c = disagrees(draft([a(FS, { move: { mode: "push", distance: 20 } }), a(FS, { move: { mode: "push", distance: 25 } })]),
      [a(FS, { move: { mode: "push" } })]);
    expect(c.onlyDraft.length).toBe(1);
  });
  it("two contradicting review details never both pass on one draft assertion", () => {
    disagrees(draft([a(FS, { move: { mode: "push" } })]),
      [a(FS, { move: { mode: "push", distance: 20 } }), a(FS, { move: { mode: "push", distance: 25 } })]);
  });
  it("a free text on either side never agrees, detail or not", () => {
    disagrees(draft([a(FS, { move: { mode: "push" }, free: "shoved" })]), [a(FS, { move: { mode: "push", distance: 20 } })]);
    disagrees(draft([a(FS, { move: { mode: "push" } })]), [a(FS, { move: { mode: "push", distance: 20 }, free: "shoved" })]);
  });
});

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "calibration-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const gated = (r) => {
  r.evidence = { ...r.evidence, drafted: { by: "drafter-zz9", at: AT, core: "9.9.9", rule: ruleFingerprint(r.rule) } };
  r.evidence.gates = { at: AT, core: "9.9.9", rule: ruleFingerprint(r.rule), emits: emittedFingerprint(r),
    passed: ["schema", "validator", "ids", "fixes", "text", "unique"], items: gatedItems(r) };
  return r;
};
const spell = (rule) => gated({
  key: "tst:spell:storm-gust", name: "Storm Gust", kind: "spell", book: "TST", page: 3, edition: "2024",
  identifier: "storm-gust", text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
  items: [{ origin: "official", match: "matched", identifier: "storm-gust", docId: "Do11Do22Do33Do44", activities: [A_OFF],
    effects: [], data: { sha256: "a".repeat(64) } }],
  verdict: "entry", why: "x", evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9 } },
  rule: { handledIn: "table", adds: "Zorbly the quux.", origins: ["official"], ...rule }
});
const run = (records, results, opts = {}) => ingestReviews(records, results, {
  textDir, by: "reviewer-1", at: AT, core, offered: new Map(records.map((r) => [r.key, ruleFingerprint(r.rule)])), ...opts
});
const result = (r, over = {}) => ({ key: r.key, rule: ruleFingerprint(r.rule), why: "my own words", confidence: 0.9, ...over });

describe("ingestReviews: Ruling R24 recorded", () => {
  it("an agreement that used a tolerance says which, in a closed field the schema holds", () => {
    const r = spell(WHIRLWIND);
    const out = run([r], [result(r, { assert: WHIRLWIND_REVIEW })], { structures: new Map([[r.key, SAVE_DAMAGE]]) });
    expect(out.agreed).toEqual([r.key]);
    const next = out.records[0];
    expect(next.evidence.reviewed).toEqual({ by: "reviewer-1", at: AT, agrees: true, rule: ruleFingerprint(r.rule),
      confidence: 0.9, tolerated: ["baseline", "detail"] });
    expect(stateOf(next)).toBe("reviewed");
    expect(validateRecord(next)).toEqual([]);
    expect(REVIEW_TOLERANCES).toEqual(["baseline", "detail"]);
    for (const bad of [[], ["prose"], ["detail", "baseline"], ["detail", "detail"], true]) {
      const forged = { ...next, evidence: { ...next.evidence, reviewed: { ...next.evidence.reviewed, tolerated: bad } } };
      expect(validateRecord(forged).join(" ")).toMatch(/evidence\.reviewed\.tolerated/);
    }
  });
  it("an exact agreement carries no tolerated field", () => {
    const r = spell({ entry: {}, assert: [a(FS, { condition: { applied: "prone" } })] });
    const out = run([r], [result(r, { assert: [a(FS, { condition: { applied: "prone" } })] })]);
    expect(out.agreed).toEqual([r.key]);
    expect(out.records[0].evidence.reviewed).not.toHaveProperty("tolerated");
  });
  it("without the structures nothing is baseline: the pilot's Flame Whip is queued with the comparison", () => {
    const r = spell(FLAME_WHIP);
    const out = run([r], [result(r, { assert: FLAME_WHIP_REVIEW })]);
    expect(out.agreed).toEqual([]);
    const [q] = out.disagreed;
    expect(q.reason).toBe("disagreement");
    expect(q.review).toMatchObject({ baseline: [], onlyReview: normaliseAssert(FLAME_WHIP_REVIEW.slice(0, 2)),
      detail: [{ draft: c1(a(HIT, { move: { mode: "pull" } })), review: c1(a(HIT, { move: { mode: "pull", distance: 25 } })) }] });
    expect(validateQueueEntry(q, { queue: "review", vocabulary: core })).toEqual([]);
  });
  it("a queue entry holds baseline and detail as canonical strings only, and an older entry without them stays valid", () => {
    const r = spell(FLAME_WHIP);
    const [q] = run([r], [result(r, { assert: [...FLAME_WHIP_REVIEW, a(HIT, { condition: { applied: "blinded" } })] })],
      { structures: new Map([[r.key, ATTACK_DAMAGE]]) }).disagreed;
    expect(q.review.baseline).toEqual(normaliseAssert(FLAME_WHIP_REVIEW.slice(0, 2)));
    expect(validateQueueEntry(q, { queue: "review" })).toEqual([]);
    const { baseline, detail, ...older } = q.review;
    expect(validateQueueEntry({ ...q, review: older }, { queue: "review" })).toEqual([]);
    expect(() => queueText("review", [{ ...q, review: { ...q.review, baseline: ["prose here"] } }])).toThrow(/baseline/);
    expect(() => queueText("review", [{ ...q, review: { ...q.review, detail: [{ draft: "prose", review: "x" }] } }]))
      .toThrow(/detail/);
  });
});

describe("ingestReviews: an entry the reviewer cannot express (pilot fact 2)", () => {
  it("outcome person, with no assertion, reaches review-queue.json as unexpressed", () => {
    expect(REVIEW_RESULT_FIELDS).toEqual(["key", "rule", "outcome", "assert", "why", "confidence"]);
    expect(REVIEW_REASONS).toContain("unexpressed");
    const r = spell({ entry: {}, assert: [a(FS, { condition: { applied: "prone" } })] });
    const out = run([r], [result(r, { outcome: "person", confidence: 0.5 })]);
    expect(out.rejected).toEqual([]);
    const [q] = out.disagreed;
    expect(q).toMatchObject({ key: r.key, reason: "unexpressed", review: { assert: [], agrees: false, onlyReview: [],
      onlyDraft: normaliseAssert(r.rule.assert) } });
    expect(validateQueueEntry(q, { queue: "review", vocabulary: core })).toEqual([]);
  });
  it("a free-only assertion, an empty list, or person with assertions is still rejected", () => {
    const r = spell({ entry: {}, assert: [a(FS, { condition: { applied: "prone" } })] });
    const reasons = (over) => run([r], [result(r, over)]).rejected.map((x) => x.reason).join(" | ");
    expect(reasons({ assert: [a({ moment: "hit" }, { free: "something" })] })).toMatch(/at least one closed field/);
    expect(reasons({ assert: [] })).toMatch(/assert: required/);
    expect(reasons({ outcome: "person", assert: [a(FS, { condition: { applied: "prone" } })] })).toMatch(/outcome person/);
    expect(reasons({ outcome: "maybe", assert: [a(FS, { condition: { applied: "prone" } })] })).toMatch(/outcome/);
  });
  it("the reviewer brief gives the person form and says free alone is refused", () => {
    const doc = readFileSync(join(process.cwd(), "docs", "PIPELINE.md"), "utf8");
    const brief = doc.slice(doc.indexOf("## 📖 Brief for a reviewer agent"), doc.indexOf("## 📥 Ingesting results"));
    expect(brief).toMatch(/"outcome": "person"/);
    expect(brief).toMatch(/only a `free`/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Monster features and DDB Importer (Ruling R3): never offered as rulable, and accounted for by the ingest.
const OWN = "Bt11Bt22Bt33Bt44";
const monster = (over = {}) => ({
  key: "tst:monster:glimmer-drake/action/bite", name: "Bite", kind: "monster", book: "TST", page: 3, edition: "2024",
  owner: "Glimmer Drake", section: "action", identifier: "bite",
  text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
  items: [
    { origin: "official", match: "matched", identifier: "bite", docId: `Ac11Ac22Ac33Ac44.${OWN}`, activities: [A_OFF],
      effects: [], data: { sha256: "a".repeat(64) } },
    { origin: "ddb-importer", match: "matched", identifier: "bite", docId: "ddbDrake00000001.ddbBite00000001",
      activities: ["ddbBiteAttack001"], effects: ["ddbBiteEffect001"], data: { sha256: "b".repeat(64) } },
    { origin: "plutonium", match: "unchecked" }
  ],
  verdict: "entry", why: "a hit shoves", evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9 } }, ...over
});
const embedded = new Map([["TST", embeddedIndex([{ name: "Glimmer Drake", items: [{ docId: `Ac11Ac22Ac33Ac44.${OWN}` }] }])]]);

describe("batch draft and batch review: DDB Importer is never offered for a monster feature", () => {
  const ddbOf = (entry) => entry.items.find((i) => i.origin === "ddb-importer");
  it("marks the origin uncovered always and gives none of its ids", () => {
    const [batch] = cutDraftBatches([monster()], { core: { shipped: {} }, embedded: embedded.get("TST") });
    expect(ddbOf(batch.entries[0])).toEqual({ origin: "ddb-importer", match: "matched", uncovered: "always" });
    expect(JSON.stringify(batch)).not.toMatch(/ddbBite|ddbDrake/);
    expect(batch.entries[0].items[0]).toMatchObject({ origin: "official", docId: `Ac11Ac22Ac33Ac44.${OWN}` });
    expect(rulableOrigin(monster(), "ddb-importer")).toBe(false);
    expect(rulableOrigin(monster(), "official")).toBe(true);
    expect(rulableOrigin({ kind: "spell" }, "ddb-importer")).toBe(true);
  });
  it("in a review batch too; a spell keeps its DDB Importer item as it is", () => {
    const m = monster();
    m.rule = { handledIn: "table", adds: "Zorbly.", origins: ["official"], entry: {},
      uncovered: [{ origin: "ddb-importer", because: DDB_MONSTER_UNCOVERED }], assert: [a(HIT, { affects: "target" })] };
    gated(m);
    const [batch] = cutReviewBatches([m]);
    expect(ddbOf(batch.entries[0])).toEqual({ origin: "ddb-importer", match: "matched", uncovered: "always" });
    const s = spell({ entry: {}, assert: [a(FS, { condition: { applied: "prone" } })] });
    s.items.push({ origin: "ddb-importer", match: "matched", identifier: "storm-gust", docId: "Dd11Dd22Dd33Dd44",
      activities: ["Ad11Bd22Cd33Dd44"], effects: [], data: { sha256: "b".repeat(64) } });
    s.rule.uncovered = [{ origin: "ddb-importer", because: "one line" }];
    gated(s);
    const [other] = cutReviewBatches([s]);
    expect(ddbOf(other.entries[0])).toMatchObject({ docId: "Dd11Dd22Dd33Dd44", activities: ["Ad11Bd22Cd33Dd44"] });
  });
  it("the drafter vocabulary says what a monster feature names and the fixed reason", () => {
    const v = draftVocabulary({ moments: [], stepTypes: [], facts: [], statuses: [], creatureTypes: [], moveModes: [],
      effectEnds: [], damageTypes: [], abilities: [], shipped: {} });
    expect(v.monsters).toEqual({ origins: ["official"], uncovered: [{ origin: "ddb-importer", because: DDB_MONSTER_UNCOVERED }] });
  });
});

describe("ingestDrafts: a monster feature's DDB Importer origin is accounted for by the tool", () => {
  const rule = (over = {}) => ({ handledIn: "table", adds: "A hit shoves the target.", origins: ["official"],
    entry: { saveDamage: { [A_OFF]: "half" } }, assert: [a(SS, { damage: { fraction: 0.5 } })], ...over });
  const draft = (records, results) => ingestDrafts(records, results, {
    textDir, by: "drafter-1", at: AT, core, embedded, offered: new Set(records.map((r) => r.key))
  });
  const res = (r) => ({ key: monster().key, outcome: "rule", why: "half on a save", confidence: 0.9, rule: r });
  it("adds the uncovered entry with the fixed reason when the drafter left it out", () => {
    const out = draft([monster()], [res(rule())]);
    expect(out.rejected).toEqual([]);
    expect(out.records[0].rule.uncovered).toEqual([{ origin: "ddb-importer", because: DDB_MONSTER_UNCOVERED }]);
  });
  it("keeps the drafter's own line when it gave one, and adds nothing for an unmatched DDB Importer item", () => {
    const own = draft([monster()], [res(rule({ uncovered: [{ origin: "ddb-importer", because: "world ids" }] }))]);
    expect(own.records[0].rule.uncovered).toEqual([{ origin: "ddb-importer", because: "world ids" }]);
    const m = monster();
    m.items[1] = { origin: "ddb-importer", match: "ambiguous", candidates: [], differences: ["actor"] };
    const none = draft([m], [res(rule())]);
    expect(none.rejected).toEqual([]);
    expect(none.records[0].rule.uncovered).toBeUndefined();
  });
  it("still rejects a rule that names DDB Importer in origins", () => {
    const out = draft([monster()], [res(rule({ origins: ["official", "ddb-importer"],
      entry: { saveDamage: { [A_OFF]: "half", ddbBiteAttack001: "half" } } }))]);
    expect(out.rejected[0].reason).toMatch(/rule\.origins: ddb-importer cannot be reached/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// The CLI: `batch draft` writes no DDB Importer structure for a monster feature; `ingest --review` needs RULEPACK_DUMPS and
// decides the baseline from the official item's structure.
describe("pipeline CLI: monster features under R3 and R24", () => {
  const withCore = it.skipIf(!process.env.DAS_CORE);
  let tmp, env;
  const MARK = "ZZMARKERZZ";
  const claw = (id) => ({
    _id: id, name: "Scorch", type: "feat", effects: [],
    system: { identifier: "scorch", source: { rules: "2014" }, description: { value: MARK },
      activities: { actAAAAAAAAAAAAA: { _id: "actAAAAAAAAAAAAA", type: "attack", activation: { type: "action" },
        damage: { parts: [{ number: 2, denomination: 6, types: ["fire"] }] } } } }
  });
  const file = (rel, data) => {
    const f = join(tmp, rel);
    mkdirSync(join(f, ".."), { recursive: true });
    writeFileSync(f, typeof data === "string" ? data : JSON.stringify(data));
    return f;
  };
  const cli = (args, over = {}) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8",
    env: { ...env, ...over } });
  const KEY = "tce:monster:ember-mole/action/scorch";
  const records = () => JSON.parse(readFileSync(join(tmp, "registry", "tce.json"), "utf8")).records;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "calibration-cli-"));
    env = { PATH: process.env.PATH, RULEPACK_DATASET: join(tmp, "data"), RULEPACK_DUMPS: join(tmp, "dumps"),
      RULEPACK_TEXT: join(tmp, "text"), RULEPACK_REGISTRY: join(tmp, "registry"),
      ...(process.env.DAS_CORE ? { DAS_CORE: process.env.DAS_CORE } : {}) };
    file("data/bestiary/bestiary-tce.json", { monster: [{
      name: "Ember Mole", source: "TCE", page: 7, action: [{ name: "Scorch", entries: ["Flames."] }] }] });
    file("dumps/dnd-tashas-cauldron.actors.json", [{ _id: "actorAAAAAAAAAAA", name: "Ember Mole", type: "npc", system: {},
      items: [claw("itemAAAAAAAAAAAA")] }]);
    file("dumps/ddb.ddb-base-world-ddb-monsters.json", [{ _id: "ddbActorAAAAAAA1", name: "Ember Mole", type: "npc",
      system: { source: { rules: "2014" } }, items: [claw("ddbItemAAAAAAAA1")] }]);
    expect(cli(["inventory", "TCE", "monster"]).status).toBe(0);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));
  const setRecord = (change) => {
    const book = loadBook(join(tmp, "registry"), "TCE");
    saveBook(join(tmp, "registry"), { ...book, records: book.records.map((r) => (r.key === KEY ? change(r) : r)) });
  };

  withCore("batch draft offers no DDB Importer id or structure for a monster feature", () => {
    setRecord((r) => ({ ...r, verdict: "entry", why: "a burn" }));
    const priv = join(tmp, "private");
    const r = cli(["batch", "draft", "TCE", "--out", join(tmp, "out"), "--structure", priv]);
    expect(r.status, r.stderr).toBe(0);
    const batch = JSON.parse(readFileSync(join(tmp, "out", "tce-draft-001.json"), "utf8"));
    expect(batch.entries[0].items.find((i) => i.origin === "ddb-importer")).toEqual({ origin: "ddb-importer",
      match: "matched", uncovered: "always" });
    const structure = JSON.parse(readFileSync(join(priv, "tce-draft-001.structure.json"), "utf8"));
    expect(Object.keys(structure.entries[KEY])).toEqual(["official"]);
    expect(JSON.stringify(structure)).not.toContain(MARK);
  });

  withCore("ingest --review needs RULEPACK_DUMPS and takes the hit's own damage as baseline from the official item", () => {
    const sha = cacheText(join(tmp, "text"), BODY);
    setRecord((r) => {
      const next = { ...r, identifier: "tce-ember-mole-scorch", sources: { itemAAAAAAAAAAAA: "tce-ember-mole-scorch" },
        text: { ...r.text, sha256: sha }, verdict: "entry", why: "a burn",
        rule: { handledIn: "table", adds: "Zorbly the quux.", origins: ["official"], entry: {}, origin: "Ember Mole",
          uncovered: [{ origin: "ddb-importer", because: DDB_MONSTER_UNCOVERED }],
          assert: [a(HIT, { condition: { applied: "prone" } })] } };
      return gated(next);
    });
    const [rec] = records();
    expect(stateOf(rec)).toBe("gated");
    const batch = file("tce-review-001.json", { id: "tce-review-001", stage: "review",
      entries: [{ key: KEY, rule: ruleFingerprint(rec.rule) }] });
    const results = file("r.json", { batch: "tce-review-001", by: "reviewer-1", results: [{ key: KEY,
      rule: ruleFingerprint(rec.rule), why: "my own words", confidence: 0.9,
      assert: [a(HIT, { condition: { applied: "prone" } }), a(HIT, { damage: { fraction: 1, type: "fire" } })] }] });
    const { RULEPACK_DUMPS, ...noDumps } = env;
    const without = spawnSync("node", ["tools/pipeline/cli.mjs", "ingest", results, "--review", "--batch", batch],
      { encoding: "utf8", env: noDumps });
    expect(without.status).toBe(2);
    expect(without.stderr).toMatch(/RULEPACK_DUMPS/);
    const r = cli(["ingest", results, "--review", "--batch", batch]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ agreed: 1, queued: 0 });
    const [after] = records();
    expect(after.evidence.reviewed).toMatchObject({ agrees: true, tolerated: ["baseline"] });
    expect(loadQueue(join(tmp, "registry"), "review")).toEqual([]);
  });
});
