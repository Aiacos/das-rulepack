// The fixes of the milestone-2 whole-branch review: names in another order or of another variant, rule-based triage on
// shared identifiers, gate evidence bound to the items checked, structures and reprints that never take another document,
// monster qualifiers, the --structure path checks and whole-word owner names.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchOrigin } from "../../tools/pipeline/match.mjs";
import { autoTriage, ingest, setByRule, triageContext } from "../../tools/pipeline/triage.mjs";
import { cutBatches } from "../../tools/pipeline/batch.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { ruleFingerprint, saveBook, stateOf, validateRecord } from "../../tools/pipeline/registry.mjs";
import { runGates } from "../../tools/pipeline/gates.mjs";
import { resolveItem } from "../../tools/pipeline/resolve.mjs";
import { docIndex, findDocument, itemSummary, reprintIndex, actorSummaries } from "../../tools/pipeline/dumps.mjs";
import { reprintsOf } from "../../tools/pipeline/settle.mjs";
import { baseFeatureName, readMonsters } from "../../tools/pipeline/monsters.mjs";
import { inventory } from "../../tools/pipeline/inventory.mjs";

// Synthetic fixtures only: invented names and invented ids.
const cand = (name, over = {}) => ({
  origin: "official", docId: `id-${name}`, identifier: null, name, type: "consumable", rules: "2024", activities: [],
  effects: [], data: `h-${name}`, ...over
});
const itemEntry = (name, over = {}) => ({ name, kind: "item", edition: "2024", ...over });

describe("I1: names in another order or of another variant", () => {
  it("matches the one candidate whose words are the same in another order, visibly", () => {
    const swapped = cand("Basic Glimmer Draught");
    expect(matchOrigin(itemEntry("Glimmer Draught, Basic"), [swapped]))
      .toEqual({ match: "matched", item: swapped, differences: ["name-order"] });
    const bag = cand("Grey Sack of Wonders", { type: "loot" });
    expect(matchOrigin(itemEntry("Sack of Wonders, Grey"), [bag]))
      .toEqual({ match: "matched", item: bag, differences: ["name-order"] });
  });
  it("is ambiguous between two candidates in another order", () => {
    const a = cand("Basic Glimmer Draught", { docId: "a", data: "ha" });
    const b = cand("Draught Glimmer Basic", { docId: "b", data: "hb" });
    expect(matchOrigin(itemEntry("Glimmer Draught, Basic"), [a, b]))
      .toEqual({ match: "ambiguous", candidates: [a, b], differences: ["name-order"] });
  });
  it("offers a candidate of another variant as ambiguous, never matched", () => {
    const plus = cand("Glass Blade +1", { type: "weapon" });
    expect(matchOrigin(itemEntry("Glass Blade"), [plus]))
      .toEqual({ match: "ambiguous", candidates: [plus], differences: ["variant"] });
    const frost = cand("Glass Blade (Frost)", { type: "weapon" });
    expect(matchOrigin(itemEntry("Glass Blade (Ember)"), [frost]))
      .toEqual({ match: "ambiguous", candidates: [frost], differences: ["variant"] });
  });
  it("is ambiguous when a variant and a name-order candidate are both there", () => {
    const plus = cand("Draught Glimmer +1", { docId: "p" });
    const swapped = cand("Glimmer Draught", { docId: "s" });
    const r = matchOrigin(itemEntry("Draught Glimmer"), [plus, swapped]);
    expect(r).toMatchObject({ match: "ambiguous", differences: ["variant", "name-order"] });
    expect(r.candidates.map((c) => c.docId)).toEqual(["p", "s"]);
  });
  it("stays absent when nothing is similar, and an exact name still wins", () => {
    expect(matchOrigin(itemEntry("Glimmer Draught"), [cand("Dull Draught")])).toEqual({ match: "absent" });
    const exact = cand("Glimmer Draught");
    expect(matchOrigin(itemEntry("Glimmer Draught"), [cand("Draught Glimmer"), exact])).toEqual({ match: "matched", item: exact });
  });
  it("needs the document type of the kind, and keeps the identity checks of the kind", () => {
    expect(matchOrigin(itemEntry("Glimmer Draught, Basic"), [cand("Basic Glimmer Draught", { type: "spell" })]))
      .toEqual({ match: "absent" });
    const rare = cand("Basic Glimmer Draught", { rarity: "rare" });
    expect(matchOrigin(itemEntry("Glimmer Draught, Basic", { rarity: "common" }), [rare]))
      .toMatchObject({ match: "ambiguous", differences: ["name-order", "rarity"] });
  });
  it("applies to features, but not to the items embedded in a monster", () => {
    const feat = cand("Stride Moss", { type: "feat" });
    expect(matchOrigin({ name: "Moss Stride", kind: "feat", edition: "2024" }, [feat]))
      .toMatchObject({ match: "matched", differences: ["name-order"] });
    expect(matchOrigin({ name: "Moss Stride", kind: "monster", edition: "2024" }, [feat])).toEqual({ match: "absent" });
    expect(matchOrigin({ name: "Bite", kind: "monster", edition: "2024" }, [cand("Bite (Beast Form)", { type: "feat" })]))
      .toEqual({ match: "absent" });
  });
  it("lets a feature named like its subclass take the subclass document before a loose name", () => {
    const sub = cand("Circle of Moss", { type: "subclass", classIdentifier: "druid" });
    const loose = cand("Moss of Circle", { type: "feat", docId: "loose" });
    const entry = { name: "Circle of Moss", kind: "feature", edition: "2024", owner: "Druid/Circle of Moss", level: 3 };
    expect(matchOrigin(entry, [sub, loose])).toMatchObject({ match: "matched", item: sub });
  });
});

