// The engine's own reading of a monster feature (its "text" layer), the comparison of a pack rule with it, and the evidence
// that stores the comparison (Ruling R29). Synthetic fixtures only: invented features, described in this test's own words.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  READING_TRIGGERS, compareWithReading, currentReading, engineComparison, engineReading, readingEvidence, readingProblems,
  textLayerInput
} from "../../tools/pipeline/engine-reading.mjs";
import { loadCore } from "../../tools/pipeline/core.mjs";
import { ruleFingerprint, saveBook, validateRecord } from "../../tools/pipeline/registry.mjs";
import { dataFingerprint } from "../../tools/pipeline/dumps.mjs";
import { readingOfRecord } from "../../tools/pipeline/cli.mjs";
import { gateUnique, rebindingClashes, runGates } from "../../tools/pipeline/gates.mjs";
import { HINTS, engineReadingPrepass } from "../../tools/pipeline/triage.mjs";

const SAVE = "Sv00Sv11Sv22Sv33";
const HIT = "At00At11At22At33";
const FX = "Fx00Fx11Fx22Fx33";

// An invented embedded item of an actor dump, as Foundry stores it (activities keyed by id, effects as an array).
function item({ html, activities = {}, effects = [], type = "feat", name = "Gust Slam", identifier = "gust-slam" } = {}) {
  return { _id: "mmGustSlam000000", name, type, system: { identifier, description: { value: html }, activities },
    effects, flags: {} };
}
const saveActivity = (effects = [FX]) => ({ [SAVE]: { _id: SAVE, type: "save", name: "", activation: { type: "action",
  condition: "" }, effects: effects.map((_id) => ({ _id })), damage: { onSave: "half", parts: [] },
  range: { value: "5", units: "ft", special: "" }, target: { template: { type: "", size: "" },
    affects: { type: "creature", count: "1", special: "" } } } });
const proneEffect = { _id: FX, name: "Prone", statuses: ["prone"], system: { changes: [] }, transfer: false };

// Each sentence below is this test's own: a save whose failure pushes a creature of a given size or smaller and knocks it
// down; a hold the target may shake off at the end of each of its turns; a feature that says nothing the engine reads.
const PUSH = "<p>Strength Saving Throw: DC 12, one creature within 5 feet. Failure: 7 Bludgeoning damage. If the target is"
  + " Medium or smaller, it is pushed 10 feet straight away from the gust and has the Prone condition.</p>";
const HOLD = "<p>Wisdom Saving Throw: DC 11, one creature. Failure: The target has the Prone condition. The target repeats"
  + " the save at the end of each of its turns, ending the effect on itself on a success.</p>";
const NOTHING = "<p>The creature hums a tune nobody remembers.</p>";

describe("textLayerInput: the arguments the engine's adapter builds from an item (adapter/content.mjs textLayer)", () => {
  it("takes the description, the activities as the data writes them and the effects' statuses and changes", () => {
    const input = textLayerInput(item({ html: PUSH, activities: saveActivity(), effects: [proneEffect] }),
      { identifier: "tst-gust-slam", swallow: false });
    expect(input.html).toBe(PUSH);
    expect(input.identifier).toBe("tst-gust-slam");
    expect(input.swallow).toBe(false);
    expect(input.effects).toEqual([{ id: FX, statuses: ["prone"], changes: [] }]);
    expect(input.activities).toEqual([{ id: SAVE, name: "", type: "save", activation: { type: "action", condition: "" },
      effects: [FX], onSave: "half", range: { value: "5", units: "ft", special: "" }, template: false,
      target: { type: "creature", count: "1", special: "" } }]);
  });

  it("prefers the original English description a translation keeps, and a template when the data has one", () => {
    const doc = item({ html: "<p>Traduit.</p>", activities: saveActivity() });
    doc.flags = { babele: { originalPayload: { description: NOTHING } } };
    doc.system.activities[SAVE].target.template = { type: "cone", size: "15", units: "ft", count: "" };
    const input = textLayerInput(doc, { identifier: "x" });
    expect(input.html).toBe(NOTHING);
    expect(input.activities[0].template).toEqual({ type: "cone", size: "15", units: "ft", count: "" });
  });
});

