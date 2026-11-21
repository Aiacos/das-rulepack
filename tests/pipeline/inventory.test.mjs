import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { inventory } from "../../tools/pipeline/inventory.mjs";
import { textFingerprint } from "../../tools/pipeline/text.mjs";
import { validateRecord, keyOf } from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented spells.
const entry = (over = {}) => ({
  name: "Glimmer Bolt", book: "TST", page: 10, edition: "2024", srd: false, level: 2, school: "V",
  text: "A bolt of invented light.", ...over
});
const summary = (origin, over = {}) => ({
  origin, docId: `${origin}-doc`, identifier: "glimmer-bolt", name: "Glimmer Bolt", type: "spell", rules: "2024",
  activities: [{ id: "a1", type: "save", save: ["dex"], damageTypes: ["fire"] }],
  effects: [{ id: "e1", name: "Dazzled", statuses: ["blinded"] }], level: 2, school: "evo", data: `h-${origin}`, ...over
});
const dumps = (over = {}) => ({ official: [summary("official")], "ddb-importer": [summary("ddb-importer")], ...over });

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "inv-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));
const run = (over = {}) =>
  inventory({ book: "TST", kind: "spell", dataset: [entry()], dumps: dumps(), textDir, previous: [], ...over });

describe("inventory records", () => {
  it("creates one valid record per entry with the text fingerprint, never the text", () => {
    const { records, report } = run();
    expect(records).toHaveLength(1);
    const [r] = records;
    expect(validateRecord(r)).toEqual([]);
    expect(r).toMatchObject({
      key: keyOf({ book: "TST", kind: "spell", name: "Glimmer Bolt" }), name: "Glimmer Bolt", kind: "spell",
      book: "TST", page: 10, edition: "2024", verdict: null, evidence: {}
    });
    const sha = textFingerprint("A bolt of invented light.");
    expect(r.text).toEqual({ sha256: sha, source: "5etools", chars: 25 });
    expect(readFileSync(join(textDir, `${sha}.txt`), "utf8")).toBe("A bolt of invented light.");
    expect(JSON.stringify(r)).not.toContain("invented light");
    expect(report).toEqual({
      added: 1, kept: 0, skipped: 0, textChanged: [], dataChanged: [], ambiguous: [], noOfficial: [], differing: [],
      noPage: [], collisions: [], textVanished: [], vanished: [], pageChanged: [], resolutionStale: []
    });
  });

  it("lists matched origins official first, then ddb-importer, and plutonium unchecked", () => {
    const [r] = run().records;
    expect(r.items.map((i) => [i.origin, i.match])).toEqual([
      ["official", "matched"], ["ddb-importer", "matched"], ["plutonium", "unchecked"]
    ]);
    expect(r.items[0]).toEqual({
      origin: "official", match: "matched", identifier: "glimmer-bolt", docId: "official-doc",
      activities: ["a1"], effects: ["e1"], data: { sha256: "h-official" }
    });
  });

  it("omits absent origins but always keeps plutonium", () => {
    const [r] = run({ dumps: dumps({ official: [] }) }).records;
    expect(r.items.map((i) => i.origin)).toEqual(["ddb-importer", "plutonium"]);
  });

  it("takes the identifier from official, else ddb-importer, else the slug", () => {
    const off = summary("official", { identifier: "off-id" });
    const ddb = summary("ddb-importer", { identifier: "ddb-id" });
    expect(run({ dumps: { official: [off], "ddb-importer": [ddb] } }).records[0].identifier).toBe("off-id");
    expect(run({ dumps: { official: [], "ddb-importer": [ddb] } }).records[0].identifier).toBe("ddb-id");
    expect(run({ dumps: { official: [], "ddb-importer": [] } }).records[0].identifier).toBe("glimmer-bolt");
  });

  it("records an ambiguous origin with its candidates and reports it", () => {
    const twin = summary("official", { docId: "second", data: "h-other" });
    const { records, report } = run({ dumps: dumps({ official: [summary("official"), twin] }) });
    expect(records[0].items[0]).toMatchObject({
      origin: "official", match: "ambiguous", candidates: [{ identifier: "glimmer-bolt", docId: "official-doc" },
        { identifier: "glimmer-bolt", docId: "second" }]
    });
    expect(report.ambiguous).toEqual([records[0].key]);
    expect(report.noOfficial).toEqual([records[0].key]);
  });

  it("matches ddb-importer against the official item and reports mechanics differences", () => {
    const ddb = summary("ddb-importer", { level: 3 });
    const { records, report } = run({ dumps: dumps({ "ddb-importer": [ddb] }) });
    expect(records[0].items[1]).toMatchObject({ origin: "ddb-importer", match: "ambiguous", differences: ["level"] });
    expect(report.ambiguous).toEqual([records[0].key]);
    expect(report.noOfficial).toEqual([]);
  });

  it("keeps a structural difference visible on the matched item and in the report", () => {
    const ddb = summary("ddb-importer", { activities: [{ id: "z", type: "save", save: ["con"], damageTypes: ["fire"] }] });
    const { records, report } = run({ dumps: dumps({ "ddb-importer": [ddb] }) });
    expect(records[0].items[1]).toMatchObject({ origin: "ddb-importer", match: "matched", differences: ["saves"] });
    expect(validateRecord(records[0])).toEqual([]);
    expect(report.differing).toEqual([records[0].key]);
    expect(report.ambiguous).toEqual([]);
  });

  it("stores edition-unknown on an item whose edition the dump does not state", () => {
    const { records, report } = run({ dumps: dumps({ official: [summary("official", { rules: undefined })] }) });
    expect(records[0].items[0]).toMatchObject({ match: "matched", differences: ["edition-unknown"] });
    expect(report.differing).toEqual([records[0].key]);
  });

  it("omits differences when there are none and rejects a malformed field", () => {
    const [r] = run().records;
    expect("differences" in r.items[1]).toBe(false);
    const bad = { ...r, items: [{ ...r.items[0], differences: "saves" }, ...r.items.slice(1)] };
    expect(validateRecord(bad)).toContain("items[0].differences: must be an array of strings");
  });

  it("lists entries without an official item", () => {
    const { records, report } = run({ dumps: dumps({ official: [] }) });
    expect(report.noOfficial).toEqual([records[0].key]);
  });
});

