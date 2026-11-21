// The deterministic gates a rule passes before it may ship. Every gate is a pure function of a record and a context:
//   context = { core, documents, textDir, ci }
//   core      what loadCore() returns (tests inject stubs of validateEntry, matchesFrom and getPath)
//   documents { [origin]: { [docId]: Foundry document } }, from the dumps, for the data-fix gate
//   textDir   the text cache; ci  true when the gates that need local inputs are replaced by the evidence on the record
// A gate returns its failures as a string[]; the gates that can also say something that must not fail a run (a note) expose it
// through the matching check function, and runGates collects both.
import { canonical, ruleFingerprint, validateRecord } from "./registry.mjs";
import { hasText } from "./text.mjs";

export const GATES = Object.freeze(["schema", "validator", "ids", "fixes", "text", "unique"]);
const NEEDS_LOCAL_INPUTS = ["ids", "fixes", "text"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const ID = /^[A-Za-z0-9]{16}$/;
// Words of the entry schema and of its enumerations are 16 characters long now and then: a document id is random, so it is
// never all lowercase and never a camelCase word.
const WORD = /^[a-z]+([A-Z][a-z]+)*$/;
const isId = (s) => ID.test(s) && !WORD.test(s);

/** Every 16-character document id that appears as a key or as a string value anywhere in the entry. */
export function idsIn(entry) {
  const found = new Set();
  const walk = (node) => {
    if (typeof node === "string") {
      if (isId(node)) found.add(node);
    } else if (Array.isArray(node)) node.forEach(walk);
    else if (isObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (isId(key)) found.add(key);
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
const matchedItems = (record, origin) => (record.items ?? []).filter((i) => i?.origin === origin && i.match === "matched");

export const gateSchema = (record) => validateRecord(record).map((e) => `schema: ${e}`);

export function gateValidator(record, { core }) {
  if (!record.rule) return [];
  const { entry, error } = entryOf(record.rule);
  if (error) return [`validator: ${error}`];
  if (!entry) return [];
  // The engine looks a fact up as a key of the object it is given.
  const facts = Object.fromEntries(core.facts.map((name) => [name, true]));
  try {
    return core.validateEntry(entry, { facts }).map((e) => `validator: ${e}`);
  } catch (e) {
    return [`validator: the engine threw on the entry: ${e.message}`];
  }
}

export function checkIds(record) {
  const out = { failures: [], notes: [] };
  if (!record.rule) return out;
  const { entry, error } = entryOf(record.rule);
  if (error) return { ...out, failures: [`ids: ${error}`] };
  const ids = entry ? idsIn(entry) : [];
  const origins = originsOf(record.rule);
  if (ids.length && !origins.length) out.failures.push(`ids: the entry names ${ids.length} ids but rule.origins is empty`);
  for (const origin of origins) {
    const items = matchedItems(record, origin);
    if (!items.length) {
      if (record.legacy) {
        if (!out.notes.includes("ids: no item data (legacy)")) out.notes.push("ids: no item data (legacy)");
      } else out.failures.push(`ids: no matched item for ${origin}`);
      continue;
    }
    const known = new Set(items.flatMap((i) => [...(i.activities ?? []), ...(i.effects ?? [])]));
    for (const id of ids) if (!known.has(id)) out.failures.push(`ids: ${origin} has no activity or effect ${id}`);
  }
  return out;
}
export const gateIds = (record, context) => checkIds(record, context).failures;

const ACTIVITY_FIELD = /^system\.activities\.([A-Za-z0-9]{16})\./;

export function checkFixes(record, { core, documents } = {}) {
  const out = { failures: [], notes: [] };
  if (!record.rule) return out;
  const { entry, error } = entryOf(record.rule);
  if (error) return { ...out, failures: [`fixes: ${error}`] };
  const fixes = entry?.dataFixes;
  if (fixes === undefined) return out;
  if (!Array.isArray(fixes)) return { ...out, failures: ["fixes: dataFixes is not an array"] };
  const failures = new Set();
  const drift = (path) => failures.add(`fixes: drift at ${path}`);
  for (const origin of originsOf(record.rule)) {
    const items = matchedItems(record, origin);
    const docs = items.map((i) => documents?.[origin]?.[i.docId]).filter(Boolean);
    if (!docs.length) {
      if (record.legacy) {
        if (!out.notes.includes("fixes: no item data (legacy)")) out.notes.push("fixes: no item data (legacy)");
      } else failures.add(`fixes: no document for ${origin}`);
      continue;
    }
    for (const doc of docs) {
      for (const fix of fixes) {
        if (!isObject(fix)) { drift(String(fix)); continue; }
        if ("create" in fix) continue;
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
        if (!("from" in fix) || core.matchesFrom(current, fix.from)) continue; // still applicable
        drift(fix.path);
      }
    }
  }
  return { ...out, failures: [...failures] };
}
export const gateFixes = (record, context) => checkFixes(record, context).failures;

export function checkText(record, { textDir } = {}) {
  const out = { failures: [], notes: [] };
  if (record.text === null || record.text === undefined) {
    if (record.legacy) out.notes.push("text: not fingerprinted (legacy)");
    else out.failures.push("text: the record has no text fingerprint");
    return out;
  }
  if (!textDir) return { ...out, failures: ["text: no text cache to look in"] };
  if (!hasText(textDir, record.text.sha256)) out.failures.push(`text: ${record.text.sha256} is not in the text cache`);
  return out;
}
export const gateText = (record, context) => checkText(record, context).failures;

const identifierOfRecord = (record) => (typeof record?.identifier === "string" ? record.identifier.trim().toLowerCase() : "");
const bindsSources = (record) => isObject(record.sources) && Object.keys(record.sources).length > 0;

// The groups of records that share one canonical identifier, unless every one of them binds its own sources.
function duplicateGroups(records) {
  const byIdentifier = new Map();
  for (const record of records) {
    const id = identifierOfRecord(record);
    if (id) byIdentifier.set(id, [...(byIdentifier.get(id) ?? []), record]);
  }
  return [...byIdentifier].filter(([, group]) => group.length > 1 && !group.every(bindsSources));
}

const uniqueMessage = (id, group) => `unique: ${group.map((r) => r.key).join(" and ")} share the identifier ${id}`;

/** Two records with the same canonical identifier are one entry for the engine, unless every one of them binds its own sources. */
export const gateUnique = (records) => duplicateGroups(records).map(([id, group]) => uniqueMessage(id, group));

const uniqueFailuresByKey = (records) => {
  const byKey = new Map();
  for (const [id, group] of duplicateGroups(records)) {
    for (const { key } of group) byKey.set(key, [...(byKey.get(key) ?? []), uniqueMessage(id, group)]);
  }
  return byKey;
};

const trusted = (record) => {
  const gates = record.evidence?.gates;
  return gates && gates.rule === ruleFingerprint(record.rule) && NEEDS_LOCAL_INPUTS.every((g) => (gates.passed ?? []).includes(g));
};

function ciEvidence(record) {
  if (trusted(record)) return { failures: [], notes: [] };
  if (record.legacy && !record.evidence?.gates) return { failures: [], notes: ["gates: no evidence yet (legacy)"] };
  return { failures: ["gates: no current evidence for this rule: run npm run gates locally and commit the registry"], notes: [] };
}

/**
 * Runs the gates over every record. In `ci` mode only schema, validator and unique run, and the other gates are replaced by the
 * evidence a local run left on the record, which counts while its fingerprint is the rule's.
 * @returns {{ failures: object, notes: object, updated: object[] }}
 */
export function runGates(records, context) {
  const failures = {};
  const notes = {};
  const unique = uniqueFailuresByKey(records);
  const add = (target, key, gate, list) => {
    if (list.length) ((target[key] ??= {})[gate] = list);
  };
  const updated = records.map((record) => {
    const key = record?.key;
    const run = (gate, result) => {
      add(failures, key, gate, result.failures ?? result);
      add(notes, key, gate, result.notes ?? []);
    };
    run("schema", gateSchema(record));
    const sound = !failures[key]?.schema;
    if (sound && record.rule) {
      run("validator", gateValidator(record, context));
      if (context.ci) run("gates", ciEvidence(record));
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
    const next = { core: context.core.version, rule: ruleFingerprint(record.rule), passed: [...GATES] };
    const keep = gates && canonical({ ...gates, at: null }) === canonical({ ...next, at: null });
    return { ...record, evidence: { ...evidence, gates: keep ? gates : { at: new Date().toISOString(), ...next } } };
  });
  return { failures, notes, updated };
}
