import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KEY_UNKNOWN_TO_ENGINE } from "../../tools/pipeline/draft-keys.mjs";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { legacyFingerprint, ruleFingerprint, saveBook, stateOf } from "../../tools/pipeline/registry.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { itemSummary } from "../../tools/pipeline/dumps.mjs";
import { loadCore } from "../../tools/pipeline/core.mjs";
import {
  NESTED_UNKNOWN,
  idsIn, gateSchema, gateValidator, gateIds, gateFixes, gateText, gateUnique, runGates
} from "../../tools/pipeline/gates.mjs";
import { ASSERT, sign } from "./fixtures/assert.mjs";

// Synthetic fixtures only: invented spells and invented ids, no real book content.
const ACT = "Ab12Cd34Ef56Gh78";
const EFF = "Zy98Xw76Vu54Ts32";
const NOPE = "Qq11Ww22Ee33Rr44";
const DOC = "Dd00Cc11Bb22Aa33";

const FACTS = ["target.hasStatus", "source.hasEffect"];
// An engine key of exactly 16 characters, invented for the stand-in vocabulary.
const LONG_KEY = "glimmerFromAfar1";
const stubCore = {
  version: "9.9.9", facts: FACTS, vocabulary: new Set(["triggerOnEndTurn", "abcdefghijklmnop", LONG_KEY, ...FACTS]),
  // A stand-in for the engine: reports every key of a trigger condition that is not a known fact.
  validateEntry: (entry, { facts }) => (entry.triggers ?? []).flatMap((t) => Object.keys(t.if ?? {})
    .filter((k) => !(k in facts)).map((k) => `unknown fact "${k}"`)),
  getPath: (o, path) => String(path).split(".").reduce((x, k) => (x == null ? undefined : x[k]), o),
  matchesFrom: (current, from) => JSON.stringify(current) === JSON.stringify(from)
};

const entryWith = (extra = {}) => ({
  triggers: [{ on: "endOfTurn", via: "effect", fromEffect: EFF, do: [{ type: "resave" }] }], ...extra
});

const item = (extra = {}) => ({
  origin: "ddb-importer", match: "matched", identifier: "glimmer-bolt", docId: DOC, activities: [ACT], effects: [EFF],
  data: { sha256: "0".repeat(64) }, ...extra
});

const rec = (over = {}) => ({
  key: "tst:spell:glimmer-bolt", name: "Glimmer Bolt", kind: "spell", book: "TST", page: 12, edition: "2014",
  text: null, items: [item()], verdict: "entry", evidence: {}, identifier: "glimmer-bolt",
  rule: { handledIn: "table", assert: ASSERT, adds: "A bolt that glimmers.", entry: entryWith(), origins: ["ddb-importer"] },
  ...over
});
const withEntry = (entry, over = {}) => rec({ rule: { ...rec().rule, entry }, ...over });

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "gates-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ctx = (over = {}) => ({ core: stubCore, documents: {}, textDir: dir, ci: false, legacy: new Map(), ...over });
// legacy.json for these records, each with the fingerprint of its rule as it is now.
const allowed = (...records) => ({ legacy: new Map(records.map((r) => [r.key, legacyFingerprint(r)])) });
const withText = (r) => ({
  ...r, text: { sha256: cacheText(dir, "synthetic text of glimmer bolt"), source: "5etools", chars: 30 }
});

describe("idsIn", () => {
  it("finds 16-character ids as keys and as string values, nested", () => {
    const entry = { [ACT]: true, triggers: [{ fromEffect: EFF, list: [{ deep: NOPE }] }] };
    expect(idsIn(entry)).toEqual([ACT, EFF, NOPE].sort());
  });

  it("ignores the engine's own words and strings of another length", () => {
    const entry = {
      triggerOnEndTurn: "abcdefghijklmnop", on: "endOfTurn", n: 12345678,
      a: "Ab12Cd34Ef56Gh7", b: "Ab12Cd34Ef56Gh789", c: "Ab12-d34Ef56Gh78"
    };
    expect(idsIn(entry, stubCore.vocabulary)).toEqual([]);
  });

  it("fails closed: a 16-character word the engine does not name is an id, camelCase or lowercase", () => {
    const entry = { triggerOnEndTurn: "abcdefghijklmnop", noDamage: ["saveTashCausBrew"] };
    expect(idsIn(entry)).toEqual(["abcdefghijklmnop", "saveTashCausBrew", "triggerOnEndTurn"]);
    expect(idsIn(entry, stubCore.vocabulary)).toEqual(["saveTashCausBrew"]);
  });

  it("does not take an engine key of exactly 16 characters for an id, as a key, a value or a segment", () => {
    const entry = { [LONG_KEY]: { x: LONG_KEY }, p: `system.${LONG_KEY}.y`, [`${LONG_KEY}.${ACT}`]: 1 };
    expect(idsIn(entry, stubCore.vocabulary)).toEqual([ACT]);
  });

  it("splits object keys on dots", () => {
    expect(idsIn({ [`activities.${ACT}.type`]: 1 })).toEqual([ACT]);
  });

  it("finds an id that is a segment of a dotted path string", () => {
    const entry = {
      dataFixes: [{ path: `system.activities.${ACT}.activation.type`, value: 1 }, { effect: EFF, path: `effects.${NOPE}.x` }]
    };
    expect(idsIn(entry)).toEqual([ACT, EFF, NOPE].sort());
    expect(idsIn({ p: "system.activities.activation.type" })).toEqual([]);
  });

  it("keeps an id made of letters only", () => {
    expect(idsIn({ x: "AbCdEfGhIjKlMnOp" })).toEqual(["AbCdEfGhIjKlMnOp"]);
  });
});