describe("I2: rule-based triage on shared identifiers", () => {
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "rf-tri-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const matched = { origin: "official", match: "matched", identifier: "x", docId: "d", activities: [], effects: [] };
  const rec = (name, over = {}) => ({
    key: `tst:${over.kind ?? "spell"}:${name}`, name, kind: "spell", book: "TST", page: 1, edition: "2024", identifier: name,
    text: { sha256: cacheText(textDir, `invented text of ${name}`), source: "5etools", chars: 9 }, items: [matched],
    verdict: null, evidence: {}, ...over
  });
  const core = new Set(["in-core", "shared-one"]);
  const triage = (r, records = [r]) => autoTriage(r, { coreIdentifiers: core, textDir, ...triageContext(records) });

  it("gives core only to the one record of its kind that has the identifier", () => {
    const one = rec("in-core");
    expect(triage(one)).toEqual({ verdict: "core", why: "DAS · Core has an entry under this identifier", by: "rule" });
    const a = rec("shared-one", { key: "tst:spell:a" });
    const b = rec("shared-one", { key: "tst:spell:b", book: "TWO" });
    expect(triage(a, [a, b])).toEqual({ hint: "core-generic" });
    // Another kind with the identifier does not count against it.
    const feat = rec("shared-one", { kind: "feat", key: "tst:feat:shared-one" });
    expect(triage(a, [a, feat])?.verdict).toBe("core");
  });

  it("counts an identifier per edition and gives core by rule to 2024 records only", () => {
    const now = rec("shared-one", { key: "tst:spell:now", edition: "2024" });
    const old = rec("shared-one", { key: "old:spell:old", book: "OLD", edition: "2014" });
    // The 2014 twin does not take the verdict away from the 2024 record...
    expect(triage(now, [now, old])?.verdict).toBe("core");
    // ...and gets a hint, not a verdict: the engine's entry was written for the 2024 rules.
    expect(triage(old, [now, old])).toEqual({ hint: "core-generic" });
    expect(triage(old, [old])).toEqual({ hint: "core-generic" });
    // Two 2024 records still share it.
    const twin = rec("shared-one", { key: "two:spell:twin", book: "TWO", edition: "2024" });
    expect(triage(now, [now, twin, old])).toEqual({ hint: "core-generic" });
  });
  it("never gives core to a monster feature: a hint instead", () => {
    const m = rec("in-core", { kind: "monster", owner: "Invented Beast", section: "trait" });
    expect(triage(m)).toEqual({ hint: "core-generic" });
  });
  it("says why precisely for none and unverifiable", () => {
    expect(triage(rec("bare", { text: null, items: [{ origin: "plutonium", match: "unchecked" }] })))
      .toEqual({ verdict: "none", why: "no text and no item in any origin", by: "rule" });
    const ddbOnly = { ...matched, origin: "ddb-importer" };
    expect(triage(rec("bare", { text: null, items: [ddbOnly] })))
      .toEqual({ verdict: "unverifiable", why: "the rulebook entry has no text of its own", by: "rule" });
    expect(triage(rec("lost", { text: { sha256: "a".repeat(64), source: "5etools", chars: 1 } })))
      .toEqual({ verdict: "unverifiable", why: "the rulebook text is not in the cache", by: "rule" });
  });
  it("keeps the hint with a verdict given for the text", () => {
    const m = rec("in-core", { kind: "monster", owner: "Beast", section: "trait", text: null });
    expect(triage(m)).toEqual({ verdict: "unverifiable", why: "the rulebook entry has no text of its own", by: "rule",
      hint: "core-generic" });
  });
  it("leaves a species shell described by its traits, and none only to the kinds that have nothing else", () => {
    const shell = rec("glimmerkin", { kind: "species", name: "Glimmerkin", text: null, items: [] });
    const trait = rec("dim-sight", { kind: "species", name: "Dim Sight", owner: "Glimmerkin", key: "tst:species:glimmerkin/dim" });
    expect(triage(shell, [shell, trait])).toBeNull();
    expect(triage({ ...shell, items: [matched] }, [shell, trait])).toBeNull();
    for (const kind of ["item", "feature", "option", "feat", "background", "spell"]) {
      expect(triage(rec("bare", { kind, text: null, items: [] }))?.verdict, kind).toBe("none");
    }
    expect(triage(rec("bare", { kind: "monster", owner: "B", section: "trait", text: null, items: [] }))).toBeNull();
  });
  it("reserves the handle rule for the rule-based step", () => {
    expect(() => ingest([], [], { textDir, by: "rule" })).toThrow(/not be "rule"/);
    expect(() => ingest([], [], { textDir, by: "Rule" })).toThrow(/not be "rule"/);
    expect(setByRule({ evidence: { triaged: { by: "rule", at: "x" } } })).toBe(true);
    expect(setByRule({ evidence: { triaged: { by: "rule", at: "x", confidence: 1 } } })).toBe(false);
    expect(setByRule({ evidence: { triaged: { by: "reader-1", at: "x", confidence: 1 } } })).toBe(false);
  });
  it("validates the hint against its closed list", () => {
    expect(validateRecord(rec("x", { hint: "core-generic" }))).toEqual([]);
    expect(validateRecord(rec("x", { hint: "other" }))).toContain("hint: must be one of core-generic");
  });
});

