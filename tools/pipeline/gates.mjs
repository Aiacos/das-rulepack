// The deterministic gates a rule passes before it may ship. Every gate is a pure function of a record and a context:
//   context = { core, documents, textDir, ci, legacy }
//   core      what loadCore() returns (tests inject stand-ins of validateEntry, matchesFrom, getPath and vocabulary)
//   documents { [origin]: { [docId]: Foundry document } }, from the dumps, for the data-fix gate
//   textDir   the text cache; ci  true when the gates that need local inputs are replaced by the evidence on the record
//   legacy    legacy.json as a Map of record key to the fingerprint of its rule at migration (registry.mjs loadLegacy)
// A gate returns its failures as a string[]; the gates that can also say something that must not fail a run (a note) expose it
// through the matching check function, and runGates collects both.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonical, emittedFingerprint, evidenceIsCurrent, gatedItems, hasLegacyStanding, legacyProblem, ruleFingerprint, validateRecord
} from "./registry.mjs";
import { GATE_NAMES } from "./schema.mjs";
import { hasText, readText, splitWords } from "./text.mjs";
import { sourceProblems } from "./settle.mjs";
import { identifierProblems, reaches, SHARED_EMBEDDED, unaccountedOrigins } from "./identifiers.mjs";
import { checkDraftKeys, isStructural, singleSlotKeys } from "./draft-keys.mjs";
import { assertProblems } from "./assert.mjs";

