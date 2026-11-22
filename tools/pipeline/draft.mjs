// The intake of what drafter agents wrote (`ingest <results-file> --draft`, stage 3c): a rule per `entry` record, checked by the
// gates' own functions before it is written, or a reason for a person in registry/drafts-queue.json. Nothing here reads
// rulebook text except to check that a drafter did not quote it; nothing here writes `evidence` other than `drafted`.
import { ruleFingerprint } from "./registry.mjs";
import { BY, ORIGINS, ORIGIN_MAX, draftedForPerson, isReaderHandle } from "./schema.mjs";
import { isPlainLine } from "./assert.mjs";
import { checkDraftKeys } from "./draft-keys.mjs";
import {
  RULE_QUOTE_WORDS, checkIds, checkText, engineIdentifiers, gateSchema, gateValidator, quotationCheck, ruleProse
} from "./gates.mjs";
import { identifierClashReasons, redraftable } from "./batch.mjs";
import { DDB_MONSTER_UNCOVERED, SHARED_EMBEDDED, aliasFor, monsterIdentifier } from "./identifiers.mjs";
import { bindSources, canonicalIdentifier, sharedEmbeddedId } from "./settle.mjs";
import { isPartial } from "./leaves.mjs";
import {
  QUEUE_THRESHOLD, cachedText, clip, clipEchoes, confidenceProblem, echo, forbiddenKeyIn, unknownFields, whyProblem, whyQuotes
} from "./intake.mjs";

