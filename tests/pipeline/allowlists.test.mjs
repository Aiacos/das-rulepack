import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkDraftKeys, FIX_PATHS } from "../../tools/pipeline/draft-keys.mjs";
import { assertProblems, isPlainLine } from "../../tools/pipeline/assert.mjs";
import { validateRecord } from "../../tools/pipeline/schema.mjs";
import { checkFixes, checkText, runGates } from "../../tools/pipeline/gates.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { NOT_BOOKS, validateTriageQueueEntry } from "../../tools/pipeline/registry.mjs";
import { ASSERT } from "./fixtures/assert.mjs";

// Synthetic fixtures only: invented ids and invented text. Fix round 2 of Task 3: allowlists instead of blacklists, and the
// drafter limits enforced by a gate that runs under --ci.
const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const ACT = "Ac00Ac11Ac22Ac33";
const EFF = "Ef00Ef11Ef22Ef33";
const SPELL = { origins: ["official"], kind: "spell" };
const RANGE = `system.activities.${ACT}.range.units`;
const fixes = (...list) => checkDraftKeys({ dataFixes: list }, SPELL).join("; ");

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "allow-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("dataFixes paths: an allowlist", () => {
  it("allowed leaves pass, for an activity, the item and an effect", () => {
    for (const path of [RANGE, `system.activities.${ACT}.damage.parts`, `system.activities.${ACT}.save.dc.formula`,
      `system.activities.${ACT}.target.template.size`, `system.activities.${ACT}.effects`, "system.uses.max",
      "system.target.affects.type", "system.properties", "system.range.units"]) {
      expect(fixes({ path, from: "self", value: "touch" }), path).toBe("");
    }
    for (const path of ["duration.seconds", "statuses", "system.changes", "changes", "transfer", "disabled"]) {
      expect(fixes({ effect: EFF, path, from: 6, value: 60 }), path).toBe("");
    }
    expect(FIX_PATHS.item.length).toBeGreaterThan(10);
  });

  it("unlisted leaves are refused, prose or not, and case counts", () => {
    for (const path of ["IMG", "Img", "img", "Flags.dnd5e.x", "FLAGS.x", "name", "Name", "system.description.value",
      `system.activities.${ACT}.activation.condition`, "system.requirements", "system.materials.value",
      `system.activities.${ACT}.description.chatFlavor`, `system.activities.${ACT}.damage.parts.0.custom.formula`,
      `system.activities.${ACT}.Range.units`, `system.activities.${ACT.slice(1)}.range.units`, "system.source.custom",
      `system.activities.${ACT}`, "system.uses"]) {
      expect(fixes({ path, from: "a", value: "b" }), path).toMatch(/dataFixes\[0\]\.path: not an allowed leaf/);
    }
    expect(fixes({ effect: EFF, path: "name", from: "a", value: "b" })).toMatch(/not an allowed leaf/);
    expect(fixes({ effect: EFF, path: "description", from: "a", value: "b" })).toMatch(/not an allowed leaf/);
  });
});

describe("dataFixes values and guards: tokens, not prose", () => {
  it("an array of short strings that together say a sentence is refused", () => {
    const words = ["the", "creature", "must", "succeed", "on", "a", "wisdom", "saving", "throw", "or", "become", "frightened",
      "until", "the", "end"];
    expect(fixes({ path: RANGE, from: "self", value: words })).toMatch(/dataFixes\[0\]\.value/);
    const twelve = ["each", "creature", "within", "range", "takes", "fire", "damage", "unless", "behind", "total", "cover",
      "whose"];
    expect(fixes({ path: RANGE, from: "self", value: [twelve.slice(0, 6).join(" "), twelve.slice(6).join(" ")] }))
      .toMatch(/dataFixes\[0\]/);
    expect(fixes({ path: RANGE, from: "self", value: [...twelve, "word"].map((w) => w.slice(0, 3)) }))
      .toMatch(/more than 12 items/);
  });

  it("prose in a key, too many spaces, a long token, a deep value, too many words are refused", () => {
    expect(fixes({ path: RANGE, from: "self", value: { "the creature must save or fall": 1 } })).toMatch(/dataFixes\[0\]\.value/);
    expect(fixes({ path: RANGE, from: "self", value: "a b c d e" })).toMatch(/dataFixes\[0\]\.value/);
    expect(fixes({ path: RANGE, from: "self", value: "x".repeat(41) })).toMatch(/dataFixes\[0\]\.value/);
    expect(fixes({ path: RANGE, from: "self", value: "it's" })).toMatch(/dataFixes\[0\]\.value/);
    expect(fixes({ path: RANGE, from: "self", value: { a: { b: { c: { d: { e: 1 } } } } } })).toMatch(/deeper than 4/);
    const many = { alpha: "bravo", charlie: "delta", echo: "foxtrot", golf: "hotel", india: "juliet", kilo: "lima", mike: 1 };
    expect(fixes({ path: RANGE, from: "self", value: many })).toMatch(/more than 12 distinct words/);
    expect(fixes({ path: RANGE, from: "self", value: { formula: "@mod + 1d6[fire]", types: ["fire", "cold"] } })).toBe("");
  });

  it("from is required and a real guard: null, empty, blank and empty parts refused; 0 and false accepted", () => {
    expect(fixes({ path: RANGE, value: "touch" })).toMatch(/dataFixes\[0\]: from is required/);
    for (const from of [null, "", "   ", {}, [], { a: {} }, [[]]]) {
      expect(fixes({ path: RANGE, value: "touch", from }), JSON.stringify(from)).toMatch(/dataFixes\[0\]\.from/);
    }
    for (const from of [0, false, "self", { attack: null, save: null, override: false }]) {
      expect(fixes({ path: RANGE, value: 1, from }), JSON.stringify(from)).toBe("");
    }
  });

  it("create stays refused", () => {
    expect(fixes({ effect: EFF, create: { name: "x" } })).toMatch(/create is not for a drafter/);
  });
});

