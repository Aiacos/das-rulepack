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

const isStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");

// Why a result cannot be taken, or null. `textOf(record)` gives the cached text or null.
function problem(record, result, { overwrite, textOf }) {
  if (!record) return `unknown key ${JSON.stringify(result.key)}`;
  if (!VERDICTS.includes(result.verdict)) return `unknown verdict ${JSON.stringify(result.verdict)}`;
  if (typeof result.confidence !== "number" || !(result.confidence >= 0 && result.confidence <= 1)) {
    return "confidence must be a number from 0 to 1";
  }
  if (typeof result.why !== "string" || !result.why.trim()) return "why must be a non-empty string";
  if (result.why.length > MAX_WHY) return `why is longer than ${MAX_WHY} characters`;
  for (const f of ["keys", "similar"]) if (f in result && !isStringList(result[f])) return `${f} must be a list of strings`;
  if (record.verdict && !overwrite) return `the record already has a verdict (${record.verdict})`;
  const text = textOf(record);
  if (text === null) return result.verdict === "unverifiable" ? null : "no text, no verdict: only unverifiable is allowed";
  if (quotes(result.why, text)) return `why contains a quotation of ${MAX_QUOTE_WORDS + 1} or more consecutive words of the text`;
  return null;
}

// Applies reader results to a copy of `records`. Low-confidence results and every `engine` verdict are returned in
// `queued` instead of being applied. `rejected` is [{ key, reason }]; `applied` the keys that were changed.
export function ingest(records, results, { textDir, by, at = new Date().toISOString(), overwrite = false }) {
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
    const reason = isObject ? problem(record, result, { overwrite, textOf }) : "result must be an object";
    if (reason) {
      rejected.push({ key: result?.key ?? null, reason });
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
