// The re-reading stage ("reread"). Triage gave the verdict `entry` ("needs a rule written in this pack") to monster features
// without knowing that DAS · Core reads monster features from their English text by itself (Ruling R29: the engine's own
// reading, `engineReads`, engine-reading.mjs). A reader blind to every earlier verdict, reason and drafter answer compares
// the text with that reading and says whether the text asks, in combat, for anything beyond the item's own data and the
// reading. The tools cut the batches and take what the reader wrote; they never call a model.
//
// - covered (confidence at least QUEUE_THRESHOLD): the verdict becomes `core`, set by rule with a fixed why (REREAD_WHY); the
//   previous verdict is kept in `evidence.triaged.was` (the pre-pass's shape) and the reader, the confidence and the
//   fingerprint of the reading judged in `evidence.triaged.reread`, `provisional` until a second, blind reread agrees;
//   the record leaves drafts-queue.json (it needs no rule).
// - beyond (at least the threshold): the verdict stays `entry`, the record gains `hint: "beyond-engine"` and what the reader
//   found missing in `evidence.triaged.reread`, as data: `beyond`, assertions of the closed vocabulary of assert.mjs, and/or
//   `unexpressed`, reasons of leaves.mjs LEAVE_REASONS for what no assertion can state.
// - below the threshold: nothing changes; the record can be cut again.
// A second reread of a provisional `core` fails closed: anything but an agreeing covered answer at the threshold (something
// beyond, something unexpressed, or an unsure answer, whatever it says) gives the record back its previous verdict.
// A restate (Ruling R31) reads ONCE more a first reread that found only what the vocabulary could not state then
// (`unexpressed` names a reason of RESTATABLE, which trigger conditions now state, Ruling R30), the same reading
// notwithstanding; the reread it stores carries `restated: true`, so a restate never cuts it again.
import { createHash } from "node:crypto";
import { canonical, groupBy, validateRecord } from "./registry.mjs";
import { BY, REREAD_BEYOND_MAX, REREAD_WHY, isReaderHandle, unexpressedProblem } from "./schema.mjs";
import { assertProblems, atomise, impliedAsserts, normaliseAssert, sameUpToDetail } from "./assert.mjs";
import {
  QUEUE_THRESHOLD, cachedText, clip, clipEchoes, confidenceProblem, echo, forbiddenKeyIn, unknownFields, whyProblem, whyQuotes
} from "./intake.mjs";

export { REREAD_WHY, REREAD_BEYOND_MAX };
export const REREAD_BATCH_SIZE = 30;
/** The fields of one reread result (docs/PIPELINE.md, "Brief for a reread agent"): nothing else is taken. */
export const REREAD_RESULT_FIELDS = Object.freeze(["key", "covered", "beyond", "unexpressed", "why", "confidence"]);
/** The outcome a second reread below the threshold records (`evidence.triaged.reread.second.outcome`). */
export const SECOND_UNSURE = "second-unsure";
/** The `unexpressed` reasons the vocabulary states since trigger conditions (Ruling R30): a restate reads them again (R31). */
export const RESTATABLE = Object.freeze(["target-size", "target-state", "trigger-filter"]);
const SHOWN_PROBLEMS = 4;
const SHOWN_PROBLEM_CHARS = 200;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isReading = (v) => isObject(v) && Object.keys(v).length > 0;

/**
 * The fingerprint of an engine reading: `{ core, sha }`, the engine version and the SHA-256 of the reading's canonical form
 * (key order aside). A later engine that reads the feature differently gives another `sha`, so a reread judged against the
 * older reading is visibly stale; the version alone changing, with the same reading, is not.
 */
export const readingFingerprint = (reading, core) => ({
  core: core?.version, sha: createHash("sha256").update(canonical(reading ?? null)).digest("hex")
});
const sameSha = (a, b) => isObject(a) && isObject(b) && typeof a.sha === "string" && a.sha === b.sha;

