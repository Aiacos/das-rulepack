import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkDraftKeys } from "../../tools/pipeline/draft-keys.mjs";
import { assertProblems, impliedAsserts } from "../../tools/pipeline/assert.mjs";
import { validateRecord } from "../../tools/pipeline/schema.mjs";
import { checkText, runGates } from "../../tools/pipeline/gates.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { loadQueue, saveBook } from "../../tools/pipeline/registry.mjs";
import { generate, ruleFromRecord } from "../../tools/pipeline/generate.mjs";

// Synthetic fixtures only: invented ids and invented text. Fix round 1 of Task 3: what a drafter can store as prose, and the
// limits that must fail closed.
const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const ACT = "Ac00Ac11Ac22Ac33";
const EFF = "Ef00Ef11Ef22Ef33";
const SPELL = { origins: ["official"], kind: "spell" };
const CLOSED = { damage: { fraction: 1 } };

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "limits-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("checkDraftKeys: dataFixes", () => {
  const fixes = (...list) => checkDraftKeys({ dataFixes: list }, SPELL).join("; ");

  it("a legitimate fix is accepted", () => {
    expect(fixes({ path: `system.activities.${ACT}.range.units`, from: "self", value: "touch" })).toBe("");
  });

  it("a create fix is refused: creating an effect goes to a person", () => {
    const create = { effect: EFF, create: { name: "A glowing ward of the old moon that shields its bearer",
      changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: "+10" }] } };
    expect(fixes(create)).toMatch(/dataFixes\[0\]: create is not for a drafter/);
  });

  it("from is a non-empty guard: missing, {}, [] or an empty object inside are refused", () => {
    const path = `system.activities.${ACT}.range.units`;
    expect(fixes({ path, value: "touch" })).toMatch(/dataFixes\[0\]: from is required/);
    for (const from of [{}, [], { a: {} }, [{}], { a: [] }, ""]) {
      expect(fixes({ path, value: "touch", from }), JSON.stringify(from)).toMatch(/dataFixes\[0\]\.from: a non-empty guard/);
    }
    expect(fixes({ path, value: "touch", from: { units: "self" } })).toBe("");
    expect(fixes({ path, value: 5, from: 0 })).toBe("");
  });

  it("prose paths are refused", () => {
    for (const path of ["name", "system.description.value", "system.unidentified.description", "flags.dnd5e.x", "img",
      `system.activities.${ACT}.name`, `system.activities.${ACT}.description.chatFlavor`, "system.chatFlavor"]) {
      expect(fixes({ path, from: "a", value: "b" }), path).toMatch(/dataFixes\[0\]\.path: prose/);
    }
    expect(fixes({ effect: EFF, path: "name", from: "a", value: "b" })).toMatch(/dataFixes\[0\]\.path: prose/);
  });

  it("a value with a string longer than 60 characters anywhere is refused", () => {
    const path = `system.activities.${ACT}.range.units`;
    expect(fixes({ path, from: "self", value: { a: ["x".repeat(61)] } })).toMatch(/dataFixes\[0\]\.value: a string longer/);
    expect(fixes({ path, from: "self", value: "x".repeat(60) })).toBe("");
  });

  it("the limits fail closed: origins and kind are required", () => {
    expect(() => checkDraftKeys({ saveDamage: { [ACT]: "half" } })).toThrow(/origins and kind are required/);
    expect(() => checkDraftKeys({ saveDamage: { [ACT]: "half" } }, { origins: ["official"] })).toThrow(/required/);
    expect(() => checkDraftKeys({}, { kind: "spell" })).toThrow(/required/);
  });
});

