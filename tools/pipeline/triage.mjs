// Triage: the rule-based part (`autoTriage`) and the intake of what reader agents decided (`ingest`).
// Nothing here reads rulebook text except to check that a reader did not quote it.
import { VERDICTS, slug, validateRecord } from "./registry.mjs";
import { BY, HINTS, RULE_VERDICTS, isReaderHandle } from "./schema.mjs";
import { hasText } from "./text.mjs";
import { quotationCheck, RULE_QUOTE_WORDS } from "./gates.mjs";
import {
  MAX_ECHO, MAX_WHY, ONE_LINE, QUEUE_THRESHOLD, cachedText, clip, confidenceProblem, echo, unknownFields, whyProblem, whyQuotes
} from "./intake.mjs";

// The hint a record can carry for its reader (`record.hint`): `core-generic` says DAS · Core has an entry under the
// identifier, but one too generic to settle the record by itself (a monster feature, or a shared identifier).
export { HINTS };

// The checks every ingest shares live in intake.mjs; these names stay exported from here for the callers that used them.
export { MAX_ECHO, MAX_WHY, ONE_LINE, QUEUE_THRESHOLD, clip };

// The kinds whose record with no text and no item is a placeholder ("Subclass Feature" lines and the like): nothing to read,
// nothing to automate. A species is described by its traits and a monster feature by its stat block: never placeholders.
const PLACEHOLDER_KINDS = ["item", "feature", "option", "feat", "background", "spell"];
/**
 * The why of each `core` the rule-based step sets, by what says the engine handles the record: its content table, its code
 * (core-scan.mjs scanRuntime), its content notes that leave it to the system (scanSystemHandled), or the options of the
 * feature (each handled).
 */
export const CORE_WHY = Object.freeze({
  table: "DAS · Core has an entry under this identifier",
  code: "DAS · Core handles this identifier in code",
  system: "DAS · Core leaves this identifier to the game system",
  parts: "every option of this feature is handled by DAS · Core"
});
/** What a `core` why set by the rule-based step names: table, code, system or parts (null for any other why). */
export const coreSourceOf = (why) => Object.keys(CORE_WHY).find((k) => CORE_WHY[k] === why) ?? null;
const WHY = Object.freeze({
  core: CORE_WHY.table,
  none: "no text and no item in any origin",
  noOwnText: "the rulebook entry has no text of its own",
  notCached: "the rulebook text is not in the cache"
});

const identifierOf = (r) => r.identifier ?? slug(r.name);
const countKey = (kind, identifier, edition) => `${kind}|${identifier}|${edition ?? ""}`;

/**
 * What autoTriage needs to know of the whole registry: how many records of each kind use each identifier
 * (`identifierCounts`, keyed "<kind>|<identifier>|<edition>") and which species have trait records of their own
 * (`traitOwners`, keyed "<book>|<species name>").
 */
export function triageContext(records) {
  const identifierCounts = new Map();
  const traitOwners = new Set();
  const childVerdicts = new Map();
  for (const r of records) {
    const id = countKey(r.kind, identifierOf(r), r.edition);
    identifierCounts.set(id, (identifierCounts.get(id) ?? 0) + 1);
    if (r.kind === "species" && r.owner) traitOwners.add(`${r.book}|${r.owner}`);
    // The parts of a record: the records of its book whose owner is its name (a species' traits), never a monster feature
    // (a creature named like a spell is no part of the spell).
    if (r.owner && r.kind !== "monster") {
      const at = `${r.book}|${r.owner}`;
      childVerdicts.set(at, [...(childVerdicts.get(at) ?? []), r.verdict ?? null]);
    }
  }
  return { identifierCounts, traitOwners, childVerdicts };
}

/**
 * The identifiers of the options a record's matched official item offers as a choice (`ItemChoice` advancements: each
 * option is its own item), in the order of the pools; null for an option whose document is not in `docs` (Map of document id
 * to document, the official dumps of the book's package). Empty when the item offers no choice or is not in the dumps.
 */
