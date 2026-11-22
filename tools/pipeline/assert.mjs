// Rule assertions (`rule.assert`): what a rule says happens, in a closed vocabulary, so that a draft and an independent review
// can be compared (Ruling R9) and a scenario can check it. `[{ given, expect }]`; `free` is the only prose (one line, at most
// FREE_MAX characters) and it never counts as agreement.
//
// The enumerations that belong to the engine (moments, statuses, creature types, move modes, effect ends, damage types) are
// checked when a `vocabulary` is given (core.mjs loadCore: the gates pass the DAS_CORE clone's); without it they need only be
// non-empty strings, which is what the record schema can check on its own.
// (schema.mjs imports this module too: ORIGINS is read only when a list is checked, after both are loaded.)
import { ORIGINS } from "./schema.mjs";
import * as sh from "./shapes.mjs";
import { HP_AT_MOST, WITHIN_FT, givensOfCondition } from "./conditions.mjs";
import { AURA_MOMENTS, EMANATION_ON, ZONE_MOMENTS } from "./zones.mjs";
import { SPELL_LEVELS } from "./wards.mjs";

export const FREE_MAX = 120;
export const ROLLS = Object.freeze(["hit", "miss", "crit", "failedSave", "savedSave"]);
export const FRACTIONS = Object.freeze([0, 0.5, 1, 2]);
// Ruling R33: `autoSuccess`, the roll is not made and succeeds (the engine's saveAutoSuccess); Ruling R37: `autoFail`, it is
// not made and fails (saveAutoFail).
export const ROLL_MODES = Object.freeze(["advantage", "disadvantage", "autoSuccess", "autoFail"]);
export const ROLL_ON = Object.freeze(["attack", "save", "check"]);
export const ROLL_FOR = Object.freeze(["self", "target", "ally", "enemy"]);
// Who an assertion is about (`expect.affects`), and who it leaves out (`expect.excludes`, the same words).
export const AFFECTS = Object.freeze(["target", "allies", "enemies", "self"]);
// Ruling R30: the given fields that say a trigger's condition, one per allowed fact (conditions.mjs DRAFT_FACTS `given`):
// `targetType` (target.creatureType) was there before; `targetHp` says target.bloodied or target.wounded, `activity` one of
// activity.isAttack, isMelee, isWeapon, isSpell.
export const TARGET_HP = Object.freeze(["bloodied", "wounded"]);
export const ACTIVITY_GIVENS = Object.freeze(["attack", "melee", "weapon", "spell"]);
export const CONDITION_GIVENS = Object.freeze(["targetSizeAtMost", "targetType", "targetStatus", "selfStatus", "targetWithin",
  "targetHp", "targetHpAtMost", "onOwnTurn", "damageType", "activity"]);
// Ruling R34: `spellLevelAtMost`, only for a spell of this level or lower (what a globe bars).
export const GIVEN_FIELDS = Object.freeze(["roll", "moment", "origin", "targetType", "free",
  ...CONDITION_GIVENS.filter((f) => f !== "targetType"), "spellLevelAtMost"]);
export const EXPECT_FIELDS = Object.freeze(["damage", "condition", "ends", "roll", "affects", "excludes", "move", "uses", "denies",
  "subjected", "chooses", "bars", "free"]);
/**
 * Ruling R33: what a creature is subjected to at a zone or aura moment (`expect.subjected`, with `given.moment`): the item's
 * activity is used on it (its saving throw, its damage, its effects, as the item's data gives them).
 */
export const SUBJECTED = Object.freeze(["activity"]);
/**
 * Ruling R34: what the user of the item chooses at its use (`expect.chooses`, the engine's `choice`): one of the activity's
 * effects, only that one applied — once for every target, once per target that failed its save, or picked by a die.
 */
export const CHOOSES = Object.freeze(["oneEffect", "oneEffectPerTarget", "effectByRoll"]);
/**
 * Ruling R34: what an emanation around the bearer of the item's effect keeps out (`expect.bars`, the engine's `barrier` and
 * `globe`): a creature walking in, a melee attack from outside without reach, any action from outside, a spell cast from
 * outside (of the level `given.spellLevelAtMost` or lower).
 */
export const BARS = Object.freeze(["entry", "melee", "actions", "spells"]);
// The expectations said once for the use of the item, never on a roll or at a moment (Ruling R34).
const ONCE = Object.freeze(["chooses", "bars"]);
// Fix round 1 of Ruling R25: `excludes` maps to no notion of the engine and pilot 3 used it two ways, so no agent may write it
// (a drafter's assert and leaves, a reviewer's assert: `assertProblems(…, { agent: true })`); stored data that holds it (a
// review-queue entry, a tolerated pair) is still read. What it was bent to say has its own word now: `denies`.
export const AGENT_EXPECT_FIELDS = Object.freeze(EXPECT_FIELDS.filter((f) => f !== "excludes"));

