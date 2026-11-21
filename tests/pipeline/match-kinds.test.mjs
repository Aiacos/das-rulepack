import { describe, it, expect } from "vitest";
import { identityOf, matchName, matchOrigin, rarityDiffers } from "../../tools/pipeline/match.mjs";
import { grantIndex, itemSummary } from "../../tools/pipeline/dumps.mjs";
import { keyOf } from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented names, invented ids.
const cand = (name, over = {}) => ({
  origin: "official", docId: `id-${name}`, identifier: null, name, type: "feat", rules: "2024", activities: [], effects: [],
  data: `h-${name}`, ...over
});

describe("matchName", () => {
  it("slugs, reads curly and straight apostrophes alike and ignores a leading The", () => {
    expect(matchName("The Wanderer’s Lamp").full).toBe(matchName("Wanderer's Lamp").full);
    expect(matchName("The Wanderer's Lamp").full).toBe("wanderers-lamp");
  });
  it("keeps a trailing parenthesised group and bonus tokens as the variant marker", () => {
    expect(matchName("Glass Blade (Frost)")).toEqual({ full: "glass-blade-frost", base: "glass-blade", variant: "frost" });
    expect(matchName("Glass Blade +2")).toEqual({ full: "glass-blade-2", base: "glass-blade", variant: "+2" });
    expect(matchName("+2 Glass Blade")).toMatchObject({ base: "glass-blade", variant: "+2" });
    expect(matchName("Glass Blade")).toMatchObject({ base: "glass-blade", variant: "" });
  });
});

describe("matchOrigin: names", () => {
  const entry = (name) => ({ name, kind: "feat", edition: "2024" });
  it("lets an exact slug win over a variant of the same base", () => {
    const plain = cand("Moss Stride");
    expect(matchOrigin(entry("Moss Stride"), [cand("Moss Stride (Swamp)"), plain])).toEqual({ match: "matched", item: plain });
  });
  it("matches the variant marker, not the base alone", () => {
    const plus = cand("Glass Blade +1", { type: "weapon" });
    const e = (name) => ({ name, kind: "item", edition: "2024" });
    expect(matchOrigin(e("+1 Glass Blade"), [plus]).item).toBe(plus);
    expect(matchOrigin(e("Glass Blade +2"), [plus])).toEqual({ match: "absent" });
    expect(matchOrigin(e("Glass Blade"), [plus])).toEqual({ match: "absent" });
  });
  it("is ambiguous when several candidates carry the variant, and never takes the first", () => {
    const a = cand("Glass Blade +1", { type: "weapon", docId: "a" });
    const b = cand("Glass Blade +1", { type: "weapon", docId: "b" });
    const r = matchOrigin({ name: "+1 Glass Blade", kind: "item", edition: "2024" }, [a, b]);
    expect(r).toMatchObject({ match: "ambiguous", candidates: [a, b] });
  });
});

describe("matchOrigin: document types per kind", () => {
  it("looks at the document types of the kind", () => {
    const feat = { name: "Moss Stride", kind: "feat", edition: "2024" };
    expect(matchOrigin(feat, [cand("Moss Stride", { type: "spell" })])).toEqual({ match: "absent" });
    const bg = cand("Lamplighter", { type: "background" });
    expect(matchOrigin({ name: "Lamplighter", kind: "background", edition: "2024" }, [bg]).item).toBe(bg);
    const item = cand("Tin Pot", { type: "loot" });
    expect(matchOrigin({ name: "Tin Pot", kind: "item", edition: "2024" }, [item]).item).toBe(item);
  });
  it("matches a species to a race document and a trait to a feat document", () => {
    const race = cand("Glimmerkin", { type: "race" });
    const trait = cand("Dim Sight", { type: "feat" });
    const species = { name: "Glimmerkin", kind: "species", edition: "2024" };
    expect(matchOrigin(species, [race, cand("Glimmerkin", { type: "feat", docId: "f" })]).item).toBe(race);
    const traitOf = (name) => ({ name, kind: "species", edition: "2024", owner: "Glimmerkin" });
    expect(matchOrigin(traitOf("Dim Sight"), [trait, race]).item).toBe(trait);
    expect(matchOrigin(traitOf("Glimmerkin"), [race])).toEqual({ match: "absent" });
  });
});