describe("I2: batch carries the hint and skips queued records", () => {
  const sha = (n) => String(n).padStart(64, "0");
  const rec = (n, over = {}) => ({
    key: `tst:spell:s${n}`, name: `S ${n}`, kind: "spell", book: "TST", page: 1, edition: "2024", identifier: `s${n}`,
    text: { sha256: sha(n), source: "5etools", chars: 5 }, items: [], verdict: null, evidence: {}, ...over
  });
  it("puts the hint on the entry", () => {
    const [b] = cutBatches([rec(1, { hint: "core-generic" })], {});
    expect(b.entries[0].hint).toBe("core-generic");
  });
  it("leaves out the records queued for a person", () => {
    const out = cutBatches([rec(1), rec(2)], { queued: new Set(["tst:spell:s1"]) });
    expect(out.flatMap((b) => b.entries.map((e) => e.key))).toEqual(["tst:spell:s2"]);
  });
});

describe("I2: triage --redo-rule and batch on the command line", () => {
  let tmp, registry, textDir;
  const run = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_TEXT: textDir, DAS_CORE: process.env.DAS_CORE ?? "" }
  });
  const book = () => new Map(JSON.parse(readFileSync(join(registry, "tst.json"), "utf8")).records.map((r) => [r.key, r]));
  // An identifier DAS · Core has for certain: the first of the engine's own identifiers is read in the test.
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "rf-redo-"));
    registry = join(tmp, "registry");
    textDir = join(tmp, "text");
    mkdirSync(textDir);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));
  const withCore = it.skipIf(!process.env.DAS_CORE);
  const base = (key, over = {}) => ({
    key, name: key.split(":").pop(), kind: "item", book: "TST", page: 1, edition: "2024", identifier: key.split(":").pop(),
    text: null, items: [], verdict: null, evidence: {}, ...over
  });

  withCore("re-evaluates verdicts set by rule only, clearing what the rule no longer gives", () => {
    const rule = { triaged: { by: "rule", at: "2026-01-01T00:00:00.000Z" } };
    const sha = cacheText(textDir, "invented text");
    const records = [
      // Was "unverifiable: not in the cache"; the text is now in the cache: the rule gives nothing any more.
      base("tst:item:was-lost", { text: { sha256: sha, source: "5etools", chars: 13 }, verdict: "unverifiable",
        why: "The rulebook text is not in the cache", evidence: rule, textChangedAt: "2026-01-02" }),
      // Was a placeholder: still none, with the new why.
      base("tst:item:bare", { verdict: "none", why: "placeholder: no text and no item", evidence: rule }),
      // Set by ingest and by a person's rule: never touched.
      base("tst:item:read", { verdict: "data", why: "a reader said so", evidence: { triaged: { by: "reader-1", at: "x",
        confidence: 0.9 } } }),
      base("tst:item:ruled", { verdict: "entry", why: "w", evidence: rule,
        rule: { handledIn: "table", adds: "x", entry: {}, origins: ["official"] } })
    ];
    saveBook(registry, { book: "TST", records });
    const before = book();
    expect(run(["triage", "TST"]).status).toBe(0);
    expect(book().get("tst:item:was-lost").verdict).toBe("unverifiable");
    const r = run(["triage", "TST", "--redo-rule"]);
    expect(r.status, r.stderr).toBe(0);
    const after = book();
    const lost = after.get("tst:item:was-lost");
    expect(lost.verdict).toBeNull();
    expect(lost).not.toHaveProperty("why");
    expect(lost).not.toHaveProperty("textChangedAt");
    expect(lost.evidence).toEqual({});
    expect(after.get("tst:item:bare")).toMatchObject({ verdict: "none", why: "no text and no item in any origin" });
    expect(after.get("tst:item:read")).toEqual(before.get("tst:item:read"));
    expect(after.get("tst:item:ruled")).toEqual(before.get("tst:item:ruled"));
    expect(run(["triage", "TST", "--nope"]).status).toBe(2);
  });

  it("batch leaves out the records in queue.json", () => {
    const sha = cacheText(textDir, "invented text");
    const text = { sha256: sha, source: "5etools", chars: 13 };
    saveBook(registry, { book: "TST", records: [base("tst:item:a", { text }), base("tst:item:b", { text })] });
    writeFileSync(join(registry, "queue.json"), JSON.stringify([{ key: "tst:item:a", verdict: "none", why: "w",
      confidence: 0.5, by: "reader-1", reason: "low-confidence" }]));
    const out = join(tmp, "out");
    expect(run(["batch", "triage", "TST", "--out", out]).status).toBe(0);
    const b = JSON.parse(readFileSync(join(out, "tst-triage-001.json"), "utf8"));
    expect(b.entries.map((e) => e.key)).toEqual(["tst:item:b"]);
  });
});

