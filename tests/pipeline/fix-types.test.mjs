import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDraftKeys } from "../../tools/pipeline/draft-keys.mjs";
import { FIX_ENUMS, FIX_TYPES } from "../../tools/pipeline/fix-types.mjs";
import { runGates } from "../../tools/pipeline/gates.mjs";
import { ruleFingerprint, stateOf, validateRecord } from "../../tools/pipeline/registry.mjs";
import { ingest, ingestSecond, ingestThird } from "../../tools/pipeline/triage.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { loadCore } from "../../tools/pipeline/core.mjs";
import { ASSERT } from "./fixtures/assert.mjs";

// Synthetic fixtures only: invented ids and invented text. Round 4 of Task 3: a data fix's value and guard are TYPED by the
// leaf they write (no free string), and `evidence.person` is a signature bound to the rule.
const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const ACT = "Ac00Ac11Ac22Ac33";
const EFF = "Ef00Ef11Ef22Ef33";
const SPELL = { origins: ["official"], kind: "spell" };
const P = `system.activities.${ACT}.range.units`;
const at = (leaf) => `system.activities.${ACT}.${leaf}`;
const check = (...fixes) => checkDraftKeys({ dataFixes: fixes }, SPELL).join("; ");
const TEXT = "When you cast this spell the target must succeed on a Wisdom saving throw or fall prone and drop whatever it "
  + "is holding. On a success the creature is unaffected and takes no further damage this turn.";

const core = { version: "1", facts: [], vocabulary: new Set(), identifiers: new Set(), validateEntry: () => [] };
const record = (entry, extra = {}) => ({
  key: "tst:spell:x", identifier: "x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024", text: null,
  items: [{ origin: "official", match: "matched", identifier: "x", docId: "Of00Of11Of22Of33", activities: [ACT],
    effects: [EFF], data: { sha256: "0".repeat(64) } }],
  verdict: "entry", evidence: {}, rule: { handledIn: "table", adds: "x", entry, origins: ["official"], assert: ASSERT },
  ...extra
});
const ci = (r) => runGates([r], { core, documents: {}, ci: true, legacy: new Map() }).failures[r.key] ?? {};
const schemaCi = (r) => (ci(r).schema ?? []).join("; ");

describe("the reviewer's scenarios: prose cannot ride in a fix's value", () => {
  it("the whole text cut into 3-word strings over 5 fixes is refused by the schema gate under --ci", () => {
    const chunks = TEXT.split(" ").reduce((a, w, i) => { (a[Math.floor(i / 3)] ??= []).push(w); return a; }, [])
      .map((x) => x.join(" "));
    const fixes = [];
    for (let i = 0; i < chunks.length; i += 3) fixes.push({ path: P, value: chunks.slice(i, i + 3), from: "ft" });
    expect(schemaCi(record({ dataFixes: fixes }))).toMatch(/schema: dataFixes\[0\]\.value/);
  });

  it("one fix with thousands of object keys is refused", () => {
    const value = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, "the target must fall"]));
    expect(schemaCi(record({ dataFixes: [{ path: P, value, from: "ft" }] }))).toMatch(/schema: dataFixes\[0\]\.value/);
  });

  it("an enum leaf given any other word, a change value given a sentence, words with digits or underscores: refused", () => {
    expect(schemaCi(record({ dataFixes: [{ path: P, value: "fall", from: "self" }] }))).toMatch(/dataFixes\[0\]\.value/);
    const sentence = [{ key: "system.attributes.ac.bonus", type: "add", value: "the target must fall prone" }];
    expect(schemaCi(record({ dataFixes: [{ effect: EFF, path: "changes", value: sentence, from: [] }] })))
      .toMatch(/dataFixes\[0\]\.value/);
    for (const word of ["W1sd0m", "succ_eed", "s4ving thr0w"]) {
      expect(check({ path: P, value: word, from: "self" }), word).toMatch(/dataFixes\[0\]\.value/);
      expect(check({ path: at("attack.bonus"), value: word, from: "1" }), word).toMatch(/dataFixes\[0\]\.value/);
    }
  });
});

