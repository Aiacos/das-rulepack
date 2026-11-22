import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DRAFT_KEYS, SLOTS, checkDraftKeys } from "../../tools/pipeline/draft-keys.mjs";
import { checkIds } from "../../tools/pipeline/gates.mjs";
import { loadCore } from "../../tools/pipeline/core.mjs";

// Synthetic fixtures only: invented ids. What a drafter may write (Ruling R6) and the slot its ids sit in (Ruling R4).
const A_OFF = "Ao00Ao11Ao22Ao33";
const A_DDB = "Ad00Ad11Ad22Ad33";
const E_OFF = "Eo00Eo11Eo22Eo33";
const E_DDB = "Ed00Ed11Ed22Ed33";

describe("DRAFT_KEYS and checkDraftKeys", () => {
  it("every key has a slot of the closed list", () => {
    expect(SLOTS).toEqual(["activityMap", "effectMap", "single", "none"]);
    for (const [key, { slot }] of Object.entries(DRAFT_KEYS)) expect(SLOTS, key).toContain(slot);
    expect(DRAFT_KEYS.onHit.slot).toBe("single");
    expect(Object.isFrozen(DRAFT_KEYS)).toBe(true);
  });

  it("checkDraftKeys refuses gmAlert and globe", () => {
    const spell = { origins: ["official"], kind: "spell" };
    expect(checkDraftKeys({ saveDamage: { [A_OFF]: "half" } }, spell)).toEqual([]);
    const problems = checkDraftKeys({ gmAlert: "read the text", globe: { radius: 10 }, saveDamage: { [A_OFF]: "half" } }, spell);
    expect(problems).toHaveLength(2);
    expect(problems.join("; ")).toMatch(/gmAlert: not a drafter key/);
    expect(problems.join("; ")).toMatch(/globe: not a drafter key/);
    expect(checkDraftKeys(null, spell)).toEqual(["entry: must be an object"]);
  });

  it("dataFixes: official origin only, from on every fix, never on a monster feature", () => {
    const fix = { path: `system.activities.${A_OFF}.damage.onSave`, value: "half", from: "none" };
    expect(checkDraftKeys({ dataFixes: [fix] }, { origins: ["official"], kind: "spell" })).toEqual([]);
    const { from, ...bare } = fix;
    expect(checkDraftKeys({ dataFixes: [bare] }, { origins: ["official"], kind: "spell" }).join("; "))
      .toMatch(/dataFixes\[0\]: from is required/);
    expect(checkDraftKeys({ dataFixes: [fix] }, { origins: ["official", "ddb-importer"], kind: "spell" }).join("; "))
      .toMatch(/dataFixes: official origin only/);
    expect(checkDraftKeys({ dataFixes: [fix] }, { origins: ["official"], kind: "monster" }).join("; "))
      .toMatch(/dataFixes: never on a monster feature/);
  });
});

// Ruling R4: a key whose slot holds one id names one origin only; the other origins go in rule.uncovered.
describe("ids gate: a single-slot key names one origin", () => {
  const item = (origin, activities, effects = []) => ({
    origin, match: "matched", identifier: "glimmer-bolt", docId: origin === "official" ? "Of00Of11Of22Of33" : "Db00Db11Db22Db33",
    activities, effects, data: { sha256: "0".repeat(64) }
  });
  const rec = (entry, origins, uncovered) => ({
    key: "tst:spell:glimmer-bolt", name: "Glimmer Bolt", kind: "spell", book: "TST", page: 3, edition: "2024", text: null,
    identifier: "glimmer-bolt", verdict: "entry", evidence: {},
    items: [item("official", [A_OFF], [E_OFF]), item("ddb-importer", [A_DDB], [E_DDB])],
    rule: { handledIn: "table", adds: "x", entry, origins, ...(uncovered ? { uncovered } : {}) }
  });
  const core = { vocabulary: new Set(), identifiers: new Set() };
  const both = ["official", "ddb-importer"];

  it("onHit with ids of two origins fails; with one origin and the other uncovered it passes", () => {
    const entry = { onHit: { save: A_OFF }, saveDamage: { [A_OFF]: "half", [A_DDB]: "half" } };
    expect(checkIds(rec(entry, both), { core }).failures)
      .toContain("ids: onHit holds one id: it may name one origin only (the others go in rule.uncovered)");
    const one = rec({ onHit: { save: A_OFF } }, ["official"], [{ origin: "ddb-importer", because: "single slot" }]);
    expect(checkIds(one, { core }).failures).toEqual([]);
  });

  it("map slots carry the ids of two origins side by side; a single-slot key without ids does not restrict", () => {
    const entry = { effectEnds: { [E_OFF]: "bearerTurnEnd", [E_DDB]: "bearerTurnEnd" }, noDamage: [A_OFF, A_DDB],
      triggers: [{ on: "failedSave", do: [{ type: "status", status: "prone" }] }] };
    expect(checkIds(rec(entry, both), { core }).failures).toEqual([]);
  });

  it("a legacy record with standing is not held to it", async () => {
    const { legacyFingerprint } = await import("../../tools/pipeline/registry.mjs");
    const r = { ...rec({ onHit: { save: A_OFF }, saveDamage: { [A_DDB]: "half" } }, both), legacy: true,
      legacyStatus: "validated" };
    const legacy = new Map([[r.key, legacyFingerprint(r)]]);
    expect(checkIds(r, { core, legacy }).failures).toEqual([]);
  });
});