describe("I3: gate evidence is bound to the items checked", () => {
  const A = "Aa00Aa11Aa22Aa33";
  const B = "Bb00Bb11Bb22Bb33";
  const ACT = "Ac00Ac11Ac22Ac33";
  const stubCore = {
    version: "9.9.9", facts: [], vocabulary: new Set(), validateEntry: () => [], getPath: () => undefined,
    matchesFrom: () => true
  };
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "rf-gate-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const summary = (docId) => ({
    origin: "official", docId, identifier: "glimmer-ring", name: "Glimmer Ring", type: "equipment", rules: "2024",
    activities: [{ id: ACT, type: "utility", damageTypes: [] }], effects: [], data: "1".repeat(63) + docId.slice(0, 1).toLowerCase()
  });
  const record = () => ({
    key: "tst:item:glimmer-ring", name: "Glimmer Ring", kind: "item", book: "TST", page: 3, edition: "2024",
    identifier: "glimmer-ring", text: { sha256: cacheText(textDir, "invented ring text"), source: "5etools", chars: 18 },
    items: [{
      origin: "official", match: "ambiguous", candidates: [{ identifier: "glimmer-ring", docId: A },
        { identifier: "glimmer-ring", docId: B }], differences: []
    }], verdict: "entry", evidence: {},
    rule: { handledIn: "table", adds: "x", entry: { triggers: [{ on: "x", fromActivity: ACT }] }, origins: ["official"] }
  });
  const ctx = (over = {}) => ({ core: stubCore, documents: {}, textDir, ci: false, legacy: new Map(), ...over });
  const settled = (docId, r = record()) => resolveItem(r, {
    origin: "official", docId, because: "invented reason", by: "reader-1", at: "2026-01-01T00:00:00.000Z",
    pool: [summary(A), summary(B)]
  });

  it("writes the fingerprint of each named origin's item into evidence.gates.items", () => {
    const gated = runGates([settled(A)], ctx()).updated[0];
    expect(gated.evidence.gates.items).toEqual({ official: summary(A).data });
    expect(gated.evidence.gates.rule).toBe(ruleFingerprint(gated.rule));
    expect(validateRecord(gated)).toEqual([]);
    expect(stateOf(gated)).toBe("gated");
  });
  it("is drafted, and fails --ci, once resolve moved the item to another document", () => {
    const gated = runGates([settled(A)], ctx()).updated[0];
    const moved = resolveItem(gated, {
      origin: "official", docId: B, because: "the other copy", by: "reader-1", at: "2026-01-02T00:00:00.000Z",
      pool: [summary(A), summary(B)], force: true
    });
    expect(moved.evidence.gates).toBeUndefined();
    expect(stateOf(moved)).toBe("drafted");
    expect(runGates([moved], ctx({ ci: true })).failures[moved.key]?.gates).toHaveLength(1);
    // Even when an editor leaves the evidence in place, it no longer counts.
    const kept = { ...moved, evidence: gated.evidence };
    expect(stateOf(kept)).toBe("drafted");
    expect(runGates([kept], ctx({ ci: true })).failures[kept.key]?.gates).toHaveLength(1);
    const regated = runGates([moved], ctx()).updated[0];
    expect(stateOf(regated)).toBe("gated");
    expect(runGates([regated], ctx({ ci: true })).failures).toEqual({});
  });
  it("does not count evidence written before item fingerprints were recorded", () => {
    const gated = runGates([settled(A)], ctx()).updated[0];
    const { items, ...old } = gated.evidence.gates;
    expect(stateOf({ ...gated, evidence: { gates: old } })).toBe("drafted");
  });
  it("rejects a malformed items map", () => {
    const gated = runGates([settled(A)], ctx()).updated[0];
    const bad = { ...gated, evidence: { gates: { ...gated.evidence.gates, items: { official: "x" } } } };
    expect(validateRecord(bad).join(" ")).toMatch(/evidence.gates.items/);
  });
});

