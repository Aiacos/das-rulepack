import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CORE_IDENTIFIER, SHARED_IDENTIFIER, cutDraftBatches, draftSkipReason, draftVocabulary, identifierClashReasons
} from "../../tools/pipeline/batch.mjs";
import { embeddedIndex } from "../../tools/pipeline/settle.mjs";
import { DRAFT_KEYS, checkDraftKeys } from "../../tools/pipeline/draft-keys.mjs";
import { typeProblem } from "../../tools/pipeline/fix-types.mjs";
import { variants } from "./fixtures/shapes.mjs";
import { saveBook, saveQueue } from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented entries.
const sha = (n) => String(n).padStart(64, "0");
const item = (over = {}) => ({
  origin: "official", match: "matched", identifier: "x", docId: "Dd00Cc11Bb22Aa33", activities: ["Aa11Bb22Cc33Dd44"],
  effects: ["Ee11Ff22Gg33Hh44"], data: { sha256: "h" }, ...over
});
const rec = (n, over = {}) => ({
  key: `tst:spell:s${String(n).padStart(2, "0")}`, name: `Spell ${n}`, kind: "spell", book: "TST", page: n, edition: "2024",
  identifier: `s${n}`, text: { sha256: sha(n), source: "5etools", chars: 5 }, verdict: "entry", why: "a save each turn",
  evidence: { triaged: { by: "reader-1", at: "2026-01-01T00:00:00.000Z", confidence: 0.9, keys: ["saveDamage"], similar: [] } },
  items: [item()], ...over
});
const core = {
  shipped: {
    "alpha-rule": { saveDamage: { Aa11Bb22Cc33Dd44: "half" }, gmAlert: "some prose that is not a drafter key" },
    "beta-rule": { halfOnMiss: true }, "gamma-rule": { saveDamage: { Zz11Bb22Cc33Dd44: "none" }, halfOnMiss: true }
  },
  moments: ["failedSave"], stepTypes: ["status"], facts: ["actor.prone"], statuses: ["prone"], creatureTypes: ["undead"],
  moveModes: ["push"], effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"], abilities: ["str"]
};

