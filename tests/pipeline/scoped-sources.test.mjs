// Ruling R35: a monster feature whose embedded item id other creatures share is bound to ONE creature's feature by an
// `<actor id>.<item id>` source, when the engine accepts such keys (its `validateSources`). Synthetic fixtures only: invented
// creatures, ids and words of this test's own.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { actorItemSourcesOf, loadCore } from "../../tools/pipeline/core.mjs";
import { ACTOR_ITEM_REFUSED, SHARED_EMBEDDED, monsterIdentifier, reaches } from "../../tools/pipeline/identifiers.mjs";
import { inventory } from "../../tools/pipeline/inventory.mjs";
import { checkIds, gateSchema, gateUnique, gateValidator, runGates } from "../../tools/pipeline/gates.mjs";
import { SHARED_EMBEDDED_REFUSED, cutDraftBatches, draftSkipReason } from "../../tools/pipeline/batch.mjs";
import { embeddedIndex, sourceProblems } from "../../tools/pipeline/settle.mjs";
import { ingestDrafts } from "../../tools/pipeline/draft.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { currentReading, engineComparison, engineReading, originalIdentifierOf } from "../../tools/pipeline/engine-reading.mjs";
import { readingOfRecord } from "../../tools/pipeline/cli.mjs";
import { stateOf } from "../../tools/pipeline/registry.mjs";
import { ASSERT } from "./fixtures/assert.mjs";

const WOLF = "Wo00Wo11Wo22Wo33";
const BEAR = "Be00Be11Be22Be33";
const BITE = "Bi00Bi11Bi22Bi33";
const ACT = "Ac00Ac11Ac22Ac33";
const PROBE_OLD = (sources) => Object.keys(sources).filter((k) => !/^[A-Za-z0-9]{16}$/.test(k)).map((k) => `sources.${k}: no`);
const PROBE_NEW = (sources) => Object.keys(sources)
  .filter((k) => !k.split(".").every((p) => /^[A-Za-z0-9]{16}$/.test(p)) || k.split(".").length > 2).map((k) => `${k}: no`);

const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/content.mjs"))
  ? process.env.DAS_CORE : null;
const HAS_KEY_LOOKUP = !!CORE_DIR && existsSync(join(CORE_DIR, "module/scripts/core/source-keys.mjs"));

describe("the capability is read from the engine itself (loadCore, no version sniffing)", () => {
  it("is true only when the engine's validateSources accepts a key of two 16-character ids", () => {
    expect(actorItemSourcesOf(PROBE_NEW)).toBe(true);
    expect(actorItemSourcesOf(PROBE_OLD)).toBe(false);
    expect(actorItemSourcesOf(undefined)).toBe(false);
    expect(actorItemSourcesOf(() => { throw new Error("broken"); })).toBe(false);
    expect(actorItemSourcesOf(() => "not a list")).toBe(false);
  });

  // CI checks the pack against the engine's latest RELEASE, which may predate the change: the capability is then false, and
  // true as soon as the clone carries the engine's own key lookup (both arrived upstream together).
  it.skipIf(!CORE_DIR)("on the clone of DAS · Core (DAS_CORE), it is true exactly when the engine has its key lookup", async () => {
    const core = await loadCore(CORE_DIR);
    expect(core.actorItemSources).toBe(HAS_KEY_LOOKUP);
  });
});

// Two creatures embed one item id; only the wolf's feature has a rule.
const feature = (owner, creatureIndex) => ({
  name: "Bite", kind: "monster", owner, section: "action", book: "TST", page: 9, edition: "2024", srd: false,
  text: `the ${owner} bites`, creatureIndex
});
const embedded = (actor) => ({
  origin: "official", docId: `${actor}.${BITE}`, identifier: "bite", name: "Bite", type: "weapon", rules: "2024",
  activities: [{ id: ACT, type: "attack", damageTypes: [] }], effects: [], data: `h-${actor}`
});
const ACTORS = [{ id: WOLF, name: "Dire Wolf", items: [embedded(WOLF)] }, { id: BEAR, name: "Cave Bear", items: [embedded(BEAR)] }];
const DATASET = [feature("Dire Wolf", 0), feature("Cave Bear", 1)];
const RULE = { handledIn: "table", assert: ASSERT, adds: "x", entry: { triggers: [{ fromActivity: ACT }] }, origins: ["official"] };
const stubCore = (actorItemSources) => ({
  version: "9.9.9", facts: [], vocabulary: new Set(), identifiers: new Set(), validateEntry: () => [], actorItemSources
});

