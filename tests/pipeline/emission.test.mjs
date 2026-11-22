// Ruling R27: a rule is emitted (registered with DAS · Core) only when it is uncontested. Synthetic fixtures only.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  emittedFingerprint, gatedItems, legacyFingerprint, ruleFingerprint, saveBook, saveQueue, stateOf
} from "../../tools/pipeline/registry.mjs";
import {
  HELD_REASONS, bookModuleSource, emissionOf, generate, recordFromRule, ruleFromRecord, shippedHeld, sourcesOf
} from "../../tools/pipeline/generate.mjs";
import { normaliseAssert } from "../../tools/pipeline/assert.mjs";
import { compareWithReading, readingEvidence } from "../../tools/pipeline/engine-reading.mjs";
import { heldRules } from "../../tools/books-progress.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const ACT = "Ac00Ac11Ac22Ac33";
const DOC = "Of00Of11Of22Of33";
const AT = "2026-11-22T00:00:00.000Z";
const ASSERT = [{ given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } }];
const OTHER = [{ given: { roll: "savedSave" }, expect: { damage: { fraction: 0 } } }];
const CANON = normaliseAssert(ASSERT);
const CANON_OTHER = normaliseAssert(OTHER);

// The gate evidence of a record as it is (after any change to what `emits` covers).
function regate(record) {
  record.evidence.gates = { at: AT, core: "1.0.0", rule: ruleFingerprint(record.rule), emits: emittedFingerprint(record),
    passed: ["schema", "validator", "ids", "fixes", "text", "unique"], items: gatedItems(record) };
  return record;
}
// A gated rule, never reviewed. `stamp`: the draft's "goes to a person" reason (Ruling R15), when it has one.
function gated(name, { stamp } = {}) {
  const id = name.toLowerCase();
  const record = {
    key: `tst:spell:${id}`, identifier: id, name, kind: "spell", book: "TST", page: 3, edition: "2024",
    text: { sha256: "a".repeat(64), source: "dataset", chars: 10 }, verdict: "entry",
    items: [{ origin: "official", match: "matched", identifier: id, docId: DOC, activities: [ACT], effects: [],
      data: { sha256: "b".repeat(64) } }],
    rule: { handledIn: "table", adds: "x", entry: { saveDamage: { [ACT]: "half" } }, origins: ["official"], assert: ASSERT },
    evidence: {}
  };
  if (stamp) {
    record.evidence.drafted = { by: "drafter-1", at: AT, core: "1.0.0", rule: ruleFingerprint(record.rule), person: true,
      because: stamp };
  }
  return regate(record);
}
const fp = (record) => ruleFingerprint(record.rule);
const agreed = (record, extra = {}) => {
  record.evidence.reviewed = { by: "reviewer-1", at: AT, agrees: true, rule: fp(record), confidence: 0.9, ...extra };
  return regate(record);
};
// A review-queue entry as review.mjs stores it, about the rule as it is unless `rule` says otherwise.
const queued = (record, reason, { review = {}, confidence = 0.9, rule = fp(record) } = {}) => ({
  key: record.key, reason, by: "reviewer-1", why: "One line.", confidence,
  draft: { by: "drafter-1", rule, assert: ASSERT, implied: [] },
  review: { rule, assert: ASSERT, agrees: true, onlyDraft: [], onlyReview: [], baseline: [], detail: [], ...review }
});
const disagreeing = { agrees: false, onlyDraft: CANON, onlyReview: CANON_OTHER, assert: OTHER };

