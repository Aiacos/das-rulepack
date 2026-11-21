// The record format of the rulebook registry: the closed vocabularies and the structural validator.
import { assertProblems, isPlainLine } from "./assert.mjs";

export const ADDS_MAX = 200;

export const VERDICTS = Object.freeze(["core", "data", "none", "entry", "code", "engine", "unverifiable"]);
export const STATES = Object.freeze(["inventoried", "triaged", "drafted", "gated", "reviewed", "played"]);
export const ORIGINS = Object.freeze(["official", "ddb-importer", "plutonium"]);
export const MATCHES = Object.freeze(["matched", "absent", "ambiguous", "unchecked"]);
export const LEGACY_STATUSES = Object.freeze(["played", "validated", "pending"]);
export const HANDLED_IN = Object.freeze(["table", "code"]);
// Kinds of rulebook entry. `sense` exists only in legacy records and is never inventoried.
export const KINDS = Object.freeze(["spell", "feat", "option", "feature", "species", "background", "item", "monster", "sense"]);
export const EDITIONS = Object.freeze(["2014", "2024"]);
// The verdicts under which a record carries a rule that the pack registers.
export const RULE_VERDICTS = Object.freeze(["entry", "code"]);
// What the rule-based triage may tell a reader about a record (triage.mjs): `core-generic`.
export const HINTS = Object.freeze(["core-generic"]);

const DOC_ID = /^[A-Za-z0-9]{16}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isString = (v) => typeof v === "string" && v !== "";
const isPage = (v) => Number.isInteger(v) && v > 0;

function checkItem(item, at, errors) {
  if (!isObject(item)) return errors.push(`${at}: must be an object`);
  if (!ORIGINS.includes(item.origin)) errors.push(`${at}.origin: unknown origin ${JSON.stringify(item.origin)}`);
  if (!MATCHES.includes(item.match)) errors.push(`${at}.match: unknown match ${JSON.stringify(item.match)}`);
  for (const f of ["identifier", "docId"]) {
    if (f in item && typeof item[f] !== "string") errors.push(`${at}.${f}: must be a string`);
  }
  for (const f of ["activities", "effects"]) if (f in item && !Array.isArray(item[f])) errors.push(`${at}.${f}: must be an array`);
  if ("differences" in item && !(Array.isArray(item.differences) && item.differences.every((d) => typeof d === "string"))) {
    errors.push(`${at}.differences: must be an array of strings`);
  }
  if ("data" in item && !isObject(item.data)) errors.push(`${at}.data: must be an object`);
  checkItemExtras(item, at, errors);
}

const STAMP = ["by", "at", "because"];
const isStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");

// What inventory and `resolve` add to an item: copies of one document, reprints, what a person settled.
function checkItemExtras(item, at, errors) {
  if ("alsoDocIds" in item && !isStringList(item.alsoDocIds)) errors.push(`${at}.alsoDocIds: must be an array of strings`);
  for (const f of ["identifierDiffers", "embeddedShared"]) {
    if (f in item && typeof item[f] !== "boolean") errors.push(`${at}.${f}: must be a boolean`);
  }
  if ("resolved" in item) {
    const r = item.resolved;
    if (!isObject(r) || !STAMP.every((f) => isString(r[f]))) errors.push(`${at}.resolved: must be { by, at, because }`);
  }
  if ("reprints" in item) {
    if (!Array.isArray(item.reprints)) errors.push(`${at}.reprints: must be an array`);
    else item.reprints.forEach((r, i) => {
      const ok = isObject(r) && isString(r.package) && isString(r.docId) && typeof r.sameIds === "boolean"
        && (r.sameIds ? !("missing" in r) || isStringList(r.missing) : isStringList(r.missing));
      const shape = "{ package, docId, sameIds, missing }, missing required if sameIds is false";
      if (!ok) errors.push(`${at}.reprints[${i}]: must be ${shape}`);
    });
  }
  if ("reprintsExcluded" in item) {
    if (!Array.isArray(item.reprintsExcluded)) errors.push(`${at}.reprintsExcluded: must be an array`);
    else item.reprintsExcluded.forEach((r, i) => {
      if (!isObject(r) || !isString(r.package) || !isString(r.because)) {
        errors.push(`${at}.reprintsExcluded[${i}]: must be { package, because }`);
      }
    });
  }
}

function checkText(text, errors) {
  if (!isObject(text)) return errors.push("text: must be null or { sha256, source, chars }");
  if (typeof text.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(text.sha256)) errors.push("text.sha256: must be 64 hex characters");
  if (typeof text.source !== "string") errors.push("text.source: must be a string");
  if (!Number.isInteger(text.chars) || text.chars < 0) errors.push("text.chars: must be a non-negative integer");
}

