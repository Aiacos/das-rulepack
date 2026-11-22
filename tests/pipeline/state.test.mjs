import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  NOT_BOOKS, QUEUE_FILES, emittedFingerprint, gatedItems, loadBook, loadQueue, ruleFingerprint, saveBook, saveQueue, stateOf,
  validateQueueEntry
} from "../../tools/pipeline/registry.mjs";
import { validateRecord } from "../../tools/pipeline/schema.mjs";
import { generate, NOT_BOOKS as GENERATE_NOT_BOOKS } from "../../tools/pipeline/generate.mjs";
import { unaccountedByRule } from "../../tools/books-progress.mjs";

// Synthetic fixtures only. Evidence about a rule carries the rule fingerprint (drafted, reviewed, played): editing the rule
// makes all of it stale, and the state is derived from the evidence alone.
const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const ACT = "Ac00Ac11Ac22Ac33";
const HEX = "a".repeat(64);
const AT = "2026-11-22T00:00:00.000Z";

function gatedRecord() {
  const record = {
    key: "tst:spell:glimmer-bolt", identifier: "glimmer-bolt", name: "Glimmer Bolt", kind: "spell", book: "TST", page: 3,
    edition: "2024", text: { sha256: HEX, source: "dataset", chars: 10 }, verdict: "entry",
    items: [{ origin: "official", match: "matched", identifier: "glimmer-bolt", docId: "Of00Of11Of22Of33", activities: [ACT],
      effects: [], data: { sha256: "b".repeat(64) } }],
    rule: { handledIn: "table", adds: "x", entry: { saveDamage: { [ACT]: "half" } }, origins: ["official"],
      assert: [{ given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } }] },
    evidence: {}
  };
  record.evidence.gates = { at: AT, core: "1.0.0", rule: ruleFingerprint(record.rule), emits: emittedFingerprint(record),
    passed: ["schema", "validator", "ids", "fixes", "text", "unique"], items: gatedItems(record) };
  return record;
}
const reviewed = (rule) => ({ by: "reviewer-1", at: AT, agrees: true, rule, confidence: 0.9 });
const played = (rule) => ({ at: AT, core: "1.0.0", world: "test-world", scenario: "s-1", client: "gm", rule });

describe("stateOf and rule-stamped evidence", () => {
  it("reviewed with an old rule fingerprint leaves the state gated", () => {
    const record = gatedRecord();
    expect(stateOf(record)).toBe("gated");
    const fp = ruleFingerprint(record.rule);
    expect(stateOf({ ...record, evidence: { ...record.evidence, reviewed: reviewed(fp) } })).toBe("reviewed");
    expect(stateOf({ ...record, evidence: { ...record.evidence, reviewed: reviewed("c".repeat(64)) } })).toBe("gated");
    // A non-legacy review without a rule stamp does not count either.
    const { rule, ...unstamped } = reviewed(fp);
    expect(stateOf({ ...record, evidence: { ...record.evidence, reviewed: unstamped } })).toBe("gated");
  });

  it("played with an old rule fingerprint leaves the state reviewed", () => {
    const record = gatedRecord();
    const fp = ruleFingerprint(record.rule);
    const evidence = { ...record.evidence, reviewed: reviewed(fp) };
    expect(stateOf({ ...record, evidence: { ...evidence, played: played(fp) } })).toBe("played");
    expect(stateOf({ ...record, evidence: { ...evidence, played: played("c".repeat(64)) } })).toBe("reviewed");
  });

  it("editing the rule makes gates, review and play stale at once", () => {
    const record = gatedRecord();
    const fp = ruleFingerprint(record.rule);
    const full = { ...record, evidence: { ...record.evidence, reviewed: reviewed(fp), played: played(fp) } };
    expect(stateOf(full)).toBe("played");
    const edited = { ...full, rule: { ...full.rule, adds: "y" } };
    expect(stateOf(edited)).toBe("drafted");
  });

  it("legacy states unchanged for the 24", () => {
    const dir = join(ROOT, "registry");
    const ruled = readdirSync(dir).filter((f) => f.endsWith(".json") && !NOT_BOOKS.includes(f))
      .flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")).records).filter((r) => r.rule);
    expect(ruled).toHaveLength(24);
    for (const r of ruled) {
      expect(r.legacy, r.key).toBe(true);
      // The state saved in the registry was derived before rule-stamped evidence existed.
      expect(stateOf(r), r.key).toBe(r.state);
      expect(validateRecord((({ state, ...x }) => x)(r)), r.key).toEqual([]);
    }
    // A legacy review or play written before the stamp keeps counting as it did.
    const [legacy] = ruled.filter((r) => r.state === "gated");
    const old = { ...legacy, evidence: { ...legacy.evidence, reviewed: { by: "person", at: AT, agrees: true } } };
    expect(validateRecord((({ state, ...x }) => x)(old))).toEqual([]);
    expect(stateOf(old)).toBe("reviewed");
    const stale = { ...legacy, evidence: { ...legacy.evidence, reviewed: reviewed("c".repeat(64)) } };
    expect(stateOf(stale)).toBe("gated");
  });
});