describe("cutDraftBatches", () => {
  it("cuts entry records without a rule, adding identifier, keys, similar and why", () => {
    const records = [rec(1), rec(2, { verdict: "none" }), rec(3, { verdict: null })];
    const [b] = cutDraftBatches(records, { core, textOf: () => "other words" });
    expect(b.id).toBe("tst-draft-001");
    expect(b.stage).toBe("draft");
    expect(b.entries.map((e) => e.key)).toEqual(["tst:spell:s01"]);
    expect(b.entries[0]).toMatchObject({
      identifier: "s1", keys: ["saveDamage"], similar: [], why: "a save each turn", textSha: sha(1), name: "Spell 1"
    });
    expect(b.entries[0].items[0])
      .toMatchObject({ origin: "official", activities: ["Aa11Bb22Cc33Dd44"], effects: ["Ee11Ff22Gg33Hh44"] });
    expect(b.entries[0].items[0]).not.toHaveProperty("data");
  });

  it("leaves queued and ruled records out, and says why", () => {
    const ruled = rec(2, { rule: { handledIn: "table" } });
    const records = [rec(1), ruled, rec(3), rec(4, { text: null }), rec(5, { items: [{ origin: "official", match: "absent" }] })];
    const out = cutDraftBatches(records, { core, queued: new Set(["tst:spell:s03"]) });
    expect(out.flatMap((b) => b.entries.map((e) => e.key))).toEqual(["tst:spell:s01"]);
    const ctx = { queued: new Set(["tst:spell:s03"]) };
    expect(records.map((r) => draftSkipReason(r, ctx))).toEqual([
      null, "already ruled", "queued", "no text", "no matched item"
    ]);
  });

  it("leaves out a monster feature that cannot be scoped to its creature", () => {
    const m = rec(1, { kind: "monster", key: "tst:monster:a/b", name: "Bite", owner: "Beast" });
    const bad = rec(2, { kind: "monster", key: "tst:monster:c/d", name: "Claw" });
    expect(draftSkipReason(bad, { embedded: embeddedIndex([]) })).toBe("monster feature that cannot be scoped");
    const [b] = cutDraftBatches([m, bad], { core, embedded: embeddedIndex([]) });
    expect(b.entries.map((e) => [e.key, e.identifier])).toEqual([["tst:monster:a/b", "tst-beast-bite"]]);
  });

  it("leaves out a monster feature that can never pass the gates, each under its own reason", () => {
    const base = { kind: "monster", name: "Bite", owner: "Beast" };
    const shared = rec(1, { ...base, key: "tst:monster:a/b", items: [item({ embeddedShared: true })] });
    const ddbOnly = rec(2, { ...base, key: "tst:monster:c/d", items: [item({ origin: "ddb-importer" })] });
    const fine = rec(3, { ...base, key: "tst:monster:e/f" });
    expect([shared, ddbOnly, fine].map((r) => draftSkipReason(r, { embedded: embeddedIndex([]) }))).toEqual([
      "monster feature: shared embedded id, waits on upstream", "monster feature: no official item", null
    ]);
    const cut = cutDraftBatches([shared, ddbOnly, fine], { core, embedded: embeddedIndex([]) });
    expect(cut[0].entries.map((e) => e.key)).toEqual(["tst:monster:e/f"]);
    // Only monsters: a spell with a shared flag or without an official item is still drafted.
    expect(draftSkipReason(rec(4, { items: [item({ origin: "ddb-importer" })] }), {})).toBeNull();
  });

  describe("a monster feature's shared embedded id is decided from the actors, not from a flag on the record", () => {
    const own = "Ab12Cd34Ef56Gh78";
    const mon = (n, over = {}) => rec(n, {
      kind: "monster", name: "Bite", owner: "Beast", key: `tst:monster:beast/bite${n}`,
      items: [item({ docId: `Ac00Ac11Ac22Ac33.${own}` })], ...over
    });
    const actor = (name, ...ids) => ({ id: "Xx", name, items: ids.map((i) => ({ docId: `Xx.${i}` })) });
    it("is cut when no other creature embeds the id; same-name actors are the same creature", () => {
      const embedded = embeddedIndex([actor("Beast", own), actor("Beast", own, "Zz11Zz22Zz33Zz44")]);
      expect(draftSkipReason(mon(1), { embedded })).toBeNull();
      expect(mon(1).items[0]).not.toHaveProperty("embeddedShared");
    });
    it("is left out when another creature embeds it, though the record carries no flag", () => {
      const embedded = embeddedIndex([actor("Beast", own), actor("Other Beast", own)]);
      expect(draftSkipReason(mon(1), { embedded })).toBe("monster feature: shared embedded id, waits on upstream");
      expect(cutDraftBatches([mon(1), mon(2, { items: [item({ docId: "Ac00Ac11Ac22Ac33.Qq11Qq22Qq33Qq44" })] })],
        { core, embedded }).flatMap((b) => b.entries.map((e) => e.key))).toEqual(["tst:monster:beast/bite2"]);
    });
    it("is left out when its official item has no embedded id of 16 characters", () => {
      expect(draftSkipReason(mon(1, { items: [item({ docId: "short" })] }), { embedded: embeddedIndex([]) }))
        .toBe("monster feature: official item has no embedded id");
    });
    it("cannot be decided without the actors: the cut refuses rather than guess", () => {
      expect(() => draftSkipReason(mon(1), {})).toThrow(/actors/);
      expect(() => cutDraftBatches([mon(1)], { core })).toThrow(/actors/);
      expect(cutDraftBatches([rec(1)], { core }).length).toBe(1);
    });
  });

  it("puts records with a matched official item first, one kind per batch, kinds in the ruled order", () => {
    const ddb = rec(1, { items: [item({ origin: "ddb-importer" })] });
    const records = [ddb, rec(2), rec(3, { kind: "feat", key: "tst:feat:s03" }), rec(4, { kind: "spell" })];
    const out = cutDraftBatches(records, { core });
    expect(out.map((b) => b.entries.map((e) => e.key))).toEqual([
      ["tst:spell:s02", "tst:spell:s04", "tst:spell:s01"], ["tst:feat:s03"]
    ]);
    expect(cutDraftBatches(records, { core, kind: "feat" }).map((b) => b.entries.length)).toEqual([1]);
  });

  it("uses a default size of 20", () => {
    const records = Array.from({ length: 21 }, (_, i) => rec(i + 1));
    expect(cutDraftBatches(records, { core }).map((b) => b.entries.length)).toEqual([20, 1]);
  });

  it("numbering continues per series, after the highest number of the book", () => {
    const out = cutDraftBatches([rec(1), rec(2)], { core, size: 1, after: { tst: 4 } });
    expect(out.map((b) => b.id)).toEqual(["tst-draft-005", "tst-draft-006"]);
  });

  it("examples come from similar first, else from the rules sharing most keys; at most three, drafter keys only", () => {
    const similar = rec(1, {
      evidence: { triaged: { by: "reader-1", confidence: 0.9, keys: ["saveDamage", "halfOnMiss"], similar: ["beta-rule"] } }
    });
    const bySharedKeys = rec(2, {
      evidence: { triaged: { by: "reader-1", confidence: 0.9, keys: ["saveDamage.x", "halfOnMiss"], similar: [] } }
    });
    const [b] = cutDraftBatches([similar, bySharedKeys], { core });
    const [a, c] = b.entries;
    expect(a.examples.map((e) => e.identifier).slice(0, 2)).toEqual(["beta-rule", "gamma-rule"]);
    expect(c.examples.map((e) => e.identifier).slice(0, 2)).toEqual(["gamma-rule", "alpha-rule"]);
    for (const ex of [...a.examples, ...c.examples]) expect(Object.keys(ex.entry).every((k) => k in DRAFT_KEYS)).toBe(true);
    expect(JSON.stringify(b)).not.toContain("some prose");
  });

  it("takes examples from the gated rules of the pack too, and from a record key in similar", () => {
    const ruled = {
      ...rec(9, { identifier: "packed", verdict: "entry" }),
      rule: { handledIn: "table", adds: "x", origins: ["official"], assert: [], entry: { halfOnMiss: true } }
    };
    const pointer = rec(1, {
      evidence: { triaged: { by: "reader-1", confidence: 0.9, keys: ["halfOnMiss"], similar: ["tst:spell:s09"] } }
    });
    const [b] = cutDraftBatches([pointer], { core, ruled: [ruled], gated: () => true });
    expect(b.entries[0].examples[0]).toEqual({ identifier: "packed", entry: { halfOnMiss: true } });
    expect(cutDraftBatches([pointer], { core, ruled: [ruled], gated: () => false })[0].entries[0].examples[0].identifier)
      .not.toBe("packed");
  });

  it("examples carry ids, engine words and formulas only: labels, comments and prose are stripped, adds is never there", () => {
    const shipped = {
      "label-rule": {
        saveDamage: { Aa11Bb22Cc33Dd44: "half", note: "Reste en etat de choc" },
        triggers: [{ on: "failedSave", do: [{ type: "status", status: "prone", label: "Une etiquette", amount: "2d6+3" }] }],
        gmAlert: "prose", adds: "NOT HERE", free: "NOT HERE"
      }
    };
    const legacy = {
      ...rec(9, { identifier: "old-rule", legacy: true }),
      rule: { handledIn: "table", adds: "LEGACY ADDS TEXT", origins: ["official"], assert: [{ free: "LEGACY FREE" }], entry: {
        halfOnMiss: true, noOpportunity: "Texte libre francais qui traine" } }
    };
    const pointer = rec(1, {
      evidence: { triaged: { by: "reader-1", confidence: 0.9, keys: ["saveDamage", "triggers"], similar: ["old-rule"] } }
    });
    const [b] = cutDraftBatches([pointer], { core: { ...core, shipped }, ruled: [legacy], gated: () => true });
    const out = JSON.stringify(b);
    for (const bad of ["NOT HERE", "LEGACY", "etat de choc", "etiquette", "francais", "prose"]) expect(out).not.toContain(bad);
    const strings = [];
    const walk = (n) => {
      if (typeof n === "string") strings.push(n);
      else if (n && typeof n === "object") Object.values(n).forEach(walk);
    };
    b.entries[0].examples.forEach((e) => walk(e.entry));
    const words = new Set([...core.moments, ...core.stepTypes, ...core.statuses]);
    for (const str of strings) {
      const ok = /^[A-Za-z0-9]{16}$/.test(str) || words.has(str) || /^\d+d\d+([+-]\d+)?$/.test(str)
        || ["half", "none"].includes(str);
      expect(ok, str).toBe(true);
    }
    expect(b.entries[0].examples.map((e) => e.identifier)).toContain("label-rule");
    expect(b.entries[0].examples.find((e) => e.identifier === "label-rule").entry.triggers[0].do[0]).toEqual({
      type: "status", status: "prone", amount: "2d6+3"
    });
  });

  it("no text is embedded: only the fingerprint, and no field beyond the triage fields", () => {
    const text = { sha256: sha(1), source: "5etools", chars: 5, body: "SECRET WORDS" };
    const [b] = cutDraftBatches([rec(1, { text })], { core, textOf: () => "x" });
    expect(JSON.stringify(b)).not.toContain("SECRET");
    expect(b.entries[0].textSha).toBe(sha(1));
    expect(Object.keys(b.entries[0]).sort()).toEqual([
      "edition", "examples", "identifier", "items", "key", "keys", "kind", "name", "page", "similar", "textSha", "why"
    ]);
  });
});

