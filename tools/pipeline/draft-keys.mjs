// What a drafter agent may write in `rule.entry` (Ruling R6), narrower than the engine's ENTRY_KEYS, and for each key the slot
// its document ids sit in (Ruling R4). Each slot was read off the key's validator in the DAS_CORE clone
// (module/scripts/core/content/entry.mjs, extras.mjs, steps.mjs, annex.mjs, core/data-fixes.mjs):
//   activityMap  activity ids as the keys of an object, or as a list: the ids of several origins sit side by side
//   effectMap    the same with effect ids
//   single       a field that holds one id (`onHit.save`): the key may name one origin only, the others go in rule.uncovered
//   none         no id at all
// A text that needs another key is drafted as outcome "person", never approximated. tests/pipeline/draft-keys.test.mjs checks
// every key and slot against the engine.
import { FIX_TYPES, typeProblem } from "./fix-types.mjs";

export const SLOTS = Object.freeze(["activityMap", "effectMap", "single", "none"]);

const slot = (s) => Object.freeze({ slot: s });
export const DRAFT_KEYS = Object.freeze({
  // Step fields hold one id each (`use.activity`, `fromEffect`, `elseEffect`, `spends`, a stage's `effect`).
  triggers: slot("single"),
  saveDamage: slot("activityMap"),
  halfOnMiss: slot("none"),
  noDamage: slot("activityMap"),
  effectEnds: slot("effectMap"),
  endsWhen: slot("none"),
  actionEnds: slot("effectMap"),
  breaksOn: slot("none"),
  noReactions: slot("effectMap"),
  actionOrBonus: slot("effectMap"),
  noOpportunity: slot("none"),
  noOpportunityAttacks: slot("effectMap"),
  saveAdvantage: slot("none"),
  saveDisadvantageFor: slot("none"),
  // `rollBonus.activity`: the one activity that pays for the bonus.
  rollBonus: slot("single"),
  rollDisadvantage: slot("none"),
  effectStatuses: slot("effectMap"),
  effectDurations: slot("effectMap"),
  savedEffects: slot("effectMap"),
  atTurnStart: slot("single"),
  usageLimits: slot("activityMap"),
  // `ignoresResistance.from`: a list of activity ids.
  ignoresResistance: slot("activityMap"),
  grantsResistances: slot("none"),
  grantsConditionImmunities: slot("none"),
  difficultTerrain: slot("none"),
  targets: slot("none"),
  onHit: slot("single"),
  // A fix is applied to the item data of its path: official origin only, a typed `value` and `from` (fix-types.mjs), no
  // `create`, never a monster feature (the data-fix gate has no document for `<actor id>.<item id>` yet).
  dataFixes: slot("single")
});

/** The entry keys whose slot holds one id (Ruling R4: such a key, when it holds an id, names one origin only). */
export const singleSlotKeys = (entry) =>
  Object.keys(entry ?? {}).filter((k) => Object.hasOwn(DRAFT_KEYS, k) && DRAFT_KEYS[k].slot === "single");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The paths a drafter's data fix may write: an allowlist of leaves (exact case; ids are 16 letters and digits), each with the
// type of what it holds (fix-types.mjs FIX_TYPES). Anything else (a name, a description, chat text, a condition, flags, an
// image...) goes to a person. The leaves were checked against the fixes DAS · Core ships (module/scripts/content/*.mjs).
export const FIX_PATHS = Object.freeze(Object.fromEntries(Object.entries(FIX_TYPES)
  .map(([where, types]) => [where, Object.freeze(Object.keys(types))])));
export const MAX_FIXES = 12;
const ACTIVITY_PATH = /^system\.activities\.[A-Za-z0-9]{16}\.(.+)$/;
// The type of the leaf a fix writes, or undefined when its path is not allowed.
function leafType(fix) {
  if (typeof fix.path !== "string") return undefined;
  if ("effect" in fix) return Object.hasOwn(FIX_TYPES.effect, fix.path) ? FIX_TYPES.effect[fix.path] : undefined;
  const leaf = fix.path.match(ACTIVITY_PATH)?.[1];
  const [types, key] = leaf !== undefined ? [FIX_TYPES.activity, leaf] : [FIX_TYPES.item, fix.path];
  return Object.hasOwn(types, key) ? types[key] : undefined;
}

// What a drafter may not do with `dataFixes`, beyond the engine's own validator: `value` and `from` have the type of the
// leaf (`from: []` only where the leaf is a list: "it was empty"), at most MAX_FIXES fixes, one fix per (target, path).
function fixProblems(fixes) {
  const list = Array.isArray(fixes) ? fixes : [];
  const problems = list.length > MAX_FIXES ? [`dataFixes: at most ${MAX_FIXES} fixes`] : [];
  const seen = new Map();
  list.forEach((f, i) => {
    const at = `dataFixes[${i}]`;
    if (!isObject(f)) return;
    if ("create" in f) return problems.push(`${at}: create is not for a drafter (an effect to create goes to a person)`);
    const where = `${f.effect ?? "item"} ${f.path}`;
    if (seen.has(where)) problems.push(`${at}: the same path as dataFixes[${seen.get(where)}] (one fix per path)`);
    else seen.set(where, i);
    const type = leafType(f);
    if (!type) return problems.push(`${at}.path: not an allowed leaf (it goes to a person)`);
    if (!("value" in f)) problems.push(`${at}.value: required`);
    else {
      const problem = typeProblem(type, f.value);
      if (problem) problems.push(`${at}.value: must be ${problem}`);
    }
    if (!("from" in f)) problems.push(`${at}: from is required`);
    else {
      const problem = typeProblem(type, f.from);
      if (problem) problems.push(`${at}.from: must be ${problem} (the leaf's type)`);
    }
  });
  return problems;
}

/**
 * Why a drafter may not write this entry, or []: a key outside DRAFT_KEYS, and the limits of `dataFixes` (no `create`, a
 * path of FIX_PATHS, `value` and `from` of the leaf's type, at most MAX_FIXES fixes and one per path, official origin only,
 * never a monster feature).
 * `origins` (the rule's) and `kind` (the record's) are required: without them the limits could not be applied, so the call
 * throws rather than pass.
 */
export function checkDraftKeys(entry, { origins, kind } = {}) {
  if (!Array.isArray(origins) || typeof kind !== "string" || !kind) {
    throw new TypeError("checkDraftKeys: origins and kind are required");
  }
  if (!isObject(entry)) return ["entry: must be an object"];
  const problems = [];
  for (const key of Object.keys(entry)) {
    if (!Object.hasOwn(DRAFT_KEYS, key)) problems.push(`${key}: not a drafter key (draft the record as outcome "person")`);
  }
  if ("dataFixes" in entry) {
    problems.push(...fixProblems(entry.dataFixes));
    if (!(origins.length === 1 && origins[0] === "official")) problems.push("dataFixes: official origin only");
    if (kind === "monster") problems.push("dataFixes: never on a monster feature");
  }
  return problems;
}
