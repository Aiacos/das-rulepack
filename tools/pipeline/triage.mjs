// Triage: the rule-based part (`autoTriage`) and the intake of what reader agents decided (`ingest`).
// Nothing here reads rulebook text except to check that a reader did not quote it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERDICTS, slug } from "./registry.mjs";
import { hasText } from "./text.mjs";

export const QUEUE_THRESHOLD = 0.7;
export const MAX_WHY = 200;
export const MAX_QUOTE_WORDS = 11;

// Core and "no text" are decided here; SRD content that Core lacks is a finding for upstream, so it is left to a reader.
// `record.srd` is the flag the inventory stored; it changes nothing here today, because both outcomes are "ask a reader".
// `textDir` is the text cache.
export function autoTriage(record, { coreIdentifiers, textDir } = {}) {
  if (record.verdict) return null;
  if (coreIdentifiers.has(record.identifier ?? slug(record.name))) {
    return { verdict: "core", why: "DAS · Core has an entry", by: "rule" };
  }
  if (!record.text || !hasText(textDir, record.text.sha256)) {
    return { verdict: "unverifiable", why: "The rulebook text is not in the cache", by: "rule" };
  }
  return null; // SRD or not, a reader decides from here
}

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
const ENGINE_KEY = /^[A-Za-z][A-Za-z0-9.]{0,63}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESULT_FIELDS = ["key", "verdict", "why", "keys", "similar", "confidence"];
const MAX_KEYS = 12;
const MAX_SIMILAR = 5;

const isList = (v, max, ok) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && ok(x));
// `why` is one line of printable characters: no control or format character, no line or paragraph separator.
const ONE_LINE = /^[^\p{C}\p{Zl}\p{Zp}]*$/u;
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
  const text = textOf(record);
  if (text === null) return result.verdict === "unverifiable" ? null : "no text, no verdict: only unverifiable is allowed";
  if (quotes(result.why, text)) return `why contains a quotation of ${MAX_QUOTE_WORDS + 1} or more consecutive words of the text`;
  // `similar` entries that are not record keys could carry a quotation as kebab-case identifiers.
  const spelled = (result.similar ?? []).filter((s) => !known.has(s)).join(" ").replaceAll("-", " ");
  if (quotes(spelled, text)) return `similar contains a quotation of ${MAX_QUOTE_WORDS + 1} or more consecutive words of the text`;
  return null;
}

// Applies reader results to a copy of `records`. Low-confidence results and every `engine` verdict are returned in
// `queued` instead of being applied. `rejected` is [{ key, reason }]; `applied` the keys that were changed. `entryKeys` (a Set,
// core.entryKeys) are the engine's entry keys: without it, no result may name `keys`.
export function ingest(records, results, { textDir, by, at = new Date().toISOString(), overwrite = false, entryKeys }) {
  if (typeof by !== "string" || !BY.test(by)) throw new Error(`by must match ${BY}`);
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
    record.verdict = result.verdict;
    record.why = result.why;
    record.evidence = {
      ...record.evidence,
      triaged: {
        by, at, confidence: result.confidence,
        ...(result.keys ? { keys: result.keys } : {}), ...(result.similar ? { similar: result.similar } : {})
      }
    };
    applied.push(result.key);
  }
  return { records: out, applied, queued, rejected };
}
