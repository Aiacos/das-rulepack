// Loads what the gates need from a clone of DAS · Core: the validator, the data-fix helpers, the fact names, the table of
// identifiers the engine already has an entry for, its entry keys and its vocabulary. Nothing here writes to the clone.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const MIN_FACTS = 60;

const FACT_KEY = /^\s+"([A-Za-z]+\.[A-Za-z]+)"\s*:/gm;

/**
 * The fact names of `adapter/facts.mjs`. The file needs Foundry globals, so it is read as text: the keys of the object that
 * `factsFor` returns, one per line (comments that quote a key are not on a line of their own).
 */
export function factNames(source) {
  const start = source.indexOf("export function factsFor");
  if (start < 0) throw new Error("adapter/facts.mjs: factsFor was not found");
  return [...new Set([...source.slice(start).matchAll(FACT_KEY)].map((m) => m[1]))];
}

const CONDITIONS = /\bconst CONDITIONS\s*=\s*\[([^\]]*)\]/;
export const MIN_STATUSES = 10;

/**
 * The statuses (conditions) the engine names: `core/monster-text.mjs` lists them in a module-private CONDITIONS array, so it
 * is read as text, as the facts are. The engine has no exported closed list of statuses.
 */
export function statusNames(source) {
  const m = source.match(CONDITIONS);
  if (!m) throw new Error("core/monster-text.mjs: CONDITIONS was not found");
  return [...new Set([...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]))];
}

const load = (dir, path) => import(pathToFileURL(join(dir, "module", "scripts", path)).href);

/**
 * The words of the engine's schema: every string of the exported enumerations of the given modules (an array's strings, a
 * Set's strings, an object's keys), and every fact name with its dot-separated segments. The ids gate never takes one of
 * these words for a document id.
 */
export function vocabularyOf(modules, facts) {
  const words = new Set();
  const addAll = (list) => { for (const w of list) if (typeof w === "string") words.add(w); };
  for (const mod of modules) {
    for (const value of Object.values(mod)) {
      if (Array.isArray(value) || value instanceof Set) addAll(value);
      else if (value !== null && typeof value === "object") addAll(Object.keys(value));
    }
  }
  for (const fact of facts) addAll([fact, ...fact.split(".")]);
  return words;
}

export async function loadCore(dir) {
  const files = [
    "core/content.mjs", "core/content/enums.mjs", "core/triggers.mjs", "core/data-fixes.mjs", "content/index.mjs",
    "adapter/facts.mjs", "core/eligibility.mjs", "core/monster-text.mjs", "../module.json"
  ];
  for (const f of files) {
    if (!existsSync(join(dir, "module", "scripts", f))) throw new Error(`DAS_CORE ${dir}: module/scripts/${f} is missing`);
  }
  const { validateEntry } = await load(dir, "core/content.mjs");
  const { matchesFrom, getPath } = await load(dir, "core/data-fixes.mjs");
  const { SHIPPED, SRD_ALIASES } = await load(dir, "content/index.mjs");
  if (typeof validateEntry !== "function" || typeof matchesFrom !== "function" || typeof getPath !== "function") {
    throw new Error(`DAS_CORE ${dir}: validateEntry, matchesFrom or getPath is not exported`);
  }
  if (!SHIPPED || typeof SHIPPED !== "object") throw new Error(`DAS_CORE ${dir}: content/index.mjs does not export SHIPPED`);

  const facts = factNames(readFileSync(join(dir, "module", "scripts", "adapter", "facts.mjs"), "utf8"));
  if (facts.length < MIN_FACTS) {
    throw new Error(`DAS_CORE ${dir}: only ${facts.length} facts found, expected at least ${MIN_FACTS}`);
  }

  const { version } = JSON.parse(readFileSync(join(dir, "module", "module.json"), "utf8"));
  if (typeof version !== "string" || !version) {
    throw new Error(`DAS_CORE ${dir}: module.json has no version`);
  }

  const enums = await load(dir, "core/content/enums.mjs");
  const triggers = await load(dir, "core/triggers.mjs");
  if (!Array.isArray(enums.ENTRY_KEYS) || !enums.ENTRY_KEYS.length) {
    throw new Error(`DAS_CORE ${dir}: core/content/enums.mjs does not export ENTRY_KEYS`);
  }
  if (!triggers.MOMENTS || typeof triggers.MOMENTS !== "object") {
    throw new Error(`DAS_CORE ${dir}: core/triggers.mjs does not export MOMENTS`);
  }
  const entryKeys = new Set(enums.ENTRY_KEYS);
  // The enumerations rule assertions are checked against (assert.mjs).
  const { CREATURE_TYPES } = await load(dir, "core/eligibility.mjs");
  const statuses = statusNames(readFileSync(join(dir, "module", "scripts", "core", "monster-text.mjs"), "utf8"));
  if (statuses.length < MIN_STATUSES) throw new Error(`DAS_CORE ${dir}: only ${statuses.length} statuses found`);
  const lists = { creatureTypes: CREATURE_TYPES, moveModes: enums.MOVE_MODES, effectEnds: enums.EFFECT_ENDS,
    damageTypes: enums.DAMAGE_TYPES, abilities: enums.ABILITIES };
  for (const [name, value] of Object.entries(lists)) {
    if (!Array.isArray(value) || !value.length) throw new Error(`DAS_CORE ${dir}: the engine does not export ${name}`);
  }
  if (!Array.isArray(enums.STEP_TYPES) || !enums.STEP_TYPES.length) {
    throw new Error(`DAS_CORE ${dir}: core/content/enums.mjs does not export STEP_TYPES`);
  }
  const moments = Object.keys(triggers.MOMENTS);
  const vocabulary = vocabularyOf([enums, triggers], facts);

  const aliases = SRD_ALIASES ?? {};
  const identifiers = new Set([...Object.keys(SHIPPED), ...Object.keys(aliases), ...Object.values(aliases)]);
  return {
    validateEntry, facts, matchesFrom, getPath, version, identifiers, entryKeys, vocabulary, moments, statuses, shipped: SHIPPED,
    stepTypes: [...enums.STEP_TYPES],
    creatureTypes: [...lists.creatureTypes], moveModes: [...lists.moveModes], effectEnds: [...lists.effectEnds],
    damageTypes: [...lists.damageTypes], abilities: [...lists.abilities]
  };
}
