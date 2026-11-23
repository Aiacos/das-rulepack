import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SPELLS, SENSES, FEATURES, RULES, TABLE } from "../scripts/rules/index.mjs";
import { fromRegistry } from "./derived.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const derived = fromRegistry();

// The rules are validated by DAS · Core's own validator, from a clone of the engine: DAS_CORE, or the sibling folders used in
// this workspace. Without a clone the contract tests are skipped locally and fail in CI.
const candidates = [process.env.DAS_CORE, "../../darshyne-das/dnd5e-combat", "../../dnd5e-combat", "../core"]
  .filter(Boolean).map(p => resolve(HERE, p));
const CORE = candidates.find(p => existsSync(resolve(p, "module/scripts/core/content.mjs")));

describe("rule table", () => {
  it("identifiers are dnd5e identifiers (lowercase, hyphens)", () => {
    for ( const id of Object.keys(SPELLS) ) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("every entry is a non-empty object", () => {
    for ( const [id, entry] of Object.entries(SPELLS) ) {
      expect(typeof entry, id).toBe("object");
      expect(Object.keys(entry).length, id).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!CORE && !process.env.CI)("contract with DAS · Core", () => {
  it("every entry passes the engine's validator", async () => {
    const { validateEntry } = await import(pathToFileURL(resolve(CORE, "module/scripts/core/content.mjs")).href);
    const facts = new Proxy({}, { has: () => true, get: () => true });
    const errors = Object.entries(SPELLS).flatMap(([id, entry]) => validateEntry(entry, { facts }).map(e => `${id}: ${e}`));
    expect(errors).toEqual([]);
  });

  it("an unknown key is refused, so a typo cannot make a rule silently inert", async () => {
    const { validateEntry } = await import(pathToFileURL(resolve(CORE, "module/scripts/core/content.mjs")).href);
    const facts = new Proxy({}, { has: () => true, get: () => true });
    expect(validateEntry({ recastt: true }, { facts }).length).toBeGreaterThan(0);
  });
});

describe("senses table", () => {
  it("identifiers are dnd5e identifiers, and every entry declares a sense with a kind and a range", () => {
    for ( const [id, entry] of Object.entries(SENSES) ) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(["locate", "sight"], id).toContain(entry.sense?.kind);
      expect(entry.sense.range, id).toBeGreaterThan(0);
    }
  });

  // Legacy pin: the 24 legacy rules register spells, senses and features only, so their part of the table is those three.
  it("shares no identifier with the spell rules, and both are in the one table that is registered", () => {
    expect(Object.keys(SENSES).filter(id => id in SPELLS)).toEqual([]);
    const legacy = derived.emitted.filter(({ record }) => derived.isLegacy(record)).map(({ rule }) => rule);
    expect(legacy).toHaveLength(24);
    const legacyIds = legacy.filter(rule => rule.entry).flatMap(rule => [rule.identifier, ...(rule.alsoAs ?? [])]);
    const three = { ...SPELLS, ...SENSES, ...FEATURES };
    for ( const id of legacyIds ) expect(TABLE[id], id).toBe(three[id]);
    expect(legacyIds.filter(id => !(id in three))).toEqual([]);
  });

  // Derived: no sense identifier is registered by any other rule, legacy or not; the table is what registry/ emits, and holds
  // the spells, senses and features with their own entries, the rules of other kinds (a monster's feature) beside them.
  it("no other rule, legacy or not, registers a sense's identifier; the table is what registry/ emits", () => {
    for ( const id of Object.keys(SENSES) ) {
      const holders = RULES.filter(rule => rule.entry && [rule.identifier, ...(rule.alsoAs ?? [])].includes(id));
      expect(holders.map(rule => rule.kind), id).toEqual(["sense"]);
      expect(TABLE[id], id).toBe(SENSES[id]);
    }
    for ( const [id, entry] of Object.entries({ ...SPELLS, ...FEATURES }) ) expect(TABLE[id], id).toBe(entry);
    expect(TABLE).toEqual(derived.table);
    // Any other identifier is that of a rule of another kind, or an alias (`alsoAs`).
    const elsewhere = new Set([
      ...RULES.filter(rule => rule.entry && !["spell", "sense", "feature"].includes(rule.kind)).map(rule => rule.identifier),
      ...RULES.filter(rule => rule.entry).flatMap(rule => rule.alsoAs ?? [])
    ]);
    const outside = Object.keys(TABLE).filter(id => !(id in SPELLS || id in SENSES || id in FEATURES));
    for ( const id of outside ) expect(elsewhere, id).toContain(id);
  });
});

describe.skipIf(!CORE && !process.env.CI)("senses: contract with DAS · Core", () => {
  it("every entry passes the validator of an engine that knows the `sense` key (skipped on one that does not)", async ctx => {
    const { validateEntry, ENTRY_KEYS } = await import(pathToFileURL(resolve(CORE, "module/scripts/core/content.mjs")).href);
    if ( !ENTRY_KEYS?.includes("sense") ) return ctx.skip();
    const facts = new Proxy({}, { has: () => true, get: () => true });
    const errors = Object.entries(SENSES).flatMap(([id, entry]) => validateEntry(entry, { facts }).map(e => `${id}: ${e}`));
    expect(errors).toEqual([]);
  });
});

describe("feature overrides", () => {
  it("identifiers are dnd5e identifiers and share none with the other tables", () => {
    for ( const id of Object.keys(FEATURES) ) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(id in SPELLS, id).toBe(false);
      expect(id in SENSES, id).toBe(false);
    }
  });

  it("Psychic Veil no longer ends on an attack roll; Inspiring Smite lets the paladin divide; Dreadful Strikes hands over to the script", () => {
    expect(FEATURES["psychic-veil"].breaksOn).toEqual(["damage", "forcesSave"]);
    expect(FEATURES["inspiring-smite"].healPool.choose).toBe(true);
    expect(FEATURES["dreadful-strikes"].triggers).toEqual([]);
  });
});

describe.skipIf(!CORE && !process.env.CI)("feature overrides: contract with DAS · Core", () => {
  it("every entry passes the engine's validator; one under an identifier the engine ships completes that entry", async () => {
    const { validateEntry } = await import(pathToFileURL(resolve(CORE, "module/scripts/core/content.mjs")).href);
    const { CONTENT } = await import(pathToFileURL(resolve(CORE, "module/scripts/content/index.mjs")).href);
    const facts = new Proxy({}, { has: () => true, get: () => true });
    // Ruling R44: against an engine older than a nested key an engineered rule holds (CI's latest release), that key being
    // unknown to it is the one problem allowed; the shipped module leaves such a rule out on that engine by itself.
    const records = readdirSync(resolve("registry")).filter(f => f.endsWith(".json"))
      .flatMap(f => JSON.parse(readFileSync(resolve("registry", f), "utf8")).records ?? []).filter(r => r?.rule?.engineered);
    const engineered = new Set(records.flatMap(r => [r.identifier, ...(r.rule.alsoAs ?? [])]));
    const errors = Object.entries(FEATURES).flatMap(([id, entry]) => validateEntry(entry, { facts })
      .filter(e => !(engineered.has(id) && /^[\w.-]+: unknown key\b/.test(e))).map(e => `${id}: ${e}`));
    expect(errors).toEqual([]);
    // A feature the engine has an entry for is completed key by key: every key the pack writes there must be one the engine
    // ships. A feature the engine has no entry for (a rule the pipeline adds) is the pack's own entry, registered as a spell's.
    for ( const [id, entry] of Object.entries(FEATURES) ) {
      if ( !(id in CONTENT) ) continue;
      for ( const key of Object.keys(entry) ) expect(CONTENT[id]?.[key], `${id}.${key}`).toBeDefined();
    }
  });
});