describe("emissionOf (Ruling R27): one function decides what is registered with the engine", () => {
  it("closes the reasons a rule is held, each with its label", () => {
    expect(Object.keys(HELD_REASONS).sort()).toEqual(
      ["disagreement", "engine-already", "engine-changes", "engine-rebinding", "engine-text", "free-text", "low-confidence",
        "not-reviewed", "queued", "review-stale", "unexpressed"]);
    expect(HELD_REASONS["engine-rebinding"]).toBe("its identifier would drop engine behaviour");
    expect(HELD_REASONS["engine-changes"]).toBe("changes the engine's reading: a person decides");
    expect(HELD_REASONS["engine-already"]).toBe("the engine already does it");
    expect(HELD_REASONS["not-reviewed"]).toBe("not reviewed yet");
    expect(HELD_REASONS.disagreement).toBe("review disagrees");
    expect(HELD_REASONS["low-confidence"]).toBe("reviewer unsure");
    expect(Object.isFrozen(HELD_REASONS)).toBe(true);
  });

  it("holds a monster rule with no stored reading, even a reviewed one: the engine reads its text (Rulings R28, R29)", () => {
    const r = gated("Glimmer");
    r.kind = "monster";
    r.evidence.reviewed = { by: "reviewer-1", at: "2026-11-22", agrees: true, rule: r.evidence.gates.rule, confidence: 0.9 };
    expect(emissionOf(r, { queue: [] })).toEqual({ emitted: false, because: "engine-text" });
    expect(ruleFromRecord(r, { legacy: new Map(), queue: [] })).toBeNull();
    expect(emissionOf(r, { queue: [], monsterRules: true })?.emitted).not.toBe(false);
  });

  it("holds a rule merely gated and never reviewed", () => {
    const r = gated("Glimmer");
    expect(stateOf(r)).toBe("gated");
    expect(emissionOf(r, { queue: [] })).toEqual({ emitted: false, because: "not-reviewed" });
    expect(ruleFromRecord(r, { queue: [] })).toBeNull();
    expect(bookModuleSource("TST", [r], undefined, { queue: [] })).toBeNull();
  });

  it("emits a rule whose current review agrees: an agent's, exact or tolerated, or an owner's review-accept", () => {
    const exact = agreed(gated("Glimmer"));
    expect(emissionOf(exact, { queue: [] })).toEqual({ emitted: true, because: "reviewed" });
    expect(ruleFromRecord(exact, { queue: [] }).status).toBe("validated");
    const tolerated = agreed(gated("Glimmer"), { tolerated: { baseline: [], detail: [[CANON[0], CANON[0]]] } });
    expect(emissionOf(tolerated, { queue: [] }).emitted).toBe(true);
    const accepted = agreed(gated("Glimmer"), { by: "owner", confidence: 1, because: "Checked against the book." });
    expect(emissionOf(accepted, { queue: [] })).toEqual({ emitted: true, because: "reviewed" });
    // A review of an older rule does not count: the rule is gated again, and held.
    const stale = agreed(gated("Glimmer"), { rule: "c".repeat(64) });
    expect(emissionOf(stale, { queue: [] })).toEqual({ emitted: false, because: "not-reviewed" });
    // A review that says it does not agree, about the rule as it is.
    const refused = agreed(gated("Glimmer"), { agrees: false });
    expect(emissionOf(refused, { queue: [] })).toEqual({ emitted: false, because: "disagreement" });
  });

  it("holds a rule queued as disagreement, low-confidence, free-text or unexpressed", () => {
    const r = gated("Glimmer");
    const cases = [
      [queued(r, "disagreement", { review: disagreeing }), "disagreement"],
      [queued(r, "low-confidence", { confidence: 0.6 }), "low-confidence"],
      [queued(r, "free-text", { review: { agrees: false } }), "free-text"],
      [queued(r, "unexpressed", { review: { agrees: false, assert: [], onlyDraft: CANON } }), "unexpressed"]
    ];
    for (const [entry, because] of cases) {
      expect(emissionOf(r, { queue: [entry] }), because).toEqual({ emitted: false, because });
      expect(ruleFromRecord(r, { queue: [entry] }), because).toBeNull();
    }
    // Even when the stored comparison happens to agree: the queue reason is the reviewer's own doubt.
    expect(emissionOf(r, { queue: [queued(r, "low-confidence", { confidence: 0.5 })] }).emitted).toBe(false);
  });

  it("emits a rule queued only by its own stamp when the review agreed with it", () => {
    for (const stamp of ["effectDurations", "noReactions", "official-uncovered"]) {
      const r = gated("Glimmer", { stamp });
      const entry = queued(r, stamp);
      expect(emissionOf(r, { queue: [entry] }), stamp).toEqual({ emitted: true, because: "stamp-agreed" });
      expect(ruleFromRecord(r, { queue: [entry] }).status).toBe("validated");
      expect(ruleFromRecord(r, { queue: new Map([[r.key, entry]]) }).status).toBe("validated");
    }
  });

  it("holds a stamped rule whose review did not agree, was unsure, or cannot be read, failing closed", () => {
    const r = gated("Glimmer", { stamp: "effectDurations" });
    const held = (entry) => emissionOf(r, { queue: [entry] });
    expect(held(queued(r, "effectDurations", { review: disagreeing }))).toEqual({ emitted: false, because: "disagreement" });
    expect(held(queued(r, "effectDurations", { review: { agrees: false, onlyReview: CANON_OTHER } })).because)
      .toBe("disagreement");
    expect(held(queued(r, "effectDurations", { review: { agrees: false } })).because).toBe("free-text");
    expect(held(queued(r, "effectDurations", { confidence: 0.69 })).because).toBe("low-confidence");
    expect(held(queued(r, "effectDurations", { review: { agrees: false, assert: [], onlyDraft: CANON } })).because)
      .toBe("unexpressed");
    // `agrees: true` beside a non-empty difference is no agreement.
    expect(held(queued(r, "effectDurations", { review: { onlyDraft: CANON } })).because).toBe("disagreement");
    // A field the comparison should hold is absent or of another type: held.
    for (const drop of ["agrees", "onlyDraft", "onlyReview", "assert"]) {
      const entry = queued(r, "effectDurations");
      delete entry.review[drop];
      expect(held(entry).emitted, drop).toBe(false);
    }
    const truthy = queued(r, "effectDurations", { review: { agrees: "true" } });
    expect(held(truthy).emitted).toBe(false);
    const noConfidence = queued(r, "effectDurations");
    delete noConfidence.confidence;
    expect(held(noConfidence).emitted).toBe(false);
    // The queue reason must be the record's own stamp: another stamp, or a record with no stamp, is held.
    expect(held(queued(r, "actionEnds")).emitted).toBe(false);
    const unstamped = gated("Glimmer");
    expect(emissionOf(unstamped, { queue: [queued(unstamped, "effectDurations")] }).emitted).toBe(false);
    expect(emissionOf(unstamped, { queue: [queued(unstamped, "other-reason")] })).toEqual({ emitted: false, because: "queued" });
    // Without the queue nothing can be checked: held.
    expect(emissionOf(r)).toEqual({ emitted: false, because: "not-reviewed" });
    expect(ruleFromRecord(r)).toBeNull();
  });

  it("holds a rule whose queue entry is about an older rule and that has no current agreement", () => {
    const r = gated("Glimmer", { stamp: "effectDurations" });
    const old = queued(r, "effectDurations", { rule: "c".repeat(64) });
    expect(emissionOf(r, { queue: [old] })).toEqual({ emitted: false, because: "review-stale" });
    const disputed = gated("Glimmer");
    expect(emissionOf(disputed, { queue: [queued(disputed, "disagreement", { rule: "c".repeat(64) })] }).because)
      .toBe("review-stale");
    // A current agreement stands whatever an old entry said.
    expect(emissionOf(agreed(gated("Glimmer")), { queue: [old] })).toEqual({ emitted: true, because: "reviewed" });
  });

  it("leaves legacy rules as they were: emitted through standing, whatever their state or the queue", () => {
    const r = recordFromRule({ book: "TST", identifier: "moth-ward", name: "Moth Ward", page: 14, kind: "feature",
      status: "validated", handledIn: "table", adds: "Wards moths.", entry: { triggers: [] } });
    const legacy = new Map([[r.key, legacyFingerprint(r)]]);
    expect(stateOf(r)).toBe("drafted");
    expect(emissionOf(r, { legacy, queue: [] })).toEqual({ emitted: true, because: "legacy" });
    expect(ruleFromRecord(r, { legacy, queue: [{ key: r.key, reason: "disagreement" }] }).status).toBe("validated");
    // Without standing it is not a candidate at all (generate refuses it).
    expect(emissionOf(r, { legacy: new Map(), queue: [] })).toBeNull();
  });

  it("says nothing of a record that cannot be emitted whatever its review: no rule, not gated, another verdict", () => {
    const r = gated("Glimmer");
    expect(emissionOf({ ...r, rule: undefined })).toBeNull();
    expect(emissionOf({ ...r, verdict: "core" })).toBeNull();
    const drafted = { ...r, rule: { ...r.rule, adds: "edited" } };
    expect(stateOf(drafted)).toBe("drafted");
    expect(emissionOf(drafted, { queue: [] })).toBeNull();
  });

  it("binds no source for a held rule", () => {
    const held = gated("Glimmer");
    held.sources = { [DOC]: "glimmer" };
    regate(held);
    expect(sourcesOf([held], { queue: [] })).toEqual({});
    agreed(held);
    expect(sourcesOf([held], { queue: [] })).toEqual({ [DOC]: "glimmer" });
  });
});

