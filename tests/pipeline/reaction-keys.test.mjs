// Ruling R38: reactions, teleports and light. A drafter may write four reaction declarations of `triggers` (an AC bonus
// against one hit, a hit turned into a miss, a melee counterattack after a miss, the item's damage dealt back to an attacker)
// and four engine keys (`reactions`, `teleport`, `swapPlaces`, `light`) in a closed, typed form: no free string, no
// identifier of another document, no label, no free formula. What each does is an assertion of the closed vocabulary
// (`acBonus`, `hitBecomes`, `counterattack`, `attackerTakes`, `reactionsPerRound`, `teleports`, `sheds`), review compares it,
// a scenario says it is a person's to play, and the engine's own validator text and shipped entries pin every shape.
// Synthetic fixtures only: invented ids, invented entries, sentences in this test's own words.
import { describe, it, expect } from "vitest";
import {
  AC_BONUS, EXCLUDED_REACTION, NOT_ADMITTED_REACTION, NOT_ADMITTED_STEPS, PENALTY_FORMULAS, PER_ROUND, REACTION_DECLARATIONS,
  REACTION_FACTS, REACTION_KEYS, REACTION_MOMENTS, REACTION_STEP_FIELDS, isReactionDeclaration, reactionKind
} from "../../tools/pipeline/reactions.mjs";
import {
  DAMAGE_ROLLS, DRAFT_KEYS, DRAFT_SHAPES, REACTION_DECLARATION, checkDraftKeys, damageRollsOf, reactionProblemsOf
} from "../../tools/pipeline/draft-keys.mjs";
import {
  ATTACKER_TAKES, COUNTERATTACKS, EXPECT_FIELDS, HIT_BECOMES, IMPLIED_KEYS, SHEDS, TELEPORTS, assertProblems, impliedAsserts,
  isCanonicalAssertion, normaliseAssert, unassertableKeys
} from "../../tools/pipeline/assert.mjs";
import { compareAsserts } from "../../tools/pipeline/review.mjs";
import { DEFINITIONS, undefinedWords } from "../../tools/pipeline/definitions.mjs";
import { draftVocabulary, rereadVocabulary, reviewVocabulary } from "../../tools/pipeline/batch.mjs";
import { scenarioOf } from "../../tools/pipeline/scenarios.mjs";
import { draftedForPerson } from "../../tools/pipeline/schema.mjs";
import { resolveShape, shapeProblems, tuple } from "../../tools/pipeline/shapes.mjs";
import {
  declarationFieldsOf, hitWindowStepsOf, loadCore, reactionFieldsOf, stepFieldsOf
} from "../../tools/pipeline/core.mjs";
import { variants } from "./fixtures/shapes.mjs";

const ACT = "Ra10Ra21Ra32Ra43";
const ACT2 = "Rb10Rb21Rb32Rb43";
const EFF = "Re10Re21Re32Re43";
const monster = { origins: ["official"], kind: "monster" };
const vocabulary = {
  sizes: ["tiny", "sm", "med", "lg", "huge", "grg"], statuses: ["prone"], creatureTypes: ["fiend", "undead"],
  damageTypes: ["fire"], moments: ["failedSave", "hit", "isHit", "isMissed", "endOfTurn"], moveModes: ["push"],
  effectEnds: ["bearerTurnEnd"]
};
const canon = (a) => normaliseAssert([a])[0];
const NEW_KEYS = Object.keys(REACTION_KEYS);
// The four reaction declarations, in the drafter's shape.
const AC = { on: "isHit", if: { "activity.isMelee": true }, do: [{ type: "use" }, { type: "penalty", formula: "@prof" }] };
const MISS = { on: "isHit", do: [{ type: "use", activity: ACT }, { type: "miss" }] };
const COUNTER = { on: "isMissed", if: { "activity.isMelee": true },
  do: [{ type: "use", target: "source", weapon: true, activity: ACT }] };
const BACK = { on: "isHit", if: { "activity.isMelee": true }, do: [{ type: "damage", to: "source", activity: ACT2 }] };
const HIT_MELEE = { moment: "isHit", activity: "melee" };

