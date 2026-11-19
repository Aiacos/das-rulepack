import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SPELLS } from "../scripts/rules/spells.mjs";
import { SENSES } from "../scripts/rules/senses.mjs";
import { FEATURES } from "../scripts/rules/features.mjs";

// The rules are validated by DAS · Core's own validator, from a clone of the engine: DAS_CORE, or the sibling folders used in
// this workspace. Without a clone the contract tests are skipped locally and fail in CI.
const candidates = [process.env.DAS_CORE, "../../darshyne-das/dnd5e-combat", "../../dnd5e-combat", "../core"]
  .filter(Boolean).map(p => resolve(import.meta.dirname, p));
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

  it("shares no identifier with the spell rules, and both are registered in one table", async () => {
    expect(Object.keys(SENSES).filter(id => id in SPELLS)).toEqual([]);
    const { readFileSync } = await import("node:fs");
    const main = readFileSync(resolve(import.meta.dirname, "../scripts/main.mjs"), "utf8");
    expect(main).toContain("register(MODULE_ID, { ...SPELLS, ...SENSES, ...FEATURES })");
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
  it("every entry passes the engine's validator, and overrides an entry the engine ships", async () => {
    const { validateEntry } = await import(pathToFileURL(resolve(CORE, "module/scripts/core/content.mjs")).href);
    const { CONTENT } = await import(pathToFileURL(resolve(CORE, "module/scripts/content/index.mjs")).href);
    const facts = new Proxy({}, { has: () => true, get: () => true });
    const errors = Object.entries(FEATURES).flatMap(([id, entry]) => validateEntry(entry, { facts }).map(e => `${id}: ${e}`));
    expect(errors).toEqual([]);
    for ( const [id, entry] of Object.entries(FEATURES) ) for ( const key of Object.keys(entry) ) expect(CONTENT[id]?.[key], `${id}.${key}`).toBeDefined();
  });
});
