import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLUTONIUM, registerImporters } from "../scripts/importers.mjs";

const lang = code => JSON.parse(readFileSync(resolve(import.meta.dirname, `../lang/${code}.json`), "utf8"));

beforeEach(() => { globalThis.game = { i18n: { localize: key => lang("en")[key] ?? key } }; });

describe("importers declared to DAS · Core", () => {
  it("declares Plutonium by the flag its items carry, with a localized name and hint", () => {
    const seen = [];
    const id = registerImporters({ diagnostic: { registerImporter: def => { seen.push(def); return `imported-${def.id}`; } } });
    expect(id).toBe("imported-plutonium");
    expect(seen).toEqual([{ id: "plutonium", flag: "plutonium", icon: PLUTONIUM.icon,
      name: "Items imported by Plutonium", hint: lang("en")["DASRULEPACK.Importer.Plutonium.Hint"] }]);
  });

  it("does nothing on an engine without the extension point, and survives a refusal", () => {
    expect(registerImporters({})).toBeNull();
    expect(registerImporters(null)).toBeNull();
    const original = console.error;
    console.error = () => {};
    try { expect(registerImporters({ diagnostic: { registerImporter: () => { throw new Error("refused"); } } })).toBeNull(); }
    finally { console.error = original; }
  });

  it("has its two strings in every language of the pack", () => {
    for ( const code of ["en", "it"] ) {
      expect(lang(code)["DASRULEPACK.Importer.Plutonium.Name"], code).toBeTruthy();
      expect(lang(code)["DASRULEPACK.Importer.Plutonium.Hint"], code).toBeTruthy();
    }
  });
});