describe("Ruling R38: the reaction, teleport and light keys a drafter may write", () => {
  it("admits four engine keys, each with a slot, a meaning in our words and the engine file it was read from", () => {
    expect([...NEW_KEYS].sort()).toEqual(["light", "reactions", "swapPlaces", "teleport"]);
    for (const k of NEW_KEYS) {
      expect(Object.hasOwn(DRAFT_KEYS, k), k).toBe(true);
      expect(REACTION_KEYS[k].means, k).toMatch(/^[\x20-\x7e]{40,520}$/);
      expect(REACTION_KEYS[k].from, k).toMatch(/^engine (core|adapter|runtime)\/[a-z/-]+\.mjs$/);
    }
    expect(Object.fromEntries(NEW_KEYS.map((k) => [k, DRAFT_KEYS[k].slot]))).toEqual({
      reactions: "none", teleport: "single", swapPlaces: "single", light: "none"
    });
    for (const o of [REACTION_KEYS, REACTION_DECLARATIONS, EXCLUDED_REACTION, NOT_ADMITTED_REACTION, NOT_ADMITTED_STEPS,
      REACTION_STEP_FIELDS]) expect(Object.isFrozen(o)).toBe(true);
  });

  it("admits four reaction declarations of triggers, each with its meaning and source", () => {
    expect(Object.keys(REACTION_DECLARATIONS).sort()).toEqual(["acBonus", "counterattack", "hitBecomesMiss", "retaliation"]);
    for (const [k, d] of Object.entries(REACTION_DECLARATIONS)) {
      expect(d.means, k).toMatch(/^[\x20-\x7e]{40,520}$/);
      expect(d.from, k).toMatch(/^engine (core|adapter|runtime)\/[a-z/-]+\.mjs$/);
    }
    expect(REACTION_MOMENTS).toEqual(["isHit", "isMissed"]);
    expect(REACTION_FACTS).toEqual(["activity.isAttack", "activity.isMelee", "activity.isWeapon", "activity.isSpell"]);
    expect(reactionKind(AC)).toBe("acBonus");
    expect(reactionKind(MISS)).toBe("hitBecomesMiss");
    expect(reactionKind(COUNTER)).toBe("counterattack");
    expect(reactionKind(BACK)).toBe("retaliation");
    expect(reactionKind({ on: "failedSave", do: [{ type: "status", status: "prone" }] })).toBeNull();
  });

  it("the closed lists and bounds: proficiency or 1 to 10 AC, 2 to 20 reactions a round", () => {
    expect(PENALTY_FORMULAS).toEqual(["@prof", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(AC_BONUS).toEqual({ min: 1, max: 10, word: "proficiency" });
    expect(PER_ROUND).toEqual({ min: 2, max: 20 });
    for (const [what, why] of Object.entries({ ...EXCLUDED_REACTION, ...NOT_ADMITTED_REACTION, ...NOT_ADMITTED_STEPS })) {
      expect(why, what).toMatch(/^[\x20-\x7e]{20,400}$/);
    }
    for (const what of Object.keys(EXCLUDED_REACTION)) {
      expect(what, what).toMatch(/^(reactions|teleport|light|triggers\.reaction|step\.(use|penalty|miss|damage))\.[A-Za-z.]+$/);
    }
  });

  it("which declarations belong to the territory: a reaction moment, a reaction step, or damage dealt to the source", () => {
    for (const d of [AC, MISS, COUNTER, BACK, { on: "isHit", do: [{ type: "use" }, { type: "halve" }] },
      { on: "enemyAttacks", do: [{ type: "use" }] }, { on: "isDamaged", do: [{ type: "damage", to: "source", same: true }] }]) {
      expect(isReactionDeclaration(d), JSON.stringify(d)).toBe(true);
    }
    for (const d of [{ on: "failedSave", do: [{ type: "status", status: "prone" }] }, { on: ["enter"], do: [{ type: "replay" }] },
      { on: "startOfTurn", via: "effect", do: [{ type: "damage", to: "bearer", activity: ACT }] }, null, [AC], "isHit"]) {
      expect(isReactionDeclaration(d), JSON.stringify(d)).toBe(false);
    }
    // Own properties only: an inherited `on` or `do` is never read.
    expect(isReactionDeclaration(Object.create({ on: "isHit", do: [{ type: "use" }] }))).toBe(false);
  });

  it("every value built from a new key's shape, and from the reaction declaration's, passes checkDraftKeys", () => {
    let n = 0;
    for (const k of NEW_KEYS) {
      for (const value of variants(resolveShape(DRAFT_SHAPES[k], vocabulary))) {
        n++;
        expect(checkDraftKeys({ [k]: value }, monster), `${k} ${JSON.stringify(value)}`).toEqual([]);
        expect(reactionProblemsOf({ [k]: value }), `${k} ${JSON.stringify(value)}`).toEqual([]);
      }
    }
    for (const d of variants(resolveShape(REACTION_DECLARATION, vocabulary))) {
      n++;
      expect(checkDraftKeys({ triggers: [d] }, monster), JSON.stringify(d)).toEqual([]);
      expect(reactionKind(d), JSON.stringify(d)).not.toBeNull();
    }
    for (const d of [AC, MISS, COUNTER, BACK]) expect(checkDraftKeys({ triggers: [d] }, monster)).toEqual([]);
    expect(checkDraftKeys({ triggers: [AC, COUNTER] }, monster)).toEqual([]);
    expect(n).toBeGreaterThan(25);
  });

  it("refuses the engine's fields a drafter may not write, each with why", () => {
    const refused = (entry, re) => expect(checkDraftKeys(entry, monster).join("; "), JSON.stringify(entry)).toMatch(re);
    refused({ reactions: { perRound: 3, loseOne: true } }, /reactions\.loseOne: not a drafter's field/);
    refused({ teleport: { activity: ACT, passengers: { count: 1 } } }, /teleport\.passengers: not a drafter's field/);
    refused({ teleport: { activity: ACT, unseen: true } }, /teleport\.unseen: not a drafter's field/);
    refused({ teleport: { activity: ACT, area: "left" } }, /teleport\.area: not a drafter's field/);
    refused({ light: { on: "effect", dim: 10, units: "ft", color: "#ffffff" } }, /light\.color: not a drafter's field/);
    refused({ light: { on: "area", darkness: true } }, /light\.on: "area" is not a drafter's value/);
    refused({ triggers: [{ ...AC, via: "effect" }] }, /triggers\[0\]\.via: not a drafter's field/);
    refused({ triggers: [{ ...MISS, free: true }] }, /triggers\[0\]\.free: not a drafter's field/);
    refused({ triggers: [{ on: "isHit", do: [{ type: "use", advantage: true }, { type: "miss" }] }] },
      /triggers\[0\]\.do\[0\]\.advantage: not a drafter's field/);
    refused({ triggers: [{ on: "isHit", do: [{ type: "damage", to: "source", formula: "2d8", damageType: "fire" }] }] },
      /triggers\[0\]\.do\[0\]\.formula: not a drafter's field/);
    refused({ triggers: [{ on: "isHit", do: [{ type: "use" }, { type: "halve" }] }] },
      /triggers\[0\]: not a reaction a drafter may write \(halve: /);
    refused({ triggers: [{ on: "enemyAttacks", do: [{ type: "use" }, { type: "disadvantage" }] }] },
      /triggers\[0\]: not a reaction a drafter may write/);
    refused({ counter: { level: 3 } }, /counter: not a drafter key/);
    refused({ damageShield: { effects: { [EFF]: "fire" }, formula: "1d6" } }, /damageShield: not a drafter key/);
  });

  it("refuses every value outside the closed, bounded shape", () => {
    const bad = [
      { reactions: {} }, { reactions: { perRound: 1 } }, { reactions: { perRound: 21 } }, { reactions: { perRound: 2.5 } },
      { reactions: { perRound: "3" } }, { reactions: 3 },
      { teleport: {} }, { teleport: { distance: 30, units: "ft", activity: "short" } }, { teleport: { distance: 30 } },
      { teleport: { activity: ACT, distance: 400, units: "ft" } }, { teleport: { activity: ACT, distance: 30, units: "m" } },
      { teleport: { activity: ACT, after: "save" } }, { teleport: { activity: ACT, then: "nope" } },
      { swapPlaces: {} }, { swapPlaces: { activity: ACT, extra: 1 } }, { swapPlaces: ACT },
      { light: { on: "effect" } }, { light: { on: "effect", dim: 10 } }, { light: { on: "effect", dim: 0, units: "ft" } },
      { light: { on: "effect", bright: 10, dim: 400, units: "ft" } }, { light: { dim: 10, units: "ft" } },
      { triggers: [{ ...AC, do: [{ type: "use" }, { type: "penalty", formula: "1d6" }] }] },
      { triggers: [{ ...AC, do: [{ type: "use" }, { type: "penalty", formula: "11" }] }] },
      { triggers: [{ ...AC, do: [{ type: "penalty", formula: "@prof" }] }] },
      { triggers: [{ ...AC, do: [{ type: "use" }, { type: "penalty", formula: "@prof" }, { type: "miss" }] }] },
      { triggers: [{ ...AC, on: "isMissed" }] }, { triggers: [{ ...AC, on: ["isHit", "isMissed"] }] },
      { triggers: [{ ...AC, if: { "target.creatureType": "fiend" } }] },
      { triggers: [{ ...AC, if: { "hit.stoppableBy": 5 } }] },
      { triggers: [{ ...COUNTER, do: [{ type: "use", target: "source", activity: ACT }] }] },
      { triggers: [{ ...COUNTER, do: [{ type: "use", target: "self", weapon: true }] }] },
      { triggers: [{ ...COUNTER, on: "isHit" }] },
      { triggers: [{ ...BACK, do: [{ type: "damage", to: "source" }] }] },
      { triggers: [{ ...BACK, do: [{ type: "use" }, { type: "damage", to: "source", activity: ACT }] }] },
      { triggers: [{ ...BACK, on: "isDamaged" }] }
    ];
    for (const entry of bad) {
      expect(checkDraftKeys(entry, monster).length, JSON.stringify(entry)).toBeGreaterThan(0);
      expect(reactionProblemsOf(entry).length, JSON.stringify(entry)).toBeGreaterThan(0);
    }
  });

  it("own properties only: an inherited name is never a field, and a prototype key is refused", () => {
    expect(checkDraftKeys({ swapPlaces: { activity: ACT, toString: true } }, monster).join("; "))
      .toMatch(/swapPlaces\.toString: unknown field/);
    expect(checkDraftKeys(JSON.parse(`{ "reactions": { "perRound": 3, "__proto__": { "x": 1 } } }`), monster).length)
      .toBeGreaterThan(0);
    expect(checkDraftKeys({ triggers: [{ ...MISS, constructor: 1 }] }, monster).length).toBeGreaterThan(0);
  });

  it("damage rolls: an AC bonus or a miss touches none of the item's rolls; a counterattack or damage dealt back, all", () => {
    for (const k of NEW_KEYS) {
      expect(Object.hasOwn(DAMAGE_ROLLS, k), k).toBe(true);
      expect(DAMAGE_ROLLS[k](true), k).toEqual([]);
    }
    expect(damageRollsOf({ triggers: [AC, MISS] })).toEqual([]);
    expect(damageRollsOf({ triggers: [COUNTER] })).toBe("all");
    expect(damageRollsOf({ triggers: [BACK] })).toBe("all");
  });
});

describe("the shape vocabulary: a tuple, a list of fixed length and order", () => {
  it("checks each place against its own shape and refuses another length", () => {
    const t = tuple({ type: "true" }, { type: "id", ids: "activity" });
    expect(shapeProblems([true, ACT], t)).toEqual([]);
    expect(shapeProblems([true], t).join("; ")).toMatch(/exactly 2/);
    expect(shapeProblems([true, ACT, ACT], t).join("; ")).toMatch(/exactly 2/);
    expect(shapeProblems([ACT, true], t).length).toBeGreaterThan(0);
    expect(shapeProblems({ 0: true, 1: ACT }, t).length).toBeGreaterThan(0);
    expect(resolveShape(tuple({ type: "enum", engine: "statuses" }), { statuses: ["prone"] }))
      .toEqual({ type: "tuple", items: [{ type: "enum", values: ["prone"] }] });
    expect(variants(t)).toEqual([[true, "Ac00Ac11Ac22Ac33"]]);
  });
});

describe("what the new keys and declarations imply", () => {
  it("an AC bonus against the hit: proficiency or a number, at isHit, with the melee condition", () => {
    expect(impliedAsserts({ triggers: [AC] })).toEqual([canon({ given: HIT_MELEE, expect: { acBonus: "proficiency" } })]);
    const three = { on: "isHit", do: [{ type: "use" }, { type: "penalty", formula: "3" }] };
    expect(impliedAsserts({ triggers: [three] })).toEqual([canon({ given: { moment: "isHit" }, expect: { acBonus: 3 } })]);
    expect(unassertableKeys({ triggers: [AC] })).toEqual([]);
  });

  it("a hit turned into a miss; a melee counterattack after a miss; the item's damage dealt back", () => {
    expect(impliedAsserts({ triggers: [MISS] })).toEqual([canon({ given: { moment: "isHit" }, expect: { hitBecomes: "miss" } })]);
    expect(impliedAsserts({ triggers: [COUNTER] }))
      .toEqual([canon({ given: { moment: "isMissed", activity: "melee" }, expect: { counterattack: "meleeWeapon" } })]);
    expect(impliedAsserts({ triggers: [BACK] })).toEqual([canon({ given: HIT_MELEE, expect: { attackerTakes: "activity" } })]);
    expect(unassertableKeys({ triggers: [MISS, COUNTER, BACK] })).toEqual([]);
  });

  it("a reaction the drafter may not write implies nothing and stamps the key (never a word it does not say)", () => {
    const halve = { on: "isHit", do: [{ type: "use" }, { type: "halve" }] };
    expect(impliedAsserts({ triggers: [halve] })).toEqual([]);
    expect(unassertableKeys({ triggers: [halve] })).toEqual(["triggers"]);
    expect(impliedAsserts({ triggers: [{ ...AC, via: "effect" }] })).toEqual([]);
    expect(unassertableKeys({ triggers: [{ ...AC, via: "effect" }] })).toEqual(["triggers"]);
  });

  it("reactions a round; a teleport of the user (after the attack: on a hit and on a miss); a swap; a light", () => {
    expect(impliedAsserts({ reactions: { perRound: 20 } })).toEqual([canon({ given: {}, expect: { reactionsPerRound: 20 } })]);
    expect(unassertableKeys({ reactions: { perRound: 3 } })).toEqual([]);
    const self = canon({ given: {}, expect: { teleports: "self" } });
    expect(impliedAsserts({ teleport: { activity: ACT } })).toEqual([self]);
    expect(unassertableKeys({ teleport: { activity: ACT } })).toEqual([]);
    // A distance of its own and an activity used on arrival have no word.
    expect(impliedAsserts({ teleport: { distance: 30, units: "ft" } })).toEqual([self]);
    expect(unassertableKeys({ teleport: { distance: 30, units: "ft" } })).toEqual(["teleport"]);
    expect(unassertableKeys({ teleport: { activity: ACT, then: ACT2 } })).toEqual(["teleport"]);
    expect(impliedAsserts({ teleport: { activity: ACT, after: "attack" } })).toEqual([
      canon({ given: { roll: "hit" }, expect: { teleports: "self" } }),
      canon({ given: { roll: "miss" }, expect: { teleports: "self" } })].sort());
    expect(impliedAsserts({ swapPlaces: { activity: ACT } }))
      .toEqual([canon({ given: {}, expect: { teleports: "swapsWithTarget" } })]);
    expect(unassertableKeys({ swapPlaces: { activity: ACT } })).toEqual([]);
    // A light's radii have no word: always stamped.
    expect(impliedAsserts({ light: { on: "effect", dim: 10, units: "ft" } }))
      .toEqual([canon({ given: {}, expect: { sheds: "light" } })]);
    expect(unassertableKeys({ light: { on: "effect", dim: 10, units: "ft" } })).toEqual(["light"]);
    expect(draftedForPerson({ entry: { light: { on: "effect", dim: 10, units: "ft" } } })).toBe("light");
    for (const k of NEW_KEYS) expect(IMPLIED_KEYS, k).toContain(k);
  });

  it("a light on the effect a save applies is said on the failed save", () => {
    const structure = { activities: [{ id: ACT, type: "save", effects: [EFF], damage: [] }] };
    expect(impliedAsserts({ light: { on: "effect", bright: 5, dim: 10, units: "ft" } }, { structure }))
      .toEqual([canon({ given: { roll: "failedSave" }, expect: { sheds: "light" } })]);
  });
});

describe("the assertion words", () => {
  it("are closed: acBonus, hitBecomes, counterattack, attackerTakes, reactionsPerRound, teleports, sheds", () => {
    expect(HIT_BECOMES).toEqual(["miss"]);
    expect(COUNTERATTACKS).toEqual(["meleeWeapon"]);
    expect(ATTACKER_TAKES).toEqual(["activity"]);
    expect(TELEPORTS).toEqual(["self", "swapsWithTarget"]);
    expect(SHEDS).toEqual(["light"]);
    expect(EXPECT_FIELDS).toEqual(expect.arrayContaining(["acBonus", "hitBecomes", "counterattack", "attackerTakes",
      "reactionsPerRound", "teleports", "sheds"]));
    const ok = (a) => expect(assertProblems([a], { vocabulary }), JSON.stringify(a)).toEqual([]);
    const no = (a) => expect(assertProblems([a], { vocabulary }).length, JSON.stringify(a)).toBeGreaterThan(0);
    ok({ given: { moment: "isHit" }, expect: { acBonus: "proficiency" } });
    ok({ given: { moment: "isHit", activity: "melee" }, expect: { acBonus: 1 } });
    ok({ given: { moment: "isHit" }, expect: { acBonus: 10 } });
    ok({ given: { moment: "isHit" }, expect: { hitBecomes: "miss" } });
    ok({ given: { moment: "isMissed" }, expect: { counterattack: "meleeWeapon" } });
    ok({ given: { moment: "isHit" }, expect: { attackerTakes: "activity" } });
    ok({ given: {}, expect: { reactionsPerRound: 2 } });
    ok({ given: {}, expect: { teleports: "self" } });
    ok({ given: { roll: "miss" }, expect: { teleports: "self" } });
    ok({ given: {}, expect: { sheds: "light" } });
    ok({ given: { roll: "hit" }, expect: { sheds: "light" } });
    no({ given: { moment: "isHit" }, expect: { acBonus: 0 } });
    no({ given: { moment: "isHit" }, expect: { acBonus: 11 } });
    no({ given: { moment: "isHit" }, expect: { acBonus: 2.5 } });
    no({ given: { moment: "isHit" }, expect: { acBonus: "prof" } });
    no({ given: { moment: "isHit" }, expect: { acBonus: "3" } });
    // Each reaction word at its own moment, never with a roll.
    no({ given: {}, expect: { acBonus: 2 } });
    no({ given: { moment: "isMissed" }, expect: { acBonus: 2 } });
    no({ given: { moment: "isHit", roll: "hit" }, expect: { hitBecomes: "miss" } });
    no({ given: { moment: "isHit" }, expect: { counterattack: "meleeWeapon" } });
    no({ given: { moment: "isMissed" }, expect: { attackerTakes: "activity" } });
    no({ given: { moment: "isHit" }, expect: { hitBecomes: "hit" } });
    // A count a round, said once for the item; a teleport never at a moment, on a hit or a miss at most.
    no({ given: { roll: "hit" }, expect: { reactionsPerRound: 3 } });
    no({ given: {}, expect: { reactionsPerRound: 1 } });
    no({ given: {}, expect: { reactionsPerRound: 21 } });
    no({ given: { moment: "isHit" }, expect: { teleports: "self" } });
    no({ given: { roll: "failedSave" }, expect: { teleports: "self" } });
    no({ given: {}, expect: { teleports: "target" } });
    no({ given: { moment: "turnStart" }, expect: { sheds: "light" } });
    no({ given: {}, expect: { sheds: "darkness" } });
    expect(isCanonicalAssertion(canon({ given: { moment: "isHit" }, expect: { acBonus: 3 } }), vocabulary)).toBe(true);
    expect(isCanonicalAssertion(canon({ given: { moment: "isHit" }, expect: { acBonus: "proficiency" } }), vocabulary)).toBe(true);
    expect(isCanonicalAssertion(canon({ given: {}, expect: { reactionsPerRound: 20 } }), vocabulary)).toBe(true);
  });

  it("each new word has a definition with its source, in all three vocabulary files", () => {
    expect(Object.keys(DEFINITIONS.hitBecomes)).toEqual(HIT_BECOMES);
    expect(Object.keys(DEFINITIONS.counterattack)).toEqual(COUNTERATTACKS);
    expect(Object.keys(DEFINITIONS.attackerTakes)).toEqual(ATTACKER_TAKES);
    expect(Object.keys(DEFINITIONS.teleports).sort()).toEqual([...TELEPORTS].sort());
    expect(Object.keys(DEFINITIONS.sheds)).toEqual(SHEDS);
    expect(DEFINITIONS.acBonus.proficiency.from).toBe("engine runtime/reactions.mjs");
    expect(DEFINITIONS.acBonus.number.means).toMatch(/1 to 10/);
    expect(DEFINITIONS.reactionsPerRound.number.from).toBe("engine core/turn.mjs");
    expect(DEFINITIONS.reactionsPerRound.number.means).toMatch(/one in a turn/);
    expect(DEFINITIONS.teleports.self.from).toBe("engine runtime/teleport.mjs");
    expect(DEFINITIONS.sheds.light.means).toMatch(/dim/);
    expect(undefinedWords({})).toEqual([]);
    const core = { moments: vocabulary.moments, statuses: ["prone"], creatureTypes: ["undead"], moveModes: ["push"],
      effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"], sizes: vocabulary.sizes, stepTypes: [], facts: [], abilities: [] };
    for (const v of [draftVocabulary(core), reviewVocabulary(core), rereadVocabulary(core)]) {
      expect(v.definitions.hitBecomes.miss.means).toMatch(/miss/);
      expect(v.assert.shapes.expect.acBonus).toEqual({ type: "oneOf", of: [
        { type: "number", min: 1, max: 10, int: true, formula: false }, { type: "enum", values: ["proficiency"] }] });
      expect(v.assert.shapes.expect.reactionsPerRound).toMatchObject({ type: "number", min: 2, max: 20, int: true });
      for (const [field, words] of [["hitBecomes", HIT_BECOMES], ["counterattack", COUNTERATTACKS],
        ["attackerTakes", ATTACKER_TAKES], ["teleports", TELEPORTS], ["sheds", SHEDS]]) {
        expect(v.assert.shapes.expect[field], field).toEqual({ type: "enum", values: words });
        expect(v.assert[field], field).toEqual(words);
      }
    }
    const d = draftVocabulary(core);
    for (const k of NEW_KEYS) expect(d.draftShapes[k], k).toBeTruthy();
    expect(Object.keys(d.reactions.keys).sort()).toEqual([...NEW_KEYS].sort());
    expect(Object.keys(d.reactions.declarations).sort()).toEqual(Object.keys(REACTION_DECLARATIONS).sort());
    expect(d.reactions.declaration).toEqual(resolveShape(REACTION_DECLARATION, {}));
    expect(Object.keys(d.reactions.excluded).sort()).toEqual(Object.keys(EXCLUDED_REACTION).sort());
    expect(Object.keys(d.reactions.notAdmitted).sort())
      .toEqual([...Object.keys(NOT_ADMITTED_REACTION), ...Object.keys(NOT_ADMITTED_STEPS)].sort());
    expect(d.draftShapes.triggers.item.of.length).toBe(DRAFT_SHAPES.triggers.item.of.length);
    expect(reviewVocabulary(core)).not.toHaveProperty("reactions");
    expect(rereadVocabulary(core)).not.toHaveProperty("reactions");
  });
});

describe("review compares the new words as identity", () => {
  const rule = (entry, assert = []) => ({ entry, assert, origins: ["official"] });
  it("an AC bonus of proficiency against a number disagree; melee only is another situation", () => {
    const parry = rule({ triggers: [AC] });
    expect(compareAsserts(parry, [{ given: HIT_MELEE, expect: { acBonus: "proficiency" } }]).agrees).toBe(true);
    expect(compareAsserts(parry, [{ given: HIT_MELEE, expect: { acBonus: 3 } }]).agrees).toBe(false);
    expect(compareAsserts(parry, [{ given: { moment: "isHit" }, expect: { acBonus: "proficiency" } }]).agrees).toBe(false);
  });
  it("a miss instead against an AC bonus disagree; a counterattack, a swap and reactions a round agree with themselves", () => {
    expect(compareAsserts(rule({ triggers: [MISS] }), [{ given: { moment: "isHit" }, expect: { acBonus: 5 } }]).agrees)
      .toBe(false);
    expect(compareAsserts(rule({ triggers: [COUNTER] }),
      [{ given: { moment: "isMissed", activity: "melee" }, expect: { counterattack: "meleeWeapon" } }]).agrees).toBe(true);
    expect(compareAsserts(rule({ swapPlaces: { activity: ACT } }), [{ given: {}, expect: { teleports: "swapsWithTarget" } }])
      .agrees).toBe(true);
    expect(compareAsserts(rule({ swapPlaces: { activity: ACT } }), [{ given: {}, expect: { teleports: "self" } }]).agrees)
      .toBe(false);
    expect(compareAsserts(rule({ reactions: { perRound: 20 } }), [{ given: {}, expect: { reactionsPerRound: 3 } }]).agrees)
      .toBe(false);
  });
});

describe("scenarios: every new word is a person's to play, named precisely", () => {
  const record = (entry) => ({
    key: "tst:monster:brass-sentinel/reaction/guard", book: "TST", kind: "monster", identifier: "tst-brass-sentinel-guard",
    items: [{ origin: "official", match: "matched", docId: "Bs10Bs21Bs32Bs43.Bt10Bt21Bt32Bt43", activities: [ACT],
      effects: [EFF] }],
    rule: { handledIn: "table", adds: "x", entry, origins: ["official"], assert: [] },
    evidence: {}
  });
  const packOf = () => "tst.monsters";
  it("names the moment and the word the runner cannot stage", () => {
    // `advance`: the runner passes no reaction moment either (an attack against the creature, its reaction taken).
    expect(scenarioOf(record({ triggers: [AC] }), { packOf }).manualBecause)
      .toEqual(["advance", "expect.acBonus", "given.activity", "given.moment.isHit"]);
    expect(scenarioOf(record({ triggers: [MISS] }), { packOf }).manualBecause)
      .toEqual(["advance", "expect.hitBecomes", "given.moment.isHit"]);
    expect(scenarioOf(record({ triggers: [COUNTER] }), { packOf }).manualBecause)
      .toEqual(["advance", "expect.counterattack", "given.activity", "given.moment.isMissed"]);
    expect(scenarioOf(record({ triggers: [BACK] }), { packOf }).manualBecause)
      .toEqual(["advance", "expect.attackerTakes", "given.activity", "given.moment.isHit"]);
    expect(scenarioOf(record({ reactions: { perRound: 20 } }), { packOf })).toMatchObject({ manual: true,
      manualBecause: ["expect.reactionsPerRound"], checks: 0 });
    expect(scenarioOf(record({ teleport: { activity: ACT } }), { packOf }).manualBecause).toEqual(["expect.teleports"]);
    expect(scenarioOf(record({ swapPlaces: { activity: ACT } }), { packOf }).manualBecause).toEqual(["expect.teleports"]);
    expect(scenarioOf(record({ light: { on: "effect", dim: 10, units: "ft" } }), { packOf }).manualBecause)
      .toEqual(["expect.sheds"]);
  });
});

describe("the engine's field lists, read from its own validators (synthetic text)", () => {
  it("stepFieldsOf collects a step type's fields: its block, its lines, the lists that name it, and the common ones", () => {
    const steps = [
      "function validateStep(step, at, errors) {",
      '  if ( step.type === "damage" ) {',
      '    if ( ("to" in step) && x ) errors.push(1);',
      '    const y = step.formula;',
      "  }",
      '  if ( (step.type === "use") && ("target" in step) ) errors.push(2);',
      '  if ( "margin" in step ) errors.push(3);',
      '  if ( ["use", "damage"].includes(step.type) && ("activity" in step) ) errors.push(4);',
      '  if ( ["penalty", "bonus"].includes(step.type) && (typeof step.formula !== "string") ) errors.push(5);',
      "}",
      "export function validateTrigger(declaration, at, facts, errors) {",
      '  if ( "fromEffect" in declaration ) x;',
      '  if ( ("free" in declaration) && y ) z;',
      '      if ( isObject(s) && ["halve", "miss", "penalty"].includes(s.type) && !(d.on.some(m => HIT_WINDOWS.includes(m))) ) x;',
      "}"
    ].join("\n");
    expect(stepFieldsOf(steps, "damage")).toEqual(["activity", "formula", "margin", "to"]);
    expect(stepFieldsOf(steps, "use")).toEqual(["activity", "margin", "target"]);
    expect(stepFieldsOf(steps, "penalty")).toEqual(["formula", "margin"]);
    expect(stepFieldsOf(steps, "miss")).toEqual(["margin"]);
    expect(declarationFieldsOf(steps)).toEqual(["do", "free", "fromEffect", "if", "on", "via"]);
    expect(hitWindowStepsOf(steps)).toEqual(["halve", "miss", "penalty"]);
    expect(declarationFieldsOf("")).toBeNull();
    expect(hitWindowStepsOf("")).toBeNull();
    expect(stepFieldsOf("", "use")).toBeNull();
  });
  it("reactionFieldsOf reads the reactions, teleport and light field lists and the light anchors; null when one is missing", () => {
    const entry = 'if ( ("reactions" in entry) && !(Object.keys(entry.reactions).every(k => ["perRound", "loseOne"]'
      + '.includes(k))) ) x;';
    const annex = 'export function validateTeleport(teleport) { for ( const key of Object.keys(p) ) if ( !["count"].includes(key) )'
      + ' y; for ( const key of Object.keys(teleport) ) if ( !["distance", "units"].includes(key) ) x; }\n'
      + 'export function validateLight(l) { for ( const key of ["bright"] ) y;\n  for ( const key of Object.keys(l) ) {\n'
      + '    if ( !["on", "dim"].includes(key) ) x;\n  }\n}';
    const light = 'export const LIGHT_ON = Object.freeze(["area", "effect"]);';
    expect(reactionFieldsOf({ entry, annex, light })).toEqual({ reactions: ["perRound", "loseOne"],
      teleport: ["distance", "units"], light: ["on", "dim"], lightOn: ["area", "effect"] });
    expect(reactionFieldsOf({ entry, annex, light: "" })).toBeNull();
  });
});

const CORE = process.env.DAS_CORE;
const fieldsOfShape = (shape) => [...new Set((shape.type === "oneOf" ? shape.of : [shape])
  .flatMap((o) => [...Object.keys(o.keys), ...Object.keys(o.optional)]))];
const excludedFields = (k) => Object.keys(EXCLUDED_REACTION).filter((x) => x.startsWith(`${k}.`))
  .map((x) => x.slice(k.length + 1)).filter((x) => !x.includes("."));
describe.skipIf(!CORE)("against the DAS_CORE clone", () => {
  it("each admitted and refused key is an entry key of the engine; its fields are the ones this pack assumes", async () => {
    const core = await loadCore(CORE);
    for (const k of [...NEW_KEYS, ...Object.keys(NOT_ADMITTED_REACTION)]) expect(core.entryKeys.has(k), k).toBe(true);
    for (const m of REACTION_MOMENTS) expect(core.moments, m).toContain(m);
    for (const t of Object.keys(REACTION_STEP_FIELDS)) expect(core.stepTypes, t).toContain(t);
    for (const f of REACTION_FACTS) expect(core.facts, f).toContain(f);
    const { reactionFields } = core;
    expect(reactionFields).not.toBeNull();
    // Every field a validator accepts is in the drafter's shape or excluded with why, and no other.
    for (const k of ["reactions", "teleport", "light"]) {
      expect([...reactionFields[k]].sort(), k).toEqual([...fieldsOfShape(DRAFT_SHAPES[k]), ...excludedFields(k)].sort());
    }
    // The light anchors: `effect` admitted, every other one refused with why.
    expect([...reactionFields.lightOn].sort()).toEqual(["effect", ...Object.keys(EXCLUDED_REACTION)
      .filter((x) => x.startsWith("light.on.")).map((x) => x.split(".")[2])].sort());
    // Each step type's fields (read from validateStep) and the declaration's (validateTrigger): admitted or excluded.
    for (const [type, admitted] of Object.entries(REACTION_STEP_FIELDS)) {
      const excluded = Object.keys(EXCLUDED_REACTION).filter((x) => x.startsWith(`step.${type}.`)).map((x) => x.split(".")[2]);
      expect(core.stepFields(type), type).toEqual([...admitted, ...excluded].sort());
    }
    const declarationExcluded = Object.keys(EXCLUDED_REACTION).filter((x) => x.startsWith("triggers.reaction."))
      .map((x) => x.split(".")[2]);
    expect(core.declarationFields).toEqual([...Object.keys(REACTION_DECLARATION.of[0].keys),
      ...Object.keys(REACTION_DECLARATION.of[0].optional), ...declarationExcluded].sort());
    // swapPlaces: one field, the activity (the engine refuses any other).
    const facts = Object.fromEntries(core.facts.map((name) => [name, true]));
    expect(core.validateEntry({ swapPlaces: { activity: ACT } }, { facts })).toEqual([]);
    expect(core.validateEntry({ swapPlaces: { activity: ACT, x: 1 } }, { facts }).length).toBeGreaterThan(0);
  });

  it("every step the engine allows at a hit is admitted or named with why (an older engine may lack one)", async () => {
    const core = await loadCore(CORE);
    for (const t of core.hitWindowSteps) {
      expect(Object.hasOwn(REACTION_STEP_FIELDS, t) || Object.hasOwn(NOT_ADMITTED_STEPS, t), t).toBe(true);
    }
    expect(core.hitWindowSteps).toEqual(expect.arrayContaining(["miss", "penalty"]));
  });

  it("the engine's validator accepts every value from the shapes, and refuses what this pack assumes refused", async () => {
    const core = await loadCore(CORE);
    const shapes = draftVocabulary(core).draftShapes;
    const facts = Object.fromEntries(core.facts.map((name) => [name, true]));
    let n = 0;
    for (const k of NEW_KEYS) {
      for (const value of variants(shapes[k])) {
        n++;
        expect(core.validateEntry({ [k]: value }, { facts }), `${k} ${JSON.stringify(value)}`).toEqual([]);
      }
    }
    for (const d of variants(draftVocabulary(core).reactions.declaration)) {
      n++;
      expect(core.validateEntry({ triggers: [d] }, { facts }), JSON.stringify(d)).toEqual([]);
    }
    expect(n).toBeGreaterThan(25);
    for (const entry of [{ reactions: { perRound: 0 } }, { reactions: { perRound: 2, x: 1 } },
      { teleport: { distance: 30 } }, { teleport: {} }, { teleport: { activity: "short" } }, { swapPlaces: {} },
      { light: { on: "effect" } }, { light: { on: "nowhere", dim: 10, units: "ft" } },
      { triggers: [{ on: "isHit", do: [{ type: "penalty", formula: "@prof" }] }] },
      { triggers: [{ on: "isHit", do: [{ type: "miss" }] }] },
      { triggers: [{ on: "isMissed", do: [{ type: "use", weapon: true }] }] },
      { triggers: [{ on: "isMissed", do: [{ type: "damage", to: "source", activity: ACT }] }] }]) {
      expect(core.validateEntry(entry, { facts }).length, JSON.stringify(entry)).toBeGreaterThan(0);
    }
  });

  it("the engine's own entries: those in a drafter's shape imply the words a draft's would", async () => {
    const core = await loadCore(CORE);
    const shipped = Object.entries(core.shipped);
    const fit = (entry) => !reactionProblemsOf(entry).length;
    // The Monster Manual's parry: an AC bonus of proficiency against a melee hit.
    expect(fit({ triggers: core.shipped.parry.triggers })).toBe(true);
    expect(impliedAsserts({ triggers: core.shipped.parry.triggers }))
      .toEqual([canon({ given: HIT_MELEE, expect: { acBonus: "proficiency" } })]);
    const declarations = shipped.flatMap(([id, e]) => [e?.triggers].flat().filter((d) => isReactionDeclaration(d))
      .map((d) => [id, d]));
    const fitting = declarations.filter(([, d]) => fit({ triggers: [d] }));
    expect(fitting.length).toBeGreaterThan(3);
    for (const [id, d] of fitting) {
      expect(impliedAsserts({ triggers: [d] }).length, id).toBe(1);
      expect(unassertableKeys({ triggers: [d] }), id).toEqual([]);
    }
    expect(new Set(fitting.map(([, d]) => reactionKind(d)))).toEqual(new Set(["acBonus", "hitBecomesMiss", "counterattack",
      "retaliation"]));
    // Every reactions, teleport and light entry the engine ships fits a drafter's shape or holds a field excluded with why.
    for (const k of NEW_KEYS) {
      const uses = shipped.filter(([, e]) => e && Object.hasOwn(e, k));
      expect(uses.length, k).toBeGreaterThan(0);
      for (const [id, e] of uses) {
        if (fit({ [k]: e[k] })) {
          expect(impliedAsserts({ [k]: e[k] }).length, `${k} ${id}`).toBeGreaterThan(0);
          continue;
        }
        expect(reactionProblemsOf({ [k]: e[k] }).join("; "), `${k} ${id}`).toMatch(/not a drafter's (field|value)/);
      }
    }
  });
});
