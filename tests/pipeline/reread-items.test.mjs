// The engine-aware reread of non-monster `entry` records (Ruling R42). Triage gave `entry` to features, spells, items, feats,
// species and options without knowing what DAS · Core does with the item; the engine classifies every item itself (its
// automation badge: `rule`, `auto`, `passive`, `manual`, `none`), and a private view of a live sweep gives that class per
// record. A reader blind to every earlier verdict compares the text with the view and the item's data. Synthetic fixtures
// only: invented items, described in this test's own words; the engine view is a stand-in written here.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COVERED_BY_LEVELS, ENGINE_LEVELS, LEVEL_MEANINGS, NO_DEFINITION, cutItemRereadBatches, ingestItemRereads,
  isOlderVersion, itemRereadReport, itemRereadSkipReason, itemRereadStaleNote, parseEngineView,
  ruleKeyMeaning, viewFingerprint
} from "../../tools/pipeline/reread-items.mjs";
import { COVERED_BY, COVERED_VERDICT, ITEM_REREAD_WHY } from "../../tools/pipeline/schema.mjs";
import { saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";
import { setByRule } from "../../tools/pipeline/triage.mjs";
import { cutDraftBatches, itemRereadVocabulary } from "../../tools/pipeline/batch.mjs";
import { cutRereadBatches, ingestRereads, readingFingerprint } from "../../tools/pipeline/reread.mjs";
import { runGates } from "../../tools/pipeline/gates.mjs";
import { dataFingerprint } from "../../tools/pipeline/dumps.mjs";

const AT = "2026-11-23T00:00:00.000Z";
const ACT = "Ac00Ac11Ac22Ac33";
const FX = "Fx00Fx11Fx22Fx33";
const SHA = "d".repeat(64);
// This test's own words: a boot spell that knocks a foe over on a hit and lets the wearer hop over a wall once a day.
const TEXT = "The cinder boots let the wearer kick a foe, who falls over on a hit. Once each day the wearer may hop over a"
  + " garden wall without touching it, landing softly on the other side of the wall.";
const core = {
  version: "9.9.9", moments: ["turnStart", "turnEnd"], statuses: ["prone", "frightened", "grappled"],
  creatureTypes: ["beast"], moveModes: ["push", "pull"], effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"]
};
// The item's own data: an attack with fire damage whose effect makes the target fall prone.
const STRUCTURE = {
  activities: [{ id: ACT, label: "Kick", type: "attack", effects: [FX], damage: [{ number: 1, denomination: 8,
    types: ["fire"] }] }],
  effects: [{ id: FX, name: "Down", statuses: ["prone"], changes: [], transfer: false }]
};
const RULE_VIEW = { level: "rule", rules: ["usageLimits", "globe"] };
const AUTO_VIEW = { level: "auto", rules: [] };
const MANUAL_VIEW = { level: "manual", rules: [] };
const FP = viewFingerprint(RULE_VIEW, core);

const keyOf = (n) => `tst:feature:cinder-step-${n}`;
function feature(n, over = {}) {
  return {
    key: keyOf(n), name: `Cinder Step ${n}`, kind: "feature", book: "TST", page: 11, edition: "2024", owner: "Ashwalker",
    level: 3, text: { sha256: SHA, source: "dataset", chars: TEXT.length }, verdict: "entry",
    why: "a reader thought this one needs a rule", hint: "core-parts",
    items: [{ origin: "official", match: "matched", identifier: `cinder-step-${n}`, docId: `tstCinderStep${String(n)
      .padStart(3, "0")}`, activities: [ACT], effects: [FX], data: { sha256: "b".repeat(64) } }],
    evidence: { triaged: { by: "reader-xphb-1", at: AT, confidence: 0.8, keys: ["usageLimits"], similar: [] } },
    ...over
  };
}
const fall = { given: { roll: "hit" }, expect: { condition: { applied: "prone" } } };
const shove = { given: { roll: "hit" }, expect: { move: { mode: "push", distance: 10 } } };

describe("the engine view: a closed shape, a fingerprint, the vocabulary of its words", () => {
  it("reads the view file, refusing anything outside its shape", () => {
    const viewOf = parseEngineView({ [keyOf(1)]: { level: "rule", rules: ["globe", "usageLimits", "globe"],
      layers: ["module"], identifier: "cinder-step-1", pack: "tst.feats" }, [keyOf(2)]: { missing: true } });
    expect(viewOf(keyOf(1))).toEqual({ level: "rule", rules: ["globe", "usageLimits"] });
    expect(viewOf(keyOf(2))).toBeNull();
    // The engine's own entry, when the sweep kept it, is carried to the reader and counts in the fingerprint.
    const withEntry = parseEngineView({ [keyOf(1)]: { level: "rule", rules: ["globe"], entry: { globe: { radius: 10 } } } });
    expect(withEntry(keyOf(1))).toEqual({ level: "rule", rules: ["globe"], entry: { globe: { radius: 10 } } });
    expect(() => parseEngineView({ [keyOf(1)]: { level: "rule", rules: [], entry: "x" } })).toThrow(/entry must be an object/);
    const bare = viewFingerprint({ level: "rule", rules: ["globe"] }, { version: "9.9.9" });
    const full = viewFingerprint(withEntry(keyOf(1)), { version: "9.9.9" });
    expect(full.sha).not.toBe(bare.sha);
    expect(viewOf(keyOf(3))).toBeUndefined();
    for (const bad of [[], null, { k: { level: "magic" } }, { k: { level: "auto", note: "x" } },
      { k: { level: "auto", rules: [1] } }, { k: { missing: true, level: "auto" } }, { k: { level: "auto", rules: ["a b"] } }]) {
      expect(() => parseEngineView(bad)).toThrow(/engine view/);
    }
  });

  it("fingerprints the level and the rules with the engine version of DAS_CORE", () => {
    expect(FP.core).toBe("9.9.9");
    expect(FP.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(viewFingerprint({ level: "rule", rules: ["globe", "usageLimits"] }, core)).toEqual(FP);
    expect(viewFingerprint({ level: "rule", rules: ["globe"] }, core).sha).not.toBe(FP.sha);
    expect(viewFingerprint(AUTO_VIEW, core).sha).not.toBe(FP.sha);
    expect(isOlderVersion("9.9.8", "9.9.9")).toBe(true);
    expect(isOlderVersion("9.10.0", "9.9.9")).toBe(false);
    expect(isOlderVersion("9.9.9", "9.9.9")).toBe(false);
  });

  it("defines each level and each rule key named; a key with no definition is said to be undescribed", () => {
    expect([...ENGINE_LEVELS]).toEqual(["rule", "auto", "passive", "manual", "none"]);
    for (const level of ENGINE_LEVELS) expect(LEVEL_MEANINGS[level]).toMatch(/\w/);
    expect(ruleKeyMeaning("globe")).not.toBe(NO_DEFINITION);
    expect(ruleKeyMeaning("usageLimits")).toBe("an engine rule of that name, not described here");
    expect(COVERED_BY_LEVELS).toEqual({ engine: ["rule"], data: ["rule", "auto", "passive"],
      nothing: ["rule", "auto", "passive", "manual", "none"] });
    const v = itemRereadVocabulary({ ...core, stepTypes: [], abilities: [], shipped: {} });
    expect(Object.keys(v.engineLevels)).toEqual([...ENGINE_LEVELS]);
    expect(Object.keys(v.coveredBy)).toEqual([...COVERED_BY]);
    expect(v.coveredByLevels).toEqual(COVERED_BY_LEVELS);
    expect(v.unexpressed).toContain("use-limit");
  });
});

describe("batch reread --items: what is cut", () => {
  const views = new Map();
  const viewOf = (key) => (views.has(key) ? views.get(key) : RULE_VIEW);
  const documentOf = (r) => (r.key === keyOf(9) ? null : STRUCTURE);
  const rereadOf = (view, over = {}) => ({ by: "rereader-1", at: AT, confidence: 0.8, view, covered: false,
    beyond: [shove], ...over });
  const records = () => {
    views.clear();
    views.set(keyOf(7), undefined);
    views.set(keyOf(8), null);
    views.set(keyOf(11), AUTO_VIEW);
    views.set(keyOf(15), MANUAL_VIEW);
    const triaged = feature(1).evidence.triaged;
    return [
      feature(1), feature(2, { identifier: "cinder-step-2",
        rule: { handledIn: "table", adds: "x", entry: { halfOnMiss: true }, origins: ["official"], assert: [] } }),
      feature(3), feature(4), feature(5, { text: null }), feature(6, { items: [] }), feature(7), feature(8), feature(9),
      feature(10, { verdict: "data" }), feature(11),
      { ...feature(12), kind: "monster", key: "tst:monster:ash-imp/action/cinder-step-12", owner: "Ash Imp" },
      feature(13, { hint: "beyond-engine", evidence: { triaged: { ...triaged, reread: rereadOf(FP) } } }),
      feature(14, { hint: "beyond-engine", evidence: { triaged: { ...triaged,
        reread: rereadOf({ core: "9.9.8", sha: FP.sha }) } } }),
      feature(15), feature(16, { legacy: true }), { ...feature(17), kind: "spell", key: "tst:spell:cinder-step-17" }
    ];
  };
  const options = (over = {}) => ({ core, viewOf, documentOf, reviewQueued: new Set([keyOf(3)]),
    triageQueued: new Set([keyOf(4)]), ...over });

  it("cuts unruled non-monster entry records the engine view classifies, an older view's reread included", () => {
    const { batches, leftOut, byLevel } = cutItemRereadBatches(records(), options({ size: 2, after: { tst: 3 } }));
    expect(batches.map((b) => b.id)).toEqual(["tst-reread-items-004", "tst-reread-items-005", "tst-reread-items-006"]);
    expect(batches.every((b) => b.stage === "reread" && b.items === true && b.core === "9.9.9")).toBe(true);
    expect(batches.flatMap((b) => b.entries.map((e) => e.key)))
      .toEqual([keyOf(1), keyOf(11), keyOf(14), keyOf(15), "tst:spell:cinder-step-17"]);
    expect(leftOut).toEqual({
      "already ruled": 1, "in review-queue.json": 1, "in queue.json": 1, "no text": 1, "no matched official item": 1,
      "not in the engine view": 1, "missing from the engine view": 1, "official item not in the dumps": 1,
      "reread for the current view": 1, legacy: 1
    });
    expect(byLevel).toEqual({ auto: 1, manual: 1, rule: 3 });
    expect(itemRereadSkipReason(feature(1), options())).toBeNull();
    expect(itemRereadSkipReason(records()[11], options())).toBe("not an item entry");
  });

  it("an entry is a triage entry with the engine view, the words it names and its fingerprint: nothing else", () => {
    const { batches } = cutItemRereadBatches(records(), options());
    const [entry] = batches[0].entries;
    expect(Object.keys(entry).sort()).toEqual(["edition", "engineView", "engineWords", "items", "key", "kind", "level",
      "name", "owner", "page", "textSha", "view"]);
    expect(entry.engineView).toEqual({ level: "rule", rules: ["globe", "usageLimits"] });
    expect(entry.engineWords.level).toBe(LEVEL_MEANINGS.rule);
    expect(entry.engineWords.rules.usageLimits).toBe(NO_DEFINITION);
    expect(entry.engineWords.rules.globe).toBe(ruleKeyMeaning("globe"));
    expect(entry.view).toEqual(FP);
    expect(entry.items[0]).not.toHaveProperty("data");
    const text = JSON.stringify(batches);
    for (const word of ["reader-xphb-1", "rereader-1", "a reader thought", "verdict", "why", "hint", "core-parts",
      "confidence", "beyond", "push", "module", "tst.feats"]) {
      expect(text).not.toContain(word);
    }
  });

  it("writes counts only in the report, per reason left out and per engine level", () => {
    const { batches, leftOut, byLevel } = cutItemRereadBatches(records(), options({ size: 2 }));
    const report = itemRereadReport("TST", batches, leftOut, byLevel);
    expect(report).toEqual({ book: "TST", batches: 3, cut: 5, leftOut: expect.any(Object), byLevel });
    expect(JSON.stringify(report)).not.toContain("tst:");
  });

  it("the monster reread never cuts an item record, and this one never a monster feature", () => {
    const list = records();
    const monsterCut = cutRereadBatches(list, { core, readingOf: () => ({ halfOnMiss: true }) });
    expect(monsterCut.batches.flatMap((b) => b.entries).every((e) => e.key.startsWith("tst:monster:"))).toBe(true);
    const { batches } = cutItemRereadBatches(list, options());
    expect(batches.flatMap((b) => b.entries).some((e) => e.key.startsWith("tst:monster:"))).toBe(false);
  });

  it("a monster feature the text layer reads nothing of is cut here; one it reads is not (Ruling R46)", () => {
    const monsterKey = "tst:monster:ash-imp/action/cinder-step-12";
    views.set(monsterKey, RULE_VIEW);
    const cut = (unreadMonster) => cutItemRereadBatches(records(), options({ unreadMonster })).batches
      .flatMap((b) => b.entries).map((e) => e.key);
    expect(cut((r) => r.key === monsterKey)).toContain(monsterKey);
    expect(cut(() => false)).not.toContain(monsterKey);
    expect(cut(undefined)).not.toContain(monsterKey);
    // An item record is cut either way: the option only speaks of monster features.
    expect(cut(() => false)).toContain(keyOf(1));
  });

  it("--again offers once more a standing reread that found something missing, never a covered one (Ruling R48)", () => {
    const keysOf = (over) => cutItemRereadBatches(records(), options(over)).batches.flatMap((b) => b.entries).map((e) => e.key);
    // feature(13) carries a standing reread for the current view that found something missing.
    expect(keysOf({})).not.toContain(keyOf(13));
    expect(keysOf({ again: true })).toContain(keyOf(13));
    expect(cutItemRereadBatches(records(), options({ again: true })).batches.every((b) => b.again === true)).toBe(true);
    expect(cutItemRereadBatches(records(), options()).batches.some((b) => b.again === true)).toBe(false);
    // --keys keeps the batch to the keys named.
    expect(keysOf({ again: true, keys: new Set([keyOf(13)]) })).toEqual([keyOf(13)]);
  });

  const coveredRecord = (n, by, reread) => feature(n, { verdict: COVERED_VERDICT[by], why: ITEM_REREAD_WHY[by],
    evidence: { triaged: { by: "rule", at: AT, was: { verdict: "entry", why: "x", triaged: feature(1).evidence.triaged },
      reread } } });
  const first = (by) => ({ by: "rereader-1", at: AT, confidence: 0.9, view: FP, covered: true, coveredBy: by,
    provisional: true });

  it("--second: only the provisional covered item rereads, for the view the first judged, blind as the first", () => {
    const { provisional, ...settled } = first("data");
    const done = { ...settled, second: { by: "rereader-2", at: AT, confidence: 0.9, view: FP, covered: true,
      coveredBy: "data" } };
    const list = [coveredRecord(1, "engine", first("engine")), coveredRecord(2, "data", done),
      coveredRecord(3, "nothing", { ...first("nothing"), view: { core: "9.9.8", sha: FP.sha } }),
      coveredRecord(5, "data", first("data")), feature(4)];
    const { batches, leftOut } = cutItemRereadBatches(list, options({ second: true, reviewQueued: new Set(),
      triageQueued: new Set() }));
    expect(batches.map((b) => b.id)).toEqual(["tst-reread-items-second-001"]);
    expect(batches[0].second).toBe(true);
    expect(batches[0].entries.map((e) => e.key)).toEqual([keyOf(1), keyOf(5)]);
    expect(leftOut).toEqual({ "second reread done": 1, "view changed since the first reread": 1 });
    const plain = cutItemRereadBatches([feature(1)], options({ reviewQueued: new Set(), triageQueued: new Set() }));
    expect(batches[0].entries[0]).toEqual(plain.batches[0].entries[0]);
    const text = JSON.stringify(batches);
    for (const word of ["rereader-1", "coveredBy", "covered", "provisional", "engine\"", "verdict", "why"]) {
      expect(text).not.toContain(word);
    }
  });
});

describe("ingest --reread --items", () => {
  let textDir;
  beforeEach(() => {
    textDir = mkdtempSync(join(tmpdir(), "reread-items-text-"));
    writeFileSync(join(textDir, `${SHA}.txt`), TEXT);
  });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const keys = Array.from({ length: 16 }, (_, i) => keyOf(i + 1));
  const views = { [keyOf(2)]: AUTO_VIEW, [keyOf(3)]: MANUAL_VIEW, [keyOf(4)]: { level: "passive", rules: [] } };
  const viewOf = (k) => views[k] ?? RULE_VIEW;
  const offered = () => new Map(keys.map((k) => [k, viewFingerprint(viewOf(k), core)]));
  const current = () => new Map(keys.map((k) => [k, { view: viewOf(k), structure: STRUCTURE }]));
  const drafts = [{ key: keyOf(1), reason: "person", by: "drafter-1", why: "nothing to write", confidence: 0.8 }];
  const run = (records, results, over = {}) => ingestItemRereads(records, results, { textDir, by: "rereader-1", at: AT,
    core, offered: offered(), current: current(), draftsQueue: drafts, ...over });
  const covered = (n, coveredBy, over = {}) => ({ key: keyOf(n), covered: true, coveredBy,
    why: "what the text asks in a fight is already played", confidence: 0.9, ...over });

  it("covered by the engine: core by rule, the fixed why, what it was, provisional; it leaves the drafts queue", () => {
    const records = [feature(1), feature(5)];
    const out = run(records, [covered(1, "engine", { confidence: 0.7 })]);
    expect(out.rejected).toEqual([]);
    expect(out.covered).toEqual([keyOf(1)]);
    expect(out.dequeued).toEqual([keyOf(1)]);
    const r = out.records[0];
    expect(r.verdict).toBe("core");
    expect(r.why).toBe(ITEM_REREAD_WHY.engine);
    expect(r.hint).toBe("core-parts");
    expect(r.evidence.triaged).toEqual({ by: "rule", at: AT,
      was: { verdict: "entry", why: records[0].why, triaged: records[0].evidence.triaged },
      reread: { by: "rereader-1", at: AT, confidence: 0.7, view: FP, covered: true, coveredBy: "engine", provisional: true } });
    expect(validateRecord(r)).toEqual([]);
    expect(setByRule(r)).toBe(false);
    expect(out.records[1]).toEqual(records[1]);
    expect(records[0].verdict).toBe("entry");
  });

  it("covered by the data: data; covered by nothing: none; each with its fixed why", () => {
    const out = run([feature(2), feature(3), feature(4)], [covered(2, "data"), covered(3, "nothing"), covered(4, "data")]);
    expect(out.rejected).toEqual([]);
    expect(out.records.map((r) => r.verdict)).toEqual(["data", "none", "data"]);
    expect(out.records.map((r) => r.why)).toEqual([ITEM_REREAD_WHY.data, ITEM_REREAD_WHY.nothing, ITEM_REREAD_WHY.data]);
    for (const r of out.records) expect(validateRecord(r)).toEqual([]);
  });

  it("refuses a covered answer the engine's own class contradicts: engine needs rule, data needs a level that plays it", () => {
    const out = run([feature(2), feature(3), feature(1)], [covered(2, "engine"), covered(3, "data"),
      covered(1, "everything")]);
    expect(out.covered).toEqual([]);
    expect(out.rejected.map((x) => x.key)).toEqual([keyOf(2), keyOf(3), keyOf(1)]);
    expect(out.rejected[0].reason).toMatch(/engine.*rule/);
    expect(out.rejected[1].reason).toMatch(/manual/);
    expect(out.rejected[2].reason).toMatch(/coveredBy/);
  });

  it("not covered: entry stays, hint beyond-engine, beyond and unexpressed stored as data for the drafter", () => {
    const out = run([feature(1), feature(3)], [
      { key: keyOf(1), covered: false, beyond: [shove], why: "the kick also shoves, which nothing plays", confidence: 0.85 },
      { key: keyOf(3), covered: false, unexpressed: ["out-of-combat"], why: "the hop over a wall is left to the table",
        confidence: 0.8 }]);
    expect(out.rejected).toEqual([]);
    expect(out.beyond).toEqual([keyOf(1), keyOf(3)]);
    expect(out.dequeued).toEqual([]);
    const [a, b] = out.records;
    expect(a).toMatchObject({ verdict: "entry", why: feature(1).why, hint: "beyond-engine" });
    expect(a.evidence.triaged).toEqual({ ...feature(1).evidence.triaged,
      reread: { by: "rereader-1", at: AT, confidence: 0.85, view: FP, covered: false, beyond: [shove] } });
    expect(b.evidence.triaged.reread.unexpressed).toEqual(["out-of-combat"]);
    for (const r of out.records) expect(validateRecord(r)).toEqual([]);
    const [batch] = cutDraftBatches([a], { core: { shipped: {} }, textOf: () => TEXT });
    expect(batch.entries[0].beyondEngine).toEqual([shove]);
  });

  it("rejects a beyond the item's own data already does, a coveredBy without covered, and a malformed answer", () => {
    const out = run([feature(1), feature(5), feature(6), feature(7), feature(8)], [
      { key: keyOf(1), covered: false, beyond: [fall], why: "the fall on a hit", confidence: 0.8 },
      { key: keyOf(5), covered: false, coveredBy: "data", beyond: [shove], why: "a shove", confidence: 0.8 },
      { key: keyOf(6), covered: true, why: "all played", confidence: 0.8 },
      { key: keyOf(7), covered: true, coveredBy: "data", beyond: [shove], why: "all played", confidence: 0.8 },
      { key: keyOf(8), covered: true, coveredBy: "data", by: "engine", why: "all played", confidence: 0.8 }]);
    expect(out.rejected.map((x) => x.key)).toEqual([keyOf(1), keyOf(5), keyOf(6), keyOf(7), keyOf(8)]);
    expect(out.rejected[0].reason).toMatch(/item's own data already/);
    expect(out.rejected[1].reason).toMatch(/coveredBy/);
    expect(out.rejected[2].reason).toMatch(/coveredBy/);
    expect(out.rejected[4].reason).toMatch(/unknown field/);
  });

  it("below the threshold nothing changes; a stale view, a monster feature or a ruled record is refused", () => {
    const monster = { ...feature(9), kind: "monster", key: keyOf(9), owner: "Ash Imp" };
    const out = run([feature(1), feature(2), monster, feature(10, { verdict: "data" })], [
      covered(1, "engine", { confidence: 0.6 }), covered(2, "data"), covered(9, "engine"), covered(10, "data")],
    { offered: new Map([...offered(), [keyOf(2), FP]]) });
    expect(out.unsure).toEqual([keyOf(1)]);
    expect(out.records[0]).toEqual(feature(1));
    expect(out.rejected.map((x) => x.key)).toEqual([keyOf(2), keyOf(9), keyOf(10)]);
    expect(out.rejected[0].reason).toMatch(/stale/);
    expect(out.rejected[1].reason).toMatch(/monster/);
    expect(out.rejected[2].reason).toMatch(/entry/);
    // Ruling R46: the same monster feature is accepted when the engine's text layer reads nothing of it.
    const unread = run([monster], [covered(9, "engine")], { unreadMonster: (r) => r.key === keyOf(9) });
    expect(unread.rejected).toEqual([]);
    expect(unread.covered).toEqual([keyOf(9)]);
    expect(unread.records[0].verdict).toBe(COVERED_VERDICT.engine);
    // Ruling R48: a reader of the engine's source names the engine file; the engine may then cover an item it has no rule
    // of its own for. The file must exist, and the field goes with coveredBy engine only.
    const manualView = new Map([[keyOf(15), { view: MANUAL_VIEW, structure: STRUCTURE }]]);
    const offer15 = new Map([[keyOf(15), viewFingerprint(MANUAL_VIEW, core, STRUCTURE)]]);
    const named = (extra, exists = () => true) => run([feature(15)], [covered(15, "engine", extra)],
      { current: manualView, offered: offer15, mechanismExists: exists });
    expect(named({}).rejected[0].reason).toMatch(/needs the engine view's level.*Ruling R48/);
    const ok = named({ mechanism: "adapter/usage.mjs" });
    expect(ok.rejected).toEqual([]);
    expect(ok.records[0].evidence.triaged.reread).toMatchObject({ coveredBy: "engine", mechanism: "adapter/usage.mjs" });
    expect(validateRecord(ok.records[0])).toEqual([]);
    expect(named({ mechanism: "adapter/usage.mjs" }, () => false).rejected[0].reason).toMatch(/not a file of the engine/);
    expect(named({ mechanism: "../secrets.mjs" }).rejected[0].reason).toMatch(/must be a path under the engine/);
    const withData = run([feature(1)], [covered(1, "data", { mechanism: "adapter/usage.mjs" })], { mechanismExists: () => true });
    expect(withData.rejected[0].reason).toMatch(/coveredBy engine only/);
    // An "again" batch lifts the "already reread" guard for a reread that found something missing, and only then.
    const missing = { by: "rereader-1", at: AT, confidence: 0.8, view: FP, covered: false,
    beyond: [shove] };
    const standing = feature(13, { hint: "beyond-engine", evidence: { triaged: { ...feature(1).evidence.triaged,
      reread: missing } } });
    const offer13 = new Map([[keyOf(13), FP]]);
    const cur13 = new Map([[keyOf(13), { view: RULE_VIEW, structure: null }]]);
    expect(run([standing], [covered(13, "engine")], { offered: offer13, current: cur13 }).rejected[0].reason).toMatch(/already reread/);
    expect(run([standing], [covered(13, "engine")], { offered: offer13, current: cur13, again: true }).covered).toEqual([keyOf(13)]);
    const gone = run([feature(1)], [covered(1, "engine")], { current: new Map([[keyOf(1), { view: null,
      structure: STRUCTURE }]]) });
    expect(gone.rejected[0].reason).toMatch(/stale/);
    const again = run([feature(1, { evidence: { triaged: { reread: { by: "rereader-0", at: AT, confidence: 0.8, view: FP,
      covered: false, beyond: [shove] } } } })], [covered(1, "engine")]);
    expect(again.rejected[0].reason).toMatch(/already reread/);
  });

  it("the monster ingest refuses an item record", () => {
    const out = ingestRereads([feature(1)], [{ key: keyOf(1), covered: true, why: "all played", confidence: 0.9 }], {
      textDir, by: "rereader-1", at: AT, core, offered: new Map([[keyOf(1), readingFingerprint({ a: 1 }, core)]]),
      current: new Map([[keyOf(1), { reading: { a: 1 }, structure: STRUCTURE }]]) });
    expect(out.rejected[0].reason).toMatch(/monster/);
  });
});

describe("ingest --reread --items --second: the safety net", () => {
  let textDir;
  beforeEach(() => {
    textDir = mkdtempSync(join(tmpdir(), "reread-items-second-"));
    writeFileSync(join(textDir, `${SHA}.txt`), TEXT);
  });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const keys = [1, 2, 3, 4, 5, 6].map(keyOf);
  const offered = () => new Map(keys.map((k) => [k, FP]));
  const current = () => new Map(keys.map((k) => [k, { view: RULE_VIEW, structure: STRUCTURE }]));
  const provisional = (n, coveredBy) => {
    const before = feature(n);
    const out = ingestItemRereads([before], [{ key: keyOf(n), covered: true, coveredBy,
      why: "what the text asks in a fight is already played", confidence: 0.9 }], { textDir, by: "rereader-1", at: AT, core,
      offered: offered(), current: current() });
    expect(out.rejected).toEqual([]);
    return out.records[0];
  };
  const second = (records, results, over = {}) => ingestItemRereads(records, results, { textDir, by: "rereader-2", at: AT,
    core, offered: offered(), current: current(), second: true, ...over });
  const answer = (n, over) => ({ key: keyOf(n), why: "read again on its own", confidence: 0.85, ...over });

  it("agrees on covered and on coveredBy: confirmed, provisional gone, the second stored", () => {
    for (const by of COVERED_BY) {
      const r = provisional(1, by);
      const out = second([r], [answer(1, { covered: true, coveredBy: by })]);
      expect(out.agreed).toEqual([keyOf(1)]);
      const next = out.records[0];
      expect(next.verdict).toBe(COVERED_VERDICT[by]);
      expect(next.evidence.triaged.reread).not.toHaveProperty("provisional");
      expect(next.evidence.triaged.reread.second).toEqual({ by: "rereader-2", at: AT, confidence: 0.85, view: FP,
        covered: true, coveredBy: by });
      expect(validateRecord(next)).toEqual([]);
    }
  });

  it("fails closed: another coveredBy, something beyond, or an unsure second reader takes the record back to entry", () => {
    const records = [provisional(1, "engine"), provisional(2, "data"), provisional(3, "nothing")];
    const out = second(records, [answer(1, { covered: true, coveredBy: "data" }),
      answer(2, { covered: false, beyond: [shove] }), answer(3, { covered: true, coveredBy: "nothing", confidence: 0.5 })]);
    expect(out.rejected).toEqual([]);
    expect(out.disagreed).toEqual([keyOf(1), keyOf(2)]);
    expect(out.unsureReverted).toEqual([keyOf(3)]);
    const [a, b, c] = out.records;
    for (const r of out.records) {
      expect(r).toMatchObject({ verdict: "entry", why: feature(1).why });
      expect(validateRecord(r)).toEqual([]);
    }
    expect(a.hint).toBe("core-parts");
    expect(b.hint).toBe("beyond-engine");
    expect(c.hint).toBe("core-parts");
    expect(b.evidence.triaged.reread.second.beyond).toEqual([shove]);
    expect(c.evidence.triaged.reread.second).toEqual({ by: "rereader-2", at: AT, confidence: 0.5, view: FP,
      outcome: "second-unsure" });
    expect(a.evidence.triaged.by).toBe("reader-xphb-1");
    const [batch] = cutDraftBatches([b], { core: { shipped: {} }, textOf: () => TEXT });
    expect(batch.entries[0].beyondEngine).toEqual([shove]);
  });

  it("a second reader with the first's handle is refused; a settled record is reported, not read again", () => {
    const r = provisional(1, "data");
    expect(second([r], [answer(1, { covered: true, coveredBy: "data" })], { by: "REREADER-1" }).rejected[0].reason)
      .toMatch(/another reader/);
    const once = second([r], [answer(1, { covered: true, coveredBy: "data" })]);
    const twice = second(once.records, [answer(1, { covered: true, coveredBy: "data" })]);
    expect(twice.alreadyConfirmed).toEqual([keyOf(1)]);
    expect(twice.records).toEqual(once.records);
    const stale = second([r], [answer(1, { covered: true, coveredBy: "data" })], {
      offered: new Map([[keyOf(1), viewFingerprint(AUTO_VIEW, core)]]),
      current: new Map([[keyOf(1), { view: AUTO_VIEW, structure: STRUCTURE }]]) });
    expect(stale.rejected[0].reason).toMatch(/stale/);
  });
});

describe("evidence.triaged.reread of an item: a closed shape the schema holds (gates --ci included)", () => {
  const record = (by, reread, over = {}) => feature(1, { verdict: COVERED_VERDICT[by], why: ITEM_REREAD_WHY[by],
    evidence: { triaged: { by: "rule", at: AT, was: { verdict: "entry", why: "x" }, reread } }, ...over });
  const first = (by) => ({ by: "rereader-1", at: AT, confidence: 0.9, view: FP, covered: true, coveredBy: by,
    provisional: true });

  it("accepts each covered shape with its verdict, and refuses another", () => {
    for (const by of COVERED_BY) expect(validateRecord(record(by, first(by)))).toEqual([]);
    const bad = [{ ...first("data"), coveredBy: "magic" }, { ...first("data"), reading: FP },
      (({ coveredBy, ...rest }) => rest)(first("data")), { ...first("data"), view: { core: "9.9.9" } }];
    for (const reread of bad) expect(validateRecord(record("data", reread)).join(" ")).toMatch(/evidence\.triaged\.reread/);
    expect(validateRecord(record("data", first("engine"))).join(" ")).toMatch(/reread/);
    expect(validateRecord(record("data", first("data"), { why: "my own words" })).join(" ")).toMatch(/reread/);
    expect(validateRecord(record("data", first("data"), { verdict: "core" })).join(" ")).toMatch(/reread/);
  });

  it("not covered: no coveredBy, never a core, data or none; a second that disagrees sets none of them either", () => {
    const beyond = { by: "rereader-1", at: AT, confidence: 0.9, view: FP, covered: false, beyond: [shove] };
    expect(validateRecord(feature(1, { evidence: { triaged: { reread: beyond } } }))).toEqual([]);
    expect(validateRecord(feature(1, { evidence: { triaged: { reread: { ...beyond, coveredBy: "data" } } } })).join(" "))
      .toMatch(/coveredBy/);
    const { provisional, ...settled } = first("data");
    const other = { ...settled, second: { by: "rereader-2", at: AT, confidence: 0.8, view: FP, covered: true,
      coveredBy: "engine" } };
    expect(validateRecord(record("data", other)).join(" ")).toMatch(/reread/);
    expect(validateRecord(feature(1, { evidence: { triaged: { reread: other } } }))).toEqual([]);
    const agreed = { ...settled, second: { ...other.second, coveredBy: "data" } };
    expect(validateRecord(record("data", agreed))).toEqual([]);
    const monsterSecond = { ...settled, second: { by: "rereader-2", at: AT, confidence: 0.8, reading: FP, covered: true } };
    expect(validateRecord(record("data", monsterSecond)).join(" ")).toMatch(/view/);
  });
});

describe("gates: an item reread judged against another view, an older engine or no view is stale: read again", () => {
  const stub = { version: "9.9.9", facts: [], vocabulary: new Set(), validateEntry: () => [], getPath: () => undefined,
    matchesFrom: () => true };
  const reread = { by: "rereader-1", at: AT, confidence: 0.9, view: FP, covered: false, beyond: [shove] };
  const record = feature(1, { hint: "beyond-engine", evidence: { triaged: { reread } } });

  it("notes a changed view, an older engine version and a missing view; never a failure, never under --ci", () => {
    expect(itemRereadStaleNote(record, FP, { core })).toBeNull();
    expect(itemRereadStaleNote(record, viewFingerprint(AUTO_VIEW, core), { core })).toMatch(/stale.*read again/);
    expect(itemRereadStaleNote(record, null, { core })).toMatch(/stale.*read again/);
    const newer = { ...core, version: "9.10.0" };
    expect(itemRereadStaleNote(record, viewFingerprint(RULE_VIEW, newer), { core: newer })).toMatch(/stale.*read again/);
    expect(itemRereadStaleNote(record, undefined, { core: newer })).toMatch(/stale.*read again/);
    expect(itemRereadStaleNote(record, undefined, { core })).toMatch(/RULEPACK_ENGINE_VIEW/);
    expect(itemRereadStaleNote(feature(2), FP, { core })).toBeNull();
    const dir = mkdtempSync(join(tmpdir(), "reread-items-gates-"));
    try {
      writeFileSync(join(dir, `${SHA}.txt`), TEXT);
      const context = (engineViewOf, ci = false) => ({ core: stub, documents: {}, textDir: dir, ci, legacy: new Map(),
        engineViewOf, rereadReadingOf: () => { throw new Error("a monster reading asked for an item"); } });
      const out = runGates([record], context(() => null));
      expect(out.notes[record.key].reread[0]).toMatch(/stale/);
      expect(out.failures[record.key]).toBeUndefined();
      expect(out.updated[0]).toEqual(record);
      expect(runGates([record], context(() => FP)).notes[record.key]?.reread).toBeUndefined();
      expect(runGates([record], context(undefined, true)).notes[record.key]?.reread).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("the item reread brief and ruling", () => {
  const doc = readFileSync(join(import.meta.dirname, "../../docs/PIPELINE.md"), "utf8");
  it("gives the closed answer, an invented example per coveredBy, and the manual rule", () => {
    const start = doc.indexOf("### 📖 Brief for an item reread agent");
    expect(start).toBeGreaterThan(0);
    const brief = doc.slice(start, doc.indexOf("## 📖 Brief for a drafter agent")).replace(/\n> ?/g, " ");
    for (const by of COVERED_BY) expect(brief).toContain(`"coveredBy": "${by}"`);
    expect(brief).toContain("if the text asks for something in combat and the engine view is `manual`, the answer is never"
      + " covered");
    expect(brief).toMatch(/second/);
  });
  it("records Ruling R42 with its cost if wrong", () => {
    const plan = readFileSync(join(import.meta.dirname, "../../docs/superpowers/plans/2026-11-22-rulebook-pipeline-m3.md"),
      "utf8");
    const r42 = plan.slice(plan.indexOf("**R42"));
    expect(r42).toMatch(/Cost if wrong/i);
  });
});

// On the command line: an invented feat in an item dump of the 2024 Player's Handbook's package (docs/foundry-modules.json
// maps XPHB to it), in a registry, a dumps folder, a text cache and an engine view of the test's own.
const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/module.json"))
  ? process.env.DAS_CORE : null;

describe("batch reread --items and ingest --reread --items on the command line", () => {
  let tmp;
  let env;
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "reread-items-cli-"));
    env = { PATH: process.env.PATH, RULEPACK_REGISTRY: join(tmp, "registry") };
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("says what it needs, and refuses --items with --restate", () => {
    saveBook(join(tmp, "registry"), { book: "XPHB", records: [] });
    const out = ["--out", join(tmp, "out"), "--structure", join(tmp, "private")];
    const r = cli(["batch", "reread", "XPHB", "--items", ...out]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/RULEPACK_ENGINE_VIEW/);
    expect(cli(["batch", "reread", "XPHB", "--items", "--restate", ...out]).stderr).toMatch(/--items and --restate/);
    expect(cli(["ingest", "x.json", "--reread", "--items", "--restate", "--batch", "y.json"]).status).toBe(2);
    expect(cli(["ingest", "x.json", "--items", "--batch", "y.json"]).status).toBe(2);
  });

  describe.skipIf(!CORE_DIR)("with the real engine", () => {
    const FEAT = "phbCinderStep000";
    const doc = { _id: FEAT, name: "Cinder Step", type: "feat", flags: {},
      system: { identifier: "cinder-step", description: { value: "<p>A kick.</p>" }, activities: { [ACT]: { _id: ACT,
        type: "attack", name: "", activation: { type: "action" }, effects: [{ _id: FX }],
        damage: { parts: [{ number: 1, denomination: 8, types: ["fire"] }] } } } },
      effects: [{ _id: FX, name: "Down", statuses: ["prone"], changes: [], transfer: false }] };
    const key = "xphb:feat:cinder-step";
    const record = {
      key, name: "Cinder Step", kind: "feat", book: "XPHB", page: 3, edition: "2024",
      text: { sha256: SHA, source: "5etools", chars: 10 }, verdict: "entry", why: "a reader asked for a rule",
      items: [{ origin: "official", match: "matched", identifier: "cinder-step", docId: FEAT, activities: [ACT],
        effects: [FX], data: { sha256: dataFingerprint(doc) } }],
      evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.8 } }
    };
    beforeEach(() => {
      mkdirSync(join(tmp, "dumps"));
      mkdirSync(join(tmp, "text"));
      writeFileSync(join(tmp, "text", `${SHA}.txt`), TEXT);
      writeFileSync(join(tmp, "dumps", "dnd-players-handbook.feats.json"), JSON.stringify([doc]));
      writeFileSync(join(tmp, "view.json"), JSON.stringify({ [key]: { level: "auto", rules: [], layers: [],
        identifier: "cinder-step", pack: "dnd-players-handbook.feats" } }));
      env = { ...env, RULEPACK_DUMPS: join(tmp, "dumps"), RULEPACK_TEXT: join(tmp, "text"), DAS_CORE: CORE_DIR,
        RULEPACK_ENGINE_VIEW: join(tmp, "view.json") };
      saveBook(join(tmp, "registry"), { book: "XPHB", records: [record] });
    });
    const registry = () => JSON.parse(readFileSync(join(tmp, "registry", "xphb.json"), "utf8")).records;
    const results = (name, body) => {
      const file = join(tmp, "out", `${name}.results.json`);
      writeFileSync(file, JSON.stringify(body));
      return file;
    };

    it("cuts, ingests a covered-by-data reading, then an agreeing second one; gates --ci needs no view", () => {
      const out = join(tmp, "out");
      const priv = join(tmp, "private");
      const cut = cli(["batch", "reread", "XPHB", "--items", "--out", out, "--structure", priv]);
      expect(cut.status, cut.stderr).toBe(0);
      expect(readdirSync(out).sort()).toEqual(["reread-items-vocabulary.json", "xphb-reread-items-001.json",
        "xphb-reread-items-report.json"]);
      expect(JSON.parse(readFileSync(join(out, "xphb-reread-items-report.json"), "utf8")))
        .toEqual({ book: "XPHB", batches: 1, cut: 1, leftOut: {}, byLevel: { auto: 1 } });
      const batchFile = join(out, "xphb-reread-items-001.json");
      const batch = JSON.parse(readFileSync(batchFile, "utf8"));
      expect(batch.entries[0].engineView).toEqual({ level: "auto", rules: [] });
      expect(existsSync(join(priv, "xphb-reread-items-001.structure.json"))).toBe(true);
      const plain = cli(["ingest", results("p", { batch: batch.id, by: "rereader-1", results: [] }), "--reread", "--batch",
        batchFile]);
      expect(plain.status).toBe(2);
      const first = cli(["ingest", results(batch.id, { batch: batch.id, by: "rereader-1", results: [
        { key, covered: true, coveredBy: "data", why: "its attack and its effect already play it", confidence: 0.9 }] }),
      "--reread", "--items", "--batch", batchFile]);
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject({ covered: 1, beyond: 0, unsure: [], rejected: [] });
      expect(registry()[0]).toMatchObject({ verdict: "data", why: ITEM_REREAD_WHY.data });
      const again = cli(["batch", "reread", "XPHB", "--items", "--second", "--out", out, "--structure", priv]);
      expect(again.status, again.stderr).toBe(0);
      const secondFile = join(out, "xphb-reread-items-second-001.json");
      const second = cli(["ingest", results("xphb-reread-items-second-001", { batch: "xphb-reread-items-second-001",
        by: "rereader-2", results: [{ key, covered: true, coveredBy: "data", why: "the item's own attack plays all of it",
          confidence: 0.8 }] }), "--reread", "--items", "--second", "--batch", secondFile]);
      expect(second.status, second.stderr).toBe(0);
      expect(JSON.parse(second.stdout)).toMatchObject({ agreed: 1, disagreed: 0, rejected: [] });
      expect(registry()[0].evidence.triaged.reread.second.coveredBy).toBe("data");
      const { RULEPACK_ENGINE_VIEW, RULEPACK_DUMPS, RULEPACK_TEXT, ...ciEnv } = env;
      const gates = spawnSync("node", ["tools/pipeline/cli.mjs", "gates", "--ci"], { encoding: "utf8",
        env: { ...ciEnv, RULEPACK_RULES: join(tmp, "rules") } });
      expect(gates.stderr).not.toMatch(/RULEPACK_ENGINE_VIEW|reread/);
      expect(gates.stdout).toMatch(/1 records, 0 failing/);
      writeFileSync(join(tmp, "view.json"), JSON.stringify({}));
      const local = cli(["gates"]);
      expect(local.stdout).toMatch(/note xphb:feat:cinder-step: reread: stale/);
    });
  });
});
