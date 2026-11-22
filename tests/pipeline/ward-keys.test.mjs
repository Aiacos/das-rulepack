// Ruling R34: choices, barriers and wards. A drafter may write seven more engine keys in a closed, typed form (no free string,
// no identifier of another document, no label), what each does is an assertion of the closed vocabulary (`expect.chooses`,
// `expect.bars` with `given.spellLevelAtMost`, two more `denies` words), review compares it, a scenario says it is a person's
// to play, and the engine's own validator and field lists pin every shape. The keys of the same territory left out are named
// with why. Synthetic fixtures only: invented ids, invented entries, sentences in this test's own words.
import { describe, it, expect } from "vitest";
import { CHOICE_EFFECTS, EXCLUDED_WARD, NOT_ADMITTED, SPELL_LEVELS, WARD_KEYS } from "../../tools/pipeline/wards.mjs";
import { DAMAGE_ROLLS, DRAFT_KEYS, DRAFT_SHAPES, checkDraftKeys, wardProblemsOf } from "../../tools/pipeline/draft-keys.mjs";
import {
  BARS, CHOOSES, DENIES, EXPECT_FIELDS, GIVEN_FIELDS, IMPLIED_KEYS, IMPLIES_NOTHING, assertProblems, impliedAsserts,
  isCanonicalAssertion, normaliseAssert, unassertableKeys
} from "../../tools/pipeline/assert.mjs";
import { compareAsserts } from "../../tools/pipeline/review.mjs";
import { DEFINITIONS, undefinedWords } from "../../tools/pipeline/definitions.mjs";
import { draftVocabulary, rereadVocabulary, reviewVocabulary } from "../../tools/pipeline/batch.mjs";
import { scenarioOf } from "../../tools/pipeline/scenarios.mjs";
import { draftedForPerson } from "../../tools/pipeline/schema.mjs";
import { resolveShape } from "../../tools/pipeline/shapes.mjs";
import { loadCore, wardFieldsOf } from "../../tools/pipeline/core.mjs";
import { variants } from "./fixtures/shapes.mjs";

const ACT = "Wa10Wa21Wa32Wa43";
const EFF = "We10We21We32We43";
const EFF2 = "Wf10Wf21Wf32Wf43";
const spell = { origins: ["official"], kind: "spell" };
const vocabulary = {
  sizes: ["tiny", "sm", "med", "lg", "huge", "grg"], statuses: ["charmed", "frightened", "poisoned"],
  creatureTypes: ["fiend", "undead"], damageTypes: ["fire"], moments: ["failedSave", "hit", "endOfTurn"], moveModes: ["push"],
  effectEnds: ["bearerTurnEnd"]
};
const canon = (a) => normaliseAssert([a])[0];
const NEW_KEYS = Object.keys(WARD_KEYS);
const CHOSEN = (word) => canon({ given: {}, expect: { chooses: word } });
const BARRED = (word, given = {}) => canon({ given, expect: { bars: word } });
// An official structure: one save activity whose failed save applies EFF (and EFF2).
const STRUCTURE = { activities: [{ id: ACT, type: "save", effects: [EFF, EFF2], damage: [] }] };

