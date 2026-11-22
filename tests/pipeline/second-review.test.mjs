// The second review (Ruling R40): a review-queue entry queued as `disagreement` or `low-confidence` (never a key reason, never
// a rule an owner wrote or signed, never one whose draft is stale) is read once more by a blind reviewer. `batch review
// --second` cuts those entries alone, as ordinary review entries; `ingest --review --second` confirms the rule when the second
// reviewer agrees with the DRAFT at or above the threshold (evidence.reviewed with `via: "second-review"` and the first
// review kept as `first`), and otherwise keeps the entry marked `second`, so that it is never cut again.
// Synthetic fixtures only: invented entries, invented words.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NOT_SECOND_REVIEWABLE, SECOND_REVIEW_REASONS, SECOND_REVIEW_RESULTS, ingestReviews, secondReviewSkipReason
} from "../../tools/pipeline/review.mjs";
import { cutReviewBatches } from "../../tools/pipeline/batch.mjs";
import { emissionOf } from "../../tools/pipeline/generate.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { normaliseAssert } from "../../tools/pipeline/assert.mjs";
import {
  emittedFingerprint, gatedItems, loadBook, loadQueue, ruleFingerprint, saveBook, saveQueue, stateOf, validateQueueEntry,
  validateRecord
} from "../../tools/pipeline/registry.mjs";
import { countsLine } from "../../tools/books-progress.mjs";

const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
const AT = "2026-01-01T00:00:00.000Z";
const LATER = "2026-11-22T00:00:00.000Z";
const A_OFF = "Af11Bf22Cf33Df44";
const E_OFF = "Ef11Ef22Ef33Ef44";
const OWNERS = ["owner"];
const core = {
  version: "9.9.9", facts: ["actor.prone"], identifiers: new Set(), vocabulary: new Set(), validateEntry: () => [],
  moments: ["failedSave", "endOfTurn", "startOfTurn"], statuses: ["prone", "blinded"], creatureTypes: ["undead"],
  moveModes: ["push"], effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"]
};
const HALF = { given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } };
const PRONE = { given: { roll: "failedSave" }, expect: { condition: { applied: "prone" } } };
const BLIND = { given: { roll: "failedSave" }, expect: { condition: { applied: "blinded" } } };
// The first reviewer's line: it must never reach the second reviewer's batch.
const FIRST_WHY = "the wizzle seems to topple the quux";

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "second-review-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const ruleOf = (over = {}) => ({ handledIn: "table", adds: "Zorbly the quux halves things for the wizzle.",
  entry: { saveDamage: { [A_OFF]: "half" } }, origins: ["official"], assert: [HALF], ...over });
// A record as gates leave it: drafted by `drafter-zz9`, every gate passed on the rule as it is.
const gated = (over = {}, { drafted = {}, person } = {}) => {
  const r = {
    key: "tst:spell:frost-glimmer", name: "Frost Glimmer", kind: "spell", book: "TST", page: 3, edition: "2024",
    identifier: "frost-glimmer", text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
    items: [{ origin: "official", match: "matched", identifier: "frost-glimmer", docId: "Do11Do22Do33Do44",
      activities: [A_OFF], effects: [E_OFF], data: { sha256: "a".repeat(64) } }],
    verdict: "entry", why: "a save halves it", evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9 } },
    rule: ruleOf(), ...over
  };
  if (drafted !== null) {
    r.evidence.drafted = { by: "drafter-zz9", at: AT, core: "9.9.9", rule: ruleFingerprint(r.rule), ...drafted };
  }
  if (person) r.evidence.person = { by: person, because: "written by hand", rule: ruleFingerprint(r.rule) };
  r.evidence.gates = { at: AT, core: "9.9.9", rule: ruleFingerprint(r.rule), emits: emittedFingerprint(r),
    passed: ["schema", "validator", "ids", "fixes", "text", "unique"], items: gatedItems(r) };
  return r;
};
// A review-queue entry as the first review left it: reviewer-1 read PRONE where the draft says HALF.
const queued = (r, over = {}) => ({
  key: r.key, reason: "disagreement", by: "reviewer-1", why: FIRST_WHY, confidence: 0.8,
  draft: { by: "drafter-zz9", rule: ruleFingerprint(r.rule), assert: [HALF], implied: normaliseAssert([HALF]) },
  review: { rule: ruleFingerprint(r.rule), assert: [PRONE], agrees: false, onlyDraft: normaliseAssert([HALF]),
    onlyReview: normaliseAssert([PRONE]), baseline: [], detail: [] }, ...over
});
const lowConfidence = (r) => queued(r, { reason: "low-confidence", confidence: 0.5,
  review: { rule: ruleFingerprint(r.rule), assert: [HALF], agrees: true, onlyDraft: [], onlyReview: [], baseline: [],
    detail: [] } });
