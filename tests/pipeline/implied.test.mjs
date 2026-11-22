// Fix round 1 of Ruling R25: what an entry implies covers what its keys do (assert.mjs IMPLIED / IMPLIES_NOTHING), so that
// `leaves` cannot list what the rule already does and review compares like with like; a key the vocabulary cannot assert
// stamps the draft for a person at review (the R15 stamp, generalised); `excludes` is not an agent's word; a leave that the
// rule already contradicts is refused. Synthetic fixtures only.
import { describe, expect, it } from "vitest";
import {
  DENIES, IMPLIED_KEYS, IMPLIES_NOTHING, assertProblems, assertShapes, impliedAsserts, normaliseAssert, unassertableKeys
} from "../../tools/pipeline/assert.mjs";
import { DRAFT_KEYS } from "../../tools/pipeline/draft-keys.mjs";
import { draftedForPerson, draftedForPersonReasons, validateRecord } from "../../tools/pipeline/schema.mjs";
import { compareAsserts } from "../../tools/pipeline/review.mjs";
import { leavesConflicts } from "../../tools/pipeline/leaves.mjs";
import { DEFINITIONS } from "../../tools/pipeline/definitions.mjs";
import { draftVocabulary, reviewVocabulary } from "../../tools/pipeline/batch.mjs";
import { validateQueueEntry } from "../../tools/pipeline/registry.mjs";

const SAVE = "Sv11Sv22Sv33Sv44";
const ATK = "At11At22At33At44";
const E_SAVE = "Es11Es22Es33Es44";
const E_HIT = "Eh11Eh22Eh33Eh44";
const E_OK = "Eo11Eo22Eo33Eo44";
// The item's own data (structure.mjs structureOf): a save that applies E_SAVE (and E_OK, put on a saved save by the entry),
// an attack that applies E_HIT.
const STRUCTURE = { activities: [
  { id: SAVE, type: "save", damage: [], effects: [E_SAVE, E_OK] }, { id: ATK, type: "attack", damage: [], effects: [E_HIT] }
], effects: [{ id: E_SAVE, statuses: [] }, { id: E_HIT, statuses: [] }, { id: E_OK, statuses: [] }] };
const c1 = (given, expect) => normaliseAssert([{ given, expect }])[0];
const FS = { roll: "failedSave" };
const RESAVE = { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: E_SAVE, do: [{ type: "resave" }] }] };

