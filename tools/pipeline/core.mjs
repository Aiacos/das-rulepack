// Loads what the gates need from a clone of DAS · Core: the validator, the data-fix helpers, the fact names, the table of
// identifiers the engine already has an entry for, those it handles outside the table (core-scan.mjs), its entry keys and its
// vocabulary; and (Ruling R30) the facts a condition may name with the subject and argument kind of each (core/recipes.mjs
// FACTS) and the closed value lists of those arguments (FACT_ARG_OPTIONS); and (Ruling R33) the moments of an emanation
// (core/emanation.mjs EMANATION_MOMENTS), who an aura's copy goes to (AURA_AFFECTS) and the fields the zone and aura validators
// accept (`zoneFields`, read from their own lists); and (Ruling R34) the words of a choice (core/content/enums.mjs
// CHOICE_EFFECTS) and the fields the choice, barrier, globe and wardsConditions validators accept (`wardFields`); and (Ruling
// R35) whether its `validateSources` accepts `<actor id>.<item id>` keys (`actorItemSources`); and (Ruling R37) whether it
// knows the entry key `saveAutoFail` (`saveAutoFail`); and (Ruling R38) the fields the reactions, teleport and light
// validators accept (`reactionFields`), the fields of a step type and of a declaration (`stepFields`, `declarationFields`)
// and the steps allowed with a reaction at a hit (`hitWindowSteps`). Nothing here writes to the clone.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { locator, readEngineScripts, scanRuntime, scanSystemHandled } from "./core-scan.mjs";

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

// The quoted words of the first `[...]` list that follows `anchor` in `source` and matches `pattern` (a closing piece of
// code: `].includes(key)`), or null when the anchor or the list is not found.
function listAfter(source, anchor, pattern) {
  const start = source.indexOf(anchor);
  if (start < 0) return null;
  const m = source.slice(start).match(pattern);
  return m ? [...m[1].matchAll(/"([A-Za-z]+)"/g)].map((x) => x[1]) : null;
}
/**
 * Ruling R33: the fields and words the engine's validators of the zone and aura keys accept, read as text from their own
 * lists (core/content/steps.mjs validateAura, annex.mjs validateEmanation, entry.mjs `saveAutoSuccess`, `selfZone`,
 * `zoneAffects`): `{ aura, emanation, emanationAffects, saveAutoSuccess, templateTypes, zoneAffects }`, or null when one of
 * them is not found (a test then fails: the pack's shapes were checked against lists the engine no longer writes so).
 */
export function zoneFieldsOf({ steps, annex, entry }) {
  const out = {
    aura: listAfter(steps, "export function validateAura", /\[([^\]]*)\]\.includes\(key\)/),
    emanation: listAfter(annex, "export function validateEmanation", /\[([^\]]*)\]\.includes\(key\)/),
    emanationAffects: listAfter(annex, "export function validateEmanation", /"affects" in e\) && !\[([^\]]*)\]/),
    saveAutoSuccess: listAfter(entry, '"saveAutoSuccess" in entry', /const keys = \[([^\]]*)\]/),
    templateTypes: listAfter(entry, '"selfZone" in entry', /\[([^\]]*)\]\.includes\(t\.type\)/),
    zoneAffects: listAfter(entry, '("zoneAffects" in entry)', /\[([^\]]*)\]\.includes\(entry\.zoneAffects\)/)
  };
  return Object.values(out).every((v) => Array.isArray(v) && v.length) ? out : null;
}

/**
 * Ruling R34: the fields the engine's validators of the choice, barrier, globe and wardsConditions keys accept, read as text
 * from their own lists (core/content/annex.mjs validateChoice, extras.mjs `barrier` and `globe`, entry.mjs
 * `wardsConditions`): `{ choice, globe, barrier, wardsConditions }`, or null when one of them is not found (a test then
 * fails: the pack's shapes were checked against lists the engine no longer writes so).
 */
export function wardFieldsOf({ annex, extras, entry }) {
  const out = {
    choice: listAfter(annex, "export function validateChoice", /\[([^\]]*)\]\.includes\(key\)/),
    globe: listAfter(extras, '("globe" in entry)', /Object\.keys\(entry\.globe\)\.every\(k => \[([^\]]*)\]/),
    barrier: listAfter(extras, '("barrier" in entry)', /Object\.keys\(entry\.barrier\)\.every\(k => \[([^\]]*)\]/),
    wardsConditions: listAfter(entry, '"wardsConditions" in entry', /\[([^\]]*)\]\.includes\(k\)/)
  };
  return Object.values(out).every((v) => Array.isArray(v) && v.length) ? out : null;
}