describe("inventory binds a shared embedded id by <actor id>.<item id>, to the creature-scoped identifier", () => {
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "scoped-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const run = (previous = []) => inventory({
    book: "TST", kind: "monster", dataset: DATASET, dumps: { official: [], "ddb-importer": [], actors: ACTORS }, textDir, previous
  }).records;
  const rule = (records, owners, scope = true) => records.map((r) => (owners.includes(r.owner)
    ? { ...r, ...(scope ? { identifier: monsterIdentifier(r) } : {}), verdict: "entry", rule: structuredClone(RULE) } : r));
  const of = (records, owner) => records.find((r) => r.owner === owner);

  it("a rule for the wolf's feature binds the wolf's item only; the bear's feature keeps its own identifier", () => {
    const next = run(rule(run(), ["Dire Wolf"]));
    const wolf = of(next, "Dire Wolf");
    const bear = of(next, "Cave Bear");
    expect(wolf.sources).toEqual({ [`${WOLF}.${BITE}`]: "tst-dire-wolf-bite" });
    const official = wolf.items.find((i) => i.origin === "official");
    expect(official.embeddedShared).toBe(true);
    expect(official.identifierDiffers).toBeUndefined();
    expect(reaches(wolf, official)).toBe(true);
    expect(gateSchema(wolf)).toEqual([]);
    expect(checkIds(wolf, { core: stubCore(true) }).failures).toEqual([]);
    expect(bear.identifier).toBe("bite");
    expect(bear.sources).toBeUndefined();
    expect(bear.items.find((i) => i.origin === "official").embeddedShared).toBeUndefined();
  });

  it("two creatures' rules are two distinct bindings, and the unique gate accepts both", () => {
    const next = run(rule(run(), ["Dire Wolf", "Cave Bear"]));
    expect(of(next, "Dire Wolf").sources).toEqual({ [`${WOLF}.${BITE}`]: "tst-dire-wolf-bite" });
    expect(of(next, "Cave Bear").sources).toEqual({ [`${BEAR}.${BITE}`]: "tst-cave-bear-bite" });
    expect(gateUnique(next, { core: stubCore(true) })).toEqual([]);
  });

  it("a bare shared id is never bound and still fails: as a source, and unbound", () => {
    const next = run(rule(run(), ["Dire Wolf"]));
    const wolf = of(next, "Dire Wolf");
    const bare = { ...wolf, sources: { [BITE]: "tst-dire-wolf-bite" } };
    expect(sourceProblems(bare).join("\n")).toMatch(/other creatures share/);
    expect(gateSchema(bare).join("\n")).toMatch(/other creatures share/);
    const { sources, ...unbound } = wolf;
    expect(sources).toBeDefined();
    expect(checkIds(unbound, { core: stubCore(true) }).failures).toContain(`ids: ${SHARED_EMBEDDED}`);
    expect(gateSchema(unbound).join("\n")).toContain(SHARED_EMBEDDED);
    // A rule under the bare name binds nothing (a source under it would reach every creature).
    const bareName = of(run(rule(run(), ["Dire Wolf"], false)), "Dire Wolf");
    expect(bareName.sources).toBeUndefined();
    expect(gateSchema(bareName).join("\n")).toMatch(/tst-dire-wolf-bite/);
  });

  it("two records that bind one document fail the unique gate", () => {
    const next = run(rule(run(), ["Dire Wolf", "Cave Bear"]));
    const bear = of(next, "Cave Bear");
    const twice = next.map((r) => (r === bear ? { ...r, sources: { [`${WOLF}.${BITE}`]: r.identifier } } : r));
    expect(gateUnique(twice, { core: stubCore(true) }).join("\n")).toMatch(new RegExp(`${WOLF}\\.${BITE}`));
  });

  it("a refusing engine fails the rule at the validator gate; under --ci (the latest release) it does not", () => {
    const next = run(rule(run(), ["Dire Wolf"]));
    const wolf = of(next, "Dire Wolf");
    expect(gateValidator(wolf, { core: stubCore(false) })).toContain(`validator: sources ${WOLF}.${BITE}: ${ACTOR_ITEM_REFUSED}`);
    expect(gateValidator(wolf, { core: stubCore(true) })).toEqual([]);
    const ci = { core: stubCore(false), documents: {}, ci: true, legacy: new Map() };
    expect(runGates(next, ci).failures[wolf.key]?.validator ?? []).toEqual([]);
    const full = { core: stubCore(false), documents: {}, legacy: new Map() };
    expect(JSON.stringify(runGates(next, full).failures[wolf.key] ?? {})).toContain(ACTOR_ITEM_REFUSED);
    expect(stateOf(wolf)).toBe("drafted");
  });
});