describe("gateSchema", () => {
  it("passes a valid record and reports the schema's errors", () => {
    expect(gateSchema(rec())).toEqual([]);
    expect(gateSchema(rec({ page: 0 }))[0]).toMatch(/^schema: page/);
  });
});

describe("gateValidator", () => {
  it("passes the entry with the real list of facts as the facts the engine knows", () => {
    const known = entryWith({ triggers: [{ if: { "target.hasStatus": "charmed" }, do: [] }] });
    expect(gateValidator(withEntry(known), ctx())).toEqual([]);
  });

  it("fails an unknown fact name", () => {
    const entry = entryWith({ triggers: [{ if: { "moon.phase": "full" }, do: [] }] });
    expect(gateValidator(withEntry(entry), ctx())).toEqual(['validator: unknown fact "moon.phase"']);
  });

  it("refuses an entry that is not an object", () => {
    expect(gateValidator(rec(), ctx())).toEqual([]);
    expect(gateValidator(rec({ rule: { ...rec().rule, entry: JSON.stringify(entryWith()) } }), ctx())[0]).toMatch(/not an object/);
    const text = (entry) => rec({ rule: { ...rec().rule, entry } });
    expect(gateValidator(text("not json"), ctx())[0]).toMatch(/^validator: rule.entry is not an object/);
    expect(gateValidator(text("[1]"), ctx())[0]).toMatch(/^validator: rule.entry is not an object/);
    const unknown = entryWith({ triggers: [{ if: { "moon.phase": "full" }, do: [] }] });
    expect(gateValidator(withEntry(unknown), ctx())).toEqual(['validator: unknown fact "moon.phase"']);
  });

  it("reports an engine that throws instead of crashing", () => {
    const boom = { ...stubCore, validateEntry: () => { throw new Error("boom"); } };
    expect(gateValidator(rec(), ctx({ core: boom }))[0]).toMatch(/threw.*boom/);
  });

  it("has nothing to validate on a rule without an entry", () => {
    expect(gateValidator(rec({ verdict: "code", rule: { handledIn: "code", assert: ASSERT, adds: "x",
        origins: [] } }), ctx())).toEqual([]);
  });
});

