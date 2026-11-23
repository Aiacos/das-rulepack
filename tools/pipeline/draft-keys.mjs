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
import { shapeProblems } from "./shapes.mjs";
import { DRAFT_FACTS, MAX_CONDITION_FACTS, SIZES, conditionProblems } from "./conditions.mjs";
import {
  AURA_AFFECTS, EMANATION_AFFECTS, EMANATION_ON, EXCLUDED_ZONE, RADIUS_FT, TEMPLATE_TYPES, ZONE_AFFECTS, ZONE_KEYS, ZONE_MAX,
  ZONE_MOMENTS, ZONE_SECONDS, replays
} from "./zones.mjs";
import { CHOICE_EFFECTS, EXCLUDED_WARD, SPELL_LEVELS, WARD_KEYS } from "./wards.mjs";
import {
  EXCLUDED_REACTION, NOT_ADMITTED_STEPS, PENALTY_FORMULAS, PER_ROUND, REACTION_FACTS, REACTION_KEYS, REACTION_MOMENTS,
  isReactionDeclaration, reactionKind
} from "./reactions.mjs";

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
  dataFixes: slot("single"),
  // Ruling R33 (zones.mjs): `emanation.activity` and `aura.effect` hold one id each; `selfZone` is keyed by activity ids.
  emanation: slot("single"),
  aura: slot("single"),
  zoneAffects: slot("none"),
  zoneEffects: slot("none"),
  selfZone: slot("activityMap"),
  zoneLasts: slot("none"),
  zoneMax: slot("none"),
  saveAutoSuccess: slot("none"),
  // Ruling R37: newer than the engine's latest release (ENGINE_CAPABILITIES).
  saveAutoFail: slot("none"),
  willingFails: slot("none"),
  // Ruling R34 (wards.mjs): `choice.pool` is keyed by activity ids (its lists and `order` hold effect ids, side by side);
  // `blocksHealing` and `blocksTempHp` are true or a list of effect ids.
  choice: slot("activityMap"),
  barrier: slot("none"),
  globe: slot("none"),
  wardsConditions: slot("none"),
  wardsAtZero: slot("none"),
  blocksHealing: slot("effectMap"),
  blocksTempHp: slot("effectMap"),
  // Ruling R38 (reactions.mjs): `teleport.activity` and `.then`, `swapPlaces.activity` hold one id each.
  reactions: slot("none"),
  teleport: slot("single"),
  swapPlaces: slot("single"),
  light: slot("none")
});

// The value shape of every DRAFT_KEYS key (shapes.mjs): what the engine's validator accepts from a drafter, with the ids where
// the slot says. The vocabulary file gives them to drafters; tests/pipeline/batch-draft-round1.test.mjs builds a value from every
// alternative of every shape and has the engine's validateEntry accept it (DAS_CORE), so a shape cannot drift from the engine.
// A shape lists the common alternatives, not every option of the engine: a text that needs more goes to a person.
const { values, word, object, list, idMap, idList, id, oneOf, tagged, tuple, TRUE, NUMBER, FORMULA } = sh;
const WHOLE = oneOf(TRUE, idList("effect"));
const STEP_ON_OUTCOME = tagged("type", {
  status: object({ status: word("statuses") }),
  damage: object({ formula: FORMULA, damageType: word("damageTypes") }, { onSave: values(["half", "none"]) }),
  move: object({ mode: word("moveModes"), distance: Object.freeze({ type: "number", formula: false }), units: values(["ft"]) })
});
const STEP_RESAVE = tagged("type", { resave: object({}, { advantage: TRUE, keep: TRUE }) });
// Ruling R33: a zone replays the item's activity (or the one named, an activity of the item) on a creature at its moments.
const STEP_REPLAY = tagged("type", { replay: object({}, { activity: id("activity") }) });
const ZONE_ON = oneOf(values(ZONE_MOMENTS), list(values(ZONE_MOMENTS)));
export const REPLAY_DECLARATION = object({ on: ZONE_ON, do: list(STEP_REPLAY) });
// Ruling R30: the shape of each allowed fact's argument (conditions.mjs DRAFT_FACTS: an engine list, a bounded integer or
// distance, or true), and the condition itself: one object of 1 to MAX_CONDITION_FACTS of them.
const INT = (min, max) => Object.freeze({ type: "number", min, max, int: true, formula: false });
const FEET = INT(RADIUS_FT.min, RADIUS_FT.max);
const FT = values(["ft"]);
// An emanation or an aura with no radius takes the item's own template or range; one with a radius gives it in feet.
const withRadius = (required, optional) => oneOf(object(required, optional),
  object({ ...required, radius: FEET, units: FT }, optional));