export function choiceOptions(record, docs) {
  const out = [];
  for (const item of (record.items ?? []).filter((i) => i?.origin === "official" && i.match === "matched")) {
    const doc = docs.get(item.docId);
    for (const adv of Object.values(doc?.system?.advancement ?? {})) {
      if (adv?.type !== "ItemChoice") continue;
      for (const option of adv.configuration?.pool ?? []) {
        const id = String(option?.uuid ?? "").split(".").at(-1);
        const identifier = docs.get(id)?.system?.identifier;
        out.push(typeof identifier === "string" && identifier ? identifier : null);
      }
    }
  }
  return out;
}

// How many parts a record has and how many of them the engine handles: its registry children that are `core`, and the
// options of its item that are among `handled` (the engine's table, code and system identifiers).
function partsOf(record, { childVerdicts, optionsOf, handled }) {
  const children = childVerdicts?.get(`${record.book}|${record.name}`) ?? [];
  const options = optionsOf?.(record) ?? [];
  return {
    total: children.length + options.length,
    handled: children.filter((v) => v === "core").length + options.filter((o) => o !== null && handled.has(o)).length
  };
}

/**
 * The rule-based part of triage for a record without a verdict: `{ verdict, why, by: "rule", hint? }`, `{ hint }` (no verdict,
 * a hint for the reader) or null (nothing: a reader decides). `coreIdentifiers` are DAS · Core's; `textDir` is the text cache;
 * `identifierCounts` and `traitOwners` come from triageContext over the whole registry.
 * - `core` only for the one 2024 record of its kind that uses an identifier the engine has (the engine's entries are written
 *   for the 2024 rules: a 2014 twin neither takes the verdict away nor gets it), never for a monster feature; otherwise the
 *   record is hinted `core-generic` and goes on through the rules below. The identifier is looked up in the content table
 *   (`coreIdentifiers`), then among those the engine's code recognises (`runtimeIdentifiers`) and those its content notes
 *   leave to the system (`systemHandled`), each with its own why (CORE_WHY). With none of them, under the same conditions, a
 *   record whose parts are all handled is `core` too: its registry children (`childVerdicts`: all `core`) and the options its
 *   item offers (`optionsOf(record)`, choiceOptions: all among `handledIdentifiers`); some handled only, `hint: "core-parts"`.
 * - No text in the dataset: a species described by its traits is left alone; with an item in some origin, `unverifiable`;
 *   with none, `none` for the kinds whose such records are placeholders.
 * - A text fingerprint missing from the cache: `unverifiable`.
 * SRD content that Core lacks is a finding for upstream, not a rule for this pack: it is left to a reader like the rest.
 */
export function autoTriage(record, context = {}) {
  const { coreIdentifiers, runtimeIdentifiers, systemHandled, textDir, identifierCounts, traitOwners } = context;
  if (!(identifierCounts instanceof Map)) throw new Error("autoTriage needs identifierCounts (triageContext of the registry)");
  if (record.verdict) return null;
  const identifier = identifierOf(record);
  const eligible = record.kind !== "monster" && record.edition === "2024"
    && identifierCounts.get(countKey(record.kind, identifier, record.edition)) === 1;
  let hint;
  const sources = [[coreIdentifiers, CORE_WHY.table], [runtimeIdentifiers, CORE_WHY.code], [systemHandled, CORE_WHY.system]];
  const source = sources.find(([set]) => set?.has(identifier));
  if (source) {
    if (eligible) return { verdict: "core", why: source[1], by: "rule" };
    hint = "core-generic";
  } else if (record.kind !== "monster") {
    const handled = context.handledIdentifiers
      ?? new Set(sources.flatMap(([set]) => (set ? [...set.keys()] : [])));
    const parts = partsOf(record, { ...context, handled });
    if (parts.total && parts.handled === parts.total && eligible) return { verdict: "core", why: CORE_WHY.parts, by: "rule" };
    if (parts.handled) hint = "core-parts";
  }
  const hinted = (outcome) => (hint ? { ...outcome, hint } : outcome);
  const nothing = hint ? { hint } : null;
  if (!record.text) {
    if (record.kind === "species" && !record.owner && traitOwners?.has(`${record.book}|${record.name}`)) return nothing;
    const hasItem = (record.items ?? []).some((i) => i?.match === "matched" || i?.match === "ambiguous");
    if (hasItem) return hinted({ verdict: "unverifiable", why: WHY.noOwnText, by: "rule" });
    return PLACEHOLDER_KINDS.includes(record.kind) ? hinted({ verdict: "none", why: WHY.none, by: "rule" }) : nothing;
  }
  if (!hasText(textDir, record.text.sha256)) return hinted({ verdict: "unverifiable", why: WHY.notCached, by: "rule" });
  return nothing; // SRD or not, a reader decides from here
}

