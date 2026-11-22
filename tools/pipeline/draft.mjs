// The intake of what drafter agents wrote (`ingest <results-file> --draft`, stage 3c): a rule per `entry` record, checked by the
// gates' own functions before it is written, or a reason for a person in registry/drafts-queue.json. Nothing here reads
// rulebook text except to check that a drafter did not quote it; nothing here writes `evidence` other than `drafted`.
import { ruleFingerprint } from "./registry.mjs";
import { BY, ORIGIN_MAX, isReaderHandle } from "./schema.mjs";
import { isPlainLine } from "./assert.mjs";
import { checkDraftKeys } from "./draft-keys.mjs";
import { checkIds, checkText, gateSchema, gateValidator } from "./gates.mjs";
import { SHARED_EMBEDDED, aliasFor, monsterIdentifier } from "./identifiers.mjs";
import { bindSources, sharedEmbeddedId } from "./settle.mjs";
import {
  QUEUE_THRESHOLD, cachedText, clip, confidenceProblem, echo, forbiddenKeyIn, unknownFields, whyProblem, whyQuotes
} from "./intake.mjs";

/** What a drafter answers for an entry: a rule, or why a person (or a script, or the engine) is needed instead. */
export const DRAFT_OUTCOMES = Object.freeze(["rule", "person", "code", "engine"]);
// The fields of one result, and of its `rule` (docs/PIPELINE.md, "Brief for a drafter agent"). Everything else (`verdict`,
// `identifier`, `sources`, `alsoAs`, `inCore`, `code`, `origin`, any `evidence`) the tools derive or a person writes.
export const DRAFT_RESULT_FIELDS = Object.freeze(["key", "outcome", "why", "confidence", "rule"]);
export const DRAFT_RULE_FIELDS = Object.freeze(["handledIn", "adds", "entry", "origins", "uncovered", "assert"]);
// How many of a rejected rule's problems a rejection repeats (each clipped).
const SHOWN_PROBLEMS = 4;
const SHOWN_PROBLEM_CHARS = 200;

/**
 * `rule.origin` (Ruling R17): a display label of where the rule sits in the book, derived from the record. A feature's is the
 * last part of its owner and its level ("Fey Wanderer 3"); a record of another kind with an owner (a species trait, a monster
 * feature's creature) gets the owner's last part. Accents are dropped; a label that is not one line of printable ASCII of at
 * most ORIGIN_MAX characters is left out (undefined), as is one for a record without an owner.
 */