const answer = (r, over = {}) => ({ key: r.key, rule: ruleFingerprint(r.rule), assert: [HALF], why: "a save halves it",
  confidence: 0.9, ...over });
const offeredOf = (records) => new Map(records.map((r) => [r.key, ruleFingerprint(r.rule)]));
const second = (records, results, queue, opts = {}) => ingestReviews(records, results, {
  textDir, by: "reviewer-2", at: LATER, core, offered: offeredOf(records), queue, second: true, owners: OWNERS, ...opts
});

describe("secondReviewSkipReason: which queue entries a second review may read", () => {
  it("only disagreement and low-confidence, about the rule as it is, drafted by an agent", () => {
    expect(SECOND_REVIEW_REASONS).toEqual(["disagreement", "low-confidence"]);
    const r = gated();
    expect(secondReviewSkipReason(queued(r), r, { owners: OWNERS })).toBeNull();
    expect(secondReviewSkipReason(lowConfidence(r), r, { owners: OWNERS })).toBeNull();
  });

  it("never a key reason, free text or unexpressed", () => {
    const r = gated();
    for (const reason of ["noReactions", "official-uncovered", "free-text", "unexpressed"]) {
      expect(secondReviewSkipReason(queued(r, { reason }), r, { owners: OWNERS })).toBe("other reason");
    }
  });

  it("never a rule an owner wrote or signed, nor one stamped for a person", () => {
    const own = gated({}, { drafted: null });
    expect(secondReviewSkipReason(queued(own), own, { owners: OWNERS })).toBe("owner");
    const signed = gated({}, { person: "owner" });
    expect(secondReviewSkipReason(queued(signed), signed, { owners: OWNERS })).toBe("owner");
    const byOwner = gated({}, { drafted: { by: "OWNER" } });
    expect(secondReviewSkipReason(queued(byOwner), byOwner, { owners: OWNERS })).toBe("owner");
    const stamped = gated({}, { drafted: { person: true, because: "noReactions" } });
    expect(secondReviewSkipReason(queued(stamped), stamped, { owners: OWNERS })).toBe("owner");
    expect(() => secondReviewSkipReason(queued(own), own)).toThrow(/owners/);
  });

  it("never a stale draft, a second review done, or a record not gated", () => {
    const r = gated();
    const stale = queued(r, { draft: { ...queued(r).draft, rule: "e".repeat(64) } });
    expect(secondReviewSkipReason(stale, r, { owners: OWNERS })).toBe("stale");
    const old = queued(r, { review: { ...queued(r).review, rule: "e".repeat(64) } });
    expect(secondReviewSkipReason(old, r, { owners: OWNERS })).toBe("stale");
    const done = queued(r, { second: { by: "reviewer-2", at: LATER, agrees: false, result: "read" } });
    expect(secondReviewSkipReason(done, r, { owners: OWNERS })).toBe("second review done");
    const drafted = { ...r, evidence: { ...r.evidence, gates: undefined } };
    expect(secondReviewSkipReason(queued(r), drafted, { owners: OWNERS })).toBe("not gated (drafted)");
    expect(secondReviewSkipReason(queued(r), undefined, { owners: OWNERS })).toBe(NOT_SECOND_REVIEWABLE);
    expect(secondReviewSkipReason(undefined, r, { owners: OWNERS })).toBe(NOT_SECOND_REVIEWABLE);
  });
});