describe("the drafter limits are a gate that runs under --ci", () => {
  const core = { version: "1", facts: [], vocabulary: new Set(), identifiers: new Set(), validateEntry: () => [] };
  const record = (entry, extra = {}) => ({
    key: "tst:spell:x", identifier: "x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024", text: null,
    items: [{ origin: "official", match: "matched", identifier: "x", docId: "Of00Of11Of22Of33", activities: [ACT],
      effects: [EFF], data: { sha256: "0".repeat(64) } }],
    verdict: "entry", evidence: {}, rule: { handledIn: "table", adds: "x", entry, origins: ["official"], assert: ASSERT },
    ...extra
  });
  const schemaOf = (r) => runGates([r], { core, documents: {}, ci: true, legacy: new Map() }).failures[r.key]?.schema ?? [];
  const create = { dataFixes: [{ effect: EFF, create: { name: "A ward of the moon", changes: [{ key: "system.attributes.ac.bonus",
    mode: 2, value: "+10" }] } }] };
  const description = { dataFixes: [{ path: "system.description.value", from: "a", value: "the target falls" }] };

  it("create with prose, or a description fix, written straight into the registry fails the schema gate", () => {
    expect(schemaOf(record(create)).join("; ")).toMatch(/schema: dataFixes\[0\]: create is not for a drafter/);
    expect(schemaOf(record(description)).join("; ")).toMatch(/schema: dataFixes\[0\]\.path: not an allowed leaf/);
    expect(schemaOf(record({ gmAlert: "say it" })).join("; ")).toMatch(/schema: gmAlert: not a drafter key/);
    expect(schemaOf(record({ saveDamage: { [ACT]: "half" } }))).toEqual([]);
  });

  it("a person's override lets a person write any key; it is checked", () => {
    const person = { by: "person-1", because: "an effect the data lacks, written by hand" };
    expect(schemaOf(record(create, { evidence: { person } }))).toEqual([]);
    expect(validateRecord(record(create, { evidence: { person: { by: "rule", because: "x" } } })).join("; "))
      .toMatch(/evidence\.person/);
    expect(validateRecord(record(create, { evidence: { person: { ...person, because: "x".repeat(121) } } })).join("; "))
      .toMatch(/evidence\.person\.because/);
    expect(validateRecord(record(create, { evidence: { person: { ...person, extra: 1 } } })).join("; "))
      .toMatch(/evidence\.person/);
  });

  it("checkFixes fails a create of a non-legacy record without the override", () => {
    const docs = { official: { Of00Of11Of22Of33: { _id: "Of00Of11Of22Of33", system: {}, effects: [] } } };
    const ctx = { core: { getPath: () => undefined, matchesFrom: () => false }, documents: docs, legacy: new Map() };
    expect(checkFixes(record(create), ctx).failures.join("; ")).toMatch(/fixes: create goes to a person/);
    const person = { by: "person-1", because: "written by hand" };
    expect(checkFixes(record(create, { evidence: { person } }), ctx).failures).toEqual([]);
  });

  it.skipIf(!process.env.DAS_CORE)("gates --ci exits 1 on such a record (the real engine)", () => {
    const registry = join(dir, "registry");
    mkdirSync(registry);
    writeFileSync(join(registry, "tst.json"), JSON.stringify({ book: "TST", records: [record(description)] }));
    const cli = spawnSync("node", ["tools/pipeline/cli.mjs", "gates", "--ci"], { cwd: ROOT, encoding: "utf8",
      env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, DAS_CORE: process.env.DAS_CORE } });
    expect(cli.status).toBe(1);
    expect(cli.stderr).toMatch(/not an allowed leaf/);
  });
});