const ACT = "Ac00Ac11Ac22Ac33";

describe("draftVocabulary: the type of every allowed fix path", () => {
  const v = draftVocabulary(core);
  const cases = Object.entries(v.fixes.types).flatMap(([where, leaves]) => Object.entries(leaves).map(([leaf, d]) => {
    const path = where === "activity" ? `system.activities.${ACT}.${leaf}` : leaf;
    return { where, leaf, d, fix: { path, ...(where === "effect" ? { effect: "Ef00Ef11Ef22Ef33" } : {}) } };
  }));

  it("says how a fix is written, with examples the drafter check accepts", () => {
    expect(Object.keys(v.fixes.shape)).toEqual(["activity", "item", "effect"]);
    expect(v.fixes.shape.activity.path).toBe("system.activities.<activity id>.<a leaf of paths.activity>");
    expect(v.fixes.shape.effect.effect).toBe("<effect id>");
    expect(v.fixes.examples.length).toBe(3);
    for (const fix of v.fixes.examples) {
      const problems = checkDraftKeys({ dataFixes: [fix] }, { origins: ["official"], kind: "spell" });
      expect(problems.filter((x) => x.startsWith("dataFixes")), JSON.stringify(fix)).toEqual([]);
    }
    // The form two drafters guessed (the leaf alone, the id beside it) is not one of them, and is refused.
    const guessed = { activity: ACT, path: "save.ability", from: [], value: ["str"] };
    const refused = checkDraftKeys({ dataFixes: [guessed] }, { origins: ["official"], kind: "spell" });
    expect(refused.join(" ")).toMatch(/not an allowed leaf/);
  });

  it("describes every path of FIX_PATHS, and only those", () => {
    for (const [where, paths] of Object.entries(v.fixes.paths)) {
      expect(Object.keys(v.fixes.types[where]).sort(), where).toEqual([...paths].sort());
    }
  });

  it("every value built from the description (each alternative of an either, each enum word) is accepted, for every path", () => {
    expect(cases.length).toBeGreaterThan(40);
    let n = 0;
    for (const { where, leaf, d, fix } of cases) {
      for (const value of variants(d)) {
        n++;
        const entry = { dataFixes: [{ ...fix, value, from: value }] };
        const problems = checkDraftKeys(entry, { origins: ["official"], kind: "spell" });
        expect(problems, `${where} ${leaf} ${JSON.stringify(value)}`).toEqual([]);
      }
    }
    // consumption.targets `target` is an either (id | path): both alternatives are among the variants.
    const targets = variants(v.fixes.types.activity["consumption.targets"]).map((x) => x[0].target);
    expect(targets).toContain("Ab12Cd34Ef56Gh78");
    expect(targets).toContain("abc.def");
    expect(n).toBeGreaterThan(cases.length);
  });

  it("the description is plain JSON: no function, and a list or enum states its items or words", () => {
    expect(JSON.parse(JSON.stringify(v.fixes.types))).toEqual(v.fixes.types);
    expect(v.fixes.types.activity["range.units"]).toMatchObject({ type: "enum" });
    expect(v.fixes.types.activity["range.units"].values).toContain("ft");
    expect(v.fixes.types.activity["damage.parts"]).toMatchObject({ type: "list", item: { type: "object" } });
    expect(v.fixes.types.activity["range.value"]).toEqual({ type: "number" });
  });

  it("the one interpreter refuses what the description does not describe", () => {
    expect(typeProblem({ type: "enum", enum: "rangeUnits" }, "furlong")).toMatch(/one of/);
    expect(typeProblem({ type: "list", item: { type: "number" } }, "x")).toBe("a list");
  });
});

