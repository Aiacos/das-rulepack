// Ruling R37: `saveAutoFail: { types }`, a creature of one of those types fails the item's save without rolling. The key is
// newer than the engine's latest release: loadCore asks the engine itself whether it knows it (`core.saveAutoFail`), the
// drafter is offered it only then, draft ingest refuses it otherwise, a full gates run fails a rule that uses it on an engine
// without it and `gates --ci` does not (as Ruling R36). Synthetic fixtures only: invented ids, entries and words.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCore, saveAutoFailOf } from "../../tools/pipeline/core.mjs";
import {
  DAMAGE_ROLLS, DRAFT_KEYS, DRAFT_SHAPES, ENGINE_CAPABILITIES, KEY_UNKNOWN_TO_ENGINE, checkDraftKeys, draftKeysFor,
  zoneProblemsOf
} from "../../tools/pipeline/draft-keys.mjs";
import { ZONE_KEYS } from "../../tools/pipeline/zones.mjs";
import { IMPLIED_KEYS, ROLL_MODES, assertProblems, impliedAsserts, normaliseAssert, unassertableKeys } from
  "../../tools/pipeline/assert.mjs";
import { compareAsserts } from "../../tools/pipeline/review.mjs";
import { scenarioOf } from "../../tools/pipeline/scenarios.mjs";
import { DEFINITIONS } from "../../tools/pipeline/definitions.mjs";
import { draftVocabulary, reviewVocabulary } from "../../tools/pipeline/batch.mjs";
import { gateValidator, runGates } from "../../tools/pipeline/gates.mjs";
import { ingestDrafts } from "../../tools/pipeline/draft.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { stateOf } from "../../tools/pipeline/registry.mjs";
import { resolveShape } from "../../tools/pipeline/shapes.mjs";
import { variants } from "./fixtures/shapes.mjs";

const spell = { origins: ["official"], kind: "spell" };
const TYPES = ["construct", "plant", "undead"];
const canon = (a) => normaliseAssert([a])[0];
const atom = (mode, t) => ({ given: { targetType: t }, expect: { roll: { mode, on: "save", for: "target" } } });
// A stand-in engine: it knows `saveAutoFail` or not, and says "unknown key" for it when not (as an older validateEntry does).
const validateOf = (knows) => (entry) => (!knows && Object.hasOwn(entry, "saveAutoFail")
  ? ["saveAutoFail: unknown key (smite, triggers)"] : []);
const stubCore = (knows) => ({
  version: "9.9.9", facts: [], vocabulary: new Set(), identifiers: new Set(), validateEntry: validateOf(knows),
  moments: ["failedSave"], statuses: ["prone"], creatureTypes: TYPES, moveModes: ["push"], effectEnds: ["bearerTurnEnd"],
  damageTypes: ["fire"], sizes: ["med"], stepTypes: [], abilities: [], shipped: {}, saveAutoFail: knows
});

describe("the capability is read from the engine itself (loadCore, no version sniffing)", () => {
  const entryKeys = (has) => new Set(["triggers", ...(has ? ["saveAutoFail"] : [])]);
  const accepts = (entry) => (Object.keys(entry.saveAutoFail ?? {}).every((k) => k === "types") ? [] : ["no"]);
  it("is true only when the key is an entry key of the engine AND its validator accepts a probe of it", () => {
    expect(saveAutoFailOf({ entryKeys: entryKeys(true), validateEntry: accepts, creatureTypes: TYPES })).toBe(true);
    expect(saveAutoFailOf({ entryKeys: entryKeys(false), validateEntry: accepts, creatureTypes: TYPES })).toBe(false);
    expect(saveAutoFailOf({ entryKeys: entryKeys(true), validateEntry: () => ["unknown key"], creatureTypes: TYPES }))
      .toBe(false);
    expect(saveAutoFailOf({ entryKeys: entryKeys(true), validateEntry: () => { throw new Error("x"); },
      creatureTypes: TYPES })).toBe(false);
    expect(saveAutoFailOf({ entryKeys: entryKeys(true), validateEntry: accepts, creatureTypes: [] })).toBe(false);
    expect(saveAutoFailOf({})).toBe(false);
  });
});

