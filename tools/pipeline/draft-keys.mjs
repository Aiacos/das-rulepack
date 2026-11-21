// What a drafter agent may write in `rule.entry` (Ruling R6), narrower than the engine's ENTRY_KEYS, and for each key the slot
// its document ids sit in (Ruling R4). Each slot was read off the key's validator in the DAS_CORE clone
// (module/scripts/core/content/entry.mjs, extras.mjs, steps.mjs, annex.mjs, core/data-fixes.mjs):
//   activityMap  activity ids as the keys of an object, or as a list: the ids of several origins sit side by side
//   effectMap    the same with effect ids
//   single       a field that holds one id (`onHit.save`): the key may name one origin only, the others go in rule.uncovered
//   none         no id at all
// A text that needs another key is drafted as outcome "person", never approximated. tests/pipeline/draft-keys.test.mjs checks
// every key and slot against the engine.
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
  // A fix is applied to the item data of its path: official origin only, a `from` guard on every fix, no `create`, no prose,
  // never a monster feature (the data-fix gate has no document for `<actor id>.<item id>` yet).
  dataFixes: slot("single")
});

/** The entry keys whose slot holds one id (Ruling R4: such a key, when it holds an id, names one origin only). */
export const singleSlotKeys = (entry) =>
  Object.keys(entry ?? {}).filter((k) => Object.hasOwn(DRAFT_KEYS, k) && DRAFT_KEYS[k].slot === "single");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The longest string a data fix may write: a value, an enumeration word, a short formula. Never a sentence.
export const FIX_STRING_MAX = 60;
// Paths that hold prose (names, descriptions, chat text, images, flags): a data fix never writes them.
const PROSE_SEGMENT = /^(name|description|chat\w*)$/i;
const PROSE_PREFIX = /^(?:(?:system\.description|system\.unidentified|img)(?:\.|$)|flags\.)/;
const isProsePath = (path) => path === "name" || PROSE_PREFIX.test(path) || path.split(".").some((p) => PROSE_SEGMENT.test(p));

// A guard that says what the data holds before the fix: a scalar, or a non-empty object or array with no empty object or
// array anywhere inside (the engine's matcher takes `{}` for "anything").
function isGuard(v) {
  if (v === null || typeof v !== "object") return v !== undefined && v !== "";
  const values = Array.isArray(v) ? v : Object.values(v);
  return values.length > 0 && values.every(isGuard);
}
const longString = (v) => (typeof v === "string" ? v.length > FIX_STRING_MAX
  : v !== null && typeof v === "object" && Object.values(v).some(longString));

// What a drafter may not do with `dataFixes`, beyond the engine's own validator.
function fixProblems(fixes) {
  const problems = [];
  (Array.isArray(fixes) ? fixes : []).forEach((f, i) => {
    const at = `dataFixes[${i}]`;
    if (!isObject(f)) return;
    if ("create" in f) return problems.push(`${at}: create is not for a drafter (an effect to create goes to a person)`);
    if (!("from" in f)) problems.push(`${at}: from is required`);
    else if (!isGuard(f.from)) problems.push(`${at}.from: a non-empty guard (a scalar, or an object or array without empty parts)`);
    if (typeof f.path === "string" && isProsePath(f.path)) problems.push(`${at}.path: prose (name, description, chat, img, flags)`);
    if (longString(f.value)) problems.push(`${at}.value: a string longer than ${FIX_STRING_MAX} characters`);
  });
  return problems;
}

/**
 * Why a drafter may not write this entry, or []: a key outside DRAFT_KEYS, and the limits of `dataFixes` (no `create`, a
 * non-empty `from` guard on every fix, no prose path, no long string, official origin only, never a monster feature).
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
