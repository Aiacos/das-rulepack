import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SPELLS } from "../scripts/rules/spells.mjs";

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
