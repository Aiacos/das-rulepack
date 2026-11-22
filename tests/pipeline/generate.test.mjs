import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { RULES } from "../../scripts/rules/index.mjs";
import {
  emittedFingerprint, legacyFingerprint, validateRecord, ruleFingerprint, saveBook, stateOf
} from "../../tools/pipeline/registry.mjs";
import {
  recordFromRule, ruleFromRecord, bookModuleSource, indexSource, generate
} from "../../tools/pipeline/generate.mjs";
import { extractNotes } from "../../tools/pipeline/migrate.mjs";
import { fromRegistry } from "../derived.mjs";

const DERIVED = fromRegistry();
const keyOfRule = (rule) => `${rule.book}|${rule.identifier}`;

// legacy.json for these records: each key with the fingerprint of its rule as it is now.
const legacyOf = (records) => new Map(records.map((r) => [r.key, legacyFingerprint(r)]));
const PLAY = { at: "2026-11-21", core: "1.0.0", world: "test-world", scenario: "s-1" };

// Synthetic rules only: invented spells.
const rules = () => [
  { book: "ZZB", identifier: "glimmer-bolt", name: "Glimmer Bolt", page: 12, kind: "spell", status: "played", handledIn: "table",
    adds: "A bolt of glimmer.", entry: { noDamage: ["saveGlimmer"] } },
  { book: "ZZB", identifier: "dusk-step", name: "Dusk Step", page: 13, kind: "sense", status: "validated", handledIn: "code",
    code: "scripts/dusk.mjs", origin: "Dusk 3", alsoIn: [{ book: "ZZC", page: 4 }], catalog: null, inCore: true, adds: "Steps." },
  { book: "ZZB", identifier: "moth-ward", name: "Moth Ward", page: 14, kind: "feature", status: "pending", handledIn: "table",
    catalog: "option", adds: "Wards moths.", entry: { triggers: [] } }
];

