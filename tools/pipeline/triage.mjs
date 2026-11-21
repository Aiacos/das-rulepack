// Triage: the rule-based part (`autoTriage`) and the intake of what reader agents decided (`ingest`).
// Nothing here reads rulebook text except to check that a reader did not quote it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERDICTS, slug, validateRecord } from "./registry.mjs";
import { HINTS, RULE_VERDICTS } from "./schema.mjs";
import { hasText } from "./text.mjs";

// The hint a record can carry for its reader (`record.hint`): `core-generic` says DAS · Core has an entry under the
// identifier, but one too generic to settle the record by itself (a monster feature, or a shared identifier).
export { HINTS };

export const QUEUE_THRESHOLD = 0.7;
export const MAX_WHY = 200;
export const MAX_QUOTE_WORDS = 11;

// The kinds whose record with no text and no item is a placeholder ("Subclass Feature" lines and the like): nothing to read,
// nothing to automate. A species is described by its traits and a monster feature by its stat block: never placeholders.
const PLACEHOLDER_KINDS = ["item", "feature", "option", "feat", "background", "spell"];
const WHY = Object.freeze({
  core: "DAS · Core has an entry under this identifier",
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
  for (const r of records) {
    const id = countKey(r.kind, identifierOf(r), r.edition);
    identifierCounts.set(id, (identifierCounts.get(id) ?? 0) + 1);
    if (r.kind === "species" && r.owner) traitOwners.add(`${r.book}|${r.owner}`);
  }
  return { identifierCounts, traitOwners };
}

/**
 * The rule-based part of triage for a record without a verdict: `{ verdict, why, by: "rule", hint? }`, `{ hint }` (no verdict,
 * a hint for the reader) or null (nothing: a reader decides). `coreIdentifiers` are DAS · Core's; `textDir` is the text cache;
 * `identifierCounts` and `traitOwners` come from triageContext over the whole registry.
 * - `core` only for the one 2024 record of its kind that uses an identifier the engine has (the engine's entries are written
 *   for the 2024 rules: a 2014 twin neither takes the verdict away nor gets it), never for a monster feature; otherwise the
 *   record is hinted `core-generic` and goes on through the rules below.
 * - No text in the dataset: a species described by its traits is left alone; with an item in some origin, `unverifiable`;
 *   with none, `none` for the kinds whose such records are placeholders.
 * - A text fingerprint missing from the cache: `unverifiable`.
 * SRD content that Core lacks is a finding for upstream, not a rule for this pack: it is left to a reader like the rest.
 */
export function autoTriage(record, { coreIdentifiers, textDir, identifierCounts, traitOwners } = {}) {
  if (!(identifierCounts instanceof Map)) throw new Error("autoTriage needs identifierCounts (triageContext of the registry)");
  if (record.verdict) return null;
  const identifier = identifierOf(record);
  let hint;
  if (coreIdentifiers.has(identifier)) {
    if (record.kind !== "monster" && record.edition === "2024"
      && identifierCounts.get(countKey(record.kind, identifier, record.edition)) === 1) {
      return { verdict: "core", why: WHY.core, by: "rule" };
    }
    hint = "core-generic";
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

// A verdict the rule-based step set: `evidence.triaged.by` is "rule" (ingest always records a confidence, the rule never).
export const setByRule = (r) => r.evidence?.triaged?.by === "rule" && !("confidence" in r.evidence.triaged);

// Whitespace-normalised, lower-cased words; punctuation around a word does not count, so "mu." matches "mu".
const EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const words = (s) => String(s).toLowerCase().split(/\s+/).map((w) => w.replace(EDGES, "")).filter(Boolean);

// True when `why` repeats more than MAX_QUOTE_WORDS consecutive words of `text` (whitespace and case do not count).
export function quotes(why, text) {
  const n = MAX_QUOTE_WORDS + 1;
  const source = words(text);
  const mine = words(why);
  if (mine.length < n || source.length < n) return false;
  const grams = new Set();
  for (let i = 0; i + n <= source.length; i++) grams.add(source.slice(i, i + n).join(" "));
  for (let i = 0; i + n <= mine.length; i++) if (grams.has(mine.slice(i, i + n).join(" "))) return true;
  return false;
}

export const BY = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
// "rule" names the rule-based step in `evidence.triaged.by`: no reader or person may sign with it.
export const isReaderHandle = (by) => typeof by === "string" && BY.test(by) && by.toLowerCase() !== "rule";
const ENGINE_KEY = /^[A-Za-z][A-Za-z0-9.]{0,63}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESULT_FIELDS = ["key", "verdict", "why", "keys", "similar", "confidence"];
const MAX_KEYS = 12;
const MAX_SIMILAR = 5;

const isList = (v, max, ok) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && ok(x));
// `why` is one line of printable characters: no control or format character, no line or paragraph separator.
export const ONE_LINE = /^[^\p{C}\p{Zl}\p{Zp}]*$/u;
export const MAX_ECHO = 80;
// What a rejection repeats of a reader's own strings: at most MAX_ECHO characters.
export const clip = (s) => String(s).slice(0, MAX_ECHO);
const echo = (s) => JSON.stringify(clip(s));

// Why a result cannot be taken, or null. `textOf(record)` gives the cached text or null; `entryKeys` the engine's entry keys.
function problem(record, result, { overwrite, textOf, known, entryKeys }) {
  const extra = Object.keys(result).filter((k) => !RESULT_FIELDS.includes(k));
  if (extra.length) return `unknown field ${echo(extra[0])}`;
  if (!record) return `unknown key ${echo(result.key)}`;
  if (!VERDICTS.includes(result.verdict)) return `unknown verdict ${echo(result.verdict)}`;
  if (result.verdict === "core") return "a reader may not return core: the rule-based step sets it";
  if (typeof result.confidence !== "number" || !(result.confidence >= 0 && result.confidence <= 1)) {
    return "confidence must be a number from 0 to 1";
  }
  if (typeof result.why !== "string" || !result.why.trim()) return "why must be a non-empty string";
  if (result.why.length > MAX_WHY) return `why is longer than ${MAX_WHY} characters`;
  if (!ONE_LINE.test(result.why)) return "why must be a single line of printable characters";
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
  if (quotes(result.why, text)) return `why contains a quotation of ${MAX_QUOTE_WORDS + 1} or more consecutive words of the text`;
  // `similar` entries that are not record keys could carry a quotation as kebab-case identifiers.
  const spelled = (result.similar ?? []).filter((s) => !known.has(s)).join(" ").replaceAll("-", " ");
  if (quotes(spelled, text)) return `similar contains a quotation of ${MAX_QUOTE_WORDS + 1} or more consecutive words of the text`;
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
export function ingest(records, results, { textDir, by, at = new Date().toISOString(), overwrite = false, entryKeys }) {
  if (!isReaderHandle(by)) throw new Error(`by must match ${BY} and not be "rule"`);
  const out = structuredClone(records);
  const byKey = new Map(out.map((r) => [r.key, r]));
  const textOf = (r) => {
    if (!r.text || !hasText(textDir, r.text.sha256)) return null;
    return readFileSync(join(textDir, `${r.text.sha256}.txt`), "utf8");
  };
  const applied = [];
  const queued = [];
  const rejected = [];
  for (const result of results) {
    const record = byKey.get(result?.key);
    const isObject = result !== null && typeof result === "object";
    const reason = isObject ? problem(record, result, { overwrite, textOf, known: byKey, entryKeys }) : "result must be an object";
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
    const invalid = settle(record, result, { by, at });
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
 * the first reading) and listed in `agreed`. Otherwise the record stays open and the entry comes back in `disagreed` with
 * `second: { verdict, why, confidence, by }` and `reason: "disagreement"`. The inputs are not changed.
 */
export function ingestSecond(records, results, { textDir, by, at = new Date().toISOString(), entryKeys, queue }) {
  if (!isReaderHandle(by)) throw new Error(`by must match ${BY} and not be "rule"`);
  const out = structuredClone(records);
  const byKey = new Map(out.map((r) => [r.key, r]));
  const inQueue = new Map(queue.map((q) => [q.key, q]));
  const textOf = (r) => {
    if (!r.text || !hasText(textDir, r.text.sha256)) return null;
    return readFileSync(join(textDir, `${r.text.sha256}.txt`), "utf8");
  };
  const agreed = [];
  const disagreed = [];
  const rejected = [];
  const reject = (result, reason) => rejected.push({ key: typeof result?.key === "string" ? clip(result.key) : null, reason });
  for (const result of results) {
    if (result === null || typeof result !== "object") { reject(result, "result must be an object"); continue; }
    const first = inQueue.get(result.key);
    if (!first) { reject(result, "the key is not in the queue: a second reading only reads queued entries"); continue; }
    if (first.second) { reject(result, "the queue entry already has a second reading"); continue; }
    if (typeof first.by === "string" && first.by.toLowerCase() === by.toLowerCase()) {
      reject(result, "the second reader must be another reader than the first");
      continue;
    }
    const record = byKey.get(result.key);
    const reason = problem(record, result, { overwrite: false, textOf, known: byKey, entryKeys });
    if (reason) { reject(result, reason); continue; }
    if (result.verdict === first.verdict && result.verdict !== "engine") {
      const extra = { first: { by: first.by, confidence: first.confidence } };
      const invalid = settle(record, result, { by, at, extra });
      if (invalid) { reject(result, invalid); continue; }
      agreed.push(result.key);
      inQueue.delete(result.key);
      continue;
    }
    disagreed.push({
      ...first, reason: "disagreement",
      second: { verdict: result.verdict, why: result.why, confidence: result.confidence, by }
    });
    inQueue.set(result.key, disagreed.at(-1));
  }
  return { records: out, agreed, disagreed, rejected };
}