describe("inventory over previous records", () => {
  it("is idempotent and preserves triage work", () => {
    const first = run().records;
    const worked = [{ ...first[0], verdict: "data", why: "table row", rule: { handledIn: "table", adds: "x", origins: [] },
      evidence: { reviewed: { agrees: true }, gates: { rule: "f", passed: ["schema"] } } }];
    const again = run({ previous: worked });
    expect(again.report).toEqual({
      added: 0, kept: 1, skipped: 0, textChanged: [], dataChanged: [], ambiguous: [], noOfficial: [], differing: [],
      noPage: [], collisions: [], textVanished: [], vanished: [], pageChanged: [], resolutionStale: []
    });
    expect(again.records).toEqual(worked);
  });

  it("drops the gates and reports a changed text", () => {
    const [prev] = run().records;
    const worked = { ...prev, verdict: "data", evidence: { reviewed: { agrees: true }, gates: { passed: ["text"] } } };
    const { records, report } = run({ previous: [worked], dataset: [entry({ text: "Changed invented text." })] });
    expect(report.textChanged).toEqual([prev.key]);
    expect(records[0].evidence).toEqual({ reviewed: { agrees: true } });
    expect(records[0].verdict).toBe("data");
    expect(records[0].text.sha256).toBe(textFingerprint("Changed invented text."));
  });

  it("drops the gates and reports changed item data", () => {
    const [prev] = run().records;
    const worked = { ...prev, evidence: { gates: { passed: ["ids"] } } };
    const changed = dumps({ official: [summary("official", { data: "other" })] });
    const { records, report } = run({ previous: [worked], dumps: changed });
    expect(report.dataChanged).toEqual([prev.key]);
    expect(report.textChanged).toEqual([]);
    expect(records[0].evidence).toEqual({});
  });

  it("appends a reprint to alsoIn of the existing record instead of duplicating it", () => {
    const [orig] = run({ book: "TST" }).records;
    const reprint = entry({ book: "TS2", page: 44 });
    const args = { book: "TS2", dataset: [reprint], previous: [orig] };
    const { records, report } = run(args);
    expect(records).toHaveLength(1);
    expect(records[0].book).toBe("TST");
    expect(records[0].alsoIn).toEqual([{ book: "TS2", page: 44 }]);
    expect(report.added).toBe(0);
    expect(run({ ...args, previous: records }).records[0].alsoIn).toEqual([{ book: "TS2", page: 44 }]);
    expect(orig.alsoIn).toBeUndefined();
  });

  it("keeps different editions as different entries", () => {
    const [orig] = run().records;
    const { records, report } = run({ book: "TS2", dataset: [entry({ book: "TS2", edition: "2014" })], previous: [orig],
      dumps: dumps({ official: [summary("official", { rules: "2014" })], "ddb-importer": [] }) });
    expect(report.added).toBe(1);
    expect(records).toHaveLength(2);
  });
});

