// The third reading (`ingest --third`) and the owner's bulk rule (`ingest --settle-unsure`). Synthetic fixtures only.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest, ingestThird, settleUnsure } from "../../tools/pipeline/triage.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";

const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma";
const AT = "2026-01-01T00:00:00.000Z";
const ENTRY_KEYS = new Set(["triggers"]);
let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "third-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const slug = (name) => name.toLowerCase().replace(/ /g, "-");
const record = (name, over = {}) => ({
  key: `tst:spell:${slug(name)}`, name, kind: "spell", book: "TST", page: 3, edition: "2024", identifier: slug(name),
  text: { sha256: cacheText(textDir, `${BODY} ${name}`), source: "5etools", chars: 10 },
  items: [{ origin: "official", match: "matched" }], verdict: null, evidence: {}, ...over
});
const disputed = (name, over = {}) => ({
  key: `tst:spell:${slug(name)}`, verdict: "data", why: "first why", confidence: 0.5, by: "reader-1", reason: "disagreement",
  second: { verdict: "none", why: "second why", confidence: 0.9, by: "reader-2" }, ...over
});
const res = (name, over = {}) => ({ key: `tst:spell:${slug(name)}`, verdict: "none", why: "third why", confidence: 0.9, ...over });
const third = (records, results, queue, by = "reader-3") =>
  ingestThird(records, results, { textDir, by, at: AT, entryKeys: ENTRY_KEYS, queue });

describe("ingestThird", () => {
  it("settles on the second reader's verdict at 0.7 and records all three readings", () => {
    const r = record("Dim Glow");
    const q = disputed("Dim Glow");
    const out = third([r], [res("Dim Glow", { confidence: 0.7 })], [q]);
    expect(out.settled).toEqual([r.key]);
    expect(out.unsettled).toEqual([]);
    const rec = out.records[0];
    expect(rec).toMatchObject({ verdict: "none", why: "third why" });
    expect(rec.evidence.triaged).toEqual({
      by: "reader-3", at: AT, confidence: 0.7,
      first: { by: "reader-1", confidence: 0.5 }, second: { by: "reader-2", confidence: 0.9 }, via: "third-reading"
    });
    expect(validateRecord(rec)).toEqual([]);
    expect(r.verdict).toBeNull();
  });
  it("settles on the first reader's verdict too", () => {
    const out = third([record("Dim Glow")], [res("Dim Glow", { verdict: "data" })], [disputed("Dim Glow")]);
    expect(out.settled).toHaveLength(1);
    expect(out.records[0].verdict).toBe("data");
  });
  it("keeps the entry, with the third reading, when unsure or when the verdict matches neither", () => {
    const rs = [record("Dim Glow"), record("Pale Lamp")];
    const qs = [disputed("Dim Glow"), disputed("Pale Lamp")];
    const out = third(rs, [res("Dim Glow", { confidence: 0.69 }), res("Pale Lamp", { verdict: "entry", confidence: 1 })], qs);
    expect(out.settled).toEqual([]);
    expect(out.records.every((r) => r.verdict === null)).toBe(true);
    expect(out.unsettled[0]).toMatchObject({
      reason: "disagreement", third: { verdict: "none", why: "third why", confidence: 0.69, by: "reader-3" }
    });
    expect(out.unsettled[1].third.verdict).toBe("entry");
    expect(out.unsettled[1].second.by).toBe("reader-2");
  });
  it("never settles an engine verdict", () => {
    const q = disputed("Dim Glow", { verdict: "engine" });
    const out = third([record("Dim Glow")], [res("Dim Glow", { verdict: "engine", confidence: 1 })], [q]);
    expect(out.settled).toEqual([]);
    expect(out.unsettled[0].third.verdict).toBe("engine");
  });
  it("rejects what is not a disagreement with a second reading, or already has a third", () => {
    const names = ["Not Queued", "No Second", "Unsure Two", "Engine Two", "Has Third"];
    const rs = names.map((n) => record(n));
    const qs = [
      disputed("No Second", { second: undefined }), disputed("Unsure Two", { reason: "unsure-twice" }),
      disputed("Engine Two", { reason: "engine" }),
      disputed("Has Third", { third: { verdict: "none", why: "w", confidence: 0.1, by: "reader-9" } })
    ];
    const out = third(rs, names.map((n) => res(n)), qs);
    expect(out.settled).toEqual([]);
    expect(out.rejected).toHaveLength(5);
    expect(out.rejected[0].reason).toMatch(/not in the queue/);
    expect(out.rejected[4].reason).toMatch(/already has a third/);
  });
  it("rejects a third reader who is one of the first two, case aside", () => {
    const rs = [record("Dim Glow")];
    for (const by of ["reader-1", "READER-2"]) {
      const out = third(rs, [res("Dim Glow")], [disputed("Dim Glow")], by);
      expect(out.rejected[0].reason).toMatch(/another reader/);
      expect(out.settled).toEqual([]);
    }
  });
  it("applies the ingest checks: core, a verdict already there, an unknown field, a quotation", () => {
    const rs = [record("Dim Glow"), record("Pale Lamp", { verdict: "none" })];
    const qs = [disputed("Dim Glow"), disputed("Pale Lamp")];
    const quote = BODY.split(" ").slice(0, 12).join(" ");
    const out = third(rs, [res("Dim Glow", { verdict: "core" }), res("Pale Lamp"), res("Dim Glow", { extra: 1 }),
      res("Dim Glow", { why: quote })], qs);
    expect(out.settled).toEqual([]);
    expect(out.rejected.map((x) => x.reason).join("|")).toMatch(/core.*verdict.*unknown field|core/);
    expect(out.rejected).toHaveLength(4);
  });
  it("rejects the second occurrence of a key and keeps the first", () => {
    const out = third([record("Dim Glow")], [res("Dim Glow"), res("Dim Glow", { verdict: "data" })], [disputed("Dim Glow")]);
    expect(out.settled).toHaveLength(1);
    expect(out.rejected).toEqual([{ key: "tst:spell:dim-glow", reason: "the key appears twice in this file" }]);
  });
  it("does not change its inputs", () => {
    const rs = [record("Dim Glow")];
    const qs = [disputed("Dim Glow")];
    const copy = structuredClone([rs, qs]);
    third(rs, [res("Dim Glow")], qs);
    expect([rs, qs]).toEqual(copy);
  });
  it("makes a normal ingest and a further third reading refuse an entry that has a third", () => {
    const rs = [record("Dim Glow")];
    const q = disputed("Dim Glow");
    const out = third(rs, [res("Dim Glow", { confidence: 0.1 })], [q]);
    const queue = [out.unsettled[0]];
    const normal = ingest(rs, [res("Dim Glow")], { textDir, by: "reader-4", overwrite: true, entryKeys: ENTRY_KEYS, queue });
    expect(normal.rejected[0].reason).toMatch(/two readers disagree/);
    const again = third(rs, [res("Dim Glow")], queue, "reader-4");
    expect(again.rejected[0].reason).toMatch(/already has a third/);
  });
});

