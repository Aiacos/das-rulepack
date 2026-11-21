import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { inventory } from "../../tools/pipeline/inventory.mjs";
import { ddbActorCandidates } from "../../tools/pipeline/monsters.mjs";
import { actorSummaries, itemSummary, docIndex, findDocument } from "../../tools/pipeline/dumps.mjs";
import { poolOf } from "../../tools/pipeline/settle.mjs";
import { loadDocuments } from "../../tools/pipeline/cli.mjs";

// Synthetic fixtures only: invented creatures. DDB Importer's monsters are the embedded items of its actors.
const feature = (name, section, over = {}) => ({
  name, kind: "monster", owner: "Mist Weasel", section, book: "XZZ", page: 3, edition: "2024", srd: false,
  text: `${section} ${name}.`, creatureIndex: 0, ...over
});
const item = (origin, id, name, over = {}) => ({
  origin, docId: `x.${id}`, identifier: name.toLowerCase().replace(/\W+/g, "-"), name, type: "feat", rules: undefined,
  activities: [{ id: "a1", type: "attack", damageTypes: ["slashing"] }], effects: [{ id: "e1", name: "x", statuses: [] }],
  activations: ["action"], data: `h-${origin}-${id}`, ...over
});
const actor = (origin, id, name, items, edition) => ({
  id, name, ...(edition ? { edition } : {}),
  items: items.map((i) => ({ ...i, origin, docId: `${id}.${i.docId.split(".")[1]}` }))
});
const official = (items) => actor("official", "off1", "Mist Weasel", items);
const ddb = (id, items, edition = "2024", name = "Mist Weasel") => actor("ddb-importer", id, name, items, edition);
const O = (id, name, over) => item("official", id, name, over);
const D = (id, name, over) => item("ddb-importer", id, name, over);

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "ddb-mon-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));
const run = (dataset, { actors = [], ddbActors = [], previous = [], creatures } = {}) => inventory({
  book: "XZZ", kind: "monster", dataset, creatures, dumps: { official: [], "ddb-importer": [], actors, ddbActors },
  textDir, previous
});
const itemsOf = (r) => Object.fromEntries(r.items.map((i) => [i.origin, i]));

describe("ddbActorCandidates", () => {
  const A = ddb("d1", [D("1", "Claw")]);
  it("takes the actors of the creature's name and edition, items carrying the actor's edition", () => {
    const out = ddbActorCandidates("Mist Weasel", [A, ddb("d2", [D("2", "Bite")], "2014")], "2024");
    expect(out).toMatchObject({ found: true, ambiguous: false });
    expect(out.candidates.map((c) => [c.docId, c.rules])).toEqual([["d1.1", "2024"]]);
  });
  it("is not found when the name exists only in the other edition, and hands those items over", () => {
    const out = ddbActorCandidates("Mist Weasel", [ddb("d2", [D("2", "Bite")], "2014")], "2024");
    expect(out).toMatchObject({ found: false, candidates: [] });
    expect(out.otherEdition.map((c) => c.docId)).toEqual(["d2.2"]);
  });
  it("uses an actor with no stated edition, and prefers the ones that state it", () => {
    const none = ddb("d3", [D("3", "Claw")], null);
    expect(ddbActorCandidates("Mist Weasel", [none], "2024").candidates[0].rules).toBeUndefined();
    expect(ddbActorCandidates("Mist Weasel", [none, A], "2024").candidates.map((c) => c.docId)).toEqual(["d1.1"]);
  });
});

