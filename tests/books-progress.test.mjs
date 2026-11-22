import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { README, RULES_DOC, DOCS_URL, GENERATED, CATALOG, FOUNDRY, bar, differences, figures, foundryPackage, parts, PARTS, renderBooks,
  renderRules, renderSummary, heldRules, kindLabel }
  from "../tools/books-progress.mjs";
import { HELD_REASONS } from "../tools/pipeline/generate.mjs";
import { RULES } from "../scripts/rules/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const book = code => CATALOG.books.find(b => b.code === code);

describe("docs/books.json and docs/foundry-modules.json", () => {
  it("state their method, their source and their dates", () => {
    expect(CATALOG.method).toMatch(/Static comparison by name/);
    expect(CATALOG.computed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CATALOG.monsters.method).toMatch(/resolved when none of its features is open/);
    expect(CATALOG.monsters.limits).toMatch(/not proof of play/);
    expect(CATALOG.monsters.computed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(FOUNDRY.source).toMatch(/^https:\/\//);
    expect(FOUNDRY.read).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("carry counts only: a code, a name, a year, a group, the Foundry package and the counts per kind", () => {
    for ( const b of CATALOG.books ) {
      expect(Object.keys(b)).toEqual(["code", "name", "year", "group", "foundry", "kinds"]);
      for ( const [kind, counts] of Object.entries(b.kinds) ) {
        // Monsters: `core` is the monsters fully resolved, and their features are counted beside them.
        expect(Object.keys(counts)).toEqual((kind === "monster") ? ["total", "core", "pack", "features", "featuresResolved"] : ["total", "core", "rulepack"]);
        for ( const n of Object.values(counts) ) expect(Number.isInteger(n) && (n >= 0)).toBe(true);
        expect(counts.core + (counts.rulepack ?? counts.pack)).toBeLessThanOrEqual(counts.total);
        if ( kind === "monster" ) expect(counts.featuresResolved).toBeLessThanOrEqual(counts.features);
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
    expect(bar(0, 0)).toBe("—");   // nothing to measure
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
    // Every total is the sum of the six kinds, monsters included: a monster is one entry, covered when it is resolved.
    const every = CATALOG.books.reduce((n, x) => n + Object.values(x.kinds).reduce((m, c) => m + c.total, 0), 0);
    const core = CATALOG.books.reduce((n, x) => n + Object.values(x.kinds).reduce((m, c) => m + c.core, 0), 0);
    const monsters = CATALOG.books.reduce((n, x) => n + (x.kinds.monster?.total ?? 0), 0);
    const resolved = CATALOG.books.reduce((n, x) => n + (x.kinds.monster?.core ?? 0), 0);
    expect(total).toBe(every);
    expect(block.slice(0, a)).toMatch(new RegExp(`\\| \\*\\*All rulebooks\\*\\* \\| \\*\\*${CATALOG.books.length}\\*\\* \\| \\*\\*${every}\\*\\* \\| \\*\\*${core}\\*\\* \\| .* \\| \\*\\*${resolved} / ${monsters}\\*\\* \\|$`, "m"));
    const mpmm = book("MPMM").kinds.monster;
    expect(figures(book("MPMM"))).toMatchObject({ total: mpmm.total, core: mpmm.core, monsters: mpmm.total, resolved: mpmm.core, pack: 0 });
    expect(block).not.toMatch(/monsters only/);
    expect(block.slice(0, a)).toContain("| A. Official Foundry module |");
    expect(block.slice(0, a)).toContain("| B. Not on Foundry |");
  });

  it("counts the official Foundry books that the catalogue does not contain like any other book, from their own module", () => {
    const block = renderBooks();
    const extra = CATALOG.outsideCatalogue.measured;
    expect(extra.map(x => x.code)).toEqual(["RHW", "AU", "WOW"]);
    expect(CATALOG.unmeasured).toBeUndefined();
    for ( const x of extra ) {
      expect(book(x.code), x.code).toMatchObject({ group: null, foundry: x.package });
      expect(foundryPackage(x.code), x.code).toBe(x.package);
      expect(x.version && x.source && /^\d{4}-\d{2}-\d{2}$/.test(x.measured), x.code).toBeTruthy();
      expect(block).toContain(`<summary><b>${x.code}</b>`);
      expect(block).toContain(`${x.code}; version ${x.version}, ${x.source}, ${x.measured}`);
    }
    expect(figures(book("RHW"))).toMatchObject({ total: 132, core: 71, pack: 0, monsters: 69, resolved: 37 });
    expect(figures(book("AU"))).toMatchObject({ total: 238, core: 20, pack: 0, monsters: 38, resolved: 20 });
    expect(figures(book("WOW"))).toMatchObject({ total: 405, core: 73, pack: 0, monsters: 125, resolved: 69 });
    expect(parts(book("WOW")).map(part => part.kind)).toContain("trait");
    expect(parts(book("AU")).map(part => part.kind)).not.toContain("trait");
    expect(block).not.toMatch(/not measured|declares/);
    const adventures = FOUNDRY.packages.filter(pkg => !pkg.book);
    expect(adventures.every(pkg => pkg.kind === "adventure")).toBe(true);
    expect(block).toContain(`these ${adventures.length} official packages are adventures, outside the scope of the tables`);
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
      expect(list.reduce((n, part) => n + part.total, 0), b.code).toBe(f.total);
      expect(list.reduce((n, part) => n + part.core, 0), b.code).toBe(f.core);
      expect(list.reduce((n, part) => n + part.pack, 0), b.code).toBe(f.pack);
      expect(list.reduce((n, part) => n + part.refined, 0), b.code).toBe(f.refined);
      expect(block, b.code).toContain(`<summary><b>${b.code}</b> · ${b.name} — `);
    }
    const xge = Object.fromEntries(parts(book("XGE")).map(part => [part.kind, part.pack]));
    expect(xge).toMatchObject({ spell: 11, option: 1, feature: 0 });   // Ghostly Gaze is counted with the options
    expect(block).toContain("| Spells | 95 | 11 | 11 | `██░░░░░░░░` 23% |");
    const m = book("XGE").kinds.monster;
    expect(block).toContain(`| Monsters (fully resolved) | ${m.total} | ${m.core} | 0 | ${bar(m.core, m.total)} |`);
    expect(block).toContain(`| ↳ their features | ${m.features} | ${m.featuresResolved} | — | ${bar(m.featuresResolved, m.features)} |`);
    expect(block.split("| ↳ their features |").length - 1).toBe(CATALOG.books.filter(x => x.kinds.monster).length);
  });

  it("lists every rule of the pack once in the table of rules, and every rule held for a person once (Ruling R27)", () => {
    const block = renderRules();
    // As shown: the name, with its origin (a creature, a subclass…) when it has one, so "Claw (Ghast)" is not "Claw (Ghoul)".
    const shown = rule => (rule.origin ? `${rule.name} (${rule.origin})` : rule.name);
    for ( const rule of RULES ) expect(block.split(`| ${shown(rule)} |`).length - 1, rule.identifier).toBe(1);
    const held = heldRules();
    for ( const row of held ) {
      expect(block.split(`| ${shown(row)} | ${kindLabel(row.kind)} | p.${row.page} | Held: ${HELD_REASONS[row.because]} |`)
        .length - 1, row.name).toBe(1);
    }
    expect(block.split("| Held: ").length - 1).toBe(held.length);
  });

  it("README.md and docs/RULES.md are up to date (otherwise: npm run books)", () => {
    expect(GENERATED.map(g => g.file)).toEqual([README, RULES_DOC]);
    for ( const { file, name, refresh } of GENERATED ) {
      const text = readFileSync(file, "utf8");
      expect(refresh(text) === text, `${name} is stale`).toBe(true);
    }
    const readme = readFileSync(README, "utf8");
    expect(readme).toContain("## 📚 Progress by rulebook");
    expect(readme).toContain("## 🗂️ Layout");
    expect(readme).toContain(renderSummary());
    expect(readFileSync(RULES_DOC, "utf8")).toContain(renderRules());
  });

  it("the README sums the rules up in three lines and sends to docs/RULES.md near its top", () => {
    const summary = renderSummary();
    expect(summary.split("\n").length).toBe(3);
    expect(summary).toContain(`**${RULES.length} rules** from **${new Set(RULES.map(rule => rule.book)).size} rulebooks**`);
    const readme = readFileSync(README, "utf8");
    expect(readme.split("\n").findIndex(line => line.includes(`${DOCS_URL}RULES.md`))).toBeLessThan(20);
    expect(readme).not.toContain("<!-- auto:rules -->");
  });

  it("every link of README, CHANGELOG, TODO and docs/*.md resolves: a file of the repository, or a heading of the same file", () => {
    const { existsSync } = require("node:fs");
    const anchor = heading => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}\uFE0F _-]/gu, "").replaceAll(" ", "-");
    for ( const file of ["README.md", "CHANGELOG.md", "TODO.md", "docs/RULES.md", "docs/GM-CLIENT.md"] ) {
      const path = resolve(HERE, "..", file);
      const text = readFileSync(path, "utf8");
      const anchors = [...text.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) => anchor(heading));
      for ( const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g) ) {
        if ( target.startsWith("#") ) expect(anchors, `${file}: ${target}`).toContain(decodeURIComponent(target.slice(1)));
        else if ( target.startsWith(DOCS_URL) ) {
          expect(existsSync(resolve(HERE, "../docs", target.slice(DOCS_URL.length))), `${file}: ${target}`).toBe(true);
        }
        else if ( !/^https?:/.test(target) ) expect(existsSync(resolve(path, "..", target)), `${file}: ${target}`).toBe(true);
      }
    }
  });
});
