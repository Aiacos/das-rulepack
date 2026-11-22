// Stage 6, play data: a reviewed rule's assertions (`rule.assert` plus what its entry implies, assert.mjs impliedAsserts) as a
// scenario the engine's runner can play (`node tools/scenario.mjs <folder>` of DAS_CORE, through play/lib/steps.mjs) or a
// person can follow as a checklist. A scenario is data: ids, engine words, numbers, the record key and fingerprints. It never
// holds the rule's prose (`adds`, `free` texts are canonical `*`), the record's name or any rulebook text.
//
// What the runner can do (DAS_CORE tools/scenario.mjs makeContext and module/scripts/runtime/testing.mjs testApi, read for
// this stage): put a compendium item on a token (`ctx.ensureItem`, the connector's upsert-actor-item: no testApi function
// does it), use one activity by id on targets (`ctx.use`), read the resolution (`ctx.settle`: per target `hit`, `save.success`,
// `damage.applied`) and the damage roll (`ctx.messagesSince`), read a token's effects (`ctx.effects`), place an SRD 2024
// creature (`ctx.cast`), start a combat and pass a turn (`ctx.startCombat`, `ctx.nextTurn`), read the engine version
// (`testApi.status`). Nothing forces a d20: a roll the scenario needs is obtained by using the activity again until it comes
// (a few tries; a crit, one chance in twenty, is left to a person). The interpreter covers what those allow without guessing:
// a save or an attack outcome, a fraction of the rolled damage, a condition applied. Every other step is `manual`.
import { assertionOfCanonical, ruleFingerprint, slug, stateOf } from "./registry.mjs";
import { impliedAsserts, normaliseAssert } from "./assert.mjs";

// The arena the scenarios play in (DAS_CORE tools/lib/stages.mjs ARENE_SORTS): its caster token, and the token near which
// the target is placed (20 ft away: in range of everything but touch).
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
// The rolls the interpreter can wait for (a crit is too rare to wait for), and how many uses it tries before failing.
export const FORCEABLE = Object.freeze(["hit", "miss", "failedSave", "savedSave"]);
export const TRIES = 12;
// The states whose rules get a scenario: reviewed, and played (its scenario stays, to be played again).
export const SCENARIO_STATES = Object.freeze(["reviewed", "played"]);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const ID = /^[A-Za-z0-9]{16}$/;

/** The scenario id of a record: `<book>/<slug of its key>` (Ruling R10: what the stamp line names). */
export const scenarioIdOf = (record) => `${String(record.book).toLowerCase()}/${slug(record.key)}`;

// Every 16-character id of an entry, in the order they appear (keys and values, any depth).
function idsOf(value, out = []) {
  if (Array.isArray(value)) for (const v of value) idsOf(v, out);
  else if (isObject(value)) for (const [k, v] of Object.entries(value)) { if (ID.test(k)) out.push(k); idsOf(v, out); }
  else if (typeof value === "string" && ID.test(value)) out.push(value);
  return out;
}

/** The canonical assertions a scenario checks: the rule's own and those its entry implies, deduplicated, sorted. */
export const checksOf = (rule) =>
  [...new Set([...normaliseAssert(rule?.assert), ...impliedAsserts(rule?.entry)])].sort();

// Why one check has no interpreter, as paths of the assertion (engine words only), or [].
function uninterpreted(a, origin) {
  const out = [];
  for (const [k, v] of Object.entries(a.given)) {
    if (k === "roll" && FORCEABLE.includes(v)) continue;
    if (k === "targetType" && Object.hasOwn(TARGETS, v)) continue;
    if (k === "origin" && v === origin) continue;
    out.push(k === "roll" ? `force.${v}` : `given.${k}`);
  }
  for (const [k, v] of Object.entries(a.expect)) {
    if (k === "damage" && Object.keys(v).every((f) => f === "fraction")) continue;
    if (k === "condition" && Object.keys(v).every((f) => f === "applied")) continue;
    if (k === "affects" && v === "target") continue;
    out.push(isObject(v) ? `expect.${k}.${Object.keys(v).filter((f) => f !== "fraction" && f !== "applied").join(".")}`
      : `expect.${k}`);
  }
  // Who an assertion is about is a qualifier: a check needs a damage fraction or a condition applied to look at.
  if (!Object.hasOwn(a.expect, "damage") && !Object.hasOwn(a.expect.condition ?? {}, "applied")) out.push("expect");
  return out;
}

/**
 * The checks play/lib/steps.mjs makes for one assertion when it is met (one `ctx.expect` per observed fact: a damage fraction,
 * a condition applied). The scenario declares their sum as `checks`; `played` refuses a run whose stamp counts another number.
 */
