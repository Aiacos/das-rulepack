import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { autoTriage, ingest, QUEUE_THRESHOLD } from "../../tools/pipeline/triage.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";
import { inventory } from "../../tools/pipeline/inventory.mjs";

// Synthetic fixtures only: invented spells.
const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma";
let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "triage-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const record = (name, over = {}) => {
  const slug = name.toLowerCase().replace(/ /g, "-");
  const sha = cacheText(textDir, over.body ?? `${BODY} ${name}`);
  const { body, ...rest } = over;
  return {
    key: `tst:spell:${slug}`, name, kind: "spell", book: "TST", page: 3, edition: "2024", identifier: slug,
    text: { sha256: sha, source: "5etools", chars: 10 }, items: [], verdict: null, evidence: {}, ...rest
  };
};
const noText = (name) => record(name, { text: null });
const core = new Set(["in-core"]);
const AT = "2026-01-01T00:00:00.000Z";

describe("autoTriage", () => {
  it("returns core when the engine has an entry, whatever the text", () => {
    expect(autoTriage(record("In Core"), { coreIdentifiers: core, textDir }))
      .toEqual({ verdict: "core", why: "DAS · Core has an entry", by: "rule" });
    expect(autoTriage(noText("In Core"), { coreIdentifiers: core, textDir })?.verdict).toBe("core");
  });

  it("leaves SRD content that Core lacks to a reader", () => {
    expect(autoTriage(record("Open Spell", { srd: true }), { coreIdentifiers: core, textDir })).toBeNull();
    expect(autoTriage(record("Open Spell"), { coreIdentifiers: core, textDir, srd: true })).toBeNull();
  });

  it("returns unverifiable when there is no text, or it is not in the cache", () => {
    expect(autoTriage(noText("Dim Glow"), { coreIdentifiers: core, textDir }))
      .toMatchObject({ verdict: "unverifiable", by: "rule" });
    const lost = record("Dim Glow", { text: { sha256: "a".repeat(64), source: "5etools", chars: 1 } });
    expect(autoTriage(lost, { coreIdentifiers: core, textDir })?.verdict).toBe("unverifiable");
    expect(autoTriage(noText("Open Spell"), { coreIdentifiers: core, textDir, srd: true })?.verdict).toBe("unverifiable");
  });

  it("returns null for anything else and never overwrites a verdict", () => {
    expect(autoTriage(record("Dim Glow"), { coreIdentifiers: core, textDir })).toBeNull();
    expect(autoTriage(record("In Core", { verdict: "none" }), { coreIdentifiers: core, textDir })).toBeNull();
  });
});