/** The reread of a record (`evidence.triaged.reread`), or null. */
export const rereadOf = (r) => (isObject(r?.evidence?.triaged?.reread) ? r.evidence.triaged.reread : null);
// A covered first reread that no second one has read yet.
const isProvisionalCore = (r) => r?.verdict === "core" && rereadOf(r)?.covered === true && rereadOf(r).provisional === true
  && !Object.hasOwn(rereadOf(r), "second");
// A covered first reread a second reader has settled: confirmed (an agreeing second, the verdict `core`) or reverted (any
// other second, the verdict back to what it was), or null.
const settledBySecond = (r) => {
  const reread = rereadOf(r);
  if (reread?.covered !== true || !isObject(reread.second)) return null;
  if (reread.second.covered === true) return r.verdict === "core" ? "confirmed" : null;
  return r.verdict !== "core" ? "reverted" : null;
};
/**
 * The assertions a reread found beyond the engine's reading of a record (the `beyond` of the reading that said so: the
 * first's, or the second's when it disagreed with a covered first), or null when none did (an `unexpressed` alone, or a
 * second reader unsure, names no assertion).
 */
export function beyondOf(r) {
  const reread = rereadOf(r);
  if (!reread) return null;
  if (reread.covered === false && Array.isArray(reread.beyond)) return reread.beyond;
  if (reread.covered === true && reread.second?.covered === false && Array.isArray(reread.second.beyond)) {
    return reread.second.beyond;
  }
  return null;
}

/**
 * Whether a record's first reread can be restated (Ruling R31): `covered: false`, its `unexpressed` names a reason of
 * RESTATABLE, and it is not itself a restate (`restated: true`).
 */
export function restatable(r) {
  const reread = rereadOf(r);
  return reread !== null && reread.covered === false && reread.restated !== true && Array.isArray(reread.unexpressed)
    && reread.unexpressed.some((x) => RESTATABLE.includes(x));
}
const refuseRestateSecond = ({ restate, second }) => {
  if (restate && second) throw new Error("restate and second cannot be used together: a restate reads first rereads only");
};

const officialOf = (r) => (Array.isArray(r?.items) ? r.items : []).find((i) => i?.origin === "official" && i.match === "matched");
// What a reader needs besides the text, as a triage entry gives it (batch.mjs): never the hint, nor anything of a verdict.
const READER_FIELDS = ["owner", "level", "section", "rarity", "page", "srd"];
const summary = ({ data, ...item }) => item;
const entryOf = (r, fp) => ({
  key: r.key, name: r.name, kind: r.kind, edition: r.edition, textSha: r.text.sha256,
  ...Object.fromEntries(READER_FIELDS.filter((f) => r[f] !== undefined && r[f] !== null).map((f) => [f, r[f]])),
  items: r.items.map(summary), reading: { core: fp.core, sha: fp.sha }
});

/**
 * Why a record is not cut into a reread batch, or null when it is. First reread: only a monster feature with the verdict
 * `entry` is a candidate (any other record: "not a monster entry"); it is left out when it has a rule, is legacy, waits in
 * review-queue.json (`reviewQueued`) or queue.json (`triageQueued`), has no text or no matched official item, its item is not
 * in the dumps (`readingOf(record)` undefined), the engine reads nothing of it (null or empty), or a reread already judged it
 * against the reading of today. A record in drafts-queue.json is a candidate. Second reread (`second`): only a provisional
 * `core` of a first reread, left out when a second reader settled it, either way ("second reread done") or the engine reads it
 * otherwise now. Restate (`restate`, Ruling R31): only a restatable record is a candidate ("not restatable" otherwise), and
 * a reread for the reading of today does not leave it out; every other check holds. `restate` with `second` throws.
 */
