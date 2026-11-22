import { describe, it, expect, vi, beforeEach } from "vitest";
import { withAcceptedSources } from "../scripts/scoped-sources.mjs";

// The pack hands its SOURCES to the engine's register(source, table, { sources }) only when there are some; with none the call
// is the two-argument call it always was (tests/registration.test.mjs pins what is registered).
const load = async (sources, { rules = [], builtin, validateSources, table = { "glimmer-ring": { triggers: [] } } } = {}) => {
  vi.resetModules();
  vi.doMock("../scripts/rules/index.mjs", () => ({ TABLE: table, SOURCES: sources, RULES: rules }));
  const content = { ...(builtin ? { builtin } : {}), ...(validateSources ? { validateSources } : {}) };
  globalThis.game = { modules: { get: () => (Object.keys(content).length ? { api: { content } } : undefined) } };
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

// Ruling R35: an `<actor id>.<item id>` source binds one creature's feature; an older DAS · Core refuses such keys. The pack
// asks the running engine (`api.content.validateSources`) before registering, and leaves out what it would refuse.
const ID = /^[A-Za-z0-9]{16}$/;
const OLD = (sources) => Object.keys(sources).filter((k) => !ID.test(k)).map((k) => `sources.${k}: document id expected`);
const NEW = (sources) => Object.keys(sources).filter((k) => k.split(".").length > 2 || !k.split(".").every((p) => ID.test(p)))
  .map((k) => `sources.${k}: document id, or actor id.item id, expected`);
const SCOPED = { "Wo00Wo11Wo22Wo33.Bi00Bi11Bi22Bi33": "tst-dire-wolf-bite", Of00Of11Of22Of33: "glimmer-ring" };
const TABLE = { "glimmer-ring": { triggers: [] }, "tst-dire-wolf-bite": { halfOnMiss: true } };

describe("withAcceptedSources: the sources and rules the running engine accepts", () => {
  it("keeps every source and rule when the engine accepts actor.item keys", () => {
    const out = withAcceptedSources(TABLE, [], SCOPED, NEW);
    expect(out).toEqual({ table: TABLE, sources: SCOPED, skipped: [] });
  });
  it("leaves out an actor.item source and the rules it binds on an engine that refuses it, or that cannot say", () => {
    for (const validate of [OLD, undefined, () => { throw new Error("x"); }]) {
      const out = withAcceptedSources(TABLE, [{ identifier: "tst-dire-wolf-bite", alsoAs: ["tst-wolf-bite"] }], SCOPED, validate);
      expect(out.table).toEqual({ "glimmer-ring": { triggers: [] } });
      expect(out.sources).toEqual({ Of00Of11Of22Of33: "glimmer-ring" });
      expect(out.skipped).toEqual(["tst-dire-wolf-bite"]);
    }
    // The input is not changed.
    expect(Object.keys(TABLE)).toHaveLength(2);
  });
  it("never asks about a plain document id: it is registered as it always was", () => {
    const out = withAcceptedSources(TABLE, [], { Of00Of11Of22Of33: "glimmer-ring" }, undefined);
    expect(out.sources).toEqual({ Of00Of11Of22Of33: "glimmer-ring" });
    expect(out.skipped).toEqual([]);
  });
});

describe("registration on an engine that refuses actor.item sources", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("registers neither the source nor its rule, and says in one line how many and why", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const [call] = await load(SCOPED, { table: TABLE, validateSources: OLD });
    expect(call[1]).toEqual({ "glimmer-ring": { triggers: [] } });
    expect(call[2]).toEqual({ sources: { Of00Of11Of22Of33: "glimmer-ring" } });
    const lines = warn.mock.calls.map((c) => c.join(" ")).filter((l) => /actor id/.test(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/1 rule/);
  });
  it("registers both on an engine that accepts them, silently", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const [call] = await load(SCOPED, { table: TABLE, validateSources: NEW });
    expect(call[1]).toEqual(TABLE);
    expect(call[2]).toEqual({ sources: SCOPED });
    expect(warn).not.toHaveBeenCalled();
  });
});
