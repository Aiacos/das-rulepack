import { ruleFingerprint } from "../../../tools/pipeline/registry.mjs";

// A rule assertion for the synthetic rules of the tests: every non-legacy rule needs one (tools/pipeline/assert.mjs).
export const ASSERT = [{ given: { roll: "hit" }, expect: { damage: { fraction: 1 } } }];
// A person's signature (evidence.person) of the record's rule as it is: an owner of docs/owners.json, with the rule's
// fingerprint. A rule a person wrote may hold what a drafter may not (Ruling R6).
export const sign = (record) => ({ ...record, evidence: { ...record.evidence,
  person: { by: "owner", because: "written by hand for the test", rule: ruleFingerprint(record.rule) } } });
