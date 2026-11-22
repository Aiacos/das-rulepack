// Reoffering (Ruling R39): a drafts-queue entry a drafter declined waits for a person and is never cut again; since the
// drafter vocabulary has grown, `batch draft --reoffer` cuts ONCE the entries a drafter (never an owner) declined whose record
// is still an unruled `entry`, blind to the decline, and `ingest --draft --reoffer` takes a rule that passes every draft check
// (the entry leaves the queue) or marks the entry `reoffered: true` and keeps it as it was.
// Synthetic fixtures only: invented entries, invented words.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NOT_REOFFERABLE, REOFFER_REASONS, cutDraftBatches, draftSkipReason, reofferSkipReason, reofferable
} from "../../tools/pipeline/batch.mjs";
import { ingestDrafts } from "../../tools/pipeline/draft.mjs";
import { ingest } from "../../tools/pipeline/triage.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { loadQueue, queueText, saveBook, saveQueue, stateOf, validateQueueEntry, validateRecord }
  from "../../tools/pipeline/registry.mjs";
import { dataFingerprint } from "../../tools/pipeline/dumps.mjs";

const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
const AT = "2026-01-01T00:00:00.000Z";
const LATER = "2026-11-22T00:00:00.000Z";
const A_OFF = "Af11Bf22Cf33Df44";
const E_OFF = "Ef11Ef22Ef33Ef44";
const DOC_OFF = "Do11Do22Do33Do44";
const KEY = "tst:spell:frost-glimmer";
const OWNERS = ["owner"];
const core = {
  version: "9.9.9", facts: ["actor.prone"], identifiers: new Set(["in-core"]), vocabulary: new Set(),
  validateEntry: () => [], moments: ["failedSave", "endOfTurn"], statuses: ["prone"], creatureTypes: ["undead"],
  moveModes: ["push"], effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"], shipped: {}
};
// The previous decline: its words must never reach the drafter of the reoffer.
const DECLINE_WHY = "no key for the frozen shimmer then";

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "reoffer-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const record = (over = {}) => ({
  key: KEY, name: "Frost Glimmer", kind: "spell", book: "TST", page: 3, edition: "2024", identifier: "frost-glimmer",
  text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
  items: [{ origin: "official", match: "matched", identifier: "frost-glimmer", docId: DOC_OFF, activities: [A_OFF],
    effects: [E_OFF], data: { sha256: "a".repeat(64) } }],
  verdict: "entry", why: "a save halves it", evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9 } }, ...over
});
const queued = (over = {}) => ({ key: KEY, reason: "person", by: "drafter-q001", why: DECLINE_WHY, confidence: 0.8, ...over });
const ASSERT = [{ given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } }];
const rule = { handledIn: "table", adds: "A save halves the damage.", entry: { saveDamage: { [A_OFF]: "half" } },
  origins: ["official"], assert: ASSERT };
const result = (over = {}) => ({ key: KEY, outcome: "rule", why: "half on a save", confidence: 0.9, rule, ...over });

describe("reofferable: declined by a drafter, record still an unruled entry, not reoffered yet", () => {
  it("holds for each declined reason of the closed list", () => {
    expect(REOFFER_REASONS).toEqual(["person", "code", "engine", "low-confidence"]);
    for (const reason of REOFFER_REASONS) expect(reofferable(queued({ reason }), record(), { owners: OWNERS })).toBe(true);
  });

  it("never for an entry an owner or anyone but a drafter wrote, nor for another reason", () => {
    for (const by of ["owner", "OWNER", "reader-1", "reviewer-2", "person-1"]) {
      expect(reofferable(queued({ by }), record(), { owners: OWNERS })).toBe(false);
    }
    // A drafter-looking handle that docs/owners.json lists is an owner's.
    expect(reofferable(queued({ by: "drafter-9" }), record(), { owners: ["drafter-9"] })).toBe(false);
    for (const reason of ["identifier shared with another record", "disagreement", ""]) {
      expect(reofferable(queued({ reason }), record(), { owners: OWNERS })).toBe(false);
    }
    expect(() => reofferable(queued(), record())).toThrow(/owners/);
  });

  it("not once marked, nor for a ruled, legacy, other-verdict or missing record", () => {
    expect(reofferable(queued({ reoffered: true }), record(), { owners: OWNERS })).toBe(false);
    expect(reofferable(queued(), record({ rule }), { owners: OWNERS })).toBe(false);
    expect(reofferable(queued(), record({ legacy: true }), { owners: OWNERS })).toBe(false);
    expect(reofferable(queued(), record({ verdict: "code" }), { owners: OWNERS })).toBe(false);
    expect(reofferable(queued(), undefined, { owners: OWNERS })).toBe(false);
    expect(reofferable(queued({ key: "tst:spell:other" }), record(), { owners: OWNERS })).toBe(false);
  });
});

