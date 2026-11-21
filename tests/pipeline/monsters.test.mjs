import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readMonsterFeatures, readMonsters, baseFeatureName, actorCandidates } from "../../tools/pipeline/monsters.mjs";
import { readEntries } from "../../tools/pipeline/dataset.mjs";
import { KIND_TABLE } from "../../tools/pipeline/kinds.mjs";
import { inventory, INVENTORY_KINDS } from "../../tools/pipeline/inventory.mjs";
import { keyOf, validateRecord } from "../../tools/pipeline/registry.mjs";
import { identityOf } from "../../tools/pipeline/match.mjs";
import { itemSummary } from "../../tools/pipeline/dumps.mjs";

// Synthetic fixtures only: invented creatures.
const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "dataset");
const read = (book = "XZZ") => readMonsterFeatures(dir, book, {});
const keys = (features) => features.map((f) => keyOf({ book: "XZZ", ...f }));

describe("baseFeatureName", () => {
  it("strips recharge markup and the cost, daily and recharge qualifiers, nothing else", () => {
    expect(baseFeatureName("Radiant Burst {@recharge 5}")).toBe("Radiant Burst");
    expect(baseFeatureName("Radiant Burst {@recharge}")).toBe("Radiant Burst");
    expect(baseFeatureName("Gleam (Costs 2 Actions)")).toBe("Gleam");
    expect(baseFeatureName("Pack Tactics (3/Day)")).toBe("Pack Tactics");
    expect(baseFeatureName("Cold Snap (Recharge 5-6)")).toBe("Cold Snap");
    expect(baseFeatureName("Cold Snap (Recharges after a Short or Long Rest)")).toBe("Cold Snap");
    expect(baseFeatureName("Shimmer (Costs 3 Actions) {@recharge 4}")).toBe("Shimmer");
    expect(baseFeatureName("Form (Beast)")).toBe("Form (Beast)");
    expect(baseFeatureName("Plain Name")).toBe("Plain Name");
  });
});

