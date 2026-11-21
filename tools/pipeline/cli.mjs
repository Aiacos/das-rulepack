// Command line of the rulebook pipeline: `npm run pipeline -- <subcommand> ...`. Later tasks add one function each to COMMANDS.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOK_CODE, canonical, groupBy, isReservedBook, loadBook, loadLegacy, saveBook } from "./registry.mjs";
import { readEntries } from "./dataset.mjs";
import { readMonsters } from "./monsters.mjs";
import {
  actorSummaries, docIndex, dumpsFor, findDocument, grantIndex, isActorDoc, isActorFile, itemSummary, officialFilesFor, readDump,
  reprintIndex
} from "./dumps.mjs";
import { inventory, INVENTORY_KINDS } from "./inventory.mjs";
import { poolOf } from "./settle.mjs";
import { excludeReprint, resolveItem, ResolveError, RESOLVABLE } from "./resolve.mjs";
import { loadCore } from "./core.mjs";
import { runGates } from "./gates.mjs";
import { generate } from "./generate.mjs";
import {
  autoTriage, clip, ingest, ingestSecond, ingestThird, isReaderHandle, setByRule, settleUnsure, triageContext, BY
} from "./triage.mjs";
import { cutBatches, DEFAULT_BATCH_SIZE, highestBatches } from "./batch.mjs";
import { structureOf } from "./structure.mjs";

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
// The actor packs hold creatures, not items: they feed only the monsters (`actors`), and only when those are read.
function loadDumps(dir, book, { actors = false, reprints = false } = {}) {
  // The class, subclass and race documents of a package say which feature documents they grant.
  // The grants are indexed across every file of the package: a feature of one file is granted by a class document of another.
  // The actors of DDB Importer are the npc documents of its (`ddb.`) dumps, whatever the pack is named: they are no items.
  const read = (origin, files) => {
    const docs = files.filter((f) => !isActorFile(f)).flatMap((f) => readDump(join(dir, f))).filter((d) => !isActorDoc(d));
    const grants = grantIndex(docs);
    return docs.map((d) => itemSummary(d, origin, grants));
  };
  const { packages } = JSON.parse(readFileSync(join(ROOT, "docs", "foundry-modules.json"), "utf8"));
  const official = officialFilesFor(dir, packages, book);
  const ddbActors = () => dumpsFor(dir, "ddb-importer")
    .flatMap((f) => actorSummaries(readDump(join(dir, f)).filter(isActorDoc), "ddb-importer"));
  return {
    official: read("official", official),
    "ddb-importer": read("ddb-importer", dumpsFor(dir, "ddb-importer")),
    ...(actors ? {
      actors: official.filter(isActorFile).flatMap((f) => actorSummaries(readDump(join(dir, f)), "official")),
      ddbActors: ddbActors(), ddbBooks: JSON.parse(readFileSync(join(ROOT, "docs", "ddb-books.json"), "utf8"))
    } : {}),
    // The other official packages: a document id they share with the book's package is a reprint.
    ...(reprints ? { reprints: reprintIndex(dir, dumpsFor(dir, "official").filter((f) => !official.includes(f))) } : {})
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
  // The monsters come with the list of their creatures, which the report counts.
  const bestiary = kinds.includes("monster") ? readMonsters(datasetDir, book, { year }) : null;
  const readKind = (k) => (k === "monster" ? bestiary.features : readEntries(datasetDir, book, k, { year }));
  const datasets = Object.fromEntries(kinds.map((k) => [k, readKind(k)]));
  if (kinds.every((k) => !datasets[k].length)) {
    throw new UsageError(`The dataset has no ${kind === "all" ? "" : `${kind} `}entries for book ${book}`);
  }

  const books = loadRegistry(REGISTRY);
  const previous = books.flatMap((b) => b.records);
  const dumps = loadDumps(dumpsDir, book, {
    actors: kinds.includes("monster"), reprints: kinds.some((k) => k !== "monster")
  });
  let records = previous;
  const reports = {};
  for (const k of kinds) {
    if (!datasets[k].length) { reports[k] = { entries: 0 }; continue; }
    const out = inventory({
      book, kind: k, dataset: datasets[k], creatures: k === "monster" ? bestiary.creatures : undefined, dumps, textDir,
      previous: records
    });
    records = out.records;
    reports[k] = out.report;
  }

  // Nothing is written when entries collide, unless the person accepted that.
  const collided = Object.values(reports).some((r) => r.collisions?.length);
  console.log(JSON.stringify(kind === "all" ? reports : reports[kind], null, 2));
  if (collided && !allowCollisions) {
    console.error("Entries with one key were found (see collisions); nothing was written: pass --allow-collisions to accept them");
    process.exitCode = 1;
    return;
  }
  const touched = new Set();
  const before = new Map(previous.map((r) => [r.key, canonical(r)]));
  for (const r of records) if (before.get(r.key) !== canonical(r)) touched.add(r.book);
  for (const code of touched) {
    const { note } = books.find((b) => b.book === code) ?? {};
    saveBook(REGISTRY, { book: code, note, records: records.filter((r) => r.book === code) });
  }
}

// The documents the data-fix gate reads: for each matched item of a record, by origin and document id, the dump document with
// that id whose data fingerprint is the item's `data.sha256` (the one inventory matched). No such document: it is absent.
// A monster feature's document is the item embedded in an actor, its id `<actor id>.<item id>`.
export function loadDocuments(dumpsDir, records) {
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
      const take = (id, doc) => {
        if (!ids.has(id) || documents[origin][id]) return;
        if (itemSummary(doc, origin).data === ids.get(id)) documents[origin][id] = doc;
      };
      for (const doc of readDump(join(dumpsDir, file))) {
        take(doc._id, doc);
        if (isActorDoc(doc) || isActorFile(file)) for (const item of doc.items ?? []) take(`${doc._id}.${item?._id}`, item);
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

// `triage <BOOK>` applies the rules to the records without a verdict; with `--redo-rule` it also re-evaluates the records whose
// verdict the rules set (never one set by ingest, never a record that has a rule), clearing what the rules no longer give.
async function triageCommand(args) {
  const redo = args.includes("--redo-rule");
  const [book, ...rest] = args.filter((a) => a !== "--redo-rule");
  if (!book || rest.length) throw new UsageError("Usage: triage <BOOK> [--redo-rule]");
  const coreDir = need("DAS_CORE");
  const textDir = need("RULEPACK_TEXT");
  const found = loadBookOrFail(book);
  const { identifiers } = await loadCore(coreDir);
  const context = { coreIdentifiers: identifiers, textDir, ...triageContext(loadRegistry(REGISTRY).flatMap((b) => b.records)) };
  const at = new Date().toISOString();
  const counts = {};
  let cleared = 0;
  const records = found.records.map((r) => {
    const open = !r.verdict || (redo && !r.rule && setByRule(r));
    if (!open) return r;
    const t = autoTriage({ ...r, verdict: null }, context);
    const { hint, textChangedAt, ...next } = r;
    if (t?.hint) next.hint = t.hint;
    if (t?.verdict) {
      counts[t.verdict] = (counts[t.verdict] ?? 0) + 1;
      // A verdict the rules give again, unchanged, keeps its date.
      if (r.verdict === t.verdict && r.why === t.why) return next;
      return { ...next, verdict: t.verdict, why: t.why, evidence: { ...r.evidence, triaged: { by: t.by, at } } };
    }
    if (!r.verdict) return { ...next, ...(textChangedAt === undefined ? {} : { textChangedAt }) };
    cleared += 1;
    const { why, ...unsettled } = next;
    const { triaged, ...evidence } = r.evidence ?? {};
    return { ...unsettled, verdict: null, evidence };
  });
  saveBook(REGISTRY, { book: found.book, note: found.note, records });
  for (const [verdict, n] of Object.entries(counts)) console.log(`${verdict}: ${n}`);
  if (redo) console.log(`cleared: ${cleared}`);
  console.log(`left: ${records.filter((r) => !r.verdict).length}`);
}

// The real path of `p`, also when it does not exist yet: each existing part is resolved (symlinks included) before the next
// one is applied, so a ".." goes up from where a symlink really leads; what does not exist yet is appended as written.
function realPathOf(p) {
  const absolute = isAbsolute(p) ? p : `${process.cwd()}${sep}${p}`;
  const parts = absolute.split(sep).filter((part) => part && part !== ".");
  let current = realpathSync(sep);
  let i = 0;
  for (; i < parts.length; i++) {
    if (parts[i] === "..") { current = dirname(current); continue; }
    const next = join(current, parts[i]);
    if (!existsSync(next)) break;
    current = realpathSync(next);
  }
  return resolve(current, ...parts.slice(i));
}
const isInside = (path, dir) => path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep);
const hasDotDot = (p) => String(p).split(/[\\/]/).includes("..");

// A folder argument must be a folder or not exist yet: an existing file is a usage error, never overwritten or written into.
function checkFolderArg(flag, dir) {
  if (existsSync(dir) && !statSync(dir).isDirectory()) throw new UsageError(`${flag} ${dir} is a file, not a folder`);
}

// The structure folder holds data derived from premium items: never inside the repository, the registry or the batch folder.
// A path with a ".." segment is refused outright, for the structure folder and the batch folder it is compared with.
function checkStructureDir(dir, out) {
  for (const [flag, path] of [["--structure", dir], ["--out", out]]) {
    if (hasDotDot(path)) throw new UsageError(`${flag} ${path} has a ".." segment: give the folder without one`);
  }
  const real = realPathOf(dir);
  for (const [what, guarded] of [["the repository", ROOT], ["the registry folder", REGISTRY], ["the batch folder", out]]) {
    if (isInside(real, realPathOf(guarded))) throw new UsageError(`--structure ${dir} is inside ${what}: choose a private folder`);
  }
  if (isInside(realPathOf(out), real)) throw new UsageError(`--structure ${dir} holds the batch folder: choose a private folder`);
}

// Per batch entry and matched origin, the structure of the item's document (null when the dumps do not hold it).
// A document is the one with the item's docId and, when the item records it, its data fingerprint: never another document
// that shares the id (a journal page, another printing). A monster feature's document is the item embedded in the actor
// (`<actor id>.<item id>`).
function structuresOf(batch, records, dumpsDir) {
  const byKey = new Map(records.map((r) => [r.key, r]));
  const indexes = new Map();
  const { packages } = JSON.parse(readFileSync(join(ROOT, "docs", "foundry-modules.json"), "utf8"));
  const docs = (book, origin, kind) => {
    const id = `${book}/${origin}/${kind === "monster"}`;
    if (!indexes.has(id)) {
      const files = origin === "official" ? officialFilesFor(dumpsDir, packages, book)
        : origin === "ddb-importer" ? dumpsFor(dumpsDir, "ddb-importer") : [];
      // The actors of DDB Importer sit in `ddb.` dumps that are not named after actors: docIndex finds them by their content.
      const wanted = (f) => origin === "ddb-importer" || isActorFile(f) === (kind === "monster");
      indexes.set(id, docIndex(dumpsDir, files.filter(wanted)));
    }
    return indexes.get(id);
  };
  const entries = {};
  for (const e of batch.entries) {
    const r = byKey.get(e.key);
    const perOrigin = {};
    for (const item of r.items.filter((i) => i.match === "matched")) {
      const doc = findDocument(docs(r.book, item.origin, r.kind), item.docId, item.data?.sha256);
      perOrigin[item.origin] = doc ? structureOf(doc) : null;
    }
    if (Object.keys(perOrigin).length) entries[e.key] = perOrigin;
  }
  return { batch: batch.id, entries };
}

// The keys registry/queue.json holds: results waiting for a person.
function queuedKeys(dir) {
  const file = join(dir, "queue.json");
  if (!existsSync(file)) return new Set();
  const queue = readJson(file, "queue");
  if (!Array.isArray(queue)) throw new UsageError(`${file}: must be an array`);
  return new Set(queue.map((q) => q?.key).filter((k) => typeof k === "string"));
}

// The entries of registry/queue.json, validated as far as the readers of it need.
function queueEntries(dir) {
  const file = join(dir, "queue.json");
  if (!existsSync(file)) return [];
  const queue = readJson(file, "queue");
  if (!Array.isArray(queue)) throw new UsageError(`${file}: must be an array`);
  return queue.filter((q) => q !== null && typeof q === "object" && typeof q.key === "string");
}

function batchCommand([stage, book, ...rest]) {
  const usage = "Usage: batch triage <BOOK> --out <dir> [--structure <private dir>] [--size <n>] [--kind <kind>] "
    + "[--without-items] [--queued]";
  if (stage !== "triage" || !book) throw new UsageError(usage);
  const opts = {};
  const withoutItems = rest.includes("--without-items");
  const second = rest.includes("--queued");
  rest = rest.filter((a) => a !== "--without-items" && a !== "--queued");
  for (let i = 0; i < rest.length; i += 2) {
    if (!["--out", "--size", "--structure", "--kind"].includes(rest[i]) || rest[i + 1] === undefined) throw new UsageError(usage);
    opts[rest[i].slice(2)] = rest[i + 1];
  }
  if (!opts.out) throw new UsageError(usage);
  const size = opts.size === undefined ? DEFAULT_BATCH_SIZE : Number(opts.size);
  if (!Number.isInteger(size) || size < 1) throw new UsageError("--size must be a positive integer");
  if (opts.kind !== undefined && !INVENTORY_KINDS.includes(opts.kind)) {
    throw new UsageError(`--kind "${clip(opts.kind)}" is unknown: ${INVENTORY_KINDS.join(", ")}`);
  }
  const found = loadBookOrFail(book);
  checkFolderArg("--out", opts.out);
  const dumpsDir = opts.structure === undefined ? null : need("RULEPACK_DUMPS");
  if (dumpsDir !== null) {
    checkFolderArg("--structure", opts.structure);
    checkStructureDir(opts.structure, opts.out);
    if (!existsSync(dumpsDir)) throw new UsageError(`RULEPACK_DUMPS points at a folder that does not exist: ${dumpsDir}`);
  }
  const series = second ? "second" : "triage";
  const after = existsSync(opts.out) ? highestBatches(readdirSync(opts.out), series) : {};
  // A second reading is cut from the queue entries that have no second reading yet; a normal batch leaves the whole queue out.
  const cutOptions = second
    ? { only: new Set(queueEntries(REGISTRY).filter((q) => !q.second).map((q) => q.key)), series }
    : { queued: queuedKeys(REGISTRY) };
  const batches = cutBatches(found.records, { size, kind: opts.kind, after, withoutItems, ...cutOptions });
  // Every structure is computed before anything is written: a dump that cannot be read leaves no batch behind.
  const structures = dumpsDir === null ? [] : batches.map((b) => structuresOf(b, found.records, dumpsDir));
  mkdirSync(opts.out, { recursive: true });
  if (dumpsDir !== null) mkdirSync(opts.structure, { recursive: true });
  batches.forEach((b, i) => {
    writeFileSync(join(opts.out, `${b.id}.json`), `${JSON.stringify(b, null, 2)}\n`);
    if (dumpsDir !== null) {
      writeFileSync(join(opts.structure, `${b.id}.structure.json`), `${JSON.stringify(structures[i], null, 2)}\n`);
    }
  });
  const withStructure = dumpsDir === null ? "" : `, structure files to ${opts.structure}`;
  console.log(`${batches.length} batches written to ${opts.out}${withStructure}`);
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
  const usage = "Usage: ingest <results-file> [--overwrite | --second | --third] | ingest --settle-unsure [--min <n>]";
  const modes = ["--third", "--second", "--overwrite", "--settle-unsure"].filter((m) => args.includes(m));
  if (modes.length > 1) throw new UsageError(`${modes.join(" and ")} cannot be used together`);
  const [mode] = modes;
  const rest = [];
  let min = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--min") { min = args[(i += 1)] ?? ""; continue; }
    if (!modes.includes(args[i])) rest.push(args[i]);
  }
  if (min !== null && mode !== "--settle-unsure") throw new UsageError("--min goes with --settle-unsure only");
  if (mode === "--settle-unsure") {
    const n = min === null ? 0.6 : (min.trim() === "" ? NaN : Number(min));
    if (rest.length || !(n >= 0.5 && n < 0.7)) {
      throw new UsageError(`${usage}\n--min must be a number from 0.5 up to (not including) 0.7`);
    }
    return settleUnsureCommand(n);
  }
  const [file, ...extraArgs] = rest;
  if (!file || extraArgs.length) throw new UsageError(usage);
  const overwrite = mode === "--overwrite";
  const second = mode === "--second";
  const third = mode === "--third";
  const textDir = need("RULEPACK_TEXT");
  const coreDir = need("DAS_CORE");
  const input = readJson(file, "results file");
  if (typeof input?.batch !== "string" || typeof input?.by !== "string" || !Array.isArray(input?.results)) {
    throw new UsageError(`${file}: must be { batch: string, by: string, results: [...] }`);
  }
  if ("overwrite" in input) throw new UsageError(`${file}: overwrite is not a results field: pass --overwrite to ingest`);
  const extra = Object.keys(input).filter((k) => !["batch", "by", "results"].includes(k));
  if (extra.length) throw new UsageError(`${file}: unknown field ${JSON.stringify(clip(extra[0]))}`);
  if (!isReaderHandle(input.by)) throw new UsageError(`${file}: by must match ${BY} and not be "rule"`);
  const { entryKeys } = await loadCore(coreDir);
  const books = loadRegistry(REGISTRY);
  if (second) return ingestSecondCommand(books, input, { textDir, entryKeys });
  if (third) return ingestThirdCommand(books, input, { textDir, entryKeys });
  const out = ingest(books.flatMap((b) => b.records), input.results, {
    textDir, by: input.by, overwrite, entryKeys, queue: queueEntries(REGISTRY)
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

// `ingest <results-file> --second`: the second reading of the queue. Agreements are applied and leave the queue;
// disagreements stay in it, with the second reading beside the first, for a person.
function ingestSecondCommand(books, input, { textDir, entryKeys }) {
  const queue = queueEntries(REGISTRY);
  const out = ingestSecond(books.flatMap((b) => b.records), input.results, { textDir, by: input.by, entryKeys, queue });
  const touched = new Set(out.records.filter((r) => out.agreed.includes(r.key)).map((r) => r.book));
  for (const b of books) {
    if (!touched.has(b.book)) continue;
    saveBook(REGISTRY, { book: b.book, note: b.note, records: out.records.filter((r) => r.book === b.book) });
  }
  const parked = [...out.disagreed, ...out.unsure];
  if (parked.length || out.agreed.length) mergeQueue(REGISTRY, parked, out.agreed);
  const counts = { agreed: out.agreed.length, disagreed: out.disagreed.length, unsure: out.unsure.length, rejected: out.rejected };
  console.log(JSON.stringify(counts, null, 2));
  if (out.rejected.length) process.exitCode = 1;
}

// Writes the books that hold `keys`, with the records of `all`.
function saveTouched(books, all, keys) {
  const touched = new Set(all.filter((r) => keys.includes(r.key)).map((r) => r.book));
  for (const b of books) {
    if (touched.has(b.book)) saveBook(REGISTRY, { book: b.book, note: b.note, records: all.filter((r) => r.book === b.book) });
  }
}

// `ingest <results-file> --third`: the third reading of the disagreements. Settled entries leave the queue; the others stay,
// with the third reading beside the first two, and are final for agents.
function ingestThirdCommand(books, input, { textDir, entryKeys }) {
  const out = ingestThird(books.flatMap((b) => b.records), input.results, {
    textDir, by: input.by, entryKeys, queue: queueEntries(REGISTRY)
  });
  saveTouched(books, out.records, out.settled);
  if (out.unsettled.length || out.settled.length) mergeQueue(REGISTRY, out.unsettled, out.settled);
  console.log(JSON.stringify({ settled: out.settled.length, unsettled: out.unsettled.length, rejected: out.rejected }, null, 2));
  if (out.rejected.length) process.exitCode = 1;
}

// `ingest --settle-unsure [--min <n>]`: the owner's bulk rule for the entries two readers were both unsure about.
function settleUnsureCommand(min) {
  const textDir = need("RULEPACK_TEXT");
  const books = loadRegistry(REGISTRY);
  const out = settleUnsure(books.flatMap((b) => b.records), { textDir, queue: queueEntries(REGISTRY), min });
  saveTouched(books, out.records, out.applied);
  if (out.applied.length) mergeQueue(REGISTRY, [], out.applied);
  console.log(JSON.stringify({ applied: out.applied.length, kept: out.kept.length }, null, 2));
  for (const p of out.problems) console.error(`${p.key}: ${p.reason}`);
  if (out.problems.length) process.exitCode = 1;
}

// `resolve <key> <origin> --doc <docId> | --absent | --exclude-reprint <package>  --because "<one line>" [--by <handle>] [--force]`
async function resolveCommand(args) {
  const usage = "Usage: resolve <key> <origin> (--doc <docId> | --absent | --exclude-reprint <package>) --because \"<one line>\" "
    + "[--by <handle>] [--force]";
  const flags = { force: false };
  const positional = [];
  const valued = ["--doc", "--because", "--by", "--exclude-reprint"];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--force" || a === "--absent") flags[a.slice(2)] = true;
    else if (valued.includes(a)) {
      if (args[i + 1] === undefined) throw new UsageError(usage);
      flags[a.slice(2)] = args[(i += 1)];
    } else if (a.startsWith("--")) throw new UsageError(usage);
    else positional.push(a);
  }
  const [key, origin, ...rest] = positional;
  const modes = [flags.doc !== undefined, flags.absent === true, flags["exclude-reprint"] !== undefined].filter(Boolean).length;
  if (!key || !origin || rest.length || modes !== 1) throw new UsageError(usage);
  if (!RESOLVABLE.includes(origin)) throw new UsageError(`Origin "${clip(origin)}" must be one of ${RESOLVABLE.join(", ")}`);

  const books = loadRegistry(REGISTRY);
  const found = books.find((b) => b.records.some((r) => r.key === key));
  if (!found) throw new UsageError(`The registry has no record ${JSON.stringify(clip(key))}`);
  const record = found.records.find((r) => r.key === key);
  const who = { because: flags.because, by: flags.by ?? "maintainer" };
  let next;
  try {
    if (flags["exclude-reprint"] !== undefined) {
      if (origin !== "official") throw new ResolveError("a reprint is excluded from the official item");
      next = excludeReprint(record, { package: flags["exclude-reprint"], ...who });
    } else if (flags.absent) {
      next = resolveItem(record, { origin, absent: true, at: new Date().toISOString(), force: flags.force, ...who });
    } else {
      const dumpsDir = need("RULEPACK_DUMPS");
      if (!existsSync(dumpsDir)) throw new UsageError(`RULEPACK_DUMPS points at a folder that does not exist: ${dumpsDir}`);
      const dumps = loadDumps(dumpsDir, record.book, {
        actors: record.kind === "monster", reprints: origin === "official" && record.kind !== "monster"
      });
      // A ddb-importer document is compared against the official one the record is matched to.
      const officialDocId = record.items.find((i) => i.origin === "official" && i.match === "matched")?.docId;
      const officials = record.kind === "monster" ? poolOf(dumps, "official", "monster", record.owner) : dumps.official;
      const reference = origin === "ddb-importer" ? officials.find((c) => c.docId === officialDocId) : undefined;
      next = resolveItem(record, {
        origin, docId: flags.doc, at: new Date().toISOString(), force: flags.force,
        pool: poolOf(dumps, origin, record.kind, record.owner), reprints: dumps.reprints, reference, ...who
      });
    }
  } catch (e) {
    if (e instanceof ResolveError) throw new UsageError(e.message);
    throw e;
  }
  saveBook(REGISTRY, { book: found.book, note: found.note, records: found.records.map((r) => (r.key === key ? next : r)) });
  const excluded = flags["exclude-reprint"] !== undefined;
  const what = flags.absent ? "absent" : excluded ? `reprint ${flags["exclude-reprint"]} excluded` : flags.doc;
  console.log(JSON.stringify({ key, origin, resolved: what }));
}

export const COMMANDS = {
  inventory: inventoryCommand, gates: gatesCommand, generate: generateCommand, triage: triageCommand, batch: batchCommand,
  ingest: ingestCommand, resolve: resolveCommand
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