describe("batch review --second: the open entries alone, blind, on their own series", () => {
  const other = () => gated({ key: "tst:spell:cold-snap", name: "Cold Snap", identifier: "cold-snap" });
  const owned = () => gated({ key: "tst:spell:dim-ward", name: "Dim Ward", identifier: "dim-ward" }, { person: "owner" });

  it("cuts only the reviewable queue entries, marked second, numbered apart", () => {
    const records = [gated(), other(), owned()];
    const queue = [queued(records[0]), queued(records[2])];
    const batches = cutReviewBatches(records, { queue, second: true, owners: OWNERS, after: { tst: 4 } });
    expect(batches.map((b) => b.id)).toEqual(["tst-review-second-005"]);
    expect(batches[0]).toMatchObject({ stage: "review", second: true });
    expect(batches[0].entries.map((e) => e.key)).toEqual([records[0].key]);
    // Without --second the queued records are left out as ever and the gated one is cut.
    const plain = cutReviewBatches(records, { queue });
    expect(plain.map((b) => b.id)).toEqual(["tst-review-001"]);
    expect(plain[0].entries.map((e) => e.key)).toEqual([other().key]);
    expect(plain[0]).not.toHaveProperty("second");
  });

  it("is blind: nothing of the draft, the first review or the queue's reason and why", () => {
    const r = gated();
    const [batch] = cutReviewBatches([r], { queue: [queued(r)], second: true, owners: OWNERS });
    const text = JSON.stringify(batch);
    for (const word of [FIRST_WHY, "reviewer-1", "drafter-zz9", "disagreement", "saveDamage", "Zorbly", "prone",
      "savedSave"]) {
      expect(text).not.toContain(word);
    }
    // The same entry as a plain review cut gives for the record outside the queue.
    const [plain] = cutReviewBatches([r]);
    expect(batch.entries).toEqual(plain.entries);
  });

  it("needs the owners", () => {
    expect(() => cutReviewBatches([gated()], { queue: [], second: true })).toThrow(/owners/);
  });
});

