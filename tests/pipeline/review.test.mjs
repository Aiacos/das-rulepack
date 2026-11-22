import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REVIEW_RESULT_FIELDS, compareAsserts, ingestReviews } from "../../tools/pipeline/review.mjs";
import { cutReviewBatches, reviewSkipReason } from "../../tools/pipeline/batch.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { normaliseAssert } from "../../tools/pipeline/assert.mjs";
import {
  emittedFingerprint, gatedItems, loadBook, loadQueue, queueText, ruleFingerprint, saveBook, saveQueue, stateOf,
  validateQueueEntry, validateRecord
} from "../../tools/pipeline/registry.mjs";
import { checkText } from "../../tools/pipeline/gates.mjs";

// Synthetic fixtures only: invented entries, invented words.
const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
const AT = "2026-01-01T00:00:00.000Z";
const A_OFF = "Af11Bf22Cf33Df44";
const A_DDB = "Ad11Bd22Cd33Dd44";
const E_OFF = "Ef11Ef22Ef33Ef44";
const core = {
  version: "9.9.9", facts: ["actor.prone"], identifiers: new Set(), vocabulary: new Set(), validateEntry: () => [],
  moments: ["failedSave", "endOfTurn", "startOfTurn"], statuses: ["prone", "blinded"], creatureTypes: ["undead"],
  moveModes: ["push"], effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"]
};

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "review-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const item = (origin) => ({
  origin, match: "matched", identifier: "frost-glimmer", docId: origin === "official" ? "Do11Do22Do33Do44" : "Dd11Dd22Dd33Dd44",
  activities: [origin === "official" ? A_OFF : A_DDB], effects: origin === "official" ? [E_OFF] : [],
  data: { sha256: (origin === "official" ? "a" : "b").repeat(64) }
});
const HALF = { given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } };
const PRONE = { given: { roll: "failedSave" }, expect: { condition: { applied: "prone" } } };
const ADDS = "Zorbly the quux halves things for the wizzle.";
const rule = (over = {}) => ({
  handledIn: "table", adds: ADDS, entry: { saveDamage: { [A_OFF]: "half", [A_DDB]: "half" } },
  origins: ["official", "ddb-importer"], assert: [HALF], ...over
});
// A record as `ingest --draft` and `gates` leave it: drafted by `drafter-zz9`, every gate passed on the rule as it is.
const gated = (over = {}, { drafted = {}, person } = {}) => {
  const { body, ...rest } = over;
  const sha = cacheText(textDir, body ?? BODY);
  const r = {
    key: "tst:spell:frost-glimmer", name: "Frost Glimmer", kind: "spell", book: "TST", page: 3, edition: "2024",
    identifier: "frost-glimmer", text: { sha256: sha, source: "5etools", chars: 10 },
    items: [item("official"), item("ddb-importer"), { origin: "plutonium", match: "unchecked" }],
    verdict: "entry", why: "a save halves it",
    evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9, keys: ["saveDamage"], similar: ["cold-snap"] } },
    rule: rule(), ...rest
  };
  if (drafted !== null) {
    const stamp = { by: "drafter-zz9", at: AT, core: "9.9.9", rule: ruleFingerprint(r.rule), ...drafted };
    r.evidence = { ...r.evidence, drafted: stamp };
  }
  if (person) r.evidence.person = { by: person, because: "written by hand", rule: ruleFingerprint(r.rule) };
  r.evidence.gates = {
    at: AT, core: "9.9.9", rule: ruleFingerprint(r.rule), emits: emittedFingerprint(r),
    passed: ["schema", "validator", "ids", "fixes", "text", "unique"], items: gatedItems(r)
  };
  return r;
};
const review = (r, over = {}) => ({
  key: r.key, rule: ruleFingerprint(r.rule), assert: [HALF], why: "a save halves it", confidence: 0.9, ...over
});
const offeredOf = (records) => new Map(records.map((r) => [r.key, ruleFingerprint(r.rule)]));
const run = (records, results, opts = {}) => ingestReviews(records, results, {
  textDir, by: "reviewer-1", at: AT, core, offered: offeredOf(records), ...opts
});
const reasonOf = (out) => out.rejected.map((r) => r.reason).join(" | ");

