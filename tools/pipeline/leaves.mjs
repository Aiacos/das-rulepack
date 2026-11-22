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
 * Why a rule leaves an expectation to the table, the reasons pilot 3 showed (docs/pilot-m3.md; the drafters' and readers'
 * `why` on branch pilot/m3-xmm): no allowed key expresses it; a limit by the target's size; only targets in a state (grappled,
 * cursed, engulfed); an immunity after a save; a target that cannot regain hit points; an effect outside combat; something
 * the table decides.
 */
export const LEAVE_REASONS = Object.freeze(["no-key", "target-size", "target-state", "immunity-after-save", "healing-block",
  "out-of-combat", "table-ruling"]);
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
    errors.push(...assertProblems([assertion], { vocabulary, ...(origins ? { origins } : {}), at: here })
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

/**
 * The problems of a rule's leaves against the rule itself (Ruling R25), or []: a rule that has leaves but whose own assertions
 * (stated, and implied by its entry, assert.mjs impliedAsserts) are none or only the item's own damage (an empty rule with
 * excuses); a leaves assertion the rule states or implies (the same up to optional detail, review.mjs's matching: it is not
 * left out); a leaves damage the rule gives another fraction of, for the same situation (and type, when both give one).
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
    if (own.some((x) => sameUpToDetail(x, c))) {
      errors.push(`rule.leaves[${i}]: the rule states or implies it (its assert or its entry): it is not left out`);
      return;
    }
    const p = pairsOf(c);
    if (!p.has("expect.damage.fraction")) return;
    const otherwise = own.some((x) => {
      const q = pairsOf(x);
      const type = (m) => m.get("expect.damage.type");
      return givenOf(q) === givenOf(p) && q.has("expect.damage.fraction")
        && q.get("expect.damage.fraction") !== p.get("expect.damage.fraction")
        && (type(q) === undefined || type(p) === undefined || type(q) === type(p));
    });
    if (otherwise) errors.push(`rule.leaves[${i}]: the rule says otherwise of that damage (another fraction, same situation)`);
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