// Own properties only: a key named like an inherited one (`constructor`, `toString`...) is never taken for a known key.
const has = (o, k) => Object.hasOwn(o, k);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isWord = (v) => typeof v === "string" && v !== "";
/** One line of printable ASCII (0x20-0x7E) of at most `max` characters: no control, format or look-alike character. */
export const isPlainLine = (v, max) => typeof v === "string" && v.trim() !== "" && v.length <= max && /^[\x20-\x7e]+$/.test(v);
const isFree = (v) => isPlainLine(v, FREE_MAX);
// What a move distance may be: a number of feet, or a short formula (digits, operators, `@` paths).
export const DISTANCE_MAX = 24;
// The `@` references a distance may use: the roll data of the actor and item (`@mod`, `@prof`, `@scale.<class>.<x>`...).
const REFERENCE = new RegExp("@(?:(?:mod|prof)(?![A-Za-z0-9.])"
  + "|(?:item|abilities|attributes|details|scale|flags)\\.[A-Za-z0-9]+(?:\\.[A-Za-z0-9]+)*)", "g");
/**
 * A short formula: a string of at most `max` characters made of digits, spaces, `+ - * / ( ) .` and the references above.
 * Once its references are taken out, what is left is digits and operators only: no word. A numeric string is one.
 */
export const isFormula = (v, max = DISTANCE_MAX) => {
  if (typeof v !== "string" || v.trim() === "" || v.length > max) return false;
  // Each reference is a short path: at most 6 segments (its root included) of at most 24 characters (Ruling R19).
  const refs = v.match(REFERENCE) ?? [];
  if (refs.some((r) => r.slice(1).split(".").length > 6 || r.slice(1).split(".").some((p) => p.length > 24))) return false;
  const rest = v.replace(REFERENCE, " ");
  return /^[0-9 +\-*/().]*$/.test(rest) && (rest !== v || /[0-9]/.test(rest));
};
const isDistance = (v) => (Number.isFinite(v) ? v >= 0 : isFormula(v));
const onlyKeys = (o, keys) => Object.keys(o).every((k) => keys.includes(k));
const list = (v) => (Array.isArray(v) ? v : v instanceof Set ? [...v] : null);

/**
 * The problems of a `rule.assert` list, each prefixed with its path (`rule.assert[i].expect.damage.fraction: …`).
 * `vocabulary`: `{ moments, statuses, creatureTypes, moveModes, effectEnds, damageTypes }` (arrays or Sets; any may be absent),
 * `origins`: the origins an assertion may name (default schema.mjs ORIGINS). `agent`: what an agent wrote (a draft, a review):
 * `excludes` is then refused (AGENT_EXPECT_FIELDS).
 */
export function assertProblems(assertions, { vocabulary = {}, origins = ORIGINS, at = "rule.assert", agent = false } = {}) {
  if (!Array.isArray(assertions)) return [`${at}: must be an array of { given, expect }`];
  const errors = [];
  // A word of an engine enumeration: checked against it when it is known, else only as a non-empty string.
  const word = (v, name, path, what) => {
    const known = list(vocabulary[name]);
    if (!isWord(v) || (known && !known.includes(v))) errors.push(`${path}: must be ${what}`);
  };
  const oneOf = (v, values, path) => {
    if (!values.includes(v)) errors.push(`${path}: must be one of ${values.join(", ")}`);
  };
  assertions.forEach((a, i) => {
    const here = `${at}[${i}]`;
    if (!isObject(a) || !onlyKeys(a, ["given", "expect"]) || !isObject(a.given) || !isObject(a.expect)) {
      return errors.push(`${here}: must be { given, expect }, two objects`);
    }
    const { given, expect } = a;
    for (const k of Object.keys(given)) if (!GIVEN_FIELDS.includes(k)) errors.push(`${here}.given.${k}: unknown field`);
    for (const k of Object.keys(expect)) if (!EXPECT_FIELDS.includes(k)) errors.push(`${here}.expect.${k}: unknown field`);
    if (agent && has(expect, "excludes")) {
      errors.push(`${here}.expect.excludes: not an agent's word (no engine notion; denies says what a move provokes or a creature`
        + " loses)");
    }
    // `free` never counts as agreement: an assertion made of it alone says nothing a review or a scenario can check.
    if (!Object.keys(expect).some((k) => k !== "free")) errors.push(`${here}.expect: at least one closed field besides free`);
    for (const [part, o] of [["given", given], ["expect", expect]]) {
      if (has(o, "free") && !isFree(o.free)) errors.push(`${here}.${part}.free: one line of at most ${FREE_MAX} characters`);
    }
    if (has(given, "roll")) oneOf(given.roll, ROLLS, `${here}.given.roll`);
    // Ruling R33: the aura moment words (zones.mjs AURA_MOMENTS) are moments of a `given` too.
    if (has(given, "moment") && !AURA_MOMENTS.includes(given.moment)) {
      word(given.moment, "moments", `${here}.given.moment`, "a moment of the engine (MOMENTS) or an aura moment (AURA_MOMENTS)");
    }
    // Ruling R33: a creature is subjected to the activity at a zone or aura moment, whatever its roll: `subjected` needs one
    // of those moments and no roll. (A zone or aura moment beside a roll stays allowed: stored rereads and reviews hold it.)
    const zoneMoment = has(given, "moment") && [...ZONE_MOMENTS, ...AURA_MOMENTS].includes(given.moment);
    if (has(expect, "subjected") && (!zoneMoment || has(given, "roll"))) {
      errors.push(`${here}.expect.subjected: only with a zone or aura moment in given.moment and no roll (${[...ZONE_MOMENTS,
        ...AURA_MOMENTS].join(", ")})`);
    }
    // Ruling R34: a choice and a barrier hold for the use of the item, whatever its roll and at no moment; a spell level
    // bounds what a globe bars and nothing else.
    for (const k of ONCE) {
      if (has(expect, k) && (has(given, "roll") || has(given, "moment"))) {
        errors.push(`${here}.expect.${k}: said once for the use of the item, never with given.roll or given.moment`);
      }
    }
    if (has(given, "spellLevelAtMost")) {
      if (!inRange(given.spellLevelAtMost, SPELL_LEVELS)) {
        errors.push(`${here}.given.spellLevelAtMost: must be an integer from ${SPELL_LEVELS.min} to ${SPELL_LEVELS.max}`);
      }
      if (expect.bars !== "spells") errors.push(`${here}.given.spellLevelAtMost: only with expect.bars: spells`);
    }
    if (has(given, "origin")) {
      if (!origins.includes(given.origin)) errors.push(`${here}.given.origin: must be an origin (${origins.join(", ")})`);
    }
    if (has(given, "targetType")) {
      word(given.targetType, "creatureTypes", `${here}.given.targetType`, "a creature type of the engine");
    }
    checkConditionGiven(given, `${here}.given`, { errors, word, oneOf });
    checkExpect(expect, `${here}.expect`, { errors, word, oneOf, vocabulary });
  });
  return errors;
}

