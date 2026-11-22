// Ruling R25: partial rules. A rule may automate part of an entry and declare what it leaves to the table as data, never prose:
// `rule.leaves`, a list of at most LEAVES_MAX items, each either an assertion of the closed vocabulary (assert.mjs) of what
// would be true at the table but must be done by hand, `{ given, expect, because? }`, or, for what even the assertion
// vocabulary cannot say, `{ unexpressed: <reason>, count }`. `because` and `unexpressed` are words of LEAVE_REASONS. No `free`
// text anywhere: the quotation check has nothing to read. Review compares only what the rule claims (review.mjs
// compareAsserts: a review assertion matched by a leaves assertion is `left`, not a disagreement); leaves is part of the rule
// fingerprint and is emitted nowhere at runtime (generate.mjs gives docs/RULES.md its counts by reason).
// (schema.mjs imports this module: nothing of schema.mjs is read here at load time.)
import { assertProblems, impliedAsserts, normaliseAssert, pairsOf, givenOf, sameUpToDetail } from "./assert.mjs";

export const LEAVES_MAX = 6;
/** How many expectations one `unexpressed` item may stand for. */
export const UNEXPRESSED_MAX = 6;
/**
 * Why a rule leaves an expectation to the table, and what a reread found missing that the assertions cannot say (reread.mjs
 * `unexpressed`): one list for both. The reasons pilot 3 showed (docs/pilot-m3.md; the drafters' and readers' `why` on branch
 * pilot/m3-xmm): no allowed key expresses it; a limit by the target's size; only targets in a state (grappled, cursed,
 * engulfed); an immunity after a save; a target that cannot regain hit points; an effect outside combat; something the table
 * decides. Then the ones the rereaders kept naming as unsayable (their `why` at 0.6, triage/reread-2): a lower maximum of hit
 * points; an effect kept across turns; a choice at use time; a death or zero-hit-point trigger; a change of form; a limit on
 * how often it is used; a trigger narrower than any moment; a result by how much a save fails; a follow-up action; the user
 * healing itself by what it deals.
 */
export const LEAVE_REASONS = Object.freeze(["no-key", "target-size", "target-state", "immunity-after-save", "healing-block",
  "out-of-combat", "table-ruling", "max-hp-reduction", "ongoing-effect", "use-time-choice", "death-trigger", "form-change",
  "use-limit", "trigger-filter", "save-margin", "follow-up-action", "self-healing"]);
/** The bucket of docs/RULES.md for a leaves assertion that gives no `because`. */
export const UNSTATED = "unstated";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const has = (o, k) => Object.hasOwn(o, k);
const isUnexpressed = (item) => isObject(item) && has(item, "unexpressed");
/** The leaves items that are assertions, as `{ given, expect }` (their `because` set aside). */
const assertionsOf = (leaves) => (Array.isArray(leaves) ? leaves : [])
  .filter((x) => isObject(x) && !isUnexpressed(x)).map((x) => ({ given: x.given, expect: x.expect }));
/** The canonical forms of a rule's leaves assertions (assert.mjs normaliseAssert), sorted. */
export const leavesAssertions = (rule) => normaliseAssert(assertionsOf(rule?.leaves));

/**
 * The problems of a `rule.leaves` list, each prefixed with its path: not a list; more than LEAVES_MAX items; an item that is
 * neither `{ given, expect, because? }` (own keys only; the assertion as assertProblems checks it, `vocabulary` and `origins`
 * as there; no `free` in given or expect; `because` one of LEAVE_REASONS) nor `{ unexpressed, count }` (`unexpressed` one of
 * LEAVE_REASONS, `count` an integer from 1 to UNEXPRESSED_MAX); an assertion listed twice.
 */
export function leavesProblems(leaves, { vocabulary = {}, origins, at = "rule.leaves" } = {}) {
  if (!Array.isArray(leaves)) return [`${at}: must be an array of { given, expect, because? } or { unexpressed, count }`];
  const errors = [];
  if (leaves.length > LEAVES_MAX) errors.push(`${at}: at most ${LEAVES_MAX} items (${leaves.length})`);
  const seen = new Set();
  leaves.forEach((item, i) => {
    const here = `${at}[${i}]`;
    if (!isObject(item)) return errors.push(`${here}: must be { given, expect, because? } or { unexpressed, count }`);
    if (isUnexpressed(item)) {
      if (Object.keys(item).some((k) => k !== "unexpressed" && k !== "count")) {
        errors.push(`${here}: must be { unexpressed, count }`);
      }
      if (!LEAVE_REASONS.includes(item.unexpressed)) errors.push(`${here}.unexpressed: must be one of ${LEAVE_REASONS.join(", ")}`);
      if (!(Number.isInteger(item.count) && item.count >= 1 && item.count <= UNEXPRESSED_MAX)) {
        errors.push(`${here}.count: an integer from 1 to ${UNEXPRESSED_MAX}`);
      }
      return undefined;
    }
    for (const k of Object.keys(item)) if (!["given", "expect", "because"].includes(k)) errors.push(`${here}.${k}: unknown field`);
    if (has(item, "because") && !LEAVE_REASONS.includes(item.because)) {
      errors.push(`${here}.because: must be one of ${LEAVE_REASONS.join(", ")}`);
    }
    for (const part of ["given", "expect"]) {
      if (isObject(item[part]) && has(item[part], "free")) errors.push(`${here}.${part}.free: no free text in leaves (Ruling R25)`);
    }
    const assertion = { given: item.given, expect: item.expect };
    errors.push(...assertProblems([assertion], { vocabulary, ...(origins ? { origins } : {}), at: here, agent: true })
      .map((e) => e.replace(`${here}[0]`, here)));
    const c = normaliseAssert([assertion])[0];
    if (c !== undefined && seen.has(c)) errors.push(`${here}: listed twice`);
    if (c !== undefined) seen.add(c);
  });
  return errors;
}