describe("readMonsterFeatures", () => {
  it("lists every feature of every creature of the book, section by section, leaving other books out", () => {
    const features = read();
    expect(features.map((f) => `${f.owner}/${f.section}/${f.name}`)).toEqual([
      "Glimmer Hound/trait/Keen Nose", "Glimmer Hound/trait/Pack Tactics", "Glimmer Hound/trait/Spellcasting",
      "Glimmer Hound/action/Multiattack", "Glimmer Hound/action/Claw", "Glimmer Hound/action/Claw",
      "Glimmer Hound/action/Radiant Burst", "Glimmer Hound/bonus/Dash", "Glimmer Hound/reaction/Yelp",
      "Glimmer Hound/legendary/Gleam",
      "Glimmer Hound Alpha/action/Howl",
      "Ghost Cart/trait/Rattle", "Ghost Cart/mythic/Rolls Again",
    ]);
    expect(features[0]).toEqual({
      name: "Keen Nose", kind: "monster", owner: "Glimmer Hound", section: "trait", book: "XZZ", page: 12, edition: "2024",
      srd: true, text: "Advantage on Perception checks that rely on scent.", creatureIndex: 0,
    });
    expect(features.every((f) => f.kind === "monster" && f.book === "XZZ")).toBe(true);
  });

  it("numbers a repeated name within one creature and section, in dataset order", () => {
    const claws = read().filter((f) => f.name === "Claw");
    expect(claws.map((f) => f.occurrence)).toEqual([undefined, 2]);
    expect(keys(claws)).toEqual([
      "xzz:monster:glimmer-hound/action/claw", "xzz:monster:glimmer-hound/action/claw#2",
    ]);
    expect(keys(read()).slice(0, 3)).toEqual([
      "xzz:monster:glimmer-hound/trait/keen-nose", "xzz:monster:glimmer-hound/trait/pack-tactics",
      "xzz:monster:glimmer-hound/trait/spellcasting",
    ]);
  });

  it("reads each spellcasting block as one trait named as the block", () => {
    const [block] = read().filter((f) => f.name === "Spellcasting");
    expect(block).toMatchObject({ section: "trait", owner: "Glimmer Hound" });
    expect(block.text).toContain("invented glimmers");
    expect(block.text).toContain("glimmer bolt");
  });

  it("lists only the own sections of a _copy creature, with copyOf, and inherits nothing", () => {
    const alpha = read().filter((f) => f.owner === "Glimmer Hound Alpha");
    expect(alpha).toEqual([{
      name: "Howl", kind: "monster", owner: "Glimmer Hound Alpha", section: "action", book: "XZZ", page: 13, edition: "2024",
      srd: false, text: "Calls the pack.", copyOf: "Glimmer Hound|XZZ", creatureIndex: 1,
    }]);
    expect(read().some((f) => f.owner === "Glimmer Pup")).toBe(false);
  });

  it("reports the creatures, with the copies among them", () => {
    const { creatures } = readMonsters(dir, "XZZ", {});
    expect(creatures).toEqual([
      { name: "Glimmer Hound", features: 10 },
      { name: "Glimmer Hound Alpha", features: 1, copyOf: "Glimmer Hound|XZZ" },
      { name: "Glimmer Pup", features: 0, copyOf: "Glimmer Hound|XZZ" },
      { name: "Ghost Cart", features: 2 },
    ]);
  });

  it("is what readEntries returns for kind monster, and [] for a book with no bestiary", () => {
    expect(readEntries(dir, "XZZ", "monster")).toEqual(read());
    expect(read("NOPE")).toEqual([]);
    expect(KIND_TABLE.monster.docTypes).toContain("feat");
    expect(INVENTORY_KINDS.at(-1)).toBe("monster");
  });

  it("gives a creature a feature of a repeated slug in one section a number even if the spelling differs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "mon-"));
    try {
      mkdirSync(join(tmp, "bestiary"));
      writeFileSync(join(tmp, "bestiary", "bestiary-xzz.json"), JSON.stringify({ monster: [{
        name: "Twin", source: "XZZ", page: 1,
        action: [{ name: "Bite", entries: ["a"] }, { name: "bite (Costs 2 Actions)", entries: ["b"] }, { entries: ["no name"] }],
      }] }));
      expect(keys(readMonsterFeatures(tmp, "XZZ", {}))).toEqual([
        "xzz:monster:twin/action/bite", "xzz:monster:twin/action/bite#2",
      ]);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
});

describe("keyOf and identityOf for monster features", () => {
  it("builds <book>:monster:<creature>/<section>/<feature>, numbering repeats from #2", () => {
    const f = { book: "MM", kind: "monster", owner: "Rime Wolf", section: "action", name: "Frost Bite" };
    expect(keyOf(f)).toBe("mm:monster:rime-wolf/action/frost-bite");
    expect(keyOf({ ...f, occurrence: 3 })).toBe("mm:monster:rime-wolf/action/frost-bite#3");
    expect(keyOf({ ...f, occurrence: 1 })).toBe("mm:monster:rime-wolf/action/frost-bite");
    expect(keyOf({ ...f, section: "legendary" })).not.toBe(keyOf(f));
  });
  it("slugs a creature name as one part even with a slash, and refuses a monster without a section", () => {
    expect(keyOf({ book: "MM", kind: "monster", owner: "Fey/Beast", section: "trait", name: "Mist" }))
      .toBe("mm:monster:fey-beast/trait/mist");
    expect(() => keyOf({ book: "MM", kind: "monster", owner: "Wolf", name: "Bite" })).toThrow(/section/);
  });
  it("keeps the identity of two repeats apart", () => {
    const f = { name: "Claw", kind: "monster", edition: "2024", owner: "Hound", section: "action" };
    expect(identityOf(f)).not.toBe(identityOf({ ...f, occurrence: 2 }));
    expect(identityOf(f)).toBe("hound/action/claw|monster|2024");
  });
});

// An actor document as the dumps hold it, summarised: { id, name, items: [item summaries with docId actor.item] }.
const item = (id, name, over = {}) => ({
  origin: "official", docId: `act1.${id}`, identifier: name.toLowerCase().replace(/\W+/g, "-"), name, type: "feat",
  rules: "2024", activities: [{ id: "a1", type: "attack", damageTypes: ["slashing"] }],
  effects: [{ id: "e1", name: "x", statuses: [] }],
  data: `h-${id}`, ...over,
});
const actor = (id, name, items) => ({ id, name, items: items.map((i) => ({ ...i, docId: `${id}.${i.docId.split(".")[1]}` })) });
const HOUND = actor("act1", "Glimmer Hound", [
  item("i1", "Keen Nose"), item("i2", "Multiattack"), item("i3", "Claw"), item("i4", "Claw"), item("i5", "Radiant Burst"),
]);

describe("actorCandidates", () => {
  it("is the embedded items of the actors of the creature's name", () => {
    expect(actorCandidates("Glimmer Hound", [HOUND, actor("act9", "Other", [item("z", "Zap")])]))
      .toEqual({ found: true, ambiguous: false, candidates: HOUND.items });
  });
  it("finds no actor of another name, and reads the name as the matcher does", () => {
    expect(actorCandidates("Glimmer Pup", [HOUND])).toEqual({ found: false, ambiguous: false, candidates: [] });
    expect(actorCandidates("the glimmer hound", [HOUND]).found).toBe(true);
  });
  it("takes several actors with identical embedded item ids as one, and differing ones as ambiguous", () => {
    const twin = actor("act2", "Glimmer Hound", HOUND.items);
    const same = actorCandidates("Glimmer Hound", [HOUND, { ...twin, items: HOUND.items.map((i) => ({ ...i })) }]);
    expect(same).toMatchObject({ found: true, ambiguous: false });
    expect(same.candidates).toHaveLength(HOUND.items.length);
    const other = actor("act2", "Glimmer Hound", [item("j1", "Keen Nose")]);
    const diff = actorCandidates("Glimmer Hound", [HOUND, other]);
    expect(diff).toMatchObject({ found: true, ambiguous: true });
    expect(diff.candidates.map((c) => c.docId)).toEqual([...HOUND.items.map((i) => i.docId), "act2.j1"]);
  });
});

describe("inventory of monster features", () => {
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "mon-inv-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const run = (over = {}) => {
    const { features, creatures } = readMonsters(dir, "XZZ", {});
    return inventory({
      book: "XZZ", kind: "monster", dataset: features, creatures, dumps: { official: [], "ddb-importer": [], actors: [HOUND] },
      textDir, previous: [], ...over,
    });
  };
  const byKey = (records) => Object.fromEntries(records.map((r) => [r.key, r]));

  it("writes a valid record per feature with owner, section, base name and the actor item as official origin", () => {
    const { records } = run();
    expect(records).toHaveLength(13);
    expect(records.every((r) => validateRecord(r).length === 0)).toBe(true);
    const nose = byKey(records)["xzz:monster:glimmer-hound/trait/keen-nose"];
    expect(nose).toMatchObject({
      name: "Keen Nose", kind: "monster", owner: "Glimmer Hound", section: "trait", page: 12, edition: "2024", srd: true,
    });
    expect(nose.items[0]).toEqual({
      origin: "official", match: "matched", identifier: "keen-nose", docId: "act1.i1", activities: ["a1"], effects: ["e1"],
      data: { sha256: "h-i1" },
    });
    expect(nose.items.map((i) => i.origin)).toEqual(["official", "plutonium"]);
    const burst = byKey(records)["xzz:monster:glimmer-hound/action/radiant-burst"];
    expect(burst.name).toBe("Radiant Burst");
    expect(burst.items[0]).toMatchObject({ match: "matched", docId: "act1.i5" });
  });

  it("marks features with no embedded item of the name absent, and every feature of an actorless creature", () => {
    const { records, report } = run();
    const r = byKey(records);
    expect(r["xzz:monster:glimmer-hound/trait/pack-tactics"].items.map((i) => i.origin)).toEqual(["plutonium"]);
    expect(r["xzz:monster:ghost-cart/trait/rattle"].items.map((i) => i.origin)).toEqual(["plutonium"]);
    expect(report.noActor).toBe(3);
    expect(report.noOfficial).toContain("xzz:monster:ghost-cart/mythic/rolls-again");
    expect(report.noOfficial).toContain("xzz:monster:glimmer-hound/trait/pack-tactics");
    expect(report.noOfficial).not.toContain("xzz:monster:glimmer-hound/trait/keen-nose");
  });

  it("counts creatures and copies, and records copyOf on the features a copy defines", () => {
    const { records, report } = run();
    expect(report).toMatchObject({ creatures: 4, copies: 2, added: 13, collisions: [] });
    expect(byKey(records)["xzz:monster:glimmer-hound-alpha/action/howl"]).toMatchObject({ copyOf: "Glimmer Hound|XZZ" });
    expect(report.noActor).toBe(3);
  });

  it("keeps a repeated feature apart with #2, each one ambiguous between the same-name items", () => {
    const { records, report } = run();
    const r = byKey(records);
    expect(r["xzz:monster:glimmer-hound/action/claw"]).toMatchObject({ name: "Claw", page: 12 });
    expect(r["xzz:monster:glimmer-hound/action/claw#2"]).toMatchObject({ name: "Claw", occurrence: 2 });
    expect(r["xzz:monster:glimmer-hound/action/claw#2"].items[0]).toMatchObject({ origin: "official", match: "ambiguous" });
    expect(r["xzz:monster:glimmer-hound/action/claw#2"].items[0].candidates.map((c) => c.docId)).toEqual(["act1.i3", "act1.i4"]);
    expect(report.ambiguous).toEqual([
      "xzz:monster:glimmer-hound/action/claw", "xzz:monster:glimmer-hound/action/claw#2",
    ]);
  });

  it("makes the features of a creature ambiguous when its same-name actors differ in embedded items", () => {
    const other = actor("act2", "Glimmer Hound", [item("j1", "Keen Nose")]);
    const { records } = run({ dumps: { official: [], "ddb-importer": [], actors: [HOUND, other] } });
    const nose = byKey(records)["xzz:monster:glimmer-hound/trait/keen-nose"];
    expect(nose.items[0]).toMatchObject({ origin: "official", match: "ambiguous", differences: ["actor"] });
    expect(nose.items[0].candidates.map((c) => c.docId)).toEqual(["act1.i1", "act2.j1"]);
    expect(byKey(records)["xzz:monster:glimmer-hound/trait/pack-tactics"].items.map((i) => i.origin)).toEqual(["plutonium"]);
  });

  it("never asks DDB Importer: it has no monster dump", () => {
    const ddb = [item("x", "Keen Nose", { origin: "ddb-importer", docId: "ddb1" })];
    const { records } = run({ dumps: { official: [], "ddb-importer": ddb, actors: [HOUND] } });
    const nose = byKey(records)["xzz:monster:glimmer-hound/trait/keen-nose"];
    expect(nose.items.map((i) => i.origin)).toEqual(["official", "plutonium"]);
  });

  it("reports two creatures of one name as collisions: the second gets no record", () => {
    const { features, creatures } = readMonsters(dir, "XZZ", {});
    const again = features.filter((f) => f.owner === "Ghost Cart").map((f) => ({ ...f, page: 99, creatureIndex: 99 }));
    const { records, report } = run({
      dataset: [...features, ...again], creatures: [...creatures, { name: "Ghost Cart", features: 2 }],
    });
    expect(records).toHaveLength(13);
    expect(report.collisions.map((c) => c.key)).toEqual([
      "xzz:monster:ghost-cart/trait/rattle", "xzz:monster:ghost-cart/mythic/rolls-again",
    ]);
    expect(report.collisions[0].entries.map((e) => e.page)).toEqual([20, 99]);
  });

  it("leaves everything a re-run finds untouched, keys, verdicts and notes included", () => {
    const first = run();
    const decided = { verdict: "data", why: "kept", note: "n" };
    const edited = structuredClone(first.records).map((r) => (r.name === "Dash" ? { ...r, ...decided } : r));
    const again = run({ previous: edited });
    expect(again.report).toMatchObject({ added: 0, kept: 13 });
    expect(again.records.map((r) => r.key).sort()).toEqual(first.records.map((r) => r.key).sort());
    expect(again.records.find((r) => r.name === "Dash")).toMatchObject({ verdict: "data", why: "kept", note: "n" });
  });
});

describe("pipeline CLI: inventory <BOOK> monster", () => {
  let tmp, env;
  const write = (rel, data) => {
    const file = join(tmp, rel);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  };
  const run = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "mon-cli-"));
    env = {
      PATH: process.env.PATH, RULEPACK_DATASET: join(tmp, "data"), RULEPACK_DUMPS: join(tmp, "dumps"),
      RULEPACK_TEXT: join(tmp, "text"), RULEPACK_REGISTRY: join(tmp, "registry"),
    };
    write("data/bestiary/bestiary-tce.json", { monster: [
      { name: "Ember Mole", source: "TCE", page: 7, trait: [{ name: "Burrow Sense", entries: ["Feels tremors."] }],
        action: [{ name: "Scorch {@recharge 6}", entries: ["Flames."] }] },
      { name: "Ember Mole Elder", source: "TCE", page: 8, _copy: { name: "Ember Mole", source: "TCE" } },
    ] });
    write("dumps/dnd-tashas-cauldron.actors.json", [{
      _id: "actorAAAAAAAAAAA", name: "Ember Mole", type: "npc", system: {},
      items: [{
        _id: "itemAAAAAAAAAAAA", name: "Scorch", type: "feat", effects: [],
        system: {
          identifier: "scorch", source: { rules: "2014" },
          activities: { actAAAAAAAAAAAAA: { type: "attack", activation: { type: "action" } } },
        },
      }],
    }]);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("writes one record per feature, matched to the embedded item, and reports creatures, copies and noActor", () => {
    const r = run(["inventory", "TCE", "monster"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ added: 2, creatures: 2, copies: 1, noActor: 1, ambiguous: [] });
    const { records } = JSON.parse(readFileSync(join(tmp, "registry", "tce.json"), "utf8"));
    const scorch = records.find((x) => x.name === "Scorch");
    expect(scorch).toMatchObject({ key: "tce:monster:ember-mole/action/scorch", owner: "Ember Mole", section: "action" });
    expect(scorch.items[0]).toMatchObject({ origin: "official", match: "matched", docId: "actorAAAAAAAAAAA.itemAAAAAAAAAAAA" });
    expect(records.find((x) => x.name === "Burrow Sense").items.map((i) => i.origin)).toEqual(["plutonium"]);
  });

  it("is part of all, last, and keeps the other kinds' reports", () => {
    write("data/spells/spells-tce.json", {
      spell: [{ name: "Glimmer Bolt", page: 10, level: 2, school: "V", entries: ["Invented."] }],
    });
    const r = run(["inventory", "TCE", "all"]);
    expect(r.status).toBe(0);
    expect(Object.keys(JSON.parse(r.stdout)).at(-1)).toBe("monster");
  });
});