// Ruling R30: the given fields of a trigger's condition, each of the type of the fact it mirrors.
const inRange = (v, { min, max }) => Number.isInteger(v) && v >= min && v <= max;
function checkConditionGiven(given, at, { errors, word, oneOf }) {
  if (has(given, "targetSizeAtMost")) word(given.targetSizeAtMost, "sizes", `${at}.targetSizeAtMost`, "a size of the engine");
  if (has(given, "targetStatus")) word(given.targetStatus, "statuses", `${at}.targetStatus`, "a status of the engine");
  if (has(given, "selfStatus")) word(given.selfStatus, "statuses", `${at}.selfStatus`, "a status of the engine");
  if (has(given, "damageType")) word(given.damageType, "damageTypes", `${at}.damageType`, "a damage type of the engine");
  if (has(given, "targetWithin") && !inRange(given.targetWithin, WITHIN_FT)) {
    errors.push(`${at}.targetWithin: must be an integer of feet from ${WITHIN_FT.min} to ${WITHIN_FT.max}`);
  }
  if (has(given, "targetHpAtMost") && !inRange(given.targetHpAtMost, HP_AT_MOST)) {
    errors.push(`${at}.targetHpAtMost: must be an integer from ${HP_AT_MOST.min} to ${HP_AT_MOST.max}`);
  }
  if (has(given, "targetHp")) oneOf(given.targetHp, TARGET_HP, `${at}.targetHp`);
  if (has(given, "activity")) oneOf(given.activity, ACTIVITY_GIVENS, `${at}.activity`);
  if (has(given, "onOwnTurn") && given.onOwnTurn !== true) errors.push(`${at}.onOwnTurn: must be true`);
}

function checkExpect(expect, at, { errors, word, oneOf, vocabulary }) {
  if (has(expect, "damage")) {
    const d = expect.damage;
    if (!isObject(d) || !onlyKeys(d, ["fraction", "type"])) errors.push(`${at}.damage: must be { fraction, type? }`);
    else {
      oneOf(d.fraction, FRACTIONS, `${at}.damage.fraction`);
      if (has(d, "type")) word(d.type, "damageTypes", `${at}.damage.type`, "a damage type of the engine");
    }
  }
  if (has(expect, "condition")) {
    const c = expect.condition;
    if (!isObject(c) || !onlyKeys(c, ["applied", "ended"]) || !Object.keys(c).length) {
      errors.push(`${at}.condition: must be { applied?, ended? }, at least one`);
    } else for (const k of ["applied", "ended"]) {
      if (has(c, k)) word(c[k], "statuses", `${at}.condition.${k}`, "a status of the engine");
    }
  }
  if (has(expect, "ends")) {
    const ends = [...(list(vocabulary.effectEnds) ?? []), ...(list(vocabulary.moments) ?? [])];
    const known = list(vocabulary.effectEnds) || list(vocabulary.moments);
    if (!isWord(expect.ends) || (known && !ends.includes(expect.ends))) {
      errors.push(`${at}.ends: must be an effect end (EFFECT_ENDS) or a moment of the engine`);
    }
  }
  if (has(expect, "roll")) {
    const r = expect.roll;
    if (!isObject(r) || !onlyKeys(r, ["mode", "on", "for"]) || !(has(r, "mode") && has(r, "on") && has(r, "for"))) {
      errors.push(`${at}.roll: must be { mode, on, for }`);
    } else {
      oneOf(r.mode, ROLL_MODES, `${at}.roll.mode`);
      oneOf(r.on, ROLL_ON, `${at}.roll.on`);
      oneOf(r.for, ROLL_FOR, `${at}.roll.for`);
    }
  }
  for (const k of ["affects", "excludes"]) if (has(expect, k)) oneOf(expect[k], AFFECTS, `${at}.${k}`);
  if (has(expect, "denies")) oneOf(expect.denies, DENIES, `${at}.denies`);
  if (has(expect, "subjected")) oneOf(expect.subjected, SUBJECTED, `${at}.subjected`);
  if (has(expect, "chooses")) oneOf(expect.chooses, CHOOSES, `${at}.chooses`);
  if (has(expect, "bars")) oneOf(expect.bars, BARS, `${at}.bars`);
  if (has(expect, "move")) {
    const m = expect.move;
    if (!isObject(m) || !onlyKeys(m, ["mode", "distance"])) errors.push(`${at}.move: must be { mode, distance? }`);
    else {
      word(m.mode, "moveModes", `${at}.move.mode`, "a move mode of the engine (MOVE_MODES)");
      if (has(m, "distance") && !isDistance(m.distance)) {
        errors.push(`${at}.move.distance: must be a non-negative number or a formula of at most ${DISTANCE_MAX} characters`);
      }
    }
  }
  if (has(expect, "uses")) {
    const u = expect.uses;
    if (!isObject(u) || !onlyKeys(u, ["spent"]) || !(Number.isInteger(u.spent) && u.spent > 0)) {
      errors.push(`${at}.uses: must be { spent: a positive integer }`);
    }
  }
}