// Ruling R34: the emanation of a barrier or a globe, in feet (required: the engine has no default), and a choice's pool.
const AROUND = Object.freeze({ radius: FEET, units: FT });
const BARRIER_OPTIONS = Object.freeze({ shields: TRUE, endsOnContact: TRUE });
const POOL = idMap("activity", idList("effect"));
const argShape = ({ arg }) => (arg.kind === "true" ? TRUE : arg.kind === "enum" ? word(arg.list)
  : arg.kind === "int" ? INT(arg.min, arg.max) : arg.kind === "enumList" ? list(word(arg.list))
    : object({ distance: INT(arg.min, arg.max), units: values(arg.units) }));
export const CONDITION_SHAPE = sh.facts(Object.freeze(Object.fromEntries(Object.entries(DRAFT_FACTS)
  .map(([name, f]) => [name, argShape(f)]))), MAX_CONDITION_FACTS);
// Ruling R38: the four reaction declarations a drafter may write (reactions.mjs REACTION_DECLARATIONS), each a moment, its
// steps in their order (a tuple) and a condition on the attack alone (REACTION_FACTS): an AC bonus against the hit, a hit
// turned into a miss, a melee counterattack after a miss, the item's damage dealt back to the attacker.
// Each of those facts is said by the one given field `activity`, so a reaction's condition holds one of them.
const REACTION_IF = sh.facts(Object.freeze(Object.fromEntries(REACTION_FACTS.map((f) => [f, CONDITION_SHAPE.facts[f]]))), 1);
const USE_STEP = object({ type: values(["use"]) }, { activity: id("activity") });
const reactionOn = (moment, ...steps) => object({ on: values([moment]), do: tuple(...steps) }, { if: REACTION_IF });
export const REACTION_DECLARATION = oneOf(
  reactionOn("isHit", USE_STEP, object({ type: values(["penalty"]), formula: values(PENALTY_FORMULAS, "@prof") })),
  reactionOn("isHit", USE_STEP, object({ type: values(["miss"]) })),
  reactionOn("isMissed", object({ type: values(["use"]), target: values(["source"]), weapon: TRUE }, { activity: id("activity") })),
  reactionOn("isHit", object({ type: values(["damage"]), to: values(["source"]), activity: id("activity") }))
);
// Ruling R38: a teleport of the user, after the attack or at the use, with an activity on arrival.
const TELEPORT_OPTIONS = Object.freeze({ then: id("activity"), after: values(["attack"]) });
export const DRAFT_SHAPES = Object.freeze({
  // `on` may be any moment of the engine and a step must fit it (outcome steps at hit or failedSave, resave at a turn moment):
  // the two alternatives are the common ones, the others go to a person. `if` (Ruling R30): the facts that must hold.
  triggers: list(oneOf(
    object({ on: Object.freeze({ ...word("moments", "failedSave"), sampleOnly: true }), do: list(STEP_ON_OUTCOME) },
      { if: CONDITION_SHAPE }),
    object({ on: Object.freeze({ ...word("moments", "endOfTurn"), sampleOnly: true }), via: values(["effect"]),
      do: list(STEP_RESAVE) }, { fromEffect: id("effect"), if: CONDITION_SHAPE }),
    // Ruling R33: a zone that uses the item's activity again on a creature that enters it, or starts or ends its turn in it.
    REPLAY_DECLARATION,
    // Ruling R38: the four reactions.
    ...REACTION_DECLARATION.of
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
  dataFixes: Object.freeze({ type: "see", at: "fixes" }),
  // Ruling R33 (zones.mjs ZONE_KEYS says what each does; EXCLUDED_ZONE what the engine also takes and a drafter may not).
  emanation: withRadius({ on: values(EMANATION_ON) },
    { affects: values(EMANATION_AFFECTS), sees: TRUE, activity: id("activity"), whileActive: TRUE }),
  aura: withRadius({}, { affects: values(AURA_AFFECTS), includeSelf: TRUE, effect: id("effect"),
    types: list(word("creatureTypes")), whileActive: TRUE }),
  zoneAffects: values(ZONE_AFFECTS),
  zoneEffects: TRUE,
  selfZone: idMap("activity", object({ type: values(TEMPLATE_TYPES), size: FEET, units: FT })),
  zoneLasts: object({ seconds: INT(ZONE_SECONDS.min, ZONE_SECONDS.max) }),
  zoneMax: INT(ZONE_MAX.min, ZONE_MAX.max),
  saveAutoSuccess: object({}, { types: list(word("creatureTypes")), fighting: TRUE, sizeAtLeast: word("sizes") },
    { atLeastOne: true }),
  // Ruling R37: only `types`, the engine's validator takes nothing else (core/content/entry.mjs).
  saveAutoFail: object({ types: list(word("creatureTypes")) }),
  willingFails: TRUE,
  // Ruling R34 (wards.mjs WARD_KEYS says what each does; EXCLUDED_WARD what the engine also takes and a drafter may not).
  // A choice of one effect: once, per target (which the engine prefers to a roll, so never both), or by a die whose faces
  // follow `order`; or a pool alone (effects linked to an activity, nothing to choose).
  choice: oneOf(
    object({ effects: values(CHOICE_EFFECTS) }, { pool: POOL }),
    object({ effects: values(CHOICE_EFFECTS), perTarget: TRUE }, { pool: POOL }),
    object({ effects: values(CHOICE_EFFECTS), roll: TRUE }, { order: idList("effect"), pool: POOL }),
    object({ pool: POOL })
  ),
  // Only some creatures are stopped (`onlyTypes`) or some pass (`exceptTypes`): one or the other, never both. (The named
  // alternatives first: on a tie, shapeProblems reports the first, so a wrong creature type is named as such.)
  barrier: oneOf(object({ ...AROUND, onlyTypes: list(word("creatureTypes")) }, BARRIER_OPTIONS),
    object({ ...AROUND, exceptTypes: list(word("creatureTypes")) }, BARRIER_OPTIONS), object(AROUND, BARRIER_OPTIONS)),
  globe: object({ ...AROUND, maxLevel: INT(SPELL_LEVELS.min, SPELL_LEVELS.max) }),
  wardsConditions: object({ types: list(word("creatureTypes")), statuses: list(word("statuses")) }),
  wardsAtZero: TRUE,
  blocksHealing: WHOLE,
  blocksTempHp: WHOLE,
  // Ruling R38 (reactions.mjs REACTION_KEYS says what each does; EXCLUDED_REACTION what the engine also takes and a drafter
  // may not). A teleport names its activity, or gives its own distance (then any use of the item teleports).
  reactions: object({ perRound: INT(PER_ROUND.min, PER_ROUND.max) }),
  teleport: oneOf(object({ activity: id("activity") }, TELEPORT_OPTIONS),
    object({ distance: FEET, units: FT }, { activity: id("activity"), ...TELEPORT_OPTIONS })),
  swapPlaces: object({ activity: id("activity") }),
  // A light on the bearer of the item's effects: a bright radius (and the outer dim one), or a dim radius alone.
  light: oneOf(object({ on: values(["effect"]), bright: FEET, units: FT }, { dim: FEET }),
    object({ on: values(["effect"]), dim: FEET, units: FT }))
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
    // Ruling R38: an AC bonus or a miss changes the attacker's roll, never the item's own damage.
    if (["acBonus", "hitBecomesMiss"].includes(reactionKind(d))) continue;
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
  dataFixes: all,
  // Ruling R33: an emanation deals its activity's damage at a turn moment, outside the item's own roll; the other zone keys
  // shape who is affected, where and how long, never the damage of a roll.
  emanation: all,
  aura: none, zoneAffects: none, zoneEffects: none, selfZone: none, zoneLasts: none, zoneMax: none, saveAutoSuccess: none,
  saveAutoFail: none, willingFails: none,
  // Ruling R34: which effect passes, who may come near or be reached, what the bearer is spared: never the damage of a roll.
  choice: none, barrier: none, globe: none, wardsConditions: none, wardsAtZero: none, blocksHealing: none, blocksTempHp: none,
  // Ruling R38: how many reactions, where the user goes, the light it sheds: never the damage of a roll.
  reactions: none, teleport: none, swapPlaces: none, light: none
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

/**
 * Ruling R37: the drafter keys newer than the engine's latest release, each with the loadCore flag that says the engine in use
 * knows it (asked of the engine itself, core.mjs). Without it the key is not offered (draftKeysFor, the vocabulary), draft
 * ingest refuses it (checkDraftKeys with `core`), a full gates run fails it and `gates --ci` does not (gates.mjs, as R36).
 */
export const ENGINE_CAPABILITIES = Object.freeze({ saveAutoFail: "saveAutoFail" });
export const KEY_UNKNOWN_TO_ENGINE = "the DAS · Core in use does not know this key (it is newer than that engine: update"
  + " DAS · Core)";
/** True when the engine in use (`core`, loadCore's result) knows the drafter key: always, but for ENGINE_CAPABILITIES. */
export const engineKnows = (key, core) => !has(ENGINE_CAPABILITIES, key) || core?.[ENGINE_CAPABILITIES[key]] === true;
/** DRAFT_KEYS less the keys the engine in use does not know (Ruling R37). */
export const draftKeysFor = (core) => Object.freeze(Object.fromEntries(Object.entries(DRAFT_KEYS)
  .filter(([key]) => engineKnows(key, core))));
/** `<key>: KEY_UNKNOWN_TO_ENGINE` for each key of the entry the engine in use does not know (Ruling R37). */
export const unknownToEngine = (entry, core) => (isObject(entry) ? Object.keys(entry)
  .filter((key) => has(DRAFT_KEYS, key) && !engineKnows(key, core)) : []);
export const capabilityProblems = (entry, core) => unknownToEngine(entry, core).map((key) => `${key}: ${KEY_UNKNOWN_TO_ENGINE}`);

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

const declarationsOf = (triggers) => (Array.isArray(triggers) ? triggers : isObject(triggers) ? [triggers] : []);
/**
 * Ruling R30: the problems of the conditions of an entry's triggers (conditions.mjs conditionProblems), each at
 * `triggers[i].if`, and a declaration that writes the recipe's clause list as `condition` (the engine's trigger reads `if`
 * only: it would ignore the list silently). `vocabulary` (loadCore's lists) checks the words against the engine (the
 * validator gate); without it, their shape only (the schema gate, checkDraftKeys).
 */
export function conditionProblemsOf(entry, { vocabulary = {} } = {}) {
  if (!isObject(entry) || !has(entry, "triggers")) return [];
  return declarationsOf(entry.triggers).flatMap((d, i) => {
    if (!isObject(d)) return [];
    const at = `triggers[${i}]`;
    return [
      ...(has(d, "condition") ? [`${at}.condition: not read by the engine's trigger (a condition is written as if)`] : []),
      ...(has(d, "if") ? conditionProblems(d.if, { vocabulary, at: `${at}.if` }) : [])
    ];
  });
}

// The fields and values a key may not hold, named with why (zones.mjs EXCLUDED_ZONE, wards.mjs EXCLUDED_WARD), own keys only.
function excludedIn(value, key, at, table = EXCLUDED_ZONE) {
  if (!isObject(value)) return [];
  const out = [];
  for (const [field, v] of Object.entries(value)) {
    const why = has(table, `${key}.${field}`) ? table[`${key}.${field}`] : null;
    if (why) out.push(`${at}.${field}: not a drafter's field (${why})`);
    for (const x of Array.isArray(v) ? v : [v]) {
      const what = `${key}.${field}.${x}`;
      if (typeof x === "string" && has(table, what)) {
        out.push(`${at}.${field}: "${x}" is not a drafter's value (${table[what]})`);
      }
    }
  }
  return out;
}
// The shape problems of one key's value, less those of a field already named with why (not repeated as an unknown one).
function keyProblems(value, key, table, vocabulary) {
  const named = excludedIn(value, key, key, table);
  const shape = shapeProblems(value, DRAFT_SHAPES[key], { at: key, vocabulary });
  return [...named, ...shape.filter((p) => !named.some((n) => p.startsWith(n.slice(0, n.indexOf(":")))))];
}

/**
 * Ruling R33: the problems of an entry's zone and aura keys (zones.mjs ZONE_KEYS) against their drafter shapes (DRAFT_SHAPES,
 * shapes.mjs shapeProblems: closed fields, bounded numbers, ids, closed words), and of every `triggers` declaration that
 * replays (REPLAY_DECLARATION: zone moments only, replay steps only). What the engine takes and a drafter may not (a `changes`
 * text, a radius formula, an emanation on death, a replay per square or under a condition) is named with why (EXCLUDED_ZONE).
 * `vocabulary` (loadCore's lists) checks the engine's words (creature types, sizes); without it a word need only be a word.
 */
export function zoneProblemsOf(entry, { vocabulary: given = {} } = {}) {
  if (!isObject(entry)) return [];
  // The sizes are a committed copy of the engine's (conditions.mjs SIZES, pinned to the clone): checked even without it.
  const vocabulary = { sizes: SIZES, ...given };
  const out = [];
  for (const key of Object.keys(ZONE_KEYS)) {
    if (has(entry, key)) out.push(...keyProblems(entry[key], key, EXCLUDED_ZONE, vocabulary));
  }
  if (has(entry, "triggers")) {
    declarationsOf(entry.triggers).forEach((d, i) => {
      if (!replays(d)) return;
      const at = `triggers[${i}]`;
      const named = excludedIn(d, "triggers.replay", at);
      const shape = shapeProblems(d, REPLAY_DECLARATION, { at, vocabulary });
      out.push(...named, ...shape.filter((p) => !named.some((n) => p.startsWith(n.slice(0, n.indexOf(":"))))));
    });
  }
  return out;
}

/**
 * Ruling R34: the problems of an entry's choice, barrier and ward keys (wards.mjs WARD_KEYS) against their drafter shapes
 * (DRAFT_SHAPES, shapes.mjs shapeProblems: closed fields, bounded numbers, ids of the item's own activities and effects, closed
 * words). What the engine takes and a drafter may not (a choice's prompt or outcome, a globe everywhere) is named with why
 * (EXCLUDED_WARD). `vocabulary` (loadCore's lists) checks the engine's words (creature types, statuses); without it a word
 * need only be a word.
 */
export function wardProblemsOf(entry, { vocabulary = {} } = {}) {
  if (!isObject(entry)) return [];
  return Object.keys(WARD_KEYS).filter((key) => has(entry, key))
    .flatMap((key) => keyProblems(entry[key], key, EXCLUDED_WARD, vocabulary));
}

/**
 * Ruling R38: the problems of an entry's reaction, teleport and light keys (reactions.mjs REACTION_KEYS) against their drafter
 * shapes, and of every `triggers` declaration of the reaction territory (reactions.mjs isReactionDeclaration: a reaction
 * moment, a `use`, `penalty` or `miss` step, damage dealt to the attacker) against REACTION_DECLARATION: one of four moments
 * and step sequences, a condition on the attack alone (REACTION_FACTS). What the engine also takes and a drafter may not (a
 * declaration carried by an effect, a free use, a damage formula, a light of an area, passengers…) is named with why
 * (EXCLUDED_REACTION), and so is a step the engine allows at a hit and a drafter may not write (NOT_ADMITTED_STEPS). Own
 * properties only. No engine word is involved: the same with or without the vocabulary.
 */
export function reactionProblemsOf(entry) {
  if (!isObject(entry)) return [];
  const out = [];
  for (const key of Object.keys(REACTION_KEYS)) {
    if (has(entry, key)) out.push(...keyProblems(entry[key], key, EXCLUDED_REACTION, {}));
  }
  if (!has(entry, "triggers")) return out;
  declarationsOf(entry.triggers).forEach((d, i) => {
    if (!isReactionDeclaration(d)) return;
    const at = `triggers[${i}]`;
    const named = [];
    for (const f of Object.keys(d)) {
      const what = `triggers.reaction.${f}`;
      if (has(EXCLUDED_REACTION, what)) named.push(`${at}.${f}: not a drafter's field (${EXCLUDED_REACTION[what]})`);
    }
    const steps = has(d, "do") ? (Array.isArray(d.do) ? d.do : [d.do]) : [];
    steps.forEach((s, j) => {
      if (!isObject(s) || !has(s, "type")) return;
      if (has(NOT_ADMITTED_STEPS, s.type)) {
        named.push(`${at}: not a reaction a drafter may write (${s.type}: ${NOT_ADMITTED_STEPS[s.type]})`);
        return;
      }
      for (const f of Object.keys(s)) {
        const what = `step.${s.type}.${f}`;
        if (has(EXCLUDED_REACTION, what)) named.push(`${at}.do[${j}].${f}: not a drafter's field (${EXCLUDED_REACTION[what]})`);
      }
    });
    if (has(d, "if") && isObject(d.if)) {
      for (const f of Object.keys(d.if)) {
        if (!REACTION_FACTS.includes(f)) {
          named.push(`${at}.if.${f}: not a fact of a reaction (at ${REACTION_MOMENTS.join(" or ")} the engine's target is the`
            + ` creature that reacts: only ${REACTION_FACTS.join(", ")})`);
        }
      }
    }
    if (named.length) { out.push(...named); return; }
    const shape = shapeProblems(d, REACTION_DECLARATION, { at });
    if (shape.length) {
      out.push(`${at}: not a reaction a drafter may write (an AC bonus, a hit turned into a miss, a melee counterattack or`
        + " damage dealt back, each in its shape)", ...shape);
    }
  });
  return out;
}

/**
 * Why a drafter may not write this entry, or []: a key outside DRAFT_KEYS, a trigger's condition outside DRAFT_FACTS and its
 * typed arguments (conditionProblemsOf, Ruling R30), a zone or aura key outside its closed shape (zoneProblemsOf, Ruling
 * R33), a choice, barrier or ward key outside its closed shape (wardProblemsOf, Ruling R34), and the limits of `dataFixes`
 * (no `create`, a
 * path of FIX_PATHS, `value` and `from` of the leaf's type, at most MAX_FIXES fixes and one per path, official origin only,
 * never a monster feature).
 * `origins` (the rule's) and `kind` (the record's) are required: without them the limits could not be applied, so the call
 * throws rather than pass. With `core` (loadCore's result: draft ingest), a key newer than the engine in use is refused too
 * (Ruling R37, capabilityProblems); without it (the schema gate, `--ci` included), it is not.
 */
export function checkDraftKeys(entry, { origins, kind, core } = {}) {
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
  problems.push(...conditionProblemsOf(entry));
  problems.push(...zoneProblemsOf(entry));
  problems.push(...wardProblemsOf(entry));
  problems.push(...reactionProblemsOf(entry));
  problems.push(...forbiddenKeys(entry));
  if (core !== undefined) problems.push(...capabilityProblems(entry, core));
  const words = entryWords(entry);
  if (words.size > ENTRY_WORD_BUDGET) {
    problems.push(`entry: more than ${ENTRY_WORD_BUDGET} distinct words in its strings (${words.size}; Ruling R19)`);
  }
  return problems;
}

/**
 * Ruling R43: what an ENGINEERED rule's entry may not hold, or []. The drafter vocabulary does not apply (any key of the
 * engine's ENTRY_KEYS: the validator gate asks the engine about each, and about the keys it does not know), but the limits of
 * `dataFixes` do (no `create`, a path of FIX_PATHS, `value` and `from` of the leaf's type, at most MAX_FIXES, official origin
 * only, never a monster feature), and no key names an object's prototype machinery. `origins` and `kind` are required.
 */
export function engineeredKeyProblems(entry, { origins, kind } = {}) {
  if (!Array.isArray(origins) || typeof kind !== "string" || !kind) {
    throw new TypeError("engineeredKeyProblems: origins and kind are required");
  }
  if (!isObject(entry)) return ["entry: must be an object"];
  const problems = [];
  if (has(entry, "dataFixes")) {
    problems.push(...fixProblems(entry.dataFixes));
    if (!(origins.length === 1 && origins[0] === "official")) problems.push("dataFixes: official origin only");
    if (kind === "monster") problems.push("dataFixes: never on a monster feature");
  }
  problems.push(...forbiddenKeys(entry));
  return problems;
}

/** Ruling R43: the top-level keys of an entry that are not among the engine's ENTRY_KEYS (`core.entryKeys`, a Set). */
export const unknownEntryKeys = (entry, core) => (isObject(entry) && core?.entryKeys instanceof Set
  ? Object.keys(entry).filter((key) => !core.entryKeys.has(key)) : []);

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
    "override", "system", "activities"],
  // Ruling R30: the facts of a condition, their segments, and the words of their arguments' closed lists.
  ...Object.keys(DRAFT_FACTS).flatMap((f) => [f, ...f.split(".")]), ...SIZES, "if", "distance", "units", "ft",
  // Ruling R33: the fields and words of the zone and aura keys.
  ...ZONE_MOMENTS, ...EMANATION_ON, ...EMANATION_AFFECTS, ...AURA_AFFECTS, ...ZONE_AFFECTS, ...TEMPLATE_TYPES,
  "on", "do", "replay", "radius", "sees", "activity", "whileActive", "includeSelf", "size", "seconds", "fighting", "sizeAtLeast",
  // Ruling R34: the fields and words of the choice, barrier and ward keys.
  ...CHOICE_EFFECTS, "effects", "pool", "perTarget", "roll", "order", "exceptTypes", "onlyTypes", "shields", "endsOnContact",
  "maxLevel", "statuses",
  // Ruling R38: the moments, steps, fields and words of the reaction, teleport and light keys.
  ...REACTION_MOMENTS, "use", "penalty", "miss", "damage", "source", "weapon", "to", "prof", "perRound", "then", "after",
  "bright", "dim"
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
