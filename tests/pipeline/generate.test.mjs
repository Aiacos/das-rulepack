import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { RULES } from "../../scripts/rules/index.mjs";
import { validateRecord, ruleFingerprint, saveBook } from "../../tools/pipeline/registry.mjs";
import {
  recordFromRule, ruleFromRecord, bookModuleSource, indexSource, generate
} from "../../tools/pipeline/generate.mjs";
import { extractNotes } from "../../tools/pipeline/migrate.mjs";

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
  it("round-trips every shipped rule, optional properties staying absent and catalog null staying null", () => {
    expect(RULES.length).toBeGreaterThan(0);
    for (const r of RULES) expect(ruleFromRecord(recordFromRule(r)), r.identifier).toEqual(r);
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
  });

  it("legacy keeps the old status; once gated it follows the state; lower states are not emitted", () => {
    const r = recordFromRule(rules()[2]);
    expect(ruleFromRecord(r).status).toBe("pending");
    const passed = ["schema", "validator", "ids", "fixes", "text"];
    const gates = { at: "d", core: "c", rule: ruleFingerprint(r.rule), passed };
    const fresh = { ...r, legacy: undefined, legacyStatus: undefined };
    expect(ruleFromRecord(fresh)).toBeNull();
    expect(ruleFromRecord({ ...fresh, evidence: { gates } }).status).toBe("validated");
    expect(ruleFromRecord({ ...fresh, evidence: { gates, reviewed: { agrees: true } } }).status).toBe("validated");
    expect(ruleFromRecord({ ...fresh, evidence: { gates, reviewed: { agrees: true }, played: {} } }).status).toBe("played");
    expect(ruleFromRecord({ ...r, evidence: { played: {} } }).status).toBe("played");
  });
});

describe("bookModuleSource", () => {
  const records = () => rules().map((r, i) => recordFromRule(r, i, i === 1 ? "First line.\nSecond line." : undefined));

  it("starts with the generated header and carries the notes as comments", () => {
    const src = bookModuleSource("ZZB", records());
    expect(src.split("\n")[0]).toBe("// Generated from registry/zzb.json by npm run build:rules — do not edit.");
    expect(src).toContain("  // First line.\n  // Second line.\n  {");
  });

  it("exports BOOK and RULES deep-equal to the input, in order, new records after by key", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gen-"));
    mkdirSync(join(dir, "books"));
    copyFileSync(new URL("../../scripts/rules/book.mjs", import.meta.url), join(dir, "book.mjs"));
    const [a, b, c] = records();
    const late = { ...c, key: "zzb:spell:aaa", identifier: "aaa", name: "Aaa" };
    delete late.order;
    writeFileSync(join(dir, "books", "zzb.mjs"), bookModuleSource("ZZB", [late, c, b, a]));
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
});

describe("generate", () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), "gen-"));
    const registry = join(root, "registry");
    const out = join(root, "rules");
    mkdirSync(join(out, "books"), { recursive: true });
    saveBook(registry, { book: "ZZB", records: rules().map((r, i) => recordFromRule(r, i)) });
    writeFileSync(join(registry, "legacy.json"), "[]\n");
    return { registry, out };
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