describe("text fields: printable ASCII; code, catalog and origin", () => {
  it("isPlainLine refuses anything outside 0x20-0x7E", () => {
    expect(isPlainLine("Adds a glow (10 ft).", 200)).toBe(true);
    for (const s of ["a‮b", "zero​width", "аlpha", "café", "a b", "tab\tx", "x y"]) {
      expect(isPlainLine(s, 200), JSON.stringify(s)).toBe(false);
    }
  });

  const rec = (rule) => ({
    key: "tst:spell:x", identifier: "x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024", text: null,
    items: [], verdict: "entry", evidence: {}, rule: { handledIn: "table", adds: "x", entry: {}, origins: ["official"],
      assert: ASSERT, ...rule }
  });

  it("adds, free and uncovered because are printable ASCII", () => {
    expect(validateRecord(rec({ adds: "Glows‮" })).join("; ")).toMatch(/rule\.adds/);
    const free = [{ given: {}, expect: { free: "hоmoglyph", damage: { fraction: 1 } } }];
    expect(validateRecord(rec({ assert: free })).join("; ")).toMatch(/expect\.free/);
    const uncovered = [{ origin: "ddb-importer", because: "no save​ activity" }];
    expect(validateRecord(rec({ uncovered })).join("; ")).toMatch(/uncovered\[0\]\.because/);
  });

  it("catalog is a kebab/dot identifier; origin a display label; code a script of the repository (non-legacy, R17, R18)", () => {
    expect(validateRecord(rec({ catalog: "option", origin: "Fey Wanderer 3", code: "scripts/shadow-blade.mjs" }))).toEqual([]);
    expect(validateRecord(rec({ catalog: null }))).toEqual([]);
    expect(validateRecord(rec({ catalog: "Eldritch Invocation" })).join("; ")).toMatch(/rule\.catalog/);
    for (const origin of ["x".repeat(61), "Fey Wanderer\u00a03", "Line\nbreak", ""]) {
      expect(validateRecord(rec({ origin })).join("; "), JSON.stringify(origin)).toMatch(/rule\.origin/);
    }
    expect(validateRecord(rec({ origin: "x".repeat(60) }))).toEqual([]);
    for (const code of ["scripts/Blade.mjs", "scripts/../x.mjs", "/scripts/x.mjs", "scripts/x.js", "tools/x.mjs", "blade",
      `scripts/${"x".repeat(85)}.mjs`, "scripts/a//b.mjs", "scripts/-x.mjs"]) {
      expect(validateRecord(rec({ code })).join("; "), code).toMatch(/rule\.code/);
    }
    expect(validateRecord(rec({ code: "scripts/rules/book.mjs" }))).toEqual([]);
  });

  it("the schema gate fails a code script that is not in the repository, under --ci too", () => {
    const core = { version: "1", facts: [], vocabulary: new Set(), identifiers: new Set(), validateEntry: () => [] };
    const schema = (code) => runGates([rec({ code })], { core, documents: {}, ci: true, legacy: new Map() })
      .failures["tst:spell:x"]?.schema ?? [];
    expect(schema("scripts/shadow-blade.mjs")).toEqual([]);
    expect(schema("scripts/no-such-script.mjs").join("; ")).toMatch(/schema: rule\.code: scripts\/no-such-script\.mjs is not/);
  });

  it("the legacy rules' code and origin values pass these formats anyway", () => {
    const dir = join(ROOT, "registry");
    const ruled = readdirSync(dir).filter((f) => f.endsWith(".json") && !NOT_BOOKS.includes(f))
      .flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")).records).filter((r) => r.rule);
    const values = ruled.flatMap((r) => ["code", "origin"].filter((f) => f in r.rule).map((f) => [r.key, f, r.rule[f]]));
    expect(values).toHaveLength(10);
    for (const [key, f, v] of values) {
      const { legacy, legacyStatus, ...plain } = { ...r0(), rule: { ...r0().rule, [f]: v } };
      expect(validateRecord(plain), `${key} ${f}`).toEqual([]);
      if (f === "code") expect(existsSync(join(ROOT, v)), v).toBe(true);
    }
  });
});

const r0 = () => ({
  key: "tst:spell:x", identifier: "x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024", text: null,
  items: [], verdict: "entry", evidence: {}, rule: { handledIn: "table", adds: "x", entry: {}, origins: ["official"],
    assert: ASSERT }
});

