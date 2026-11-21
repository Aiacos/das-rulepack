// The second reading: batches cut from the queue (blind), and `ingest --second`. Synthetic fixtures only.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cutBatches, highestBatches } from "../../tools/pipeline/batch.mjs";
import { ingestSecond } from "../../tools/pipeline/triage.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";

const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma";
const AT = "2026-01-01T00:00:00.000Z";
const ENTRY_KEYS = new Set(["triggers"]);
let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "second-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const record = (name, over = {}) => {
  const slug = name.toLowerCase().replace(/ /g, "-");
  return {
    key: `tst:spell:${slug}`, name, kind: "spell", book: "TST", page: 3, edition: "2024", identifier: slug,
    text: { sha256: cacheText(textDir, `${BODY} ${name}`), source: "5etools", chars: 10 },
    items: [{ origin: "official", match: "matched" }], verdict: null, evidence: {}, ...over
  };
};
const queued = (name, over = {}) => ({
  key: `tst:spell:${name.toLowerCase().replace(/ /g, "-")}`, verdict: "data", why: "first why", confidence: 0.5, by: "reader-1",
  reason: "low-confidence", ...over
});
const res = (name, over = {}) => ({
  key: `tst:spell:${name.toLowerCase().replace(/ /g, "-")}`, verdict: "data", why: "second why", confidence: 0.9, ...over
});
const second = (records, results, queue, by = "reader-2") =>
  ingestSecond(records, results, { textDir, by, at: AT, entryKeys: ENTRY_KEYS, queue });

describe("cutBatches for the second reading", () => {
  it("cuts only the queued records and numbers second batches on their own", () => {
    const a = record("Dim Glow");
    const b = record("Pale Lamp");
    const out = cutBatches([a, b], { only: new Set([a.key]), series: "second", after: {} });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("tst-second-001");
    expect(out[0].stage).toBe("triage");
    expect(out[0].entries.map((e) => e.key)).toEqual([a.key]);
  });
  it("still needs no verdict, text and a matched item", () => {
    const keep = record("Dim Glow");
    const rs = [keep, record("Has Verdict", { verdict: "none" }), record("No Text", { text: null }),
      record("No Item", { items: [] })];
    const only = new Set(rs.map((r) => r.key));
    expect(cutBatches(rs, { only, series: "second" }).flatMap((b) => b.entries.map((e) => e.key))).toEqual([keep.key]);
    const loose = cutBatches(rs, { only, series: "second", withoutItems: true }).flatMap((b) => b.entries.map((e) => e.key));
    expect(loose).toContain("tst:spell:no-item");
  });
  it("carries no trace of the first reading", () => {
    const r = record("Dim Glow", { hint: "core-generic" });
    const [b] = cutBatches([r], { only: new Set([r.key]), series: "second" });
    for (const k of ["verdict", "why", "confidence", "by", "reason", "second"]) expect(b.entries[0]).not.toHaveProperty(k);
  });
  it("continues after the highest -second- number, apart from the triage numbering", () => {
    const files = ["tst-triage-007.json", "tst-second-002.json", "tst-second-003.structure.json", "tst-second-004.json"];
    expect(highestBatches(files)).toEqual({ tst: 7 });
    const r = record("Dim Glow");
    expect(cutBatches([r], { only: new Set([r.key]), series: "second", after: { tst: 4 } })[0].id).toBe("tst-second-005");
  });
  it("is unchanged without `only`", () => {
    expect(cutBatches([record("Dim Glow")], {})[0].id).toBe("tst-triage-001");
  });
});

