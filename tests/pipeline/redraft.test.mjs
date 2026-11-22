// Redrafting (Ruling R32): a monster rule drafted before the drafter could see the engine's reading (or write trigger
// conditions) may change what the engine reads (a merged `triggers` replaces the engine's whole): it is held
// `engine-changes`. `batch draft --redraft` cuts such records ONCE, blind to their old rule, and `ingest --draft --redraft`
// replaces the rule (its review evidence dropped) and marks the draft `evidence.drafted.redrafted: true`.
// Synthetic fixtures only: invented creatures and features, described in this test's own words.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NOT_REDRAFTABLE, cutDraftBatches, redraftable } from "../../tools/pipeline/batch.mjs";
import { ingestDrafts } from "../../tools/pipeline/draft.mjs";
import { emissionOf } from "../../tools/pipeline/generate.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { embeddedIndex } from "../../tools/pipeline/settle.mjs";
import { loadQueue, ruleFingerprint, saveBook, stateOf, validateRecord } from "../../tools/pipeline/registry.mjs";
import { dataFingerprint } from "../../tools/pipeline/dumps.mjs";

const AT = "2026-11-22T00:00:00.000Z";
const LATER = "2026-11-23T00:00:00.000Z";
// This test's own words: a glimmer drake's bite scorches, and a scorched foe smoulders for a while.
const BODY = "The glimmer drake bites. A creature it bites smoulders with pale light and takes less on a steady nerve.";
const A_OFF = "Af11Bf22Cf33Df44";
const A_DDB = "Ad11Bd22Cd33Dd44";
const E_OFF = "Ef11Ef22Ef33Ef44";
const ACTOR = "Ac11Ac22Ac33Ac44";
const OWN = "Bt11Bt22Bt33Bt44";
const ITEM_SHA = "a".repeat(64);
const KEY = "tst:monster:glimmer-drake/action/bite";
const ID = "tst-glimmer-drake-bite";
const core = {
  version: "9.9.9", facts: ["actor.prone"], identifiers: new Set(["in-core"]), vocabulary: new Set(),
  validateEntry: () => [], moments: ["failedSave", "endOfTurn"], statuses: ["prone"], creatureTypes: ["undead"],
  moveModes: ["push"], effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"], shipped: {}
};
const ASSERT = [{ given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } }];
const oldRule = {
  handledIn: "table", adds: "No damage on a save.", entry: { saveDamage: { [A_OFF]: "none" } }, origins: ["official"],
  uncovered: [{ origin: "ddb-importer", because: "world ids" }], assert: ASSERT, origin: "Glimmer Drake"
};
// A stored comparison with the engine's reading that stands for the rule as it is: `changes` holds it (engine-changes).
const readingOf = (rule, lists = { delta: [], same: [], changes: ["saveDamage"] }, triggers = "none") => ({
  at: AT, core: "9.9.9", rule: ruleFingerprint(rule), item: ITEM_SHA, ...lists, triggers, original: "bite", carried: [],
  dropped: []
});

let textDir;
let sha;
beforeEach(() => {
  textDir = mkdtempSync(join(tmpdir(), "redraft-"));
  sha = cacheText(textDir, BODY);
});
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const items = () => [
  { origin: "official", match: "matched", identifier: "bite", docId: `${ACTOR}.${OWN}`, activities: [A_OFF],
    effects: [E_OFF], data: { sha256: ITEM_SHA } },
  { origin: "ddb-importer", match: "matched", identifier: "bite", docId: "Dd11Dd22Dd33Dd44", activities: [A_DDB],
    effects: [], data: { sha256: "b".repeat(64) }, identifierDiffers: true }
];
// A gated, reviewed monster rule held because it changes the engine's reading.
const ruled = (over = {}) => {
  const { evidence, ...rest } = over;
  const rule = rest.rule ?? oldRule;
  return {
    key: KEY, name: "Bite", kind: "monster", book: "TST", page: 3, edition: "2024", owner: "Glimmer Drake",
    section: "action", identifier: ID, sources: { [OWN]: ID }, text: { sha256: sha ?? "c".repeat(64), source: "5etools",
      chars: 10 }, items: items(), verdict: "entry", why: "a reader asked for a rule", rule,
    evidence: {
      triaged: { by: "reader-1", at: AT, confidence: 0.9, keys: ["saveDamage"], similar: [ID, "tst-other-rule"] },
      drafted: { by: "drafter-1", at: AT, core: "9.9.9", rule: ruleFingerprint(rule) },
      gates: { at: AT, core: "9.9.9", rule: ruleFingerprint(rule), passed: ["schema", "validator", "ids", "fixes", "text"] },
      reviewed: { by: "reviewer-1", at: AT, agrees: true, rule: ruleFingerprint(rule), confidence: 0.9 },
      reading: readingOf(rule), ...evidence
    },
    ...rest
  };
};