describe("draftVocabulary", () => {
  it("holds engine words only, whatever the records are", () => {
    const v = draftVocabulary(core);
    expect(Object.keys(v).sort()).toEqual(["assert", "conditions", "definitions", "draftKeys", "draftShapes", "endsExamples",
      "engine", "fixes", "keyExamples", "leaves", "limits", "monsters", "zones"]);
    expect(v.draftKeys.saveDamage).toEqual({ slot: "activityMap" });
    expect(v.engine).toMatchObject({ moments: ["failedSave"], stepTypes: ["status"], statuses: ["prone"], facts: ["actor.prone"] });
    expect(v.assert.rolls).toContain("failedSave");
    expect(v.limits).toMatchObject({ addsMax: 200, freeMax: 120, quoteWords: 8, entryWords: 60 });
    expect(Object.keys(v.fixes.paths).length).toBeGreaterThan(0);
    // The definitions are the pack's own, about engine words (the moment castsSpell included): nothing of the records.
    // (Ruling R30: the engine's fact activity.isSpell is a word of the vocabulary, not the records' "Spell <n>".)
    const { definitions, ...rest } = v;
    expect(JSON.stringify(rest)).not.toMatch(/tst|Spell \d|s1/);
    expect(JSON.stringify(definitions)).not.toMatch(/tst|s1/);
  });
});