// One assertion as a canonical string: its leaves as sorted `path=value` pairs. A free text is `*`: its words never count.
function canonicalOf(assertion) {
  const pairs = [];
  const walk = (node, path) => {
    if (isObject(node)) for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    else if (path.endsWith(".free")) pairs.push(`${path}=*`);
    else pairs.push(`${path}=${typeof node === "string" ? node : JSON.stringify(node)}`);
  };
  walk(isObject(assertion) ? { given: assertion.given ?? {}, expect: assertion.expect ?? {} } : {}, "");
  return pairs.sort().join(";");
}

/**
 * The atoms of a list of assertions: one assertion per expectation, each under the same `given`. A reader may say "frightened,
 * until the start of the caster's turn" as one assertion with two expectations or as two assertions: both say the same thing,
 * and agreement at review compares atoms (review.mjs compareAsserts). An assertion with a `free` text is kept whole: it goes
 * to a person as it is.
 */
export function atomise(assertions) {
  if (!Array.isArray(assertions)) return [];
  return assertions.flatMap((a) => {
    const expect = isObject(a?.expect) ? a.expect : null;
    const kinds = expect ? Object.keys(expect) : [];
    if (kinds.length < 2 || kinds.includes("free") || (isObject(a.given) && Object.hasOwn(a.given, "free"))) return [a];
    return kinds.map((k) => ({ ...a, expect: { [k]: expect[k] } }));
  });
}

/** The canonical forms of a list of assertions, deduplicated and sorted: two lists that say the same thing compare equal. */
export function normaliseAssert(assertions) {
  if (!Array.isArray(assertions)) return [];
  return [...new Set(assertions.map(canonicalOf).filter(Boolean))].sort();
}

// The damage types of an activity of the official structure (structure.mjs structureOf), sorted; [] when unknown.
const typesOf = (structure, id) => {
  const activity = (Array.isArray(structure?.activities) ? structure.activities : []).find((a) => a?.id === id);
  return [...new Set((Array.isArray(activity?.damage) ? activity.damage : [])
    .flatMap((p) => (Array.isArray(p?.types) ? p.types : [])).filter(isWord))].sort();
};
// One damage assertion per type (Ruling R24, fix round 1: which activity gets which result), or one untyped when no type is
// known (no structure, or an activity whose parts name none).
const typed = (given, fraction, types) => (types.length
  ? types.map((type) => ({ given, expect: { damage: { fraction, type } } })) : [{ given, expect: { damage: { fraction } } }]);

// The roll on which an effect of the item is applied (fix round 1 of Ruling R25): read from the official structure, an effect
// linked to an attack activity is applied on a hit, one linked to a save activity on a failed save (on a saved save when the
// entry lists it in `savedEffects`). [null] when the structure does not say (no structure, an effect no activity links):
// the assertion then holds in every situation (`given: {}`).
const activitiesOf = (structure) => (Array.isArray(structure?.activities) ? structure.activities : []);
function rollsOfEffect(id, entry, structure) {
  const saved = Array.isArray(entry?.savedEffects) ? entry.savedEffects : [];
  const rolls = new Set();
  for (const a of activitiesOf(structure)) {
    if (!(Array.isArray(a?.effects) && a.effects.includes(id))) continue;
    if (a.type === "attack") rolls.add("hit");
    else if (a.type === "save") rolls.add(saved.includes(id) ? "savedSave" : "failedSave");
  }
  return rolls.size ? [...rolls].sort() : [null];
}
// The effects a WHOLE value names (`true`: every effect the item's activities apply; a list: those ids).
const effectsOf = (value, structure) => (Array.isArray(value) ? value.filter(isWord)
  : value === true ? [...new Set(activitiesOf(structure).flatMap((a) => (Array.isArray(a?.effects) ? a.effects : [])))] : []);
const givenOfRoll = (roll) => (roll === null ? {} : { roll });
// One assertion per roll an effect is applied on.
const onEffect = (id, entry, structure, expect) =>
  rollsOfEffect(id, entry, structure).map((r) => ({ given: givenOfRoll(r), expect }));
// A WHOLE value (`true` or effect ids): one assertion per effect and roll; `true` with no effect known: every situation.
const onEffects = (value, entry, structure, expect) => {
  const ids = effectsOf(value, structure);
  if (!ids.length) return value === true ? [{ given: {}, expect }] : [];
  return ids.flatMap((id) => onEffect(id, entry, structure, expect));
};
const asDeclarations = (v) => (Array.isArray(v) ? v : isObject(v) ? [v] : []);
const asSteps = (d) => (Array.isArray(d?.do) ? d.do : [d?.do]);