describe("recordFromRule / ruleFromRecord", () => {
  // Legacy pin: the 24 legacy rules, rule -> record -> rule, exactly.
  it("round-trips every shipped rule, optional properties staying absent and catalog null staying null", () => {
    const legacy = new Set(DERIVED.emitted.filter(({ record }) => DERIVED.isLegacy(record)).map(({ rule }) => keyOfRule(rule)));
    const shipped = RULES.filter((r) => legacy.has(keyOfRule(r)));
    expect(shipped).toHaveLength(24);
    for (const r of shipped) {
      const record = recordFromRule(r);
      expect(ruleFromRecord(record, { legacy: legacyOf([record]) }), r.identifier).toEqual(r);
    }
  });

  // Derived: every other emitted rule, record -> rule -> record: the shipped rule is what its record emits, and reads back
  // the record's identity and rule fields, an absent optional property staying absent and catalog null staying null.
  // (recordFromRule is the migration of hand-written rules and cannot rebuild a pipeline key: a monster's needs its section.)
  it("round-trips every emitted rule that is not legacy, record to rule to record", () => {
    for (const { record, rule } of DERIVED.emitted.filter(({ record }) => !DERIVED.isLegacy(record))) {
      expect(RULES.find((r) => keyOfRule(r) === keyOfRule(rule)), record.key).toEqual(rule);
      for (const f of ["identifier", "name", "kind", "book", "page"]) expect(rule[f], `${record.key} ${f}`).toEqual(record[f]);
      expect(rule.handledIn === "code" ? "code" : "entry", record.key).toBe(record.verdict);
      expect(rule.status, record.key).toBe({ played: "played", reviewed: "validated", gated: "validated" }[stateOf(record)]);
      expect(rule.alsoIn, record.key).toEqual(record.alsoIn);
      for (const f of ["handledIn", "adds", "entry", "code", "origin", "catalog", "inCore"]) {
        expect(f in rule, `${record.key} ${f}`).toBe(f in record.rule);
        expect(rule[f], `${record.key} ${f}`).toEqual(record.rule[f]);
      }
      expect(rule.alsoAs ?? [], record.key).toEqual((record.rule.alsoAs ?? []).map((a) => a.identifier));
      expect(rule.uncovered ?? [], record.key).toEqual(record.rule.uncovered ?? []);
    }
  });

  it("writes a valid legacy record: key, edition, verdict, origins, no played evidence", () => {
    const [a, b] = rules().map((r) => recordFromRule(r, 0));
    expect(validateRecord(a)).toEqual([]);
    expect(validateRecord(b)).toEqual([]);
    expect(a).toMatchObject({
      key: "zzb:spell:glimmer-bolt", identifier: "glimmer-bolt", edition: "2014", text: null, items: [], verdict: "entry",
      legacy: true, legacyStatus: "played", evidence: {}
    });
    expect(a.rule).toEqual({ handledIn: "table", adds: "A bolt of glimmer.", entry: { noDamage: ["saveGlimmer"] },
      origins: ["ddb-importer"] });
    expect(b.verdict).toBe("code");
    expect(b.alsoIn).toEqual([{ book: "ZZC", page: 4 }]);
  });

  it("takes 2024 for the 2024 books only", () => {
    expect(recordFromRule({ ...rules()[0], book: "XPHB" }).edition).toBe("2024");
    expect(recordFromRule({ ...rules()[0], book: "XGE" }).edition).toBe("2014");
    expect(recordFromRule({ ...rules()[0], book: "XMM" }, undefined, undefined, 2025).edition).toBe("2024");
    expect(recordFromRule({ ...rules()[0], book: "XMM" }, undefined, undefined, 2022).edition).toBe("2014");
  });

  it("legacy keeps the old status; once reviewed it follows the state; lower states are not emitted", () => {
    const r = recordFromRule(rules()[2]);
    const legacy = legacyOf([r]);
    expect(ruleFromRecord(r, { legacy }).status).toBe("pending");
    const passed = ["schema", "validator", "ids", "fixes", "text"];
    const fresh = { ...r, legacy: undefined, legacyStatus: undefined };
    const gates = { at: "d", core: "c", rule: ruleFingerprint(r.rule), emits: emittedFingerprint(fresh), passed };
    expect(ruleFromRecord(fresh)).toBeNull();
    // Ruling R27: gated and never reviewed, the rule is held for a person.
    expect(ruleFromRecord({ ...fresh, evidence: { gates } })).toBeNull();
    // A review and a play count for the rule they are stamped with (`rule`), not for an edited one.
    const reviewed = { by: "reader-2", at: "d", agrees: true, rule: gates.rule, confidence: 0.9 };
    expect(ruleFromRecord({ ...fresh, evidence: { gates, reviewed } }).status).toBe("validated");
    expect(ruleFromRecord({ ...fresh, evidence: { gates, reviewed, played: { ...PLAY, rule: gates.rule } } }).status)
      .toBe("played");
    expect(ruleFromRecord({ ...fresh, evidence: { gates, reviewed, played: PLAY } }).status).toBe("validated");
    expect(ruleFromRecord({ ...r, evidence: { played: PLAY } }, { legacy }).status).toBe("played");
  });

  it("does not let a hand-typed play upgrade a legacy record", () => {
    const r = recordFromRule(rules()[2]);
    const legacy = legacyOf([r]);
    for (const played of [{}, true, { at: "x" }, { ...PLAY, world: "" }]) {
      expect(ruleFromRecord({ ...r, evidence: { played } }, { legacy }).status).toBe("pending");
    }
  });

  it("emits a legacy record only with standing: listed in legacy.json with its rule unchanged since migration", () => {
    const r = recordFromRule(rules()[0]);
    expect(ruleFromRecord(r)).toBeNull();
    expect(ruleFromRecord(r, { legacy: new Map() })).toBeNull();
    const edited = { ...r, rule: { ...r.rule, adds: "Edited after migration." } };
    expect(ruleFromRecord(edited, { legacy: legacyOf([r]) })).toBeNull();
    expect(ruleFromRecord(r, { legacy: legacyOf([r]) })).not.toBeNull();
  });

  it("emits only the verdicts entry and code", () => {
    const r = recordFromRule(rules()[0]);
    for (const verdict of ["core", "data", "none", "engine", "unverifiable"]) {
      const other = { ...r, verdict };
      expect(ruleFromRecord(other, { legacy: legacyOf([other]) }), verdict).toBeNull();
    }
    const code = { ...r, verdict: "code" };
    expect(ruleFromRecord(code, { legacy: legacyOf([code]) })).not.toBeNull();
  });

  it("binds legacy standing to everything the module emits, not to the evidence", () => {
    const r = recordFromRule(rules()[1], 0);
    const legacy = legacyOf([r]);
    const edits = [
      { legacyStatus: "played" }, { identifier: "dusk-stride" }, { name: "Dusk Stride" }, { page: 99 }, { kind: "spell" },
      { book: "ZZC" }, { verdict: "entry" }, { alsoIn: [] }, { rule: { ...r.rule, adds: "Edited." } }
    ];
    for (const edit of edits) {
      expect(ruleFromRecord({ ...r, ...edit }, { legacy }), JSON.stringify(edit)).toBeNull();
    }
    expect(ruleFromRecord({ ...r, evidence: { played: PLAY } }, { legacy }).status).toBe("played");
  });
});