/**
 * Ruling R38: the fields the engine's validators of the `reactions`, `teleport` and `light` keys accept, read as text from
 * their own lists (core/content/entry.mjs `reactions`, annex.mjs validateTeleport and validateLight: the loop over the
 * value's own keys, not an inner one), and the anchors a light may have (core/light.mjs LIGHT_ON): `{ reactions, teleport,
 * light, lightOn }`, or null when one is not found (a test then fails).
 */
export function reactionFieldsOf({ entry, annex, light }) {
  const out = {
    reactions: listAfter(entry, '("reactions" in entry)', /\[([^\]]*)\]\.includes\(k\)/),
    teleport: listAfter(annex, "export function validateTeleport",
      /Object\.keys\(teleport\)\s*\)\s*\{?\s*if \( !\[([^\]]*)\]\.includes\(key\)/),
    light: listAfter(annex, "export function validateLight", /Object\.keys\(l\)\s*\)\s*\{?\s*if \( !\[([^\]]*)\]\.includes\(key\)/),
    lightOn: listAfter(light, "export const LIGHT_ON", /\[([^\]]*)\]/)
  };
  return Object.values(out).every((v) => Array.isArray(v) && v.length) ? out : null;
}

// The body of one function of a source text: from its declaration to the next top-level `function`, or null.
function bodyOf(source, name) {
  const start = String(source ?? "").search(new RegExp(`\\bfunction ${name}\\(`));
  if (start < 0) return null;
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:export )?function /);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}
const fieldsIn = (line, into) => {
  for (const m of line.matchAll(/"(\w+)" in step\b/g)) into.add(m[1]);
  for (const m of line.matchAll(/\bstep\.(\w+)/g)) if (m[1] !== "type") into.add(m[1]);
};
/**
 * Ruling R38: the fields of one step type the engine's validateStep reads (core/content/steps.mjs), as text. The body is cut
 * into statements (lines joined until one ends with `;`, `{` or `}`); a statement belongs to the step types it names
 * (`step.type === "<type>"`, or a quoted list that `.includes(step.type)`), else to those of the block it sits in (a block
 * opened by a statement that names types, such as `if ( step.type === "damage" ) {`); a statement under no type at all
 * reads a field of every step (`margin`). Its fields: `"<field>" in step` and `step.<field>`. Sorted; null when validateStep
 * is not found.
 */