describe("redraftable: a monster rule held engine-changes, outside the queues, not yet redrafted", () => {
  it("holds for a gated monster rule whose stored reading changes the engine's", () => {
    expect(emissionOf(ruled())).toEqual({ emitted: false, because: "engine-changes" });
    expect(redraftable(ruled())).toBe(true);
  });

  it("not for another kind, a legacy record, no rule, or a rule not held engine-changes", () => {
    expect(redraftable(ruled({ kind: "feature" }))).toBe(false);
    expect(redraftable(ruled({ legacy: true }))).toBe(false);
    const { rule, ...bare } = ruled();
    expect(redraftable(bare)).toBe(false);
    // Only a delta: engine-changes no longer holds it.
    expect(redraftable(ruled({ evidence: { reading: readingOf(oldRule, { delta: ["saveDamage"], same: [], changes: [] }) } })))
      .toBe(false);
    // A comparison about an older rule is not current: engine-text holds it, not engine-changes.
    expect(redraftable(ruled({ evidence: { reading: readingOf({ ...oldRule, adds: "Older." }) } }))).toBe(false);
  });

  it("not when it waits in review-queue.json or drafts-queue.json, or was redrafted already", () => {
    expect(redraftable(ruled(), { reviewQueued: new Set([KEY]) })).toBe(false);
    expect(redraftable(ruled(), { draftsQueued: new Set([KEY]) })).toBe(false);
    const marked = ruled({ evidence: { drafted: { by: "drafter-2", at: AT, core: "9.9.9", rule: ruleFingerprint(oldRule),
      redrafted: true } } });
    expect(redraftable(marked)).toBe(false);
  });

  it("with readingOf, decides on the reading computed now, failing closed when there is none", () => {
    const now = readingOf(oldRule, { delta: ["saveDamage"], same: [], changes: [] });
    expect(redraftable(ruled(), { readingOf: () => now })).toBe(false);
    expect(redraftable(ruled(), { readingOf: () => null })).toBe(false);
    const { reading, ...unread } = ruled().evidence;
    expect(redraftable(ruled({ evidence: { reading: undefined } }))).toBe(false);
    expect(redraftable({ ...ruled(), evidence: unread }, { readingOf: () => readingOf(oldRule) })).toBe(true);
  });
});

describe("batch draft --redraft: only redraftable records, as ordinary draft entries, blind to the old rule", () => {
  const other = (over = {}) => ruled({ key: "tst:monster:glimmer-drake/action/tail", name: "Tail",
    identifier: "tst-other-rule", sources: undefined, evidence: { reading: readingOf(oldRule, { delta: ["saveDamage"],
      same: [], changes: [] }) }, ...over });
  const unruled = () => {
    const { rule, sources, ...rest } = ruled({ key: "tst:monster:glimmer-drake/action/claw", name: "Claw",
      identifier: "claw" });
    return { ...rest, evidence: { triaged: rest.evidence.triaged } };
  };
  const beyond = [{ given: { roll: "hit" }, expect: { condition: { applied: "prone" } } }];
  const withBeyond = () => ruled({ hint: "beyond-engine", evidence: { triaged: { ...ruled().evidence.triaged, reread: {
    by: "rereader-1", at: AT, confidence: 0.8, reading: { core: "9.9.9", sha: "d".repeat(64) }, covered: false, beyond } } } });
  const embedded = embeddedIndex([{ name: "Glimmer Drake", items: [{ docId: `${ACTOR}.${OWN}` }] }]);
  const cut = (records, over = {}) => cutDraftBatches(records, { core, embedded, gated: () => true, redraft: true,
    ...over });

  it("cuts the redraftable record alone, in the draft series, marked redraft", () => {
    const batches = cut([ruled(), other(), unruled()], { after: { tst: 4 } });
    expect(batches.map((b) => b.id)).toEqual(["tst-draft-005"]);
    expect(batches[0]).toMatchObject({ stage: "draft", redraft: true });
    expect(batches[0].entries.map((e) => e.key)).toEqual([KEY]);
  });

  it("an ordinary draft entry, beyondEngine when a reread found it; nothing of the old rule", () => {
    const [entry] = cut([withBeyond(), other()])[0].entries;
    expect(entry).toMatchObject({ key: KEY, identifier: ID, keys: ["saveDamage"], beyondEngine: beyond });
    for (const field of ["rule", "evidence", "sources", "adds", "entry", "assert"]) expect(entry).not.toHaveProperty(field);
    expect(JSON.stringify(entry)).not.toContain("No damage on a save.");
    // The examples never hold the record's own rule (named in its `similar`), though another gated rule is offered.
    expect(entry.examples.map((e) => e.identifier)).not.toContain(ID);
    expect(entry.examples.map((e) => e.identifier)).toContain("tst-other-rule");
  });

  it("leaves queued and marked records out; without --redraft a ruled record is never cut", () => {
    expect(cut([ruled()], { queued: new Set([KEY]) })).toEqual([]);
    expect(cut([ruled()], { reviewQueued: new Set([KEY]) })).toEqual([]);
    expect(cutDraftBatches([ruled()], { core, embedded })).toEqual([]);
    expect(NOT_REDRAFTABLE).toBe("not redraftable");
  });
});