describe("I4: documents are found by id and data, never another document", () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "rf-docs-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const ID = "Sh00Sh11Sh22Sh33";
  const item = { _id: ID, name: "Invented Charm", type: "equipment", system: { rarity: "rare", activities: {} }, effects: [] };
  const page = { _id: ID, name: "Invented Chapter", type: "text", text: { content: "<p>prose</p>" } };
  const journal = { _id: ID, name: "Invented Journal", pages: [page] };

  it("indexes items and actors only, never journal entries or pages", () => {
    writeFileSync(join(dir, "pkg.journal.json"), JSON.stringify([journal, page]));
    writeFileSync(join(dir, "pkg.items.json"), JSON.stringify([item]));
    const index = docIndex(dir, ["pkg.journal.json", "pkg.items.json"]);
    expect(findDocument(index, ID, itemSummary(item, "official").data)).toEqual(item);
    expect(findDocument(index, ID)).toEqual(item);
    expect(findDocument(index, ID, "0".repeat(64))).toBeNull();
    expect(findDocument(docIndex(dir, ["pkg.journal.json"]), ID)).toBeNull();
  });
  it("takes no document by id alone when two documents of a known type share it", () => {
    const other = { ...item, system: { rarity: "common", activities: {} } };
    writeFileSync(join(dir, "pkg.items.json"), JSON.stringify([item, other]));
    const index = docIndex(dir, ["pkg.items.json"]);
    expect(findDocument(index, ID)).toBeNull();
    expect(findDocument(index, ID, itemSummary(other, "official").data)).toEqual(other);
  });
  it("counts as a reprint only a document of the record kind's types", () => {
    writeFileSync(join(dir, "other.journal.json"), JSON.stringify([page]));
    writeFileSync(join(dir, "third.spells.json"), JSON.stringify([{ ...item, type: "spell" }]));
    writeFileSync(join(dir, "fourth.items.json"), JSON.stringify([item]));
    const index = reprintIndex(dir, ["other.journal.json", "third.spells.json", "fourth.items.json"]);
    const mine = { docId: ID, activities: [], effects: [] };
    expect(reprintsOf(mine, index, undefined, ["equipment", "weapon"]).reprints.map((r) => r.package)).toEqual(["fourth"]);
    expect(reprintsOf(mine, index, undefined, ["spell"]).reprints.map((r) => r.package)).toEqual(["third"]);
  });

  it("batch --structure gives null rather than a journal page that shares the item's id", () => {
    const registry = join(dir, "registry");
    const dumps = join(dir, "dumps");
    mkdirSync(dumps);
    writeFileSync(join(dumps, "dnd-players-handbook.journal.json"), JSON.stringify([page]));
    const real = { ...item, _id: "Re00Re11Re22Re33" };
    writeFileSync(join(dumps, "dnd-players-handbook.items.json"), JSON.stringify([real]));
    const it2 = (docId, sha) => ({
      origin: "official", match: "matched", identifier: "x", docId, activities: [], effects: [], data: { sha256: sha }
    });
    const rec = (n, i) => ({
      key: `xphb:item:i${n}`, name: `I ${n}`, kind: "item", book: "XPHB", page: 1, edition: "2024", identifier: `i${n}`,
      text: { sha256: String(n).padStart(64, "0"), source: "5etools", chars: 5 }, items: [i], verdict: null, evidence: {}
    });
    saveBook(registry, { book: "XPHB", records: [
      rec(1, it2(ID, itemSummary(item, "official").data)), rec(2, it2(real._id, itemSummary(real, "official").data))
    ] });
    const r = spawnSync("node", ["tools/pipeline/cli.mjs", "batch", "triage", "XPHB", "--out", join(dir, "out"),
      "--structure", join(dir, "private")], {
      encoding: "utf8", env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_DUMPS: dumps }
    });
    expect(r.status, r.stderr).toBe(0);
    const file = JSON.parse(readFileSync(join(dir, "private", "xphb-triage-001.structure.json"), "utf8"));
    expect(file.entries["xphb:item:i1"].official).toBeNull();
    expect(file.entries["xphb:item:i2"].official).toMatchObject({ rarity: "rare" });
  });
});