export function rereadSkipReason(r, options) {
  const { readingOf, reviewQueued = new Set(), triageQueued = new Set(), second = false, restate = false, core } = options;
  refuseRestateSecond(options);
  if (second) {
    // A record a second reader settled, either way (confirmed, or back to entry), is never cut again.
    if (r?.kind !== "monster" || rereadOf(r)?.covered !== true) return "not a reread core";
    if (Object.hasOwn(rereadOf(r), "second")) return "second reread done";
    if (r.verdict !== "core") return "not a reread core";
  } else {
    if (r?.kind !== "monster" || r.verdict !== "entry") return "not a monster entry";
    if (restate && !restatable(r)) return "not restatable";
    if (r.rule) return "already ruled";
    if (r.legacy === true) return "legacy";
    if (reviewQueued.has(r.key)) return "in review-queue.json";
    if (triageQueued.has(r.key)) return "in queue.json";
  }
  if (!r.text) return "no text";
  if (!officialOf(r)) return "no matched official item";
  const reading = readingOf(r);
  if (reading === undefined) return "official item not in the dumps";
  if (!isReading(reading)) return "engine reads nothing";
  const fp = readingFingerprint(reading, core);
  if (second) return sameSha(rereadOf(r).reading, fp) ? null : "reading changed since the first reread";
  return !restate && sameSha(rereadOf(r)?.reading, fp) ? "reread for the current reading" : null;
}

/**
 * Reread batches `{ id, stage: "reread", second?, restate?, core, entries }` (ids `<book>-reread-<NNN>`, a restate's too,
 * or `<book>-reread-second-<NNN>` for a second reread, numbered after `after`), and `leftOut`, the count of each reason a
 * candidate was left out. `readingOf` gives the engine's reading of a record's official item (undefined when it is not in the
 * dumps); `core` is loadCore's (its version names the reading).
 */
export function cutRereadBatches(records, options) {
  const { size = REREAD_BATCH_SIZE, after = {}, readingOf, core, second = false, restate = false } = options;
  refuseRestateSecond(options);
  if (typeof readingOf !== "function") throw new TypeError("cutRereadBatches needs readingOf (the engine's reading, R29)");
  const leftOut = {};
  const open = [];
  for (const r of records) {
    const why = rereadSkipReason(r, options);
    if (why === null) open.push(r);
    else if (why !== "not a monster entry" && why !== "not a reread core") leftOut[why] = (leftOut[why] ?? 0) + 1;
  }
  const series = second ? "reread-second" : "reread";
  const batches = [];
  const counts = new Map(Object.entries(after));
  for (const [book, ofBook] of groupBy(open, (r) => r.book.toLowerCase())) {
    for (let i = 0; i < ofBook.length; i += size) {
      const n = (counts.get(book) ?? 0) + 1;
      counts.set(book, n);
      const id = `${book}-${series}-${String(n).padStart(3, "0")}`;
      const entries = ofBook.slice(i, i + size).map((r) => entryOf(r, readingFingerprint(readingOf(r), core)));
      const mark = second ? { second: true } : restate ? { restate: true } : {};
      batches.push({ id, stage: "reread", ...mark, core: core?.version, entries });
    }
  }
  return { batches, leftOut: Object.fromEntries(Object.entries(leftOut).sort()) };
}

/** `<book>-reread-report.json`: counts only (no key, no name): the batches, the entries cut, each reason left out. */
export const rereadReport = (book, batches, leftOut) => ({
  book, batches: batches.length, cut: batches.reduce((n, b) => n + b.entries.length, 0),
  leftOut: Object.fromEntries(Object.entries(leftOut).sort())
});

/**
 * The assertions the item's own data already makes true (the written criteria: a rider the data does is not "beyond"): the
 * statuses of its effects on the roll that applies them, the full damage of an attack on a hit and of a save on a failed
 * save, and the half or no damage its `onSave` gives on a saved save. Canonical, from the official structure.
 */