describe("assertions hold no prose beyond free", () => {
  it("move.distance: a non-negative number or a short formula", () => {
    const move = (distance) => assertProblems([{ given: {}, expect: { move: { mode: "push", distance } } }]).join("; ");
    for (const ok of [0, 10, "2 * 5", "@scale.monk.distance + 5", "(2 + 3) * 5"]) expect(move(ok), String(ok)).toBe("");
    for (const bad of [-5, "push it ten feet away", "x".repeat(25), "10 ft", "", "@a b"]) {
      expect(move(bad), String(bad)).toMatch(/expect\.move\.distance/);
    }
  });

  it("free alone is refused: every assertion needs a closed expect field", () => {
    expect(assertProblems([{ given: {}, expect: { free: "something happens" } }]).join("; "))
      .toMatch(/expect: at least one closed field/);
    expect(assertProblems([{ given: {}, expect: { free: "and", ...CLOSED } }])).toEqual([]);
  });

  it("given.origin is checked against the rule's own origins", () => {
    const record = {
      key: "tst:spell:x", identifier: "x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024", text: null,
      items: [], verdict: "entry", evidence: {},
      rule: { handledIn: "table", adds: "x", entry: {}, origins: ["official"],
        assert: [{ given: { origin: "ddb-importer" }, expect: CLOSED }] }
    };
    expect(validateRecord(record).join("; ")).toMatch(/given\.origin/);
    record.rule.origins = ["official", "ddb-importer"];
    expect(validateRecord(record)).toEqual([]);
  });

  it("impliedAsserts never produces an undefined field", () => {
    const triggers = [{ on: "failedSave", do: [{ type: "move", mode: "pull" }] }];
    expect(impliedAsserts({ triggers })).toEqual(["expect.move.mode=pull;given.roll=failedSave"]);
    expect(impliedAsserts({ triggers }).join()).not.toMatch(/undefined/);
    expect(assertProblems([{ given: {}, expect: { move: { mode: "pull" } } }])).toEqual([]);
  });
});

describe("adds and free in the schema, and the quotation check of the text gate", () => {
  const TEXT = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron";
  const record = (rule) => ({
    key: "tst:spell:x", identifier: "x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024",
    text: { sha256: cacheText(dir, TEXT), source: "dataset", chars: TEXT.length }, items: [], verdict: "entry", evidence: {},
    rule: { handledIn: "table", adds: "Adds a glow.", entry: {}, origins: ["official"], assert: [{ given: {}, expect: CLOSED }],
      ...rule }
  });

  it("adds is one printable line of at most 200 characters; free at most 120", () => {
    expect(validateRecord(record({}))).toEqual([]);
    for (const adds of ["x".repeat(201), "two\nlines", "tab\there", "", "x y"]) {
      expect(validateRecord(record({ adds })).join("; "), JSON.stringify(adds)).toMatch(/rule\.adds: one printable line/);
    }
    const free = [{ given: {}, expect: { free: "x".repeat(121), ...CLOSED } }];
    expect(validateRecord(record({ assert: free })).join("; ")).toMatch(/expect\.free/);
  });

  it("adds and free quoting 8 or more consecutive words of the source text fail", () => {
    const ctx = { textDir: dir };
    expect(checkText(record({}), ctx).failures).toEqual([]);
    const seven = "alpha beta gamma delta epsilon zeta eta";
    expect(checkText(record({ adds: `${seven} and more` }), ctx).failures).toEqual([]);
    expect(checkText(record({ adds: `${seven} theta` }), ctx).failures.join("; "))
      .toMatch(/text: rule\.adds quotes 8 or more consecutive words/);
    const given = [{ given: { free: `Alpha, BETA gamma delta epsilon zeta eta theta.` }, expect: CLOSED }];
    expect(checkText(record({ assert: given }), ctx).failures.join("; ")).toMatch(/rule\.assert\[0\]\.given\.free quotes/);
    const exp = [{ given: {}, expect: { free: `iota kappa lambda mu nu xi omicron alpha`, ...CLOSED } }];
    expect(checkText(record({ assert: exp }), ctx).failures).toEqual([]);
    const exp2 = [{ given: {}, expect: { free: `theta iota kappa lambda mu nu xi omicron`, ...CLOSED } }];
    expect(checkText(record({ assert: exp2 }), ctx).failures.join("; ")).toMatch(/rule\.assert\[0\]\.expect\.free quotes/);
  });

  it("fails closed when the text is not in the cache", () => {
    const r = { ...record({}), text: { sha256: "f".repeat(64), source: "dataset", chars: 3 } };
    expect(checkText(r, { textDir: dir }).failures.join("; ")).toMatch(/not in the text cache/);
    expect(checkText(record({}), {}).failures.join("; ")).toMatch(/no text cache/);
  });
});

