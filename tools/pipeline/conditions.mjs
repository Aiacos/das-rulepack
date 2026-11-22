// Ruling R30: the condition a drafter may put on a trigger declaration, and how a condition is said in an assertion's `given`.
//
// The engine's trigger declaration is `{ on, if?, do }` (DAS_CORE core/triggers.mjs): `if` is a structure of FACTS, never an
// expression; an object's keys must all hold (`{ all }`, `{ any }`, `{ not }` combine them), and a key the facts do not
// provide makes the condition false. Its validator (core/content/steps.mjs validateTrigger) checks only that every fact is
// known, not the type of its argument; the engine's own content writes `if: { "<fact>": <arg> }` (168 of 179 conditions
// in content/*.mjs, the rest `all` / `any` / `not`), and core/monster-text.mjs writes `if: { "target.sizeAtMost": … }` when it
// reads a size-limited push. The facts and the kind of each argument are the engine's (core/recipes.mjs FACTS: subject and
// `arg`), loaded at run time by core.mjs loadCore (`factKinds`); what each fact means at run time is adapter/facts.mjs.
//
// A drafter writes one object, at most MAX_CONDITION_FACTS facts of DRAFT_FACTS, each argument of its typed kind (an enum of
// an engine list, a bounded integer, a bounded distance in feet, or `true`): no identifier, no free string. Every allowed fact
// is said by one `given` field of the assertion vocabulary (assert.mjs), so what a conditioned trigger does is an assertion
// that review compares and a scenario stages (impliedAsserts carries the condition into `given`).

/** The engine's size words in rank order (core/recipes.mjs FACT_ARG_OPTIONS.size; a test pins this copy to the clone's). */
export const SIZES = Object.freeze(["tiny", "sm", "med", "lg", "huge", "grg"]);
export const MAX_CONDITION_FACTS = 3;
/** How far `target.within` may say, in feet, and the highest `target.hpAtMost`. */
export const WITHIN_FT = Object.freeze({ min: 5, max: 300 });
export const HP_AT_MOST = Object.freeze({ min: 1, max: 999 });
export const DAMAGE_TYPES_MAX = 5;

const enumOf = (list, extra = {}) => Object.freeze({ kind: "enum", list, ...extra });
const TRUE_ARG = Object.freeze({ kind: "true" });
const fact = (subject, engineArg, arg, given, value) =>
  Object.freeze({ subject, engineArg, arg, given, ...(value === undefined ? {} : { value }) });

/**
 * The facts a drafter may use in a trigger's `if`: `{ subject, engineArg, arg, given, value? }` — `subject` and `engineArg`
 * as the engine's FACTS gives them (a test pins both to the clone), `arg` the typed argument a drafter writes, `given` the
 * assertion field that says it and, for a fact whose argument is `true`, the `value` that field takes. Ordered so that the
 * first three name three different given fields (the shape fixture combines them).
 */
export const DRAFT_FACTS = Object.freeze({
  // "Large or smaller": dnd5e's size rank (tiny < sm < med < lg < huge < grg). The engine also takes "source" (the user's own
  // size): a relative size has no given word, so it is refused (leaves reason target-size).
  "target.sizeAtMost": fact("target", "size", enumOf("sizes", { refused: ["source"] }), "targetSizeAtMost"),
  "target.creatureType": fact("target", "creatureType", enumOf("creatureTypes"), "targetType"),
  "target.hasStatus": fact("target", "status", enumOf("statuses"), "targetStatus"),
  "source.hasStatus": fact("source", "status", enumOf("statuses"), "selfStatus"),
  "target.within": fact("target", "range", Object.freeze({ kind: "distance", ...WITHIN_FT, units: Object.freeze(["ft"]) }),
    "targetWithin"),
  "target.bloodied": fact("target", "true", TRUE_ARG, "targetHp", "bloodied"),
  "target.wounded": fact("target", "true", TRUE_ARG, "targetHp", "wounded"),
  "target.hpAtMost": fact("target", "number", Object.freeze({ kind: "int", ...HP_AT_MOST }), "targetHpAtMost"),
  "source.onOwnTurn": fact("source", "true", TRUE_ARG, "onOwnTurn", true),
  "damage.hasType": fact("damage", "damageTypes",
    Object.freeze({ kind: "enumList", list: "damageTypes", min: 1, max: DAMAGE_TYPES_MAX }), "damageType"),
  "activity.isAttack": fact("activity", "true", TRUE_ARG, "activity", "attack"),
  "activity.isMelee": fact("activity", "true", TRUE_ARG, "activity", "melee"),
  "activity.isWeapon": fact("activity", "true", TRUE_ARG, "activity", "weapon"),
  "activity.isSpell": fact("activity", "true", TRUE_ARG, "activity", "spell")
});

