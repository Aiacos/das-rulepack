// Registry records -> the Rule objects of the pack, and the generated scripts/rules/books/*.mjs and scripts/rules/index.mjs.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hasLegacyStanding, isPlayed, keyOf, legacyProblem, loadBook, loadLegacy, stateOf } from "./registry.mjs";
import { editionOf } from "./edition.mjs";
import { RULE_VERDICTS } from "./schema.mjs";

export const NOT_BOOKS = ["legacy.json", "queue.json"];
const GENERATED = /^\/\/ Generated (from registry\/|by npm run build:rules)/;

// A shipped rule as a registry record (legacy: it keeps its status until the gates and a review replace it).
export function recordFromRule(rule, order, note, year) {
  const own = { handledIn: rule.handledIn, adds: rule.adds };
  for (const f of ["entry", "code", "origin", "catalog", "inCore"]) if (f in rule) own[f] = structuredClone(rule[f]);
  const record = {
    key: keyOf({ book: rule.book, kind: rule.kind, name: rule.name }),
    identifier: rule.identifier,
    name: rule.name,
    kind: rule.kind,
    book: rule.book,
    page: rule.page,
    edition: editionOf(rule.book, { year }),
    text: null,
    items: [],
    verdict: rule.handledIn === "code" ? "code" : "entry",
    rule: { ...own, origins: ["ddb-importer"] },
    legacy: true,
    legacyStatus: rule.status,
    evidence: {}
  };
  if (rule.alsoIn) record.alsoIn = structuredClone(rule.alsoIn);
  if (order !== undefined) record.order = order;
  if (note) record.note = note;
  return record;
}

const STATUS_OF_STATE = { played: "played", reviewed: "validated", gated: "validated" };

/**
 * The Rule a record registers, or null: while the record has not reached `gated`, when its verdict is not entry or code, and
 * when it says `legacy: true` without legacy standing (`legacy`: legacy.json as a Map, see registry.mjs loadLegacy). A legacy
 * record keeps its old status, or "played" once a complete play is recorded.
 */
export function ruleFromRecord(record, { legacy } = {}) {
  if (!record.rule || !RULE_VERDICTS.includes(record.verdict)) return null;
  let status;
  if (record.legacy === true) {
    if (!hasLegacyStanding(record, legacy)) return null;
    status = isPlayed(record.evidence?.played) ? "played" : record.legacyStatus;
  } else status = STATUS_OF_STATE[stateOf(record)];
  if (!status) return null;
  const { rule } = record;
  if (record.page === null || record.page === undefined) {
    throw new Error(`${record.key}: the record has no page, so its rule cannot be emitted`);
  }
  const out = { identifier: record.identifier, name: record.name, book: record.book, page: record.page, kind: record.kind, status };
  out.handledIn = rule.handledIn;
  for (const f of ["origin"]) if (f in rule) out[f] = structuredClone(rule[f]);
  if (record.alsoIn) out.alsoIn = structuredClone(record.alsoIn);
  for (const f of ["catalog", "inCore"]) if (f in rule) out[f] = rule[f];
  out.adds = rule.adds;
  for (const f of ["code", "entry"]) if (f in rule) out[f] = structuredClone(rule[f]);
  return out;
}

/**
 * The `sources` of the records whose rule is emitted: `{ docId: identifier }`, what the pack registers beside its table so that
 * the engine knows an item by its document id. A record that registers no rule binds nothing.
 */
export function sourcesOf(records, { legacy } = {}) {
  const out = {};
  for (const record of records) {
    if (!record.sources || !ruleFromRecord(record, { legacy })) continue;
    for (const [docId, identifier] of Object.entries(record.sources)) {
      if (out[docId] !== undefined && out[docId] !== identifier) {
        throw new Error(`${record.key}: the document ${docId} is bound to ${identifier} and to ${out[docId]}`);
      }
      out[docId] = identifier;
    }
  }
  return out;
}

const byOrder = (a, b) => {
  const [x, y] = [a.order ?? Infinity, b.order ?? Infinity];
  if (x !== y) return x < y ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
};

const indent = (text, pad) => text.split("\n").map((l) => pad + l).join("\n");

// The text of scripts/rules/books/<code>.mjs, or null when no record of the book is emitted.
export function bookModuleSource(code, records, note, { legacy } = {}) {
  const blocks = [];
  for (const record of [...records].sort(byOrder)) {
    const rule = ruleFromRecord(record, { legacy });
    if (!rule) continue;
    const { book, ...rest } = rule;
    const note = record.note ? `${record.note.split("\n").map((l) => `  // ${l}`.trimEnd()).join("\n")}\n` : "";
    blocks.push(`${note}${indent(JSON.stringify(rest, null, 2), "  ")}`);
  }
  if (!blocks.length) return null;
  return [
    `// Generated from registry/${code.toLowerCase()}.json by npm run build:rules — do not edit.`,
    ...(note ? [`/**\n${note.split("\n").map((l) => ` * ${l}`.trimEnd()).join("\n")}\n */`] : []),
    'import { book } from "../book.mjs";',
    "",
    `export const BOOK = ${JSON.stringify(code)};`,
    "",
    `export const RULES = book(BOOK, [\n${blocks.join(",\n\n")}\n]);`,
    ""
  ].join("\n");
}

