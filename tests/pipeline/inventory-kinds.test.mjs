import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inventory } from "../../tools/pipeline/inventory.mjs";
import { ruleFromRecord } from "../../tools/pipeline/generate.mjs";
import { loadBook, ruleFingerprint, saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented entries and documents.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "dataset");
let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "invk-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const entry = (over = {}) => ({
  name: "Moss Stride", kind: "feat", book: "TST", page: 31, edition: "2024", srd: false, text: "Invented text.", ...over
});
const doc = (name, over = {}) => ({
  origin: "official", docId: `d-${name}`, identifier: "moss-stride", name, type: "feat", rules: "2024", activities: [],
  effects: [], data: "h", ...over
});
const run = (over = {}) => inventory({
  book: "TST", kind: "feat", dataset: [entry()], dumps: { official: [doc("Moss Stride")], "ddb-importer": [] }, textDir,
  previous: [], ...over
});

describe("inventory of the other kinds", () => {
  it("refuses a kind it cannot read", () => {
    expect(() => run({ kind: "unicorn" })).toThrow(/unicorn/);
    expect(() => run({ kind: "sense" })).toThrow(/sense/);
  });

  it("writes a valid record whose kind is the pipeline kind", () => {
    const { records } = run();
    expect(validateRecord(records[0])).toEqual([]);
    expect(records[0]).toMatchObject({ key: "tst:feat:moss-stride", kind: "feat", page: 31 });
    expect(records[0].items[0]).toMatchObject({ origin: "official", match: "matched" });
  });

  it("carries owner and level of a feature, rarity and copyOf of an item, and no spell level", () => {
    const feature = run({
      kind: "feature", dataset: [entry({ name: "Second Wind", kind: "feature", owner: "Zzfighter", level: 1 })],
      dumps: { official: [], "ddb-importer": [] }
    }).records[0];
    expect(feature).toMatchObject({ key: "tst:feature:zzfighter/1/second-wind", owner: "Zzfighter", level: 1 });
    const item = run({
      kind: "item",
      dataset: [entry({ name: "Glass Whistle (Copy)", kind: "item", rarity: "rare", copyOf: "Glass Whistle", text: "" })],
      dumps: { official: [], "ddb-importer": [] }
    }).records[0];
    expect(item).toMatchObject({ key: "tst:item:glass-whistle-copy", rarity: "rare", copyOf: "Glass Whistle", text: null });
    const spell = run({
      kind: "spell", dataset: [entry({ name: "Fireball", kind: "spell", level: 3, school: "V" })],
      dumps: { official: [], "ddb-importer": [] }
    }).records[0];
    expect(spell.key).toBe("tst:spell:fireball");
    expect("level" in spell).toBe(false);
  });

  it("gives an entry with empty text text: null and writes no cache file", () => {
    const { records } = run({ dataset: [entry({ text: "" })] });
    expect(records[0].text).toBeNull();
    expect(readdirSync(textDir)).toEqual([]);
  });

  it("accepts a missing page as null and lists the record under noPage", () => {
    const { records, report } = run({ dataset: [entry({ page: undefined })] });
    expect(records[0].page).toBeNull();
    expect(validateRecord(records[0])).toEqual([]);
    expect(report.noPage).toEqual([records[0].key]);
    expect(validateRecord({ ...records[0], page: 0 })).toContain("page: must be a positive integer or null");
  });

  it("generate refuses to emit a rule whose record has no page, naming the key", () => {
    const rule = { handledIn: "code", adds: "x", origins: [] };
    const gated = (page) => ({
      ...run().records[0], page, verdict: "code", rule, identifier: "moss-stride",
      evidence: {
        gates: { at: "t", core: "1", rule: ruleFingerprint(rule), passed: ["schema", "validator", "ids", "fixes", "text"] },
        reviewed: { by: "r", at: "t", agrees: true }
      }
    });
    expect(ruleFromRecord(gated(31)).page).toBe(31);
    expect(() => ruleFromRecord(gated(null))).toThrow(/tst:feat:moss-stride.*no page/);
  });

  it("skips a feature without an owner and counts it", () => {
    const { records, report } = run({
      kind: "feature", dataset: [entry({ name: "Orphan", kind: "feature", level: 3 })], dumps: { official: [], "ddb-importer": [] }
    });
    expect(records).toEqual([]);
    expect(report.skipped).toBe(1);
  });

  it("keeps a stored text fingerprint and the gates when the text is now empty, and lists the key", () => {
    const [first] = run().records;
    const worked = { ...first, evidence: { gates: { passed: ["text"] } } };
    const { records, report } = run({ previous: [worked], dataset: [entry({ text: "" })] });
    expect(records[0].text).toEqual(first.text);
    expect(records[0].evidence.gates).toEqual({ passed: ["text"] });
    expect(report.textVanished).toEqual([first.key]);
    expect(report.textChanged).toEqual([]);
  });

  it("lists a reprint without a page under noPage", () => {
    const [first] = run().records;
    const { report } = run({ book: "TS2", dataset: [entry({ book: "TS2", page: undefined })], previous: [first] });
    expect(report.noPage).toEqual([first.key]);
  });

  it("does not merge two entries with one key: the second gets no record and both are reported", () => {
    const { records, report } = run({ dataset: [entry({ page: 5 }), entry({ page: 9, text: "Other." })] });
    expect(records).toHaveLength(1);
    expect(records[0].page).toBe(5);
    expect(report.collisions).toEqual([{
      key: "tst:feat:moss-stride", entries: [{ name: "Moss Stride", page: 5 }, { name: "Moss Stride", page: 9 }]
    }]);
  });

  it("keeps the identifier of a record that has a rule, and refreshes the identifier of one without", () => {
    const [first] = run().records;
    const ruled = { ...first, identifier: "my-id", verdict: "code", rule: { handledIn: "code", adds: "x", origins: [] } };
    const dumps = { official: [doc("Moss Stride", { identifier: "official-id" })], "ddb-importer": [] };
    const again = run({ previous: [ruled], dumps });
    expect(again.records[0].identifier).toBe("my-id");
    expect(again.records[0].items[0].identifier).toBe("official-id");
    const plain = run({ previous: [first], dumps });
    expect(plain.records[0].identifier).toBe("official-id");
  });

  it("fails loudly when a known identity would now produce another key", () => {
    const [first] = run().records;
    expect(() => run({ previous: [{ ...first, key: "tst:feat:moss-stride-old" }] })).toThrow(/key never changes/);
  });
});