describe("the drafter key", () => {
  it("is a drafter key without ids, a zone key with its meaning, implied, touching no damage roll", () => {
    expect(DRAFT_KEYS.saveAutoFail).toEqual({ slot: "none" });
    expect(ENGINE_CAPABILITIES).toEqual({ saveAutoFail: "saveAutoFail" });
    expect(ZONE_KEYS.saveAutoFail.means).toMatch(/fails/);
    expect(ZONE_KEYS.saveAutoFail.from).toBe("engine runtime/engine.mjs");
    expect(IMPLIED_KEYS).toContain("saveAutoFail");
    expect(DAMAGE_ROLLS.saveAutoFail({ types: ["plant"] })).toEqual([]);
  });

  it("its shape: a non-empty list of creature types, nothing else", () => {
    const shape = resolveShape(DRAFT_SHAPES.saveAutoFail, { creatureTypes: TYPES });
    const built = variants(shape);
    expect([...new Set(built.map((v) => JSON.stringify(v)))].sort())
      .toEqual(TYPES.map((t) => JSON.stringify({ types: [t] })));
    for (const value of built) expect(checkDraftKeys({ saveAutoFail: value }, spell)).toEqual([]);
    for (const value of [{}, { types: [] }, { types: "plant" }, { types: ["plant"], fighting: true },
      { types: ["plant"], sizeAtLeast: "huge" }, true, ["plant"]]) {
      expect(checkDraftKeys({ saveAutoFail: value }, spell).length, JSON.stringify(value)).toBeGreaterThan(0);
    }
    expect(zoneProblemsOf({ saveAutoFail: { types: ["dragonish"] } }, { vocabulary: { creatureTypes: TYPES } }).join(";"))
      .toMatch(/saveAutoFail\.types\[0\]/);
  });

  it("checkDraftKeys refuses it, with a clear reason, for an engine that does not know it; never without a core", () => {
    const entry = { saveAutoFail: { types: ["plant"] } };
    expect(checkDraftKeys(entry, { ...spell, core: stubCore(false) })).toEqual([`saveAutoFail: ${KEY_UNKNOWN_TO_ENGINE}`]);
    expect(checkDraftKeys(entry, { ...spell, core: stubCore(true) })).toEqual([]);
    expect(checkDraftKeys(entry, spell)).toEqual([]);
    expect(KEY_UNKNOWN_TO_ENGINE).toMatch(/DAS · Core in use does not know this key/);
    expect(Object.keys(draftKeysFor(stubCore(false)))).not.toContain("saveAutoFail");
    expect(Object.keys(draftKeysFor(stubCore(true)))).toContain("saveAutoFail");
    expect(Object.keys(draftKeysFor(stubCore(false))).length).toBe(Object.keys(DRAFT_KEYS).length - 1);
  });

  it("is offered in the drafter's vocabulary only by an engine that knows it", () => {
    const has = draftVocabulary(stubCore(true));
    expect(has.draftKeys.saveAutoFail).toEqual({ slot: "none" });
    expect(has.draftShapes.saveAutoFail).toEqual({ type: "object", keys: { types: { type: "list",
      item: { type: "enum", values: TYPES } } }, optional: {} });
    expect(has.zones.keys.saveAutoFail.from).toBe("engine runtime/engine.mjs");
    const not = draftVocabulary(stubCore(false));
    expect(not.draftKeys).not.toHaveProperty("saveAutoFail");
    expect(not.draftShapes).not.toHaveProperty("saveAutoFail");
    expect(not.zones.keys).not.toHaveProperty("saveAutoFail");
    expect(not.draftKeys).toHaveProperty("saveAutoSuccess");
  });
});