describe("monster features matched against DDB Importer's actors", () => {
  it("joins the embedded item of the actor of the creature's edition, after the official one", () => {
    const { records, report } = run([feature("Claw", "action")], {
      actors: [official([O("1", "Claw")])], ddbActors: [ddb("d1", [D("7", "Claw")])]
    });
    expect(records[0].items.map((i) => i.origin)).toEqual(["official", "ddb-importer", "plutonium"]);
    expect(itemsOf(records[0])["ddb-importer"]).toEqual({
      origin: "ddb-importer", match: "matched", identifier: "claw", docId: "d1.7", activities: ["a1"], effects: ["e1"],
      data: { sha256: "h-ddb-importer-7" }
    });
    expect(report).toMatchObject({ noActor: 0, noDdbActor: 0 });
  });

  it("asks DDB Importer even where there is no official actor, and counts each absence apart", () => {
    const dataset = [feature("Claw", "action"), feature("Hiss", "action", { owner: "Dusk Newt", creatureIndex: 1 })];
    const { records, report } = run(dataset, { ddbActors: [ddb("d1", [D("7", "Claw")])] });
    expect(records[0].items.map((i) => i.origin)).toEqual(["ddb-importer", "plutonium"]);
    expect(records[1].items.map((i) => i.origin)).toEqual(["plutonium"]);
    expect(report).toMatchObject({ creatures: 2, noActor: 2, noDdbActor: 1 });
  });

  it("never lets a DDB item name the record: with no official item the identifier stays the feature's own", () => {
    const { records } = run([feature("Sneak Attack", "trait")], {
      ddbActors: [ddb("d1", [D("7", "Sneak Attack (1/Turn)", { identifier: "sneak-attack-1-turn", activations: [] })])]
    });
    expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({ match: "matched", identifier: "sneak-attack-1-turn" });
    expect(records[0].identifier).toBe("sneak-attack");
    expect(itemsOf(records[0])["ddb-importer"].identifierDiffers).toBe(true);
  });

  it("leaves the flat DDB item list alone: only actors count", () => {
    const flat = [D("9", "Claw", { origin: "ddb-importer", docId: "flat1" })];
    const { records } = inventory({
      book: "XZZ", kind: "monster", dataset: [feature("Claw", "action")],
      dumps: { official: [], "ddb-importer": flat, actors: [official([O("1", "Claw")])] }, textDir, previous: []
    });
    expect(records[0].items.map((i) => i.origin)).toEqual(["official", "plutonium"]);
  });

  describe("sections", () => {
    it("accepts a neutral item and one whose activation agrees, refuses one that names another section", () => {
      const ddbActors = [ddb("d1", [D("1", "Claw", { activations: [] }), D("2", "Hiss", { activations: ["bonus"] })])];
      const { records } = run([feature("Claw", "action"), feature("Hiss", "action"), feature("Hiss", "bonus")], { ddbActors });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({ match: "matched", docId: "d1.1" });
      // The one same-name item is of another section and nothing else claims it: matched, visibly.
      expect(itemsOf(records[1])["ddb-importer"]).toBeUndefined();
      expect(itemsOf(records[2])["ddb-importer"]).toMatchObject({ match: "matched", docId: "d1.2" });
    });

    it("takes the only same-name item of another section, with the difference section, when no other feature claims it", () => {
      const { records } = run([feature("Hiss", "action")], {
        ddbActors: [ddb("d1", [D("2", "Hiss", { activations: ["bonus"] })])]
      });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({ match: "matched", docId: "d1.2", differences: ["section"] });
    });

    it("makes two features claiming one item ambiguous: duplicate within a section, section across sections", () => {
      const ddbActors = [ddb("d1", [D("1", "Hiss", { activations: [] })])];
      const twin = run([feature("Hiss", "action"), feature("Hiss", "action", { occurrence: 2 })], { ddbActors });
      for (const r of twin.records) {
        expect(itemsOf(r)["ddb-importer"]).toMatchObject({ match: "ambiguous", differences: ["duplicate"] });
      }
      const across = run([feature("Hiss", "action"), feature("Hiss", "bonus")], { ddbActors });
      for (const r of across.records) {
        expect(itemsOf(r)["ddb-importer"]).toMatchObject({ match: "ambiguous", differences: ["section"] });
      }
    });
  });

  describe("edition", () => {
    it("makes the feature ambiguous (edition) with the candidates when the name exists only in the other edition", () => {
      const { records, report } = run([feature("Claw", "action")], {
        ddbActors: [ddb("d1", [D("1", "Claw"), D("2", "Claw")], "2014")]
      });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({
        match: "ambiguous", differences: ["edition"], candidates: [{ docId: "d1.1" }, { docId: "d1.2" }]
      });
      expect(report.ambiguous).toEqual([records[0].key]);
      expect(report.noDdbActor).toBe(1);
    });

    it("is absent, not ambiguous, when the other edition's actor has no item of that name", () => {
      const { records } = run([feature("Claw", "action")], { ddbActors: [ddb("d1", [D("1", "Bite")], "2014")] });
      expect(itemsOf(records[0])["ddb-importer"]).toBeUndefined();
    });

    it("never takes the other edition's actor when one of the creature's edition exists", () => {
      const { records } = run([feature("Claw", "action")], {
        ddbActors: [ddb("d1", [D("1", "Claw")], "2014"), ddb("d2", [D("2", "Claw")], "2024")]
      });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({ match: "matched", docId: "d2.2" });
      expect(itemsOf(records[0])["ddb-importer"].differences).toBeUndefined();
    });

    it("uses an actor that states no edition and adds edition-unknown", () => {
      const { records, report } = run([feature("Claw", "action")], { ddbActors: [ddb("d1", [D("1", "Claw")], null)] });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({ match: "matched", differences: ["edition-unknown"] });
      expect(report.differing).toEqual([records[0].key]);
    });
  });

  describe("several actors of the name", () => {
    it("is one when the embedded item ids are identical", () => {
      const { records } = run([feature("Claw", "action")], {
        ddbActors: [ddb("d1", [D("1", "Claw")]), ddb("d2", [D("1", "Claw")])]
      });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({ match: "matched", docId: "d1.1" });
    });
    it("makes the feature ambiguous (actor) when the embedded items differ", () => {
      const { records } = run([feature("Claw", "action")], {
        ddbActors: [ddb("d1", [D("1", "Claw")]), ddb("d2", [D("2", "Claw")])]
      });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({
        match: "ambiguous", differences: ["actor"], candidates: [{ docId: "d1.1" }, { docId: "d2.2" }]
      });
    });
  });

  describe("against the official item", () => {
    const withDamage = (types) => [{ id: "a1", type: "attack", damageTypes: types }];
    it("records structural differences of a matched item", () => {
      const { records, report } = run([feature("Claw", "action")], {
        actors: [official([O("1", "Claw")])],
        ddbActors: [ddb("d1", [D("1", "Claw", { activities: withDamage(["piercing"]) })])]
      });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({ match: "matched", differences: ["damageTypes"] });
      expect(report.differing).toEqual([records[0].key]);
    });
    it("records no difference when the structure agrees, and compares nothing when the official item is not matched", () => {
      const same = run([feature("Claw", "action")], {
        actors: [official([O("1", "Claw")])], ddbActors: [ddb("d1", [D("1", "Claw")])]
      });
      expect(itemsOf(same.records[0])["ddb-importer"].differences).toBeUndefined();
      const none = run([feature("Claw", "action")], {
        actors: [official([O("1", "Bite")])], ddbActors: [ddb("d1", [D("1", "Claw", { activities: withDamage(["piercing"]) })])]
      });
      expect(itemsOf(none.records[0])["ddb-importer"].differences).toBeUndefined();
    });
  });

  describe("re-inventory", () => {
    const inputs = { actors: [official([O("1", "Claw")])], ddbActors: [ddb("d1", [D("7", "Claw")])] };
    it("keeps keys and human-set fields, and drops the gates when the set of matched items changes", () => {
      const first = run([feature("Claw", "action")], { ...inputs, ddbActors: [] });
      expect(first.records[0].items.map((i) => i.origin)).toEqual(["official", "plutonium"]);
      const decided = {
        ...first.records[0], verdict: "data", why: "kept", rule: "x.y", hint: "h", note: "n", order: 4,
        evidence: { triaged: { by: "r", at: "t", confidence: 1 }, gates: { schema: "ok" } }
      };
      const again = run([feature("Claw", "action")], { ...inputs, previous: [decided] });
      expect(again.report).toMatchObject({ added: 0, kept: 1, vanished: [] });
      expect(again.report.dataChanged).toEqual([decided.key]);
      const [r] = again.records;
      expect(r.key).toBe(decided.key);
      expect(r).toMatchObject({ verdict: "data", why: "kept", rule: "x.y", hint: "h", note: "n", order: 4 });
      expect(r.evidence.triaged).toEqual(decided.evidence.triaged);
      expect(r.evidence.gates).toBeUndefined();
      expect(r.items.map((i) => i.origin)).toEqual(["official", "ddb-importer", "plutonium"]);
      const third = run([feature("Claw", "action")], { ...inputs, previous: again.records });
      expect(third.report.dataChanged).toEqual([]);
      expect(third.records).toEqual(again.records);
    });
  });

  it("offers the items of the creature's DDB actors to resolve, and no other creature's", () => {
    const inputs = { ddbActors: [ddb("d1", [D("1", "Claw"), D("2", "Claw")])] };
    const first = run([feature("Claw", "action")], inputs);
    expect(itemsOf(first.records[0])["ddb-importer"].match).toBe("ambiguous");
    const dumps = { ddbActors: inputs.ddbActors };
    expect(poolOf(dumps, "ddb-importer", "monster", "Mist Weasel").map((c) => c.docId)).toEqual(["d1.1", "d1.2"]);
    expect(poolOf(dumps, "ddb-importer", "monster", "Other")).toEqual([]);
  });
});