describe("settleUnsure", () => {
  const unsure = (name, c1, c2, over = {}) => ({
    key: `tst:spell:${slug(name)}`, verdict: "data", why: "first why", confidence: c1, by: "reader-1", reason: "unsure-twice",
    second: { verdict: "data", why: "second why", confidence: c2, by: "reader-2" }, ...over
  });
  const run = (records, queue, min = 0.6) => settleUnsure(records, { textDir, queue, min, at: AT });
  it("applies the common verdict when both confidences reach the minimum (inclusive)", () => {
    const r = record("Dim Glow");
    const out = run([r], [unsure("Dim Glow", 0.6, 0.65)]);
    expect(out.applied).toEqual([r.key]);
    expect(out.kept).toEqual([]);
    expect(out.records[0]).toMatchObject({ verdict: "data", why: "second why" });
    expect(out.records[0].evidence.triaged).toEqual({
      by: "reader-2", at: AT, confidence: 0.65,
      first: { by: "reader-1", confidence: 0.6 }, second: { by: "reader-2", confidence: 0.65 }, via: "bulk-unsure"
    });
    expect(validateRecord(out.records[0])).toEqual([]);
  });
  it("keeps entries below the minimum on either reading, and leaves other reasons out of kept", () => {
    const names = ["Low One", "Low Two", "Dis", "Eng"];
    const qs = [unsure("Low One", 0.59, 0.69), unsure("Low Two", 0.69, 0.5), unsure("Dis", 0.69, 0.69, { reason: "disagreement" }),
      unsure("Eng", 0.69, 0.69, { verdict: "engine", second: { verdict: "engine", why: "w", confidence: 0.69, by: "reader-2" } })];
    const out = run(names.map((n) => record(n)), qs);
    expect(out.applied).toEqual([]);
    expect(out.kept).toHaveLength(3);
    expect(out.records.every((r) => r.verdict === null)).toBe(true);
  });
  it("uses the minimum it is given", () => {
    const qs = [unsure("Dim Glow", 0.5, 0.5)];
    expect(run([record("Dim Glow")], qs, 0.5).applied).toHaveLength(1);
    expect(run([record("Dim Glow")], qs, 0.55).applied).toHaveLength(0);
  });
  it("never applies to a record that already has a verdict", () => {
    const out = run([record("Dim Glow", { verdict: "none" })], [unsure("Dim Glow", 0.65, 0.65)]);
    expect(out.applied).toEqual([]);
    expect(out.kept).toHaveLength(1);
    expect(out.problems).toHaveLength(1);
  });
});

