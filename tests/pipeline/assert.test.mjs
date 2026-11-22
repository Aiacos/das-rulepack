import { describe, it, expect } from "vitest";
import { assertProblems, impliedAsserts, normaliseAssert, FREE_MAX } from "../../tools/pipeline/assert.mjs";
import { validateRecord } from "../../tools/pipeline/schema.mjs";
import { runGates } from "../../tools/pipeline/gates.mjs";

// Synthetic fixtures only: rule assertions (`rule.assert`), their canonical forms, and what an entry implies.
const ACT = "Ac00Ac11Ac22Ac33";
const ASSERT = [{ given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } }];

const ruled = (rule, extra = {}) => ({
  key: "tst:spell:x", identifier: "x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024", text: null,
  items: [], verdict: "entry", evidence: {},
  rule: { handledIn: "table", adds: "x", entry: { saveDamage: { [ACT]: "half" } }, origins: ["official"], ...rule }, ...extra
});

describe("rule.assert in the schema", () => {
  it("assert must be a non-empty array for a non-legacy rule", () => {
    expect(validateRecord(ruled({ assert: ASSERT }))).toEqual([]);
    expect(validateRecord(ruled({})).join("; ")).toMatch(/rule\.assert: required/);
    expect(validateRecord(ruled({ assert: [] })).join("; ")).toMatch(/rule\.assert: required/);
    expect(validateRecord(ruled({ assert: { given: {} } })).join("; ")).toMatch(/rule\.assert: must be an array/);
    // A legacy rule predates assertions: none is required, and one it has is checked all the same.
    expect(validateRecord(ruled({}, { legacy: true, legacyStatus: "validated" }))).toEqual([]);
    expect(validateRecord(ruled({ assert: [{ given: {}, expect: {} }] }, { legacy: true, legacyStatus: "validated" }))
      .join("; ")).toMatch(/expect: at least one/);
  });

  it("unknown given or expect field rejected", () => {
    const bad = (a) => assertProblems([a]).join("; ");
    expect(bad({ given: { weather: "rain" }, expect: { damage: { fraction: 1 } } })).toMatch(/given\.weather: unknown field/);
    expect(bad({ given: {}, expect: { healing: 3 } })).toMatch(/expect\.healing: unknown field/);
    expect(bad({ given: {}, expect: { damage: { fraction: 1 } }, note: "x" })).toMatch(/must be \{ given, expect \}/);
    expect(bad({ given: { roll: "fumble" }, expect: { damage: { fraction: 1 } } })).toMatch(/given\.roll/);
    expect(bad({ given: {}, expect: { damage: { fraction: 0.25 } } })).toMatch(/expect\.damage\.fraction/);
    expect(bad({ given: {}, expect: { roll: { mode: "advantage", on: "attack" } } })).toMatch(/expect\.roll/);
    expect(bad({ given: {}, expect: { uses: { spent: 0 } } })).toMatch(/expect\.uses/);
    expect(bad({ given: {}, expect: { affects: "everyone" } })).toMatch(/expect\.affects/);
    expect(bad({ given: { origin: "elsewhere" }, expect: { affects: "self" } })).toMatch(/given\.origin/);
  });

  it("enumerations come from the engine when it is given: moments, statuses, creature types, move modes", () => {
    const vocabulary = { moments: ["failedSave", "startOfTurn"], statuses: ["prone"], creatureTypes: ["undead"],
      moveModes: ["push"], effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"] };
    const ok = [{ given: { roll: "failedSave", moment: "startOfTurn", targetType: "undead", origin: "official" },
      expect: { condition: { applied: "prone" }, move: { mode: "push", distance: 10 }, ends: "bearerTurnEnd",
        damage: { fraction: 1, type: "fire" } } }];
    expect(assertProblems(ok, { vocabulary })).toEqual([]);
    const off = [{ given: { moment: "teatime", targetType: "robot" },
      expect: { condition: { ended: "sleepy" }, move: { mode: "yeet", distance: 5 }, ends: "never", damage: { fraction: 1,
        type: "sound" } } }];
    const text = assertProblems(off, { vocabulary }).join("; ");
    for (const f of ["given.moment", "given.targetType", "expect.condition.ended", "expect.move.mode", "expect.ends",
      "expect.damage.type"]) expect(text).toContain(f);
  });

  it("the validator gate checks the assertions against the engine's enumerations", () => {
    const core = { version: "1", facts: [], vocabulary: new Set(), identifiers: new Set(), validateEntry: () => [],
      moments: ["failedSave"], statuses: ["prone"], creatureTypes: [], moveModes: ["push"], effectEnds: [], damageTypes: [] };
    const record = ruled({ assert: [{ given: {}, expect: { condition: { applied: "sleepy" } } }] });
    const { failures } = runGates([record], { core, documents: {}, ci: true, legacy: new Map() });
    expect(failures[record.key].validator.join("; ")).toMatch(/validator: rule\.assert\[0\]\.expect\.condition\.applied/);
  });

  it("free text limited to 120 characters", () => {
    const free = (s) => assertProblems([{ given: { free: s }, expect: { free: "ok", affects: "target" } }]).join("; ");
    expect(free("x".repeat(FREE_MAX))).toBe("");
    expect(FREE_MAX).toBe(120);
    expect(free("x".repeat(FREE_MAX + 1))).toMatch(/given\.free: one line of at most 120 characters/);
    expect(free("two\nlines")).toMatch(/given\.free/);
    expect(free("")).toMatch(/given\.free/);
  });
});

describe("normaliseAssert and impliedAsserts", () => {
  it("normaliseAssert is order-independent", () => {
    const a = { given: { roll: "failedSave", targetType: "undead" }, expect: { condition: { applied: "prone" } } };
    const b = { expect: { damage: { type: "fire", fraction: 0.5 } }, given: { roll: "savedSave" } };
    const swapped = { expect: { condition: { applied: "prone" } }, given: { targetType: "undead", roll: "failedSave" } };
    expect(normaliseAssert([a, b])).toEqual(normaliseAssert([b, swapped]));
    expect(normaliseAssert([a, a, b])).toEqual(normaliseAssert([b, a]));
    expect(normaliseAssert([b])).toEqual(["expect.damage.fraction=0.5;expect.damage.type=fire;given.roll=savedSave"]);
    // A free assertion keeps its place in the set, its words do not: two free texts compare equal on the closed vocabulary.
    expect(normaliseAssert([{ given: { free: "one" }, expect: { free: "two" } }])).toEqual(["expect.free=*;given.free=*"]);
    expect(normaliseAssert(undefined)).toEqual([]);
  });

  it("impliedAsserts of saveDamage none", () => {
    expect(impliedAsserts({ saveDamage: { [ACT]: "none" } })).toEqual(["expect.damage.fraction=0;given.roll=savedSave"]);
    expect(impliedAsserts({ saveDamage: { [ACT]: "half" } })).toEqual(["expect.damage.fraction=0.5;given.roll=savedSave"]);
  });

  it("impliedAsserts of halfOnMiss, noDamage and triggers on every roll moment; none for the other keys", () => {
    expect(impliedAsserts({ halfOnMiss: true })).toEqual(["expect.damage.fraction=0.5;given.roll=miss"]);
    expect(impliedAsserts({ noDamage: [ACT] })).toEqual(["expect.damage.fraction=0"]);
    const triggers = [{ on: "failedSave", do: [{ type: "status", status: "prone" },
      { type: "move", mode: "push", distance: 10, units: "ft" }] }, { on: ["hit"], do: [{ type: "status", status: "blinded" }] }];
    // Fix round 1 (Ruling R24, L1): a step on hit is implied too, not only one on failedSave.
    expect(impliedAsserts({ triggers })).toEqual([
      "expect.condition.applied=blinded;given.roll=hit",
      "expect.condition.applied=prone;given.roll=failedSave",
      "expect.move.distance=10;expect.move.mode=push;given.roll=failedSave"
    ]);
    expect(impliedAsserts({ triggers: triggers[0] })).toHaveLength(2);
    // Fix round 1 of Ruling R25: noReactions and effectEnds say what they do (every situation, without the structure).
    expect(impliedAsserts({ noReactions: true, effectEnds: { [ACT]: "bearerTurnEnd" } }))
      .toEqual(["expect.denies=reactions", "expect.ends=bearerTurnEnd"]);
    expect(impliedAsserts({ effectDurations: { [ACT]: { seconds: 6 } }, grantsResistances: ["fire"] })).toEqual([]);
    expect(impliedAsserts(null)).toEqual([]);
  });
});
