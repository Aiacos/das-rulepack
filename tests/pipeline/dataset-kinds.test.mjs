import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readEntries, readSpells } from "../../tools/pipeline/dataset.mjs";
import { keyOf } from "../../tools/pipeline/registry.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const dir = join(fixtures, "dataset");
const read = (kind, book = "XZZ", opts) => readEntries(dir, book, kind, opts);
const names = (entries) => entries.map((e) => e.name);

describe("readEntries: feat, option, background", () => {
  it("reads the feats of the book with page, edition, srd and flattened text, leaving other books out", () => {
    const feats = read("feat");
    expect(feats).toEqual([
      {
        name: "Moss Stride", kind: "feat", book: "XZZ", page: 31, edition: "2024", srd: true,
        text: "You step across Prone ground without a sound. Quiet Swift",
      },
      {
        name: "Hollow Echo", kind: "feat", book: "XZZ", page: 32, edition: "2024", srd: false,
        text: "Ring a brass bell for 1d4 rounds.",
      },
    ]);
  });
  it("reads the optional features of the book", () => {
    expect(read("option")).toEqual([{
      name: "Ember Technique", kind: "option", book: "XZZ", page: 40, edition: "2014", srd: false,
      text: "Spend one die to scorch a foe.",
    }]);
  });
  it("reads the backgrounds of the book, flattening item entries", () => {
    const [bg, ...rest] = read("background");
    expect(rest).toEqual([]);
    expect(bg).toMatchObject({ name: "Lamplighter", kind: "background", page: 60, edition: "2024", srd: true });
    expect(bg.text).toBe("Skills Stealth, Insight");
  });
  it("dates a book by its year, and by the flag within its own entries only", () => {
    expect(read("feat", "XZZ", { year: 2017 })[0].edition).toBe("2024");
    expect(read("option", "XZZ", { year: 2025 })[0].edition).toBe("2024");
    expect(read("option", "XZZ", { year: 2017 })[0].edition).toBe("2014");
  });
});

describe("readEntries: item", () => {
  it("reads items and base items of the book, with rarity as the dataset gives it", () => {
    const items = read("item");
    expect(names(items)).toEqual(["Lantern of Dusk", "Glass Whistle", "Glass Whistle (Copy)", "Tin Pot"]);
    expect(items[0]).toEqual({
      name: "Lantern of Dusk", kind: "item", book: "XZZ", page: 120, edition: "2024", srd: false, rarity: "rare",
      text: "Sheds 1d6 motes of dim light.",
    });
    expect(items.map((i) => i.rarity)).toEqual(["rare", "none", "uncommon", "none"]);
    expect(items[3]).toMatchObject({ name: "Tin Pot", srd: true, page: 125, text: "A pot of tin." });
  });
  it("records what a copy was copied from, and gives it empty text when it has none", () => {
    const copy = read("item").find((i) => i.name === "Glass Whistle (Copy)");
    expect(copy).toMatchObject({ copyOf: "Glass Whistle", text: "" });
  });
  it("does not list item groups or other base-file lists", () => {
    expect(names(read("item"))).not.toContain("Group Never Listed");
  });
});

describe("readEntries: feature", () => {
  const features = read("feature");
  it("reads class features with owner = class and level", () => {
    expect(features.find((f) => f.name === "Second Wind")).toEqual({
      name: "Second Wind", kind: "feature", book: "XZZ", page: 71, edition: "2024", srd: false, owner: "Zzfighter", level: 1,
      text: "Heal 1d10 hit points.",
    });
  });
  it("reads subclass features with owner = Class/Subclass short name", () => {
    expect(features.find((f) => f.name === "Ember Spark"))
      .toMatchObject({ owner: "Zzfighter/Ember", level: 3, text: "A spark leaps." });
  });
  it("reads every class file of the dataset, and leaves other books out", () => {
    expect(features.find((f) => f.name === "Spark Casting")).toMatchObject({ owner: "Zzmage", level: 1 });
    expect(names(features)).not.toContain("Rival Feature");
  });
  it("does not repeat the text of a feature it only points at", () => {
    expect(features.find((f) => f.name === "Ember Path" && f.owner === "Zzfighter/Ember").text).toBe("Your blows glow.");
    expect(features.find((f) => f.name === "Fighting Style").text).toBe("Pick a style.");
  });
  it("gives two features of one name two keys (by level, by subclass)", () => {
    const asi = features.filter((f) => f.name === "Ability Score Improvement");
    const path = features.filter((f) => f.name === "Ember Path");
    for (const group of [asi, path]) {
      expect(group).toHaveLength(2);
      const keys = group.map((f) => keyOf(f));
      expect(new Set(keys).size).toBe(2);
    }
    expect(features.map((f) => keyOf(f))).toContain("xzz:feature:zzfighter/ember/3/ember-path");
  });
  it("is edition 2024 when a feature of the book is flagged", () => {
    expect(features.every((f) => f.edition === "2024")).toBe(true);
    expect(read("feature", "QZZ")[0].edition).toBe("2014");
  });
});