/** What a drafter answers for an entry: a rule, or why a person (or a script, or the engine) is needed instead. */
export const DRAFT_OUTCOMES = Object.freeze(["rule", "person", "code", "engine"]);
// The fields of one result, and of its `rule` (docs/PIPELINE.md, "Brief for a drafter agent"). Everything else (`verdict`,
// `identifier`, `sources`, `alsoAs`, `inCore`, `code`, `origin`, any `evidence`) the tools derive or a person writes.
export const DRAFT_RESULT_FIELDS = Object.freeze(["key", "outcome", "why", "confidence", "rule"]);
// `leaves` (Ruling R25): what the rule leaves to the table, as data (leaves.mjs).
export const DRAFT_RULE_FIELDS = Object.freeze(["handledIn", "adds", "entry", "origins", "uncovered", "assert", "leaves"]);
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
const asList = (v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
// The canonical spelling of a distance (20 and "20" are one, as in assert.mjs normaliseAssert).
const spelled = (v) => (typeof v === "string" ? v : JSON.stringify(v));

// The activity type whose own roll a `given.roll` is (an attack for hit and miss, a save for the saves).
const ACTIVITY_OF_ROLL = Object.freeze({ hit: "attack", crit: "attack", miss: "attack", failedSave: "save", savedSave: "save" });
/**
 * Fix round 1 (Ruling R24, L1): every stated `move` or applied `condition` of `rule.assert` on a roll must be backed, by a
 * `triggers` step of the entry on that roll (a `move` of that mode, and of that distance when the assertion gives one; a
 * `status` of that status), or, for a condition only, by the item's own data: an activity of that roll's type (attack for
 * hit/miss/crit, save for failedSave/savedSave) in the official structure (`structure`, structure.mjs structureOf) that links
 * an effect carrying the status (its `statuses`, or the entry's `effectStatuses` for that effect); for a saved save, only an
 * effect the entry lists in `savedEffects` (an effect of a save activity applies on a failed one). The structure says
 * nothing of movement, so a move is backed by a step alone. Without the structure nothing is backed by the item (fail
 * closed). The problems, one per assertion that is not backed.
 */
export function unbackedProblems(rule, structure) {
  const problems = [];
  const declarations = asList(rule?.entry?.triggers);
  const steps = (roll) => declarations.filter((d) => asList(d?.on).includes(roll)).flatMap((d) => asList(d?.do));
  const activities = Array.isArray(structure?.activities) ? structure.activities : [];
  const effects = new Map((Array.isArray(structure?.effects) ? structure.effects : []).map((e) => [e?.id, e]));
  const statusesOf = (id) => {
    const own = Array.isArray(effects.get(id)?.statuses) ? effects.get(id).statuses : [];
    const set = rule?.entry?.effectStatuses?.[id];
    return [...own, ...(Array.isArray(set) ? set : Array.isArray(set?.set) ? set.set : [])];
  };
  const byItem = (roll, status) => {
    if (!Object.hasOwn(ACTIVITY_OF_ROLL, roll)) return false;
    const saved = asList(rule?.entry?.savedEffects);
    return activities.some((a) => a?.type === ACTIVITY_OF_ROLL[roll] && asList(a.effects)
      .some((id) => (roll !== "savedSave" || saved.includes(id)) && statusesOf(id).includes(status)));
  };
  (Array.isArray(rule?.assert) ? rule.assert : []).forEach((a, i) => {
    const roll = a?.given?.roll;
    if (typeof roll !== "string") return;
    const move = a?.expect?.move;
    const status = a?.expect?.condition?.applied;
    const here = steps(roll);
    if (isObject(move)) {
      const backed = here.some((st) => st?.type === "move" && st.mode === move.mode
        && (move.distance === undefined || (st.distance !== undefined && spelled(st.distance) === spelled(move.distance))));
      if (!backed) problems.push(`rule.assert[${i}]: the entry does nothing of the kind on ${roll} (no move step of that mode`
        + `${move.distance === undefined ? "" : " and distance"} on ${roll})`);
    }
    if (typeof status === "string") {
      const backed = here.some((st) => st?.type === "status" && st.status === status) || byItem(roll, status);
      if (!backed) problems.push(`rule.assert[${i}]: the entry does nothing of the kind on ${roll} (no status step for`
        + ` ${status}, and the item's own ${ACTIVITY_OF_ROLL[roll] ?? "activity"} applies none)`);
    }
  });
  return problems;
}

// Why a result cannot be taken at all (before its rule is looked at), or null. With `redraft` (Ruling R32) the record must
// be redraftable (batch.mjs) instead of unruled.
function resultProblem(record, result, { queuedKeys, offered, redraft, reviewQueued, readingOf }) {
  const extra = unknownFields(result, DRAFT_RESULT_FIELDS);
  if (extra.length) return `unknown field ${echo(extra[0])}`;
  if (!record) return `unknown key ${echo(result.key)}`;
  if (!offered.has(result.key)) return "not offered by this batch (its key is not an entry of the batch file)";
  if (queuedKeys.has(result.key)) return "the record waits for a person in drafts-queue.json";
  if (record.legacy === true) return "legacy record: it leaves legacy through a person, never through a draft";
  if (redraft && !redraftable(record, { draftsQueued: queuedKeys, reviewQueued, readingOf })) {
    return "not redraftable (a monster rule held because it changes the engine's reading, outside the queues, redrafted"
      + " once at most)";
  }
  if (!redraft && record.rule) return "the record already has a rule";
  if (record.verdict !== "entry") return `the verdict is ${record.verdict ?? "not set"}, not entry: only entry records are drafted`;
  if (!DRAFT_OUTCOMES.includes(result.outcome)) return `unknown outcome ${echo(result.outcome)}`;
  return confidenceProblem(result.confidence) ?? whyProblem(result.why);
}

/**
 * Ruling R32: a ruled record as it was before any draft, for a redraft: no rule, and none of the evidence about it (the
 * draft, the gates, the review, a play, a person's signature, the comparison with the engine's reading); a monster
 * feature's identifier back to the one inventory gives an unruled record (settle.mjs canonicalIdentifier) and its sources
 * unbound. The triage evidence and everything else are kept. The input is not changed.
 */
export function withoutRule(record) {
  const next = structuredClone(record);
  delete next.rule;
  const { drafted, gates, reviewed, played, person, reading, ...kept } = isObject(next.evidence) ? next.evidence : {};
  next.evidence = kept;
  if (next.kind === "monster" && Array.isArray(next.items)) {
    next.identifier = canonicalIdentifier(next.items, next.name, next.kind);
    const sources = bindSources(next.items, next.identifier, { monster: { ruled: false, scoped: false, sharedId: () => false } });
    if (Object.keys(sources).length) next.sources = sources;
    else delete next.sources;
  }
  return next;
}

// The rule as it is written to the record: the drafter's fields, the aliases aliasFor gives (Ruling R2), the display label
// (R17). With the identifier and sources a monster feature gets (R3). Or `{ problem }`.
function draftedRecord(record, draft, { core, embedded, by, at }) {
  const next = structuredClone(record);
  if (record.kind === "monster") {
    const index = embedded?.get(record.book);
    if (!index) {
      return { problem: `monster feature: the actors of ${record.book}'s package are needed to tell a shared embedded id` };
    }
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
    const alias = aliasFor(next, origin, { coreIdentifiers: engineIdentifiers(core) });
    // Ruling R3: a monster feature whose embedded item id another creature shares cannot be ruled until upstream accepts
    // `<actor id>.<item id>` sources; any other origin aliasFor cannot reach belongs in rule.uncovered.
    if (alias?.uncovered === SHARED_EMBEDDED) return { problem: `identifier: ${SHARED_EMBEDDED}: the feature cannot be ruled yet` };
    if (alias?.uncovered) {
      return { problem: `rule.origins: ${origin} cannot be reached (${alias.uncovered}): it goes in rule.uncovered` };
    }
    if (alias?.identifier) alsoAs.push({ identifier: alias.identifier, origin });
  }
  if (alsoAs.length) rule.alsoAs = alsoAs;
  // Ruling R3: a monster feature's matched DDB Importer item is never covered. The batch offers it without ids (batch.mjs
  // rulableOrigin); the tool accounts for it here when the drafter left it out, with the one reason it can have.
  const ddb = record.kind === "monster" && (record.items ?? []).some((i) => i?.origin === "ddb-importer" && i.match === "matched");
  const uncovered = rule.uncovered === undefined ? [] : rule.uncovered;
  if (ddb && Array.isArray(uncovered) && !uncovered.some((u) => u?.origin === "ddb-importer")) {
    rule.uncovered = [...uncovered, { origin: "ddb-importer", because: DDB_MONSTER_UNCOVERED }];
  }
  const label = ruleOriginLabel(record);
  if (label !== undefined) rule.origin = label;
  next.rule = rule;
  // Rulings R15, R21: a rule the assertion vocabulary cannot fully say (noReactions), or one that leaves the official item
  // uncovered, goes to a person at review: stamped here.
  const forPerson = draftedForPerson(rule);
  next.evidence = {
    ...next.evidence,
    drafted: { by, at, core: core.version, rule: ruleFingerprint(rule), ...(forPerson ? { person: true, because: forPerson } : {}) }
  };
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
 *   DRAFT_RULE_FIELDS; repeats a key of the file; names no record, a key the batch did not offer (`offered`, required: the
 *   keys of the batch file's entries), a record waiting in drafts-queue.json, a legacy record, one
 *   that already has a rule or whose verdict is not `entry`; has an unknown outcome, a confidence outside 0..1, a `why` that is
 *   not one line of at most 200 characters or quotes 8 words of the text; the record's text is not in the cache; a `rule` on
 *   an outcome other than `rule`, or none on `rule`; a rule that is not `handledIn: "table"`, whose `origins` is not a
 *   non-empty list of distinct known origins, that is for a monster feature without the actors index, names an origin
 *   aliasFor cannot reach, or fails the schema (assert included), the drafter limits (checkDraftKeys), the engine's
 *   validateEntry, the ids gate (R4, R5, a shared embedded id) or the quotation check of its prose and entry strings, or
 *   states a move or condition on a roll that neither the entry nor the item's own data backs (unbackedProblems, decided
 *   from `structures`: a Map of record key to the official structure, structure.mjs structureOf; fail closed without it);
 * - queued (`queued`, entries of drafts-queue.json) when the outcome is `person`, `code` or `engine` (reason: the outcome); a
 *   rule that passed every check but that the unique gate would fail whatever is drafted (batch.mjs CORE_IDENTIFIER,
 *   SHARED_IDENTIFIER); or one with a confidence below 0.7 (`low-confidence`); a queued rule is kept as `draft`, unless `why`
 *   and the draft together quote 8 words of the text (either order): then the result is rejected;
 * - applied otherwise: `rule` written with `alsoAs` and `origin` derived, a monster feature's creature-scoped identifier and
 *   its source bound, `evidence.drafted = { by, at, core, rule }` (plus `person: true, because: "noReactions"` for an entry
 *   with noReactions, Ruling R15, or `because: "official-uncovered"` for a rule that leaves official uncovered, R21). The
 *   state is `drafted` until `gates` passes. An applied rule with `leaves` (Ruling R25: a partial rule) is also listed in
 *   `partial`.
 * `queue` is drafts-queue.json; `embedded` a Map of book code to settle.mjs embeddedIndex of its package's actors,
 * needed for a monster feature's rule (without it that result is rejected). With `redraft` (Ruling R32) a result is taken
 * only for a record batch.mjs `redraftable` accepts (`reviewQueued`: the keys of review-queue.json; `readingOf`: the reading
 * computed now) instead of an unruled one: an applied rule replaces the old one from `withoutRule(record)` and its
 * `evidence.drafted` carries `redrafted: true`; a queued result also takes the old rule away (`unruled` lists those keys).
 * Any exception on one result becomes its rejection
 * (`internal: …`), never the file's. A rejection repeats at most 80 characters of any drafter string. Inputs unchanged.
 */
export function ingestDrafts(records, results, options = {}) {
  const {
    textDir, by, at = new Date().toISOString(), core, queue = [], embedded, offered, structures = new Map(), redraft = false,
    reviewQueued = new Set(), readingOf
  } = options;
  if (!isReaderHandle(by)) throw new Error(`by must match ${BY} and not be "rule"`);
  if (!core || typeof core.validateEntry !== "function") throw new TypeError("ingestDrafts needs core (loadCore)");
  if (!(offered instanceof Set)) throw new TypeError("ingestDrafts needs offered (a Set of the batch file's entry keys)");
  if (!(structures instanceof Map)) throw new TypeError("structures must be a Map of record key to the official structure");
  const out = structuredClone(records);
  const context = {
    out, byKey: new Map(out.map((r) => [r.key, r])), queuedKeys: new Set(queue.map((q) => q?.key)), offered,
    textOf: cachedText(textDir), textDir, core, embedded, by, at, seen: new Set(), structures, redraft, reviewQueued, readingOf
  };
  const applied = [];
  const partial = [];
  const queued = [];
  const rejected = [];
  const unruled = [];
  for (const result of Array.isArray(results) ? results : []) {
    let outcome;
    // One result never aborts the file: anything unexpected is that result's rejection.
    try { outcome = takeResult(result, context); } catch (e) { outcome = { reject: `internal: ${clip(e?.message ?? e)}` }; }
    if (outcome.reject !== undefined) {
      let key = null;
      try { key = typeof result?.key === "string" ? clip(result.key) : null; } catch { key = null; }
      rejected.push({ key, reason: clipEchoes(outcome.reject, result) });
      continue;
    }
    if (outcome.queue) queued.push(outcome.queue);
    if (outcome.apply) {
      const { record, next } = outcome.apply;
      Object.keys(record).forEach((k) => delete record[k]);
      Object.assign(record, next);
      // A redraft that goes to a person takes the old rule away (Ruling R32): the record is changed, not applied.
      if (outcome.queue) unruled.push(next.key);
      else {
        applied.push(next.key);
        if (isPartial(next.rule)) partial.push(next.key);
      }
    }
  }
  return { records: out, applied, partial, queued, rejected, unruled };
}

// Why `origins` is not a non-empty list of distinct known origins, or null (checked before anything that relies on it).
function originsProblem(origins) {
  if (!Array.isArray(origins) || !origins.length) return "rule.origins: must be a non-empty array of origins";
  if (!origins.every((o) => ORIGINS.includes(o))) return `rule.origins: every origin must be one of ${ORIGINS.join(", ")}`;
  if (new Set(origins).size !== origins.length) return "rule.origins: an origin is listed twice";
  return null;
}

// A queued result must not carry a quotation split between its `why` and its draft: both orders are read (why first, last).
function splitQuotation(why, draft, text) {
  const prose = isObject(draft) ? ruleProse(draft).map(([, v]) => v) : [];
  if (!prose.length) return null;
  const quotes = quotationCheck(text);
  return quotes([why, ...prose].join(" ")) || quotes([...prose, why].join(" "))
    ? `why and the draft together quote ${RULE_QUOTE_WORDS} or more consecutive words of the text` : null;
}

// One result: `{ reject: reason }`, `{ queue: entry }` or `{ apply: { record, next } }`. May throw (the caller catches).
function takeResult(result, ctx) {
  const { byKey, queuedKeys, offered, textOf, textDir, core, embedded, by, at, seen, redraft } = ctx;
  if (!isObject(result)) return { reject: "result must be an object" };
  const forbidden = forbiddenKeyIn(result);
  if (forbidden) return { reject: `a key named ${forbidden.split(/[.[]/).pop()} (at ${forbidden})` };
  if (seen.has(result.key)) return { reject: "the key appears twice in this file" };
  seen.add(result.key);
  const record = byKey.get(result.key);
  const reason = resultProblem(record, result, { queuedKeys, offered, redraft, reviewQueued: ctx.reviewQueued,
    readingOf: ctx.readingOf });
  if (reason) return { reject: reason };
  const text = textOf(record);
  if (text === null) return { reject: "no text in the cache: nothing to check the result against" };
  const quoted = whyQuotes(result.why, text);
  if (quoted) return { reject: quoted };
  const entry = (reasonOf, draft) => {
    const split = splitQuotation(result.why, draft, text);
    if (split) return { reject: split };
    const queued = { key: result.key, reason: reasonOf, by, why: result.why, confidence: result.confidence,
      ...(draft ? { draft: structuredClone(draft) } : {}) };
    // Ruling R32: a redraft that goes to a person removes the rule it was to replace (it changes the engine's reading).
    return redraft ? { queue: queued, apply: { record, next: withoutRule(record) } } : { queue: queued };
  };
  if (result.outcome !== "rule") {
    if (Object.hasOwn(result, "rule")) return { reject: `only outcome rule carries a rule (outcome ${result.outcome})` };
    return entry(result.outcome);
  }
  if (!isObject(result.rule)) return { reject: "outcome rule needs a rule object" };
  const extra = unknownFields(result.rule, DRAFT_RULE_FIELDS);
  if (extra.length) return { reject: `unknown field ${echo(`rule.${extra[0]}`)}` };
  if (result.rule.handledIn !== "table") {
    return { reject: "rule.handledIn: a drafter writes table rules only (a code rule is a person's)" };
  }
  const badOrigins = originsProblem(result.rule.origins);
  if (badOrigins) return { reject: badOrigins };
  // Ruling R32: a redraft starts from the record as it was before any draft, and its draft carries the mark.
  const drafted = draftedRecord(redraft ? withoutRule(record) : record, result.rule, { core, embedded, by, at });
  if (drafted.problem) return { reject: drafted.problem };
  if (redraft) drafted.record.evidence.drafted.redrafted = true;
  const problems = [...unbackedProblems(drafted.record.rule, ctx.structures.get(result.key) ?? null),
    ...ruleProblems(drafted.record, { core, textDir })];
  if (problems.length) {
    const shown = problems.slice(0, SHOWN_PROBLEMS).map((p) => p.slice(0, SHOWN_PROBLEM_CHARS));
    const more = problems.length > SHOWN_PROBLEMS ? ` (and ${problems.length - SHOWN_PROBLEMS} more)` : "";
    return { reject: `${shown.join("; ")}${more}` };
  }
  // The unique gate would fail it whatever a drafter writes (a DAS · Core identifier, one shared with another record that
  // has a rule or the verdict entry): a person decides (batch.mjs identifierClashReasons, the gate's own functions).
  const others = ctx.out.map((r) => (r === record ? drafted.record : r));
  const clash = identifierClashReasons(others, engineIdentifiers(core), { pending: new Set([result.key]) }).get(result.key);
  if (clash) return entry(clash, result.rule);
  if (result.confidence < QUEUE_THRESHOLD) return entry("low-confidence", result.rule);
  return { apply: { record, next: drafted.record } };
}
