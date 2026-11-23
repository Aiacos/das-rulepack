import { describe, it, expect } from "vitest";
import { structureOf } from "../../tools/pipeline/structure.mjs";

// Synthetic fixture: an invented spell-like document, with a marker hidden in every place that holds prose.
const MARK = "ZZMARKERZZ";
const doc = () => ({
  _id: "Aa00Bb11Cc22Dd33", name: `Invented Bolt ${MARK}`, type: "spell",
  flags: { x: { note: MARK } },
  system: {
    description: { value: `<p>${MARK} deals fire damage to a creature that the caster can see within range.</p>`, chat: MARK },
    unidentified: { description: MARK },
    level: 2, school: "evo", rarity: "rare", properties: ["vocal", "concentration"],
    duration: { value: "1", units: "minute" },
    uses: { max: "3", spent: 1, recovery: [{ period: "lr", type: "recoverAll" }] },
    activities: {
      actAAAAAAAAAAAAA: {
        _id: "actAAAAAAAAAAAAA", type: "save", name: `<b>Bolt</b> ${"x".repeat(60)} ${MARK}`,
        activation: { type: "action", value: 1, condition: MARK },
        save: { ability: ["dex"], dc: { calculation: "spellcasting", formula: "" } },
        damage: {
          onSave: "half", parts: [{ number: 3, denomination: 6, types: ["fire", "cold"], bonus: "@mod", custom: { formula: MARK } }]
        },
        target: { template: { type: "sphere", size: "20" }, affects: { type: "creature", count: "1" } },
        effects: [{ _id: "effBBBBBBBBBBBBB" }],
        consumption: { targets: [{ type: "itemUses", target: "", value: "1" }] }
      },
      actCCCCCCCCCCCCC: {
        _id: "actCCCCCCCCCCCCC", type: "heal", activation: { type: "bonus" },
        healing: { number: 1, denomination: 4, types: ["healing"] }
      }
    }
  },
  effects: [{
    _id: "effBBBBBBBBBBBBB", name: "Burning", statuses: ["burning"], transfer: false, description: MARK,
    changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: MARK }],
    duration: { seconds: 60, rounds: null, turns: null, startTime: 5 }
  }]
});

describe("structureOf: an attack that takes its damage from the item", () => {
  const weapon = (includeBase, parts = []) => ({
    _id: "Ww00Bb11Cc22Dd33", name: "Invented Claw", type: "weapon",
    system: {
      damage: { base: { number: 2, denomination: 6, types: ["slashing"], bonus: "@mod", custom: { formula: MARK } } },
      activities: { actWWWWWWWWWWWWW: { _id: "actWWWWWWWWWWWWW", type: "attack", damage: { includeBase, parts } } }
    }
  });
  it("lists the base damage first when the activity includes it", () => {
    expect(structureOf(weapon(true)).activities[0].damage).toEqual([{ number: 2, denomination: 6, types: ["slashing"] }]);
    expect(structureOf(weapon(true, [{ number: 1, denomination: 4, types: ["fire"] }])).activities[0].damage).toEqual([
      { number: 2, denomination: 6, types: ["slashing"] }, { number: 1, denomination: 4, types: ["fire"] }]);
    expect(JSON.stringify(structureOf(weapon(true)))).not.toContain(MARK);
  });
  it("leaves it out when the activity does not include it, or is not an attack", () => {
    expect(structureOf(weapon(false)).activities[0].damage).toEqual([]);
    const d = weapon(true);
    d.system.activities.actWWWWWWWWWWWWW.type = "save";
    expect(structureOf(d).activities[0].damage).toEqual([]);
  });
});