describe("gateIds", () => {
  it("passes when every id is an activity or effect of the matched item", () => {
    expect(gateIds(withEntry(entryWith({ [ACT]: 1 })), ctx())).toEqual([]);
  });

  it("names the id that no origin of the rule has", () => {
    expect(gateIds(withEntry(entryWith({ extra: NOPE })), ctx())).toEqual([`ids: ${NOPE} belongs to no origin of the rule`]);
  });

  it("fails a camelCase DDB-style id that the item does not have, and passes it once the item has it", () => {
    const r = withEntry(entryWith({ noDamage: ["saveTashCausBrew"] }));
    expect(gateIds(r, ctx())).toEqual(["ids: saveTashCausBrew belongs to no origin of the rule"]);
    const owned = { ...r, items: [item({ activities: [ACT, "saveTashCausBrew"] })] };
    expect(gateIds(owned, ctx())).toEqual([]);
    expect(gateIds(withEntry(entryWith({ [LONG_KEY]: true })), ctx())).toEqual([]);
  });

  it("fails an origin with no matched item, whatever the entry", () => {
    const r = rec({ items: [item({ match: "absent" })] });
    expect(gateIds(r, ctx())).toEqual(["ids: no matched item for ddb-importer"]);
    expect(gateIds(rec({ items: [] }), ctx())).toEqual(["ids: no matched item for ddb-importer"]);
  });

  it("checks every origin the rule names", () => {
    const r = withEntry(entryWith(), { items: [item(), item({ origin: "official", activities: [], effects: [] })] });
    r.rule.origins = ["ddb-importer", "official"];
    // A trigger's ids sit in fields of one id (draft-keys.mjs slot `single`, Ruling R4): one origin only, too.
    expect(gateIds(r, ctx())).toEqual(["ids: official contributes no id",
      "ids: triggers holds one id: it may name one origin only (the others go in rule.uncovered)"]);
  });

  it("fails ids with no origin to check them against", () => {
    const r = rec(); r.rule.origins = [];
    expect(gateIds(r, ctx())).toEqual(["ids: rule names no origin"]);
    const noIds = withEntry({ aura: true }); noIds.rule.origins = [];
    expect(gateIds(noIds, ctx())).toEqual(["ids: rule names no origin"]);
    const code = rec({ verdict: "code", rule: { handledIn: "code", assert: ASSERT, adds: "x", origins: [] } });
    expect(gateIds(code, ctx())).toEqual([]);
    expect(runGates([withText(r)], ctx()).failures[r.key].ids).toEqual(["ids: rule names no origin"]);
  });

  it("fails dataFixes with no origin to read them from", () => {
    const r = withEntry(entryWith({ dataFixes: [{ path: "system.x", value: 1 }] })); r.rule.origins = [];
    expect(gateFixes(r, ctx())).toEqual(["fixes: rule names no origin"]);
  });

  it("is a note, not a failure, for an allow-listed legacy record without item data; it is not in passed", () => {
    const r = withText(rec({ legacy: true, items: [] }));
    expect(gateIds(r, ctx(allowed(r)))).toEqual([]);
    const { notes, failures, updated } = runGates([r], ctx(allowed(r)));
    expect(failures).toEqual({});
    expect(notes[r.key].ids).toEqual(["ids: no item data (legacy)"]);
    const gates = updated[0].evidence.gates;
    expect(gates.passed).not.toContain("ids");
    expect(gates.noted).toContain("ids");
    expect(stateOf(updated[0])).toBe("drafted");
  });

  it("still fails a legacy record whose matched item lacks the id", () => {
    const r = withEntry(entryWith({ extra: NOPE }), { legacy: true });
    expect(gateIds(r, ctx(allowed(r)))).toHaveLength(1);
  });

  it("notes a code rule without entry as having nothing to check: noted, not passed; a table rule needs an entry", () => {
    const code = withText(rec({ verdict: "code", rule: { handledIn: "code", assert: ASSERT, adds: "x", origins: [] } }));
    const { failures, notes, updated } = runGates([code], ctx());
    expect(failures).toEqual({});
    expect(notes[code.key].ids).toEqual(["ids: nothing to check (code rule without entry)"]);
    expect(updated[0].evidence.gates.noted).toEqual(["ids"]);
    expect(updated[0].evidence.gates.passed).not.toContain("ids");
    const table = rec({ rule: { handledIn: "table", assert: ASSERT, adds: "x", origins: ["ddb-importer"] } });
    expect(gateIds(table, ctx())).toEqual(["ids: a table rule has no entry"]);
  });

  it("gives a legacy record that is not allow-listed no leniency", () => {
    const r = rec({ legacy: true, items: [] });
    expect(gateIds(r, ctx())).toEqual(["ids: no matched item for ddb-importer"]);
  });
});

