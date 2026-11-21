// The whole pipeline on temporary folders, one child process per step, with the real engine (DAS_CORE):
// inventory -> triage -> batch -> ingest (every reader verdict) -> gates -> generate --check. Each step is run twice: the
// second run changes nothing. Synthetic fixtures only: invented spells, invented texts, invented ids.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadBook, saveBook } from "../../tools/pipeline/registry.mjs";
import { ASSERT, PERSON } from "./fixtures/assert.mjs";

const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/content.mjs"))
  ? process.env.DAS_CORE : null;

const ACT = "Qz12Wx34Ec56Rv78";
const VERDICTS = ["data", "none", "entry", "code", "engine", "unverifiable"];
const NAMES = ["Quill Spark", "Moss Whisper", "Tide Clasp", "Ember Knot", "Hollow Chime", "Pale Lantern"];
const slugOf = (name) => name.toLowerCase().replace(/ /g, "-");
const keyOf = (name) => `xzz:spell:${slugOf(name)}`;

describe.skipIf(!CORE_DIR && !process.env.CI)("pipeline end to end", () => {
  let tmp, env, registry, batches, results;
  const run = (...args) => spawnSync("node", [resolve("tools/pipeline/cli.mjs"), ...args], { encoding: "utf8", env });
  // Every file of the folders a step may write, with its bytes.
  const files = (dir) => readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)]));
  const snapshot = () => Object.fromEntries([registry, batches, env.RULEPACK_RULES, env.RULEPACK_TEXT].filter(existsSync)
    .flatMap(files).map((f) => [f, readFileSync(f, "utf8")]));
  const twice = (args, status) => {
    const first = run(...args);
    expect(first.status, `${args.join(" ")}: ${first.stderr}`).toBe(status);
    const before = snapshot();
    const second = run(...args);
    expect(second.status, `${args.join(" ")} (again): ${second.stderr}`).toBe(status);
    expect(snapshot(), `${args.join(" ")} (again) changed a file`).toEqual(before);
    return first;
  };

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "e2e-"));
    registry = join(tmp, "registry");
    batches = join(tmp, "batches");
    results = join(tmp, "results");
    env = {
      PATH: process.env.PATH, DAS_CORE: CORE_DIR, RULEPACK_REGISTRY: registry, RULEPACK_DATASET: join(tmp, "data"),
      RULEPACK_DUMPS: join(tmp, "dumps"), RULEPACK_TEXT: join(tmp, "text"), RULEPACK_RULES: join(tmp, "rules")
    };
    mkdirSync(join(tmp, "data", "spells"), { recursive: true });
    mkdirSync(join(tmp, "dumps"), { recursive: true });
    mkdirSync(results, { recursive: true });
    const spell = (name, i) => ({ name, page: 10 + i, level: 1, school: "V", entries: [`Invented text number ${i} of ${name}.`] });
    writeFileSync(join(tmp, "data", "spells", "spells-xzz.json"), JSON.stringify({ spell: NAMES.map(spell) }));
    const doc = (name, i) => ({
      _id: `Dz00Cx11Bv22An${String(i).padStart(2, "0")}`, name, type: "spell", effects: [],
      system: {
        identifier: slugOf(name), source: { rules: "2014" }, level: 1, school: "evo",
        activities: { [ACT]: { type: "save", activation: { type: "action" }, save: { ability: ["dex"] } } }
      }
    });
    writeFileSync(join(tmp, "dumps", "ddb.spells.json"), JSON.stringify(NAMES.map(doc)));
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("inventory, triage, batch, ingest, gates and generate, each idempotent", () => {
    const inv = JSON.parse(twice(["inventory", "xzz", "spell"], 0).stdout);
    expect(inv).toMatchObject({ added: NAMES.length });
    expect(loadBook(registry, "XZZ").records.every((r) => r.book === "XZZ")).toBe(true);

    twice(["triage", "XZZ"], 0);
    expect(loadBook(registry, "XZZ").records.every((r) => r.verdict === null)).toBe(true);

    expect(run("batch", "triage", "XZZ", "--out", batches).status).toBe(0);
    expect(readdirSync(batches)).toEqual(["xzz-triage-001.json"]);
    // Again: the first batch stays as it is and the new one gets the next number (an id is never reused).
    const kept = readFileSync(join(batches, "xzz-triage-001.json"), "utf8");
    expect(run("batch", "triage", "XZZ", "--out", batches).status).toBe(0);
    expect(readFileSync(join(batches, "xzz-triage-001.json"), "utf8")).toBe(kept);
    expect(readdirSync(batches)).toEqual(["xzz-triage-001.json", "xzz-triage-002.json"]);
    rmSync(join(batches, "xzz-triage-002.json"));
    const batch = JSON.parse(readFileSync(join(batches, "xzz-triage-001.json"), "utf8"));
    expect(batch.entries.map((e) => e.key).sort()).toEqual(NAMES.map(keyOf).sort());

    // What a reader would write: one verdict of each kind a reader may return.
    const file = join(results, "xzz-triage-001.results.json");
    writeFileSync(file, JSON.stringify({
      batch: batch.id, by: "reader-1", results: NAMES.map((name, i) => ({
        key: keyOf(name), verdict: VERDICTS[i], why: `Decided in my own words, case ${i}.`, confidence: 0.9,
        ...(VERDICTS[i] === "entry" ? { keys: ["dataFixes"] } : {})
      }))
    }));
    const first = run("ingest", file);
    expect(first.status, first.stderr).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ applied: 5, queued: 1, rejected: [] });
    const before = snapshot();
    // Again: the applied ones already have a verdict (rejected, exit 1), the queued one is queued again; nothing changes.
    const again = run("ingest", file);
    expect(again.status).toBe(1);
    expect(JSON.parse(again.stdout)).toMatchObject({ applied: 0, queued: 1 });
    expect(snapshot()).toEqual(before);
    const queue = JSON.parse(readFileSync(join(registry, "queue.json"), "utf8"));
    expect(queue.map((q) => [q.key, q.reason])).toEqual([[keyOf("Hollow Chime"), "engine"]]);

    // A person drafts the rule of the `entry` record (drafting is not built yet).
    const book = loadBook(registry, "XZZ");
    const fix = { path: `system.activities.${ACT}.activation.type`, value: "bonus", from: "action" };
    // A data fix on the DDB Importer item is a person's (drafters fix the official item only): signed `evidence.person`.
    const records = book.records.map((r) => (r.key !== keyOf("Tide Clasp") ? r : {
      ...r, evidence: { ...r.evidence, person: PERSON },
      rule: { handledIn: "table", assert: ASSERT, adds: "Cast as a bonus action.", entry: { dataFixes: [fix] },
        origins: ["ddb-importer"] }
    }));
    saveBook(registry, { ...book, records });

    twice(["gates"], 0);
    const drafted = loadBook(registry, "XZZ").records.find((r) => r.key === keyOf("Tide Clasp"));
    expect(drafted.evidence.gates.passed).toEqual(["schema", "validator", "ids", "fixes", "text", "unique"]);
    expect(JSON.parse(readFileSync(join(registry, "xzz.json"), "utf8")).records
      .find((r) => r.key === keyOf("Tide Clasp")).state).toBe("gated");
    twice(["gates", "--ci"], 0);

    twice(["generate"], 0);
    twice(["generate", "--check"], 0);
    const src = readFileSync(join(env.RULEPACK_RULES, "books", "xzz.mjs"), "utf8");
    expect(src).toContain('"identifier": "tide-clasp"');
    expect(src).toContain('"status": "validated"');
    expect(src).not.toContain("quill-spark");
  });
});