describe("M4: monster qualifiers anywhere in a trailing group", () => {
  it("strips a trailing group that names a recharge, a cost, uses or a limit anywhere in it", () => {
    expect(baseFeatureName("Healing Glow (Bright Only; Recharges after a Long Rest)")).toBe("Healing Glow");
    expect(baseFeatureName("Glow (2/Day)")).toBe("Glow");
    expect(baseFeatureName("Glow (6/Year)")).toBe("Glow");
    expect(baseFeatureName("Glow (Costs 2 Actions)")).toBe("Glow");
    expect(baseFeatureName("Glow (Recharge 5–6)")).toBe("Glow");
    expect(baseFeatureName("Glow (Beast Form Only)")).toBe("Glow (Beast Form Only)");
    expect(baseFeatureName("Glow (Needs a Lamp)")).toBe("Glow (Needs a Lamp)");
  });

  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "rf-mon-")); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));
  const bestiary = () => {
    mkdirSync(join(tmp, "data", "bestiary"), { recursive: true });
    writeFileSync(join(tmp, "data", "bestiary", "bestiary-xzz.json"), JSON.stringify({ monster: [{
      name: "Invented Spirit", source: "XZZ", page: 4,
      action: [{ name: "Healing Glow (Bright Only; Recharges after a Long Rest)", entries: ["Invented text."] }]
    }] }));
    return readMonsters(join(tmp, "data"), "XZZ", {});
  };
  it("keeps the key of the old rule and matches on the new name", () => {
    const { features, creatures } = bestiary();
    expect(features[0]).toMatchObject({ name: "Healing Glow" });
    const textDir = join(tmp, "text");
    const glow = { _id: "Gl00Gl11Gl22Gl33", name: "Healing Glow", type: "feat", effects: [],
      system: { activities: { aaaaaaaaaaaaaaaa: { type: "heal", activation: { type: "action" } } } } };
    const dumps = { actors: actorSummaries([{ _id: "Ac00Ac11Ac22Ac33", name: "Invented Spirit", type: "npc", items: [glow] }],
      "official") };
    const oldKey = "xzz:monster:invented-spirit/action/healing-glow-bright-only-recharges-after-a-long-rest";
    // A record written by the old rule (key and name), as the registry holds it.
    const old = {
      key: oldKey, name: "Healing Glow (Bright Only; Recharges after a Long Rest)", kind: "monster", book: "XZZ",
      edition: features[0].edition, owner: "Invented Spirit", section: "action", identifier: "x", page: 4, srd: false, text: null,
      items: [], verdict: "none", why: "kept", evidence: { triaged: { by: "reader-1", at: "x", confidence: 1 } }
    };
    const run = (previous) => inventory({ book: "XZZ", kind: "monster", dataset: features, creatures, dumps, textDir, previous });
    const out = run([old]);
    expect(out.report).toMatchObject({ added: 0, vanished: [] });
    expect(out.records.map((r) => r.key)).toEqual([oldKey]);
    expect(out.records[0]).toMatchObject({ name: "Healing Glow", verdict: "none", why: "kept", evidence: old.evidence });
    expect(out.records[0].items.find((i) => i.origin === "official")).toMatchObject({ match: "matched" });
    // A second run on its own output keeps everything.
    const again = run(out.records);
    expect(again.report).toMatchObject({ added: 0, vanished: [] });
    expect(again.records).toEqual(out.records);
    // A book inventoried for the first time keys the feature by the old rule too.
    expect(run([]).records.map((r) => r.key)).toEqual([oldKey]);
  });
});