describe("pipeline CLI: inventory of every kind", () => {
  let tmp, env;
  const cli = (...args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  const registryFile = (code) => join(tmp, "registry", `${code.toLowerCase()}.json`);
  const records = (code) => JSON.parse(readFileSync(registryFile(code), "utf8")).records;
  const write = (rel, data) => {
    mkdirSync(dirname(join(tmp, rel)), { recursive: true });
    writeFileSync(join(tmp, rel), JSON.stringify(data));
  };

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "clik-"));
    env = {
      PATH: process.env.PATH, RULEPACK_DATASET: join(tmp, "data"), RULEPACK_DUMPS: join(tmp, "dumps"),
      RULEPACK_TEXT: join(tmp, "text"), RULEPACK_REGISTRY: join(tmp, "registry")
    };
    cpSync(FIXTURES, join(tmp, "data"), { recursive: true });
    write("data/spells/spells-xzz.json", { spell: [
      { name: "Glimmer Bolt", source: "XZZ", page: 10, level: 2, school: "V", entries: ["Invented light."] },
      { name: "Moss Whisper", source: "XZZ", page: 11, level: 1, school: "E", entries: ["Invented hush."] }
    ] });
    write("dumps/ddb.spells.json", [{
      _id: "ddbspell00000001", name: "Glimmer Bolt", type: "spell",
      system: { identifier: "glimmer-bolt", source: { rules: "2024" }, level: 2, school: "evo", activities: {} }
    }]);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("`all` runs the kinds in order and prints one report per kind, a kind without entries as { entries: 0 }", () => {
    const r = cli("inventory", "xzz", "all");
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(Object.keys(out)).toEqual(["spell", "feat", "option", "feature", "species", "background", "item", "monster"]);
    expect(out.monster).toMatchObject({ creatures: 4, copies: 2, added: 13 });
    expect(out.spell.added).toBe(2);
    expect(out.feat.added).toBe(2);
    expect(out.item.noPage).toBeDefined();
    const kinds = new Set(records("XZZ").map((x) => x.kind));
    expect([...kinds].sort()).toEqual(["background", "feat", "feature", "item", "monster", "option", "species", "spell"]);
    expect(records("XZZ").find((x) => x.name === "Glimmerkin Twin")).toMatchObject({ text: null, copyOf: "Glimmerkin" });
    write("data/optionalfeatures.json", { optionalfeature: [] });
    const again = JSON.parse(cli("inventory", "XZZ", "all").stdout);
    expect(again.option).toEqual({ entries: 0 });
  });

  it("inventories one kind, and exits 2 when the dataset has none of it for the book", () => {
    const r = cli("inventory", "XZZ", "background");
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).added).toBe(1);
    const none = cli("inventory", "NOPE", "feat");
    expect(none.status).toBe(2);
    expect(none.stderr).toContain("NOPE");
  });

  it("exits 2 for `all` only when every kind has zero entries", () => {
    const r = cli("inventory", "NOPE", "all");
    expect(r.status).toBe(2);
    expect(existsSync(join(tmp, "registry"))).toBe(false);
  });

  it("changes no spell record when `all` runs twice after verdicts were set (Review Focus 5)", () => {
    expect(cli("inventory", "XZZ", "spell").status).toBe(0);
    const dir = join(tmp, "registry");
    const book = loadBook(dir, "XZZ");
    saveBook(dir, {
      ...book, records: book.records.map((r, i) => ({
        ...r, verdict: i ? "none" : "entry", why: "decided", evidence: { triaged: { by: "reader-1", at: "2026-01-01T00:00:00Z" } },
        ...(i ? {} : { rule: { handledIn: "table", adds: "x", entry: { dataFixes: [] }, origins: ["ddb-importer"] } })
      }))
    });
    const spells = () => JSON.stringify(records("XZZ").filter((r) => r.kind === "spell"));
    const before = spells();
    expect(JSON.parse(before)).toHaveLength(2);
    for (let i = 0; i < 2; i += 1) {
      const r = cli("inventory", "XZZ", "all");
      expect(r.status, r.stderr).toBe(0);
      expect(spells()).toBe(before);
    }
    const third = readFileSync(registryFile("XZZ"), "utf8");
    expect(cli("inventory", "XZZ", "all").status).toBe(0);
    expect(readFileSync(registryFile("XZZ"), "utf8")).toBe(third);
  });

  it("reads the grants across every file of the package: a class document of one file grants a feature of another", () => {
    write("data/class/class-zzdruid.json", { classFeature: [
      { name: "Ember Drive", source: "TCE", page: 5, className: "Zzdruid", classSource: "TCE", level: 3, entries: ["Invented."] }
    ] });
    const feat = (id, name = "Ember Drive") => ({
      _id: id, name, type: "feat", effects: [], system: { identifier: "ember-drive", source: { rules: "2014" },
        type: { value: "class", subtype: "" }, activities: {} }
    });
    write("dumps/dnd-tashas-cauldron.features.json", [feat("featdoc000000001"), feat("featdoc000000002")]);
    write("dumps/dnd-tashas-cauldron.classes.json", [{
      _id: "classdoc00000001", name: "Zzdruid", type: "class", system: { identifier: "zzdruid", advancement: {
        a: { type: "ItemGrant", level: 3, configuration: { items: [{ uuid: "Compendium.x.features.Item.featdoc000000002" }] } }
      } }
    }]);
    const r = cli("inventory", "TCE", "feature");
    expect(r.status, r.stderr).toBe(0);
    const [record] = records("TCE").filter((x) => x.kind === "feature");
    expect(record.items.find((i) => i.origin === "official")).toMatchObject({ match: "matched", docId: "featdoc000000002" });
  });

  it("exits 1 on a key collision unless --allow-collisions is passed, and lists it in the report", () => {
    write("data/feats.json", { feat: [
      { name: "Twin Feat", source: "XZZ", page: 1, entries: ["One."] },
      { name: "Twin Feat", source: "XZZ", page: 2, entries: ["Two."] }
    ] });
    const r = cli("inventory", "XZZ", "feat");
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).collisions).toHaveLength(1);
    expect(r.stderr).toMatch(/allow-collisions/);
    // A refused run writes nothing at all.
    expect(existsSync(join(tmp, "registry"))).toBe(false);
    expect(cli("inventory", "XZZ", "feat", "--allow-collisions").status).toBe(0);
    expect(records("XZZ").filter((x) => x.name === "Twin Feat")).toHaveLength(1);
  });
});
