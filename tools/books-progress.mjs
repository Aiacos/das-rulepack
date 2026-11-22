#!/usr/bin/env node
/**
 * Progress by rulebook and the summary of the rules, written into README.md; the list of rules by book, into docs/RULES.md.
 *
 *   node tools/books-progress.mjs          rewrites the generated blocks of both files
 *   node tools/books-progress.mjs --check  changes nothing; exit code 1 when one of them is stale
 *
 * Sources:
 *  - scripts/rules/index.mjs      the pack's own rules, per book — the source of truth for what this pack covers;
 *  - docs/books.json              entries per official rulebook and what DAS · Core covers (counts only, with their method);
 *  - docs/foundry-modules.json    which books are published as an official Foundry VTT module.
 *
 * Plain Node, no dependency.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { RULES } from "../scripts/rules/index.mjs";
import { unaccountedOrigins } from "./pipeline/identifiers.mjs";
import { NOT_BOOKS, loadLegacy, loadQueue } from "./pipeline/registry.mjs";
import { HELD_REASONS, emissionOf } from "./pipeline/generate.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const read = file => JSON.parse(readFileSync(resolve(ROOT, file), "utf8"));

export const README = resolve(ROOT, "README.md");
export const RULES_DOC = resolve(ROOT, "docs/RULES.md");
/** docs/ is not in the release zip, and the README is: its links to docs/ are absolute. */
export const DOCS_URL = "https://github.com/Aiacos/das-rulepack/blob/master/docs/";
export const CATALOG = read("docs/books.json");
export const FOUNDRY = read("docs/foundry-modules.json");

/** Kind under which the catalogue counts a rule, or null when it has no such entry. */
const catalogKind = rule => (rule.catalog === undefined) ? rule.kind : rule.catalog;

/** Package id of the official Foundry module of a book, from docs/foundry-modules.json, or null. */
export function foundryPackage(code) {
  return FOUNDRY.packages.find(pkg => pkg.book === code)?.id ?? null;
}

/**
 * Monsters are measured differently from the other kinds (docs/books.json, `monsters`): a monster is one entry, covered when
 * every feature of its stat block is resolved by DAS · Core. None is covered by this pack.
 */
export const MONSTER = "monster";

/**
 * The figures of one book, monsters included.
 *  - total, core: from the catalogue (for monsters: how many there are, how many are resolved).
 *  - pack: rules of this pack for an entry of the catalogue that DAS · Core has no entry for.
 *  - refined: rules of this pack on an entry the catalogue already counts under DAS · Core (`inCore`).
 *  - uncounted: rules of this pack the catalogue has no entry for.
 *  - audit: the pack's count written in docs/books.json.
 *  - monsters, resolved: the monsters of the book and those fully resolved (both 0 when it has none).
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
    audit: kinds.reduce((n, kind) => n + (kind.rulepack ?? kind.pack ?? 0), 0),
    monsters: book.kinds[MONSTER]?.total ?? 0,
    resolved: book.kinds[MONSTER]?.core ?? 0
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
    if ( !pkg.book && (pkg.kind !== "adventure") ) out.push(`${pkg.id}: neither a book nor an adventure in docs/foundry-modules.json`);
  }
  return out;
}

const BAR = 10;

/** A text progress bar for done / total; `html` for a place where Markdown is not read (a `<summary>`). */
export function bar(done, total, { html=false, cells: width=BAR }={}) {
  if ( !total ) return "—";
  const share = Math.min(1, done / total);
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
  trait: "Species traits",
  option: "Options (invocations, metamagic, manoeuvres…)",
  item: "Items",
  monster: "Monsters (fully resolved)"
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
    if ( part.kind === MONSTER ) {
      const { features, featuresResolved } = book.kinds[MONSTER];
      out.push(`| ↳ their features | ${features} | ${featuresResolved} | — | ${bar(featuresResolved, features)} |`);
    }
  }
  out.push("", "</details>");
  return out;
}

const byYear = (a, b) => (a.year - b.year) || a.code.localeCompare(b.code);
const packCell = f => f.refined ? `${f.pack} (+${f.refined})` : String(f.pack);
const monstersCell = f => f.monsters ? `${f.resolved} / ${f.monsters}` : "—";
const sum = (rows, key) => rows.reduce((n, row) => n + row.f[key], 0);