describe("M4: an embedded item named with its qualifier", () => {
  it("still matches the feature, whose name has none", () => {
    const glow = { _id: "Gl00Gl11Gl22Gl33", name: "Glow (6/Year)", type: "feat", effects: [],
      system: { activities: { aaaaaaaaaaaaaaaa: { type: "utility", activation: { type: "" } } } } };
    const dumps = { actors: actorSummaries([{ _id: "Ac00Ac11Ac22Ac33", name: "Invented Sage", type: "npc", items: [glow] }],
      "official") };
    const feature = { name: "Glow", keyName: "Glow (6/Year)", kind: "monster", owner: "Invented Sage", section: "trait",
      book: "XZZ", page: 2, edition: "2024", srd: false, text: null, creatureIndex: 0 };
    const textDir = mkdtempSync(join(tmpdir(), "rf-q-"));
    try {
      const { records } = inventory({ book: "XZZ", kind: "monster", dataset: [feature], dumps, textDir, previous: [] });
      expect(records[0].key).toBe("xzz:monster:invented-sage/trait/glow-6-year");
      expect(records[0].items.find((i) => i.origin === "official"))
        .toMatchObject({ match: "matched", docId: "Ac00Ac11Ac22Ac33.Gl00Gl11Gl22Gl33", identifier: "glow-6-year" });
    } finally { rmSync(textDir, { recursive: true, force: true }); }
  });
});

