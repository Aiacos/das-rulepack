import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkFixes, checkIds, gateSchema, gateUnique, idsIn, runGates } from "../../tools/pipeline/gates.mjs";
import { legacyFingerprint, ruleFingerprint, saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";
import { generate } from "../../tools/pipeline/generate.mjs";
import { ASSERT } from "./fixtures/assert.mjs";

// Synthetic fixtures only: invented spells and invented ids.
const OFF = "Of00Of11Of22Of33";
const DDB = "Db00Db11Db22Db33";
const A_OFF = "Ao00Ao11Ao22Ao33";
const A_DDB = "Ad00Ad11Ad22Ad33";
const NOPE = "Qq11Ww22Ee33Rr44";

const core = { vocabulary: new Set(), identifiers: new Set(["moon-glimmer"]) };
const item = (origin, activities, over = {}) => ({
  origin, match: "matched", identifier: "glimmer-bolt", docId: origin === "official" ? OFF : DDB, activities, effects: [],
  data: { sha256: "0".repeat(64) }, ...over
});
const rec = (entry, origins, over = {}) => ({
  key: "tst:spell:glimmer-bolt", name: "Glimmer Bolt", kind: "spell", book: "TST", page: 3, edition: "2024", text: null,
  identifier: "glimmer-bolt", verdict: "entry", evidence: {},
  items: [item("official", [A_OFF]), item("ddb-importer", [A_DDB]), { origin: "plutonium", match: "unchecked" }],
  rule: { handledIn: "table", assert: ASSERT, adds: "x", entry, origins }, ...over
});
const sideBySide = { saveDamage: { [A_OFF]: "half", [A_DDB]: "half" } };

describe("ids gate (Ruling R4, R5)", () => {
  it("side-by-side ids pass", () => {
    expect(checkIds(rec(sideBySide, ["official", "ddb-importer"]), { core }).failures).toEqual([]);
  });

  it("id of no origin fails", () => {
    const entry = { saveDamage: { [A_OFF]: "half", [A_DDB]: "half", [NOPE]: "half" } };
    expect(checkIds(rec(entry, ["official", "ddb-importer"]), { core }).failures)
      .toEqual([`ids: ${NOPE} belongs to no origin of the rule`]);
  });

  it("an origin listed in origins that contributes no id fails", () => {
    const r = rec({ saveDamage: { [A_OFF]: "half" } }, ["official", "ddb-importer"]);
    expect(checkIds(r, { core }).failures).toEqual(["ids: ddb-importer contributes no id"]);
  });

  it("matched origin unaccounted fails; uncovered accounts for it", () => {
    const r = rec({ saveDamage: { [A_OFF]: "half" } }, ["official"]);
    expect(checkIds(r, { core }).failures).toEqual(["ids: ddb-importer is matched but neither in origins nor uncovered"]);
    r.rule.uncovered = [{ origin: "ddb-importer", because: "the imported item has no save activity" }];
    expect(validateRecord(r)).toEqual([]);
    expect(checkIds(r, { core }).failures).toEqual([]);
  });

  it("an origin whose item identifier differs is reached only by a source or an alias", () => {
    const r = rec(sideBySide, ["official", "ddb-importer"]);
    r.items[1] = item("ddb-importer", [A_DDB], { identifier: "glimmer-bolt-ddb", identifierDiffers: true });
    expect(checkIds(r, { core }).failures)
      .toEqual(["ids: ddb-importer item identifier glimmer-bolt-ddb is not reached (no source, no alias)"]);
    r.rule.alsoAs = [{ identifier: "glimmer-bolt-ddb", origin: "ddb-importer" }];
    expect(validateRecord(r)).toEqual([]);
    expect(checkIds(r, { core }).failures).toEqual([]);
    const bound = rec(sideBySide, ["official", "ddb-importer"], { sources: { [OFF]: "glimmer-bolt" } });
    bound.items[0] = item("official", [A_OFF], { identifier: "bolt-of-glimmer" });
    expect(checkIds(bound, { core }).failures).toEqual([]);
  });

  it("idsIn finds ids in #id, a/b and @UUID strings", () => {
    const entry = {
      a: `#${A_OFF}`, b: `${A_DDB}/${NOPE}`, c: `@UUID[Compendium.pkg.spells.Item.${OFF}.Activity.${DDB}]{Glimmer}`,
      d: "1d6/2", e: "ab-cd"
    };
    expect(idsIn(entry)).toEqual([A_OFF, A_DDB, NOPE, OFF, DDB].sort());
  });

  it("fix without from on a missing path fails", () => {
    const doc = { system: { target: { affects: { type: "creature" } } } };
    const stub = {
      getPath: (o, p) => String(p).split(".").reduce((x, k) => (x == null ? undefined : x[k]), o),
      matchesFrom: (a, b) => JSON.stringify(a) === JSON.stringify(b)
    };
    const r = rec({ dataFixes: [{ path: "system.target.afects.type", value: "ally" }] }, ["official"]);
    r.rule.uncovered = [{ origin: "ddb-importer", because: "x" }];
    const context = { core: stub, documents: { official: { [OFF]: doc } } };
    expect(checkFixes(r, context).failures).toEqual(["fixes: system.target.afects.type does not exist"]);
    r.rule.entry.dataFixes[0].path = "system.target.affects.type";
    expect(checkFixes(r, context).failures).toEqual([]);
  });
});

describe("unique gate: identifiers and aliases", () => {
  const other = (over = {}) => rec(sideBySide, ["official", "ddb-importer"], {
    key: "tst:spell:dusk-bolt", name: "Dusk Bolt", identifier: "dusk-bolt", ...over
  });

  it("alias equal to a Core identifier fails unique", () => {
    const r = rec(sideBySide, ["official", "ddb-importer"]);
    r.rule.alsoAs = [{ identifier: "moon-glimmer", origin: "ddb-importer" }];
    expect(gateUnique([r], { core })).toEqual(["unique: tst:spell:glimmer-bolt: moon-glimmer is a DAS · Core identifier"
      + " (an entry there would be patched for every item of that name; set rule.inCore only on purpose)"]);
    // inCore is for the record's own identifier (a person's decision); an alias never patches Core.
    r.rule.inCore = true;
    expect(gateUnique([r], { core })).toHaveLength(1);
    const own = rec(sideBySide, ["official", "ddb-importer"], { identifier: "moon-glimmer" });
    expect(gateUnique([own], { core })).toHaveLength(1);
    own.rule.inCore = true;
    expect(gateUnique([own], { core })).toEqual([]);
  });

  it("two rules sharing an alias fail unique", () => {
    const a = rec(sideBySide, ["official", "ddb-importer"]);
    a.rule.alsoAs = [{ identifier: "bolt-glimmer", origin: "ddb-importer" }];
    const b = other();
    b.rule.alsoAs = [{ identifier: "bolt-glimmer", origin: "ddb-importer" }];
    expect(gateUnique([a, b], { core })).toEqual(["unique: tst:spell:glimmer-bolt and tst:spell:dusk-bolt share the identifier"
      + " bolt-glimmer"]);
    // An alias equal to another rule's own identifier collides too.
    b.rule.alsoAs = [{ identifier: "glimmer-bolt", origin: "ddb-importer" }];
    expect(gateUnique([a, b], { core })).toHaveLength(1);
    const { failures } = runGates([a, b], { core: { ...core, validateEntry: () => [], facts: [] }, ci: true, legacy: new Map() });
    expect(failures[a.key].unique).toHaveLength(1);
  });

  it("the schema refuses an alias that is the record's own identifier, a duplicate, or an unknown origin", () => {
    const r = rec(sideBySide, ["official", "ddb-importer"]);
    r.rule.alsoAs = [{ identifier: "glimmer-bolt", origin: "official" }];
    expect(validateRecord(r).join()).toMatch(/alsoAs/);
    r.rule.alsoAs = [{ identifier: "x-y", origin: "official" }, { identifier: "x-y", origin: "ddb-importer" }];
    expect(validateRecord(r).join()).toMatch(/alsoAs/);
    r.rule.alsoAs = [{ identifier: "x-y", origin: "foundry" }];
    expect(validateRecord(r).join()).toMatch(/alsoAs/);
    r.rule.alsoAs = [];
    r.rule.uncovered = [{ origin: "official", because: "line one\nline two" }];
    expect(validateRecord(r).join()).toMatch(/uncovered/);
  });
});

describe("generate: aliases", () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "gates-ids-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("registers the entry under each alias, and says which origins are not covered", async () => {
    const r = rec(sideBySide, ["official", "ddb-importer"], { legacy: true, legacyStatus: "pending" });
    r.rule.alsoAs = [{ identifier: "glimmer-bolt-ddb", origin: "ddb-importer" }];
    r.items[1].identifier = "glimmer-bolt-ddb";
    // A second rule covers one origin and says why the other is not: both are records the live gates accept.
    const narrow = rec({ saveDamage: { [A_OFF]: "half" } }, ["official"], {
      key: "tst:spell:dusk-bolt", name: "Dusk Bolt", identifier: "dusk-bolt", legacy: true, legacyStatus: "pending"
    });
    narrow.items = narrow.items.map((i) => ({ ...i, identifier: "dusk-bolt" }));
    narrow.rule.uncovered = [{ origin: "ddb-importer", because: "the imported item has no save" }];
    for (const x of [r, narrow]) {
      expect(gateSchema(x)).toEqual([]);
      expect(checkIds(x, { core }).failures).toEqual([]);
    }
    expect(gateUnique([r, narrow], { core })).toEqual([]);
    const registry = join(dir, "registry");
    saveBook(registry, { book: "TST", records: [r, narrow] });
    writeFileSync(join(registry, "legacy.json"),
      JSON.stringify({ [r.key]: legacyFingerprint(r), [narrow.key]: legacyFingerprint(narrow) }));
    const out = join(dir, "rules");
    mkdirSync(out);
    copyFileSync(new URL("../../scripts/rules/book.mjs", import.meta.url), join(out, "book.mjs"));
    generate({ registry, out });
    const { TABLE, RULES } = await import(pathToFileURL(join(out, "index.mjs")).href);
    const byId = Object.fromEntries(RULES.map((x) => [x.identifier, x]));
    expect(byId["glimmer-bolt"].alsoAs).toEqual(["glimmer-bolt-ddb"]);
    expect(byId["dusk-bolt"].uncovered).toEqual([{ origin: "ddb-importer", because: "the imported item has no save" }]);
    expect(Object.keys(TABLE).sort()).toEqual(["dusk-bolt", "glimmer-bolt", "glimmer-bolt-ddb"]);
    expect(TABLE["glimmer-bolt-ddb"]).toEqual(TABLE["glimmer-bolt"]);
    expect(ruleFingerprint(r.rule)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the 24 legacy rules still register the same table", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const out = join(dir, "rules");
    cpSync(join(root, "scripts", "rules"), out, { recursive: true });
    const before = readdirSync(join(out, "books")).map((f) => readFileSync(join(out, "books", f), "utf8"));
    expect(generate({ registry: join(root, "registry"), out, check: true }).differing).toEqual([]);
    expect(readdirSync(join(out, "books")).map((f) => readFileSync(join(out, "books", f), "utf8"))).toEqual(before);
  });
});