describe("every drafter key implies what it does, or is listed as implying nothing", () => {
  it("each DRAFT_KEYS key is in exactly one of IMPLIED_KEYS and IMPLIES_NOTHING, each reason one line", () => {
    for (const key of Object.keys(DRAFT_KEYS)) {
      expect(IMPLIED_KEYS.includes(key) !== Object.hasOwn(IMPLIES_NOTHING, key), key).toBe(true);
    }
    for (const key of [...IMPLIED_KEYS, ...Object.keys(IMPLIES_NOTHING)]) expect(Object.hasOwn(DRAFT_KEYS, key), key).toBe(true);
    for (const [key, why] of Object.entries(IMPLIES_NOTHING)) expect(why, key).toMatch(/^[\x20-\x7e]{10,160}$/);
  });
  it("resave: the effect ends on a successful save, for the roll that applied it", () => {
    expect(impliedAsserts(RESAVE, { structure: STRUCTURE })).toEqual([c1(FS, { ends: "savedSave" })]);
    expect(impliedAsserts(RESAVE)).toEqual([c1({}, { ends: "savedSave" })]);
    const kept = { triggers: [{ ...RESAVE.triggers[0], do: [{ type: "resave", keep: true }] }] };
    expect(impliedAsserts(kept)).toEqual([]);
    expect(unassertableKeys(kept)).toEqual(["triggers"]);
    expect(unassertableKeys(RESAVE)).toEqual([]);
  });
  it("effectEnds, noReactions, actionOrBonus and effectStatuses, on the roll their effect is applied by", () => {
    const entry = { effectEnds: { [E_SAVE]: "bearerTurnEnd", [E_HIT]: "casterTurnStart" }, noReactions: [E_SAVE],
      actionOrBonus: true, effectStatuses: { [E_HIT]: ["prone"] } };
    expect(impliedAsserts(entry, { structure: STRUCTURE })).toEqual(normaliseAssert([
      { given: FS, expect: { ends: "bearerTurnEnd" } }, { given: { roll: "hit" }, expect: { ends: "casterTurnStart" } },
      { given: FS, expect: { denies: "reactions" } }, { given: FS, expect: { denies: "actionAndBonus" } },
      { given: { roll: "hit" }, expect: { denies: "actionAndBonus" } }, { given: { roll: "savedSave" }, expect: {
        denies: "actionAndBonus" } }, { given: { roll: "hit" }, expect: { condition: { applied: "prone" } } }
    ].filter((a) => !(a.given.roll === "savedSave"))));
    // An effect the entry puts on a saved save is applied by that roll.
    expect(impliedAsserts({ noReactions: [E_OK], savedEffects: [E_OK] }, { structure: STRUCTURE }))
      .toEqual([c1({ roll: "savedSave" }, { denies: "reactions" })]);
    // Without the structure the roll is unknown: every situation.
    expect(impliedAsserts({ effectEnds: { [E_SAVE]: "bearerTurnEnd" } })).toEqual([c1({}, { ends: "bearerTurnEnd" })]);
    expect(unassertableKeys(entry)).toEqual([]);
  });
  it("noOpportunity: the user's move provokes no opportunity attacks; while flying it cannot be said", () => {
    for (const mode of ["always", "afterUse", "whileEffect"]) {
      expect(impliedAsserts({ noOpportunity: mode })).toEqual([c1({}, { denies: "opportunityAttacks" })]);
    }
    expect(impliedAsserts({ noOpportunity: "flying" })).toEqual([]);
    expect(unassertableKeys({ noOpportunity: "flying" })).toEqual(["noOpportunity"]);
  });
  it("saveDisadvantageFor and rollDisadvantage are rolls with disadvantage", () => {
    expect(impliedAsserts({ saveDisadvantageFor: ["construct"], rollDisadvantage: { on: ["check", "save"] } })).toEqual(
      normaliseAssert([{ given: { targetType: "construct" },
        expect: { roll: { mode: "disadvantage", on: "save", for: "target" } } },
        { given: {}, expect: { roll: { mode: "disadvantage", on: "check", for: "self" } } },
        { given: {}, expect: { roll: { mode: "disadvantage", on: "save", for: "self" } } }]));
  });
  it("a key that implies nothing, a trigger step no word says, an unknown key: unassertable", () => {
    expect(unassertableKeys({ effectDurations: { [E_SAVE]: { seconds: 60 } }, grantsResistances: ["fire"] }))
      .toEqual(["effectDurations", "grantsResistances"]);
    expect(unassertableKeys({ triggers: [{ on: "hit", do: [{ type: "damage", formula: "1d6", damageType: "fire" }] }] }))
      .toEqual(["triggers"]);
    expect(unassertableKeys({ triggers: [{ on: "endOfTurn", do: [{ type: "status", status: "prone" }] }] })).toEqual(["triggers"]);
    expect(unassertableKeys({ aura: {} })).toEqual(["aura"]);
    expect(unassertableKeys({ constructor: 1 })).toEqual(["constructor"]);
  });
});

describe("the stamp for a person, generalised (Ruling R15)", () => {
  it("names the first key, in name order, the vocabulary cannot assert", () => {
    expect(draftedForPerson({ entry: { usageLimits: { [SAVE]: { oncePerTurn: true } }, effectDurations: {} } }))
      .toBe("effectDurations");
    expect(draftedForPerson({ entry: { noReactions: true, effectEnds: { [E_SAVE]: "bearerTurnEnd" } } })).toBe(null);
    expect(draftedForPerson({ entry: { aura: {} } })).toBe("other-key");
    expect(draftedForPerson({ entry: {}, uncovered: [{ origin: "official", because: "x" }] })).toBe("official-uncovered");
    for (const key of Object.keys(IMPLIES_NOTHING)) expect(draftedForPersonReasons(), key).toContain(key);
    // A stamp written before fix round 1 keeps its reason.
    expect(draftedForPersonReasons()).toContain("noReactions");
  });
});

