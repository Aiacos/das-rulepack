// What a drafter agent may write in `rule.entry` (Ruling R6), narrower than the engine's ENTRY_KEYS, and for each key the slot
// its document ids sit in (Ruling R4). Each slot was read off the key's validator in the DAS_CORE clone
// (module/scripts/core/content/entry.mjs, extras.mjs, steps.mjs, annex.mjs, core/data-fixes.mjs):
//   activityMap  activity ids as the keys of an object, or as a list: the ids of several origins sit side by side
//   effectMap    the same with effect ids
//   single       a field that holds one id (`onHit.save`): the key may name one origin only, the others go in rule.uncovered
//   none         no id at all
// A text that needs another key is drafted as outcome "person", never approximated. tests/pipeline/draft-keys.test.mjs checks
// every key and slot against the engine.
import { FIX_ENUMS, FIX_TYPES, typeProblem } from "./fix-types.mjs";
import { splitWords } from "./text.mjs";
import * as sh from "./shapes.mjs";

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

// The value shape of every DRAFT_KEYS key (shapes.mjs): what the engine's validator accepts from a drafter, with the ids where
// the slot says. The vocabulary file gives them to drafters; tests/pipeline/batch-draft-round1.test.mjs builds a value from every
// alternative of every shape and has the engine's validateEntry accept it (DAS_CORE), so a shape cannot drift from the engine.
// A shape lists the common alternatives, not every option of the engine: a text that needs more goes to a person.
const { values, word, object, list, idMap, idList, id, oneOf, tagged, TRUE, NUMBER, FORMULA } = sh;
const WHOLE = oneOf(TRUE, idList("effect"));
const STEP_ON_OUTCOME = tagged("type", {
  status: object({ status: word("statuses") }),
  damage: object({ formula: FORMULA, damageType: word("damageTypes") }, { onSave: values(["half", "none"]) }),
  move: object({ mode: word("moveModes"), distance: Object.freeze({ type: "number", formula: false }), units: values(["ft"]) })
});
const STEP_RESAVE = tagged("type", { resave: object({}, { advantage: TRUE, keep: TRUE }) });
export const DRAFT_SHAPES = Object.freeze({
  // `on` may be any moment of the engine and a step must fit it (outcome steps at hit or failedSave, resave at a turn moment):
  // the two alternatives are the common ones, the others go to a person.
  triggers: list(oneOf(
    object({ on: Object.freeze({ ...word("moments", "failedSave"), sampleOnly: true }), do: list(STEP_ON_OUTCOME) }),
    object({ on: Object.freeze({ ...word("moments", "endOfTurn"), sampleOnly: true }), via: values(["effect"]),
      do: list(STEP_RESAVE) }, { fromEffect: id("effect") })
  )),
  saveDamage: idMap("activity", values(["half", "none"])),
  halfOnMiss: TRUE,
  noDamage: idList("activity"),
  effectEnds: idMap("effect", word("effectEnds")),
  endsWhen: object({}, {
    armor: values(["any", "heavy"]), zeroHp: TRUE, unaffected: values(["failedSave", "noHits", "noTargets"]),
    apart: object({ distance: Object.freeze({ type: "number", formula: false }), units: values(["ft"]) },
      { at: values(["move", "casterTurnEnd"]) }),
    spell: TRUE, healedByMagic: TRUE
  }, { atLeastOne: true }),
  actionEnds: idMap("effect", object({ by: values(["bearer", "other"]) },
    { roll: values(["check"]), verb: values(["wake"]), status: values(["prone"]), spell: TRUE, turnStart: TRUE })),
  breaksOn: list(values(["attack", "damage", "spell", "save", "forcesSave"])),
  noReactions: WHOLE,
  actionOrBonus: WHOLE,
  noOpportunity: values(["always", "flying", "afterUse", "whileEffect"]),
  noOpportunityAttacks: WHOLE,
  saveAdvantage: list(word("statuses")),
  saveDisadvantageFor: list(word("creatureTypes")),
  rollBonus: object({ activity: id("activity"), on: list(values(["save", "check", "attack", "initiative"])) },
    { luck: TRUE, succeed: TRUE }),
  rollDisadvantage: object({ on: list(values(["check", "save"])) }),
  effectStatuses: idMap("effect", oneOf(list(word("statuses")), object({ set: list(word("statuses")) }))),
  effectDurations: idMap("effect", oneOf(object({ seconds: Object.freeze({ type: "number", formula: false }) }),
    object({ formula: FORMULA, units: values(["seconds", "minutes", "hours"]) }))),
  savedEffects: idList("effect"),
  atTurnStart: object({ activity: id("activity") }),
  usageLimits: idMap("activity", object({}, {
    oncePerTurn: TRUE, lowestSlot: TRUE, noDialog: TRUE, unmoved: TRUE, cost: values(["action", "bonus", "reaction", "free"])
  }, { atLeastOne: true })),
  ignoresResistance: object({ types: list(word("damageTypes")) }, { from: idList("activity") }),
  grantsResistances: list(word("damageTypes")),
  grantsConditionImmunities: list(word("statuses")),
  difficultTerrain: object({}, { cost: Object.freeze({ type: "number", min: 2, formula: false }),
    lingers: values(["casterNextTurnEnd"]) }, { atLeastOne: true }),
  targets: object({}, { types: list(word("creatureTypes")) }, { atLeastOne: true }),
  onHit: object({ save: id("activity") }, { whileEnchanted: id("effect") }),
  // A data fix is described by `fixes` of the vocabulary: its `path` is one of `fixes.paths`, its `value` and `from` have the
  // type `fixes.types` gives for that path.
  dataFixes: Object.freeze({ type: "see", at: "fixes" })
});

