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

// The paths a drafter's data fix may write: an allowlist of numeric and enumeration leaves (exact case; ids are 16 letters
// and digits). Anything else (a name, a description, chat text, a condition, flags, an image...) goes to a person. The
// leaves were checked against the fixes DAS · Core ships (module/scripts/content/*.mjs).
const TARGET_LEAVES = ["template.type", "template.size", "template.units", "template.count", "affects.type", "affects.count",
  "affects.choice"].map((l) => `target.${l}`);
const ACTIVITY_LEAVES = ["range.value", "range.units", "range.long", ...TARGET_LEAVES, "duration.value", "duration.units",
  "duration.concentration", "activation.type", "activation.value", "save.ability", "save.dc.calculation", "save.dc.formula",
  "damage.onSave", "damage.parts", "damage.includeBase", "healing.number", "healing.denomination", "healing.bonus",
  "healing.types", "consumption.targets", "consumption.spellSlot", "uses.max", "uses.recovery", "effects", "attack.bonus",
  "spell.challenge"];
export const FIX_PATHS = Object.freeze({
  activity: Object.freeze(ACTIVITY_LEAVES),
  item: Object.freeze(["uses.max", "uses.recovery", "uses.autoDestroy", "duration.value", "duration.units", "range.value",
    "range.units", ...TARGET_LEAVES, "properties", "attunement", "damage.base.denomination"].map((l) => `system.${l}`)),
  effect: Object.freeze(["duration.seconds", "duration.rounds", "duration.turns", "duration.value", "duration.units",
    "duration.expiry", "statuses", "system.changes", "changes", "transfer", "disabled"])
});
const ACTIVITY_PATH = /^system\.activities\.[A-Za-z0-9]{16}\.(.+)$/;
function allowedPath(fix) {
  if (typeof fix.path !== "string") return false;
  if ("effect" in fix) return FIX_PATHS.effect.includes(fix.path);
  const leaf = fix.path.match(ACTIVITY_PATH)?.[1];
  return leaf !== undefined ? FIX_PATHS.activity.includes(leaf) : FIX_PATHS.item.includes(fix.path);
}

// What a fix's `value` and `from` may hold, keys and values at every depth: tokens, never prose.
export const FIX_LIMITS = Object.freeze({ string: 40, spaces: 3, words: 12, items: 12, depth: 4 });
const TOKEN = /^[A-Za-z0-9@._\-+*/()[\] ]*$/;
const isToken = (s) => s.length <= FIX_LIMITS.string && TOKEN.test(s) && (s.match(/ /g) ?? []).length <= FIX_LIMITS.spaces;

// The first reason `v` is not made of tokens, or null.
function tokenProblem(v, depth = 0) {
  if (typeof v === "string") return isToken(v) ? null : `a string that is not a short token (${FIX_LIMITS.string} characters `
    + `of letters, digits, @ . _ - + * / ( ) [ ] and at most ${FIX_LIMITS.spaces} spaces)`;
  if (v === null || typeof v !== "object") return null;
  if (depth + 1 > FIX_LIMITS.depth) return `deeper than ${FIX_LIMITS.depth} levels`;
  if (Array.isArray(v) && v.length > FIX_LIMITS.items) return `an array of more than ${FIX_LIMITS.items} items`;
  for (const [k, x] of Object.entries(v)) {
    const problem = (Array.isArray(v) ? null : tokenProblem(k)) ?? tokenProblem(x, depth + 1);
    if (problem) return problem;
  }
  return null;
}

// The distinct words of four letters or more (a token made of letters only; an id or a formula is not a word).
const wordsOf = (v) => new Set(JSON.stringify(v ?? null).split(/[^A-Za-z0-9]+/).filter((t) => /^[A-Za-z]{4,}$/.test(t))
  .map((t) => t.toLowerCase()));

// A guard that says what the data holds before the fix: 0 and false are guards; null, "", a blank string, and an empty object
// or array anywhere inside are not (the engine's matcher takes `{}` for "anything").
function isGuard(v, top = true) {
  if (v === null) return !top;
  if (typeof v === "string") return !top || v.trim() !== "";
  if (typeof v !== "object") return v !== undefined;
  const values = Array.isArray(v) ? v : Object.values(v);
  return values.length > 0 && values.every((x) => isGuard(x, false));
}

// What a drafter may not do with `dataFixes`, beyond the engine's own validator.
function fixProblems(fixes) {
  const problems = [];
  (Array.isArray(fixes) ? fixes : []).forEach((f, i) => {
    const at = `dataFixes[${i}]`;
    if (!isObject(f)) return;
    if ("create" in f) return problems.push(`${at}: create is not for a drafter (an effect to create goes to a person)`);
    if (!allowedPath(f)) problems.push(`${at}.path: not an allowed leaf (it goes to a person)`);
    if (!("from" in f)) problems.push(`${at}: from is required`);
    else if (!isGuard(f.from)) problems.push(`${at}.from: a non-empty guard (not null or blank, no empty object or array inside)`);
    for (const part of ["value", "from"]) {
      const problem = part in f ? tokenProblem(f[part]) : null;
      if (problem) problems.push(`${at}.${part}: ${problem}`);
    }
    const words = new Set([...wordsOf(f.value), ...wordsOf(f.from)]);
    if (words.size > FIX_LIMITS.words) problems.push(`${at}: more than ${FIX_LIMITS.words} distinct words in value and from`);
  });
  return problems;
}

/**
 * Why a drafter may not write this entry, or []: a key outside DRAFT_KEYS, and the limits of `dataFixes` (no `create`, a
 * path of FIX_PATHS, a `from` guard on every fix, value and from made of short tokens, official origin only, never a monster
 * feature).
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
