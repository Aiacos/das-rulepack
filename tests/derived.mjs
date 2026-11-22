// What the pack must register, derived from registry/ at test time with the generator's own functions (not a test file: no
// `.test.` in its name). The tests that pin the 24 legacy rules compare against a list written in the test; every other rule is
// checked against this, so a rule added through the pipeline needs no edit of a test, only `npm run build:rules`.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NOT_BOOKS, hasLegacyStanding, loadLegacy } from "../tools/pipeline/registry.mjs";
import { ruleFromRecord, sourcesOf } from "../tools/pipeline/generate.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REGISTRY = join(ROOT, "registry");

/**
 * The registry as the generator reads it.
 *  - records: every record of every book, as saved (with its `state`).
 *  - legacyKeys: the keys of registry/legacy.json, the allow-list of the hand-written rules.
 *  - emitted: `{ record, rule }` for each record whose rule `ruleFromRecord` emits (legacy with standing, or gates current).
 *  - table: what the generated index registers, identifier and aliases -> entry. sources: what it passes as `sources`.
 */
export function fromRegistry(dir = REGISTRY) {
  const legacy = loadLegacy(dir);
  const records = readdirSync(dir).filter((f) => f.endsWith(".json") && !NOT_BOOKS.includes(f)).sort()
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")).records ?? []);
  const plain = records.map(({ state, ...record }) => record);
  const emitted = plain.map((record) => ({ record, rule: ruleFromRecord(record, { legacy }) })).filter((x) => x.rule);
  const table = {};
  for (const { rule } of emitted) {
    if (rule.entry) for (const id of [rule.identifier, ...(rule.alsoAs ?? [])]) table[id] = rule.entry;
  }
  return {
    legacy, legacyKeys: [...legacy.keys()].sort(), records, emitted, table, sources: sourcesOf(plain, { legacy }),
    isLegacy: (record) => hasLegacyStanding(record, legacy)
  };
}

/** The emitted rules that are not legacy, counted by book and status: `{ XMM: { validated: 14 } }`. */
export function newRulesByBook(emitted, isLegacy) {
  const out = {};
  for (const { record, rule } of emitted) {
    if (isLegacy(record)) continue;
    out[rule.book] ??= {};
    out[rule.book][rule.status] = (out[rule.book][rule.status] ?? 0) + 1;
  }
  return out;
}
