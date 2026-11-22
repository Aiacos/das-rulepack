// Stage 6, play data: a reviewed rule's assertions (`rule.assert` plus what its entry implies, assert.mjs impliedAsserts, less
// what `rule.leaves` leaves to the table) as a scenario the engine's runner can play (`node tools/scenario.mjs <folder>` of
// DAS_CORE, through play/lib/steps.mjs) or a person can follow as a checklist. A scenario is data: ids, engine words, numbers,
// the record key and fingerprints. It never holds the rule's prose (`adds`, `free` texts are canonical `*`), the record's name
// or any rulebook text.
//
// What the runner can do (DAS_CORE tools/scenario.mjs makeContext and module/scripts/runtime/testing.mjs testApi, read for
// this stage): put a compendium item on a token (`ctx.ensureItem`), place a creature of the Monster Manual 2025 or the SRD
// 2024 by its actor id, unlinked, removed at the end (`ctx.cast`: a monster feature's creature itself, and the target), move a
// token (`move-token`), use one activity by id on targets (`ctx.use`, an area laid over the target for an area activity),
// read the resolution (`ctx.settle`: per target, identified by its token's uuid, `hit`, `save.success`, `damage.applied`; the
// damage roll's types in `damageRoll.damages`), the damage roll (`ctx.messagesSince`), a token's position and effects, the
// engine's view of a creature (`stats`: reactions blocked, action or bonus action only; `budget`: the turn's movement freed of
// opportunity attacks), start a combat, set initiatives and pass turns (`ctx.startCombat`, `set-initiative`, `ctx.nextTurn`),
// read the engine version (`testApi.status`). Nothing forces a d20: a roll the scenario needs is obtained by using the
// activity again until it comes (a crit, one chance in twenty, is left to a person). The interpreter covers what those allow
// without guessing (see `uninterpreted`); every other step is `manual`.
import { assertionOfCanonical, ruleFingerprint, slug, stateOf } from "./registry.mjs";
import { DENIES, impliedAsserts, normaliseAssert, pairsOf, sameUpToDetail } from "./assert.mjs";
import { leavesAssertions, TURN_ENDS } from "./leaves.mjs";
import { SIZES } from "./conditions.mjs";
import { AURA_MOMENTS, ZONE_MOMENTS } from "./zones.mjs";
import { REACTION_MOMENTS } from "./reactions.mjs";

// The denials play/lib/steps.mjs observes (an engine stat, or the caster's freed turn). Ruling R34: `healing` and `tempHp`
// have no interpreter (the runner deals no damage and heals nobody after the use): `expect.denies.<word>`, manual.
const PLAYED_DENIES = Object.freeze(DENIES.filter((d) => ["opportunityAttacks", "reactions", "actionAndBonus"].includes(d)));