describe("evidence shapes", () => {
  const withEvidence = (extra) => {
    const r = gatedRecord();
    return { ...r, evidence: { ...r.evidence, ...extra } };
  };
  const fp = ruleFingerprint(gatedRecord().rule);

  it("drafted, reviewed and played carry the rule fingerprint", () => {
    const drafted = { by: "drafter-1", at: AT, core: "1.0.0", rule: fp };
    expect(validateRecord(withEvidence({ drafted, reviewed: reviewed(fp), played: played(fp) }))).toEqual([]);
    const errors = (extra) => validateRecord(withEvidence(extra)).join("; ");
    expect(errors({ drafted: { ...drafted, rule: "x" } })).toMatch(/evidence\.drafted/);
    expect(errors({ drafted: { ...drafted, by: "rule" } })).toMatch(/evidence\.drafted/);
    expect(errors({ drafted: { ...drafted, extra: 1 } })).toMatch(/evidence\.drafted/);
    expect(errors({ reviewed: { ...reviewed(fp), rule: undefined } })).toMatch(/evidence\.reviewed\.rule/);
    expect(errors({ reviewed: { ...reviewed(fp), confidence: 2 } })).toMatch(/evidence\.reviewed\.confidence/);
    expect(errors({ played: { ...played(fp), rule: undefined } })).toMatch(/evidence\.played\.rule/);
  });
});

describe("drafts-queue.json and review-queue.json", () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "queues-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const entry = (key, over = {}) => ({ key, reason: "person", by: "drafter-1", why: "needs an aura", confidence: 0.8, ...over });

  it("are not books, for every reader of registry/", () => {
    expect(QUEUE_FILES).toEqual({ drafts: "drafts-queue.json", review: "review-queue.json" });
    for (const f of ["legacy.json", "queue.json", "drafts-queue.json", "review-queue.json"]) {
      expect(NOT_BOOKS).toContain(f);
      expect(GENERATE_NOT_BOOKS).toContain(f);
    }
  });

  it("entries are checked and saved sorted by key", () => {
    expect(validateQueueEntry(entry("tst:spell:a"))).toEqual([]);
    expect(validateQueueEntry(entry("tst:spell:a", { draft: { assert: [] }, review: {} }))).toEqual([]);
    expect(validateQueueEntry(entry("a", { confidence: 1.5 })).join("; ")).toMatch(/confidence/);
    expect(validateQueueEntry(entry("a", { by: "rule" })).join("; ")).toMatch(/by/);
    expect(validateQueueEntry(entry("a", { verdict: "entry" })).join("; ")).toMatch(/verdict: unknown field/);
    expect(validateQueueEntry(entry("a", { draft: "x" })).join("; ")).toMatch(/draft/);
    saveQueue(dir, "drafts", [entry("tst:spell:b"), entry("tst:spell:a")]);
    expect(loadQueue(dir, "drafts").map((e) => e.key)).toEqual(["tst:spell:a", "tst:spell:b"]);
    expect(loadQueue(dir, "review")).toEqual([]);
    expect(() => saveQueue(dir, "drafts", [entry("tst:spell:k"), entry("tst:spell:k")])).toThrow(/twice/);
    expect(() => saveQueue(dir, "drafts", [entry("tst:spell:k", { confidence: -1 })])).toThrow(/confidence/);
    expect(() => saveQueue(dir, "other", [])).toThrow(/queue/);
    writeFileSync(join(dir, "review-queue.json"), "{}");
    expect(() => loadQueue(dir, "review")).toThrow(/array/);
  });

  it("generate ignores drafts-queue.json and review-queue.json", () => {
    const registry = join(dir, "registry");
    const record = gatedRecord();
    saveBook(registry, { book: "TST", records: [record] });
    const out = join(dir, "rules");
    const before = generate({ registry, out });
    const index = readFileSync(join(out, "index.mjs"), "utf8");
    writeFileSync(join(registry, "drafts-queue.json"), `${JSON.stringify([entry("tst:spell:glimmer-bolt")], null, 2)}\n`);
    // A review-queue entry in its full shape (registry.mjs holds `draft` and `review` to it).
    const assert = [{ given: { roll: "hit" }, expect: { affects: "target" } }];
    const review = entry("tst:spell:x", { reason: "disagreement",
      draft: { by: "drafter-1", rule: "a".repeat(64), assert, implied: [] },
      review: { rule: "a".repeat(64), assert, agrees: true, onlyDraft: [], onlyReview: [] } });
    writeFileSync(join(registry, "review-queue.json"), `${JSON.stringify([review])}\n`);
    expect(before.written.sort()).toEqual(["books/tst.mjs", "index.mjs"]);
    expect(generate({ registry, out, check: true }).differing).toEqual([]);
    expect(readFileSync(join(out, "index.mjs"), "utf8")).toBe(index);
    expect(loadBook(registry, "TST").records).toHaveLength(1);
    // The other readers of registry/: books-progress and the CLI (gates reads every book).
    expect(unaccountedByRule(registry)).toEqual(new Map());
    const cli = spawnSync("node", ["tools/pipeline/cli.mjs", "gates", "--ci"], {
      cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry,
        ...(process.env.DAS_CORE ? { DAS_CORE: process.env.DAS_CORE } : {}) }
    });
    expect(cli.stderr).not.toMatch(/queue/);
    if (process.env.DAS_CORE) expect(cli.status, cli.stderr + cli.stdout).toBe(0);
  });
});
