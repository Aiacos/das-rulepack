import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDraftKeys, ENTRY_WORD_BUDGET } from "../../tools/pipeline/draft-keys.mjs";
import { checkText, runGates } from "../../tools/pipeline/gates.mjs";
import { validateRecord } from "../../tools/pipeline/schema.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { ASSERT } from "./fixtures/assert.mjs";

// Synthetic fixtures only: invented ids and invented text. Round 5 of Task 3: inherited key names do not open a closed
// object, and a source text cannot be carried through identifiers (dotted keys, targets, formula references).
const ACT = "Ac00Ac11Ac22Ac33";
const EFF = "Ef00Ef11Ef22Ef33";
const SPELL = { origins: ["official"], kind: "spell" };
const check = (entry) => checkDraftKeys(entry, SPELL).join("; ");
const fixes = (...list) => check({ dataFixes: list });
const BIG = "When you cast this spell the target must succeed on a saving throw. ".repeat(50);
const INHERITED = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "prototype", "isPrototypeOf"];
// A key named like an inherited property, as JSON.parse makes it: an own property, even `__proto__`.
const withKey = (object, key, value) => {
  const rest = JSON.stringify(object).slice(1, -1);
  return JSON.parse(`{${JSON.stringify(key)}:${JSON.stringify(value)}${rest ? `,${rest}` : ""}}`);
};

const TEXT = "When you cast this spell the target must succeed on a Wisdom saving throw or fall prone and drop whatever it "
  + "is holding. On a success the creature is unaffected and takes no further damage this turn.";

describe("C1: an inherited key name never opens a closed object", () => {
  it("each inherited name, in a damage part, a change, spell.challenge and a consumption target, is refused", () => {
    for (const key of INHERITED) {
      const part = withKey({ number: 1 }, key, BIG);
      expect(fixes({ path: `system.activities.${ACT}.damage.parts`, value: [part], from: [] }), key).not.toBe("");
      const change = withKey({ key: "system.attributes.ac.bonus", value: 1 }, key, BIG);
      expect(fixes({ effect: EFF, path: "changes", value: [change], from: [] }), key).not.toBe("");
      const challenge = withKey({ save: 13 }, key, { nested: [BIG] });
      expect(fixes({ path: `system.activities.${ACT}.spell.challenge`, value: challenge, from: { save: 12 } }), key)
        .not.toBe("");
      const target = withKey({ type: "attribute", value: 1 }, key, BIG);
      expect(fixes({ path: `system.activities.${ACT}.consumption.targets`, value: [target], from: [] }), key).not.toBe("");
    }
  });

  it("__proto__, constructor and prototype are refused as keys anywhere in an entry", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const triggers = [withKey({ on: "failedSave", do: [{ type: "status", status: "prone" }] }, key, 1)];
      expect(check({ triggers }), key).toMatch(new RegExp(`a key named ${key}`));
      expect(check(withKey({ halfOnMiss: true }, key, 1)), key).toMatch(/a key named/);
    }
  });

  it("an inherited name in evidence or in an assertion is an unknown field", () => {
    const record = {
      key: "tst:spell:x", identifier: "x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024", text: null,
      items: [], verdict: "entry", rule: { handledIn: "table", adds: "x", entry: {}, origins: ["official"], assert: ASSERT },
      evidence: { drafted: withKey({ by: "drafter-1", at: "2026", core: "1", rule: "a".repeat(64) }, "constructor", BIG) }
    };
    expect(validateRecord(record).join("; ")).toMatch(/evidence\.drafted\.constructor: unknown field/);
    const assert = [withKey({ given: {}, expect: { damage: { fraction: 1 } } }, "toString", BIG)];
    expect(validateRecord({ ...record, evidence: {}, rule: { ...record.rule, assert } }).join("; ")).toMatch(/rule\.assert\[0\]/);
    const expect2 = [{ given: withKey({}, "valueOf", BIG), expect: { damage: { fraction: 1 } } }];
    expect(validateRecord({ ...record, evidence: {}, rule: { ...record.rule, assert: expect2 } }).join("; "))
      .toMatch(/given\.valueOf: unknown field/);
  });
});

