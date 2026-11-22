// Command line of the rulebook pipeline: `npm run pipeline -- <subcommand> ...`. Later tasks add one function each to COMMANDS.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
import { undefinedWords } from "./definitions.mjs";
import { loadCore } from "./core.mjs";
import { engineComparison, engineReading, officialItemOf, readingEvidence } from "./engine-reading.mjs";
import { engineIdentifiers, quotationCheck, ruleProse, runGates } from "./gates.mjs";
import { generate, shippedHeld } from "./generate.mjs";
import {
  autoTriage, choiceOptions, clip, corePrepass, engineReadingPrepass, ingest, ingestSecond, ingestThird, isReaderHandle,
  restorePrepass, setByRule, settleUnsure, triageContext, BY
} from "./triage.mjs";
import {
  cutBatches, cutDraftBatches, cutReviewBatches, DEFAULT_BATCH_SIZE, DRAFT_BATCH_SIZE, draftReport, draftSkipReason,
  draftVocabulary, highestBatches, identifierClashReasons, NOT_REDRAFTABLE, redraftable, reofferSkipReason, REVIEW_BATCH_SIZE,
  reviewReport, reviewSkipReason, reviewVocabulary, rereadVocabulary, rulableOrigin
} from "./batch.mjs";
import { draftKeysFor } from "./draft-keys.mjs";
import { ingestDrafts } from "./draft.mjs";
import { ingestReviews, queueHolds, secondReviewSkipReason } from "./review.mjs";
import { againstReviewsSkipReason } from "./against.mjs";
import { REREAD_BATCH_SIZE, cutRereadBatches, ingestRereads, readingFingerprint, rereadReport } from "./reread.mjs";
import { isPlainLine } from "./assert.mjs";
import { AGENT_HANDLE } from "./schema.mjs";
import { cachedText, forbiddenKeyIn } from "./intake.mjs";
import { reachesOf, structureOf } from "./structure.mjs";
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
  return loadCore(coreDir).then(async (core) => {
    // Again with the engine's enumerations: a word of a review-queue entry's assertions must be one of the engine's.
    try { checkQueues(REGISTRY, core); } catch (e) {
      console.error(e.message);
      process.exit(2);
    }
    const documents = ci ? {} : loadDocuments(dumpsDir, records);
    // Ruling R29: each monster rule compared with the engine's own reading of its official item (stored as evidence.reading).
    const readingOf = ci ? undefined : (record) => readingOfRecord(record, documents, core);
    // A reread (reread.mjs) judged against the engine's reading of an unruled monster feature: noted when it reads otherwise.
    const rereadReadingOf = ci ? undefined : (record) => rereadReadingOfRecord(record, documents, core);
    const { failures, notes, updated } = runGates(records, {
      core, documents, textDir, ci, legacy: legacyOf(REGISTRY), readingOf, rereadReadingOf
    });
    // Ruling R27 (--ci): no generated module registers a rule that is held for a person.
    const held = ci ? await heldInModules(records, books) : [];
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
    for (const line of held) console.error(`FAIL ${line}`);
    const failed = Object.keys(failures).length;
    console.log(`${records.length} records, ${failed} failing${ci ? " (ci: schema, validator, unique, evidence)" : ""}`
      + `${held.length ? `, ${held.length} held rule(s) in the generated modules` : ""}.`);
    if (failed || held.length) process.exitCode = 1;
  });
}

// Ruling R29: the evidence.reading of a ruled monster record, or null when its official item is not in the dumps (the document
// matched by its data fingerprint, as the data-fix gate reads it). The engine sees the rule's own identifier: its sources bind it.
export function readingOfRecord(record, documents, core) {
  const item = officialItemOf(record);
  const doc = item && Object.hasOwn(documents.official ?? {}, item.docId) ? documents.official[item.docId] : null;
  if (!doc || !record.rule?.entry || typeof record.rule.entry !== "object") return null;
  // Fix round 1: with the rebinding of the item to the rule's identifier (engine-reading.mjs engineComparison).
  const actorId = String(item.docId).split(".")[0];
  return readingEvidence(record, engineComparison(doc, record, core, { actorId }), { core });
}

// The fingerprint of the engine's reading of today of a record's official monster item (reread.mjs readingFingerprint), under
// the identifier the engine sees without the pack; null when it reads nothing, undefined when the item is not in the dumps.
function rereadReadingOfRecord(record, documents, core) {
  const item = officialItemOf(record);
  const doc = item && Object.hasOwn(documents.official ?? {}, item.docId) ? documents.official[item.docId] : null;
  if (!doc) return undefined;
  const reading = engineReading(doc, core, { actorId: String(item.docId).split(".")[0] });
  return reading ? readingFingerprint(reading, core) : null;
}

// Ruling R27: the held rules that a generated book module (RULEPACK_RULES, default scripts/rules/) registers all the same,
// one line each (generate.mjs shippedHeld). A module that cannot be imported is a line too.
async function heldInModules(records, books) {
  const modules = {};
  const lines = [];
  for (const { book } of books) {
    const file = join(RULES_OUT, "books", `${book.toLowerCase()}.mjs`);
    if (!existsSync(file)) continue;
    try { modules[book] = (await import(pathToFileURL(file).href)).RULES; } catch (e) {
      lines.push(`emit: ${RULES_LABEL}/books/${book.toLowerCase()}.mjs cannot be read: ${e.message}`);
    }
  }
  const queue = loadQueue(REGISTRY, "review");
  return [...lines, ...shippedHeld(records, { legacy: legacyOf(REGISTRY), queue, modules })];
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
  const usage = "Usage: triage <BOOK> [--redo-rule | --core-prepass [--report <file>] | --engine-reading [--report <file>]]";
  const positional = [];
  let report = null;
  const FLAGS = ["--redo-rule", "--core-prepass", "--engine-reading"];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--report") {
      report = args[++i];
      if (!report || report.startsWith("--")) throw new UsageError(usage);
    } else if (!FLAGS.includes(args[i])) positional.push(args[i]);
  }
  const redo = args.includes("--redo-rule");
  const prepass = args.includes("--core-prepass");
  const reading = args.includes("--engine-reading");
  const [book, ...rest] = positional;
  if (!book || rest.length || [redo, prepass, reading].filter(Boolean).length > 1 || (report && !prepass && !reading)) {
    throw new UsageError(usage);
  }
  if (report && (isInside(realPathOf(report), realPathOf(REGISTRY)) || (existsSync(report) && statSync(report).isDirectory()))) {
    throw new UsageError(`--report ${report} must be a file outside the registry folder`);
  }
  if (reading) return engineReadingCommand(bookArg(book), report);
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

