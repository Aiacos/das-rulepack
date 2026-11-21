// A rule assertion for the synthetic rules of the tests: every non-legacy rule needs one (tools/pipeline/assert.mjs).
export const ASSERT = [{ given: { roll: "hit" }, expect: { damage: { fraction: 1 } } }];
