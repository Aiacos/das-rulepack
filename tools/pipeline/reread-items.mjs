// The engine-aware reread of non-monster `entry` records (Ruling R42). Triage gave `entry` ("needs a pack rule") to features,
// spells, items, feats, species and options without seeing what DAS · Core does with the item, and the engine has gained many
// rules since. The engine classifies every item itself (its automation badge): `rule` (its own rule for the item, with the
// rule keys it recognises), `auto` (the common path resolves the item's activities), `passive` (transferred effects only),
// `manual` (nothing) or `none` (gear with nothing to play). A live sweep of a test world gives that class per record in a
// private JSON file (RULEPACK_ENGINE_VIEW, never in the repository): `{ "<record key>": { level, rules, layers, identifier,
// pack } | { missing: true } }`. A reader blind to every earlier verdict, reason and drafter answer compares the text with
// the view and the item's own data, and says whether what the text asks in combat is already done (`covered: true`, with
// `coveredBy`: `engine`, `data` or `nothing`) or what is beyond (`beyond`, `unexpressed`), as the monster reread does
// (reread.mjs). The tools cut the batches and take what the reader wrote; they never call a model.
//
// - covered (confidence at least QUEUE_THRESHOLD): the verdict becomes that of `coveredBy` (schema.mjs COVERED_VERDICT:
//   engine `core`, data `data`, nothing `none`) with its fixed why (ITEM_REREAD_WHY), by rule; the previous verdict is kept
//   in `evidence.triaged.was`, the reading in `evidence.triaged.reread` (`view`: the fingerprint of the view judged),
//   `provisional` until a blind second reader agrees on `covered` AND on `coveredBy`; the record leaves drafts-queue.json.
// - not covered (at least the threshold): the verdict stays `entry`, the record gains `hint: "beyond-engine"`, and `beyond`
//   / `unexpressed` are stored as data for the drafter (batch.mjs `beyondEngine`).
// - below the threshold: nothing changes; the record can be cut again.
// A second reread fails closed: anything but an agreeing covered answer at the threshold with the same `coveredBy` gives the
// record back its previous verdict (with `hint: "beyond-engine"` when the second found something beyond).
import { createHash } from "node:crypto";
import { canonical, groupBy, validateRecord } from "./registry.mjs";
import { BY, COVERED_BY, COVERED_VERDICT, ITEM_REREAD_WHY, isReaderHandle } from "./schema.mjs";
import { QUEUE_THRESHOLD, cachedText, clip, clipEchoes, confidenceProblem, echo, forbiddenKeyIn, unknownFields, whyProblem,
  whyQuotes } from "./intake.mjs";
import { SECOND_UNSURE, missingProblem, readerTriaged, rereadOf } from "./reread.mjs";
import { ZONE_KEYS } from "./zones.mjs";
import { WARD_KEYS } from "./wards.mjs";
import { REACTION_KEYS } from "./reactions.mjs";

export { COVERED_BY, COVERED_VERDICT, ITEM_REREAD_WHY };
export const ITEM_REREAD_BATCH_SIZE = 30;
/** The fields of one item reread result (docs/PIPELINE.md, "Brief for an item reread agent"): nothing else is taken. */
export const ITEM_REREAD_RESULT_FIELDS = Object.freeze(["key", "covered", "coveredBy", "beyond", "unexpressed", "why",
  "confidence", "mechanism"]);
/**
 * Ruling R48: the engine file a source-aware reader names for `coveredBy: "engine"` on an item the engine has no rule of
 * its own for (a path under the engine's module/scripts, e.g. `adapter/usage.mjs`).
 */