describe("batch draft --reoffer: only reofferable entries, as ordinary blind draft entries", () => {
  const other = () => record({ key: "tst:spell:pale-lamp", name: "Pale Lamp", identifier: "pale-lamp" });
  const owned = () => record({ key: "tst:spell:dim-ward", name: "Dim Ward", identifier: "dim-ward" });
  const queue = () => [queued(), queued({ key: "tst:spell:dim-ward", by: "owner" })];
  const cut = (records, over = {}) => cutDraftBatches(records, { core, reoffer: true, drafts: queue(), owners: OWNERS,
    queued: new Set(queue().map((q) => q.key)), ...over });

  it("cuts the reofferable entry alone, in the draft series, marked reoffer", () => {
    const batches = cut([record(), other(), owned()], { after: { tst: 2 } });
    expect(batches.map((b) => b.id)).toEqual(["tst-draft-003"]);
    expect(batches[0]).toMatchObject({ stage: "draft", reoffer: true });
    expect(batches[0].entries.map((e) => e.key)).toEqual([KEY]);
    expect(batches[0]).not.toHaveProperty("redraft");
  });

  it("is blind: nothing of the decline (reason, why, handle, confidence, kept draft) is in the batch", () => {
    const drafts = [queued({ reason: "low-confidence", draft: { ...rule, adds: "Kept low confidence draft." } })];
    const [batch] = cut([record()], { drafts });
    const text = JSON.stringify(batch);
    for (const word of [DECLINE_WHY, "drafter-q001", "low-confidence", "Kept low confidence draft."]) {
      expect(text).not.toContain(word);
    }
    // The same entry as a plain cut gives for the record outside the queue.
    const [plain] = cutDraftBatches([record()], { core });
    expect(batch.entries).toEqual(plain.entries);
  });

  it("left-out reasons: not reofferable for every other record; a reofferable one keeps the cut's own skips", () => {
    const ctx = { drafts: queue(), owners: OWNERS, queued: new Set(queue().map((q) => q.key)) };
    expect(reofferSkipReason(other(), ctx)).toBe(NOT_REOFFERABLE);
    expect(reofferSkipReason(owned(), ctx)).toBe(NOT_REOFFERABLE);
    expect(reofferSkipReason(record(), ctx)).toBeNull();
    expect(reofferSkipReason(record({ text: undefined }), ctx)).toBe("no text");
    expect(NOT_REOFFERABLE).toBe("not reofferable");
    // Without --reoffer a queued record is left out as ever.
    expect(draftSkipReason(record(), { queued: ctx.queued })).toBe("queued");
    expect(cutDraftBatches([record()], { core, queued: ctx.queued })).toEqual([]);
  });

  it("a marked entry is not cut again", () => {
    expect(cut([record()], { drafts: [queued({ reoffered: true })] })).toEqual([]);
  });
});