describe("matchOrigin: features and traits of one name", () => {
  const entry = { name: "Ember Path", kind: "feature", edition: "2024", owner: "Zzfighter/Ember", level: 3 };
  const grant = (g) => ({ grantedBy: [g] });

  it("prefers the candidate granted by the owner's class and subclass", () => {
    const right = cand("Ember Path", {
      docId: "r", ...grant({ class: "zzfighter", subclass: ["ember-order", "Ember Order"], level: 3 })
    });
    const frost = cand("Ember Path", { docId: "f", ...grant({ class: "zzfighter", subclass: ["frost", "Frost"], level: 3 }) });
    const other = cand("Ember Path", { docId: "o", ...grant({ class: "zzmage", level: 3 }) });
    expect(matchOrigin(entry, [frost, right, other]).item).toBe(right);
  });
  it("tells a class feature from a subclass feature of the same name", () => {
    const classLevel = cand("Ember Path", { docId: "c", ...grant({ class: "zzfighter", level: 3 }) });
    expect(matchOrigin(entry, [classLevel])).toMatchObject({ match: "ambiguous", differences: ["owner"] });
    const plain = { ...entry, owner: "Zzfighter" };
    expect(matchOrigin(plain, [classLevel]).item).toBe(classLevel);
  });
  it("uses the level of the grant between candidates of one owner", () => {
    const at4 = cand("Raise", { docId: "4", ...grant({ class: "zzfighter", level: 4 }) });
    const at6 = cand("Raise", { docId: "6", ...grant({ class: "zzfighter", level: 6 }) });
    const e = { name: "Raise", kind: "feature", edition: "2024", owner: "Zzfighter", level: 6 };
    expect(matchOrigin(e, [at4, at6]).item).toBe(at6);
  });
  it("reads the class from requirements or the subtype when nothing grants the document", () => {
    const stated = cand("Ember Path", { docId: "s", requirements: "Zzfighter 3" });
    const blank = cand("Ember Path", { docId: "b" });
    expect(matchOrigin({ ...entry, owner: "Zzfighter" }, [blank, stated]).item).toBe(stated);
    const sub = cand("Ember Path", { docId: "t", featType: { value: "class", subtype: "Ember" } });
    expect(matchOrigin(entry, [blank, sub]).item).toBe(sub);
  });
  it("is ambiguous, never the first, when same-name candidates cannot be told apart", () => {
    const a = cand("Ember Path", { docId: "a" });
    const b = cand("Ember Path", { docId: "b" });
    expect(matchOrigin(entry, [a, b])).toMatchObject({ match: "ambiguous", candidates: [a, b] });
    const both = [cand("Ember Path", { docId: "x", ...grant({ class: "zzfighter", subclass: ["ember"] }) }),
      cand("Ember Path", { docId: "y", ...grant({ class: "zzfighter", subclass: ["ember"] }) })];
    expect(matchOrigin({ ...entry, level: undefined }, both).match).toBe("ambiguous");
  });
  it("tells the traits of two species apart by the race document that grants them", () => {
    const e = { name: "Dim Sight", kind: "species", edition: "2024", owner: "Glimmerkin" };
    const mine = cand("Dim Sight", { docId: "m", ...grant({ race: "Glimmerkin" }) });
    const theirs = cand("Dim Sight", { docId: "t", ...grant({ race: "Plainfolk" }) });
    expect(matchOrigin(e, [theirs, mine]).item).toBe(mine);
    expect(matchOrigin(e, [theirs])).toMatchObject({ match: "ambiguous", differences: ["owner"], candidates: [theirs] });
  });
  it("is ambiguous on owner, never matched or absent, when a lone candidate states another class", () => {
    const other = cand("Ember Path", { docId: "o", requirements: "Zzmage 3" });
    expect(matchOrigin(entry, [other])).toEqual({ match: "ambiguous", candidates: [other], differences: ["owner"] });
    const viaSubtype = cand("Ember Path", { docId: "p", featType: { value: "class", subtype: "Zzmage" } });
    expect(matchOrigin(entry, [viaSubtype]).differences).toEqual(["owner"]);
  });
  it("treats a general, origin, fighting style or epic boon feat as another owner than a class feature", () => {
    for (const value of ["general", "origin", "fightingStyle", "epicBoon"]) {
      const feat = cand("Ember Path", { featType: { value, subtype: "" } });
      expect(matchOrigin(entry, [feat]), value).toMatchObject({ match: "ambiguous", differences: ["owner"] });
    }
    const classFeat = cand("Ember Path", { featType: { value: "class", subtype: "" } });
    expect(matchOrigin(entry, [classFeat]).match).toBe("matched");
  });
  it("matches a candidate granted by the owner's class even when the grant is at another level (deliberate)", () => {
    const granted = cand("Ember Path", { ...grant({ class: "zzfighter", subclass: ["ember"], level: 5 }) });
    expect(matchOrigin(entry, [granted]).item).toBe(granted);
  });
});