export function itemAsserts(structure) {
  const activities = Array.isArray(structure?.activities) ? structure.activities : [];
  const effects = Array.isArray(structure?.effects) ? structure.effects : [];
  const entry = {
    effectStatuses: Object.fromEntries(effects.filter((e) => Array.isArray(e?.statuses) && e.statuses.length)
      .map((e) => [e.id, [...e.statuses]])),
    saveDamage: Object.fromEntries(activities.filter((a) => a?.type === "save" && ["half", "none"].includes(a.onSave))
      .map((a) => [a.id, a.onSave]))
  };
  const full = activities.filter((a) => Array.isArray(a?.damage) && a.damage.length && ["attack", "save"].includes(a?.type))
    .flatMap((a) => {
      const roll = a.type === "attack" ? "hit" : "failedSave";
      const types = [...new Set(a.damage.flatMap((p) => (Array.isArray(p?.types) ? p.types : [])))].sort();
      return types.length ? types.map((type) => ({ given: { roll }, expect: { damage: { fraction: 1, type } } }))
        : [{ given: { roll }, expect: { damage: { fraction: 1 } } }];
    });
  return [...new Set([...impliedAsserts(entry, { structure }), ...normaliseAssert(full)])].sort();
}

// Why `beyond` cannot stand, or null: a non-empty list of at most REREAD_BEYOND_MAX assertions of the closed vocabulary as an
// agent writes them (assertProblems with `agent`: no `excludes`, no free-only assertion), with no `free` at all (it is stored
// as data and handed to drafters), none of whose atoms the engine's reading already implies (impliedAsserts of the reading,
// with the item's structure) or the item's own data already does (itemAsserts): those are not beyond.
function beyondProblem(beyond, { reading, structure, core }) {
  if (!Array.isArray(beyond) || !beyond.length) return "beyond: at least one assertion is required with covered: false";
  if (beyond.length > REREAD_BEYOND_MAX) return `beyond: at most ${REREAD_BEYOND_MAX} assertions`;
  const problems = assertProblems(beyond, { vocabulary: core, at: "beyond", agent: true, origins: ["official"] });
  if (problems.length) {
    const shown = problems.slice(0, SHOWN_PROBLEMS).map((p) => p.slice(0, SHOWN_PROBLEM_CHARS));
    return `${shown.join("; ")}${problems.length > SHOWN_PROBLEMS ? ` (and ${problems.length - SHOWN_PROBLEMS} more)` : ""}`;
  }
  const free = beyond.findIndex((a) => ["given", "expect"].some((p) => Object.hasOwn(a[p], "free")));
  if (free >= 0) return `beyond[${free}]: no free text: a reread states what is beyond the engine as data only`;
  const implied = impliedAsserts(reading, { structure });
  const item = itemAsserts(structure);
  for (const [i, a] of beyond.entries()) {
    for (const atom of normaliseAssert(atomise([a]))) {
      const engine = implied.find((c) => sameUpToDetail(c, atom));
      if (engine) return `beyond[${i}]: the engine's reading already implies it (${clip(engine)}): it is not beyond`;
      const own = item.find((c) => sameUpToDetail(c, atom));
      if (own) return `beyond[${i}]: the item's own data already does it (${clip(own)}): it is not beyond`;
    }
  }
  return null;
}

// The triage evidence a reread starts from: the reader's (an older reread left out: this one supersedes it), or null.
function readerTriaged(r) {
  const triaged = r?.evidence?.triaged;
  if (!isObject(triaged)) return null;
  const { reread, ...rest } = triaged;
  return Object.keys(rest).length ? rest : null;
}

// What a `covered: false` answer found missing, or why it cannot stand: `beyond` (assertions), `unexpressed` (reasons of
// LEAVE_REASONS), or both; one of them at least.
function missingProblem(result, ctx) {
  const hasBeyond = Object.hasOwn(result, "beyond");
  const hasUnexpressed = Object.hasOwn(result, "unexpressed");
  if (!hasBeyond && !hasUnexpressed) {
    return "covered: false needs beyond (assertions) or unexpressed (reasons the vocabulary cannot state), or both";
  }
  if (hasBeyond) {
    const problem = beyondProblem(result.beyond, ctx);
    if (problem) return problem;
  }
  return hasUnexpressed ? unexpressedProblem(result.unexpressed) : null;
}

