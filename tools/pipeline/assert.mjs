// Rule assertions (`rule.assert`): what a rule says happens, in a closed vocabulary, so that a draft and an independent review
// can be compared (Ruling R9) and a scenario can check it. `[{ given, expect }]`; `free` is the only prose (one line, at most
// FREE_MAX characters) and it never counts as agreement.
//
// The enumerations that belong to the engine (moments, statuses, creature types, move modes, effect ends, damage types) are
// checked when a `vocabulary` is given (core.mjs loadCore: the gates pass the DAS_CORE clone's); without it they need only be
// non-empty strings, which is what the record schema can check on its own.
// (schema.mjs imports this module too: ORIGINS is read only when a list is checked, after both are loaded.)
import { ORIGINS } from "./schema.mjs";

export const FREE_MAX = 120;
export const ROLLS = Object.freeze(["hit", "miss", "crit", "failedSave", "savedSave"]);
export const FRACTIONS = Object.freeze([0, 0.5, 1, 2]);
export const ROLL_MODES = Object.freeze(["advantage", "disadvantage"]);
export const ROLL_ON = Object.freeze(["attack", "save", "check"]);
export const ROLL_FOR = Object.freeze(["self", "target", "ally", "enemy"]);
// Who an assertion is about (`expect.affects`), and who it leaves out (`expect.excludes`, the same words).
export const AFFECTS = Object.freeze(["target", "allies", "enemies", "self"]);
export const GIVEN_FIELDS = Object.freeze(["roll", "moment", "origin", "targetType", "free"]);
export const EXPECT_FIELDS = Object.freeze(["damage", "condition", "ends", "roll", "affects", "excludes", "move", "uses", "free"]);

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
 * `origins`: the origins an assertion may name (default schema.mjs ORIGINS).
 */
export function assertProblems(assertions, { vocabulary = {}, origins = ORIGINS, at = "rule.assert" } = {}) {
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
    // `free` never counts as agreement: an assertion made of it alone says nothing a review or a scenario can check.
    if (!Object.keys(expect).some((k) => k !== "free")) errors.push(`${here}.expect: at least one closed field besides free`);
    for (const [part, o] of [["given", given], ["expect", expect]]) {
      if (has(o, "free") && !isFree(o.free)) errors.push(`${here}.${part}.free: one line of at most ${FREE_MAX} characters`);
    }
    if (has(given, "roll")) oneOf(given.roll, ROLLS, `${here}.given.roll`);
    if (has(given, "moment")) word(given.moment, "moments", `${here}.given.moment`, "a moment of the engine (MOMENTS)");
    if (has(given, "origin")) {
      if (!origins.includes(given.origin)) errors.push(`${here}.given.origin: must be an origin (${origins.join(", ")})`);
    }
    if (has(given, "targetType")) {
      word(given.targetType, "creatureTypes", `${here}.given.targetType`, "a creature type of the engine");
    }
    checkExpect(expect, `${here}.expect`, { errors, word, oneOf, vocabulary });
  });
  return errors;
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

/** The canonical forms of a list of assertions, deduplicated and sorted: two lists that say the same thing compare equal. */
export function normaliseAssert(assertions) {
  if (!Array.isArray(assertions)) return [];
  return [...new Set(assertions.map(canonicalOf).filter(Boolean))].sort();
}

/**
 * What an entry says by itself, in canonical form (normaliseAssert): a review must assert it too (Ruling R9). `saveDamage`
 * (a saved save: half or no damage), `halfOnMiss` (a miss: half), `noDamage` (the activity's own damage is not rolled),
 * `triggers` on `failedSave` with a `status` or `move` step. Every other key implies nothing (`noReactions` included: the
 * assertion vocabulary has no word for a lost reaction).
 */
export function impliedAsserts(entry) {
  if (!isObject(entry)) return [];
  const out = [];
  if (isObject(entry.saveDamage)) {
    for (const v of Object.values(entry.saveDamage)) {
      if (v === "half" || v === "none") {
        out.push({ given: { roll: "savedSave" }, expect: { damage: { fraction: v === "half" ? 0.5 : 0 } } });
      }
    }
  }
  if (entry.halfOnMiss === true) out.push({ given: { roll: "miss" }, expect: { damage: { fraction: 0.5 } } });
  if (Array.isArray(entry.noDamage) && entry.noDamage.length) out.push({ given: {}, expect: { damage: { fraction: 0 } } });
  const declarations = Array.isArray(entry.triggers) ? entry.triggers : isObject(entry.triggers) ? [entry.triggers] : [];
  for (const d of declarations) {
    const on = Array.isArray(d?.on) ? d.on : [d?.on];
    if (!on.includes("failedSave")) continue;
    for (const step of Array.isArray(d.do) ? d.do : [d.do]) {
      if (step?.type === "status" && isWord(step.status)) {
        out.push({ given: { roll: "failedSave" }, expect: { condition: { applied: step.status } } });
      } else if (step?.type === "move" && isWord(step.mode)) {
        // A step without a distance implies no distance: never an undefined field.
        const move = step.distance === undefined ? { mode: step.mode } : { mode: step.mode, distance: step.distance };
        out.push({ given: { roll: "failedSave" }, expect: { move } });
      }
    }
  }
  return normaliseAssert(out);
}