export const MECHANISM = /^[a-z][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*\.mjs$/;
/** The engine's automation levels, in its own order (the badge of a sheet). */
export const ENGINE_LEVELS = Object.freeze(["rule", "auto", "passive", "manual", "none"]);
/** What each level says the engine does with the item, in our words: the vocabulary a reader is given. */
export const LEVEL_MEANINGS = Object.freeze({
  rule: "DAS · Core has a rule of its own for this item: it does, besides the item's data, what each rule key named says.",
  auto: "No rule of its own: the engine's common path uses the item's activities as the data writes them (an attack, a save,"
    + " damage, healing, the effects they apply, a summon, a transformation, a spell cast).",
  passive: "Only the item's transferred effects act (they sit on whoever carries the item); no activity is played for it.",
  manual: "The engine does nothing with this item: whatever its text asks is played by hand at the table.",
  none: "Gear with nothing to play: the engine has nothing to do with it in a fight."
});
/** What a rule key named by the view is given as when no short definition of a drafter key exists for it. */
export const NO_DEFINITION = "an engine rule of that name, not described here";
/**
 * Which levels each `coveredBy` can stand on: `engine` only on `rule` (the engine has a rule for the item), `data` on a level
 * where the engine plays the item's data (`rule`, `auto`, `passive`), `nothing` on any (the text may ask nothing). So under
 * `manual` or `none` a covered answer is `nothing` or it is refused: a text that asks something in combat is never covered.
 */
export const COVERED_BY_LEVELS = Object.freeze({
  engine: Object.freeze(["rule"]), data: Object.freeze(["rule", "auto", "passive"]), nothing: ENGINE_LEVELS
});
/** What each `coveredBy` means, for the vocabulary file. */
export const COVERED_BY_MEANINGS = Object.freeze({
  engine: "A rule of the engine for the item (a rule key of the view) does what the text asks in combat.",
  data: "The item's own activities and effects, played by the engine's common path, do what the text asks in combat.",
  nothing: "The text asks nothing to automate in combat (a description, something outside a fight, a choice of build)."
});
const NOT_ITEM_ENTRY = "not an item entry";
const NOT_ITEM_CORE = "not an item reread core";
const RULE_KEY = /^[a-z][A-Za-z0-9]{0,63}$/;
const VIEW_FIELDS = ["level", "rules", "layers", "identifier", "pack", "entry"];
// Ruling R49: the one key of the view file that is not a record's: the engine the sweep ran on.
const SWEEP_KEY = "$sweep";
const VERSION = /^\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.]+)?$/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// Ruling R46: a monster feature whose text the engine's text layer reads nothing of (`unreadMonster(record)` true) is read
// here too: the monster reread (reread.mjs) has no reading to show for it, and the engine may still play it by a rule of its
// own under the feature's identifier, or by the item's data.
const isItemKind = (r, unreadMonster) => typeof r?.kind === "string" && r.kind !== "sense"
  && (r.kind !== "monster" || (typeof unreadMonster === "function" && unreadMonster(r) === true));

/** The short definition of a rule key (the drafter keys' of zones.mjs, wards.mjs, reactions.mjs), or NO_DEFINITION. */
export function ruleKeyMeaning(key) {
  for (const table of [ZONE_KEYS, WARD_KEYS, REACTION_KEYS]) {
    if (Object.hasOwn(table, key) && typeof table[key]?.means === "string") return table[key].means;
  }
  return NO_DEFINITION;
}

/**
 * The engine view file, checked whole (fail closed: one entry out of its shape refuses the file), as a lookup by record key:
 * `{ level, rules }` (the rules sorted, once each), null for `{ missing: true }` (the sweep found no item), undefined for a
 * key the file does not hold. `layers`, `identifier` and `pack` are allowed and never handed on.
 */