/** One of the two tables: its books sorted by year, then its total. */
function table(books, { withPackage }) {
  const rows = books.slice().sort(byYear).map(book => ({ book, f: figures(book) }));
  const total = { total: sum(rows, "total"), core: sum(rows, "core"), pack: sum(rows, "pack"), refined: sum(rows, "refined"),
    monsters: sum(rows, "monsters"), resolved: sum(rows, "resolved") };
  const head = ["Code", "Title", "Year", "Group", ...(withPackage ? ["Foundry module"] : []), "Entries", "DAS · Core", "This pack", "Core + pack", "Monsters resolved"];
  const right = ["Entries", "DAS · Core", "This pack", "Monsters resolved"];
  const lines = [`| ${head.join(" | ")} |`, `|${head.map(h => right.includes(h) ? "---:" : "---").join("|")}|`];
  for ( const { book, f } of rows ) {
    lines.push(`| ${[book.code, book.name, book.year, book.group ?? "—", ...(withPackage ? [`\`${book.foundry}\``] : []),
      f.total, f.core, packCell(f), bar(f.core + f.pack, f.total), monstersCell(f)].join(" | ")} |`);
  }
  lines.push(`| ${["**Total**", `${rows.length} books`, "", "", ...(withPackage ? [""] : []),
    `**${total.total}**`, `**${total.core}**`, `**${packCell(total)}**`, bar(total.core + total.pack, total.total),
    `**${monstersCell(total)}**`].join(" | ")} |`);
  return { lines, total, count: rows.length };
}

/** The block between `<!-- auto:books -->` and `<!-- /auto:books -->`. */
export function renderBooks() {
  const published = CATALOG.books.filter(book => foundryPackage(book.code));
  const others = CATALOG.books.filter(book => !foundryPackage(book.code));
  const a = table(published, { withPackage: true });
  const b = table(others, { withPackage: false });
  const all = { total: a.total.total + b.total.total, core: a.total.core + b.total.core, pack: a.total.pack + b.total.pack,
    refined: a.total.refined + b.total.refined, monsters: a.total.monsters + b.total.monsters,
    resolved: a.total.resolved + b.total.resolved };
  const adventures = FOUNDRY.packages.filter(pkg => pkg.kind === "adventure");
  const outside = CATALOG.outsideCatalogue?.measured ?? [];
  const uncounted = CATALOG.books.flatMap(book => figures(book).uncounted);
  const out = [];
  out.push("### Overall", "");
  out.push("| | Books | Entries | DAS · Core | This pack | Core + pack | Monsters resolved |", "|---|---:|---:|---:|---:|---|---:|");
  out.push(`| **All rulebooks** | **${a.count + b.count}** | **${all.total}** | **${all.core}** | **${packCell(all)}** | ${bar(all.core + all.pack, all.total, { cells: 20 })} | **${monstersCell(all)}** |`);
  out.push(`| A. Official Foundry module | ${a.count} | ${a.total.total} | ${a.total.core} | ${packCell(a.total)} | ${bar(a.total.core + a.total.pack, a.total.total, { cells: 20 })} | ${monstersCell(a.total)} |`);
  out.push(`| B. Not on Foundry | ${b.count} | ${b.total.total} | ${b.total.core} | ${packCell(b.total)} | ${bar(b.total.core + b.total.pack, b.total.total, { cells: 20 })} | ${monstersCell(b.total)} |`, "");
  out.push("Entries are spells, class and subclass features, feats, species traits, options, items and monsters. A monster is one entry, counted "
    + "under DAS · Core when it is fully resolved (no feature of its stat block left open); the last column repeats that share, "
    + "which is already in the totals and the bars.", "");
  out.push("### A. Published as an official Foundry VTT module", "");
  out.push("DAS · Core itself automates the official modules it was written against (see the \"DAS · Core\" column), and it accepts "
    + "nothing outside the SRD in its public repositories, so the non-SRD rules of these books still belong in this pack.", "");
  out.push(...a.lines, "");
  if ( outside.length ) {
    out.push(`Not in the rulebook catalogue, measured from the module itself and counted like any other book: `
      + outside.map(extra => `${CATALOG.books.find(b => b.code === extra.code).name} (${extra.code}; version ${extra.version}, ${extra.source}, ${extra.measured})`).join("; ")
      + ".", "");
  }
  if ( adventures.length ) {
    out.push(`${adventures.map(pkg => `${pkg.title} (\`${pkg.id}\`)`).join(", ")}: these ${adventures.length} official packages are adventures, outside the scope of the tables. `
      + `The game system (\`${FOUNDRY.system.id}\`) carries the SRD in its own compendia.`, "");
  }
  out.push("### B. Not published on Foundry — rules still to implement", "");
  out.push("The content of these books reaches the table through importers, with no rules attached: this is where the pack matters most.", "");
  out.push(...b.lines, "");
  out.push("### Each rulebook, part by part", "");
  out.push("One block per rulebook, to open: its spells, class and subclass features, feats, species traits, options, items and monsters, each "
    + "with its own bar. A part the book has no entry for is left out. "
    + "Under the monsters, a second row counts their features one by one.", "");
  out.push("**A. Published as an official Foundry VTT module**", "");
  for ( const book of published.slice().sort(byYear) ) out.push(...details(book), "");
  out.push("**B. Not published on Foundry**", "");
  for ( const book of others.slice().sort(byYear) ) out.push(...details(book), "");
  const notes = [`Counts of ${CATALOG.computed}, monsters of ${CATALOG.monsters.computed} (docs/books.json); packages read on ${FOUNDRY.read} (docs/foundry-modules.json).`];
  if ( all.refined ) notes.push("\"(+n)\": rules of this pack on an entry already counted under DAS · Core (the pack completes the engine's entry, or serves another identifier of the same name); they are not added to the bar.");
  if ( uncounted.length ) notes.push(`Not counted, the catalogue having no such entry: ${uncounted.map(rule => `${rule.name} (${rule.book})`).join(", ")}.`);
  out.push(notes.join(" "));
  return out.join("\n");
}

