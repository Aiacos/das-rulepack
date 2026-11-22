// Ruling R33: zones and auras. A drafter may write the engine's zone and aura keys in a closed, typed form (no free string,
// no identifier of another document), what each does is an assertion of the closed vocabulary (a zone moment in `given`,
// `expect.subjected`, an automatic success), review compares it, a scenario says it is a person's to play, and the engine's
// own validator and lists pin every shape. Synthetic fixtures only: invented ids, invented entries, sentences in this test's
// own words.
import { describe, it, expect } from "vitest";
import {
  AURA_AFFECTS, AURA_MOMENTS, EMANATION_AFFECTS, EMANATION_ON, EXCLUDED_ZONE, TEMPLATE_TYPES, ZONE_AFFECTS, ZONE_KEYS,
  ZONE_MOMENTS
} from "../../tools/pipeline/zones.mjs";
import { DAMAGE_ROLLS, DRAFT_KEYS, DRAFT_SHAPES, checkDraftKeys, zoneProblemsOf } from "../../tools/pipeline/draft-keys.mjs";
import {
  EXPECT_FIELDS, IMPLIED_KEYS, IMPLIES_NOTHING, ROLL_MODES, SUBJECTED, assertProblems, impliedAsserts, normaliseAssert,
  unassertableKeys
} from "../../tools/pipeline/assert.mjs";
import { compareAsserts } from "../../tools/pipeline/review.mjs";
import { DEFINITIONS, undefinedWords } from "../../tools/pipeline/definitions.mjs";
import { draftVocabulary, rereadVocabulary, reviewVocabulary } from "../../tools/pipeline/batch.mjs";
import { scenarioOf } from "../../tools/pipeline/scenarios.mjs";
import { draftedForPerson } from "../../tools/pipeline/schema.mjs";
import { shapeProblems, resolveShape } from "../../tools/pipeline/shapes.mjs";
import { loadCore } from "../../tools/pipeline/core.mjs";
import { variants } from "./fixtures/shapes.mjs";

const ACT = "Zn10Zn21Zn32Zn43";
const ACT2 = "Zm10Zm21Zm32Zm43";
const EFF = "Ze10Ze21Ze32Ze43";
const spell = { origins: ["official"], kind: "spell" };
const vocabulary = {
  sizes: ["tiny", "sm", "med", "lg", "huge", "grg"], statuses: ["prone", "poisoned"], creatureTypes: ["construct", "undead"],
  damageTypes: ["fire"], moments: ["failedSave", "hit", "enter", "turnStart", "turnEnd", "endOfTurn"], moveModes: ["push"],
  effectEnds: ["bearerTurnEnd"]
};
const canon = (a) => normaliseAssert([a])[0];
const ZONE = (on) => ({ triggers: [{ on, do: [{ type: "replay" }] }] });
const SUBJECT = (moment) => canon({ given: { moment }, expect: { subjected: "activity" } });
const NEW_KEYS = Object.keys(ZONE_KEYS);