// A verdict the rule-based step set: `evidence.triaged.by` is "rule" (ingest always records a confidence, the rule never). A
// `core` a reread set (reread.mjs: by rule, from a reader's judgement in `evidence.triaged.reread`) is not the rules' to redo:
// `--redo-rule` would otherwise give it back its previous verdict, since no rule gives a monster feature `core`.
export const setByRule = (r) => r.evidence?.triaged?.by === "rule" && !("confidence" in r.evidence.triaged)
  && !Object.hasOwn(r.evidence.triaged, "reread");

export { BY, isReaderHandle };
const ENGINE_KEY = /^[A-Za-z][A-Za-z0-9.]{0,63}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESULT_FIELDS = ["key", "verdict", "why", "keys", "similar", "confidence"];
const MAX_KEYS = 12;
const MAX_SIMILAR = 5;

const isList = (v, max, ok) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && ok(x));

// Why a result cannot be taken, or null. `textOf(record)` gives the cached text or null; `entryKeys` the engine's entry keys.
function problem(record, result, { overwrite, textOf, known, entryKeys }) {
  const extra = unknownFields(result, RESULT_FIELDS);
  if (extra.length) return `unknown field ${echo(extra[0])}`;
  if (!record) return `unknown key ${echo(result.key)}`;
  if (!VERDICTS.includes(result.verdict)) return `unknown verdict ${echo(result.verdict)}`;
  if (result.verdict === "core") return "a reader may not return core: the rule-based step sets it";
  const unfit = confidenceProblem(result.confidence) ?? whyProblem(result.why);
  if (unfit) return unfit;
  const isEngineKey = (k) => ENGINE_KEY.test(k) && !!entryKeys?.has(k.split(".")[0]);
  if ("keys" in result && !isList(result.keys, MAX_KEYS, isEngineKey)) {
    return `keys must be at most ${MAX_KEYS} entry keys of the engine, or dotted paths that start with one`;
  }
  if ("similar" in result && !isList(result.similar, MAX_SIMILAR, (s) => known.has(s) || (s.length <= 64 && KEBAB.test(s)))) {
    return `similar must be at most ${MAX_SIMILAR} record keys or kebab-case identifiers of at most 64 characters`;
  }
  if (record.verdict && !overwrite) return `the record already has a verdict (${record.verdict})`;
  if (record.rule && !RULE_VERDICTS.includes(result.verdict)) {
    return "record has a rule; its verdict can only be entry or code";
  }
  const text = textOf(record);
  if (text === null) return result.verdict === "unverifiable" ? null : "no text, no verdict: only unverifiable is allowed";
  // One limit and one normaliser for every prose of the registry: the gates' (gates.mjs quotationCheck, RULE_QUOTE_WORDS).
  const quotes = quotationCheck(text);
  const quoted = whyQuotes(result.why, text, quotes);
  if (quoted) return quoted;
  // `similar` entries that are not record keys could carry a quotation as kebab-case identifiers.
  const spelled = (result.similar ?? []).filter((s) => !known.has(s)).join(" ").replaceAll("-", " ");
  if (quotes(spelled)) return `similar contains a quotation of ${RULE_QUOTE_WORDS} or more consecutive words of the text`;
  return null;
}

// Writes the verdict of `result` on `record` (in place), `extra` going into `evidence.triaged`; returns why the record would be
// invalid, or null. Whatever else the record says (a drafted rule, say) must still hold under the new verdict, or nothing is
// written.
function settle(record, result, { by, at, extra = {} }) {
  const { textChangedAt, ...settled } = record;
  const next = {
    ...settled, verdict: result.verdict, why: result.why,
    evidence: {
      ...record.evidence,
      triaged: {
        by, at, confidence: result.confidence,
        ...(result.keys ? { keys: result.keys } : {}), ...(result.similar ? { similar: result.similar } : {}), ...extra
      }
    }
  };
  const invalid = validateRecord(next);
  if (invalid.length) return `the record would be invalid: ${invalid[0]}`;
  Object.assign(record, next);
  delete record.textChangedAt;
  return null;
}