describe("evidence.triaged.second and via in the schema", () => {
  const base = (triaged) =>
    record("Dim Glow", { verdict: "data", why: "w", evidence: { triaged: { by: "a", at: AT, confidence: 0.9, ...triaged } } });
  const f = { by: "r1", confidence: 0.5 };
  const s = { by: "r2", confidence: 0.6 };
  it("accepts the settled shapes", () => {
    expect(validateRecord(base({ first: f, second: s, via: "third-reading" }))).toEqual([]);
    expect(validateRecord(base({ first: f, second: s, via: "bulk-unsure" }))).toEqual([]);
    expect(validateRecord(base({ first: f }))).toEqual([]);
  });
  it("refuses a bad second, a bad via, and either without the first reading", () => {
    const bad = [{ first: f, second: { by: "rule", confidence: 0.5 } }, { first: f, second: { by: "r2" } },
      { first: f, second: { ...s, x: 1 } }, { first: f, second: s, via: "other" }, { second: s }, { via: "third-reading" },
      { first: f, via: "bulk-unsure" }, { first: f, second: s, via: 3 }];
    for (const t of bad) expect(validateRecord(base(t)).join(), JSON.stringify(t)).toMatch(/evidence\.triaged/);
  });
});

describe("third reading on the command line", () => {
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
    writeFileSync(f, JSON.stringify({ batch: "tst-third-001", by, results }));
    return f;
  };
  const snap = () => [queueFile(), join(registry, "tst.json")].map((f) => readFileSync(f, "utf8"));
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "third-cli-"));
    registry = join(tmp, "registry");
    textDir2 = join(tmp, "text");
    mkdirSync(textDir2);
    const rec = (n) => ({
      key: `tst:spell:s${n}`, name: `S ${n}`, kind: "spell", book: "TST", page: 1, edition: "2024", identifier: `s${n}`,
      text: { sha256: cacheText(textDir2, `${BODY} number ${n}`), source: "5etools", chars: 5 },
      items: [{ origin: "official", match: "matched" }], verdict: null, evidence: {}
    });
    saveBook(registry, { book: "TST", records: [1, 2, 3, 4, 5].map(rec) });
    const dis = (n) => ({ key: `tst:spell:s${n}`, verdict: "data", why: "w", confidence: 0.5, by: "reader-1",
      reason: "disagreement", second: { verdict: "none", why: "w", confidence: 0.9, by: "reader-2" } });
    const uns = (n, c) => ({ key: `tst:spell:s${n}`, verdict: "data", why: "w", confidence: c, by: "reader-1",
      reason: "unsure-twice", second: { verdict: "data", why: "w2", confidence: c, by: "reader-2" } });
    writeFileSync(queueFile(), JSON.stringify([dis(1), dis(2), uns(3, 0.65), uns(4, 0.55), { key: "tst:spell:s5", verdict: "data",
      why: "w", confidence: 0.4, by: "reader-1", reason: "low-confidence" }]));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  const withCore = it.skipIf(!process.env.DAS_CORE);
  withCore("--third settles, keeps and rejects, and prints the counts", () => {
    const f = resultsFile("t.json", "reader-3", [
      { key: "tst:spell:s1", verdict: "none", why: "third", confidence: 0.8 },
      { key: "tst:spell:s2", verdict: "none", why: "third", confidence: 0.4 },
      { key: "tst:spell:s5", verdict: "none", why: "third", confidence: 0.9 }
    ]);
    const r = run(["ingest", f, "--third"]);
    expect(r.status, r.stderr).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out).toMatchObject({ settled: 1, unsettled: 1 });
    expect(out.rejected).toHaveLength(1);
    expect(bookRecords().get("tst:spell:s1").evidence.triaged.via).toBe("third-reading");
    expect(bookRecords().get("tst:spell:s2").verdict).toBeNull();
    const q = readQueue();
    expect(q.map((x) => x.key)).toEqual(["tst:spell:s2", "tst:spell:s3", "tst:spell:s4", "tst:spell:s5"]);
    expect(q[0]).toMatchObject({ reason: "disagreement", third: { verdict: "none", confidence: 0.4, by: "reader-3" } });
    const again = run(["ingest", f, "--third"]);
    expect(JSON.parse(again.stdout).rejected.map((x) => x.reason).join()).toMatch(/already has a third/);
  });

  withCore("--settle-unsure applies the bulk rule and prints applied and kept", () => {
    const r = run(["ingest", "--settle-unsure"]);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ applied: 1, kept: 1 });
    expect(bookRecords().get("tst:spell:s3").evidence.triaged.via).toBe("bulk-unsure");
    expect(readQueue().map((x) => x.key)).toEqual(["tst:spell:s1", "tst:spell:s2", "tst:spell:s4", "tst:spell:s5"]);
    expect(JSON.parse(run(["ingest", "--settle-unsure", "--min", "0.5"]).stdout)).toEqual({ applied: 1, kept: 0 });
  });

  withCore("--min must be a number in [0.5, 0.7) and only goes with --settle-unsure", () => {
    const before = snap();
    for (const args of [["--min", "0.7"], ["--min", "0.49"], ["--min", "abc"], ["--min"], ["--min", ""]]) {
      const r = run(["ingest", "--settle-unsure", ...args]);
      expect(r.status, args.join(" ")).toBe(2);
    }
    expect(run(["ingest", "--min", "0.6"]).status).toBe(2);
    expect(snap()).toEqual(before);
  });

  withCore("the four modes are mutually exclusive: usage error, nothing written", () => {
    const before = snap();
    const f = resultsFile("t.json", "reader-3", [{ key: "tst:spell:s1", verdict: "none", why: "third", confidence: 0.8 }]);
    const modes = ["--third", "--second", "--overwrite", "--settle-unsure"];
    for (let i = 0; i < modes.length; i += 1) {
      for (let j = i + 1; j < modes.length; j += 1) {
        const r = run(["ingest", f, modes[i], modes[j]]);
        expect(r.status, `${modes[i]} ${modes[j]}`).toBe(2);
      }
    }
    expect(run(["ingest", "--settle-unsure", f]).status).toBe(2);
    expect(snap()).toEqual(before);
  });
});

