#!/usr/bin/env node
/**
 * Progress by rulebook, and the list of rules by book, written into README.md.
 *
 *   node tools/books-progress.mjs          rewrites the two generated blocks of README.md
 *   node tools/books-progress.mjs --check  changes nothing; exit code 1 when README.md is stale
 *
 * Sources:
 *  - scripts/rules/index.mjs      the pack's own rules, per book — the source of truth for what this pack covers;
 *  - docs/books.json              entries per official rulebook and what DAS · Core covers (counts only, with their method);
 *  - docs/foundry-modules.json    which books are published as an official Foundry VTT module.
 *
 * Plain Node, no dependency.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { RULES } from "../scripts/rules/index.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const read = file => JSON.parse(readFileSync(resolve(ROOT, file), "utf8"));

export const README = resolve(ROOT, "README.md");
export const CATALOG = read("docs/books.json");
export const FOUNDRY = read("docs/foundry-modules.json");

/** Kind under which the catalogue counts a rule, or null when it has no such entry. */
const catalogKind = rule => (rule.catalog === undefined) ? rule.kind : rule.catalog;

/** Package id of the official Foundry module of a book, from docs/foundry-modules.json, or null. */
export function foundryPackage(code) {
  return FOUNDRY.packages.find(pkg => pkg.book === code)?.id ?? null;
}

/**
 * The figures of one book.
 *  - total, core: from the catalogue.
 *  - pack: rules of this pack for an entry of the catalogue that DAS · Core has no entry for.
 *  - refined: rules of this pack on an entry the catalogue already counts under DAS · Core (`inCore`).
 *  - uncounted: rules of this pack the catalogue has no entry for.
 *  - audit: the `rulepack` count written in docs/books.json.
 */
export function figures(book) {
  const kinds = Object.values(book.kinds);
  const rules = RULES.filter(rule => rule.book === book.code);
  const counted = rules.filter(rule => catalogKind(rule) !== null);
  return {
    total: kinds.reduce((n, kind) => n + kind.total, 0),
    core: kinds.reduce((n, kind) => n + kind.core, 0),
    pack: counted.filter(rule => !rule.inCore).length,
    refined: counted.filter(rule => rule.inCore).length,
    uncounted: rules.filter(rule => catalogKind(rule) === null),
    audit: kinds.reduce((n, kind) => n + kind.rulepack, 0)
  };
}

/** What does not add up between the pack's rules and the catalogue: one line of text each. */
export function differences() {
  const out = [];
  const codes = new Set(CATALOG.books.map(book => book.code));
  for ( const rule of RULES ) {
    if ( !codes.has(rule.book) ) { out.push(`${rule.identifier}: book ${rule.book} is not in docs/books.json`); continue; }
    const kind = catalogKind(rule);
    const book = CATALOG.books.find(b => b.code === rule.book);
    if ( (kind !== null) && !book.kinds[kind] ) out.push(`${rule.identifier}: docs/books.json counts no "${kind}" in ${rule.book}`);
  }
  for ( const book of CATALOG.books ) {
    const f = figures(book);
    if ( f.pack !== f.audit ) out.push(`${book.code}: this pack has ${f.pack} rule(s), docs/books.json says ${f.audit} (the pack's own rules win)`);
    if ( book.foundry !== foundryPackage(book.code) ) out.push(`${book.code}: "foundry" in docs/books.json is ${book.foundry}, docs/foundry-modules.json says ${foundryPackage(book.code)}`);
  }
  for ( const pkg of FOUNDRY.packages ) {
    if ( pkg.book && !codes.has(pkg.book) ) out.push(`${pkg.id}: book ${pkg.book} is not in docs/books.json`);
  }
  return out;
}

const BAR = 10;

/** A text progress bar for done / total; `html` for a place where Markdown is not read (a `<summary>`). */
export function bar(done, total, { html=false, cells: width=BAR }={}) {
  const share = total ? Math.min(1, done / total) : 0;
  const cells = Math.round(share * width);
  const percent = Math.round(share * 100);
  const label = (done > 0 && percent === 0) ? (html ? "&lt;1%" : "<1%") : `${percent}%`;
  const drawn = `${"█".repeat(cells)}${"░".repeat(width - cells)}`;
  return html ? `<code>${drawn}</code> ${label}` : `\`${drawn}\` ${label}`;
}

/** The parts of a book, in the order they are shown, with the name of each. */
export const PARTS = Object.freeze({
  spell: "Spells",
  feature: "Class and subclass features",
  feat: "Feats",
  option: "Options (invocations, metamagic, manoeuvres…)",
  item: "Items",
  monster: "Monsters"
});