export function ruleOriginLabel(record) {
  if (typeof record?.owner !== "string" || !record.owner.trim()) return undefined;
  const part = record.owner.split("/").pop().normalize("NFD").replace(/\p{M}/gu, "").trim();
  const level = record.kind === "feature" && Number.isInteger(record.level) ? ` ${record.level}` : "";
  const label = `${part}${level}`;
  return isPlainLine(label, ORIGIN_MAX) ? label : undefined;
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Why a result cannot be taken at all (before its rule is looked at), or null.
function resultProblem(record, result, { queuedKeys }) {
  const extra = unknownFields(result, DRAFT_RESULT_FIELDS);
  if (extra.length) return `unknown field ${echo(extra[0])}`;
  if (!record) return `unknown key ${echo(result.key)}`;
  if (queuedKeys.has(result.key)) return "the record waits for a person in drafts-queue.json";
  if (record.legacy === true) return "legacy record: it leaves legacy through a person, never through a draft";
  if (record.rule) return "the record already has a rule";
  if (record.verdict !== "entry") return `the verdict is ${record.verdict ?? "not set"}, not entry: only entry records are drafted`;
  if (!DRAFT_OUTCOMES.includes(result.outcome)) return `unknown outcome ${echo(result.outcome)}`;
  return confidenceProblem(result.confidence) ?? whyProblem(result.why);
}

// The rule as it is written to the record: the drafter's fields, the aliases aliasFor gives (Ruling R2), the display label
// (R17). With the identifier and sources a monster feature gets (R3). Or `{ problem }`.
function draftedRecord(record, draft, { core, embedded, by, at }) {
  const next = structuredClone(record);
  if (record.kind === "monster") {
    const index = embedded?.get(record.book);
    if (!index) throw new TypeError(`ingestDrafts: a monster feature needs the actors of ${record.book}'s package (embedded)`);
    let scoped;
    try { scoped = monsterIdentifier(record); } catch (e) { return { problem: `identifier: ${e.message}` }; }
    next.identifier = scoped;
    const sources = bindSources(next.items, scoped, {
      monster: { ruled: true, scoped: true, sharedId: (id) => sharedEmbeddedId(index, id, record.owner) }
    });
    if (Object.keys(sources).length) next.sources = sources;
    else delete next.sources;
  }
  const rule = structuredClone(draft);
  const origins = Array.isArray(rule.origins) ? rule.origins : [];
  const alsoAs = [];
  for (const origin of origins) {
    const alias = aliasFor(next, origin, { coreIdentifiers: core.identifiers });
    // Ruling R3: a monster feature whose embedded item id another creature shares cannot be ruled until upstream accepts
    // `<actor id>.<item id>` sources; any other origin aliasFor cannot reach belongs in rule.uncovered.
    if (alias?.uncovered === SHARED_EMBEDDED) return { problem: `identifier: ${SHARED_EMBEDDED}: the feature cannot be ruled yet` };
    if (alias?.uncovered) {
      return { problem: `rule.origins: ${origin} cannot be reached (${alias.uncovered}): it goes in rule.uncovered` };
    }
    if (alias?.identifier) alsoAs.push({ identifier: alias.identifier, origin });
  }
  if (alsoAs.length) rule.alsoAs = alsoAs;
  const label = ruleOriginLabel(record);
  if (label !== undefined) rule.origin = label;
  next.rule = rule;
  next.evidence = { ...next.evidence, drafted: { by, at, core: core.version, rule: ruleFingerprint(rule) } };
  return { record: next };
}

// Every reason the gates' own functions give against the drafted record (schema with the drafter limits, validator with the
// engine's facts, ids, text with every string of the rule), deduplicated. The fixes gate needs the dumps: `gates` runs it.
function ruleProblems(candidate, { core, textDir }) {
  const context = { core, textDir, legacy: new Map() };
  const problems = [
    ...gateSchema(candidate, context),
    ...checkDraftKeys(candidate.rule.entry, { origins: candidate.rule.origins, kind: candidate.kind }).map((e) => `schema: ${e}`)
  ];
  if (!problems.length) {
    problems.push(...gateValidator(candidate, context), ...checkIds(candidate, context).failures,
      ...checkText(candidate, context).failures);
  }
  return [...new Set(problems)];
}

/**
 * Applies drafter results to a copy of `records` (Task 5, docs/PIPELINE.md "Ingesting drafts"). For each result:
 * - rejected (listed in `rejected` as `{ key, reason }`, nothing of it kept) when it is not an object or holds a key named
 *   __proto__, constructor or prototype; has a field outside DRAFT_RESULT_FIELDS (`evidence` included) or its rule one outside
 *   DRAFT_RULE_FIELDS; repeats a key of the file; names no record, a record waiting in drafts-queue.json, a legacy record, one
 *   that already has a rule or whose verdict is not `entry`; has an unknown outcome, a confidence outside 0..1, a `why` that is
 *   not one line of at most 200 characters or quotes 8 words of the text; the record's text is not in the cache; a `rule` on
 *   an outcome other than `rule`, or none on `rule`; a rule that is not `handledIn: "table"`, names an origin aliasFor cannot
 *   reach, or fails the schema (assert included), the drafter limits (checkDraftKeys), the engine's validateEntry, the ids gate
 *   (R4, R5, a shared embedded id) or the quotation check of its prose and entry strings;
 * - queued (`queued`, entries of drafts-queue.json) when the outcome is `person`, `code` or `engine` (reason: the outcome), or
 *   a rule that passed every check has a confidence below 0.7 (`low-confidence`, the rule kept as `draft`);
 * - applied otherwise: `rule` written with `alsoAs` and `origin` derived, a monster feature's creature-scoped identifier and
 *   its source bound, `evidence.drafted = { by, at, core, rule }`. The state is `drafted` until `gates` passes.
 * `queue` is drafts-queue.json; `embedded` a Map of book code to settle.mjs embeddedIndex of its package's actors, required
 * when a result is for a monster feature. The inputs are not changed.
 */
export function ingestDrafts(records, results, { textDir, by, at = new Date().toISOString(), core, queue = [], embedded } = {}) {
  if (!isReaderHandle(by)) throw new Error(`by must match ${BY} and not be "rule"`);
  if (!core || typeof core.validateEntry !== "function") throw new TypeError("ingestDrafts needs core (loadCore)");
  const out = structuredClone(records);
  const byKey = new Map(out.map((r) => [r.key, r]));
  const queuedKeys = new Set(queue.map((q) => q?.key));
  const textOf = cachedText(textDir);
  const applied = [];
  const queued = [];
  const rejected = [];
  const seen = new Set();
  const reject = (result, reason) => rejected.push({ key: typeof result?.key === "string" ? clip(result.key) : null, reason });
  for (const result of Array.isArray(results) ? results : []) {
    if (!isObject(result)) { reject(result, "result must be an object"); continue; }
    const forbidden = forbiddenKeyIn(result);
    if (forbidden) { reject(result, `a key named ${forbidden.split(/[.[]/).pop()} (at ${forbidden})`); continue; }
    if (seen.has(result.key)) { reject(result, "the key appears twice in this file"); continue; }
    seen.add(result.key);
    const record = byKey.get(result.key);
    const reason = resultProblem(record, result, { queuedKeys });
    if (reason) { reject(result, reason); continue; }
    const text = textOf(record);
    if (text === null) { reject(result, "no text in the cache: nothing to check the result against"); continue; }
    const quoted = whyQuotes(result.why, text);
    if (quoted) { reject(result, quoted); continue; }
    const entry = (reasonOf, extra = {}) => ({
      key: result.key, reason: reasonOf, by, why: result.why, confidence: result.confidence, ...extra
    });
    if (result.outcome !== "rule") {
      if (Object.hasOwn(result, "rule")) {
        reject(result, `only outcome rule carries a rule (outcome ${result.outcome})`);
        continue;
      }
      queued.push(entry(result.outcome));
      continue;
    }
    if (!isObject(result.rule)) { reject(result, "outcome rule needs a rule object"); continue; }
    const extra = unknownFields(result.rule, DRAFT_RULE_FIELDS);
    if (extra.length) { reject(result, `unknown field ${echo(`rule.${extra[0]}`)}`); continue; }
    if (result.rule.handledIn !== "table") {
      reject(result, "rule.handledIn: a drafter writes table rules only (a code rule is a person's)");
      continue;
    }
    const drafted = draftedRecord(record, result.rule, { core, embedded, by, at });
    if (drafted.problem) { reject(result, drafted.problem); continue; }
    const problems = ruleProblems(drafted.record, { core, textDir });
    if (problems.length) {
      const shown = problems.slice(0, SHOWN_PROBLEMS).map((p) => p.slice(0, SHOWN_PROBLEM_CHARS));
      const more = problems.length > SHOWN_PROBLEMS ? ` (and ${problems.length - SHOWN_PROBLEMS} more)` : "";
      reject(result, `${shown.join("; ")}${more}`);
      continue;
    }
    if (result.confidence < QUEUE_THRESHOLD) {
      queued.push(entry("low-confidence", { draft: structuredClone(result.rule) }));
      continue;
    }
    Object.keys(record).forEach((k) => delete record[k]);
    Object.assign(record, drafted.record);
    applied.push(result.key);
  }
  return { records: out, applied, queued, rejected };
}