describe("ingestSecond", () => {
  it("applies an agreed verdict with both readings on the record and leaves the queue", () => {
    const r = record("Dim Glow");
    const out = second([r], [res("Dim Glow", { keys: ["triggers"] })], [queued("Dim Glow")]);
    expect(out.agreed).toEqual([r.key]);
    expect(out.disagreed).toEqual([]);
    expect(out.rejected).toEqual([]);
    const got = out.records[0];
    expect(got).toMatchObject({ verdict: "data", why: "second why" });
    expect(got.evidence.triaged).toEqual({
      by: "reader-2", at: AT, confidence: 0.9, keys: ["triggers"], first: { by: "reader-1", confidence: 0.5 }
    });
    expect(validateRecord(got)).toEqual([]);
  });
  it("keeps the record open and the entry queued on a different verdict", () => {
    const r = record("Dim Glow");
    const out = second([r], [res("Dim Glow", { verdict: "none", confidence: 0.8 })], [queued("Dim Glow")]);
    expect(out.agreed).toEqual([]);
    expect(out.records[0].verdict).toBeNull();
    expect(out.disagreed).toEqual([{
      ...queued("Dim Glow"), reason: "disagreement",
      second: { verdict: "none", why: "second why", confidence: 0.8, by: "reader-2" }
    }]);
  });
  it("is a disagreement when either verdict is engine, even the same one", () => {
    const r = record("Dim Glow");
    const engineQ = queued("Dim Glow", { verdict: "engine", reason: "engine" });
    const same = second([r], [res("Dim Glow", { verdict: "engine" })], [engineQ]);
    expect(same.disagreed).toHaveLength(1);
    expect(same.disagreed[0].reason).toBe("disagreement");
    const mine = second([r], [res("Dim Glow", { verdict: "engine" })], [queued("Dim Glow")]);
    expect(mine.disagreed).toHaveLength(1);
    const theirs = second([r], [res("Dim Glow")], [engineQ]);
    expect(theirs.disagreed).toHaveLength(1);
    expect(theirs.records[0].verdict).toBeNull();
  });
  it("rejects the same handle, core, a key out of the queue and a third reading", () => {
    const rs = [record("Dim Glow"), record("Pale Lamp"), record("Old Moon")];
    const q = [queued("Dim Glow"), queued("Old Moon", { second: { verdict: "none", why: "w", confidence: 0.9, by: "reader-9" } })];
    const same = second(rs, [res("Dim Glow")], q, "reader-1");
    expect(same.rejected[0].reason).toMatch(/another reader/);
    expect(same.agreed).toEqual([]);
    const out = second(rs, [res("Dim Glow", { verdict: "core" }), res("Pale Lamp"), res("Old Moon")], q);
    expect(out.rejected.map((x) => x.reason)).toEqual([
      expect.stringMatching(/core/), expect.stringMatching(/not in the queue/), expect.stringMatching(/already has a second/)
    ]);
    expect(out.records.map((r) => r.verdict)).toEqual([null, null, null]);
  });
  it("keeps the existing result validation", () => {
    const rs = [record("Dim Glow")];
    const bad = second(rs, [res("Dim Glow", { why: "x".repeat(201) }), res("Dim Glow", { confidence: 3 })], [queued("Dim Glow")]);
    expect(bad.rejected).toHaveLength(2);
    expect(bad.agreed).toEqual([]);
  });
  it("does not touch the inputs", () => {
    const rs = [record("Dim Glow")];
    const q = [queued("Dim Glow")];
    const before = JSON.stringify([rs, q]);
    second(rs, [res("Dim Glow")], q);
    expect(JSON.stringify([rs, q])).toBe(before);
  });
});

describe("evidence.triaged.first in the schema", () => {
  const base = () => record("Dim Glow", { verdict: "data", why: "w", evidence: { triaged: { by: "a", at: AT, confidence: 0.9 } } });
  it("accepts { by, confidence } and refuses anything else", () => {
    const ok = base();
    ok.evidence.triaged.first = { by: "reader-1", confidence: 0.5 };
    expect(validateRecord(ok)).toEqual([]);
    const wrong = [null, "x", { by: "rule", confidence: 0.5 }, { by: "r", confidence: 2 }, { by: "r" },
      { by: "r", confidence: 1, x: 1 }];
    for (const first of wrong) {
      const bad = base();
      bad.evidence.triaged.first = first;
      expect(validateRecord(bad).join(), JSON.stringify(first)).toMatch(/evidence\.triaged\.first/);
    }
  });
});