// An embedded item that says how it is activated: `activations` as itemSummary computes it.
const acting = (id, name, activations) => item(id, name, { activations });
const claw = (section, name = "Bite") => ({
  name, kind: "monster", owner: "Wolf", section, book: "XZZ", page: 3, edition: "2024", srd: false, text: `${section} ${name}.`,
  creatureIndex: 0,
});
const runWith = (dataset, items, over = {}) => {
  const dir0 = mkdtempSync(join(tmpdir(), "mon-sec-"));
  try {
    return inventory({
      book: "XZZ", kind: "monster", dataset, dumps: { official: [], "ddb-importer": [], actors: [actor("w1", "Wolf", items)] },
      textDir: dir0, previous: [], ...over,
    });
  } finally { rmSync(dir0, { recursive: true, force: true }); }
};
const officialOf = (r) => r.items.find((i) => i.origin === "official");

describe("itemSummary activations", () => {
  const doc = (activities) => ({ _id: "d", name: "Bite", type: "feat", system: { activities }, effects: [] });
  it("names how an embedded item is activated, a passive one being a trait and an unstated one neutral", () => {
    const act = (type) => ({ type: "attack", activation: { type } });
    expect(itemSummary(doc({ a: act("action"), b: act("legendary") }), "official").activations).toEqual(["action", "legendary"]);
    expect(itemSummary(doc({ a: act("") }), "official").activations).toEqual(["trait"]);
    expect(itemSummary(doc({}), "official").activations).toEqual(["trait"]);
    expect(itemSummary(doc({ a: { type: "attack" } }), "official").activations).toEqual([]);
    expect(itemSummary(doc({ a: act("special") }), "official").activations).toEqual([]);
  });
});