// Ruling R24, fix round 1 (L3): the rolls on which each drafter key changes the damage the item's own activity deals, so that
// a review's "full damage on this roll" is never taken for the item's baseline where the rule touches it. A function of the
// key's value: a list of rolls (assert.mjs ROLLS), ALL_ROLLS, or []. A key added to DRAFT_KEYS without a line here fails a
// test (tests/pipeline/review-calibration.test.mjs); a key that is not in this table is taken as touching every roll.
export const ALL_ROLLS = "all";
const ROLL_MOMENTS = ["hit", "miss", "crit", "failedSave", "savedSave"];
// The trigger steps that never change damage: a condition, a move, a repeated save. Every other step type (damage, halve,
// reduce, uncrit, miss, reroll, bonus, absorb...) is taken as touching it.
const DAMAGE_FREE_STEPS = new Set(["status", "move", "resave"]);
const none = () => [];
const all = () => ALL_ROLLS;
function triggerRolls(value) {
  const declarations = Array.isArray(value) ? value : [value];
  const rolls = new Set();
  for (const d of declarations) {
    const steps = Array.isArray(d?.do) ? d.do : [d?.do];
    if (steps.every((st) => isObject(st) && DAMAGE_FREE_STEPS.has(st.type))) continue;
    for (const on of Array.isArray(d?.on) ? d.on : [d?.on]) {
      if (!ROLL_MOMENTS.includes(on)) return ALL_ROLLS;
      rolls.add(on);
    }
  }
  return [...rolls];
}
export const DAMAGE_ROLLS = Object.freeze({
  triggers: triggerRolls,
  saveDamage: () => ["savedSave"],
  halfOnMiss: () => ["miss"],
  noDamage: all,
  effectEnds: none, endsWhen: none, actionEnds: none, breaksOn: none, noReactions: none, actionOrBonus: none,
  noOpportunity: none, noOpportunityAttacks: none, saveAdvantage: none, saveDisadvantageFor: none,
  // The drafter's `rollBonus.on` names attack, save, check and initiative rolls: never damage; anything else is taken as damage.
  rollBonus: (v) => ((Array.isArray(v?.on) ? v.on : []).every((o) => ["save", "check", "attack", "initiative"].includes(o))
    ? [] : ALL_ROLLS),
  rollDisadvantage: none, effectStatuses: none, effectDurations: none, savedEffects: none,
  // An activity used at the start of a turn, or forced as a save by a hit: its damage is dealt outside the item's own roll.
  atTurnStart: all,
  usageLimits: none,
  ignoresResistance: all,
  grantsResistances: none, grantsConditionImmunities: none, difficultTerrain: none, targets: none,
  onHit: () => ["hit"],
  // A data fix may rewrite the activity's damage parts.
  dataFixes: all
});
/** The rolls on which an entry changes the item's own damage (DAMAGE_ROLLS; an unknown key: every roll). */
export function damageRollsOf(entry) {
  if (!isObject(entry)) return [];
  const rolls = new Set();
  for (const [key, value] of Object.entries(entry)) {
    const touched = has(DAMAGE_ROLLS, key) ? DAMAGE_ROLLS[key](value) : ALL_ROLLS;
    if (touched === ALL_ROLLS) return ALL_ROLLS;
    for (const r of touched) rolls.add(r);
  }
  return [...rolls];
}

/** The entry keys whose slot holds one id (Ruling R4: such a key, when it holds an id, names one origin only). */
export const singleSlotKeys = (entry) =>
  Object.keys(entry ?? {}).filter((k) => has(DRAFT_KEYS, k) && DRAFT_KEYS[k].slot === "single");

// Own properties only: a key named like an inherited one (`constructor`, `toString`...) is never taken for a known key.
const has = (o, k) => Object.hasOwn(o, k);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The paths a drafter's data fix may write: an allowlist of leaves (exact case; ids are 16 letters and digits), each with the
// type of what it holds (fix-types.mjs FIX_TYPES). Anything else (a name, a description, chat text, a condition, flags, an
// image...) goes to a person. The leaves were checked against the fixes DAS · Core ships (module/scripts/content/*.mjs).
export const FIX_PATHS = Object.freeze(Object.fromEntries(Object.entries(FIX_TYPES)
  .map(([where, types]) => [where, Object.freeze(Object.keys(types))])));