// Applies reader results to a copy of `records`. Low-confidence results and every `engine` verdict are returned in
// `queued` instead of being applied. `rejected` is [{ key, reason }]; `applied` the keys that were changed. `entryKeys` (a Set,
// core.entryKeys) are the engine's entry keys: without it, no result may name `keys`.
// `owner` (Ruling R23: the file is signed with a handle of docs/owners.json, which the CLI checks) lets a person settle a
// queued entry, one with a second or third reading included: the earlier readings are kept as `evidence.triaged.first` and
// `second` ({ by, confidence }); every other check applies to the owner as to a reader (the quotation of `why` included).
export function ingest(records, results, options) {
  const { textDir, by, at = new Date().toISOString(), overwrite = false, entryKeys, queue = [], owner = false } = options;
  if (!isReaderHandle(by)) throw new Error(`by must match ${BY} and not be "rule"`);
  const out = structuredClone(records);
  const settledByTwo = new Set(owner ? [] : queue.filter((q) => q?.second).map((q) => q.key));
  const inQueue = new Map(owner ? queue.filter((q) => typeof q?.by === "string").map((q) => [q.key, q]) : []);
  const reading = (r) => ({ by: r.by, confidence: r.confidence });
  const byKey = new Map(out.map((r) => [r.key, r]));
  const textOf = cachedText(textDir);
  const applied = [];
  const queued = [];
  const rejected = [];
  for (const result of results) {
    const record = byKey.get(result?.key);
    const isObject = result !== null && typeof result === "object";
    const reason = !isObject ? "result must be an object"
      : settledByTwo.has(result.key) ? "two readers disagree: it waits for a person"
        : problem(record, result, { overwrite, textOf, known: byKey, entryKeys });
    if (reason) {
      rejected.push({ key: typeof result?.key === "string" ? clip(result.key) : null, reason });
      continue;
    }
    if (result.verdict === "engine" || result.confidence < QUEUE_THRESHOLD) {
      queued.push({
        key: result.key, verdict: result.verdict, why: result.why, confidence: result.confidence, by,
        reason: result.verdict === "engine" ? "engine" : "low-confidence"
      });
      continue;
    }
    const earlier = inQueue.get(result.key);
    const extra = !earlier ? {}
      : { first: reading(earlier), ...(earlier.second?.by ? { second: reading(earlier.second) } : {}) };
    const invalid = settle(record, result, { by, at, extra });
    if (invalid) {
      rejected.push({ key: clip(result.key), reason: invalid });
      continue;
    }
    applied.push(result.key);
  }
  return { records: out, applied, queued, rejected };
}

/**
 * The second reading of the queue (`ingest --second`): `queue` is registry/queue.json. A result whose key is not in the queue,
 * whose queue entry already has a `second`, or signed by the handle of the first reader, is rejected; every other check of
 * `ingest` applies (no overwrite). Same verdict, neither `engine`: applied (`evidence.triaged.first` is `{ by, confidence }` of
 * the first reading) and listed in `agreed`, but only when the second reading's confidence is at least QUEUE_THRESHOLD:
 * below it the entry comes back in `unsure` with `reason: "unsure-twice"`. A different verdict, or `engine` on either side,
 * comes back in `disagreed` (`reason: "disagreement"`, or "engine" when both readings are). In both cases the record stays
 * open and the entry gains `second: { verdict, why, confidence, by }`. The inputs are not changed.
 */