describe("generate and the gates with held rules", () => {
  let dir, registry, out;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "emission-"));
    registry = join(dir, "registry");
    out = join(dir, "rules");
    mkdirSync(join(out, "books"), { recursive: true });
    copyFileSync(join(ROOT, "scripts/rules/book.mjs"), join(out, "book.mjs"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // Four rules: one reviewed, one stamped and agreed, one disputed, one never reviewed. Distinct items (one docId each).
  const records = () => {
    const mk = (name, opts) => {
      const r = gated(name, opts);
      r.items[0].docId = `${name.slice(0, 4)}0000000000AB`.slice(0, 16);
      return regate(r);
    };
    const reviewed = agreed(mk("Aaaa"));
    const stamped = mk("Bbbb", { stamp: "effectDurations" });
    const disputed = mk("Cccc");
    const fresh = mk("Dddd");
    return { reviewed, stamped, disputed, fresh,
      queue: [queued(stamped, "effectDurations"), queued(disputed, "disagreement", { review: disagreeing })] };
  };
  const write = ({ reviewed, stamped, disputed, fresh, queue }) => {
    saveBook(registry, { book: "TST", records: [reviewed, stamped, disputed, fresh] });
    saveQueue(registry, "review", queue);
  };

  it("writes only the uncontested rules, and docs/RULES.md lists the held ones with why", async () => {
    const set = records();
    write(set);
    generate({ registry, out });
    const mod = await import(`${pathToFileURL(join(out, "books", "tst.mjs")).href}?v=${Date.now()}`);
    expect(mod.RULES.map((r) => r.identifier)).toEqual(["aaaa", "bbbb"]);
    expect(heldRules(registry)).toEqual([
      { book: "TST", name: "Cccc", kind: "spell", page: 3, because: "disagreement" },
      { book: "TST", name: "Dddd", kind: "spell", page: 3, because: "not-reviewed" }
    ]);
  });

  it("build:rules --check and gates --ci fail when a held rule is hand-added to a generated module", async () => {
    const set = records();
    write(set);
    generate({ registry, out });
    expect(generate({ registry, out, check: true }).differing).toEqual([]);
    const file = join(out, "books", "tst.mjs");
    const shipped = readFileSync(file, "utf8");
    // The held rule's block, as bookModuleSource would have written it before Ruling R27.
    const { book, ...rest } = { ...ruleFromRecord(agreed(structuredClone(set.disputed)), { queue: [] }) };
    const block = JSON.stringify(rest, null, 2).split("\n").map((l) => `  ${l}`).join("\n");
    writeFileSync(file, shipped.replace("\n]);", `,\n\n${block}\n]);`));
    expect(generate({ registry, out, check: true }).differing).toEqual(["books/tst.mjs"]);
    const cli = (args) => spawnSync("node", [join(ROOT, "tools/pipeline/cli.mjs"), ...args], {
      cwd: ROOT, encoding: "utf8",
      env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_RULES: out,
        ...(process.env.DAS_CORE ? { DAS_CORE: process.env.DAS_CORE } : {}) }
    });
    const check = cli(["generate", "--check"]);
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("books/tst.mjs");
    // The module as read: the held rule is found in it, by key and reason.
    const mod = await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
    expect(shippedHeld([set.reviewed, set.stamped, set.disputed, set.fresh], { queue: set.queue, modules: { TST: mod.RULES } }))
      .toEqual([`emit: ${set.disputed.key} is held (review disagrees) but the generated module of TST registers it`]);
    expect(shippedHeld([set.disputed], { queue: set.queue, modules: {} })).toEqual([]);
    if (process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/content.mjs"))) {
      const ci = cli(["gates", "--ci"]);
      expect(ci.status).toBe(1);
      expect(ci.stderr).toContain(`emit: ${set.disputed.key} is held (review disagrees)`);
      writeFileSync(file, shipped);
      expect(cli(["gates", "--ci"]).stderr).not.toContain("emit:");
    }
  });
});