export const MAX_FIXES = 12;
const CHANGE_PATHS = ["changes", "system.changes"];
const ACTIVITY_PATH = /^system\.activities\.[A-Za-z0-9]{16}\.(.+)$/;
// The type of the leaf a fix writes, or undefined when its path is not allowed.
function leafType(fix) {
  if (typeof fix.path !== "string") return undefined;
  if (has(fix, "effect")) return has(FIX_TYPES.effect, fix.path) ? FIX_TYPES.effect[fix.path] : undefined;
  const leaf = fix.path.match(ACTIVITY_PATH)?.[1];
  const [types, key] = leaf !== undefined ? [FIX_TYPES.activity, leaf] : [FIX_TYPES.item, fix.path];
  return has(types, key) ? types[key] : undefined;
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
    if (has(f, "create")) return problems.push(`${at}: create is not for a drafter (an effect to create goes to a person)`);
    const where = `${f.effect ?? "item"} ${f.path}`;
    if (seen.has(where)) problems.push(`${at}: the same path as dataFixes[${seen.get(where)}] (one fix per path)`);
    else seen.set(where, i);
    // One effect's changes are written through one path: `changes` or `system.changes`, never both.
    if (has(f, "effect") && CHANGE_PATHS.includes(f.path)) {
      const other = CHANGE_PATHS.find((p) => p !== f.path);
      if (seen.has(`${f.effect} ${other}`)) problems.push(`${at}: changes and system.changes on the same effect (one of them)`);
    }
    const type = leafType(f);
    if (!type) return problems.push(`${at}.path: not an allowed leaf (it goes to a person)`);
    if (!has(f, "value")) problems.push(`${at}.value: required`);
    else {
      const problem = typeProblem(type, f.value);
      if (problem) problems.push(`${at}.value: must be ${problem}`);
    }
    if (!has(f, "from")) problems.push(`${at}: from is required`);
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
    if (!has(DRAFT_KEYS, key)) problems.push(`${key}: not a drafter key (draft the record as outcome "person")`);
  }
  if (has(entry, "dataFixes")) {
    problems.push(...fixProblems(entry.dataFixes));
    if (!(origins.length === 1 && origins[0] === "official")) problems.push("dataFixes: official origin only");
    if (kind === "monster") problems.push("dataFixes: never on a monster feature");
  }
  problems.push(...forbiddenKeys(entry));
  const words = entryWords(entry);
  if (words.size > ENTRY_WORD_BUDGET) {
    problems.push(`entry: more than ${ENTRY_WORD_BUDGET} distinct words in its strings (${words.size}; Ruling R19)`);
  }
  return problems;
}

// Keys that name an object's prototype machinery: never a key of an entry, at any depth.
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function forbiddenKeys(node, at = "entry", out = []) {
  if (Array.isArray(node)) node.forEach((x, i) => forbiddenKeys(x, `${at}[${i}]`, out));
  else if (isObject(node)) {
    for (const k of Object.keys(node)) {
      if (FORBIDDEN_KEYS.has(k)) out.push(`${at}: a key named ${k}`);
      forbiddenKeys(node[k], `${at}.${k}`, out);
    }
  }
  return out;
}

/**
 * Ruling R19: the free words an entry can carry, bounded. Every string of the entry (keys and values, at any depth) is cut
 * at its separators; a 16-character id and a word of the pack's closed vocabularies (CLOSED_WORDS) are left out; the rest is
 * split into words (text.mjs splitWords) and every alphabetic word of 3 letters or more counts, once.
 */
export const ENTRY_WORD_BUDGET = 60;
const ID16 = /^[A-Za-z0-9]{16}$/;
const CLOSED_WORDS = new Set([
  ...Object.keys(DRAFT_KEYS), ...Object.values(FIX_ENUMS).flat(),
  ...Object.values(FIX_PATHS).flat().flatMap((p) => p.split(".")),
  ...["path", "value", "from", "effect", "create", "unless", "key", "type", "mode", "priority", "target", "scaling", "formula",
    "number", "denomination", "bonus", "types", "period", "_id", "onSave", "level", "min", "max", "attack", "save",
    "override", "system", "activities"]
]);
/** True when every token of `s` is a 16-character id or a word of CLOSED_WORDS: structure, not words (a key, a path). */
export const isStructural = (s) => String(s).split(/[^A-Za-z0-9_]+/).every((t) => !t || ID16.test(t) || CLOSED_WORDS.has(t));
export function entryWords(entry) {
  const words = new Set();
  const take = (s) => {
    for (const token of String(s).split(/[^A-Za-z0-9_]+/)) {
      if (!token || ID16.test(token) || CLOSED_WORDS.has(token)) continue;
      for (const w of splitWords(token)) if (/^[a-z]{3,}$/.test(w)) words.add(w);
    }
  };
  const walk = (node) => {
    if (typeof node === "string") take(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (isObject(node)) for (const [k, v] of Object.entries(node)) { take(k); walk(v); }
  };
  walk(entry);
  return words;
}