/**
 * What the words of `expect.denies` say (fix round 1 of Ruling R25, the words pilot 3 needed): the movement of the creature
 * that used the item provokes no opportunity attacks (engine key noOpportunity); the bearer of the item's effect cannot take
 * reactions (noReactions); it takes an action or a bonus action on its turn, not both (actionOrBonus).
 */
// Ruling R34: the bearer regains no hit points (blocksHealing), gains no temporary hit points (blocksTempHp).
export const DENIES = Object.freeze(["opportunityAttacks", "reactions", "actionAndBonus", "healing", "tempHp"]);

// What each drafter key says by itself (`(value, entry, structure) → { asserts, unassertable? }`): an assertion of the closed
// vocabulary for what the key does, and `unassertable` when part of what it does has no word (the draft is then stamped for
// a person at review, schema.mjs draftedForPerson). Read off the engine's documentation of each key
// (module/scripts/core/content.mjs) and the drafter's shapes (draft-keys.mjs DRAFT_SHAPES).
const IMPLIED = {
  // A saved save: half or no damage, typed by the activity's damage (Ruling R24, fix round 1).
  saveDamage: (v, _e, structure) => ({ asserts: isObject(v) ? Object.entries(v).filter(([, x]) => x === "half" || x === "none")
    .flatMap(([id, x]) => typed({ roll: "savedSave" }, x === "half" ? 0.5 : 0, typesOf(structure, id))) : [] }),
  halfOnMiss: (v, _e, structure) => {
    if (v !== true) return { asserts: [] };
    const attacks = activitiesOf(structure).filter((a) => a?.type === "attack");
    return { asserts: typed({ roll: "miss" }, 0.5, [...new Set(attacks.flatMap((a) => typesOf(structure, a.id)))].sort()) };
  },
  noDamage: (v, _e, structure) => ({ asserts: Array.isArray(v) ? v.flatMap((id) => typed({}, 0, typesOf(structure, id))) : [] }),
  // The `status` and `move` steps on a roll moment (Ruling R24, fix round 1, L1); a `resave` through an effect: the effect
  // ends when its bearer saves, on the roll that applied it (`keep`: it stays, no word; `advantage`: no word). Any other step,
  // or a status or move on a moment that is no roll, has no word.
  // Ruling R30: a declaration's condition (`if`) goes into the given of each assertion it implies (conditions.mjs
  // givensOfCondition: one situation per alternative); a condition with a part that has no word makes the declaration imply
  // nothing (never the assertion without its condition, which would say more than the trigger does) and unassertable.
  triggers: (v, entry, structure) => {
    const asserts = [];
    let unassertable = false;
    for (const d of asDeclarations(v)) {
      const condition = givensOfCondition(isObject(d) && Object.hasOwn(d, "if") ? d.if : undefined);
      if (condition.unassertable) { unassertable = true; continue; }
      const own = [];
      const rolls = (Array.isArray(d?.on) ? d.on : [d?.on]).filter((on) => ROLLS.includes(on));
      for (const step of asSteps(d)) {
        if ((step?.type === "status" && isWord(step.status)) || (step?.type === "move" && isWord(step.mode))) {
          if (!rolls.length) unassertable = true;
          for (const roll of rolls) {
            if (step.type === "status") own.push({ given: { roll }, expect: { condition: { applied: step.status } } });
            else {
              // A step without a distance implies no distance: never an undefined field.
              const move = step.distance === undefined ? { mode: step.mode } : { mode: step.mode, distance: step.distance };
              own.push({ given: { roll }, expect: { move } });
            }
          }
        } else if (step?.type === "replay" && isObject(step) && Object.keys(step).every((k) => k === "type" || k === "activity")) {
          // Ruling R33: a zone uses the item's activity again on a creature at each zone moment it names; another moment
          // (once per square travelled, a turn of no area) has no word.
          const ons = (Array.isArray(d?.on) ? d.on : [d?.on]);
          const zone = ons.filter((on) => ZONE_MOMENTS.includes(on));
          if (zone.length !== ons.length || !zone.length) unassertable = true;
          for (const moment of zone) own.push({ given: { moment }, expect: { subjected: "activity" } });
        } else if (step?.type === "resave" && isObject(step) && Object.keys(step).every((k) => k === "type")) {
          const from = isWord(d?.fromEffect) ? onEffect(d.fromEffect, entry, structure, { ends: "savedSave" })
            : [{ given: {}, expect: { ends: "savedSave" } }];
          own.push(...from);
        } else unassertable = true;
      }
      for (const a of own) for (const g of condition.givens) asserts.push({ given: { ...a.given, ...g }, expect: a.expect });
    }
    return { asserts, unassertable };
  },
  effectEnds: (v, entry, structure) => ({ asserts: isObject(v)
    ? Object.entries(v).filter(([, w]) => isWord(w)).flatMap(([id, w]) => onEffect(id, entry, structure, { ends: w })) : [] }),
  noReactions: (v, entry, structure) => ({
    asserts: onEffects(v, entry, structure, { denies: "reactions" }) }),
  actionOrBonus: (v, entry, structure) => ({
    asserts: onEffects(v, entry, structure, { denies: "actionAndBonus" }) }),
  // Always, after the use, while an effect of the item lasts: the move provokes none. While flying: no word for flying.
  noOpportunity: (v) => (v === "flying" ? { asserts: [], unassertable: true }
    : { asserts: [{ given: {}, expect: { denies: "opportunityAttacks" } }] }),
  saveDisadvantageFor: (v) => ({ asserts: (Array.isArray(v) ? v.filter(isWord) : [])
    .map((t) => ({ given: { targetType: t }, expect: { roll: { mode: "disadvantage", on: "save", for: "target" } } })) }),
  // The bearer of the item makes those rolls with disadvantage (the drafter's shape has no `if`).
  rollDisadvantage: (v) => ({ asserts: (Array.isArray(v?.on) ? v.on : []).filter((o) => ROLL_ON.includes(o))
    .map((on) => ({ given: {}, expect: { roll: { mode: "disadvantage", on, for: "self" } } })) }),
  // Ruling R33: an aura that acts uses the item's activity on each creature it reaches at its moment (the bearer's turn end
  // or start, a creature's own turn start); `affects: enemy` says who. Its radius, a sight limit and a limit to an effect of
  // the item have no word.
  emanation: (v) => {
    if (!isObject(v) || !EMANATION_ON.includes(v.on)) return { asserts: [], unassertable: true };
    const given = { moment: v.on };
    const asserts = [{ given, expect: { subjected: "activity" } },
      ...(v.affects === "enemy" ? [{ given, expect: { affects: "enemies" } }] : [])];
    return { asserts, unassertable: Object.keys(v).some((k) => !["on", "affects", "activity"].includes(k)) };
  },
  // Who the item's area affects when its data does not say: in every situation.
  zoneAffects: (v) => (v === "enemy" || v === "ally"
    ? { asserts: [{ given: {}, expect: { affects: v === "enemy" ? "enemies" : "allies" } }] }
    : { asserts: [], unassertable: true }),
  // A creature of those types succeeds on the item's save without rolling; a size floor and "an enemy it fights" have no word.
  saveAutoSuccess: (v) => {
    if (!isObject(v)) return { asserts: [], unassertable: true };
    const types = Array.isArray(v.types) ? v.types.filter(isWord) : [];
    return { asserts: types.map((t) => ({ given: { targetType: t }, expect: { roll: { mode: "autoSuccess", on: "save",
      for: "target" } } })), unassertable: Object.keys(v).some((k) => k !== "types") };
  },
  // Ruling R37: a creature of those types fails the item's save without rolling.
  saveAutoFail: (v) => {
    if (!isObject(v)) return { asserts: [], unassertable: true };
    const types = Array.isArray(v.types) ? v.types.filter(isWord) : [];
    return { asserts: types.map((t) => ({ given: { targetType: t }, expect: { roll: { mode: "autoFail", on: "save",
      for: "target" } } })), unassertable: Object.keys(v).some((k) => k !== "types") };
  },
  // Ruling R34: one effect of the activity chosen at its use (once, per target, by a die). Its pool is the item's own effects
  // (the same choice); which face of a die gives which effect (`order`) has no word; a pool alone chooses nothing.
  choice: (v) => {
    if (!isObject(v) || v.effects !== "one") return { asserts: [], unassertable: true };
    const word = v.perTarget === true ? "oneEffectPerTarget" : v.roll === true ? "effectByRoll" : "oneEffect";
    return { asserts: [{ given: {}, expect: { chooses: word } }],
      unassertable: Object.keys(v).some((k) => !["effects", "perTarget", "roll", "pool"].includes(k)) };
  },
  // A barrier keeps a creature from walking in and from a melee hit without reach, `shields` from any action from outside.
  // Its radius has no word (always stamped); a barrier that names creature types implies nothing: no given word says which
  // creatures it stops, and the assertion without that limit would say more than the key does.
  barrier: (v) => {
    const byType = isObject(v) && (Object.hasOwn(v, "exceptTypes") || Object.hasOwn(v, "onlyTypes"));
    if (!isObject(v) || byType) return { asserts: [], unassertable: true };
    const words = ["entry", "melee", ...(v.shields === true ? ["actions"] : [])];
    return { asserts: words.map((bars) => ({ given: {}, expect: { bars } })), unassertable: true };
  },
  // A globe: a spell of its level or lower cast from outside affects nobody inside. Its radius has no word.
  globe: (v) => (isObject(v) && Number.isInteger(v.maxLevel)
    ? { asserts: [{ given: { spellLevelAtMost: v.maxLevel }, expect: { bars: "spells" } }], unassertable: true }
    : { asserts: [], unassertable: true }),
  // The bearer of the item's effects (all, or those) regains no hit points / gains no temporary ones, on the roll that applies
  // them. `blocksTempHp: true` also covers the creature that carries the item itself, which no word names.
  blocksHealing: (v, entry, structure) => ({ asserts: onEffects(v, entry, structure, { denies: "healing" }) }),
  blocksTempHp: (v, entry, structure) => ({ asserts: onEffects(v, entry, structure, { denies: "tempHp" }),
    unassertable: v === true }),
  // The statuses the entry adds to an effect of the item, applied on the roll that applies it.
  effectStatuses: (v, entry, structure) => ({ asserts: isObject(v) ? Object.entries(v).flatMap(([id, x]) => {
    const statuses = Array.isArray(x) ? x : Array.isArray(x?.set) ? x.set : [];
    return statuses.filter(isWord).flatMap((st) => onEffect(id, entry, structure, { condition: { applied: st } }));
  }) : [] })
};
/** The drafter keys whose effect is said by an implied assertion (IMPLIED). */
export const IMPLIED_KEYS = Object.freeze(Object.keys(IMPLIED));
/**
 * The drafter keys that imply nothing, each with why: what they do has no word of the assertion vocabulary. A rule that uses
 * one cannot be checked by review for that part, so its draft is stamped for a person at review (Ruling R15, generalised:
 * `evidence.drafted.because` is the key's name, schema.mjs draftedForPerson). tests/pipeline/implied.test.mjs fails when a
 * DRAFT_KEYS key is in neither table.
 */