/**
 * Ruling R5, for the rules written before it (legacy): the matched origins they neither name nor list as uncovered, by
 * "<book>|<identifier>", read from registry/. The generated rule does not carry them (its module stays as it was migrated).
 */
export function unaccountedByRule(dir = resolve(ROOT, "registry")) {
  const out = new Map();
  for ( const f of readdirSync(dir).filter(f => f.endsWith(".json") && !NOT_BOOKS.includes(f)) ) {
    for ( const r of JSON.parse(readFileSync(resolve(dir, f), "utf8")).records ?? [] ) {
      const gaps = unaccountedOrigins(r);
      if ( gaps.length ) out.set(`${r.book}|${r.identifier}`, gaps);
    }
  }
  return out;
}

/**
 * The rules played by hand (a person followed a manual scenario's checklist: `evidence.played.manual`), as "<book>|<identifier>",
 * read from registry/: shown as "Played by hand" and counted apart from the plays of the engine's runner.
 */
export function playedByHand(dir = resolve(ROOT, "registry")) {
  const out = new Set();
  for ( const f of readdirSync(dir).filter(f => f.endsWith(".json") && !NOT_BOOKS.includes(f)) ) {
    for ( const r of JSON.parse(readFileSync(resolve(dir, f), "utf8")).records ?? [] ) {
      if ( (r.state === "played") && (r.evidence?.played?.manual === true) ) out.add(`${r.book}|${r.identifier}`);
    }
  }
  return out;
}

/**
 * The rules whose review agreed only through Ruling R24's tolerances (`evidence.reviewed.tolerated`: optional detail, the
 * item's own damage), as "<book>|<identifier>", read from registry/ for records that stand reviewed or played: counted apart
 * from exact agreements.
 */
export function toleratedReviews(dir = resolve(ROOT, "registry")) {
  const out = new Set();
  for ( const f of readdirSync(dir).filter(f => f.endsWith(".json") && !NOT_BOOKS.includes(f)) ) {
    for ( const r of JSON.parse(readFileSync(resolve(dir, f), "utf8")).records ?? [] ) {
      if ( ["reviewed", "played"].includes(r.state) && r.evidence?.reviewed?.tolerated ) out.add(`${r.book}|${r.identifier}`);
    }
  }
  return out;
}

/**
 * Ruling R27: the rules registry/ holds for a person (drafted and gated, not registered with DAS · Core: generate.mjs
 * emissionOf), in registry order, as `{ book, name, kind, page, because }` (`because` a key of HELD_REASONS; `origin` when the
 * rule has one). The pack's modules do not carry them, so they are read here, with legacy.json and review-queue.json.
 */