describe("readEntries: species", () => {
  const species = read("species");
  it("reads one record per species with the unnamed remainder as text", () => {
    expect(species.find((s) => s.name === "Glimmerkin")).toEqual({
      name: "Glimmerkin", kind: "species", book: "XZZ", page: 20, edition: "2024", srd: true, text: "Born under a shifting sky.",
    });
  });
  it("reads each named sub-entry as a trait with its own text and the species as owner", () => {
    const traits = species.filter((s) => s.owner === "Glimmerkin");
    expect(traits.map((t) => [t.name, t.text])).toEqual([
      ["Dim Sight", "You see 60 feet in the dark."], ["Quick Blink", "Teleport a short way. Once Daily"],
    ]);
    expect(traits[0]).toMatchObject({ kind: "species", page: 20, srd: true });
  });
  it("lists a species with nothing but traits, with empty text", () => {
    expect(species.find((s) => s.name === "Plainfolk")).toMatchObject({ text: "" });
    expect(species.find((s) => s.name === "Steady")).toMatchObject({ owner: "Plainfolk", text: "Hardy." });
  });
  it("keeps the key of a trait apart from the key of its species", () => {
    expect(species.map((s) => keyOf(s))).toContain("xzz:species:glimmerkin/dim-sight");
    expect(species.map((s) => keyOf(s))).toContain("xzz:species:glimmerkin");
  });
  it("records a copy's origin, and reads a subrace as Race (Subrace), skipping a nameless one", () => {
    expect(species.find((s) => s.name === "Glimmerkin Twin")).toMatchObject({ copyOf: "Glimmerkin", text: "" });
    expect(species.find((s) => s.name === "Glimmerkin (Moonlit)")).toMatchObject({ page: 23, text: "" });
    expect(species.find((s) => s.name === "Pale Glow")).toMatchObject({ owner: "Glimmerkin (Moonlit)", text: "You shed light." });
    expect(names(species).filter((n) => n.includes("No name"))).toEqual([]);
    expect(species.some((s) => s.page === 24)).toBe(false);
  });
  it("leaves other books out", () => expect(names(species)).not.toContain("Rivalkin"));
});

describe("readEntries: spell, missing files, unsupported kinds", () => {
  it("reads spells as readSpells does, plus the kind", () => {
    const entries = readEntries(fixtures, "XZZ", "spell");
    expect(entries.map(({ kind, ...rest }) => rest)).toEqual(readSpells(fixtures, "XZZ"));
    expect(entries.every((e) => e.kind === "spell")).toBe(true);
    expect(entries[0]).toMatchObject({ level: 2, school: "V", page: 12 });
  });
  it("keeps readSpells failing on a missing file, and readEntries returning nothing", () => {
    expect(() => readSpells(fixtures, "NOPE")).toThrow(/spells-nope\.json/);
    expect(readEntries(fixtures, "NOPE", "spell")).toEqual([]);
  });
  it("returns [] when a dataset has none of the files of a kind", () => {
    const empty = mkdtempSync(join(tmpdir(), "rulepack-empty-"));
    for (const kind of ["spell", "feat", "option", "feature", "species", "background", "item"]) {
      expect(readEntries(empty, "XZZ", kind), kind).toEqual([]);
    }
  });
  it("returns [] for a book that has no entry of the kind in a shared file", () => {
    expect(read("feat", "NOPE")).toEqual([]);
    expect(read("item", "NOPE")).toEqual([]);
  });
  it("refuses sense and unknown kinds", () => {
    expect(() => read("sense")).toThrow(/sense/);
    expect(() => read("unicorn")).toThrow(/unicorn/);
  });
});
