// Command line of the rulebook pipeline: `npm run pipeline -- <subcommand> ...`. Later tasks add one function each to COMMANDS.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOOK_CODE, NOT_BOOKS, QUEUE_FILES, bookFile, bookText, canonical, groupBy, isReservedBook, loadBook, loadLegacy, loadQueue,
  queuePath, queueText, ruleFingerprint, saveBook, stateOf, validateTriageQueueEntry, writeFilesAtomically
} from "./registry.mjs";
import { readEntries } from "./dataset.mjs";
import { readMonsters } from "./monsters.mjs";
import {
  actorSummaries, docIndex, dumpsFor, findDocument, grantIndex, isActorDoc, isActorFile, itemSummary, officialFilesFor, readDump,
  reprintIndex
} from "./dumps.mjs";
import { inventory, INVENTORY_KINDS } from "./inventory.mjs";
import { embeddedIndex, poolOf } from "./settle.mjs";
import { excludeReprint, resolveItem, ResolveError, RESOLVABLE } from "./resolve.mjs";
import { loadCore } from "./core.mjs";
import { engineIdentifiers, quotationCheck, ruleProse, runGates } from "./gates.mjs";
import { generate } from "./generate.mjs";
import {
  autoTriage, choiceOptions, clip, corePrepass, ingest, ingestSecond, ingestThird, isReaderHandle, restorePrepass, setByRule,
  settleUnsure, triageContext, BY
} from "./triage.mjs";
import {
  cutBatches, cutDraftBatches, cutReviewBatches, DEFAULT_BATCH_SIZE, DRAFT_BATCH_SIZE, draftReport, draftSkipReason,
  draftVocabulary, highestBatches, identifierClashReasons, REVIEW_BATCH_SIZE, reviewReport, reviewSkipReason, reviewVocabulary
} from "./batch.mjs";
import { DRAFT_KEYS } from "./draft-keys.mjs";
import { ingestDrafts } from "./draft.mjs";
import { ingestReviews, queueHolds } from "./review.mjs";
import { isPlainLine } from "./assert.mjs";
import { AGENT_HANDLE } from "./schema.mjs";
import { cachedText, forbiddenKeyIn } from "./intake.mjs";
import { structureOf } from "./structure.mjs";
import { packIndex, planOf, scenarioFiles, scenarioIdOf, scenarioOf, SCENARIO_STATES } from "./scenarios.mjs";
import { parseRunnerLog, playedFrom } from "./played.mjs";
import { isCoreVersion, isScenarioId, isWorld, PLAY_CLIENTS } from "./schema.mjs";
import { hasText, readText } from "./text.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRY = process.env.RULEPACK_REGISTRY || join(ROOT, "registry");
// Where `generate` writes the rule modules: scripts/rules/ of this repository unless RULEPACK_RULES says otherwise.
const RULES_OUT = process.env.RULEPACK_RULES || join(ROOT, "scripts", "rules");
const RULES_LABEL = process.env.RULEPACK_RULES || "scripts/rules";
// Where `scenarios` writes the play data (play/<book>/<slug>.json and .mjs) and `played` reads it: play/ of this repository
// unless RULEPACK_PLAY says otherwise.
const PLAY = process.env.RULEPACK_PLAY || join(ROOT, "play");

class UsageError extends Error {}

// The owners of docs/owners.json (Ruling R20): they sign `evidence.person` and run `review-accept`; never a results file.
const ownerHandles = () => {
  const { owners } = JSON.parse(readFileSync(join(ROOT, "docs", "owners.json"), "utf8"));
  return Array.isArray(owners) ? owners.filter((o) => typeof o === "string") : [];
};
const isOwner = (by) => typeof by === "string" && ownerHandles().some((o) => o.toLowerCase() === by.toLowerCase());

const need = (name) => {
  if (!process.env[name]) throw new UsageError(`Environment variable ${name} is not set`);
  return process.env[name];
};

// The <BOOK> argument of every subcommand, upper-cased once here: `xzz` and `XZZ` are the same book.
function bookArg(code) {
  if (isReservedBook(code)) throw new UsageError(`"${code}" is reserved in the registry folder and cannot be a book code`);
  const book = String(code).toUpperCase();
  if (!BOOK_CODE.test(book)) throw new UsageError(`Book code "${clip(code)}" must match ${BOOK_CODE} once upper-cased`);
  return book;
}