describe("ingest --draft --redraft", () => {
  const embedded = new Map([["TST", embeddedIndex([{ name: "Glimmer Drake", items: [{ docId: `${ACTOR}.${OWN}` }] }])]]);
  const newRule = {
    handledIn: "table", adds: "Half damage on a save.", entry: { saveDamage: { [A_OFF]: "half" } }, origins: ["official"],
    uncovered: [{ origin: "ddb-importer", because: "world ids" }], assert: ASSERT
  };
  const result = (over = {}) => ({ key: KEY, outcome: "rule", why: "half on a save", confidence: 0.9, rule: newRule, ...over });
  const run = (records, results, over = {}) => ingestDrafts(records, results, { textDir, by: "drafter-2", at: LATER, core,
    embedded, offered: new Set([KEY]), redraft: true, ...over });

  it("replaces the rule, drops every evidence about the old one, and marks the draft redrafted", () => {
    const before = ruled();
    const out = run([before], [result()]);
    expect(out.rejected).toEqual([]);
    expect(out.applied).toEqual([KEY]);
    expect(out.unruled).toEqual([]);
    const [next] = out.records;
    expect(next.rule).toEqual({ ...newRule, origin: "Glimmer Drake" });
    expect(next.evidence).toEqual({ triaged: before.evidence.triaged, drafted: { by: "drafter-2", at: LATER, core: "9.9.9",
      rule: ruleFingerprint(next.rule), redrafted: true } });
    expect(next.identifier).toBe(ID);
    expect(next.sources).toEqual({ [OWN]: ID });
    expect(validateRecord(next)).toEqual([]);
    expect(stateOf(next)).toBe("drafted");
    expect(redraftable(next)).toBe(false);
    expect(before.rule).toEqual(oldRule);
  });

  it("a redrafted rule that still changes the reading stays held engine-changes, and is not cut again", () => {
    const [next] = run([ruled()], [result()]).records;
    // What `npm run gates` would write: the new rule still changes the engine's reading.
    const regated = { ...next, evidence: { ...next.evidence, reading: readingOf(next.rule) } };
    expect(emissionOf(regated)).toEqual({ emitted: false, because: "engine-changes" });
    expect(redraftable(regated)).toBe(false);
    expect(cutDraftBatches([regated], { core, redraft: true, gated: () => true })).toEqual([]);
  });

  it("a declined result removes the old rule and queues the record as a normal declined draft", () => {
    const out = run([ruled()], [{ key: KEY, outcome: "person", why: "no key for the smoulder", confidence: 0.8 }]);
    expect(out.rejected).toEqual([]);
    expect(out.applied).toEqual([]);
    expect(out.unruled).toEqual([KEY]);
    expect(out.queued).toEqual([{ key: KEY, reason: "person", by: "drafter-2", why: "no key for the smoulder",
      confidence: 0.8 }]);
    const [next] = out.records;
    expect(next).not.toHaveProperty("rule");
    expect(next).not.toHaveProperty("sources");
    expect(next.identifier).toBe("bite");
    expect(next.evidence).toEqual({ triaged: ruled().evidence.triaged });
    expect(validateRecord(next)).toEqual([]);
    expect(stateOf(next)).toBe("triaged");
  });

  it("a rule below the threshold goes to a person too, the old rule removed and the new one kept as draft", () => {
    const out = run([ruled()], [result({ confidence: 0.5 })]);
    expect(out.unruled).toEqual([KEY]);
    expect(out.queued[0]).toMatchObject({ key: KEY, reason: "low-confidence", draft: newRule });
    expect(out.records[0]).not.toHaveProperty("rule");
  });

  it("a rejected result leaves the record untouched", () => {
    const records = [ruled()];
    const out = run(records, [result({ rule: { ...newRule, handledIn: "code" } })]);
    expect(out.rejected).toHaveLength(1);
    expect(out.records).toEqual(records);
    const unknown = run(records, [result({ rule: { ...newRule, evidence: {} } })]);
    expect(unknown.rejected[0].reason).toMatch(/unknown field/);
    expect(unknown.records).toEqual(records);
  });

  it("rejects a record that is not redraftable; without --redraft a ruled record is refused as ever", () => {
    const marked = ruled({ evidence: { drafted: { by: "drafter-1", at: AT, core: "9.9.9", rule: ruleFingerprint(oldRule),
      redrafted: true } } });
    for (const [records, over] of [[[marked], {}], [[ruled()], { reviewQueued: new Set([KEY]) }],
      [[ruled({ evidence: { reading: readingOf(oldRule, { delta: ["saveDamage"], same: [], changes: [] }) } })], {}]]) {
      const out = run(records, [result()], over);
      expect(out.rejected.map((x) => x.reason).join(" ")).toMatch(/not redraftable/);
      expect(out.records).toEqual(records);
    }
    const plain = run([ruled()], [result()], { redraft: false });
    expect(plain.rejected[0].reason).toMatch(/already has a rule/);
  });
});

