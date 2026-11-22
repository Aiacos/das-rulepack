import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOKS, RULES, TABLE } from "../scripts/rules/index.mjs";
import { KINDS, STATUSES, HANDLED_IN } from "../scripts/rules/book.mjs";
import { BLADE_CANTRIPS } from "../scripts/core/blade-cantrips.mjs";
import { SPELL_IDENTIFIER } from "../scripts/core/shadow-blade.mjs";
import { DREADFUL_STRIKES } from "../scripts/core/dreadful-strikes.mjs";
import { PSYCHIC_VEIL } from "../scripts/core/psychic-veil.mjs";
import { fromRegistry, newRulesByBook } from "./derived.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const root = resolve(HERE, "..");
const byId = id => RULES.find(rule => rule.identifier === id);
const derived = fromRegistry();
// The 24 legacy rules (registry/legacy.json, with standing), by "<book>|<identifier>".
const LEGACY = new Set(derived.emitted.filter(({ record }) => derived.isLegacy(record))
  .map(({ rule }) => `${rule.book}|${rule.identifier}`));
const isLegacyRule = rule => LEGACY.has(`${rule.book}|${rule.identifier}`);

function expectShape(rule) {
  expect(rule.identifier).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  expect(rule.name, rule.identifier).toBeTruthy();
  expect(Number.isInteger(rule.page) && (rule.page > 0), rule.identifier).toBe(true);
  expect(KINDS, rule.identifier).toContain(rule.kind);
  expect(STATUSES, rule.identifier).toContain(rule.status);
  expect(HANDLED_IN, rule.identifier).toContain(rule.handledIn);
  expect(rule.adds, rule.identifier).toBeTruthy();
  expect(rule.adds, rule.identifier).not.toContain("|");   // it goes in a Markdown table
  for ( const other of rule.alsoIn ?? [] ) expect(Number.isInteger(other.page) && !!other.book, rule.identifier).toBe(true);
}

// The rows of the generated block of docs/RULES.md, counted by book and status: `{ XGE: { played: 9, validated: 2 } }`.
const STATUS_OF = { "Played": "played", "Played by hand": "played", "Validated": "validated", "Pending": "pending" };
function rulesDocCounts() {
  const text = readFileSync(resolve(root, "docs/RULES.md"), "utf8");
  const block = text.slice(text.indexOf("<!-- auto:rules -->"), text.indexOf("<!-- /auto:rules -->"));
  const out = {};
  let code = null;
  for ( const line of block.split("\n") ) {
    const heading = /^### ([A-Z][A-Z0-9]+) · /.exec(line);
    if ( heading ) { code = heading[1]; continue; }
    if ( !code || !line.startsWith("| ") || line.startsWith("| Rule |") ) continue;
    const status = STATUS_OF[line.split("|").at(-2).trim()];
    expect(status, line).toBeTruthy();
    (out[code] ??= {})[status] = (out[code][status] ?? 0) + 1;
  }
  return out;
}