export function heldRules(dir = resolve(ROOT, "registry")) {
  const legacy = loadLegacy(dir);
  const queue = new Map(loadQueue(dir, "review").map(e => [e.key, e]));
  const out = [];
  for ( const f of readdirSync(dir).filter(f => f.endsWith(".json") && !NOT_BOOKS.includes(f)).sort() ) {
    for ( const { state, ...r } of JSON.parse(readFileSync(resolve(dir, f), "utf8")).records ?? [] ) {
      const emission = emissionOf(r, { legacy, queue });
      if ( !emission || emission.emitted ) continue;
      out.push({ book: r.book, name: r.name, ...(r.rule.origin ? { origin: r.rule.origin } : {}), kind: r.kind, page: r.page,
        because: emission.because });
    }
  }
  return out;
}

/** The held rules of a book as rows of docs/RULES.md, after the table of the rules it ships; [] when it holds none. */
export function heldTable(rows) {
  if ( !rows.length ) return [];
  const out = ["Held for a person (Ruling R27): gated, not registered with DAS · Core until a person settles them.", "",
    "| Held rule | Kind | Page | Status |", "|---|---|---|---|"];
  for ( const row of rows ) {
    const name = row.origin ? `${row.name} (${row.origin})` : row.name;
    out.push(`| ${name} | ${kindLabel(row.kind)} | p.${row.page} | Held: ${HELD_REASONS[row.because]} |`);
  }
  return [...out, ""];
}

/** The held rules counted by reason, for the closing line: " 3 more held for a person (review disagrees 2, …)." or "". */
export function heldLine(rows) {
  if ( !rows.length ) return "";
  const counts = Object.keys(HELD_REASONS).map(k => [k, rows.filter(r => r.because === k).length]).filter(([, n]) => n);
  return ` ${rows.length} more held for a person, not shipped (${counts.map(([k, n]) => `${HELD_REASONS[k]} ${n}`).join(", ")}).`;
}

/**
 * Ruling R25: what a partial rule leaves to the table, for its row of docs/RULES.md (its `partial` counts by reason), or "".
 */
export function partialNote(rule) {
  const counts = Object.entries(rule.partial ?? {});
  if ( !counts.length ) return "";
  const total = counts.reduce((n, [, c]) => n + c, 0);
  const reasons = counts.map(([reason, n]) => `${reason} ${n}`).join(", ");
  return ` Partial: ${total} expectation${total === 1 ? "" : "s"} left to the table (${reasons}).`;
}

/**
 * The closing line of the rules block: the counts by status, plays by hand, reviews with R24 tolerances and partial rules
 * (Ruling R25) apart.
 */
export function countsLine(rules, { handPlayed = () => false, tolerated = new Set(), held = [] } = {}) {
  const count = status => rules.filter(rule => rule.status === status).length;
  const waiting = count("pending") ? `, ${count("pending")} pending` : "";
  const hand = rules.filter(handPlayed).length;
  const played = `${count("played")} played${hand ? ` (${hand} by hand)` : ""}`;
  const loose = rules.filter(rule => tolerated.has(`${rule.book}|${rule.identifier}`)).length;
  const tolerance = loose ? ` ${loose} of them reviewed with Ruling R24 tolerances (not an exact agreement).` : "";
  const partial = rules.filter(rule => partialNote(rule)).length;
  const partly = partial ? ` ${partial} of them partial (part of the entry left to the table).` : "";
  return `${rules.length} rules: ${played}, ${count("validated")} validated${waiting}.${tolerance}${partly}${heldLine(held)}`;
}

const STATUS = { played: "Played", validated: "Validated", pending: "Pending" };
/** The label of each kind of rule (scripts/rules/book.mjs KINDS) in docs/RULES.md. */
export const KIND_LABELS = Object.freeze({ spell: "Spell", feat: "Feat", option: "Option", feature: "Feature",
  species: "Species trait", background: "Background", item: "Item", monster: "Monster feature", sense: "Sense" });
/** The label of a kind; an unknown kind is refused (thrown), never printed as "undefined". */
export function kindLabel(kind) {
  if ( !Object.hasOwn(KIND_LABELS, kind) ) throw new Error(`no label for the kind ${JSON.stringify(kind)} (KIND_LABELS)`);
  return KIND_LABELS[kind];
}