describe("compareAsserts: what agreement is (Ruling R9)", () => {
  const entry = rule().entry;
  const draft = (assert, e = entry) => ({ entry: e, assert });
  it("agrees on the same assertions, in any order, duplicates aside", () => {
    const c = compareAsserts(draft([HALF, PRONE]), [PRONE, HALF, PRONE]);
    expect(c).toMatchObject({ agrees: true, onlyDraft: [], onlyReview: [], free: false });
  });
  it("tolerates an implied assertion the draft did not write but the review did", () => {
    // saveDamage half implies the saved-save half: the draft may leave it out of `assert`, the review states it.
    expect(compareAsserts(draft([PRONE]), [PRONE, HALF]).agrees).toBe(true);
    expect(compareAsserts(draft([PRONE, HALF]), [PRONE, HALF]).agrees).toBe(true);
  });
  it("an implied assertion missing from the review is disagreement", () => {
    const c = compareAsserts(draft([PRONE]), [PRONE]);
    expect(c.agrees).toBe(false);
    expect(c.onlyDraft).toEqual(normaliseAssert([HALF]));
    expect(c.onlyReview).toEqual([]);
  });
  it("a review with fewer expectations than the rule asserts is disagreement", () => {
    const c = compareAsserts(draft([HALF, PRONE]), [HALF]);
    expect(c.agrees).toBe(false);
    expect(c.onlyDraft).toEqual(normaliseAssert([PRONE]));
  });
  it("a review with more expectations than the rule asserts is disagreement", () => {
    const c = compareAsserts(draft([HALF]), [HALF, PRONE]);
    expect(c.agrees).toBe(false);
    expect(c.onlyReview).toEqual(normaliseAssert([PRONE]));
    expect(c.onlyDraft).toEqual([]);
  });
  it("a different moment, target, condition, fraction or ending is disagreement", () => {
    const base = { given: { roll: "failedSave", moment: "endOfTurn" },
      expect: { condition: { applied: "prone" }, affects: "target", ends: "bearerTurnEnd" } };
    const variants = [
      { ...base, given: { ...base.given, moment: "startOfTurn" } },
      { ...base, expect: { ...base.expect, affects: "allies" } },
      { ...base, expect: { ...base.expect, condition: { applied: "blinded" } } },
      { ...base, expect: { ...base.expect, ends: "startOfTurn" } }
    ];
    const none = draft([base], {});
    expect(compareAsserts(none, [base]).agrees).toBe(true);
    for (const v of variants) {
      const c = compareAsserts(none, [v]);
      expect(c.agrees).toBe(false);
      expect(c.onlyDraft).toEqual(normaliseAssert([base]));
      expect(c.onlyReview).toEqual(normaliseAssert([v]));
    }
    const quarter = compareAsserts(draft([HALF]), [{ ...HALF, expect: { damage: { fraction: 0 } } }]);
    expect(quarter.agrees).toBe(false);
  });
  it("a free assertion, on either side, never agrees", () => {
    const freeHalf = { given: HALF.given, expect: { ...HALF.expect, free: "our own note" } };
    expect(compareAsserts(draft([freeHalf], {}), [freeHalf]))
      .toMatchObject({ agrees: false, free: true, onlyDraft: [], onlyReview: [] });
    expect(compareAsserts(draft([HALF]), [HALF, freeHalf]).free).toBe(true);
  });
  it("is data: canonical assertion strings, no prose", () => {
    const c = compareAsserts(draft([HALF]), [PRONE, HALF]);
    expect(Object.keys(c).sort()).toEqual(["agrees", "free", "implied", "onlyDraft", "onlyReview"]);
    for (const s of [...c.onlyDraft, ...c.onlyReview, ...c.implied]) expect(s).toMatch(/^[a-z.]+=[^;]+(;[a-z.]+=[^;]+)*$/i);
  });
});