function loadRegistry(dir) {
  if (!existsSync(dir)) return [];
  // legacy.json and the queues (registry.mjs NOT_BOOKS) sit beside the books and are not books.
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
  checkQueues(REGISTRY);
  const books = loadRegistry(REGISTRY);
  const records = books.flatMap((b) => b.records);
  if (!records.length) return console.log("Nothing to check: the registry has no records.");

  const coreDir = need("DAS_CORE");
  const dumpsDir = ci ? null : need("RULEPACK_DUMPS");
  const textDir = ci ? null : need("RULEPACK_TEXT");
  return loadCore(coreDir).then((core) => {
    // Again with the engine's enumerations: a word of a review-queue entry's assertions must be one of the engine's.
    try { checkQueues(REGISTRY, core); } catch (e) {
      console.error(e.message);
      process.exit(2);
    }
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
// verdict the rules set (never one set by ingest, never a record that has a rule), clearing what the rules no longer give and
// giving back the previous verdict of a record the pre-pass turned to `core`. With `--core-prepass` it applies the `core` rule
// alone to the records whose verdict is `entry` or none, whoever set it (triage.mjs corePrepass), and prints, and with
// `--report <file>` (outside the registry) writes, what it changed with the engine's file and line.
async function triageCommand(args) {
  const usage = "Usage: triage <BOOK> [--redo-rule | --core-prepass [--report <file>]]";
  const positional = [];
  let report = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--report") {
      report = args[++i];
      if (!report || report.startsWith("--")) throw new UsageError(usage);
    } else if (args[i] !== "--redo-rule" && args[i] !== "--core-prepass") positional.push(args[i]);
  }
  const redo = args.includes("--redo-rule");
  const prepass = args.includes("--core-prepass");
  const [book, ...rest] = positional;
  if (!book || rest.length || (redo && prepass) || (report && !prepass)) throw new UsageError(usage);
  if (report && (isInside(realPathOf(report), realPathOf(REGISTRY)) || (existsSync(report) && statSync(report).isDirectory()))) {
    throw new UsageError(`--report ${report} must be a file outside the registry folder`);
  }
  const coreDir = need("DAS_CORE");
  const textDir = need("RULEPACK_TEXT");
  const found = loadBookOrFail(book);
  const core = await loadCore(coreDir);
  const all = loadRegistry(REGISTRY).flatMap((b) => b.records);
  const optionsOf = choiceOptionsFor(found.book);
  if (!optionsOf) console.log("options: not checked (RULEPACK_DUMPS is not set)");
  const base = {
    coreIdentifiers: core.identifiers, runtimeIdentifiers: core.runtimeIdentifiers, systemHandled: core.systemHandled,
    handledIdentifiers: core.handled, textDir, ...(optionsOf ? { optionsOf } : {})
  };
  const at = new Date().toISOString();
  if (prepass) return corePrepassCommand(found, { base, all, core, at, report });

  const open = (r) => !r.verdict || (redo && !r.rule && setByRule(r));
  const counts = {};
  let cleared = 0;
  let restored = 0;
  const pass = (context, count) => found.records.map((r) => {
    if (!open(r)) return r;
    const t = autoTriage({ ...r, verdict: null }, context);
    const { hint, textChangedAt, ...next } = r;
    if (t?.hint) next.hint = t.hint;
    const was = r.evidence?.triaged?.was;
    if (t?.verdict) {
      if (count) counts[t.verdict] = (counts[t.verdict] ?? 0) + 1;
      // A verdict the rules give again, unchanged, keeps its date.
      if (r.verdict === t.verdict && r.why === t.why) return next;
      // A pre-pass `core` given again for another reason keeps what the record was before it.
      const triaged = { by: t.by, at, ...(was && t.verdict === "core" ? { was } : {}) };
      if (!was || t.verdict === "core") return { ...next, verdict: t.verdict, why: t.why, evidence: { ...r.evidence, triaged } };
    }
    if (!r.verdict) return { ...next, ...(textChangedAt === undefined ? {} : { textChangedAt }) };
    if (was) {
      if (count) restored += 1;
      return restorePrepass(next);
    }
    if (count) cleared += 1;
    const { why, ...unsettled } = next;
    const { triaged, ...evidence } = r.evidence ?? {};
    return { ...unsettled, verdict: null, evidence };
  });
  // Two passes: the second sees the verdicts the first gave, so a record whose parts it turned to `core` follows them.
  const first = pass({ ...base, ...triageContext(all) }, false);
  const firstKeys = new Set(first.map((r) => r.key));
  const records = pass({ ...base, ...triageContext([...all.filter((r) => !firstKeys.has(r.key)), ...first]) }, true);
  saveBook(REGISTRY, { book: found.book, note: found.note, records });
  for (const [verdict, n] of Object.entries(counts)) console.log(`${verdict}: ${n}`);
  if (redo) console.log(`cleared: ${cleared}`);
  if (redo && restored) console.log(`restored (pre-pass undone): ${restored}`);
  console.log(`left: ${records.filter((r) => !r.verdict).length}`);
}

// The options a record's official item offers as a choice (triage.mjs choiceOptions), from the dumps of the book's package;
// null when RULEPACK_DUMPS is not set.
function choiceOptionsFor(book) {
  const dumpsDir = process.env.RULEPACK_DUMPS;
  if (!dumpsDir) return null;
  if (!existsSync(dumpsDir)) throw new UsageError(`RULEPACK_DUMPS points at a folder that does not exist: ${dumpsDir}`);
  const { packages } = JSON.parse(readFileSync(join(ROOT, "docs", "foundry-modules.json"), "utf8"));
  const docs = new Map();
  for (const f of officialFilesFor(dumpsDir, packages, book).filter((x) => !isActorFile(x))) {
    for (const d of readDump(join(dumpsDir, f))) if (typeof d?._id === "string" && !docs.has(d._id)) docs.set(d._id, d);
  }
  return (record) => choiceOptions(record, docs);
}

// `triage <BOOK> --core-prepass`: corePrepass over the book, every queue's keys left alone; the registry keeps the verdict,
// the why and `evidence.triaged` (with the previous verdict), the report the reason and where the engine says so.
function corePrepassCommand(found, { base, all, core, at, report }) {
  checkQueues(REGISTRY);
  const queued = new Set([...queueEntries(REGISTRY), ...loadQueue(REGISTRY, "drafts"), ...loadQueue(REGISTRY, "review")]
    .map((q) => q.key));
  const { records, changed, hinted } = corePrepass(found.records, { ...base, all }, { queued, at });
  const byKey = new Map(records.map((r) => [r.key, r]));
  const optionsOf = base.optionsOf ?? (() => []);
  const where = (c) => {
    if (c.source !== "parts") return core.locate(c.identifier);
    const record = byKey.get(c.key);
    const children = records.filter((r) => r.owner === record.name && r.kind !== "monster").map((r) => r.key);
    return [...children, ...optionsOf(record).map((o) => `${o} (${core.locate(o)[0] ?? "?"})`)];
  };
  const lines = changed.map((c) => ({ ...c, kind: byKey.get(c.key).kind, why: byKey.get(c.key).why, at: where(c) }));
  if (changed.length) saveBook(REGISTRY, { book: found.book, note: found.note, records });
  for (const c of lines) console.log(`core  ${c.key}  ${c.source}  ${c.at.join(", ")}`);
  for (const h of hinted) console.log(`hint  ${h.key}  ${h.hint} (${h.source})`);
  console.log(`changed: ${changed.length}`);
  console.log(`hinted (not written): ${hinted.length}`);
  if (report) {
    mkdirSync(dirname(resolve(report)), { recursive: true });
    const body = { book: found.book, at, core: core.version, changed: lines, hinted };
    writeFileSync(report, `${JSON.stringify(body, null, 2)}\n`);
    console.log(`Wrote ${report}.`);
  }
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

// Every queue file of the registry folder parses and holds valid entries (the gates check them, under --ci too): a broken
// queue would otherwise only show when a later stage reads it.
function checkQueues(dir, vocabulary) {
  for (const name of Object.keys(QUEUE_FILES)) {
    try { loadQueue(dir, name, { vocabulary }); } catch (e) { throw new UsageError(e.message); }
  }
  const file = join(dir, "queue.json");
  if (!existsSync(file)) return;
  const queue = readJson(file, "queue");
  if (!Array.isArray(queue)) throw new UsageError(`${file}: must be an array`);
  queue.forEach((e, i) => {
    const errors = validateTriageQueueEntry(e);
    if (errors.length) throw new UsageError(`${file}: entry ${i}: ${errors.join("; ")}`);
  });
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

async function batchCommand([stage, book, ...rest]) {
  const usage = "Usage: batch triage <BOOK> --out <dir> [--structure <private dir>] [--size <n>] [--kind <kind>] "
    + "[--without-items] [--queued]\n       batch draft <BOOK> --out <dir> --structure <private dir> [--size <n>] [--kind <kind>]"
    + " (needs DAS_CORE, RULEPACK_DUMPS and RULEPACK_TEXT: monster features are checked against the actors of the book's package)"
    + "\n       batch review <BOOK> --out <dir> --structure <private dir> [--size <n>] [--kind <kind>]"
    + " (needs DAS_CORE and RULEPACK_DUMPS)";
  if (!["triage", "draft", "review"].includes(stage) || !book) throw new UsageError(usage);
  const draft = stage === "draft";
  const review = stage === "review";
  const opts = {};
  const withoutItems = rest.includes("--without-items");
  const second = rest.includes("--queued");
  if ((draft || review) && (withoutItems || second)) throw new UsageError(usage);
  rest = rest.filter((a) => a !== "--without-items" && a !== "--queued");
  for (let i = 0; i < rest.length; i += 2) {
    if (!["--out", "--size", "--structure", "--kind"].includes(rest[i]) || rest[i + 1] === undefined) throw new UsageError(usage);
    opts[rest[i].slice(2)] = rest[i + 1];
  }
  if (!opts.out || ((draft || review) && !opts.structure)) throw new UsageError(usage);
  const defaultSize = draft ? DRAFT_BATCH_SIZE : review ? REVIEW_BATCH_SIZE : DEFAULT_BATCH_SIZE;
  const size = opts.size === undefined ? defaultSize : Number(opts.size);
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
  const series = draft ? "draft" : review ? "review" : second ? "second" : "triage";
  const after = existsSync(opts.out) ? highestBatches(readdirSync(opts.out), series) : {};
  let batches;
  let core = null;
  let embedded;
  let textDir = null;
  const report = {};
  const left = {};
  if (draft) {
    core = await loadCore(need("DAS_CORE"));
    textDir = need("RULEPACK_TEXT");
    checkQueues(REGISTRY);
    const queued = new Set(loadQueue(REGISTRY, "drafts").map((q) => q.key));
    const every = loadRegistry(REGISTRY).flatMap((b) => b.records);
    // A monster feature's shared embedded id is decided from the actors of the book's package (the test inventory binds by).
    const { packages } = JSON.parse(readFileSync(join(ROOT, "docs", "foundry-modules.json"), "utf8"));
    const actors = officialFilesFor(dumpsDir, packages, found.book).filter(isActorFile)
      .flatMap((f) => actorSummaries(readDump(join(dumpsDir, f)), "official"));
    // A package whose dumps are missing, or that yields no actor while there are monster features to cut, would make every
    // feature look unshared: refuse before anything is written.
    const files = officialFilesFor(dumpsDir, packages, found.book);
    if (!files.length) throw new UsageError(`${found.book}: no dump file of its package in ${dumpsDir} (RULEPACK_DUMPS)`);
    const monsters = found.records
      .some((r) => r.verdict === "entry" && r.kind === "monster" && (!opts.kind || opts.kind === "monster"));
    if (monsters && !actors.length) {
      throw new UsageError(`${found.book}: no actor in its package's dumps (RULEPACK_DUMPS): monsters cannot be checked`);
    }
    embedded = embeddedIndex(actors);
    // The records the unique gate would fail whatever is drafted (an identifier DAS · Core handles, in its table, its code or
    // by leaving it to the system; one shared with another record).
    const clashes = identifierClashReasons(every, engineIdentifiers(core));
    const textOf = (r) => (r.text && hasText(textDir, r.text.sha256) ? readText(textDir, r.text.sha256) : null);
    batches = cutDraftBatches(found.records, {
      size, kind: opts.kind, after, queued, core, ruled: every, embedded, textOf, report, clashes
    });
    for (const r of found.records.filter((x) => x.verdict === "entry" && (!opts.kind || x.kind === opts.kind))) {
      const why = draftSkipReason(r, { queued, embedded, clashes });
      if (why) left[why] = (left[why] ?? 0) + 1;
    }
    for (const [why, n] of Object.entries(left).sort()) console.log(`left out: ${n} entry records (${why})`);
    if (report.whyWithheld) console.log(`why withheld: quotes the source or no text (${report.whyWithheld} entries)`);
  } else if (review) {
    // Only rules that stand gated, and are not waiting for a person in review-queue.json; nothing of the draft goes in.
    core = await loadCore(need("DAS_CORE"));
    checkQueues(REGISTRY);
    const queue = loadQueue(REGISTRY, "review");
    batches = cutReviewBatches(found.records, { size, kind: opts.kind, after, queue });
    for (const r of found.records.filter((x) => x.rule && (!opts.kind || x.kind === opts.kind))) {
      const why = reviewSkipReason(r, { queue });
      if (why) left[why] = (left[why] ?? 0) + 1;
    }
    for (const [why, n] of Object.entries(left).sort()) console.log(`left out: ${n} ruled records (${why})`);
  } else {
    // A second reading is cut from the queue entries that have no second reading yet; a normal batch leaves the whole queue out.
    const cutOptions = second
      ? { only: new Set(queueEntries(REGISTRY).filter((q) => !q.second).map((q) => q.key)), series }
      : { queued: queuedKeys(REGISTRY) };
    batches = cutBatches(found.records, { size, kind: opts.kind, after, withoutItems, ...cutOptions });
  }
  // Every structure is computed before anything is written: a dump that cannot be read leaves no batch behind.
  const structures = dumpsDir === null ? [] : batches.map((b) => structuresOf(b, found.records, dumpsDir));
  mkdirSync(opts.out, { recursive: true });
  if (dumpsDir !== null) mkdirSync(opts.structure, { recursive: true });
  const write = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  batches.forEach((b, i) => {
    const body = draft ? { ...b, allowed: DRAFT_KEYS, vocabulary: "draft-vocabulary.json" }
      : review ? { ...b, vocabulary: "review-vocabulary.json" } : b;
    write(join(opts.out, `${b.id}.json`), body);
    if (dumpsDir !== null) write(join(opts.structure, `${b.id}.structure.json`), structures[i]);
  });
  if (draft) {
    write(join(opts.out, "draft-vocabulary.json"), draftVocabulary(core));
    write(join(opts.out, `${found.book.toLowerCase()}-draft-report.json`),
      draftReport(found.book, batches, left, report.whyWithheld ?? 0));
  }
  if (review) {
    write(join(opts.out, "review-vocabulary.json"), reviewVocabulary(core));
    write(join(opts.out, `${found.book.toLowerCase()}-review-report.json`), reviewReport(found.book, batches, left));
  }
  const withStructure = dumpsDir === null ? "" : `, structure files to ${opts.structure}`;
  console.log(`${batches.length} batches written to ${opts.out}${withStructure}`);
}

function readJson(file, what) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new UsageError(`${what} ${file}: ${e.message}`); }
}

// registry/queue.json: results that wait for a person. Merged by key; a key that was applied now leaves the queue.
// Returns the new content, or null when there is nothing to write.
function nextQueue(dir, queued, applied) {
  const file = join(dir, "queue.json");
  const current = existsSync(file) ? readJson(file, "queue") : [];
  if (!Array.isArray(current)) throw new UsageError(`${file}: must be an array`);
  const byKey = new Map(current.filter((q) => !applied.includes(q.key)).map((q) => [q.key, q]));
  for (const q of queued) byKey.set(q.key, q);
  const next = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return next.length || existsSync(file) ? `${JSON.stringify(next, null, 2)}\n` : null;
}

// The next content of registry/drafts-queue.json or review-queue.json (`name`: drafts or review): merged by key, the keys that
// were applied leave it. Null when unchanged.
function nextNamedQueue(dir, name, queued, applied) {
  const current = loadQueue(dir, name);
  const byKey = new Map(current.filter((q) => !applied.includes(q.key)).map((q) => [q.key, q]));
  for (const q of queued) byKey.set(q.key, q);
  if (!queued.length && byKey.size === current.length) return null;
  return queueText(name, [...byKey.values()]);
}

// Saves what an ingest changed: the books that hold `changed` keys, then the queue (`queue`: "triage" for registry/queue.json,
// "drafts" for registry/drafts-queue.json, "review" for registry/review-queue.json). Everything is checked before anything is
// written (every book as `saveBook` does, the new queue), then every file is written under a temporary name and all are
// renamed (registry.mjs writeFilesAtomically):
// when something is invalid or a write fails nothing is changed, the reason is printed and the exit code is 1. Returns true
// when saved.
function commitIngest(books, all, changed, queued, applied, { queue: kind = "triage" } = {}) {
  const touched = new Set(all.filter((r) => changed.includes(r.key)).map((r) => r.book));
  const pending = books.filter((b) => touched.has(b.book))
    .map((b) => ({ book: b.book, note: b.note, records: all.filter((r) => r.book === b.book) }));
  const files = [];
  try {
    for (const b of pending) {
      try { files.push([bookFile(REGISTRY, b.book), bookText(b)]); } catch (e) { throw new Error(`book ${b.book}: ${e.message}`); }
    }
    if (Object.hasOwn(QUEUE_FILES, kind)) {
      const text = (queued.length || applied.length) ? nextNamedQueue(REGISTRY, kind, queued, applied) : null;
      if (text !== null) files.push([queuePath(REGISTRY, kind), text]);
    } else {
      const text = (queued.length || applied.length) ? nextQueue(REGISTRY, queued, applied) : null;
      if (text !== null) files.push([join(REGISTRY, "queue.json"), text]);
    }
  } catch (e) {
    if (e instanceof UsageError) throw e;
    console.error(`Nothing was written: ${e.message}`);
    process.exitCode = 1;
    return false;
  }
  if (!files.length) return true;
  try {
    mkdirSync(REGISTRY, { recursive: true });
    writeFilesAtomically(files);
  } catch (e) {
    console.error(`Write failed: ${e.message}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

// `--overwrite` is the person's decision, given on the command line: a results file cannot carry it.
async function ingestCommand(args) {
  const usage = "Usage: ingest <results-file> [--overwrite | --second | --third | --draft --batch <batch file>"
    + " | --review --batch <batch file>] | ingest --settle-unsure [--min <n>]";
  const modes = ["--third", "--second", "--overwrite", "--settle-unsure", "--draft", "--review"].filter((m) => args.includes(m));
  if (modes.length > 1) throw new UsageError(`${modes.join(" and ")} cannot be used together`);
  const [mode] = modes;
  const rest = [];
  let min = null;
  let batchFile = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--min") { min = args[(i += 1)] ?? ""; continue; }
    if (args[i] === "--batch") { batchFile = args[(i += 1)] ?? ""; continue; }
    if (!modes.includes(args[i])) rest.push(args[i]);
  }
  if (min !== null && mode !== "--settle-unsure") throw new UsageError("--min goes with --settle-unsure only");
  if (batchFile !== null && mode !== "--draft" && mode !== "--review") {
    throw new UsageError("--batch goes with --draft or --review only");
  }
  if ((mode === "--draft" || mode === "--review") && !batchFile) {
    throw new UsageError(`${usage}\n${mode} needs --batch <the batch file the results answer>`);
  }
  if (mode === "--settle-unsure") {
    const n = min === null ? 0.6 : (min.trim() === "" || min !== min.trim() ? NaN : Number(min));
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
  // Ruling R23: an owner settles the triage queue through the plain ingest (with or without --overwrite); the agent stages
  // (--second, --third, --draft, --review) never take an owner's file.
  const owner = isOwner(input.by);
  if (owner && mode !== undefined && mode !== "--overwrite") {
    throw new UsageError(`${file}: by ${JSON.stringify(clip(input.by))} is an owner of docs/owners.json: ${mode} is an`
      + " agent stage, its results file is signed with an agent handle (an owner settles the triage queue with plain ingest)");
  }
  const forbidden = forbiddenKeyIn(input);
  if (forbidden) {
    throw new UsageError(`${file}: a key named ${forbidden.split(/[.[]/).pop()} (at ${forbidden}): not a results file`);
  }
  if (mode === "--draft") {
    const offered = offeredKeys(input.batch, batchFile);
    return ingestDraftCommand(input, { textDir, core: await loadCore(coreDir), offered });
  }
  if (mode === "--review") {
    const offered = offeredReviews(input.batch, batchFile);
    return ingestReviewCommand(input, { textDir, core: await loadCore(coreDir), offered });
  }
  const { entryKeys } = await loadCore(coreDir);
  const books = loadRegistry(REGISTRY);
  if (second) return ingestSecondCommand(books, input, { textDir, entryKeys });
  if (third) return ingestThirdCommand(books, input, { textDir, entryKeys });
  const out = ingest(books.flatMap((b) => b.records), input.results, {
    textDir, by: input.by, overwrite, entryKeys, queue: queueEntries(REGISTRY), owner
  });
  if (!commitIngest(books, out.records, out.applied, out.queued, out.applied)) return;
  console.log(JSON.stringify({ applied: out.applied.length, queued: out.queued.length, rejected: out.rejected }, null, 2));
  if (out.rejected.length) process.exitCode = 1;
}

// `ingest <results-file> --draft`: drafted rules. Applied rules are written with the state `drafted` (`gates` decides the rest);
// person, code and engine outcomes and low-confidence rules go to registry/drafts-queue.json; books and that queue are saved in
// one step. A monster feature needs the actors of its book's package (RULEPACK_DUMPS) to tell a shared embedded id.
// The keys a draft batch file offers: its id must be the results file's `batch`, of the form `<book>-draft-<NNN>`, its stage
// `draft`, and every entry a key of that book.
function offeredKeys(id, file) {
  const m = /^([a-z][a-z0-9]{1,9})-draft-(\d{3,})$/.exec(String(id));
  if (!m) throw new UsageError(`batch ${JSON.stringify(clip(id))} is not a draft batch id (<book>-draft-<NNN>)`);
  const batch = readJson(file, "batch file");
  if (batch?.id !== id || batch?.stage !== "draft" || !Array.isArray(batch?.entries)) {
    throw new UsageError(`${file}: not the draft batch ${id} (its id, stage "draft" and entries)`);
  }
  const keys = batch.entries.map((e) => e?.key);
  if (!keys.every((k) => typeof k === "string" && k.startsWith(`${m[1]}:`))) {
    throw new UsageError(`${file}: every entry of ${id} must be a key of book ${m[1].toUpperCase()}`);
  }
  return new Set(keys);
}

function ingestDraftCommand(input, { textDir, core, offered }) {
  checkQueues(REGISTRY);
  const books = loadRegistry(REGISTRY);
  const all = books.flatMap((b) => b.records);
  const keys = new Set(input.results.map((r) => r?.key).filter((k) => offered.has(k)));
  const monsterBooks = [...new Set(all.filter((r) => r.kind === "monster" && keys.has(r.key)).map((r) => r.book))];
  const embedded = new Map();
  if (monsterBooks.length) {
    const dumpsDir = need("RULEPACK_DUMPS");
    if (!existsSync(dumpsDir)) throw new UsageError(`RULEPACK_DUMPS points at a folder that does not exist: ${dumpsDir}`);
    const { packages } = JSON.parse(readFileSync(join(ROOT, "docs", "foundry-modules.json"), "utf8"));
    for (const book of monsterBooks) {
      const actors = officialFilesFor(dumpsDir, packages, book).filter(isActorFile)
        .flatMap((f) => actorSummaries(readDump(join(dumpsDir, f)), "official"));
      if (!actors.length) {
        throw new UsageError(`${book}: no actor in its package's dumps (RULEPACK_DUMPS): monsters cannot be checked`);
      }
      embedded.set(book, embeddedIndex(actors));
    }
  }
  const out = ingestDrafts(all, input.results, {
    textDir, by: input.by, core, queue: loadQueue(REGISTRY, "drafts"), embedded, offered
  });
  if (!commitIngest(books, out.records, out.applied, out.queued, out.applied, { queue: "drafts" })) return;
  console.log(JSON.stringify({ applied: out.applied.length, queued: out.queued.length, rejected: out.rejected }, null, 2));
  if (out.rejected.length) process.exitCode = 1;
}

// The keys a review batch file offers, each with the fingerprint of the rule its entry carried: the batch id must be the results
// file's `batch`, of the form `<book>-review-<NNN>`, its stage `review`, every entry a key of that book with a 64-hex `rule`.
function offeredReviews(id, file) {
  const m = /^([a-z][a-z0-9]{1,9})-review-(\d{3,})$/.exec(String(id));
  if (!m) throw new UsageError(`batch ${JSON.stringify(clip(id))} is not a review batch id (<book>-review-<NNN>)`);
  const batch = readJson(file, "batch file");
  if (batch?.id !== id || batch?.stage !== "review" || !Array.isArray(batch?.entries)) {
    throw new UsageError(`${file}: not the review batch ${id} (its id, stage "review" and entries)`);
  }
  const ok = (e) => typeof e?.key === "string" && e.key.startsWith(`${m[1]}:`) && typeof e.rule === "string"
    && /^[0-9a-f]{64}$/.test(e.rule);
  if (!batch.entries.every(ok)) {
    throw new UsageError(`${file}: every entry of ${id} must be a key of book ${m[1].toUpperCase()} with its rule fingerprint`);
  }
  return new Map(batch.entries.map((e) => [e.key, e.rule]));
}

// `ingest <results-file> --review --batch <batch file>`: independent reviews. Agreements write `evidence.reviewed`; the rest
// (disagreement, free text, low confidence, a draft stamped for a person) goes to registry/review-queue.json; books and that
// queue are saved in one step.
function ingestReviewCommand(input, { textDir, core, offered }) {
  checkQueues(REGISTRY);
  const books = loadRegistry(REGISTRY);
  const out = ingestReviews(books.flatMap((b) => b.records), input.results, {
    textDir, by: input.by, core, queue: loadQueue(REGISTRY, "review"), offered
  });
  if (!commitIngest(books, out.records, out.agreed, out.disagreed, out.agreed, { queue: "review" })) return;
  const reasons = {};
  for (const q of out.disagreed) reasons[q.reason] = (reasons[q.reason] ?? 0) + 1;
  console.log(JSON.stringify({ agreed: out.agreed.length, queued: out.disagreed.length, reasons, rejected: out.rejected },
    null, 2));
  if (out.rejected.length) process.exitCode = 1;
}

// `review-accept <key> --because "<one line>" --by <owner>`: a person settles a review-queue entry about the rule as it is by
// accepting it: `evidence.reviewed = { by, at, agrees: true, rule, confidence: 1, because }`, and the entry leaves the queue.
// (The other way to settle one is to edit the rule: every evidence goes stale and the record is drafted, gated and reviewed
// again.) `--by` is an owner of docs/owners.json, never an agent's handle.
function reviewAcceptCommand(args) {
  const usage = "Usage: review-accept <key> --because \"<one line>\" --by <owner handle>";
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--because" || args[i] === "--by") {
      if (args[i + 1] === undefined) throw new UsageError(usage);
      flags[args[i].slice(2)] = args[(i += 1)];
    } else if (args[i].startsWith("--")) throw new UsageError(usage);
    else positional.push(args[i]);
  }
  const [key, ...rest] = positional;
  if (!key || rest.length) throw new UsageError(usage);
  if (flags.because === undefined) throw new UsageError(`${usage}\nreview-accept needs --because: why the rule stands`);
  if (!isPlainLine(flags.because, 120)) {
    throw new UsageError("--because must be one line of printable ASCII, at most 120 characters");
  }
  if (!isReaderHandle(flags.by) || AGENT_HANDLE.test(flags.by) || !ownerHandles().includes(flags.by)) {
    throw new UsageError("--by must be an owner listed in docs/owners.json (never an agent's handle)");
  }
  checkQueues(REGISTRY);
  const books = loadRegistry(REGISTRY);
  const all = books.flatMap((b) => b.records);
  const record = all.find((r) => r.key === key);
  if (!record) throw new UsageError(`The registry has no record ${JSON.stringify(clip(key))}`);
  const entry = loadQueue(REGISTRY, "review").find((q) => q.key === key);
  if (!entry) throw new UsageError(`${clip(key)} is not in review-queue.json`);
  if (!queueHolds(entry, record)) {
    throw new UsageError(`${clip(key)}: the rule changed since it was queued: cut a new review batch for the rule as it is`);
  }
  if (stateOf(record) !== "gated") throw new UsageError(`${clip(key)}: the state is ${stateOf(record)}, not gated`);
  // `--because` lands in a public file: it must not quote the entry's text, alone or with the rule's prose. Without the text
  // nothing can be checked, so nothing is written (fail closed). The text gate reads it again (it is part of `emits`).
  const text = cachedText(need("RULEPACK_TEXT"))(record);
  if (text === null) throw new UsageError(`${clip(key)}: the entry's text is not in RULEPACK_TEXT: --because cannot be checked`);
  const quotes = quotationCheck(text);
  const prose = ruleProse(record.rule).map(([, v]) => v);
  if ([[flags.because], [...prose, flags.because], [flags.because, ...prose]].some((p) => quotes(p.join(" ")))) {
    throw new UsageError("--because quotes 8 or more consecutive words of the entry's text (alone or with the rule's prose)");
  }
  const at = new Date().toISOString();
  const reviewed = { by: flags.by, at, agrees: true, rule: ruleFingerprint(record.rule), confidence: 1, because: flags.because };
  const next = all.map((r) => (r.key === key ? { ...r, evidence: { ...r.evidence, reviewed } } : r));
  if (!commitIngest(books, next, [key], [], [key], { queue: "review" })) return;
  console.log(JSON.stringify({ key, reviewed: "accepted", by: flags.by }));
  console.log("The gate evidence is stale until the text gate reads --because: run npm run gates.");
}

