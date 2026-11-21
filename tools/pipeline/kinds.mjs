// What each kind of rulebook entry is made of in the 5etools dataset: where it lives, how to list it, which Foundry
// document types it can become and which mechanics make two entries of one name different things.
// `monster` has no row yet (a later task adds it); `sense` is a legacy kind and is never inventoried.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const lower = (code) => code.toLowerCase();
const arrayOf = (json, key) => (Array.isArray(json?.[key]) ? json[key] : []);

// The class files of the dataset: every `class/class-*.json` (a book's features sit in the file of their class).
function classFiles(datasetDir) {
  const dir = join(datasetDir, "class");
  if (!datasetDir || !existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^class-.+\.json$/.test(f)).sort().map((f) => `class/${f}`);
}

export const KIND_TABLE = Object.freeze({
  spell: {
    files: (book) => [`spells/spells-${lower(book)}.json`],
    list: (json) => arrayOf(json, "spell"),
    docTypes: ["spell"],
    identity: ["level", "school"],
  },
  feat: {
    files: () => ["feats.json"],
    list: (json) => arrayOf(json, "feat"),
    docTypes: ["feat"],
    identity: [],
  },
  option: {
    files: () => ["optionalfeatures.json"],
    list: (json) => arrayOf(json, "optionalfeature"),
    docTypes: ["feat"],
    identity: [],
  },
  // Class features and subclass features, each tagged with the list it came from.
  feature: {
    files: (book, datasetDir) => classFiles(datasetDir),
    list: (json) => [
      ...arrayOf(json, "classFeature").map((e) => ({ ...e, featureOf: "class" })),
      ...arrayOf(json, "subclassFeature").map((e) => ({ ...e, featureOf: "subclass" })),
    ],
    docTypes: ["feat"],
    identity: [],
  },
  // A species is a "race" document; each of its named traits is a "feat" document (`traitDocTypes`).
  species: {
    files: () => ["races.json"],
    list: (json) => [
      ...arrayOf(json, "race").map((e) => ({ ...e, speciesOf: "race" })),
      ...arrayOf(json, "subrace").map((e) => ({ ...e, speciesOf: "subrace" })),
    ],
    docTypes: ["race"],
    traitDocTypes: ["feat"],
    identity: [],
  },
  background: {
    files: () => ["backgrounds.json"],
    list: (json) => arrayOf(json, "background"),
    docTypes: ["background"],
    identity: [],
  },
  // Magic items and equipment of `items.json`, then the base items of `items-base.json`.
  item: {
    files: () => ["items.json", "items-base.json"],
    list: (json) => [...arrayOf(json, "item"), ...arrayOf(json, "baseitem")],
    docTypes: ["weapon", "equipment", "consumable", "tool", "loot", "container"],
    identity: ["rarity"],
  },
});