describe("per-book rule modules", () => {
  it("every file of scripts/rules/books/ is in the index, named after its book code", () => {
    const files = readdirSync(resolve(root, "scripts/rules/books")).filter(f => f.endsWith(".mjs")).sort();
    expect(BOOKS.map(module => `${module.BOOK.toLowerCase()}.mjs`).sort()).toEqual(files);
  });

  it("every rule carries its book, and a book's rules all carry that book's code", () => {
    for ( const module of BOOKS ) {
      expect(module.RULES.length, module.BOOK).toBeGreaterThan(0);
      for ( const rule of module.RULES ) expect(rule.book, rule.identifier).toBe(module.BOOK);
    }
  });

  // Legacy pin: the 24 hand-written rules keep every property they shipped with.
  it("every rule has an identifier, a name, a page, a kind, a status, where it is handled and one line for the README", () => {
    const legacy = RULES.filter(isLegacyRule);
    expect(legacy).toHaveLength(24);
    for ( const rule of legacy ) expectShape(rule);
  });

  // Derived: the other rules are those registry/ emits (ruleFromRecord), each as generated, with the same properties.
  it("the rules that are not legacy are what registry/ emits, and each has the same properties", () => {
    const others = derived.emitted.filter(({ record }) => !derived.isLegacy(record)).map(({ rule }) => rule);
    const key = rule => `${rule.book}|${rule.identifier}`;
    expect(RULES.filter(rule => !isLegacyRule(rule)).map(key).sort()).toEqual(others.map(key).sort());
    for ( const rule of others ) {
      expect(RULES.find(r => key(r) === key(rule)), key(rule)).toEqual(rule);
      expectShape(rule);
    }
  });

  // The one guard against silent growth: docs/RULES.md, written by `npm run books` and committed, states the rules of each
  // book and their status; the ones that are not legacy must be what registry/ emits. A new rule shows in that file's diff.
  it("docs/RULES.md states, book by book, the rules registry/ emits beyond the 24 legacy ones", () => {
    const stated = rulesDocCounts();
    const legacy = newRulesByBook(derived.emitted, record => !derived.isLegacy(record));
    const beyond = {};
    for ( const [code, counts] of Object.entries(stated) ) {
      for ( const [status, n] of Object.entries(counts) ) {
        const extra = n - (legacy[code]?.[status] ?? 0);
        if ( extra ) (beyond[code] ??= {})[status] = extra;
      }
    }
    expect(beyond).toEqual(newRulesByBook(derived.emitted, derived.isLegacy));
    expect(Object.values(legacy).flatMap(Object.values).reduce((a, b) => a + b, 0)).toBe(24);
  });

  it("no identifier is declared twice, so no rule can silently replace another", () => {
    const ids = RULES.map(rule => rule.identifier);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it("a rule handled in the table has an entry and no script; a rule handled in code names a script that exists", () => {
    for ( const rule of RULES ) {
      if ( rule.handledIn === "table" ) {
        expect(rule.entry, rule.identifier).toBeTypeOf("object");
        expect(rule.code, rule.identifier).toBeUndefined();
      } else {
        expect(existsSync(resolve(root, rule.code ?? "missing")), `${rule.identifier}: ${rule.code}`).toBe(true);
      }
    }
  });

  it("the registered table is the entries of the rules, and nothing else", () => {
    expect(Object.keys(TABLE).sort()).toEqual(RULES.filter(rule => rule.entry).map(rule => rule.identifier).sort());
    for ( const rule of RULES ) if ( rule.entry ) expect(TABLE[rule.identifier]).toBe(rule.entry);
  });

  it("the identifiers the scripts recognise are rules handled in code", () => {
    for ( const id of [...Object.keys(BLADE_CANTRIPS), SPELL_IDENTIFIER, DREADFUL_STRIKES, PSYCHIC_VEIL] ) {
      expect(byId(id)?.handledIn, id).toBe("code");
    }
    expect(RULES.filter(rule => rule.handledIn === "code").map(rule => rule.identifier).sort())
      .toEqual([...Object.keys(BLADE_CANTRIPS), SPELL_IDENTIFIER, DREADFUL_STRIKES, PSYCHIC_VEIL].sort());
  });
});

describe("what the manifest and the build point at", () => {
  it("module.json: the manifest and download URLs are those of the release build.sh names, for this version", async () => {
    const { readFileSync } = await import("node:fs");
    const manifest = JSON.parse(readFileSync(resolve(root, "module.json"), "utf8"));
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    expect(pkg.version).toBe(manifest.version);
    expect(manifest.manifest).toBe(`${manifest.url}/releases/latest/download/module.json`);
    expect(manifest.download).toBe(`${manifest.url}/releases/download/v${manifest.version}/${manifest.id}-v${manifest.version}.zip`);
    expect(readFileSync(resolve(root, "build.sh"), "utf8")).toContain('OUTPUT_FILE="${MODULE_ID}-v${VERSION}.zip"');
    expect(readFileSync(resolve(root, "CHANGELOG.md"), "utf8")).toContain(`## ${manifest.version} — `);
    expect(readFileSync(resolve(root, "README.md"), "utf8")).toContain(manifest.manifest);
  });

  it("module.json: every script and language file exists", async () => {
    const { readFileSync } = await import("node:fs");
    const manifest = JSON.parse(readFileSync(resolve(root, "module.json"), "utf8"));
    for ( const file of [...manifest.esmodules, ...manifest.languages.map(l => l.path)] ) {
      expect(existsSync(resolve(root, file)), file).toBe(true);
    }
  });
});