// The arena the scenarios play in (DAS_CORE tools/lib/stages.mjs ARENE_SORTS): its caster token, and the token near which
// the target is placed (20 ft away: in range of everything but touch). A monster feature's creature is cast near it too.
export const ARENA = Object.freeze({ scene: "Arène des sorts", caster: "Lanceur", near: "Cible" });
// One SRD 2024 creature per creature type of the engine (core/eligibility.mjs CREATURE_TYPES), by the id the Monster Manual
// 2025 and the SRD 2024 of dnd5e (`actors24`) share; the runner looks in the first, then the second (ctx.cast).
export const TARGETS = Object.freeze({
  aberration: "mmOtyugh00000000", beast: "mmWolf0000000000", celestial: "mmPegasus0000000", construct: "mmAnimatedArmor0",
  dragon: "mmRedDragonWyrml", elemental: "mmFireElemental0", fey: "mmDryad000000000", fiend: "mmImp00000000000",
  giant: "mmOgre0000000000", humanoid: "mmBanditCaptain0", monstrosity: "mmOwlbear0000000", ooze: "mmOchreJelly0000",
  plant: "mmShriekerFungus", undead: "mmZombie00000000"
});
export const DEFAULT_TARGET = "humanoid";
// Ruling R30: the size of each of those creatures (`system.traits.size` of the SRD 2024 actors, `dnd5e.actors24`, and of the
// Monster Manual 2025's: checked against the dumps by tests/pipeline/trigger-conditions.test.mjs), so that an assertion
// limited to targets of a size or smaller (`given.targetSizeAtMost`) gets a target that satisfies it. The other side, a
// target too large, is a second play with another creature: a person's (`given.targetSizeAtMost.unmet`).
export const TARGET_SIZES = Object.freeze({
  mmOtyugh00000000: "lg", mmWolf0000000000: "med", mmPegasus0000000: "lg", mmAnimatedArmor0: "med", mmRedDragonWyrml: "med",
  mmFireElemental0: "lg", mmDryad000000000: "med", mmImp00000000000: "tiny", mmOgre0000000000: "lg", mmBanditCaptain0: "med",
  mmOwlbear0000000: "lg", mmOchreJelly0000: "lg", mmShriekerFungus: "med", mmZombie00000000: "med"
});
const rankOf = (size) => SIZES.indexOf(size);
// The rolls the interpreter can wait for (a crit is too rare to wait for), and how many uses it tries before failing (the
// engine's own scenarios try 20 times: a DC 13 save a creature makes on 8 or more fails one time in five).
export const FORCEABLE = Object.freeze(["hit", "miss", "failedSave", "savedSave"]);
export const TRIES = 20;
// The states whose rules get a scenario: reviewed, and played (its scenario stays, to be played again).
export const SCENARIO_STATES = Object.freeze(["reviewed", "played"]);
// The move modes the interpreter measures (a random direction is a die roll it cannot predict).
export const MEASURED_MOVES = Object.freeze(["push", "pull"]);
// The feet of a square the generator assumes to tell whether a pull can start within reach (the runner reads the scene's).
const SQUARE_FT = 5;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const ID = /^[A-Za-z0-9]{16}$/;
const MONSTER_DOC = /^([A-Za-z0-9]{16})\.([A-Za-z0-9]{16})$/;

/** The scenario id of a record: `<book>/<slug of its key>` (Ruling R10: what the stamp line names). */
export const scenarioIdOf = (record) => `${String(record.book).toLowerCase()}/${slug(record.key)}`;

// Every 16-character id of an entry, in the order they appear (keys and values, any depth).
function idsOf(value, out = []) {
  if (Array.isArray(value)) for (const v of value) idsOf(v, out);
  else if (isObject(value)) for (const [k, v] of Object.entries(value)) { if (ID.test(k)) out.push(k); idsOf(v, out); }
  else if (typeof value === "string" && ID.test(value)) out.push(value);
  return out;
}

// Of canonical assertions, those no other one says with more detail (assert.mjs sameUpToDetail: the same situation and the
// same expectation, the other stating every field this one does and more): checking the detailed one checks both.
function mostDetailed(list) {
  return list.filter((c) => !list.some((d) => d !== c && sameUpToDetail(c, d)
    && [...pairsOf(c)].every(([k, v]) => pairsOf(d).get(k) === v)));
}

/**
 * The canonical assertions a scenario checks: the rule's own and those its entry implies (with `structure`, the official item's
 * as structure.mjs structureOf gives it: the rolls its effects are applied on and its damage types), less those `rule.leaves`
 * leaves to the table, the less detailed of two that say the same thing dropped; deduplicated, sorted.
 */
export function checksOf(rule, { structure = null } = {}) {
  const left = new Set(leavesAssertions(rule));
  const all = [...new Set([...normaliseAssert(rule?.assert), ...impliedAsserts(rule?.entry, { structure })])];
  return mostDetailed(all.filter((c) => !left.has(c))).sort();
}

// What the interpreter observes (one `ctx.expect` each when the assertion holds): a damage fraction (and its type), a
// condition applied, a condition ended, a forced move, an effect's end at a turn boundary (still there before, gone after: 2),
// a denial.
const isTurnEnd = (v) => TURN_ENDS.includes(v);
const measurable = (m) => isObject(m) && MEASURED_MOVES.includes(m.mode)
  && (!Object.hasOwn(m, "distance") || (Number.isFinite(m.distance) && m.distance > 0));