describe("ingestReviews with second: the tie-break", () => {
  it("a second reviewer who agrees with the draft confirms the rule, keeping the first review on record", () => {
    const r = gated();
    const out = second([r], [answer(r)], [queued(r)]);
    expect(out.rejected).toEqual([]);
    expect(out.agreed).toEqual([r.key]);
    expect(out.marked).toEqual([]);
    const [next] = out.records;
    expect(next.evidence.reviewed).toEqual({ by: "reviewer-2", at: LATER, agrees: true, rule: ruleFingerprint(r.rule),
      confidence: 0.9, via: "second-review", first: { by: "reviewer-1", confidence: 0.8, reason: "disagreement",
        assert: normaliseAssert([PRONE]), onlyDraft: normaliseAssert([HALF]), onlyReview: normaliseAssert([PRONE]) } });
    expect(validateRecord(next)).toEqual([]);
    expect(stateOf(next)).toBe("reviewed");
    expect(next.rule).toEqual(r.rule);
  });

  it("settles a low-confidence entry the same way", () => {
    const r = gated();
    const out = second([r], [answer(r, { confidence: 0.7 })], [lowConfidence(r)]);
    expect(out.agreed).toEqual([r.key]);
    expect(out.records[0].evidence.reviewed.first).toMatchObject({ reason: "low-confidence", confidence: 0.5,
      onlyDraft: [], onlyReview: [] });
  });

  it("a second reviewer who disagrees keeps the entry, marked; withFirst when it reads what the first read", () => {
    const r = gated();
    const out = second([r], [answer(r, { assert: [PRONE] })], [queued(r)]);
    expect(out.agreed).toEqual([]);
    expect(out.marked).toEqual([{ ...queued(r), second: { by: "reviewer-2", at: LATER, agrees: false, result: "read",
      confidence: 0.9, assert: [PRONE], onlyDraft: normaliseAssert([HALF]), onlyReview: normaliseAssert([PRONE]),
      withFirst: true } }]);
    expect(validateQueueEntry(out.marked[0], { queue: "review", vocabulary: core })).toEqual([]);
    expect(out.records[0]).toEqual(r);
    const apart = second([r], [answer(r, { assert: [BLIND] })], [queued(r)]);
    expect(apart.marked[0].second).toMatchObject({ agrees: false, result: "read" });
    expect(apart.marked[0].second).not.toHaveProperty("withFirst");
  });

  it("an unsure second reviewer, even one that agrees, keeps the entry marked unsure", () => {
    const r = gated();
    const out = second([r], [answer(r, { confidence: 0.69 })], [queued(r)]);
    expect(out.agreed).toEqual([]);
    expect(out.marked[0].second).toMatchObject({ agrees: "unsure", result: "read", confidence: 0.69 });
    expect(out.marked[0].reason).toBe("disagreement");
  });

  it("an unexpressed answer disagrees with the draft", () => {
    const r = gated();
    const out = second([r], [{ key: r.key, rule: ruleFingerprint(r.rule), outcome: "person", why: "cannot say it",
      confidence: 0.9 }], [queued(r)]);
    expect(out.marked[0].second).toMatchObject({ agrees: false, result: "read", assert: [] });
  });

  it("a rejected or a missing result keeps the entry marked, so that it is not cut again", () => {
    const a = gated();
    const b = gated({ key: "tst:spell:cold-snap", name: "Cold Snap", identifier: "cold-snap" });
    const out = second([a, b], [answer(a, { confidence: 3 })], [queued(a), queued(b)]);
    expect(out.rejected.map((x) => x.key)).toEqual([a.key]);
    expect(out.marked.map((q) => [q.key, q.second])).toEqual([
      [a.key, { by: "reviewer-2", at: LATER, agrees: "unsure", result: "rejected" }],
      [b.key, { by: "reviewer-2", at: LATER, agrees: "unsure", result: "missing" }]]);
    for (const q of out.marked) expect(validateQueueEntry(q, { queue: "review", vocabulary: core })).toEqual([]);
  });

  it("refuses the first reviewer, an author, and an entry not open to a second review; marks none of them twice", () => {
    const r = gated();
    const same = second([r], [answer(r)], [queued(r)], { by: "REVIEWER-1" });
    expect(same.rejected[0].reason).toMatch(/first review/);
    expect(same.agreed).toEqual([]);
    const author = second([r], [answer(r)], [queued(r)], { by: "drafter-zz9" });
    expect(author.rejected[0].reason).toMatch(/author/);
    const done = queued(r, { second: { by: "reviewer-3", at: LATER, agrees: false, result: "read" } });
    const again = second([r], [answer(r)], [done]);
    expect(again.rejected[0].reason).toMatch(/second review done/);
    expect(again.marked).toEqual([]);
    const key = second([r], [answer(r)], [queued(r, { reason: "noReactions" })]);
    expect(key.rejected[0].reason).toMatch(/other reason/);
    expect(key.marked).toEqual([]);
    const none = second([r], [answer(r)], []);
    expect(none.rejected[0].reason).toMatch(/not open to a second review/);
  });

  it("a plain review of a queued record is still refused", () => {
    const r = gated();
    const out = ingestReviews([r], [answer(r)], { textDir, by: "reviewer-2", at: LATER, core, offered: offeredOf([r]),
      queue: [queued(r)] });
    expect(out.rejected[0].reason).toMatch(/review-queue/);
  });
});

