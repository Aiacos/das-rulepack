import { describe, it, expect, vi, beforeEach } from "vitest";

// The pack hands its SOURCES to the engine's register(source, table, { sources }) only when there are some; with none the call
// is the two-argument call it always was (tests/registration.test.mjs pins what is registered).
const load = async (sources, { rules = [], builtin } = {}) => {
  vi.resetModules();
  vi.doMock("../scripts/rules/index.mjs", () => ({ TABLE: { "glimmer-ring": { triggers: [] } }, SOURCES: sources,
    RULES: rules }));
  globalThis.game = { modules: { get: () => (builtin ? { api: { content: { builtin } } } : undefined) } };
  const once = new Map();
  globalThis.Hooks = { once: (name, fn) => once.set(name, fn), on: () => {} };
  await import("../scripts/main.mjs");
  const calls = [];
  once.get("dnd5e-combat.registerContent")((...args) => calls.push(args));
  return calls;
};

describe("registration of the sources", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("passes no third argument while SOURCES is empty", async () => {
    const [call] = await load({});
    expect(call).toHaveLength(2);
  });
  it("passes { sources } to the engine's register when there are some", async () => {
    const [call] = await load({ Of00Of11Of22Of33: "glimmer-ring" });
    expect(call[2]).toEqual({ sources: { Of00Of11Of22Of33: "glimmer-ring" } });
  });
  // Ruling R29, fix round 1: a rule that rebinds its item carries over engine keys, taken from the engine's shipped table.
  it("adds a rule's carried engine keys from the engine's shipped entries, and leaves out one the engine lacks", async () => {
    const rules = [{ identifier: "glimmer-ring", carries: { from: "ring", keys: ["magical"] } }];
    const [call] = await load({}, { rules, builtin: { ring: { magical: true } } });
    expect(call[1]).toEqual({ "glimmer-ring": { triggers: [], magical: true } });
    const [none] = await load({}, { rules, builtin: { ring: {} } });
    expect(none[1]).toEqual({});
  });
});