// The engine is the authority: a key it drops or renames, or a slot its validator does not accept, fails the suite.
const CORE_DIR = process.env.DAS_CORE;
describe.skipIf(!CORE_DIR)("DRAFT_KEYS against the engine (DAS_CORE)", () => {
  // One entry per key, its ids where the slot says they sit: a map/list slot with the ids of two origins side by side.
  const samples = {
    triggers: { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: E_OFF, do: [{ type: "resave" }] }] },
    saveDamage: { saveDamage: { [A_OFF]: "half", [A_DDB]: "none" } },
    halfOnMiss: { halfOnMiss: true },
    noDamage: { noDamage: [A_OFF, A_DDB] },
    effectEnds: { effectEnds: { [E_OFF]: "bearerTurnEnd", [E_DDB]: "casterTurnStart" } },
    endsWhen: { endsWhen: { zeroHp: true } },
    actionEnds: { actionEnds: { [E_OFF]: { by: "bearer" }, [E_DDB]: { by: "bearer" } } },
    breaksOn: { breaksOn: ["attack"] },
    noReactions: { noReactions: [E_OFF, E_DDB] },
    actionOrBonus: { actionOrBonus: [E_OFF, E_DDB] },
    noOpportunity: { noOpportunity: "always" },
    noOpportunityAttacks: { noOpportunityAttacks: [E_OFF, E_DDB] },
    saveAdvantage: { saveAdvantage: ["frightened"] },
    saveDisadvantageFor: { saveDisadvantageFor: ["undead"] },
    rollBonus: { rollBonus: { activity: A_OFF, on: ["save"] } },
    rollDisadvantage: { rollDisadvantage: { on: ["check"] } },
    effectStatuses: { effectStatuses: { [E_OFF]: ["prone"], [E_DDB]: ["prone"] } },
    effectDurations: { effectDurations: { [E_OFF]: { seconds: 6 }, [E_DDB]: { seconds: 6 } } },
    savedEffects: { savedEffects: [E_OFF, E_DDB] },
    atTurnStart: { atTurnStart: { activity: A_OFF } },
    usageLimits: { usageLimits: { [A_OFF]: { oncePerTurn: true }, [A_DDB]: { oncePerTurn: true } } },
    ignoresResistance: { ignoresResistance: { types: ["fire"], from: [A_OFF, A_DDB] } },
    grantsResistances: { grantsResistances: ["fire"] },
    grantsConditionImmunities: { grantsConditionImmunities: ["charmed"] },
    difficultTerrain: { difficultTerrain: { cost: 2 } },
    targets: { targets: { types: ["humanoid"] } },
    onHit: { onHit: { save: A_OFF } },
    dataFixes: { dataFixes: [{ path: `system.activities.${A_OFF}.damage.onSave`, value: "half", from: "none" }] },
    // Ruling R33: zones and auras.
    emanation: { emanation: { on: "ownTurnEnd", activity: A_OFF } },
    aura: { aura: { effect: E_OFF } },
    zoneAffects: { zoneAffects: "enemy" },
    zoneEffects: { zoneEffects: true },
    selfZone: { selfZone: { [A_OFF]: { type: "radius", size: 10, units: "ft" },
      [A_DDB]: { type: "radius", size: 10, units: "ft" } } },
    zoneLasts: { zoneLasts: { seconds: 600 } },
    zoneMax: { zoneMax: 6 },
    saveAutoSuccess: { saveAutoSuccess: { types: ["construct"] } },
    willingFails: { willingFails: true }
  };

  it("every drafter key is an entry key of the engine", async () => {
    const core = await loadCore(CORE_DIR);
    expect(Object.keys(DRAFT_KEYS).filter((k) => !core.entryKeys.has(k))).toEqual([]);
  });

  it("the engine's validator accepts each key with its ids at the slot DRAFT_KEYS names", async () => {
    const file = join(CORE_DIR, "module", "scripts", "core", "content.mjs");
    expect(existsSync(file)).toBe(true);
    const { validateEntry } = await import(pathToFileURL(file).href);
    expect(Object.keys(samples).sort()).toEqual(Object.keys(DRAFT_KEYS).sort());
    const ids = new Set([A_OFF, A_DDB, E_OFF, E_DDB]);
    const holds = (v) => (typeof v === "string" ? (ids.has(v) || [...ids].some((id) => v.includes(id)) ? 1 : 0)
      : Array.isArray(v) ? v.reduce((n, x) => n + holds(x), 0)
        : v && typeof v === "object" ? Object.entries(v).reduce((n, [k, x]) => n + (ids.has(k) ? 1 : 0) + holds(x), 0) : 0);
    for (const [key, entry] of Object.entries(samples)) {
      expect(validateEntry(entry, { facts: {} }), key).toEqual([]);
      const { slot } = DRAFT_KEYS[key];
      const count = holds(entry[key]);
      if (slot === "activityMap" || slot === "effectMap") expect(count, key).toBe(2);
      else if (slot === "single") expect(count, key).toBe(1);
      else expect(count, key).toBe(0);
    }
  });

  it("loadCore gives the enumerations rule assertions are checked against", async () => {
    const core = await loadCore(CORE_DIR);
    expect(core.moments).toContain("failedSave");
    expect(core.statuses).toContain("prone");
    expect(core.creatureTypes).toContain("undead");
    expect(core.moveModes).toContain("push");
    expect(core.effectEnds).toContain("bearerTurnEnd");
    expect(core.damageTypes).toContain("fire");
  });
});