// Why one check has no interpreter, as paths of the assertion (engine words only), or [].
function uninterpreted(a, origin) {
  const out = [];
  for (const [k, v] of Object.entries(a.given)) {
    if (k === "roll" && FORCEABLE.includes(v)) continue;
    if (k === "targetType" && Object.hasOwn(TARGETS, v)) continue;
    // The positive side is staged by the choice of the target (targetOf); a target that does not satisfy it is not played.
    if (k === "targetSizeAtMost") { out.push("given.targetSizeAtMost.unmet"); continue; }
    if (k === "origin" && v === origin) continue;
    // Ruling R33: a zone or aura moment needs an area laid and a creature in it when a turn passes, which the interpreter
    // does not stage: named by its word.
    if (k === "moment" && [...ZONE_MOMENTS, ...AURA_MOMENTS].includes(v)) { out.push(`given.moment.${v}`); continue; }
    // Ruling R38: a reaction moment needs an attack against the creature that carries the item and its reaction taken (a
    // prompt), which the interpreter does not stage: named by its word.
    if (k === "moment" && REACTION_MOMENTS.includes(v)) { out.push(`given.moment.${v}`); continue; }
    out.push(k === "roll" ? `force.${v}` : `given.${k}`);
  }
  for (const [k, v] of Object.entries(a.expect)) {
    if (k === "damage" && isObject(v) && Object.keys(v).every((f) => f === "fraction" || f === "type")) continue;
    if (k === "condition" && isObject(v) && Object.keys(v).every((f) => f === "applied" || f === "ended")) continue;
    if (k === "affects" && v === "target") continue;
    if (k === "ends" && isTurnEnd(v)) continue;
    if (k === "denies" && PLAYED_DENIES.includes(v)) continue;
    if (k === "denies" && DENIES.includes(v)) { out.push(`expect.denies.${v}`); continue; }
    if (k === "move" && measurable(v)) continue;
    if (k === "move" && isObject(v)) {
      out.push(MEASURED_MOVES.includes(v.mode) ? "expect.move.distance" : `expect.move.mode.${v.mode}`);
      continue;
    }
    if (k === "ends") { out.push(`expect.ends.${v}`); continue; }
    out.push(`expect.${k}`);
  }
  // Who an assertion is about is a qualifier: a check needs something to look at.
  if (!expectsOf(a) && !out.some((p) => p.startsWith("expect."))) out.push("expect");
  return out;
}

/**
 * The creature type of the one target a scenario places (Ruling R30): the type the assertions name (one at most; the
 * default otherwise) whose creature (TARGETS) is no larger than every `given.targetSizeAtMost` they state; with no type
 * named, the default type first, then the others in TARGETS order. `{ type, fits }`: `fits` false when no creature of the
 * allowed types satisfies the limits (the scenario's positive side is then a person's too).
 */
export function targetOf(types, limits) {
  const ranks = [...limits].map(rankOf);
  const limit = ranks.length ? Math.min(...ranks) : SIZES.length;
  const candidates = types.size > 1 ? [] : types.size === 1 ? [...types]
    : [DEFAULT_TARGET, ...Object.keys(TARGETS).filter((t) => t !== DEFAULT_TARGET)];
  const fits = (t) => Object.hasOwn(TARGETS, t) && rankOf(TARGET_SIZES[TARGETS[t]]) <= limit;
  const fit = ranks.some((r) => r < 0) ? undefined : candidates.find(fits);
  const fallback = types.size === 1 ? [...types][0] : DEFAULT_TARGET;
  return { type: fit ?? fallback, fits: fit !== undefined || !ranks.length };
}

/**
 * The checks play/lib/steps.mjs makes for one assertion when it is met (one `ctx.expect` per observed fact: a damage fraction
 * with its type, a condition applied, a condition ended, a move, a denial; an ending at a turn boundary is two: still there
 * just before, gone just after). The scenario declares their sum as `checks`; `played` refuses a run whose stamp counts another
 * number.
 */
