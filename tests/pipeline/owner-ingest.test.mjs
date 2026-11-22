// Ruling R23: an owner settles the triage queue through a plain `ingest` of a results file signed with a docs/owners.json
// handle, entries with a second (or third) reading included; agents stay out of such entries. Synthetic fixtures only.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest } from "../../tools/pipeline/triage.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { loadBook, saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";

const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma";
const AT = "2026-01-01T00:00:00.000Z";
let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "owner-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const record = (slug) => ({
  key: `tst:spell:${slug}`, name: slug, kind: "spell", book: "TST", page: 3, edition: "2024", identifier: slug,
  text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
  items: [{ origin: "official", match: "matched" }], verdict: null, evidence: {}
});
const entry = (slug, over = {}) => ({
  key: `tst:spell:${slug}`, verdict: "data", why: "first why", confidence: 0.8, by: "reader-1", reason: "disagreement",
  second: { verdict: "none", why: "second why", confidence: 0.9, by: "reader-2" }, ...over
});
const res = (slug, over = {}) => ({ key: `tst:spell:${slug}`, verdict: "none", why: "decided by hand", confidence: 1, ...over });
const run = (records, results, opts) => ingest(records, results, { textDir, at: AT, entryKeys: new Set(), ...opts });

describe("ingest by an owner (Ruling R23)", () => {
  it("settles an entry with a second reading, keeping the earlier readings", () => {
    const out = run([record("dim-glow")], [res("dim-glow")], { by: "owner", owner: true, queue: [entry("dim-glow")] });
    expect(out.rejected).toEqual([]);
    expect(out.applied).toEqual(["tst:spell:dim-glow"]);
    const r = out.records[0];
    expect(r.verdict).toBe("none");
    expect(r.evidence.triaged).toEqual({ by: "owner", at: AT, confidence: 1, first: { by: "reader-1", confidence: 0.8 },
      second: { by: "reader-2", confidence: 0.9 } });
    expect(validateRecord(r)).toEqual([]);
  });

  it("settles one with a third reading too, and a plain queued one with its first reading kept", () => {
    const third = entry("dim-glow", { third: { verdict: "none", why: "third why", confidence: 0.9, by: "reader-3" } });
    const plain = entry("pale-lamp", { second: undefined, reason: "low-confidence", confidence: 0.5 });
    delete plain.second;
    const out = run([record("dim-glow"), record("pale-lamp")], [res("dim-glow"), res("pale-lamp")],
      { by: "owner", owner: true, queue: [third, plain] });
    expect(out.applied).toEqual(["tst:spell:dim-glow", "tst:spell:pale-lamp"]);
    expect(out.records[1].evidence.triaged.first).toEqual({ by: "reader-1", confidence: 0.5 });
    for (const r of out.records) expect(validateRecord(r)).toEqual([]);
  });

  it("an agent-signed file is still rejected for such a key", () => {
    const out = run([record("dim-glow")], [res("dim-glow")], { by: "reader-9", queue: [entry("dim-glow")] });
    expect(out.applied).toEqual([]);
    expect(out.rejected[0].reason).toMatch(/waits for a person/);
  });

  it("holds the owner's why to the quotation check", () => {
    const out = run([record("dim-glow")], [res("dim-glow", { why: "alpha beta gamma delta epsilon zeta eta theta" })],
      { by: "owner", owner: true, queue: [entry("dim-glow")] });
    expect(out.applied).toEqual([]);
    expect(out.rejected[0].reason).toMatch(/quotation/);
  });
});

describe("pipeline CLI: an owner's results file (Ruling R23)", () => {
  let tmp, registry, env;
  const withCore = it.skipIf(!process.env.DAS_CORE);
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  const file = (by, results) => {
    const f = join(tmp, `${by}.json`);
    writeFileSync(f, JSON.stringify({ batch: "tst-triage-001", by, results }));
    return f;
  };
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "owner-cli-"));
    registry = join(tmp, "registry");
    env = { PATH: process.env.PATH, RULEPACK_TEXT: textDir, RULEPACK_REGISTRY: registry,
      ...(process.env.DAS_CORE ? { DAS_CORE: process.env.DAS_CORE } : {}) };
    saveBook(registry, { book: "TST", records: [record("dim-glow"), record("pale-lamp")] });
    writeFileSync(join(registry, "queue.json"), `${JSON.stringify([entry("dim-glow"), entry("pale-lamp")], null, 2)}\n`);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  withCore("plain ingest (and --overwrite) takes an owner's file and the entry leaves the queue; an agent's is refused", () => {
    const agent = cli(["ingest", file("reader-9", [res("dim-glow")])]);
    expect(agent.status).toBe(1);
    expect(JSON.parse(agent.stdout).rejected[0].reason).toMatch(/waits for a person/);
    const r = cli(["ingest", file("owner", [res("dim-glow")])]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ applied: 1, rejected: [] });
    const settled = loadBook(registry, "TST").records.find((x) => x.key === "tst:spell:dim-glow");
    expect(settled.evidence.triaged).toMatchObject({ by: "owner", first: { by: "reader-1" }, second: { by: "reader-2" } });
    const queue = JSON.parse(readFileSync(join(registry, "queue.json"), "utf8"));
    expect(queue.map((q) => q.key)).toEqual(["tst:spell:pale-lamp"]);
    expect(cli(["ingest", file("owner", [res("pale-lamp")]), "--overwrite"]).status).toBe(0);
    expect(JSON.parse(readFileSync(join(registry, "queue.json"), "utf8"))).toEqual([]);
  });

  withCore("the agent stages keep refusing an owner's file", () => {
    expect(cli(["ingest", file("owner", []), "--second"]).status).toBe(2);
    expect(cli(["ingest", file("owner", []), "--third"]).status).toBe(2);
  });
});