describe("bookModuleSource", () => {
  const records = () => rules().map((r, i) => recordFromRule(r, i, i === 1 ? "First line.\nSecond line." : undefined));
  const legacy = legacyOf(records());

  it("starts with the generated header and carries the notes as comments", () => {
    const src = bookModuleSource("ZZB", records(), undefined, { legacy });
    expect(src.split("\n")[0]).toBe("// Generated from registry/zzb.json by npm run build:rules — do not edit.");
    expect(src).toContain("  // First line.\n  // Second line.\n  {");
  });

  it("emits the book note as the header comment, right after the generated line", () => {
    const src = bookModuleSource("ZZB", records(), "Title (2030).\n\nSecond paragraph.", { legacy });
    expect(src.split("\n").slice(0, 6)).toEqual([
      "// Generated from registry/zzb.json by npm run build:rules — do not edit.",
      "/**", " * Title (2030).", " *", " * Second paragraph.", " */"
    ]);
  });

  it("exports BOOK and RULES deep-equal to the input, in order, new records after by key", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gen-"));
    mkdirSync(join(dir, "books"));
    copyFileSync(new URL("../../scripts/rules/book.mjs", import.meta.url), join(dir, "book.mjs"));
    const [a, b, c] = records();
    const late = { ...c, key: "zzb:spell:aaa", identifier: "aaa", name: "Aaa" };
    delete late.order;
    writeFileSync(join(dir, "books", "zzb.mjs"), bookModuleSource("ZZB", [late, c, b, a], undefined, {
      legacy: legacyOf([late, c, b, a])
    }));
    const mod = await import(pathToFileURL(join(dir, "books", "zzb.mjs")).href);
    expect(mod.BOOK).toBe("ZZB");
    expect(mod.RULES.map((r) => r.identifier)).toEqual(["glimmer-bolt", "dusk-step", "moth-ward", "aaa"]);
    expect(mod.RULES[0]).toEqual(rules()[0]);
    expect(mod.RULES[1]).toEqual(rules()[1]);
  });

  it("leaves out a record that is not yet gated", () => {
    const fresh = { ...records()[0], legacy: undefined, legacyStatus: undefined };
    expect(bookModuleSource("ZZB", [fresh])).toBeNull();
  });
});

describe("indexSource", () => {
  it("lists the books in the order given, with the same exports", () => {
    const src = indexSource(["aa", "bb"]);
    expect(src.split("\n")[0]).toBe("// Generated by npm run build:rules from the books of registry/ — do not edit.");
    expect(src).toContain('import * as aa from "./books/aa.mjs";');
    expect(src).toContain("export const BOOKS = Object.freeze([aa, bb]);");
    for (const name of ["RULES", "SPELLS", "SENSES", "FEATURES", "TABLE"]) expect(src).toContain(`export const ${name} =`);
  });

  it("refuses a book code that is not a JavaScript identifier once lower-cased", () => {
    for (const code of ["1ab", "a-b", "do", "new", "in"]) expect(() => indexSource([code]), code).toThrow(/JavaScript identifier/);
  });
});