export const expectsOf = (a) => {
  const e = a?.expect ?? {};
  const condition = isObject(e.condition) ? e.condition : {};
  return (Object.hasOwn(e, "damage") ? 1 : 0) + (Object.hasOwn(condition, "applied") ? 1 : 0)
    + (Object.hasOwn(condition, "ended") ? 1 : 0) + (measurable(e.move) ? 1 : 0) + (isTurnEnd(e.ends) ? 2 : 0)
    + (PLAYED_DENIES.includes(e.denies) ? 1 : 0);
};

// An assertion whose fact is an effect the use leaves on the target (an ending, a denial on the bearer, a condition): with no
// roll stated, it is observed on the roll the activity applies its effects on (a save: a failed save; an attack: a hit).
const needsEffect = (a) => Object.hasOwn(a.expect, "ends") || Object.hasOwn(a.expect, "condition")
  || ["reactions", "actionAndBonus"].includes(a.expect.denies);
const OBSERVED_ON = { save: "failedSave", attack: "hit" };

// canonical assertion → the activities the entry ties it to (saveDamage and noDamage name their activities); an assertion the
// entry does not tie to an activity is absent (it is checked on every activity played).
function attributed(entry, activities, structure) {
  const out = new Map();
  if (!isObject(entry)) return out;
  for (const id of activities) {
    const own = {};
    if (isObject(entry.saveDamage) && Object.hasOwn(entry.saveDamage, id)) own.saveDamage = { [id]: entry.saveDamage[id] };
    if (Array.isArray(entry.noDamage) && entry.noDamage.includes(id)) own.noDamage = [id];
    for (const c of impliedAsserts(own, { structure })) out.set(c, new Set([...(out.get(c) ?? []), id]));
  }
  return out;
}

// The activities played: every id of the entry that is an activity of the item (the rule's fingerprint covers all of them),
// else the item's only activity, else (with the structure) the only activity of the kind that makes the rolls the assertions
// name (a save for failedSave / savedSave, an attack for hit / miss).
function playedActivities(entry, activities, checks, structure) {
  const named = [...new Set(idsOf(entry).filter((id) => activities.includes(id)))];
  if (named.length) return named;
  if (activities.length === 1) return [activities[0]];
  const rolls = new Set(checks.map((c) => assertionOfCanonical(c)?.given?.roll).filter(Boolean));
  const kinds = new Set([...rolls].map((r) => (["hit", "miss", "crit"].includes(r) ? "attack" : "save")));
  if (kinds.size !== 1) return [];
  const [kind] = kinds;
  const fit = (Array.isArray(structure?.activities) ? structure.activities : [])
    .filter((a) => activities.includes(a?.id) && a.type === kind).map((a) => a.id);
  return fit.length === 1 ? fit : [];
}

/**
 * The scenario of a reviewed record: `{ scenario, key, rule, origin, client: "gm", manual, manualBecause, checks, setup, steps }`.
 * `setup.item` is the official item (else the first origin the rule names) by docId: for a monster feature (docId
 * `<actor id>.<item id>`) the creature is cast for the run from `actor` and its own item `id` is used (`setup.caster` null);
 * for anything else, the item is lent to the arena's caster from its compendium `uuid` when `packOf` (docId →
 * "<package>.<pack>", from the dumps) knows it. `setup.target` is an SRD 2024 creature of the type the assertions name, no
 * larger than the size they limit targets to (targetOf);
 * `setup.reach` the reach in feet of each activity played (null: unknown, the target is then placed adjacent); `setup.area`
 * the activities with an area template (used on an area laid over the target). `structure` is the official item's
 * (structure.mjs structureOf, with `reach` per activity from structure.mjs reachesOf), or null.
 * `steps`, per activity played and per assertion checked on it: `{ use: <activity id> }`, `{ force: <roll> }` when it has one
 * (`{ observe: <roll> }`: the roll its effect is observed on, when it states none), `{ advance: <moment> }` when it has one,
 * `{ check: <canonical assertion> }`; `checks` the number of checks the run makes when every assertion holds. `manual` when a
 * step has no interpreter; `manualBecause` names which (paths only).
 */
