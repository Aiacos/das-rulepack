// Ruling R43: the intake of ENGINEERED rules (`ingest <results-file> --engineered`). An engineer (an agent who reads the
// engine's source, or the main session) writes an entry with any key of the engine's ENTRY_KEYS; no assertion can check it,
// so its evidence is a recorded live play of a hand-written scenario (play/<book>/<slug>.mjs), not a review. Every other gate
// holds: the schema, the engine's own validateEntry, the ids of the official item (and of OTHER items only through the closed
// list `otherItems`), typed data fixes, the quotation limit on every prose field, unique identifiers, official origin only.
// Nothing here writes evidence: the rule carries `engineered: { by, at, otherItems?, leavesNote? }`, and the state is
// `drafted` until `npm run gates` passes on it, then `gated` (held: "not-played") until a play is recorded.
import { DDB_MONSTER_UNCOVERED } from "./identifiers.mjs";
import { ENGINEERED_FIELDS, isEngineerHandle } from "./schema.mjs";
import { checkIds, checkText, engineIdentifiers, gateSchema, gateValidator } from "./gates.mjs";
import { identifierClashReasons } from "./batch.mjs";
import { ruledRecord } from "./draft.mjs";
import { cachedText, clip, clipEchoes, echo, forbiddenKeyIn, unknownFields, whyProblem, whyQuotes } from "./intake.mjs";

/** The fields of an engineered results file, and of one of its results (docs/PIPELINE.md, "Engineered rules"). */
export const ENGINEERED_FILE_FIELDS = Object.freeze(["by", "results"]);
export const ENGINEERED_RESULT_FIELDS = Object.freeze(["key", "entry", "adds", "leaves", "leavesNote", "otherItems", "why"]);
/** Why an engineered rule leaves a matched origin other than official uncovered: it is written for the official item. */
export const ENGINEERED_UNCOVERED = "engineered against the official item only (Ruling R43)";
const SHOWN_PROBLEMS = 4;
const SHOWN_PROBLEM_CHARS = 200;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Why a whole engineered results file is refused, or null: not `{ by, results: [...] }` or another top-level field; `by`
 * not an engineer's handle (`engineer-<name>`) or one of `owners` (docs/owners.json, case aside: an owner signs
 * `evidence.person`, never an engineered rule); a key named __proto__, constructor or prototype anywhere.
 */
export function engineeredFileProblem(input, { owners = [] } = {}) {
  if (!isObject(input) || typeof input.by !== "string" || !Array.isArray(input.results)) {
    return "must be { by: string, results: [...] }";
  }
  const extra = unknownFields(input, ENGINEERED_FILE_FIELDS);
  if (extra.length) return `unknown field ${echo(extra[0])}`;
  if (!isEngineerHandle(input.by)) {
    return `by ${echo(input.by)} must be an engineer's handle (engineer-<name>), never an owner's or another agent's`;
  }
  if (owners.some((o) => typeof o === "string" && o.toLowerCase() === input.by.toLowerCase())) {
    return `by ${echo(input.by)} is an owner of docs/owners.json: an owner signs evidence.person, never an engineered rule`;
  }
  const forbidden = forbiddenKeyIn(input);
  return forbidden ? `a key named ${forbidden.split(/[.[]/).pop()} (at ${forbidden})` : null;
}

/**
 * Applies engineered results to a copy of `records`. For each result `{ key, entry, adds, leaves?, leavesNote?, otherItems?,
 * why }`:
 * - rejected (`rejected`, `{ key, reason }`; the record stays exactly as it was) when it is not an object, holds a forbidden
 *   key or another field, repeats a key; names no record, a legacy record, a record that has a rule, one whose verdict is not
 *   `entry`, one waiting in queue.json or review-queue.json (`triageQueued`, `reviewQueued`: Sets of keys); has a `why` that
 *   is not one line of at most 200 characters or quotes 8 words of the text; has no text in the cache or no matched official
 *   item; or fails any check the gates' own functions make on the record as it would be written (the schema with the
 *   engineered limits, the engine's validateEntry and ENTRY_KEYS, the ids gate with `otherItems` against `dumpIds` when
 *   given, the quotation check of every prose field), or the unique gate would fail it (batch.mjs identifierClashReasons);
 * - applied otherwise: `rule = { handledIn: "table", adds, entry, origins: ["official"], uncovered?, leaves?, engineered:
 *   { by, at, otherItems?, leavesNote? } }` completed by draft.mjs ruledRecord (aliases, label, a monster feature's identifier
 *   and source: `embedded` needed for one), every other matched origin uncovered (ENGINEERED_UNCOVERED). A record of
 *   drafts-queue.json (`queue`) that takes a rule is listed in `dequeued`: it leaves that queue.
 * Any exception on one result becomes its rejection. Inputs unchanged. `{ records, applied, dequeued, rejected }`.
 */
