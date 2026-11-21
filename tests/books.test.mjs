import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOKS, RULES, TABLE } from "../scripts/rules/index.mjs";
import { KINDS, STATUSES, HANDLED_IN } from "../scripts/rules/book.mjs";
import { BLADE_CANTRIPS } from "../scripts/core/blade-cantrips.mjs";
import { SPELL_IDENTIFIER } from "../scripts/core/shadow-blade.mjs";
import { DREADFUL_STRIKES } from "../scripts/core/dreadful-strikes.mjs";
import { PSYCHIC_VEIL } from "../scripts/core/psychic-veil.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const root = resolve(HERE, "..");
const byId = id => RULES.find(rule => rule.identifier === id);

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

  it("every rule has an identifier, a name, a page, a kind, a status, where it is handled and one line for the README", () => {
    for ( const rule of RULES ) {
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