describe("the assertion vocabulary: roll mode autoFail", () => {
  it("is a closed word beside autoSuccess, with a definition, in both vocabularies", () => {
    expect(ROLL_MODES).toEqual(["advantage", "disadvantage", "autoSuccess", "autoFail"]);
    expect(DEFINITIONS.rollMode.autoFail.means).toMatch(/fails automatically/);
    expect(DEFINITIONS.rollMode.autoFail.from).toBe("engine core/conditions.mjs");
    expect(assertProblems([atom("autoFail", "plant")], { vocabulary: { creatureTypes: TYPES } })).toEqual([]);
    for (const v of [draftVocabulary(stubCore(false)), reviewVocabulary(stubCore(false))]) {
      expect(v.assert.rollModes).toContain("autoFail");
      expect(v.definitions.rollMode.autoFail.means).toMatch(/fails/);
    }
  });

  it("impliedAsserts derives one autoFail save per creature type, with given.targetType; all of it is said", () => {
    expect(impliedAsserts({ saveAutoFail: { types: ["undead", "plant"] } }))
      .toEqual([canon(atom("autoFail", "plant")), canon(atom("autoFail", "undead"))]);
    expect(unassertableKeys({ saveAutoFail: { types: ["plant"] } })).toEqual([]);
    expect(unassertableKeys({ saveAutoFail: { types: ["plant"], extra: true } })).toEqual(["saveAutoFail"]);
    expect(impliedAsserts({ saveAutoFail: "plant" })).toEqual([]);
  });

  it("compareAsserts: the same type agrees; another type, or a success read for a failure, disagrees, both ways", () => {
    const rule = (entry) => ({ entry, assert: [], origins: ["official"] });
    const fails = rule({ saveAutoFail: { types: ["plant"] } });
    const succeeds = rule({ saveAutoSuccess: { types: ["plant"] } });
    expect(compareAsserts(fails, [atom("autoFail", "plant")]).agrees).toBe(true);
    expect(compareAsserts(fails, [atom("autoFail", "undead")]).agrees).toBe(false);
    expect(compareAsserts(fails, [atom("autoSuccess", "plant")])).toMatchObject({ agrees: false,
      onlyDraft: [canon(atom("autoFail", "plant"))], onlyReview: [canon(atom("autoSuccess", "plant"))] });
    expect(compareAsserts(succeeds, [atom("autoFail", "plant")])).toMatchObject({ agrees: false,
      onlyDraft: [canon(atom("autoSuccess", "plant"))], onlyReview: [canon(atom("autoFail", "plant"))] });
    expect(compareAsserts(fails, [])).toMatchObject({ agrees: false, onlyDraft: [canon(atom("autoFail", "plant"))] });
  });

  it("a scenario does not stage it (no roll to watch), as an automatic success", () => {
    const rec = (entry) => ({ key: "tst:spell:w", book: "TST", kind: "spell", identifier: "w", evidence: {},
      items: [{ origin: "official", match: "matched", docId: "Cd10Cd21Cd32Cd43", activities: ["Zn10Zn21Zn32Zn43"],
        effects: [] }], rule: { handledIn: "table", adds: "x", entry, origins: ["official"], assert: [] } });
    const s = scenarioOf(rec({ saveAutoFail: { types: ["plant"] } }), { packOf: () => "tst.spells" });
    expect(s).toMatchObject({ manual: true, manualBecause: ["expect.roll"] });
  });
});

const record = (entry) => ({
  key: "tst:spell:wilting-hush", name: "Wilting Hush", kind: "spell", book: "TST", page: 4, edition: "2024",
  identifier: "wilting-hush", verdict: "entry", why: "a plant fails", text: null, evidence: {},
  items: [{ origin: "official", match: "matched", identifier: "wilting-hush", docId: "Wh00Wh11Wh22Wh33", activities: [],
    effects: [], data: { sha256: "a".repeat(64) } }],
  rule: { handledIn: "table", adds: "A plant fails the save.", entry, origins: ["official"],
    assert: [atom("autoFail", "plant")] }
});

describe("gates: an engine without the key (as Ruling R36)", () => {
  const rec = record({ saveAutoFail: { types: ["plant"] } });
  it("a full run fails the rule with the reason; --ci does not; an engine that knows it passes it", () => {
    expect(gateValidator(rec, { core: stubCore(false) })).toEqual([`validator: saveAutoFail: ${KEY_UNKNOWN_TO_ENGINE}`]);
    expect(gateValidator(rec, { core: stubCore(false), ci: true })).toEqual([]);
    expect(gateValidator(rec, { core: stubCore(true) })).toEqual([]);
    const ci = { core: stubCore(false), documents: {}, ci: true, legacy: new Map() };
    expect(runGates([rec], ci).failures[rec.key]?.validator ?? []).toEqual([]);
    expect(runGates([rec], ci).failures[rec.key]?.schema ?? []).toEqual([]);
    const full = { core: stubCore(false), documents: {}, legacy: new Map() };
    expect(JSON.stringify(runGates([rec], full).failures[rec.key] ?? {})).toContain(KEY_UNKNOWN_TO_ENGINE);
    expect(stateOf(rec)).toBe("drafted");
  });
  it("the rest of the entry is still checked by the engine under --ci", () => {
    const bad = record({ saveAutoFail: { types: ["plant"] }, noOpportunity: "flying" });
    const core = { ...stubCore(false), validateEntry: (e) => [...validateOf(false)(e),
      ...(e.noOpportunity === "flying" ? ["noOpportunity: refused"] : [])] };
    expect(gateValidator(bad, { core, ci: true })).toEqual(["validator: noOpportunity: refused"]);
  });
});