describe("ingestReviews", () => {
  it("agreement writes reviewed with the rule fingerprint, and never changes the rule", () => {
    const r = gated();
    expect(stateOf(r)).toBe("gated");
    const out = run([r], [review(r)]);
    expect(out.rejected).toEqual([]);
    expect(out.agreed).toEqual([r.key]);
    const next = out.records[0];
    expect(next.rule).toEqual(r.rule);
    expect(next.evidence.reviewed).toEqual({ by: "reviewer-1", at: AT, agrees: true, rule: ruleFingerprint(r.rule),
      confidence: 0.9 });
    expect(next.evidence).not.toHaveProperty("person");
    expect(stateOf(next)).toBe("reviewed");
    expect(validateRecord(next)).toEqual([]);
    expect(r.evidence.reviewed).toBeUndefined();
  });

  it("same reviewer as drafter rejected (case aside)", () => {
    const r = gated();
    const out = run([r], [review(r)], { by: "Drafter-ZZ9" });
    expect(out.agreed).toEqual([]);
    expect(reasonOf(out)).toMatch(/drafter/);
  });

  it("stale rule fingerprint rejected (Review Focus 4): the rule changed after the cut, nothing queued", () => {
    const r = gated();
    const offered = offeredOf([r]);
    const edited = { ...r, rule: rule({ adds: "Another line." }) };
    const out = run([edited], [review(r)], { offered });
    expect(out.agreed).toEqual([]);
    expect(out.disagreed).toEqual([]);
    expect(reasonOf(out)).toMatch(/changed after the batch was cut/);
    // A fingerprint the batch did not give is refused too.
    const other = run([r], [review(r, { rule: "f".repeat(64) })]);
    expect(reasonOf(other)).toMatch(/not the rule this batch offered/);
  });

  it("free assertion always queued, with the comparison as data", () => {
    const r = gated();
    const freeHalf = { given: HALF.given, expect: { ...HALF.expect, free: "our own note" } };
    const out = run([r], [review(r, { assert: [freeHalf] })]);
    expect(out.agreed).toEqual([]);
    expect(out.disagreed).toHaveLength(1);
    const q = out.disagreed[0];
    expect(q.reason).toBe("disagreement");
    expect(q.review.onlyReview).toEqual(normaliseAssert([freeHalf]));
    expect(q.review.onlyDraft).toEqual(normaliseAssert([HALF]));
    // Same assertions, a free on both sides (and the implied one stated): still not agreement.
    const both = gated({ rule: rule({ assert: [freeHalf] }) });
    const out2 = run([both], [review(both, { assert: [freeHalf, HALF] })]);
    expect(out2.disagreed[0]).toMatchObject({ reason: "free-text" });
    expect(out2.records[0].evidence.reviewed).toBeUndefined();
  });

  it("implied assertion missing from the review queues it", () => {
    const r = gated({ rule: rule({ assert: [PRONE], entry: { saveDamage: { [A_OFF]: "half", [A_DDB]: "half" } } }) });
    const out = run([r], [review(r, { assert: [PRONE] })]);
    expect(out.agreed).toEqual([]);
    expect(out.disagreed[0]).toMatchObject({ key: r.key, reason: "disagreement", by: "reviewer-1", confidence: 0.9 });
    expect(out.disagreed[0].review.onlyDraft).toEqual(normaliseAssert([HALF]));
    expect(out.disagreed[0].draft).toEqual({
      by: "drafter-zz9", rule: ruleFingerprint(r.rule), assert: [PRONE], implied: normaliseAssert([HALF])
    });
  });

  it("low confidence queues an agreement", () => {
    const r = gated();
    const out = run([r], [review(r, { confidence: 0.6 })]);
    expect(out.disagreed[0]).toMatchObject({ reason: "low-confidence" });
    expect(out.disagreed[0].review.agrees).toBe(true);
  });

  it("a rule stamped for a person (noReactions, official-uncovered) is queued even when the review agrees", () => {
    const nr = gated({ rule: rule({ entry: { noReactions: [E_OFF] }, origins: ["official"],
      uncovered: [{ origin: "ddb-importer", because: "its item has no effect" }], assert: [PRONE] }) },
    { drafted: { person: true, because: "noReactions" } });
    const ou = gated({ key: "tst:spell:cold-snap", rule: rule({ entry: { saveDamage: { [A_DDB]: "half" } },
      origins: ["ddb-importer"], uncovered: [{ origin: "official", because: "nothing to bind" }] }) },
    { drafted: { person: true, because: "official-uncovered" } });
    for (const r of [nr, ou]) expect(validateRecord(r)).toEqual([]);
    const out = run([nr, ou], [review(nr, { assert: [PRONE] }), review(ou)]);
    expect(out.rejected).toEqual([]);
    expect(out.agreed).toEqual([]);
    expect(out.disagreed.map((q) => [q.reason, q.review.agrees])).toEqual([["noReactions", true],
      ["official-uncovered", true]]);
    for (const r of out.records) expect(r.evidence.reviewed).toBeUndefined();
  });

  it("rejects a result carrying evidence or any field outside the shape (own properties only)", () => {
    const r = gated();
    for (const extra of [{ evidence: { person: { by: "owner" } } }, { verdict: "entry" }, { agrees: true }, { by: "x" }]) {
      const out = run([r], [review(r, extra)]);
      expect(out.agreed).toEqual([]);
      expect(reasonOf(out)).toMatch(/unknown field/);
    }
    expect(REVIEW_RESULT_FIELDS).toEqual(["key", "rule", "assert", "why", "confidence"]);
    const inherited = Object.create({ evidence: {} });
    Object.assign(inherited, review(r));
    expect(run([r], [inherited]).agreed).toEqual([r.key]);
    const proto = JSON.parse(`{"key":"${r.key}","rule":"${ruleFingerprint(r.rule)}","assert":[],"why":"x",`
      + '"confidence":1,"constructor":{}}');
    expect(reasonOf(run([r], [proto]))).toMatch(/constructor/);
  });

  it("checks every string a reviewer supplies for quotation, alone and jointly, before anything is queued", () => {
    const r = gated();
    const why = run([r], [review(r, { why: "alpha beta gamma delta epsilon zeta eta theta" })]);
    expect(reasonOf(why)).toMatch(/why contains a quotation/);
    const free = { given: HALF.given, expect: { ...HALF.expect, free: "gamma delta epsilon zeta eta theta iota kappa" } };
    const alone = run([r], [review(r, { assert: [free] })]);
    expect(alone.disagreed).toEqual([]);
    expect(reasonOf(alone)).toMatch(/assert\[0\]\.expect\.free quotes/);
    // Four words in why, four in a free: together they quote eight.
    const split = { given: HALF.given, expect: { ...HALF.expect, free: "epsilon zeta eta theta" } };
    const joint = run([r], [review(r, { why: "alpha beta gamma delta", assert: [split] })]);
    expect(joint.disagreed).toEqual([]);
    expect(reasonOf(joint)).toMatch(/together quote/);
    const reverse = { given: HALF.given, expect: { ...HALF.expect, free: "alpha beta gamma delta" } };
    expect(reasonOf(run([r], [review(r, { why: "epsilon zeta eta theta", assert: [reverse] })]))).toMatch(/together quote/);
    // Prose where a word of the vocabulary belongs is refused by the assertion check.
    const prose = run([r], [review(r, { assert: [{ given: { roll: "the target saves" }, expect: { affects: "target" } }] })]);
    expect(reasonOf(prose)).toMatch(/given\.roll/);
  });

  it("rejects an invalid or empty assert, a bad why or confidence, no text", () => {
    const r = gated();
    expect(reasonOf(run([r], [review(r, { assert: [] })]))).toMatch(/assert/);
    expect(reasonOf(run([r], [review(r, { assert: [{ given: {}, expect: { condition: { applied: "glowing" } } }] })])))
      .toMatch(/status of the engine/);
    expect(reasonOf(run([r], [review(r, { why: "two\nlines" })]))).toMatch(/single line/);
    expect(reasonOf(run([r], [review(r, { confidence: 2 })]))).toMatch(/confidence/);
    const lost = { ...r, text: { ...r.text, sha256: "c".repeat(64) } };
    expect(reasonOf(run([lost], [review(lost)]))).toMatch(/no text/);
  });

  it("rejects a record that is not gated, legacy, queued, unknown, not offered, or a key twice", () => {
    const r = gated();
    const drafted = { ...r, evidence: { ...r.evidence, gates: { ...r.evidence.gates, passed: ["schema"] } } };
    expect(reasonOf(run([drafted], [review(drafted)]))).toMatch(/drafted, not gated/);
    const reviewed = run([r], [review(r)]).records[0];
    expect(reasonOf(run([reviewed], [review(reviewed)]))).toMatch(/reviewed, not gated/);
    expect(reasonOf(run([{ ...r, legacy: true }], [review(r)]))).toMatch(/legacy/);
    const queued = { key: r.key, reason: "disagreement", by: "reviewer-0", why: "x", confidence: 0.9,
      review: { rule: ruleFingerprint(r.rule) } };
    expect(reasonOf(run([r], [review(r)], { queue: [queued] }))).toMatch(/review-queue/);
    // A queue entry about an earlier rule does not hold the key: the rule was edited since, a new review is due.
    expect(run([r], [review(r)], { queue: [{ ...queued, review: { rule: "e".repeat(64) } }] }).agreed).toEqual([r.key]);
    expect(reasonOf(run([r], [review(r, { key: "tst:spell:nothing" })]))).toMatch(/unknown key/);
    expect(reasonOf(run([r], [review(r)], { offered: new Map() }))).toMatch(/not offered/);
    const twice = run([r], [review(r), review(r)]);
    expect(twice.agreed).toEqual([r.key]);
    expect(reasonOf(twice)).toMatch(/twice/);
  });

  it("turns an exception on one result into its rejection, never the file's", () => {
    const r = gated();
    const other = gated({ key: "tst:spell:cold-snap" });
    const bad = review(r);
    Object.defineProperty(bad, "confidence", { enumerable: true, get() { throw new Error("boom"); } });
    const out = run([r, other], [bad, review(other)]);
    expect(out.agreed).toEqual([other.key]);
    expect(reasonOf(out)).toMatch(/internal: boom/);
  });

  it("needs core, offered and a reviewer handle", () => {
    expect(() => ingestReviews([], [], { textDir, by: "reviewer-1", offered: new Map() })).toThrow(/core/);
    expect(() => ingestReviews([], [], { textDir, by: "reviewer-1", core })).toThrow(/offered/);
    expect(() => ingestReviews([], [], { textDir, by: "rule", core, offered: new Map() })).toThrow(/by/);
  });
});

