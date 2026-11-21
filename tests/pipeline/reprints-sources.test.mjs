import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventory } from "../../tools/pipeline/inventory.mjs";
import { reprintIndex } from "../../tools/pipeline/dumps.mjs";
import { checkIds } from "../../tools/pipeline/gates.mjs";
import { validateRecord } from "../../tools/pipeline/registry.mjs";
import { generate, indexSource } from "../../tools/pipeline/generate.mjs";
import { saveBook } from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented entries and invented ids.
const OFF = "Of00Of11Of22Of33";
const DDB = "Db00Db11Db22Db33";
const ACT = "Ac00Ac11Ac22Ac33";
const ACT2 = "Ac99Ac88Ac77Ac66";
const EFF = "Ef00Ef11Ef22Ef33";

const entry = { name: "Glimmer Ring", book: "TST", page: 3, edition: "2024", srd: false, text: "t", rarity: "rare" };
const summary = (origin, docId, over = {}) => ({
  origin, docId, identifier: "glimmer-ring", name: "Glimmer Ring", type: "equipment", rules: "2024",
  activities: [{ id: ACT, type: "utility", damageTypes: [] }], effects: [{ id: EFF, name: "Glow", statuses: [] }],
  data: `h-${origin}`, ...over
});

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "rs-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));
const run = (dumps, previous = []) => inventory({
  book: "TST", kind: "item", dataset: [entry], dumps: { "ddb-importer": [], ...dumps }, textDir, previous
});
const officialOf = (r) => r.items.find((i) => i.origin === "official");