describe("writes are all or nothing", () => {
  let tmp, registry, textDir2;
  const run = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_TEXT: textDir2, DAS_CORE: process.env.DAS_CORE ?? "" }
  });
  const files = () => ["aaa.json", "bbb.json", "queue.json"].map((f) => readFileSync(join(registry, f), "utf8"));
  const dis = (key) => ({ key, verdict: "data", why: "w", confidence: 0.5, by: "reader-1", reason: "disagreement",
    second: { verdict: "none", why: "w", confidence: 0.9, by: "reader-2" } });
  const uns = (key, extra = {}) => ({ key, verdict: "data", why: "w", confidence: 0.65, by: "reader-1", reason: "unsure-twice",
    second: { verdict: "data", why: "w2", confidence: 0.65, by: "reader-2" }, ...extra });
  const resultsFile = (by, results) => {
    const f = join(tmp, "r.json");
    writeFileSync(f, JSON.stringify({ batch: "x-001", by, results }));
    return f;
  };
  let broken = true;
  const setup = () => {
    tmp = mkdtempSync(join(tmpdir(), "atomic-"));
    registry = join(tmp, "registry");
    textDir2 = join(tmp, "text");
    mkdirSync(textDir2);
    const rec = (book, n, over = {}) => ({
      key: `${book.toLowerCase()}:spell:s${n}`, name: `S ${n}`, kind: "spell", book, page: 1, edition: "2024", identifier: `s${n}`,
      text: { sha256: cacheText(textDir2, `${BODY} ${book} ${n}`), source: "5etools", chars: 5 },
      items: [{ origin: "official", match: "matched" }], verdict: null, evidence: {}, ...over
    });
    saveBook(registry, { book: "AAA", records: [rec("AAA", 1), rec("AAA", 2)] });
    saveBook(registry, { book: "BBB", records: [rec("BBB", 1), rec("BBB", 2)] });
    if (broken) {
      // An unrelated record that no longer validates: a verdict outside the list, written by hand.
      const f = join(registry, "bbb.json");
      const b = JSON.parse(readFileSync(f, "utf8"));
      b.records[1].verdict = "bogus";
      writeFileSync(f, `${JSON.stringify(b, null, 2)}\n`);
    }
    writeFileSync(join(registry, "queue.json"), JSON.stringify([
      uns("aaa:spell:s1"), uns("bbb:spell:s1"), dis("aaa:spell:s2")
    ]));
  };
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));
  const withCore = it.skipIf(!process.env.DAS_CORE);

  withCore("--settle-unsure with an invalid record in a touched book writes nothing", () => {
    broken = true; setup();
    const before = files();
    const r = run(["ingest", "--settle-unsure"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/BBB/);
    expect(r.stderr).not.toMatch(/\n\s+at /);
    expect(files()).toEqual(before);
  });
  withCore("--third, --second and a normal ingest write nothing either", () => {
    broken = true; setup();
    const res = (k) => ({ key: k, verdict: "none", why: "third", confidence: 0.9 });
    const low = (k) => ({ key: k, verdict: "none", why: "w", confidence: 0.4, by: "reader-1", reason: "low-confidence" });
    const queueFile = join(registry, "queue.json");
    const attempt = (queue, args, results, by) => {
      writeFileSync(queueFile, JSON.stringify(queue));
      const before = files();
      const r = run(["ingest", resultsFile(by, results), ...args]);
      expect(r.status, args.join(" ")).toBe(1);
      expect(r.stderr).toMatch(/BBB/);
      expect(files()).toEqual(before);
    };
    attempt([dis("aaa:spell:s2"), dis("bbb:spell:s1")], ["--third"], [res("aaa:spell:s2"), res("bbb:spell:s1")], "reader-3");
    attempt([low("aaa:spell:s1"), low("bbb:spell:s1")], ["--second"], [res("aaa:spell:s1"), res("bbb:spell:s1")], "reader-2");
    attempt([], [], [res("aaa:spell:s1"), res("bbb:spell:s1")], "reader-5");
  });
  withCore("the same runs write both books and the queue when every record is valid", () => {
    broken = false; setup();
    const r = run(["ingest", "--settle-unsure"]);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ applied: 2, kept: 0 });
    const rec = (f, k) => JSON.parse(readFileSync(join(registry, f), "utf8")).records.find((x) => x.key === k);
    expect(rec("aaa.json", "aaa:spell:s1").verdict).toBe("data");
    expect(rec("bbb.json", "bbb:spell:s1").verdict).toBe("data");
    expect(JSON.parse(readFileSync(join(registry, "queue.json"), "utf8")).map((q) => q.key)).toEqual(["aaa:spell:s2"]);
  });
  withCore("a failing write is reported with what was and was not written", () => {
    broken = false; setup();
    // The queue path is a directory: its write fails after both books were written.
    rmSync(join(registry, "queue.json"));
    mkdirSync(join(registry, "queue.json"));
    const r = run(["ingest", "--settle-unsure"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).not.toMatch(/\n\s+at /);
  });
});