describe("evidence.drafted.redrafted: true when present", () => {
  const withMark = (v) => validateRecord(ruled({ evidence: { drafted: { by: "drafter-2", at: AT, core: "9.9.9",
    rule: ruleFingerprint(oldRule), redrafted: v } } })).join(" ");
  it("accepts true and refuses anything else", () => {
    expect(withMark(true)).toBe("");
    expect(withMark(false)).toMatch(/drafted\.redrafted/);
    expect(withMark("yes")).toMatch(/drafted\.redrafted/);
  });
});

const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/monster-layer.mjs"))
  ? process.env.DAS_CORE : null;
const PUSH = "<p>Strength Saving Throw: DC 12, one creature within 5 feet. Failure: 7 Bludgeoning damage. If the target is"
  + " Medium or smaller, it is pushed 10 feet straight away from the gust and has the Prone condition.</p>";

describe("batch draft --redraft and ingest --draft --redraft on the command line", () => {
  let tmp;
  let env;
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "redraft-cli-"));
    env = { PATH: process.env.PATH, RULEPACK_REGISTRY: join(tmp, "registry") };
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("refuses --redraft outside batch draft and ingest --draft", () => {
    saveBook(join(tmp, "registry"), { book: "XMM", records: [] });
    for (const stage of ["review", "triage"]) {
      const r = cli(["batch", stage, "XMM", "--out", join(tmp, "out"), "--structure", join(tmp, "p"), "--redraft"]);
      expect(r.status).toBe(2);
    }
    for (const mode of [[], ["--review", "--batch", "y.json"], ["--reread", "--batch", "y.json"]]) {
      const r = cli(["ingest", "x.json", ...mode, "--redraft"]);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--redraft/);
    }
  });

  describe.skipIf(!CORE_DIR)("with the real engine", () => {
    const SAVE = "Rs00Rs11Rs22Rs33";
    const ACT = "tstGlimmerDrake0";
    const DOC = "mmGustSlam000000";
    const gust = "xmm:monster:glimmer-drake/action/gust-slam";
    const scoped = "xmm-glimmer-drake-gust-slam";
    const TEXT = "The drake beats its wings at one foe nearby; a small foe that fails is thrown back and knocked flat.";
    const TSHA = "e".repeat(64);
    const doc = { _id: DOC, name: "Gust Slam", type: "feat", flags: {},
      system: { identifier: "gust-slam", description: { value: PUSH }, activities: { [SAVE]: { _id: SAVE, type: "save",
        name: "", activation: { type: "action", condition: "" }, effects: [], damage: { onSave: "half", parts: [] },
        range: { value: "5", units: "ft", special: "" }, target: { template: { type: "", size: "" },
          affects: { type: "creature", count: "1", special: "" } } } } },
      effects: [] };
    // An old rule that writes a failed save's fall alone: it drops the engine's size-limited push (engine-changes).
    const rule = { handledIn: "table", adds: "Knocked flat on a failed save.", origins: ["official"], origin: "Glimmer Drake",
      entry: { triggers: [{ on: "failedSave", do: [{ type: "status", status: "prone" }] }] },
      assert: [{ given: { roll: "failedSave" }, expect: { condition: { applied: "prone" } } }] };
    const record = { key: gust, name: "Gust Slam", kind: "monster", book: "XMM", page: 3, edition: "2024",
      owner: "Glimmer Drake", section: "action", identifier: scoped, sources: { [DOC]: scoped },
      text: { sha256: TSHA, source: "5etools", chars: TEXT.length }, verdict: "entry", why: "a reader asked for a rule",
      items: [{ origin: "official", match: "matched", identifier: "gust-slam", docId: `${ACT}.${DOC}`, activities: [SAVE],
        effects: [], data: { sha256: dataFingerprint(doc) } }],
      rule, evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.8 },
        drafted: { by: "drafter-1", at: AT, core: "9.9.9", rule: ruleFingerprint(rule) } } };
    beforeEach(() => {
      for (const d of ["dumps", "text", "out"]) mkdirSync(join(tmp, d));
      writeFileSync(join(tmp, "text", `${TSHA}.txt`), TEXT);
      writeFileSync(join(tmp, "dumps", "dnd-monster-manual.actors.json"), JSON.stringify([
        { _id: ACT, name: "Glimmer Drake", type: "npc", system: {}, items: [doc] }]));
      env = { ...env, RULEPACK_DUMPS: join(tmp, "dumps"), RULEPACK_TEXT: join(tmp, "text"), DAS_CORE: CORE_DIR };
      saveBook(join(tmp, "registry"), { book: "XMM", records: [record] });
    });
    const results = (name, body) => {
      const file = join(tmp, "out", `${name}.results.json`);
      writeFileSync(file, JSON.stringify(body));
      return file;
    };

    it("cuts the held rule once, blind; the ingest takes it only with --redraft; then it is not cut again", () => {
      const out = join(tmp, "out");
      const priv = join(tmp, "private");
      const args = ["batch", "draft", "XMM", "--out", out, "--structure", priv];
      const plain = cli(args);
      expect(plain.status, plain.stderr).toBe(0);
      expect(plain.stdout).toMatch(/0 batches/);
      const cut = cli([...args, "--redraft"]);
      expect(cut.status, cut.stderr).toBe(0);
      const batch = JSON.parse(readFileSync(join(out, "xmm-draft-001.json"), "utf8"));
      expect(batch).toMatchObject({ id: "xmm-draft-001", stage: "draft", redraft: true });
      expect(batch.entries.map((e) => e.key)).toEqual([gust]);
      expect(JSON.stringify(batch)).not.toContain("Knocked flat");
      const report = JSON.parse(readFileSync(join(out, "xmm-draft-redraft-report.json"), "utf8"));
      expect(report).toMatchObject({ book: "XMM", batches: 1, cut: 1 });
      const structure = JSON.parse(readFileSync(join(priv, "xmm-draft-001.structure.json"), "utf8"));
      expect(structure.entries[gust].official.engineReads.triggers.length).toBeGreaterThan(0);
      const body = { batch: "xmm-draft-001", by: "drafter-2", results: [{ key: gust, outcome: "person",
        why: "the push needs a size limit", confidence: 0.8 }] };
      const refused = cli(["ingest", results("a", body), "--draft", "--batch", join(out, "xmm-draft-001.json")]);
      expect(refused.status).toBe(2);
      expect(refused.stderr).toMatch(/redraft/);
      const taken = cli(["ingest", results("b", body), "--draft", "--redraft", "--batch", join(out, "xmm-draft-001.json")]);
      expect(taken.status, taken.stderr).toBe(0);
      expect(JSON.parse(taken.stdout)).toMatchObject({ applied: 0, queued: 1, unruled: 1, rejected: [] });
      const [after] = JSON.parse(readFileSync(join(tmp, "registry", "xmm.json"), "utf8")).records;
      expect(after).not.toHaveProperty("rule");
      expect(loadQueue(join(tmp, "registry"), "drafts").map((q) => q.key)).toEqual([gust]);
      const again = cli([...args, "--redraft"]);
      expect(again.stdout).toMatch(/0 batches/);
      expect(again.stdout).toMatch(/not redraftable/);
    });

    it("a plain draft batch is refused with --redraft", () => {
      writeFileSync(join(tmp, "out", "xmm-draft-009.json"), JSON.stringify({ id: "xmm-draft-009", stage: "draft",
        entries: [{ key: gust }] }));
      const body = { batch: "xmm-draft-009", by: "drafter-2", results: [] };
      const r = cli(["ingest", results("c", body), "--draft", "--redraft", "--batch", join(tmp, "out", "xmm-draft-009.json")]);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/redraft/);
    });
  });
});