/** The figures of one book, part by part: only the parts the book has entries for. */
export function parts(book) {
  const rules = RULES.filter(rule => rule.book === book.code);
  return Object.keys(PARTS).filter(kind => book.kinds[kind]?.total > 0).map(kind => {
    const mine = rules.filter(rule => catalogKind(rule) === kind);
    return { kind, label: PARTS[kind], total: book.kinds[kind].total, core: book.kinds[kind].core,
      pack: mine.filter(rule => !rule.inCore).length, refined: mine.filter(rule => rule.inCore).length };
  });
}

/** The `<details>` of one book: its overall bar, then one row per part. */
function details(book) {
  const f = figures(book);
  const out = [`<details>`, `<summary><b>${book.code}</b> · ${book.name} — ${bar(f.core + f.pack, f.total, { html: true })}</summary>`, "",
    "| Part | Entries | DAS · Core | This pack | Core + pack |", "|---|---:|---:|---:|---|"];
  for ( const part of parts(book) ) {
    out.push(`| ${part.label} | ${part.total} | ${part.core} | ${packCell(part)} | ${bar(part.core + part.pack, part.total)} |`);
  }
  out.push("", "</details>");
  return out;
}

const byYear = (a, b) => (a.year - b.year) || a.code.localeCompare(b.code);
const packCell = f => f.refined ? `${f.pack} (+${f.refined})` : String(f.pack);
const sum = (rows, key) => rows.reduce((n, row) => n + row.f[key], 0);

/** One of the two tables: its books sorted by year, then its total. */
function table(books, { withPackage }) {
  const rows = books.slice().sort(byYear).map(book => ({ book, f: figures(book) }));
  const total = { total: sum(rows, "total"), core: sum(rows, "core"), pack: sum(rows, "pack"), refined: sum(rows, "refined") };
  const head = ["Code", "Title", "Year", "Group", ...(withPackage ? ["Foundry module"] : []), "Entries", "DAS · Core", "This pack", "Core + pack"];
  const lines = [`| ${head.join(" | ")} |`, `|${head.map((h, i) => (i >= head.length - 4 && i < head.length - 1) ? "---:" : "---").join("|")}|`];
  for ( const { book, f } of rows ) {
    lines.push(`| ${[book.code, book.name, book.year, book.group, ...(withPackage ? [`\`${book.foundry}\``] : []),
      f.total, f.core, packCell(f), bar(f.core + f.pack, f.total)].join(" | ")} |`);
  }
  lines.push(`| ${["**Total**", `${rows.length} books`, "", "", ...(withPackage ? [""] : []),
    `**${total.total}**`, `**${total.core}**`, `**${packCell(total)}**`, bar(total.core + total.pack, total.total)].join(" | ")} |`);
  return { lines, total, count: rows.length };
}

/** The block between `<!-- auto:books -->` and `<!-- /auto:books -->`. */
export function renderBooks() {
  const published = CATALOG.books.filter(book => foundryPackage(book.code));
  const others = CATALOG.books.filter(book => !foundryPackage(book.code));
  const a = table(published, { withPackage: true });
  const b = table(others, { withPackage: false });
  const all = { total: a.total.total + b.total.total, core: a.total.core + b.total.core, pack: a.total.pack + b.total.pack,
    refined: a.total.refined + b.total.refined };
  const unmapped = FOUNDRY.packages.filter(pkg => !pkg.book);
  const uncounted = CATALOG.books.flatMap(book => figures(book).uncounted);
  const out = [];
  out.push("### Overall", "");
  out.push("| | Books | Entries | DAS · Core | This pack | Core + pack |", "|---|---:|---:|---:|---:|---|");
  out.push(`| **All rulebooks** | **${a.count + b.count}** | **${all.total}** | **${all.core}** | **${packCell(all)}** | ${bar(all.core + all.pack, all.total, { cells: 20 })} |`);
  out.push(`| A. Official Foundry module | ${a.count} | ${a.total.total} | ${a.total.core} | ${packCell(a.total)} | ${bar(a.total.core + a.total.pack, a.total.total, { cells: 20 })} |`);
  out.push(`| B. Not on Foundry | ${b.count} | ${b.total.total} | ${b.total.core} | ${packCell(b.total)} | ${bar(b.total.core + b.total.pack, b.total.total, { cells: 20 })} |`, "");
  out.push("### A. Published as an official Foundry VTT module", "");
  out.push("DAS · Core itself automates the official modules it was written against (see the \"DAS · Core\" column), and it accepts "
    + "nothing outside the SRD in its public repositories, so the non-SRD rules of these books still belong in this pack.", "");
  out.push(...a.lines, "");
  if ( unmapped.length ) {
    out.push(`Official packages with no book in this catalogue (not counted): ${unmapped.map(pkg => `${pkg.title} (\`${pkg.id}\`)`).join(", ")}. `
      + `The game system (\`${FOUNDRY.system.id}\`) carries the SRD in its own compendia.`, "");
  }
  out.push("### B. Not published on Foundry — rules still to implement", "");
  out.push("The content of these books reaches the table through importers, with no rules attached: this is where the pack matters most.", "");
  out.push(...b.lines, "");
  out.push("### Each rulebook, part by part", "");
  out.push("One block per rulebook, to open: its spells, class and subclass features, feats, options, items and monsters, each "
    + "with its own bar. A part the book has no entry for is left out. "
    + "Monsters are counted like the rest, one entry per creature looked up by the creature's own name: the count says "
    + "nothing of a creature's traits and actions, which is where an engine entry for a creature would sit.", "");
  out.push("**A. Published as an official Foundry VTT module**", "");
  for ( const book of published.slice().sort(byYear) ) out.push(...details(book), "");
  out.push("**B. Not published on Foundry**", "");
  for ( const book of others.slice().sort(byYear) ) out.push(...details(book), "");
  const notes = [`Counts of ${CATALOG.computed} (docs/books.json); packages read on ${FOUNDRY.read} (docs/foundry-modules.json).`];
  if ( all.refined ) notes.push("\"(+n)\": rules of this pack on an entry already counted under DAS · Core (the pack completes the engine's entry, or serves another identifier of the same name); they are not added to the bar.");
  if ( uncounted.length ) notes.push(`Not counted, the catalogue having no such entry: ${uncounted.map(rule => `${rule.name} (${rule.book})`).join(", ")}.`);
  out.push(notes.join(" "));
  return out.join("\n");
}