export function stepFieldsOf(source, type) {
  const body = bodyOf(source, "validateStep");
  if (body === null) return null;
  const statements = [];
  let pending = "";
  for (const line of body.split("\n").slice(1)) {
    pending += ` ${line.trim()}`;
    if (/[;{}]$/.test(line.trim())) { statements.push(pending); pending = ""; }
  }
  const own = new Set();
  const common = new Set();
  const stack = [];
  for (const statement of statements) {
    const named = [...statement.matchAll(/step\.type === "(\w+)"/g)].map((m) => m[1]);
    const listed = [...statement.matchAll(/\[([^\]]*)\]\.includes\(step\.type\)/g)]
      .flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]));
    const inner = [...stack].reverse().find((t) => t !== null) ?? null;
    const types = named.length || listed.length ? [...named, ...listed] : inner;
    if (types === null) { if (!/step\.type/.test(statement)) fieldsIn(statement, common); }
    else if (types.includes(type)) fieldsIn(statement, own);
    // Braces of code only: a template's `${…}` and a string's braces are left out.
    const code = statement.replace(/\$\{[^}]*\}/g, "").replace(/`[^`]*`|"[^"]*"/g, "");
    const delta = (code.match(/\{/g) ?? []).length - (code.match(/\}/g) ?? []).length;
    for (let i = 0; i < delta; i++) stack.push(types);
    for (let i = 0; i > delta; i--) stack.pop();
  }
  return [...new Set([...own, ...common])].sort();
}
/**
 * Ruling R38: the fields of a `triggers` declaration the engine reads (core/content/steps.mjs validateTrigger, as text):
 * `on`, `if`, `do`, `via` (its canonical form) and every `"<field>" in declaration` it tests. Sorted; null when not found.
 */
export function declarationFieldsOf(source) {
  const body = bodyOf(source, "validateTrigger");
  if (body === null) return null;
  const out = new Set(["on", "if", "do", "via"]);
  for (const m of body.matchAll(/"(\w+)" in declaration\b/g)) out.add(m[1]);
  return [...out].sort();
}
/**
 * Ruling R38: the step types the engine allows only with a reaction at a hit (core/content/steps.mjs validateTrigger: the
 * quoted list checked against HIT_WINDOWS), or null when not found.
 */
export function hitWindowStepsOf(source) {
  const m = String(source ?? "").match(/\[([^\]]*)\]\.includes\(s\.type\)[^\n]*HIT_WINDOWS/);
  return m ? [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]) : null;
}

// Ruling R35: a key of two document ids, `<actor id>.<item id>`, that binds one creature's embedded feature. Invented ids.
const ACTOR_ITEM_PROBE = "Pr0bePr0bePr0beA.Pr0bePr0bePr0beI";

/**
 * Ruling R35: whether the engine's own `validateSources` accepts an `<actor id>.<item id>` key (it returns its errors, an empty
 * list for a valid table). Asked of the engine itself, never inferred from its version (the capability came without one).
 * False when the function is missing, throws or answers anything but an empty list.
 */
export function actorItemSourcesOf(validateSources) {
  if (typeof validateSources !== "function") return false;
  try {
    const errors = validateSources({ [ACTOR_ITEM_PROBE]: "probe" });
    return Array.isArray(errors) && errors.length === 0;
  } catch {
    return false;
  }
}

/**
 * Ruling R37: whether the engine knows the entry key `saveAutoFail` (a creature of those types fails the save): it is one of
 * its ENTRY_KEYS and its own validateEntry accepts `{ saveAutoFail: { types: [<its first creature type>] } }`. Asked of the
 * engine itself, never inferred from its version (its latest release predates the key). False when anything is missing,
 * throws or refuses.
 */
export function saveAutoFailOf({ entryKeys, validateEntry, creatureTypes } = {}) {
  if (!(entryKeys instanceof Set) || !entryKeys.has("saveAutoFail") || typeof validateEntry !== "function") return false;
  if (!Array.isArray(creatureTypes) || typeof creatureTypes[0] !== "string") return false;
  try {
    const errors = validateEntry({ saveAutoFail: { types: [creatureTypes[0]] } }, { facts: {} });
    return Array.isArray(errors) && errors.length === 0;
  } catch {
    return false;
  }
}

export async function loadCore(dir) {
  const files = [
    "core/content.mjs", "core/content/enums.mjs", "core/triggers.mjs", "core/data-fixes.mjs", "content/index.mjs",
    "adapter/facts.mjs", "core/eligibility.mjs", "core/monster-text.mjs", "core/recipes.mjs", "../module.json"
  ];
  for (const f of files) {
    if (!existsSync(join(dir, "module", "scripts", f))) throw new Error(`DAS_CORE ${dir}: module/scripts/${f} is missing`);
  }
  const { validateEntry, mergeEntries, validateSources } = await load(dir, "core/content.mjs");
  const { matchesFrom, getPath } = await load(dir, "core/data-fixes.mjs");
  const { SHIPPED, SRD_ALIASES, SOURCES } = await load(dir, "content/index.mjs");
  // Ruling R29: the engine's own reading of a monster feature (its pure text layer) and its merge of entry layers. Optional
  // here: an engine without them still gates; engine-reading.mjs says clearly that it cannot read when they are missing.
  const layer = existsSync(join(dir, "module", "scripts", "core", "monster-layer.mjs"))
    ? await load(dir, "core/monster-layer.mjs") : {};
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
  // Ruling R30: the engine's condition facts (`{ subject, arg }` each) and the closed lists of their arguments.
  const recipes = await load(dir, "core/recipes.mjs");
  const factKinds = factKindsOf(recipes.FACTS);
  const options = recipes.FACT_ARG_OPTIONS ?? {};
  const argLists = { sizes: options.size, activityTypes: options.activityType, distanceUnits: options.units };
  for (const [name, value] of Object.entries(argLists)) {
    if (!Array.isArray(value) || !value.length) throw new Error(`DAS_CORE ${dir}: core/recipes.mjs does not give ${name}`);
  }
  const moments = Object.keys(triggers.MOMENTS);
  // Ruling R33: optional here (an engine without them still gates; the zone tests fail on it).
  const emanation = existsSync(join(dir, "module", "scripts", "core", "emanation.mjs"))
    ? await load(dir, "core/emanation.mjs") : {};
  const emanationMoments = Array.isArray(emanation.EMANATION_MOMENTS) ? [...emanation.EMANATION_MOMENTS] : [];
  const auraAffects = Array.isArray(enums.AURA_AFFECTS) ? [...enums.AURA_AFFECTS] : [];
  let zoneFields;
  const readZoneFields = () => {
    if (zoneFields === undefined) {
      const text = (f) => {
        const path = join(dir, "module", "scripts", "core", "content", f);
        return existsSync(path) ? readFileSync(path, "utf8") : "";
      };
      zoneFields = zoneFieldsOf({ steps: text("steps.mjs"), annex: text("annex.mjs"), entry: text("entry.mjs") });
    }
    return zoneFields;
  };
  // Ruling R34: the same for the choice, barrier and ward keys (the ward tests fail when they are missing).
  const choiceEffects = Array.isArray(enums.CHOICE_EFFECTS) ? [...enums.CHOICE_EFFECTS] : [];
  let wardFields;
  const readWardFields = () => {
    if (wardFields === undefined) {
      const text = (f) => {
        const path = join(dir, "module", "scripts", "core", "content", f);
        return existsSync(path) ? readFileSync(path, "utf8") : "";
      };
      wardFields = wardFieldsOf({ annex: text("annex.mjs"), extras: text("extras.mjs"), entry: text("entry.mjs") });
    }
    return wardFields;
  };
  // Ruling R38: the reaction, teleport and light field lists, and the step and declaration fields of validateStep and
  // validateTrigger (the reaction tests fail when they are missing).
  const contentText = (f) => {
    const path = join(dir, "module", "scripts", "core", "content", f);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  };
  const lightPath = join(dir, "module", "scripts", "core", "light.mjs");
  let reactionFields;
  const readReactionFields = () => {
    if (reactionFields === undefined) {
      reactionFields = reactionFieldsOf({ entry: contentText("entry.mjs"), annex: contentText("annex.mjs"),
        light: existsSync(lightPath) ? readFileSync(lightPath, "utf8") : "" });
    }
    return reactionFields;
  };
  const stepsText = contentText("steps.mjs");
  const vocabulary = vocabularyOf([enums, triggers], facts);

  const aliases = SRD_ALIASES ?? {};
  const identifiers = new Set([...Object.keys(SHIPPED), ...Object.keys(aliases), ...Object.values(aliases)]);
  // What the engine handles outside its table (core-scan.mjs), each identifier with the files and lines that say so: for the
  // triage pre-pass and its report. `handled` is all three: a rule under any of them would stack on what the engine (or the
  // system, for what the engine leaves to it) already does, so the unique gate and `batch draft` hold it like a table one.
  // The scan reads every script of the engine: done once, and only by a command that asks for one of them.
  let scan = null;
  const scanned = () => {
    if (!scan) {
      const scripts = readEngineScripts(dir);
      const runtimeIdentifiers = scanRuntime(scripts);
      const systemHandled = scanSystemHandled(scripts);
      scan = {
        runtimeIdentifiers, systemHandled, locate: locator(scripts, runtimeIdentifiers, systemHandled),
        handled: new Set([...identifiers, ...runtimeIdentifiers.keys(), ...systemHandled.keys()])
      };
    }
    return scan;
  };
  return {
    validateEntry, facts, matchesFrom, getPath, version, identifiers, entryKeys, vocabulary, moments, statuses, shipped: SHIPPED,
    monsterTextLayer: typeof layer.monsterTextLayer === "function" ? layer.monsterTextLayer : null,
    mergeEntries: typeof mergeEntries === "function" ? mergeEntries : null,
    sources: SOURCES && typeof SOURCES === "object" ? { ...SOURCES } : {},
    // Ruling R35: the engine accepts `<actor id>.<item id>` sources from a module (actorItemSourcesOf).
    actorItemSources: actorItemSourcesOf(validateSources),
    // Ruling R37: the engine knows the entry key `saveAutoFail` (saveAutoFailOf).
    saveAutoFail: saveAutoFailOf({ entryKeys, validateEntry, creatureTypes: lists.creatureTypes }),
    get runtimeIdentifiers() { return scanned().runtimeIdentifiers; },
    get systemHandled() { return scanned().systemHandled; },
    get handled() { return scanned().handled; },
    get locate() { return scanned().locate; },
    stepTypes: [...enums.STEP_TYPES],
    creatureTypes: [...lists.creatureTypes], moveModes: [...lists.moveModes], effectEnds: [...lists.effectEnds],
    damageTypes: [...lists.damageTypes], abilities: [...lists.abilities],
    factKinds, sizes: [...argLists.sizes], activityTypes: [...argLists.activityTypes], distanceUnits: [...argLists.distanceUnits],
    emanationMoments, auraAffects, get zoneFields() { return readZoneFields(); },
    choiceEffects, get wardFields() { return readWardFields(); },
    get reactionFields() { return readReactionFields(); }, stepFields: (type) => stepFieldsOf(stepsText, type),
    declarationFields: declarationFieldsOf(stepsText), hitWindowSteps: hitWindowStepsOf(stepsText)
  };
}

/** The engine's condition facts as `{ <fact>: { subject, arg } }` (core/recipes.mjs FACTS), frozen; throws when malformed. */
export function factKindsOf(FACTS) {
  if (!FACTS || typeof FACTS !== "object" || !Object.keys(FACTS).length) {
    throw new Error("core/recipes.mjs does not export FACTS");
  }
  return Object.freeze(Object.fromEntries(Object.entries(FACTS).map(([name, f]) => {
    if (typeof f?.subject !== "string" || typeof f?.arg !== "string") throw new Error(`core/recipes.mjs FACTS: ${name} malformed`);
    return [name, Object.freeze({ subject: f.subject, arg: f.arg })];
  })));
}