// `ingest <results-file> --second`: the second reading of the queue. Agreements are applied and leave the queue;
// disagreements stay in it, with the second reading beside the first, for a person.
function ingestSecondCommand(books, input, { textDir, entryKeys }) {
  const queue = queueEntries(REGISTRY);
  const out = ingestSecond(books.flatMap((b) => b.records), input.results, { textDir, by: input.by, entryKeys, queue });
  if (!commitIngest(books, out.records, out.agreed, [...out.disagreed, ...out.unsure], out.agreed)) return;
  const counts = { agreed: out.agreed.length, disagreed: out.disagreed.length, unsure: out.unsure.length, rejected: out.rejected };
  console.log(JSON.stringify(counts, null, 2));
  if (out.rejected.length) process.exitCode = 1;
}

// `ingest <results-file> --third`: the third reading of the disagreements. Settled entries leave the queue; the others stay,
// with the third reading beside the first two, and are final for agents.
function ingestThirdCommand(books, input, { textDir, entryKeys }) {
  const out = ingestThird(books.flatMap((b) => b.records), input.results, {
    textDir, by: input.by, entryKeys, queue: queueEntries(REGISTRY)
  });
  if (!commitIngest(books, out.records, out.settled, out.unsettled, out.settled)) return;
  console.log(JSON.stringify({ settled: out.settled.length, unsettled: out.unsettled.length, rejected: out.rejected }, null, 2));
  if (out.rejected.length) process.exitCode = 1;
}