describe("batch draft cuts a shared embedded id when the engine accepts actor.item sources", () => {
  const item = (docId) => ({ origin: "official", match: "matched", identifier: "bite", docId, activities: [ACT], effects: [],
    data: { sha256: "a".repeat(64) } });
  const mon = (owner, actor) => ({
    key: `tst:monster:${owner.toLowerCase().replace(/ /g, "-")}/action/bite`, name: "Bite", kind: "monster", owner,
    section: "action", book: "TST", page: 9, edition: "2024", identifier: "bite", verdict: "entry", why: "a bite",
    text: { sha256: "0".repeat(64), source: "5etools", chars: 5 },
    evidence: { triaged: { by: "reader-1", at: "2026-01-01T00:00:00.000Z", confidence: 0.9, keys: [], similar: [] } },
    items: [item(`${actor}.${BITE}`)]
  });
  const index = embeddedIndex(ACTORS.map((a) => ({ name: a.name, items: a.items })));

  it("is left out without the capability, and cut with it", () => {
    const wolf = mon("Dire Wolf", WOLF);
    expect(draftSkipReason(wolf, { embedded: index })).toBe(SHARED_EMBEDDED_REFUSED);
    expect(draftSkipReason(wolf, { embedded: index, actorItem: false })).toBe(SHARED_EMBEDDED_REFUSED);
    expect(draftSkipReason(wolf, { embedded: index, actorItem: true })).toBeNull();
    const keys = (core) => cutDraftBatches([wolf, mon("Cave Bear", BEAR)], { core, embedded: index })
      .flatMap((b) => b.entries.map((e) => [e.key, e.identifier])).sort();
    expect(keys({ actorItemSources: false })).toEqual([]);
    expect(keys({ actorItemSources: true })).toEqual([
      ["tst:monster:cave-bear/action/bite", "tst-cave-bear-bite"], ["tst:monster:dire-wolf/action/bite", "tst-dire-wolf-bite"]
    ]);
  });

  it("is left out when its official item has no <actor id>.<item id> to bind", () => {
    const loose = { ...mon("Dire Wolf", WOLF), items: [{ ...item(BITE), embeddedShared: true }] };
    expect(draftSkipReason(loose, { embedded: index, actorItem: true })).toBe("monster feature: official item has no embedded id");
  });
});

describe("ingest --draft binds the drafted creature's own item", () => {
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "scoped-draft-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const draftCore = (actorItemSources) => ({
    version: "9.9.9", facts: [], identifiers: new Set(), vocabulary: new Set(), validateEntry: () => [], moments: [],
    statuses: [], creatureTypes: [], moveModes: [], effectEnds: [], damageTypes: [], actorItemSources
  });
  const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
  const wolf = () => ({
    key: "tst:monster:dire-wolf/action/bite", name: "Bite", kind: "monster", owner: "Dire Wolf", section: "action", book: "TST",
    page: 9, edition: "2024", identifier: "bite", text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
    verdict: "entry", why: "a bite", evidence: { triaged: { by: "reader-1", at: "2026-01-01T00:00:00.000Z", confidence: 0.9 } },
    items: [{ origin: "official", match: "matched", identifier: "bite", docId: `${WOLF}.${BITE}`, activities: [ACT],
      effects: [], data: { sha256: "a".repeat(64) } }]
  });
  const result = { key: "tst:monster:dire-wolf/action/bite", outcome: "rule", why: "a bite", confidence: 0.9,
    rule: { handledIn: "table", adds: "A save halves it.", entry: { saveDamage: { [ACT]: "half" } }, origins: ["official"],
      assert: [{ given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } }] } };
  const index = new Map([["TST", embeddedIndex(ACTORS.map((a) => ({ name: a.name, items: a.items })))]]);
  const run = (core) => ingestDrafts([wolf()], [result], { textDir, by: "drafter-1", at: "2026-01-01T00:00:00.000Z", core,
    offered: new Set([result.key]), embedded: index });

  it("with the capability: the rule is applied, its source is the wolf's <actor id>.<item id>", () => {
    const out = run(draftCore(true));
    expect(out.rejected).toEqual([]);
    const [next] = out.records;
    expect(next.identifier).toBe("tst-dire-wolf-bite");
    expect(next.sources).toEqual({ [`${WOLF}.${BITE}`]: "tst-dire-wolf-bite" });
    expect(next.items[0].embeddedShared).toBe(true);
  });

  it("without it: rejected, nothing kept, as before", () => {
    const out = run(draftCore(false));
    expect(out.applied).toEqual([]);
    expect(out.rejected[0].reason).toContain(ACTOR_ITEM_REFUSED);
    expect(out.records[0]).toEqual(wolf());
  });
});