export function ingestEngineered(records, results, options = {}) {
  const { textDir, by, at = new Date().toISOString(), core, queue = [], embedded, dumpIds, owners = [],
    triageQueued = new Set(), reviewQueued = new Set() } = options;
  if (!isEngineerHandle(by)) throw new Error("by must be an engineer's handle (engineer-<name>)");
  if (!core || typeof core.validateEntry !== "function") throw new TypeError("ingestEngineered needs core (loadCore)");
  const out = structuredClone(records);
  const ctx = { out, byKey: new Map(out.map((r) => [r.key, r])), textOf: cachedText(textDir), textDir, core, embedded, by, at,
    dumpIds, owners, triageQueued, reviewQueued, seen: new Set() };
  const applied = [];
  const rejected = [];
  for (const result of Array.isArray(results) ? results : []) {
    let outcome;
    try { outcome = takeResult(result, ctx); } catch (e) { outcome = { reject: `internal: ${clip(e?.message ?? e)}` }; }
    if (outcome.reject !== undefined) {
      let key = null;
      try { key = typeof result?.key === "string" ? clip(result.key) : null; } catch { key = null; }
      rejected.push({ key, reason: clipEchoes(outcome.reject, result) });
      continue;
    }
    const { record, next } = outcome.apply;
    Object.keys(record).forEach((k) => delete record[k]);
    Object.assign(record, next);
    applied.push(next.key);
  }
  const queued = new Set(queue.map((q) => q?.key));
  return { records: out, applied, dequeued: applied.filter((k) => queued.has(k)), rejected };
}

function takeResult(result, ctx) {
  const { byKey, textOf, textDir, core, embedded, by, at, seen } = ctx;
  if (!isObject(result)) return { reject: "result must be an object" };
  const forbidden = forbiddenKeyIn(result);
  if (forbidden) return { reject: `a key named ${forbidden.split(/[.[]/).pop()} (at ${forbidden})` };
  const extra = unknownFields(result, ENGINEERED_RESULT_FIELDS);
  if (extra.length) return { reject: `unknown field ${echo(extra[0])}` };
  if (seen.has(result.key)) return { reject: "the key appears twice in this file" };
  seen.add(result.key);
  const record = byKey.get(result.key);
  if (!record) return { reject: `unknown key ${echo(result.key)}` };
  if (record.legacy === true) return { reject: "legacy record: it leaves legacy through a person" };
  if (record.rule) return { reject: "the record already has a rule" };
  if (record.verdict !== "entry") return { reject: `the verdict is ${record.verdict ?? "not set"}, not entry` };
  if (ctx.triageQueued.has(record.key)) return { reject: "the record waits for a person in queue.json" };
  if (ctx.reviewQueued.has(record.key)) return { reject: "the record waits for a person in review-queue.json" };
  const why = whyProblem(result.why);
  if (why) return { reject: why };
  const text = textOf(record);
  if (text === null) return { reject: "no text in the cache: nothing to check the result against" };
  const quoted = whyQuotes(result.why, text);
  if (quoted) return { reject: quoted };
  if (!isObject(result.entry)) return { reject: "entry: must be an object" };
  if (typeof result.adds !== "string") return { reject: "adds: must be a string" };
  const matched = (record.items ?? []).filter((i) => i?.match === "matched");
  if (!matched.some((i) => i.origin === "official")) {
    return { reject: "no matched official item: an engineered rule is written for the official item (Ruling R43)" };
  }
  const others = [...new Set(matched.map((i) => i.origin).filter((o) => o !== "official"))];
  const uncovered = others.map((origin) => ({ origin, because: record.kind === "monster" && origin === "ddb-importer"
    ? DDB_MONSTER_UNCOVERED : ENGINEERED_UNCOVERED }));
  const engineered = { by, at, ...(Object.hasOwn(result, "otherItems") ? { otherItems: structuredClone(result.otherItems) } : {}),
    ...(Object.hasOwn(result, "leavesNote") ? { leavesNote: result.leavesNote } : {}) };
  const rule = { handledIn: "table", adds: result.adds, entry: structuredClone(result.entry), origins: ["official"],
    ...(uncovered.length ? { uncovered } : {}),
    ...(Object.hasOwn(result, "leaves") ? { leaves: structuredClone(result.leaves) } : {}), engineered };
  const ruled = ruledRecord(record, rule, { core, embedded });
  if (ruled.problem) return { reject: ruled.problem };
  const candidate = ruled.record;
  const context = { core, textDir, legacy: new Map(), owners: ctx.owners, dumpIds: ctx.dumpIds };
  const schema = gateSchema(candidate, context);
  const problems = [...new Set(schema.length ? schema : [...gateValidator(candidate, context),
    ...checkIds(candidate, context).failures, ...checkText(candidate, context).failures])];
  if (problems.length) {
    const shown = problems.slice(0, SHOWN_PROBLEMS).map((p) => p.slice(0, SHOWN_PROBLEM_CHARS));
    const more = problems.length > SHOWN_PROBLEMS ? ` (and ${problems.length - SHOWN_PROBLEMS} more)` : "";
    return { reject: `${shown.join("; ")}${more}` };
  }
  // The unique gate would fail it (a DAS · Core identifier, one shared with another record of its edition...): an engineered
  // rule has no queue to wait in, so it is rejected with the gate's reason.
  const all = ctx.out.map((r) => (r === record ? candidate : r));
  const clash = identifierClashReasons(all, engineIdentifiers(core), { pending: new Set([record.key]) }).get(record.key);
  if (clash) return { reject: `unique: ${clash}` };
  return { apply: { record, next: candidate } };
}

export { ENGINEERED_FIELDS };