// `ingest --settle-unsure [--min <n>]`: the owner's bulk rule for the entries two readers were both unsure about.
function settleUnsureCommand(min) {
  const textDir = need("RULEPACK_TEXT");
  const books = loadRegistry(REGISTRY);
  const out = settleUnsure(books.flatMap((b) => b.records), { textDir, queue: queueEntries(REGISTRY), min });
  if (!commitIngest(books, out.records, out.applied, [], out.applied)) return;
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

// `scenarios <BOOK> [--check | --plan]`: the play data of every record of the book in state reviewed or played
// (scenarios.mjs), written to play/<book>/; `--check` compares only (exit 1 on a difference), `--plan` prints the run order
// by family (Ruling R11). Files of play/<book>/ that no such record makes any more are removed (listed by --check).
function scenariosCommand(args) {
  const usage = "Usage: scenarios <BOOK> [--check | --plan]";
  const modes = ["--check", "--plan"].filter((m) => args.includes(m));
  if (modes.length > 1) throw new UsageError(`${modes.join(" and ")} cannot be used together`);
  const positional = args.filter((a) => !modes.includes(a));
  if (positional.length !== 1 || positional[0].startsWith("--")) throw new UsageError(usage);
  const book = bookArg(positional[0]);
  const dumpsDir = need("RULEPACK_DUMPS");
  if (!existsSync(dumpsDir)) throw new UsageError(`RULEPACK_DUMPS points at a folder that does not exist: ${dumpsDir}`);
  const records = loadRegistry(REGISTRY).flatMap((b) => b.records).filter((r) => r.book === book);
  // The compendium of an official item: the pack (a dump file of items, not actors) that holds its docId.
  const { packages } = JSON.parse(readFileSync(join(ROOT, "docs", "foundry-modules.json"), "utf8"));
  const own = packages.filter((p) => p.book && p.book.toUpperCase() === book).map((p) => p.id);
  const itemFiles = dumpsFor(dumpsDir, "official").filter((f) => !isActorFile(f));
  const packOf = packIndex(itemFiles.map((f) => [f, readDump(join(dumpsDir, f))]), own);
  if (modes[0] === "--plan") {
    const order = planOf(records, { packOf });
    const manual = order.filter((p) => p.manual).length;
    const manualShare = `${order.length ? Math.round((100 * manual) / order.length) : 0}%`;
    return console.log(JSON.stringify({ scenarios: order.length, manual, manualShare, order }, null, 2));
  }

  const playable = records.filter((r) => SCENARIO_STATES.includes(stateOf(r)));
  const ids = groupBy(playable, scenarioIdOf);
  const clash = [...ids].find(([, list]) => list.length > 1);
  if (clash) throw new UsageError(`${clash[1].map((r) => r.key).join(" and ")} make one scenario id ${clash[0]}`);
  const expected = new Map(playable.flatMap((r) => scenarioFiles(scenarioOf(r, { packOf }))));
  const dir = join(PLAY, book.toLowerCase());
  const present = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(json|mjs)$/.test(f)) : [];
  const orphan = present.map((f) => `${book.toLowerCase()}/${f}`).filter((p) => !expected.has(p));
  const changed = [...expected].filter(([p, text]) => {
    const file = join(PLAY, p);
    return !existsSync(file) || readFileSync(file, "utf8") !== text;
  }).map(([p]) => p);
  const manual = playable.filter((r) => scenarioOf(r, { packOf }).manual).map((r) => r.key);
  if (modes[0] === "--check") {
    const ok = !changed.length && !orphan.length;
    console.log(JSON.stringify({ scenarios: playable.length, manual: manual.length, stale: changed, orphan }, null, 2));
    if (!ok) process.exitCode = 1;
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFilesAtomically(changed.map((p) => [join(PLAY, p), expected.get(p)]));
  for (const p of orphan) rmSync(join(PLAY, p), { force: true });
  console.log(JSON.stringify({ scenarios: playable.length, manual, written: changed, removed: orphan }, null, 2));
}

// The generated scenario file of a scenario id (play/<book>/<slug>.json), or null when there is none or it is not an object.
function scenarioFile(id) {
  const [book, name] = id.split("/");
  const file = join(PLAY, book, `${name}.json`);
  if (!existsSync(file)) return null;
  try {
    const json = JSON.parse(readFileSync(file, "utf8"));
    return json !== null && typeof json === "object" && !Array.isArray(json) ? json : null;
  } catch { return null; }
}

// `played <runner-log> --world <name> [--client gm|player]`: evidence.played from the log of the engine's runner (played.mjs);
// `played --manual <key> --world <name> --because "<one line>" --by <owner> [--core <version>]`: a checklist played by hand.
function playedCommand(args) {
  const usage = "Usage: played <runner-log> --world <name> [--client gm|player]\n"
    + "       played --manual <key> --world <name> --because \"<one line>\" --by <owner handle> [--core <version>]";
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    if (["--world", "--client", "--manual", "--because", "--by", "--core"].includes(args[i])) {
      if (args[i + 1] === undefined || Object.hasOwn(flags, args[i].slice(2))) throw new UsageError(usage);
      flags[args[i].slice(2)] = args[(i += 1)];
    } else if (args[i].startsWith("--")) throw new UsageError(usage);
    else positional.push(args[i]);
  }
  if (Object.hasOwn(flags, "manual") && positional.length) {
    throw new UsageError("A runner log and --manual cannot be used together: either the log of a play, or a play by hand");
  }
  if (!isWorld(flags.world)) throw new UsageError(`${usage}\n--world must be a world handle (letters, digits, . _ -)`);
  const client = flags.client ?? "gm";
  if (!PLAY_CLIENTS.includes(client)) throw new UsageError(`--client must be one of ${PLAY_CLIENTS.join(", ")}`);
  checkQueues(REGISTRY);
  const books = loadRegistry(REGISTRY);
  const all = books.flatMap((b) => b.records);
  const at = new Date().toISOString();
  if (Object.hasOwn(flags, "manual")) return playedByHand(books, all, flags, { client, at, usage });

  if (positional.length !== 1 || ["because", "by", "core"].some((f) => Object.hasOwn(flags, f))) throw new UsageError(usage);
  const [log] = positional;
  if (!existsSync(log) || !statSync(log).isFile()) throw new UsageError(`No runner log at ${clip(log)}`);
  const text = readFileSync(log, "utf8");
  if (!parseRunnerLog(text).length && text.includes("das-rulepack:")) {
    throw new UsageError(`${clip(log)}: no runner block recognised (colour codes on the header lines?): nothing recorded`);
  }
  const scenarios = new Map(parseRunnerLog(text).filter((b) => isScenarioId(b.name)).map((b) => [b.name, scenarioFile(b.name)])
    .filter(([, json]) => json !== null));
  const out = playedFrom(all, text, { scenarios, world: flags.world, client, at });
  if (!commitIngest(books, out.records, out.played, [], [])) return;
  console.log(JSON.stringify({ played: out.played, skipped: out.skipped }, null, 2));
  if (out.skipped.length) process.exitCode = 1;
}