describe("a forged legacy flag", () => {
  it("a record that says legacy: true without assert, and is not in legacy.json, fails the gates and is not emitted", () => {
    const forged = {
      key: "tst:spell:x", identifier: "forged-x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024", text: null,
      items: [], verdict: "entry", evidence: {}, legacy: true, legacyStatus: "played",
      rule: { handledIn: "table", adds: "x", entry: {}, origins: ["official"] }
    };
    expect(validateRecord(forged)).toEqual([]);
    const core = { version: "1", facts: [], vocabulary: new Set(), identifiers: new Set(), validateEntry: () => [] };
    for (const ci of [true, false]) {
      const { failures } = runGates([forged], { core, documents: {}, textDir: dir, ci, legacy: new Map() });
      expect(failures[forged.key].legacy, String(ci)).toEqual(["legacy: tst:spell:x is not in legacy.json"]);
    }
    expect(ruleFromRecord(forged, { legacy: new Map() })).toBeNull();
    const registry = join(dir, "registry");
    saveBook(registry, { book: "TST", records: [forged] });
    expect(() => generate({ registry, out: join(dir, "rules"), check: true })).toThrow(/not in legacy\.json/);
  });
});

describe("queue files are validated on load and by gates --ci", () => {
  it("loadQueue throws on a malformed entry", () => {
    writeFileSync(join(dir, "review-queue.json"), JSON.stringify([{ key: 1, junk: true }]));
    expect(() => loadQueue(dir, "review")).toThrow(/review-queue\.json/);
    writeFileSync(join(dir, "drafts-queue.json"), JSON.stringify([{ key: "not a key", reason: "person", by: "d-1",
      why: "w", confidence: 0.5 }]));
    expect(() => loadQueue(dir, "drafts")).toThrow(/key/);
  });

  it("the reviewer's probe: an unparseable drafts-queue.json, a malformed review-queue.json: gates --ci exits non-zero",
    () => {
      const registry = join(dir, "registry");
      mkdirSync(registry);
      writeFileSync(join(registry, "tst.json"), JSON.stringify({ book: "TST", records: [{ key: "tst:spell:x", name: "X",
        kind: "spell", book: "TST", page: 1, edition: "2024", text: null, items: [], verdict: null, evidence: {} }] }));
      const run = () => spawnSync("node", ["tools/pipeline/cli.mjs", "gates", "--ci"], { cwd: ROOT, encoding: "utf8",
        env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, DAS_CORE: process.env.DAS_CORE ?? join(dir, "none") } });
      writeFileSync(join(registry, "drafts-queue.json"), "{ not json");
      writeFileSync(join(registry, "review-queue.json"), JSON.stringify([{ key: 1, junk: true }]));
      const both = run();
      expect(both.status).not.toBe(0);
      expect(both.stderr).toMatch(/drafts-queue\.json/);
      rmSync(join(registry, "drafts-queue.json"));
      const one = run();
      expect(one.status).not.toBe(0);
      expect(one.stderr).toMatch(/review-queue\.json/);
    });
});

describe("the quotation check and legacy rules", () => {
  it("a legacy rule with standing is not held to it; the same record without standing is", async () => {
    const { legacyFingerprint } = await import("../../tools/pipeline/registry.mjs");
    const TEXT = "alpha beta gamma delta epsilon zeta eta theta iota";
    const r = {
      key: "tst:spell:x", identifier: "x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024", items: [],
      text: { sha256: cacheText(dir, TEXT), source: "dataset", chars: TEXT.length }, verdict: "entry", evidence: {},
      legacy: true, legacyStatus: "validated",
      rule: { handledIn: "table", adds: TEXT, entry: {}, origins: ["ddb-importer"] }
    };
    expect(checkText(r, { textDir: dir, legacy: new Map([[r.key, legacyFingerprint(r)]]) }).failures).toEqual([]);
    expect(checkText(r, { textDir: dir, legacy: new Map() }).failures.join("; ")).toMatch(/rule\.adds quotes/);
  });
});