describe("actorSummaries edition", () => {
  it("states the edition of the actor when it is 2014 or 2024, and none otherwise", () => {
    const docs = ["2014", "2024", "legacy", undefined].map((rules, n) => ({
      _id: `a${n}`, name: `A${n}`, type: "npc", system: { source: { rules } }, items: []
    }));
    expect(actorSummaries(docs, "ddb-importer").map((a) => a.edition)).toEqual(["2014", "2024", undefined, undefined]);
  });
});

describe("pipeline CLI with DDB Importer's monsters", () => {
  let tmp, env;
  const MARK = "ZZMARKERZZ";
  const claw = (id, rules = "2014") => ({
    _id: id, name: "Scorch", type: "feat", effects: [],
    system: {
      identifier: "scorch", source: { rules }, description: { value: MARK },
      activities: { actAAAAAAAAAAAAA: { type: "attack", activation: { type: "action" } } }
    }
  });
  const npc = { _id: "ddbActorAAAAAAA1", name: "Ember Mole", type: "npc", system: { source: { rules: "2014" } },
    items: [claw("ddbItemAAAAAAAA1")] };
  const write = (rel, data) => {
    const file = join(tmp, rel);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  };
  const run = (args, over = {}) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], {
    encoding: "utf8", env: { ...env, ...over }
  });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ddb-mon-cli-"));
    env = {
      PATH: process.env.PATH, RULEPACK_DATASET: join(tmp, "data"), RULEPACK_DUMPS: join(tmp, "dumps"),
      RULEPACK_TEXT: join(tmp, "text"), RULEPACK_REGISTRY: join(tmp, "registry")
    };
    write("data/bestiary/bestiary-tce.json", { monster: [{
      name: "Ember Mole", source: "TCE", page: 7, action: [{ name: "Scorch", entries: ["Flames."] }]
    }] });
    write("dumps/dnd-tashas-cauldron.actors.json", [{
      _id: "actorAAAAAAAAAAA", name: "Ember Mole", type: "npc", system: {}, items: [claw("itemAAAAAAAAAAAA")]
    }]);
    write("dumps/ddb.ddb-base-world-ddb-monsters.json", [npc]);
    write("dumps/ddb.ddb-base-world-ddb-spells.json", []);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("inventories the ddb-importer item of a monster feature from a ddb. dump that holds actors, whatever its name", () => {
    const r = run(["inventory", "TCE", "monster"]);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ added: 1, noActor: 0, noDdbActor: 0 });
    const { records } = JSON.parse(readFileSync(join(tmp, "registry", "tce.json"), "utf8"));
    expect(records[0].items.map((i) => [i.origin, i.match, i.docId])).toEqual([
      ["official", "matched", "actorAAAAAAAAAAA.itemAAAAAAAAAAAA"],
      ["ddb-importer", "matched", "ddbActorAAAAAAA1.ddbItemAAAAAAAA1"],
      ["plutonium", "unchecked", undefined]
    ]);
  });

  it("resolves a ddb-importer monster docId to the embedded item of the ddb. actor dump", () => {
    const docs = docIndex(join(tmp, "dumps"), ["ddb.ddb-base-world-ddb-monsters.json"]);
    const doc = findDocument(docs, "ddbActorAAAAAAA1.ddbItemAAAAAAAA1", itemSummary(npc.items[0], "ddb-importer").data);
    expect(doc?.name).toBe("Scorch");
  });

  it("batch triage --structure writes a structure for the ddb-importer origin of a monster feature", () => {
    expect(run(["inventory", "TCE", "monster"]).status).toBe(0);
    const priv = join(tmp, "private");
    const r = run(["batch", "triage", "TCE", "--out", join(tmp, "out"), "--structure", priv]);
    expect(r.status, r.stderr).toBe(0);
    const raw = readFileSync(join(priv, readdirSync(priv)[0]), "utf8");
    expect(raw).not.toContain(MARK);
    const [entry] = Object.values(JSON.parse(raw).entries);
    expect(entry.official.activities[0].id).toBe("actAAAAAAAAAAAAA");
    expect(entry["ddb-importer"]).not.toBeNull();
    expect(entry["ddb-importer"].activities[0].id).toBe("actAAAAAAAAAAAAA");
  });

  it("loadDocuments (the gates' documents) finds the embedded item of a ddb-importer and of an official monster feature", () => {
    expect(run(["inventory", "TCE", "monster"]).status).toBe(0);
    const { records } = JSON.parse(readFileSync(join(tmp, "registry", "tce.json"), "utf8"));
    const documents = loadDocuments(join(tmp, "dumps"), records);
    expect(documents["ddb-importer"]["ddbActorAAAAAAA1.ddbItemAAAAAAAA1"]).toMatchObject({ name: "Scorch" });
    expect(documents.official["actorAAAAAAAAAAA.itemAAAAAAAAAAAA"]).toMatchObject({ name: "Scorch" });
  });
});