export function parseEngineView(value) {
  if (!isObject(value)) throw new Error("engine view: must be an object of record key to { level, rules } or { missing: true }");
  const out = new Map();
  // Ruling R49: the sweep may say which engine it ran on (`"$sweep": { "core": "<version>" }`); kept on the lookup.
  let sweptCore;
  for (const [key, e] of Object.entries(value)) {
    const at = `engine view ${JSON.stringify(clip(key))}`;
    if (key === SWEEP_KEY) {
      if (!isObject(e) || Object.keys(e).length !== 1 || typeof e.core !== "string" || !VERSION.test(e.core)) {
        throw new Error(`${at}: { core: "<engine version>" } and nothing else`);
      }
      sweptCore = e.core;
      continue;
    }
    if (!isObject(e)) throw new Error(`${at}: must be an object`);
    if (Object.hasOwn(e, "missing")) {
      if (e.missing !== true || Object.keys(e).length !== 1) throw new Error(`${at}: { missing: true } and nothing else`);
      out.set(key, null);
      continue;
    }
    const extra = Object.keys(e).filter((k) => !VIEW_FIELDS.includes(k));
    if (extra.length) throw new Error(`${at}: unknown field ${JSON.stringify(clip(extra[0]))}`);
    if (!ENGINE_LEVELS.includes(e.level)) throw new Error(`${at}: level must be one of ${ENGINE_LEVELS.join(", ")}`);
    const rules = e.rules ?? [];
    if (!Array.isArray(rules) || !rules.every((k) => typeof k === "string" && RULE_KEY.test(k))) {
      throw new Error(`${at}: rules must be a list of entry keys`);
    }
    for (const f of ["layers"]) {
      if (Object.hasOwn(e, f) && !(Array.isArray(e[f]) && e[f].every((x) => typeof x === "string"))) {
        throw new Error(`${at}: ${f} must be a list of strings`);
      }
    }
    for (const f of ["identifier", "pack"]) {
      if (Object.hasOwn(e, f) && typeof e[f] !== "string") throw new Error(`${at}: ${f} must be a string`);
    }
    // The engine's own entry for the item, when the sweep kept it: shown to the reader as data, so that a rule's name is
    // not credited with more than the rule does.
    if (Object.hasOwn(e, "entry") && !isObject(e.entry)) throw new Error(`${at}: entry must be an object`);
    out.set(key, { level: e.level, rules: [...new Set(rules)].sort(),
      ...(isObject(e.entry) ? { entry: JSON.parse(JSON.stringify(e.entry)) } : {}) });
  }
  return Object.assign((key) => (out.has(key) ? out.get(key) : undefined), { sweptCore });
}

/**
 * The fingerprint of an engine view: `{ core, sha }`, the engine version of DAS_CORE and the SHA-256 of the view's level and
 * rules (what a reader judged). A later sweep that classifies the item otherwise gives another `sha`; a newer engine makes
 * the reading stale too (the view is a sweep's, not recomputed from the engine: itemRereadStaleNote).
 */
export const viewFingerprint = (view, core, structure = null) => ({
  core: core?.version,
  // The item's advancements (what dnd5e grants by itself) are part of what the reader judged, once the summary shows them:
  // a record whose item has some is read again; one whose item has none keeps the fingerprint it had.
  sha: createHash("sha256").update(canonical({ level: view?.level ?? null, rules: [...(view?.rules ?? [])].sort(),
    ...(isObject(view?.entry) ? { entry: view.entry } : {}),
    ...(Array.isArray(structure?.advancements) && structure.advancements.length
      ? { advancements: structure.advancements } : {}) })).digest("hex")
});

const versionParts = (v) => String(v ?? "").split("-")[0].split(".").map((n) => Number(n));
/** Whether engine version `a` is older than `b` (numeric parts compared in turn; a pre-release before its release). */
export function isOlderVersion(a, b) {
  const [x, y] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const [p, q] = [x[i] ?? 0, y[i] ?? 0];
    if (p !== q) return p < q;
  }
  return String(a).includes("-") && !String(b).includes("-");
}
/**
 * Whether a stored view fingerprint still stands for `now`: the same sha, judged by an engine no older than today's — or
 * (Ruling R49) by an older one, when the view of today comes from a sweep run on today's engine (`swept`): that sweep
 * classifies the item as it was judged.
 */
const stands = (fp, now, swept) => isObject(fp) && isObject(now) && typeof fp.sha === "string" && fp.sha === now.sha
  && (!isOlderVersion(fp.core, now.core) || sweptOn(swept, now.core));
