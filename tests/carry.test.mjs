// Fix round 1 (Ruling R29): a monster rule that rebinds its item carries over the engine keys the rebinding would drop. The
// keys are named in the rule (`carries`); their values are taken from the engine's own shipped table when the pack registers.
import { describe, it, expect } from "vitest";
import { withCarried } from "../scripts/carry.mjs";

const rule = (identifier, carries) => ({ identifier, entry: { halfOnMiss: true }, ...(carries ? { carries } : {}) });

describe("withCarried: the table registered, with the carried engine keys resolved from the engine's shipped entries", () => {
  it("adds the carried keys from the shipped entry under the original identifier, copies them, and leaves others alone", () => {
    const builtin = { "gust-slam": { magical: true, usageLimits: { max: 1 } }, other: { noBonus: true } };
    const table = { "tst-a": { halfOnMiss: true }, "tst-b": { halfOnMiss: true } };
    const { table: out, missing } = withCarried(table,
      [rule("tst-a", { from: "gust-slam", keys: ["usageLimits"] }), rule("tst-b")], builtin);
    expect(out).toEqual({ "tst-a": { halfOnMiss: true, usageLimits: { max: 1 } }, "tst-b": { halfOnMiss: true } });
    expect(missing).toEqual([]);
    out["tst-a"].usageLimits.max = 9;
    expect(builtin["gust-slam"].usageLimits.max).toBe(1);
    expect(table["tst-a"]).toEqual({ halfOnMiss: true });
  });

  it("registers nothing for a rule whose carried key the running engine no longer ships (fail closed)", () => {
    const { table: out, missing } = withCarried({ "tst-a": { halfOnMiss: true } },
      [rule("tst-a", { from: "gust-slam", keys: ["magical"] })], { "gust-slam": {} });
    expect(out).toEqual({});
    expect(missing).toEqual(["tst-a"]);
    expect(withCarried({ "tst-a": {} }, [rule("tst-a", { from: "x", keys: ["magical"] })], undefined).missing).toEqual(["tst-a"]);
  });
});

describe("docs/RULES.md says what a rule carries over", () => {
  it("names the carried engine keys, and nothing for a rule that carries none", async () => {
    const { carriesNote } = await import("../tools/books-progress.mjs");
    expect(carriesNote({ carries: { from: "x", keys: ["usageLimits"] } })).toBe(" Carries over 1 engine key (usageLimits).");
    expect(carriesNote({ carries: { from: "x", keys: ["a", "b"] } })).toBe(" Carries over 2 engine keys (a, b).");
    expect(carriesNote({})).toBe("");
  });
});