describe("generate", () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), "gen-"));
    const registry = join(root, "registry");
    const out = join(root, "rules");
    mkdirSync(join(out, "books"), { recursive: true });
    const records = rules().map((r, i) => recordFromRule(r, i));
    saveBook(registry, { book: "ZZB", records });
    writeFileSync(join(registry, "legacy.json"), `${JSON.stringify(Object.fromEntries(legacyOf(records)))}\n`);
    return { registry, out, records };
  };

  it("writes the books and the index, then --check passes; a manual edit makes it fail", () => {
    const { registry, out } = setup();
    expect(generate({ registry, out }).written.sort()).toEqual(["books/zzb.mjs", "index.mjs"]);
    expect(generate({ registry, out, check: true }).differing).toEqual([]);
    const file = join(out, "books", "zzb.mjs");
    writeFileSync(file, `${readFileSync(file, "utf8")}// hand edit\n`);
    expect(generate({ registry, out, check: true }).differing).toEqual(["books/zzb.mjs"]);
    expect(readFileSync(file, "utf8")).toContain("hand edit");
  });

  it("flags a generated file that no registry book accounts for, and removes it when writing", () => {
    const { registry, out } = setup();
    generate({ registry, out });
    writeFileSync(join(out, "books", "old.mjs"), "// Generated from registry/old.json by npm run build:rules — do not edit.\n");
    expect(generate({ registry, out, check: true }).differing).toEqual(["books/old.mjs"]);
    generate({ registry, out });
    expect(readdirSync(join(out, "books"))).toEqual(["zzb.mjs"]);
  });

  it("refuses, writing nothing, a legacy record edited since migration or not in legacy.json, and names it", () => {
    const { registry, out, records } = setup();
    const [first, ...others] = records;
    const edited = { ...first, rule: { ...first.rule, adds: "Edited after migration." } };
    saveBook(registry, { book: "ZZB", records: [edited, ...others] });
    expect(() => generate({ registry, out })).toThrow(`legacy: ${first.key} changed since migration`);
    expect(readdirSync(join(out, "books"))).toEqual([]);
    const stray = { ...others[0], key: "zzb:spell:stray", identifier: "stray", name: "Stray" };
    saveBook(registry, { book: "ZZB", records: [first, ...others, stray] });
    expect(() => generate({ registry, out, check: true })).toThrow(`legacy: ${stray.key} is not in legacy.json`);
    const cli = spawnSync("node", ["tools/pipeline/cli.mjs", "generate", "--check"], {
      encoding: "utf8", env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_RULES: out }
    });
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain(`legacy: ${stray.key} is not in legacy.json`);
    // A rule under a verdict that is not emitted is named, not skipped (saveBook refuses it, so the file is written by hand).
    const file = join(registry, "zzb.json");
    const book = JSON.parse(readFileSync(file, "utf8"));
    book.records = book.records.filter((x) => x.key !== stray.key);
    book.records[0].verdict = "unverifiable";
    writeFileSync(file, JSON.stringify(book));
    const named = `${book.records[0].key}: has a rule but the verdict unverifiable`;
    expect(() => generate({ registry, out, check: true })).toThrow(named);
  });
});

describe("extractNotes", () => {
  const src = [
    "export const RULES = book(BOOK, [",
    "  // Shared lead.",
    "  {",
    '    identifier: "one", name: "One", entry: { a: "}" },',
    "    // Inside one.",
    "    adds: \"x\"",
    "  },",
    "",
    "  {",
    '    identifier: "two", name: "Two",',
    "  },",
    "  // Before three.",
    "  {",
    '    identifier: "three", entry: { t: [ // nested',
    "    ] }",
    "  }",
    "]);"
  ].join("\n");

  it("gives each rule the comments between the previous rule and its own end", () => {
    expect(extractNotes(src, ["one", "two", "three"])).toEqual({
      one: "Shared lead.\nInside one.", two: undefined, three: "Before three.\nnested"
    });
  });
});