describe("monster features and the activation of the embedded item", () => {
  it("matches the same name as an action and as a legendary action each to its own item", () => {
    const items = [acting("a", "Bite", ["action"]), acting("b", "Bite", ["legendary"])];
    const { records } = runWith([claw("action"), claw("legendary")], items);
    const [a, l] = records;
    expect(officialOf(a)).toMatchObject({ match: "matched", docId: "w1.a" });
    expect(officialOf(l)).toMatchObject({ match: "matched", docId: "w1.b" });
  });
  it("matches only the agreeing feature when there is one item, the other is absent", () => {
    const { records } = runWith([claw("action"), claw("legendary")], [acting("a", "Bite", ["action"])]);
    expect(officialOf(records[0])).toMatchObject({ match: "matched", docId: "w1.a" });
    expect(officialOf(records[1])).toBeUndefined();
  });
  it("makes both features ambiguous (section) when one neutral item is claimed by two", () => {
    const { records, report } = runWith([claw("action"), claw("legendary")], [acting("a", "Bite", [])]);
    for (const r of records) {
      expect(officialOf(r)).toMatchObject({ match: "ambiguous", differences: ["section"] });
      expect(officialOf(r).candidates.map((c) => c.docId)).toEqual(["w1.a"]);
    }
    expect(report.ambiguous).toHaveLength(2);
  });
  it("does not compare the section of a spellcasting block with the activation of its item", () => {
    const block = { ...claw("trait", "Spellcasting"), spellcastingBlock: true };
    const { records } = runWith([block], [acting("a", "Spellcasting", ["action"])]);
    expect(officialOf(records[0])).toMatchObject({ match: "matched", docId: "w1.a" });
  });
  it("takes an item that lists several activations for any of them", () => {
    const { records } = runWith([claw("bonus")], [acting("a", "Bite", ["action", "bonus"])]);
    expect(officialOf(records[0])).toMatchObject({ match: "matched" });
  });
});