describe("Ruling R33: the zone and aura keys a drafter may write", () => {
  it("admits nine engine keys, each with a slot, a meaning in our words and the engine file it was read from", () => {
    expect(NEW_KEYS.sort()).toEqual(["aura", "emanation", "saveAutoSuccess", "selfZone", "willingFails", "zoneAffects",
      "zoneEffects", "zoneLasts", "zoneMax"]);
    for (const k of NEW_KEYS) {
      expect(Object.hasOwn(DRAFT_KEYS, k), k).toBe(true);
      expect(ZONE_KEYS[k].means, k).toMatch(/^[\x20-\x7e]{40,500}$/);
      expect(ZONE_KEYS[k].from, k).toMatch(/^engine (core|adapter|runtime)\/[a-z/-]+\.mjs$/);
    }
    expect(Object.fromEntries(NEW_KEYS.map((k) => [k, DRAFT_KEYS[k].slot]))).toEqual({
      aura: "single", emanation: "single", saveAutoSuccess: "none", selfZone: "activityMap", willingFails: "none",
      zoneAffects: "none", zoneEffects: "none", zoneLasts: "none", zoneMax: "none"
    });
    expect(Object.isFrozen(ZONE_KEYS) && Object.isFrozen(EXCLUDED_ZONE)).toBe(true);
  });

  it("the closed lists: zone moments, emanation moments, the aura moment words, who is affected, the template types", () => {
    expect(ZONE_MOMENTS).toEqual(["enter", "turnStart", "turnEnd"]);
    expect(EMANATION_ON).toEqual(["ownTurnEnd", "ownTurnStart", "turnStart"]);
    expect(AURA_MOMENTS).toEqual(["ownTurnStart", "ownTurnEnd"]);
    expect(EMANATION_AFFECTS).toEqual(["any", "enemy"]);
    expect(AURA_AFFECTS).toEqual(["ally", "enemy", "any"]);
    expect(ZONE_AFFECTS).toEqual(["enemy", "ally"]);
    expect(TEMPLATE_TYPES).toEqual(["radius", "sphere", "circle", "cube", "square"]);
    for (const [what, why] of Object.entries(EXCLUDED_ZONE)) {
      expect(what, what).toMatch(/^(aura|emanation|triggers)\.[A-Za-z.]+$/);
      expect(why, what).toMatch(/^[\x20-\x7e]{20,200}$/);
    }
  });

  it("every value built from a zone key's shape, and every replay declaration, passes checkDraftKeys", () => {
    let n = 0;
    for (const k of NEW_KEYS) {
      for (const value of variants(resolveShape(DRAFT_SHAPES[k], vocabulary))) {
        n++;
        expect(checkDraftKeys({ [k]: value }, spell), `${k} ${JSON.stringify(value)}`).toEqual([]);
      }
    }
    const triggers = variants(resolveShape(DRAFT_SHAPES.triggers, vocabulary)).filter((t) => JSON.stringify(t).includes("replay"));
    expect(triggers.length).toBeGreaterThan(5);
    for (const t of triggers) expect(checkDraftKeys({ triggers: t }, spell), JSON.stringify(t)).toEqual([]);
    expect(n).toBeGreaterThan(30);
  });

  it("refuses the engine's free fields and values, each with why", () => {
    const refused = (entry, re) => expect(checkDraftKeys(entry, spell).join("; "), JSON.stringify(entry)).toMatch(re);
    refused({ aura: { changes: [{ key: "system.bonuses.abilities.save", value: "2", type: "add" }] } },
      /aura\.changes: not a drafter's field \(free key and value strings/);
    refused({ aura: { radiusFormula: "@scale.x.y" } }, /aura\.radiusFormula: not a drafter's field/);
    refused({ aura: { affects: "summoner" } }, /aura\.affects: "summoner" is not a drafter's value \(only the creature/);
    refused({ emanation: { on: "death" } }, /emanation\.on: "death" is not a drafter's value \(it acts when the bearer dies/);
    refused({ emanation: { on: "ownTurnEnd", whileActive: true, atStart: true } }, /emanation\.atStart: not a drafter's field/);
    refused({ emanation: { on: "ownTurnEnd", radiusFormula: "@mod" } }, /emanation\.radiusFormula: not a drafter's field/);
    refused({ triggers: [{ on: ["enter", "moves"], do: [{ type: "replay" }] }] },
      /triggers\[0\]\.on: "moves" is not a drafter's value \(once per square/);
    refused({ triggers: [{ on: "enter", if: { "target.creatureType": "undead" }, do: [{ type: "replay", activity: ACT }] }] },
      /triggers\[0\]\.if: not a drafter's field \(a condition that picks/);
  });

  it("refuses every value outside the closed, bounded shape", () => {
    const bad = [
      { emanation: { on: "ownTurnEnd", radius: 10 } }, { emanation: { on: "ownTurnEnd", radius: 10, units: "m" } },
      { emanation: { on: "ownTurnEnd", radius: 400, units: "ft" } }, { emanation: { on: "ownTurnEnd", radius: 7.5, units: "ft" } },
      { emanation: { on: "turnEnd" } }, { emanation: { on: "ownTurnEnd", affects: "ally" } },
      { emanation: { on: "ownTurnEnd", sees: false } }, { emanation: { on: "ownTurnEnd", activity: "not-an-id" } },
      { emanation: "ownTurnEnd" }, { aura: { affects: "friends" } }, { aura: { includeSelf: false } },
      { aura: { effect: "short" } }, { aura: { types: [] } }, { aura: { types: ["undead"], extra: 1 } },
      { zoneAffects: "any" }, { zoneAffects: ["enemy"] }, { zoneEffects: false }, { zoneEffects: "yes" },
      { selfZone: { "not-an-id": { type: "radius", size: 10, units: "ft" } } }, { selfZone: {} },
      { selfZone: { [ACT]: { type: "line", size: 10, units: "ft" } } }, { selfZone: { [ACT]: { type: "radius", size: 10 } } },
      { zoneLasts: { seconds: 3 } }, { zoneLasts: { seconds: 60, rounds: 10 } }, { zoneLasts: 60 },
      { zoneMax: 0 }, { zoneMax: 21 }, { zoneMax: 1.5 }, { zoneMax: "6" },
      { saveAutoSuccess: {} }, { saveAutoSuccess: { types: "undead" } }, { saveAutoSuccess: { fighting: false } },
      { saveAutoSuccess: { sizeAtLeast: "colossal" } }, { willingFails: false },
      { triggers: [{ on: "enter", do: [{ type: "replay" }, { type: "status", status: "prone" }] }] },
      { triggers: [{ on: "enter", do: [{ type: "replay", activity: "x" }] }] },
      { triggers: [{ on: "enter", do: [{ type: "replay", times: 2 }] }] },
      { triggers: [{ on: [], do: [{ type: "replay" }] }] }
    ];
    for (const entry of bad) {
      expect(checkDraftKeys(entry, spell).length, JSON.stringify(entry)).toBeGreaterThan(0);
      expect(zoneProblemsOf(entry, { vocabulary }).length, JSON.stringify(entry)).toBeGreaterThan(0);
    }
  });

  it("own properties only: an inherited name is never a field, and a prototype key is refused", () => {
    expect(checkDraftKeys({ aura: { toString: true } }, spell).join("; ")).toMatch(/aura\.toString: unknown field/);
    expect(checkDraftKeys({ selfZone: { constructor: { type: "radius", size: 10, units: "ft" } } }, spell).length)
      .toBeGreaterThan(0);
    expect(checkDraftKeys(JSON.parse(`{ "emanation": { "on": "ownTurnEnd", "__proto__": { "x": 1 } } }`), spell).length)
      .toBeGreaterThan(0);
  });

  it("the engine's words are checked when the vocabulary is given (the validator gate)", () => {
    expect(zoneProblemsOf({ aura: { types: ["dragon"] } }, { vocabulary }).join("; ")).toMatch(/aura\.types\[0\]/);
    expect(zoneProblemsOf({ aura: { types: ["dragon"] } })).toEqual([]);
    expect(zoneProblemsOf({ saveAutoSuccess: { sizeAtLeast: "lg" } }, { vocabulary })).toEqual([]);
  });

  it("no zone key or replay touches nothing it should: the damage rolls are classified", () => {
    for (const k of NEW_KEYS) expect(Object.hasOwn(DAMAGE_ROLLS, k), k).toBe(true);
    expect(DAMAGE_ROLLS.emanation({ on: "ownTurnEnd" })).toBe("all");
    expect(DAMAGE_ROLLS.triggers(ZONE("turnEnd").triggers)).toBe("all");
    expect(DAMAGE_ROLLS.zoneMax(3)).toEqual([]);
  });
});

describe("what the zone keys imply", () => {
  it("a zone that repeats its save at the end of a creature's turn implies ONE assertion, with that moment", () => {
    expect(impliedAsserts(ZONE("turnEnd"))).toEqual([SUBJECT("turnEnd")]);
    expect(impliedAsserts({ triggers: [{ on: "turnEnd", do: [{ type: "replay", activity: ACT }] }] }))
      .toEqual([SUBJECT("turnEnd")]);
    expect(impliedAsserts(ZONE(["enter", "turnStart"]))).toEqual([SUBJECT("enter"), SUBJECT("turnStart")].sort());
    expect(unassertableKeys(ZONE("turnEnd"))).toEqual([]);
    // A replay on a moment that is not a zone moment has no word.
    expect(unassertableKeys(ZONE("endOfTurn"))).toEqual(["triggers"]);
  });

  it("an emanation: the bearer's turn end or start, or a creature's own turn start; enemies only is its own atom", () => {
    expect(impliedAsserts({ emanation: { on: "ownTurnEnd" } })).toEqual([SUBJECT("ownTurnEnd")]);
    expect(impliedAsserts({ emanation: { on: "turnStart", affects: "enemy", activity: ACT } }))
      .toEqual([canon({ given: { moment: "turnStart" }, expect: { affects: "enemies" } }), SUBJECT("turnStart")].sort());
    expect(unassertableKeys({ emanation: { on: "ownTurnStart", activity: ACT } })).toEqual([]);
    // A radius, a sight limit or a limit to an effect of the item has no word: a person reads it at review.
    for (const extra of [{ radius: 10, units: "ft" }, { sees: true }, { whileActive: true }]) {
      expect(unassertableKeys({ emanation: { on: "ownTurnEnd", ...extra } }), JSON.stringify(extra)).toEqual(["emanation"]);
    }
    expect(draftedForPerson({ entry: { emanation: { on: "ownTurnEnd", sees: true } } })).toBe("emanation");
  });

  it("who a zone affects, and an automatic success on the save by creature type", () => {
    expect(impliedAsserts({ zoneAffects: "enemy" })).toEqual([canon({ given: {}, expect: { affects: "enemies" } })]);
    expect(impliedAsserts({ zoneAffects: "ally" })).toEqual([canon({ given: {}, expect: { affects: "allies" } })]);
    const auto = (t) => canon({ given: { targetType: t }, expect: { roll: { mode: "autoSuccess", on: "save", for: "target" } } });
    expect(impliedAsserts({ saveAutoSuccess: { types: ["undead", "construct"] } })).toEqual([auto("construct"), auto("undead")]);
    expect(unassertableKeys({ saveAutoSuccess: { types: ["undead"] } })).toEqual([]);
    expect(unassertableKeys({ saveAutoSuccess: { types: ["undead"], fighting: true } })).toEqual(["saveAutoSuccess"]);
    expect(unassertableKeys({ saveAutoSuccess: { sizeAtLeast: "huge" } })).toEqual(["saveAutoSuccess"]);
  });

  it("the shaping keys imply nothing, each with why, and stamp the draft for a person", () => {
    for (const k of ["aura", "selfZone", "zoneLasts", "zoneMax", "zoneEffects", "willingFails"]) {
      expect(IMPLIES_NOTHING[k], k).toMatch(/^[\x20-\x7e]{10,160}$/);
      expect(IMPLIED_KEYS, k).not.toContain(k);
    }
    for (const k of ["emanation", "zoneAffects", "saveAutoSuccess"]) expect(IMPLIED_KEYS, k).toContain(k);
    expect(draftedForPerson({ entry: { zoneMax: 6 } })).toBe("zoneMax");
  });
});

describe("the assertion words", () => {
  it("given.moment takes the aura moment words beside the engine's moments; expect.subjected and autoSuccess are closed", () => {
    expect(SUBJECTED).toEqual(["activity"]);
    expect(EXPECT_FIELDS).toContain("subjected");
    expect(ROLL_MODES).toEqual(["advantage", "disadvantage", "autoSuccess"]);
    const ok = (a) => expect(assertProblems([a], { vocabulary }), JSON.stringify(a)).toEqual([]);
    const no = (a) => expect(assertProblems([a], { vocabulary }).length, JSON.stringify(a)).toBeGreaterThan(0);
    for (const moment of [...AURA_MOMENTS, ...ZONE_MOMENTS]) ok({ given: { moment }, expect: { subjected: "activity" } });
    no({ given: { moment: "ownTurnMiddle" }, expect: { subjected: "activity" } });
    no({ given: { moment: "turnEnd" }, expect: { subjected: "save" } });
    no({ given: { moment: "turnEnd" }, expect: { subjected: true } });
    ok({ given: { targetType: "undead" }, expect: { roll: { mode: "autoSuccess", on: "save", for: "target" } } });
    // The aura words are moments of a `given` only: an effect does not end on them.
    no({ given: {}, expect: { ends: "ownTurnEnd" } });
    // `subjected` needs a zone or aura moment and no roll (a creature is subjected whatever its roll). A zone moment beside a
    // roll stays allowed: stored rereads and reviews hold it (the briefs ask for the roll alone, below).
    ok({ given: { moment: "turnEnd", roll: "failedSave" }, expect: { condition: { applied: "poisoned" } } });
    no({ given: { moment: "ownTurnEnd", roll: "failedSave" }, expect: { subjected: "activity" } });
    no({ given: {}, expect: { subjected: "activity" } });
    no({ given: { moment: "failedSave" }, expect: { subjected: "activity" } });
    ok({ given: { moment: "endOfTurn", roll: "failedSave" }, expect: { condition: { applied: "poisoned" } } });
    expect(assertProblems([{ given: { moment: "ownTurnEnd" }, expect: { subjected: "activity" } }])).toEqual([]);
  });

  it("each new word has a definition with its source, in both vocabulary files", () => {
    expect(Object.keys(DEFINITIONS.auraMoment).sort()).toEqual(["ownTurnEnd", "ownTurnStart"]);
    expect(Object.keys(DEFINITIONS.subjected)).toEqual(["activity"]);
    expect(DEFINITIONS.rollMode.autoSuccess.from).toBe("engine core/action.mjs");
    expect(DEFINITIONS.auraMoment.ownTurnEnd.from).toBe("engine core/emanation.mjs");
    expect(undefinedWords({})).toEqual([]);
    const core = { moments: vocabulary.moments, statuses: ["prone"], creatureTypes: ["undead"], moveModes: ["push"],
      effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"], sizes: vocabulary.sizes, stepTypes: [], facts: [], abilities: [] };
    for (const v of [draftVocabulary(core), reviewVocabulary(core), rereadVocabulary(core)]) {
      expect(v.definitions.auraMoment.ownTurnStart.means).toMatch(/bearer/);
      expect(v.definitions.subjected.activity.means).toMatch(/activity/);
      expect(v.assert.shapes.expect.subjected).toEqual({ type: "enum", values: ["activity"] });
      expect(JSON.stringify(v.assert.shapes.given.moment)).toContain("ownTurnEnd");
      expect(v.assert.rollModes).toContain("autoSuccess");
    }
    const d = draftVocabulary(core);
    for (const k of NEW_KEYS) expect(d.draftShapes[k], k).toBeTruthy();
    expect(Object.keys(d.zones.keys).sort()).toEqual([...NEW_KEYS].sort());
    expect(d.zones).toMatchObject({ zoneMoments: ZONE_MOMENTS, emanationOn: EMANATION_ON, auraMoments: AURA_MOMENTS });
    expect(Object.keys(d.zones.excluded).sort()).toEqual(Object.keys(EXCLUDED_ZONE).sort());
    // A reviewer writes no entry: no drafter key, no zone table.
    expect(reviewVocabulary(core)).not.toHaveProperty("zones");
    expect(rereadVocabulary(core)).not.toHaveProperty("zones");
  });
});

describe("review compares the zone moment as identity", () => {
  const rule = (entry, assert = []) => ({ entry, assert, origins: ["official"] });
  it("agrees when the review says the same moment, and disagrees both ways otherwise", () => {
    const zone = rule(ZONE("turnEnd"));
    expect(compareAsserts(zone, [{ given: { moment: "turnEnd" }, expect: { subjected: "activity" } }]).agrees).toBe(true);
    // The review reads the start of the turn: one assertion on each side alone.
    const start = compareAsserts(zone, [{ given: { moment: "turnStart" }, expect: { subjected: "activity" } }]);
    expect(start).toMatchObject({ agrees: false, onlyDraft: [SUBJECT("turnEnd")], onlyReview: [SUBJECT("turnStart")] });
    // The review also says the creature is subjected when it enters: the draft does not.
    const more = compareAsserts(zone, [{ given: { moment: "turnEnd" }, expect: { subjected: "activity" } },
      { given: { moment: "enter" }, expect: { subjected: "activity" } }]);
    expect(more).toMatchObject({ agrees: false, onlyDraft: [], onlyReview: [SUBJECT("enter")] });
    // The draft's zone enters and ends turns; the review only says the end of the turn.
    const fewer = compareAsserts(rule(ZONE(["enter", "turnEnd"])), [{ given: { moment: "turnEnd" },
      expect: { subjected: "activity" } }]);
    expect(fewer).toMatchObject({ agrees: false, onlyDraft: [SUBJECT("enter")], onlyReview: [] });
  });

  it("an aura acting at the bearer's turn end is not a creature ending its own turn inside a zone", () => {
    const aura = rule({ emanation: { on: "ownTurnEnd" } });
    expect(compareAsserts(aura, [{ given: { moment: "ownTurnEnd" }, expect: { subjected: "activity" } }]).agrees).toBe(true);
    expect(compareAsserts(aura, [{ given: { moment: "turnEnd" }, expect: { subjected: "activity" } }]).agrees).toBe(false);
    // What the activity then does on a failed save is said by both, with the roll alone (as for any use of the item).
    const poisoned = { given: { roll: "failedSave" }, expect: { condition: { applied: "poisoned" } } };
    const both = rule({ emanation: { on: "ownTurnEnd" } }, [poisoned]);
    expect(compareAsserts(both, [{ given: { moment: "ownTurnEnd" }, expect: { subjected: "activity" } }, poisoned]).agrees)
      .toBe(true);
    expect(compareAsserts(both, [{ given: { moment: "ownTurnEnd" }, expect: { subjected: "activity" } }]).agrees).toBe(false);
  });

  it("an automatic success: the same creature type agrees, another one disagrees", () => {
    const auto = rule({ saveAutoSuccess: { types: ["construct"] } });
    const said = (t) => [{ given: { targetType: t }, expect: { roll: { mode: "autoSuccess", on: "save", for: "target" } } }];
    expect(compareAsserts(auto, said("construct")).agrees).toBe(true);
    expect(compareAsserts(auto, said("undead")).agrees).toBe(false);
    expect(compareAsserts(auto, [{ given: { targetType: "construct" }, expect: { roll: { mode: "advantage", on: "save",
      for: "target" } } }]).agrees).toBe(false);
  });
});

describe("scenarios: a zone or aura moment is a person's to play", () => {
  const record = (entry) => ({
    key: "tst:spell:cinder-haze", book: "TST", kind: "spell", identifier: "cinder-haze",
    items: [{ origin: "official", match: "matched", docId: "Cd10Cd21Cd32Cd43", activities: [ACT], effects: [] }],
    rule: { handledIn: "table", adds: "x", entry, origins: ["official"], assert: [] },
    evidence: {}
  });
  const packOf = () => "tst.spells";
  it("names the moment and the subjected creature the runner cannot stage", () => {
    const s = scenarioOf(record(ZONE("turnEnd")), { packOf });
    expect(s.manual).toBe(true);
    expect(s.manualBecause).toEqual(["advance", "expect.subjected", "given.moment.turnEnd"]);
    const aura = scenarioOf(record({ emanation: { on: "ownTurnStart", activity: ACT } }), { packOf });
    expect(aura.manualBecause).toEqual(["advance", "expect.subjected", "given.moment.ownTurnStart"]);
    // A moment that is no zone's keeps its old name.
    const later = record({}); later.rule.assert = [{ given: { moment: "endOfTurn" }, expect: { condition: { ended: "prone" } } }];
    expect(scenarioOf(later, { packOf }).manualBecause).toEqual(["advance", "given.moment"]);
  });
  it("an automatic success is not staged either (no roll to watch)", () => {
    const s = scenarioOf(record({ saveAutoSuccess: { types: ["construct"] } }), { packOf });
    expect(s.manual).toBe(true);
    expect(s.manualBecause).toContain("expect.roll");
  });
});

describe("shapeProblems: a value against a declarative shape", () => {
  it("own keys only, required and optional, bounded numbers, ids, closed words", () => {
    const shape = resolveShape(DRAFT_SHAPES.selfZone, vocabulary);
    expect(shapeProblems({ [ACT]: { type: "cube", size: 15, units: "ft" } }, shape, { at: "selfZone" })).toEqual([]);
    expect(shapeProblems({ [ACT]: { type: "cube", size: 15, units: "ft" }, [ACT2]: { type: "radius", size: 300, units: "ft" } },
      shape, { at: "selfZone" })).toEqual([]);
    expect(shapeProblems({ [ACT]: { type: "cube", size: 301, units: "ft" } }, shape, { at: "selfZone" }).join("; "))
      .toMatch(/selfZone\.Zn10Zn21Zn32Zn43\.size/);
    expect(shapeProblems(Object.create({ inherited: 1 }), resolveShape(DRAFT_SHAPES.aura, vocabulary), { at: "aura" }))
      .toEqual([]);
  });
});

const CORE = process.env.DAS_CORE;
describe.skipIf(!CORE)("against the DAS_CORE clone", () => {
  it("each admitted key is an entry key of the engine; its lists and fields are the ones this pack assumes", async () => {
    const core = await loadCore(CORE);
    for (const k of NEW_KEYS) expect(core.entryKeys.has(k), k).toBe(true);
    // core/triggers.mjs MOMENTS holds the zone moments; the aura words are emanation moments and no trigger moment.
    for (const m of ZONE_MOMENTS) expect(core.moments, m).toContain(m);
    for (const m of AURA_MOMENTS) { expect(core.moments, m).not.toContain(m); expect(core.emanationMoments, m).toContain(m); }
    // core/emanation.mjs EMANATION_MOMENTS: the drafter's, and the one left out with why.
    const excludedValues = (field) => Object.keys(EXCLUDED_ZONE).filter((x) => x.startsWith(`${field}.`))
      .map((x) => x.slice(field.length + 1));
    expect([...core.emanationMoments].sort()).toEqual([...EMANATION_ON, ...excludedValues("emanation.on")].sort());
    // core/content/enums.mjs AURA_AFFECTS: the drafter's, and the one left out.
    expect([...core.auraAffects].sort()).toEqual([...AURA_AFFECTS, ...excludedValues("aura.affects")].sort());
    // The fields each validator accepts (read from the engine's own lists): in the drafter's shape, or excluded with why.
    const { zoneFields } = core;
    expect(zoneFields).not.toBeNull();
    const shapeFields = (shape) => [...new Set(shape.of.flatMap((o) => [...Object.keys(o.keys), ...Object.keys(o.optional)]))];
    const excludedFields = (k) => Object.keys(EXCLUDED_ZONE).filter((x) => x.startsWith(`${k}.`) && x.split(".").length === 2)
      .map((x) => x.split(".")[1]);
    for (const k of ["aura", "emanation"]) {
      expect([...zoneFields[k]].sort(), k).toEqual([...shapeFields(DRAFT_SHAPES[k]), ...excludedFields(k)].sort());
    }
    const auto = DRAFT_SHAPES.saveAutoSuccess;
    expect([...zoneFields.saveAutoSuccess].sort()).toEqual([...Object.keys(auto.keys), ...Object.keys(auto.optional)].sort());
    expect([...zoneFields.templateTypes].sort()).toEqual([...TEMPLATE_TYPES].sort());
    expect(zoneFields.zoneAffects).toEqual(ZONE_AFFECTS);
    expect(zoneFields.emanationAffects).toEqual(EMANATION_AFFECTS);
  });

  it("the engine's validator accepts every zone value and replay built from the shapes, and refuses others", async () => {
    const core = await loadCore(CORE);
    const shapes = draftVocabulary(core).draftShapes;
    const facts = Object.fromEntries(core.facts.map((name) => [name, true]));
    let n = 0;
    for (const k of [...NEW_KEYS, "triggers"]) {
      for (const value of variants(shapes[k])) {
        n++;
        expect(core.validateEntry({ [k]: value }, { facts }), `${k} ${JSON.stringify(value)}`).toEqual([]);
        expect(checkDraftKeys({ [k]: value }, spell), `${k} ${JSON.stringify(value)}`).toEqual([]);
        expect(zoneProblemsOf({ [k]: value }, { vocabulary: core }), `${k} ${JSON.stringify(value)}`).toEqual([]);
      }
    }
    expect(n).toBeGreaterThan(40);
    // What this pack assumes the engine refuses (a rename or a wider list upstream fails here).
    for (const entry of [{ zoneAffects: "any" }, { emanation: { on: "turnEnd" } }, { emanation: { on: "ownTurnEnd", radius: 10 } },
      { selfZone: { [ACT]: { type: "line", size: 10, units: "ft" } } }, { saveAutoSuccess: {} }, { zoneLasts: { seconds: 0 } },
      { zoneMax: 0 }, { willingFails: false }, { zoneEffects: false }, { aura: { affects: "friends" } },
      { triggers: [{ on: "enter", do: [{ type: "replay", activity: "x" }] }] }]) {
      expect(core.validateEntry(entry, { facts }).length, JSON.stringify(entry)).toBeGreaterThan(0);
    }
  });

  it("the engine's own zone and aura entries: their replays and emanations imply the same words a draft's do", async () => {
    const core = await loadCore(CORE);
    const shipped = Object.entries(core.shipped);
    const ons = (d) => (Array.isArray(d.on) ? d.on : [d.on]);
    const zones = shipped.filter(([, e]) => Array.isArray(e?.triggers) && e.triggers.some((d) => ons(d)
      .some((m) => ZONE_MOMENTS.includes(m)) && (Array.isArray(d.do) ? d.do : [d.do]).some((s) => s?.type === "replay")));
    expect(zones.length).toBeGreaterThan(5);
    // A replay under a condition of a fact no given word says (`target.allied`) implies nothing: only the plain ones.
    let plain = 0;
    for (const [id, e] of zones) {
      const own = e.triggers.filter((d) => !Object.hasOwn(d, "if") && (Array.isArray(d.do) ? d.do : [d.do])
        .some((st) => st?.type === "replay"));
      if (!own.length) continue;
      plain++;
      for (const d of own) {
        for (const m of (Array.isArray(d.on) ? d.on : [d.on]).filter((x) => ZONE_MOMENTS.includes(x))) {
          expect(impliedAsserts({ triggers: [d] }), id).toContain(SUBJECT(m));
        }
      }
    }
    expect(plain).toBeGreaterThan(5);
    const auras = shipped.filter(([, e]) => e?.emanation && EMANATION_ON.includes(e.emanation.on));
    expect(auras.length).toBeGreaterThan(5);
    for (const [id, e] of auras) expect(impliedAsserts({ emanation: e.emanation }), id).toContain(SUBJECT(e.emanation.on));
  });
});