describe("C2(b): identifiers are short, and an entry has a small word budget", () => {
  it("a dotted path has at most 6 segments of at most 24 characters (change keys, targets, formula references)", () => {
    const change = (key) => fixes({ effect: EFF, path: "changes", value: [{ key, value: 1 }], from: [] });
    expect(change("system.attributes.ac.bonus")).toBe("");
    expect(change("a.b.c.d.e.f")).toBe("");
    expect(change("a.b.c.d.e.f.g")).toMatch(/value/);
    expect(change(`system.${"x".repeat(25)}`)).toMatch(/value/);
    const target = (t) => fixes({ path: `system.activities.${ACT}.consumption.targets`, value: [{ type: "attribute", target: t,
      value: 1 }], from: [] });
    expect(target("attributes.hd.value")).toBe("");
    expect(target("when.you.cast.this.spell.the.target")).toMatch(/value/);
    const formula = (f) => fixes({ path: `system.activities.${ACT}.range.value`, value: f, from: 5 });
    expect(formula("@item.uses.max")).toBe("");
    expect(formula("@item.the.target.must.fall.x")).toMatch(/value/);
    expect(formula(`@scale.${"x".repeat(25)}`)).toMatch(/value/);
  });

  it(`more than ${ENTRY_WORD_BUDGET} distinct words in the strings of an entry are refused`, () => {
    expect(ENTRY_WORD_BUDGET).toBe(60);
    const word = (i) => `w${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}q`;
    const keyOf = (n) => Array.from({ length: 5 }, (_, j) => word(n * 5 + j)).join(".");
    const changes = (count) => Array.from({ length: count }, (_, i) => ({ key: keyOf(i), value: 1 }));
    // 12 changes of 5 invented words each: 60 words, at the budget.
    expect(fixes({ effect: EFF, path: "changes", value: changes(12), from: [] })).toBe("");
    const over = [{ effect: EFF, path: "changes", value: changes(12), from: [] },
      { effect: "Eg00Eg11Eg22Eg33", path: "changes", value: [{ key: keyOf(12), value: 1 }], from: [] }];
    expect(fixes(...over)).toMatch(/more than 60 distinct words/);
  });

  it("words of the closed lists, ids and the pack's own key names do not count", () => {
    const entry = { saveDamage: { [ACT]: "half" }, triggers: [{ on: "failedSave", do: [{ type: "status", status: "prone" }] }],
      dataFixes: [{ path: `system.activities.${ACT}.range.units`, value: "touch", from: "self" }] };
    expect(check(entry)).toBe("");
  });
});

describe("C2(a): the quotation check reads the whole entry", () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "smuggle-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const record = (entry) => ({
    key: "tst:spell:x", identifier: "x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024",
    text: { sha256: cacheText(dir, TEXT), source: "dataset", chars: TEXT.length }, items: [], verdict: "entry", evidence: {},
    rule: { handledIn: "table", adds: "Adds a glow.", entry, origins: ["official"], assert: ASSERT }
  });
  const quoted = (entry) => checkText(record(entry), { textDir: dir }).failures.join("; ");
  const changes = (...keys) => ({ dataFixes: [{ effect: EFF, path: "changes", value: keys.map((key) => ({ key, value: 1 })),
    from: [] }] });

  it("dotted, camelCase and PascalCase identifiers and @ references are words", () => {
    expect(quoted(changes("system.attributes.ac.bonus"))).toBe("");
    expect(quoted(changes("when.you.cast.this.spell.the", "target.must"))).toMatch(/text: .*quotes 8 or more/);
    expect(quoted(changes("WhenYouCastThis.spellTheTargetMust"))).toMatch(/text: .*quotes 8 or more/);
    const formulas = { dataFixes: [{ path: `system.activities.${ACT}.range.value`, value: "@item.when.you.cast.this", from: 5 },
      { path: `system.activities.${ACT}.range.long`, value: "@item.spell.the.target.must", from: 5 }] };
    expect(quoted(formulas)).toMatch(/text: .*quotes 8 or more/);
    expect(quoted({ triggers: [{ on: "failedSave", do: [{ type: "status", status: "prone" }] }] })).toBe("");
  });

  it("the reviewer's probe: the text through change keys and consumption targets of two fixes fails the text gate", () => {
    const words = TEXT.toLowerCase().replace(/[.]/g, "").split(" ");
    const take = (n) => words.splice(0, n).join(".");
    const entry = { dataFixes: [
      { path: `system.activities.${ACT}.consumption.targets`, from: [],
        value: Array.from({ length: 3 }, () => ({ type: "attribute", target: take(6), value: 1 })) },
      { effect: EFF, path: "changes", from: [], value: Array.from({ length: 3 }, () => ({ key: take(6), value: 1 })) }
    ] };
    expect(check(entry)).toBe("");
    expect(quoted(entry)).toMatch(/text: .*quotes 8 or more/);
    const core = { version: "1", facts: [], vocabulary: new Set(), identifiers: new Set(), validateEntry: () => [],
      getPath: (o, path) => String(path).split(".").reduce((x, k) => (x == null ? undefined : x[k]), o),
      matchesFrom: (current, from) => JSON.stringify(current) === JSON.stringify(from) };
    const r = { ...record(entry), items: [{ origin: "official", match: "matched", identifier: "x", docId: "Of00Of11Of22Of33",
      activities: [ACT], effects: [EFF], data: { sha256: "0".repeat(64) } }] };
    const local = runGates([r], { core, documents: { official: { Of00Of11Of22Of33: { _id: "Of00Of11Of22Of33",
      system: { activities: { [ACT]: { consumption: { targets: [] } } } }, effects: [{ _id: EFF, changes: [] }] } } },
    textDir: dir, ci: false, legacy: new Map() });
    expect(local.failures[r.key].text.join("; ")).toMatch(/quotes 8 or more/);
    expect(local.updated[0].evidence.gates).toBeUndefined();
  });
});

describe("M1: one effect, one changes path", () => {
  it("changes and system.changes on the same effect are refused; on two effects they are not", () => {
    const change = [{ key: "system.attributes.ac.bonus", value: 1 }];
    expect(fixes({ effect: EFF, path: "changes", value: change, from: [] },
      { effect: EFF, path: "system.changes", value: change, from: [] })).toMatch(/dataFixes\[1\]: changes and system\.changes/);
    expect(fixes({ effect: EFF, path: "changes", value: change, from: [] },
      { effect: "Eg00Eg11Eg22Eg33", path: "system.changes", value: change, from: [] })).toBe("");
  });
});