describe("the new words, and excludes taken from the agents", () => {
  it("denies is a closed expectation with its definitions", () => {
    expect(DENIES).toEqual(["opportunityAttacks", "reactions", "actionAndBonus"]);
    expect(Object.keys(DEFINITIONS.denies).sort()).toEqual([...DENIES].sort());
    expect(assertProblems([{ given: {}, expect: { denies: "reactions" } }])).toEqual([]);
    expect(assertProblems([{ given: {}, expect: { denies: "speech" } }]).join(" ")).toMatch(/denies/);
  });
  it("excludes: no engine notion maps to it, so agents may not write it; stored data still reads", () => {
    const ex = [{ given: { moment: "leavesReach" }, expect: { excludes: "self" } }];
    expect(assertProblems(ex)).toEqual([]);
    expect(assertProblems(ex, { agent: true }).join(" ")).toMatch(/excludes: not an agent's word/);
    expect(Object.keys(assertShapes().expect)).not.toContain("excludes");
    expect(Object.hasOwn(DEFINITIONS, "excludes")).toBe(false);
    const core = { moments: ["leavesReach"], stepTypes: [], facts: [], statuses: [], creatureTypes: [], moveModes: [],
      effectEnds: [], damageTypes: [], abilities: [], shipped: {} };
    for (const v of [draftVocabulary(core), reviewVocabulary(core)]) {
      expect(v.assert.expectFields).not.toContain("excludes");
      expect(v.assert.expectFields).toContain("denies");
    }
    const rule = { handledIn: "table", adds: "x.", origins: ["official"], entry: {}, assert: ex };
    const record = { key: "tst:spell:x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024", text: null,
      items: [], verdict: "entry", evidence: {}, rule };
    expect(validateRecord(record).join(" ")).toMatch(/excludes/);
    // A review-queue entry stored before fix round 1 is still read.
    const queued = { key: "tst:spell:x", reason: "disagreement", by: "reviewer-1", why: "w", confidence: 0.9,
      draft: { rule: "a".repeat(64), assert: [{ given: {}, expect: { denies: "reactions" } }], implied: [] },
      review: { rule: "a".repeat(64), assert: ex, agrees: false, onlyDraft: [], onlyReview: normaliseAssert(ex) } };
    expect(validateQueueEntry(queued, { queue: "review" })).toEqual([]);
  });
});

describe("leaves cohere with the rule", () => {
  const rule = (entry, assert, leaves) => ({ entry, assert, leaves });
  const PRONE = { given: FS, expect: { condition: { applied: "prone" } } };
  it("the chain-devil shape: the rule ends at bearerTurnEnd, a leave says currentTurnEnd: refused", () => {
    const r = rule({ effectEnds: { [E_SAVE]: "bearerTurnEnd" } }, [PRONE, { given: FS, expect: { ends: "bearerTurnEnd" } }],
      [{ given: FS, expect: { ends: "currentTurnEnd" } }]);
    expect(leavesConflicts(r).join(" ")).toMatch(/already says otherwise/);
  });
  it("the chasme shape: the rule resaves, a leave lists the ending on a successful save: refused as done by the rule", () => {
    const r = rule(RESAVE, [PRONE], [{ given: FS, expect: { ends: "savedSave" } }]);
    expect(leavesConflicts(r).join(" ")).toMatch(/states or implies/);
  });
  it("another fraction, move mode or roll mode for the same situation: refused; a second, event ending: allowed", () => {
    const base = [PRONE, { given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } }];
    expect(leavesConflicts(rule({}, base, [{ given: { roll: "savedSave" }, expect: { damage: { fraction: 0 } } }])).length).toBe(1);
    expect(leavesConflicts(rule({}, [...base, { given: FS, expect: { move: { mode: "push" } } }],
      [{ given: FS, expect: { move: { mode: "pull" } } }])).length).toBe(1);
    expect(leavesConflicts(rule({ rollDisadvantage: { on: ["save"] } }, base,
      [{ given: {}, expect: { roll: { mode: "advantage", on: "save", for: "self" } } }])).length).toBe(1);
    // An effect may end on an event as well as at its time, and a target may gain a second condition.
    expect(leavesConflicts(rule(RESAVE, base, [{ given: FS, expect: { ends: "isDamaged" } },
      { given: FS, expect: { condition: { applied: "restrained" } } }]))).toEqual([]);
  });
  it("review matches the implied ending of resave, not a leave", () => {
    const r = rule(RESAVE, [PRONE], [{ given: FS, expect: { ends: "isDamaged" } }]);
    const c = compareAsserts(r, [PRONE, { given: FS, expect: { ends: "savedSave" } }, { given: FS, expect: { ends: "isDamaged" } }],
      { structure: STRUCTURE });
    expect(c.agrees).toBe(true);
    expect(c.implied).toEqual([c1(FS, { ends: "savedSave" })]);
    expect(c.left).toEqual([{ leaves: c1(FS, { ends: "isDamaged" }), review: c1(FS, { ends: "isDamaged" }) }]);
  });
});
