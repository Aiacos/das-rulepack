// Restating rereads (Ruling R31): when the vocabulary grows (trigger conditions, Ruling R30), a first reread that found only
// something the vocabulary could not state then (`unexpressed`: target-size, target-state, trigger-filter) may now be stated,
// and is read ONCE more with `--restate`; the reread a restate stores is marked `restated: true` and never cut again by it.
// Synthetic fixtures only: invented creatures and features, described in this test's own words.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REREAD_WHY, RESTATABLE, cutRereadBatches, ingestRereads, readingFingerprint, restatable, rereadSkipReason
} from "../../tools/pipeline/reread.mjs";
import { saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";
import { dataFingerprint } from "../../tools/pipeline/dumps.mjs";

const AT = "2026-11-22T00:00:00.000Z";
const LATER = "2026-11-23T00:00:00.000Z";
const SAVE = "Rs00Rs11Rs22Rs33";
const SHA = "d".repeat(64);
// This test's own words: a frost moth's wings chill a small creature still and leave its torch guttering for a while.
const TEXT = "The frost moth beats its wings. A small creature that fails its save is chilled still, and its torch"
  + " gutters until the moth flies off into the night.";
const core = {
  version: "9.9.9", moments: ["turnStart", "turnEnd"], statuses: ["prone", "restrained"], creatureTypes: ["beast"],
  moveModes: ["push"], effectEnds: ["bearerTurnEnd"], damageTypes: ["cold"]
};
const READING = { triggers: [{ on: "failedSave", do: [{ type: "status", status: "prone" }] }] };
const STRUCTURE = { activities: [{ id: SAVE, label: "Wings", type: "save", onSave: "none", effects: [], damage: [] }],
  effects: [] };
const FP = readingFingerprint(READING, core);
const OLD = { core: "9.9.8", sha: "e".repeat(64) };
const shove = { given: { roll: "failedSave" }, expect: { move: { mode: "push", distance: 10 } } };

const keyOf = (n) => `tst:monster:frost-moth/action/feature-${n}`;
const base = (n, over = {}) => ({
  key: keyOf(n), name: `Feature ${n}`, kind: "monster", book: "TST", page: 9, edition: "2024", owner: "Frost Moth",
  section: "action", text: { sha256: SHA, source: "dataset", chars: TEXT.length }, verdict: "entry",
  why: "a reader thought this one needs a rule",
  items: [{ origin: "official", match: "matched", identifier: `feature-${n}`,
    docId: `tstFrostMoth0000.ftFeature${String(n).padStart(7, "0")}`, activities: [SAVE], effects: [],
    data: { sha256: "b".repeat(64) } }],
  evidence: { triaged: { by: "reader-tst-1", at: AT, confidence: 0.8 } },
  ...over
});
const reread = (over = {}) => ({ by: "rereader-1", at: AT, confidence: 0.8, reading: FP, covered: false,
  unexpressed: ["target-size"], ...over });
const withReread = (n, r, over = {}) => base(n, { hint: "beyond-engine",
  evidence: { triaged: { ...base(n).evidence.triaged, reread: r } }, ...over });

describe("restatable: a first beyond reread naming a reason the vocabulary now states, not yet restated", () => {
  it("names the three reasons trigger conditions now state", () => {
    expect(RESTATABLE).toEqual(["target-size", "target-state", "trigger-filter"]);
    expect(Object.isFrozen(RESTATABLE)).toBe(true);
  });

  it("holds for a covered: false first reread with one of them, alone or beside others", () => {
    for (const reason of RESTATABLE) expect(restatable(withReread(1, reread({ unexpressed: [reason] })))).toBe(true);
    expect(restatable(withReread(1, reread({ unexpressed: ["use-limit", "trigger-filter"], beyond: [shove] })))).toBe(true);
  });

  it("not for another reason, a beyond alone, a covered reread, a restated one, a second, or no reread", () => {
    expect(restatable(withReread(1, reread({ unexpressed: ["use-limit"] })))).toBe(false);
    const { unexpressed, ...onlyBeyond } = reread({ beyond: [shove] });
    expect(restatable(withReread(1, onlyBeyond))).toBe(false);
    expect(restatable(withReread(1, { by: "rereader-1", at: AT, confidence: 0.9, reading: FP, covered: true,
      provisional: true }))).toBe(false);
    expect(restatable(withReread(1, reread({ restated: true })))).toBe(false);
    expect(restatable(base(1))).toBe(false);
    expect(restatable(null)).toBe(false);
  });
});

describe("batch reread --restate: only restatable records, the same reading notwithstanding", () => {
  const readingOf = () => READING;
  const records = () => [
    base(1),
    withReread(2, reread()),
    withReread(3, reread({ unexpressed: ["use-limit"] })),
    withReread(4, reread({ restated: true })),
    withReread(5, reread({ reading: OLD, unexpressed: ["target-state"] })),
    withReread(6, reread(), { legacy: true }),
    withReread(7, reread({ unexpressed: ["trigger-filter"] })),
    withReread(8, reread(), { text: null })
  ];
  const options = (over = {}) => ({ core, readingOf, reviewQueued: new Set(), triageQueued: new Set([keyOf(7)]), ...over });

  it("cuts the restatable ones, in the normal reread series; the other checks still hold", () => {
    const { batches, leftOut } = cutRereadBatches(records(), options({ restate: true, after: { tst: 2 } }));
    expect(batches.map((b) => b.id)).toEqual(["tst-reread-003"]);
    expect(batches[0].restate).toBe(true);
    expect(batches[0]).not.toHaveProperty("second");
    expect(batches[0].entries.map((e) => e.key)).toEqual([keyOf(2), keyOf(5)]);
    expect(batches[0].entries[0].reading).toEqual(FP);
    expect(leftOut).toEqual({ "not restatable": 3, legacy: 1, "in queue.json": 1, "no text": 1 });
    expect(rereadSkipReason(withReread(2, reread()), options({ restate: true }))).toBeNull();
  });

  it("without the flag nothing changes: a reread for the current reading is not cut again", () => {
    const { batches, leftOut } = cutRereadBatches(records(), options());
    expect(batches.flatMap((b) => b.entries.map((e) => e.key))).toEqual([keyOf(1), keyOf(5)]);
    expect(batches[0]).not.toHaveProperty("restate");
    expect(leftOut).toEqual({ "reread for the current reading": 3, legacy: 1, "in queue.json": 1, "no text": 1 });
  });

  it("refuses restate with second", () => {
    expect(() => cutRereadBatches(records(), options({ restate: true, second: true }))).toThrow(/restate.*second/);
    expect(() => rereadSkipReason(base(1), options({ restate: true, second: true }))).toThrow(/restate.*second/);
  });
});

describe("ingest --reread --restate", () => {
  let textDir;
  beforeEach(() => {
    textDir = mkdtempSync(join(tmpdir(), "restate-text-"));
    writeFileSync(join(textDir, `${SHA}.txt`), TEXT);
  });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const keys = [1, 2, 3, 4, 5, 6].map(keyOf);
  const run = (records, results, over = {}) => ingestRereads(records, results, { textDir, by: "rereader-2", at: LATER, core,
    offered: new Map(keys.map((k) => [k, FP])), current: new Map(keys.map((k) => [k, { reading: READING,
      structure: STRUCTURE }])), draftsQueue: [{ key: keyOf(2), reason: "person", by: "drafter-1", why: "no",
      confidence: 0.8 }], ...over });
  const beyond = (n, over = {}) => ({ key: keyOf(n), covered: false, beyond: [shove], why: "the moth is chilled still",
    confidence: 0.85, ...over });

  it("overwrites the reread of a restatable record and marks it restated, whatever it answers", () => {
    const records = [withReread(2, reread()), withReread(3, reread({ unexpressed: ["target-state"] }))];
    const out = run(records, [beyond(2), { key: keyOf(3), covered: false, unexpressed: ["target-size"],
      why: "its torch gutters", confidence: 0.8 }], { restate: true });
    expect(out.rejected).toEqual([]);
    expect(out.beyond).toEqual([keyOf(2), keyOf(3)]);
    const [r, again] = out.records;
    expect(r.evidence.triaged).toEqual({ ...base(2).evidence.triaged, reread: { by: "rereader-2", at: LATER,
      confidence: 0.85, reading: FP, covered: false, beyond: [shove], restated: true } });
    expect(r.hint).toBe("beyond-engine");
    expect(again.evidence.triaged.reread).toMatchObject({ unexpressed: ["target-size"], restated: true });
    for (const x of out.records) expect(validateRecord(x)).toEqual([]);
    expect(restatable(again)).toBe(false);
    const cut = cutRereadBatches(out.records, { core, readingOf: () => READING, restate: true });
    expect(cut.batches).toEqual([]);
    expect(cut.leftOut).toEqual({ "not restatable": 2 });
  });

  it("a covered answer follows the covered path: provisional core, restated", () => {
    const out = run([withReread(2, reread())], [{ key: keyOf(2), covered: true, why: "the moth is chilled still",
      confidence: 0.9 }], { restate: true });
    expect(out.rejected).toEqual([]);
    expect(out.covered).toEqual([keyOf(2)]);
    expect(out.dequeued).toEqual([keyOf(2)]);
    const [r] = out.records;
    expect(r).toMatchObject({ verdict: "core", why: REREAD_WHY });
    expect(r).not.toHaveProperty("hint");
    expect(r.evidence.triaged.reread).toEqual({ by: "rereader-2", at: LATER, confidence: 0.9, reading: FP, covered: true,
      provisional: true, restated: true });
    expect(r.evidence.triaged.was.triaged).toEqual(base(2).evidence.triaged);
    expect(validateRecord(r)).toEqual([]);
  });

  it("an unsure answer leaves the record as it was", () => {
    const records = [withReread(2, reread())];
    const out = run(records, [beyond(2, { confidence: 0.5 })], { restate: true });
    expect(out.unsure).toEqual([keyOf(2)]);
    expect(out.records).toEqual(records);
  });

  it("rejects a record that is not restatable, and keeps the other checks (stale, queues)", () => {
    const records = [base(1), withReread(3, reread({ unexpressed: ["use-limit"] })), withReread(4, reread({ restated: true })),
      withReread(5, reread()), withReread(6, reread())];
    const out = run(records, [beyond(1), beyond(3), beyond(4), beyond(5), beyond(6)], { restate: true,
      offered: new Map([...keys.map((k) => [k, FP]), [keyOf(5), OLD]]), reviewQueued: new Set([keyOf(6)]) });
    expect(out.beyond).toEqual([]);
    const reasons = Object.fromEntries(out.rejected.map((x) => [x.key, x.reason]));
    expect(reasons[keyOf(1)]).toMatch(/not restatable/);
    expect(reasons[keyOf(3)]).toMatch(/not restatable/);
    expect(reasons[keyOf(4)]).toMatch(/not restatable/);
    expect(reasons[keyOf(5)]).toMatch(/stale/);
    expect(reasons[keyOf(6)]).toMatch(/review-queue/);
  });

  it("without the flag nothing changes: the same reading is refused, and no reread is marked", () => {
    const out = run([withReread(2, reread()), base(1)], [beyond(2), beyond(1)]);
    expect(out.rejected.map((x) => x.key)).toEqual([keyOf(2)]);
    expect(out.rejected[0].reason).toMatch(/already reread for this reading/);
    expect(out.records[1].evidence.triaged.reread).not.toHaveProperty("restated");
  });

  it("refuses restate with second", () => {
    expect(() => run([], [], { restate: true, second: true })).toThrow(/restate.*second/);
  });
});

describe("evidence.triaged.reread.restated: on a first reread only, true when present", () => {
  const asEntry = (r) => validateRecord(withReread(1, r)).join(" ");
  it("accepts true and refuses anything else, and on a second", () => {
    expect(asEntry(reread({ restated: true }))).toBe("");
    expect(asEntry(reread({ restated: false }))).toMatch(/restated/);
    expect(asEntry(reread({ restated: "yes" }))).toMatch(/restated/);
    const covered = { by: "rereader-1", at: AT, confidence: 0.9, reading: FP, covered: true };
    const second = { by: "rereader-2", at: AT, confidence: 0.6, reading: FP, outcome: "second-unsure", restated: true };
    expect(asEntry({ ...covered, second })).toMatch(/second\.restated/);
  });
});

const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/monster-layer.mjs"))
  ? process.env.DAS_CORE : null;
const PUSH = "<p>Strength Saving Throw: DC 12, one creature within 5 feet. Failure: 7 Bludgeoning damage. If the target is"
  + " Medium or smaller, it is pushed 10 feet straight away from the gust and has the Prone condition.</p>";

describe("batch reread --restate and ingest --reread --restate on the command line", () => {
  let tmp;
  let env;
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "restate-cli-"));
    env = { PATH: process.env.PATH, RULEPACK_REGISTRY: join(tmp, "registry") };
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("refuses --restate with --second, at the cut and at the ingest", () => {
    saveBook(join(tmp, "registry"), { book: "XMM", records: [] });
    const cut = cli(["batch", "reread", "XMM", "--out", join(tmp, "out"), "--structure", join(tmp, "p"), "--restate",
      "--second"]);
    expect(cut.status).toBe(2);
    expect(cut.stderr).toMatch(/--restate.*--second/);
    const ingest = cli(["ingest", "x.json", "--reread", "--restate", "--second", "--batch", "y.json"]);
    expect(ingest.status).toBe(2);
    expect(ingest.stderr).toMatch(/--restate.*--second/);
  });

  describe.skipIf(!CORE_DIR)("with the real engine", () => {
    const ACTOR = "tstGlimmerDrake0";
    const DOC = "mmGustSlam000000";
    const gust = "xmm:monster:glimmer-drake/action/gust-slam";
    const doc = { _id: DOC, name: "Gust Slam", type: "feat", flags: {},
      system: { identifier: "gust-slam", description: { value: PUSH }, activities: { [SAVE]: { _id: SAVE, type: "save",
        name: "", activation: { type: "action", condition: "" }, effects: [], damage: { onSave: "half", parts: [] },
        range: { value: "5", units: "ft", special: "" }, target: { template: { type: "", size: "" },
          affects: { type: "creature", count: "1", special: "" } } } } },
      effects: [] };
    const record = { key: gust, name: "Gust Slam", kind: "monster", book: "XMM", page: 3, edition: "2024",
      owner: "Glimmer Drake", section: "action", text: { sha256: SHA, source: "5etools", chars: 10 }, verdict: "entry",
      why: "a reader asked for a rule",
      items: [{ origin: "official", match: "matched", identifier: "gust-slam", docId: `${ACTOR}.${DOC}`, activities: [SAVE],
        effects: [], data: { sha256: dataFingerprint(doc) } }],
      evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.8 } } };
    beforeEach(() => {
      mkdirSync(join(tmp, "dumps"));
      mkdirSync(join(tmp, "text"));
      mkdirSync(join(tmp, "out"));
      writeFileSync(join(tmp, "text", `${SHA}.txt`), TEXT);
      writeFileSync(join(tmp, "dumps", "dnd-monster-manual.actors.json"), JSON.stringify([
        { _id: ACTOR, name: "Glimmer Drake", type: "npc", system: {}, items: [doc] }]));
      env = { ...env, RULEPACK_DUMPS: join(tmp, "dumps"), RULEPACK_TEXT: join(tmp, "text"), DAS_CORE: CORE_DIR };
      saveBook(join(tmp, "registry"), { book: "XMM", records: [record] });
    });
    const registry = () => JSON.parse(readFileSync(join(tmp, "registry", "xmm.json"), "utf8")).records;
    const results = (name, body) => {
      const file = join(tmp, "out", `${name}.results.json`);
      writeFileSync(file, JSON.stringify(body));
      return file;
    };

    it("a first reread names target-size; --restate cuts it once, the ingest marks it, and it is not cut again", () => {
      const out = join(tmp, "out");
      const priv = join(tmp, "private");
      const args = ["batch", "reread", "XMM", "--out", out, "--structure", priv];
      expect(cli(args).status).toBe(0);
      const first = cli(["ingest", results("a", { batch: "xmm-reread-001", by: "rereader-1", results: [{ key: gust,
        covered: false, unexpressed: ["target-size"], why: "Medium or smaller", confidence: 0.8 }] }), "--reread",
      "--batch", join(out, "xmm-reread-001.json")]);
      expect(first.status, first.stderr).toBe(0);
      expect(cli(args).stdout).toMatch(/0 batches/);
      const cut = cli([...args, "--restate"]);
      expect(cut.status, cut.stderr).toBe(0);
      const batch = JSON.parse(readFileSync(join(out, "xmm-reread-002.json"), "utf8"));
      expect(batch).toMatchObject({ id: "xmm-reread-002", stage: "reread", restate: true });
      expect(batch.entries.map((e) => e.key)).toEqual([gust]);
      const body = { batch: "xmm-reread-002", by: "rereader-2", results: [{ key: gust, covered: false, unexpressed: ["use-limit"],
        why: "Medium or smaller", confidence: 0.8 }] };
      const plain = cli(["ingest", results("b", body), "--reread", "--batch", join(out, "xmm-reread-002.json")]);
      expect(plain.status).toBe(2);
      const restated = cli(["ingest", results("c", body), "--reread", "--restate", "--batch",
        join(out, "xmm-reread-002.json")]);
      expect(restated.status, restated.stderr).toBe(0);
      expect(JSON.parse(restated.stdout)).toMatchObject({ beyond: 1, rejected: [] });
      expect(registry()[0].evidence.triaged.reread).toMatchObject({ by: "rereader-2", unexpressed: ["use-limit"],
        restated: true });
      const none = cli([...args, "--restate"]);
      expect(none.stdout).toMatch(/0 batches/);
      expect(none.stdout).toMatch(/not restatable/);
    });
  });
});