describe("leaf types", () => {
  it("every allowed path has a type", () => {
    for (const leaf of Object.keys(FIX_TYPES.activity)) expect(FIX_TYPES.activity[leaf], leaf).toBeTruthy();
    expect(Object.keys(FIX_TYPES.item).length).toBeGreaterThan(10);
    expect(Object.keys(FIX_TYPES.effect)).toContain("changes");
  });

  it("numbers, formulas, enums and booleans", () => {
    expect(check({ path: P, value: "touch", from: "self" })).toBe("");
    expect(check({ path: at("range.value"), value: 30, from: "60" })).toBe("");
    expect(check({ path: at("attack.bonus"), value: "@attributes.prof", from: "1" })).toBe("");
    expect(check({ path: at("healing.bonus"), value: "@mod + 2", from: 0 })).toBe("");
    expect(check({ path: at("consumption.spellSlot"), value: false, from: true })).toBe("");
    expect(check({ path: at("damage.onSave"), value: "none", from: "half" })).toBe("");
    expect(check({ path: at("activation.type"), value: "bonus", from: "action" })).toBe("");
    expect(check({ path: at("attack.bonus"), value: "1d4 + @mod", from: "1" })).toMatch(/value/);
    expect(check({ path: at("consumption.spellSlot"), value: "false", from: true })).toMatch(/value/);
    expect(check({ path: at("range.value"), value: "x".repeat(25), from: 1 })).toMatch(/value/);
  });

  it("typed lists with closed keys", () => {
    const part = { number: 2, denomination: 6, bonus: "@mod", types: ["fire"], scaling: { mode: "whole", number: 1 } };
    expect(check({ path: at("damage.parts"), value: [part], from: [] })).toBe("");
    expect(check({ path: at("damage.parts"), value: [{ ...part, custom: { enabled: true } }], from: [] })).toMatch(/custom/);
    expect(check({ path: at("damage.parts"), value: [{ ...part, types: ["sound"] }], from: [] })).toMatch(/value/);
    const target = { type: "itemUses", target: "Tg00Tg11Tg22Tg33", value: "1" };
    expect(check({ path: at("consumption.targets"), value: [target], from: [] })).toBe("");
    expect(check({ path: at("consumption.targets"), value: [{ ...target, target: "system.attributes.hd" }], from: [] })).toBe("");
    expect(check({ path: at("uses.recovery"), value: [{ period: "dawn", type: "recoverAll" }], from: [] })).toBe("");
    expect(check({ path: at("effects"), value: [{ _id: EFF, onSave: true, level: { min: 1, max: 9 } }], from: [] })).toBe("");
    expect(check({ path: at("effects"), value: [{ _id: "short" }], from: [] })).toMatch(/value/);
    const change = { key: "system.attributes.ac.bonus", type: "add", value: "2", priority: 20 };
    expect(check({ effect: EFF, path: "changes", value: [change], from: [] })).toBe("");
    const { type, ...untyped } = change;
    expect(check({ effect: EFF, path: "system.changes", value: [{ ...untyped, mode: 2 }], from: [] })).toBe("");
    expect(check({ effect: EFF, path: "changes", value: [{ ...change, key: "the target must fall" }], from: [] })).toMatch(/value/);
    expect(check({ effect: EFF, path: "statuses", value: ["prone"], from: [] })).toBe("");
    expect(check({ effect: EFF, path: "statuses", value: ["sleepy"], from: [] })).toMatch(/value/);
    expect(check({ path: "system.properties", value: ["vocal", "ritual"], from: ["vocal"] })).toBe("");
    expect(check({ path: at("healing.types"), value: ["temphp"], from: ["healing"] })).toBe("");
    expect(check({ path: at("effects"), value: Array.from({ length: 13 }, () => ({ _id: EFF })), from: [] })).toMatch(/12/);
  });

  it("from has the leaf's type: [] only for a list leaf; null and empty strings refused; 0 and false accepted", () => {
    expect(check({ path: P, value: "touch", from: [] })).toMatch(/from/);
    for (const from of [null, "", " "]) expect(check({ path: P, value: "touch", from }), String(from)).toMatch(/from/);
    expect(check({ path: at("range.value"), value: 5, from: 0 })).toBe("");
    expect(check({ path: at("consumption.spellSlot"), value: true, from: false })).toBe("");
    expect(check({ path: P, value: "touch" })).toMatch(/from is required/);
    expect(check({ path: P, from: "self" })).toMatch(/value/);
  });

  it("at most 12 fixes; one (target, path) pair once", () => {
    const fix = (i) => ({ path: at(["range.value", "range.long"][i % 2]), value: i + 1, from: 0, effect: undefined });
    const thirteen = Array.from({ length: 13 }, (_, i) => ({ effect: `Ef00Ef11Ef22Ef${String(i).padStart(2, "0")}`,
      path: "duration.seconds", value: 6, from: 60 }));
    expect(check(...thirteen)).toMatch(/at most 12 fixes/);
    const { effect, ...a } = fix(0);
    expect(check(a, { ...a, value: 9 })).toMatch(/dataFixes\[1\]: the same path as dataFixes\[0\]/);
    expect(check({ effect: EFF, path: "transfer", value: false, from: true },
      { effect: "Eg00Eg11Eg22Eg33", path: "transfer", value: false, from: true })).toBe("");
  });

  it("create stays refused", () => {
    expect(check({ effect: EFF, create: { statuses: [] } })).toMatch(/create is not for a drafter/);
  });
});