describe("second reading on the command line", () => {
  let tmp, registry, textDir2;
  const run = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_TEXT: textDir2, DAS_CORE: process.env.DAS_CORE ?? "" }
  });
  const queueFile = () => join(registry, "queue.json");
  const readQueue = () => JSON.parse(readFileSync(queueFile(), "utf8"));
  const bookRecords = () => new Map(JSON.parse(readFileSync(join(registry, "tst.json"), "utf8")).records.map((r) => [r.key, r]));
  const resultsFile = (name, by, results) => {
    const f = join(tmp, name);
    writeFileSync(f, JSON.stringify({ batch: "tst-second-001", by, results }));
    return f;
  };
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "second-cli-"));
    registry = join(tmp, "registry");
    textDir2 = join(tmp, "text");
    mkdirSync(textDir2);
    const sha = (n) => cacheText(textDir2, `${BODY} number ${n}`);
    const rec = (n) => ({
      key: `tst:spell:s${n}`, name: `S ${n}`, kind: "spell", book: "TST", page: 1, edition: "2024", identifier: `s${n}`,
      text: { sha256: sha(n), source: "5etools", chars: 5 }, items: [{ origin: "official", match: "matched" }], verdict: null,
      evidence: {}
    });
    saveBook(registry, { book: "TST", records: [rec(1), rec(2), rec(3), rec(4)] });
    const q = (n, over = {}) => ({ key: `tst:spell:s${n}`, verdict: "data", why: "w", confidence: 0.5, by: "reader-1",
      reason: "low-confidence", ...over });
    writeFileSync(queueFile(), JSON.stringify([q(1), q(2), q(3, { second: { verdict: "none", why: "w", confidence: 0.9, by: "r9" },
      reason: "disagreement" })]));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("batch --queued cuts only queue entries without a second reading, blind", () => {
    const out = join(tmp, "out");
    const r = run(["batch", "triage", "TST", "--out", out, "--queued"]);
    expect(r.status, r.stderr).toBe(0);
    expect(readdirSync(out)).toEqual(["tst-second-001.json"]);
    const b = JSON.parse(readFileSync(join(out, "tst-second-001.json"), "utf8"));
    expect(b.stage).toBe("triage");
    expect(b.entries.map((e) => e.key)).toEqual(["tst:spell:s1", "tst:spell:s2"]);
    for (const e of b.entries) for (const k of ["verdict", "why", "confidence", "by"]) expect(e).not.toHaveProperty(k);
    // A second run continues the second numbering; a normal batch is untouched by the queue records and cuts only s4.
    expect(run(["batch", "triage", "TST", "--out", out, "--queued"]).status).toBe(0);
    expect(readdirSync(out).sort()).toEqual(["tst-second-001.json", "tst-second-002.json"]);
    expect(run(["batch", "triage", "TST", "--out", out]).status).toBe(0);
    const normal = JSON.parse(readFileSync(join(out, "tst-triage-001.json"), "utf8"));
    expect(normal.entries.map((e) => e.key)).toEqual(["tst:spell:s4"]);
  });

  const withCore = it.skipIf(!process.env.DAS_CORE);
  withCore("ingest --second applies agreements, queues disagreements and prints the counts", () => {
    const f = resultsFile("r.json", "reader-2", [
      { key: "tst:spell:s1", verdict: "data", why: "agree", confidence: 0.9 },
      { key: "tst:spell:s2", verdict: "none", why: "differ", confidence: 0.8 },
      { key: "tst:spell:s4", verdict: "data", why: "not queued", confidence: 0.9 }
    ]);
    const r = run(["ingest", f, "--second"]);
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out).toMatchObject({ agreed: 1, disagreed: 1 });
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0].reason).toMatch(/not in the queue/);
    const recs = bookRecords();
    expect(recs.get("tst:spell:s1")).toMatchObject({ verdict: "data", why: "agree" });
    expect(recs.get("tst:spell:s1").evidence.triaged.first).toEqual({ by: "reader-1", confidence: 0.5 });
    expect(recs.get("tst:spell:s2").verdict).toBeNull();
    expect(recs.get("tst:spell:s4").verdict).toBeNull();
    const queue = readQueue();
    expect(queue.map((q) => q.key)).toEqual(["tst:spell:s2", "tst:spell:s3"]);
    expect(queue[0]).toMatchObject({ reason: "disagreement", second: { verdict: "none", by: "reader-2" } });
    // The entry with a second reading is not read a third time.
    const third = [{ key: "tst:spell:s2", verdict: "data", why: "w", confidence: 1 }];
    const again = run(["ingest", resultsFile("r2.json", "reader-3", third), "--second"]);
    expect(JSON.parse(again.stdout).rejected[0].reason).toMatch(/already has a second/);
    expect(run(["batch", "triage", "TST", "--out", join(tmp, "o2"), "--queued"]).stdout).toMatch(/0 batches/);
  });

  withCore("ingest --second with --overwrite is a usage error and changes nothing", () => {
    const before = readFileSync(queueFile(), "utf8");
    const r = run(["ingest", resultsFile("r.json", "reader-2", []), "--second", "--overwrite"]);
    expect(r.status).toBe(2);
    expect(readFileSync(queueFile(), "utf8")).toBe(before);
    expect(existsSync(join(tmp, "out"))).toBe(false);
  });
});
