// The deterministic gates a rule passes before it may ship. Every gate is a pure function of a record and a context:
//   context = { core, documents, textDir, ci, legacy }
//   core      what loadCore() returns (tests inject stand-ins of validateEntry, matchesFrom, getPath and vocabulary)
//   documents { [origin]: { [docId]: Foundry document } }, from the dumps, for the data-fix gate
//   textDir   the text cache; ci  true when the gates that need local inputs are replaced by the evidence on the record
//   legacy    legacy.json as a Map of record key to the fingerprint of its rule at migration (registry.mjs loadLegacy)
// A gate returns its failures as a string[]; the gates that can also say something that must not fail a run (a note) expose it
// through the matching check function, and runGates collects both.
import { canonical, hasLegacyStanding, legacyProblem, ruleFingerprint, validateRecord } from "./registry.mjs";
import { GATE_NAMES } from "./schema.mjs";
import { hasText } from "./text.mjs";

export const GATES = GATE_NAMES;
// What stateOf requires in `passed` for a rule to count as gated.
const FULL_EVIDENCE = ["schema", "validator", "ids", "fixes", "text"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const ID = /^[A-Za-z0-9]{16}$/;

/**
 * Every 16-character [A-Za-z0-9] token of the entry that is not a word of the engine's `vocabulary` (a Set, core.vocabulary):
 * a key, a string value, or a dot-separated segment of either. Fails closed: a token the engine does not name is an id.
 */
export function idsIn(entry, vocabulary = new Set()) {
  const found = new Set();
  const take = (s) => {
    // A path such as `system.activities.<id>.activation.type` names an id as one of its segments.
    for (const part of [s, ...s.split(".")]) if (ID.test(part) && !vocabulary.has(part)) found.add(part);
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
  if (!origins.length) out.failures.push("ids: rule names no origin");
  for (const origin of origins) {
    const items = matchedItems(record, origin);
    if (!items.length) {
      if (isLegacy(record, context)) {
        if (!out.notes.includes("ids: no item data (legacy)")) out.notes.push("ids: no item data (legacy)");
      } else out.failures.push(`ids: no matched item for ${origin}`);
      continue;
    }
    const known = new Set(items.flatMap((i) => [...(i.activities ?? []), ...(i.effects ?? [])]));
    for (const id of ids) if (!known.has(id)) out.failures.push(`ids: ${origin} has no activity or effect ${id}`);
    // Another official package that reprints the document without an id the entry uses: the entry would not fit that copy.
    for (const item of items) {
      const excluded = new Set((item.reprintsExcluded ?? []).map((x) => x?.package));
      for (const r of item.reprints ?? []) {
        if (r?.sameIds !== false || excluded.has(r.package)) continue;
        for (const id of ids) {
          if ((r.missing ?? []).includes(id)) out.failures.push(`ids: the reprint in ${r.package} has no activity or effect ${id}`);
        }
      }
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
        if ("create" in fix) continue;
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
        if (!("from" in fix) || core.matchesFrom(current, fix.from)) continue; // still applicable
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
  if (!hasText(textDir, record.text.sha256)) out.failures.push(`text: ${record.text.sha256} is not in the text cache`);
  return out;
}
export const gateText = (record, context) => checkText(record, context).failures;

const identifierOfRecord = (record) => (typeof record?.identifier === "string" ? record.identifier.trim().toLowerCase() : "");
const bindsSources = (record) => isObject(record.sources) && Object.keys(record.sources).length > 0;

// The groups of records that share one canonical identifier, unless every one of them binds its own sources. Only a record that
// has a rule registers an identifier with the engine, so only those are grouped.
function duplicateGroups(records) {
  const byIdentifier = new Map();
  for (const record of records) {
    if (!isObject(record) || !record.rule) continue;
    const id = identifierOfRecord(record);
    if (id) byIdentifier.set(id, [...(byIdentifier.get(id) ?? []), record]);
  }
  return [...byIdentifier].filter(([, group]) => group.length > 1 && !group.every(bindsSources));
}

const uniqueMessage = (id, group) => `unique: ${group.map((r) => r.key).join(" and ")} share the identifier ${id}`;

/**
 * Two ruled records with the same canonical identifier are one entry for the engine, unless every one of them binds its own
 * sources. Records without a rule register nothing and are ignored.
 */
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
  const passed = Array.isArray(gates?.passed) ? gates.passed : [];
  return !!gates && gates.rule === ruleFingerprint(record.rule) && FULL_EVIDENCE.every((g) => passed.includes(g));
};

function ciEvidence(record, context) {
  if (trusted(record)) return { failures: [], notes: [] };
  if (isLegacy(record, context)) return { failures: [], notes: ["gates: no full evidence yet (legacy)"] };
  return { failures: ["gates: no current evidence for this rule: run npm run gates locally and commit the registry"], notes: [] };
}

/**
 * Runs the gates over every record. In `ci` mode only schema, validator and unique run, and the other gates are replaced by the
 * evidence a local run left on the record, which counts while its fingerprint is the rule's and it lists every gate as passed.
 * `evidence.gates.passed` lists the gates that were checked and passed; a gate that only left a note is in `noted` instead.
 * @returns {{ failures: object, notes: object, updated: object[] }}
 */
export function runGates(records, context) {
  const failures = {};
  const notes = {};
  const unique = uniqueFailuresByKey(records);
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
    run("schema", gateSchema(record));
    const sound = !failures[key]?.schema;
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
    const next = { core: context.core.version, rule: ruleFingerprint(record.rule), passed };
    if (noted.length) next.noted = noted;
    const keep = gates && canonical({ ...gates, at: null }) === canonical({ ...next, at: null });
    return { ...record, evidence: { ...evidence, gates: keep ? gates : { at: new Date().toISOString(), ...next } } };
  });
  return { failures, notes, updated };
}
