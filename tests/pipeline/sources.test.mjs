import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { plainText, textFingerprint, cacheText, hasText } from "../../tools/pipeline/text.mjs";
import { readSpells } from "../../tools/pipeline/dataset.mjs";
import { readDump, itemSummary, dumpsFor } from "../../tools/pipeline/dumps.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const tmp = () => mkdtempSync(join(tmpdir(), "rulepack-"));

describe("plainText", () => {
  it("strips tags, keeps the first argument and numbers, collapses whitespace", () => {
    expect(plainText(["Deals {@damage 2d6} and {@condition Prone|XPHB}.", "  {@spell Fireball|XPHB|fire ball}  now "])).toBe(
      "Deals 2d6 and Prone. Fireball now",
    );
  });
  it("flattens nested entries, lists and nested tags", () => {
    const entries = [
      { type: "entries", name: "A", entries: ["x {@b {@i bold}|y}"] },
      { type: "list", items: ["one", { name: "Two", entry: "2" }] },
    ];
    expect(plainText(entries)).toBe("A x bold one Two 2");
  });
  it("keeps a bare number node inside entries", () => {
    expect(plainText(["Range", 30, { type: "entries", entries: [5, "ft"] }])).toBe("Range 30 5 ft");
  });
  it("accepts a single string and empty input", () => {
    expect(plainText("a  b")).toBe("a b");
    expect(plainText(undefined)).toBe("");
  });
});

describe("text cache", () => {
  it("fingerprints with sha256 and caches by hash", () => {
    const dir = tmp();
    const sha = cacheText(dir, "hello");
    expect(sha).toBe(textFingerprint("hello"));
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    expect(hasText(dir, sha)).toBe(true);
    expect(hasText(dir, textFingerprint("other"))).toBe(false);
    expect(readFileSync(join(dir, `${sha}.txt`), "utf8")).toBe("hello");
  });
  it("does not rewrite an existing entry", () => {
    const dir = tmp();
    const sha = cacheText(dir, "same");
    writeFileSync(join(dir, `${sha}.txt`), "marker");
    cacheText(dir, "same");
    expect(readFileSync(join(dir, `${sha}.txt`), "utf8")).toBe("marker");
  });
});

describe("readSpells", () => {
  const dir = fixtures;
  it("returns page, level, school, srd flag, edition and flattened text", () => {
    const spells = readSpells(dir, "XZZ");
    expect(spells).toHaveLength(3);
    expect(spells[0]).toEqual({
      name: "Glimmer Lance", book: "XZZ", page: 12, edition: "2024", srd: true, level: 2, school: "V",
      text: "A shard of light deals 2d6 radiant damage and the target is Prone. Echo Repeat with Glimmer Lance. "
        + "First item Second has 1d4",
    });
    expect(spells[1].srd).toBe(false);
    expect(spells[1].edition).toBe("2024");
  });
  it("marks a 2014 file with srd set", () => {
    const [s] = readSpells(dir, "YZZ");
    expect(s).toMatchObject({ edition: "2014", srd: true, book: "YZZ" });
  });
  it("marks a non-X book as 2024 when an entry carries basicRules2024", () => {
    const [s] = readSpells(fixtures, "WZZ");
    expect(s).toMatchObject({ book: "WZZ", edition: "2024", srd: false });
  });
  it("fails clearly when the file is missing", () => {
    expect(() => readSpells(dir, "NOPE")).toThrow(/spells-nope\.json/);
  });
});

describe("dumps", () => {
  const doc = {
    _id: "AAAAAAAAAAAAAAAA", name: "Glimmer Lance", type: "spell",
    system: {
      identifier: "glimmer-lance", level: 2, school: "evo", source: { rules: "2024", book: "XZZ" },
      activities: {
        a1b2c3d4e5f6g7h8: {
          type: "save", save: { ability: ["wis", "dex"] },
          damage: { parts: [{ types: ["radiant", "fire"] }, { types: ["fire"] }] },
        },
        z9y8x7w6v5u4t3s2: { type: "utility" },
      },
    },
    effects: [{ _id: "EEEEEEEEEEEEEEEE", name: "Dazzled", statuses: ["blinded"] }],
  };
  it("summarises activities, effects and identity", () => {
    const s = itemSummary(doc, "official");
    expect(s).toMatchObject({
      origin: "official", docId: "AAAAAAAAAAAAAAAA", identifier: "glimmer-lance", name: "Glimmer Lance", type: "spell",
      rules: "2024", level: 2, school: "evo",
      effects: [{ id: "EEEEEEEEEEEEEEEE", name: "Dazzled", statuses: ["blinded"] }],
    });
    expect(s.activities).toEqual([
      { id: "a1b2c3d4e5f6g7h8", type: "save", save: ["dex", "wis"], damageTypes: ["fire", "radiant"] },
      { id: "z9y8x7w6v5u4t3s2", type: "utility", damageTypes: [] },
    ]);
    expect(s.data).toMatch(/^[0-9a-f]{64}$/);
  });
  it("normalises a single-string save ability", () => {
    const d = { ...doc, system: { ...doc.system, activities: { aaaaaaaaaaaaaaaa: { type: "save", save: { ability: "con" } } } } };
    expect(itemSummary(d, "official").activities[0].save).toEqual(["con"]);
  });
  it("gives identifier null and keeps the name when system.identifier is missing", () => {
    const d = { _id: "BBBBBBBBBBBBBBBB", name: "Nameless Thing", type: "feat", system: { source: {} } };
    const s = itemSummary(d, "ddb-importer");
    expect(s.identifier).toBeNull();
    expect(s.name).toBe("Nameless Thing");
    expect(s.rules).toBeUndefined();
    expect(s.activities).toEqual([]);
    expect(s.effects).toEqual([]);
    expect("level" in s).toBe(false);
  });
  it("fingerprints data independently of key order", () => {
    const reordered = {
      ...doc,
      system: {
        activities: doc.system.activities, source: { book: "XZZ", rules: "2024" },
        school: "evo", level: 2, identifier: "glimmer-lance",
      },
    };
    expect(itemSummary(reordered, "official").data).toBe(itemSummary(doc, "official").data);
    const changed = { ...doc, system: { ...doc.system, level: 3 } };
    expect(itemSummary(changed, "official").data).not.toBe(itemSummary(doc, "official").data);
  });
  it("reads a dump file and lists dump files per origin", () => {
    const dir = tmp();
    const names = ["dnd-players-handbook.spells.json", "ddb.items.json", "dnd5e.rules.json", "notes.txt"];
    for (const f of names) writeFileSync(join(dir, f), "[]");
    writeFileSync(join(dir, "x.json"), JSON.stringify([doc]));
    expect(readDump(join(dir, "x.json"))).toHaveLength(1);
    expect(dumpsFor(dir, "official")).toEqual(["dnd-players-handbook.spells.json", "x.json"]);
    expect(dumpsFor(dir, "ddb-importer")).toEqual(["ddb.items.json"]);
    expect(() => dumpsFor(dir, "plutonium")).toThrow(/plutonium/);
  });
});