describe("ingest --draft --reoffer", () => {
  const run = (records, results, over = {}) => ingestDrafts(records, results, { textDir, by: "drafter-v020", at: LATER, core,
    offered: new Set([KEY]), queue: [queued()], reoffer: true, owners: OWNERS, ...over });

  it("a result that passes every draft check becomes the rule, as a normal draft, and the entry leaves the queue", () => {
    const out = run([record()], [result()]);
    expect(out.rejected).toEqual([]);
    expect(out.applied).toEqual([KEY]);
    expect(out.queued).toEqual([]);
    expect(out.marked).toEqual([]);
    const plain = ingestDrafts([record()], [result()], { textDir, by: "drafter-v020", at: LATER, core,
      offered: new Set([KEY]) });
    expect(out.records).toEqual(plain.records);
    expect(validateRecord(out.records[0])).toEqual([]);
    expect(stateOf(out.records[0])).toBe("drafted");
  });

  it("a decline again keeps the entry as it was, marked; nothing of the new decline replaces it", () => {
    const out = run([record()], [{ key: KEY, outcome: "engine", why: "still nothing for it", confidence: 0.9 }]);
    expect(out.rejected).toEqual([]);
    expect(out.applied).toEqual([]);
    expect(out.declined).toEqual([KEY]);
    expect(out.queued).toEqual([]);
    expect(out.marked).toEqual([{ ...queued(), reoffered: true }]);
    expect(out.records).toEqual([record()]);
  });

  it("a low-confidence rule or a clash goes the same way: marked, the old entry kept", () => {
    const out = run([record()], [result({ confidence: 0.5 })]);
    expect(out.marked).toEqual([{ ...queued(), reoffered: true }]);
    expect(out.records[0]).not.toHaveProperty("rule");
  });

  it("a rejected result, or a key missing from the results, marks the entry too", () => {
    const rejected = run([record()], [result({ rule: { ...rule, handledIn: "code" } })]);
    expect(rejected.rejected).toHaveLength(1);
    expect(rejected.marked).toEqual([{ ...queued(), reoffered: true }]);
    const missing = run([record()], []);
    expect(missing.marked).toEqual([{ ...queued(), reoffered: true }]);
    expect(missing.records).toEqual([record()]);
  });

  it("refuses a record that is not reofferable, and marks nothing it may not touch", () => {
    for (const q of [queued({ by: "owner" }), queued({ reoffered: true })]) {
      const out = run([record()], [result()], { queue: [q] });
      expect(out.rejected[0].reason).toMatch(/not reofferable/);
      expect(out.marked).toEqual([]);
    }
    const unqueued = run([record()], [result()], { queue: [] });
    expect(unqueued.rejected[0].reason).toMatch(/not reofferable/);
    expect(() => run([record()], [], { owners: undefined })).toThrow(/owners/);
  });

  it("without --reoffer a queued record is refused as ever", () => {
    const out = run([record()], [result()], { reoffer: false });
    expect(out.rejected[0].reason).toMatch(/waits for a person/);
  });
});