describe("gateFixes", () => {
  const doc = { system: { activities: { [ACT]: { activation: { type: "action" }, uses: { max: "1" } } } },
    effects: [{ _id: EFF, transfer: false, changes: [{ key: "a", value: "1" }] }] };
  const documents = { "ddb-importer": { [DOC]: doc } };
  const fixed = (...dataFixes) => withEntry(entryWith({ dataFixes }));
  const signed = sign;
  const path = `system.activities.${ACT}.activation.type`;

  it("passes a fix that is applicable (from matches)", () => {
    expect(gateFixes(fixed({ path, value: "bonus", from: "action" }), ctx({ documents }))).toEqual([]);
  });

  it("passes a fix that is already applied", () => {
    expect(gateFixes(fixed({ path, value: "action", from: "reaction" }), ctx({ documents }))).toEqual([]);
  });

  it("fails a fix whose from matches neither", () => {
    expect(gateFixes(fixed({ path, value: "bonus", from: "reaction" }), ctx({ documents }))).toEqual([`fixes: drift at ${path}`]);
  });

  it("checks the field of an effect, and an effect that is gone", () => {
    const ok = { effect: EFF, path: "transfer", value: true, from: false };
    const bad = { effect: EFF, path: "transfer", value: true, from: "x" };
    const gone = { effect: NOPE, path: "transfer", value: true };
    expect(gateFixes(fixed(ok), ctx({ documents }))).toEqual([]);
    expect(gateFixes(fixed(bad), ctx({ documents }))).toEqual(["fixes: drift at transfer"]);
    expect(gateFixes(fixed(gone), ctx({ documents }))).toEqual(["fixes: drift at transfer"]);
  });

  it("fails a field of an activity the document does not have", () => {
    const p = `system.activities.${NOPE}.uses.max`;
    expect(gateFixes(fixed({ path: p, value: "2" }), ctx({ documents }))).toEqual([`fixes: drift at ${p}`]);
  });

  it("skips a { effect, create } item, which has no path, before the path check", () => {
    const create = { effect: NOPE, create: { name: "x" }, unless: EFF };
    expect("path" in create).toBe(false);
    // An effect to create is a person's (Ruling R6): signed, it is skipped; unsigned, it fails.
    expect(gateFixes(signed(fixed(create)), ctx({ documents }))).toEqual([]);
    expect(gateFixes(fixed(create), ctx({ documents }))).toEqual(["fixes: create goes to a person"]);
  });

  it("reports nothing for an effect to create", () => {
    expect(gateFixes(signed(fixed({ effect: NOPE, create: { name: "x" } })), ctx({ documents }))).toEqual([]);
  });

  it("has no failure for an empty dataFixes list, even without a document", () => {
    expect(gateFixes(fixed(), ctx())).toEqual([]);
  });

  it("reports a fix whose path is not a string instead of throwing", () => {
    expect(gateFixes(fixed({ path: 5, value: 1 }), ctx({ documents }))).toEqual(["fixes: a data fix has no string path"]);
    expect(gateFixes(fixed({ effect: EFF, value: 1 }), ctx({ documents }))).toEqual(["fixes: a data fix has no string path"]);
  });

  it("has nothing to check without dataFixes", () => {
    expect(gateFixes(rec(), ctx())).toEqual([]);
  });

  it("fails when the document is not in the dumps, unless the record is legacy (a note)", () => {
    const f = fixed({ path, value: "bonus" });
    expect(gateFixes(f, ctx())).toEqual(["fixes: no document for ddb-importer"]);
    const legacy = { ...f, legacy: true };
    expect(gateFixes(legacy, ctx())).toEqual(["fixes: no document for ddb-importer"]);
    expect(gateFixes(legacy, ctx(allowed(legacy)))).toEqual([]);
    const r = runGates([withText(legacy)], ctx({ ...allowed(legacy), documents: {} }));
    expect(r.notes[f.key].fixes).toEqual(["fixes: no item data (legacy)"]);
    expect(r.updated[0].evidence.gates.passed).not.toContain("fixes");
    expect(r.updated[0].evidence.gates.noted).toContain("fixes");
  });
});

describe("gateText", () => {
  it("passes a fingerprint that is in the cache and fails one that is not", () => {
    expect(gateText(withText(rec()), ctx())).toEqual([]);
    const missing = rec({ text: { sha256: "a".repeat(64), source: "5etools", chars: 3 } });
    expect(gateText(missing, ctx())).toEqual([`text: ${"a".repeat(64)} is not in the text cache`]);
  });

  it("fails a record without a fingerprint; for a legacy one it is a note", () => {
    expect(gateText(rec(), ctx())).toEqual(["text: the record has no text fingerprint"]);
    const legacy = rec({ legacy: true });
    expect(gateText(legacy, ctx())).toEqual(["text: the record has no text fingerprint"]);
    expect(gateText(legacy, ctx(allowed(legacy)))).toEqual([]);
    const r = runGates([legacy], ctx(allowed(legacy)));
    expect(r.failures).toEqual({});
    expect(r.notes[legacy.key].text).toEqual(["text: not fingerprinted (legacy)"]);
    expect(r.updated[0].evidence.gates.passed).not.toContain("text");
    expect(r.updated[0].evidence.gates.noted).toEqual(["text"]);
    expect(stateOf(r.updated[0])).toBe("drafted");
  });

  it("a record that passes every gate has no noted list", () => {
    const g = runGates([withText(rec())], ctx()).updated[0].evidence.gates;
    expect(g.noted).toBeUndefined();
    expect(g.passed).toEqual(["schema", "validator", "ids", "fixes", "text", "unique"]);
  });
});

describe("gateUnique", () => {
  const other = (over = {}) => rec({ key: "tst:spell:glimmer-bolt-2", ...over });

  it("fails two records with the same canonical identifier, naming both keys", () => {
    const f = gateUnique([rec(), other({ identifier: " Glimmer-Bolt " })]);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain("tst:spell:glimmer-bolt");
    expect(f[0]).toContain("tst:spell:glimmer-bolt-2");
  });

  it("fails them even when each binds its own sources, and ignores distinct or missing identifiers", () => {
    const sources = { [DOC]: "glimmer-bolt" };
    expect(gateUnique([rec({ sources }), other({ sources })])).toHaveLength(1);
    expect(gateUnique([rec({ sources }), other()])).toHaveLength(1);
    expect(gateUnique([rec(), other({ identifier: "other" })])).toEqual([]);
    const { identifier, ...bare } = rec();
    expect(gateUnique([bare, { ...bare, key: "tst:spell:y" }])).toEqual([]);
  });
});

