// The re-reading stage ("reread"): triage gave the verdict `entry` to monster features without knowing that DAS · Core reads
// their English text by itself. A reader blind to the earlier verdict compares the text with the engine's reading
// (`engineReads`) and says whether anything is left beyond it. Synthetic fixtures only: invented creatures and features,
// described in this test's own words.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REREAD_WHY, cutRereadBatches, ingestRereads, readingFingerprint, rereadReport, rereadStaleNote, rereadSkipReason
} from "../../tools/pipeline/reread.mjs";
import { saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";
import { HINTS, engineReadingPrepass, setByRule } from "../../tools/pipeline/triage.mjs";
import { ENGINE_READS_FIRST, cutDraftBatches, draftSkipReason } from "../../tools/pipeline/batch.mjs";
import { runGates } from "../../tools/pipeline/gates.mjs";
import { dataFingerprint } from "../../tools/pipeline/dumps.mjs";

const AT = "2026-11-22T00:00:00.000Z";
const SAVE = "Sv00Sv11Sv22Sv33";
const FX = "Fx00Fx11Fx22Fx33";
const SHA = "c".repeat(64);
// This test's own words: a cone of sparks, a failed save knocks the target flat and scares it, and a shield melts for an hour.
const TEXT = "The ember hound exhales a cone of sparks. A creature that fails its save is knocked flat, is scared of the hound,"
  + " and its shield melts away until the next dawn comes over the hills.";
const core = {
  version: "9.9.9", moments: ["turnStart", "turnEnd"], statuses: ["prone", "frightened", "grappled"],
  creatureTypes: ["beast"], moveModes: ["push", "pull"], effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"]
};
// What the stand-in engine reads: the fall on a failed save. The item's own data: a fire save whose effect frightens.
const READING = { triggers: [{ on: "failedSave", do: [{ type: "status", status: "prone" }] }] };
const STRUCTURE = {
  activities: [{ id: SAVE, label: "Sparks", type: "save", onSave: "half", effects: [FX],
    damage: [{ number: 2, denomination: 6, types: ["fire"] }] }],
  effects: [{ id: FX, name: "Scared", statuses: ["frightened"], changes: [], transfer: false }]
};
const FP = readingFingerprint(READING, core);

const keyOf = (n) => `tst:monster:ember-hound/action/feature-${n}`;
function monster(n, over = {}) {
  return {
    key: keyOf(n), name: `Feature ${n}`, kind: "monster", book: "TST", page: 7, edition: "2024", owner: "Ember Hound",
    section: "action", text: { sha256: SHA, source: "dataset", chars: TEXT.length }, verdict: "entry",
    why: "a reader thought this one needs a rule", hint: "core-generic",
    items: [{ origin: "official", match: "matched", identifier: `feature-${n}`,
      docId: `tstEmberHound000.ftFeature${String(n).padStart(7, "0")}`, activities: [SAVE], effects: [FX],
      data: { sha256: "b".repeat(64) } }],
    evidence: { triaged: { by: "reader-xmm-1", at: AT, confidence: 0.8, keys: ["triggers"], similar: [] } },
    ...over
  };
}
const fall = { given: { roll: "failedSave" }, expect: { condition: { applied: "prone" } } };
const scared = { given: { roll: "failedSave" }, expect: { condition: { applied: "frightened" } } };
const shove = { given: { roll: "failedSave" }, expect: { move: { mode: "push", distance: 10 } } };
const noReactions = { given: { roll: "failedSave" }, expect: { denies: "reactions" } };

describe("readingFingerprint: the engine version and a sha of the reading", () => {
  it("names the engine and fingerprints the reading by its content, not its key order", () => {
    expect(FP.core).toBe("9.9.9");
    expect(FP.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(readingFingerprint({ b: 1, a: [2] }, core)).toEqual(readingFingerprint({ a: [2], b: 1 }, core));
    expect(readingFingerprint({ halfOnMiss: true }, core).sha).not.toBe(FP.sha);
    expect(Object.keys(FP).sort()).toEqual(["core", "sha"]);
  });
});

describe("batch reread: what is cut", () => {
  const readings = new Map();
  const readingOf = (r) => (readings.has(r.key) ? readings.get(r.key) : READING);
  const rereadOf = (fp, over = {}) => ({ by: "rereader-1", at: AT, confidence: 0.8, reading: fp, covered: false,
    beyond: [shove], ...over });
  const records = () => {
    readings.clear();
    readings.set(keyOf(7), null);
    readings.set(keyOf(8), undefined);
    const triaged = monster(1).evidence.triaged;
    return [
      monster(1), monster(2, { identifier: "tst-ember-hound-feature-2",
        rule: { handledIn: "table", adds: "x", entry: { halfOnMiss: true }, origins: ["official"], assert: [] } }),
      monster(3), monster(4), monster(5, { text: null }), monster(6, { items: [] }), monster(7), monster(8),
      monster(9, { verdict: "core" }), { ...monster(10), kind: "feature", key: "tst:feature:feature-10" },
      monster(11), monster(12, { hint: "beyond-engine", evidence: { triaged: { ...triaged, reread: rereadOf(FP) } } }),
      monster(13, { hint: "beyond-engine", evidence: { triaged: { ...triaged,
        reread: rereadOf({ core: "9.9.8", sha: "e".repeat(64) }) } } }),
      monster(14, { legacy: true })
    ];
  };
  const options = (over = {}) => ({ core, readingOf, reviewQueued: new Set([keyOf(3)]), triageQueued: new Set([keyOf(4)]),
    ...over });

  it("cuts unruled monster entry records the engine reads something of, drafts-queued ones included", () => {
    const { batches, leftOut } = cutRereadBatches(records(), options({ size: 2, after: { tst: 3 } }));
    expect(batches.map((b) => b.id)).toEqual(["tst-reread-004", "tst-reread-005"]);
    expect(batches.every((b) => b.stage === "reread" && b.core === "9.9.9")).toBe(true);
    expect(batches.flatMap((b) => b.entries.map((e) => e.key))).toEqual([keyOf(1), keyOf(11), keyOf(13)]);
    expect(leftOut).toEqual({
      "already ruled": 1, "in review-queue.json": 1, "in queue.json": 1, "no text": 1, "no matched official item": 1,
      "engine reads nothing": 1, "official item not in the dumps": 1, "reread for the current reading": 1, legacy: 1
    });
    expect(rereadSkipReason(monster(1), options())).toBeNull();
  });

  it("an entry is a triage entry with the reading's fingerprint: no verdict, why, hint, handle or queue answer", () => {
    const { batches } = cutRereadBatches(records(), options());
    const [entry] = batches[0].entries;
    expect(Object.keys(entry).sort()).toEqual(["edition", "items", "key", "kind", "name", "owner", "page", "reading", "section",
      "textSha"]);
    expect(entry.reading).toEqual(FP);
    expect(entry.items[0]).not.toHaveProperty("data");
    const text = JSON.stringify(batches);
    for (const word of ["reader-xmm-1", "rereader-1", "a reader thought", "verdict", "why", "hint", "core-generic", "confidence",
      "beyond", "push"]) {
      expect(text).not.toContain(word);
    }
  });

  it("writes counts only in the report", () => {
    const { batches, leftOut } = cutRereadBatches(records(), options({ size: 2 }));
    const report = rereadReport("TST", batches, leftOut);
    expect(report).toEqual({ book: "TST", batches: 2, cut: 3, leftOut: expect.any(Object) });
    expect(JSON.stringify(report)).not.toContain("tst:");
  });

  it("--second: only the records a first reread set to core (provisional), for the reading the first judged", () => {
    const covered = (n, reread) => monster(n, { verdict: "core", why: REREAD_WHY, hint: undefined,
      evidence: { triaged: { by: "rule", at: AT, was: { verdict: "entry", why: "x", triaged: monster(1).evidence.triaged },
        reread } } });
    const first = { by: "rereader-1", at: AT, confidence: 0.9, reading: FP, covered: true, provisional: true };
    const done = { ...first, provisional: undefined, second: { by: "rereader-2", at: AT, confidence: 0.9, reading: FP,
      covered: true } };
    delete done.provisional;
    const list = [covered(1, first), covered(2, done), covered(3, { ...first, reading: { core: "9.9.8", sha: "e".repeat(64) } }),
      monster(4), monster(5, { verdict: "core" })];
    for (const r of list) delete r.hint;
    const { batches, leftOut } = cutRereadBatches(list, options({ second: true, reviewQueued: new Set(),
      triageQueued: new Set() }));
    expect(batches.map((b) => b.id)).toEqual(["tst-reread-second-001"]);
    expect(batches[0].second).toBe(true);
    expect(batches[0].entries.map((e) => e.key)).toEqual([keyOf(1)]);
    expect(leftOut).toEqual({ "second reread done": 1, "reading changed since the first reread": 1 });
    expect(JSON.stringify(batches)).not.toContain("rereader-1");
  });
});

describe("ingest --reread", () => {
  let textDir;
  beforeEach(() => {
    textDir = mkdtempSync(join(tmpdir(), "reread-text-"));
    writeFileSync(join(textDir, `${SHA}.txt`), TEXT);
  });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const keys = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13].map(keyOf);
  const offered = () => new Map(keys.map((k) => [k, FP]));
  const current = () => new Map(keys.map((k) => [k, { reading: READING, structure: STRUCTURE }]));
  const drafts = [{ key: keyOf(1), reason: "person", by: "drafter-1", why: "nothing to write", confidence: 0.8 },
    { key: keyOf(2), reason: "person", by: "drafter-1", why: "nothing to write", confidence: 0.8 }];
  const run = (records, results, over = {}) => ingestRereads(records, results, { textDir, by: "rereader-1", at: AT, core,
    offered: offered(), current: current(), draftsQueue: drafts, ...over });
  const covered = (n, over = {}) => ({ key: keyOf(n), covered: true, why: "the engine reads the fall; nothing else acts",
    confidence: 0.9, ...over });
  const beyond = (n, list, over = {}) => ({ key: keyOf(n), covered: false, beyond: list, why: "the shove is not read",
    confidence: 0.85, ...over });

  it("covered at 0.7 or more: core by rule, the fixed why, the reader, the reading and what it was; provisional", () => {
    const records = [monster(1), monster(2)];
    const out = run(records, [covered(1, { confidence: 0.7 })]);
    expect(out.rejected).toEqual([]);
    expect(out.covered).toEqual([keyOf(1)]);
    expect(out.dequeued).toEqual([keyOf(1)]);
    const r = out.records[0];
    expect(r.verdict).toBe("core");
    expect(r.why).toBe(REREAD_WHY);
    expect(r.why).toBe("DAS · Core reads this feature's text and a reader found nothing beyond it");
    expect(r).not.toHaveProperty("hint");
    expect(r.evidence.triaged).toEqual({ by: "rule", at: AT,
      was: { verdict: "entry", why: records[0].why, triaged: records[0].evidence.triaged },
      reread: { by: "rereader-1", at: AT, confidence: 0.7, reading: FP, covered: true, provisional: true } });
    expect(validateRecord(r)).toEqual([]);
    expect(setByRule(r)).toBe(false);
    expect(out.records[1]).toEqual(records[1]);
    expect(records[0].verdict).toBe("entry");
  });

  it("beyond with an assertion the reading does not imply: entry stays, hint beyond-engine, the assertions as data", () => {
    const out = run([monster(2)], [beyond(2, [shove, noReactions])]);
    expect(out.rejected).toEqual([]);
    expect(out.beyond).toEqual([keyOf(2)]);
    expect(out.dequeued).toEqual([]);
    const r = out.records[0];
    expect(r.verdict).toBe("entry");
    expect(r.why).toBe(monster(2).why);
    expect(r.hint).toBe("beyond-engine");
    expect(r.evidence.triaged).toEqual({ ...monster(2).evidence.triaged,
      reread: { by: "rereader-1", at: AT, confidence: 0.85, reading: FP, covered: false, beyond: [shove, noReactions] } });
    expect(validateRecord(r)).toEqual([]);
  });

  it("rejects a beyond the engine's reading already implies, and one the item's own data already does", () => {
    const out = run([monster(1), monster(2), monster(3)], [beyond(1, [shove, fall]), beyond(2, [scared]),
      beyond(3, [{ given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } }])]);
    expect(out.beyond).toEqual([]);
    expect(out.rejected.map((x) => x.key)).toEqual([keyOf(1), keyOf(2), keyOf(3)]);
    expect(out.rejected[0].reason).toMatch(/beyond\[1\].*engine's reading already/);
    expect(out.rejected[1].reason).toMatch(/item's own data already/);
    expect(out.rejected[2].reason).toMatch(/item's own data already/);
    expect(out.records.map((r) => r.verdict)).toEqual(["entry", "entry", "entry"]);
  });

  it("below 0.7: nothing changes on the record, listed unsure", () => {
    const records = [monster(1), monster(2)];
    const out = run(records, [covered(1, { confidence: 0.6 }), beyond(2, [shove], { confidence: 0.5 })]);
    expect(out.unsure).toEqual([keyOf(1), keyOf(2)]);
    expect(out.covered).toEqual([]);
    expect(out.dequeued).toEqual([]);
    expect(out.records).toEqual(records);
  });

  it("rejects what is outside the shape, one result at a time, and applies the others", () => {
    const quote = "is knocked flat, is scared of the hound, and its shield";
    const records = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13].map((n) => monster(n));
    records.push(monster(7, { verdict: "core" }), monster(8, { identifier: "tst-x",
      rule: { handledIn: "table", adds: "x", entry: { halfOnMiss: true }, origins: ["official"], assert: [] } }));
    const extra = new Map([...offered(), [keyOf(7), FP], [keyOf(8), FP]]);
    const out = run(records, [
      covered(1, { verdict: "core" }), covered(2, { covered: "yes" }), covered(3, { beyond: [shove] }),
      beyond(4, []), beyond(5, [{ ...shove, expect: { ...shove.expect, free: "a shove" } }]), covered(6, { why: quote }),
      covered(7), covered(8), { key: "tst:monster:nobody/action/x", covered: true, why: "x", confidence: 1 },
      beyond(9, [{ given: { roll: "hit" }, expect: { excludes: "target" } }]), covered(10, { why: "two\nlines" }),
      covered(11, { confidence: 2 }), covered(13)
    ], { offered: extra });
    expect(out.covered).toEqual([keyOf(13)]);
    const reasons = out.rejected.map((x) => x.reason);
    expect(reasons[0]).toMatch(/unknown field "verdict"/);
    expect(reasons[1]).toMatch(/covered must be true or false/);
    expect(reasons[2]).toMatch(/covered: true carries no beyond/);
    expect(reasons[3]).toMatch(/beyond: at least one assertion/);
    expect(reasons[4]).toMatch(/free/);
    expect(reasons[5]).toMatch(/quotation/);
    expect(reasons[6]).toMatch(/verdict is core, not entry/);
    expect(reasons[7]).toMatch(/has a rule/);
    expect(reasons[8]).toMatch(/unknown key/);
    expect(reasons[9]).toMatch(/excludes/);
    expect(reasons[10]).toMatch(/single line/);
    expect(reasons[11]).toMatch(/confidence/);
    expect(out.rejected).toHaveLength(12);
  });

  it("is bound to its batch and to the reading the batch was cut against; a queued record is not reread", () => {
    const records = [monster(1), monster(2), monster(3), monster(4), monster(5)];
    const out = run(records, [covered(1), covered(2), covered(3), covered(4), covered(5), covered(5)], {
      offered: new Map([[keyOf(2), FP], [keyOf(3), { core: "9.9.8", sha: "e".repeat(64) }], [keyOf(4), FP], [keyOf(5), FP]]),
      current: new Map([[keyOf(2), { reading: null, structure: STRUCTURE }], [keyOf(3), { reading: READING, structure: STRUCTURE }],
        [keyOf(4), { reading: READING, structure: STRUCTURE }], [keyOf(5), { reading: READING, structure: STRUCTURE }]]),
      reviewQueued: new Set([keyOf(4)])
    });
    const reasons = Object.fromEntries(out.rejected.map((x) => [x.key, x.reason]));
    expect(reasons[keyOf(1)]).toMatch(/not offered by this batch/);
    expect(reasons[keyOf(2)]).toMatch(/engine reads nothing/);
    expect(reasons[keyOf(3)]).toMatch(/stale/);
    expect(reasons[keyOf(4)]).toMatch(/review-queue/);
    expect(out.rejected.at(-1).reason).toMatch(/twice/);
    expect(out.covered).toEqual([keyOf(5)]);
  });

  it("refuses a record already reread for the reading it is judged against", () => {
    const once = run([monster(2)], [beyond(2, [shove])]).records;
    const out = run(once, [covered(2)], { by: "rereader-9" });
    expect(out.rejected[0].reason).toMatch(/already reread for this reading/);
  });

  it("needs core, offered and current", () => {
    expect(() => ingestRereads([], [], { textDir, by: "rereader-1", core, current: new Map() })).toThrow(/offered/);
    expect(() => ingestRereads([], [], { textDir, by: "rule", core, offered: new Map(), current: new Map() })).toThrow(/by/);
  });
});

describe("ingest --reread --second: the safety net for core", () => {
  let textDir;
  beforeEach(() => {
    textDir = mkdtempSync(join(tmpdir(), "reread-text-"));
    writeFileSync(join(textDir, `${SHA}.txt`), TEXT);
  });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const base = (records, results, over = {}) => ingestRereads(records, results, { textDir, at: AT, core,
    offered: new Map(records.map((r) => [r.key, FP])),
    current: new Map(records.map((r) => [r.key, { reading: READING, structure: STRUCTURE }])), ...over });
  const firstCore = () => base([monster(1)], [{ key: keyOf(1), covered: true, why: "the engine reads all of it",
    confidence: 0.9 }], { by: "rereader-1" }).records;

  it("agreement: both readers in the evidence, no longer provisional", () => {
    const out = base(firstCore(), [{ key: keyOf(1), covered: true, why: "nothing beyond the fall", confidence: 0.8 }],
      { by: "rereader-2", second: true });
    expect(out.rejected).toEqual([]);
    expect(out.agreed).toEqual([keyOf(1)]);
    const r = out.records[0];
    expect(r.verdict).toBe("core");
    expect(r.evidence.triaged.reread).toEqual({ by: "rereader-1", at: AT, confidence: 0.9, reading: FP, covered: true,
      second: { by: "rereader-2", at: AT, confidence: 0.8, reading: FP, covered: true } });
    expect(validateRecord(r)).toEqual([]);
  });

  it("disagreement: back to entry from was, hint beyond-engine, both readings kept; the drafts queue is not restored", () => {
    const out = base(firstCore(), [{ key: keyOf(1), covered: false, beyond: [shove], why: "the shove is not read",
      confidence: 0.8 }], { by: "rereader-2", second: true });
    expect(out.disagreed).toEqual([keyOf(1)]);
    expect(out).not.toHaveProperty("dequeued");
    const r = out.records[0];
    expect(r.verdict).toBe("entry");
    expect(r.why).toBe(monster(1).why);
    expect(r.hint).toBe("beyond-engine");
    expect(r.evidence.triaged).toEqual({ ...monster(1).evidence.triaged, reread: { by: "rereader-1", at: AT, confidence: 0.9,
      reading: FP, covered: true, second: { by: "rereader-2", at: AT, confidence: 0.8, reading: FP, covered: false,
        beyond: [shove] } } });
    expect(validateRecord(r)).toEqual([]);
  });

  it("unsure: nothing changes; rejects the first reader's handle, a record a first reread did not set to core", () => {
    const records = [...firstCore(), monster(2)];
    const unsure = base(records, [{ key: keyOf(1), covered: false, beyond: [shove], why: "maybe", confidence: 0.5 }],
      { by: "rereader-2", second: true });
    expect(unsure.unsure).toEqual([keyOf(1)]);
    expect(unsure.records).toEqual(records);
    const out = base(records, [{ key: keyOf(1), covered: true, why: "same", confidence: 0.9 },
      { key: keyOf(2), covered: true, why: "same", confidence: 0.9 }], { by: "REREADER-1", second: true });
    expect(out.rejected[0].reason).toMatch(/another reader than the first/);
    expect(out.rejected[1].reason).toMatch(/not a provisional core of a first reread/);
  });
});

describe("evidence.triaged.reread: a closed shape the schema holds (gates --ci included)", () => {
  const coreRecord = (reread, over = {}) => monster(1, { verdict: "core", why: REREAD_WHY, hint: undefined,
    evidence: { triaged: { by: "rule", at: AT, was: { verdict: "entry", why: "x" }, reread } }, ...over });
  const first = { by: "rereader-1", at: AT, confidence: 0.9, reading: FP, covered: true, provisional: true };
  const clean = (r) => { delete r.hint; return r; };

  it("accepts the shapes the ingest writes and refuses another", () => {
    expect(validateRecord(clean(coreRecord(first)))).toEqual([]);
    const bad = [
      { ...first, note: "a sentence" }, { ...first, by: "rule" }, { ...first, confidence: 3 },
      { ...first, reading: { core: "9.9.9" } }, { ...first, reading: { ...FP, sha: "short" } }, { ...first, covered: "yes" },
      { ...first, provisional: false }, { ...first, beyond: [shove] }
    ];
    for (const reread of bad) expect(validateRecord(clean(coreRecord(reread))).join(" ")).toMatch(/evidence\.triaged\.reread/);
  });

  it("ties the outcome to the verdict: a covered reread is a core by rule with the fixed why, provisional until a second", () => {
    expect(validateRecord(clean(coreRecord(first, { why: "something else" }))).join(" ")).toMatch(/reread/);
    const { provisional, ...agreed } = first;
    expect(validateRecord(clean(coreRecord(agreed))).join(" ")).toMatch(/provisional/);
    const second = { by: "rereader-2", at: AT, confidence: 0.8, reading: FP, covered: true };
    expect(validateRecord(clean(coreRecord({ ...agreed, second })))).toEqual([]);
    expect(validateRecord(clean(coreRecord({ ...first, second }))).join(" ")).toMatch(/provisional/);
    const beyond = { by: "rereader-1", at: AT, confidence: 0.9, reading: FP, covered: false, beyond: [shove] };
    expect(validateRecord(monster(1, { evidence: { triaged: { reread: beyond } } }))).toEqual([]);
    expect(validateRecord(clean(coreRecord(beyond))).join(" ")).toMatch(/reread/);
    expect(validateRecord(monster(1, { evidence: { triaged: { reread: { ...beyond, beyond: [] } } } })).join(" "))
      .toMatch(/beyond/);
    expect(validateRecord(monster(1, { evidence: { triaged: { reread: { ...beyond,
      beyond: [{ ...shove, expect: { ...shove.expect, free: "words" } }] } } } })).join(" ")).toMatch(/free/);
    expect(validateRecord(monster(1, { evidence: { triaged: { reread: first } } })).join(" ")).toMatch(/reread/);
  });
});

describe("the other stages leave a reread alone", () => {
  it("adds the hint beyond-engine, which --engine-reading keeps, and --redo-rule does not take a reread core for its own", () => {
    expect(HINTS).toContain("beyond-engine");
    const r = monster(1, { hint: "beyond-engine" });
    const out = engineReadingPrepass([r], { readingOf: () => READING });
    expect(out.records[0].hint).toBe("beyond-engine");
    const prepass = { ...monster(1, { verdict: "core", why: "x" }), evidence: { triaged: { by: "rule", at: AT } } };
    expect(setByRule(prepass)).toBe(true);
  });
});

describe("batch draft after a reread: only what a reread confirmed goes beyond the engine", () => {
  const embedded = new Map();
  const reread = { by: "rereader-1", at: AT, confidence: 0.9, reading: FP, covered: false, beyond: [shove] };

  it("leaves out a monster entry the engine reads something of and no reread found beyond it", () => {
    const readingOf = (r) => (r.key === keyOf(3) ? null : READING);
    expect(ENGINE_READS_FIRST).toBe("engine reads it: reread first");
    expect(draftSkipReason(monster(1), { embedded, readingOf })).toBe(ENGINE_READS_FIRST);
    expect(draftSkipReason(monster(2, { hint: "beyond-engine", evidence: { triaged: { reread } } }),
      { embedded, readingOf })).toBeNull();
    expect(draftSkipReason(monster(3), { embedded, readingOf })).toBeNull();
  });

  it("gives the drafter the reread's beyond assertions as data", () => {
    const records = [monster(2, { hint: "beyond-engine", evidence: { triaged: { ...monster(2).evidence.triaged, reread } } })];
    const [batch] = cutDraftBatches(records, { embedded, readingOf: () => READING, core: { shipped: {} }, textOf: () => TEXT });
    expect(batch.entries[0].beyondEngine).toEqual([shove]);
    const second = { ...reread, covered: true, beyond: undefined,
      second: { by: "rereader-2", at: AT, confidence: 0.8, reading: FP, covered: false, beyond: [noReactions] } };
    delete second.beyond;
    const [again] = cutDraftBatches([monster(2, { hint: "beyond-engine", evidence: { triaged: { reread: second } } })],
      { embedded, readingOf: () => READING, core: { shipped: {} }, textOf: () => TEXT });
    expect(again.entries[0].beyondEngine).toEqual([noReactions]);
  });
});

describe("gates: a reread judged against another reading is a local note", () => {
  const stub = { version: "9.9.9", facts: [], vocabulary: new Set(), validateEntry: () => [], getPath: () => undefined,
    matchesFrom: () => true };
  const reread = { by: "rereader-1", at: AT, confidence: 0.9, reading: FP, covered: false, beyond: [shove] };
  const record = monster(1, { hint: "beyond-engine", evidence: { triaged: { reread } } });

  it("says nothing while the reading is the one judged, notes a different one, and changes no evidence", () => {
    expect(rereadStaleNote(record, FP)).toBeNull();
    expect(rereadStaleNote(record, { core: "9.9.10", sha: "e".repeat(64) })).toMatch(/reread.*9\.9\.10/);
    expect(rereadStaleNote(record, null)).toMatch(/reads nothing/);
    const dir = mkdtempSync(join(tmpdir(), "reread-gates-"));
    try {
      writeFileSync(join(dir, `${SHA}.txt`), TEXT);
      const context = (rereadReadingOf, ci = false) => ({ core: stub, documents: {}, textDir: dir, ci, legacy: new Map(),
        rereadReadingOf });
      const out = runGates([record], context(() => ({ core: "9.9.10", sha: "e".repeat(64) })));
      expect(out.notes[record.key].reread[0]).toMatch(/stale/);
      expect(out.updated[0]).toEqual(record);
      expect(runGates([record], context(() => FP)).notes[record.key]?.reread).toBeUndefined();
      expect(runGates([record], context(() => ({ core: "9.9.10", sha: "e".repeat(64) }), true)).notes[record.key]?.reread)
        .toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

// On the command line, with the real engine: an invented creature in an actor dump of the 2024 Monster Manual's package
// (docs/foundry-modules.json maps XMM to it), in a registry, a dumps folder and a text cache of the test's own.
const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/monster-layer.mjs"))
  ? process.env.DAS_CORE : null;
const PUSH = "<p>Strength Saving Throw: DC 12, one creature within 5 feet. Failure: 7 Bludgeoning damage. If the target is"
  + " Medium or smaller, it is pushed 10 feet straight away from the gust and has the Prone condition.</p>";
const NOTHING = "<p>The creature hums a tune nobody remembers.</p>";

describe("batch reread and ingest --reread on the command line", () => {
  let tmp;
  let env;
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "reread-cli-"));
    env = { PATH: process.env.PATH, RULEPACK_REGISTRY: join(tmp, "registry") };
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("says what batch reread needs, and refuses --reread with another mode", () => {
    saveBook(join(tmp, "registry"), { book: "XMM", records: [] });
    const r = cli(["batch", "reread", "XMM", "--out", join(tmp, "out"), "--structure", join(tmp, "private")]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/batch reread needs DAS_CORE and RULEPACK_DUMPS/);
    expect(cli(["batch", "reread", "XMM", "--out", join(tmp, "out")]).status).toBe(2);
    expect(cli(["ingest", "x.json", "--reread", "--draft", "--batch", "y.json"]).status).toBe(2);
    expect(cli(["ingest", "x.json", "--reread"]).status).toBe(2);
  });

  describe.skipIf(!CORE_DIR)("with the real engine", () => {
    const ACTOR = "tstGlimmerDrake0";
    const saveActivity = (effects) => ({ [SAVE]: { _id: SAVE, type: "save", name: "", activation: { type: "action",
      condition: "" }, effects: effects.map((_id) => ({ _id })), damage: { onSave: "half", parts: [] },
      range: { value: "5", units: "ft", special: "" }, target: { template: { type: "", size: "" },
        affects: { type: "creature", count: "1", special: "" } } } });
    const doc = (id, name, html, effects = []) => ({ _id: id, name, type: "feat", flags: {},
      system: { identifier: name.toLowerCase().replace(/ /g, "-"), description: { value: html },
        activities: saveActivity(effects) },
      effects: effects.map((_id) => ({ _id, name: "Prone", statuses: ["prone"], system: { changes: [] }, transfer: false })) });
    const docs = [doc("mmGustSlam000000", "Gust Slam", PUSH, [FX]), doc("mmQuietHum000000", "Quiet Hum", NOTHING)];
    const record = (d) => ({
      key: `xmm:monster:glimmer-drake/action/${d.system.identifier}`, name: d.name, kind: "monster", book: "XMM", page: 3,
      edition: "2024", owner: "Glimmer Drake", section: "action", text: { sha256: SHA, source: "5etools", chars: 10 },
      verdict: "entry", why: "a reader asked for a rule",
      items: [{ origin: "official", match: "matched", identifier: d.system.identifier, docId: `${ACTOR}.${d._id}`,
        activities: [SAVE], effects: d.effects.map((e) => e._id), data: { sha256: dataFingerprint(d) } }],
      evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.8 } }
    });
    const gust = "xmm:monster:glimmer-drake/action/gust-slam";
    beforeEach(() => {
      mkdirSync(join(tmp, "dumps"));
      mkdirSync(join(tmp, "text"));
      writeFileSync(join(tmp, "text", `${SHA}.txt`), TEXT);
      writeFileSync(join(tmp, "dumps", "dnd-monster-manual.actors.json"), JSON.stringify([
        { _id: ACTOR, name: "Glimmer Drake", type: "npc", system: {}, items: docs }]));
      env = { ...env, RULEPACK_DUMPS: join(tmp, "dumps"), RULEPACK_TEXT: join(tmp, "text"), DAS_CORE: CORE_DIR };
      saveBook(join(tmp, "registry"), { book: "XMM", records: docs.map(record) });
      writeFileSync(join(tmp, "registry", "drafts-queue.json"), `${JSON.stringify([{ key: gust, reason: "person",
        by: "drafter-1", why: "nothing to write", confidence: 0.8 }])}\n`);
    });
    const registry = () => JSON.parse(readFileSync(join(tmp, "registry", "xmm.json"), "utf8")).records;
    const results = (name, body) => {
      const file = join(tmp, "out", `${name}.results.json`);
      writeFileSync(file, JSON.stringify(body));
      return file;
    };

    it("cuts, ingests a covered reading, then a disagreeing second one: core, then back to entry", () => {
      const out = join(tmp, "out");
      const priv = join(tmp, "private");
      const cut = cli(["batch", "reread", "XMM", "--out", out, "--structure", priv]);
      expect(cut.status, cut.stderr).toBe(0);
      expect(readdirSync(out).sort()).toEqual(["reread-vocabulary.json", "xmm-reread-001.json", "xmm-reread-report.json"]);
      const batch = JSON.parse(readFileSync(join(out, "xmm-reread-001.json"), "utf8"));
      expect(batch.entries.map((e) => e.key)).toEqual([gust]);
      expect(JSON.parse(readFileSync(join(out, "xmm-reread-report.json"), "utf8")))
        .toEqual({ book: "XMM", batches: 1, cut: 1, leftOut: { "engine reads nothing": 1 } });
      const structure = JSON.parse(readFileSync(join(priv, "xmm-reread-001.structure.json"), "utf8"));
      expect(structure.entries[gust].official.engineReads.triggers.length).toBeGreaterThan(0);
      const batchFile = join(out, "xmm-reread-001.json");
      const owner = cli(["ingest", results("o", { batch: batch.id, by: "owner", results: [] }), "--reread", "--batch",
        batchFile]);
      expect(owner.status).toBe(2);
      const extra = cli(["ingest", results("e", { batch: batch.id, by: "rereader-1", results: [], note: "x" }), "--reread",
        "--batch", batchFile]);
      expect(extra.status).toBe(2);
      const first = cli(["ingest", results(batch.id, { batch: batch.id, by: "rereader-1", results: [
        { key: gust, covered: true, why: "the engine reads the shove and the fall", confidence: 0.9 }] }),
      "--reread", "--batch", batchFile]);
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject({ covered: 1, beyond: 0, unsure: [], rejected: [] });
      expect(registry()[0]).toMatchObject({ verdict: "core", why: REREAD_WHY });
      expect(registry()[0].evidence.triaged.reread.provisional).toBe(true);
      expect(JSON.parse(readFileSync(join(tmp, "registry", "drafts-queue.json"), "utf8"))).toEqual([]);
      expect(cli(["batch", "reread", "XMM", "--out", out, "--structure", priv]).stdout).toMatch(/0 batches/);
      const again = cli(["batch", "reread", "XMM", "--out", out, "--structure", priv, "--second"]);
      expect(again.status, again.stderr).toBe(0);
      const secondFile = join(out, "xmm-reread-second-001.json");
      const second = cli(["ingest", results("xmm-reread-second-001", { batch: "xmm-reread-second-001", by: "rereader-2",
        results: [{ key: gust, covered: false, beyond: [noReactions], why: "it also takes away reactions", confidence: 0.8 }] }),
      "--reread", "--second", "--batch", secondFile]);
      expect(second.status, second.stderr).toBe(0);
      expect(JSON.parse(second.stdout)).toMatchObject({ agreed: 0, disagreed: 1, unsure: [], rejected: [] });
      const [back] = registry();
      expect(back).toMatchObject({ verdict: "entry", why: "a reader asked for a rule", hint: "beyond-engine" });
      expect(back.evidence.triaged.reread.second.beyond).toEqual([noReactions]);
      expect(JSON.parse(readFileSync(join(tmp, "registry", "drafts-queue.json"), "utf8"))).toEqual([]);
      const wrong = cli(["ingest", results("w", { batch: "xmm-reread-second-001", by: "rereader-3", results: [] }), "--reread",
        "--batch", batchFile]);
      expect(wrong.status).toBe(2);
    });
  });
});