describe("Ruling R34: the choice, barrier and ward keys a drafter may write", () => {
  it("admits seven engine keys, each with a slot, a meaning in our words and the engine file it was read from", () => {
    expect([...NEW_KEYS].sort()).toEqual(["barrier", "blocksHealing", "blocksTempHp", "choice", "globe", "wardsAtZero",
      "wardsConditions"]);
    for (const k of NEW_KEYS) {
      expect(Object.hasOwn(DRAFT_KEYS, k), k).toBe(true);
      expect(WARD_KEYS[k].means, k).toMatch(/^[\x20-\x7e]{40,520}$/);
      expect(WARD_KEYS[k].from, k).toMatch(/^engine (core|adapter|runtime)\/[a-z/-]+\.mjs$/);
    }
    expect(Object.fromEntries(NEW_KEYS.map((k) => [k, DRAFT_KEYS[k].slot]))).toEqual({
      choice: "activityMap", barrier: "none", globe: "none", wardsConditions: "none", wardsAtZero: "none",
      blocksHealing: "effectMap", blocksTempHp: "effectMap"
    });
    expect(Object.isFrozen(WARD_KEYS) && Object.isFrozen(EXCLUDED_WARD) && Object.isFrozen(NOT_ADMITTED)).toBe(true);
  });

  it("the keys of the same territory left out are named with why, and refused", () => {
    expect(Object.keys(NOT_ADMITTED).sort()).toEqual(["changesForm", "encloses", "formLock", "wallSide", "walls",
      "wardsDetection"]);
    for (const [k, why] of Object.entries(NOT_ADMITTED)) {
      expect(Object.hasOwn(DRAFT_KEYS, k), k).toBe(false);
      expect(why, k).toMatch(/^[\x20-\x7e]{40,400}$/);
    }
    expect(checkDraftKeys({ changesForm: { activity: ACT } }, spell).join("; ")).toMatch(/changesForm: not a drafter key/);
    expect(checkDraftKeys({ walls: { sight: true } }, spell).join("; ")).toMatch(/walls: not a drafter key/);
  });

  it("the closed lists and bounds: one effect, spell levels 0 to 9, the excluded fields", () => {
    expect(CHOICE_EFFECTS).toEqual(["one"]);
    expect(SPELL_LEVELS).toEqual({ min: 0, max: 9 });
    expect(Object.keys(EXCLUDED_WARD).sort()).toEqual(["choice.grapple", "choice.outcome", "choice.prompt", "globe.everywhere"]);
    for (const [what, why] of Object.entries(EXCLUDED_WARD)) {
      expect(what, what).toMatch(/^(choice|globe)\.[A-Za-z]+$/);
      expect(why, what).toMatch(/^[\x20-\x7e]{20,240}$/);
    }
  });

  it("every value built from a ward key's shape passes checkDraftKeys", () => {
    let n = 0;
    for (const k of NEW_KEYS) {
      for (const value of variants(resolveShape(DRAFT_SHAPES[k], vocabulary))) {
        n++;
        expect(checkDraftKeys({ [k]: value }, spell), `${k} ${JSON.stringify(value)}`).toEqual([]);
        expect(wardProblemsOf({ [k]: value }, { vocabulary }), `${k} ${JSON.stringify(value)}`).toEqual([]);
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  it("refuses the engine's free fields, each with why", () => {
    const refused = (entry, re) => expect(checkDraftKeys(entry, spell).join("; "), JSON.stringify(entry)).toMatch(re);
    refused({ choice: { effects: "one", prompt: "Pick a ward" } }, /choice\.prompt: not a drafter's field \(the question/);
    refused({ choice: { outcome: ["damage", "grapple"] } }, /choice\.outcome: not a drafter's field/);
    refused({ choice: { outcome: ["damage", "grapple"], grapple: { escapeDc: 13 } } }, /choice\.grapple: not a drafter's field/);
    refused({ globe: { radius: 10, units: "ft", maxLevel: 9, everywhere: true } }, /globe\.everywhere: not a drafter's field/);
  });

  it("refuses every value outside the closed, bounded shape", () => {
    const bad = [
      { choice: {} }, { choice: { effects: "all" } }, { choice: { effects: "one", perTarget: false } },
      { choice: { effects: "one", perTarget: true, roll: true } }, { choice: { effects: "one", order: [EFF] } },
      { choice: { effects: "one", roll: true, order: ["short"] } }, { choice: { pool: {} } },
      { choice: { pool: { [ACT]: [] } } }, { choice: { pool: { "not-an-id": [EFF] } } }, { choice: "one" },
      { barrier: { radius: 10 } }, { barrier: { radius: 10, units: "m" } }, { barrier: { radius: 0, units: "ft" } },
      { barrier: { radius: 400, units: "ft" } }, { barrier: { radius: 7.5, units: "ft" } },
      { barrier: { radius: 10, units: "ft", exceptTypes: [] } }, { barrier: { radius: 10, units: "ft", shields: false } },
      { barrier: { radius: 10, units: "ft", exceptTypes: ["undead"], onlyTypes: ["fiend"] } },
      { barrier: { radius: 10, units: "ft", endsOnContact: "yes" } },
      { globe: { radius: 10, units: "ft" } }, { globe: { radius: 10, units: "ft", maxLevel: 10 } },
      { globe: { radius: 10, units: "ft", maxLevel: 2.5 } }, { globe: { radius: 10, units: "ft", maxLevel: -1 } },
      { globe: { radius: 10, units: "ft", maxLevel: "5" } },
      { wardsConditions: { types: ["undead"] } }, { wardsConditions: { statuses: ["charmed"] } },
      { wardsConditions: { types: [], statuses: ["charmed"] } },
      { wardsConditions: { types: ["undead"], statuses: ["charmed"], x: 1 } },
      { wardsAtZero: false }, { wardsAtZero: "true" },
      { blocksHealing: false }, { blocksHealing: [] }, { blocksHealing: ["short"] },
      { blocksTempHp: false }, { blocksTempHp: [] }
    ];
    for (const entry of bad) {
      expect(checkDraftKeys(entry, spell).length, JSON.stringify(entry)).toBeGreaterThan(0);
      expect(wardProblemsOf(entry, { vocabulary }).length, JSON.stringify(entry)).toBeGreaterThan(0);
    }
  });

  it("own properties only: an inherited name is never a field, and a prototype key is refused", () => {
    expect(checkDraftKeys({ globe: { radius: 10, units: "ft", maxLevel: 5, toString: true } }, spell).join("; "))
      .toMatch(/globe\.toString: unknown field/);
    expect(checkDraftKeys({ choice: { pool: { constructor: [EFF] } } }, spell).length).toBeGreaterThan(0);
    expect(checkDraftKeys(JSON.parse(`{ "barrier": { "radius": 10, "units": "ft", "__proto__": { "x": 1 } } }`), spell).length)
      .toBeGreaterThan(0);
  });

  it("the engine's words are checked when the vocabulary is given (the validator gate)", () => {
    expect(wardProblemsOf({ barrier: { radius: 10, units: "ft", onlyTypes: ["dragon"] } }, { vocabulary }).join("; "))
      .toMatch(/barrier\.onlyTypes\[0\]/);
    expect(wardProblemsOf({ barrier: { radius: 10, units: "ft", onlyTypes: ["dragon"] } })).toEqual([]);
    expect(wardProblemsOf({ wardsConditions: { types: ["fiend"], statuses: ["stunned"] } }, { vocabulary }).join("; "))
      .toMatch(/wardsConditions\.statuses\[0\]/);
    expect(wardProblemsOf({ wardsConditions: { types: ["fiend"], statuses: ["charmed"] } }, { vocabulary })).toEqual([]);
  });

  it("no ward key changes the damage of the item's own roll", () => {
    for (const k of NEW_KEYS) {
      expect(Object.hasOwn(DAMAGE_ROLLS, k), k).toBe(true);
      expect(DAMAGE_ROLLS[k](true), k).toEqual([]);
    }
  });
});

describe("what the ward keys imply", () => {
  it("a choice of one effect at use: chosen once, per target, or by a die; its pool is the item's own effects", () => {
    expect(impliedAsserts({ choice: { effects: "one" } })).toEqual([CHOSEN("oneEffect")]);
    expect(impliedAsserts({ choice: { effects: "one", perTarget: true } })).toEqual([CHOSEN("oneEffectPerTarget")]);
    expect(impliedAsserts({ choice: { effects: "one", roll: true } })).toEqual([CHOSEN("effectByRoll")]);
    expect(impliedAsserts({ choice: { effects: "one", pool: { [ACT]: [EFF, EFF2] } } })).toEqual([CHOSEN("oneEffect")]);
    expect(unassertableKeys({ choice: { effects: "one", pool: { [ACT]: [EFF, EFF2] } } })).toEqual([]);
    // Which face of the die gives which effect has no word; a pool alone only links effects: nothing to choose.
    expect(unassertableKeys({ choice: { effects: "one", roll: true, order: [EFF2, EFF] } })).toEqual(["choice"]);
    expect(impliedAsserts({ choice: { pool: { [ACT]: [EFF] } } })).toEqual([]);
    expect(unassertableKeys({ choice: { pool: { [ACT]: [EFF] } } })).toEqual(["choice"]);
  });

  it("a barrier bars entry and melee from outside (and every action when it shields); its radius stamps it", () => {
    const plain = { barrier: { radius: 10, units: "ft" } };
    expect(impliedAsserts(plain)).toEqual([BARRED("entry"), BARRED("melee")].sort());
    expect(impliedAsserts({ barrier: { radius: 5, units: "ft", shields: true } }))
      .toEqual([BARRED("actions"), BARRED("entry"), BARRED("melee")].sort());
    expect(unassertableKeys(plain)).toEqual(["barrier"]);
    expect(draftedForPerson({ entry: plain })).toBe("barrier");
    // Only some creatures are barred, or some pass: no given word says which, so the barrier implies nothing (never the
    // assertion without its limit, which would say more than the key does).
    expect(impliedAsserts({ barrier: { radius: 10, units: "ft", exceptTypes: ["undead"] } })).toEqual([]);
    expect(impliedAsserts({ barrier: { radius: 5, units: "ft", onlyTypes: ["fiend"], shields: true } })).toEqual([]);
  });

  it("a globe bars spells of its level or lower cast from outside", () => {
    const globe = { globe: { radius: 10, units: "ft", maxLevel: 5 } };
    expect(impliedAsserts(globe)).toEqual([BARRED("spells", { spellLevelAtMost: 5 })]);
    expect(unassertableKeys(globe)).toEqual(["globe"]);
  });

  it("no healing, no temporary hit points: on the roll that applies the item's effects", () => {
    const denied = (word, given = {}) => canon({ given, expect: { denies: word } });
    expect(impliedAsserts({ blocksHealing: true })).toEqual([denied("healing")]);
    expect(impliedAsserts({ blocksHealing: [EFF] }, { structure: STRUCTURE })).toEqual([denied("healing", { roll: "failedSave" })]);
    expect(unassertableKeys({ blocksHealing: true })).toEqual([]);
    expect(impliedAsserts({ blocksTempHp: [EFF2] }, { structure: STRUCTURE })).toEqual([denied("tempHp", { roll: "failedSave" })]);
    expect(unassertableKeys({ blocksTempHp: [EFF2] })).toEqual([]);
    // `true` also covers the creature that carries the item itself: no word says who.
    expect(unassertableKeys({ blocksTempHp: true })).toEqual(["blocksTempHp"]);
  });

  it("the ward keys with no word imply nothing, each with why, and stamp the draft for a person", () => {
    for (const k of ["wardsConditions", "wardsAtZero"]) {
      expect(IMPLIES_NOTHING[k], k).toMatch(/^[\x20-\x7e]{10,160}$/);
      expect(IMPLIED_KEYS, k).not.toContain(k);
    }
    for (const k of ["choice", "barrier", "globe", "blocksHealing", "blocksTempHp"]) expect(IMPLIED_KEYS, k).toContain(k);
    expect(draftedForPerson({ entry: { wardsAtZero: true } })).toBe("wardsAtZero");
  });
});

describe("the assertion words", () => {
  it("expect.chooses and expect.bars are closed; denies says healing and temporary hit points; a spell level is a given", () => {
    expect(CHOOSES).toEqual(["oneEffect", "oneEffectPerTarget", "effectByRoll"]);
    expect(BARS).toEqual(["entry", "melee", "actions", "spells"]);
    expect(DENIES).toEqual(["opportunityAttacks", "reactions", "actionAndBonus", "healing", "tempHp"]);
    expect(EXPECT_FIELDS).toEqual(expect.arrayContaining(["chooses", "bars"]));
    expect(GIVEN_FIELDS).toContain("spellLevelAtMost");
    const ok = (a) => expect(assertProblems([a], { vocabulary }), JSON.stringify(a)).toEqual([]);
    const no = (a) => expect(assertProblems([a], { vocabulary }).length, JSON.stringify(a)).toBeGreaterThan(0);
    for (const w of CHOOSES) ok({ given: {}, expect: { chooses: w } });
    for (const w of BARS) ok({ given: {}, expect: { bars: w } });
    ok({ given: { spellLevelAtMost: 0 }, expect: { bars: "spells" } });
    ok({ given: { spellLevelAtMost: 9 }, expect: { bars: "spells" } });
    ok({ given: { roll: "failedSave" }, expect: { denies: "healing" } });
    no({ given: {}, expect: { chooses: "twoEffects" } });
    no({ given: {}, expect: { bars: "sight" } });
    // Said once for the use of the item: never on a roll or at a moment.
    no({ given: { roll: "hit" }, expect: { chooses: "oneEffect" } });
    no({ given: { moment: "endOfTurn" }, expect: { bars: "entry" } });
    // A spell level bounds what a globe bars, nothing else; an integer from 0 to 9.
    no({ given: { spellLevelAtMost: 5 }, expect: { bars: "entry" } });
    no({ given: { spellLevelAtMost: 5 }, expect: { denies: "healing" } });
    no({ given: { spellLevelAtMost: 10 }, expect: { bars: "spells" } });
    no({ given: { spellLevelAtMost: 2.5 }, expect: { bars: "spells" } });
    no({ given: { spellLevelAtMost: "5" }, expect: { bars: "spells" } });
    expect(isCanonicalAssertion(BARRED("spells", { spellLevelAtMost: 3 }), vocabulary)).toBe(true);
    expect(isCanonicalAssertion(CHOSEN("oneEffectPerTarget"), vocabulary)).toBe(true);
  });

  it("each new word has a definition with its source, in all three vocabulary files", () => {
    expect(Object.keys(DEFINITIONS.chooses).sort()).toEqual([...CHOOSES].sort());
    expect(Object.keys(DEFINITIONS.bars).sort()).toEqual([...BARS].sort());
    expect(DEFINITIONS.denies.healing.from).toBe("engine runtime/cantrips.mjs");
    expect(DEFINITIONS.bars.entry.from).toBe("engine adapter/barriers.mjs");
    expect(DEFINITIONS.bars.spells.from).toBe("engine adapter/eligibility.mjs");
    expect(DEFINITIONS.chooses.oneEffectPerTarget.from).toBe("engine core/action.mjs");
    expect(DEFINITIONS.given.spellLevelAtMost.means).toMatch(/level/);
    expect(undefinedWords({})).toEqual([]);
    const core = { moments: vocabulary.moments, statuses: ["charmed"], creatureTypes: ["undead"], moveModes: ["push"],
      effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"], sizes: vocabulary.sizes, stepTypes: [], facts: [], abilities: [] };
    for (const v of [draftVocabulary(core), reviewVocabulary(core), rereadVocabulary(core)]) {
      expect(v.definitions.chooses.oneEffect.means).toMatch(/one/);
      expect(v.definitions.bars.melee.means).toMatch(/reach/);
      expect(v.assert.shapes.expect.chooses).toEqual({ type: "enum", values: CHOOSES });
      expect(v.assert.shapes.expect.bars).toEqual({ type: "enum", values: BARS });
      expect(v.assert.shapes.given.spellLevelAtMost).toMatchObject({ type: "number", min: 0, max: 9, int: true });
      expect(v.assert.chooses).toEqual(CHOOSES);
      expect(v.assert.bars).toEqual(BARS);
      expect(v.assert.denies).toContain("healing");
    }
    const d = draftVocabulary(core);
    for (const k of NEW_KEYS) expect(d.draftShapes[k], k).toBeTruthy();
    expect(Object.keys(d.wards.keys).sort()).toEqual([...NEW_KEYS].sort());
    expect(Object.keys(d.wards.excluded).sort()).toEqual(Object.keys(EXCLUDED_WARD).sort());
    expect(Object.keys(d.wards.notAdmitted).sort()).toEqual(Object.keys(NOT_ADMITTED).sort());
    // A reviewer and a rereader write no entry: no drafter key, no ward table.
    expect(reviewVocabulary(core)).not.toHaveProperty("wards");
    expect(rereadVocabulary(core)).not.toHaveProperty("wards");
  });
});

describe("review compares the new words as identity", () => {
  const rule = (entry, assert = []) => ({ entry, assert, origins: ["official"] });
  it("a choice once against a choice per target disagree; the same choice agrees", () => {
    const once = rule({ choice: { effects: "one" } });
    expect(compareAsserts(once, [{ given: {}, expect: { chooses: "oneEffect" } }]).agrees).toBe(true);
    expect(compareAsserts(once, [{ given: {}, expect: { chooses: "oneEffectPerTarget" } }])).toMatchObject({
      agrees: false, onlyDraft: [CHOSEN("oneEffect")], onlyReview: [CHOSEN("oneEffectPerTarget")] });
  });
  it("a globe of another level is another situation", () => {
    const globe = rule({ globe: { radius: 10, units: "ft", maxLevel: 5 } });
    expect(compareAsserts(globe, [{ given: { spellLevelAtMost: 5 }, expect: { bars: "spells" } }]).agrees).toBe(true);
    expect(compareAsserts(globe, [{ given: { spellLevelAtMost: 3 }, expect: { bars: "spells" } }]).agrees).toBe(false);
    expect(compareAsserts(globe, [{ given: {}, expect: { bars: "spells" } }]).agrees).toBe(false);
  });
  it("a barrier: the review that also says it shields disagrees; healing denied agrees", () => {
    const plain = rule({ barrier: { radius: 10, units: "ft" } });
    const said = [{ given: {}, expect: { bars: "entry" } }, { given: {}, expect: { bars: "melee" } }];
    expect(compareAsserts(plain, said).agrees).toBe(true);
    expect(compareAsserts(plain, [...said, { given: {}, expect: { bars: "actions" } }])).toMatchObject({
      agrees: false, onlyReview: [BARRED("actions")] });
    expect(compareAsserts(rule({ blocksHealing: true }), [{ given: {}, expect: { denies: "healing" } }]).agrees).toBe(true);
  });
});

describe("scenarios: a choice, a barrier, a globe and a lost healing are a person's to play", () => {
  const record = (entry) => ({
    key: "tst:spell:veil-of-thorns", book: "TST", kind: "spell", identifier: "veil-of-thorns",
    items: [{ origin: "official", match: "matched", docId: "Vt10Vt21Vt32Vt43", activities: [ACT], effects: [EFF] }],
    rule: { handledIn: "table", adds: "x", entry, origins: ["official"], assert: [] },
    evidence: {}
  });
  const packOf = () => "tst.spells";
  it("names the word the runner cannot stage", () => {
    expect(scenarioOf(record({ choice: { effects: "one" } }), { packOf }).manualBecause).toEqual(["expect.chooses"]);
    expect(scenarioOf(record({ globe: { radius: 10, units: "ft", maxLevel: 4 } }), { packOf }).manualBecause)
      .toEqual(["expect.bars", "given.spellLevelAtMost"]);
    expect(scenarioOf(record({ barrier: { radius: 10, units: "ft" } }), { packOf }).manualBecause).toEqual(["expect.bars"]);
    const healing = scenarioOf(record({ blocksHealing: true }), { packOf });
    expect(healing).toMatchObject({ manual: true, manualBecause: ["expect.denies.healing"], checks: 0 });
    expect(scenarioOf(record({ blocksTempHp: [EFF] }), { packOf }).manualBecause).toEqual(["expect.denies.tempHp"]);
  });
  it("the three denials the runner checks keep their interpreter", () => {
    const s = scenarioOf(record({ noReactions: true }), { packOf });
    expect(s.manualBecause).not.toContain("expect.denies.reactions");
    expect(s.checks).toBeGreaterThan(0);
  });
});

describe("wardFieldsOf: the fields the engine's validators accept, read from their own lists", () => {
  it("reads each list after its anchor, and gives null when one is missing", () => {
    const annex = `export function validateChoice(c) {\n for ( const key of Object.keys(c) ) if ( !["effects", "pool"]`
      + `.includes(key) ) x;\n}`;
    const extras = `if ( ("globe" in entry) && Object.keys(entry.globe).every(k => ["radius", "units"].includes(k)) ) x;\n`
      + `if ( ("barrier" in entry) && Object.keys(entry.barrier).every(k => ["radius", "onlyTypes"].includes(k)) ) x;`;
    const entry = `if ( "wardsConditions" in entry ) { if ( Object.keys(w).some(k => !["types", "statuses"].includes(k)) ) x; }`;
    expect(wardFieldsOf({ annex, extras, entry })).toEqual({ choice: ["effects", "pool"], globe: ["radius", "units"],
      barrier: ["radius", "onlyTypes"], wardsConditions: ["types", "statuses"] });
    expect(wardFieldsOf({ annex, extras, entry: "" })).toBeNull();
  });
});

const CORE = process.env.DAS_CORE;
const fieldsOfShape = (shape) => [...new Set((shape.type === "oneOf" ? shape.of : [shape])
  .flatMap((o) => [...Object.keys(o.keys), ...Object.keys(o.optional)]))];
const excludedFields = (k) => Object.keys(EXCLUDED_WARD).filter((x) => x.startsWith(`${k}.`)).map((x) => x.split(".")[1]);
describe.skipIf(!CORE)("against the DAS_CORE clone", () => {
  it("each admitted and each refused key is an entry key of the engine; its fields are the ones this pack assumes", async () => {
    const core = await loadCore(CORE);
    for (const k of [...NEW_KEYS, ...Object.keys(NOT_ADMITTED)]) expect(core.entryKeys.has(k), k).toBe(true);
    expect([...core.choiceEffects]).toEqual(CHOICE_EFFECTS);
    const { wardFields } = core;
    expect(wardFields).not.toBeNull();
    // Every field a validator accepts is in the drafter's shape or excluded with why, and no other.
    for (const k of ["choice", "barrier", "globe", "wardsConditions"]) {
      expect([...wardFields[k]].sort(), k).toEqual([...fieldsOfShape(DRAFT_SHAPES[k]), ...excludedFields(k)].sort());
    }
  });

  it("the engine's validator accepts every ward value from the shapes, and refuses what this pack assumes refused", async () => {
    const core = await loadCore(CORE);
    const shapes = draftVocabulary(core).draftShapes;
    const facts = Object.fromEntries(core.facts.map((name) => [name, true]));
    let n = 0;
    for (const k of NEW_KEYS) {
      for (const value of variants(shapes[k])) {
        n++;
        expect(core.validateEntry({ [k]: value }, { facts }), `${k} ${JSON.stringify(value)}`).toEqual([]);
        expect(checkDraftKeys({ [k]: value }, spell), `${k} ${JSON.stringify(value)}`).toEqual([]);
        expect(wardProblemsOf({ [k]: value }, { vocabulary: core }), `${k} ${JSON.stringify(value)}`).toEqual([]);
      }
    }
    expect(n).toBeGreaterThan(20);
    for (const entry of [{ choice: { effects: "all" } }, { choice: { effects: "one", perTarget: false } },
      { choice: { pool: { [ACT]: [] } } }, { barrier: { radius: 0, units: "ft" } }, { barrier: { radius: 10 } },
      { barrier: { radius: 10, units: "ft", onlyTypes: ["notAType"] } }, { globe: { radius: 10, units: "ft" } },
      { globe: { radius: 10, units: "ft", maxLevel: 2.5 } }, { wardsConditions: { types: ["undead"] } },
      { wardsAtZero: false }, { blocksHealing: false }, { blocksTempHp: [] }, { blocksHealing: ["short"] }]) {
      expect(core.validateEntry(entry, { facts }).length, JSON.stringify(entry)).toBeGreaterThan(0);
    }
  });

  it("the engine's own entries: those in a drafter's shape imply the words a draft's would", async () => {
    const core = await loadCore(CORE);
    const shipped = Object.entries(core.shipped);
    const of = (k) => shipped.filter(([, e]) => e && Object.hasOwn(e, k));
    const fit = (k, v) => !wardProblemsOf({ [k]: v }, { vocabulary: core }).length;
    const choices = of("choice").filter(([, e]) => fit("choice", e.choice) && e.choice.effects === "one");
    expect(choices.length).toBeGreaterThan(10);
    for (const [id, e] of choices) {
      const word = e.choice.perTarget ? "oneEffectPerTarget" : e.choice.roll ? "effectByRoll" : "oneEffect";
      expect(impliedAsserts({ choice: e.choice }), id).toEqual([CHOSEN(word)]);
    }
    // Every barrier the engine ships names creature types: in the drafter's shape, it implies nothing and is stamped.
    const barriers = of("barrier");
    expect(barriers.length).toBeGreaterThan(5);
    for (const [id, e] of barriers) {
      expect(fit("barrier", e.barrier), id).toBe(true);
      expect(impliedAsserts({ barrier: e.barrier }), id).toEqual([]);
      expect(unassertableKeys({ barrier: e.barrier }), id).toEqual(["barrier"]);
    }
    // A globe without `everywhere` bars the spells of its level; the one with it is a field a drafter may not write.
    const globes = of("globe");
    expect(globes.filter(([, e]) => fit("globe", e.globe)).length).toBeGreaterThan(0);
    for (const [id, e] of globes) {
      if (!fit("globe", e.globe)) { expect(Object.hasOwn(e.globe, "everywhere"), id).toBe(true); continue; }
      expect(impliedAsserts({ globe: e.globe }), id).toEqual([BARRED("spells", { spellLevelAtMost: e.globe.maxLevel })]);
    }
    for (const k of ["blocksHealing", "wardsConditions", "wardsAtZero"]) {
      expect(of(k).length, k).toBeGreaterThan(0);
      for (const [id, e] of of(k)) expect(fit(k, e[k]), `${k} ${id}`).toBe(true);
    }
  });
});
