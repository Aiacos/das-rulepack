import { describe, it, expect } from "vitest";
import { diceForLevel, bladeData, inShadow, isThrown, isBladeIdentifier, turnAdvanced, BLADE_IDENTIFIER }
  from "../scripts/core/shadow-blade.mjs";

describe("Shadow Blade (XGE p.164)", () => {
  it("damage dice follow the slot level: 2d8, 3d8 at 3-4, 4d8 at 5-6, 5d8 at 7+", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(diceForLevel)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 5]);
    expect(diceForLevel(undefined)).toBe(2);
  });

  it("the blade is a proficient simple melee weapon: psychic, finesse, light, thrown 20/60", () => {
    const data = bladeData({ level: 5, name: "Shadow Blade", img: "x.webp", moduleId: "das-rulepack", spellUuid: "Actor.a.Item.s",
      activityId: "abcdefghijklmnop" });
    expect(data.name).toBe("Shadow Blade (4d8)");
    expect(data.system.type.value).toBe("simpleM");
    expect(data.system.proficient).toBe(1);
    expect(data.system.equipped).toBe(true);
    expect(data.system.properties).toEqual(expect.arrayContaining(["fin", "lgt", "thr"]));
    expect(data.system.range).toMatchObject({ value: 20, long: 60, units: "ft" });
    expect(data.system.damage.base).toMatchObject({ number: 4, denomination: 8, types: ["psychic"] });
    expect(data.system.identifier).toBe(BLADE_IDENTIFIER);
    const [activity] = Object.values(data.system.activities);
    expect(activity).toMatchObject({ _id: "abcdefghijklmnop", type: "attack", damage: { includeBase: true } });
    expect(data.flags["das-rulepack"].shadowBlade).toEqual({ spell: "Actor.a.Item.s", level: 5, thrown: false });
  });

  it("advantage only when the target is in dim light or darkness", () => {
    expect(["dim", "dark", "magical"].map(inShadow)).toEqual([true, true, true]);
    expect(["bright", null, undefined, ""].map(inShadow)).toEqual([false, false, false, false]);
  });

  it("recognises thrown attack modes", () => {
    expect(["thrown", "thrown-offhand"].map(isThrown)).toEqual([true, true]);
    expect(["oneHanded", "offhand", undefined].map(isThrown)).toEqual([false, false, false]);
  });

  it("recognises its own blade and those conjured by DDB Importer, not the spell or other items", () => {
    expect(["shadow-blade-weapon", "shadow-blade-2d8", "shadow-blade-5d8"].map(isBladeIdentifier)).toEqual([true, true, true]);
    expect(["shadow-blade", "shadow-blade-6d8", "dagger", null].map(isBladeIdentifier)).toEqual([false, false, false, false]);
  });

  it("a blade dissipates when the turn ends, not when the GM steps back a turn", () => {
    expect(turnAdvanced({ round: 1, turn: 2 }, { round: 1, turn: 3 })).toBe(true);
    expect(turnAdvanced({ round: 1, turn: 3 }, { round: 2, turn: 0 })).toBe(true);
    expect(turnAdvanced({ round: 1, turn: 3 }, { round: 1, turn: 2 })).toBe(false);
    expect(turnAdvanced({ round: 2, turn: 0 }, { round: 1, turn: 3 })).toBe(false);
    expect(turnAdvanced({ round: 1, turn: 2 }, { round: 1, turn: 2 })).toBe(false);
  });
});