export function ingestSecond(records, results, { textDir, by, at = new Date().toISOString(), entryKeys, queue }) {
  if (!isReaderHandle(by)) throw new Error(`by must match ${BY} and not be "rule"`);
  const out = structuredClone(records);
  const byKey = new Map(out.map((r) => [r.key, r]));
  const inQueue = new Map(queue.map((q) => [q.key, q]));
  const textOf = cachedText(textDir);
  const agreed = [];
  const disagreed = [];
  const unsure = [];
  const seen = new Set();
  const rejected = [];
  const reject = (result, reason) => rejected.push({ key: typeof result?.key === "string" ? clip(result.key) : null, reason });
  for (const result of results) {
    if (result === null || typeof result !== "object") { reject(result, "result must be an object"); continue; }
    if (seen.has(result.key)) { reject(result, "the key appears twice in this file"); continue; }
    seen.add(result.key);
    const first = inQueue.get(result.key);
    if (!first) { reject(result, "the key is not in the queue: a second reading only reads queued entries"); continue; }
    if (first.second) { reject(result, "the queue entry already has a second reading"); continue; }
    if (typeof first.by !== "string") { reject(result, "the queue entry names no first reader"); continue; }
    if (first.by.toLowerCase() === by.toLowerCase()) {
      reject(result, "the second reader must be another reader than the first");
      continue;
    }
    const record = byKey.get(result.key);
    const reason = problem(record, result, { overwrite: false, textOf, known: byKey, entryKeys });
    if (reason) { reject(result, reason); continue; }
    const reading = { verdict: result.verdict, why: result.why, confidence: result.confidence, by };
    const parked = (reason, list) => {
      const entry = { ...first, reason, second: reading };
      list.push(entry);
      inQueue.set(result.key, entry);
    };
    if (result.verdict !== first.verdict || result.verdict === "engine") {
      parked(result.verdict === "engine" && first.verdict === "engine" ? "engine" : "disagreement", disagreed);
    } else if (result.confidence < QUEUE_THRESHOLD) {
      parked("unsure-twice", unsure);
    } else {
      const extra = { first: { by: first.by, confidence: first.confidence } };
      const invalid = settle(record, result, { by, at, extra });
      if (invalid) { reject(result, invalid); continue; }
      agreed.push(result.key);
      inQueue.delete(result.key);
    }
  }
  return { records: out, agreed, disagreed, unsure, rejected };
}

/**
 * The third reading (`ingest --third`), blind, made with the written criteria, of the queue entries with `reason:
 * "disagreement"` and a `second`, and no `third` yet. A result is rejected when its key is not such an entry, when its reader
 * is one of the first two, when the key repeats in the file, or for any reason `ingest` gives (no overwrite). Confidence at
 * least QUEUE_THRESHOLD and a verdict equal to the first or the second reading's (never `engine`): applied, the third reader's
 * `why` kept, `evidence.triaged` carrying `first`, `second` and `via: "third-reading"`; the key is in `settled`. Otherwise
 * nothing is applied and the entry comes back in `unsettled` with `third: { verdict, why, confidence, by }`. Inputs unchanged.
 */
export function ingestThird(records, results, { textDir, by, at = new Date().toISOString(), entryKeys, queue }) {
  if (!isReaderHandle(by)) throw new Error(`by must match ${BY} and not be "rule"`);
  const out = structuredClone(records);
  const byKey = new Map(out.map((r) => [r.key, r]));
  const inQueue = new Map(queue.map((q) => [q.key, q]));
  const textOf = cachedText(textDir);
  const settled = [];
  const unsettled = [];
  const seen = new Set();
  const rejected = [];
  const reject = (result, reason) => rejected.push({ key: typeof result?.key === "string" ? clip(result.key) : null, reason });
  for (const result of results) {
    if (result === null || typeof result !== "object") { reject(result, "result must be an object"); continue; }
    if (seen.has(result.key)) { reject(result, "the key appears twice in this file"); continue; }
    seen.add(result.key);
    const entry = inQueue.get(result.key);
    if (!entry) { reject(result, "the key is not in the queue: a third reading only reads queued entries"); continue; }
    if (entry.third) { reject(result, "the queue entry already has a third reading"); continue; }
    if (!entry.second || entry.reason !== "disagreement") {
      reject(result, "a third reading only reads entries where the first two readings disagree");
      continue;
    }
    if (typeof entry.by !== "string" || typeof entry.second.by !== "string") {
      reject(result, "the queue entry names no first or second reader");
      continue;
    }
    if ([entry.by, entry.second.by].some((h) => h.toLowerCase() === by.toLowerCase())) {
      reject(result, "the third reader must be another reader than the first two");
      continue;
    }
    const record = byKey.get(result.key);
    const reason = problem(record, result, { overwrite: false, textOf, known: byKey, entryKeys });
    if (reason) { reject(result, reason); continue; }
    const agrees = result.verdict !== "engine" && [entry.verdict, entry.second.verdict].includes(result.verdict);
    if (agrees && result.confidence >= QUEUE_THRESHOLD) {
      const extra = {
        first: { by: entry.by, confidence: entry.confidence }, second: { by: entry.second.by, confidence: entry.second.confidence },
        via: "third-reading"
      };
      const invalid = settle(record, result, { by, at, extra });
      if (invalid) { reject(result, invalid); continue; }
      settled.push(result.key);
      inQueue.delete(result.key);
    } else {
      const next = { ...entry, third: { verdict: result.verdict, why: result.why, confidence: result.confidence, by } };
      unsettled.push(next);
      inQueue.set(result.key, next);
    }
  }
  return { records: out, settled, unsettled, rejected };
}