describe("pipeline CLI: batch draft", () => {
  let tmp, registry, out, structure;
  const run = (args, env = {}) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], {
    encoding: "utf8", env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, ...env }
  });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "bdraft-"));
    registry = join(tmp, "registry");
    out = join(tmp, "out");
    structure = join(tmp, "private");
    saveBook(registry, { book: "TST", records: [rec(1), rec(2)] });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("requires --structure, and refuses a structure folder inside the repository", () => {
    const r = run(["batch", "draft", "TST", "--out", out]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--structure");
    expect(existsSync(out)).toBe(false);
    const inside = run(["batch", "draft", "TST", "--out", out, "--structure", join(process.cwd(), "tmp-private")]);
    expect(inside.status).toBe(2);
  });

  it("refuses an unknown kind and a bad size", () => {
    expect(run(["batch", "draft", "TST", "--out", out, "--structure", structure, "--kind", "zzz"]).status).toBe(2);
    expect(run(["batch", "draft", "TST", "--out", out, "--structure", structure, "--size", "0"]).status).toBe(2);
  });

  const withCore = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/content.mjs"));
  it.skipIf(!withCore)("refuses a book whose package has no dump files, writing nothing", () => {
    mkdirSync(join(tmp, "dumps"));
    const env = { DAS_CORE: process.env.DAS_CORE, RULEPACK_DUMPS: join(tmp, "dumps"), RULEPACK_TEXT: join(tmp, "text") };
    const r = run(["batch", "draft", "TST", "--out", out, "--structure", structure], env);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/no dump file/);
    expect(existsSync(out)).toBe(false);
  });
  void writeFileSync;
});

describe("records the unique gate would fail whatever is drafted", () => {
  it("leaves out a DAS · Core identifier and one shared with another entry or ruled record, by their own reasons", () => {
    const ruled = rec(9, { identifier: "s9", rule: { handledIn: "table", adds: "x", entry: { halfOnMiss: true },
      origins: ["official"], assert: [{ given: {}, expect: { damage: { fraction: 1 } } }] } });
    const records = [rec(1), rec(2, { identifier: "in-core" }), rec(3, { identifier: "s9" }), rec(4, { identifier: "s1" }),
      rec(5, { identifier: "s5" }), rec(6, { identifier: "s5", verdict: "none" }), ruled];
    const clashes = identifierClashReasons(records, new Set(["in-core"]));
    expect(records.map((r) => draftSkipReason(r, { clashes }))).toEqual([
      SHARED_IDENTIFIER, CORE_IDENTIFIER, SHARED_IDENTIFIER, SHARED_IDENTIFIER, null, null, "already ruled"
    ]);
    const cut = cutDraftBatches(records, { core, clashes, textOf: () => "other words" });
    expect(cut.flatMap((b) => b.entries.map((e) => e.key))).toEqual(["tst:spell:s05"]);
  });

  it("reads an unruled monster feature under its creature-scoped identifier", () => {
    const m = (n, owner) => rec(n, { key: `tst:monster:${n}/action/bite`, kind: "monster", name: "Bite", owner,
      section: "action", identifier: "bite" });
    const clashes = identifierClashReasons([m(1, "Glimmer Drake"), m(2, "Frost Drake")], new Set(["bite"]));
    expect(clashes.size).toBe(0);
    expect(identifierClashReasons([m(1, "Glimmer Drake"), m(2, "Glimmer Drake")], new Set()).size).toBe(2);
  });
});