describe("reprints", () => {
  const index = (...rows) => new Map([[OFF, rows]]);
  it("records, per other official package holding the same docId, whether the activity and effect ids are the same", () => {
    const { records } = run({
      official: [summary("official", OFF)],
      reprints: index({ package: "pkg-b", activities: [ACT], effects: [EFF] },
        { package: "pkg-a", activities: [ACT, ACT2], effects: [EFF] })
    });
    expect(officialOf(records[0]).reprints).toEqual([
      { package: "pkg-a", docId: OFF, sameIds: false, missing: [] },
      { package: "pkg-b", docId: OFF, sameIds: true }
    ]);
    expect(validateRecord(records[0])).toEqual([]);
  });
  it("names the ids of the item that the reprint lacks", () => {
    const { records } = run({
      official: [summary("official", OFF)], reprints: index({ package: "pkg-a", activities: [ACT2], effects: [] })
    });
    expect(officialOf(records[0]).reprints).toEqual([{ package: "pkg-a", docId: OFF, sameIds: false, missing: [ACT, EFF].sort() }]);
  });
  it("has no reprints field when no other package holds the document, and none for ddb-importer items", () => {
    const { records } = run({
      official: [summary("official", OFF)], "ddb-importer": [summary("ddb-importer", DDB)], reprints: new Map()
    });
    expect(officialOf(records[0]).reprints).toBeUndefined();
    expect(records[0].items.find((i) => i.origin === "ddb-importer").reprints).toBeUndefined();
  });
  it("keeps reprintsExcluded of an existing item while the package is still a reprint", () => {
    const dumps = { official: [summary("official", OFF)], reprints: index({ package: "pkg-a", activities: [], effects: [] }) };
    const first = run(dumps).records;
    first[0].items[0].reprintsExcluded = [
      { package: "pkg-a", because: "the reprint is a draft" }, { package: "gone", because: "x" }
    ];
    const again = run(dumps, first).records;
    expect(officialOf(again[0]).reprintsExcluded).toEqual([{ package: "pkg-a", because: "the reprint is a draft" }]);
  });

  describe("reprintIndex", () => {
    it("reads the other packages' item documents: id, package, activity ids and effect ids; actor packs are left out", () => {
      const dir = mkdtempSync(join(tmpdir(), "rs-dumps-"));
      try {
        const doc = (id, activities, effects) => ({ _id: id, name: "x", type: "equipment", system: { activities }, effects });
        writeFileSync(join(dir, "pkg-a.items.json"), JSON.stringify([doc(OFF, { [ACT]: {} }, [{ _id: EFF }])]));
        writeFileSync(join(dir, "pkg-a.actors.json"), JSON.stringify([doc("Ac11Ac11Ac11Ac11", {}, [])]));
        const found = reprintIndex(dir, ["pkg-a.items.json", "pkg-a.actors.json"]);
        expect([...found.keys()]).toEqual([OFF]);
        expect(found.get(OFF)).toEqual([{ package: "pkg-a", activities: [ACT], effects: [EFF] }]);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  });

  describe("the ids gate", () => {
    const rule = (id) => ({ handledIn: "table", adds: "x", entry: { triggers: [{ fromEffect: id }] }, origins: ["official"] });
    const record = (reprints, extra = {}) => ({
      key: "tst:item:glimmer-ring", name: "Glimmer Ring", kind: "item", book: "TST", page: 3, edition: "2024", text: null,
      verdict: "entry", evidence: {}, identifier: "glimmer-ring", rule: rule(ACT),
      items: [{ origin: "official", match: "matched", identifier: "glimmer-ring", docId: OFF, activities: [ACT], effects: [EFF],
        data: { sha256: "0".repeat(64) }, ...(reprints ? { reprints } : {}), ...extra }]
    });
    const ctx = { core: { vocabulary: new Set() } };
    it("fails an entry that uses an id missing from a reprint with different ids, naming the package", () => {
      const r = record([{ package: "pkg-a", docId: OFF, sameIds: false, missing: [ACT] }]);
      expect(checkIds(r, ctx).failures).toEqual([`ids: the reprint in pkg-a has no activity or effect ${ACT}`]);
    });
    it("passes when the entry uses only ids the reprint has, or the reprint has the same ids", () => {
      expect(checkIds(record([{ package: "pkg-a", docId: OFF, sameIds: false, missing: [EFF] }]), ctx).failures).toEqual([]);
      expect(checkIds(record([{ package: "pkg-a", docId: OFF, sameIds: true }]), ctx).failures).toEqual([]);
      expect(checkIds(record(undefined), ctx).failures).toEqual([]);
    });
    it("passes when the item lists the package under reprintsExcluded with a reason", () => {
      const r = record([{ package: "pkg-a", docId: OFF, sameIds: false, missing: [ACT] }],
        { reprintsExcluded: [{ package: "pkg-a", because: "an older edition of the document" }] });
      expect(checkIds(r, ctx).failures).toEqual([]);
    });
  });
});

describe("sources", () => {
  const withRule = (records, identifier) => records.map((r) => ({ ...r, identifier, verdict: "entry",
    rule: { handledIn: "table", adds: "x", entry: {}, origins: ["official"] } }));
  it("binds the document ids of an official item whose identifier is not the record's, alsoDocIds included", () => {
    const first = run({ official: [summary("official", OFF)] }).records;
    const kept = withRule(first, "ring-of-glimmer");
    const again = run({ official: [summary("official", OFF), summary("official", "Of99Of88Of77Of66")] }, kept).records[0];
    expect(again.identifier).toBe("ring-of-glimmer");
    expect(again.sources).toEqual({ [OFF]: "ring-of-glimmer", Of99Of88Of77Of66: "ring-of-glimmer" });
    expect(officialOf(again).identifierDiffers).toBeUndefined();
    expect(validateRecord(again)).toEqual([]);
  });
  it("flags a DDB Importer item (a world's id) as identifierDiffers instead of binding it", () => {
    const { records } = run({
      official: [summary("official", OFF)], "ddb-importer": [summary("ddb-importer", DDB, { identifier: "ddb-ring" })]
    });
    const [r] = records;
    expect(r.identifier).toBe("glimmer-ring");
    expect(r.sources).toBeUndefined();
    expect(r.items.find((i) => i.origin === "ddb-importer")).toMatchObject({ identifierDiffers: true });
    expect(officialOf(r).identifierDiffers).toBeUndefined();
  });
  it("neither binds nor flags items that share the identifier, and drops sources that no longer apply", () => {
    const { records } = run({ official: [summary("official", OFF)] });
    expect(records[0].sources).toBeUndefined();
    const stale = { ...records[0], sources: { [OFF]: "old" } };
    expect(run({ official: [summary("official", OFF)] }, [stale]).records[0].sources).toBeUndefined();
  });
  it("never binds a monster feature's docId (<actor>.<item>)", () => {
    const monster = { name: "Claw", kind: "monster", owner: "Wolf", section: "action", book: "TST", page: 1, edition: "2024",
      srd: false, text: "t", creatureIndex: 0 };
    const embedded = summary("official", "Ac00Ac11Ac22Ac33.Bb00Bb11Bb22Bb33", { name: "Claw", type: "feat", identifier: "claw-x" });
    const first = inventory({ book: "TST", kind: "monster", dataset: [monster], dumps: { official: [], "ddb-importer": [],
      actors: [{ id: "Ac00Ac11Ac22Ac33", name: "Wolf", items: [embedded] }] }, textDir, previous: [] }).records;
    expect(first[0].sources).toBeUndefined();
    const ruled = first.map((r) => ({ ...r, identifier: "claw", verdict: "code",
      rule: { handledIn: "code", adds: "x", origins: ["official"] } }));
    const again = inventory({ book: "TST", kind: "monster", dataset: [monster], dumps: { official: [], "ddb-importer": [],
      actors: [{ id: "Ac00Ac11Ac22Ac33", name: "Wolf", items: [embedded] }] }, textDir, previous: ruled }).records[0];
    expect(again.sources).toBeUndefined();
    expect(officialOf(again).identifierDiffers).toBe(true);
  });
});

describe("generate: SOURCES", () => {
  let dir, out;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "rs-gen-")); out = join(dir, "rules"); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const gated = (key, over = {}) => ({
    key, name: "Glimmer Ring", kind: "spell", book: "TST", page: 3, edition: "2024", identifier: "glimmer-ring", text: null,
    items: [], verdict: "entry", evidence: {}, legacy: true, legacyStatus: "pending",
    rule: { handledIn: "table", adds: "x", entry: { triggers: [] }, origins: ["official"] }, ...over
  });
  const write = (records) => {
    const registry = join(dir, "registry");
    saveBook(registry, { book: "TST", records });
    return registry;
  };
  it("is an empty object while no emitted rule binds sources", () => {
    expect(indexSource(["tst"])).toContain("export const SOURCES = Object.freeze({});");
  });
  it("lists the sources of the emitted rules, and only theirs", async () => {
    const { legacyFingerprint } = await import("../../tools/pipeline/registry.mjs");
    const bound = gated("tst:spell:glimmer-ring", { sources: { [OFF]: "glimmer-ring" } });
    const unruled = { ...gated("tst:spell:other", { identifier: "other", sources: { [DDB]: "other" } }), verdict: null };
    delete unruled.rule; delete unruled.legacy; delete unruled.legacyStatus;
    const registry = write([bound, unruled]);
    writeFileSync(join(registry, "legacy.json"), JSON.stringify({ [bound.key]: legacyFingerprint(bound) }));
    generate({ registry, out });
    const index = readFileSync(join(out, "index.mjs"), "utf8");
    expect(index).toContain(`"${OFF}": "glimmer-ring"`);
    expect(index).not.toContain(DDB);
    expect(generate({ registry, out, check: true }).differing).toEqual([]);
  });
});