const STATUS = { played: "Played", validated: "Validated", pending: "Pending" };
const KIND = { spell: "Spell", feature: "Feature", sense: "Sense" };

/** The block between `<!-- auto:rules -->` and `<!-- /auto:rules -->`: the pack's rules, book by book. */
export function renderRules() {
  const books = CATALOG.books.filter(book => RULES.some(rule => rule.book === book.code))
    .sort((a, b) => (Number(!foundryPackage(a.code)) - Number(!foundryPackage(b.code))) || byYear(a, b));
  const out = [];
  for ( const book of books ) {
    const pkg = foundryPackage(book.code);
    out.push(`### ${book.code} · ${book.name}${/\(\d{4}\)$/.test(book.name) ? "" : ` (${book.year})`}`, "");
    out.push(pkg ? `Published as an official Foundry VTT module (\`${pkg}\`).` : "Not published on Foundry.", "");
    out.push("| Rule | Kind | Page | What the module adds | Handled in | Status |", "|---|---|---|---|---|---|");
    for ( const rule of RULES.filter(r => r.book === book.code) ) {
      const name = rule.origin ? `${rule.name} (${rule.origin})` : rule.name;
      const pages = [`p.${rule.page}`, ...(rule.alsoIn ?? []).map(other => `${other.book} p.${other.page}`)].join("; ");
      const where = (rule.handledIn === "code") ? `code${rule.entry ? " + table" : ""}` : "table";
      out.push(`| ${name} | ${KIND[rule.kind]} | ${pages} | ${rule.adds} | ${where} | ${STATUS[rule.status]} |`);
    }
    out.push("");
  }
  const count = status => RULES.filter(rule => rule.status === status).length;
  out.push(`${RULES.length} rules: ${count("played")} played, ${count("validated")} validated, ${count("pending")} pending.`);
  return out.join("\n");
}

/** Replaces what stands between the two markers of a block. */
function replaceBlock(text, name, body) {
  const open = `<!-- auto:${name} -->`, close = `<!-- /auto:${name} -->`;
  const start = text.indexOf(open), end = text.indexOf(close);
  if ( (start < 0) || (end < start) ) throw new Error(`README.md: markers ${open} … ${close} not found`);
  return `${text.slice(0, start + open.length)}\n${body}\n${text.slice(end)}`;
}

/** The README with its generated blocks brought up to date. */
export function refresh(text) {
  return replaceBlock(replaceBlock(text, "books", renderBooks()), "rules", renderRules());
}

if ( process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href) ) {
  const before = readFileSync(README, "utf8");
  const after = refresh(before);
  for ( const line of differences() ) console.log(`note: ${line}`);
  if ( process.argv.includes("--check") ) {
    if ( after !== before ) { console.error("README.md is stale: run `npm run books`."); process.exit(1); }
    console.log("README.md is up to date.");
  } else if ( after !== before ) {
    writeFileSync(README, after);
    console.log("README.md updated.");
  } else console.log("README.md already up to date.");
}