/** Whether a sweep that says it ran on engine `swept` ran on `core` or a newer one. */
export const sweptOn = (swept, core) => typeof swept === "string" && typeof core === "string" && !isOlderVersion(swept, core);

/** Whether a record's reread is an item reread (Ruling R42: it holds `view`, not `reading`). */
export const isItemReread = (r) => Object.hasOwn(rereadOf(r) ?? {}, "view");
// A covered first item reread no second one has read yet, with the verdict it set.
const isProvisional = (r) => {
  const reread = rereadOf(r);
  return isItemReread(r) && reread.covered === true && reread.provisional === true && !Object.hasOwn(reread, "second")
    && r.verdict === COVERED_VERDICT[reread.coveredBy];
};
// A covered first item reread a second reader settled: confirmed (an agreeing second) or reverted (any other), or null.
const settledBySecond = (r) => {
  const reread = rereadOf(r);
  if (!isItemReread(r) || reread.covered !== true || !isObject(reread.second)) return null;
  const agreed = reread.second.covered === true && reread.second.coveredBy === reread.coveredBy;
  if (agreed) return r.verdict === COVERED_VERDICT[reread.coveredBy] ? "confirmed" : null;
  return r.verdict === "entry" ? "reverted" : null;
};

const officialOf = (r) => (Array.isArray(r?.items) ? r.items : [])
  .find((i) => i?.origin === "official" && i.match === "matched" && typeof i.data?.sha256 === "string");
// What a reader needs besides the text, as a triage entry gives it (batch.mjs): never the hint, nor anything of a verdict.
const READER_FIELDS = ["owner", "level", "section", "rarity", "page", "srd"];
const summary = ({ data, ...item }) => item;
const entryOf = (r, { level, rules, entry }, fp) => entryWith(r, { level, rules: [...new Set(rules)].sort(),
  ...(isObject(entry) ? { entry } : {}) }, fp);
const entryWith = (r, view, fp) => ({
  key: r.key, name: r.name, kind: r.kind, edition: r.edition, textSha: r.text.sha256,
  ...Object.fromEntries(READER_FIELDS.filter((f) => r[f] !== undefined && r[f] !== null).map((f) => [f, r[f]])),
  items: r.items.map(summary),
  engineView: { level: view.level, rules: [...view.rules], ...(isObject(view.entry) ? { entry: view.entry } : {}) },
  engineWords: { level: LEVEL_MEANINGS[view.level], rules: Object.fromEntries(view.rules.map((k) => [k, ruleKeyMeaning(k)])) },
  view: { core: fp.core, sha: fp.sha }
});

/**
 * Why a record is not cut into an item reread batch, or null when it is. First reread: only a record of another kind than
 * `monster` with the verdict `entry` is a candidate ("not an item entry" otherwise); it is left out when it has a rule, is
 * legacy, waits in review-queue.json (`reviewQueued`) or queue.json (`triageQueued`), has no text or no matched official item,
 * the engine view does not hold it (`viewOf(key)` undefined) or says it is missing (null), its official item is not in the
 * dumps (`documentOf(record)`, its structure, null or undefined), or a reread already judged it against the view of today.
 * Second reread (`second`): only a provisional covered item reread ("not an item reread core" otherwise), left out when a
 * second reader settled it ("second reread done") or the view is no longer the one the first judged.
 */