describe("evidence.person is a signature bound to the rule", () => {
  const prose = { dataFixes: [{ path: "system.description.value", from: "a", value: "the target falls" }] };
  const sign = (r, over = {}) => ({ ...r, evidence: { ...r.evidence,
    person: { by: "owner", because: "a person wrote this fix by hand", rule: ruleFingerprint(r.rule), ...over } } });

  it("signed by an owner for the current rule, the override applies; edit the rule and it no longer does", () => {
    expect(schemaCi(record(prose))).toMatch(/not an allowed leaf/);
    const signed = sign(record(prose));
    expect(validateRecord(signed)).toEqual([]);
    expect(schemaCi(signed)).toBe("");
    const edited = { ...signed, rule: { ...signed.rule, adds: "y" } };
    expect(schemaCi(edited)).toMatch(/not an allowed leaf/);
    const { rule, ...unstamped } = signed.evidence.person;
    expect(validateRecord({ ...signed, evidence: { person: unstamped } }).join("; ")).toMatch(/evidence\.person\.rule/);
  });

  it("by must be an owner of docs/owners.json, never an agent's handle", () => {
    expect(JSON.parse(readFileSync(join(ROOT, "docs", "owners.json"), "utf8"))).toEqual({ owners: ["owner"] });
    for (const by of ["drafter-agent-7", "reader-1", "reviewer-2", "second-s1", "third-t2", "agent-1"]) {
      expect(validateRecord(sign(record(prose), { by })).join("; "), by).toMatch(/evidence\.person\.by/);
    }
    // A handle that is not an agent's but is not an owner either: the record is valid, the override does not apply.
    const stranger = sign(record(prose), { by: "someone" });
    expect(validateRecord(stranger)).toEqual([]);
    expect(schemaCi(stranger)).toMatch(/not an allowed leaf/);
  });

  it("adding or changing evidence.person after gating makes the gate evidence stale", () => {
    const ok = record({ saveDamage: { [ACT]: "half" } }, { text: { sha256: "a".repeat(64), source: "x", chars: 1 } });
    const dir = mkdtempSync(join(tmpdir(), "person-"));
    try {
      ok.text.sha256 = cacheText(dir, "synthetic text");
      const ctx = { core, documents: { official: { Of00Of11Of22Of33: { _id: "Of00Of11Of22Of33", system: {}, effects: [] } } },
        textDir: dir, ci: false, legacy: new Map() };
      const [gated] = runGates([ok], ctx).updated;
      expect(stateOf(gated)).toBe("gated");
      const signed = sign(gated);
      expect(stateOf(signed)).toBe("drafted");
      expect(ci(signed).gates.join("; ")).toMatch(/no current evidence/);
      const [regated] = runGates([signed], ctx).updated;
      expect(stateOf(regated)).toBe("gated");
      const changed = { ...regated, evidence: { ...regated.evidence, person: { ...regated.evidence.person, because: "other" } } };
      expect(stateOf(changed)).toBe("drafted");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("no ingest writes evidence from a results file", () => {
  let textDir;
  beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "ingest-ev-")); });
  afterEach(() => rmSync(textDir, { recursive: true, force: true }));

  it("ingest, --second and --third refuse a result that carries evidence, and write no evidence.person", () => {
    const sha = cacheText(textDir, "synthetic text of the dim glow");
    const rec = { key: "tst:spell:dim-glow", name: "Dim Glow", kind: "spell", book: "TST", page: 1, edition: "2024",
      text: { sha256: sha, source: "x", chars: 10 }, items: [], verdict: null, evidence: {} };
    const person = { by: "owner", because: "x", rule: "a".repeat(64) };
    const result = { key: rec.key, verdict: "none", why: "Pure narration.", confidence: 0.9, evidence: { person } };
    const options = { textDir, by: "reader-9", at: "2026-01-01T00:00:00.000Z", entryKeys: new Set() };
    const queue = [{ key: rec.key, verdict: "none", why: "w", confidence: 0.8, by: "reader-1", reason: "disagreement",
      second: { verdict: "data", why: "w", confidence: 0.8, by: "second-1" } }];
    for (const [name, out] of [["ingest", ingest([rec], [result], options)],
      ["second", ingestSecond([rec], [result], { ...options, queue: [{ ...queue[0], second: undefined }] })],
      ["third", ingestThird([rec], [result], { ...options, queue })]]) {
      expect(out.rejected.map((x) => x.reason).join("; "), name).toMatch(/unknown field/);
      expect(out.records.every((r) => !r.evidence?.person), name).toBe(true);
    }
  });
});

describe.skipIf(!process.env.DAS_CORE)("the enums the engine has come from the engine", () => {
  it("damage types, abilities and statuses equal the DAS_CORE clone's", async () => {
    const engine = await loadCore(process.env.DAS_CORE);
    expect([...FIX_ENUMS.damageTypes].sort()).toEqual([...engine.damageTypes].sort());
    expect([...FIX_ENUMS.abilities].sort()).toEqual([...engine.abilities].sort());
    expect([...FIX_ENUMS.statuses].sort()).toEqual([...engine.statuses].sort());
  });
});