// One result: `{ reject }`, `{ unsure }`, `{ already }` (a second reread a second reader settled: confirmed or reverted), or
// `{ apply: { next, outcome } }` (outcome: covered, beyond, agreed, disagreed, unsureReverted).
function takeResult(result, ctx) {
  const { byKey, offered, current, textOf, core, by, at, seen, second, restate, reviewQueued, triageQueued } = ctx;
  if (!isObject(result)) return { reject: "result must be an object" };
  const forbidden = forbiddenKeyIn(result);
  if (forbidden) return { reject: `a key named ${forbidden.split(/[.[]/).pop()} (at ${forbidden})` };
  const extra = unknownFields(result, REREAD_RESULT_FIELDS);
  if (extra.length) return { reject: `unknown field ${echo(extra[0])}` };
  if (seen.has(result.key)) return { reject: "the key appears twice in this file" };
  seen.add(result.key);
  const record = byKey.get(result.key);
  if (!record) return { reject: `unknown key ${echo(result.key)}` };
  if (!offered.has(result.key)) return { reject: "not offered by this batch (its key is not an entry of the batch file)" };
  if (second && record.kind === "monster" && settledBySecond(record)) return { already: settledBySecond(record) };
  if (second) {
    if (!isProvisionalCore(record)) return { reject: "not a provisional core of a first reread: a second reread reads only those" };
    if (rereadOf(record).by.toLowerCase() === by.toLowerCase()) {
      return { reject: "the second rereader must be another reader than the first (case aside)" };
    }
  } else {
    if (record.kind !== "monster") return { reject: "not a monster feature: a reread reads monster features only" };
    if (record.rule) return { reject: "the record has a rule: its comparison with the reading is the gates' (evidence.reading)" };
    if (record.legacy === true) return { reject: "legacy record: it leaves legacy through a person" };
    if (record.verdict !== "entry") return { reject: `the verdict is ${record.verdict}, not entry: a reread reads entry records` };
    if (restate && !restatable(record)) {
      return { reject: `not restatable: a restate reads a first reread whose unexpressed names ${RESTATABLE.join(", ")},`
        + " once (Ruling R31)" };
    }
    if (reviewQueued.has(record.key)) return { reject: "the record waits for a person in review-queue.json" };
    if (triageQueued.has(record.key)) return { reject: "the record waits for a person in queue.json" };
  }
  const now = current.get(result.key);
  if (!now) return { reject: "the official item is not in the dumps: no reading to judge against" };
  if (!isReading(now.reading)) return { reject: "the engine reads nothing of the item now: there is nothing to reread" };
  const fp = readingFingerprint(now.reading, core);
  if (!sameSha(offered.get(result.key), fp)) {
    return { reject: "stale: the engine reads the item differently than when the batch was cut (cut a new reread batch)" };
  }
  if (second && !sameSha(rereadOf(record).reading, fp)) {
    return { reject: "stale: the first reread judged another reading (cut a new reread batch)" };
  }
  if (!second && !restate && sameSha(rereadOf(record)?.reading, fp)) {
    return { reject: "already reread for this reading: only an unsure or stale reread is read again" };
  }
  if (typeof result.covered !== "boolean") return { reject: "covered must be true or false" };
  if (result.covered && Object.hasOwn(result, "beyond")) return { reject: "covered: true carries no beyond" };
  if (result.covered && Object.hasOwn(result, "unexpressed")) return { reject: "covered: true carries no unexpressed" };
  const unfit = confidenceProblem(result.confidence) ?? whyProblem(result.why);
  if (unfit) return { reject: unfit };
  if (!result.covered) {
    const problem = missingProblem(result, { reading: now.reading, structure: now.structure ?? null, core });
    if (problem) return { reject: problem };
  }
  const text = textOf(record);
  if (text === null) return { reject: "no text in the cache: nothing to check the result against" };
  const quoted = whyQuotes(result.why, text);
  if (quoted) return { reject: quoted };
  const unsure = result.confidence < QUEUE_THRESHOLD;
  if (unsure && !second) return { unsure: true };

  const found = (k) => (Object.hasOwn(result, k) ? { [k]: structuredClone(result[k]) } : {});
  const fingerprint = { core: fp.core, sha: fp.sha };
  // A second reader below the threshold: what it said is not taken, only that it was unsure (fail closed, below).
  const reading = unsure ? { by, at, confidence: result.confidence, reading: fingerprint, outcome: SECOND_UNSURE }
    : { by, at, confidence: result.confidence, reading: fingerprint, covered: result.covered,
      ...(result.covered ? {} : { ...found("beyond"), ...found("unexpressed") }), ...(restate ? { restated: true } : {}) };
  const { hint, textChangedAt, ...rest } = record;
  if (second) {
    const { provisional, ...first } = rereadOf(record);
    const reread = { ...first, second: reading };
    if (result.covered && !unsure) {
      return { apply: { outcome: "agreed",
        next: { ...rest, evidence: { ...record.evidence, triaged: { ...record.evidence.triaged, reread } } } } };
    }
    // Fail closed: a disagreement (beyond, unexpressed) or an unsure second reader takes the record back to what it was
    // before the first reread (`was`); the drafts queue is not restored: it is draftable again.
    const { why, evidence, ...base } = rest;
    const { was } = evidence.triaged;
    const { triaged, ...others } = evidence;
    const restored = { ...base, verdict: was.verdict, ...(was.why === undefined ? {} : { why: was.why }), hint: "beyond-engine",
      evidence: { ...others, triaged: { ...(was.triaged ?? {}), reread } } };
    return { apply: { outcome: unsure ? "unsureReverted" : "disagreed", next: restored } };
  }
  const before = readerTriaged(record);
  if (result.covered) {
    const was = { verdict: record.verdict, ...(typeof record.why === "string" ? { why: record.why } : {}),
      ...(before && isReaderHandle(before.by) ? { triaged: before } : {}) };
    return { apply: { outcome: "covered", next: { ...rest, verdict: "core", why: REREAD_WHY, evidence: { ...record.evidence,
      triaged: { by: "rule", at, was, reread: { ...reading, provisional: true } } } } } };
  }
  return { apply: { outcome: "beyond", next: { ...rest, hint: "beyond-engine",
    evidence: { ...record.evidence, triaged: { ...(before ?? {}), reread: reading } } } } };
}