// One printable line of at most 200 characters (a reason).
const isLine = (v) => isString(v) && v.length <= 200 && !/[\u0000-\u001f\u007f]/.test(v);

// `rule.alsoAs` (Ruling R2): the other identifiers the entry is registered under, one per origin whose item names it otherwise.
function checkAlsoAs(list, identifier, errors) {
  if (!Array.isArray(list)) return errors.push("rule.alsoAs: must be an array of { identifier, origin }");
  const seen = new Set();
  list.forEach((a, i) => {
    const at = `rule.alsoAs[${i}]`;
    if (!isObject(a) || Object.keys(a).some((k) => k !== "identifier" && k !== "origin")) {
      return errors.push(`${at}: must be { identifier, origin }`);
    }
    if (typeof a.identifier !== "string" || !KEBAB.test(a.identifier)) errors.push(`${at}.identifier: must be kebab-case`);
    else if (a.identifier === identifier) errors.push(`${at}.identifier: is the record's own identifier`);
    else if (seen.has(a.identifier)) errors.push(`${at}.identifier: ${a.identifier} is listed twice`);
    seen.add(a.identifier);
    if (!ORIGINS.includes(a.origin)) errors.push(`${at}.origin: unknown origin ${JSON.stringify(a.origin)}`);
  });
}

// `rule.uncovered` (Ruling R5): the matched origins the rule does not cover, each with why.
function checkUncovered(list, origins, errors) {
  if (!Array.isArray(list)) return errors.push("rule.uncovered: must be an array of { origin, because }");
  const seen = new Set();
  list.forEach((u, i) => {
    const at = `rule.uncovered[${i}]`;
    if (!isObject(u) || Object.keys(u).some((k) => k !== "origin" && k !== "because")) {
      return errors.push(`${at}: must be { origin, because }`);
    }
    if (!ORIGINS.includes(u.origin)) errors.push(`${at}.origin: unknown origin ${JSON.stringify(u.origin)}`);
    else if (seen.has(u.origin)) errors.push(`${at}.origin: ${u.origin} is listed twice`);
    else if (Array.isArray(origins) && origins.includes(u.origin)) errors.push(`${at}.origin: ${u.origin} is also in origins`);
    seen.add(u.origin);
    if (!isLine(u.because)) errors.push(`${at}.because: must be one line of at most 200 characters`);
  });
}

// `legacy` is the record's own flag, `record.legacy === true`: the schema has no legacy.json. That is safe because every
// exemption it grants (no `assert`, a longer `adds`, an unstamped review or play) is only ever acted on with legacy standing:
// a flag that legacy.json does not back fails the `legacy` gate in every mode and `generate` refuses the record
// (registry.mjs legacyProblem; tests/pipeline/draft-limits.test.mjs "a forged legacy flag").
function checkRule(rule, verdict, errors, identifier, legacy) {
  if (!isObject(rule)) return errors.push("rule: must be an object");
  if (!HANDLED_IN.includes(rule.handledIn)) errors.push(`rule.handledIn: must be one of ${HANDLED_IN.join(", ")}`);
  if (typeof rule.adds !== "string") errors.push("rule.adds: must be a string");
  // The only prose of a rule besides `assert[].free` (a legacy rule's adds predates the limit, its fingerprint holds it).
  else if (!legacy && !isPlainLine(rule.adds, ADDS_MAX)) {
    errors.push(`rule.adds: one printable line of at most ${ADDS_MAX} characters`);
  }
  for (const f of ["code", "origin"]) if (f in rule && typeof rule[f] !== "string") errors.push(`rule.${f}: must be a string`);
  if ("catalog" in rule && rule.catalog !== null && typeof rule.catalog !== "string") {
    errors.push("rule.catalog: must be a string or null");
  }
  if ("entry" in rule && !isObject(rule.entry)) errors.push("rule.entry: must be an object");
  if ("inCore" in rule && typeof rule.inCore !== "boolean") errors.push("rule.inCore: must be a boolean");
  // What the rule says happens (assert.mjs), its shape only: the gates check the engine's words. Required from this
  // milestone on; a legacy rule predates it.
  // `given.origin` may name only an origin the rule covers.
  if ("assert" in rule) errors.push(...assertProblems(rule.assert, Array.isArray(rule.origins) ? { origins: rule.origins } : {}));
  if (!legacy && !(Array.isArray(rule.assert) && rule.assert.length)) {
    errors.push("rule.assert: required, at least one { given, expect } (a legacy rule may have none)");
  }
  if (!Array.isArray(rule.origins)) errors.push("rule.origins: must be an array");
  else for (const o of rule.origins) if (!ORIGINS.includes(o)) errors.push(`rule.origins: unknown origin ${JSON.stringify(o)}`);
  if (verdict === "entry" && !isObject(rule.entry)) errors.push("rule.entry: required when the verdict is entry");
  if ("alsoAs" in rule) checkAlsoAs(rule.alsoAs, identifier, errors);
  if ("uncovered" in rule) checkUncovered(rule.uncovered, rule.origins, errors);
}

