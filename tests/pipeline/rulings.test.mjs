import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateUnique, runGates } from "../../tools/pipeline/gates.mjs";
import { matchOrigin } from "../../tools/pipeline/match.mjs";
import { inventory } from "../../tools/pipeline/inventory.mjs";
import { autoTriage, triageContext } from "../../tools/pipeline/triage.mjs";
import { validateRecord } from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented entries, invented ids.
const ruled = (key, over = {}) => ({
  key, name: key, kind: "feature", book: "TST", page: 1, edition: "2024", identifier: "shared-name", text: null, items: [],
  verdict: "entry", evidence: {}, rule: { handledIn: "table", adds: "x", entry: {}, origins: ["official"] }, ...over
});

describe("ruling A: unique applies only to records that have a rule", () => {
  const bare = (key) => { const { rule, ...rest } = ruled(key); return { ...rest, verdict: null }; };
  it("ignores records without a rule, however many share an identifier", () => {
    expect(gateUnique([bare("tst:feature:a"), bare("tst:feature:b"), bare("tst:feature:c")])).toEqual([]);
  });
  it("ignores an unruled record that shares the identifier of a ruled one", () => {
    expect(gateUnique([ruled("tst:feature:a"), bare("tst:feature:b")])).toEqual([]);
  });
  it("fails two ruled records with one identifier, whatever sources they bind", () => {
    const [a, b] = [ruled("tst:feature:a"), ruled("tst:feature:b")];
    expect(gateUnique([a, b])).toHaveLength(1);
    const bound = { Aa11Bb22Cc33Dd44: "shared-name" };
    expect(gateUnique([{ ...a, sources: bound }, b])).toHaveLength(1);
    expect(gateUnique([{ ...a, sources: bound }, { ...b, sources: bound }])).toHaveLength(1);
  });
  it("reports the failure under the unique gate of each ruled record only", () => {
    const records = [ruled("tst:feature:a"), ruled("tst:feature:b"), bare("tst:feature:c")];
    const { failures } = runGates(records, {
      core: { version: "1", facts: [], vocabulary: new Set(), validateEntry: () => [] }, documents: {}, ci: true, legacy: new Map()
    });
    expect(failures["tst:feature:a"].unique).toHaveLength(1);
    expect(failures["tst:feature:b"].unique).toHaveLength(1);
    expect(failures["tst:feature:c"]?.unique).toBeUndefined();
  });
});

const doc = (docId, over = {}) => ({
  origin: "official", docId, identifier: "glimmer-ring", name: "Glimmer Ring", type: "equipment", rules: "2024",
  activities: [{ id: "a1", type: "utility", damageTypes: [] }], effects: [], data: "same", ...over
});
const thing = { name: "Glimmer Ring", kind: "item", edition: "2024" };

describe("ruling B: identical data under several document ids is one candidate", () => {
  it("is matched with the first docId (sorted) and lists the others as alsoDocIds", () => {
    const out = matchOrigin(thing, [doc("zz"), doc("aa"), doc("mm")]);
    expect(out).toMatchObject({ match: "matched", alsoDocIds: ["mm", "zz"] });
    expect(out.item.docId).toBe("aa");
  });
  it("stays ambiguous when the data differs, even in one copy", () => {
    const out = matchOrigin(thing, [doc("aa"), doc("bb"), doc("cc", { data: "other" })]);
    expect(out).toMatchObject({ match: "ambiguous", differences: [] });
    expect(out.candidates.map((c) => c.docId)).toEqual(["aa", "bb", "cc"]);
  });
  it("is recorded on the inventory item, and never for a monster feature", () => {
    let textDir = mkdtempSync(join(tmpdir(), "rul-"));
    try {
      const entry = { name: "Glimmer Ring", book: "TST", page: 3, edition: "2024", srd: false, text: "t", rarity: "rare" };
      const { records } = inventory({
        book: "TST", kind: "item", dataset: [entry], dumps: { official: [doc("zz"), doc("aa")], "ddb-importer": [] },
        textDir, previous: []
      });
      expect(records[0].items[0]).toMatchObject({ match: "matched", docId: "aa", alsoDocIds: ["zz"] });
      expect(validateRecord(records[0])).toEqual([]);
      const monster = { name: "Claw", kind: "monster", owner: "Wolf", section: "action", book: "TST", page: 1, edition: "2024",
        srd: false, text: "t", creatureIndex: 0 };
      const claw = (id) => doc(id, { name: "Claw", type: "feat" });
      const actor = { id: "w1", name: "Wolf", items: [claw("w1.a"), claw("w1.b")] };
      const m = inventory({
        book: "TST", kind: "monster", dataset: [monster], dumps: { official: [], "ddb-importer": [], actors: [actor] },
        textDir, previous: []
      });
      expect(m.records[0].items[0]).toMatchObject({ match: "ambiguous" });
    } finally { rmSync(textDir, { recursive: true, force: true }); }
  });
});

