import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { README, CATALOG, FOUNDRY, bar, differences, figures, foundryPackage, parts, PARTS, refresh, renderBooks, renderRules }
  from "../tools/books-progress.mjs";
import { RULES } from "../scripts/rules/index.mjs";

const book = code => CATALOG.books.find(b => b.code === code);

describe("docs/books.json and docs/foundry-modules.json", () => {
  it("state their method, their source and their dates", () => {
    expect(CATALOG.method).toMatch(/Static comparison by name/);
    expect(CATALOG.computed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(FOUNDRY.source).toMatch(/^https:\/\//);
    expect(FOUNDRY.read).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("carry counts only: a code, a name, a year, a group, the Foundry package and the counts per kind", () => {
    for ( const b of CATALOG.books ) {
      expect(Object.keys(b)).toEqual(["code", "name", "year", "group", "foundry", "kinds"]);
      for ( const counts of Object.values(b.kinds) ) {
        expect(Object.keys(counts)).toEqual(["total", "core", "rulepack"]);
        for ( const n of Object.values(counts) ) expect(Number.isInteger(n) && (n >= 0)).toBe(true);
        expect(counts.core + counts.rulepack).toBeLessThanOrEqual(counts.total);
      }
    }
  });

  it("agree on which book is published as an official Foundry module, each package mapped to a known book or to none", () => {
    const codes = CATALOG.books.map(b => b.code);
    for ( const pkg of FOUNDRY.packages ) if ( pkg.book !== null ) expect(codes, pkg.id).toContain(pkg.book);
    const mapped = FOUNDRY.packages.filter(pkg => pkg.book).map(pkg => pkg.book);
    expect(new Set(mapped).size).toBe(mapped.length);
    for ( const b of CATALOG.books ) expect(b.foundry, b.code).toBe(foundryPackage(b.code));
  });

  it("know every book the pack has rules for, and the kind each rule is counted under", () => {
    expect(differences().filter(line => !/the pack's own rules win/.test(line))).toEqual([]);
  });
});

describe("progress by rulebook", () => {
  it("counts the pack's rules from its own book modules", () => {
    for ( const b of CATALOG.books ) {
      const f = figures(b);
      expect(f.pack + f.refined + f.uncounted.length, b.code).toBe(RULES.filter(rule => rule.book === b.code).length);
      expect(f.core + f.pack, b.code).toBeLessThanOrEqual(f.total);
    }
    expect(figures(book("XGE"))).toMatchObject({ pack: 12, refined: 0 });
    expect(figures(book("TCE"))).toMatchObject({ pack: 5, audit: 3 });    // the audit does not see the two rules handled in code alone
    expect(figures(book("XPHB"))).toMatchObject({ pack: 0, refined: 3 });   // entries DAS · Core already has
    expect(figures(book("MPMM")).uncounted.map(rule => rule.identifier)).toEqual(["life-sense"]);
  });

  it("draws a bar of ten cells", () => {
    expect(bar(0, 10)).toBe("`░░░░░░░░░░` 0%");
    expect(bar(5, 10)).toBe("`█████░░░░░` 50%");
    expect(bar(10, 10)).toBe("`██████████` 100%");
    expect(bar(1, 500)).toBe("`░░░░░░░░░░` <1%");
    expect(bar(0, 0)).toBe("—");   // nothing to measure: a book that has only monsters
    expect(bar(1, 500, { html: true })).toBe("<code>░░░░░░░░░░</code> &lt;1%");
    expect(bar(1, 4, { cells: 20 })).toBe("`█████░░░░░░░░░░░░░░░` 25%");
  });

  it("splits the books in two tables, each with its total, and a grand total", () => {
    const block = renderBooks();
    const a = block.indexOf("### A. Published as an official Foundry VTT module");
    const b = block.indexOf("### B. Not published on Foundry — rules still to implement");
    const all = block.indexOf("### Each rulebook, part by part");
    expect(block.indexOf("### Overall")).toBe(0);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(all).toBeGreaterThan(b);
    const rows = (from, to) => block.slice(from, to).split("\n").filter(line => /^\| [A-Z]/.test(line)).map(line => line.split(" | ")[0].slice(2));
    const published = CATALOG.books.filter(x => x.foundry), others = CATALOG.books.filter(x => !x.foundry);
    expect(rows(a, b).slice(1).sort()).toEqual(published.map(x => x.code).sort());
    expect(rows(b, all).slice(1).sort()).toEqual(others.map(x => x.code).sort());
    const years = (from, to) => block.slice(from, to).split("\n").filter(line => /^\| [A-Z]/.test(line)).slice(1).map(line => Number(line.split(" | ")[2]));
    for ( const list of [years(a, b), years(b, all)] ) expect(list).toEqual(list.slice().sort((x, y) => x - y));
    expect(block.slice(a, b)).toContain(`| **Total** | ${published.length} books |`);
    expect(block.slice(b, all)).toContain(`| **Total** | ${others.length} books |`);
    const total = CATALOG.books.reduce((n, x) => n + figures(x).total, 0);
    expect(block.slice(0, a)).toContain(`| **All rulebooks** | **${CATALOG.books.length}** | **${total}** |`);
    // Monsters are in no total: every total is the sum of the five measured kinds, and the creatures are a column apart.
    const measured = CATALOG.books.reduce((n, x) => n + Object.entries(x.kinds).filter(([kind]) => kind !== "monster").reduce((m, [, c]) => m + c.total, 0), 0);
    const core = CATALOG.books.reduce((n, x) => n + Object.entries(x.kinds).filter(([kind]) => kind !== "monster").reduce((m, [, c]) => m + c.core, 0), 0);
    const monsters = CATALOG.books.reduce((n, x) => n + (x.kinds.monster?.total ?? 0), 0);
    expect(total).toBe(measured);
    expect(block.slice(0, a)).toMatch(new RegExp(`\\| \\*\\*All rulebooks\\*\\* \\| \\*\\*40\\*\\* \\| \\*\\*${measured}\\*\\* \\| \\*\\*${core}\\*\\* \\| .* \\| \\*\\*${monsters}\\*\\* \\|$`, "m"));
    expect(figures(book("MPMM"))).toMatchObject({ total: 0, core: 0, monsters: 261 });
    expect(block).toContain("| MPMM | Mordenkainen Presents: Monsters of the Multiverse | 2022 | supplement | 0 | 0 | 0 | — | 261 |");
    expect(block.slice(0, a)).toContain("| A. Official Foundry module |");
    expect(block.slice(0, a)).toContain("| B. Not on Foundry |");
  });

  it("gives every rulebook a block with one bar per part it has entries for, the pack's share taken from its own rules", () => {
    const block = renderBooks();
    expect(block.split("<details>").length - 1).toBe(CATALOG.books.length);
    expect(block.split("</details>").length - 1).toBe(CATALOG.books.length);
    for ( const b of CATALOG.books ) {
      const list = parts(b);
      expect(list.map(part => part.kind)).toEqual(Object.keys(PARTS).filter(kind => b.kinds[kind]?.total > 0));
      expect(Object.keys(b.kinds).filter(kind => !(kind in PARTS)), b.code).toEqual([]);
      const f = figures(b);
      const counted = list.filter(part => part.measured);
      expect(list.filter(part => !part.measured).map(part => part.kind)).toEqual(b.kinds.monster ? ["monster"] : []);
      expect(counted.reduce((n, part) => n + part.total, 0), b.code).toBe(f.total);
      expect(counted.reduce((n, part) => n + part.core, 0), b.code).toBe(f.core);
      expect(list.reduce((n, part) => n + part.pack, 0), b.code).toBe(f.pack);
      expect(list.reduce((n, part) => n + part.refined, 0), b.code).toBe(f.refined);
      expect(block, b.code).toContain(`<summary><b>${b.code}</b> · ${b.name} — `);
    }
    const xge = Object.fromEntries(parts(book("XGE")).map(part => [part.kind, part.pack]));
    expect(xge).toMatchObject({ spell: 11, option: 1, feature: 0 });   // Ghostly Gaze is counted with the options
    expect(block).toContain("| Spells | 95 | 11 | 11 | `██░░░░░░░░` 23% |");
    expect(block).toContain("| Monsters | 2 | — | — | read from the sheet text — not measured |");
    expect(block).not.toMatch(/\| Monsters \|.*%/);
  });

  it("lists every rule of the pack once in the table of rules", () => {
    const block = renderRules();
    for ( const rule of RULES ) expect(block.split(`| ${rule.name}`).length - 1, rule.identifier).toBe(1);
  });

  it("README.md is up to date (otherwise: npm run books)", () => {
    const text = readFileSync(README, "utf8");
    expect(refresh(text)).toBe(text);
    expect(text).toContain("## 📚 Progress by rulebook");
    expect(text).toContain("## 🗂️ Layout");
  });
});