describe("cutReviewBatches", () => {
  it("cuts gated records only, leaving queued and legacy ones out, numbered per series", () => {
    const g = gated();
    const drafted = gated({ key: "tst:spell:cold-snap" });
    drafted.evidence.gates.passed = ["schema"];
    const queuedRec = gated({ key: "tst:spell:queued-one" });
    const queue = [{ key: queuedRec.key, reason: "disagreement", by: "reviewer-0", why: "x", confidence: 0.9,
      review: { rule: ruleFingerprint(queuedRec.rule) } }];
    const legacy = { ...gated({ key: "tst:spell:old-one" }), legacy: true };
    const records = [g, drafted, queuedRec, legacy];
    const batches = cutReviewBatches(records, { queue, after: { tst: 4 } });
    expect(batches.map((b) => [b.id, b.stage, b.entries.map((e) => e.key)]))
      .toEqual([["tst-review-005", "review", [g.key]]]);
    expect(reviewSkipReason(drafted, { queue })).toBe("not gated (drafted)");
    expect(reviewSkipReason(queuedRec, { queue })).toBe("queued");
    expect(reviewSkipReason(legacy, { queue })).toBe("legacy");
    expect(reviewSkipReason(g, { queue })).toBeNull();
    // At most `size` entries a batch, one kind a batch.
    const many = Array.from({ length: 5 }, (_, i) => gated({ key: `tst:spell:s-${i}` }));
    expect(cutReviewBatches(many, { size: 2 }).map((b) => b.entries.length)).toEqual([2, 2, 1]);
  });

  it("review batch carries nothing of the draft", () => {
    const r = gated({ rule: rule({ assert: [HALF, { given: { roll: "hit" }, expect: { affects: "target", free: "wobble" } }] }) });
    const [batch] = cutReviewBatches([r]);
    const [entry] = batch.entries;
    expect(entry.rule).toBe(ruleFingerprint(r.rule));
    const text = JSON.stringify(batch);
    for (const needle of [ADDS, "wobble", "saveDamage", "drafter-zz9", "savedSave", "\"half\"", "\"assert\"", "\"adds\"",
      "\"entry\"", "\"origins\"", "\"keys\"", "\"similar\"", "cold-snap", "\"why\"", "\"examples\""]) {
      expect(text).not.toContain(needle);
    }
    // What a drafter was given of the record: its facts, matched origins and their ids, the text fingerprint.
    expect(entry).toMatchObject({ key: r.key, name: r.name, kind: "spell", edition: "2024", textSha: r.text.sha256 });
    expect(entry.items.map((i) => i.origin)).toEqual(["official", "ddb-importer", "plutonium"]);
    expect(entry.items[0].activities).toEqual([A_OFF]);
    expect(entry.items.some((i) => "data" in i)).toBe(false);
    expect(Object.keys(entry).sort()).toEqual(["edition", "items", "key", "kind", "name", "page", "rule", "textSha"]);
  });
});

