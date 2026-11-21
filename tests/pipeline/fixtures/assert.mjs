// A rule assertion for the synthetic rules of the tests: every non-legacy rule needs one (tools/pipeline/assert.mjs).
export const ASSERT = [{ given: { roll: "hit" }, expect: { damage: { fraction: 1 } } }];
// A person's signature (evidence.person): a rule a person wrote may hold what a drafter may not (Ruling R6).
export const PERSON = { by: "person-1", because: "written by hand for the test" };