describe("ingest --draft", () => {
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "auto-fail-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
  const unruled = () => {
    const { rule, ...r } = record({});
    return { ...r, text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
      evidence: { triaged: { by: "reader-1", at: "2026-01-01T00:00:00.000Z", confidence: 0.9 } } };
  };
  const result = { key: "tst:spell:wilting-hush", outcome: "rule", why: "a plant fails", confidence: 0.9,
    rule: { handledIn: "table", adds: "A plant fails the save.", entry: { saveAutoFail: { types: ["plant"] } },
      origins: ["official"], assert: [atom("autoFail", "plant")] } };
  const run = (core) => ingestDrafts([unruled()], [result], { textDir, by: "drafter-1", at: "2026-01-01T00:00:00.000Z",
    core, offered: new Set([result.key]) });
  it("applies it with an engine that knows the key", () => {
    const out = run(stubCore(true));
    expect(out.rejected).toEqual([]);
    expect(out.records[0].rule.entry).toEqual({ saveAutoFail: { types: ["plant"] } });
  });
  it("rejects it, with the reason, nothing kept, otherwise", () => {
    const out = run(stubCore(false));
    expect(out.applied).toEqual([]);
    expect(out.rejected[0].reason).toContain(`saveAutoFail: ${KEY_UNKNOWN_TO_ENGINE}`);
    expect(out.records[0]).toEqual(unruled());
  });
});

// The clone of DAS · Core (DAS_CORE): its main branch has the key, its latest release may not. What is checked follows the
// clone: the engine's own validator text says whether it knows the key.
const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/content.mjs"))
  ? process.env.DAS_CORE : null;
const ENTRY_FILE = CORE_DIR ? join(CORE_DIR, "module/scripts/core/content/entry.mjs") : null;
const CLONE_HAS = !!ENTRY_FILE && existsSync(ENTRY_FILE) && readFileSync(ENTRY_FILE, "utf8").includes('"saveAutoFail" in entry');

describe.skipIf(!CORE_DIR)("against the DAS_CORE clone", () => {
  it("loadCore's capability is what the clone has; the vocabulary follows it", async () => {
    const core = await loadCore(CORE_DIR);
    expect(core.saveAutoFail).toBe(CLONE_HAS);
    expect(core.entryKeys.has("saveAutoFail")).toBe(CLONE_HAS);
    expect(Object.hasOwn(draftVocabulary(core).draftShapes, "saveAutoFail")).toBe(CLONE_HAS);
    for (const k of Object.keys(draftKeysFor(core))) expect(core.entryKeys.has(k), k).toBe(true);
  });

  it("the engine accepts every value of the shape it knows, and refuses what the pack assumes it refuses", async () => {
    const core = await loadCore(CORE_DIR);
    const shape = resolveShape(DRAFT_SHAPES.saveAutoFail, core);
    const built = variants(shape);
    expect(new Set(built.map((v) => v.types[0])).size).toBe(core.creatureTypes.length);
    for (const value of built) {
      expect(core.validateEntry({ saveAutoFail: value }, { facts: {} }).length === 0, JSON.stringify(value)).toBe(CLONE_HAS);
    }
    for (const value of [{}, { types: [] }, { types: ["plant"], fighting: true }, { types: ["not-a-type"] }]) {
      expect(core.validateEntry({ saveAutoFail: value }, { facts: {} }).length, JSON.stringify(value)).toBeGreaterThan(0);
    }
  });

  it.skipIf(!CLONE_HAS)("the engine's own uses of the key imply the autoFail words a draft's do", async () => {
    const core = await loadCore(CORE_DIR);
    const uses = Object.entries(core.shipped).filter(([, e]) => e?.saveAutoFail);
    expect(uses.length).toBeGreaterThan(0);
    for (const [id, e] of uses) {
      expect(checkDraftKeys({ saveAutoFail: e.saveAutoFail }, { ...spell, core }), id).toEqual([]);
      for (const t of e.saveAutoFail.types) {
        expect(impliedAsserts({ saveAutoFail: e.saveAutoFail }), id).toContain(canon(atom("autoFail", t)));
      }
    }
  });
});