export function itemRereadSkipReason(r, options) {
  const { viewOf, documentOf, reviewQueued = new Set(), triageQueued = new Set(), second = false, core, unreadMonster,
    again = false, keys = null } = options;
  if (keys instanceof Set && !keys.has(r?.key)) return NOT_ITEM_ENTRY;
  if (second) {
    const reread = rereadOf(r);
    if (!isItemKind(r, unreadMonster) || !isItemReread(r) || reread.covered !== true) return NOT_ITEM_CORE;
    if (Object.hasOwn(reread, "second")) return "second reread done";
    if (r.verdict !== COVERED_VERDICT[reread.coveredBy]) return NOT_ITEM_CORE;
  } else {
    if (!isItemKind(r, unreadMonster) || r.verdict !== "entry") return NOT_ITEM_ENTRY;
    if (r.rule) return "already ruled";
    if (r.legacy === true) return "legacy";
    if (reviewQueued.has(r.key)) return "in review-queue.json";
    if (triageQueued.has(r.key)) return "in queue.json";
  }
  if (!r.text) return "no text";
  if (!officialOf(r)) return "no matched official item";
  const view = viewOf(r.key);
  if (view === undefined) return "not in the engine view";
  if (view === null) return "missing from the engine view";
  const structure = documentOf(r);
  if (structure === null || structure === undefined) return "official item not in the dumps";
  const fp = viewFingerprint(view, core, structure);
  const swept = viewOf.sweptCore;
  if (second) return stands(rereadOf(r).view, fp, swept) ? null : "view changed since the first reread";
  // Ruling R48 (`again`): a standing reread that found something missing is offered once more, to a reader who reads the
  // engine's source; a covered one never is (its second reader settles it).
  const standing = isItemReread(r) && stands(rereadOf(r).view, fp, swept);
  return standing && !(again && rereadOf(r).covered === false) ? "reread for the current view" : null;
}

/**
 * Item reread batches `{ id, stage: "reread", items: true, second?, core, entries }` (ids `<book>-reread-items-<NNN>`, or
 * `<book>-reread-items-second-<NNN>`, numbered after `after`), `leftOut` (the count of each reason a candidate was left out)
 * and `byLevel` (the entries cut per engine level). `viewOf(key)`: parseEngineView's lookup; `documentOf(record)`: the
 * official item's structure (null when it is not in the dumps); `core` loadCore's (its version names the view).
 */
export function cutItemRereadBatches(records, options) {
  const { size = ITEM_REREAD_BATCH_SIZE, after = {}, viewOf, documentOf, core, second = false } = options;
  if (typeof viewOf !== "function") throw new TypeError("cutItemRereadBatches needs viewOf (the engine view, R42)");
  if (typeof documentOf !== "function") throw new TypeError("cutItemRereadBatches needs documentOf (the item's structure)");
  const leftOut = {};
  const byLevel = {};
  const open = [];
  for (const r of records) {
    const why = itemRereadSkipReason(r, options);
    if (why === null) {
      open.push(r);
      const { level } = viewOf(r.key);
      byLevel[level] = (byLevel[level] ?? 0) + 1;
    } else if (why !== NOT_ITEM_ENTRY && why !== NOT_ITEM_CORE) leftOut[why] = (leftOut[why] ?? 0) + 1;
  }
  const series = second ? "reread-items-second" : "reread-items";
  const batches = [];
  const counts = new Map(Object.entries(after));
  for (const [book, ofBook] of groupBy(open, (r) => r.book.toLowerCase())) {
    for (let i = 0; i < ofBook.length; i += size) {
      const n = (counts.get(book) ?? 0) + 1;
      counts.set(book, n);
      const id = `${book}-${series}-${String(n).padStart(3, "0")}`;
      const entries = ofBook.slice(i, i + size).map((r) => entryOf(r, viewOf(r.key),
        viewFingerprint(viewOf(r.key), core, documentOf(r))));
      batches.push({ id, stage: "reread", items: true, ...(second ? { second: true } : {}),
        ...(options.again === true && !second ? { again: true } : {}), core: core?.version, entries });
    }
  }
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort());
  return { batches, leftOut: sorted(leftOut), byLevel: sorted(byLevel) };
}

/** `<book>-reread-items[-second]-report.json`: counts only (no key, no name): batches, entries, reasons, engine levels. */
export const itemRereadReport = (book, batches, leftOut, byLevel) => ({
  book, batches: batches.length, cut: batches.reduce((n, b) => n + b.entries.length, 0),
  leftOut: Object.fromEntries(Object.entries(leftOut).sort()), byLevel: Object.fromEntries(Object.entries(byLevel).sort())
});