// Ruling R29: a monster rule is emitted only as its delta against the engine's reading, from the evidence stored on it.
describe("emissionOf for monster rules (Ruling R29): the delta against the engine's own reading", () => {
  const merging = { version: "9.9.9", mergeEntries: (layers) => Object.assign({}, ...layers.filter(Boolean)) };
  const push = { on: "failedSave", if: { "target.sizeAtMost": "med" }, do: [{ type: "move", mode: "push", distance: 10 }] };
  const resave = { on: "turnEnd", via: "effect", do: [{ type: "resave" }] };
  // A reviewed monster rule with `entry`, compared with `reading` (stored as evidence.reading unless `stored` is false).
  function monster(entry, reading, { stored = true } = {}) {
    const r = gated("Glimmer");
    r.kind = "monster";
    r.rule.entry = entry;
    regate(agreed(regate(r)));
    if (stored) r.evidence.reading = readingEvidence(r, compareWithReading(entry, reading, merging), { at: AT, core: merging });
    return r;
  }

  it("holds a monster rule with no current reading, as before (engine-text): none, stale rule, stale item", () => {
    expect(emissionOf(monster({ halfOnMiss: true }, null, { stored: false }), { queue: [] }))
      .toEqual({ emitted: false, because: "engine-text" });
    const edited = monster({ halfOnMiss: true }, null);
    edited.rule.entry.noOpportunity = "afterUse";
    regate(agreed(edited));
    expect(emissionOf(edited, { queue: [] })).toEqual({ emitted: false, because: "engine-text" });
    const moved = monster({ halfOnMiss: true }, null);
    moved.items[0].data.sha256 = "e".repeat(64);
    regate(moved);
    expect(emissionOf(moved, { queue: [] })?.because).toBe("engine-text");
  });

  it("emits only the keys the engine does not read, and a superset trigger list whole", () => {
    const r = monster({ saveDamage: { [ACT]: "half" }, triggers: [push, resave], halfOnMiss: true },
      { saveDamage: { [ACT]: "half" }, triggers: [push] });
    expect(r.evidence.reading.delta).toEqual(["halfOnMiss", "triggers"]);
    expect(emissionOf(r, { queue: [] })).toEqual({ emitted: true, because: "reviewed" });
    expect(ruleFromRecord(r, { queue: [] }).entry).toEqual({ halfOnMiss: true, triggers: [push, resave] });
    const source = bookModuleSource("TST", [r], undefined, { queue: [] });
    expect(source).toContain('"halfOnMiss": true');
    expect(source).not.toContain('"saveDamage"');
  });

  it("holds a rule that changes the engine's reading, a trigger it drops included: a person decides", () => {
    const lost = { on: "failedSave", do: [{ type: "move", mode: "push", distance: 10 }] };
    expect(emissionOf(monster({ triggers: [lost], halfOnMiss: true }, { triggers: [push] }), { queue: [] }))
      .toEqual({ emitted: false, because: "engine-changes" });
    expect(emissionOf(monster({ blocksHealing: false }, { blocksHealing: true }), { queue: [] }))
      .toEqual({ emitted: false, because: "engine-changes" });
  });

  it("holds a rule the engine already reads in full: nothing to register", () => {
    const r = monster({ triggers: [push] }, { triggers: [push], blocksHealing: true });
    expect(r.evidence.reading.delta).toEqual([]);
    expect(emissionOf(r, { queue: [] })).toEqual({ emitted: false, because: "engine-already" });
    expect(ruleFromRecord(r, { queue: [] })).toBeNull();
  });

  it("then applies Ruling R27 to a delta that stands: a rule never reviewed is still held for it", () => {
    const r = monster({ halfOnMiss: true }, null);
    delete r.evidence.reviewed;
    regate(r);
    expect(emissionOf(r, { queue: [] })).toEqual({ emitted: false, because: "not-reviewed" });
  });

  it("emits the whole entry for the tests of the mechanics (monsterRules: true), the reading aside", () => {
    const r = monster({ saveDamage: { [ACT]: "half" }, halfOnMiss: true }, { saveDamage: { [ACT]: "half" } });
    expect(ruleFromRecord(r, { queue: [], monsterRules: true }).entry).toEqual({ saveDamage: { [ACT]: "half" },
      halfOnMiss: true });
  });
});