describe("ingest", () => {
  const ok = (key, over = {}) => ({ key, verdict: "none", why: "Pure narration.", confidence: 0.9, ...over });
  const run = (records, results, over = {}) => ingest(records, results, { textDir, by: "agent-1", at: AT, ...over });

  it("applies a verdict, why and evidence.triaged to a copy", () => {
    const records = [record("Dim Glow")];
    const out = run(records, [ok("tst:spell:dim-glow", { keys: ["x"], similar: ["close-one"] })]);
    expect(out.rejected).toEqual([]);
    expect(out.applied).toEqual(["tst:spell:dim-glow"]);
    const [r] = out.records;
    expect(r).toMatchObject({ verdict: "none", why: "Pure narration." });
    expect(r.evidence.triaged).toEqual({ by: "agent-1", at: AT, confidence: 0.9, keys: ["x"], similar: ["close-one"] });
    expect(validateRecord(r)).toEqual([]);
    expect(records[0].verdict).toBeNull();
  });

  it("bounds the strings a reader can write", () => {
    const records = [record("Dim Glow"), record("Other One")];
    const bad = (over) => run(records, [ok("tst:spell:dim-glow", over)]).rejected;
    expect(bad({ keys: ["triggers.on"] })).toEqual([]);
    expect(bad({ keys: ["1bad"] })).toHaveLength(1);
    expect(bad({ keys: ["has space"] })).toHaveLength(1);
    expect(bad({ keys: ["a".repeat(65)] })).toHaveLength(1);
    expect(bad({ keys: Array(13).fill("ok") })).toHaveLength(1);
    expect(bad({ keys: Array(12).fill("ok") })).toEqual([]);
    expect(bad({ similar: ["tst:spell:other-one", "some-identifier"] })).toEqual([]);
    expect(bad({ similar: ["Not Kebab"] })).toHaveLength(1);
    expect(bad({ similar: ["tst:spell:missing"] })).toHaveLength(1);
    expect(bad({ similar: ["a".repeat(65)] })).toHaveLength(1);
    expect(bad({ similar: Array(6).fill("some-identifier") })).toHaveLength(1);
    expect(bad({ similar: Array(5).fill("some-identifier") })).toEqual([]);
    for (const by of ["", "-x", "a b", "x".repeat(65), "a/b"]) {
      expect(() => run(records, [ok("tst:spell:dim-glow")], { by })).toThrow(/by must match/);
    }
  });

  it("rejects a result with an unknown field", () => {
    const out = run([record("Dim Glow")], [ok("tst:spell:dim-glow", { notes: "x" })]);
    expect(out.rejected[0].reason).toMatch(/unknown field "notes"/);
  });

  it("rejects the verdict core from a reader", () => {
    const out = run([record("Dim Glow")], [ok("tst:spell:dim-glow", { verdict: "core" })]);
    expect(out.rejected[0].reason).toMatch(/core/);
    expect(out.applied).toEqual([]);
  });

  it("rejects unknown keys, unknown verdicts, bad confidence and a long why", () => {
    const records = [record("Dim Glow")];
    const results = [
      ok("tst:spell:nope"), ok("tst:spell:dim-glow", { verdict: "maybe" }), ok("tst:spell:dim-glow", { confidence: 1.5 }),
      ok("tst:spell:dim-glow", { why: "x".repeat(201) }), ok("tst:spell:dim-glow", { why: "" })
    ];
    const out = run(records, results);
    expect(out.rejected.map((r) => r.key)).toEqual(Array(5).fill(null).map((_, i) => results[i].key));
    expect(out.rejected[0].reason).toMatch(/unknown key/);
    expect(out.rejected[1].reason).toMatch(/unknown verdict/);
    expect(out.rejected[2].reason).toMatch(/confidence/);
    expect(out.rejected[3].reason).toMatch(/200/);
    expect(out.applied).toEqual([]);
    expect(out.records[0].verdict).toBeNull();
  });

  it("accepts 11 consecutive words of the text and rejects 12, ignoring case and spacing", () => {
    const records = [record("Dim Glow")];
    const eleven = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda";
    const twelve = `${eleven} mu`;
    expect(run(records, [ok("tst:spell:dim-glow", { why: eleven })]).rejected).toEqual([]);
    const shout = "It says: ALPHA  beta\n gamma delta epsilon zeta eta theta iota kappa lambda MU.";
    const bad = run(records, [ok("tst:spell:dim-glow", { why: shout })]);
    expect(bad.rejected[0].reason).toMatch(/quotation/);
    expect(run(records, [ok("tst:spell:dim-glow", { why: twelve })]).rejected).toHaveLength(1);
    const later = run(records, [ok("tst:spell:dim-glow", { why: "so xi omicron pi rho sigma dim glow" })]);
    expect(later.rejected).toEqual([]);
  });

  it("allows only unverifiable for an entry without text", () => {
    const records = [noText("Dim Glow")];
    const out = run(records, [ok("tst:spell:dim-glow")]);
    expect(out.rejected[0].reason).toMatch(/no text/i);
    const fine = run(records, [ok("tst:spell:dim-glow", { verdict: "unverifiable" })]);
    expect(fine.rejected).toEqual([]);
    expect(fine.records[0].verdict).toBe("unverifiable");
  });

  it("rejects text that is missing from the cache", () => {
    const lost = record("Dim Glow", { text: { sha256: "b".repeat(64), source: "5etools", chars: 1 } });
    expect(run([lost], [ok("tst:spell:dim-glow")]).rejected[0].reason).toMatch(/no text/i);
  });

  it("does not overwrite a verdict unless asked to", () => {
    const records = [record("Dim Glow", { verdict: "data", why: "by a person" })];
    const out = run(records, [ok("tst:spell:dim-glow")]);
    expect(out.rejected[0].reason).toMatch(/already has a verdict/);
    expect(out.records[0].verdict).toBe("data");
    const again = run(records, [ok("tst:spell:dim-glow")], { overwrite: true });
    expect(again.rejected).toEqual([]);
    expect(again.records[0].verdict).toBe("none");
  });

  it("queues low confidence and every engine verdict instead of applying them", () => {
    const records = [record("Dim Glow"), record("Cold Snap"), record("Hot Pan")];
    const out = run(records, [
      ok("tst:spell:dim-glow", { confidence: QUEUE_THRESHOLD - 0.01 }),
      ok("tst:spell:cold-snap", { verdict: "engine", confidence: 0.99, why: "Needs a new fact." }),
      ok("tst:spell:hot-pan", { verdict: "code", confidence: QUEUE_THRESHOLD })
    ]);
    expect(out.queued).toEqual([
      {
        key: "tst:spell:dim-glow", verdict: "none", why: "Pure narration.", confidence: 0.69, by: "agent-1",
        reason: "low-confidence"
      },
      { key: "tst:spell:cold-snap", verdict: "engine", why: "Needs a new fact.", confidence: 0.99, by: "agent-1", reason: "engine" }
    ]);
    expect(out.applied).toEqual(["tst:spell:hot-pan"]);
    expect(out.records.map((r) => r.verdict)).toEqual([null, null, "code"]);
  });
});