export const IMPLIES_NOTHING = Object.freeze({
  endsWhen: "its endings (armor donned, distance from the caster, 0 hit points, a spell, magical healing) have no moment word",
  actionEnds: "an action that ends the effect has no word",
  breaksOn: "the effect ends on its bearer's own act (attacking, dealing damage, casting): no moment word names those",
  noOpportunityAttacks: "the bearer makes no opportunity attacks: denies says what a move provokes, not what a creature makes",
  saveAdvantage: "advantage only against what imposes those conditions: no word for the condition guarded against",
  rollBonus: "a die added to a roll after seeing it: no word for a bonus",
  effectDurations: "a duration in time: no word for a length of time",
  savedEffects: "it moves an effect to the saved save; what the effect does is the item's data, said through other keys",
  atTurnStart: "an activity used at the start of a turn while concentration lasts: no word",
  usageLimits: "a limit on use (once per turn, its cost, the lowest slot): no word",
  ignoresResistance: "no word for resistance",
  grantsResistances: "no word for resistance",
  grantsConditionImmunities: "no word for an immunity to a condition",
  difficultTerrain: "no word for terrain",
  targets: "who the action may affect by creature type: no word for an unaffected creature",
  onHit: "a hit that forces a saving throw: no word for a save being made",
  dataFixes: "it rewrites the item's data; what the data then does is not an assertion of the rule",
  // Ruling R33: the keys that shape a zone or a passive aura.
  aura: "an effect copied onto nearby creatures while they stay: no word for an effect held by being near the bearer",
  selfZone: "the template an activity lacks: no word for the shape or size of an area",
  zoneLasts: "a duration in time for the area: no word for a length of time",
  zoneMax: "a cap on how many creatures the area affects: no word for a count of creatures",
  zoneEffects: "effects held while inside the area and lost on leaving it: no word for leaving an area",
  willingFails: "a willing target fails without rolling: no given word for a creature's consent",
  // Ruling R34.
  wardsConditions: "conditions warded off when they come from creatures of some types: no word for an immunity or a source",
  wardsAtZero: "the bearer drops to 1 hit point instead of 0, once: no word for hit points"
});

