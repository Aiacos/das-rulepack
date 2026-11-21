import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { KIND_TABLE } from "../../tools/pipeline/kinds.mjs";
import { KINDS, validateRecord } from "../../tools/pipeline/schema.mjs";
import { keyOf, KINDS as REGISTRY_KINDS } from "../../tools/pipeline/registry.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const minimal = () => ({
  key: "xzz:feature:fighter/1/second-wind", name: "Second Wind", kind: "feature", book: "XZZ", page: 7, edition: "2024",
  text: null, items: [], verdict: null, evidence: {},
});

describe("KINDS", () => {
  it("lists the kinds exactly, sense last, and is frozen", () => {
    expect(KINDS).toEqual(["spell", "feat", "option", "feature", "species", "background", "item", "monster", "sense"]);
    expect(Object.isFrozen(KINDS)).toBe(true);
    expect(REGISTRY_KINDS).toBe(KINDS);
  });
});

describe("KIND_TABLE", () => {
  it("has a row for every inventoriable kind except monster, and none for sense", () => {
    expect(Object.keys(KIND_TABLE).sort()).toEqual(["background", "feat", "feature", "item", "option", "species", "spell"]);
    expect(KIND_TABLE).not.toHaveProperty("monster");
    expect(KIND_TABLE).not.toHaveProperty("sense");
  });
  it("names the Foundry document types and the identity mechanics of each kind", () => {
    expect(KIND_TABLE.spell).toMatchObject({ docTypes: ["spell"], identity: ["level", "school"] });
    expect(KIND_TABLE.feat.docTypes).toEqual(["feat"]);
    expect(KIND_TABLE.option.docTypes).toEqual(["feat"]);
    expect(KIND_TABLE.feature.docTypes).toEqual(["feat"]);
    expect(KIND_TABLE.species).toMatchObject({ docTypes: ["race"], traitDocTypes: ["feat"] });
    expect(KIND_TABLE.background.docTypes).toEqual(["background"]);
    expect(KIND_TABLE.item.docTypes).toEqual(["weapon", "equipment", "consumable", "tool", "loot", "container"]);
    expect(KIND_TABLE.item.identity).toEqual(["rarity"]);
    for (const k of ["feat", "option", "feature", "species", "background"]) expect(KIND_TABLE[k].identity).toEqual([]);
  });
  it("points at the dataset files of a book", () => {
    expect(KIND_TABLE.spell.files("XPHB")).toEqual(["spells/spells-xphb.json"]);
    expect(KIND_TABLE.feat.files("XPHB")).toEqual(["feats.json"]);
    expect(KIND_TABLE.option.files("XPHB")).toEqual(["optionalfeatures.json"]);
    expect(KIND_TABLE.species.files("XPHB")).toEqual(["races.json"]);
    expect(KIND_TABLE.background.files("XPHB")).toEqual(["backgrounds.json"]);
    expect(KIND_TABLE.item.files("XPHB")).toEqual(["items.json", "items-base.json"]);
  });
  it("lists the raw entries of a file, and nothing for a file without the list", () => {
    expect(KIND_TABLE.feat.list({ feat: [{ name: "A" }] })).toEqual([{ name: "A" }]);
    expect(KIND_TABLE.feat.list({})).toEqual([]);
    expect(KIND_TABLE.item.list({ item: [{ name: "A" }], baseitem: [{ name: "B" }], itemGroup: [{ name: "C" }] }))
      .toEqual([{ name: "A" }, { name: "B" }]);
  });
});

describe("keyOf with owner and level", () => {
  it("leaves the keys without owner or level alone", () => {
    expect(keyOf({ book: "XPHB", kind: "spell", name: "Tasha's Hideous Laughter" })).toBe("xphb:spell:tashas-hideous-laughter");
    expect(keyOf({ book: "MM", kind: "action", name: "Frost Bite", creature: "Rime Wolf" })).toBe("mm:action:rime-wolf:frost-bite");
  });
  it("keeps all 24 legacy keys", () => {
    const legacy = Object.keys(JSON.parse(readFileSync(join(root, "registry", "legacy.json"), "utf8")));
    expect(legacy).toHaveLength(24);
    const notBooks = ["legacy.json", "queue.json"];
    const books = readdirSync(join(root, "registry")).filter((f) => f.endsWith(".json") && !notBooks.includes(f));
    const records = books
      .flatMap((f) => JSON.parse(readFileSync(join(root, "registry", f), "utf8")).records);
    for (const key of legacy) {
      const r = records.find((x) => x.key === key);
      expect(r, key).toBeDefined();
      expect(keyOf({ book: r.book, kind: r.kind, name: r.name }), key).toBe(key);
    }
  });
  it("puts owner and level between the kind and the name", () => {
    expect(keyOf({ book: "XPHB", kind: "feature", name: "Second Wind", owner: "Fighter", level: 1 }))
      .toBe("xphb:feature:fighter/1/second-wind");
  });
  it("slugs each part of a Class/Subclass owner and joins them with a slash", () => {
    expect(keyOf({ book: "XPHB", kind: "feature", name: "Battle Master", owner: "Fighter/Battle Master", level: 3 }))
      .toBe("xphb:feature:fighter/battle-master/3/battle-master");
    expect(keyOf({ book: "TCE", kind: "feature", name: "X", owner: "Bard/College of Glamour", level: 0 }))
      .toBe("tce:feature:bard/college-of-glamour/0/x");
  });
  it("with only an owner, drops the level segment", () => {
    expect(keyOf({ book: "XPHB", kind: "species", name: "Darkvision", owner: "Elf" })).toBe("xphb:species:elf/darkvision");
  });
  it("keeps level 0, and tells two features of one name apart by level", () => {
    const at = (level) => keyOf({ book: "XPHB", kind: "feature", name: "Ability Score Improvement", owner: "Fighter", level });
    expect(at(0)).toBe("xphb:feature:fighter/0/ability-score-improvement");
    expect(at(4)).not.toBe(at(6));
  });
});

describe("validateRecord: owner, level, rarity, section, copyOf", () => {
  it("accepts them when well formed", () => {
    const extra = { owner: "Fighter/Battle Master", level: 0, rarity: "rare", section: "Equipment", copyOf: "Glass Whistle" };
    expect(validateRecord({ ...minimal(), ...extra })).toEqual([]);
  });
  it("rejects a bad owner, level, rarity, section or copyOf, naming the field", () => {
    const bad = { owner: [""], level: [-1, 1.5, "3", null], rarity: [3, ""], section: [1, ""], copyOf: [{}, ""] };
    for (const [field, values] of Object.entries(bad)) {
      for (const value of values) {
        expect(validateRecord({ ...minimal(), [field]: value }).join(), `${field}=${JSON.stringify(value)}`).toMatch(field);
      }
    }
  });
});