export function scenarioOf(record, { packOf, structure = null } = {}) {
  const rule = record.rule ?? {};
  const origins = Array.isArray(rule.origins) ? rule.origins : [];
  const origin = origins.includes("official") ? "official" : origins[0] ?? null;
  const item = (record.items ?? []).find((i) => i?.origin === origin && i.match === "matched") ?? null;
  const official = origin === "official";
  const because = new Set();
  const monsterDoc = record.kind === "monster" && official ? MONSTER_DOC.exec(item?.docId ?? "") : null;
  let setupItem;
  if (record.kind === "monster") {
    setupItem = { origin, docId: item?.docId ?? null, uuid: null, kind: record.kind,
      ...(monsterDoc ? { actor: monsterDoc[1], id: monsterDoc[2] } : {}) };
    if (!monsterDoc) because.add("setup.item");
  } else {
    const pack = item && official && typeof packOf === "function" ? packOf(item.docId) : null;
    setupItem = { origin, docId: item?.docId ?? null, uuid: pack ? `Compendium.${pack}.Item.${item.docId}` : null,
      kind: record.kind };
    if (!setupItem.uuid) because.add("setup.item");
  }
  const own = official ? structure : null;
  const activities = Array.isArray(item?.activities) ? item.activities : [];
  const checks = checksOf(rule, { structure: own });
  if (!checks.length) because.add("check");
  const played = playedActivities(rule.entry, activities, checks, own);
  if (!played.length) because.add("use");
  const tied = attributed(rule.entry, played, own);
  const shape = new Map((Array.isArray(own?.activities) ? own.activities : []).map((a) => [a?.id, a]));
  const reachOf = (id) => (Number.isFinite(shape.get(id)?.reach) ? shape.get(id).reach : null);
  const types = new Set();
  const limits = new Set();
  const steps = [];
  let expected = 0;
  for (const activity of played) {
    // A heal activity waits for a healing roll the runner never makes, on a target it casts as a foe: by hand.
    if (shape.get(activity)?.type === "heal") because.add("activity.heal");
    for (const c of checks) {
      // An assertion the entry ties to some activities is checked on those; one it ties to none, on each.
      if (tied.has(c) && !tied.get(c).has(activity)) continue;
      const a = assertionOfCanonical(c) ?? { given: {}, expect: { unreadable: true } };
      if (Object.hasOwn(a.given, "targetType")) types.add(a.given.targetType);
      if (Object.hasOwn(a.given, "targetSizeAtMost")) limits.add(a.given.targetSizeAtMost);
      for (const why of uninterpreted(a, origin)) because.add(why);
      const move = a.expect.move;
      // A pull starts its distance plus one square away from the caster: within the activity's reach, when it is known.
      if (measurable(move) && move.mode === "pull" && Number.isFinite(move.distance) && reachOf(activity) !== null
        && move.distance + SQUARE_FT > reachOf(activity)) because.add("setup.reach");
      steps.push({ use: activity });
      if (Object.hasOwn(a.given, "roll")) steps.push({ force: a.given.roll });
      else if (needsEffect(a) && OBSERVED_ON[shape.get(activity)?.type]) {
        steps.push({ observe: OBSERVED_ON[shape.get(activity).type] });
      }
      if (Object.hasOwn(a.given, "moment")) { steps.push({ advance: a.given.moment }); because.add("advance"); }
      steps.push({ check: c });
      expected += expectsOf(a);
    }
  }
  // One target per scenario: assertions about two creature types are two plays, which a person runs.
  if (types.size > 1) because.add("given.targetType");
  const { type, fits } = targetOf(types, limits);
  if (!fits) because.add("given.targetSizeAtMost");
  const manualBecause = [...because].sort();
  const monster = record.kind === "monster";
  return {
    scenario: scenarioIdOf(record), key: record.key, rule: ruleFingerprint(record.rule), origin, client: "gm",
    manual: manualBecause.length > 0, manualBecause, checks: expected,
    setup: { scene: ARENA.scene, caster: monster ? null : ARENA.caster, near: ARENA.near, item: setupItem,
      target: { actor: TARGETS[type] ?? TARGETS[DEFAULT_TARGET], type },
      reach: Object.fromEntries(played.map((id) => [id, reachOf(id)])),
      area: played.filter((id) => typeof shape.get(id)?.template?.type === "string" && shape.get(id).template.type !== "") },
    steps
  };
}

