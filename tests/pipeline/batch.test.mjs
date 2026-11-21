import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cutBatches } from "../../tools/pipeline/batch.mjs";
import { saveBook } from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented entries.
const sha = (n) => String(n).padStart(64, "0");
const rec = (n, over = {}) => ({
  key: `tst:spell:s${String(n).padStart(2, "0")}`, name: `Spell ${n}`, kind: "spell", book: "TST", page: n, edition: "2024",
  identifier: `s${n}`, text: { sha256: sha(n), source: "5etools", chars: 5 }, verdict: null, evidence: {},
  items: [{
    origin: "official", match: "matched", identifier: `s${n}`, docId: "Dd00Cc11Bb22Aa33", activities: [], effects: [],
    data: { sha256: "h" }
  }],
  ...over
});

describe("cutBatches", () => {
  it("references text by fingerprint and drops item data", () => {
    const [b] = cutBatches([rec(1)], {});
    expect(b).toEqual({
      id: "tst-triage-001", stage: "triage",
      entries: [{
        key: "tst:spell:s01", name: "Spell 1", kind: "spell", edition: "2024", textSha: sha(1),
        items: [{ origin: "official", match: "matched", identifier: "s1", docId: "Dd00Cc11Bb22Aa33", activities: [], effects: [] }]
      }]
    });
  });

  it("skips records with a verdict and records without text", () => {
    const out = cutBatches([rec(1, { verdict: "none" }), rec(2, { text: null }), rec(3)], {});
    expect(out.flatMap((b) => b.entries.map((e) => e.key))).toEqual(["tst:spell:s03"]);
  });

  it("groups by kind, cuts at the size and numbers the batches in sequence", () => {
    const records = [rec(1), rec(2, { kind: "feat", key: "tst:feat:s02" }), rec(3), rec(4), rec(5)];
    const out = cutBatches(records, { size: 2 });
    expect(out.map((b) => [b.id, b.entries.map((e) => e.kind), b.entries.length])).toEqual([
      ["tst-triage-001", ["spell", "spell"], 2], ["tst-triage-002", ["spell", "spell"], 2],
      ["tst-triage-003", ["feat"], 1]
    ]);
  });

  it("uses a default size of 40 and returns nothing when there is nothing to triage", () => {
    expect(cutBatches(Array.from({ length: 41 }, (_, i) => rec(i + 1)), {}).map((b) => b.entries.length)).toEqual([40, 1]);
    expect(cutBatches([], {})).toEqual([]);
  });

  it("counts per book: a and a-b do not share a counter", () => {
    const out = cutBatches([
      rec(1, { book: "A" }), rec(2, { book: "A-B", key: "a-b:spell:s02" }), rec(3, { book: "A", kind: "feat" })
    ], {});
    expect(out.map((b) => b.id)).toEqual(["a-triage-001", "a-triage-002", "a-b-triage-001"]);
  });

  it("keeps the books apart", () => {
    const out = cutBatches([rec(1), rec(2, { book: "XYZ", key: "xyz:spell:s02" })], {});
    expect(out.map((b) => b.id)).toEqual(["tst-triage-001", "xyz-triage-001"]);
  });
});

describe("pipeline CLI: batch", () => {
  let tmp, registry, out;
  const run = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], {
    encoding: "utf8", env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry }
  });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "batch-"));
    registry = join(tmp, "registry");
    out = join(tmp, "out");
    saveBook(registry, { book: "TST", records: [rec(1), rec(2), rec(3, { text: null })] });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("writes one file per batch, named after the batch id", () => {
    const r = run(["batch", "triage", "TST", "--out", out, "--size", "1"]);
    expect(r.status).toBe(0);
    expect(readdirSync(out).sort()).toEqual(["tst-triage-001.json", "tst-triage-002.json"]);
    const b = JSON.parse(readFileSync(join(out, "tst-triage-002.json"), "utf8"));
    expect(b.id).toBe("tst-triage-002");
    expect(b.entries.map((e) => e.key)).toEqual(["tst:spell:s02"]);
    expect(r.stdout).toContain("2 batches");
    expect(run(["batch", "triage", "tst", "--out", join(tmp, "lower")]).status).toBe(0);
    expect(readdirSync(join(tmp, "lower"))).toEqual(["tst-triage-001.json"]);
  });

  it("is a usage error without --out, with an unknown stage or a bad size", () => {
    for (const args of [["batch", "triage", "TST"], ["batch", "draft", "TST", "--out", out], ["batch"],
      ["batch", "triage", "TST", "--out", out, "--size", "0"], ["batch", "triage", "NOPE", "--out", out],
      ["batch", "triage", "T-1", "--out", out]]) {
      expect(run(args).status, args.join(" ")).toBe(2);
    }
  });
});