describe("ruling C: a feature named like its subclass may match the subclass document", () => {
  const sub = (over = {}) => ({
    origin: "official", docId: "sub1", identifier: "oathbound", name: "Oathbound", type: "subclass", rules: "2024",
    activities: [], effects: [], classIdentifier: "zzfighter", data: "s", ...over
  });
  const feature = (over = {}) => ({
    name: "Oathbound", kind: "feature", edition: "2024", owner: "Zzfighter/Oathbound", level: 3, ...over
  });
  it("matches the subclass document of that name", () => {
    expect(matchOrigin(feature(), [sub()])).toMatchObject({ match: "matched", item: { docId: "sub1" } });
  });
  it("applies to that case only: other names, a class owner and other kinds do not match a subclass document", () => {
    expect(matchOrigin(feature({ name: "Other Vow" }), [sub({ name: "Other Vow" })])).toEqual({ match: "absent" });
    expect(matchOrigin(feature({ owner: "Zzfighter" }), [sub()])).toEqual({ match: "absent" });
    expect(matchOrigin(feature({ kind: "option" }), [sub()])).toEqual({ match: "absent" });
  });
  it("does not take the subclass document of another class", () => {
    expect(matchOrigin(feature(), [sub({ classIdentifier: "zzwizard" })]))
      .toMatchObject({ match: "ambiguous", differences: ["owner"] });
  });
  it("prefers a feature document of that name over the subclass document", () => {
    const feat = { ...sub({ docId: "f1", type: "feat" }), featType: { value: "subclass", subtype: "" } };
    expect(matchOrigin(feature(), [sub(), feat])).toMatchObject({ match: "matched", item: { docId: "f1" } });
  });
});

describe("ruling D: re-inventory keeps the page of a record that has a rule", () => {
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "rul-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const entry = (page) => ({
    name: "Glimmer Bolt", book: "TST", page, edition: "2024", srd: false, text: "t", level: 2, school: "V"
  });
  const run = (page, previous) => inventory({
    book: "TST", kind: "spell", dataset: [entry(page)], dumps: { official: [], "ddb-importer": [] }, textDir, previous
  });
  it("keeps the stored page and lists the key under pageChanged", () => {
    const first = run(10, []).records;
    const rule = { handledIn: "table", adds: "x", entry: {}, origins: ["official"] };
    const withRule = first.map((r) => ({ ...r, verdict: "entry", rule }));
    const again = run(12, withRule);
    expect(again.records[0].page).toBe(10);
    expect(again.report.pageChanged).toEqual([withRule[0].key]);
  });
  it("takes the new page of a record without a rule, and reports nothing", () => {
    const again = run(12, run(10, []).records);
    expect(again.records[0].page).toBe(12);
    expect(again.report.pageChanged).toEqual([]);
  });
});

describe("ruling E: a monster feature whose section disagrees with its only same-name item", () => {
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "rul-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const feat = (section, name = "Bite") => ({
    name, kind: "monster", owner: "Wolf", section, book: "XZZ", page: 3, edition: "2024", srd: false, text: `${section}.`,
    creatureIndex: 0
  });
  const embedded = (id, name, activations) => doc(`w1.${id}`, { name, type: "feat", activations, identifier: name.toLowerCase() });
  const run = (dataset, items) => inventory({
    book: "XZZ", kind: "monster", dataset, dumps: { official: [], "ddb-importer": [], actors: [{ id: "w1", name: "Wolf", items }] },
    textDir, previous: []
  });
  const official = (r) => r.items.find((i) => i.origin === "official");
  it("is matched with differences [section] when no other feature claims the item", () => {
    const { records } = run([feat("bonus")], [embedded("a", "Bite", ["action"])]);
    expect(official(records[0])).toMatchObject({ match: "matched", docId: "w1.a", differences: ["section"] });
  });
  it("stays absent when another feature of the creature claims the item", () => {
    const { records } = run([feat("action"), feat("bonus")], [embedded("a", "Bite", ["action"])]);
    expect(official(records[0])).toMatchObject({ match: "matched" });
    expect(official(records[0]).differences).toBeUndefined();
    expect(official(records[1])).toBeUndefined();
  });
  it("stays absent when two disagreeing features compete for the item, and ambiguous for the neutral case", () => {
    const two = run([feat("bonus"), feat("reaction")], [embedded("a", "Bite", ["action"])]);
    expect(two.records.map(official)).toEqual([undefined, undefined]);
    const neutral = run([feat("action"), feat("legendary")], [embedded("a", "Bite", [])]);
    expect(neutral.records.map((r) => official(r).match)).toEqual(["ambiguous", "ambiguous"]);
  });
  it("stays absent when several same-name items exist", () => {
    const { records } = run([feat("bonus")], [embedded("a", "Bite", ["action"]), embedded("b", "Bite", ["reaction"])]);
    expect(official(records[0])).toBeUndefined();
  });
});

describe("ruling F: a placeholder with no text and no item is none, by rule", () => {
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "rul-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));
  const base = {
    key: "tst:feature:a/3/subclass-feature", name: "Subclass Feature", kind: "feature", book: "TST",
    identifier: "subclass-feature", text: null, verdict: null
  };
  const triage = (r) => autoTriage(r, { coreIdentifiers: new Set(["in-core"]), textDir, ...triageContext([r]) });
  it("sets none when the text is null and the official origin is absent, or listed absent", () => {
    const why = "no text and no item in any origin";
    expect(triage({ ...base, items: [{ origin: "plutonium", match: "unchecked" }] })).toEqual({ verdict: "none", why, by: "rule" });
    expect(triage({ ...base, items: [] })?.verdict).toBe("none");
    expect(triage({ ...base, items: [{ origin: "official", match: "absent" }] })?.verdict).toBe("none");
  });
  it("leaves unverifiable a record without text that has an official item, matched or ambiguous", () => {
    const matched = { origin: "official", match: "matched", docId: "d", identifier: "x", activities: [], effects: [] };
    expect(triage({ ...base, items: [matched] })?.verdict).toBe("unverifiable");
    expect(triage({ ...base, items: [{ origin: "official", match: "ambiguous", candidates: [], differences: [] }] })?.verdict)
      .toBe("unverifiable");
  });
  it("never overrides core, and leaves a record with text to a reader", () => {
    expect(triage({ ...base, identifier: "in-core", edition: "2024", items: [] })?.verdict).toBe("core");
  });
});
