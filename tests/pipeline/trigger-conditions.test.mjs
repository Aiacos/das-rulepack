// Ruling R30: a trigger may carry a condition over closed facts of the engine (`if: { "<fact>": <arg> }`), the assertion
// vocabulary says it in `given`, review compares it as identity, the engine's own conditioned readings imply the same
// conditioned assertions, and a scenario stages the positive side where it can. Synthetic fixtures only: invented ids,
// invented entries, sentences in this test's own words.
import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestRereads, readingFingerprint } from "../../tools/pipeline/reread.mjs";
import {
  DRAFT_FACTS, EXCLUDED_FACTS, MAX_CONDITION_FACTS, SIZES, conditionProblems, givensOfCondition
} from "../../tools/pipeline/conditions.mjs";
import { DRAFT_SHAPES, checkDraftKeys, conditionProblemsOf } from "../../tools/pipeline/draft-keys.mjs";
import {
  GIVEN_FIELDS, assertProblems, assertShapes, impliedAsserts, isCanonicalAssertion, normaliseAssert, unassertableKeys
} from "../../tools/pipeline/assert.mjs";
import { compareAsserts } from "../../tools/pipeline/review.mjs";
import { compareWithReading, engineReading } from "../../tools/pipeline/engine-reading.mjs";
import { DEFINITIONS, undefinedWords } from "../../tools/pipeline/definitions.mjs";
import { draftVocabulary, reviewVocabulary } from "../../tools/pipeline/batch.mjs";
import { TARGETS, TARGET_SIZES, DEFAULT_TARGET, scenarioOf } from "../../tools/pipeline/scenarios.mjs";
import { gateValidator } from "../../tools/pipeline/gates.mjs";
import { LEAVE_REASONS } from "../../tools/pipeline/leaves.mjs";
import { loadCore } from "../../tools/pipeline/core.mjs";
import { resolveShape } from "../../tools/pipeline/shapes.mjs";
import { variants } from "./fixtures/shapes.mjs";

const SAVE = "Sv10Sv21Sv32Sv43";
const FX = "Fx10Fx21Fx32Fx43";
const spell = { origins: ["official"], kind: "monster" };
const vocabulary = {
  sizes: ["tiny", "sm", "med", "lg", "huge", "grg"], statuses: ["prone", "grappled", "frightened"],
  creatureTypes: ["beast", "undead"], damageTypes: ["fire", "cold"], moments: ["failedSave", "hit", "isDamaged", "endOfTurn"],
  moveModes: ["push", "pull"], effectEnds: ["bearerTurnEnd"]
};
const push = (cond) => ({ on: "failedSave", ...(cond === undefined ? {} : { if: cond }),
  do: [{ type: "move", mode: "push", distance: 10, units: "ft" }, { type: "status", status: "prone" }] });
const canon = (a) => normaliseAssert([a])[0];

describe("DRAFT_FACTS: a closed allowlist, each argument typed", () => {
  it("lists the facts the pilots needed, each with its subject, its argument kind and the given field that says it", () => {
    expect(Object.keys(DRAFT_FACTS).sort()).toEqual([
      "activity.isAttack", "activity.isMelee", "activity.isSpell", "activity.isWeapon", "damage.hasType", "source.hasStatus",
      "source.onOwnTurn", "target.bloodied", "target.creatureType", "target.hasStatus", "target.hpAtMost", "target.sizeAtMost",
      "target.within", "target.wounded"
    ]);
    expect(Object.isFrozen(DRAFT_FACTS)).toBe(true);
    for (const [name, f] of Object.entries(DRAFT_FACTS)) {
      expect(Object.isFrozen(f), name).toBe(true);
      expect(["target", "source", "activity", "damage"], name).toContain(f.subject);
      expect(name.startsWith(`${f.subject}.`), name).toBe(true);
      expect(["enum", "int", "distance", "true", "enumList"], name).toContain(f.arg.kind);
      expect(GIVEN_FIELDS, name).toContain(f.given);
    }
    expect(MAX_CONDITION_FACTS).toBe(3);
  });

  it("no identifier, no free text: the facts left out each say why, and none is allowed", () => {
    for (const name of ["source.hasEffect", "target.hasEffect", "target.hasEffectFrom", "activity.identifier",
      "source.classLevelAtLeast", "activity.type", "activity.dealsType", "source.creatureType"]) {
      expect(Object.hasOwn(EXCLUDED_FACTS, name), name).toBe(true);
      expect(Object.hasOwn(DRAFT_FACTS, name), name).toBe(false);
    }
    for (const [name, why] of Object.entries(EXCLUDED_FACTS)) expect(why, name).toMatch(/^[\x20-\x7e]{20,200}$/);
    // Every argument kind is closed: an enum of an engine list, a bounded integer or distance, or true.
    for (const f of Object.values(DRAFT_FACTS)) {
      if (f.arg.kind === "int" || f.arg.kind === "distance") {
        expect(Number.isInteger(f.arg.min) && Number.isInteger(f.arg.max) && f.arg.min >= 1 && f.arg.max > f.arg.min).toBe(true);
      }
      if (f.arg.kind === "enum" || f.arg.kind === "enumList") expect(typeof f.arg.list).toBe("string");
    }
  });
});