describe("pipeline CLI: batch review, ingest --review, review-accept", () => {
  let tmp, registry, env;
  const cli = (args, over = {}) =>
    spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env: { ...env, ...over } });
  const write = (name, body) => { const f = join(tmp, name); writeFileSync(f, JSON.stringify(body)); return f; };
  const reviewBatch = (id, records) => write(`${id}.json`, {
    id, stage: "review", entries: records.map((r) => ({ key: r.key, rule: ruleFingerprint(r.rule) }))
  });
  const withCore = it.skipIf(!process.env.DAS_CORE);
  let records;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "review-cli-"));
    registry = join(tmp, "registry");
    mkdirSync(join(tmp, "dumps"));
    env = { PATH: process.env.PATH, RULEPACK_TEXT: textDir, RULEPACK_REGISTRY: registry, RULEPACK_DUMPS: join(tmp, "dumps"),
      ...(process.env.DAS_CORE ? { DAS_CORE: process.env.DAS_CORE } : {}) };
    records = [gated(), gated({ key: "tst:spell:cold-snap", name: "Cold Snap", identifier: "tst-cold-snap" })];
    saveBook(registry, { book: "TST", records });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("--review with another mode, or without --batch, is a usage error", () => {
    const f = write("r.json", { batch: "tst-review-001", by: "reviewer-1", results: [] });
    for (const other of ["--second", "--third", "--overwrite", "--draft", "--settle-unsure"]) {
      expect(cli(["ingest", f, "--review", "--batch", reviewBatch("tst-review-001", records), other]).status).toBe(2);
    }
    expect(cli(["ingest", f, "--review"]).status).toBe(2);
    // A draft batch file does not answer a review.
    const draftBatch = write("tst-draft-001.json", { id: "tst-draft-001", stage: "draft", entries: [] });
    expect(cli(["ingest", f, "--review", "--batch", draftBatch]).status).toBe(2);
  });

  withCore("agrees and queues in one step, prints the counts, exits 1 on a rejection", () => {
    const [a, b] = records;
    const results = [review(a), review(b, { assert: [PRONE] }), review(a, { key: "tst:spell:nothing" })];
    const r = cli(["ingest", write("r.json", { batch: "tst-review-001", by: "reviewer-1", results }), "--review", "--batch",
      reviewBatch("tst-review-001", records)]);
    expect(r.status).toBe(1);
    const printed = JSON.parse(r.stdout);
    expect(printed).toMatchObject({ agreed: 1, queued: 1, reasons: { disagreement: 1 } });
    expect(printed.rejected.map((x) => x.key)).toEqual(["tst:spell:nothing"]);
    const book = loadBook(registry, "TST").records;
    expect(stateOf(book.find((x) => x.key === a.key))).toBe("reviewed");
    expect(stateOf(book.find((x) => x.key === b.key))).toBe("gated");
    const [q] = loadQueue(registry, "review");
    expect(q).toMatchObject({ key: b.key, reason: "disagreement", review: { onlyDraft: normaliseAssert([HALF]),
      onlyReview: normaliseAssert([PRONE]) } });
    // The record waits for a person: a later review of it is rejected until then.
    const again = cli(["ingest", write("r2.json", { batch: "tst-review-002", by: "reviewer-2", results: [review(b)] }),
      "--review", "--batch", reviewBatch("tst-review-002", [b])]);
    expect(JSON.parse(again.stdout).rejected[0].reason).toMatch(/review-queue/);
  });

  withCore("refuses a results file with an unknown top-level field or an invalid queue, writing nothing", () => {
    const before = readFileSync(join(registry, "tst.json"), "utf8");
    const batch = reviewBatch("tst-review-001", records);
    expect(cli(["ingest", write("r.json", { batch: "tst-review-001", by: "reviewer-1", results: [review(records[0])],
      evidence: {} }), "--review", "--batch", batch]).status).toBe(2);
    writeFileSync(join(registry, "review-queue.json"), "[{\"key\":1}]\n");
    expect(cli(["ingest", write("r.json", { batch: "tst-review-001", by: "reviewer-1", results: [review(records[0])] }),
      "--review", "--batch", batch]).status).toBe(2);
    expect(readFileSync(join(registry, "tst.json"), "utf8")).toBe(before);
    // A results file bound to another batch id is refused.
    rmSync(join(registry, "review-queue.json"));
    expect(cli(["ingest", write("r.json", { batch: "tst-review-009", by: "reviewer-1", results: [] }), "--review",
      "--batch", batch]).status).toBe(2);
  });

  withCore("batch review writes the batch, the vocabulary and the report, and nothing of the draft", () => {
    const out = join(tmp, "out");
    const r = cli(["batch", "review", "TST", "--out", out, "--structure", join(tmp, "private")]);
    expect(r.status).toBe(0);
    expect(readdirSync(out).sort()).toEqual(["review-vocabulary.json", "tst-review-001.json", "tst-review-report.json"]);
    const batch = JSON.parse(readFileSync(join(out, "tst-review-001.json"), "utf8"));
    expect(batch.entries.map((e) => e.key)).toEqual(records.map((x) => x.key).sort());
    expect(JSON.stringify(batch)).not.toMatch(/drafter-zz9|saveDamage|Zorbly/);
    const vocabulary = JSON.parse(readFileSync(join(out, "review-vocabulary.json"), "utf8"));
    expect(Object.keys(vocabulary).sort()).toEqual(["assert", "engine", "limits"]);
    expect(JSON.parse(readFileSync(join(out, "tst-review-report.json"), "utf8"))).toMatchObject({ book: "TST", cut: 2 });
    expect(existsSync(join(tmp, "private", "tst-review-001.structure.json"))).toBe(true);
    const next = cli(["batch", "review", "TST", "--out", out, "--structure", join(tmp, "private")]);
    expect(next.status).toBe(0);
    expect(readdirSync(out)).toContain("tst-review-002.json");
  });

  it("review-accept needs because, an owner, and a current queue entry", () => {
    const [a] = records;
    const entry = { key: a.key, reason: "noReactions", by: "reviewer-1", why: "x", confidence: 0.9,
      draft: { by: "drafter-zz9", rule: ruleFingerprint(a.rule), assert: [HALF], implied: normaliseAssert([HALF]) },
      review: { rule: ruleFingerprint(a.rule), assert: [HALF], agrees: true, onlyDraft: [], onlyReview: [] } };
    saveQueue(registry, "review", [entry]);
    expect(cli(["review-accept", a.key, "--by", "owner"]).status).toBe(2);
    expect(cli(["review-accept", a.key, "--because", "checked it", "--by", "reviewer-9"]).status).toBe(2);
    expect(cli(["review-accept", a.key, "--because", "checked it"]).status).toBe(2);
    expect(cli(["review-accept", records[1].key, "--because", "checked it", "--by", "owner"]).status).toBe(2);
    const before = readFileSync(join(registry, "tst.json"), "utf8");
    saveQueue(registry, "review", [{ ...entry, review: { ...entry.review, rule: "e".repeat(64) } }]);
    expect(cli(["review-accept", a.key, "--because", "checked it", "--by", "owner"]).status).toBe(2);
    expect(readFileSync(join(registry, "tst.json"), "utf8")).toBe(before);
    saveQueue(registry, "review", [entry]);
    const r = cli(["review-accept", a.key, "--because", "checked the reaction by hand", "--by", "owner"]);
    expect(r.status).toBe(0);
    const next = loadBook(registry, "TST").records.find((x) => x.key === a.key);
    expect(next.evidence.reviewed).toMatchObject({ by: "owner", agrees: true, rule: ruleFingerprint(a.rule), confidence: 1,
      because: "checked the reaction by hand" });
    expect(next.rule).toEqual(a.rule);
    // `because` was written after the gates: their evidence no longer stands until `gates` runs (and reads it) again.
    expect(stateOf(next)).toBe("drafted");
    expect(r.stdout).toMatch(/npm run gates/);
    expect(loadQueue(registry, "review")).toEqual([]);
  });
});