describe("engineReading with a stand-in engine", () => {
  const calls = [];
  const core = { version: "9.9.9", monsterTextLayer: (input) => (calls.push(input), { breaksOn: ["attack"] }),
    mergeEntries: (layers) => Object.assign({}, ...layers.filter(Boolean)), shipped: {}, sources: {} };

  it("calls the engine's own function and returns what it returns", () => {
    calls.length = 0;
    const reading = engineReading(item({ html: PUSH, activities: saveActivity(), effects: [proneEffect] }), core,
      { identifier: "tst-gust-slam" });
    expect(reading).toEqual({ breaksOn: ["attack"] });
    expect(calls).toHaveLength(1);
    expect(calls[0].identifier).toBe("tst-gust-slam");
  });

  it("reads nothing for a spell, for an item of a character and for an item without a description", () => {
    calls.length = 0;
    expect(engineReading(item({ html: PUSH, type: "spell" }), core)).toBeNull();
    expect(engineReading(item({ html: PUSH }), core, { actorType: "character" })).toBeNull();
    expect(engineReading(item({ html: "" }), core)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("names the engine's identifier when none is given: a shipped source first, then the item's own", () => {
    calls.length = 0;
    engineReading(item({ html: PUSH }), { ...core, sources: { "mmActor000000000.mmGustSlam000000": "engine-gust" } },
      { actorId: "mmActor000000000" });
    engineReading(item({ html: PUSH }), core);
    expect(calls.map((c) => c.identifier)).toEqual(["engine-gust", "gust-slam"]);
  });

  it("throws a clear error when the engine does not export the function (too old or too new)", () => {
    expect(() => engineReading(item({ html: PUSH }), { version: "0.1.0" })).toThrow(/monsterTextLayer/);
    expect(() => compareWithReading({ halfOnMiss: true }, null, { version: "0.1.0" })).toThrow(/mergeEntries/);
  });
});

describe("compareWithReading: key by key, as the engine merges a module entry over its text layer", () => {
  const core = { mergeEntries: (layers) => Object.assign({}, ...layers.filter(Boolean)) };
  const push = { on: "failedSave", if: { "target.sizeAtMost": "med" }, do: [{ type: "move", mode: "push", distance: 10 }] };
  const resave = { on: "turnEnd", via: "effect", do: [{ type: "resave" }] };

  it("says same, adds or changes for every key the rule declares, and which keys only the reading has", () => {
    const reading = { triggers: [push], blocksHealing: true, saveDamage: { [SAVE]: "half" } };
    const rule = { saveDamage: { [SAVE]: "half" }, noOpportunity: "afterUse", blocksHealing: false };
    const c = compareWithReading(rule, reading, core);
    expect(c.keys).toEqual({ saveDamage: "same", noOpportunity: "adds", blocksHealing: "changes" });
    expect(c.engineOnly).toEqual(["triggers"]);
    expect(c.triggers).toBe("none");
    expect(c.delta).toEqual(["noOpportunity"]);
    expect(c.held).toEqual(["blocksHealing"]);
  });

  it("calls a trigger list that keeps every trigger of the reading a superset, and delta-emits it whole", () => {
    const c = compareWithReading({ triggers: [resave, push] }, { triggers: [push] }, core);
    expect(c.keys.triggers).toBe("changes");
    expect(c.triggers).toBe("superset");
    expect(c.delta).toEqual(["triggers"]);
    expect(c.held).toEqual([]);
    expect(c.dropped).toEqual([]);
  });

  it("says when a trigger list drops a trigger the engine read, its size condition included", () => {
    const lost = { on: "failedSave", do: [{ type: "move", mode: "push", distance: 10 }] };
    const c = compareWithReading({ triggers: [lost] }, { triggers: [push] }, core);
    expect(c.triggers).toBe("drops");
    expect(c.held).toEqual(["triggers"]);
    expect(c.dropped).toEqual([push]);
  });

  it("reads a single trigger as a list of one, compares regardless of key order, and an empty reading adds all", () => {
    const flipped = { do: push.do, if: push.if, on: push.on };
    const same = compareWithReading({ triggers: flipped }, { triggers: [push] }, core);
    expect(same.keys.triggers).toBe("same");
    expect(same.triggers).toBe("same");
    expect(same.delta).toEqual([]);
    const fresh = compareWithReading({ triggers: [push], halfOnMiss: true }, null, core);
    expect(fresh.keys).toEqual({ triggers: "adds", halfOnMiss: "adds" });
    expect(fresh.triggers).toBe("superset");
    expect(fresh.delta).toEqual(["halfOnMiss", "triggers"]);
  });

  it("gives the merged entry from the engine's own mergeEntries, reading first", () => {
    const seen = [];
    const merging = { mergeEntries: (layers) => (seen.push(layers), { merged: true }) };
    const c = compareWithReading({ halfOnMiss: true }, { blocksHealing: true }, merging);
    expect(c.mergedEntry).toEqual({ merged: true });
    expect(seen).toEqual([[{ blocksHealing: true }, { halfOnMiss: true }]]);
  });

  it("closes the trigger outcomes", () => {
    expect([...READING_TRIGGERS].sort()).toEqual(["drops", "none", "same", "superset"]);
  });
});

// A ruled monster record (synthetic) with a matched official item.
function ruled(entry = { halfOnMiss: true }) {
  return {
    key: "tst:monster:glimmer-drake/action/gust-slam", identifier: "tst-glimmer-drake-gust-slam", name: "Gust Slam",
    kind: "monster", book: "TST", page: 3, edition: "2024", owner: "Glimmer Drake", section: "action",
    text: { sha256: "a".repeat(64), source: "dataset", chars: 10 }, verdict: "entry",
    items: [{ origin: "official", match: "matched", identifier: "gust-slam", docId: "mmGlimmer0000000.mmGustSlam000000",
      activities: [SAVE], effects: [], data: { sha256: "b".repeat(64) } }],
    rule: { handledIn: "table", adds: "x", entry, origins: ["official"],
      assert: [{ given: { roll: "hit" }, expect: { damage: { fraction: 1 } } }] },
    evidence: {}
  };
}

describe("evidence.reading: the comparison stored on the record, bound to the rule and the item", () => {
  const core = { version: "9.9.9", mergeEntries: (layers) => Object.assign({}, ...layers.filter(Boolean)) };
  const AT = "2026-11-22T00:00:00.000Z";

  it("stores the delta, the same and the changed keys and the trigger outcome, with the fingerprints", () => {
    const r = ruled({ halfOnMiss: true, blocksHealing: true, noOpportunity: "afterUse" });
    const c = compareWithReading(r.rule.entry, { blocksHealing: true, noOpportunity: "never" }, core);
    const e = readingEvidence(r, c, { at: AT, core });
    expect(e).toEqual({ at: AT, core: "9.9.9", rule: ruleFingerprint(r.rule), item: "b".repeat(64), delta: ["halfOnMiss"],
      same: ["blocksHealing"], changes: ["noOpportunity"], triggers: "none" });
    expect(readingProblems(e)).toEqual([]);
    r.evidence.reading = e;
    expect(validateRecord(r)).toEqual([]);
    expect(currentReading(r)).toEqual(e);
  });

  it("goes stale when the rule or the item changes, or when it no longer accounts for every key of the rule", () => {
    const r = ruled();
    r.evidence.reading = readingEvidence(r, compareWithReading(r.rule.entry, null, core), { at: AT, core });
    expect(currentReading(r)).not.toBeNull();
    const edited = structuredClone(r);
    edited.rule.entry.blocksHealing = true;
    expect(currentReading(edited)).toBeNull();
    const moved = structuredClone(r);
    moved.items[0].data.sha256 = "c".repeat(64);
    expect(currentReading(moved)).toBeNull();
    const forged = structuredClone(r);
    forged.evidence.reading.delta = [];
    forged.evidence.reading.same = ["halfOnMiss"];
    expect(currentReading(forged)).not.toBeNull();
    forged.evidence.reading.same = [];
    expect(currentReading(forged)).toBeNull();
    expect(currentReading(ruled())).toBeNull();
  });

  it("refuses another shape: an unknown field, a key that is no entry key, a key in two lists, a wrong outcome", () => {
    const good = { at: AT, core: "9.9.9", rule: "d".repeat(64), item: "b".repeat(64), delta: ["halfOnMiss"], same: [],
      changes: [], triggers: "none" };
    expect(readingProblems(good)).toEqual([]);
    expect(readingProblems({ ...good, note: "a sentence" })).not.toEqual([]);
    expect(readingProblems({ ...good, delta: ["half on miss"] })).not.toEqual([]);
    expect(readingProblems({ ...good, same: ["halfOnMiss"] })).not.toEqual([]);
    expect(readingProblems({ ...good, triggers: "maybe" })).not.toEqual([]);
    expect(readingProblems({ ...good, rule: "short" })).not.toEqual([]);
    expect(readingProblems({ ...good, delta: ["triggers"], triggers: "drops" })).not.toEqual([]);
    expect(readingProblems({ ...good, changes: ["triggers"], triggers: "superset" })).not.toEqual([]);
    expect(readingProblems(null)).not.toEqual([]);
    const r = ruled();
    r.evidence.reading = { ...good, extra: 1 };
    expect(validateRecord(r).join(" ")).toMatch(/evidence\.reading/);
  });
});

describe("npm run gates writes evidence.reading (runGates with a readingOf of the dumps and DAS_CORE)", () => {
  const stub = { version: "9.9.9", facts: [], vocabulary: new Set(), validateEntry: () => [], getPath: () => undefined,
    matchesFrom: () => true };
  const AT = "2026-11-22T00:00:00.000Z";
  const evidenceOf = (r, at = AT) => readingEvidence(r, compareWithReading(r.rule.entry, null, { mergeEntries: () => null }),
    { at, core: stub });

  it("stores the comparison on a ruled monster record, keeps its date while it says the same, removes it when unread", () => {
    const dir = mkdtempSync(join(tmpdir(), "reading-"));
    try {
      const context = (readingOf, ci = false) => ({ core: stub, documents: {}, textDir: dir, ci, legacy: new Map(), readingOf });
      const r = ruled();
      const first = runGates([r], context((x) => evidenceOf(x))).updated[0];
      expect(first.evidence.reading).toEqual(evidenceOf(r));
      const again = runGates([first], context((x) => evidenceOf(x, "2026-12-01T00:00:00.000Z"))).updated[0];
      expect(again.evidence.reading.at).toBe(AT);
      expect(runGates([first], context(() => null)).updated[0].evidence.reading).toBeUndefined();
      expect(runGates([first], context(() => null, true)).updated[0].evidence.reading).toEqual(first.evidence.reading);
      const spell = { ...ruled(), kind: "spell", key: "tst:spell:gust-slam" };
      expect(runGates([spell], context((x) => evidenceOf(x))).updated[0].evidence.reading).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("triage --engine-reading: a hint on the monster entry records the engine already reads something of", () => {
  // An unruled monster record (synthetic) with the verdict a reader gave.
  const open = (n, over = {}) => {
    const { rule, ...r } = ruled();
    return { ...r, key: `tst:monster:glimmer-drake/action/feature-${n}`, name: `Feature ${n}`,
      evidence: { triaged: { by: "reader-1", at: "2026-11-21T00:00:00.000Z", confidence: 0.8 } }, ...over };
  };
  const readings = { "feature-1": { breaksOn: ["attack"] }, "feature-2": null, "feature-3": undefined };
  const readingOf = (r) => readings[r.key.split("/").at(-1)];

  it("hints engine-reads (no verdict change), lists the records read, unread and without a document", () => {
    expect(HINTS).toContain("engine-reads");
    const records = [open(1), open(2), open(3), open(4, { verdict: "core" }), { ...ruled(), key: "tst:monster:x/action/y" },
      open(5, { kind: "feature", key: "tst:feature:feature-5" }), open(6)];
    readings["feature-6"] = { blocksHealing: true };
    const out = engineReadingPrepass(records, { readingOf, queued: new Set([records[6].key]) });
    expect(out.hinted.map((h) => h.key)).toEqual([records[0].key]);
    expect(out.hinted[0].keys).toEqual(["breaksOn"]);
    expect(out.none).toEqual([records[1].key]);
    expect(out.unread).toEqual([records[2].key]);
    expect(out.ruled).toEqual([records[4].key]);
    expect(out.records[0].hint).toBe("engine-reads");
    expect(out.records[0].verdict).toBe("entry");
    expect(out.records[0].evidence).toEqual(records[0].evidence);
    expect(out.records.slice(1)).toEqual(records.slice(1));
    for (const r of out.records) expect(validateRecord(r)).toEqual([]);
  });

  it("takes the hint away when the engine no longer reads anything, and changes nothing when run again", () => {
    const hinted = open(2, { hint: "engine-reads" });
    const out = engineReadingPrepass([hinted], { readingOf, queued: new Set() });
    expect(out.records[0].hint).toBeUndefined();
    expect(out.cleared).toEqual([hinted.key]);
    const once = engineReadingPrepass([open(1)], { readingOf, queued: new Set() }).records;
    expect(engineReadingPrepass(once, { readingOf, queued: new Set() }).records).toEqual(once);
  });
});

const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/monster-layer.mjs"))
  ? process.env.DAS_CORE : null;

describe.skipIf(!CORE_DIR)("the engine's reading, computed by the DAS_CORE clone's own function", () => {
  it("reads a size-limited push on a failed save as a trigger with a size condition", async () => {
    const core = await loadCore(CORE_DIR);
    const reading = engineReading(item({ html: PUSH, activities: saveActivity(), effects: [proneEffect] }), core,
      { identifier: "tst-gust-slam" });
    expect(reading).not.toBeNull();
    expect(Array.isArray(reading.triggers)).toBe(true);
    const sized = reading.triggers.filter((t) => t.on === "failedSave" && t.if && "target.sizeAtMost" in t.if);
    expect(sized.length).toBeGreaterThan(0);
    expect(sized[0].do.some((s) => s.type === "move")).toBe(true);
  });

  it("reads a save repeated at the end of each turn as a trigger, and nothing from a feature that says nothing", async () => {
    const core = await loadCore(CORE_DIR);
    const hold = engineReading(item({ html: HOLD, activities: saveActivity(), effects: [proneEffect] }), core,
      { identifier: "tst-hold" });
    expect(hold?.triggers?.some((t) => t.do?.some((s) => s.type === "resave"))).toBe(true);
    expect(engineReading(item({ html: NOTHING, activities: saveActivity([]) }), core, { identifier: "tst-x" })).toBeNull();
  });

  it("merges with the engine's mergeEntries: a delta gives the engine the same entry as the whole rule", async () => {
    const core = await loadCore(CORE_DIR);
    const reading = engineReading(item({ html: PUSH, activities: saveActivity(), effects: [proneEffect] }), core,
      { identifier: "tst-gust-slam" });
    const rule = { ...reading, halfOnMiss: true };
    const c = compareWithReading(rule, reading, core);
    expect(c.delta).toEqual(["halfOnMiss"]);
    const delta = Object.fromEntries(c.delta.map((k) => [k, rule[k]]));
    expect(core.mergeEntries([reading, delta])).toEqual(c.mergedEntry);
  });
});

// On the command line, with the real engine: an invented creature of an actor dump of the 2024 Monster Manual's package
// (docs/foundry-modules.json maps XMM to it), in a registry and a dumps folder of the test's own.
describe.skipIf(!CORE_DIR)("the engine's reading on the command line and in the gates", () => {
  let tmp, registry, dumps, env;
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  const ACTOR = "tstGlimmerDrake0";
  const docs = {
    push: item({ html: PUSH, activities: saveActivity(), effects: [proneEffect] }),
    quiet: { ...item({ html: NOTHING, activities: saveActivity([]) }), _id: "mmQuietHum000000", name: "Quiet Hum" }
  };
  const monster = (doc, verdict) => ({
    key: `xmm:monster:glimmer-drake/action/${doc.name.toLowerCase().replace(/ /g, "-")}`, name: doc.name, kind: "monster",
    book: "XMM", page: 3, edition: "2024", owner: "Glimmer Drake", section: "action",
    text: { sha256: (verdict ? "a" : "f").repeat(64), source: "5etools", chars: 10 }, verdict,
    items: [{ origin: "official", match: "matched", identifier: doc.system.identifier, docId: `${ACTOR}.${doc._id}`,
      activities: Object.keys(doc.system.activities), effects: doc.effects.map((e) => e._id),
      data: { sha256: dataFingerprint(doc) } }],
    evidence: verdict ? { triaged: { by: "reader-1", at: "2026-11-21T00:00:00.000Z", confidence: 0.8 } } : {}
  });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "reading-cli-"));
    registry = join(tmp, "registry");
    dumps = join(tmp, "dumps");
    mkdirSync(dumps);
    writeFileSync(join(dumps, "dnd-monster-manual.actors.json"), JSON.stringify([
      { _id: ACTOR, name: "Glimmer Drake", type: "npc", system: {}, items: [docs.push, docs.quiet] }]));
    env = { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_DUMPS: dumps, DAS_CORE: CORE_DIR };
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("triage --engine-reading hints the record the engine reads, not the other, and reports both", () => {
    saveBook(registry, { book: "XMM", records: [monster(docs.push, "entry"), monster(docs.quiet, "entry")] });
    const report = join(tmp, "reading.json");
    const r = cli(["triage", "XMM", "--engine-reading", "--report", report]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/engine reads something: 1/);
    expect(r.stdout).toMatch(/engine reads nothing: 1/);
    const records = JSON.parse(readFileSync(join(registry, "xmm.json"), "utf8")).records;
    expect(records.map((x) => x.hint ?? null)).toEqual(["engine-reads", null]);
    expect(records.map((x) => x.verdict)).toEqual(["entry", "entry"]);
    const written = JSON.parse(readFileSync(report, "utf8"));
    expect(written.hinted[0].keys).toContain("triggers");
    expect(cli(["triage", "XMM", "--engine-reading", "--core-prepass"]).status).toBe(2);
  });

  it("batch triage --structure gives a monster feature's engineReads, and null when the engine reads nothing", () => {
    saveBook(registry, { book: "XMM", records: [monster(docs.push, null), monster(docs.quiet, null)] });
    const out = join(tmp, "out");
    const structure = join(tmp, "private");
    const r = cli(["batch", "triage", "XMM", "--out", out, "--structure", structure]);
    expect(r.status, r.stderr).toBe(0);
    const [file] = readdirSync(structure);
    const { entries } = JSON.parse(readFileSync(join(structure, file), "utf8"));
    const [pushed, quiet] = Object.values(entries).map((e) => e.official.engineReads);
    expect(pushed.triggers.some((t) => t.if && "target.sizeAtMost" in t.if)).toBe(true);
    expect(quiet).toBeNull();
  });

  it("the gates' comparison of a ruled record: the stored delta keeps what the engine does not read", async () => {
    const core = await loadCore(CORE_DIR);
    const r = { ...monster(docs.push, "entry"), identifier: "xmm-glimmer-drake-gust-slam",
      rule: { handledIn: "table", adds: "x", entry: { halfOnMiss: true }, origins: ["official"], assert: [] } };
    const e = readingOfRecord(r, { official: { [r.items[0].docId]: docs.push } }, core);
    expect(e).toMatchObject({ core: core.version, delta: ["halfOnMiss"], same: [], changes: [], triggers: "none" });
    expect(readingOfRecord(r, { official: {} }, core)).toBeNull();
  });
});

// Fix round 1 (Ruling R29, amended): a monster rule binds its item to a creature-scoped identifier through `sources`. The
// engine then knows the item by that identifier: its shipped entry under the item's original identifier no longer applies,
// and its text layer is read under the new identifier. What the engine ends with WITHOUT the pack (`before`) is compared
// with what it ends with WITH it (`after`), whatever the rule declares.
describe("engineComparison: before (original identifier, shipped entry) and after (the pack's identifier, delta + carried)", () => {
  const merging = { version: "9.9.9", mergeEntries: (layers) => Object.assign({}, ...layers.filter(Boolean)),
    runtimeIdentifiers: new Map(), systemHandled: new Map(), sources: {} };
  const own = (id) => [{ on: "preAttackRoll", if: { "activity.identifier": id }, do: [{ type: "advantage" }] }];
  const read = (input) => (input.html === NOTHING ? null
    : { breaksOn: ["attack"], ...(input.identifier ? { triggers: own(input.identifier) } : {}) });
  const core = (shipped = {}, over = {}) => ({ ...merging, monsterTextLayer: read, shipped, ...over });
  const doc = () => item({ html: PUSH, activities: saveActivity(), effects: [proneEffect] });
  const rec = (entry = { halfOnMiss: true }) => ({ ...ruled(entry), identifier: "tst-glimmer-drake-gust-slam" });

  it("carries over a shipped key the rebinding would drop, and the after entry keeps every key of before", () => {
    const c = engineComparison(doc(), rec(), core({ "gust-slam": { magical: true } }));
    expect(c.original).toBe("gust-slam");
    expect(c.before.magical).toBe(true);
    expect(c.comparison.delta).toEqual(["halfOnMiss"]);
    expect(c.carried).toEqual(["magical"]);
    expect(c.dropped).toEqual([]);
    expect(c.code).toBe(false);
    expect(c.after).toMatchObject({ magical: true, halfOnMiss: true, breaksOn: ["attack"] });
  });

  it("reads a text-layer trigger naming the identifier under the new one: no loss, nothing carried", () => {
    const c = engineComparison(doc(), rec(), core());
    expect(c.before.triggers[0].if["activity.identifier"]).toBe("gust-slam");
    expect(c.after.triggers[0].if["activity.identifier"]).toBe("tst-glimmer-drake-gust-slam");
    expect(c.carried).toEqual([]);
    expect(c.dropped).toEqual([]);
  });

  it("compares the rule with before: a key the shipped entry already has the same is no delta", () => {
    const c = engineComparison(doc(), rec({ magical: true }), core({ "gust-slam": { magical: true } }));
    expect(c.comparison.same).toEqual(["magical"]);
    expect(c.comparison.delta).toEqual([]);
  });

  it("drops (cannot carry) a shipped key whose value names the original identifier, or an identifier handled in code", () => {
    const named = core({ "gust-slam": { effectChanges: { "source.hasFeature": "gust-slam" } } });
    expect(engineComparison(doc(), rec(), named).dropped).toEqual(["effectChanges"]);
    const inCode = engineComparison(doc(), rec(), core({}, { runtimeIdentifiers: new Map([["gust-slam", []]]) }));
    expect(inCode.code).toBe(true);
  });

  it("loses nothing under the item's own identifier (no rebinding): the engine merges its entry with the pack's", () => {
    const own = { ...rec(), identifier: "gust-slam" };
    const c = engineComparison(doc(), own, core({ "gust-slam": { magical: true } }));
    expect(c.carried).toEqual([]);
    expect(c.dropped).toEqual([]);
    expect(c.after).toMatchObject({ magical: true, halfOnMiss: true });
  });

  it("stores original, carried and dropped in evidence.reading (closed shape), and the older shape still validates", () => {
    const r = rec();
    const c = engineComparison(doc(), r, core({ "gust-slam": { magical: true } }));
    const e = readingEvidence(r, c, { at: "2026-11-22T00:00:00.000Z", core: merging });
    expect(e).toMatchObject({ original: "gust-slam", carried: ["magical"], dropped: [], delta: ["halfOnMiss"] });
    expect(readingProblems(e)).toEqual([]);
    expect(readingProblems({ ...e, carried: ["magical"], dropped: ["magical"] })).not.toEqual([]);
    expect(readingProblems({ ...e, original: "Not An Id" })).not.toEqual([]);
    expect(readingProblems({ ...e, code: "yes" })).not.toEqual([]);
    const { original, carried, dropped, ...older } = e;
    expect(readingProblems(older)).toEqual([]);
  });
});

describe.skipIf(!CORE_DIR)("rebinding with the real engine (synthetic shipped entry)", () => {
  it("before has the shipped key, after without carrying lacks it: it is carried; one naming the identifier holds", async () => {
    const real = await loadCore(CORE_DIR);
    const doc = item({ html: PUSH, activities: saveActivity(), effects: [proneEffect], identifier: "tst-invented-x" });
    const r = { ...ruled({ halfOnMiss: true }), identifier: "tst-glimmer-drake-gust-slam" };
    const c = engineComparison(doc, r, { ...real, shipped: { "tst-invented-x": { magical: true } } });
    expect(c.before.magical).toBe(true);
    expect(real.mergeEntries([engineReading(doc, real, { identifier: r.identifier }), { halfOnMiss: true }]).magical)
      .toBeUndefined();
    expect(c.carried).toEqual(["magical"]);
    expect(c.after.magical).toBe(true);
    const held = engineComparison(doc, r, { ...real,
      shipped: { "tst-invented-x": { effectChanges: { "source.hasFeature": "tst-invented-x" } } } });
    expect(held.dropped).toEqual(["effectChanges"]);
  });
});

// Fix round 1, step 3: a rule registered under the item's OWN identifier (or an alias equal to it) rebinds nothing: the
// engine merges the pack's entry over its own key by key (content/index.mjs rebuild: mergeEntries([CONTENT[id], entry])).
// Only `sources` can bind an item to another identifier; for a rule that is not a monster feature's, binding an item whose
// own identifier is one the engine handles would drop the engine's entry for it, so the unique gate refuses it.
describe("rebinding outside monster features (the unique gate)", () => {
  const spell = (over = {}) => ({
    key: "tst:spell:glimmer-ring", identifier: "glimmer-ring", name: "Glimmer Ring", kind: "spell", book: "TST", page: 3,
    edition: "2024", text: null, verdict: "entry", evidence: {},
    items: [{ origin: "official", match: "matched", identifier: "glimmer-ring", docId: "Of00Of11Of22Of33", activities: [],
      effects: [], data: { sha256: "b".repeat(64) } }],
    rule: { handledIn: "table", adds: "x", entry: { halfOnMiss: true }, origins: ["official"], assert: [] }, ...over
  });

  it("finds nothing for a rule under the item's own identifier, nor for monster features (their reading decides)", () => {
    expect(rebindingClashes([spell()], new Set(["glimmer-ring"]))).toEqual([]);
    const monsterRecord = { ...spell({ kind: "monster", identifier: "tst-x-glimmer-ring", sources: { Of00Of11Of22Of33:
      "tst-x-glimmer-ring" } }) };
    expect(rebindingClashes([monsterRecord], new Set(["glimmer-ring"]))).toEqual([]);
  });

  it("refuses sources that bind an item of an engine identifier to another identifier", () => {
    const r = spell({ identifier: "tst-glimmer-ring", sources: { Of00Of11Of22Of33: "tst-glimmer-ring" } });
    const [[record, message]] = rebindingClashes([r], new Set(["glimmer-ring"]));
    expect(record.key).toBe(r.key);
    expect(message).toMatch(/glimmer-ring/);
    expect(rebindingClashes([r], new Set())).toEqual([]);
    expect(gateUnique([r], { core: { identifiers: new Set(["glimmer-ring"]) } }).join(" ")).toMatch(/rebinds/);
  });
});

describe.skipIf(!CORE_DIR)("the engine's own merge of a pack entry under an identifier it ships", () => {
  it("keeps every shipped key the pack does not declare", async () => {
    const real = await loadCore(CORE_DIR);
    const [id, shipped] = Object.entries(real.shipped).find(([, e]) => Object.keys(e).length >= 1);
    const merged = real.mergeEntries([shipped, { halfOnMiss: true }]);
    for (const key of Object.keys(shipped)) if (key !== "halfOnMiss") expect(merged[key], id).toEqual(shipped[key]);
  });
});
