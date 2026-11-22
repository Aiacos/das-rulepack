// What every ingest checks of an agent's result before taking it (triage.mjs for readers, draft.mjs for drafters): one line of
// the agent's own words, a confidence, the cached text it is checked against, fields named by own properties only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasText } from "./text.mjs";
import { quotationCheck, RULE_QUOTE_WORDS } from "./gates.mjs";

// Below it a result waits for a person (queue.json, drafts-queue.json) instead of being applied.
export const QUEUE_THRESHOLD = 0.7;
export const MAX_WHY = 200;
// `why` is one line of printable characters: no control or format character, no line or paragraph separator.
export const ONE_LINE = /^[^\p{C}\p{Zl}\p{Zp}]*$/u;
export const MAX_ECHO = 80;
// What a rejection repeats of an agent's own strings: at most MAX_ECHO characters.
export const clip = (s) => String(s).slice(0, MAX_ECHO);
export const echo = (s) => JSON.stringify(clip(s));

/** `(record) => string | null`: the cached text of a record, or null when it has none or the cache lacks it. */
export const cachedText = (textDir) => (r) => {
  if (!r?.text || !hasText(textDir, r.text.sha256)) return null;
  return readFileSync(join(textDir, `${r.text.sha256}.txt`), "utf8");
};

/** Why `confidence` is not a number from 0 to 1, or null. */
export const confidenceProblem = (c) =>
  (typeof c === "number" && c >= 0 && c <= 1 ? null : "confidence must be a number from 0 to 1");

/** Why `why` is not one non-empty line of at most MAX_WHY printable characters, or null (its quotation is checked apart). */
export function whyProblem(why) {
  if (typeof why !== "string" || !why.trim()) return "why must be a non-empty string";
  if (why.length > MAX_WHY) return `why is longer than ${MAX_WHY} characters`;
  if (!ONE_LINE.test(why)) return "why must be a single line of printable characters";
  return null;
}

/** Why `why` repeats RULE_QUOTE_WORDS or more consecutive words of `text`, or null. `quotes` may be given (quotationCheck). */
export const whyQuotes = (why, text, quotes = quotationCheck(text)) =>
  (quotes(why) ? `why contains a quotation of ${RULE_QUOTE_WORDS} or more consecutive words of the text` : null);

/** The own fields of `object` that are not in `allowed`, in order (an inherited name never counts as allowed). */
export const unknownFields = (object, allowed) => Object.keys(object).filter((k) => !allowed.includes(k));

// Keys that name an object's prototype machinery: never a key of a results file, at any depth.
export const FORBIDDEN_KEYS = Object.freeze(["__proto__", "constructor", "prototype"]);
/** The path of the first key named __proto__, constructor or prototype in `value` (own keys, any depth), or null. */
export function forbiddenKeyIn(value, at = "") {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = forbiddenKeyIn(value[i], `${at}[${i}]`);
      if (found) return found;
    }
  } else if (value !== null && typeof value === "object") {
    for (const k of Object.keys(value)) {
      const here = at ? `${at}.${clip(k)}` : clip(k);
      if (FORBIDDEN_KEYS.includes(k)) return here;
      const found = forbiddenKeyIn(value[k], here);
      if (found) return found;
    }
  }
  return null;
}
