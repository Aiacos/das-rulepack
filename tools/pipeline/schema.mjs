// The record format of the rulebook registry: the closed vocabularies and the structural validator.
import { assertProblems, isCanonicalAssertion, isPlainLine, unassertableKeys } from "./assert.mjs";
import { DRAFT_KEYS } from "./draft-keys.mjs";
import { leavesConflicts, leavesProblems } from "./leaves.mjs";

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
// What the rule-based triage may tell a reader about a record (triage.mjs): `core-generic` (the engine has the identifier,
// too generic to settle the record) and `core-parts` (the engine handles some of the record's parts, not all).
// `engine-reads` (Ruling R29): DAS · Core's own text layer reads something of this monster feature (triage --engine-reading).
// `beyond-engine`: a reread (reread.mjs) found that the text asks for something the engine's reading does not give.
export const HINTS = Object.freeze(["core-generic", "core-parts", "engine-reads", "beyond-engine"]);
// The why of a `core` the reread stage sets (reread.mjs): fixed, so that no reader's words become the record's why.
export const REREAD_WHY = "DAS · Core reads this feature's text and a reader found nothing beyond it";

const DOC_ID = /^[A-Za-z0-9]{16}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DOTTED = /^[a-z0-9]+([.-][a-z0-9]+)*$/;
export const ORIGIN_MAX = 60;
export const CODE_MAX = 96;
const CODE_PATH = /^scripts\/[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*\.mjs$/;
/** A `rule.code` path (Ruling R18): a repository-relative script under scripts/, kebab parts, `.mjs`. */
export const isCodePath = (v) => typeof v === "string" && v.length <= CODE_MAX && CODE_PATH.test(v);
// Own properties only: a key named like an inherited one (`constructor`, `toString`...) is never taken for a known key.
const has = (o, k) => Object.hasOwn(o, k);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isString = (v) => typeof v === "string" && v !== "";
const isPage = (v) => Number.isInteger(v) && v > 0;

function checkItem(item, at, errors) {
  if (!isObject(item)) return errors.push(`${at}: must be an object`);
  if (!ORIGINS.includes(item.origin)) errors.push(`${at}.origin: unknown origin ${JSON.stringify(item.origin)}`);
  if (!MATCHES.includes(item.match)) errors.push(`${at}.match: unknown match ${JSON.stringify(item.match)}`);
  for (const f of ["identifier", "docId"]) {
    if (has(item, f) && typeof item[f] !== "string") errors.push(`${at}.${f}: must be a string`);
  }
  for (const f of ["activities", "effects"]) {
    if (has(item, f) && !Array.isArray(item[f])) errors.push(`${at}.${f}: must be an array`);
  }
  if (has(item, "differences") && !(Array.isArray(item.differences) && item.differences.every((d) => typeof d === "string"))) {
    errors.push(`${at}.differences: must be an array of strings`);
  }
  if (has(item, "data") && !isObject(item.data)) errors.push(`${at}.data: must be an object`);
  checkItemExtras(item, at, errors);
}

const STAMP = ["by", "at", "because"];
const isStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");

// What inventory and `resolve` add to an item: copies of one document, reprints, what a person settled.
function checkItemExtras(item, at, errors) {
  if (has(item, "alsoDocIds") && !isStringList(item.alsoDocIds)) errors.push(`${at}.alsoDocIds: must be an array of strings`);
  for (const f of ["identifierDiffers", "embeddedShared"]) {
    if (has(item, f) && typeof item[f] !== "boolean") errors.push(`${at}.${f}: must be a boolean`);
  }
  if (has(item, "resolved")) {
    const r = item.resolved;
    if (!isObject(r) || !STAMP.every((f) => isString(r[f]))) errors.push(`${at}.resolved: must be { by, at, because }`);
  }
  if (has(item, "reprints")) {
    if (!Array.isArray(item.reprints)) errors.push(`${at}.reprints: must be an array`);
    else item.reprints.forEach((r, i) => {
      const ok = isObject(r) && isString(r.package) && isString(r.docId) && typeof r.sameIds === "boolean"
        && (r.sameIds ? !has(r, "missing") || isStringList(r.missing) : isStringList(r.missing));
      const shape = "{ package, docId, sameIds, missing }, missing required if sameIds is false";
      if (!ok) errors.push(`${at}.reprints[${i}]: must be ${shape}`);
    });
  }
  if (has(item, "reprintsExcluded")) {
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
const isLine = (v) => isPlainLine(v, 200);

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
    if (!isLine(u.because)) errors.push(`${at}.because: must be one line of printable ASCII, at most 200 characters`);
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
  for (const f of ["code", "origin"]) if (has(rule, f) && typeof rule[f] !== "string") errors.push(`rule.${f}: must be a string`);
  if (has(rule, "catalog") && rule.catalog !== null && typeof rule.catalog !== "string") {
    errors.push("rule.catalog: must be a string or null");
  }
  // From this milestone on (a legacy rule's predate it): `catalog` an identifier; `origin` a display label of where the rule
  // comes from in the book (Ruling R17); `code` the repository script of a code verdict (Ruling R18; the schema gate also
  // checks that the file exists).
  if (!legacy) {
    if (typeof rule.catalog === "string" && !(rule.catalog.length <= 64 && DOTTED.test(rule.catalog))) {
      errors.push("rule.catalog: must be a kebab/dot identifier of at most 64 characters");
    }
    if (has(rule, "origin") && !isPlainLine(rule.origin, ORIGIN_MAX)) {
      errors.push(`rule.origin: one line of printable ASCII, at most ${ORIGIN_MAX} characters`);
    }
    if (has(rule, "code") && !isCodePath(rule.code)) {
      errors.push(`rule.code: a script path scripts/<kebab>(/<kebab>)*.mjs of at most ${CODE_MAX} characters`);
    }
  }
  if (has(rule, "entry") && !isObject(rule.entry)) errors.push("rule.entry: must be an object");
  if (has(rule, "inCore") && typeof rule.inCore !== "boolean") errors.push("rule.inCore: must be a boolean");
  // What the rule says happens (assert.mjs), its shape only: the gates check the engine's words. Required from this
  // milestone on; a legacy rule predates it.
  // `given.origin` may name only an origin the rule covers.
  if (has(rule, "assert")) {
    // An agent's words (fix round 1 of Ruling R25: no `excludes`), unless the rule is a legacy one.
    const origins = Array.isArray(rule.origins) ? { origins: rule.origins } : {};
    errors.push(...assertProblems(rule.assert, { agent: !legacy, ...origins }));
  }
  if (!legacy && !(Array.isArray(rule.assert) && rule.assert.length)) {
    errors.push("rule.assert: required, at least one { given, expect } (a legacy rule may have none)");
  }
  // Ruling R25: what the rule leaves to the table, as data (leaves.mjs): the same checks as `assert`, no free text, at most
  // LEAVES_MAX items, never something the rule itself states or implies, never on a rule that asserts nothing of its own.
  if (has(rule, "leaves")) {
    errors.push(...leavesProblems(rule.leaves, Array.isArray(rule.origins) ? { origins: rule.origins } : {}),
      ...leavesConflicts(rule));
  }
  if (!Array.isArray(rule.origins)) errors.push("rule.origins: must be an array");
  else for (const o of rule.origins) if (!ORIGINS.includes(o)) errors.push(`rule.origins: unknown origin ${JSON.stringify(o)}`);
  if (verdict === "entry" && !isObject(rule.entry)) errors.push("rule.entry: required when the verdict is entry");
  if (has(rule, "alsoAs")) checkAlsoAs(rule.alsoAs, identifier, errors);
  if (has(rule, "uncovered")) checkUncovered(rule.uncovered, rule.origins, errors);
}

// The gates the evidence may name (gates.mjs GATES).
export const GATE_NAMES = Object.freeze(["schema", "validator", "ids", "fixes", "text", "unique"]);
const HEX64 = /^[0-9a-f]{64}$/;
const isGateList = (v) => Array.isArray(v) && v.every((g) => GATE_NAMES.includes(g));

// A reader's handle (`evidence.triaged.by`, queue.json `by`): "rule" names the rule-based step, no reader may sign with it.
export const BY = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
export const isReaderHandle = (by) => typeof by === "string" && BY.test(by) && by.toLowerCase() !== "rule";

export const VIA = Object.freeze(["third-reading", "bulk-unsure"]);

/** How a rule's `triggers` stand against the engine's reading (Ruling R29; engine-reading.mjs compareWithReading). */
export const READING_TRIGGERS = Object.freeze(["superset", "drops", "none", "same"]);
const ENTRY_KEY = /^[a-z][A-Za-z0-9]{0,63}$/;
const READING_FIELDS = ["at", "core", "rule", "item", "delta", "same", "changes", "triggers", "original", "carried", "dropped",
  "code"];
// Fix round 1: the rebinding fields (`original`, `carried`, `dropped`, `code`) are optional, so that a reading written before
// them still validates; `npm run gates` writes them for every monster rule.
const READING_OPTIONAL = ["original", "carried", "dropped", "code"];
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,95}$/;
const READING_LISTS = ["delta", "same", "changes"];

/**
 * What is wrong with an `evidence.reading` (Ruling R29: a rule compared with the engine's own reading of a monster feature),
 * as messages; empty when it is sound. A closed shape that holds no prose: a date, an engine version, two fingerprints, three
 * disjoint lists of entry keys and a trigger outcome consistent with where `triggers` is listed.
 */
export function readingProblems(reading) {
  const shape = `{ ${READING_FIELDS.map((f) => (READING_OPTIONAL.includes(f) ? `${f}?` : f)).join(", ")} }`;
  if (!isObject(reading)) return [`evidence.reading: must be ${shape}`];
  const errors = [];
  for (const f of Object.keys(reading)) {
    if (!READING_FIELDS.includes(f)) errors.push(`evidence.reading.${f}: unknown field (${shape})`);
  }
  if (typeof reading.at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(reading.at)) {
    errors.push("evidence.reading.at: must be an ISO date string");
  }
  if (!isCoreVersion(reading.core)) errors.push("evidence.reading.core: must be an engine version");
  for (const f of ["rule", "item"]) if (!isHex64(reading[f])) errors.push(`evidence.reading.${f}: must be 64 hex characters`);
  const seen = new Set();
  for (const f of READING_LISTS) {
    const list = reading[f];
    if (!Array.isArray(list) || !list.every((k) => typeof k === "string" && ENTRY_KEY.test(k))) {
      errors.push(`evidence.reading.${f}: must be a list of entry keys`);
      continue;
    }
    for (const k of list) {
      if (seen.has(k)) errors.push(`evidence.reading.${f}: ${k} is in two lists`);
      seen.add(k);
    }
  }
  if (has(reading, "original") && !(typeof reading.original === "string" && IDENTIFIER.test(reading.original))) {
    errors.push("evidence.reading.original: must be a kebab-case identifier");
  }
  if (has(reading, "code") && reading.code !== true) errors.push("evidence.reading.code: must be true when present");
  if (Array.isArray(reading.carried) && reading.carried.length && !has(reading, "original")) {
    errors.push("evidence.reading.carried: needs original (the identifier the keys are carried from)");
  }
  const rebound = new Set();
  for (const f of ["carried", "dropped"]) {
    if (!has(reading, f)) continue;
    const list = reading[f];
    if (!Array.isArray(list) || !list.every((k) => typeof k === "string" && ENTRY_KEY.test(k))) {
      errors.push(`evidence.reading.${f}: must be a list of entry keys`);
      continue;
    }
    for (const k of list) {
      if (rebound.has(k)) errors.push(`evidence.reading.${f}: ${k} is carried and dropped`);
      rebound.add(k);
    }
  }
  if (!READING_TRIGGERS.includes(reading.triggers)) {
    errors.push(`evidence.reading.triggers: must be one of ${READING_TRIGGERS.join(", ")}`);
  } else if (!errors.length) {
    // The outcome says where `triggers` sits: nowhere, in `same`, in `delta` (a superset) or in `changes` (it drops one).
    const where = READING_LISTS.find((f) => reading[f].includes("triggers")) ?? null;
    const expected = { none: null, same: "same", superset: "delta", drops: "changes" }[reading.triggers];
    if (where !== expected) errors.push(`evidence.reading.triggers: ${reading.triggers} does not match where triggers is listed`);
  }
  return errors;
}

// A reread (reread.mjs): `{ by, at, confidence, reading: { core, sha }, covered, beyond?, provisional?, second? }`, `second`
// the same without `provisional` and `second`. `beyond` (only and always with `covered: false`) is a list of assertions of
// the closed vocabulary, as an agent writes them, with no `free` anywhere: data, never prose.
const REREAD_FIELDS = ["by", "at", "confidence", "reading", "covered", "beyond", "provisional", "second"];
const REREAD_SECOND_FIELDS = ["by", "at", "confidence", "reading", "covered", "beyond"];
export const REREAD_BEYOND_MAX = 6;
const hasFree = (a) => ["given", "expect"].some((part) => isObject(a?.[part]) && has(a[part], "free"));
function rereadReadingProblems(r, at, fields) {
  const errors = [];
  if (!isObject(r)) return [`${at}: must be { ${fields.join(", ")} }`];
  for (const f of Object.keys(r)) if (!fields.includes(f)) errors.push(`${at}.${f}: unknown field`);
  if (!isReaderHandle(r.by)) errors.push(`${at}.by: must be a reader handle (not "rule")`);
  if (typeof r.at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(r.at)) errors.push(`${at}.at: must be an ISO date string`);
  if (!(typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1)) {
    errors.push(`${at}.confidence: must be a number from 0 to 1`);
  }
  const fp = r.reading;
  if (!isObject(fp) || !Object.keys(fp).every((k) => k === "core" || k === "sha") || !isCoreVersion(fp.core) || !isHex64(fp.sha)) {
    errors.push(`${at}.reading: must be { core: an engine version, sha: 64 hex characters }`);
  }
  if (typeof r.covered !== "boolean") errors.push(`${at}.covered: must be true or false`);
  if (r.covered === true && has(r, "beyond")) errors.push(`${at}.beyond: covered: true carries none`);
  if (r.covered === false) {
    const list = r.beyond;
    if (!Array.isArray(list) || !list.length || list.length > REREAD_BEYOND_MAX) {
      errors.push(`${at}.beyond: covered: false needs 1 to ${REREAD_BEYOND_MAX} assertions`);
    } else {
      errors.push(...assertProblems(list, { at: `${at}.beyond`, agent: true, origins: ["official"] }));
      if (list.some(hasFree)) errors.push(`${at}.beyond: no free text (data only)`);
    }
  }
  return errors;
}
/**
 * What is wrong with `evidence.triaged.reread`, as messages: its closed shape, and its tie to the record. Covered by the
 * first reread and, when there is one, by the second: a `core` the rule sets (`by: "rule"`, the previous verdict in `was`,
 * the fixed REREAD_WHY), `provisional: true` until a second reread agrees. Otherwise the verdict is not `core`; a second reread
 * follows only a covered first one.
 */
function rereadProblems(triaged, verdict, why) {
  const at = "evidence.triaged.reread";
  const r = triaged.reread;
  const errors = rereadReadingProblems(r, at, REREAD_FIELDS);
  if (!isObject(r)) return errors;
  if (has(r, "second")) errors.push(...rereadReadingProblems(r.second, `${at}.second`, REREAD_SECOND_FIELDS));
  if (has(r, "provisional") && r.provisional !== true) errors.push(`${at}.provisional: must be true when present`);
  if (r.covered === false && has(r, "second")) errors.push(`${at}.second: only a covered first reread is read again`);
  if (r.covered === true && has(r, "second") === has(r, "provisional")) {
    errors.push(`${at}.provisional: a covered reread is provisional until a second reread, and only then`);
  }
  if (r.covered === false && has(r, "provisional")) errors.push(`${at}.provisional: only a covered reread is provisional`);
  const covered = r.covered === true && (!isObject(r.second) || r.second.covered === true);
  if (covered && !(verdict === "core" && triaged.by === "rule" && has(triaged, "was") && why === REREAD_WHY)) {
    errors.push(`${at}: a covered reread goes with the verdict core, by rule, its previous verdict in was and the fixed why`);
  }
  if (!covered && verdict === "core") errors.push(`${at}: a reread that found something beyond the engine is no core`);
  return errors;
}

// The shapes of evidence.gates, .drafted, .reviewed and .played, when present (the tools write them; nobody types them).
// Evidence about the rule carries its fingerprint (`rule`, 64 hex): editing the rule makes it stale (registry.mjs stateOf). A
// legacy record may keep a review or a play written before the stamp existed.
function checkEvidence(evidence, errors, legacy, verdict, why) {
  const { gates, triaged } = evidence;
  if (isObject(triaged) && has(triaged, "reread")) errors.push(...rereadProblems(triaged, verdict, why));
  // The triage pre-pass (triage.mjs corePrepass) turns a record to `core` by rule and keeps what it was: `{ verdict, why?,
  // triaged? }`, the previous triage evidence signed by a reader. It goes with `by: "rule"` and the verdict `core` only.
  if (isObject(triaged) && has(triaged, "was")) {
    const w = triaged.was;
    const shape = "{ verdict (not core), why?, triaged?: { by: reader handle, ... } without was }";
    const ok = isObject(w) && Object.keys(w).every((k) => ["verdict", "why", "triaged"].includes(k))
      && VERDICTS.includes(w.verdict) && w.verdict !== "core" && (!has(w, "why") || typeof w.why === "string")
      && (!has(w, "triaged") || (isObject(w.triaged) && isReaderHandle(w.triaged.by) && !has(w.triaged, "was")));
    if (!ok) errors.push(`evidence.triaged.was: must be ${shape}`);
    if (triaged.by !== "rule") errors.push("evidence.triaged.was: only the rule-based pre-pass keeps one (by: rule)");
    if (verdict !== "core") errors.push("evidence.triaged.was: goes with the verdict core only (restore the previous one instead)");
  }
  // A verdict settled by several readings carries them: `first` and `second` are { by, confidence } (triage.mjs); `via` says
  // how it was settled when not by two agreeing readers: a third reading, or the owner's bulk rule for two unsure ones.
  if (isObject(triaged) && ["first", "second", "via"].some((k) => has(triaged, k))) {
    const reading = (r) => isObject(r) && Object.keys(r).every((k) => k === "by" || k === "confidence")
      && isReaderHandle(r.by) && typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1;
    for (const k of ["first", "second"]) {
      if (has(triaged, k) && !reading(triaged[k])) {
        errors.push(`evidence.triaged.${k}: must be { by: reader handle, confidence: number from 0 to 1 }`);
      }
    }
    if (has(triaged, "via") && !VIA.includes(triaged.via)) errors.push(`evidence.triaged.via: must be one of ${VIA.join(", ")}`);
    if (has(triaged, "second") && !has(triaged, "first")) errors.push("evidence.triaged.second: needs evidence.triaged.first");
    if (has(triaged, "via") && !(has(triaged, "first") && has(triaged, "second"))) {
      errors.push("evidence.triaged.via: needs evidence.triaged.first and evidence.triaged.second");
    }
  }
  if (has(evidence, "gates")) {
    if (!isObject(gates)) errors.push("evidence.gates: must be { at, core, rule, emits?, passed, noted?, items? }");
    else {
      for (const f of ["at", "core"]) if (!isString(gates[f])) errors.push(`evidence.gates.${f}: must be a non-empty string`);
      if (typeof gates.rule !== "string" || !HEX64.test(gates.rule)) errors.push("evidence.gates.rule: must be 64 hex characters");
      if (has(gates, "emits") && !(typeof gates.emits === "string" && HEX64.test(gates.emits))) {
        errors.push("evidence.gates.emits: must be 64 hex characters");
      }
      if (!isGateList(gates.passed)) {
        errors.push(`evidence.gates.passed: must be an array of gate names (${GATE_NAMES.join(", ")})`);
      }
      if (has(gates, "noted") && !isGateList(gates.noted)) errors.push("evidence.gates.noted: must be an array of gate names");
      if (has(gates, "items")) {
        const fingerprint = ([origin, sha]) => ORIGINS.includes(origin) && typeof sha === "string" && HEX64.test(sha);
        const ok = isObject(gates.items) && Object.entries(gates.items).every(fingerprint);
        if (!ok) errors.push("evidence.gates.items: must be an object of origin to the 64-hex data fingerprint of its item");
      }
    }
  }
  // Ruling R29: a rule compared with the engine's reading of its monster feature (written by `npm run gates`).
  if (has(evidence, "reading")) errors.push(...readingProblems(evidence.reading));
  // A person's signature that lets a rule hold what a drafter may not write (Ruling R6; gates.mjs draftProblems): bound to the
  // rule it signs (`rule`, its fingerprint), by an owner of docs/owners.json (checked by the gate), never an agent's handle.
  // No ingest writes it: a person types it.
  if (has(evidence, "person")) {
    const p = evidence.person;
    if (!isObject(p) || !onlyPersonKeys(p)) {
      errors.push("evidence.person: must be { by, because, rule }");
    } else {
      if (!isReaderHandle(p.by) || AGENT_HANDLE.test(p.by)) {
        errors.push("evidence.person.by: must be an owner's handle, not an agent's (reader, drafter, reviewer, second, third)");
      }
      if (!isPlainLine(p.because, 120)) errors.push("evidence.person.because: one line of printable ASCII, at most 120 characters");
      if (!isHex64(p.rule)) errors.push("evidence.person.rule: must be 64 hex characters (the fingerprint of the rule signed)");
    }
  }
  // `person: true` with a `because` of draftedForPersonReasons(): the draft ingest says the rule goes to a person at review
  // whatever a reviewer says (Ruling R15, generalised: a key the vocabulary cannot assert). The two go together.
  checkStamped(evidence, "drafted", { by: isReaderHandle, at: isString, core: isString, rule: isHex64 }, {}, errors,
    { person: (v) => v === true, because: (v) => draftedForPersonReasons().includes(v) });
  const drafted = evidence.drafted;
  if (isObject(drafted) && has(drafted, "person") !== has(drafted, "because")) {
    errors.push("evidence.drafted: person and because go together");
  }
  const confidence = (v) => typeof v === "number" && v >= 0 && v <= 1;
  // `because`: the one line a person gives when they accept a review-queue entry (`review-accept`); a reviewer writes none.
  checkStamped(evidence, "reviewed", { by: isReaderHandle, at: isString, agrees: (v) => typeof v === "boolean", rule: isHex64,
    confidence }, { rule: legacy, confidence: legacy }, errors, { because: (v) => isPlainLine(v, 120), tolerated: isTolerated });
  // A play (Ruling R10; played.mjs): read from the runner's log, or recorded by an owner who played a checklist by hand
  // (`manual: true` with `by` and `because`, the only prose: part of `emits`, read by the text gate). Every other field has
  // a shape that holds no prose: a scenario id, an engine version, a world handle, a client, a fingerprint.
  checkStamped(evidence, "played", { at: isString, core: isCoreVersion, world: isWorld, scenario: isScenarioId, rule: isHex64 },
    { rule: legacy }, errors, { client: (v) => PLAY_CLIENTS.includes(v), manual: (v) => v === true,
      by: (v) => isReaderHandle(v) && !AGENT_HANDLE.test(v), because: (v) => isPlainLine(v, 120) });
  const played = evidence.played;
  if (isObject(played) && !(has(played, "manual") === has(played, "by") && has(played, "by") === has(played, "because"))) {
    errors.push("evidence.played: manual, by and because go together (a checklist played by hand)");
  }
}

// What a play names (Ruling R10): the scenario `<book>/<slug of the record key>` (scenarios.mjs), the engine version the
// runner printed, the world it was played in (a handle: no spaces), the client that ran it.
export const SCENARIO_ID = /^[a-z][a-z0-9]{1,9}\/[a-z0-9][a-z0-9-]{0,159}$/;
export const CORE_VERSION = /^\d{1,4}(\.\d{1,6}){1,3}(-[0-9a-z.]{1,24})?$/i;
export const PLAY_CLIENTS = Object.freeze(["gm", "player"]);
export const isScenarioId = (v) => typeof v === "string" && SCENARIO_ID.test(v);
export const isCoreVersion = (v) => typeof v === "string" && CORE_VERSION.test(v);
export const isWorld = (v) => typeof v === "string" && BY.test(v);

// Ruling R24 (fix round 1, V): what an agreement tolerated, `{ baseline: [review], detail: [[draft, review]] }` (the names
// of REVIEW_TOLERANCES), every string a canonical assertion of the closed vocabulary, at least one of the two lists non-empty.
// It is part of the gates' `emits` (registry.mjs emittedFingerprint), so a hand edit that removes or changes it is seen.
export const REVIEW_TOLERANCES = Object.freeze(["baseline", "detail"]);
// Ruling R25: `left`, the [leaves, review] pairs of an agreement that matched review assertions with what the rule declares it
// leaves to the table (a partial rule). Optional (absent from agreements before it), never empty when present.
export const PARTIAL_TOLERANCE = "left";
const isPairList = (l) => Array.isArray(l) && l.every((p) => Array.isArray(p) && p.length === 2
  && p.every((c) => isCanonicalAssertion(c)));
const isTolerated = (v) => isObject(v) && REVIEW_TOLERANCES.every((k) => Object.hasOwn(v, k) && Array.isArray(v[k]))
  && Object.keys(v).every((k) => REVIEW_TOLERANCES.includes(k) || k === PARTIAL_TOLERANCE)
  && (!Object.hasOwn(v, PARTIAL_TOLERANCE) || (isPairList(v.left) && v.left.length > 0))
  && (v.baseline.length + v.detail.length + (Object.hasOwn(v, PARTIAL_TOLERANCE) ? v.left.length : 0) > 0)
  && v.baseline.every((c) => isCanonicalAssertion(c)) && isPairList(v.detail);
const onlyPersonKeys = (p) => Object.keys(p).every((k) => ["by", "because", "rule"].includes(k));
// The handles agents sign with (triage readers, second and third readers, drafters, reviewers): never a person's signature.
export const AGENT_HANDLE = /^(reader|drafter|reviewer|second|third)([-_.0-9]|$)|agent/i;
const isHex64 = (v) => typeof v === "string" && HEX64.test(v);
const WHAT = { by: "a reader handle", agrees: "a boolean", rule: "64 hex characters (the rule fingerprint)",
  confidence: "a number from 0 to 1", person: "true", because:
    "one of the reasons a draft goes to a person (draftedForPersonReasons)",
  "reviewed.because": "one line of printable ASCII, at most 120 characters",
  "reviewed.tolerated": "{ baseline: [canonical assertion], detail: [[draft, review]], left?: [[leaves, review]] } (Rulings R24,"
    + " R25), not all empty",
  "played.because": "one line of printable ASCII, at most 120 characters", "played.by": "an owner's handle, not an agent's",
  "played.manual": "true", "played.client": `one of ${["gm", "player"].join(", ")}`,
  "played.scenario": "a scenario id <book>/<slug> (scenarios.mjs)", "played.core": "an engine version (1.2.3)",
  "played.world": "a world handle (letters, digits, . _ -)" };

/**
 * Why a drafted rule goes to a person at review whatever the reviewer says (`evidence.drafted.because`, with `person: true`):
 * the name of a drafter key the assertion vocabulary cannot say all of (Ruling R15, generalised by fix round 1 of R25:
 * assert.mjs unassertableKeys, IMPLIES_NOTHING), `other-key` for a key outside DRAFT_KEYS (a rule a person signed), or
 * `official-uncovered` (Ruling R21: the rule leaves the official item uncovered and names another origin only). `noReactions`
 * stays a valid stamp: it was written before fix round 1, when the vocabulary had no word for a lost reaction.
 */
// A function, not a constant: DRAFT_KEYS comes from draft-keys.mjs, whose imports lead back here (read once all are loaded).
let FOR_PERSON;
export const draftedForPersonReasons = () =>
  (FOR_PERSON ??= Object.freeze(["official-uncovered", "other-key", ...Object.keys(DRAFT_KEYS)]));
/**
 * The `evidence.drafted.because` a rule calls for, or null (draft.mjs stamps it; the schema requires it): the first key, in
 * name order, the vocabulary cannot assert; else `official-uncovered` (one reason is enough to send the record to a person).
 */
export function draftedForPerson(rule) {
  if (!isObject(rule)) return null;
  const [key] = unassertableKeys(rule.entry);
  if (key !== undefined) return Object.hasOwn(DRAFT_KEYS, key) ? key : "other-key";
  const uncovered = Array.isArray(rule.uncovered) ? rule.uncovered : [];
  return uncovered.some((u) => isObject(u) && u.origin === "official") ? "official-uncovered" : null;
}

// One rule-stamped evidence object: `fields` (name → check) are required unless `optional[name]`; `extra` are optional ones.
// No other field is allowed.
function checkStamped(evidence, name, fields, optional, errors, extra = {}) {
  if (!has(evidence, name)) return;
  const value = evidence[name];
  const shape = `{ ${[...Object.keys(fields), ...Object.keys(extra).map((k) => `${k}?`)].join(", ")} }`;
  if (!isObject(value)) return errors.push(`evidence.${name}: must be ${shape}`);
  const checks = { ...fields, ...extra };
  for (const [f, ok] of Object.entries(checks)) {
    const required = has(fields, f) && !optional[f];
    if (!has(value, f) ? required : !ok(value[f])) {
      errors.push(`evidence.${name}.${f}: must be ${WHAT[`${name}.${f}`] ?? WHAT[f] ?? "a non-empty string"}`);
    }
  }
  for (const f of Object.keys(value)) if (!has(checks, f)) errors.push(`evidence.${name}.${f}: unknown field (${shape})`);
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
  else checkEvidence(record.evidence, errors, record.legacy === true, record.verdict, record.why);
  // A verdict comes before any draft: `rule.entry` is required only once a rule is there. A rule is registered only under
  // the verdicts entry and code, so a record that has one cannot take another verdict (it would vanish from the pack).
  if (has(record, "rule")) {
    checkRule(record.rule, record.verdict, errors, record.identifier, record.legacy === true);
    // A drafted rule that calls for a person at review carries the stamp (Rulings R15, R21): it cannot be dropped while the
    // reason is there (a person who writes such a rule by hand has no `drafted` evidence and is not held to it).
    const wanted = draftedForPerson(record.rule);
    const drafted = isObject(record.evidence) ? record.evidence.drafted : undefined;
    if (wanted && record.legacy !== true && isObject(drafted) && !(drafted.person === true && drafted.because === wanted)) {
      errors.push(`evidence.drafted: a drafted rule with ${wanted} needs person: true, because: "${wanted}" (Ruling R15)`);
    }
    if (!RULE_VERDICTS.includes(record.verdict)) {
      errors.push(`verdict: a record with a rule can only have the verdict entry or code, not ${JSON.stringify(record.verdict)}`);
    }
  }
  if (has(record, "legacy") && typeof record.legacy !== "boolean") errors.push("legacy: must be a boolean");
  if (has(record, "srd") && typeof record.srd !== "boolean") errors.push("srd: must be a boolean");
  if (has(record, "legacyStatus") && !LEGACY_STATUSES.includes(record.legacyStatus)) {
    errors.push(`legacyStatus: must be one of ${LEGACY_STATUSES.join(", ")}`);
  }
  if (has(record, "alsoIn")) {
    if (!Array.isArray(record.alsoIn)) errors.push("alsoIn: must be an array");
    else record.alsoIn.forEach((a, i) => {
      if (!isObject(a) || !isString(a.book) || !isPage(a.page)) errors.push(`alsoIn[${i}]: must be { book, page }`);
    });
  }
  if (has(record, "sources")) {
    const s = record.sources;
    if (!isObject(s)) errors.push("sources: must be an object of document id to identifier");
    else for (const [id, identifier] of Object.entries(s)) {
      if (!DOC_ID.test(id)) errors.push(`sources: ${JSON.stringify(id)} is not a 16-character document id`);
      if (typeof identifier !== "string" || !KEBAB.test(identifier)) errors.push(`sources.${id}: must be a kebab-case identifier`);
    }
  }
  if (has(record, "resolutions")) {
    if (!Array.isArray(record.resolutions)) errors.push("resolutions: must be an array");
    else record.resolutions.forEach((r, i) => {
      const ok = isObject(r) && ORIGINS.includes(r.origin) && r.absent === true && STAMP.every((f) => isString(r[f]))
        && (!has(r, "candidates") || isStringList(r.candidates))
        && (!has(r, "was") || (isObject(r.was) && isString(r.was.docId)));
      if (!ok) errors.push(`resolutions[${i}]: must be { origin, absent: true, by, at, because, candidates?, was? }`);
    });
  }
  if (has(record, "order") && !(Number.isInteger(record.order) && record.order >= 0)) {
    errors.push("order: must be a non-negative integer");
  }
  if (has(record, "owner") && !isString(record.owner)) errors.push("owner: must be a non-empty string");
  if (has(record, "level") && !(Number.isInteger(record.level) && record.level >= 0)) {
    errors.push("level: must be a non-negative integer");
  }
  if (has(record, "occurrence") && !(Number.isInteger(record.occurrence) && record.occurrence >= 2)) {
    errors.push("occurrence: must be an integer of 2 or more");
  }
  for (const f of ["rarity", "section", "copyOf"]) {
    if (has(record, f) && !isString(record[f])) errors.push(`${f}: must be a non-empty string`);
  }
  const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v);
  if (has(record, "textChangedAt") && !isDate(record.textChangedAt)) {
    errors.push("textChangedAt: must be an ISO date string");
  }
  if (has(record, "note") && typeof record.note !== "string") errors.push("note: must be a string");
  for (const f of ["why", "identifier"]) if (has(record, f) && typeof record[f] !== "string") errors.push(`${f}: must be a string`);
  if (has(record, "hint") && !HINTS.includes(record.hint)) errors.push(`hint: must be one of ${HINTS.join(", ")}`);
  return errors;
}