export const GATES = GATE_NAMES;
// What stateOf requires in `passed` for a rule to count as gated.
const FULL_EVIDENCE = ["schema", "validator", "ids", "fixes", "text"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const ID = /^[A-Za-z0-9]{16}$/;

// What separates an id from its neighbours in a string: a path (`a.<id>.b`), an anchor (`#<id>`), a pair (`<id>/<id>`), a
// document link (`@UUID[Compendium.pkg.Item.<id>]{Name}`).
const SEGMENT = /[.#/[\]{}\s]+/;

/**
 * Every 16-character [A-Za-z0-9] token of the entry that is not a word of the engine's `vocabulary` (a Set, core.vocabulary):
 * a key, a string value, or a segment of either (split at ".", "#", "/", brackets, braces and spaces). Fails closed: a token
 * the engine does not name is an id.
 */
export function idsIn(entry, vocabulary = new Set()) {
  const found = new Set();
  const take = (s) => {
    // A path such as `system.activities.<id>.activation.type` names an id as one of its segments.
    for (const part of [s, ...s.split(SEGMENT)]) if (ID.test(part) && !vocabulary.has(part)) found.add(part);
  };
  const walk = (node) => {
    if (typeof node === "string") take(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (isObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        take(key);
        walk(value);
      }
    }
  };
  walk(entry);
  return [...found].sort();
}

// The entry of a rule is an object; anything else is reported by the gate that needed it.
function entryOf(rule) {
  const raw = rule?.entry;
  if (raw === undefined) return { entry: null };
  return isObject(raw) ? { entry: raw } : { error: "rule.entry is not an object" };
}

const originsOf = (rule) => (Array.isArray(rule?.origins) ? rule.origins : []);
// `legacy: true` counts only for a key that legacy.json lists with the fingerprint of the record's current rule.
const isLegacy = (record, context) => hasLegacyStanding(record, context?.legacy);
const matchedItems = (record, origin) => (record.items ?? []).filter((i) => i?.origin === origin && i.match === "matched");

// The structure of the record, and its `sources` (each must be a document of this record bound to its identifier).
// And the identifiers a ruled record registers (identifiers.mjs identifierProblems): from the record alone, so under --ci too.
// And what a drafter may write (draft-keys.mjs checkDraftKeys, Ruling R6), for every rule but a legacy one with standing,
// unless a person signed for it (`evidence.person`): from the record alone, so under --ci too.
export const gateSchema = (record, context) => {
  const errors = validateRecord(record);
  return [
    ...errors.map((e) => `schema: ${e}`), ...sourceProblems(record),
    ...(errors.length ? [] : identifierProblems(record).map((e) => `schema: ${e}`)),
    ...(errors.length ? [] : draftProblems(record, context).map((e) => `schema: ${e}`)),
    ...(errors.length ? [] : codeProblems(record, context))
  ];
};

// The owners who may sign `evidence.person` (docs/owners.json, `context.owners` in tests).
let OWNERS;
const ownersOf = (context) => {
  if (context?.owners) return context.owners;
  OWNERS ??= JSON.parse(readFileSync(join(REPO, "docs", "owners.json"), "utf8")).owners;
  return OWNERS;
};
/**
 * True when a person signed the record's rule as it is (Ruling R6): `evidence.person` by an owner, with the fingerprint of
 * the current rule. A signature of an earlier rule, or by anyone else, does not apply: the drafter limits do.
 */
function signedByOwner(record, context) {
  const p = record.evidence?.person;
  return isObject(p) && typeof p.rule === "string" && p.rule === ruleFingerprint(record.rule)
    && Array.isArray(ownersOf(context)) && ownersOf(context).includes(p.by);
}

// Ruling R18: the script a non-legacy code rule names is a file of the repository (`context.root`, default this checkout).
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
function codeProblems(record, context) {
  const code = record.rule?.code;
  if (typeof code !== "string" || isLegacy(record, context)) return [];
  return existsSync(join(context?.root ?? REPO, code)) ? [] : [`schema: rule.code: ${code} is not a file of the repository`];
}

// The drafter limits of a ruled record's entry, or []: a legacy record with standing predates them, and a person may write
// any key once they sign `evidence.person` (schema-checked, visible to review).
function draftProblems(record, context) {
  const entry = record.rule?.entry;
  if (!isObject(entry) || isLegacy(record, context) || signedByOwner(record, context)) return [];
  return checkDraftKeys(entry, { origins: originsOf(record.rule), kind: record.kind });
}

export function gateValidator(record, { core }) {
  if (!record.rule) return [];
  // The rule's assertions, against the engine's enumerations (the schema gate checked their shape without them).
  const asserts = Array.isArray(record.rule.assert)
    ? assertProblems(record.rule.assert, {
      vocabulary: core, ...(Array.isArray(record.rule.origins) ? { origins: record.rule.origins } : {})
    }).map((e) => `validator: ${e}`) : [];
  const { entry, error } = entryOf(record.rule);
  if (error) return [`validator: ${error}`, ...asserts];
  if (!entry) return asserts;
  // The engine looks a fact up as a key of the object it is given.
  const facts = Object.fromEntries(core.facts.map((name) => [name, true]));
  try {
    return [...core.validateEntry(entry, { facts }).map((e) => `validator: ${e}`), ...asserts];
  } catch (e) {
    return [`validator: the engine threw on the entry: ${e.message}`, ...asserts];
  }
}

const uncoveredOf = (rule) => (Array.isArray(rule?.uncovered) ? rule.uncovered.map((u) => u?.origin) : []);

/**
 * The ids gate (Rulings R4, R5). Every id of the entry must be an activity or effect of the matched item of at least one origin
 * the rule names (the ids of several origins sit side by side), and every origin named must contribute one when the entry has
 * any. Every matched origin is either named or listed in `rule.uncovered`. The item of every origin named must be reached by
 * an identifier the rule registers (its own, a source, an alias), and a monster feature whose embedded item id is shared by
 * several creatures cannot be (the engine would need `<actor id>.<item id>` sources). A legacy record with standing is held
 * to the first rule only (its origins were written before uncovered origins and aliases existed).
 */
export function checkIds(record, context) {
  const out = { failures: [], notes: [] };
  if (!record.rule) return out;
  const { entry, error } = entryOf(record.rule);
  if (error) return { ...out, failures: [`ids: ${error}`] };
  // A code rule without an entry has no id to check: said so, and noted rather than passed.
  if (!entry) {
    if (record.rule.handledIn === "code") return { ...out, notes: ["ids: nothing to check (code rule without entry)"] };
    return { ...out, failures: ["ids: a table rule has no entry"] };
  }
  const ids = idsIn(entry, context?.core?.vocabulary);
  const origins = originsOf(record.rule);
  const legacy = isLegacy(record, context);
  if (!origins.length) out.failures.push("ids: rule names no origin");
  const owned = new Set();
  for (const origin of origins) {
    const items = matchedItems(record, origin);
    if (!items.length) {
      if (legacy) {
        if (!out.notes.includes("ids: no item data (legacy)")) out.notes.push("ids: no item data (legacy)");
      } else out.failures.push(`ids: no matched item for ${origin}`);
      continue;
    }
    const known = new Set(items.flatMap((i) => [...(i.activities ?? []), ...(i.effects ?? [])]));
    const mine = ids.filter((id) => known.has(id));
    for (const id of mine) owned.add(id);
    if (ids.length && !mine.length && !legacy) out.failures.push(`ids: ${origin} contributes no id`);
    for (const item of legacy ? [] : items) {
      if (item.embeddedShared) out.failures.push(`ids: ${SHARED_EMBEDDED}`);
      else if (!reaches(record, item)) {
        out.failures.push(`ids: ${origin} item identifier ${item.identifier} is not reached (no source, no alias)`);
      }
    }
    // Another official package that reprints the document without an id the entry uses: the entry would not fit that copy.
    // Only the official origin has reprints. A reprint with other ids and no usable list of what it lacks lacks every id.
    for (const item of origin === "official" ? items : []) {
      const excluded = new Set((item.reprintsExcluded ?? []).map((x) => x?.package));
      for (const r of item.reprints ?? []) {
        if (r?.sameIds !== false || excluded.has(r.package)) continue;
        const lacks = Array.isArray(r.missing) ? new Set(r.missing) : null;
        for (const id of mine) {
          if (!lacks || lacks.has(id)) out.failures.push(`ids: the reprint in ${r.package} has no activity or effect ${id}`);
        }
      }
    }
  }
  // An origin with no item already failed above: its ids are not blamed twice.
  if (origins.some((o) => matchedItems(record, o).length)) {
    for (const id of ids) if (!owned.has(id)) out.failures.push(`ids: ${id} belongs to no origin of the rule`);
  }
  // Ruling R4: a key whose slot holds one id (draft-keys.mjs, slot `single`) cannot carry the ids of two origins side by side.
  if (!legacy && origins.length > 1) {
    for (const key of singleSlotKeys(entry)) {
      if (idsIn(entry[key], context?.core?.vocabulary).length) {
        out.failures.push(`ids: ${key} holds one id: it may name one origin only (the others go in rule.uncovered)`);
      }
    }
  }
  // A rule that names no origin already failed: every matched origin would be blamed again.
  if (!legacy && origins.length) {
    const uncovered = uncoveredOf(record.rule);
    for (const origin of unaccountedOrigins(record)) {
      out.failures.push(`ids: ${origin} is matched but neither in origins nor uncovered`);
    }
    for (const origin of uncovered) {
      if (!matchedItems(record, origin).length) out.failures.push(`ids: ${origin} is uncovered but has no matched item`);
    }
  }
  return out;
}
export const gateIds = (record, context) => checkIds(record, context).failures;

const ACTIVITY_FIELD = /^system\.activities\.([A-Za-z0-9]{16})\./;

export function checkFixes(record, context = {}) {
  const { core, documents } = context;
  const out = { failures: [], notes: [] };
  if (!record.rule) return out;
  const { entry, error } = entryOf(record.rule);
  if (error) return { ...out, failures: [`fixes: ${error}`] };
  const fixes = entry?.dataFixes;
  if (fixes === undefined) return out;
  if (!Array.isArray(fixes)) return { ...out, failures: ["fixes: dataFixes is not an array"] };
  if (!fixes.length) return out;
  if (!originsOf(record.rule).length) return { ...out, failures: ["fixes: rule names no origin"] };
  const failures = new Set();
  const drift = (path) => failures.add(`fixes: drift at ${path}`);
  for (const origin of originsOf(record.rule)) {
    const items = matchedItems(record, origin);
    const docs = items.map((i) => documents?.[origin]?.[i.docId]).filter(Boolean);
    if (!docs.length) {
      if (isLegacy(record, context)) {
        if (!out.notes.includes("fixes: no item data (legacy)")) out.notes.push("fixes: no item data (legacy)");
      } else failures.add(`fixes: no document for ${origin}`);
      continue;
    }
    for (const doc of docs) {
      for (const fix of fixes) {
        if (!isObject(fix)) { drift(String(fix)); continue; }
        // An effect to create is a person's (Ruling R6): without their signature it fails, legacy with standing excepted.
        if ("create" in fix) {
          if (!isLegacy(record, context) && !signedByOwner(record, context)) failures.add("fixes: create goes to a person");
          continue;
        }
        if (typeof fix.path !== "string") { failures.add("fixes: a data fix has no string path"); continue; }
        let holder = doc;
        if (fix.effect !== undefined) {
          holder = (doc.effects ?? []).find((e) => e?._id === fix.effect);
          if (!holder) { drift(fix.path ?? `effect ${fix.effect}`); continue; }
        } else {
          const activity = String(fix.path).match(ACTIVITY_FIELD)?.[1];
          if (activity && !doc.system?.activities?.[activity]) { drift(fix.path); continue; }
        }
        const current = core.getPath(holder, fix.path);
        if (core.matchesFrom(current, fix.value)) continue; // already applied
        // Without `from`, nothing says what the fix expects: at least its path must be there (a mistyped one never applies).
        if (!("from" in fix)) {
          if (current === undefined) failures.add(`fixes: ${fix.path} does not exist`);
          continue;
        }
        if (core.matchesFrom(current, fix.from)) continue; // still applicable
        drift(fix.path);
      }
    }
  }
  return { ...out, failures: [...failures] };
}
export const gateFixes = (record, context) => checkFixes(record, context).failures;

export function checkText(record, context = {}) {
  const { textDir } = context;
  const out = { failures: [], notes: [] };
  if (record.text === null || record.text === undefined) {
    if (isLegacy(record, context)) out.notes.push("text: not fingerprinted (legacy)");
    else out.failures.push("text: the record has no text fingerprint");
    return out;
  }
  if (!textDir) return { ...out, failures: ["text: no text cache to look in"] };
  if (!hasText(textDir, record.text.sha256)) {
    out.failures.push(`text: ${record.text.sha256} is not in the text cache`);
    return out;
  }
  // The prose of a rule (`origin`, `adds`, the `free` of its assertions, the `because` of its uncovered origins) never quotes
  // its source, field by field nor all of it together (a quote split across fields). A legacy rule with standing predates the
  // check (its `adds` is held by its legacy fingerprint, and checking it would change its evidence): it is not held to it.
  if (!record.rule || isLegacy(record, context)) return out;
  const source = new Set(nGrams(wordsOf(readText(textDir, record.text.sha256)), RULE_QUOTE_WORDS));
  const quotes = (prose) => nGrams(wordsOf(prose), RULE_QUOTE_WORDS).some((g) => source.has(g));
  const prose = ruleProse(record.rule);
  for (const [where, value] of prose) {
    if (quotes(value)) out.failures.push(`text: ${where} quotes ${RULE_QUOTE_WORDS} or more consecutive words of the source text`);
  }
  if (!out.failures.length && prose.length > 1 && quotes(prose.map(([, v]) => v).join(" "))) {
    out.failures.push(`text: the rule's prose together quotes ${RULE_QUOTE_WORDS} or more consecutive words of the source text`);
  }
  return out;
}

// A rule's prose may share at most RULE_QUOTE_WORDS - 1 consecutive words with the text it was drafted from. Both sides are
// cut into words the same way (text.mjs splitWords: NFKC, camelCase and digit boundaries, lower case, any other character a
// separator), and the prose is every free text of the rule plus every string of its entry.
export const RULE_QUOTE_WORDS = 8;
const REFERENCE_ROOT = /@(?:mod|prof|item|abilities|attributes|details|scale|flags)\b/g;
const wordsOf = splitWords;
const nGrams = (words, n) => {
  const out = [];
  for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(" "));
  return out;
};
function ruleProse(rule) {
  if (!isObject(rule)) return [];
  const out = [["rule.origin", rule.origin], ["rule.adds", rule.adds]].filter(([, v]) => typeof v === "string");
  (Array.isArray(rule.assert) ? rule.assert : []).forEach((a, i) => {
    for (const part of ["given", "expect"]) {
      if (typeof a?.[part]?.free === "string") out.push([`rule.assert[${i}].${part}.free`, a[part].free]);
    }
  });
  (Array.isArray(rule.uncovered) ? rule.uncovered : []).forEach((u, i) => {
    if (typeof u?.because === "string") out.push([`rule.uncovered[${i}].because`, u.because]);
  });
  // And every string of the entry, keys and values, in document order (Ruling R19: identifiers are read as words too). A
  // string made only of structure (a key of the pack's vocabulary, an id, an allowed path) is left out, so that it does not
  // cut a quote carried by the strings around it.
  const walk = (node, at) => {
    if (typeof node === "string") {
      // The root of a formula reference (`@item.`, `@scale.`...) is structure too: it does not cut the words after it.
      if (!isStructural(node)) out.push([at, node.replace(REFERENCE_ROOT, " ")]);
    } else if (Array.isArray(node)) node.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (isObject(node)) {
      for (const [k, v] of Object.entries(node)) {
        if (!isStructural(k)) out.push([`${at} key ${k}`, k]);
        walk(v, `${at}.${k}`);
      }
    }
  };
  walk(rule.entry, "rule.entry");
  return out;
}
export const gateText = (record, context) => checkText(record, context).failures;

const norm = (id) => (typeof id === "string" ? id.trim().toLowerCase() : "");
// The identifiers a ruled record registers with the engine: its own and the aliases of its rule (Ruling R2).
const registeredBy = (record) =>
  [...new Set([norm(record.identifier), ...(record.rule?.alsoAs ?? []).map((a) => norm(a?.identifier))].filter(Boolean))];

// The groups of ruled records that share one identifier, aliases included. Only a record that has a rule registers an
// identifier with the engine, and two rules must never register one: binding `sources` does not make two entries one.
function duplicateGroups(records) {
  const byIdentifier = new Map();
  for (const record of records) {
    if (!isObject(record) || !record.rule) continue;
    for (const id of registeredBy(record)) byIdentifier.set(id, [...(byIdentifier.get(id) ?? []), record]);
  }
  return [...byIdentifier].filter(([, group]) => group.length > 1);
}

const uniqueMessage = (id, group) => `unique: ${group.map((r) => r.key).join(" and ")} share the identifier ${id}`;
const coreMessage = (record, id) => `unique: ${record.key}: ${id} is a DAS · Core identifier (an entry there would be patched`
  + " for every item of that name; set rule.inCore only on purpose)";

// A registered table is merged over the engine's entries identifier by identifier: a rule under one of the engine's
// identifiers patches the engine's entry, allowed only for its own identifier with `rule.inCore: true` (set by a person).
function coreCollisions(records, identifiers) {
  const out = [];
  if (!identifiers?.size) return out;
  for (const record of records) {
    if (!isObject(record) || !record.rule) continue;
    // `inCore` is a person's decision about the record's own identifier; an alias never patches an entry of the engine.
    const own = norm(record.identifier);
    for (const id of registeredBy(record)) {
      if (identifiers.has(id) && !(id === own && record.rule.inCore === true)) out.push([record, coreMessage(record, id)]);
    }
  }
  return out;
}

/**
 * Two ruled records that register one identifier (own or alias) would register one entry twice, always a failure; so is an
 * identifier or alias equal to a DAS · Core identifier (`core.identifiers`) without `rule.inCore`. Unruled records are ignored.
 */
export const gateUnique = (records, { core } = {}) => [
  ...duplicateGroups(records).map(([id, group]) => uniqueMessage(id, group)),
  ...coreCollisions(records, core?.identifiers).map(([, m]) => m)
];

const uniqueFailuresByKey = (records, core) => {
  const byKey = new Map();
  const add = (key, m) => byKey.set(key, [...(byKey.get(key) ?? []), m]);
  for (const [id, group] of duplicateGroups(records)) for (const { key } of group) add(key, uniqueMessage(id, group));
  for (const [record, m] of coreCollisions(records, core?.identifiers)) add(record.key, m);
  return byKey;
};

const trusted = (record) => {
  const gates = record.evidence?.gates;
  const passed = Array.isArray(gates?.passed) ? gates.passed : [];
  return evidenceIsCurrent(record, gates) && FULL_EVIDENCE.every((g) => passed.includes(g));
};

function ciEvidence(record, context) {
  if (trusted(record)) return { failures: [], notes: [] };
  if (isLegacy(record, context)) return { failures: [], notes: ["gates: no full evidence yet (legacy)"] };
  return { failures: ["gates: no current evidence for this rule: run npm run gates locally and commit the registry"], notes: [] };
}

/**
 * Runs the gates over every record. In `ci` mode only schema, validator and unique run, and the other gates are replaced by the
 * evidence a local run left on the record, which counts while its fingerprint is the rule's, its item fingerprints are those of
 * the record's matched items (`items`, per origin the rule names) and it lists every gate as passed.
 * `evidence.gates.passed` lists the gates that were checked and passed; a gate that only left a note is in `noted` instead.
 * @returns {{ failures: object, notes: object, updated: object[] }}
 */
export function runGates(records, context) {
  const failures = {};
  const notes = {};
  const unique = uniqueFailuresByKey(records, context.core);
  const add = (target, key, gate, list) => {
    if (list.length) ((target[key] ??= {})[gate] = list);
  };
  const updated = records.map((record, index) => {
    if (!isObject(record)) {
      add(failures, `record #${index}`, "schema", ["schema: record must be an object"]);
      return record;
    }
    const key = record.key;
    const run = (gate, result) => {
      add(failures, key, gate, result.failures ?? result);
      add(notes, key, gate, result.notes ?? []);
    };
    run("schema", gateSchema(record, context));
    const sound = !failures[key]?.schema;
    // Ruling R5 is not applied to a legacy record with standing (its origins predate `uncovered`): said, under a name that is
    // not a gate, so that its evidence (`passed`, `noted`) does not change.
    if (sound && record.rule && isLegacy(record, context)) {
      const notes = unaccountedOrigins(record)
        .map((o) => `coverage: ${o} is matched but neither in origins nor uncovered (legacy)`);
      run("coverage", { failures: [], notes });
    }
    const standing = legacyProblem(record, context.legacy);
    if (standing) run("legacy", [standing]);
    if (sound && record.rule) {
      run("validator", gateValidator(record, context));
      if (context.ci) run("gates", ciEvidence(record, context));
      else {
        run("ids", checkIds(record, context));
        run("fixes", checkFixes(record, context));
        run("text", checkText(record, context));
      }
    } else if (sound && record.text) run("text", context.ci ? [] : checkText(record, context));
    add(failures, key, "unique", unique.get(key) ?? []);

    if (!record.rule || context.ci) return record;
    const { gates, ...evidence } = record.evidence ?? {};
    if (failures[key]) return { ...record, evidence };
    const noted = GATES.filter((g) => notes[key]?.[g]);
    const passed = GATES.filter((g) => !noted.includes(g));
    const next = { core: context.core.version, rule: ruleFingerprint(record.rule), emits: emittedFingerprint(record), passed };
    if (noted.length) next.noted = noted;
    // The items checked, so that evidence never outlives a change of item (resolve, inventory or any other editor).
    const items = gatedItems(record);
    if (Object.keys(items).length) next.items = items;
    const keep = gates && canonical({ ...gates, at: null }) === canonical({ ...next, at: null });
    return { ...record, evidence: { ...evidence, gates: keep ? gates : { at: new Date().toISOString(), ...next } } };
  });
  return { failures, notes, updated };
}
