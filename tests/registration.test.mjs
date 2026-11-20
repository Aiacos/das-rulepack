import { describe, it, expect, beforeAll } from "vitest";

// What the pack hands to DAS · Core, taken at the real registration point: main.mjs is loaded with a stand-in for Foundry's
// `Hooks`, and the engine's `register(source, table)` is replaced by a function that keeps what it is given.
let source, table;

beforeAll(async () => {
  const once = new Map();
  globalThis.Hooks = { once: (name, fn) => once.set(name, fn), on: () => {} };
  await import("../scripts/main.mjs");
  once.get("dnd5e-combat.registerContent")((src, tbl) => { source = src; table = tbl; });
});

describe("what is registered with DAS · Core", () => {
  it("is registered once, under the module's id", () => {
    expect(source).toBe("das-rulepack");
  });

  // A rule lost, renamed or added by mistake fails here. A rule added on purpose is added to this list.
  it("is exactly this set of identifiers", () => {
    expect(Object.keys(table).sort()).toEqual([
      "dreadful-strikes",
      "earth-tremor",
      "frostbite",
      "ghostly-gaze",
      "holy-weapon",
      "incite-greed",
      "inspiring-smite",
      "irresistible-dance",
      "life-sense",
      "lightning-lure",
      "power-word-pain",
      "psychic-scream",
      "psychic-veil",
      "pyrotechnics",
      "raulothims-psychic-lance",
      "shadow-blade",
      "snare",
      "tashas-caustic-brew",
      "tashas-mind-whip",
      "wall-of-light",
      "watery-sphere",
      "zephyr-strike"
    ]);
  });

  // The content of every entry, key by key (object key order is not significant, array order is). After a change made on
  // purpose: `npx vitest run -u`, and read the diff of tests/__snapshots__ before committing it.
  it("with exactly these entries", () => {
    expect(table).toMatchSnapshot();
  });
});