/**
 * Applies reread results to a copy of `records` (`ingest <results-file> --reread --batch <batch file>`, docs/PIPELINE.md
 * "Ingesting rereads"). `offered`: a Map of the batch file's keys to the reading fingerprint each entry was cut against;
 * `current`: a Map of key to `{ reading, structure }`, the engine's reading of the official item now and the item's
 * structure (structure.mjs structureOf); `core` loadCore's (the version, the enumerations `beyond` is checked against).
 * `draftsQueue` (drafts-queue.json) says which covered keys leave that queue; `reviewQueued`, `triageQueued` (Sets of keys)
 * are records a person holds. With `second`, the results are a second reread of provisional `core` records. With `restate`
 * (Ruling R31; not with `second`), only restatable records are taken, the same reading notwithstanding, and the reread
 * stored carries `restated: true` (an unsure answer leaves the record as it was).
 * Returns `{ records, covered, beyond, unsure, dequeued, rejected }`, or with `second` `{ records, agreed, disagreed,
 * unsureReverted, alreadyConfirmed, alreadyReverted, rejected }` (`rejected`: `{ key, reason }`; any exception on one result
 * is that result's rejection). With `second`, a record a second reader already settled is listed in `alreadyConfirmed` or
 * `alreadyReverted` and left alone, so that a results file can be ingested again. Inputs unchanged.
 */