describe("pipeline CLI", () => {
  const cli = (args, env = {}) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], {
    encoding: "utf8", env: { PATH: process.env.PATH, ...env }
  });

  it("exits 2 with usage for an unknown subcommand", () => {
    const r = cli(["nonsense"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage/i);
  });

  it("exits 2 for an unknown kind, naming what is supported (monster included)", () => {
    const r = cli(["inventory", "TST", "sense"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/spell, feat, option, feature, species, background, item, monster or all/);
    const m = cli(["inventory", "TST", "monster"]);
    expect(m.status).toBe(2);
    expect(m.stderr).toContain("RULEPACK_DATASET");
  });

  it("exits 2 naming a missing environment variable", () => {
    const r = cli(["inventory", "TST", "spell"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("RULEPACK_DATASET");
    const partial = cli(["inventory", "TST", "spell"], { RULEPACK_DATASET: "/x", RULEPACK_DUMPS: "/y" });
    expect(partial.status).toBe(2);
    expect(partial.stderr).toContain("RULEPACK_TEXT");
    expect(existsSync(join(process.cwd(), "registry", "tst.json"))).toBe(false);
  });
});

describe("pipeline CLI inventory on temporary folders", () => {
  let tmp, env;
  const write = (rel, data) => {
    const file = join(tmp, rel);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  };
  const book = (code) => write(`data/spells/spells-${code.toLowerCase()}.json`, {
    spell: [{ name: "Glimmer Bolt", page: code === "TCE" ? 10 : 44, level: 2, school: "V", entries: ["Invented light."] }]
  });
  const run = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  const registryFile = (code) => join(tmp, "registry", `${code.toLowerCase()}.json`);
  const read = (code) => JSON.parse(readFileSync(registryFile(code), "utf8"));

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "cli-"));
    env = {
      PATH: process.env.PATH, RULEPACK_DATASET: join(tmp, "data"), RULEPACK_DUMPS: join(tmp, "dumps"),
      RULEPACK_TEXT: join(tmp, "text"), RULEPACK_REGISTRY: join(tmp, "registry")
    };
    book("TCE");
    write("dumps/dnd-tashas-cauldron.spells.json", [{
      _id: "doc1", name: "Glimmer Bolt", type: "spell",
      system: { identifier: "glimmer-bolt", source: { rules: "2014" }, level: 2, school: "evo", activities: {} }
    }]);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("writes the book file on the first run", () => {
    const r = run(["inventory", "TCE", "spell"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ added: 1, kept: 0 });
    const { records } = read("TCE");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      key: "tce:spell:glimmer-bolt", page: 10, edition: "2014", identifier: "glimmer-bolt", state: "inventoried"
    });
    expect(records[0].items.map((i) => [i.origin, i.match])).toEqual([["official", "matched"], ["plutonium", "unchecked"]]);
    expect(existsSync(registryFile("TCE"))).toBe(true);
    expect(existsSync(join(process.cwd(), "registry", "tst.json"))).toBe(false);
  });

  it("takes official candidates from the book's own package only", () => {
    // The same document in an adventure that reprints it is not a second candidate; a book with no package has none.
    const doc = JSON.parse(readFileSync(join(tmp, "dumps", "dnd-tashas-cauldron.spells.json"), "utf8"));
    write("dumps/dnd-some-adventure.spells.json", doc);
    expect(run(["inventory", "TCE", "spell"]).status).toBe(0);
    expect(read("TCE").records[0].items.map((i) => [i.origin, i.match])).toEqual([
      ["official", "matched"], ["plutonium", "unchecked"]
    ]);
    write("data/spells/spells-nop.json", {
      spell: [{ name: "Other Glow", page: 1, level: 1, school: "V", entries: ["Invented."] }]
    });
    expect(run(["inventory", "NOP", "spell"]).status).toBe(0);
    expect(read("NOP").records[0].items.map((i) => i.origin)).toEqual(["plutonium"]);
  });

  it("rewrites nothing on a second identical run", () => {
    run(["inventory", "TCE", "spell"]);
    const old = new Date(2020, 0, 1);
    utimesSync(registryFile("TCE"), old, old);
    const bytes = readFileSync(registryFile("TCE"), "utf8");
    const r = run(["inventory", "TCE", "spell"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ added: 0, kept: 1 });
    expect(readFileSync(registryFile("TCE"), "utf8")).toBe(bytes);
    expect(statSync(registryFile("TCE")).mtimeMs).toBe(old.getTime());
  });

  it("records a reprint in the first book's file and writes no second file", () => {
    run(["inventory", "TCE", "spell"]);
    book("XGE");
    const r = run(["inventory", "XGE", "spell"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ added: 0 });
    expect(read("TCE").records[0].alsoIn).toEqual([{ book: "XGE", page: 44 }]);
    expect(existsSync(registryFile("XGE"))).toBe(false);
  });

  it("upper-cases the book code once: inventory xzz is inventory XZZ, and leaves the file byte-identical", () => {
    write("data/spells/spells-xzz.json", {
      spell: [{ name: "Other Glow", page: 3, level: 1, school: "V", entries: ["Invented."] }]
    });
    expect(run(["inventory", "XZZ", "spell"]).status).toBe(0);
    const bytes = readFileSync(registryFile("XZZ"), "utf8");
    expect(JSON.parse(bytes).book).toBe("XZZ");
    const again = run(["inventory", "xzz", "spell"]);
    expect(again.status, again.stderr).toBe(0);
    expect(readFileSync(registryFile("XZZ"), "utf8")).toBe(bytes);
  });

  it("exits 2 for a book code that does not match once upper-cased", () => {
    for (const code of ["x", "1AB", "AB-C", "ABCDEFGHIJK", "a b"]) {
      const r = run(["inventory", code, "spell"]);
      expect(r.status, code).toBe(2);
      expect(r.stderr).toMatch(/must match/);
    }
    expect(existsSync(join(tmp, "registry"))).toBe(false);
  });

  it("exits 2 for a dataset or dumps folder that does not exist", () => {
    for (const name of ["RULEPACK_DATASET", "RULEPACK_DUMPS"]) {
      const r = spawnSync("node", ["tools/pipeline/cli.mjs", "inventory", "TCE", "spell"], {
        encoding: "utf8", env: { ...env, [name]: join(tmp, "missing") }
      });
      expect(r.status).toBe(2);
      expect(r.stderr.trim().split("\n")).toHaveLength(1);
      expect(r.stderr).toContain(name);
    }
  });

  it("exits 2 for a book without entries in the dataset", () => {
    const r = run(["inventory", "NOPE", "spell"]);
    expect(r.status).toBe(2);
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
    expect(r.stderr).toContain("NOPE");
    write("data/spells/spells-emp.json", { spell: [] });
    expect(run(["inventory", "EMP", "spell"]).status).toBe(2);
    expect(existsSync(join(tmp, "registry"))).toBe(false);
  });
});