describe("schema of the second review", () => {
  const confirmed = () => second([gated()], [answer(gated())], [queued(gated())]).records[0];

  it("evidence.reviewed: via second-review goes with first, a closed shape", () => {
    const r = confirmed();
    const bad = (reviewed) => validateRecord({ ...r, evidence: { ...r.evidence, reviewed } }).join(" ");
    const { via, first, ...plain } = r.evidence.reviewed;
    expect(bad(plain)).toBe("");
    expect(bad({ ...plain, via })).toMatch(/via/);
    expect(bad({ ...plain, first })).toMatch(/first/);
    expect(bad({ ...plain, via: "third-review", first })).toMatch(/via/);
    expect(bad({ ...plain, via, first: { ...first, reason: "noReactions" } })).toMatch(/first/);
    expect(bad({ ...plain, via, first: { ...first, why: "prose" } })).toMatch(/first/);
    expect(bad({ ...plain, via, first: { ...first, onlyDraft: ["not canonical"] } })).toMatch(/first/);
    expect(bad({ ...plain, via, first: { ...first, by: "rule" } })).toMatch(/first/);
  });

  it("a review-queue entry's `second`: a closed mark, in review-queue.json only", () => {
    const r = gated();
    const mark = { by: "reviewer-2", at: LATER, agrees: false, result: "read", confidence: 0.9, assert: [PRONE],
      onlyDraft: normaliseAssert([HALF]), onlyReview: normaliseAssert([PRONE]), withFirst: true };
    const ok = (second, queue = "review") => validateQueueEntry({ ...queued(r), second }, { queue, vocabulary: core });
    expect(ok(mark)).toEqual([]);
    expect(ok({ by: "reviewer-2", at: LATER, agrees: "unsure", result: "missing" })).toEqual([]);
    expect(SECOND_REVIEW_RESULTS).toEqual(["read", "rejected", "missing"]);
    expect(ok(mark, "drafts").join(" ")).toMatch(/second/);
    expect(ok({ ...mark, agrees: true }).join(" ")).toMatch(/second\.agrees/);
    expect(ok({ ...mark, result: "lost" }).join(" ")).toMatch(/second\.result/);
    expect(ok({ ...mark, withFirst: false }).join(" ")).toMatch(/second\.withFirst/);
    expect(ok({ ...mark, why: "prose" }).join(" ")).toMatch(/second\.why/);
    expect(ok({ ...mark, onlyReview: ["prose"] }).join(" ")).toMatch(/second\.onlyReview/);
    expect(ok({ ...mark, assert: [{ given: {}, expect: { condition: { applied: "glowing" } } }] }).join(" "))
      .toMatch(/second\.assert/);
    expect(ok({ ...mark, by: "rule" }).join(" ")).toMatch(/second\.by/);
    // A read result carries what was read; a rejected or missing one carries nothing but the mark.
    expect(ok({ by: "reviewer-2", at: LATER, agrees: false, result: "read" }).join(" ")).toMatch(/second/);
    expect(ok({ ...mark, result: "missing" }).join(" ")).toMatch(/second/);
  });
});

describe("emission and the RULES.md count", () => {
  it("a rule a second review confirmed ships as reviewed; a marked entry stays held", () => {
    const r = gated();
    const out = second([r], [answer(r)], [queued(r)]);
    expect(emissionOf(out.records[0], { queue: [] })).toEqual({ emitted: true, because: "reviewed" });
    const kept = second([r], [answer(r, { assert: [PRONE] })], [queued(r)]);
    expect(emissionOf(kept.records[0], { queue: kept.marked })).toEqual({ emitted: false, because: "disagreement" });
    const unsure = second([r], [answer(r, { confidence: 0.5 })], [lowConfidence(r)]);
    expect(emissionOf(unsure.records[0], { queue: unsure.marked })).toEqual({ emitted: false, because: "low-confidence" });
  });

  it("countsLine says how many shipped rules a second review settled", () => {
    const rules = [{ book: "TST", identifier: "a", status: "validated" }, { book: "TST", identifier: "b",
      status: "validated" }];
    expect(countsLine(rules, { second: new Set(["TST|a"]) }))
      .toBe("2 rules: 0 played, 2 validated. 1 of them settled by a second review (Ruling R40).");
    expect(countsLine(rules)).toBe("2 rules: 0 played, 2 validated.");
  });
});