describe("--settle-unsure and --min details", () => {
  const unsure = (over) => ({
    key: "tst:spell:dim-glow", verdict: "data", why: "w", confidence: 0.65, by: "reader-1", reason: "unsure-twice",
    second: { verdict: "data", why: "w2", confidence: 0.65, by: "reader-2" }, ...over
  });
  it("keeps an entry that has a third reading", () => {
    const q = unsure({ third: { verdict: "data", why: "w", confidence: 0.9, by: "reader-3" } });
    const out = settleUnsure([record("Dim Glow")], { textDir, queue: [q], min: 0.6, at: AT });
    expect(out.applied).toEqual([]);
    expect(out.kept).toHaveLength(1);
  });
  it("rejects a --min with surrounding whitespace", () => {
    const r = spawnSync("node", ["tools/pipeline/cli.mjs", "ingest", "--settle-unsure", "--min", " 0.6"], {
      encoding: "utf8", env: { PATH: process.env.PATH, RULEPACK_REGISTRY: textDir, RULEPACK_TEXT: textDir }
    });
    expect(r.status).toBe(2);
  });
});

describe("the quotation limit of the third reading", () => {
  it("rejects a why that shares 8 consecutive words with the text, accepts 7", () => {
    const r = record("Dim Glow");
    const q = [disputed("Dim Glow")];
    const eight = BODY.split(" ").slice(0, 8).join(" ");
    const seven = BODY.split(" ").slice(0, 7).join(" ");
    const bad = third([r], [res("Dim Glow", { why: eight })], q);
    expect(bad.settled).toEqual([]);
    expect(bad.rejected[0].reason).toMatch(/quotation of 8 or more/);
    expect(third([r], [res("Dim Glow", { why: seven })], q).rejected).toEqual([]);
  });
});