describe("checkDraftKeys: a trigger's condition", () => {
  const entry = (cond) => ({ triggers: [push(cond)] });
  it("accepts the engine's form: one object whose keys are allowed facts (all must hold), at most 3", () => {
    expect(checkDraftKeys(entry({ "target.sizeAtMost": "lg" }), spell)).toEqual([]);
    expect(checkDraftKeys(entry({ "target.sizeAtMost": "lg", "target.creatureType": "beast", "activity.isMelee": true }),
      spell)).toEqual([]);
    expect(checkDraftKeys({ triggers: [{ on: "isDamaged", if: { "damage.hasType": ["fire", "cold"] },
      do: [{ type: "status", status: "prone" }] }] }, spell)).toEqual([]);
    expect(checkDraftKeys(entry({ "target.within": { distance: 10, units: "ft" }, "target.hpAtMost": 20 }), spell)).toEqual([]);
  });

  it("refuses more than 3 facts, an excluded or unknown fact, an inherited name, combinations and the clause list", () => {
    const four = { "target.sizeAtMost": "lg", "target.creatureType": "beast", "activity.isMelee": true, "source.onOwnTurn": true };
    expect(checkDraftKeys(entry(four), spell).join("; ")).toMatch(/at most 3 facts/);
    expect(checkDraftKeys(entry({ "target.hasEffect": "hex" }), spell).join("; ")).toMatch(/target\.hasEffect: not a drafter's/);
    expect(checkDraftKeys(entry({ "target.flies": true }), spell).join("; ")).toMatch(/target\.flies: unknown fact/);
    expect(checkDraftKeys(entry({ constructor: true }), spell).join("; ")).toMatch(/constructor/);
    expect(checkDraftKeys(entry({ toString: true }), spell).join("; ")).toMatch(/toString: unknown fact/);
    expect(checkDraftKeys(entry({ all: [{ "target.sizeAtMost": "lg" }] }), spell).join("; ")).toMatch(/all: .*one object/);
    expect(checkDraftKeys(entry({ not: { "target.sizeAtMost": "lg" } }), spell).join("; ")).toMatch(/not: /);
    expect(checkDraftKeys(entry({}), spell).join("; ")).toMatch(/at least one fact/);
    expect(checkDraftKeys(entry([{ "target.sizeAtMost": "lg" }]), spell).join("; ")).toMatch(/one object/);
    // The recipe's clause list is not what a trigger declaration reads: the engine would ignore it silently.
    const clauses = { triggers: [{ ...push(), condition: [{ fact: "target.sizeAtMost", arg: "lg" }] }] };
    expect(checkDraftKeys(clauses, spell).join("; ")).toMatch(/condition: .*if/);
  });

  it("refuses two facts said by the same given field, and every argument of the wrong type", () => {
    expect(checkDraftKeys(entry({ "activity.isAttack": true, "activity.isMelee": true }), spell).join("; "))
      .toMatch(/same given field/);
    const bad = [
      [{ "target.sizeAtMost": "source" }, /target\.sizeAtMost/], [{ "target.sizeAtMost": "Large or smaller" }, /a word/],
      [{ "target.sizeAtMost": ["lg"] }, /a word/], [{ "activity.isMelee": false }, /true/], [{ "target.bloodied": "yes" }, /true/],
      [{ "target.hpAtMost": 0 }, /integer from 1/], [{ "target.hpAtMost": 2.5 }, /integer/],
      [{ "target.hpAtMost": "10" }, /integer/], [{ "target.within": { distance: 10, units: "m" } }, /units/],
      [{ "target.within": { distance: 1000, units: "ft" } }, /distance/], [{ "target.within": 10 }, /distance, units/],
      [{ "target.within": { distance: 10, units: "ft", through: "walls" } }, /distance, units/],
      [{ "damage.hasType": [] }, /1 to/], [{ "damage.hasType": "fire" }, /list/],
      [{ "damage.hasType": ["fire", "fire"] }, /twice/], [{ "target.hasStatus": "" }, /a word/]
    ];
    for (const [cond, why] of bad) expect(checkDraftKeys(entry(cond), spell).join("; "), JSON.stringify(cond)).toMatch(why);
  });

  it("checks the words against the engine's lists when they are given (the validator gate)", () => {
    const e = entry({ "target.sizeAtMost": "enormous", "target.hasStatus": "dazed" });
    expect(checkDraftKeys(e, spell)).toEqual([]);
    const problems = conditionProblemsOf(e, { vocabulary }).join("; ");
    expect(problems).toMatch(/target\.sizeAtMost: must be one of tiny, sm, med, lg, huge, grg/);
    expect(problems).toMatch(/target\.hasStatus: must be a status of the engine/);
    expect(conditionProblemsOf(entry({ "target.sizeAtMost": "huge" }), { vocabulary })).toEqual([]);
    // conditionProblems on its own: own properties only.
    expect(conditionProblems(Object.create({ "target.sizeAtMost": "lg" }), { vocabulary }).join("; ")).toMatch(/at least one/);
  });

  it("the gate validator refuses a word outside the engine's lists", () => {
    const record = { kind: "monster", rule: { handledIn: "table", adds: "x", origins: ["official"],
      entry: entry({ "target.sizeAtMost": "enormous" }), assert: [] } };
    const core = { ...vocabulary, facts: Object.keys(DRAFT_FACTS), validateEntry: () => [] };
    expect(gateValidator(record, { core }).join("; ")).toMatch(/target\.sizeAtMost: must be one of/);
  });
});

describe("the given fields that mirror the facts", () => {
  it("each has a shape, a definition, and values built from it pass assertProblems", () => {
    const given = assertShapes().given;
    for (const f of ["targetSizeAtMost", "targetType", "targetStatus", "selfStatus", "targetWithin", "targetHp",
      "targetHpAtMost", "onOwnTurn", "damageType", "activity"]) {
      expect(GIVEN_FIELDS, f).toContain(f);
      expect(Object.hasOwn(given, f), f).toBe(true);
      expect(Object.hasOwn(DEFINITIONS.given, f), f).toBe(true);
    }
    for (const f of GIVEN_FIELDS) expect(Object.hasOwn(DEFINITIONS.given, f), f).toBe(true);
    let n = 0;
    for (const [field, shape] of Object.entries(given)) {
      for (const value of variants(resolveShape(shape, { ...vocabulary, moments: vocabulary.moments }))) {
        n++;
        // Ruling R34: a spell level goes with what a globe bars (a rule across fields, outside the declarative shape).
        const a = [{ given: { [field]: value }, expect: field === "spellLevelAtMost" ? { bars: "spells" }
          : { condition: { applied: "prone" } } }];
        expect(assertProblems(a, { vocabulary }), `${field} ${JSON.stringify(value)}`).toEqual([]);
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  it("refuses words outside the lists and arguments of the wrong type", () => {
    const at = (given) => assertProblems([{ given, expect: { condition: { applied: "prone" } } }], { vocabulary }).join("; ");
    expect(at({ targetSizeAtMost: "enormous" })).toMatch(/targetSizeAtMost: must be a size of the engine/);
    expect(at({ targetStatus: "dazed" })).toMatch(/targetStatus/);
    expect(at({ selfStatus: 3 })).toMatch(/selfStatus/);
    expect(at({ targetWithin: 0 })).toMatch(/targetWithin/);
    expect(at({ targetWithin: "30 feet" })).toMatch(/targetWithin/);
    expect(at({ targetHp: "low" })).toMatch(/targetHp: must be one of bloodied, wounded/);
    expect(at({ targetHpAtMost: 1.5 })).toMatch(/targetHpAtMost/);
    expect(at({ onOwnTurn: "yes" })).toMatch(/onOwnTurn: must be true/);
    expect(at({ damageType: "sparkly" })).toMatch(/damageType/);
    expect(at({ activity: "ranged" })).toMatch(/activity: must be one of attack, melee, weapon, spell/);
  });

  it("a canonical assertion with a true or numeric given reads back as itself", () => {
    const c = canon({ given: { roll: "hit", onOwnTurn: true, targetWithin: 30 }, expect: { condition: { applied: "prone" } } });
    expect(c).toBe("expect.condition.applied=prone;given.onOwnTurn=true;given.roll=hit;given.targetWithin=30");
    expect(isCanonicalAssertion(c, vocabulary)).toBe(true);
  });

  it("the size words and the new words of the pack's lists all have a definition", () => {
    expect(undefinedWords({ sizes: SIZES })).toEqual([]);
    expect(undefinedWords({ sizes: [...SIZES, "colossal"] })).toEqual(["size.colossal"]);
    for (const w of ["attack", "melee", "weapon", "spell"]) expect(Object.hasOwn(DEFINITIONS.activity, w), w).toBe(true);
    for (const w of ["bloodied", "wounded"]) expect(Object.hasOwn(DEFINITIONS.targetHp, w), w).toBe(true);
    for (const f of Object.keys(DRAFT_FACTS)) expect(Object.hasOwn(DEFINITIONS.fact, f), f).toBe(true);
  });
});

describe("impliedAsserts: a trigger's condition goes into the given of what it implies", () => {
  it("prone and pushed on a failed save, only if Large or smaller: each one assertion with both givens", () => {
    const got = impliedAsserts({ triggers: [push({ "target.sizeAtMost": "lg" })] });
    expect(got).toEqual(normaliseAssert([
      { given: { roll: "failedSave", targetSizeAtMost: "lg" }, expect: { condition: { applied: "prone" } } },
      { given: { roll: "failedSave", targetSizeAtMost: "lg" }, expect: { move: { mode: "push", distance: 10 } } }
    ]));
    expect(unassertableKeys({ triggers: [push({ "target.sizeAtMost": "lg" })] })).toEqual([]);
  });

  it("every allowed fact maps to its given field; a damage type list is one assertion per type", () => {
    const cases = [
      [{ "target.creatureType": "beast" }, { targetType: "beast" }],
      [{ "target.hasStatus": "grappled" }, { targetStatus: "grappled" }],
      [{ "source.hasStatus": "frightened" }, { selfStatus: "frightened" }],
      [{ "target.within": { distance: 15, units: "ft" } }, { targetWithin: 15 }],
      [{ "target.bloodied": true }, { targetHp: "bloodied" }], [{ "target.wounded": true }, { targetHp: "wounded" }],
      [{ "target.hpAtMost": 25 }, { targetHpAtMost: 25 }], [{ "source.onOwnTurn": true }, { onOwnTurn: true }],
      [{ "activity.isAttack": true }, { activity: "attack" }], [{ "activity.isMelee": true }, { activity: "melee" }],
      [{ "activity.isWeapon": true }, { activity: "weapon" }], [{ "activity.isSpell": true }, { activity: "spell" }]
    ];
    expect(cases.map(([c]) => Object.keys(c)[0]).sort()).toEqual(Object.keys(DRAFT_FACTS)
      .filter((f) => f !== "damage.hasType" && f !== "target.sizeAtMost").sort());
    for (const [cond, given] of cases) expect(givensOfCondition(cond), JSON.stringify(cond)).toEqual({ givens: [given] });
    expect(givensOfCondition({ "damage.hasType": ["fire", "cold"] }))
      .toEqual({ givens: [{ damageType: "fire" }, { damageType: "cold" }] });
    expect(givensOfCondition(undefined)).toEqual({ givens: [{}] });
  });

  it("the engine's other forms: `all` is read as the facts together; anything with no word is unassertable", () => {
    expect(givensOfCondition({ all: [{ "target.sizeAtMost": "lg" }, { "activity.isMelee": true }] }))
      .toEqual({ givens: [{ targetSizeAtMost: "lg", activity: "melee" }] });
    for (const c of [{ any: [{ "target.sizeAtMost": "lg" }] }, { not: { "target.hasStatus": "prone" } },
      { "activity.identifier": "gust-slam" }, { "target.sizeAtMost": "source" }, { "target.grappledBySource": true },
      { "activity.isAttack": true, "activity.isMelee": true }, { "target.within": { distance: 3, units: "m" } },
      { "activity.isMelee": false }, { constructor: true }, "lg", 3]) {
      expect(givensOfCondition(c), JSON.stringify(c)).toEqual({ unassertable: true });
    }
    // A trigger whose condition has no word implies nothing (never the unconditioned assertion), and is unassertable.
    const entry = { triggers: [push({ any: [{ "target.sizeAtMost": "lg" }, { "target.hasStatus": "prone" }] })] };
    expect(impliedAsserts(entry)).toEqual([]);
    expect(unassertableKeys(entry)).toEqual(["triggers"]);
  });
});

describe("compareAsserts: a condition is identity", () => {
  const rule = (cond) => ({ entry: { triggers: [push(cond)] }, assert: [] });
  const review = (given) => [
    { given: { roll: "failedSave", ...given }, expect: { condition: { applied: "prone" } } },
    { given: { roll: "failedSave", ...given }, expect: { move: { mode: "push", distance: 10 } } }
  ];
  it("agrees when both state the same size limit, and the same size is one value", () => {
    expect(compareAsserts(rule({ "target.sizeAtMost": "lg" }), review({ targetSizeAtMost: "lg" })).agrees).toBe(true);
    expect(compareAsserts(rule(), review({})).agrees).toBe(true);
  });
  it("disagrees in both directions when one side states a limit the other does not, and on another size", () => {
    const drafted = compareAsserts(rule({ "target.sizeAtMost": "lg" }), review({}));
    expect(drafted.agrees).toBe(false);
    expect(drafted.onlyDraft.every((c) => c.includes("given.targetSizeAtMost=lg"))).toBe(true);
    const reviewed = compareAsserts(rule(), review({ targetSizeAtMost: "lg" }));
    expect(reviewed.agrees).toBe(false);
    expect(reviewed.onlyReview.every((c) => c.includes("given.targetSizeAtMost=lg"))).toBe(true);
    const other = compareAsserts(rule({ "target.sizeAtMost": "lg" }), review({ targetSizeAtMost: "huge" }));
    expect(other.agrees).toBe(false);
    expect(other.detail).toEqual([]);
  });
});

describe("the engine's conditioned reading", () => {
  const reading = { triggers: [push({ "target.sizeAtMost": "lg" })] };
  it("implies the same conditioned assertions as a pack rule that says it", () => {
    const fromReading = impliedAsserts(reading);
    expect(fromReading).toEqual(impliedAsserts({ triggers: [push({ "target.sizeAtMost": "lg" })] }));
    expect(fromReading.every((c) => c.includes("given.targetSizeAtMost=lg"))).toBe(true);
  });
  it("a pack trigger that repeats the engine's conditioned trigger is the same; one without the limit drops it", () => {
    const core = { mergeEntries: (layers) => Object.assign({}, ...layers.filter(Boolean)) };
    const same = compareWithReading({ triggers: [push({ "target.sizeAtMost": "lg" })] }, reading, core);
    expect(same.triggers).toBe("same");
    expect(same.keys.triggers).toBe("same");
    expect(same.held).toEqual([]);
    const reordered = compareWithReading({ triggers: [{ do: push().do, if: { "target.sizeAtMost": "lg" }, on: "failedSave" }] },
      reading, core);
    expect(reordered.triggers).toBe("same");
    const bare = compareWithReading({ triggers: [push()] }, reading, core);
    expect(bare.triggers).toBe("drops");
  });
});

describe("a reread against a conditioned reading", () => {
  // This test's own words: a gust that knocks down and shoves anything up to a large size.
  const TEXT = "A gust of air rolls out from the quux. A creature up to a large size that fails is shoved and falls flat.";
  const SHA = "d".repeat(64);
  const reading = { triggers: [push({ "target.sizeAtMost": "lg" })] };
  const core = { version: "9.9.9", ...vocabulary };
  const key = "tst:monster:quux/action/gust";
  const record = { key, name: "Gust", kind: "monster", book: "TST", page: 1, edition: "2024", owner: "Quux",
    section: "action", text: { sha256: SHA, source: "dataset", chars: TEXT.length }, verdict: "entry",
    why: "a reader thought it needs a rule", items: [{ origin: "official", match: "matched", identifier: "gust",
      docId: "tstQuux000000000.ftGust000000000", activities: [SAVE], effects: [], data: { sha256: "b".repeat(64) } }],
    evidence: { triaged: { by: "reader-xmm-1", at: "2026-11-22T00:00:00.000Z", confidence: 0.8, keys: [], similar: [] } } };
  const structure = { activities: [{ id: SAVE, label: "Gust", type: "save", onSave: "none", effects: [], damage: [] }],
    effects: [] };
  const run = (beyond) => {
    const textDir = mkdtempSync(join(tmpdir(), "conditions-reread-"));
    try {
      writeFileSync(join(textDir, `${SHA}.txt`), TEXT);
      return ingestRereads([record], [{ key, covered: false, beyond, why: "the reader's own reason", confidence: 0.9 }], {
        textDir, by: "rereader-1", at: "2026-11-22T00:00:00.000Z", core,
        offered: new Map([[key, readingFingerprint(reading, core)]]), current: new Map([[key, { reading, structure }]]) });
    } finally { rmSync(textDir, { recursive: true, force: true }); }
  };
  const shove = (given) => ({ given: { roll: "failedSave", ...given }, expect: { move: { mode: "push", distance: 10 } } });
  it("a size limit the engine already reads is not beyond it", () => {
    const out = run([shove({ targetSizeAtMost: "lg" })]);
    expect(out.beyond).toEqual([]);
    expect(out.rejected[0].reason).toMatch(/engine's reading already implies it/);
  });
  it("another size limit is beyond it, and is kept as data", () => {
    const out = run([shove({ targetSizeAtMost: "med" })]);
    expect(out.rejected).toEqual([]);
    expect(out.beyond).toEqual([key]);
    expect(out.records[0].evidence.triaged.reread.beyond).toEqual([shove({ targetSizeAtMost: "med" })]);
  });
});

describe("scenarios: the positive side of a size limit is staged, the negative one is manual", () => {
  const ACTOR = "zzQuux0000000000";
  const ITEM = "zzQuuxGust000000";
  const record = (asserts, entry = { saveDamage: { [SAVE]: "half" } }) => ({
    key: "tst:monster:quux/action/gust", name: "Gust", kind: "monster", book: "TST", page: 1, edition: "2024",
    identifier: "quux-gust", items: [{ origin: "official", match: "matched", identifier: "gust", docId: `${ACTOR}.${ITEM}`,
      activities: [SAVE], effects: [FX], data: { sha256: "a".repeat(64) } }],
    rule: { handledIn: "table", adds: "x", origins: ["official"], entry, assert: asserts }
  });
  const sized = (size, over = {}) => ({ given: { roll: "failedSave", targetSizeAtMost: size, ...over },
    expect: { condition: { applied: "prone" } } });
  it("the target creatures' sizes are a committed copy: the default target is Medium", () => {
    expect(Object.keys(TARGET_SIZES).sort()).toEqual(Object.values(TARGETS).sort());
    expect(TARGET_SIZES[TARGETS[DEFAULT_TARGET]]).toBe("med");
    for (const s of Object.values(TARGET_SIZES)) expect(SIZES).toContain(s);
  });
  it("picks a target that satisfies the limit, and says the unmet side is a person's", () => {
    const big = scenarioOf(record([sized("lg")]));
    expect(big.setup.target).toEqual({ actor: TARGETS[DEFAULT_TARGET], type: DEFAULT_TARGET });
    expect(big.manual).toBe(true);
    expect(big.manualBecause).toEqual(["given.targetSizeAtMost.unmet"]);
    const small = scenarioOf(record([sized("sm")]));
    expect(TARGET_SIZES[small.setup.target.actor]).toBe("tiny");
    expect(small.manualBecause).toEqual(["given.targetSizeAtMost.unmet"]);
  });
  it("a type and a size together need one creature of both; none fits: manual for the positive side too", () => {
    const fiend = scenarioOf(record([sized("sm", { targetType: "fiend" })]));
    expect(fiend.setup.target).toEqual({ actor: TARGETS.fiend, type: "fiend" });
    const ogre = scenarioOf(record([sized("med", { targetType: "giant" })]));
    expect(ogre.manualBecause).toEqual(["given.targetSizeAtMost", "given.targetSizeAtMost.unmet"]);
  });
  it("the other new given fields have no interpreter: manual, named", () => {
    const s = scenarioOf(record([{ given: { roll: "failedSave", targetStatus: "grappled", activity: "melee" },
      expect: { condition: { applied: "prone" } } }]));
    expect(s.manual).toBe(true);
    expect(s.manualBecause).toEqual(["given.activity", "given.targetStatus"]);
  });
});

describe("the drafter's vocabulary file carries the condition", () => {
  const fakeCore = { moments: ["failedSave", "endOfTurn"], stepTypes: ["status"], facts: Object.keys(DRAFT_FACTS),
    statuses: ["prone"], creatureTypes: ["beast"], moveModes: ["push"], effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"],
    abilities: ["str"], sizes: [...SIZES], shipped: {} };
  it("the facts with their given fields and resolved argument shapes, the excluded ones with why; none for a reviewer", () => {
    const v = draftVocabulary(fakeCore);
    expect(v.conditions.max).toBe(3);
    expect(Object.keys(v.conditions.facts).sort()).toEqual(Object.keys(DRAFT_FACTS).sort());
    expect(v.conditions.facts["target.sizeAtMost"]).toMatchObject({ subject: "target", given: "targetSizeAtMost",
      arg: { type: "enum", values: SIZES } });
    expect(v.conditions.excluded).toEqual(JSON.parse(JSON.stringify(EXCLUDED_FACTS)));
    expect(v.engine.sizes).toEqual(SIZES);
    expect(JSON.stringify(v.draftShapes.triggers)).toContain("target.sizeAtMost");
    const review = reviewVocabulary(fakeCore);
    expect(review).not.toHaveProperty("conditions");
    expect(review.engine.sizes).toEqual(SIZES);
    expect(review.definitions).not.toHaveProperty("fact");
  });
  it("every condition built from the triggers shape passes checkDraftKeys, with the engine's words", () => {
    const shape = resolveShape(DRAFT_SHAPES.triggers, { ...vocabulary, moments: ["failedSave", "endOfTurn"] });
    let n = 0;
    for (const value of variants(shape)) {
      n++;
      const problems = [...checkDraftKeys({ triggers: value }, spell), ...conditionProblemsOf({ triggers: value }, { vocabulary })];
      expect(problems, JSON.stringify(value)).toEqual([]);
    }
    expect(n).toBeGreaterThan(Object.keys(DRAFT_FACTS).length);
  });
});

describe("leaves reasons stay for what the vocabulary still cannot say", () => {
  it("target-size, target-state and trigger-filter remain, defined as what is left after R30", () => {
    for (const r of ["target-size", "target-state", "trigger-filter"]) expect(LEAVE_REASONS).toContain(r);
    expect(DEFINITIONS.leavesBecause["target-size"].means).toMatch(/relative|still/i);
    expect(DEFINITIONS.leavesBecause["trigger-filter"].means).toMatch(/still|no fact/i);
  });
});

const CORE = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/recipes.mjs"))
  ? process.env.DAS_CORE : null;
describe.skipIf(!CORE)("against the DAS_CORE clone", () => {
  it("loadCore gives the engine's fact list with subject and argument kind, and its closed value lists", async () => {
    const core = await loadCore(CORE);
    expect(Object.keys(core.factKinds).length).toBeGreaterThan(15);
    for (const [name, f] of Object.entries(DRAFT_FACTS)) {
      expect(Object.hasOwn(core.factKinds, name), name).toBe(true);
      expect(core.factKinds[name], name).toEqual({ subject: f.subject, arg: f.engineArg });
      expect(core.facts, name).toContain(name);
      if (f.arg.kind === "enum" || f.arg.kind === "enumList") expect(core[f.arg.list]?.length, name).toBeGreaterThan(0);
    }
    // Every fact of the engine's condition list is either allowed or excluded with a reason; the excluded exist.
    for (const name of Object.keys(core.factKinds)) {
      expect(Object.hasOwn(DRAFT_FACTS, name) !== Object.hasOwn(EXCLUDED_FACTS, name), name).toBe(true);
    }
    for (const name of Object.keys(EXCLUDED_FACTS)) expect(core.facts, name).toContain(name);
    expect(core.sizes).toEqual([...SIZES]);
    expect(core.activityTypes).toContain("attack");
    expect(core.distanceUnits).toContain("ft");
    expect(undefinedWords(core)).toEqual([]);
  });

  it("a conditioned trigger built from the shape, every fact and every argument kind, is accepted by validateEntry", async () => {
    const core = await loadCore(CORE);
    const shape = resolveShape(DRAFT_SHAPES.triggers, core);
    const facts = Object.fromEntries(core.facts.map((name) => [name, true]));
    const seen = new Set();
    for (const value of variants(shape)) {
      for (const d of value) for (const k of Object.keys(d.if ?? {})) seen.add(k);
      expect(core.validateEntry({ triggers: value }, { facts }), JSON.stringify(value)).toEqual([]);
    }
    expect([...seen].sort()).toEqual(Object.keys(DRAFT_FACTS).sort());
  });

  it("the engine reads a size-limited push with its condition, and its implied assertions carry it", async () => {
    const core = await loadCore(CORE);
    const html = "<p>Strength Saving Throw: DC 12, one creature within 5 feet. Failure: 7 Bludgeoning damage. If the"
      + " target is Large or smaller, it is pushed 10 feet straight away from the gust.</p>";
    const item = { _id: "mmQuuxGust000000", name: "Quux Gust", type: "feat", effects: [], flags: {},
      system: { identifier: "quux-gust", description: { value: html }, activities: { [SAVE]: { _id: SAVE, type: "save",
        name: "", activation: { type: "action", condition: "" }, effects: [], damage: { onSave: "none", parts: [] },
        range: { value: "5", units: "ft", special: "" }, target: { template: { type: "", size: "" },
          affects: { type: "creature", count: "1", special: "" } } } } } };
    const reading = engineReading(item, core);
    expect(JSON.stringify(reading?.triggers)).toContain("target.sizeAtMost");
    const implied = impliedAsserts(reading);
    expect(implied.some((c) => c.includes("expect.move.mode=push") && c.includes("given.targetSizeAtMost=lg"))).toBe(true);
    expect(implied.some((c) => c.includes("expect.move.mode=push") && !c.includes("given.targetSizeAtMost"))).toBe(false);
  });
});

const DUMPS = process.env.RULEPACK_DUMPS && existsSync(process.env.RULEPACK_DUMPS) ? process.env.RULEPACK_DUMPS : null;
describe.skipIf(!DUMPS)("against the dumps", () => {
  it("each target creature has the committed size and type in the SRD 2024 actors", () => {
    const file = readdirSync(DUMPS).find((f) => f === "dnd5e.actors24.json");
    expect(file).toBeDefined();
    const docs = JSON.parse(readFileSync(join(DUMPS, file), "utf8"));
    const byId = new Map(docs.map((d) => [d._id, d]));
    for (const [type, id] of Object.entries(TARGETS)) {
      expect(byId.get(id)?.system?.traits?.size, id).toBe(TARGET_SIZES[id]);
      expect(byId.get(id)?.system?.details?.type?.value, id).toBe(type);
    }
  });
});