// What the item's own data does without any rule (Ruling R24's baseline, read without the structure): the full damage of a hit
// or a failed save, typed or not.
const isBaselineShape = (c) => {
  const p = pairsOf(c);
  return ["given.roll=hit", "given.roll=failedSave"].includes(givenOf(p)) && p.get("expect.damage.fraction") === "1"
    && [...p.keys()].every((k) => k.startsWith("given.") || k === "expect.damage.fraction" || k === "expect.damage.type");
};

/** The engine's turn words (EFFECT_ENDS, committed copy; tests/pipeline/definitions.mjs pins it to the clone's list). */
export const TURN_ENDS = Object.freeze(["casterTurnStart", "casterTurnEnd", "bearerTurnStart", "bearerTurnEnd", "currentTurnEnd"]);

// The given of `own` covers the given of `leave`: every situation `own` states, `leave` states too (an own assertion that
// holds in every situation, `given: {}`, covers any).
const coversGiven = (own, leave) => [...own].filter(([k]) => k.startsWith("given."))
  .every(([k, v]) => leave.get(k) === v);
// The same assertion with the given of another (to compare an own assertion that covers a leave's situation).
const withGivenOf = (c, from) => [...pairsOf(c)].filter(([k]) => !k.startsWith("given."))
  .concat([...pairsOf(from)].filter(([k]) => k.startsWith("given."))).map(([k, v]) => `${k}=${v}`).sort().join(";");
/**
 * The fields of one expectation kind that hold one value per situation (fix round 1 of Ruling R25): another value for a
 * situation the rule covers is a contradiction, "the rule already says otherwise". A damage fraction (of one type, when both
 * give one); a move mode; a roll mode for the same roll and roller; a turn ending (one of TURN_ENDS: an effect has one timed
 * end, while it may also end on an event, a moment). A second condition, or an event ending beside a timed one, is not one.
 */
function saysOtherwise(own, leave) {
  const kind = (m) => [...new Set([...m.keys()].filter((k) => k.startsWith("expect.")).map((k) => k.split(".")[1]))];
  const [k] = kind(leave);
  if (kind(leave).length !== 1 || kind(own).length !== 1 || kind(own)[0] !== k) return false;
  const differ = (f) => own.has(f) && leave.has(f) && own.get(f) !== leave.get(f);
  const same = (f) => own.get(f) === leave.get(f);
  if (k === "damage") {
    const typeOk = !own.has("expect.damage.type") || !leave.has("expect.damage.type") || same("expect.damage.type");
    return typeOk && differ("expect.damage.fraction");
  }
  if (k === "move") return differ("expect.move.mode");
  if (k === "roll") return same("expect.roll.on") && same("expect.roll.for") && differ("expect.roll.mode");
  if (k === "ends") return TURN_ENDS.includes(own.get("expect.ends")) && TURN_ENDS.includes(leave.get("expect.ends"))
    && differ("expect.ends");
  return false;
}

/**
 * The problems of a rule's leaves against the rule itself (Ruling R25 and its fix round 1), or []: a rule that has leaves but
 * whose own assertions (stated, and implied by its entry, assert.mjs impliedAsserts) are none or only the item's own damage
 * (an empty rule with excuses); a leaves assertion the rule states or implies, for that situation or for every situation (the
 * same up to optional detail, review.mjs's matching: the rule does it, it is not left out); a leaves assertion the rule
 * contradicts for a situation it covers (saysOtherwise: "the rule already says otherwise").
 */
export function leavesConflicts(rule) {
  if (!isObject(rule) || !has(rule, "leaves") || !Array.isArray(rule.leaves) || !rule.leaves.length) return [];
  const own = [...new Set([...normaliseAssert(rule.assert), ...impliedAsserts(rule.entry)])];
  if (!own.length || own.every(isBaselineShape)) {
    return ["rule.leaves: the rule asserts nothing of its own (no assertion, or only the item's own damage): an empty rule"
      + " with leaves is a person's answer, not a partial rule"];
  }
  const errors = [];
  rule.leaves.forEach((item, i) => {
    if (!isObject(item) || isUnexpressed(item)) return;
    const c = normaliseAssert([{ given: item.given, expect: item.expect }])[0];
    if (c === undefined) return;
    const leave = pairsOf(c);
    const covering = own.filter((x) => coversGiven(pairsOf(x), leave));
    if (covering.some((x) => sameUpToDetail(withGivenOf(x, c), c))) {
      errors.push(`rule.leaves[${i}]: the rule states or implies it (its assert or its entry): it is not left out`);
    } else if (covering.some((x) => saysOtherwise(pairsOf(x), leave))) {
      errors.push(`rule.leaves[${i}]: the rule already says otherwise for that situation (another fraction, mode or turn`
        + " ending)");
    }
  });
  return errors;
}

/** The expectations a rule leaves to the table, counted by reason (`unstated` for an assertion without `because`), keys sorted. */
export function leftCounts(leaves) {
  const counts = {};
  for (const item of Array.isArray(leaves) ? leaves : []) {
    if (!isObject(item)) continue;
    const reason = isUnexpressed(item) ? item.unexpressed : has(item, "because") ? item.because : UNSTATED;
    counts[reason] = (counts[reason] ?? 0) + (isUnexpressed(item) ? item.count : 1);
  }
  return Object.fromEntries(Object.entries(counts).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
}

/** True when a rule declares something left to the table. */
export const isPartial = (rule) => Array.isArray(rule?.leaves) && rule.leaves.length > 0;
