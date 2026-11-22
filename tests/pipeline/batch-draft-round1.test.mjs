import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cutDraftBatches, draftReport, draftVocabulary } from "../../tools/pipeline/batch.mjs";
import { highestBatches } from "../../tools/pipeline/batch.mjs";
import { DRAFT_KEYS, DRAFT_SHAPES, draftKeysFor } from "../../tools/pipeline/draft-keys.mjs";
import { assertProblems } from "../../tools/pipeline/assert.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { loadCore } from "../../tools/pipeline/core.mjs";
import { saveBook } from "../../tools/pipeline/registry.mjs";
import { variants } from "./fixtures/shapes.mjs";

// Synthetic fixtures only: invented text and entries.
const sha = (n) => String(n).padStart(64, "0");
const item = (over = {}) => ({
  origin: "official", match: "matched", identifier: "x", docId: "Dd00Cc11Bb22Aa33", activities: ["Aa11Bb22Cc33Dd44"],
  effects: [], data: { sha256: "h" }, ...over
});
const rec = (n, over = {}) => ({
  key: `tst:spell:s${String(n).padStart(2, "0")}`, name: `Spell ${n}`, kind: "spell", book: "TST", page: n, edition: "2024",
  identifier: `s${n}`, text: { sha256: sha(n), source: "5etools", chars: 5 }, verdict: "entry", why: "a short reason of my own",
  evidence: { triaged: { by: "reader-1", confidence: 0.9, keys: [], similar: [] } }, items: [item()], ...over
});
const TEXT = "the quick brown fox jumps over the lazy dog while the rain falls on the quiet hill tonight";
const core = {
  shipped: {
    "long-rule": {
      saveDamage: { Aa11Bb22Cc33Dd44: "half" }, halfOnMiss: true, noOpportunity: "always", targets: { types: ["undead"] }
    },
    "short-rule": { halfOnMiss: true }, "other-rule": { saveDamage: { Aa11Bb22Cc33Dd44: "none" }, label: "Une etiquette" }
  },
  moments: ["failedSave"], stepTypes: ["status"], facts: [], statuses: ["prone"], creatureTypes: ["undead"],
  moveModes: ["push"], effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"], abilities: ["str"]
};

describe("I1: why is kept only when it passes the quotation check", () => {
  const textOf = (r) => (r.text.sha256 === sha(1) ? TEXT : r.text.sha256 === sha(2) ? "unrelated words only" : null);
  it("withholds a why that repeats 8 consecutive words of the text, and counts it", () => {
    const quoting = rec(1, { why: "while the rain falls on the quiet hill tonight is the case" });
    const clean = rec(2, { why: "my own reason" });
    const report = {};
    const [b] = cutDraftBatches([quoting, clean], { core, textOf, report });
    expect(b.entries[0]).not.toHaveProperty("why");
    expect(b.entries[1].why).toBe("my own reason");
    expect(report.whyWithheld).toBe(1);
  });
  it("fails closed: no text for the entry, or no way to read it, withholds the why", () => {
    const noText = rec(3, { why: "fine" });
    expect(cutDraftBatches([noText], { core, textOf, report: {} })[0].entries[0]).not.toHaveProperty("why");
    expect(cutDraftBatches([rec(2)], { core })[0].entries[0]).not.toHaveProperty("why");
  });
  it("keeps 7 shared words (below the rule's limit of 8)", () => {
    const seven = rec(1, { why: "xx the quick brown fox jumps over the yy" });
    expect(cutDraftBatches([seven], { core, textOf })[0].entries[0].why).toContain("quick brown");
  });
});