/**
 * The facts of the engine's condition list (core/recipes.mjs FACTS) left out of DRAFT_FACTS, and `activity.identifier`
 * (which the engine's own content and text reader use), each with why. A test fails on an engine fact in neither table.
 */
export const EXCLUDED_FACTS = Object.freeze({
  "source.hasEffect": "its argument is an identifier (another item's effect): a free string, a person's to write",
  "target.hasEffect": "its argument is an identifier (another item's effect): a free string, a person's to write",
  "target.hasEffectFrom": "its argument is an identifier (the item that placed the effect): a free string, a person's",
  "activity.identifier": "its argument is an item identifier (\"this attack only\"): a free string, a person's to write",
  "source.classLevelAtLeast": "its argument is a class identifier and a level: an identifier, and no level on a monster",
  "activity.type": "the kinds readers needed (attack, melee, weapon, spell) have their own true facts; one fact per given",
  "activity.dealsType": "the types the item's own activity deals are the item's data, constant: no situation to filter",
  "source.creatureType": "the user's own creature type is constant for a monster feature: nothing for a condition to vary",
  "source.seesTarget": "vision holds by default when vision is off or no token is placed: neither review nor play tells",
  "target.seesSource": "vision holds by default when vision is off or no token is placed: neither review nor play tells",
  "source.allyNearTarget": "an ally of the user near the target: no reader asked for it, and a scenario stages no ally",
  "target.hasTempHp": "no reader asked for it, and temporary hit points have no word in the assertion vocabulary"
});

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const has = (o, k) => Object.hasOwn(o, k);
const WORD = /^[a-z][A-Za-z]{0,23}$/;
const isWordShape = (v) => typeof v === "string" && WORD.test(v);
const list = (v) => (Array.isArray(v) ? v : v instanceof Set ? [...v] : null);
const COMBINATIONS = ["all", "any", "not"];
const WHAT = { sizes: "a size of the engine", creatureTypes: "a creature type of the engine", statuses: "a status of the engine",
  damageTypes: "a damage type of the engine" };

// The problems of one argument for its fact, at `at`.
function argProblems(f, arg, at, vocabulary) {
  const a = f.arg;
  const out = [];
  const enumWord = (v, where) => {
    const known = list(vocabulary[a.list]);
    if (!isWordShape(v)) out.push(`${where}: must be a word (${WHAT[a.list] ?? a.list})`);
    else if (Array.isArray(a.refused) && a.refused.includes(v)) out.push(`${where}: "${v}" has no given word (a person's)`);
    else if (known && !known.includes(v)) {
      out.push(a.list === "sizes" ? `${where}: must be one of ${known.join(", ")}` : `${where}: must be ${WHAT[a.list]}`);
    }
  };
  if (a.kind === "true") { if (arg !== true) out.push(`${at}: must be true`); }
  else if (a.kind === "enum") enumWord(arg, at);
  else if (a.kind === "int") {
    if (!(Number.isInteger(arg) && arg >= a.min && arg <= a.max)) out.push(`${at}: must be an integer from ${a.min} to ${a.max}`);
  } else if (a.kind === "distance") {
    if (!isObject(arg) || Object.keys(arg).some((k) => k !== "distance" && k !== "units")) {
      out.push(`${at}: must be { distance, units }`);
    } else {
      if (!(Number.isInteger(arg.distance) && arg.distance >= a.min && arg.distance <= a.max)) {
        out.push(`${at}.distance: must be an integer from ${a.min} to ${a.max} (feet)`);
      }
      if (!a.units.includes(arg.units)) out.push(`${at}.units: must be ${a.units.join(", ")}`);
    }
  } else if (a.kind === "enumList") {
    if (!Array.isArray(arg)) out.push(`${at}: must be a list of ${a.min} to ${a.max} words`);
    else if (arg.length < a.min || arg.length > a.max) out.push(`${at}: a list of ${a.min} to ${a.max} words`);
    else {
      arg.forEach((v, i) => enumWord(v, `${at}[${i}]`));
      if (new Set(arg).size !== arg.length) out.push(`${at}: a word listed twice`);
    }
  }
  return out;
}