// The gates the evidence may name (gates.mjs GATES).
export const GATE_NAMES = Object.freeze(["schema", "validator", "ids", "fixes", "text", "unique"]);
const HEX64 = /^[0-9a-f]{64}$/;
const isGateList = (v) => Array.isArray(v) && v.every((g) => GATE_NAMES.includes(g));

// A reader's handle (`evidence.triaged.by`, queue.json `by`): "rule" names the rule-based step, no reader may sign with it.
export const BY = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
export const isReaderHandle = (by) => typeof by === "string" && BY.test(by) && by.toLowerCase() !== "rule";

// The shapes of evidence.gates, .drafted, .reviewed and .played, when present (the tools write them; nobody types them).
// Evidence about the rule carries its fingerprint (`rule`, 64 hex): editing the rule makes it stale (registry.mjs stateOf). A
// legacy record may keep a review or a play written before the stamp existed.
function checkEvidence(evidence, errors, legacy) {
  const { gates, triaged } = evidence;
  // A verdict settled by two readers carries the first one: { by, confidence } (triage.mjs ingestSecond).
  if (isObject(triaged) && "first" in triaged) {
    const first = triaged.first;
    const ok = isObject(first) && Object.keys(first).every((k) => k === "by" || k === "confidence")
      && isReaderHandle(first.by) && typeof first.confidence === "number" && first.confidence >= 0 && first.confidence <= 1;
    if (!ok) errors.push("evidence.triaged.first: must be { by: reader handle, confidence: number from 0 to 1 }");
  }
  if ("gates" in evidence) {
    if (!isObject(gates)) errors.push("evidence.gates: must be { at, core, rule, emits?, passed, noted?, items? }");
    else {
      for (const f of ["at", "core"]) if (!isString(gates[f])) errors.push(`evidence.gates.${f}: must be a non-empty string`);
      if (typeof gates.rule !== "string" || !HEX64.test(gates.rule)) errors.push("evidence.gates.rule: must be 64 hex characters");
      if ("emits" in gates && !(typeof gates.emits === "string" && HEX64.test(gates.emits))) {
        errors.push("evidence.gates.emits: must be 64 hex characters");
      }
      if (!isGateList(gates.passed)) {
        errors.push(`evidence.gates.passed: must be an array of gate names (${GATE_NAMES.join(", ")})`);
      }
      if ("noted" in gates && !isGateList(gates.noted)) errors.push("evidence.gates.noted: must be an array of gate names");
      if ("items" in gates) {
        const fingerprint = ([origin, sha]) => ORIGINS.includes(origin) && typeof sha === "string" && HEX64.test(sha);
        const ok = isObject(gates.items) && Object.entries(gates.items).every(fingerprint);
        if (!ok) errors.push("evidence.gates.items: must be an object of origin to the 64-hex data fingerprint of its item");
      }
    }
  }
  checkStamped(evidence, "drafted", { by: isReaderHandle, at: isString, core: isString, rule: isHex64 }, {}, errors);
  const confidence = (v) => typeof v === "number" && v >= 0 && v <= 1;
  checkStamped(evidence, "reviewed", { by: isReaderHandle, at: isString, agrees: (v) => typeof v === "boolean", rule: isHex64,
    confidence }, { rule: legacy, confidence: legacy }, errors);
  checkStamped(evidence, "played", { at: isString, core: isString, world: isString, scenario: isString, rule: isHex64 },
    { rule: legacy }, errors, { client: isString });
}

const isHex64 = (v) => typeof v === "string" && HEX64.test(v);
const WHAT = { by: "a reader handle", agrees: "a boolean", rule: "64 hex characters (the rule fingerprint)",
  confidence: "a number from 0 to 1" };

// One rule-stamped evidence object: `fields` (name → check) are required unless `optional[name]`; `extra` are optional ones.
// No other field is allowed.
function checkStamped(evidence, name, fields, optional, errors, extra = {}) {
  if (!(name in evidence)) return;
  const value = evidence[name];
  const shape = `{ ${[...Object.keys(fields), ...Object.keys(extra).map((k) => `${k}?`)].join(", ")} }`;
  if (!isObject(value)) return errors.push(`evidence.${name}: must be ${shape}`);
  const checks = { ...fields, ...extra };
  for (const [f, ok] of Object.entries(checks)) {
    const required = f in fields && !optional[f];
    if (!(f in value) ? required : !ok(value[f])) {
      errors.push(`evidence.${name}.${f}: must be ${WHAT[f] ?? "a non-empty string"}`);
    }
  }
  for (const f of Object.keys(value)) if (!(f in checks)) errors.push(`evidence.${name}.${f}: unknown field (${shape})`);
}