describe("M-parked: --structure and --out on the command line", () => {
  let tmp, registry;
  const run = (args, env = {}) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], {
    encoding: "utf8", env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_DUMPS: join(tmp, "dumps"), ...env }
  });
  const rec = (n) => ({
    key: `xphb:spell:s${n}`, name: `S ${n}`, kind: "spell", book: "XPHB", page: 1, edition: "2024", identifier: `s${n}`,
    text: { sha256: String(n).padStart(64, "0"), source: "5etools", chars: 5 }, verdict: null, evidence: {},
    items: [{ origin: "official", match: "matched", identifier: "x", docId: "Aa00Bb11Cc22Dd33", activities: [], effects: [],
      data: { sha256: "1".repeat(64) } }]
  });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "rf-path-"));
    registry = join(tmp, "registry");
    mkdirSync(join(tmp, "dumps"));
    saveBook(registry, { book: "XPHB", records: [rec(1), rec(2)] });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("refuses a --structure path with a .. segment", () => {
    const r = run(["batch", "triage", "XPHB", "--out", join(tmp, "out"), "--structure", `${tmp}/a/../private`]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("..");
    expect(existsSync(join(tmp, "out"))).toBe(false);
  });
  it("refuses an existing regular file as --structure or --out", () => {
    const file = join(tmp, "file.txt");
    writeFileSync(file, "x");
    expect(run(["batch", "triage", "XPHB", "--out", file]).status).toBe(2);
    expect(run(["batch", "triage", "XPHB", "--out", join(tmp, "out"), "--structure", file]).status).toBe(2);
    expect(readFileSync(file, "utf8")).toBe("x");
  });
  it("writes no batch file when a structure cannot be computed", () => {
    writeFileSync(join(tmp, "dumps", "dnd-players-handbook.spells.json"), "{ not json");
    const r = run(["batch", "triage", "XPHB", "--out", join(tmp, "out"), "--structure", join(tmp, "private"), "--size", "1"]);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(tmp, "out")) ? readdirSync(join(tmp, "out")) : []).toEqual([]);
  });
});

describe("M-parked: owner names compare whole hyphenated words", () => {
  it("does not let Elf agree with a requirement that names Half-Elf", () => {
    const trait = (over) => ({
      origin: "official", docId: "t", identifier: null, name: "Keen Ears", type: "feat", rules: "2024", activities: [],
      effects: [], data: "h", ...over
    });
    const entry = { name: "Keen Ears", kind: "species", edition: "2024", owner: "Elf" };
    expect(matchOrigin(entry, [trait({ requirements: "Half-Elf" })])).toMatchObject({ match: "ambiguous", differences: ["owner"] });
    expect(matchOrigin(entry, [trait({ requirements: "Elf" })])).toMatchObject({ match: "matched" });
    expect(matchOrigin({ ...entry, owner: "Half-Elf" }, [trait({ requirements: "Half-Elf" })])).toMatchObject({ match: "matched" });
  });
});