/**
 * Why a drafter may not write this condition as a trigger's `if`, or []: one plain object (no list, no `all` / `any` / `not`:
 * the keys of one object must all hold), 1 to MAX_CONDITION_FACTS own keys, each a fact of DRAFT_FACTS (an excluded one says
 * so), no two said by the same given field, each argument of its typed kind. `vocabulary` (loadCore's lists: sizes, statuses,
 * creatureTypes, damageTypes) checks the words against the engine; without it a word need only be a word.
 */
export function conditionProblems(condition, { vocabulary = {}, at = "if" } = {}) {
  if (!isObject(condition)) return [`${at}: must be one object of facts (all of them must hold)`];
  const keys = Object.keys(condition);
  if (!keys.length) return [`${at}: at least one fact`];
  const out = [];
  if (keys.length > MAX_CONDITION_FACTS) out.push(`${at}: at most ${MAX_CONDITION_FACTS} facts (${keys.length})`);
  const fields = new Map();
  for (const key of keys) {
    const here = `${at}.${key}`;
    if (COMBINATIONS.includes(key)) {
      out.push(`${here}: combinations are not a drafter's: write the facts as the keys of one object (all must hold)`);
    } else if (has(EXCLUDED_FACTS, key)) out.push(`${here}: not a drafter's fact (${EXCLUDED_FACTS[key]})`);
    else if (!has(DRAFT_FACTS, key)) out.push(`${here}: unknown fact (not in DRAFT_FACTS: a person's)`);
    else {
      const f = DRAFT_FACTS[key];
      if (fields.has(f.given)) out.push(`${here}: the same given field (${f.given}) as ${fields.get(f.given)}: one of them`);
      else fields.set(f.given, key);
      out.push(...argProblems(f, condition[key], here, vocabulary));
    }
  }
  return out;
}

// One clause's given alternatives (a damage type list: one per type), or null when it has no word.
function givenAlternatives(key, arg) {
  if (!has(DRAFT_FACTS, key)) return null;
  const f = DRAFT_FACTS[key];
  if (argProblems(f, f.arg.kind === "enumList" && typeof arg === "string" ? [arg] : arg, key, {}).length) return null;
  if (f.arg.kind === "true") return [{ [f.given]: f.value }];
  if (f.arg.kind === "distance") return [{ [f.given]: arg.distance }];
  if (f.arg.kind === "enumList") return [...new Set([arg].flat())].map((v) => ({ [f.given]: v }));
  return [{ [f.given]: arg }];
}

// The clauses of a condition as [fact, arg] pairs, the engine's `all` (and a list, which `holds` reads as all) flattened;
// null for anything else (`any`, `not`, a non-object).
function clausesOf(condition) {
  if (Array.isArray(condition)) {
    const parts = condition.map(clausesOf);
    return parts.some((p) => p === null) ? null : parts.flat();
  }
  if (!isObject(condition)) return null;
  const out = [];
  for (const [key, arg] of Object.entries(condition)) {
    if (key === "all") {
      const inner = Array.isArray(arg) ? clausesOf(arg) : null;
      if (inner === null) return null;
      out.push(...inner);
    } else if (key === "any" || key === "not") return null;
    else out.push([key, arg]);
  }
  return out;
}

/**
 * What a condition says in the `given` of an assertion: `{ givens }`, the situations in which the declaration acts (one
 * object of given fields each; a damage type list gives one per type, since any of them triggers it; no condition: `[{}]`),
 * or `{ unassertable: true }` when a part of it has no word (a fact outside DRAFT_FACTS, an argument outside its typed kind,
 * `any` or `not`, two facts that would set one given field to two values). The engine's `all` and multi-key objects are
 * read as their facts together: one normal form for the drafter's object and the engine's readings.
 */
export function givensOfCondition(condition) {
  if (condition === undefined || condition === null) return { givens: [{}] };
  const clauses = clausesOf(condition);
  if (clauses === null || !clauses.length) return { unassertable: true };
  let givens = [{}];
  for (const [key, arg] of clauses) {
    const alternatives = givenAlternatives(key, arg);
    if (alternatives === null) return { unassertable: true };
    const next = [];
    for (const g of givens) {
      for (const alt of alternatives) {
        const [[field, value]] = Object.entries(alt);
        if (has(g, field) && g[field] !== value) return { unassertable: true };
        next.push({ ...g, [field]: value });
      }
    }
    givens = next;
  }
  return { givens };
}