/** The block between `<!-- auto:rules -->` and `<!-- /auto:rules -->`: the pack's rules, book by book. */
export function renderRules() {
  const held = heldRules();
  const books = CATALOG.books.filter(book => [...RULES, ...held].some(rule => rule.book === book.code))
    .sort((a, b) => (Number(!foundryPackage(a.code)) - Number(!foundryPackage(b.code))) || byYear(a, b));
  const out = [];
  const unaccounted = unaccountedByRule();
  const byHand = playedByHand();
  const handPlayed = rule => (rule.status === "played") && byHand.has(`${rule.book}|${rule.identifier}`);
  const statusOf = rule => (handPlayed(rule) ? "Played by hand" : STATUS[rule.status]);
  for ( const book of books ) {
    const pkg = foundryPackage(book.code);
    out.push(`### ${book.code} · ${book.name}${/\(\d{4}\)$/.test(book.name) ? "" : ` (${book.year})`}`, "");
    out.push(pkg ? `Published as an official Foundry VTT module (\`${pkg}\`).` : "Not published on Foundry.", "");
    const shipped = RULES.filter(r => r.book === book.code);
    const head = ["| Rule | Kind | Page | What the module adds | Handled in | Status |", "|---|---|---|---|---|---|"];
    if ( shipped.length ) out.push(...head);
    for ( const rule of shipped ) {
      const name = rule.origin ? `${rule.name} (${rule.origin})` : rule.name;
      const pages = [`p.${rule.page}`, ...(rule.alsoIn ?? []).map(other => `${other.book} p.${other.page}`)].join("; ");
      // Ruling R25: a partial rule says so where it is handled, and what it leaves to the table beside what it adds.
      const partial = partialNote(rule);
      const where = `${(rule.handledIn === "code") ? `code${rule.entry ? " + table" : ""}` : "table"}${partial ? ", partial" : ""}`;
      // Ruling R5: an origin whose item the rule does not reach is said, with why.
      const gaps = [...(rule.uncovered ?? []).map(u => ` Not covered on ${u.origin}: ${u.because}.`),
        ...(unaccounted.get(`${rule.book}|${rule.identifier}`) ?? []).map(o => ` Not checked on ${o} (the rule predates it).`)]
        .join("");
      const adds = `${rule.adds}${gaps}${partial}`;
      out.push(`| ${name} | ${kindLabel(rule.kind)} | ${pages} | ${adds} | ${where} | ${statusOf(rule)} |`);
    }
    if ( shipped.length ) out.push("");
    out.push(...heldTable(held.filter(row => row.book === book.code)));
  }
  out.push(countsLine(RULES, { handPlayed, tolerated: toleratedReviews(), held }));
  return out.join("\n");
}

/** The block between `<!-- auto:summary -->` and `<!-- /auto:summary -->` of the README: three lines, and the link. */
export function renderSummary() {
  const count = status => RULES.filter(rule => rule.status === status).length;
  const books = new Set(RULES.map(rule => rule.book)).size;
  return [
    `**${RULES.length} rules** from **${books} rulebooks**: ${count("played")} played in a running world, ${count("validated")} validated by the engine's`,
    `validator but not played${count("pending") ? `, ${count("pending")} pending (written for a key no released DAS · Core knows yet)` : ""}.`,
    `The full list, book by book — what each rule adds, where it is handled, how far it was checked: **[docs/RULES.md](${DOCS_URL}RULES.md)**.`
  ].join("\n");
}

/** Replaces what stands between the two markers of a block. */
function replaceBlock(text, name, body) {
  const open = `<!-- auto:${name} -->`, close = `<!-- /auto:${name} -->`;
  const start = text.indexOf(open), end = text.indexOf(close);
  if ( (start < 0) || (end < start) ) throw new Error(`markers ${open} … ${close} not found`);
  return `${text.slice(0, start + open.length)}\n${body}\n${text.slice(end)}`;
}

/** The generated files: each with the function that brings its blocks up to date. */
export const GENERATED = Object.freeze([
  { file: README, name: "README.md", refresh: text => replaceBlock(replaceBlock(text, "summary", renderSummary()), "books", renderBooks()) },
  { file: RULES_DOC, name: "docs/RULES.md", refresh: text => replaceBlock(text, "rules", renderRules()) }
]);

if ( process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href) ) {
  const check = process.argv.includes("--check");
  for ( const line of differences() ) console.log(`note: ${line}`);
  let stale = 0;
  for ( const { file, name, refresh } of GENERATED ) {
    const before = readFileSync(file, "utf8");
    const after = refresh(before);
    if ( after === before ) console.log(`${name} is up to date.`);
    else if ( check ) { stale++; console.error(`${name} is stale: run \`npm run books\`.`); }
    else { writeFileSync(file, after); console.log(`${name} updated.`); }
  }
  if ( stale ) process.exit(1);
}