describe("srd on inventory records", () => {
  const entry = (srd) => ({ name: "Glimmer Bolt", book: "TST", page: 1, edition: "2024", srd, text: "Invented." });
  const inv = (srd, previous = []) =>
    inventory({ book: "TST", kind: "spell", dataset: [entry(srd)], dumps: {}, textDir, previous });

  it("copies the dataset flag and refreshes it on a re-run", () => {
    const first = inv(true).records;
    expect(first[0].srd).toBe(true);
    expect(validateRecord(first[0])).toEqual([]);
    expect(inv(false, first).records[0].srd).toBe(false);
  });

  it("rejects a non-boolean srd", () => {
    expect(validateRecord({ ...inv(true).records[0], srd: "yes" })).toContain("srd: must be a boolean");
  });
});

describe("pipeline CLI: triage and ingest on temporary folders", () => {
  let tmp, registry, env;
  const run = (args, over = {}) =>
    spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env: { ...env, ...over } });
  const readBook = () => JSON.parse(readFileSync(join(registry, "tst.json"), "utf8"));
  const resultsFile = (body) => { const f = join(tmp, "results.json"); writeFileSync(f, JSON.stringify(body)); return f; };

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "triage-cli-"));
    registry = join(tmp, "registry");
    const coreDir = process.env.DAS_CORE;
    env = {
      PATH: process.env.PATH, RULEPACK_TEXT: textDir, RULEPACK_REGISTRY: registry, ...(coreDir ? { DAS_CORE: coreDir } : {})
    };
    saveBook(registry, { book: "TST", records: [record("Dim Glow"), noText("Gone Dark"), record("Cold Snap")] });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("triage and ingest need their environment variables", () => {
    expect(run(["triage", "TST"], { DAS_CORE: "" }).status).toBe(2);
    expect(run(["triage", "TST"], { DAS_CORE: "" }).stderr).toContain("DAS_CORE");
    expect(run(["triage"]).status).toBe(2);
    const r = run(["ingest", resultsFile({})], { RULEPACK_TEXT: "" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("RULEPACK_TEXT");
  });

  it.skipIf(!process.env.DAS_CORE)("triage applies the rules, saves and prints the counts", () => {
    const r = run(["triage", "TST"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/unverifiable: 1/);
    expect(r.stdout).toMatch(/left: 2/);
    const book = readBook();
    const gone = book.records.find((x) => x.key === "tst:spell:gone-dark");
    expect(gone).toMatchObject({ verdict: "unverifiable", state: "triaged" });
    expect(gone.evidence.triaged).toMatchObject({ by: "rule" });
    expect(book.records.find((x) => x.key === "tst:spell:dim-glow").verdict).toBeNull();
  });

  it("ingest applies, queues, merges the queue and exits 1 on a rejection", () => {
    const file = resultsFile({
      batch: "tst-triage-001", by: "agent-1", results: [
        { key: "tst:spell:dim-glow", verdict: "none", why: "Narration.", confidence: 0.9 },
        { key: "tst:spell:cold-snap", verdict: "engine", why: "Needs a fact.", confidence: 0.9 },
        { key: "tst:spell:nope", verdict: "none", why: "x", confidence: 0.9 }
      ]
    });
    const r = run(["ingest", file]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ applied: 1, queued: 1, rejected: [{ key: "tst:spell:nope" }] });
    expect(readBook().records.find((x) => x.key === "tst:spell:dim-glow")).toMatchObject({ verdict: "none", state: "triaged" });
    const queue = () => JSON.parse(readFileSync(join(registry, "queue.json"), "utf8"));
    expect(queue().map((q) => q.key)).toEqual(["tst:spell:cold-snap"]);

    const second = resultsFile({
      batch: "tst-triage-002", by: "agent-2", results: [
        { key: "tst:spell:cold-snap", verdict: "engine", why: "Still needs a fact.", confidence: 0.8 }
      ]
    });
    expect(run(["ingest", second]).status).toBe(0);
    expect(queue()).toHaveLength(1);
    expect(queue()[0]).toMatchObject({ by: "agent-2", why: "Still needs a fact." });

    const third = resultsFile({
      batch: "tst-triage-003", by: "agent-3",
      results: [{ key: "tst:spell:cold-snap", verdict: "none", why: "Narration.", confidence: 0.9 }]
    });
    expect(run(["ingest", third]).status).toBe(0);
    expect(queue()).toEqual([]);
  });

  it("ingest refuses a file with an unknown field, a non-boolean overwrite or a bad by, and applies nothing", () => {
    const result = { key: "tst:spell:dim-glow", verdict: "none", why: "Narration.", confidence: 0.9 };
    for (const extra of [{ note: "x" }, { overwrite: "yes" }, { by: "bad name" }]) {
      const r = run(["ingest", resultsFile({ batch: "b", by: "agent-1", results: [result], ...extra })]);
      expect(r.status).toBe(2);
    }
    expect(readBook().records.every((x) => x.verdict === null)).toBe(true);
  });

  it("ingest refuses a results file of the wrong shape", () => {
    expect(run(["ingest", resultsFile({ batch: "b", results: [] })]).status).toBe(2);
    expect(run(["ingest"]).status).toBe(2);
    expect(existsSync(join(registry, "queue.json"))).toBe(false);
  });
});