// One result: `{ reject }`, `{ unsure }`, `{ already }`, or `{ apply: { next, outcome } }` (outcome: covered, beyond, agreed,
// disagreed, unsureReverted).
function takeResult(result, ctx) {
  const { byKey, offered, current, textOf, core, by, at, seen, second, reviewQueued, triageQueued } = ctx;
  if (!isObject(result)) return { reject: "result must be an object" };
  const forbidden = forbiddenKeyIn(result);
  if (forbidden) return { reject: `a key named ${forbidden.split(/[.[]/).pop()} (at ${forbidden})` };
  const extra = unknownFields(result, ITEM_REREAD_RESULT_FIELDS);
  if (extra.length) return { reject: `unknown field ${echo(extra[0])}` };
  if (seen.has(result.key)) return { reject: "the key appears twice in this file" };
  seen.add(result.key);
  const record = byKey.get(result.key);
  if (!record) return { reject: `unknown key ${echo(result.key)}` };
  if (!offered.has(result.key)) return { reject: "not offered by this batch (its key is not an entry of the batch file)" };
  if (!isItemKind(record, ctx.unreadMonster)) {
    return { reject: "a monster feature the engine reads: its reread is against the engine's reading (without --items)" };
  }
  if (second && settledBySecond(record)) return { already: settledBySecond(record) };
  if (second) {
    if (!isProvisional(record)) return { reject: "not a provisional covered item reread: a second reread reads only those" };
    if (rereadOf(record).by.toLowerCase() === by.toLowerCase()) {
      return { reject: "the second rereader must be another reader than the first (case aside)" };
    }
  } else {
    if (record.rule) return { reject: "the record has a rule: an item reread reads unruled entry records" };
    if (record.legacy === true) return { reject: "legacy record: it leaves legacy through a person" };
    if (record.verdict !== "entry") return { reject: `the verdict is ${record.verdict}, not entry: a reread reads entry records` };
    if (reviewQueued.has(record.key)) return { reject: "the record waits for a person in review-queue.json" };
    if (triageQueued.has(record.key)) return { reject: "the record waits for a person in queue.json" };
  }
  const now = current.get(result.key);
  if (!now || !isObject(now.view)) return { reject: "stale: the engine view has no level for the item now (read again)" };
  const fp = viewFingerprint(now.view, core, now.structure ?? null);
  const cut = offered.get(result.key);
  if (!(isObject(cut) && cut.sha === fp.sha && cut.core === fp.core)) {
    return { reject: "stale: the engine view or the engine differs from the one the batch was cut against (cut again)" };
  }
  if (second && !stands(rereadOf(record).view, fp, ctx.swept)) {
    return { reject: "stale: the first reread judged another engine view (cut a new reread batch)" };
  }
  if (!second && isItemReread(record) && stands(rereadOf(record).view, fp, ctx.swept)
    && !(ctx.again === true && rereadOf(record).covered === false)) {
    return { reject: "already reread for this engine view: only an unsure or stale reread is read again" };
  }
  // Ruling R48: a named engine file, for `coveredBy: "engine"` only, and one that exists in the engine in use.
  if (Object.hasOwn(result, "mechanism")) {
    if (!(result.covered === true && result.coveredBy === "engine")) {
      return { reject: "mechanism goes with covered: true and coveredBy engine only" };
    }
    if (typeof result.mechanism !== "string" || !MECHANISM.test(result.mechanism)) {
      return { reject: "mechanism must be a path under the engine's module/scripts ending in .mjs" };
    }
    if (typeof ctx.mechanismExists !== "function" || ctx.mechanismExists(result.mechanism) !== true) {
      return { reject: `mechanism ${echo(result.mechanism)} is not a file of the engine in use` };
    }
  }
  if (typeof result.covered !== "boolean") return { reject: "covered must be true or false" };
  if (result.covered) {
    if (Object.hasOwn(result, "beyond")) return { reject: "covered: true carries no beyond" };
    if (Object.hasOwn(result, "unexpressed")) return { reject: "covered: true carries no unexpressed" };
    if (!COVERED_BY.includes(result.coveredBy)) {
      return { reject: `covered: true needs coveredBy, one of ${COVERED_BY.join(", ")}` };
    }
    const levels = COVERED_BY_LEVELS[result.coveredBy];
    // Ruling R48: with a named mechanism the engine may cover an item it has no rule of its own for.
    if (!levels.includes(now.view.level) && !Object.hasOwn(result, "mechanism")) {
      return { reject: `coveredBy ${result.coveredBy} needs the engine view's level to be ${levels.join(" or ")}, it is`
        + ` ${now.view.level}${now.view.level === "manual" ? " (manual: the engine does nothing with it)" : ""}`
        + (result.coveredBy === "engine" ? "; a reader of the engine's source names the file in mechanism (Ruling R48)" : "") };
    }
  } else if (Object.hasOwn(result, "coveredBy")) return { reject: "coveredBy goes with covered: true only" };
  const unfit = confidenceProblem(result.confidence) ?? whyProblem(result.why);
  if (unfit) return { reject: unfit };
  if (!result.covered) {
    const problem = missingProblem(result, { reading: null, structure: now.structure ?? null, core });
    if (problem) return { reject: problem };
  }
  const text = textOf(record);
  if (text === null) return { reject: "no text in the cache: nothing to check the result against" };
  const quoted = whyQuotes(result.why, text);
  if (quoted) return { reject: quoted };
  const unsure = result.confidence < QUEUE_THRESHOLD;
  if (unsure && !second) return { unsure: true };

  const found = (k) => (Object.hasOwn(result, k) ? { [k]: structuredClone(result[k]) } : {});
  const view = { core: fp.core, sha: fp.sha };
  // A second reader below the threshold: what it said is not taken, only that it was unsure (fail closed, below).
  const reading = unsure ? { by, at, confidence: result.confidence, view, outcome: SECOND_UNSURE }
    : { by, at, confidence: result.confidence, view, covered: result.covered,
      ...(result.covered ? { coveredBy: result.coveredBy, ...found("mechanism") }
        : { ...found("beyond"), ...found("unexpressed") }) };
  const { textChangedAt, ...rest } = record;
  if (second) {
    const { provisional, ...first } = rereadOf(record);
    const reread = { ...first, second: reading };
    if (!unsure && result.covered && result.coveredBy === first.coveredBy) {
      return { apply: { outcome: "agreed",
        next: { ...rest, evidence: { ...record.evidence, triaged: { ...record.evidence.triaged, reread } } } } };
    }
    // Fail closed: another coveredBy, something beyond, something unexpressed, or an unsure second reader takes the record
    // back to what it was before the first reread (`was`); the drafts queue is not restored: it is draftable again.
    const { why, evidence, hint, ...base } = rest;
    const { was } = evidence.triaged;
    const { triaged, ...others } = evidence;
    const beyond = !unsure && result.covered === false;
    const kept = beyond ? { hint: "beyond-engine" } : hint === undefined ? {} : { hint };
    const restored = { ...base, verdict: was.verdict, ...(was.why === undefined ? {} : { why: was.why }), ...kept,
      evidence: { ...others, triaged: { ...(was.triaged ?? {}), reread } } };
    return { apply: { outcome: unsure ? "unsureReverted" : "disagreed", next: restored } };
  }
  const before = readerTriaged(record);
  const { hint, ...unhinted } = rest;
  if (result.covered) {
    // A stale `beyond-engine` of an older reread goes; any other hint (the rule-based triage's) stays.
    const keep = hint === undefined || hint === "beyond-engine" ? {} : { hint };
    const was = { verdict: record.verdict, ...(typeof record.why === "string" ? { why: record.why } : {}),
      ...(before && isReaderHandle(before.by) ? { triaged: before } : {}) };
    return { apply: { outcome: "covered", next: { ...unhinted, ...keep, verdict: COVERED_VERDICT[result.coveredBy],
      why: ITEM_REREAD_WHY[result.coveredBy], evidence: { ...record.evidence,
        triaged: { by: "rule", at, was, reread: { ...reading, provisional: true } } } } } };
  }
  return { apply: { outcome: "beyond", next: { ...unhinted, hint: "beyond-engine",
    evidence: { ...record.evidence, triaged: { ...(before ?? {}), reread: reading } } } } };
}