/**
 * The files of a scenario, as `[path relative to play/, text]`: its JSON and, unless it is manual, the two-line module the
 * runner imports (it hands the JSON to play/lib/steps.mjs `scenario`).
 */
export function scenarioFiles(s) {
  const [book, name] = s.scenario.split("/");
  const files = [[`${book}/${name}.json`, `${JSON.stringify(s, null, 2)}\n`]];
  if (!s.manual) {
    files.push([`${book}/${name}.mjs`, `import { scenario } from "../lib/steps.mjs";\n`
      + `export default scenario((await import("./${name}.json", { with: { type: "json" } })).default);\n`]);
  }
  return files;
}

/**
 * A rule's family (Ruling R11): its sorted top-level entry keys, `triggers` with its declarations' `on > step types`
 * (`saveDamage+triggers(failedSave>status)`); a rule with no entry is `code`.
 */
export function familyOf(record) {
  const entry = record.rule?.entry;
  if (!isObject(entry)) return "code";
  return Object.keys(entry).sort().map((k) => {
    if (k !== "triggers") return k;
    const list = Array.isArray(entry.triggers) ? entry.triggers : [entry.triggers];
    const shapes = list.map((d) => {
      const on = [d?.on].flat().filter((x) => typeof x === "string").sort().join("|");
      const types = [d?.do].flat().map((s) => s?.type).filter((x) => typeof x === "string").sort().join("|");
      return `${on}>${types}`;
    });
    return `triggers(${[...new Set(shapes)].sort().join(",")})`;
  }).join("+");
}

/**
 * The run order of a book's scenarios (Ruling R11; spec §2.6: scheduled after, never skipped): the first rule (by key) of
 * each family, then the others, each part by key. Rows `{ order, scenario, key, family, first, manual, state }`; `structures`
 * (record key → the official item's structure, as scenarioOf takes it) decides `manual` as `npm run scenarios` writes it.
 */
export function planOf(records, { packOf, structures } = {}) {
  const playable = records.filter((r) => SCENARIO_STATES.includes(stateOf(r)))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const seen = new Set();
  const first = [];
  const then = [];
  for (const r of playable) {
    const family = familyOf(r);
    (seen.has(family) ? then : first).push({ r, family, first: !seen.has(family) });
    seen.add(family);
  }
  return [...first, ...then].map(({ r, family, first: isFirst }, i) => ({
    order: i + 1, scenario: scenarioIdOf(r), key: r.key, family, first: isFirst,
    manual: scenarioOf(r, { packOf, structure: structures?.get(r.key) ?? null }).manual, state: stateOf(r)
  }));
}

/**
 * `(docId) => "<package>.<pack>" | null` from dump file names (`<package>.<pack>.json`, item packs only): a docId found in
 * one file names its pack; in several, the one of the book's package (`preferred`, package ids) when it is one; else null.
 */
export function packIndex(fileDocs, preferred = []) {
  const where = new Map();
  for (const [file, docs] of fileDocs) {
    const pack = file.slice(0, -".json".length);
    for (const d of docs) if (typeof d?._id === "string") where.set(d._id, [...(where.get(d._id) ?? []), pack]);
  }
  return (docId) => {
    const packs = [...new Set(where.get(docId) ?? [])];
    if (packs.length === 1) return packs[0];
    const own = packs.filter((p) => preferred.some((id) => p.startsWith(`${id}.`)));
    return own.length === 1 ? own[0] : null;
  };
}