describe("matchOrigin: item rarity", () => {
  const e = (rarity) => ({ name: "Lantern of Dusk", kind: "item", edition: "2024", rarity });
  const lantern = (rarity) => cand("Lantern of Dusk", { type: "equipment", ...(rarity ? { rarity } : {}) });
  it("compares case-insensitively, across the spellings of the dataset and the dumps", () => {
    expect(matchOrigin(e("very rare"), [lantern("veryRare")]).match).toBe("matched");
    expect(matchOrigin(e("Rare"), [lantern("rare")]).match).toBe("matched");
  });
  it("is ambiguous on a different rarity and never on a missing one", () => {
    expect(matchOrigin(e("rare"), [lantern("uncommon")])).toMatchObject({ match: "ambiguous", differences: ["rarity"] });
    expect(matchOrigin(e("rare"), [lantern()]).match).toBe("matched");
    expect(matchOrigin(e(undefined), [lantern("rare")]).match).toBe("matched");
    expect(matchOrigin(e("none"), [lantern("rare")]).match).toBe("matched");
  });
  it("compares the reference item too", () => {
    const reference = lantern("rare");
    expect(matchOrigin({ ...e(undefined), reference }, [lantern("common")]).match).toBe("ambiguous");
    expect(rarityDiffers("", "rare")).toBe(false);
  });
});

describe("identityOf and keyOf for kinds that carry level or rarity", () => {
  it("scopes features and traits by owner and level, spells and items by name alone", () => {
    expect(identityOf({ name: "Second Wind", kind: "feature", edition: "2024", owner: "Fighter", level: 1 }))
      .toBe("fighter/1/second-wind|feature|2024");
    expect(identityOf({ name: "Fireball", kind: "spell", edition: "2024", level: 3 })).toBe("fireball|spell|2024");
  });
  it("never puts a spell's level or an item's rarity into a key", () => {
    expect(keyOf({ book: "XPHB", kind: "spell", name: "Fireball", level: 3, school: "V" })).toBe("xphb:spell:fireball");
    expect(keyOf({ book: "XDMG", kind: "item", name: "Lantern of Dusk", rarity: "rare", owner: "Nobody" }))
      .toBe("xdmg:item:lantern-of-dusk");
    expect(keyOf({ book: "XPHB", kind: "feat", name: "Alert", level: 4 })).toBe("xphb:feat:alert");
  });
  it("throws when the name or an owner part slugs to nothing", () => {
    expect(() => keyOf({ book: "XPHB", kind: "feat", name: "!!!" })).toThrow(/name/);
    expect(() => keyOf({ book: "XPHB", kind: "feature", name: "X", owner: "Fighter/", level: 1 })).toThrow(/owner/);
  });
});

describe("dumps: what the summary carries", () => {
  it("carries rarity, feat type, requirements and the documents that grant it", () => {
    const docs = [
      { _id: "ClassDoc", name: "Zzfighter", type: "class", system: { identifier: "zzfighter", advancement: {
        a: { type: "ItemGrant", level: 3, configuration: { items: [{ uuid: "Compendium.pkg.classes.Item.FeatDoc" }] } },
        b: { type: "ScaleValue", configuration: {} }
      } } },
      { _id: "FeatDoc", name: "Ember Path", type: "feat", effects: [], system: {
        type: { value: "class", subtype: "Ember" }, requirements: "Zzfighter 3", source: { rules: "2024" } } },
      { _id: "ItemDoc", name: "Lantern", type: "equipment", system: { rarity: "rare" } }
    ];
    const grants = grantIndex(docs);
    expect(grants.get("FeatDoc")).toEqual([{ class: "zzfighter", level: 3 }]);
    expect(itemSummary(docs[1], "official", grants)).toMatchObject({
      featType: { value: "class", subtype: "Ember" }, requirements: "Zzfighter 3", grantedBy: [{ class: "zzfighter", level: 3 }]
    });
    expect(itemSummary(docs[2], "official")).toMatchObject({ rarity: "rare" });
    expect("rarity" in itemSummary(docs[1], "official")).toBe(false);
  });
});