// Fix round 1: the rebinding of the item's identifier (Ruling R29, amended).
describe("emissionOf for monster rules: what the rebinding of the item's identifier drops", () => {
  const merging = { version: "9.9.9", mergeEntries: (layers) => Object.assign({}, ...layers.filter(Boolean)) };
  function monster(rebinding) {
    const r = gated("Glimmer");
    r.kind = "monster";
    r.rule.entry = { halfOnMiss: true };
    regate(agreed(regate(r)));
    const comparison = compareWithReading(r.rule.entry, null, merging);
    r.evidence.reading = readingEvidence(r, { comparison, original: "glimmer", carried: [], dropped: [], code: false,
      ...rebinding }, { at: AT, core: merging });
    return r;
  }

  it("ships a rule with carried keys, saying where they come from (resolved from the engine at registration)", () => {
    const r = monster({ carried: ["magical", "usageLimits"] });
    expect(emissionOf(r, { queue: [] })).toEqual({ emitted: true, because: "reviewed" });
    const rule = ruleFromRecord(r, { queue: [] });
    expect(rule.entry).toEqual({ halfOnMiss: true });
    expect(rule.carries).toEqual({ from: "glimmer", keys: ["magical", "usageLimits"] });
    expect(ruleFromRecord(monster({}), { queue: [] })).not.toHaveProperty("carries");
  });

  it("holds a rule whose identifier would drop a key that cannot be carried, or behaviour the engine's code ties to it", () => {
    expect(emissionOf(monster({ dropped: ["effectChanges"] }), { queue: [] }))
      .toEqual({ emitted: false, because: "engine-rebinding" });
    expect(emissionOf(monster({ code: true }), { queue: [] })).toEqual({ emitted: false, because: "engine-rebinding" });
  });
});