describe("drafts-queue.json: the mark reoffered", () => {
  it("is allowed in drafts-queue.json, true only, and nowhere else", () => {
    expect(validateQueueEntry(queued({ reoffered: true }), { queue: "drafts" })).toEqual([]);
    for (const v of [false, "yes", 1, null]) {
      expect(validateQueueEntry(queued({ reoffered: v }), { queue: "drafts" }).join(" ")).toMatch(/reoffered/);
    }
    expect(validateQueueEntry(queued({ reoffered: true }), { queue: "review" }).join(" ")).toMatch(/reoffered/);
    expect(queueText("drafts", [queued({ reoffered: true })])).toContain("\"reoffered\": true");
  });

  it("the owner path still works on a reoffered entry (Ruling R23)", () => {
    // An owner settles the record through a plain ingest of a results file: the mark is no obstacle.
    const out = ingest([record()], [{ key: KEY, verdict: "code", why: "settled by hand", confidence: 1 }],
      { textDir, by: "owner", owner: true, overwrite: true, entryKeys: new Set(), queue: [], at: LATER });
    expect(out.rejected).toEqual([]);
    expect(out.applied).toEqual([KEY]);
    expect(reofferable(queued({ reoffered: true }), out.records[0], { owners: OWNERS })).toBe(false);
    const dir = mkdtempSync(join(tmpdir(), "reoffer-q-"));
    try {
      saveQueue(dir, "drafts", [queued({ reoffered: true })]);
      expect(loadQueue(dir, "drafts")).toEqual([{ ...queued(), reoffered: true }]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/monster-layer.mjs"))
  ? process.env.DAS_CORE : null;
const PUSH = "<p>Strength Saving Throw: DC 12, one creature within 5 feet. Failure: 7 Bludgeoning damage. If the target is"
  + " Medium or smaller, it is pushed 10 feet straight away from the gust and has the Prone condition.</p>";

describe("batch draft --reoffer and ingest --draft --reoffer on the command line", () => {
  let tmp;
  let env;
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "reoffer-cli-"));
    env = { PATH: process.env.PATH, RULEPACK_REGISTRY: join(tmp, "registry") };
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("refuses --reoffer outside batch draft and ingest --draft, and with --redraft", () => {
    saveBook(join(tmp, "registry"), { book: "XMM", records: [] });
    for (const stage of ["review", "triage"]) {
      const r = cli(["batch", stage, "XMM", "--out", join(tmp, "out"), "--structure", join(tmp, "p"), "--reoffer"]);
      expect(r.status).toBe(2);
    }
    const both = cli(["batch", "draft", "XMM", "--out", join(tmp, "out"), "--structure", join(tmp, "p"), "--reoffer",
      "--redraft"]);
    expect(both.status).toBe(2);
    expect(both.stderr).toMatch(/--reoffer/);
    for (const mode of [[], ["--review", "--batch", "y.json"], ["--reread", "--batch", "y.json"],
      ["--draft", "--redraft", "--batch", "y.json"]]) {
      const r = cli(["ingest", "x.json", ...mode, "--reoffer"]);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--reoffer/);
    }
  });

  it("refuses a plain batch with --reoffer, and a reoffer batch without it", () => {
    for (const d of ["dumps", "text", "out"]) mkdirSync(join(tmp, d));
    env = { ...env, RULEPACK_DUMPS: join(tmp, "dumps"), RULEPACK_TEXT: join(tmp, "text"), DAS_CORE: join(tmp, "nowhere") };
    const write = (name, body) => {
      const file = join(tmp, "out", name);
      writeFileSync(file, JSON.stringify(body));
      return file;
    };
    const plain = write("xmm-draft-001.json", { id: "xmm-draft-001", stage: "draft", entries: [{ key: "xmm:spell:a" }] });
    const marked = write("xmm-draft-002.json", { id: "xmm-draft-002", stage: "draft", reoffer: true,
      entries: [{ key: "xmm:spell:a" }] });
    const r1 = cli(["ingest", write("a.results.json", { batch: "xmm-draft-001", by: "drafter-2", results: [] }), "--draft",
      "--reoffer", "--batch", plain]);
    expect(r1.status).toBe(2);
    expect(r1.stderr).toMatch(/not a reoffer batch/);
    const r2 = cli(["ingest", write("b.results.json", { batch: "xmm-draft-002", by: "drafter-2", results: [] }), "--draft",
      "--batch", marked]);
    expect(r2.status).toBe(2);
    expect(r2.stderr).toMatch(/reoffer/);
  });

  describe.skipIf(!CORE_DIR)("with the real engine", () => {
    const SAVE = "Rs00Rs11Rs22Rs33";
    const ACT = "tstGlimmerDrake0";
    const DOC = "mmGustSlam000000";
    const gust = "xmm:monster:glimmer-drake/action/gust-slam";
    const TEXT = "The drake beats its wings at one foe nearby; a small foe that fails is thrown back and knocked flat.";
    const TSHA = "e".repeat(64);
    const doc = { _id: DOC, name: "Gust Slam", type: "feat", flags: {},
      system: { identifier: "gust-slam", description: { value: PUSH }, activities: { [SAVE]: { _id: SAVE, type: "save",
        name: "", activation: { type: "action", condition: "" }, effects: [], damage: { onSave: "half", parts: [] },
        range: { value: "5", units: "ft", special: "" }, target: { template: { type: "", size: "" },
          affects: { type: "creature", count: "1", special: "" } } } } },
      effects: [] };
    // An unruled monster feature a reread found going beyond the engine's reading, declined once by a drafter.
    const rec = { key: gust, name: "Gust Slam", kind: "monster", book: "XMM", page: 3, edition: "2024",
      owner: "Glimmer Drake", section: "action", identifier: "gust-slam", hint: "beyond-engine",
      text: { sha256: TSHA, source: "5etools", chars: TEXT.length }, verdict: "entry", why: "a reader asked for a rule",
      items: [{ origin: "official", match: "matched", identifier: "gust-slam", docId: `${ACT}.${DOC}`, activities: [SAVE],
        effects: [], data: { sha256: dataFingerprint(doc) } }],
      evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.8 } } };
    const declined = { key: gust, reason: "person", by: "drafter-q001", why: DECLINE_WHY, confidence: 0.8 };
    beforeEach(() => {
      for (const d of ["dumps", "text", "out"]) mkdirSync(join(tmp, d));
      writeFileSync(join(tmp, "text", `${TSHA}.txt`), TEXT);
      writeFileSync(join(tmp, "dumps", "dnd-monster-manual.actors.json"), JSON.stringify([
        { _id: ACT, name: "Glimmer Drake", type: "npc", system: {}, items: [doc] }]));
      env = { ...env, RULEPACK_DUMPS: join(tmp, "dumps"), RULEPACK_TEXT: join(tmp, "text"), DAS_CORE: CORE_DIR };
      saveBook(join(tmp, "registry"), { book: "XMM", records: [rec] });
      saveQueue(join(tmp, "registry"), "drafts", [declined]);
    });

    it("cuts the declined entry once, blind; a decline again marks it and keeps it; then nothing is cut", () => {
      const out = join(tmp, "out");
      const priv = join(tmp, "private");
      const args = ["batch", "draft", "XMM", "--out", out, "--structure", priv];
      const plain = cli(args);
      expect(plain.status, plain.stderr).toBe(0);
      expect(plain.stdout).toMatch(/0 batches/);
      const cut = cli([...args, "--reoffer"]);
      expect(cut.status, cut.stderr).toBe(0);
      const batch = JSON.parse(readFileSync(join(out, "xmm-draft-001.json"), "utf8"));
      expect(batch).toMatchObject({ id: "xmm-draft-001", stage: "draft", reoffer: true });
      expect(batch.entries.map((e) => e.key)).toEqual([gust]);
      expect(JSON.stringify(batch)).not.toContain(DECLINE_WHY);
      expect(readFileSync(join(priv, "xmm-draft-001.structure.json"), "utf8")).not.toContain(DECLINE_WHY);
      const report = JSON.parse(readFileSync(join(out, "xmm-draft-reoffer-report.json"), "utf8"));
      expect(report).toMatchObject({ book: "XMM", batches: 1, cut: 1 });
      const body = { batch: "xmm-draft-001", by: "drafter-v020", results: [{ key: gust, outcome: "engine",
        why: "the size limit is still missing", confidence: 0.8 }] };
      const file = join(out, "xmm-draft-001.results.json");
      writeFileSync(file, JSON.stringify(body));
      const refused = cli(["ingest", file, "--draft", "--batch", join(out, "xmm-draft-001.json")]);
      expect(refused.status).toBe(2);
      const taken = cli(["ingest", file, "--draft", "--reoffer", "--batch", join(out, "xmm-draft-001.json")]);
      expect(taken.status, taken.stderr).toBe(0);
      expect(JSON.parse(taken.stdout)).toMatchObject({ applied: 0, declined: 1, marked: 1, rejected: [] });
      expect(loadQueue(join(tmp, "registry"), "drafts")).toEqual([{ ...declined, reoffered: true }]);
      const [after] = JSON.parse(readFileSync(join(tmp, "registry", "xmm.json"), "utf8")).records;
      expect(after).not.toHaveProperty("rule");
      const again = cli([...args, "--reoffer"]);
      expect(again.status, again.stderr).toBe(0);
      expect(again.stdout).toMatch(/0 batches/);
      expect(again.stdout).toMatch(/not reofferable/);
    });

    it("a rule that passes every draft check is applied and the entry leaves the queue", () => {
      const out = join(tmp, "out");
      const cut = cli(["batch", "draft", "XMM", "--out", out, "--structure", join(tmp, "private"), "--reoffer"]);
      expect(cut.status, cut.stderr).toBe(0);
      const rule = { handledIn: "table", adds: "Knocked flat on a failed save.", origins: ["official"],
        entry: { triggers: [{ on: "failedSave", do: [{ type: "status", status: "prone" }] }] },
        assert: [{ given: { roll: "failedSave" }, expect: { condition: { applied: "prone" } } }] };
      const file = join(out, "xmm-draft-001.results.json");
      writeFileSync(file, JSON.stringify({ batch: "xmm-draft-001", by: "drafter-v020", results: [{ key: gust,
        outcome: "rule", why: "prone on a failed save", confidence: 0.9, rule }] }));
      const taken = cli(["ingest", file, "--draft", "--reoffer", "--batch", join(out, "xmm-draft-001.json")]);
      expect(taken.status, taken.stdout + taken.stderr).toBe(0);
      expect(JSON.parse(taken.stdout)).toMatchObject({ applied: 1, declined: 0, marked: 0, rejected: [] });
      expect(loadQueue(join(tmp, "registry"), "drafts")).toEqual([]);
      const [after] = JSON.parse(readFileSync(join(tmp, "registry", "xmm.json"), "utf8")).records;
      expect(after.rule).toMatchObject({ entry: rule.entry });
      expect(after.evidence.drafted.by).toBe("drafter-v020");
    });
  });
});
