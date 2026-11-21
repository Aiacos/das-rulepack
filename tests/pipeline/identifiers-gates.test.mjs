import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monsterIdentifier, reaches, unaccountedOrigins } from "../../tools/pipeline/identifiers.mjs";
import { inventory } from "../../tools/pipeline/inventory.mjs";
import { checkIds, gateSchema, gateUnique, runGates } from "../../tools/pipeline/gates.mjs";
import { legacyFingerprint, ruleFingerprint } from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented creatures, spells and ids. Fix round 1 of Task 2: a rule must never be registered under a
// bare or generic identifier, whatever a later task does or forgets.
const ACT = "Ac00Ac11Ac22Ac33";
const A_DDB = "Ad00Ad11Ad22Ad33";
const OFF = "Of00Of11Of22Of33";
const DDB = "Db00Db11Db22Db33";
const WOLF = "Wo00Wo11Wo22Wo33";
const BEAR = "Be00Be11Be22Be33";
const BITE = "Bi00Bi11Bi22Bi33";

const stubCore = {
  version: "9.9.9", facts: [], vocabulary: new Set(), identifiers: new Set(["moon-glimmer"]), validateEntry: () => []
};
const ci = (over = {}) => ({ core: stubCore, documents: {}, ci: true, legacy: new Map(), ...over });
const failuresOf = (records, context) => runGates(records, context).failures;

describe("a ruled monster feature is registered under its creature-scoped identifier only", () => {
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "idg-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const feature = (owner, creatureIndex) => ({
    name: "Bite", kind: "monster", owner, section: "action", book: "TST", page: 9, edition: "2024", srd: false,
    text: `the ${owner} bites`, creatureIndex
  });
  const embedded = (actor) => ({
    origin: "official", docId: `${actor}.${BITE}`, identifier: "bite", name: "Bite", type: "weapon", rules: "2024",
    activities: [{ id: ACT, type: "attack", damageTypes: [] }], effects: [], data: `h-${actor}`
  });
  const shared = [
    { id: WOLF, name: "Dire Wolf", items: [embedded(WOLF)] }, { id: BEAR, name: "Cave Bear", items: [embedded(BEAR)] }
  ];
  const dataset = [feature("Dire Wolf", 0), feature("Cave Bear", 1)];
  const run = (actors, previous = []) => inventory({
    book: "TST", kind: "monster", dataset: dataset.filter((f) => actors.some((a) => a.name === f.owner)),
    dumps: { official: [], "ddb-importer": [], actors }, textDir, previous
  });
  const rule = { handledIn: "table", adds: "x", entry: { triggers: [{ fromActivity: ACT }] }, origins: ["official"] };
  // The fixture rules the feature WITHOUT touching its identifier, unless told to scope it.
  const ruleWolf = (records, scope) => records.map((r) => (r.owner === "Dire Wolf"
    ? { ...r, ...(scope ? { identifier: monsterIdentifier(r) } : {}), verdict: "entry", rule: structuredClone(rule) } : r));

  it("bare identifier and a shared embedded id: fails the schema (also under --ci), binds nothing, is marked shared", () => {
    const first = run(shared).records;
    const next = run(shared, ruleWolf(first, false)).records;
    const wolf = next.find((r) => r.owner === "Dire Wolf");
    expect(wolf.identifier).toBe("bite");
    expect(next.flatMap((r) => Object.keys(r.sources ?? {}))).toEqual([]);
    expect(wolf.items.find((i) => i.origin === "official").embeddedShared).toBe(true);
    expect(gateSchema(wolf).join("\n")).toMatch(/monster feature .* tst-dire-wolf-bite/);
    expect(failuresOf(next, ci())[wolf.key].schema.join("\n")).toMatch(/tst-dire-wolf-bite/);
  });

  it("bare identifier and a unique embedded id: still fails", () => {
    const alone = shared.slice(0, 1);
    const next = run(alone, ruleWolf(run(alone).records, false)).records;
    expect(gateSchema(next[0]).join("\n")).toMatch(/tst-dire-wolf-bite/);
  });

  it("scoped identifier and a unique embedded id: passes and binds the source", () => {
    const alone = shared.slice(0, 1);
    const [wolf] = run(alone, ruleWolf(run(alone).records, true)).records;
    expect(wolf.sources).toEqual({ [BITE]: "tst-dire-wolf-bite" });
    expect(gateSchema(wolf)).toEqual([]);
    expect(checkIds(wolf, { core: stubCore }).failures).toEqual([]);
  });

  it("scoped identifier and a shared embedded id: no source, and the gate says it waits on upstream (also under --ci)", () => {
    const next = run(shared, ruleWolf(run(shared).records, true)).records;
    const wolf = next.find((r) => r.owner === "Dire Wolf");
    expect(wolf.sources).toBeUndefined();
    expect(wolf.items.find((i) => i.origin === "official").embeddedShared).toBe(true);
    expect(checkIds(wolf, { core: stubCore }).failures.join("\n")).toMatch(/waits on upstream/);
    expect(failuresOf(next, ci())[wolf.key].schema.join("\n")).toMatch(/waits on upstream/);
  });
});