/**
 * Applies item reread results to a copy of `records` (`ingest <results-file> --reread --items [--second] --batch <batch
 * file>`, docs/PIPELINE.md "Ingesting rereads"). `offered`: a Map of the batch file's keys to the view fingerprint each entry
 * was cut against; `current`: a Map of key to `{ view, structure }`, the engine view of today (null when missing) and the
 * official item's structure (structure.mjs structureOf); `core` loadCore's (the version, the enumerations `beyond` is checked
 * against). `draftsQueue` says which covered keys leave that queue; `reviewQueued`, `triageQueued` (Sets of keys) are
 * records a person holds. Returns `{ records, covered, beyond, unsure, dequeued, rejected }`, or with `second` `{ records,
 * agreed, disagreed, unsureReverted, alreadyConfirmed, alreadyReverted, rejected }`. Inputs unchanged.
 */
export function ingestItemRereads(records, results, options = {}) {
  const { textDir, by, at = new Date().toISOString(), core, offered, current, draftsQueue = [], second = false,
    reviewQueued = new Set(), triageQueued = new Set(), unreadMonster, again = false, mechanismExists, swept } = options;
  if (!isReaderHandle(by)) throw new Error(`by must match ${BY} and not be "rule"`);
  if (!core || typeof core !== "object") throw new TypeError("ingestItemRereads needs core (loadCore: version and words)");
  if (!(offered instanceof Map)) throw new TypeError("ingestItemRereads needs offered (a Map of the batch's keys to views)");
  if (!(current instanceof Map)) throw new TypeError("ingestItemRereads needs current (a Map of key to { view, structure })");
  const out = structuredClone(records);
  const byKey = new Map(out.map((r) => [r.key, r]));
  const ctx = { byKey, offered, current, textOf: cachedText(textDir), core, by, at, seen: new Set(), second, reviewQueued,
    triageQueued, unreadMonster, again, mechanismExists, swept };
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
 * The local gate note for a record an item reread judged (never a failure; never under --ci, which needs no view): null
 * while every reading of the record judged the view of today (`now`: its viewFingerprint, null when the view has no level for
 * the item, undefined when no view file is given) with an engine no older than DAS_CORE's (`core`); otherwise one line,
 * "stale: read again". Without a view file only the engine version can be checked.
 */
export function itemRereadStaleNote(record, now, { core, swept } = {}) {
  if (!isItemReread(record)) return null;
  const reread = rereadOf(record);
  const judged = [reread.view, ...(isObject(reread.second) ? [reread.second.view] : [])];
  const judgedCore = reread.view?.core;
  if (judged.some((fp) => isOlderVersion(fp?.core, core?.version)) && !sweptOn(swept, core?.version)) {
    return `reread: stale: judged against the engine view under DAS · Core ${judgedCore}, older than ${core?.version}:`
      + " read again";
  }
  if (now === undefined) {
    return "reread: the engine view is not given (RULEPACK_ENGINE_VIEW): the view judged cannot be checked";
  }
  if (now === null) return "reread: stale: the engine view has no level for the item now: read again";
  if (judged.every((fp) => stands(fp, now, swept))) return null;
  return `reread: stale: the engine view classifies the item otherwise than when judged (DAS · Core ${judgedCore}):`
    + " read again";
}
