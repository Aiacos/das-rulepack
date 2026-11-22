// Every kind a ruled registry record may have is a kind of the module (scripts/rules/book.mjs KINDS) with a label in the
// generated list of rules (tools/books-progress.mjs KIND_LABELS): a new kind fails here instead of printing "undefined" in
// docs/RULES.md (pilot 3: the monster rules of XMM).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { KINDS } from "../scripts/rules/book.mjs";
import { KIND_LABELS, kindLabel } from "../tools/books-progress.mjs";
import { KINDS as RECORD_KINDS } from "../tools/pipeline/schema.mjs";
import { ruleFromRecord } from "../tools/pipeline/generate.mjs";
import { emittedFingerprint, ruleFingerprint } from "../tools/pipeline/registry.mjs";
import { RULES_DOC } from "../tools/books-progress.mjs";

describe("kinds of the module", () => {
  it("every kind the registry schema allows is a module kind with a label", () => {
    for (const kind of RECORD_KINDS) {
      expect(KINDS, kind).toContain(kind);
      expect(Object.hasOwn(KIND_LABELS, kind), kind).toBe(true);
      expect(kindLabel(kind), kind).toMatch(/^[A-Z][a-z ]+$/);
    }
  });

  it("the module knows no kind the registry cannot hold, and labels only its kinds", () => {
    expect([...KINDS].sort()).toEqual([...RECORD_KINDS].sort());
    expect(Object.keys(KIND_LABELS).sort()).toEqual([...KINDS].sort());
  });

  it("an unknown kind is refused, never printed as undefined", () => {
    expect(() => kindLabel("vehicle")).toThrow(/vehicle/);
    expect(() => kindLabel("constructor")).toThrow(/constructor/);
  });

  it("a gated monster rule is emitted with a module kind", () => {
    const record = {
      key: "tst:monster:wyrmling/action/gust", identifier: "tst-wyrmling-gust", name: "Gust", kind: "monster", book: "TST",
      page: 3, edition: "2024", text: null, items: [], verdict: "entry",
      rule: { handledIn: "table", adds: "A failed save leaves the target prone.", origins: ["official"],
        entry: { effectEnds: { Ef11Ef22Ef33Ef44: "bearerTurnEnd" } },
        assert: [{ given: { roll: "failedSave" }, expect: { ends: "bearerTurnEnd" } }] },
      evidence: {}
    };
    record.evidence.gates = { at: "2026-11-22", core: "1.0.0", rule: ruleFingerprint(record.rule),
      emits: emittedFingerprint(record), passed: ["schema", "validator", "ids", "fixes", "text", "unique"] };
    const rule = ruleFromRecord(record, { legacy: new Map() });
    expect(rule.kind).toBe("monster");
    expect(KINDS).toContain(rule.kind);
    expect(kindLabel(rule.kind)).toBe("Monster feature");
  });

  it("docs/RULES.md prints no undefined kind", () => {
    expect(readFileSync(RULES_DOC, "utf8")).not.toMatch(/\| undefined \|/);
  });
});