describe("the quotation check normalises both sides", () => {
  const TEXT = "Alpha beta, gamma delta; epsilon zeta eta theta iota kappa lambda mu.";
  const record = (rule) => ({
    key: "tst:spell:x", identifier: "x", name: "X", kind: "spell", book: "TST", page: 1, edition: "2024",
    text: { sha256: cacheText(dir, TEXT), source: "dataset", chars: TEXT.length }, items: [], verdict: "entry", evidence: {},
    rule: { handledIn: "table", adds: "Adds a glow.", entry: {}, origins: ["official"], assert: ASSERT, ...rule }
  });
  const quoted = (rule) => checkText(record(rule), { textDir: dir }).failures.join("; ");
  const EIGHT = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];

  it("hyphens, slashes, zero-width separators and fullwidth letters do not hide a quote", () => {
    expect(quoted({})).toBe("");
    expect(quoted({ adds: EIGHT.slice(0, 7).join(" ") })).toBe("");
    for (const adds of [EIGHT.join("-"), EIGHT.join("/"), EIGHT.join("​"), EIGHT.join(" ").toUpperCase(),
      "ａｌｐｈａ beta gamma delta epsilon zeta eta theta"]) {
      expect(quoted({ adds }), JSON.stringify(adds)).toMatch(/text: rule\.adds quotes 8 or more/);
    }
  });

  it("a quote split across fields is caught, and uncovered because is checked", () => {
    const assert = [{ given: { free: EIGHT.slice(4).join(" ") }, expect: { damage: { fraction: 1 } } }];
    expect(quoted({ adds: EIGHT.slice(0, 4).join(" "), assert }))
      .toMatch(/text: the rule's prose together quotes 8 or more/);
    const uncovered = [{ origin: "ddb-importer", because: EIGHT.join(" ") }];
    expect(quoted({ uncovered })).toMatch(/text: rule\.uncovered\[0\]\.because quotes/);
    expect(quoted({ origin: EIGHT.join(" ") })).toMatch(/text: rule\.origin quotes/);
    expect(quoted({ origin: EIGHT.slice(0, 4).join(" "), adds: EIGHT.slice(4).join(" ") }))
      .toMatch(/text: the rule's prose together quotes/);
  });
});

describe("move.distance: numbers, operators and known @ references", () => {
  const move = (distance) => assertProblems([{ given: {}, expect: { move: { mode: "push", distance } } }]).join("; ");

  it("accepts the engine's references and refuses words", () => {
    for (const ok of [5, "10", "@mod * 5", "@prof + 5", "@scale.monk.distance", "@abilities.str.mod * 5", "@item.level * 5",
      "@attributes.prof", "@details.level", "@flags.x.y"]) {
      expect(move(ok), String(ok)).toBe("");
    }
    for (const bad of ["@the @target @must @fall", "@modifier", "@target.x", "10 feet", "@mod feet", "@scale", "2d6"]) {
      expect(move(bad), bad).toMatch(/expect\.move\.distance/);
    }
  });
});

describe("queue.json entries are validated", () => {
  it("the real queue.json passes", () => {
    const queue = JSON.parse(readFileSync(join(ROOT, "registry", "queue.json"), "utf8"));
    expect(queue.length).toBeGreaterThan(100);
    for (const e of queue) expect(validateTriageQueueEntry(e), e.key).toEqual([]);
  });

  it("malformed entries are refused", () => {
    const ok = { key: "tst:spell:x", verdict: "entry", why: "w", confidence: 0.5, by: "reader-1", reason: "low-confidence" };
    expect(validateTriageQueueEntry(ok)).toEqual([]);
    const bad = [{ ...ok, key: 1 }, { ...ok, verdict: "maybe" }, { ...ok, confidence: 2 }, { ...ok, junk: true },
      { ...ok, by: "rule" }, { ...ok, second: { verdict: "data", why: "w", confidence: 0.5 } },
      { ...ok, third: { verdict: "none", why: "w", confidence: 0.5, by: "t-1", extra: 1 } }];
    for (const e of bad) expect(validateTriageQueueEntry(e), JSON.stringify(e)).not.toEqual([]);
  });

  it("gates --ci exits non-zero on a malformed queue.json", () => {
    const registry = join(dir, "registry");
    mkdirSync(registry);
    writeFileSync(join(registry, "tst.json"), JSON.stringify({ book: "TST", records: [] }));
    writeFileSync(join(registry, "queue.json"), JSON.stringify([{ key: "tst:spell:x", junk: true }]));
    const cli = spawnSync("node", ["tools/pipeline/cli.mjs", "gates", "--ci"], { cwd: ROOT, encoding: "utf8",
      env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, DAS_CORE: process.env.DAS_CORE ?? join(dir, "none") } });
    expect(cli.status).not.toBe(0);
    expect(cli.stderr).toMatch(/queue\.json/);
  });
});