describe("runGates", () => {
  const good = () => withText(rec());

  it("records the evidence of a record that passes, with the fingerprint of its rule", () => {
    const r = good();
    const { failures, updated } = runGates([r], ctx());
    expect(failures).toEqual({});
    const gates = updated[0].evidence.gates;
    expect(gates).toMatchObject({ core: "9.9.9", rule: ruleFingerprint(r.rule) });
    expect(gates.passed).toEqual(expect.arrayContaining(["schema", "validator", "ids", "fixes", "text"]));
    expect(Number.isNaN(Date.parse(gates.at))).toBe(false);
    expect(r.evidence).toEqual({});
    expect(stateOf(updated[0])).toBe("gated");
  });

  it("keeps the time of a run that changes nothing", () => {
    const first = runGates([good()], ctx()).updated;
    const again = runGates(first, ctx()).updated;
    expect(again[0]).toEqual(first[0]);
  });

  it("removes the evidence of a record that fails, and a changed entry makes it a draft again", () => {
    const passed = runGates([good()], ctx()).updated[0];
    expect(stateOf(passed)).toBe("gated");
    // `extra` is no drafter key: a person's rule (signed) reaches the ids gate.
    const edited = sign({ ...passed, rule: { ...passed.rule, entry: entryWith({ extra: NOPE }) } });
    expect(stateOf(edited)).toBe("drafted");
    const { failures, updated } = runGates([edited], ctx());
    expect(failures[edited.key].ids).toEqual([`ids: ${NOPE} belongs to no origin of the rule`]);
    expect(updated[0].evidence.gates).toBeUndefined();
  });

  it("fails every record of a group that shares an identifier, and sets no evidence on them", () => {
    const a = good();
    const b = { ...good(), key: "tst:spell:glimmer-bolt-2" };
    const { failures, updated } = runGates([a, b], ctx());
    expect(Object.keys(failures).sort()).toEqual([a.key, b.key].sort());
    expect(failures[a.key].unique).toHaveLength(1);
    expect(updated.every((r) => !r.evidence.gates)).toBe(true);
  });

  it("runs only schema, and text when it is set, on a record without a rule", () => {
    const { rule, ...bare } = rec({ verdict: null, identifier: "x" });
    const other = { ...bare, key: "tst:spell:other", identifier: "y" };
    const withBadText = { ...other, text: { sha256: "b".repeat(64), source: "5etools", chars: 3 } };
    const { failures, updated } = runGates([bare, withBadText], ctx());
    expect(failures[bare.key]).toBeUndefined();
    expect(updated[0].evidence.gates).toBeUndefined();
    const { failures: f2 } = runGates([withBadText], ctx());
    expect(Object.keys(f2[withBadText.key])).toEqual(["text"]);
  });

  it("does not run the other gates on a record that fails the schema", () => {
    const bad = rec({ page: 0, rule: { handledIn: "table", assert: ASSERT, adds: "x", entry: 5, origins: "ddb-importer" } });
    const { failures } = runGates([bad], ctx());
    expect(Object.keys(failures[bad.key])).toEqual(["schema"]);
  });

  describe("in ci mode", () => {
    const ci = (over = {}) => ctx({ ci: true, textDir: undefined, documents: undefined, ...over });

    it("trusts evidence whose fingerprint is the rule's, and does not touch the records", () => {
      const gated = runGates([good()], ctx()).updated;
      const { failures, updated } = runGates(gated, ci());
      expect(failures).toEqual({});
      expect(updated).toEqual(gated);
    });

    it("fails a rule whose evidence is missing or stale", () => {
      const gated = runGates([good()], ctx()).updated[0];
      const stale = { ...gated, rule: { ...gated.rule, adds: "A changed line." } };
      expect(runGates([stale], ci()).failures[stale.key].gates).toHaveLength(1);
      expect(runGates([good()], ci()).failures[good().key].gates).toHaveLength(1);
    });

    it("fails evidence that lacks a gate", () => {
      const gated = runGates([good()], ctx()).updated[0];
      const partial = { ...gated, evidence: { gates: { ...gated.evidence.gates, passed: ["schema", "validator"] } } };
      expect(runGates([partial], ci()).failures[partial.key].gates).toHaveLength(1);
    });

    it("tolerates an allow-listed legacy rule without full evidence, with a note, and still runs validator and unique", () => {
      const legacy = rec({ legacy: true });
      const r = runGates([legacy], ci(allowed(legacy)));
      expect(r.failures).toEqual({});
      expect(r.notes[legacy.key].gates).toHaveLength(1);
      const bad = withEntry(entryWith({ triggers: [{ if: { "moon.phase": 1 }, do: [] }] }), { legacy: true });
      expect(runGates([bad], ci(allowed(bad))).failures[bad.key].validator).toHaveLength(1);
      const twin = { ...legacy, key: "tst:spell:y" };
      expect(Object.keys(runGates([legacy, twin], ci(allowed(legacy, twin))).failures)).toHaveLength(2);
    });

    it("tolerates an allow-listed legacy rule even when its old evidence is stale or partial", () => {
      const gated = runGates([good()], ctx()).updated[0];
      const stale = { ...gated, legacy: true, rule: { ...gated.rule, adds: "Changed." } };
      expect(runGates([stale], ci(allowed(stale))).failures).toEqual({});
    });

    it("fails a legacy record that is not in legacy.json, in every mode, and a rule without evidence", () => {
      const legacy = rec({ legacy: true });
      expect(runGates([legacy], ci()).failures[legacy.key].legacy).toEqual([`legacy: ${legacy.key} is not in legacy.json`]);
      expect(runGates([legacy], ci()).failures[legacy.key].gates).toHaveLength(1);
      expect(runGates([withText(legacy)], ctx()).failures[legacy.key].legacy).toHaveLength(1);
      expect(runGates([legacy], ci({ legacy: undefined })).failures[legacy.key].legacy).toHaveLength(1);
    });

    it("fails a legacy rule edited since migration, in every mode, and gives it no leniency", () => {
      const legacy = withText(rec({ legacy: true, items: [] }));
      const listed = allowed(legacy);
      const edited = { ...legacy, rule: { ...legacy.rule, adds: "An edit after migration." } };
      const message = `legacy: ${legacy.key} changed since migration`;
      for (const context of [ci(listed), ctx(listed)]) {
        const { failures } = runGates([edited], context);
        expect(failures[legacy.key].legacy).toEqual([message]);
      }
      expect(runGates([edited], ci(listed)).failures[legacy.key].gates).toHaveLength(1);
      expect(runGates([edited], ctx(listed)).failures[legacy.key].ids).toEqual(["ids: no matched item for ddb-importer"]);
      expect(runGates([legacy], ci(listed)).failures).toEqual({});
    });

    it("refuses a legacy record whose legacyStatus, identifier, page or name changed, not one that gains evidence", () => {
      const legacy = withText(rec({ legacy: true, legacyStatus: "validated", items: [] }));
      const listed = allowed(legacy);
      for (const edit of [{ legacyStatus: "played" }, { identifier: "glimmer-lance" }, { page: 13 }, { name: "Glimmer Lance" }]) {
        for (const context of [ci(listed), ctx(listed)]) {
          const { failures } = runGates([{ ...legacy, ...edit }], context);
          expect(failures[legacy.key]?.legacy, JSON.stringify(edit)).toEqual([`legacy: ${legacy.key} changed since migration`]);
        }
      }
      const played = { at: "2026-11-21", core: "1.0.0", world: "w", scenario: "tst/s" };
      expect(runGates([{ ...legacy, evidence: { played } }], ci(listed)).failures).toEqual({});
    });

    it("does not trust evidence whose passed list lacks a gate that only left a note", () => {
      const legacy = withText(rec({ legacy: true, items: [] }));
      const gated = runGates([legacy], ctx(allowed(legacy))).updated[0];
      expect(gated.evidence.gates.passed).not.toContain("ids");
      const { legacy: _dropped, ...plain } = gated;
      expect(runGates([plain], ci()).failures[plain.key].gates).toHaveLength(1);
    });
  });

  it("reports a record that is not an object instead of crashing", () => {
    const { failures, updated } = runGates([null, "x", rec()], ctx());
    expect(failures["record #0"].schema).toHaveLength(1);
    expect(failures["record #1"].schema).toHaveLength(1);
    expect(updated[0]).toBeNull();
  });
});

