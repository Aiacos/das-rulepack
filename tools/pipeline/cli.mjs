// Command line of the rulebook pipeline: `npm run pipeline -- <subcommand> ...`. Later tasks add one function each to COMMANDS.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonical, loadBook, saveBook } from "./registry.mjs";
import { readSpells } from "./dataset.mjs";
import { dumpsFor, itemSummary, readDump } from "./dumps.mjs";
import { inventory } from "./inventory.mjs";
import { loadCore } from "./core.mjs";
import { runGates } from "./gates.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRY = process.env.RULEPACK_REGISTRY || join(ROOT, "registry");

class UsageError extends Error {}

const need = (name) => {
  if (!process.env[name]) throw new UsageError(`Environment variable ${name} is not set`);
  return process.env[name];
};

const NOT_BOOKS = ["legacy.json", "queue.json"];

function loadRegistry(dir) {
  if (!existsSync(dir)) return [];
  // legacy.json and queue.json sit beside the books and are not books.
  return readdirSync(dir).filter((f) => f.endsWith(".json") && !NOT_BOOKS.includes(f)).sort()
    .map((f) => ({ file: f, ...loadBook(dir, f.slice(0, -5)) }));
}

function loadDumps(dir) {
  const read = (origin) => dumpsFor(dir, origin).flatMap((f) => readDump(join(dir, f)).map((d) => itemSummary(d, origin)));
  return { official: read("official"), "ddb-importer": read("ddb-importer") };
}

function readBookSpells(datasetDir, book) {
  let spells;
  try {
    spells = readSpells(datasetDir, book);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    spells = [];
  }
  if (!spells.length) throw new UsageError(`The dataset has no spell entries for book ${book}`);
  return spells;
}

function inventoryCommand([book, kind]) {
  if (!book || !kind) throw new UsageError("Usage: inventory <BOOK> <kind>");
  if (kind !== "spell") throw new UsageError(`Kind "${kind}" is not supported yet: only "spell" is`);
  const datasetDir = need("RULEPACK_DATASET");
  const dumpsDir = need("RULEPACK_DUMPS");
  const textDir = need("RULEPACK_TEXT");

  for (const [name, dir] of [["RULEPACK_DATASET", datasetDir], ["RULEPACK_DUMPS", dumpsDir]]) {
    if (!existsSync(dir)) throw new UsageError(`${name} points at a folder that does not exist: ${dir}`);
  }
  const dataset = readBookSpells(datasetDir, book);

  const books = loadRegistry(REGISTRY);
  const previous = books.flatMap((b) => b.records);
  const { records, report } = inventory({ book, kind, dataset, dumps: loadDumps(dumpsDir), textDir, previous });

  const touched = new Set();
  const before = new Map(previous.map((r) => [r.key, canonical(r)]));
  for (const r of records) if (before.get(r.key) !== canonical(r)) touched.add(r.book);
  for (const code of touched) {
    saveBook(REGISTRY, { book: code, records: records.filter((r) => r.book === code) });
  }
  console.log(JSON.stringify(report, null, 2));
}

// The documents the data-fix gate reads: those of the dumps that a record's matched items point at, by origin and document id.
function loadDocuments(dumpsDir, records) {
  const wanted = { official: new Set(), "ddb-importer": new Set() };
  for (const r of records) {
    for (const i of r.items ?? []) if (i.match === "matched" && wanted[i.origin]) wanted[i.origin].add(i.docId);
  }
  const documents = {};
  for (const [origin, ids] of Object.entries(wanted)) {
    documents[origin] = {};
    if (!ids.size) continue;
    for (const file of dumpsFor(dumpsDir, origin)) {
      for (const doc of readDump(join(dumpsDir, file))) if (ids.has(doc._id)) documents[origin][doc._id] = doc;
    }
  }
  return documents;
}

// legacy.json: the keys of the records that may carry `legacy: true` (a JSON array; a missing file is an empty list).
function loadLegacyKeys(dir) {
  const file = join(dir, "legacy.json");
  if (!existsSync(file)) return new Set();
  let list;
  try { list = JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new UsageError(`${file}: ${e.message}`); }
  if (!Array.isArray(list) || !list.every((k) => typeof k === "string")) {
    throw new UsageError(`${file}: must be an array of record keys`);
  }
  return new Set(list);
}

function gatesCommand(args) {
  const ci = args.includes("--ci");
  const unknown = args.filter((a) => a !== "--ci");
  if (unknown.length) throw new UsageError(`Usage: gates [--ci] (unexpected: ${unknown.join(" ")})`);
  const books = loadRegistry(REGISTRY);
  const records = books.flatMap((b) => b.records);
  if (!records.length) return console.log("Nothing to check: the registry has no records.");

  const coreDir = need("DAS_CORE");
  const dumpsDir = ci ? null : need("RULEPACK_DUMPS");
  const textDir = ci ? null : need("RULEPACK_TEXT");
  return loadCore(coreDir).then((core) => {
    const documents = ci ? {} : loadDocuments(dumpsDir, records);
    const { failures, notes, updated } = runGates(records, { core, documents, textDir, ci, legacyKeys: loadLegacyKeys(REGISTRY) });
    if (!ci) {
      const before = new Map(records.map((r) => [r.key, canonical(r)]));
      const byBook = Map.groupBy(updated, (r) => r.book);
      for (const b of books) {
        const next = byBook.get(b.book) ?? [];
        const changed = next.some((r) => before.get(r.key) !== canonical(r));
        if (changed && !next.some((r) => failures[r.key]?.schema)) saveBook(REGISTRY, { book: b.book, records: next });
      }
    }
    const lines = (byKey) => Object.entries(byKey).flatMap(([key, gates]) => Object.values(gates).flat().map((m) => [key, m]));
    for (const [key, m] of lines(notes)) console.log(`note ${key}: ${m}`);
    for (const [key, m] of lines(failures)) console.error(`FAIL ${key}: ${m}`);
    const failed = Object.keys(failures).length;
    console.log(`${records.length} records, ${failed} failing${ci ? " (ci: schema, validator, unique, evidence)" : ""}.`);
    if (failed) process.exitCode = 1;
  });
}

export const COMMANDS = { inventory: inventoryCommand, gates: gatesCommand };

export async function main(argv) {
  const [name, ...args] = argv;
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : null;
  try {
    if (!command) throw new UsageError(`Usage: pipeline <${Object.keys(COMMANDS).join("|")}> ...`);
    await command(args);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(e.message);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
