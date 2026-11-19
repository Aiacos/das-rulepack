import { describe, it, expect } from "vitest";
import { alreadyStruck, recordStrike, strikeDie } from "../scripts/core/dreadful-strikes.mjs";

describe("Dreadful Strikes", () => {
  it("d4, d6 from ranger level 11", () => {
    expect(strikeDie(3)).toBe(4);
    expect(strikeDie(10)).toBe(4);
    expect(strikeDie(11)).toBe(6);
    expect(strikeDie(undefined)).toBe(4);
  });

  it("once per turn for each target: a second creature hit on the same turn still takes it", () => {
    let state = null;
    expect(alreadyStruck(state, "c.1.0", "A")).toBe(false);
    state = recordStrike(state, "c.1.0", "A");
    expect(alreadyStruck(state, "c.1.0", "A")).toBe(true);
    expect(alreadyStruck(state, "c.1.0", "B")).toBe(false);
    state = recordStrike(state, "c.1.0", "B");
    expect(state).toEqual({ turn: "c.1.0", targets: ["A", "B"] });
    expect(alreadyStruck(state, "c.1.0", "B")).toBe(true);
  });

  it("another turn (an opportunity attack, the next round) starts again", () => {
    const state = recordStrike(null, "c.1.0", "A");
    expect(alreadyStruck(state, "c.1.1", "A")).toBe(false);
    expect(recordStrike(state, "c.1.1", "A")).toEqual({ turn: "c.1.1", targets: ["A"] });
  });

  it("outside combat there is no turn to count", () => {
    expect(alreadyStruck({ turn: null, targets: ["A"] }, null, "A")).toBe(false);
  });
});