// A person played a manual scenario's checklist (scenarios.mjs `manual`): `evidence.played` with `manual: true`, `by` (an
// owner of docs/owners.json) and `because`, which lands in a public file: it must not quote the entry's text, and the text
// gate reads it again (it is part of `emits`: the gates must run before the record is played).
function playedByHand(books, all, flags, { client, at, usage }) {
  if (flags.because === undefined || !isPlainLine(flags.because, 120)) {
    throw new UsageError(`${usage}\n--because must be one line of printable ASCII, at most 120 characters`);
  }
  if (!isReaderHandle(flags.by) || AGENT_HANDLE.test(flags.by) || !isOwner(flags.by)) {
    throw new UsageError("--by must be an owner listed in docs/owners.json (never an agent's handle)");
  }
  const key = flags.manual;
  const record = all.find((r) => r.key === key);
  if (!record) throw new UsageError(`The registry has no record ${JSON.stringify(clip(key))}`);
  const state = stateOf(record);
  if (!SCENARIO_STATES.includes(state)) throw new UsageError(`${clip(key)}: the state is ${state}, not reviewed`);
  const id = scenarioIdOf(record);
  const json = scenarioFile(id);
  const current = ruleFingerprint(record.rule);
  if (!json || json.key !== key || json.rule !== current) {
    throw new UsageError(`${clip(key)}: play/${id}.json is missing or was made for another rule: run npm run scenarios`);
  }
  if (json.manual !== true) throw new UsageError(`${clip(key)}: not a manual scenario: play it with the runner and record its log`);
  const core = flags.core ?? coreVersion();
  if (!isCoreVersion(core)) throw new UsageError("--core must be an engine version (1.2.3)");
  const text = cachedText(need("RULEPACK_TEXT"))(record);
  if (text === null) throw new UsageError(`${clip(key)}: the entry's text is not in RULEPACK_TEXT: --because cannot be checked`);
  const quotes = quotationCheck(text);
  const prose = ruleProse(record.rule).map(([, v]) => v);
  if ([[flags.because], [...prose, flags.because], [flags.because, ...prose]].some((p) => quotes(p.join(" ")))) {
    throw new UsageError("--because quotes 8 or more consecutive words of the entry's text (alone or with the rule's prose)");
  }
  const played = { at, core, world: flags.world, scenario: id, client, rule: current, manual: true, by: flags.by,
    because: flags.because };
  const next = all.map((r) => (r.key === key ? { ...r, evidence: { ...r.evidence, played } } : r));
  if (!commitIngest(books, next, [key], [], [])) return;
  console.log(JSON.stringify({ key, played: "by hand", by: flags.by }));
  console.log("The gate evidence is stale until the text gate reads --because: run npm run gates.");
}

// The engine version of DAS_CORE (module/module.json), for a play by hand that names none.
function coreVersion() {
  const file = join(need("DAS_CORE"), "module", "module.json");
  if (!existsSync(file)) throw new UsageError(`DAS_CORE has no module/module.json: give --core <version>`);
  return JSON.parse(readFileSync(file, "utf8")).version;
}

export const COMMANDS = {
  inventory: inventoryCommand, gates: gatesCommand, generate: generateCommand, triage: triageCommand, batch: batchCommand,
  ingest: ingestCommand, resolve: resolveCommand, "review-accept": reviewAcceptCommand, scenarios: scenariosCommand,
  played: playedCommand
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