// Ruling R29 for a shared embedded id: the engine's reading, the comparison and the carry are those of the right creature's
// item. A stand-in engine: its text layer reads "noOpportunity" from a description that says "slips away", nothing else.
describe("the engine's reading and the carry use the item of the creature the rule binds", () => {
  const SLIPS = "<p>The wolf slips away after the bite.</p>";
  const HUMS = "<p>The bear hums a tune nobody remembers.</p>";
  const doc = (html) => ({ _id: BITE, name: "Bite", type: "feat", system: { identifier: "bite", description: { value: html },
    activities: {} }, effects: [], flags: {} });
  const core = (over = {}) => ({
    version: "9.9.9", shipped: { bite: { magical: true } }, sources: {}, runtimeIdentifiers: new Map(), systemHandled: new Map(),
    monsterTextLayer: ({ html }) => (html.includes("slips away") ? { noOpportunity: "afterUse" } : {}),
    mergeEntries: (layers) => Object.assign({}, ...layers.filter(Boolean)), ...over
  });
  const record = (owner, actor, sha) => ({
    key: `tst:monster:${owner}/action/bite`, kind: "monster", owner, identifier: `tst-${owner}-bite`,
    sources: { [`${actor}.${BITE}`]: `tst-${owner}-bite` },
    items: [{ origin: "official", match: "matched", identifier: "bite", docId: `${actor}.${BITE}`, activities: [], effects: [],
      embeddedShared: true, data: { sha256: sha.repeat(64) } }],
    rule: { handledIn: "table", entry: { noOpportunity: "afterUse" }, origins: ["official"] }
  });
  const documents = { official: { [`${WOLF}.${BITE}`]: doc(SLIPS), [`${BEAR}.${BITE}`]: doc(HUMS) } };

  it("reads the wolf's item for the wolf's rule, the bear's for the bear's", () => {
    const wolf = readingOfRecord(record("wolf", WOLF, "a"), documents, core());
    expect(wolf).toMatchObject({ same: ["noOpportunity"], delta: [], carried: ["magical"], original: "bite" });
    const bear = readingOfRecord(record("bear", BEAR, "b"), documents, core());
    expect(bear).toMatchObject({ same: [], delta: ["noOpportunity"], carried: ["magical"], original: "bite" });
    // The evidence is bound to the item it was computed on: the wolf's reading never stands for the bear's record.
    const bearRecord = record("bear", BEAR, "b");
    expect(currentReading({ ...bearRecord, evidence: { reading: bear } })).toEqual(bear);
    expect(currentReading({ ...bearRecord, evidence: { reading: wolf } })).toBeNull();
  });

  it("the original identifier is the creature's own: an engine source for one creature does not name the other", () => {
    const scoped = core({ sources: { [`${WOLF}.${BITE}`]: "engine-wolf-bite" } });
    expect(originalIdentifierOf(doc(SLIPS), scoped, { actorId: WOLF })).toBe("engine-wolf-bite");
    expect(originalIdentifierOf(doc(HUMS), scoped, { actorId: BEAR })).toBe("bite");
    // The bear's feature, which no rule binds, is read by the engine under its own identifier, with its own entry.
    expect(engineReading(doc(HUMS), scoped, { actorId: BEAR })).toBeNull();
    const comparison = engineComparison(doc(SLIPS), record("wolf", WOLF, "a"), scoped, { actorId: WOLF });
    expect(comparison.original).toBe("engine-wolf-bite");
    expect(comparison.target).toBe("tst-wolf-bite");
  });
});

describe.skipIf(!HAS_KEY_LOOKUP)("the engine's own key lookup (core/source-keys.mjs sourceKeys) with the pack's sources", () => {
  it("finds the wolf's feature, in the compendium and as a world copy, and never the bear's", async () => {
    const { sourceKeys } = await import(pathToFileURL(join(CORE_DIR, "module/scripts/core/source-keys.mjs")).href);
    const SOURCES = { [`${WOLF}.${BITE}`]: "tst-dire-wolf-bite" };
    const found = (o) => sourceKeys(o).find((k) => k in SOURCES);
    const itemSource = `Compendium.tst-monsters.features.Item.${BITE}`;
    expect(found({ itemSource, itemId: BITE, actorId: WOLF })).toBe(`${WOLF}.${BITE}`);
    expect(found({ itemSource, itemId: BITE, actorId: "Wd00Wd11Wd22Wd33",
      actorSource: `Compendium.tst-monsters.actors.Actor.${WOLF}` })).toBe(`${WOLF}.${BITE}`);
    expect(found({ itemSource, itemId: BITE, actorId: BEAR })).toBeUndefined();
    expect(found({ itemSource: null, itemId: BITE, actorId: BEAR })).toBeUndefined();
  });
});
