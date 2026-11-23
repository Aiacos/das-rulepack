import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BLADE_CANTRIPS, hitDice, moveDice, hitFormula, leapFormula, feetBetween, gapFeet, withinLeap, movedEnough, hitTargets,
  carriedMove }
  from "../scripts/core/blade-cantrips.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const grid = { size: 100, distance: 5 };
const at = (i, j, width=1, height=1) => ({ x: i * 100, y: j * 100, width, height });

describe("Booming Blade and Green-Flame Blade (TCE p.106-107)", () => {
  it("extra dice on a hit: none before 5th level, then 1d8, 2d8 at 11th, 3d8 at 17th", () => {
    expect([1, 4, 5, 10, 11, 16, 17, 20].map(hitDice)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect([1, 5, 11, 17].map(hitFormula)).toEqual([null, "1d8", "2d8", "3d8"]);
  });

  it("thunder for moving: 1d8, then 2d8 at 5th, 3d8 at 11th, 4d8 at 17th", () => {
    expect([1, 4, 5, 11, 17].map(moveDice)).toEqual([1, 1, 2, 3, 4]);
  });

  it("the leaping fire is the spellcasting modifier, plus the dice from 5th level", () => {
    expect(leapFormula(1, 3)).toBe("3");
    expect(leapFormula(5, 3)).toBe("1d8 + 3");
    expect(leapFormula(11, 5)).toBe("2d8 + 5");
    expect(leapFormula(5, 0)).toBe("1d8");
    expect(leapFormula(5, -1)).toBe("1d8 - 1");
    expect(leapFormula(1, -1)).toBe("0");   // never negative damage
  });

  it("the two cantrips and their damage types", () => {
    expect(BLADE_CANTRIPS["booming-blade"].type).toBe("thunder");
    expect(BLADE_CANTRIPS["green-flame-blade"].type).toBe("fire");
  });

  it("a sheathed target sets off the energy by moving 5 feet or more, diagonals included", () => {
    expect(feetBetween(at(2, 2), at(3, 2), grid)).toBe(5);
    expect(feetBetween(at(2, 2), at(3, 3), grid)).toBe(5);
    expect(movedEnough(at(2, 2), at(2, 2), grid)).toBe(false);
    expect(movedEnough(at(2, 2), { x: 240, y: 200 }, grid)).toBe(false);   // nudged within its square
    expect(movedEnough(at(2, 2), at(3, 2), grid)).toBe(true);
    expect(movedEnough(at(2, 2), at(2, 4), grid)).toBe(true);
  });

  it("the fire leaps only to a creature within 5 feet of the target", () => {
    expect(gapFeet(at(2, 2), at(3, 2), grid)).toBe(0);
    expect(gapFeet(at(2, 2), at(4, 2), grid)).toBe(5);
    expect(withinLeap(at(2, 2), at(3, 3), grid)).toBe(true);    // diagonal neighbour
    expect(withinLeap(at(2, 2), at(4, 2), grid)).toBe(false);   // one empty square between
    expect(withinLeap(at(2, 2, 2, 2), at(4, 3), grid)).toBe(true);    // next to a Large creature
    expect(withinLeap(at(2, 2, 2, 2), at(5, 3), grid)).toBe(false);
  });

  it("reads the hit targets from a settled attack only", () => {
    const targets = [{ token: "Scene.s.Token.a", hit: true }, { token: "Scene.s.Token.b", hit: false },
      { token: "Scene.s.Token.c", hit: true, unaffected: { reason: "immune" } }];
    expect(hitTargets({ step: "done", plan: { attack: true }, targets })).toEqual(["Scene.s.Token.a"]);
    expect(hitTargets({ step: "missed", plan: { attack: true }, targets: [{ token: "x", hit: false }] })).toEqual([]);
    expect(hitTargets({ step: "awaitingRolls", plan: { attack: true }, targets })).toBe(null);
    expect(hitTargets({ step: "awaitingAttack", plan: { attack: true }, targets })).toBe(null);
    expect(hitTargets({ step: "done", plan: { attack: false }, targets })).toBe(null);
    expect(hitTargets(undefined)).toBe(null);
  });
});

describe("translations", () => {
  const read = lang => JSON.parse(readFileSync(resolve(HERE, `../lang/${lang}.json`), "utf8"));
  it("English and Italian have the same keys and placeholders", () => {
    const en = read("en"), it_ = read("it");
    expect(Object.keys(it_).sort()).toEqual(Object.keys(en).sort());
    for ( const key of Object.keys(en) ) {
      const holes = text => (text.match(/\{[a-z]+\}/g) ?? []).sort();
      expect(holes(it_[key]), key).toEqual(holes(en[key]));
    }
  });
  it("a displacement or a teleport is not the creature's own walk; the deprecated teleport option is not read", () => {
    expect(carriedMove([{ action: "walk" }, { action: "jump" }])).toBe(false);
    expect(carriedMove([{ action: "walk" }, { action: "displace" }])).toBe(true);
    expect(carriedMove([{ action: "blink" }])).toBe(true);
    expect(carriedMove(null)).toBe(false);
    expect(carriedMove([{}])).toBe(false);
    const source = readFileSync(resolve(HERE, "../scripts/blade-cantrips.mjs"), "utf8");
    expect(source).not.toMatch(/options\?*\.teleport/);
  });
  it("every key used in the scripts exists", () => {
    const en = read("en");
    for ( const file of ["shadow-blade.mjs", "blade-cantrips.mjs"] ) {
      const source = readFileSync(resolve(HERE, "../scripts", file), "utf8");
      for ( const [, key] of source.matchAll(/loc\("([A-Za-z.]+)"/g) ) expect(en[`DASRULEPACK.${key}`], `${file}: ${key}`).toBeTruthy();
      for ( const [, key] of source.matchAll(/"(DASRULEPACK\.[A-Za-z.]+)"/g) ) expect(en[key], `${file}: ${key}`).toBeTruthy();
    }
  });
});