// The official actor dumps of a book's package, as a document index (`<actor id>.<item id>`), and a lookup of a record's
// official item in it by docId and data fingerprint (dumps.mjs findDocument); null when the item is not there.
function officialMonsterDocuments(dumpsDir, book) {
  if (!existsSync(dumpsDir)) throw new UsageError(`RULEPACK_DUMPS points at a folder that does not exist: ${dumpsDir}`);
  const { packages } = JSON.parse(readFileSync(join(ROOT, "docs", "foundry-modules.json"), "utf8"));
  const index = docIndex(dumpsDir, officialFilesFor(dumpsDir, packages, book).filter(isActorFile));
  return (record) => {
    const item = officialItemOf(record);
    return item ? findDocument(index, item.docId, item.data.sha256) : null;
  };
}

// The engine's own reading of a record's official monster item (Ruling R29), under the identifier the engine would see
// today (the record has no rule: nothing of the pack names it); undefined when the item is not in the dumps.
const readingFor = (documentOf, core) => (record) => {
  const doc = documentOf(record);
  if (!doc) return undefined;
  const actorId = String(officialItemOf(record).docId).split(".")[0];
  return engineReading(doc, core, { actorId });
};

// `triage <BOOK> --engine-reading [--report <file>]` (Ruling R29): the hint `engine-reads` on the monster `entry` records
// without a rule whose official item the engine's text layer reads something of (triage.mjs engineReadingPrepass); no
// verdict changes. Needs DAS_CORE and RULEPACK_DUMPS. Prints the counts, and with `--report` writes the keys read (with the
// entry keys the engine reads: no prose), unread and without a document.
async function engineReadingCommand(book, report) {
  const core = await loadCore(need("DAS_CORE"));
  const documentOf = officialMonsterDocuments(need("RULEPACK_DUMPS"), book);
  const found = loadBookOrFail(book);
  checkQueues(REGISTRY);
  const queued = new Set([...queueEntries(REGISTRY), ...loadQueue(REGISTRY, "drafts"), ...loadQueue(REGISTRY, "review")]
    .map((q) => q.key));
  const out = engineReadingPrepass(found.records, { readingOf: readingFor(documentOf, core), queued });
  const before = new Map(found.records.map((r) => [r.key, canonical(r)]));
  if (out.records.some((r) => before.get(r.key) !== canonical(r))) {
    saveBook(REGISTRY, { book: found.book, note: found.note, records: out.records });
  }
  for (const h of out.hinted) console.log(`hint  ${h.key}  engine-reads (${h.keys.join(", ")})`);
  console.log(`engine reads something: ${out.hinted.length}`);
  console.log(`engine reads nothing: ${out.none.length}${out.cleared.length ? ` (hint removed: ${out.cleared.length})` : ""}`);
  console.log(`official item not in the dumps: ${out.unread.length}`);
  console.log(`ruled (left to evidence.reading): ${out.ruled.length}`);
  if (report) {
    mkdirSync(dirname(resolve(report)), { recursive: true });
    const body = { book: found.book, core: core.version, hinted: out.hinted, none: out.none, unread: out.unread,
      ruled: out.ruled, cleared: out.cleared };
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
// (`<actor id>.<item id>`). With `rulable` (the draft and review cuts, and the review ingest) an origin no rule can name is
// left out (batch.mjs rulableOrigin: a monster feature's DDB Importer item, Ruling R3). With `reach` (the play data of
// `scenarios`) each activity also carries its reach in feet (structure.mjs reachesOf).
// With `engine` (what loadCore returns: the triage, draft and review cuts), a monster record's official structure also carries
// `engineReads` (Ruling R29): the engine's own reading of the item, an entry of ids and engine words (null when it reads
// nothing), under the identifier the engine would see (the rule's own when the record has one, its sources bind it). With
// `unruled` (a redraft, Ruling R32) it is read as for a record without a rule: what a drafter of it sees, blind to the rule.
function structuresOf(batch, records, dumpsDir, { rulable = false, reach = false, engine = null, unruled = false } = {}) {
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
    for (const item of r.items.filter((i) => i.match === "matched" && (!rulable || rulableOrigin(r, i.origin)))) {
      const doc = findDocument(docs(r.book, item.origin, r.kind), item.docId, item.data?.sha256);
      const structure = doc ? structureOf(doc) : null;
      const reaches = doc && reach ? reachesOf(doc) : null;
      perOrigin[item.origin] = reaches
        ? { ...structure, activities: structure.activities.map((a) => ({ ...a, reach: reaches[a.id] ?? null })) } : structure;
      if (doc && engine && r.kind === "monster" && item.origin === "official") {
        const actorId = String(item.docId).split(".")[0];
        perOrigin.official.engineReads = engineReading(doc, engine, r.rule && !unruled ? { identifier: r.identifier }
          : { actorId });
      }
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
    + " [--redraft [--against-reviews] | --reoffer]"
    + " (needs DAS_CORE, RULEPACK_DUMPS and RULEPACK_TEXT: monster features are checked against the actors of the book's package)"
    + "\n       batch review <BOOK> --out <dir> --structure <private dir> [--size <n>] [--kind <kind>] [--second]"
    + " (needs DAS_CORE and RULEPACK_DUMPS)\n       " + REREAD_USAGE;
  if (stage === "reread" && book) return rereadBatchCommand(book, rest);
  if (!["triage", "draft", "review"].includes(stage) || !book) throw new UsageError(usage);
  const draft = stage === "draft";
  const review = stage === "review";
  const opts = {};
  const withoutItems = rest.includes("--without-items");
  const second = rest.includes("--queued");
  // Ruling R32: `--redraft` cuts, once, the monster rules held because they change the engine's reading (batch.mjs).
  const redraft = rest.includes("--redraft");
  // Ruling R39: `--reoffer` cuts, once, the drafts-queue entries a drafter declined whose record is still an unruled entry.
  const reoffer = rest.includes("--reoffer");
  // Ruling R41: `--redraft --against-reviews` cuts, once, the review-queue entries two blind reviews read alike against the
  // draft (against.mjs).
  const against = rest.includes("--against-reviews");
  if ((draft || review) && (withoutItems || second)) throw new UsageError(usage);
  // Ruling R40: `--second` cuts, once, the review-queue entries a blind second review may settle (review.mjs).
  const secondReview = rest.includes("--second");
  if (secondReview && !review) throw new UsageError(`--second goes with batch review only\n${usage}`);
  if (redraft && !draft) throw new UsageError(`--redraft goes with batch draft only\n${usage}`);
  if (reoffer && !draft) throw new UsageError(`--reoffer goes with batch draft only\n${usage}`);
  if (reoffer && redraft) throw new UsageError(`--reoffer and --redraft cannot be used together\n${usage}`);
  if (against && !(draft && redraft)) {
    throw new UsageError(`--against-reviews goes with batch draft --redraft only\n${usage}`);
  }
  rest = rest.filter((a) => !["--without-items", "--queued", "--redraft", "--reoffer", "--second", "--against-reviews"]
    .includes(a));
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
  const series = draft ? "draft" : review ? (secondReview ? "review-second" : "review") : second ? "second" : "triage";
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
    const drafts = loadQueue(REGISTRY, "drafts");
    const queued = new Set(drafts.map((q) => q.key));
    const every = loadRegistry(REGISTRY).flatMap((b) => b.records);
    // A monster feature's shared embedded id is decided from the actors of the book's package (the test inventory binds by);
    // such a feature is cut only when the engine accepts `<actor id>.<item id>` sources (Ruling R35, core.actorItemSources).
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
    // A monster feature the engine reads something of goes to a reread first, unless one found it goes beyond the reading.
    const readingOf = monsters ? memoByKey(readingFor(officialMonsterDocuments(dumpsDir, found.book), core)) : undefined;
    // Ruling R32: a redraft decides on each rule's comparison with the engine's reading computed now (as the gates do).
    const reviewQueue = redraft ? loadQueue(REGISTRY, "review") : [];
    const reviewQueued = new Set(reviewQueue.map((q) => q.key));
    // Ruling R41: a redraft against two reviews decides on the review queue and the record alone (no engine reading).
    const currentReadingOf = redraft && !against ? currentReadingFor(found.records, dumpsDir, core) : undefined;
    batches = cutDraftBatches(found.records, {
      size, kind: opts.kind, after, queued, core, ruled: every, embedded, textOf, report, clashes, readingOf, redraft,
      reviewQueued, currentReadingOf, reoffer, drafts, owners: ownerHandles(), againstReviews: against, reviewQueue
    });
    const skip = { queued, embedded, clashes, readingOf, actorItem: core.actorItemSources === true };
    const queueEntry = new Map(reviewQueue.map((q) => [q.key, q]));
    for (const r of found.records.filter((x) => x.verdict === "entry" && (!opts.kind || x.kind === opts.kind))) {
      const why = against ? againstReviewsSkipReason(queueEntry.get(r.key), r, { owners: ownerHandles() })
        : redraft ? (redraftable(r, { draftsQueued: queued, reviewQueued, readingOf: currentReadingOf }) ? null : NOT_REDRAFTABLE)
        : reoffer ? reofferSkipReason(r, { ...skip, drafts, owners: ownerHandles() }) : draftSkipReason(r, skip);
      if (why) left[why] = (left[why] ?? 0) + 1;
    }
    for (const [why, n] of Object.entries(left).sort()) console.log(`left out: ${n} entry records (${why})`);
    if (report.whyWithheld) console.log(`why withheld: quotes the source or no text (${report.whyWithheld} entries)`);
  } else if (review) {
    // Only rules that stand gated, and are not waiting for a person in review-queue.json; nothing of the draft goes in.
    core = await loadCore(need("DAS_CORE"));
    checkQueues(REGISTRY);
    const queue = loadQueue(REGISTRY, "review");
    const owners = secondReview ? ownerHandles() : undefined;
    batches = cutReviewBatches(found.records, { size, kind: opts.kind, after, queue, second: secondReview, owners });
    if (secondReview) {
      // Ruling R40: what is left out is counted over the book's review-queue entries (nothing else is ever cut).
      const byKey = new Map(found.records.map((r) => [r.key, r]));
      const ofBook = queue.filter((q) => byKey.has(q.key) && (!opts.kind || byKey.get(q.key).kind === opts.kind));
      for (const q of ofBook) {
        const why = secondReviewSkipReason(q, byKey.get(q.key), { owners });
        if (why) left[why] = (left[why] ?? 0) + 1;
      }
      for (const [why, n] of Object.entries(left).sort()) console.log(`left out: ${n} queue entries (${why})`);
    } else {
      for (const r of found.records.filter((x) => x.rule && (!opts.kind || x.kind === opts.kind))) {
        const why = reviewSkipReason(r, { queue });
        if (why) left[why] = (left[why] ?? 0) + 1;
      }
      for (const [why, n] of Object.entries(left).sort()) console.log(`left out: ${n} ruled records (${why})`);
    }
  } else {
    // A second reading is cut from the queue entries that have no second reading yet; a normal batch leaves the whole queue out.
    const cutOptions = second
      ? { only: new Set(queueEntries(REGISTRY).filter((q) => !q.second).map((q) => q.key)), series }
      : { queued: queuedKeys(REGISTRY) };
    batches = cutBatches(found.records, { size, kind: opts.kind, after, withoutItems, ...cutOptions });
  }
  // A word an agent may choose that has no definition (a new engine word, definitions.mjs): nothing is written until it has one.
  const undefinedOnes = draft || review ? undefinedWords(core) : [];
  if (undefinedOnes.length) {
    throw new UsageError(`words without a definition (tools/pipeline/definitions.mjs): ${undefinedOnes.slice(0, 8).join(", ")}`);
  }
  // Ruling R29: a monster feature's structure carries what the engine already reads of it (`engineReads`), so a triage cut
  // with structures needs DAS_CORE as soon as it holds a monster feature.
  const byKey = new Map(found.records.map((r) => [r.key, r]));
  const monsters = batches.some((b) => b.entries.some((e) => byKey.get(e.key)?.kind === "monster"));
  if (dumpsDir !== null && !core && monsters) {
    if (!process.env.DAS_CORE) {
      throw new UsageError("DAS_CORE is not set: a monster feature's structure gives the engine's own reading (engineReads)");
    }
    core = await loadCore(process.env.DAS_CORE);
  }
  // Every structure is computed before anything is written: a dump that cannot be read leaves no batch behind.
  const structures = dumpsDir === null ? []
    : batches.map((b) => structuresOf(b, found.records, dumpsDir, { rulable: draft || review, engine: core,
      unruled: redraft }));
  mkdirSync(opts.out, { recursive: true });
  if (dumpsDir !== null) mkdirSync(opts.structure, { recursive: true });
  const write = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  batches.forEach((b, i) => {
    const body = draft ? { ...b, allowed: draftKeysFor(core), vocabulary: "draft-vocabulary.json" }
      : review ? { ...b, vocabulary: "review-vocabulary.json" } : b;
    write(join(opts.out, `${b.id}.json`), body);
    if (dumpsDir !== null) write(join(opts.structure, `${b.id}.structure.json`), structures[i]);
  });
  if (draft) {
    write(join(opts.out, "draft-vocabulary.json"), draftVocabulary(core));
    const mark = against ? "-against-reviews" : redraft ? "-redraft" : reoffer ? "-reoffer" : "";
    write(join(opts.out, `${found.book.toLowerCase()}-draft${mark}-report.json`),
      draftReport(found.book, batches, left, report.whyWithheld ?? 0));
  }
  if (review) {
    write(join(opts.out, "review-vocabulary.json"), reviewVocabulary(core));
    const mark = secondReview ? "-second" : "";
    write(join(opts.out, `${found.book.toLowerCase()}-review${mark}-report.json`), reviewReport(found.book, batches, left));
  }
  const withStructure = dumpsDir === null ? "" : `, structure files to ${opts.structure}`;
  console.log(`${batches.length} batches written to ${opts.out}${withStructure}`);
}

// One value per record key, computed once (the engine's reading of an item is asked for by the cut and by the report).
const memoByKey = (f) => {
  const seen = new Map();
  return (r) => {
    if (!seen.has(r.key)) seen.set(r.key, f(r));
    return seen.get(r.key);
  };
};

// Ruling R32: the `evidence.reading` of each ruled monster record of `records`, computed now from the dumps and the engine
// (readingOfRecord, what `npm run gates` stores), once per record; null when its official item is not in the dumps.
function currentReadingFor(records, dumpsDir, core) {
  const documents = loadDocuments(dumpsDir, records.filter((r) => r.kind === "monster" && r.rule && r.legacy !== true));
  return memoByKey((r) => readingOfRecord(r, documents, core));
}

const REREAD_USAGE = "batch reread <BOOK> --out <dir> --structure <private dir> [--size <n>] [--second | --restate]"
  + " (needs DAS_CORE and RULEPACK_DUMPS: the engine's reading of each monster feature is computed at cut time)";

// `batch reread <BOOK> --out <dir> --structure <private dir> [--size <n>] [--second]` (reread.mjs): the unruled monster
// `entry` records the engine reads something of, for a reader blind to every earlier verdict; with `--second`, the provisional
// `core` records of a first reread, for another reader. Writes the batches, their structure files (with `engineReads`), the
// vocabulary of the assertions (`reread-vocabulary.json`: the review's) and `<book>-reread[-second]-report.json` (counts).
// With `--restate` (Ruling R31), the first rereads whose `unexpressed` the vocabulary now states (reread.mjs restatable), once:
// the batches keep the reread series, marked `restate: true`; the report is `<book>-reread-restate-report.json`.
async function rereadBatchCommand(book, rest) {
  const usage = `Usage: ${REREAD_USAGE}`;
  const second = rest.includes("--second");
  const restate = rest.includes("--restate");
  if (second && restate) throw new UsageError("--restate and --second cannot be used together: a restate reads first rereads");
  const args = rest.filter((a) => a !== "--second" && a !== "--restate");
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--out", "--size", "--structure"].includes(args[i]) || args[i + 1] === undefined) throw new UsageError(usage);
    opts[args[i].slice(2)] = args[i + 1];
  }
  if (!opts.out || !opts.structure) throw new UsageError(usage);
  const size = opts.size === undefined ? REREAD_BATCH_SIZE : Number(opts.size);
  if (!Number.isInteger(size) || size < 1) throw new UsageError("--size must be a positive integer");
  const missing = ["DAS_CORE", "RULEPACK_DUMPS"].filter((v) => !process.env[v]);
  if (missing.length) {
    throw new UsageError(`batch reread needs DAS_CORE and RULEPACK_DUMPS (${missing.join(" and ")} not set): the engine's`
      + " reading of each monster feature is computed at cut time");
  }
  const found = loadBookOrFail(book);
  checkFolderArg("--out", opts.out);
  checkFolderArg("--structure", opts.structure);
  checkStructureDir(opts.structure, opts.out);
  const dumpsDir = process.env.RULEPACK_DUMPS;
  if (!existsSync(dumpsDir)) throw new UsageError(`RULEPACK_DUMPS points at a folder that does not exist: ${dumpsDir}`);
  const core = await loadCore(process.env.DAS_CORE);
  const undefinedOnes = undefinedWords(core);
  if (undefinedOnes.length) {
    throw new UsageError(`words without a definition (tools/pipeline/definitions.mjs): ${undefinedOnes.slice(0, 8).join(", ")}`);
  }
  checkQueues(REGISTRY);
  const reviewQueued = new Set(loadQueue(REGISTRY, "review").map((q) => q.key));
  const triageQueued = queuedKeys(REGISTRY);
  const readingOf = memoByKey(readingFor(officialMonsterDocuments(dumpsDir, found.book), core));
  const series = second ? "reread-second" : "reread";
  const after = existsSync(opts.out) ? highestBatches(readdirSync(opts.out), series) : {};
  const { batches, leftOut } = cutRereadBatches(found.records, {
    size, after, readingOf, core, second, restate, reviewQueued, triageQueued
  });
  // Every structure is computed before anything is written.
  const structures = batches.map((b) => structuresOf(b, found.records, dumpsDir, { engine: core }));
  mkdirSync(opts.out, { recursive: true });
  mkdirSync(opts.structure, { recursive: true });
  const write = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  batches.forEach((b, i) => {
    write(join(opts.out, `${b.id}.json`), { ...b, vocabulary: "reread-vocabulary.json" });
    write(join(opts.structure, `${b.id}.structure.json`), structures[i]);
  });
  write(join(opts.out, "reread-vocabulary.json"), rereadVocabulary(core));
  const report = `${found.book.toLowerCase()}-${series}${restate ? "-restate" : ""}-report.json`;
  write(join(opts.out, report), rereadReport(found.book, batches, leftOut));
  for (const [why, n] of Object.entries(leftOut)) console.log(`left out: ${n} records (${why})`);
  console.log(`${batches.length} batches (${batches.reduce((n, b) => n + b.entries.length, 0)} entries) written to ${opts.out},`
    + ` structure files to ${opts.structure}`);
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

// A results file `{ batch, by, results }` with no other field, signed with a handle (`mode`: the agent stage, refused for an
// owner's handle, Ruling R23; undefined or --overwrite for the plain ingest), holding no key named __proto__, constructor or
// prototype. Usage errors otherwise (exit 2, nothing written).
function readResultsFile(file, mode) {
  const input = readJson(file, "results file");
  if (typeof input?.batch !== "string" || typeof input?.by !== "string" || !Array.isArray(input?.results)) {
    throw new UsageError(`${file}: must be { batch: string, by: string, results: [...] }`);
  }
  if ("overwrite" in input) throw new UsageError(`${file}: overwrite is not a results field: pass --overwrite to ingest`);
  const extra = Object.keys(input).filter((k) => !["batch", "by", "results"].includes(k));
  if (extra.length) throw new UsageError(`${file}: unknown field ${JSON.stringify(clip(extra[0]))}`);
  if (!isReaderHandle(input.by)) throw new UsageError(`${file}: by must match ${BY} and not be "rule"`);
  // Ruling R23: an owner settles the triage queue through the plain ingest (with or without --overwrite); the agent stages
  // (--second, --third, --draft, --review, --reread) never take an owner's file.
  if (isOwner(input.by) && mode !== undefined && mode !== "--overwrite") {
    throw new UsageError(`${file}: by ${JSON.stringify(clip(input.by))} is an owner of docs/owners.json: ${mode} is an`
      + " agent stage, its results file is signed with an agent handle (an owner settles the triage queue with plain ingest)");
  }
  const forbidden = forbiddenKeyIn(input);
  if (forbidden) {
    throw new UsageError(`${file}: a key named ${forbidden.split(/[.[]/).pop()} (at ${forbidden}): not a results file`);
  }
  return input;
}

// The keys a reread batch file offers, each with the fingerprint of the reading its entry was cut against: the batch id must
// be the results file's `batch`, `<book>-reread-<NNN>` (or `<book>-reread-second-<NNN>` with `second`), its stage `reread`,
// `second` and `restate` as the command says, and every entry a key of that book with a reading `{ core, sha }`.
function offeredRereads(id, file, second, restate = false) {
  const m = new RegExp(`^([a-z][a-z0-9]{1,9})-reread-${second ? "second-" : ""}(\\d{3,})$`).exec(String(id));
  const shape = second ? "<book>-reread-second-<NNN>" : "<book>-reread-<NNN>";
  if (!m) throw new UsageError(`batch ${JSON.stringify(clip(id))} is not a ${second ? "second " : ""}reread batch id (${shape})`);
  const batch = readJson(file, "batch file");
  if (batch?.id !== id || batch?.stage !== "reread" || (batch.second === true) !== second
    || (batch.restate === true) !== restate || !Array.isArray(batch?.entries)) {
    const marks = `${second ? ", second" : ""}${restate ? ", restate" : ""}`;
    throw new UsageError(`${file}: not the reread batch ${id} (its id, stage "reread"${marks} and entries; a restate batch`
      + " is ingested with --restate, and only it)");
  }
  const ok = (e) => typeof e?.key === "string" && e.key.startsWith(`${m[1]}:`) && e.reading !== null
    && typeof e.reading === "object" && typeof e.reading.sha === "string" && /^[0-9a-f]{64}$/.test(e.reading.sha);
  if (!batch.entries.every(ok)) {
    throw new UsageError(`${file}: every entry of ${id} must be a key of book ${m[1].toUpperCase()} with its reading`);
  }
  return { book: m[1].toUpperCase(), offered: new Map(batch.entries.map((e) => [e.key, e.reading])) };
}

// `ingest <results-file> --reread [--second] --batch <batch file>` (reread.mjs ingestRereads): a covered reading turns the
// record to `core` (and takes it out of drafts-queue.json), one that found something beyond the engine hints it
// `beyond-engine`; with `--second`, a second reading of a provisional `core` agrees or (fail closed: a disagreement or an
// unsure second reader) gives the record back its verdict; a record a second reader already settled is reported, not rejected.
// With `--restate` (a batch cut with --restate, Ruling R31), the restatable records are read again, the same reading
// notwithstanding, and the reread stored is marked `restated: true`.
// The engine's reading of each record is computed again (DAS_CORE, RULEPACK_DUMPS): a batch cut against another is stale.
async function ingestRereadCommand(args) {
  const usage = "Usage: ingest <results-file> --reread [--second | --restate] --batch <batch file>"
    + " (needs DAS_CORE, RULEPACK_DUMPS and RULEPACK_TEXT)";
  const others = ["--third", "--overwrite", "--settle-unsure", "--draft", "--review", "--min", "--redraft", "--reoffer"]
    .filter((m) => args.includes(m));
  if (others.length) throw new UsageError(`--reread and ${others.join(" and ")} cannot be used together`);
  const second = args.includes("--second");
  const restate = args.includes("--restate");
  if (second && restate) throw new UsageError("--restate and --second cannot be used together: a restate reads first rereads");
  const rest = [];
  let batchFile = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--batch") { batchFile = args[(i += 1)] ?? ""; continue; }
    if (!["--reread", "--second", "--restate"].includes(args[i])) rest.push(args[i]);
  }
  const [file, ...extraArgs] = rest;
  if (!file || extraArgs.length || !batchFile) {
    throw new UsageError(`${usage}\n--reread needs --batch <the batch file the results answer>`);
  }
  const textDir = need("RULEPACK_TEXT");
  const coreDir = need("DAS_CORE");
  const dumpsDir = need("RULEPACK_DUMPS");
  if (!existsSync(dumpsDir)) throw new UsageError(`RULEPACK_DUMPS points at a folder that does not exist: ${dumpsDir}`);
  const input = readResultsFile(file, "--reread");
  const { book, offered } = offeredRereads(input.batch, batchFile, second, restate);
  checkQueues(REGISTRY);
  const core = await loadCore(coreDir);
  const books = loadRegistry(REGISTRY);
  const all = books.flatMap((b) => b.records);
  const byKey = new Map(all.map((r) => [r.key, r]));
  const documentOf = officialMonsterDocuments(dumpsDir, book);
  const current = new Map();
  for (const key of new Set(input.results.map((r) => r?.key).filter((k) => typeof k === "string" && offered.has(k)))) {
    const record = byKey.get(key);
    const doc = record ? documentOf(record) : null;
    if (!doc) continue;
    const actorId = String(officialItemOf(record).docId).split(".")[0];
    current.set(key, { reading: engineReading(doc, core, { actorId }), structure: structureOf(doc) });
  }
  const out = ingestRereads(all, input.results, {
    textDir, by: input.by, core, offered, current, second, restate, draftsQueue: loadQueue(REGISTRY, "drafts"),
    reviewQueued: new Set(loadQueue(REGISTRY, "review").map((q) => q.key)), triageQueued: queuedKeys(REGISTRY)
  });
  const changed = second ? [...out.agreed, ...out.disagreed, ...out.unsureReverted] : [...out.covered, ...out.beyond];
  if (!commitIngest(books, out.records, changed, [], second ? [] : out.dequeued, { queue: "drafts" })) return;
  const counts = second
    ? { agreed: out.agreed.length, disagreed: out.disagreed.length, "unsure-reverted": out.unsureReverted.length,
      "already confirmed": out.alreadyConfirmed.length, "already reverted": out.alreadyReverted.length, rejected: out.rejected }
    : { covered: out.covered.length, beyond: out.beyond.length, unsure: out.unsure, dequeued: out.dequeued.length,
      rejected: out.rejected };
  console.log(JSON.stringify(counts, null, 2));
  const reverted = second ? out.disagreed.length + out.unsureReverted.length : 0;
  if (reverted) {
    console.error(`${reverted} record(s) back to entry: their drafts-queue entries are not restored (draftable again)`);
  }
  if (out.rejected.length) process.exitCode = 1;
}

// `--overwrite` is the person's decision, given on the command line: a results file cannot carry it.
async function ingestCommand(args) {
  if (args.includes("--reread")) return ingestRereadCommand(args);
  const usage = "Usage: ingest <results-file> [--overwrite | --second | --third"
    + " | --draft [--redraft [--against-reviews] | --reoffer] --batch <batch file>"
    + " | --review [--second] --batch <batch file> | --reread [--second | --restate] --batch <batch file>]"
    + " | ingest --settle-unsure [--min <n>]"
    + " (--draft and --review need RULEPACK_DUMPS: the official item's structure backs a condition and gives the item's"
    + " own damage, Ruling R24)";
  // Ruling R40: `--review --second` takes the results of a batch cut with `batch review --second`, and only those.
  const reviewSecond = args.includes("--review") && args.includes("--second");
  const modes = ["--third", "--second", "--overwrite", "--settle-unsure", "--draft", "--review"]
    .filter((m) => args.includes(m) && !(reviewSecond && m === "--second"));
  if (modes.length > 1) throw new UsageError(`${modes.join(" and ")} cannot be used together`);
  const [mode] = modes;
  // Ruling R32: `--redraft` takes the results of a batch cut with `batch draft --redraft`, and only those.
  const redraft = args.includes("--redraft");
  if (redraft && mode !== "--draft") throw new UsageError(`--redraft goes with --draft only\n${usage}`);
  // Ruling R39: `--reoffer` takes the results of a batch cut with `batch draft --reoffer`, and only those.
  const reoffer = args.includes("--reoffer");
  if (reoffer && mode !== "--draft") throw new UsageError(`--reoffer goes with --draft only\n${usage}`);
  if (reoffer && redraft) throw new UsageError(`--reoffer and --redraft cannot be used together\n${usage}`);
  // Ruling R41: `--against-reviews` takes the results of a batch cut with `batch draft --redraft --against-reviews`, only.
  const against = args.includes("--against-reviews");
  if (against && !(mode === "--draft" && redraft)) {
    throw new UsageError(`--against-reviews goes with --draft --redraft only\n${usage}`);
  }
  const rest = [];
  let min = null;
  let batchFile = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--min") { min = args[(i += 1)] ?? ""; continue; }
    if (args[i] === "--batch") { batchFile = args[(i += 1)] ?? ""; continue; }
    const flags = ["--redraft", "--reoffer", "--against-reviews", ...(reviewSecond ? ["--second"] : [])];
    if (!modes.includes(args[i]) && !flags.includes(args[i])) {
      rest.push(args[i]);
    }
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
  const input = readResultsFile(file, mode);
  const owner = isOwner(input.by);
  if (mode === "--draft") {
    // Fix round 1 (Ruling R24): a stated condition is checked against the official item's structure, read from the dumps.
    const dumpsDir = need("RULEPACK_DUMPS");
    if (!existsSync(dumpsDir)) throw new UsageError(`RULEPACK_DUMPS points at a folder that does not exist: ${dumpsDir}`);
    const offered = offeredKeys(input.batch, batchFile, { redraft, reoffer, against });
    return ingestDraftCommand(input, { textDir, core: await loadCore(coreDir), offered, redraft, reoffer, against });
  }
  if (mode === "--review") {
    // Ruling R24: the baseline is decided from the official item's structure, read from the dumps as `batch review` does.
    const dumpsDir = need("RULEPACK_DUMPS");
    if (!existsSync(dumpsDir)) throw new UsageError(`RULEPACK_DUMPS points at a folder that does not exist: ${dumpsDir}`);
    const offered = offeredReviews(input.batch, batchFile, reviewSecond);
    return ingestReviewCommand(input, { textDir, core: await loadCore(coreDir), offered, dumpsDir, second: reviewSecond });
  }
  const { entryKeys } = await loadCore(coreDir);
  const books = loadRegistry(REGISTRY);
  if (second) return ingestSecondCommand(books, input, { textDir, entryKeys });
  if (third) return ingestThirdCommand(books, input, { textDir, entryKeys });
  const out = ingest(books.flatMap((b) => b.records), input.results, {
    textDir, by: input.by, overwrite, entryKeys, queue: queueEntries(REGISTRY), owner
  });
  if (!commitIngest(books, out.records, out.applied, out.queued, out.applied)) return;
  // Ruling R25: the partial rules applied (with `leaves`) are listed so that the owner can read them.
  console.log(JSON.stringify({ applied: out.applied.length, partial: out.partial, queued: out.queued.length,
    rejected: out.rejected }, null, 2));
  if (out.rejected.length) process.exitCode = 1;
}

// `ingest <results-file> --draft`: drafted rules. Applied rules are written with the state `drafted` (`gates` decides the rest);
// person, code and engine outcomes and low-confidence rules go to registry/drafts-queue.json; books and that queue are saved in
// one step. A monster feature needs the actors of its book's package (RULEPACK_DUMPS) to tell a shared embedded id.
// The keys a draft batch file offers: its id must be the results file's `batch`, of the form `<book>-draft-<NNN>`, its stage
// `draft`, and every entry a key of that book.
function offeredKeys(id, file, { redraft = false, reoffer = false, against = false } = {}) {
  const m = /^([a-z][a-z0-9]{1,9})-draft-(\d{3,})$/.exec(String(id));
  if (!m) throw new UsageError(`batch ${JSON.stringify(clip(id))} is not a draft batch id (<book>-draft-<NNN>)`);
  const batch = readJson(file, "batch file");
  if (batch?.id !== id || batch?.stage !== "draft" || !Array.isArray(batch?.entries)) {
    throw new UsageError(`${file}: not the draft batch ${id} (its id, stage "draft" and entries)`);
  }
  if ((batch.redraft === true) !== redraft) {
    throw new UsageError(`${file}: ${redraft ? "not a redraft batch" : "a redraft batch"} (a batch cut with --redraft is`
      + " ingested with --draft --redraft, and only it)");
  }
  if ((batch.againstReviews === true) !== against) {
    throw new UsageError(`${file}: ${against ? "not an against-reviews batch" : "an against-reviews batch"} (a batch cut with`
      + " --redraft --against-reviews is ingested with --draft --redraft --against-reviews, and only it)");
  }
  if ((batch.reoffer === true) !== reoffer) {
    throw new UsageError(`${file}: ${reoffer ? "not a reoffer batch" : "a reoffer batch"} (a batch cut with --reoffer is`
      + " ingested with --draft --reoffer, and only it)");
  }
  const keys = batch.entries.map((e) => e?.key);
  if (!keys.every((k) => typeof k === "string" && k.startsWith(`${m[1]}:`))) {
    throw new UsageError(`${file}: every entry of ${id} must be a key of book ${m[1].toUpperCase()}`);
  }
  return new Set(keys);
}

function ingestDraftCommand(input, { textDir, core, offered, redraft = false, reoffer = false, against = false }) {
  checkQueues(REGISTRY);
  const books = loadRegistry(REGISTRY);
  const all = books.flatMap((b) => b.records);
  const keys = new Set(input.results.map((r) => r?.key).filter((k) => offered.has(k)));
  const monsterBooks = [...new Set(all.filter((r) => r.kind === "monster" && keys.has(r.key)).map((r) => r.book))];
  const embedded = new Map();
  const dumpsDir = need("RULEPACK_DUMPS");
  if (monsterBooks.length) {
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
  // Ruling R32: a redraft decides on the comparison with the engine's reading computed now, as the cut did.
  const redrafting = redraft && !against ? { redraft, reviewQueued: new Set(loadQueue(REGISTRY, "review").map((q) => q.key)),
    readingOf: currentReadingFor(all.filter((r) => keys.has(r.key)), dumpsDir, core) } : {};
  // Ruling R41: decided on review-queue.json as it is; the new rule is compared with both reviews it stores.
  const againstReviews = against
    ? { redraft: true, againstReviews: true, reviewQueue: loadQueue(REGISTRY, "review"), owners: ownerHandles() } : {};
  const out = ingestDrafts(all, input.results, {
    textDir, by: input.by, core, queue: loadQueue(REGISTRY, "drafts"), embedded, offered,
    structures: officialStructures(all, [...keys], dumpsDir), ...redrafting, ...againstReviews,
    ...(reoffer ? { reoffer, owners: ownerHandles() } : {})
  });
  if (against) return againstReviewsDone(books, out);
  // A redraft that goes to a person changes its record (the old rule is removed) and queues it.
  const changed = [...out.applied, ...out.unruled];
  // Ruling R39: an applied reoffer leaves the queue; every other offered entry is written back as it was, marked.
  const queuedNow = reoffer ? out.marked : out.queued;
  if (!commitIngest(books, out.records, changed, queuedNow, out.applied, { queue: "drafts" })) return;
  const counts = reoffer ? { declined: out.declined.length, marked: out.marked.length } : { queued: out.queued.length };
  console.log(JSON.stringify({ applied: out.applied.length, ...counts,
    ...(redraft ? { unruled: out.unruled.length } : {}), rejected: out.rejected }, null, 2));
  if (out.rejected.length) process.exitCode = 1;
}

// Ruling R41: a redraft against two reviews saved in one step: every new rule written; a confirmed one's entry leaves
// review-queue.json, a kept one's is written brought up to date, and every other offered entry as it was, marked.
function againstReviewsDone(books, out) {
  const entries = [...out.kept, ...out.marked];
  if (!commitIngest(books, out.records, out.applied, entries, out.confirmed, { queue: "review" })) return;
  const tolerated = out.records.filter((r) => out.confirmed.includes(r.key)
    && (r.evidence.reviewed.tolerated || r.evidence.reviewed.second.tolerated)).length;
  console.log(JSON.stringify({ applied: out.applied.length, confirmed: out.confirmed.length,
    confirmedExact: out.confirmed.length - tolerated, confirmedTolerated: tolerated, partial: out.partial,
    kept: out.kept.length, declined: out.declined.length, marked: out.marked.length, regate: out.confirmed,
    rejected: out.rejected }, null, 2));
  if (out.applied.length) {
    console.error(`${out.applied.length} rule(s) replaced: run npm run gates (they stay drafted until the gates pass on the`
      + " new rule)");
  }
  if (out.rejected.length) process.exitCode = 1;
}

// The keys a review batch file offers, each with the fingerprint of the rule its entry carried: the batch id must be the results
// file's `batch`, of the form `<book>-review-<NNN>`, its stage `review`, every entry a key of that book with a 64-hex `rule`.
// With `second` (Ruling R40) the id is `<book>-review-second-<NNN>` and the batch must carry `second: true`; without it, a
// batch so marked is refused.
function offeredReviews(id, file, second = false) {
  const m = new RegExp(`^([a-z][a-z0-9]{1,9})-review-${second ? "second-" : ""}(\\d{3,})$`).exec(String(id));
  const shape = second ? "<book>-review-second-<NNN>" : "<book>-review-<NNN>";
  if (!m) throw new UsageError(`batch ${JSON.stringify(clip(id))} is not a ${second ? "second " : ""}review batch id (${shape})`);
  const batch = readJson(file, "batch file");
  if (batch?.id !== id || batch?.stage !== "review" || !Array.isArray(batch?.entries)) {
    throw new UsageError(`${file}: not the review batch ${id} (its id, stage "review" and entries)`);
  }
  if ((batch.second === true) !== second) {
    throw new UsageError(`${file}: ${second ? "not a second review batch" : "a second review batch"} (a batch cut with`
      + " batch review --second is ingested with --review --second, and only it)");
  }
  const ok = (e) => typeof e?.key === "string" && e.key.startsWith(`${m[1]}:`) && typeof e.rule === "string"
    && /^[0-9a-f]{64}$/.test(e.rule);
  if (!batch.entries.every(ok)) {
    throw new UsageError(`${file}: every entry of ${id} must be a key of book ${m[1].toUpperCase()} with its rule fingerprint`);
  }
  return new Map(batch.entries.map((e) => [e.key, e.rule]));
}

// The official item's structure (structure.mjs structureOf, as a batch's structure file holds it) of each record of `keys`,
// a Map of key to structure; a record whose official document is not in the dumps has none.
function officialStructures(records, keys, dumpsDir, { reach = false } = {}) {
  const wanted = new Set(keys);
  const structures = new Map();
  for (const [book, ofBook] of groupBy(records.filter((r) => wanted.has(r.key)), (r) => r.book)) {
    const { entries } = structuresOf({ id: book, entries: ofBook.map((r) => ({ key: r.key })) }, ofBook, dumpsDir,
      { rulable: true, reach });
    for (const [key, perOrigin] of Object.entries(entries)) if (perOrigin.official) structures.set(key, perOrigin.official);
  }
  return structures;
}

// `ingest <results-file> --review --batch <batch file>`: independent reviews. Agreements write `evidence.reviewed`; the rest
// (disagreement, free text, low confidence, a draft stamped for a person) goes to registry/review-queue.json; books and that
// queue are saved in one step.
function ingestReviewCommand(input, { textDir, core, offered, dumpsDir, second = false }) {
  checkQueues(REGISTRY);
  const books = loadRegistry(REGISTRY);
  const all = books.flatMap((b) => b.records);
  // The official structure of every record the results answer (the same data the batch's structure file gave the reviewer).
  const keys = input.results.map((r) => r?.key).filter((k) => typeof k === "string" && offered.has(k));
  const structures = officialStructures(all, keys, dumpsDir);
  const out = ingestReviews(all, input.results, {
    textDir, by: input.by, core, queue: loadQueue(REGISTRY, "review"), offered, structures,
    ...(second ? { second, owners: ownerHandles() } : {})
  });
  if (second) return secondReviewDone(books, out);
  if (!commitIngest(books, out.records, out.agreed, out.disagreed, out.agreed, { queue: "review" })) return;
  const reasons = {};
  for (const q of out.disagreed) reasons[q.reason] = (reasons[q.reason] ?? 0) + 1;
  // Ruling R24: an agreement that tolerated anything stores it in evidence.reviewed.tolerated, which the gates fingerprint
  // (emits): those records are `drafted` until `npm run gates` runs again, and counted apart from exact agreements.
  console.log(JSON.stringify({ agreed: out.agreed.length, agreedExact: out.agreed.length - out.tolerated.length,
    agreedTolerated: out.tolerated.length, regate: out.tolerated, partial: out.partial, queued: out.disagreed.length, reasons,
    rejected: out.rejected }, null, 2));
  if (out.tolerated.length) {
    console.error(`${out.tolerated.length} agreement(s) used Ruling R24 tolerances: run npm run gates (they stay drafted until`
      + " the gates pass again on evidence.reviewed.tolerated)");
  }
  if (out.rejected.length) process.exitCode = 1;
}

// Ruling R40: the second review's outcome saved in one step: a confirmed rule leaves review-queue.json, every other offered
// entry still open to it is written back as it was plus its `second` mark.
function secondReviewDone(books, out) {
  if (!commitIngest(books, out.records, out.agreed, out.marked, out.agreed, { queue: "review" })) return;
  console.log(JSON.stringify({ confirmed: out.agreed.length, confirmedExact: out.agreed.length - out.tolerated.length,
    confirmedTolerated: out.tolerated.length, regate: out.tolerated, partial: out.partial, marked: out.marked.length,
    withFirst: out.marked.filter((q) => q.second.withFirst === true).length, rejected: out.rejected }, null, 2));
  if (out.tolerated.length) {
    console.error(`${out.tolerated.length} confirmation(s) used Ruling R24 tolerances: run npm run gates (they stay drafted`
      + " until the gates pass again on evidence.reviewed.tolerated)");
  }
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
  // The official item's structure, with each activity's reach: the rolls its effects are applied on, its damage types, its
  // activity kinds and templates, how far a pull may start (scenarios.mjs scenarioOf).
  const scenarioRecords = records.filter((r) => SCENARIO_STATES.includes(stateOf(r)));
  const structures = officialStructures(scenarioRecords, scenarioRecords.map((r) => r.key), dumpsDir, { reach: true });
  const scenarioFor = (r) => scenarioOf(r, { packOf, structure: structures.get(r.key) ?? null });
  if (modes[0] === "--plan") {
    const order = planOf(records, { packOf, structures });
    const manual = order.filter((p) => p.manual).length;
    const manualShare = `${order.length ? Math.round((100 * manual) / order.length) : 0}%`;
    return console.log(JSON.stringify({ scenarios: order.length, manual, manualShare, order }, null, 2));
  }

  const playable = records.filter((r) => SCENARIO_STATES.includes(stateOf(r)));
  const ids = groupBy(playable, scenarioIdOf);
  const clash = [...ids].find(([, list]) => list.length > 1);
  if (clash) throw new UsageError(`${clash[1].map((r) => r.key).join(" and ")} make one scenario id ${clash[0]}`);
  const expected = new Map(playable.flatMap((r) => scenarioFiles(scenarioFor(r))));
  const dir = join(PLAY, book.toLowerCase());
  const present = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(json|mjs)$/.test(f)) : [];
  const orphan = present.map((f) => `${book.toLowerCase()}/${f}`).filter((p) => !expected.has(p));
  const changed = [...expected].filter(([p, text]) => {
    const file = join(PLAY, p);
    return !existsSync(file) || readFileSync(file, "utf8") !== text;
  }).map(([p]) => p);
  const manual = playable.filter((r) => scenarioFor(r).manual).map((r) => r.key);
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