/**
 * What an entry says by itself, in canonical form (normaliseAssert): a review must assert it too (Ruling R9), and a rule's
 * `leaves` may not list it (Ruling R25). One function per drafter key (IMPLIED); `structure` (the official item's,
 * structure.mjs structureOf) gives damage types and the roll each effect is applied on: without it an effect's assertion
 * holds in every situation (`given: {}`). The keys of IMPLIES_NOTHING, and keys no table knows, imply nothing.
 */
export function impliedAsserts(entry, { structure = null } = {}) {
  if (!isObject(entry)) return [];
  const out = [];
  for (const [key, value] of Object.entries(entry)) {
    if (Object.hasOwn(IMPLIED, key)) out.push(...IMPLIED[key](value, entry, structure).asserts);
  }
  return normaliseAssert(out);
}

/**
 * The keys of an entry, sorted, the assertion vocabulary cannot say all of (fix round 1 of Ruling R25): a key of
 * IMPLIES_NOTHING, a key no table knows, or an IMPLIED key whose value has a part with no word (a trigger step other than a
 * status or move on a roll or a plain resave; noOpportunity while flying). Own properties only.
 */
export function unassertableKeys(entry) {
  if (!isObject(entry)) return [];
  return Object.keys(entry).filter((key) => !Object.hasOwn(IMPLIED, key)
    || IMPLIED[key](entry[key], entry, null).unassertable === true).sort();
}

// ---------------------------------------------------------------------------------------------------------------------------
// Canonical assertions compared (review.mjs compareAsserts, Ruling R24; leaves.mjs, Ruling R25).

/** True when a canonical assertion holds a `free` text (given or expect). */
export const isFreeCanonical = (canonical) =>
  canonical.split(";").some((pair) => pair === "given.free=*" || pair === "expect.free=*");

// Ruling R24. The fields of each expectation kind that are optional detail: one side may state them and the other not. Every
// other field is identity (damage `fraction`; move `mode`; condition `applied` / `ended`; roll `mode` / `on` / `for`; `ends`,
// `affects`, `excludes`, `uses`), and every `given` field is identity: a given stated on one side only is another situation.
export const OPTIONAL_DETAIL = Object.freeze({ damage: Object.freeze(["type"]), move: Object.freeze(["distance"]) });

// One canonical assertion as `path → value` pairs (the value as the canonical string spells it: 20 and "20" are one).
export const pairsOf = (canonical) =>
  new Map(canonical.split(";").map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]));