export function validateRecord(record) {
  if (!isObject(record)) return ["record: must be an object"];
  const errors = [];
  for (const f of ["key", "name", "kind", "book"]) if (!isString(record[f])) errors.push(`${f}: must be a non-empty string`);
  if (record.page !== null && !isPage(record.page)) errors.push("page: must be a positive integer or null");
  if (!EDITIONS.includes(record.edition)) errors.push(`edition: must be one of ${EDITIONS.join(", ")}`);
  if (record.text !== null) checkText(record.text, errors);
  if (!Array.isArray(record.items)) errors.push("items: must be an array");
  else record.items.forEach((item, i) => checkItem(item, `items[${i}]`, errors));
  if (record.verdict !== null && !VERDICTS.includes(record.verdict)) {
    errors.push(`verdict: unknown verdict ${JSON.stringify(record.verdict)}`);
  }
  if (!isObject(record.evidence)) errors.push("evidence: must be an object");
  else checkEvidence(record.evidence, errors, record.legacy === true);
  // A verdict comes before any draft: `rule.entry` is required only once a rule is there. A rule is registered only under
  // the verdicts entry and code, so a record that has one cannot take another verdict (it would vanish from the pack).
  if ("rule" in record) {
    checkRule(record.rule, record.verdict, errors, record.identifier, record.legacy === true);
    if (!RULE_VERDICTS.includes(record.verdict)) {
      errors.push(`verdict: a record with a rule can only have the verdict entry or code, not ${JSON.stringify(record.verdict)}`);
    }
  }
  if ("legacy" in record && typeof record.legacy !== "boolean") errors.push("legacy: must be a boolean");
  if ("srd" in record && typeof record.srd !== "boolean") errors.push("srd: must be a boolean");
  if ("legacyStatus" in record && !LEGACY_STATUSES.includes(record.legacyStatus)) {
    errors.push(`legacyStatus: must be one of ${LEGACY_STATUSES.join(", ")}`);
  }
  if ("alsoIn" in record) {
    if (!Array.isArray(record.alsoIn)) errors.push("alsoIn: must be an array");
    else record.alsoIn.forEach((a, i) => {
      if (!isObject(a) || !isString(a.book) || !isPage(a.page)) errors.push(`alsoIn[${i}]: must be { book, page }`);
    });
  }
  if ("sources" in record) {
    const s = record.sources;
    if (!isObject(s)) errors.push("sources: must be an object of document id to identifier");
    else for (const [id, identifier] of Object.entries(s)) {
      if (!DOC_ID.test(id)) errors.push(`sources: ${JSON.stringify(id)} is not a 16-character document id`);
      if (typeof identifier !== "string" || !KEBAB.test(identifier)) errors.push(`sources.${id}: must be a kebab-case identifier`);
    }
  }
  if ("resolutions" in record) {
    if (!Array.isArray(record.resolutions)) errors.push("resolutions: must be an array");
    else record.resolutions.forEach((r, i) => {
      const ok = isObject(r) && ORIGINS.includes(r.origin) && r.absent === true && STAMP.every((f) => isString(r[f]))
        && (!("candidates" in r) || isStringList(r.candidates))
        && (!("was" in r) || (isObject(r.was) && isString(r.was.docId)));
      if (!ok) errors.push(`resolutions[${i}]: must be { origin, absent: true, by, at, because, candidates?, was? }`);
    });
  }
  if ("order" in record && !(Number.isInteger(record.order) && record.order >= 0)) {
    errors.push("order: must be a non-negative integer");
  }
  if ("owner" in record && !isString(record.owner)) errors.push("owner: must be a non-empty string");
  if ("level" in record && !(Number.isInteger(record.level) && record.level >= 0)) {
    errors.push("level: must be a non-negative integer");
  }
  if ("occurrence" in record && !(Number.isInteger(record.occurrence) && record.occurrence >= 2)) {
    errors.push("occurrence: must be an integer of 2 or more");
  }
  for (const f of ["rarity", "section", "copyOf"]) {
    if (f in record && !isString(record[f])) errors.push(`${f}: must be a non-empty string`);
  }
  const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v);
  if ("textChangedAt" in record && !isDate(record.textChangedAt)) {
    errors.push("textChangedAt: must be an ISO date string");
  }
  if ("note" in record && typeof record.note !== "string") errors.push("note: must be a string");
  for (const f of ["why", "identifier"]) if (f in record && typeof record[f] !== "string") errors.push(`${f}: must be a string`);
  if ("hint" in record && !HINTS.includes(record.hint)) errors.push(`hint: must be one of ${HINTS.join(", ")}`);
  return errors;
}