const item = (origin, identifier, activities) => ({
  origin, match: "matched", identifier, docId: origin === "official" ? OFF : DDB, activities, effects: [],
  data: { sha256: "0".repeat(64) }
});
const spell = (alsoAs, { ddbIdentifier = "glimmer-bolt", origins = ["official", "ddb-importer"], over = {} } = {}) => ({
  key: "tst:spell:glimmer-bolt", name: "Glimmer Bolt", kind: "spell", book: "TST", page: 3, edition: "2024", text: null,
  identifier: "glimmer-bolt", verdict: "entry", evidence: {},
  items: [item("official", "glimmer-bolt", [ACT]), item("ddb-importer", ddbIdentifier, [A_DDB])],
  rule: { handledIn: "table", adds: "x", entry: { saveDamage: { [ACT]: "half", [A_DDB]: "half" } }, origins, alsoAs },
  ...over
});
const alias = (identifier, origin = "ddb-importer") => [{ identifier, origin }];

describe("every alias is gated (record only: it holds under --ci)", () => {
  it("a generic alias fails, even when the item carries it", () => {
    for (const id of ["multiattack", "longsword", "new-item"]) {
      const r = spell(alias(id), { ddbIdentifier: id });
      expect(gateSchema(r).join("\n")).toMatch(new RegExp(`${id}.*generic`));
      expect(failuresOf([r], ci())[r.key].schema).toBeDefined();
    }
  });

  it("an alias that no matched item of its origin carries fails", () => {
    const r = spell(alias("fireball"));
    expect(gateSchema(r).join("\n")).toMatch(/fireball.*not the identifier of the matched ddb-importer item/);
    expect(failuresOf([r], ci())[r.key].schema).toBeDefined();
  });

  it("an alias for an origin the rule does not name fails", () => {
    const r = spell(alias("glimmer-bolt-ddb"), { ddbIdentifier: "glimmer-bolt-ddb", origins: ["official"] });
    expect(gateSchema(r).join("\n")).toMatch(/ddb-importer is not in rule.origins/);
  });

  it("the alias the item carries passes", () => {
    const r = spell(alias("glimmer-bolt-ddb"), { ddbIdentifier: "glimmer-bolt-ddb" });
    expect(gateSchema(r)).toEqual([]);
    expect(failuresOf([r], ci())[r.key]?.schema).toBeUndefined();
  });

  it("a monster feature has no alias: DDB Importer monster features are always uncovered", () => {
    const m = {
      key: "tst:monster:dire-wolf/action/howl", name: "Howl", kind: "monster", owner: "Dire Wolf", section: "action",
      book: "TST", page: 9, edition: "2024", text: null, identifier: "tst-dire-wolf-howl", verdict: "entry", evidence: {},
      items: [{ ...item("ddb-importer", "dire-howl", [A_DDB]), docId: `${WOLF}.${DDB}` }],
      rule: { handledIn: "table", adds: "x", entry: { saveDamage: { [A_DDB]: "half" } }, origins: ["ddb-importer"],
        alsoAs: alias("dire-howl") }
    };
    expect(gateSchema(m).join("\n")).toMatch(/monster feature.*alias/);
  });

  it("an alias equal to a DAS · Core identifier fails even with inCore", () => {
    const r = spell(alias("moon-glimmer"), { ddbIdentifier: "moon-glimmer" });
    r.rule.inCore = true;
    expect(gateUnique([r], { core: stubCore }).join("\n")).toMatch(/moon-glimmer is a DAS · Core identifier/);
  });

  it("reaches() honours the alias's origin", () => {
    const r = spell([{ identifier: "glimmer-bolt-ddb", origin: "official" }], { ddbIdentifier: "glimmer-bolt-ddb" });
    expect(reaches(r, r.items[1])).toBe(false);
    r.rule.alsoAs[0].origin = "ddb-importer";
    expect(reaches(r, r.items[1])).toBe(true);
  });
});

describe("a ruled record's own identifier", () => {
  it("fails when it is generic, whatever the engine knows", () => {
    const r = spell(undefined, { ddbIdentifier: "longsword", over: { identifier: "longsword" } });
    r.items[0].identifier = "longsword";
    delete r.rule.alsoAs;
    expect(gateSchema(r).join("\n")).toMatch(/longsword is a generic identifier/);
    expect(failuresOf([r], ci())[r.key].schema).toBeDefined();
  });
});

describe("legacy records: R5 exemption made visible", () => {
  it("notes a matched origin neither listed nor uncovered, without changing the gate evidence", () => {
    const r = spell(undefined, { origins: ["ddb-importer"], over: { legacy: true, legacyStatus: "validated" } });
    delete r.rule.alsoAs;
    r.rule.entry = { saveDamage: { [A_DDB]: "half" } };
    expect(unaccountedOrigins(r)).toEqual(["official"]);
    const legacy = new Map([[r.key, legacyFingerprint(r)]]);
    const local = { core: stubCore, documents: {}, ci: false, legacy, textDir: tmpdir() };
    const { notes, failures, updated } = runGates([r], local);
    expect(failures[r.key]?.ids).toBeUndefined();
    expect(notes[r.key].coverage).toEqual(["coverage: official is matched but neither in origins nor uncovered (legacy)"]);
    const gates = updated[0].evidence.gates;
    expect(gates.passed).toContain("ids");
    expect(gates.noted ?? []).not.toContain("coverage");
    expect(gates.rule).toBe(ruleFingerprint(r.rule));
    expect(runGates([r], { ...local, ci: true }).notes[r.key].coverage).toHaveLength(1);
  });
});