describe("structureOf", () => {
  it("summarises activities and effects without a word of prose", () => {
    const s = structureOf(doc());
    expect(s.level).toBe(2);
    expect(s.school).toBe("evo");
    expect(s.rarity).toBe("rare");
    expect(s.concentration).toBe(true);
    expect(s.duration).toEqual({ value: "1", units: "minute" });
    expect(s.uses).toEqual({ max: "3", recovery: ["lr"] });
    const [save, heal] = s.activities;
    expect(save).toEqual({
      id: "actAAAAAAAAAAAAA", label: expect.any(String), type: "save", activation: "action",
      save: { ability: ["dex"], dc: { calculation: "spellcasting", formula: "" } }, onSave: "half",
      damage: [{ number: 3, denomination: 6, types: ["cold", "fire"] }],
      template: { type: "sphere", size: "20" }, affects: { type: "creature", count: "1" },
      effects: ["effBBBBBBBBBBBBB"], consumes: [{ type: "itemUses", target: "", value: "1" }]
    });
    // A change of form is dnd5e's own `transform` activity: the summary says what it does (the preset, what the creature
    // keeps, whether the new form's hit points come as temporary ones), so that it is not read as missing.
    const shaped = structureOf({ type: "spell", system: { activities: { a: { _id: "actAAAAAAAAAAAAA", type: "transform",
      transform: { mode: "cr", preset: "polymorph", customize: true },
      settings: { keep: ["saves", "mental"], tempFormula: "@source.attributes.hp.max", transformTokens: true } } } } });
    expect(shaped.activities[0].transform).toEqual({ mode: "cr", preset: "polymorph", keeps: ["mental", "saves"], tempHp: true });
    const bare = structureOf({ type: "spell", system: { activities: { a: { _id: "actAAAAAAAAAAAAA", type: "transform",
      transform: { mode: "cr" } } } } });
    expect(bare.activities[0].transform).toEqual({ mode: "cr", tempHp: false });
    const other = structureOf({ type: "spell", system: { activities: { a: { _id: "actAAAAAAAAAAAAA", type: "save" } } } });
    expect("transform" in other.activities[0]).toBe(false);
    // What the system grants by itself when the feature is on the sheet: its advancements, as closed words (the type, the
    // trait keys a Trait grants or offers, how many items an ItemGrant hands over, whether they are spells).
    const granted = structureOf({ type: "feat", system: { activities: {}, advancement: [
      { type: "Trait", configuration: { mode: "default", grants: ["dr:necrotic", "dr:radiant"], choices: [] } },
      { type: "ItemGrant", configuration: { items: [{ uuid: "Compendium.x.Item.aaaaaaaaaaaaaaaa" }, { uuid: "y" }],
        spell: { method: "spell" } } },
      { type: "ScaleValue", configuration: { identifier: "dice" } }] } });
    expect(granted.advancements).toEqual([
      { type: "ItemGrant", items: 2, spells: true },
      { type: "ScaleValue" },
      { type: "Trait", grants: ["dr:necrotic", "dr:radiant"] }]);
    const keyed = structureOf({ type: "feat", system: { activities: {}, advancement: { a1: { type: "Trait",
      configuration: { grants: [], choices: [{ count: 1, pool: ["skills:*"] }] } } } } });
    expect(keyed.advancements).toEqual([{ type: "Trait", choices: 1 }]);
    expect("advancements" in structureOf({ type: "feat", system: { activities: {} } })).toBe(false);
    // dnd5e stores one save ability as a bare string in older data: it reads as that one ability, not as none.
    const one = structureOf({ type: "spell", system: { activities: { a: { _id: "actAAAAAAAAAAAAA", type: "save",
      save: { ability: "wis", dc: { calculation: "spellcasting", formula: "" } } } } } });
    expect(one.activities[0].save.ability).toEqual(["wis"]);
    const none = structureOf({ type: "spell", system: { activities: { a: { _id: "actAAAAAAAAAAAAA", type: "save",
      save: { ability: "", dc: { calculation: "spellcasting", formula: "" } } } } } });
    expect(none.activities[0].save.ability ?? []).toEqual([]);
    expect(heal).toMatchObject({ id: "actCCCCCCCCCCCCC", type: "heal", activation: "bonus", damage: [] });
    expect(heal.healing).toEqual([{ number: 1, denomination: 4, types: ["healing"] }]);
    expect(s.effects).toEqual([{
      id: "effBBBBBBBBBBBBB", name: "Burning", statuses: ["burning"], changes: ["system.attributes.ac.bonus"],
      transfer: false, duration: { seconds: 60 }
    }]);
  });

  it("truncates the activity label to 40 characters and strips markup", () => {
    const [save] = structureOf(doc()).activities;
    expect(save.label.length).toBeLessThanOrEqual(40);
    expect(save.label).not.toMatch(/[<>]/);
  });

  it("never carries description text, flags or change values: the JSON holds no marker", () => {
    const json = JSON.stringify(structureOf(doc()));
    expect(json).not.toContain(MARK);
    expect(json).not.toContain("<p>");
    expect(json).not.toContain("deals fire damage");
  });

  it("reads changes from system.changes and tolerates a bare document", () => {
    const effect = { _id: "e", name: "n", system: { changes: [{ key: "flags.a" }] }, transfer: true };
    const s = structureOf({ _id: "x", effects: [effect] });
    expect(s.activities).toEqual([]);
    expect(s.effects).toEqual([{ id: "e", name: "n", statuses: [], changes: ["flags.a"], transfer: true }]);
    expect(structureOf({})).toEqual({ activities: [], effects: [] });
  });

  it("drops a text-like value in a numeric slot instead of copying it", () => {
    const d = doc();
    d.system.activities.actAAAAAAAAAAAAA.damage.parts[0].number = `${MARK} a long sentence that is clearly prose, not a number`;
    d.system.duration.units = `${MARK} some prose that is clearly not a unit of time at all, not even close to it`;
    expect(JSON.stringify(structureOf(d))).not.toContain(MARK);
  });
});
