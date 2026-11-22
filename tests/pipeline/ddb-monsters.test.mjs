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
const BOOKS = { Mine: "XZZ", mine2: "xzz", Other: "XOT" };
const actor = (origin, id, name, items, edition, book) => ({
  id, name, ...(edition ? { edition } : {}), ...(book ? { book } : {}),
  items: items.map((i) => ({ ...i, origin, docId: `${id}.${i.docId.split(".")[1]}` }))
});
const official = (items) => actor("official", "off1", "Mist Weasel", items);
const ddb = (id, items, edition = "2024", name = "Mist Weasel", book = "Mine") =>
  actor("ddb-importer", id, name, items, edition, book);
const O = (id, name, over) => item("official", id, name, over);
const D = (id, name, over) => item("ddb-importer", id, name, over);

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "ddb-mon-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));
const run = (dataset, { actors = [], ddbActors = [], previous = [], creatures } = {}) => inventory({
  book: "XZZ", kind: "monster", dataset, creatures, dumps: { official: [], "ddb-importer": [], actors, ddbActors, ddbBooks: BOOKS },
  textDir, previous
});
const itemsOf = (r) => Object.fromEntries(r.items.map((i) => [i.origin, i]));

describe("ddbActorCandidates", () => {
  const A = ddb("d1", [D("1", "Claw")]);
  const pick = (actors, edition = "2024", book = "XZZ") =>
    ddbActorCandidates("Mist Weasel", actors, { edition, book, books: BOOKS });
  it("takes the actors of the creature's name and edition, items carrying the actor's edition", () => {
    const out = pick([A, ddb("d2", [D("2", "Bite")], "2014")]);
    expect(out).toMatchObject({ found: true, ambiguous: false, status: "found", bookUnknown: false });
    expect(out.candidates.map((c) => [c.docId, c.rules])).toEqual([["d1.1", "2024"]]);
  });
  it("lets an actor that states its edition decide for its items, and one that states none leave them their own", () => {
    const stated = pick([ddb("d1", [D("1", "Claw", { rules: "2014" }), D("2", "Bite")])]);
    expect(stated.candidates.map((c) => c.rules)).toEqual(["2024", "2024"]);
    const none = pick([ddb("d1", [D("1", "Claw", { rules: "2014" }), D("2", "Bite")], null)]);
    expect(none.candidates.map((c) => c.rules)).toEqual(["2014", undefined]);
  });
  it("is not found when the name exists only in the other edition, and hands those items over", () => {
    const out = pick([ddb("d2", [D("2", "Bite")], "2014")]);
    expect(out).toMatchObject({ found: false, candidates: [], status: "otherEdition" });
    expect(out.otherEdition.map((c) => c.docId)).toEqual(["d2.2"]);
  });
  it("says none when no actor has the name", () => {
    expect(pick([ddb("d2", [D("2", "Bite")], "2024", "Someone Else")])).toMatchObject({ found: false, status: "none" });
  });
  it("uses an actor with no stated edition, and prefers the ones that state it", () => {
    const none = ddb("d3", [D("3", "Claw")], null);
    expect(pick([none]).candidates[0].rules).toBeUndefined();
    expect(pick([none, A]).candidates.map((c) => c.docId)).toEqual(["d1.1"]);
  });
  describe("book", () => {
    const mine = ddb("m1", [D("1", "Claw")], "2024", "Mist Weasel", "Mine");
    const other = ddb("o1", [D("2", "Claw")], "2024", "Mist Weasel", "Other");
    it("prefers the actors of the record's book and uses them alone, whatever the case of the code", () => {
      expect(pick([other, mine]).candidates.map((c) => c.docId)).toEqual(["m1.1"]);
      expect(pick([other, ddb("m2", [D("3", "Claw")], "2024", "Mist Weasel", "mine2")]).candidates.map((c) => c.docId))
        .toEqual(["m2.3"]);
      expect(pick([other, mine]).bookUnknown).toBe(false);
    });
    it("uses the actors with no book, an SRD one or an unmapped one when none is of the book, saying so", () => {
      for (const book of [null, "SRD 5.1", "SRD 5.2", "Never Heard Of"]) {
        const out = pick([other, ddb("u1", [D("4", "Claw")], "2024", "Mist Weasel", book)]);
        expect(out).toMatchObject({ found: true, bookUnknown: true });
        expect(out.candidates.map((c) => c.docId)).toEqual(["u1.4"]);
      }
    });
    it("is not found when the only actors state another mapped book", () => {
      const out = pick([other]);
      expect(out).toMatchObject({ found: false, candidates: [], status: "otherBook" });
      expect(out.otherBook.map((c) => c.docId)).toEqual(["o1.2"]);
    });
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
    expect(report).toMatchObject({ noActor: 0, noDdbActor: 0, ddbOtherEditionOnly: 0, ddbOtherBookOnly: 0 });
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
      // The "Hiss" item is taken by the bonus feature: the action feature has no item left, so it is absent.
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
      expect(report).toMatchObject({ noDdbActor: 0, ddbOtherEditionOnly: 1, ddbOtherBookOnly: 0 });
    });

    it("is absent at item level, but reported, when the other edition's actor has no item of that name", () => {
      const { records, report } = run([feature("Claw", "action")], { ddbActors: [ddb("d1", [D("1", "Bite")], "2014")] });
      expect(itemsOf(records[0])["ddb-importer"]).toBeUndefined();
      expect(report).toMatchObject({ noDdbActor: 0, ddbOtherEditionOnly: 1 });
    });

    it("makes the feature ambiguous (edition) when an actor with no edition has an item of the other edition", () => {
      const { records } = run([feature("Claw", "action")], {
        ddbActors: [ddb("d1", [D("1", "Claw", { rules: "2014" })], null)]
      });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({ match: "ambiguous", differences: ["edition"] });
    });

    it("adds no edition-unknown when the item of an actor with no edition states the creature's edition", () => {
      const { records } = run([feature("Claw", "action")], {
        ddbActors: [ddb("d1", [D("1", "Claw", { rules: "2024" })], null)]
      });
      expect(itemsOf(records[0])["ddb-importer"].match).toBe("matched");
      expect(itemsOf(records[0])["ddb-importer"].differences).toBeUndefined();
    });

    it("reads the edition of a creature with no feature from the creature itself, not from the first feature", () => {
      const { report } = run([feature("Claw", "action")], {
        creatures: [{ name: "Mist Weasel", features: 1, edition: "2024" }, { name: "Old Weasel", features: 0, edition: "2014" }],
        ddbActors: [ddb("d1", [D("1", "Claw")]), ddb("d2", [D("2", "Claw")], "2014", "Old Weasel")]
      });
      expect(report).toMatchObject({ creatures: 2, noDdbActor: 0, ddbOtherEditionOnly: 0 });
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

  describe("book", () => {
    it("joins the actor of the record's book, never another book's actor of the same name and edition", () => {
      const { records } = run([feature("Claw", "action")], {
        ddbActors: [ddb("o1", [D("2", "Claw")], "2024", "Mist Weasel", "Other"), ddb("m1", [D("1", "Claw")])]
      });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({ match: "matched", docId: "m1.1" });
      expect(itemsOf(records[0])["ddb-importer"].differences).toBeUndefined();
    });
    it("uses an actor of no known book and adds book-unknown", () => {
      const { records, report } = run([feature("Claw", "action")], {
        ddbActors: [ddb("u1", [D("1", "Claw")], "2024", "Mist Weasel", "SRD 5.2")]
      });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({ match: "matched", differences: ["book-unknown"] });
      expect(report.differing).toEqual([records[0].key]);
    });
    it("makes the feature ambiguous (book) when the only actors are of another book, and counts the creature", () => {
      const { records, report } = run([feature("Claw", "action"), feature("Bite", "action")], {
        ddbActors: [ddb("o1", [D("2", "Claw")], "2024", "Mist Weasel", "Other")]
      });
      expect(itemsOf(records[0])["ddb-importer"]).toMatchObject({
        match: "ambiguous", differences: ["book"], candidates: [{ docId: "o1.2" }]
      });
      expect(itemsOf(records[1])["ddb-importer"]).toBeUndefined();
      expect(report).toMatchObject({ noDdbActor: 0, ddbOtherEditionOnly: 0, ddbOtherBookOnly: 1 });
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

describe("actorSummaries book", () => {
  it("states the D&D Beyond book abbreviation of the actor when it has one", () => {
    const docs = ["MM 2024", "", undefined, 7].map((book, n) => ({
      _id: `a${n}`, name: `A${n}`, type: "npc", system: { source: { book } }, items: []
    }));
    expect(actorSummaries(docs, "ddb-importer").map((a) => a.book)).toEqual(["MM 2024", undefined, undefined, undefined]);
  });
});

describe("docs/ddb-books.json", () => {
  const load = (name) => JSON.parse(readFileSync(new URL(`../../docs/${name}`, import.meta.url), "utf8"));
  it("maps D&D Beyond abbreviations to dataset book codes, none to an SRD", () => {
    const map = load("ddb-books.json");
    expect(Object.entries(map).every(([k, v]) => k && /^[A-Za-z0-9-]+$/.test(v))).toBe(true);
    expect(Object.keys(map).some((k) => /^srd/i.test(k))).toBe(false);
    expect(map["MM 2024"]).toBe("XMM");
    expect(map.MotM).toBe("MPMM");
  });
  it("names a book of the catalogue wherever the catalogue lists it", () => {
    const map = load("ddb-books.json");
    const codes = new Set(load("books.json").books.map((b) => b.code.toUpperCase()));
    expect(["XMM", "MM", "MPMM", "XPHB", "XDMG"].every((c) => codes.has(c))).toBe(true);
    for (const c of ["XMM", "MM", "MPMM"]) expect(Object.values(map).map((v) => v.toUpperCase())).toContain(c);
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
    // The fixture's actor states no book: used, visibly.
    expect(records[0].items[1].differences).toEqual(["book-unknown"]);
  });

  it("joins an actor of a mapped book to the creature of that book only, and reports the creature otherwise", () => {
    write("dumps/ddb.ddb-base-world-ddb-monsters.json", [{ ...npc, system: { source: { rules: "2014", book: "ToA" } } }]);
    const r = run(["inventory", "TCE", "monster"]);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ noDdbActor: 0, ddbOtherEditionOnly: 0, ddbOtherBookOnly: 1 });
    const { records } = JSON.parse(readFileSync(join(tmp, "registry", "tce.json"), "utf8"));
    expect(records[0].items[1]).toMatchObject({ origin: "ddb-importer", match: "ambiguous", differences: ["book"] });
  });

  it("resolve settles an ambiguous ddb-importer monster item against the official item, and inventory keeps it", () => {
    const twin = claw("ddbItemAAAAAAAA2");
    twin.system.activities.actAAAAAAAAAAAAA.damage = { parts: [{ types: ["fire"] }] };
    write("dumps/ddb.ddb-base-world-ddb-monsters.json", [{ ...npc, items: [npc.items[0], twin] }]);
    expect(run(["inventory", "TCE", "monster"]).status).toBe(0);
    const file = join(tmp, "registry", "tce.json");
    const ddbOf = () => JSON.parse(readFileSync(file, "utf8")).records[0].items.find((i) => i.origin === "ddb-importer");
    expect(ddbOf()).toMatchObject({ match: "ambiguous" });
    const key = "tce:monster:ember-mole/action/scorch";
    const doc = "ddbActorAAAAAAA1.ddbItemAAAAAAAA2";
    const settled = { match: "matched", docId: doc, differences: ["damageTypes"] };
    const r = run(["resolve", key, "ddb-importer", "--doc", doc, "--because", "the fire one"]);
    expect(r.status, r.stderr).toBe(0);
    // Compared against the official item (no damage type): the structural difference is recorded.
    expect(ddbOf()).toMatchObject({ ...settled, resolved: { because: "the fire one" } });
    const again = run(["inventory", "TCE", "monster"]);
    expect(again.status, again.stderr).toBe(0);
    expect(JSON.parse(again.stdout).resolutionStale).toEqual([]);
    expect(ddbOf()).toMatchObject({ ...settled, resolved: { because: "the fire one" } });
  });

  it("resolves a ddb-importer monster docId to the embedded item of the ddb. actor dump", () => {
    const docs = docIndex(join(tmp, "dumps"), ["ddb.ddb-base-world-ddb-monsters.json"]);
    const doc = findDocument(docs, "ddbActorAAAAAAA1.ddbItemAAAAAAAA1", itemSummary(npc.items[0], "ddb-importer").data);
    expect(doc?.name).toBe("Scorch");
  });

  it("batch triage --structure writes a structure for the ddb-importer origin of a monster feature", () => {
    expect(run(["inventory", "TCE", "monster"]).status).toBe(0);
    const priv = join(tmp, "private");
    // Ruling R29: a monster feature's structure gives the engine's own reading, so the cut needs DAS_CORE.
    if (!process.env.DAS_CORE) {
      expect(run(["batch", "triage", "TCE", "--out", join(tmp, "out"), "--structure", priv]).status).toBe(2);
      return;
    }
    const r = run(["batch", "triage", "TCE", "--out", join(tmp, "out"), "--structure", priv], { DAS_CORE: process.env.DAS_CORE });
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
