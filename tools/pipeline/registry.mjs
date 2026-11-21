// Registry records, their fingerprints and derived state, and their on-disk form (one JSON file per book).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VERDICTS, STATES, ORIGINS, MATCHES, validateRecord } from "./schema.mjs";

export { VERDICTS, STATES, ORIGINS, MATCHES, validateRecord };

export const slug = (s) => String(s).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function keyOf({ book, kind, name, creature }) {
  return [book.toLowerCase(), slug(kind), ...(creature ? [slug(creature)] : []), slug(name)].join(":");
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const ruleFingerprint = (rule) => createHash("sha256").update(canonical(rule)).digest("hex");

const REQUIRED_GATES = ["schema", "validator", "ids", "fixes", "text"];

// The state is always derived from the evidence, never read from a stored field. `core` is accepted for the callers that
// know which engine they gate against; the gates carry their own fingerprint of the rule, which is what staleness hangs on.
export function stateOf(record, { core } = {}) {
  if (!record.verdict) return "inventoried";
  if (!record.rule) return "triaged";
  const gates = record.evidence?.gates;
  const passed = Array.isArray(gates?.passed) ? gates.passed : [];
  if (gates?.rule !== ruleFingerprint(record.rule) || !REQUIRED_GATES.every((g) => passed.includes(g))) return "drafted";
  if (!record.evidence.reviewed?.agrees) return "gated";
  return record.evidence.played ? "played" : "reviewed";
}

const fileOf = (dir, code) => join(dir, `${code.toLowerCase()}.json`);

export function loadBook(dir, code) {
  const { book, records } = JSON.parse(readFileSync(fileOf(dir, code), "utf8"));
  return { book, records: records.map(({ state, ...record }) => record) };
}

export function saveBook(dir, { book, records }) {
  for (const r of records) {
    const errors = validateRecord(r);
    if (errors.length) throw new Error(`${r?.key ?? "record"}: ${errors.join("; ")}`);
  }
  const sorted = [...records].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const out = { book, records: sorted.map(({ state, ...r }) => ({ ...r, state: stateOf(r) })) };
  mkdirSync(dir, { recursive: true });
  writeFileSync(fileOf(dir, book), `${JSON.stringify(out, null, 2)}\n`);
}
