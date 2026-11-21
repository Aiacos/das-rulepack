// Command line of the rulebook pipeline: `npm run pipeline -- <subcommand> ...`. Later tasks add one function each to COMMANDS.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonical, isReservedBook, loadBook, saveBook } from "./registry.mjs";
import { readSpells } from "./dataset.mjs";
import { dumpsFor, itemSummary, readDump } from "./dumps.mjs";
import { inventory } from "./inventory.mjs";
import { loadCore } from "./core.mjs";
import { runGates } from "./gates.mjs";
import { generate } from "./generate.mjs";
import { autoTriage, ingest, BY } from "./triage.mjs";
import { cutBatches, DEFAULT_BATCH_SIZE } from "./batch.mjs";

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

// The year of a book in docs/books.json, or undefined when the catalogue does not list it.
function yearOf(code) {
  const { books } = JSON.parse(readFileSync(join(ROOT, "docs", "books.json"), "utf8"));
  return books.find((b) => b.code.toUpperCase() === code.toUpperCase())?.year;
}

function readBookSpells(datasetDir, book) {
  let spells;
  try {
    spells = readSpells(datasetDir, book, { year: yearOf(book) });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    spells = [];
  }
  if (!spells.length) throw new UsageError(`The dataset has no spell entries for book ${book}`);
  return spells;
}

function inventoryCommand([book, kind]) {
  if (!book || !kind) throw new UsageError("Usage: inventory <BOOK> <kind>");
  if (isReservedBook(book)) throw new UsageError(`"${book}" is reserved in the registry folder and cannot be a book code`);
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
    const { note } = books.find((b) => b.book === code) ?? {};
    saveBook(REGISTRY, { book: code, note, records: records.filter((r) => r.book === code) });
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
        if (changed && !next.some((r) => failures[r.key]?.schema)) saveBook(REGISTRY, { book: b.book, note: b.note, records: next });
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

function generateCommand(args) {
  const check = args.includes("--check");
  const unknown = args.filter((a) => a !== "--check");
  if (unknown.length) throw new UsageError(`Usage: generate [--check] (unexpected: ${unknown.join(" ")})`);
  const { written, differing } = generate({ registry: REGISTRY, out: join(ROOT, "scripts", "rules"), check });
  if (check) {
    for (const path of differing) console.error(`differs from the registry: scripts/rules/${path}`);
    if (differing.length) process.exitCode = 1;
    else console.log("Generated rule modules are up to date.");
  } else {
    console.log(written.length ? `Wrote ${written.map((p) => `scripts/rules/${p}`).join(", ")}.` : "Nothing to write.");
  }
}

function loadBookOrFail(code) {
  if (!code) throw new UsageError("A book code is required");
  const found = loadRegistry(REGISTRY).find((b) => b.book.toLowerCase() === code.toLowerCase());
  if (!found) throw new UsageError(`The registry has no book ${code}`);
  return found;
}

async function triageCommand([book, ...rest]) {
  if (!book || rest.length) throw new UsageError("Usage: triage <BOOK>");
  const coreDir = need("DAS_CORE");
  const textDir = need("RULEPACK_TEXT");
  const found = loadBookOrFail(book);
  const { identifiers } = await loadCore(coreDir);
  const at = new Date().toISOString();
  const counts = {};
  const records = found.records.map((r) => {
    const t = autoTriage(r, { coreIdentifiers: identifiers, textDir });
    if (!t) return r;
    counts[t.verdict] = (counts[t.verdict] ?? 0) + 1;
    return { ...r, verdict: t.verdict, why: t.why, evidence: { ...r.evidence, triaged: { by: t.by, at } } };
  });
  saveBook(REGISTRY, { book: found.book, note: found.note, records });
  for (const [verdict, n] of Object.entries(counts)) console.log(`${verdict}: ${n}`);
  console.log(`left: ${records.filter((r) => !r.verdict).length}`);
}

function batchCommand([stage, book, ...rest]) {
  const usage = "Usage: batch triage <BOOK> --out <dir> [--size <n>]";
  if (stage !== "triage" || !book) throw new UsageError(usage);
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!["--out", "--size"].includes(rest[i]) || rest[i + 1] === undefined) throw new UsageError(usage);
    opts[rest[i].slice(2)] = rest[i + 1];
  }
  if (!opts.out) throw new UsageError(usage);
  const size = opts.size === undefined ? DEFAULT_BATCH_SIZE : Number(opts.size);
  if (!Number.isInteger(size) || size < 1) throw new UsageError("--size must be a positive integer");
  const batches = cutBatches(loadBookOrFail(book).records, { size });
  mkdirSync(opts.out, { recursive: true });
  for (const b of batches) writeFileSync(join(opts.out, `${b.id}.json`), `${JSON.stringify(b, null, 2)}\n`);
  console.log(`${batches.length} batches written to ${opts.out}`);
}

function readJson(file, what) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new UsageError(`${what} ${file}: ${e.message}`); }
}

// registry/queue.json: results that wait for a person. Merged by key; a key that was applied now leaves the queue.
function mergeQueue(dir, queued, applied) {
  const file = join(dir, "queue.json");
  const current = existsSync(file) ? readJson(file, "queue") : [];
  if (!Array.isArray(current)) throw new UsageError(`${file}: must be an array`);
  const byKey = new Map(current.filter((q) => !applied.includes(q.key)).map((q) => [q.key, q]));
  for (const q of queued) byKey.set(q.key, q);
  const next = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (next.length || existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  }
}

function ingestCommand([file, ...rest]) {
  if (!file || rest.length) throw new UsageError("Usage: ingest <results-file>");
  const textDir = need("RULEPACK_TEXT");
  const input = readJson(file, "results file");
  if (typeof input?.batch !== "string" || typeof input?.by !== "string" || !Array.isArray(input?.results)) {
    throw new UsageError(`${file}: must be { batch: string, by: string, results: [...] }`);
  }
  const extra = Object.keys(input).filter((k) => !["batch", "by", "results", "overwrite"].includes(k));
  if (extra.length) throw new UsageError(`${file}: unknown field ${JSON.stringify(extra[0])}`);
  if ("overwrite" in input && typeof input.overwrite !== "boolean") throw new UsageError(`${file}: overwrite must be a boolean`);
  if (!BY.test(input.by)) throw new UsageError(`${file}: by must match ${BY}`);
  const books = loadRegistry(REGISTRY);
  const out = ingest(books.flatMap((b) => b.records), input.results, {
    textDir, by: input.by, overwrite: input.overwrite === true
  });
  const touched = new Set(out.records.filter((r) => out.applied.includes(r.key)).map((r) => r.book));
  for (const b of books) {
    if (!touched.has(b.book)) continue;
    saveBook(REGISTRY, { book: b.book, note: b.note, records: out.records.filter((r) => r.book === b.book) });
  }
  if (out.queued.length || out.applied.length) mergeQueue(REGISTRY, out.queued, out.applied);
  console.log(JSON.stringify({ applied: out.applied.length, queued: out.queued.length, rejected: out.rejected }, null, 2));
  if (out.rejected.length) process.exitCode = 1;
}

export const COMMANDS = {
  inventory: inventoryCommand, gates: gatesCommand, generate: generateCommand, triage: triageCommand, batch: batchCommand,
  ingest: ingestCommand
};

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