const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/content.mjs"))
  ? process.env.DAS_CORE : null;

// The identifiers (and aliases) of the registry's engineered rules (Ruling R43).
const REGISTRY_DIR = resolve("registry");
const recordsOf = (file) => JSON.parse(readFileSync(join(REGISTRY_DIR, file), "utf8")).records;
const ENGINEERED_IDS = new Set(readdirSync(REGISTRY_DIR).filter((f) => f.endsWith(".json"))
  .flatMap((f) => { const records = recordsOf(f); return Array.isArray(records) ? records : []; })
  .filter((r) => r?.rule?.engineered).flatMap((r) => [r.identifier, ...(r.rule.alsoAs ?? [])]));

describe.skipIf(!CORE_DIR && !process.env.CI)("with the real DAS · Core", () => {
  it("loads the validator, 60 facts or more, the version and the shipped identifiers", async () => {
    const core = await loadCore(CORE_DIR);
    expect(core.facts.length).toBeGreaterThanOrEqual(60);
    expect(core.facts).toContain("activity.isAttack");
    expect(core.facts.every((f) => /^\w+\.\w+$/.test(f))).toBe(true);
    expect(core.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(core.identifiers).toBeInstanceOf(Set);
    expect(core.identifiers.size).toBeGreaterThan(100);
    expect(core.identifiers.has("black-tentacles") && core.identifiers.has("evards-black-tentacles")).toBe(true);
  });

  it("loads the entry keys and a vocabulary that holds them, the facts and the moments", async () => {
    const core = await loadCore(CORE_DIR);
    expect(core.entryKeys.has("triggers") && core.entryKeys.has("dataFixes")).toBe(true);
    for (const word of [...core.entryKeys, ...core.facts, "endOfTurn", "isHit"]) expect(core.vocabulary.has(word), word).toBe(true);
    const long = [...core.entryKeys].find((k) => k.length === 16);
    expect(long).toBeDefined();
    expect(idsIn({ [long]: { on: long } }, core.vocabulary)).toEqual([]);
    expect(idsIn({ noDamage: ["saveTashCausBrew"] }, core.vocabulary)).toEqual(["saveTashCausBrew"]);
  });

  it("validates every entry of the pack, and refuses an unknown fact and an unknown key", async () => {
    const core = await loadCore(CORE_DIR);
    const { TABLE } = await import("../../scripts/rules/index.mjs");
    for (const [id, entry] of Object.entries(TABLE)) {
      // Rulings R36, R37: against an engine older than a key the pack ships (CI's latest release), the only problem allowed
      // is that key being unknown to it; the shipped module leaves such a rule out on that engine by itself.
      // Ruling R44: and, for an engineered rule, a nested key that engine does not know yet (`--ci` lets it pass).
      const problems = gateValidator(withEntry(entry), ctx({ core })).filter((x) => !x.includes(KEY_UNKNOWN_TO_ENGINE))
        .filter((x) => !(ENGINEERED_IDS.has(id) && NESTED_UNKNOWN.test(x.replace(/^validator: /, ""))));
      expect(problems, id).toEqual([]);
      for (const found of idsIn(entry, core.vocabulary)) expect(found, id).toMatch(/^[A-Za-z0-9]{16}$/);
    }
    const unknownFact = entryWith({ triggers: [{ on: "isHit", if: { "moon.phase": "full" }, do: [{ type: "resave" }] }] });
    const messages = (entry) => gateValidator(withEntry(entry), ctx({ core })).join("\n");
    expect(messages(unknownFact)).toMatch(/unknown fact "moon\.phase"/);
    expect(messages({ recastt: true })).toMatch(/recastt/);
  });

  it("applies the engine's own matching to the data fixes", async () => {
    const core = await loadCore(CORE_DIR);
    const doc = { system: { activities: { [ACT]: { activation: { type: "action" } } } }, effects: [] };
    const path = `system.activities.${ACT}.activation.type`;
    const r = withEntry(entryWith({ dataFixes: [{ path, value: "bonus", from: "reaction" }] }));
    expect(gateFixes(r, ctx({ core, documents: { "ddb-importer": { [DOC]: doc } } }))).toEqual([`fixes: drift at ${path}`]);
  });
});

describe("gates CLI", () => {
  const cli = (args, env = {}) => spawnSync("node", [resolve("tools/pipeline/cli.mjs"), ...args], {
    encoding: "utf8", env: { PATH: process.env.PATH, ...env }
  });
  const registry = () => join(dir, "registry");

  it("has nothing to check over a missing or empty registry, and needs no variable for it", () => {
    for (const make of [() => {}, () => saveBook(registry(), { book: "TST", records: [] })]) {
      make();
      const r = cli(["gates"], { RULEPACK_REGISTRY: registry() });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/nothing to check/i);
    }
  });

  it("rejects the reserved book codes legacy and queue with exit 2, and saveBook refuses them", () => {
    for (const code of ["legacy", "QUEUE", "Legacy"]) {
      const r = cli(["inventory", code, "spell"], { RULEPACK_REGISTRY: registry() });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/reserved/);
      expect(() => saveBook(registry(), { book: code, records: [] })).toThrow(/reserved/);
    }
    expect(existsSync(join(registry(), "legacy.json"))).toBe(false);
  });

  it("exits 2 naming the variable that is missing", () => {
    saveBook(registry(), { book: "TST", records: [rec()] });
    const env = { RULEPACK_REGISTRY: registry() };
    expect(cli(["gates", "--ci"], env).stderr).toContain("DAS_CORE");
    expect(cli(["gates"], { ...env, DAS_CORE: "/x" }).stderr).toContain("RULEPACK_DUMPS");
    expect(cli(["gates"], { ...env, DAS_CORE: "/x", RULEPACK_DUMPS: "/y" }).stderr).toContain("RULEPACK_TEXT");
    expect(cli(["gates", "--ci"], env).status).toBe(2);
  });

  describe.skipIf(!CORE_DIR && !process.env.CI)("with the real DAS · Core", () => {
    const env = () => ({ RULEPACK_REGISTRY: registry(), DAS_CORE: CORE_DIR });

    it("--ci fails a rule that has no evidence, and passes one gated by a local run with the same rule", async () => {
      const r = rec();
      saveBook(registry(), { book: "TST", records: [r] });
      expect(cli(["gates", "--ci"], env()).status).toBe(1);
      const core = await loadCore(CORE_DIR);
      const gated = runGates([withText(r)], ctx({ core })).updated;
      saveBook(registry(), { book: "TST", records: gated });
      const ok = cli(["gates", "--ci"], env());
      expect(ok.status).toBe(0);
      expect(ok.stderr).toBe("");
    });

    it("--ci allows a legacy record only through legacy.json, which is not read as a book", () => {
      const legacy = rec({ legacy: true });
      saveBook(registry(), { book: "TST", records: [legacy] });
      const refused = cli(["gates", "--ci"], env());
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain(`legacy: ${legacy.key} is not in legacy.json`);
      writeJson(join(registry(), "legacy.json"), [legacy.key]);
      expect(cli(["gates", "--ci"], env()).status).toBe(2);
      writeJson(join(registry(), "legacy.json"), { [legacy.key]: legacyFingerprint(legacy) });
      const ok = cli(["gates", "--ci"], env());
      expect(ok.status, ok.stderr).toBe(0);
      expect(ok.stdout).toContain("no full evidence yet (legacy)");
    });

    it("--ci fails on an invalid entry", () => {
      saveBook(registry(), { book: "TST", records: [sign(withEntry({ recastt: true }))] });
      const r = cli(["gates", "--ci"], env());
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/FAIL tst:spell:glimmer-bolt: validator/);
    });

    it("a full run gates the record from the dumps and the text cache, writes the evidence, and exits 0", () => {
      const dumps = join(dir, "dumps");
      const text = join(dir, "text");
      const sha = cacheText(text, "synthetic text of glimmer bolt");
      saveBook(registry(), { book: "TST", records: [rec({ text: { sha256: sha, source: "5etools", chars: 30 } })] });
      mkdirSyncSafe(dumps);
      writeJson(join(dumps, "ddb.spells.json"), [{ _id: DOC, name: "Glimmer Bolt", system: {}, effects: [] }]);
      const r = cli(["gates"], { ...env(), RULEPACK_DUMPS: dumps, RULEPACK_TEXT: text });
      expect(r.status, r.stderr).toBe(0);
      const saved = JSON.parse(readFileSync(join(registry(), "tst.json"), "utf8"));
      expect(saved.records[0].evidence.gates.core).toMatch(/^\d/);
      expect(saved.records[0].state).toBe("gated");
      expect(cli(["gates", "--ci"], env()).status).toBe(0);
    });
  });
});