const nineWords = "alpha beta gamma delta epsilon zeta eta theta iota";
describe("fix round 1", () => {
  it("the text gate reads evidence.reviewed.because and evidence.person.because, alone and with the rule's prose", () => {
    const r = gated();
    const withBecause = (ev) => ({ ...r, evidence: { ...r.evidence, ...ev } });
    const reviewed = { by: "owner", at: AT, agrees: true, rule: ruleFingerprint(r.rule), confidence: 1 };
    expect(checkText(withBecause({ reviewed: { ...reviewed, because: "checked by hand" } }), { textDir }).failures).toEqual([]);
    expect(checkText(withBecause({ reviewed: { ...reviewed, because: nineWords } }), { textDir }).failures.join(" "))
      .toMatch(/evidence\.reviewed\.because quotes/);
    expect(checkText(withBecause({ person: { by: "owner", because: nineWords, rule: ruleFingerprint(r.rule) } }), { textDir })
      .failures.join(" ")).toMatch(/evidence\.person\.because quotes/);
    // Four words in adds, four in because: together they quote eight.
    const split = { ...withBecause({ reviewed: { ...reviewed, because: "epsilon zeta eta theta" } }),
      rule: rule({ adds: "alpha beta gamma delta" }) };
    expect(checkText(split, { textDir }).failures.join(" ")).toMatch(/together quotes/);
  });

  it("a because written after the gates makes their evidence stale, so --ci cannot pass it unread", () => {
    const r = gated();
    const reviewed = { by: "owner", at: AT, agrees: true, rule: ruleFingerprint(r.rule), confidence: 1 };
    const accepted = { ...r, evidence: { ...r.evidence, reviewed } };
    expect(emittedFingerprint(accepted)).toBe(emittedFingerprint(r));
    expect(stateOf(accepted)).toBe("reviewed");
    const withBecause = { ...r, evidence: { ...r.evidence, reviewed: { ...reviewed, because: nineWords } } };
    expect(emittedFingerprint(withBecause)).not.toBe(emittedFingerprint(r));
    expect(stateOf(withBecause)).toBe("drafted");
  });

  it("the joint quotation check covers everything a queue entry stores: why, the draft's and the review's free texts", () => {
    const freeOf = (words) => ({ given: HALF.given, expect: { ...HALF.expect, free: words } });
    const r = gated({ rule: rule({ assert: [freeOf("alpha beta gamma")] }) });
    const out = run([r], [review(r, { why: "delta epsilon zeta", assert: [freeOf("eta theta iota"), HALF] })]);
    expect(out.disagreed).toEqual([]);
    expect(reasonOf(out)).toMatch(/together quote/);
  });

  it("a person's rule (no drafted evidence) is cut and reviewed; independence holds against every handle on the record", () => {
    const own = gated({}, { drafted: null, person: "owner" });
    expect(validateRecord(own)).toEqual([]);
    expect(stateOf(own)).toBe("gated");
    expect(reviewSkipReason(own)).toBeNull();
    expect(cutReviewBatches([own])[0].entries.map((e) => e.key)).toEqual([own.key]);
    expect(reasonOf(run([own], [review(own)], { by: "OWNER" }))).toMatch(/independent/);
    const ok = run([own], [review(own)]);
    expect(ok.agreed).toEqual([own.key]);
    // Drafted, then edited and signed by a person: reviewed as it is now, by someone who is neither.
    const edited = gated({ rule: rule({ adds: "Edited by a person." }) }, { drafted: { rule: "d".repeat(64) }, person: "owner" });
    expect(edited.evidence.drafted.rule).not.toBe(ruleFingerprint(edited.rule));
    for (const by of ["drafter-zz9", "owner"]) expect(reasonOf(run([edited], [review(edited)], { by }))).toMatch(/independent/);
    const second = run([edited], [review(edited)]);
    expect(second.agreed).toEqual([edited.key]);
    expect(second.records[0].evidence.reviewed.rule).toBe(ruleFingerprint(edited.rule));
    // Queued, the entry names both.
    const queued = run([edited], [review(edited, { confidence: 0.5 })]).disagreed[0];
    expect(queued.draft).toMatchObject({ by: "drafter-zz9", person: "owner" });
    expect(validateQueueEntry(queued, { queue: "review" })).toEqual([]);
  });

  it("validates what sits inside a review-queue entry: shape and closed vocabulary, no prose", () => {
    const r = gated();
    const [entry] = run([r], [review(r, { assert: [PRONE] })]).disagreed;
    expect(validateQueueEntry(entry, { queue: "review" })).toEqual([]);
    expect(validateQueueEntry(entry, { queue: "review", vocabulary: core })).toEqual([]);
    const bad = (path, value) => {
      const e = structuredClone(entry);
      const parts = path.split(".");
      let node = e;
      for (const p of parts.slice(0, -1)) node = node[p];
      node[parts.at(-1)] = value;
      return validateQueueEntry(e, { queue: "review", vocabulary: core }).join("; ");
    };
    expect(bad("review.assert", [{ given: { roll: "when it fails" }, expect: { affects: "target" } }])).toMatch(/review\.assert/);
    expect(bad("draft.assert", [{ given: {}, expect: { condition: { applied: "falls over and sulks" } } }]))
      .toMatch(/draft\.assert/);
    expect(bad("review.onlyDraft", ["the target falls over"])).toMatch(/onlyDraft/);
    expect(bad("draft.implied", ["expect.damage.fraction=0.5;given.roll=a long sentence of prose"])).toMatch(/implied/);
    expect(bad("review.agrees", "yes")).toMatch(/agrees/);
    expect(bad("review.rule", "abc")).toMatch(/rule/);
    expect(bad("review.note", "hello")).toMatch(/note: unknown field/);
    expect(bad("draft.by", "rule")).toMatch(/by/);
    // The drafts queue keeps a draft rule as it is: not held to this shape.
    const { review: dropped, ...draftOnly } = entry;
    expect(validateQueueEntry(draftOnly, { queue: "drafts" })).toEqual([]);
    expect(() => queueText("review", [{ ...entry, review: { ...entry.review, onlyReview: ["prose here"] } }]))
      .toThrow(/onlyReview/);
  });

  it("the reviewer brief's example is a placeholder that shows the shape only", () => {
    const doc = readFileSync(join(process.cwd(), "docs", "PIPELINE.md"), "utf8");
    const brief = doc.slice(doc.indexOf("## 📖 Brief for a reviewer agent"), doc.indexOf("## 📥 Ingesting results"));
    expect(brief).toMatch(/the example shows the shape only/);
    expect(brief).not.toMatch(/"savedSave"/);
    expect(brief).toMatch(/invalidates its own review/);
  });
});

