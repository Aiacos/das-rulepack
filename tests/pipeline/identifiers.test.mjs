import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aliasFor, GENERIC_IDENTIFIERS, monsterIdentifier } from "../../tools/pipeline/identifiers.mjs";
import { inventory } from "../../tools/pipeline/inventory.mjs";
import { checkIds, gateSchema } from "../../tools/pipeline/gates.mjs";
import { stateOf, validateRecord } from "../../tools/pipeline/registry.mjs";
import { ASSERT } from "./fixtures/assert.mjs";

// Synthetic fixtures only: invented creatures, spells and ids.
const OFF = "Of00Of11Of22Of33";
const DDB = "Db00Db11Db22Db33";
const ACT = "Ac00Ac11Ac22Ac33";
const WOLF = "Wo00Wo11Wo22Wo33";
const BEAR = "Be00Be11Be22Be33";
const BITE = "Bi00Bi11Bi22Bi33";

const matched = (origin, over = {}) => ({
  origin, match: "matched", identifier: "glimmer-bolt", docId: origin === "official" ? OFF : DDB, activities: [ACT],
  effects: [], data: { sha256: "0".repeat(64) }, ...over
});
const spell = (over = {}) => ({
  key: "tst:spell:glimmer-bolt", name: "Glimmer Bolt", kind: "spell", book: "TST", page: 3, edition: "2024", text: null,
  identifier: "glimmer-bolt", verdict: "entry", evidence: {}, items: [matched("official"), matched("ddb-importer")], ...over
});

describe("aliasFor", () => {
  it("alias filled from a differing DDB identifier", () => {
    const r = spell({ items: [matched("official"), matched("ddb-importer", { identifier: "glimmer-bolt-ddb" })] });
    expect(aliasFor(r, "ddb-importer", { coreIdentifiers: new Set() })).toEqual({ identifier: "glimmer-bolt-ddb" });
    // The origin that already carries the record's identifier needs none.
    expect(aliasFor(r, "official", { coreIdentifiers: new Set() })).toBeNull();
  });

  it("generic or empty identifier is uncovered", () => {
    for (const identifier of ["", "new-item", "spellcasting", "longsword", "Bite "]) {
      const r = spell({ items: [matched("official"), matched("ddb-importer", { identifier })] });
      const out = aliasFor(r, "ddb-importer", { coreIdentifiers: new Set() });
      expect(out.identifier).toBeUndefined();
      expect(out.uncovered).toMatch(/generic/);
    }
    expect(GENERIC_IDENTIFIERS.has("")).toBe(true);
    expect(GENERIC_IDENTIFIERS.has("multiattack")).toBe(true);
  });

  it("a DAS · Core identifier is never an alias; a monster's DDB Importer item never is either", () => {
    const r = spell({ items: [matched("official"), matched("ddb-importer", { identifier: "moon-glimmer" })] });
    expect(aliasFor(r, "ddb-importer", { coreIdentifiers: new Set(["moon-glimmer"]) }).uncovered).toMatch(/DAS · Core/);
    const m = monster({ items: [matched("ddb-importer", { identifier: "wolf-howl", docId: `${WOLF}.${BITE}` })] });
    expect(aliasFor(m, "ddb-importer", { coreIdentifiers: new Set() }).uncovered).toMatch(/DDB Importer/);
    expect(aliasFor(spell({ items: [] }), "official", {}).uncovered).toMatch(/no matched/);
  });
});

function monster(over = {}) {
  return {
    key: "tst:monster:dire-wolf/action/bite", name: "Bite", kind: "monster", owner: "Dire Wolf", section: "action", book: "TST",
    page: 9, edition: "2024", text: null, identifier: "bite", verdict: "entry", evidence: {}, items: [], ...over
  };
}

describe("monsterIdentifier", () => {
  it("monster identifier is book-creature-feature", () => {
    expect(monsterIdentifier(monster())).toBe("tst-dire-wolf-bite");
    expect(monsterIdentifier(monster({ name: "Rending Claw", occurrence: 2 }))).toBe("tst-dire-wolf-rending-claw-2");
  });
});

describe("inventory binds a ruled monster feature to its embedded item id", () => {
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "ids-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const feature = (owner, creatureIndex) => ({
    name: "Bite", kind: "monster", owner, section: "action", book: "TST", page: 9, edition: "2024", srd: false,
    text: `the ${owner} bites`, creatureIndex
  });
  const embedded = (actor) => ({
    origin: "official", docId: `${actor}.${BITE}`, identifier: "bite", name: "Bite", type: "weapon", rules: "2024",
    activities: [{ id: ACT, type: "attack", damageTypes: [] }], effects: [], data: `h-${actor}`
  });
  const run = (actors, dataset, previous = []) => inventory({
    book: "TST", kind: "monster", dataset, dumps: { official: [], "ddb-importer": [], actors }, textDir, previous
  });
  const rule = { handledIn: "table", assert: ASSERT, adds: "x", entry: { triggers: [{ fromActivity: ACT }] },
      origins: ["official"] };
  const ruled = (records, owner) => records.map((r) => (r.owner === owner
    ? { ...r, identifier: monsterIdentifier(r), verdict: "entry", rule: structuredClone(rule) } : r));

  it("unique embedded id binds a source", () => {
    const actors = [{ id: WOLF, name: "Dire Wolf", items: [embedded(WOLF)] }];
    const first = run(actors, [feature("Dire Wolf", 0)]).records;
    expect(first[0].sources).toBeUndefined();
    const [again] = run(actors, [feature("Dire Wolf", 0)], ruled(first, "Dire Wolf")).records;
    expect(again.identifier).toBe("tst-dire-wolf-bite");
    expect(again.sources).toEqual({ [BITE]: "tst-dire-wolf-bite" });
    const official = again.items.find((i) => i.origin === "official");
    expect(official.identifierDiffers).toBeUndefined();
    expect(official.embeddedShared).toBeUndefined();
    expect(gateSchema(again)).toEqual([]);
    expect(checkIds(again, { core: { vocabulary: new Set() } }).failures).toEqual([]);
  });

  it("shared embedded id stays drafted", () => {
    const actors = [
      { id: WOLF, name: "Dire Wolf", items: [embedded(WOLF)] }, { id: BEAR, name: "Cave Bear", items: [embedded(BEAR)] }
    ];
    const dataset = [feature("Dire Wolf", 0), feature("Cave Bear", 1)];
    const first = run(actors, dataset).records;
    const next = run(actors, dataset, ruled(first, "Dire Wolf")).records;
    const wolf = next.find((r) => r.owner === "Dire Wolf");
    const bear = next.find((r) => r.owner === "Cave Bear");
    expect(wolf.sources).toBeUndefined();
    expect(wolf.items.find((i) => i.origin === "official")).toMatchObject({ embeddedShared: true, identifierDiffers: true });
    expect(validateRecord(wolf)).toEqual([]);
    // No source is bound (the bare-name case, where the fixture does not scope the identifier: identifiers-gates.test.mjs).
    expect(next.flatMap((r) => Object.values(r.sources ?? {}))).toEqual([]);
    expect(checkIds(wolf, { core: { vocabulary: new Set() } }).failures)
      .toContain("ids: shared embedded item id: waits on upstream (engine: actor.item sources, refused by external registration)");
    expect(stateOf(wolf)).toBe("drafted");
    // An unruled feature is not marked: only a rule needs the binding.
    expect(bear.items.find((i) => i.origin === "official").embeddedShared).toBeUndefined();
  });
});