const isDetailPath = (path) => {
  const [part, kind, field, ...rest] = path.split(".");
  return part === "expect" && !rest.length && Object.hasOwn(OPTIONAL_DETAIL, kind) && OPTIONAL_DETAIL[kind].includes(field);
};
const kindsOf = (pairs) => [...new Set([...pairs.keys()].filter((p) => p.startsWith("expect.")).map((p) => p.split(".")[1]))]
  .sort().join(",");
export const givenOf = (pairs) => [...pairs].filter(([p]) => p.startsWith("given.")).map((x) => x.join("=")).sort().join(";");

/**
 * True when two canonical assertions say the same thing up to optional detail (Ruling R24): the same `given`, the same
 * expectation kinds, every field both state equal, and every field one side states alone a detail of its kind. A `free` text
 * on either side is never matched this way.
 */
export function sameUpToDetail(x, y) {
  if (isFreeCanonical(x) || isFreeCanonical(y)) return x === y;
  const a = pairsOf(x);
  const b = pairsOf(y);
  if (givenOf(a) !== givenOf(b) || kindsOf(a) !== kindsOf(b)) return false;
  for (const path of new Set([...a.keys(), ...b.keys()])) {
    if (a.has(path) && b.has(path)) { if (a.get(path) !== b.get(path)) return false; }
    else if (!isDetailPath(path)) return false;
  }
  return true;
}

const ASSERT_PART = /^[A-Za-z]{1,24}$/;
const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** One canonical assertion string (normaliseAssert: sorted `path=value` pairs) read back as an assertion, or null. */
export function assertionOfCanonical(canonical) {
  if (typeof canonical !== "string" || !canonical || canonical.length > 400) return null;
  const out = { given: {}, expect: {} };
  for (const pair of canonical.split(";")) {
    const i = pair.indexOf("=");
    const path = i > 0 ? pair.slice(0, i).split(".") : [];
    if (path.length < 2 || !Object.hasOwn(out, path[0]) || !path.every((p) => ASSERT_PART.test(p))) return null;
    let node = out[path[0]];
    for (const p of path.slice(1, -1)) {
      if (!Object.hasOwn(node, p)) node[p] = {};
      node = node[p];
      if (!isPlain(node)) return null;
    }
    const raw = pair.slice(i + 1);
    // `true` is the canonical spelling of a true given (Ruling R30: onOwnTurn); no field takes the word "true".
    node[path.at(-1)] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw === "true" ? true : raw;
  }
  return out;
}
/** True when `c` reads back as a valid assertion of the closed vocabulary (`vocabulary`: the engine's) and canonicalises to
 * itself. */
export function isCanonicalAssertion(c, vocabulary) {
  const a = assertionOfCanonical(c);
  return Boolean(a) && !assertProblems([a], { vocabulary }).length && normaliseAssert([a])[0] === c;
}

/**
 * The value shape of every field of an assertion (shapes.mjs), what `assertProblems` accepts, for the drafter's vocabulary.
 * Engine words are named (`engine`) and resolved by the vocabulary from the engine's lists. A test builds a value from each
 * shape and has assertProblems accept it.
 */
// A function, not a constant: ORIGINS comes from schema.mjs, which imports this module (read only once both are loaded).
export const assertShapes = () => Object.freeze({
  given: Object.freeze({
    roll: sh.values(ROLLS), moment: sh.oneOf(sh.word("moments"), sh.values(AURA_MOMENTS)), origin: sh.values(ORIGINS),
    targetType: sh.word("creatureTypes"),
    free: Object.freeze({ type: "line", max: FREE_MAX }),
    // Ruling R30: the situations a trigger's condition names.
    targetSizeAtMost: sh.word("sizes"), targetStatus: sh.word("statuses"), selfStatus: sh.word("statuses"),
    targetWithin: Object.freeze({ type: "number", ...WITHIN_FT, int: true, formula: false }), targetHp: sh.values(TARGET_HP),
    targetHpAtMost: Object.freeze({ type: "number", ...HP_AT_MOST, int: true, formula: false }), onOwnTurn: sh.TRUE,
    damageType: sh.word("damageTypes"), activity: sh.values(ACTIVITY_GIVENS),
    // Ruling R34: what a globe bars, by spell level.
    spellLevelAtMost: Object.freeze({ type: "number", ...SPELL_LEVELS, int: true, formula: false })
  }),
  expect: Object.freeze({
    damage: sh.object({ fraction: sh.values(FRACTIONS) }, { type: sh.word("damageTypes") }),
    condition: sh.object({}, { applied: sh.word("statuses"), ended: sh.word("statuses") }, { atLeastOne: true }),
    ends: sh.oneOf(sh.word("effectEnds"), sh.word("moments")),
    roll: sh.object({ mode: sh.values(ROLL_MODES), on: sh.values(ROLL_ON), for: sh.values(ROLL_FOR) }),
    affects: sh.values(AFFECTS), denies: sh.values(DENIES), subjected: sh.values(SUBJECTED),
    chooses: sh.values(CHOOSES), bars: sh.values(BARS),
    move: sh.object({ mode: sh.word("moveModes") }, { distance: Object.freeze({ type: "distance" }) }),
    uses: sh.object({ spent: Object.freeze({ type: "number", min: 1, int: true, formula: false }) }),
    free: Object.freeze({ type: "line", max: FREE_MAX })
  })
});