export const expectsOf = (a) =>
  (Object.hasOwn(a.expect, "damage") ? 1 : 0) + (Object.hasOwn(a.expect.condition ?? {}, "applied") ? 1 : 0);

// canonical assertion → the activities the entry ties it to (saveDamage and noDamage name their activities); an assertion the
// entry does not tie to an activity is absent (it is checked on every activity played).
function attributed(entry, activities) {
  const out = new Map();
  if (!isObject(entry)) return out;
  for (const id of activities) {
    const own = {};
    if (isObject(entry.saveDamage) && Object.hasOwn(entry.saveDamage, id)) own.saveDamage = { [id]: entry.saveDamage[id] };
    if (Array.isArray(entry.noDamage) && entry.noDamage.includes(id)) own.noDamage = [id];
    for (const c of impliedAsserts(own)) out.set(c, new Set([...(out.get(c) ?? []), id]));
  }
  return out;
}

/**
 * The scenario of a reviewed record: `{ scenario, key, rule, origin, client: "gm", manual, manualBecause, setup, steps }`.
 * `setup.item` is the official item (else the first origin the rule names) by docId, with its compendium uuid when `packOf`
 * (docId → "<package>.<pack>", from the dumps) knows it; `setup.target` an SRD 2024 creature of the type the assertions name.
 * `steps`, per activity the entry names (each one the rule's fingerprint covers) and per assertion checked on it: `{ use:
 * <activity id> }`, `{ force: <roll> }` when it has one, `{ advance: <moment> }` when it has one, `{ check: <canonical
 * assertion> }`; `checks` the number of checks the run makes when every assertion holds. `manual` when a step has no
 * interpreter; `manualBecause` names which (paths only).
 */
export function scenarioOf(record, { packOf } = {}) {
  const rule = record.rule ?? {};
  const origins = Array.isArray(rule.origins) ? rule.origins : [];
  const origin = origins.includes("official") ? "official" : origins[0] ?? null;
  const item = (record.items ?? []).find((i) => i?.origin === origin && i.match === "matched") ?? null;
  const pack = item && origin === "official" && typeof packOf === "function" ? packOf(item.docId) : null;
  const because = new Set();
  const setupItem = { origin, docId: item?.docId ?? null, uuid: pack ? `Compendium.${pack}.Item.${item.docId}` : null,
    kind: record.kind };
  if (!setupItem.uuid) because.add("setup.item");
  // The activities played: every id of the entry that is an activity of the item (the rule's fingerprint covers all of them),
  // else the item's only activity.
  const activities = Array.isArray(item?.activities) ? item.activities : [];
  const named = [...new Set(idsOf(rule.entry).filter((id) => activities.includes(id)))];
  const played = named.length ? named : activities.length === 1 ? [activities[0]] : [];
  if (!played.length) because.add("use");
  const checks = checksOf(rule);
  if (!checks.length) because.add("check");
  const tied = attributed(rule.entry, played);
  const types = new Set();
  const steps = [];
  let expected = 0;
  for (const activity of played) {
    for (const c of checks) {
      // An assertion the entry ties to some activities is checked on those; one it ties to none, on each.
      if (tied.has(c) && !tied.get(c).has(activity)) continue;
      const a = assertionOfCanonical(c) ?? { given: {}, expect: { unreadable: true } };
      if (Object.hasOwn(a.given, "targetType")) types.add(a.given.targetType);
      for (const why of uninterpreted(a, origin)) because.add(why);
      steps.push({ use: activity });
      if (Object.hasOwn(a.given, "roll")) steps.push({ force: a.given.roll });
      if (Object.hasOwn(a.given, "moment")) { steps.push({ advance: a.given.moment }); because.add("advance"); }
      steps.push({ check: c });
      expected += expectsOf(a);
    }
  }
  // One target per scenario: assertions about two creature types are two plays, which a person runs.
  if (types.size > 1) because.add("given.targetType");
  const type = types.size === 1 ? [...types][0] : DEFAULT_TARGET;
  const manualBecause = [...because].sort();
  return {
    scenario: scenarioIdOf(record), key: record.key, rule: ruleFingerprint(record.rule), origin, client: "gm",
    manual: manualBecause.length > 0, manualBecause, checks: expected,
    setup: { scene: ARENA.scene, caster: ARENA.caster, near: ARENA.near, item: setupItem,
      target: { actor: TARGETS[type] ?? TARGETS[DEFAULT_TARGET], type } },
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
 * each family, then the others, each part by key. Rows `{ order, scenario, key, family, first, manual, state }`.
 */
export function planOf(records, { packOf } = {}) {
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
    order: i + 1, scenario: scenarioIdOf(r), key: r.key, family, first: isFirst, manual: scenarioOf(r, { packOf }).manual,
    state: stateOf(r)
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