describe("pipeline CLI: batch review --second, ingest --review --second", () => {
  let tmp, registry, env, records;
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  const write = (name, body) => { const f = join(tmp, name); writeFileSync(f, JSON.stringify(body)); return f; };
  const batchFile = (id, rs, over = {}) => write(`${id}.json`, {
    id, stage: "review", entries: rs.map((r) => ({ key: r.key, rule: ruleFingerprint(r.rule) })), ...over
  });
  const withCore = it.skipIf(!process.env.DAS_CORE);

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "second-review-cli-"));
    registry = join(tmp, "registry");
    mkdirSync(join(tmp, "dumps"));
    env = { PATH: process.env.PATH, RULEPACK_TEXT: textDir, RULEPACK_REGISTRY: registry, RULEPACK_DUMPS: join(tmp, "dumps"),
      ...(process.env.DAS_CORE ? { DAS_CORE: process.env.DAS_CORE } : {}) };
    records = [gated(), gated({ key: "tst:spell:cold-snap", name: "Cold Snap", identifier: "cold-snap" })];
    saveBook(registry, { book: "TST", records });
    saveQueue(registry, "review", records.map((r) => queued(r)));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("refuses --second on a plain review batch, a second batch without --second, and --second on other stages", () => {
    const f = write("r.json", { batch: "tst-review-001", by: "reviewer-2", results: [] });
    const plain = cli(["ingest", f, "--review", "--second", "--batch", batchFile("tst-review-001", records)]);
    expect(plain.status).toBe(2);
    expect(plain.stderr).toMatch(/second/);
    const g = write("s.json", { batch: "tst-review-second-001", by: "reviewer-2", results: [] });
    const marked = batchFile("tst-review-second-001", records, { second: true });
    const without = cli(["ingest", g, "--review", "--batch", marked]);
    expect(without.status).toBe(2);
    const unmarked = cli(["ingest", g, "--review", "--second", "--batch",
      batchFile("tst-review-second-001", records)]);
    expect(unmarked.status).toBe(2);
    expect(unmarked.stderr).toMatch(/not a second review batch/);
    expect(cli(["batch", "draft", "TST", "--out", join(tmp, "o"), "--structure", join(tmp, "p"), "--second"]).status)
      .toBe(2);
    expect(cli(["batch", "triage", "TST", "--out", join(tmp, "o"), "--second"]).status).toBe(2);
    expect(cli(["ingest", g, "--review", "--second", "--third", "--batch", marked]).status).toBe(2);
  });

  withCore("cuts the queue entries blind, confirms one, marks the other, and never cuts them again", () => {
    const out = join(tmp, "out");
    const args = ["batch", "review", "TST", "--out", out, "--structure", join(tmp, "private")];
    const plain = cli(args);
    expect(plain.status, plain.stderr).toBe(0);
    expect(plain.stdout).toMatch(/0 batches/);
    const cut = cli([...args, "--second"]);
    expect(cut.status, cut.stderr).toBe(0);
    expect(readdirSync(out).sort()).toEqual(["review-vocabulary.json", "tst-review-report.json",
      "tst-review-second-001.json", "tst-review-second-report.json"]);
    const batch = JSON.parse(readFileSync(join(out, "tst-review-second-001.json"), "utf8"));
    expect(batch).toMatchObject({ id: "tst-review-second-001", stage: "review", second: true,
      vocabulary: "review-vocabulary.json" });
    expect(batch.entries.map((e) => e.key)).toEqual(records.map((r) => r.key).sort());
    expect(JSON.stringify(batch)).not.toMatch(/reviewer-1|drafter-zz9|disagreement|wizzle|saveDamage/);
    expect(existsSync(join(tmp, "private", "tst-review-second-001.structure.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(out, "tst-review-second-report.json"), "utf8")))
      .toMatchObject({ book: "TST", batches: 1, cut: 2 });
    const [a, b] = records;
    const file = write("s.json", { batch: "tst-review-second-001", by: "reviewer-2",
      results: [answer(a), answer(b, { assert: [PRONE] })] });
    const taken = cli(["ingest", file, "--review", "--second", "--batch", join(out, "tst-review-second-001.json")]);
    expect(taken.status, taken.stderr).toBe(0);
    expect(JSON.parse(taken.stdout)).toMatchObject({ confirmed: 1, marked: 1, withFirst: 1, rejected: [] });
    const book = loadBook(registry, "TST").records;
    const confirmed = book.find((r) => r.key === a.key);
    expect(stateOf(confirmed)).toBe("reviewed");
    expect(confirmed.evidence.reviewed).toMatchObject({ by: "reviewer-2", via: "second-review",
      first: { by: "reviewer-1", reason: "disagreement" } });
    const queue = loadQueue(registry, "review");
    expect(queue.map((q) => q.key)).toEqual([b.key]);
    expect(queue[0]).toMatchObject({ reason: "disagreement", by: "reviewer-1", why: FIRST_WHY,
      second: { by: "reviewer-2", agrees: false, result: "read", withFirst: true } });
    const again = cli([...args, "--second"]);
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toMatch(/0 batches/);
    expect(again.stdout).toMatch(/second review done/);
    expect(readdirSync(out)).not.toContain("tst-review-second-002.json");
  });
});
