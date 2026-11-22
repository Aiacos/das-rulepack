import { describe, it, expect, vi, beforeEach } from "vitest";
import { withKnownEntries } from "../scripts/known-entries.mjs";

// Ruling R37: an entry the running DAS · Core refuses (a key newer than that engine, `saveAutoFail` on its latest release)
// is never half-registered: the engine's register() would drop the entry but keep its sources, binding the item to an
// identifier with no entry, so the engine's own shipped entry for it would stop applying. The pack asks the running engine
// first (`api.content.validate`, never its version) and leaves out the rule, its aliases and its sources, in one line.
const OLD = (entry) => (Object.hasOwn(entry, "saveAutoFail") ? ["saveAutoFail: unknown key (smite, triggers)"] : []);
const NEW = () => [];
const TABLE = { "wilting-hush": { saveAutoFail: { types: ["plant"] } }, "wilting-hush-ddb": { saveAutoFail: { types: ["plant"] } },
  "glimmer-ring": { triggers: [] } };
const RULES = [{ identifier: "wilting-hush", alsoAs: ["wilting-hush-ddb"] }, { identifier: "glimmer-ring" }];
const SOURCES = { Wh00Wh11Wh22Wh33: "wilting-hush", Of00Of11Of22Of33: "glimmer-ring" };

describe("withKnownEntries: the rules the running engine accepts", () => {
  it("keeps everything when the engine accepts every entry", () => {
    expect(withKnownEntries(TABLE, RULES, SOURCES, NEW)).toEqual({ table: TABLE, sources: SOURCES, skipped: [] });
  });
  it("leaves out a refused rule with its aliases and its sources, and nothing else", () => {
    const out = withKnownEntries(TABLE, RULES, SOURCES, OLD);
    expect(out.table).toEqual({ "glimmer-ring": { triggers: [] } });
    expect(out.sources).toEqual({ Of00Of11Of22Of33: "glimmer-ring" });
    expect(out.skipped).toEqual(["wilting-hush"]);
    expect(Object.keys(TABLE)).toHaveLength(3);
  });
  it("a refused alias takes its rule out too; an entry that makes the engine throw is refused", () => {
    const aliasOnly = (entry) => (entry === TABLE["wilting-hush-ddb"] ? ["no"] : []);
    expect(withKnownEntries(TABLE, RULES, SOURCES, aliasOnly).skipped).toEqual(["wilting-hush"]);
    const throws = (entry) => { if (entry.saveAutoFail) throw new Error("x"); return []; };
    expect(withKnownEntries(TABLE, RULES, SOURCES, throws).skipped).toEqual(["wilting-hush"]);
  });
  it("an engine that cannot be asked registers as it always did (its register() still validates)", () => {
    expect(withKnownEntries(TABLE, RULES, SOURCES, undefined)).toEqual({ table: TABLE, sources: SOURCES, skipped: [] });
  });
});

const load = async (validate) => {
  vi.resetModules();
  vi.doMock("../scripts/rules/index.mjs", () => ({ TABLE, SOURCES, RULES }));
  globalThis.game = { modules: { get: () => ({ api: { content: { validate, validateSources: () => [] } } }) } };
  const once = new Map();
  globalThis.Hooks = { once: (name, fn) => once.set(name, fn), on: () => {} };
  await import("../scripts/main.mjs");
  const calls = [];
  once.get("dnd5e-combat.registerContent")((...args) => calls.push(args));
  return calls;
};

describe("registration on an engine that does not know a key of a rule", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("registers neither the rule nor its sources, and says so in one line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const [call] = await load(OLD);
    expect(call[1]).toEqual({ "glimmer-ring": { triggers: [] } });
    expect(call[2]).toEqual({ sources: { Of00Of11Of22Of33: "glimmer-ring" } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0].join(" ")).toMatch(/1 rule\(s\) this DAS · Core refuses.*wilting-hush/);
  });
  it("registers everything, silently, on an engine that knows it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const [call] = await load(NEW);
    expect(call[1]).toEqual(TABLE);
    expect(call[2]).toEqual({ sources: SOURCES });
    expect(warn).not.toHaveBeenCalled();
  });
});