/**
 * The owner's bulk rule (`ingest --settle-unsure`): every queue entry with `reason: "unsure-twice"` and a `second` whose first
 * and second confidence are both at least `min` gets its common verdict applied (never `engine`), with the second reader's `why`
 * and handle; `evidence.triaged` carries both readings and `via: "bulk-unsure"`. `applied` lists the keys; `kept` the unsure-twice
 * entries that stay; `problems` the `{ key, reason }` of those kept although eligible (the record cannot take the verdict).
 */
export function settleUnsure(records, { textDir, queue, min, at = new Date().toISOString() }) {
  const out = structuredClone(records);
  const byKey = new Map(out.map((r) => [r.key, r]));
  const textOf = cachedText(textDir);
  const applied = [];
  const kept = [];
  const problems = [];
  for (const entry of queue.filter((q) => q.reason === "unsure-twice")) {
    const second = entry.second;
    const eligible = second && !entry.third && entry.verdict === second.verdict && entry.verdict !== "engine"
      && typeof entry.confidence === "number" && typeof second.confidence === "number"
      && entry.confidence >= min && second.confidence >= min && isReaderHandle(entry.by) && isReaderHandle(second.by);
    if (!eligible) { kept.push(entry); continue; }
    const record = byKey.get(entry.key);
    const result = { key: entry.key, verdict: second.verdict, why: second.why, confidence: second.confidence };
    const invalid = problem(record, result, { overwrite: false, textOf, known: byKey })
      ?? settle(record, result, {
        by: second.by, at,
        extra: {
          first: { by: entry.by, confidence: entry.confidence }, second: { by: second.by, confidence: second.confidence },
          via: "bulk-unsure"
        }
      });
    if (invalid) { kept.push(entry); problems.push({ key: clip(entry.key), reason: invalid }); continue; }
    applied.push(entry.key);
  }
  return { records: out, applied, kept, problems };
}

/**
 * The triage pre-pass (`triage <BOOK> --core-prepass`): the `core` rule of autoTriage (its four sources, CORE_WHY) applied to
 * the records of `records` (one book) whose verdict is `entry` or none, whoever set it — never to a record that has a rule,
 * a legacy one, one whose key is in `queued`, or one with another verdict. `context` is autoTriage's, with `all` the records
 * of the whole registry (the book's among them): parts are counted again after each round, so a parent whose parts this run
 * turns to `core` is settled in the same run. A record turned to `core` keeps its previous verdict, why and triage evidence in
 * `evidence.triaged.was` (restorePrepass gives them back); the rest of it is unchanged. Returns `{ records, changed, hinted }`:
 * `changed` is `[{ key, source, identifier, was: { verdict, by } | null }]` (`source`: table, code, system or parts),
 * `hinted` the records the rule only hints (`{ key, hint, source }`), which are not written. The inputs are not changed.
 */
