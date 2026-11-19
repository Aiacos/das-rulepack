import { describe, it, expect } from "vitest";
import { damageEndsVeil } from "../scripts/core/psychic-veil.mjs";
import { FEATURES } from "../scripts/rules/features.mjs";

describe("Psychic Veil", () => {
  it("the damage of an attack ends the veil; a miss rolls no damage, so nothing ends it", () => {
    expect(damageEndsVeil({ activityType: "attack" })).toBe(true);
  });
  it("a healing roll, or the damage of a use that is not an attack (left to the engine), does not", () => {
    expect(damageEndsVeil({ activityType: "attack", healing: true })).toBe(false);
    expect(damageEndsVeil({ activityType: "save" })).toBe(false);
    expect(damageEndsVeil({ activityType: "damage" })).toBe(false);
    expect(damageEndsVeil()).toBe(false);
  });
  it("the engine keeps the two moments it can tell: a damaging use that is not an attack, a use that forces a save", () => {
    expect(FEATURES["psychic-veil"].breaksOn).toEqual(["damage", "forcesSave"]);
  });
});
