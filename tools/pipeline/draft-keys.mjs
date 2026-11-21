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
  // A fix is applied to the item data of its path: official origin only, `from` on every path fix, never a monster feature
  // (the data-fix gate has no document for `<actor id>.<item id>` yet).
  dataFixes: slot("single")
});

/** The entry keys whose slot holds one id (Ruling R4: such a key, when it holds an id, names one origin only). */
export const singleSlotKeys = (entry) =>
  Object.keys(entry ?? {}).filter((k) => Object.hasOwn(DRAFT_KEYS, k) && DRAFT_KEYS[k].slot === "single");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Why a drafter may not write this entry, or []: a key outside DRAFT_KEYS, and the limits of `dataFixes`. `origins` (the
 * rule's) and `kind` (the record's), when given, are checked against what `dataFixes` allows.
 */
export function checkDraftKeys(entry, { origins, kind } = {}) {
  if (!isObject(entry)) return ["entry: must be an object"];
  const problems = [];
  for (const key of Object.keys(entry)) {
    if (!Object.hasOwn(DRAFT_KEYS, key)) problems.push(`${key}: not a drafter key (draft the record as outcome "person")`);
  }
  if ("dataFixes" in entry) {
    const fixes = Array.isArray(entry.dataFixes) ? entry.dataFixes : [];
    fixes.forEach((f, i) => {
      if (isObject(f) && !("create" in f) && !("from" in f)) problems.push(`dataFixes[${i}]: from is required`);
    });
    if (Array.isArray(origins) && !(origins.length === 1 && origins[0] === "official")) {
      problems.push("dataFixes: official origin only");
    }
    if (kind === "monster") problems.push("dataFixes: never on a monster feature");
  }
  return problems;
}
