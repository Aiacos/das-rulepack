import { describe, it, expect } from "vitest";
import { identityOf, mechanicsOf, compareMechanics, matchOrigin } from "../../tools/pipeline/match.mjs";

// Synthetic fixtures only: invented spells.
const item = (over = {}) => ({
  origin: "ddb-importer", docId: "a1", identifier: "glimmer-bolt", name: "Glimmer Bolt", type: "spell", rules: "2024",
  activities: [{ id: "x", type: "save", save: ["dex"], damageTypes: ["fire", "cold"] }],
  effects: [{ id: "e", name: "Dazzled", statuses: ["blinded"] }], level: 2, school: "evo", data: "h", ...over
});
const entry = { name: "Glimmer Bolt", kind: "spell", edition: "2024" };

describe("identityOf", () => {
  it("joins the normalised slug, kind and edition", () => {
    expect(identityOf({ name: "Glimmer's  Bolt!", kind: "spell", edition: "2024" })).toBe("glimmers-bolt|spell|2024");
  });
});

describe("mechanicsOf and compareMechanics", () => {
  it("sorts and deduplicates every list", () => {
    const m = mechanicsOf(item({ activities: [
      { id: "1", type: "save", save: ["wis", "dex"], damageTypes: ["fire"] },
      { id: "2", type: "damage", damageTypes: ["fire", "cold"] }
    ] }));
    expect(m).toEqual({
      level: 2, school: "evo", activityTypes: ["damage", "save"], saves: ["dex", "wis"],
      damageTypes: ["cold", "fire"], statuses: ["blinded"]
    });
  });
  it("names the differing fields", () => {
    const b = item({ level: 3, effects: [] });
    expect(compareMechanics(mechanicsOf(item()), mechanicsOf(b))).toEqual(["level", "statuses"]);
    expect(compareMechanics(mechanicsOf(item()), mechanicsOf(item()))).toEqual([]);
  });
});

describe("matchOrigin", () => {
  it("is absent without a candidate of the same slug and kind", () => {
    expect(matchOrigin(entry, [])).toEqual({ match: "absent" });
    expect(matchOrigin(entry, [item({ name: "Other Bolt" }), item({ type: "feat" })])).toEqual({ match: "absent" });
  });
  it("matches one same-edition candidate without a reference", () => {
    const c = item();
    expect(matchOrigin(entry, [c])).toEqual({ match: "matched", item: c });
  });
  it("matches when the reference has equal mechanics, and records a structural difference without deciding on it", () => {
    const c = item();
    expect(matchOrigin({ ...entry, reference: item({ origin: "official" }) }, [c])).toEqual({ match: "matched", item: c });
    const ref = item({ origin: "official", activities: [{ id: "y", type: "save", save: ["con"], damageTypes: ["cold", "fire"] }] });
    expect(matchOrigin({ ...entry, reference: ref }, [c])).toEqual({ match: "matched", item: c, differences: ["saves"] });
  });
  it("is ambiguous when the reference differs in level or school", () => {
    const c = item();
    const level = matchOrigin({ ...entry, reference: item({ level: 3 }) }, [c]);
    expect(level).toEqual({ match: "ambiguous", candidates: [c], differences: ["level"] });
    const school = matchOrigin({ ...entry, reference: item({ school: "abj", activities: [] }) }, [c]);
    expect(school.match).toBe("ambiguous");
    expect(school.differences).toContain("school");
  });
  it("keeps a 2014 candidate for a 2024 entry ambiguous even with a reference", () => {
    const c = item({ rules: "2014" });
    const r = matchOrigin({ ...entry, reference: item() }, [c]);
    expect(r).toEqual({ match: "ambiguous", candidates: [c], differences: ["edition"] });
  });
  it("takes the same document met twice (same docId and data) as one candidate", () => {
    const a = item({ docId: "same", data: "h" });
    const twin = { ...a, origin: "official" };
    expect(matchOrigin(entry, [a, twin])).toEqual({ match: "matched", item: a });
    expect(matchOrigin(entry, [a, item({ docId: "same", data: "other" })]).match).toBe("ambiguous");
    expect(matchOrigin(entry, [a, item({ docId: "else", data: "h" })]).match).toBe("ambiguous");
  });
  it("is ambiguous on edition when the only candidate is the other edition", () => {
    const c = item({ rules: "2014" });
    expect(matchOrigin(entry, [c])).toEqual({ match: "ambiguous", candidates: [c], differences: ["edition"] });
  });
  it("picks the candidate of the entry's edition among several editions", () => {
    const old = item({ rules: "2014", docId: "o" });
    const cur = item({ docId: "n" });
    expect(matchOrigin(entry, [old, cur])).toEqual({ match: "matched", item: cur });
  });
  it("treats an edition-unknown candidate as a match when there is no reference", () => {
    const c = item({ rules: undefined });
    expect(matchOrigin(entry, [c])).toEqual({ match: "matched", item: c });
  });
  it("is ambiguous with two candidates of the same edition", () => {
    const a = item({ docId: "a" });
    const b = item({ docId: "b" });
    const r = matchOrigin(entry, [a, b]);
    expect(r.match).toBe("ambiguous");
    expect(r.candidates).toEqual([a, b]);
  });
});
