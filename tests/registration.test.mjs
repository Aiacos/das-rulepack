import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BOOKS, RULES, SOURCES } from "../scripts/rules/index.mjs";
import { ROOT, fromRegistry } from "./derived.mjs";

// What the pack hands to DAS · Core, taken at the real registration point: main.mjs is loaded with a stand-in for Foundry's
// `Hooks`, and the engine's `register(source, table, options)` is replaced by a function that keeps what it is given.
let source, table, options, calls = 0;
const derived = fromRegistry();

beforeAll(async () => {
  const once = new Map();
  globalThis.Hooks = { once: (name, fn) => once.set(name, fn), on: () => {} };
  // The engine's shipped table, as the pack reads it when it registers (scripts/carry.mjs): a stand-in holding the keys the
  // rules carry over, each with a value that names it. Without it a carrying rule is not registered at all (tested apart).
  globalThis.game = { modules: { get: () => ({ api: { content: { builtin: BUILTIN } } }) } };
  await import("../scripts/main.mjs");
  once.get("dnd5e-combat.registerContent")((src, tbl, opts) => { calls++; source = src; table = tbl; options = opts; });
});

// The identifiers the 24 legacy rules (registry/legacy.json) register: 22, the two blade cantrips being handled in code alone.
// A legacy rule lost, renamed or added by mistake fails here; this list is not extended for the rules of the pipeline.
const LEGACY_IDENTIFIERS = [
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
];
// What a rule's `carries` adds to its entry at registration, with the stand-in above: `{ <key>: "engine:<from>.<key>" }`.
const BUILTIN = {};
for (const rule of RULES.filter((r) => r.carries)) {
  BUILTIN[rule.carries.from] ??= {};
  for (const key of rule.carries.keys) BUILTIN[rule.carries.from][key] = `engine:${rule.carries.from}.${key}`;
}
const carriedOf = (rule) => Object.fromEntries((rule?.carries?.keys ?? []).map((k) => [k, BUILTIN[rule.carries.from][k]]));
const ruleOf = (id) => RULES.find((r) => r.identifier === id || (r.alsoAs ?? []).includes(id));
const pick = (object, keys) => Object.fromEntries(keys.map((k) => [k, object[k]]));
const registeredBy = (rules) => rules.filter((r) => r.entry).flatMap((r) => [r.identifier, ...(r.alsoAs ?? [])]).sort();

describe("what is registered with DAS · Core", () => {
  it("is registered once, under the module's id", () => {
    expect(calls).toBe(1);
    expect(source).toBe("das-rulepack");
  });

  // Legacy pin: the identifiers of the 24 legacy rules, written out. Their registry records must emit exactly these.
  it("is exactly this set of identifiers", () => {
    expect(derived.legacyKeys).toHaveLength(24);
    const legacy = derived.emitted.filter(({ record }) => derived.isLegacy(record)).map(({ rule }) => rule);
    expect(legacy).toHaveLength(24);
    expect(registeredBy(legacy)).toEqual(LEGACY_IDENTIFIERS);
    for (const id of LEGACY_IDENTIFIERS) expect(table, id).toHaveProperty([id]);
  });

  // Derived: the registered table is the table registry/ emits (ruleFromRecord: legacy with standing, or current gates), no
  // more, no less; whatever is not a legacy identifier comes from a rule of the pipeline.
  it("is exactly what registry/ emits, the 24 legacy rules and the others", () => {
    expect(Object.keys(table).sort()).toEqual(Object.keys(derived.table).sort());
    const others = derived.emitted.filter(({ record }) => !derived.isLegacy(record)).map(({ rule }) => rule);
    expect(Object.keys(table).filter((id) => !LEGACY_IDENTIFIERS.includes(id)).sort()).toEqual(registeredBy(others));
  });

  // Legacy pin: the content of every legacy entry, key by key (object key order is not significant, array order is). After a
  // change made on purpose: `npx vitest run -u`, and read the diff of tests/__snapshots__ before committing it.
  it("with exactly these entries", () => {
    expect(pick(table, LEGACY_IDENTIFIERS)).toMatchSnapshot();
  });

  it("every entry is the entry of its rule in registry/, the legacy ones included", () => {
    for (const [id, entry] of Object.entries(derived.table)) expect(table[id], id).toEqual({ ...entry, ...carriedOf(ruleOf(id)) });
  });

  it("the sources passed beside the table are those registry/ binds, and only when there are some", () => {
    if (Object.keys(derived.sources).length) expect(options).toEqual({ sources: derived.sources });
    else expect(options).toBeUndefined();
  });
});

// The runtime side: main.mjs registers the TABLE and SOURCES of the generated index, which imports the book modules. A book
// module on disk that the index leaves out, or an index that imports a module no longer there, fails here.
describe("the book modules reach the registration", () => {
  const dir = join(ROOT, "scripts/rules/books");
  const files = readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort();
  const imported = [...readFileSync(join(ROOT, "scripts/rules/index.mjs"), "utf8")
    .matchAll(/^import \* as \w+ from "\.\/books\/([^"]+)";$/gm)].map((m) => m[1]).sort();

  it("the index imports every file of scripts/rules/books/ and no file that is not there", () => {
    expect(imported).toEqual(files);
    for (const f of imported) expect(existsSync(join(dir, f)), f).toBe(true);
    expect(BOOKS).toHaveLength(files.length);
  });

  it("the books with a rule in registry/ are the book modules, one each", () => {
    expect([...new Set(derived.emitted.map(({ rule }) => `${rule.book.toLowerCase()}.mjs`))].sort()).toEqual(files);
  });

  it("every book module is one of the index's BOOKS, and each of its entries is in the registered table", async () => {
    const registered = new Set();
    for (const f of files) {
      const module = await import(pathToFileURL(join(dir, f)).href);
      expect(BOOKS, f).toContain(module);
      for (const rule of module.RULES.filter((r) => r.entry)) {
        for (const id of [rule.identifier, ...(rule.alsoAs ?? [])]) {
          // A rule that carries engine keys registers a copy of its entry with them; the others register the entry itself.
          if (rule.carries) expect(table[id], `${f}: ${id}`).toEqual({ ...rule.entry, ...carriedOf(rule) });
          else expect(table[id], `${f}: ${id}`).toBe(rule.entry);
          registered.add(id);
        }
      }
    }
    // And nothing is registered that no book module declares.
    expect(Object.keys(table).sort()).toEqual([...registered].sort());
  });

  it("the sources registered are the index's SOURCES", () => {
    expect(options?.sources ?? {}).toEqual({ ...SOURCES });
  });
});