describe.skipIf(!CORE_DIR && !process.env.CI)("gates CLI: the document of a matched item", () => {
  const cli = (args, env) => spawnSync("node", [resolve("tools/pipeline/cli.mjs"), ...args], {
    encoding: "utf8", env: { PATH: process.env.PATH, ...env }
  });

  it("is the dump document with the item's id and data fingerprint, not the first with that id", () => {
    const registry = join(dir, "registry");
    const dumps = join(dir, "dumps");
    const text = join(dir, "text");
    const sha = cacheText(text, "synthetic text of glimmer bolt");
    const stale = { _id: DOC, name: "Glimmer Bolt", type: "spell", system: { x: 5 }, effects: [] };
    const matched = { ...stale, system: { x: 1 } };
    mkdirSyncSafe(dumps);
    writeJson(join(dumps, "ddb.a.json"), [stale]);
    writeJson(join(dumps, "ddb.b.json"), [matched]);
    const env = { RULEPACK_REGISTRY: registry, DAS_CORE: CORE_DIR, RULEPACK_DUMPS: dumps, RULEPACK_TEXT: text };
    const withData = (data) => sign(withEntry({ dataFixes: [{ path: "system.x", value: 2, from: 1 }] }, {
      text: { sha256: sha, source: "5etools", chars: 30 }, items: [item({ activities: [], effects: [], data: { sha256: data } })]
    }));
    saveBook(registry, { book: "TST", records: [withData(itemSummary(matched, "ddb-importer").data)] });
    const ok = cli(["gates"], env);
    expect(ok.status, ok.stderr).toBe(0);
    saveBook(registry, { book: "TST", records: [withData("f".repeat(64))] });
    const absent = cli(["gates"], env);
    expect(absent.status).toBe(1);
    expect(absent.stderr).toContain("fixes: no document for ddb-importer");
  });
});

function mkdirSyncSafe(p) { mkdirSync(p, { recursive: true }); }
function writeJson(p, v) { writeFileSync(p, JSON.stringify(v)); }