const sourcesLiteral = (sources) => {
  const keys = Object.keys(sources).sort();
  return keys.length ? `{\n${keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(sources[k])}`).join(",\n")}\n}` : "{}";
};

// Words that cannot name the import of a book module.
const RESERVED_WORDS = new Set(("await break case catch class const continue debugger default delete do else enum export extends "
  + "false finally for function if implements import in instanceof interface let new null package private protected public "
  + "return static super switch this throw true try typeof var void while with yield").split(" "));
const JS_NAME = /^[a-z_$][a-z0-9_$]*$/;

// The text of scripts/rules/index.mjs for the given lowercase book codes.
export function indexSource(codes, sources = {}) {
  for (const code of codes) {
    if (!JS_NAME.test(code) || RESERVED_WORDS.has(code)) {
      throw new Error(`book code ${JSON.stringify(code)}: its lower-case form must be a JavaScript identifier to be imported`);
    }
  }
  const names = codes.join(", ");
  return `// Generated by npm run build:rules from the books of registry/ — do not edit.
/**
 * Every rule of the pack, from the per-book modules in ./books/, and the table registered with DAS · Core.
 *
 * The rules live in registry/<book>.json; \`npm run build:rules\` writes the modules of ./books/ and this list.
 */
${codes.map((c) => `import * as ${c} from "./books/${c}.mjs";`).join("\n")}

/** The book modules, each \`{ BOOK, RULES }\`. */
export const BOOKS = Object.freeze([${names}]);

/** Every rule of the pack, with its book, page, kind and status. @type {readonly import("./book.mjs").Rule[]} */
export const RULES = Object.freeze(BOOKS.flatMap(module => module.RULES));

/** The entries of the rules of one kind, by identifier. */
function entriesOf(kind) {
  return Object.freeze(Object.fromEntries(RULES.filter(rule => rule.entry && (rule.kind === kind))
    .map(rule => [rule.identifier, rule.entry])));
}

/** Declarative rules for spells, by dnd5e identifier. */
export const SPELLS = entriesOf("spell");
/** Senses, declared with the engine's generic \`sense\` block. */
export const SENSES = entriesOf("sense");
/** Class features where an entry of DAS · Core is completed, key by key. */
export const FEATURES = entriesOf("feature");

/** The table registered with DAS · Core: every rule that has an entry, by identifier. */
export const TABLE = Object.freeze(Object.fromEntries(RULES.filter(rule => rule.entry).map(rule => [rule.identifier, rule.entry])));

/** Document id → identifier, for the items of the rules above whose own identifier is not theirs; passed as \`sources\`. */
export const SOURCES = Object.freeze(${sourcesLiteral(sources)});
`;
}

/**
 * Writes (or, with `check`, only compares) the generated files under `out`: books/<code>.mjs for every registry book that has an
 * emitted rule, and index.mjs. Generated files of books/ that no registry book accounts for are removed (reported when checking).
 * Throws, before writing anything, when a record says `legacy: true` without legacy standing (registry/legacy.json), or has a
 * rule under a verdict other than entry or code.
 * @returns {{ written: string[], differing: string[] }}  Paths relative to `out`.
 */
export function generate({ registry, out, check = false }) {
  const files = existsSync(registry)
    ? readdirSync(registry).filter((f) => f.endsWith(".json") && !NOT_BOOKS.includes(f)).sort() : [];
  const legacy = existsSync(registry) ? loadLegacy(registry) : new Map();
  const wanted = new Map();
  const refused = [];
  const sources = {};
  for (const f of files) {
    const code = f.slice(0, -5);
    const { book, note, records } = loadBook(registry, code);
    refused.push(...records.map((r) => legacyProblem(r, legacy)).filter(Boolean));
    // A rule under another verdict would silently drop out of the pack.
    for (const r of records) {
      if (r.rule && !RULE_VERDICTS.includes(r.verdict)) refused.push(`${r.key}: has a rule but the verdict ${r.verdict}`);
    }
    const source = bookModuleSource(book, records, note, { legacy });
    if (source) wanted.set(`books/${code}.mjs`, source);
    if (!refused.length) {
      for (const [docId, identifier] of Object.entries(sourcesOf(records, { legacy }))) {
        if (sources[docId] !== undefined && sources[docId] !== identifier) refused.push(`${docId}: bound to two identifiers`);
        sources[docId] = identifier;
      }
    }
  }
  if (refused.length) throw new Error(`Refusing to generate: ${refused.join("; ")}`);
  wanted.set("index.mjs", indexSource([...wanted.keys()].map((p) => p.slice(6, -4)), sources));

  const booksDir = join(out, "books");
  const stale = existsSync(booksDir)
    ? readdirSync(booksDir).filter((f) => f.endsWith(".mjs") && !wanted.has(`books/${f}`)
      && GENERATED.test(readFileSync(join(booksDir, f), "utf8"))).map((f) => `books/${f}`)
    : [];

  const differing = [];
  const written = [];
  for (const [path, source] of wanted) {
    const file = join(out, path);
    if (existsSync(file) && readFileSync(file, "utf8") === source) continue;
    differing.push(path);
    if (!check) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, source);
      written.push(path);
    }
  }
  for (const path of stale) {
    differing.push(path);
    if (!check) rmSync(join(out, path));
  }
  return { written, differing: check ? differing : [] };
}
