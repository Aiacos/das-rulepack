// Command line of the rulebook pipeline: `npm run pipeline -- <subcommand> ...`. Later tasks add one function each to COMMANDS.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOK_CODE, canonical, groupBy, isReservedBook, loadBook, loadLegacy, saveBook } from "./registry.mjs";
import { readEntries } from "./dataset.mjs";
import { dumpsFor, grantIndex, itemSummary, officialFilesFor, readDump } from "./dumps.mjs";
import { inventory, INVENTORY_KINDS } from "./inventory.mjs";
import { loadCore } from "./core.mjs";
import { runGates } from "./gates.mjs";
import { generate } from "./generate.mjs";
import { autoTriage, clip, ingest, BY } from "./triage.mjs";
import { cutBatches, DEFAULT_BATCH_SIZE } from "./batch.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRY = process.env.RULEPACK_REGISTRY || join(ROOT, "registry");
// Where `generate` writes the rule modules: scripts/rules/ of this repository unless RULEPACK_RULES says otherwise.
const RULES_OUT = process.env.RULEPACK_RULES || join(ROOT, "scripts", "rules");
const RULES_LABEL = process.env.RULEPACK_RULES || "scripts/rules";

class UsageError extends Error {}

const need = (name) => {
  if (!process.env[name]) throw new UsageError(`Environment variable ${name} is not set`);
  return process.env[name];
};

const NOT_BOOKS = ["legacy.json", "queue.json"];

// The <BOOK> argument of every subcommand, upper-cased once here: `xzz` and `XZZ` are the same book.
function bookArg(code) {
  if (isReservedBook(code)) throw new UsageError(`"${code}" is reserved in the registry folder and cannot be a book code`);
  const book = String(code).toUpperCase();
  if (!BOOK_CODE.test(book)) throw new UsageError(`Book code "${clip(code)}" must match ${BOOK_CODE} once upper-cased`);
  return book;
}

function loadRegistry(dir) {
  if (!existsSync(dir)) return [];
  // legacy.json and queue.json sit beside the books and are not books.
  return readdirSync(dir).filter((f) => f.endsWith(".json") && !NOT_BOOKS.includes(f)).sort()
    .map((f) => ({ file: f, ...loadBook(dir, f.slice(0, -5)) }));
}

// The official candidates of a book are the documents of the book's own package only (docs/foundry-modules.json).
function loadDumps(dir, book) {
  // The class, subclass and race documents of a package say which feature documents they grant.
  const read = (origin, files) => files.flatMap((f) => {
    const docs = readDump(join(dir, f));
    const grants = grantIndex(docs);
    return docs.map((d) => itemSummary(d, origin, grants));
  });
  const { packages } = JSON.parse(readFileSync(join(ROOT, "docs", "foundry-modules.json"), "utf8"));
  return {
    official: read("official", officialFilesFor(dir, packages, book)),
    "ddb-importer": read("ddb-importer", dumpsFor(dir, "ddb-importer"))
  };
}

// The year of a book in docs/books.json, or undefined when the catalogue does not list it.
function yearOf(code) {
  const { books } = JSON.parse(readFileSync(join(ROOT, "docs", "books.json"), "utf8"));
  return books.find((b) => b.code.toUpperCase() === code.toUpperCase())?.year;
}

// Every inventoriable kind of `kind` ("all" or one of them), in the order of INVENTORY_KINDS.
function kindsOf(kind) {
  if (kind === "all") return [...INVENTORY_KINDS];
  if (kind === "monster") throw new UsageError('Kind "monster" is not supported yet');
  if (!INVENTORY_KINDS.includes(kind)) {
    throw new UsageError(`Kind "${clip(kind)}" is unknown: ${INVENTORY_KINDS.join(", ")} or all`);
  }
  return [kind];
}

function inventoryCommand(args) {
  const allowCollisions = args.includes("--allow-collisions");
  const [code, kind, ...rest] = args.filter((a) => a !== "--allow-collisions");
  if (!code || !kind || rest.length) throw new UsageError("Usage: inventory <BOOK> <kind|all> [--allow-collisions]");
  const book = bookArg(code);
  const kinds = kindsOf(kind);
  const datasetDir = need("RULEPACK_DATASET");
  const dumpsDir = need("RULEPACK_DUMPS");
  const textDir = need("RULEPACK_TEXT");

  for (const [name, dir] of [["RULEPACK_DATASET", datasetDir], ["RULEPACK_DUMPS", dumpsDir]]) {
    if (!existsSync(dir)) throw new UsageError(`${name} points at a folder that does not exist: ${dir}`);
  }
  const year = yearOf(book);
  const datasets = Object.fromEntries(kinds.map((k) => [k, readEntries(datasetDir, book, k, { year })]));
  if (kinds.every((k) => !datasets[k].length)) {
    throw new UsageError(`The dataset has no ${kind === "all" ? "" : `${kind} `}entries for book ${book}`);
  }

  const books = loadRegistry(REGISTRY);
  const previous = books.flatMap((b) => b.records);
  const dumps = loadDumps(dumpsDir, book);
  let records = previous;
  const reports = {};
  for (const k of kinds) {
    if (!datasets[k].length) { reports[k] = { entries: 0 }; continue; }
    const out = inventory({ book, kind: k, dataset: datasets[k], dumps, textDir, previous: records });
    records = out.records;
    reports[k] = out.report;
  }

  const touched = new Set();
  const before = new Map(previous.map((r) => [r.key, canonical(r)]));
  for (const r of records) if (before.get(r.key) !== canonical(r)) touched.add(r.book);
  for (const code of touched) {
    const { note } = books.find((b) => b.book === code) ?? {};
    saveBook(REGISTRY, { book: code, note, records: records.filter((r) => r.book === code) });
  }
  console.log(JSON.stringify(kind === "all" ? reports : reports[kind], null, 2));
  const collided = Object.values(reports).some((r) => r.collisions?.length);
  if (collided && !allowCollisions) {
    console.error("Entries with one key were found (see collisions); pass --allow-collisions to accept them");
    process.exitCode = 1;
  }
}