describe("I2b: examples reach every entry, even when triage left keys empty", () => {
  it("attaches up to 3 examples from the shipped rules, stripped, deterministic", () => {
    const records = [rec(1), rec(2), rec(3, { identifier: "long-rule", verdict: null }),
      rec(4, { identifier: "short-rule", verdict: null })];
    const [b] = cutDraftBatches(records, { core });
    for (const e of b.entries) {
      expect(e.examples.length).toBeGreaterThan(0);
      expect(e.examples.length).toBeLessThanOrEqual(3);
    }
    expect(JSON.stringify(b)).not.toContain("etiquette");
    expect(cutDraftBatches(records, { core })).toEqual([b]);
  });
  it("the canonical example of a key is the shortest shipped entry that uses it", () => {
    const v = draftVocabulary(core, { records: [] });
    expect(v.keyExamples.halfOnMiss.identifier).toBe("short-rule");
    expect(v.keyExamples.saveDamage.identifier).toBe("other-rule");
    expect(JSON.stringify(v.keyExamples)).not.toContain("etiquette");
  });
});

describe("I2a: value shapes", () => {
  const lists = { moments: ["failedSave", "isHit", "isMissed"], statuses: ["prone"], creatureTypes: ["undead"], moveModes: ["push"],
    effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"], sizes: ["med", "lg"] };
  const vocabulary = { ...lists };
  it("every given and expect field has a shape, and values built from it pass assertProblems", () => {
    const v = draftVocabulary(core, {});
    const given = v.assert.shapes.given; const expectShapes = v.assert.shapes.expect;
    expect(Object.keys(given).sort()).toEqual(["activity", "damageType", "free", "moment", "onOwnTurn", "origin", "roll",
      "selfStatus", "spellLevelAtMost", "targetHp", "targetHpAtMost", "targetSizeAtMost", "targetStatus", "targetType",
      "targetWithin"]);
    expect(Object.keys(expectShapes).sort()).toEqual(["acBonus", "affects", "attackerTakes", "bars", "chooses", "condition",
      "counterattack", "damage", "denies", "ends", "free", "hitBecomes", "move", "reactionsPerRound", "roll", "sheds", "subjected",
      "teleports", "uses"]);
    let n = 0;
    for (const [field, shape] of Object.entries(given)) {
      for (const value of variants(shape)) {
        n++;
        // Ruling R34: a spell level goes with what a globe bars (a rule across fields, outside the declarative shape).
        const expectSide = field === "spellLevelAtMost" ? { bars: "spells" } : { damage: { fraction: 1 } };
        const problems = assertProblems([{ given: { [field]: value }, expect: expectSide }], { vocabulary });
        expect(problems, field).toEqual([]);
      }
    }
    for (const [field, shape] of Object.entries(expectShapes)) {
      for (const value of variants(shape)) {
        n++;
        const expectSide = field === "free" ? { free: value, damage: { fraction: 1 } } : { [field]: value };
        // Ruling R33: `subjected` goes with a zone or aura moment (a rule across fields, outside the declarative shape).
        // Ruling R38: a reaction word goes with its own moment.
        const given = field === "subjected" ? { moment: "ownTurnEnd" } : field === "counterattack" ? { moment: "isMissed" }
          : ["acBonus", "hitBecomes", "attackerTakes"].includes(field) ? { moment: "isHit" } : {};
        const problems = assertProblems([{ given, expect: expectSide }], { vocabulary });
        expect(problems, `${field} ${JSON.stringify(value)}`).toEqual([]);
      }
    }
    expect(n).toBeGreaterThan(20);
  });
  it("every drafter key has a shape", () => {
    const v = draftVocabulary(core, {});
    // Ruling R37: the vocabulary offers the keys the engine in use knows (draftKeysFor); every key has a shape all the same.
    expect(Object.keys(v.draftShapes).sort()).toEqual(Object.keys(draftKeysFor(core)).sort());
    expect(Object.keys(DRAFT_SHAPES).sort()).toEqual(Object.keys(DRAFT_KEYS).sort());
  });
});

describe.skipIf(!process.env.DAS_CORE)("I2a: the draft shapes against the engine's validator", () => {
  it("a value built from each key's shape (every alternative) is accepted by validateEntry", async () => {
    const real = await loadCore(process.env.DAS_CORE);
    const v = draftVocabulary({ ...real }, {});
    const { validateEntry } = await import(`${process.env.DAS_CORE}/module/scripts/core/content.mjs`);
    // Ruling R30: a trigger's condition names facts; the engine looks a fact up as a key of the object it is given (gates.mjs).
    const facts = Object.fromEntries(real.facts.map((name) => [name, true]));
    let n = 0;
    for (const [key, shape] of Object.entries(v.draftShapes)) {
      for (const value of variants(shape)) {
        n++;
        expect(validateEntry({ [key]: value }, { facts }), `${key} ${JSON.stringify(value)}`).toEqual([]);
      }
    }
    expect(n).toBeGreaterThan(60);
  });
});

describe("minor: numbering counts results files", () => {
  it("never reuses an id whose results exist", () => {
    expect(highestBatches(["tst-draft-001.json", "tst-draft-004.results.json", "tst-draft-002.structure.json"], "draft"))
      .toEqual({ tst: 4 });
  });
});

describe("I3 and the report file, through the CLI", () => {
  let tmp, registry, out, structure, dumps;
  const run = (args, env = {}) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], {
    encoding: "utf8", env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, ...env }
  });
  const withCore = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/content.mjs"));
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bdraft2-"));
    registry = join(tmp, "registry"); out = join(tmp, "out"); structure = join(tmp, "private"); dumps = join(tmp, "dumps");
    mkdirSync(dumps);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it.skipIf(!withCore)("refuses, writes nothing, when the book has monster records and its package has no dumps", () => {
    const mon = rec(1, { kind: "monster", key: "tst:monster:beast/bite", name: "Bite", owner: "Beast" });
    saveBook(registry, { book: "TST", records: [mon, rec(2)] });
    const env = { DAS_CORE: process.env.DAS_CORE, RULEPACK_DUMPS: dumps, RULEPACK_TEXT: join(tmp, "text") };
    const r = run(["batch", "draft", "TST", "--out", out, "--structure", structure], env);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/actors|dump/);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(structure)).toBe(false);
  });

  it("the report holds counts only", () => {
    const batches = [{ entries: [{ key: "a" }, { key: "b" }] }, { entries: [{ key: "c" }] }];
    const r = draftReport("TST", batches, { "no text": 2, "already ruled": 1 }, 4);
    expect(r).toEqual({ book: "TST", batches: 2, cut: 3, leftOut: { "already ruled": 1, "no text": 2 }, whyWithheld: 4 });
    expect(JSON.stringify(r)).not.toMatch(/"a"|"b"|"c"/);
  });

  const realDumps = process.env.RULEPACK_DUMPS && existsSync(join(process.env.RULEPACK_DUMPS));
  it.skipIf(!withCore || !realDumps)("writes the report file next to the batches (a synthetic book on real dumps)", () => {
    const records = [rec(1), rec(2, { rule: { handledIn: "table", adds: "x", entry: { halfOnMiss: true }, origins: ["official"],
      assert: [{ given: {}, expect: { damage: { fraction: 1 } } }] } }), rec(3, { text: null })]
      .map((r) => ({ ...r, book: "XPHB", key: r.key.replace("tst:", "xphb:") }));
    const textDir = join(tmp, "text");
    const sha1 = cacheText(textDir, "words of the page");
    records[0].text = { sha256: sha1, source: "5etools", chars: 5 };
    saveBook(registry, { book: "XPHB", records });
    const env = { DAS_CORE: process.env.DAS_CORE, RULEPACK_DUMPS: process.env.RULEPACK_DUMPS, RULEPACK_TEXT: textDir };
    const r = run(["batch", "draft", "XPHB", "--out", out, "--structure", structure], env);
    expect(r.status, r.stderr).toBe(0);
    const report = JSON.parse(readFileSync(join(out, "xphb-draft-report.json"), "utf8"));
    expect(report).toEqual({ book: "XPHB", batches: 1, cut: 1, leftOut: { "already ruled": 1, "no text": 1 }, whyWithheld: 0 });
    // Results files count in the numbering.
    writeFileSync(join(out, "xphb-draft-005.results.json"), "{}");
    expect(run(["batch", "draft", "XPHB", "--out", out, "--structure", structure], env).status).toBe(0);
    expect(readdirSync(out)).toContain("xphb-draft-006.json");
  }, 30_000); // spawns the CLI over the real dumps: seconds under a full parallel run
});