export function ingestRereads(records, results, options = {}) {
  const { textDir, by, at = new Date().toISOString(), core, offered, current, draftsQueue = [], second = false,
    restate = false, reviewQueued = new Set(), triageQueued = new Set() } = options;
  refuseRestateSecond(options);
  if (!isReaderHandle(by)) throw new Error(`by must match ${BY} and not be "rule"`);
  if (!core || typeof core !== "object") throw new TypeError("ingestRereads needs core (loadCore: version and enumerations)");
  if (!(offered instanceof Map)) throw new TypeError("ingestRereads needs offered (a Map of the batch file's keys to readings)");
  if (!(current instanceof Map)) throw new TypeError("ingestRereads needs current (a Map of key to { reading, structure })");
  const out = structuredClone(records);
  const byKey = new Map(out.map((r) => [r.key, r]));
  const ctx = { byKey, offered, current, textOf: cachedText(textDir), core, by, at, seen: new Set(), second, restate,
    reviewQueued, triageQueued };
  const done = { covered: [], beyond: [], agreed: [], disagreed: [], unsureReverted: [] };
  const already = { confirmed: [], reverted: [] };
  const unsure = [];
  const rejected = [];
  for (const result of Array.isArray(results) ? results : []) {
    let outcome;
    try { outcome = takeResult(result, ctx); } catch (e) { outcome = { reject: `internal: ${clip(e?.message ?? e)}` }; }
    if (outcome.apply) {
      const invalid = validateRecord(outcome.apply.next);
      if (invalid.length) outcome = { reject: `the record would be invalid: ${invalid[0]}` };
    }
    if (outcome.reject !== undefined) {
      let key = null;
      try { key = typeof result?.key === "string" ? clip(result.key) : null; } catch { key = null; }
      rejected.push({ key, reason: clipEchoes(outcome.reject, result) });
    } else if (outcome.unsure) unsure.push(result.key);
    else if (outcome.already) already[outcome.already].push(result.key);
    else {
      const record = byKey.get(result.key);
      Object.keys(record).forEach((k) => delete record[k]);
      Object.assign(record, outcome.apply.next);
      done[outcome.apply.outcome].push(result.key);
    }
  }
  if (second) {
    return { records: out, agreed: done.agreed, disagreed: done.disagreed, unsureReverted: done.unsureReverted,
      alreadyConfirmed: already.confirmed, alreadyReverted: already.reverted, rejected };
  }
  const queued = new Set(draftsQueue.map((q) => q?.key));
  return { records: out, covered: done.covered, beyond: done.beyond, unsure,
    dequeued: done.covered.filter((k) => queued.has(k)), rejected };
}

/**
 * The local gate note for a record a reread judged (never a failure: CI has no dumps): null while the engine's reading of
 * today (`now`, a readingFingerprint, null when it reads nothing, undefined when the item is not in the dumps) is the one
 * every reread of the record judged; otherwise one line saying the reread is stale.
 */
export function rereadStaleNote(record, now) {
  const reread = rereadOf(record);
  if (!reread) return null;
  if (now === undefined) return "reread: the official item is not in the dumps: the reading judged cannot be checked";
  if (now === null) return `reread: judged against a reading of DAS · Core ${reread.reading?.core}; the engine reads nothing now`;
  const judged = [reread.reading, ...(isObject(reread.second) ? [reread.second.reading] : [])];
  if (judged.every((fp) => sameSha(fp, now))) return null;
  return `reread: stale, judged against a reading of DAS · Core ${reread.reading?.core}; ${now.core} reads the item otherwise`
    + " (cut a reread again)";
}