export function corePrepass(records, context, { queued = new Set(), at = new Date().toISOString() } = {}) {
  const out = structuredClone(records);
  const changed = [];
  const own = new Set(out.map((r) => r.key));
  const open = (r) => !r.rule && r.legacy !== true && !queued.has(r.key) && (r.verdict === null || r.verdict === "entry");
  for (let round = 0; round < 4; round++) {
    const all = [...(context.all ?? []).filter((r) => !own.has(r.key)), ...out];
    const ctx = { ...context, ...triageContext(all) };
    let more = false;
    for (const [i, r] of out.entries()) {
      if (!open(r)) continue;
      const t = autoTriage({ ...r, verdict: null }, ctx);
      if (t?.verdict !== "core") continue;
      const { hint, textChangedAt, ...rest } = r;
      const before = r.evidence?.triaged;
      const was = r.verdict ? { verdict: r.verdict, ...(typeof r.why === "string" ? { why: r.why } : {}),
        ...(before ? { triaged: before } : {}) } : null;
      const triaged = { by: "rule", at, ...(was ? { was } : {}) };
      const next = { ...rest, verdict: "core", why: t.why, evidence: { ...r.evidence, triaged } };
      const invalid = validateRecord(next);
      if (invalid.length) throw new Error(`${r.key}: the pre-pass would make the record invalid: ${invalid[0]}`);
      out[i] = next;
      changed.push({ key: r.key, source: coreSourceOf(t.why), identifier: identifierOf(r),
        was: was ? { verdict: was.verdict, by: before?.by ?? null } : null });
      more = true;
    }
    if (!more) break;
  }
  const ctx = { ...context, ...triageContext([...(context.all ?? []).filter((r) => !own.has(r.key)), ...out]) };
  const hinted = [];
  for (const r of out) {
    if (!open(r)) continue;
    const t = autoTriage({ ...r, verdict: null }, ctx);
    if (t?.hint) {
      const identifier = identifierOf(r);
      const source = t.hint === "core-parts" ? "parts"
        : context.coreIdentifiers?.has(identifier) ? "table" : context.runtimeIdentifiers?.has(identifier) ? "code" : "system";
      hinted.push({ key: r.key, hint: t.hint, source });
    }
  }
  return { records: out, changed, hinted };
}

/** The record as it was before the pre-pass turned it to `core` (from `evidence.triaged.was`), or null if it was not. */
export function restorePrepass(record) {
  const was = record?.evidence?.triaged?.was;
  if (!was) return null;
  const { why, evidence, ...rest } = record;
  const { triaged, ...others } = evidence;
  return {
    ...rest, verdict: was.verdict, ...(was.why === undefined ? {} : { why: was.why }),
    evidence: { ...others, ...(was.triaged ? { triaged: was.triaged } : {}) }
  };
}

/**
 * Ruling R29, `triage <BOOK> --engine-reading`: for each monster record with the verdict `entry` (whoever set it), no rule and
 * no queue entry, the engine's own reading of its official item (`readingOf(record)`: the entry, null when the engine reads
 * nothing, undefined when the item is not in the dumps). A non-empty reading sets `hint: "engine-reads"` — never the verdict:
 * whether the reading covers the whole text is a reader's judgement — and an empty one takes a stale hint away. A record that
 * carries a rule is left to the comparison of its rule (`evidence.reading`, written by the gates) and only listed.
 * @returns {{ records, hinted: {key, keys}[], cleared: string[], none: string[], unread: string[], ruled: string[] }}
 */
export function engineReadingPrepass(records, { readingOf, queued = new Set() } = {}) {
  const out = { hinted: [], cleared: [], none: [], unread: [], ruled: [] };
  const next = records.map((r) => {
    if (r?.kind !== "monster" || r.verdict !== "entry" || r.legacy === true || queued.has(r.key)) return r;
    if (r.rule) {
      out.ruled.push(r.key);
      return r;
    }
    const reading = readingOf(r);
    if (reading === undefined) {
      out.unread.push(r.key);
      return r;
    }
    const keys = reading && typeof reading === "object" ? Object.keys(reading).sort() : [];
    if (keys.length) {
      out.hinted.push({ key: r.key, keys });
      // A reread already found what the text asks beyond the reading (`beyond-engine`): that hint says more, it stays.
      return r.hint === "engine-reads" || r.hint === "beyond-engine" ? r : { ...r, hint: "engine-reads" };
    }
    out.none.push(r.key);
    if (r.hint !== "engine-reads") return r;
    out.cleared.push(r.key);
    const { hint, ...rest } = r;
    return rest;
  });
  return { records: next, ...out };
}