// The documents the data-fix gate reads: for each matched item of a record, by origin and document id, the dump document with
// that id whose data fingerprint is the item's `data.sha256` (the one inventory matched). No such document: it is absent.
function loadDocuments(dumpsDir, records) {
  const wanted = { official: new Map(), "ddb-importer": new Map() };
  for (const r of records) {
    for (const i of r.items ?? []) {
      const data = i.data?.sha256;
      if (i.match === "matched" && wanted[i.origin] && typeof data === "string") wanted[i.origin].set(i.docId, data);
    }
  }
  const documents = {};
  for (const [origin, ids] of Object.entries(wanted)) {
    documents[origin] = {};
    if (!ids.size) continue;
    for (const file of dumpsFor(dumpsDir, origin)) {
      for (const doc of readDump(join(dumpsDir, file))) {
        if (!ids.has(doc._id) || documents[origin][doc._id]) continue;
        if (itemSummary(doc, origin).data === ids.get(doc._id)) documents[origin][doc._id] = doc;
      }
    }
  }
  return documents;
}

function legacyOf(dir) {
  try { return loadLegacy(dir); } catch (e) { throw new UsageError(e.message); }
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
    const { failures, notes, updated } = runGates(records, { core, documents, textDir, ci, legacy: legacyOf(REGISTRY) });
    if (!ci) {
      const before = new Map(records.map((r) => [r.key, canonical(r)]));
      const byBook = groupBy(updated, (r) => r.book);
      for (const b of books) {
        const next = byBook.get(b.book) ?? [];
        const changed = next.some((r) => before.get(r.key) !== canonical(r));
        if (changed && !next.some((r) => failures[r.key]?.schema)) {
          saveBook(REGISTRY, { book: b.book, note: b.note, records: next });
        }
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
  let result;
  try {
    result = generate({ registry: REGISTRY, out: RULES_OUT, check });
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }
  const { written, differing } = result;
  if (check) {
    for (const path of differing) console.error(`differs from the registry: ${RULES_LABEL}/${path}`);
    if (differing.length) process.exitCode = 1;
    else console.log("Generated rule modules are up to date.");
  } else {
    console.log(written.length ? `Wrote ${written.map((p) => `${RULES_LABEL}/${p}`).join(", ")}.` : "Nothing to write.");
  }
}

function loadBookOrFail(code) {
  if (!code) throw new UsageError("A book code is required");
  const book = bookArg(code);
  const found = loadRegistry(REGISTRY).find((b) => b.book === book);
  if (!found) throw new UsageError(`The registry has no book ${book}`);
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

// `--overwrite` is the person's decision, given on the command line: a results file cannot carry it.
async function ingestCommand(args) {
  const usage = "Usage: ingest <results-file> [--overwrite]";
  const overwrite = args.includes("--overwrite");
  const [file, ...rest] = args.filter((a) => a !== "--overwrite");
  if (!file || rest.length) throw new UsageError(usage);
  const textDir = need("RULEPACK_TEXT");
  const coreDir = need("DAS_CORE");
  const input = readJson(file, "results file");
  if (typeof input?.batch !== "string" || typeof input?.by !== "string" || !Array.isArray(input?.results)) {
    throw new UsageError(`${file}: must be { batch: string, by: string, results: [...] }`);
  }
  if ("overwrite" in input) throw new UsageError(`${file}: overwrite is not a results field: pass --overwrite to ingest`);
  const extra = Object.keys(input).filter((k) => !["batch", "by", "results"].includes(k));
  if (extra.length) throw new UsageError(`${file}: unknown field ${JSON.stringify(clip(extra[0]))}`);
  if (!BY.test(input.by)) throw new UsageError(`${file}: by must match ${BY}`);
  const { entryKeys } = await loadCore(coreDir);
  const books = loadRegistry(REGISTRY);
  const out = ingest(books.flatMap((b) => b.records), input.results, { textDir, by: input.by, overwrite, entryKeys });
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