describe("fix round 1: CLI", () => {
  let tmp, registry, env;
  const cli = (args, over = {}) =>
    spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env: { ...env, ...over } });
  const write = (name, body) => { const f = join(tmp, name); writeFileSync(f, JSON.stringify(body)); return f; };
  const withCore = it.skipIf(!process.env.DAS_CORE);
  let records;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "review-fix-"));
    registry = join(tmp, "registry");
    env = { PATH: process.env.PATH, RULEPACK_TEXT: textDir, RULEPACK_REGISTRY: registry,
      ...(process.env.DAS_CORE ? { DAS_CORE: process.env.DAS_CORE } : {}) };
    records = [gated()];
    saveBook(registry, { book: "TST", records });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("review-accept refuses a because that quotes the text, and needs the text to check it", () => {
    const [a] = records;
    saveQueue(registry, "review", [{ key: a.key, reason: "noReactions", by: "reviewer-1", why: "x", confidence: 0.9,
      draft: { by: "drafter-zz9", rule: ruleFingerprint(a.rule), assert: [HALF], implied: normaliseAssert([HALF]) },
      review: { rule: ruleFingerprint(a.rule), assert: [HALF], agrees: true, onlyDraft: [], onlyReview: [] } }]);
    const before = readFileSync(join(registry, "tst.json"), "utf8");
    const quoted = cli(["review-accept", a.key, "--because", nineWords, "--by", "owner"]);
    expect(quoted.status).toBe(2);
    expect(quoted.stderr).toMatch(/quot/);
    expect(cli(["review-accept", a.key, "--because", "checked it", "--by", "owner"], { RULEPACK_TEXT: "" }).status).toBe(2);
    expect(cli(["review-accept", a.key, "--because", "checked it", "--by", "owner"], { RULEPACK_TEXT: join(tmp, "none") })
      .status).toBe(2);
    expect(readFileSync(join(registry, "tst.json"), "utf8")).toBe(before);
    expect(loadQueue(registry, "review")).toHaveLength(1);
  });

  withCore("an owner's handle never comes in through a results file, whatever the mode", () => {
    const batchFile = (id, stage) => write(`${id}.json`, { id, stage, entries: records.map((r) => ({ key: r.key,
      rule: ruleFingerprint(r.rule) })) });
    const cases = [
      [write("t.json", { batch: "tst-triage-001", by: "owner", results: [] }), []],
      [write("s.json", { batch: "tst-second-001", by: "owner", results: [] }), ["--second"]],
      [write("th.json", { batch: "tst-third-001", by: "owner", results: [] }), ["--third"]],
      [write("d.json", { batch: "tst-draft-001", by: "owner", results: [] }), ["--draft", "--batch",
        batchFile("tst-draft-001", "draft")]],
      [write("r.json", { batch: "tst-review-001", by: "owner", results: [review(records[0])] }), ["--review", "--batch",
        batchFile("tst-review-001", "review")]]
    ];
    const before = readFileSync(join(registry, "tst.json"), "utf8");
    for (const [file, flags] of cases) {
      const r = cli(["ingest", file, ...flags]);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/owners\.json/);
    }
    expect(readFileSync(join(registry, "tst.json"), "utf8")).toBe(before);
  });

  withCore("a hand-edited review queue with prose fails gates --ci", () => {
    const [a] = records;
    const entry = { key: a.key, reason: "disagreement", by: "reviewer-1", why: "x", confidence: 0.9,
      draft: { by: "drafter-zz9", rule: ruleFingerprint(a.rule), assert: [HALF], implied: normaliseAssert([HALF]) },
      review: { rule: ruleFingerprint(a.rule), assert: [PRONE], agrees: false, onlyDraft: normaliseAssert([HALF]),
        onlyReview: normaliseAssert([PRONE]) } };
    writeFileSync(join(registry, "review-queue.json"), `${JSON.stringify([entry])}\n`);
    expect(cli(["gates", "--ci"]).stderr).not.toMatch(/review-queue/);
    const prose = { ...entry, review: { ...entry.review, assert: [{ given: {}, expect: { condition: {
      applied: "it falls over and sulks" } } }] } };
    writeFileSync(join(registry, "review-queue.json"), `${JSON.stringify([prose])}\n`);
    const r = cli(["gates", "--ci"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/review-queue\.json.*review\.assert/);
  });
});