describe("keys of repeated features across runs", () => {
  const feat = (text, extra = {}) => ({ ...claw("action", "Claw"), text, ...extra });
  const first = () => runWith([feat("one"), feat("two")], []).records;
  const byText = (records) => Object.fromEntries(records.map((r) => [r.key, r.text.sha256]));
  const sha = (text) => runWith([feat(text)], []).records[0].text.sha256;

  it("keeps the number of the survivor when the first of two is removed, and lists the other as vanished", () => {
    const records = first();
    const again = runWith([feat("two")], [], { previous: records });
    expect(again.report).toMatchObject({ added: 0, kept: 1, vanished: ["xzz:monster:wolf/action/claw"] });
    expect(again.records).toHaveLength(2);
    const survivor = again.records.find((r) => r.key === "xzz:monster:wolf/action/claw#2");
    expect(survivor.text.sha256).toBe(sha("two"));
    expect(again.records.find((r) => r.key === "xzz:monster:wolf/action/claw").text.sha256).toBe(sha("one"));
  });
  it("keeps existing keys when a same-name feature is added before them, the new one taking the next free number", () => {
    const records = first();
    const again = runWith([feat("new"), feat("one"), feat("two")], [], { previous: records });
    expect(again.report).toMatchObject({ added: 1, kept: 2, vanished: [] });
    const t = byText(again.records);
    expect(t["xzz:monster:wolf/action/claw"]).toBe(sha("one"));
    expect(t["xzz:monster:wolf/action/claw#2"]).toBe(sha("two"));
    expect(t["xzz:monster:wolf/action/claw#3"]).toBe(sha("new"));
  });
  it("keeps the record of a lone feature whose text changed, and never lists a kept record as vanished", () => {
    const [one] = runWith([feat("one")], []).records;
    const again = runWith([feat("changed")], [], { previous: [one] });
    expect(again.report).toMatchObject({ added: 0, kept: 1, textChanged: ["xzz:monster:wolf/action/claw"], vanished: [] });
  });
  it("lists the records of other kinds a run no longer produces as vanished, never deleting them", () => {
    const { records } = inventory({
      book: "XZZ", kind: "spell",
      dataset: [{ name: "Old", book: "XZZ", page: 1, edition: "2024", srd: false, text: "t", level: 1, school: "V" }],
      dumps: { official: [], "ddb-importer": [] }, textDir: mkdtempSync(join(tmpdir(), "van-")), previous: [],
    });
    const again = inventory({
      book: "XZZ", kind: "spell", dataset: [], dumps: { official: [], "ddb-importer": [] }, textDir: tmpdir(), previous: records,
    });
    expect(again.report.vanished).toEqual(["xzz:spell:old"]);
    expect(again.records).toEqual(records);
  });
});

describe("monster identity, skipped names", () => {
  it("does not merge a same-named creature of a second book into the first book's records", () => {
    const first = runWith([claw("action")], []).records;
    const second = runWith([{ ...claw("action"), book: "YZZ" }], [], { book: "YZZ", previous: first });
    expect(second.records.map((r) => [r.key, r.book]).sort()).toEqual([
      ["xzz:monster:wolf/action/bite", "XZZ"], ["yzz:monster:wolf/action/bite", "YZZ"],
    ]);
    expect(second.report).toMatchObject({ added: 1 });
    expect(second.records.find((r) => r.book === "XZZ").alsoIn).toBeUndefined();
  });
  it("counts features and creatures whose name slugs to nothing under skipped", () => {
    const dataset = [claw("action"), { ...claw("action"), name: "!!!" }, { ...claw("action"), owner: "???", name: "Ok" }];
    const { records, report } = runWith(dataset, [], { creatures: [{ name: "Wolf", features: 2 }, { name: "???", features: 1 }] });
    expect(records).toHaveLength(1);
    expect(report.skipped).toBe(3);
  });
});
