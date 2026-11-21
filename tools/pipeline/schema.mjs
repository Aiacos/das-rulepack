// The record format of the rulebook registry: the closed vocabularies and the structural validator.
export const VERDICTS = Object.freeze(["core", "data", "none", "entry", "code", "engine", "unverifiable"]);
export const STATES = Object.freeze(["inventoried", "triaged", "drafted", "gated", "reviewed", "played"]);
export const ORIGINS = Object.freeze(["official", "ddb-importer", "plutonium"]);
export const MATCHES = Object.freeze(["matched", "absent", "ambiguous", "unchecked"]);
export const LEGACY_STATUSES = Object.freeze(["played", "validated", "pending"]);
export const HANDLED_IN = Object.freeze(["table", "code"]);
export const EDITIONS = Object.freeze(["2014", "2024"]);

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
}

function checkText(text, errors) {
  if (!isObject(text)) return errors.push("text: must be null or { sha256, source, chars }");
  if (typeof text.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(text.sha256)) errors.push("text.sha256: must be 64 hex characters");
  if (typeof text.source !== "string") errors.push("text.source: must be a string");
  if (!Number.isInteger(text.chars) || text.chars < 0) errors.push("text.chars: must be a non-negative integer");
}

function checkRule(rule, verdict, errors) {
  if (!isObject(rule)) return errors.push("rule: must be an object");
  if (!HANDLED_IN.includes(rule.handledIn)) errors.push(`rule.handledIn: must be one of ${HANDLED_IN.join(", ")}`);
  if (typeof rule.adds !== "string") errors.push("rule.adds: must be a string");
  for (const f of ["code", "origin"]) if (f in rule && typeof rule[f] !== "string") errors.push(`rule.${f}: must be a string`);
  if ("catalog" in rule && rule.catalog !== null && typeof rule.catalog !== "string") {
    errors.push("rule.catalog: must be a string or null");
  }
  if ("entry" in rule && !isObject(rule.entry)) errors.push("rule.entry: must be an object");
  if ("inCore" in rule && typeof rule.inCore !== "boolean") errors.push("rule.inCore: must be a boolean");
  if ("assert" in rule && !isObject(rule.assert)) errors.push("rule.assert: must be an object");
  if (!Array.isArray(rule.origins)) errors.push("rule.origins: must be an array");
  else for (const o of rule.origins) if (!ORIGINS.includes(o)) errors.push(`rule.origins: unknown origin ${JSON.stringify(o)}`);
  if (verdict === "entry" && !isObject(rule.entry)) errors.push("rule.entry: required when the verdict is entry");
}

// The gates the evidence may name (gates.mjs GATES).
export const GATE_NAMES = Object.freeze(["schema", "validator", "ids", "fixes", "text", "unique"]);
const HEX64 = /^[0-9a-f]{64}$/;
const isGateList = (v) => Array.isArray(v) && v.every((g) => GATE_NAMES.includes(g));

// The shapes of evidence.gates, evidence.reviewed and evidence.played, when present (the tools write them; nobody types them).
function checkEvidence(evidence, errors) {
  const { gates, reviewed, played } = evidence;
  if ("gates" in evidence) {
    if (!isObject(gates)) errors.push("evidence.gates: must be { at, core, rule, passed, noted? }");
    else {
      for (const f of ["at", "core"]) if (!isString(gates[f])) errors.push(`evidence.gates.${f}: must be a non-empty string`);
      if (typeof gates.rule !== "string" || !HEX64.test(gates.rule)) errors.push("evidence.gates.rule: must be 64 hex characters");
      if (!isGateList(gates.passed)) {
        errors.push(`evidence.gates.passed: must be an array of gate names (${GATE_NAMES.join(", ")})`);
      }
      if ("noted" in gates && !isGateList(gates.noted)) errors.push("evidence.gates.noted: must be an array of gate names");
    }
  }
  if ("reviewed" in evidence) {
    if (!isObject(reviewed)) errors.push("evidence.reviewed: must be { by, at, agrees }");
    else {
      for (const f of ["by", "at"]) if (!isString(reviewed[f])) errors.push(`evidence.reviewed.${f}: must be a non-empty string`);
      if (typeof reviewed.agrees !== "boolean") errors.push("evidence.reviewed.agrees: must be a boolean");
    }
  }
  if ("played" in evidence) {
    if (!isObject(played)) errors.push("evidence.played: must be { at, core, world, scenario, client? }");
    else {
      for (const f of ["at", "core", "world", "scenario"]) {
        if (!isString(played[f])) errors.push(`evidence.played.${f}: must be a non-empty string`);
      }
      if ("client" in played && !isString(played.client)) errors.push("evidence.played.client: must be a non-empty string");
    }
  }
}

export function validateRecord(record) {
  if (!isObject(record)) return ["record: must be an object"];
  const errors = [];
  for (const f of ["key", "name", "kind", "book"]) if (!isString(record[f])) errors.push(`${f}: must be a non-empty string`);
  if (!isPage(record.page)) errors.push("page: must be a positive integer");
  if (!EDITIONS.includes(record.edition)) errors.push(`edition: must be one of ${EDITIONS.join(", ")}`);
  if (record.text !== null) checkText(record.text, errors);
  if (!Array.isArray(record.items)) errors.push("items: must be an array");
  else record.items.forEach((item, i) => checkItem(item, `items[${i}]`, errors));
  if (record.verdict !== null && !VERDICTS.includes(record.verdict)) {
    errors.push(`verdict: unknown verdict ${JSON.stringify(record.verdict)}`);
  }
  if (!isObject(record.evidence)) errors.push("evidence: must be an object");
  else checkEvidence(record.evidence, errors);
  // A verdict comes before any draft: `rule.entry` is required only once a rule is there.
  if ("rule" in record) checkRule(record.rule, record.verdict, errors);
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
  if ("order" in record && !(Number.isInteger(record.order) && record.order >= 0)) {
    errors.push("order: must be a non-negative integer");
  }
  if ("note" in record && typeof record.note !== "string") errors.push("note: must be a string");
  for (const f of ["why", "identifier"]) if (f in record && typeof record[f] !== "string") errors.push(`${f}: must be a string`);
  return errors;
}
