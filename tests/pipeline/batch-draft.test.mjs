import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cutDraftBatches, draftSkipReason, draftVocabulary } from "../../tools/pipeline/batch.mjs";
import { DRAFT_KEYS } from "../../tools/pipeline/draft-keys.mjs";
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
    const [b] = cutDraftBatches([rec(1), rec(2, { verdict: "none" }), rec(3, { verdict: null })], { core });
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
    expect(draftSkipReason(bad, {})).toBe("monster feature that cannot be scoped");
    const [b] = cutDraftBatches([m, bad], { core });
    expect(b.entries.map((e) => [e.key, e.identifier])).toEqual([["tst:monster:a/b", "tst-beast-bite"]]);
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

  it("examples come from similar first, else from the rules sharing most keys; at most two, drafter keys only", () => {
    const similar = rec(1, {
      evidence: { triaged: { by: "reader-1", confidence: 0.9, keys: ["saveDamage", "halfOnMiss"], similar: ["beta-rule"] } }
    });
    const bySharedKeys = rec(2, {
      evidence: { triaged: { by: "reader-1", confidence: 0.9, keys: ["saveDamage.x", "halfOnMiss"], similar: [] } }
    });
    const [b] = cutDraftBatches([similar, bySharedKeys], { core });
    const [a, c] = b.entries;
    expect(a.examples.map((e) => e.identifier)).toEqual(["beta-rule", "gamma-rule"]);
    expect(c.examples.map((e) => e.identifier)).toEqual(["gamma-rule", "alpha-rule"]);
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

  it("no text is embedded: only the fingerprint, and no field beyond the triage fields", () => {
    const text = { sha256: sha(1), source: "5etools", chars: 5, body: "SECRET WORDS" };
    const [b] = cutDraftBatches([rec(1, { text })], { core });
    expect(JSON.stringify(b)).not.toContain("SECRET");
    expect(b.entries[0].textSha).toBe(sha(1));
    expect(Object.keys(b.entries[0]).sort()).toEqual([
      "edition", "examples", "identifier", "items", "key", "keys", "kind", "name", "page", "similar", "textSha", "why"
    ]);
  });
});

describe("draftVocabulary", () => {
  it("holds engine words only, whatever the records are", () => {
    const v = draftVocabulary(core);
    expect(Object.keys(v).sort()).toEqual(["assert", "draftKeys", "engine", "fixes", "limits"]);
    expect(v.draftKeys.saveDamage).toEqual({ slot: "activityMap" });
    expect(v.engine).toMatchObject({ moments: ["failedSave"], stepTypes: ["status"], statuses: ["prone"], facts: ["actor.prone"] });
    expect(v.assert.rolls).toContain("failedSave");
    expect(v.limits).toMatchObject({ addsMax: 200, freeMax: 120, quoteWords: 8, entryWords: 60 });
    expect(Object.keys(v.fixes.paths).length).toBeGreaterThan(0);
    expect(JSON.stringify(v)).not.toMatch(/tst|Spell|s1/);
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
  it.skipIf(!withCore)("writes the batches and the vocabulary; a queued key is left out", () => {
    saveQueue(registry, "drafts", [{ key: "tst:spell:s02", reason: "person", by: "reader-1", why: "x", confidence: 0.9 }]);
    mkdirSync(join(tmp, "dumps"));
    const env = { DAS_CORE: process.env.DAS_CORE, RULEPACK_DUMPS: join(tmp, "dumps") };
    const r = run(["batch", "draft", "TST", "--out", out, "--structure", structure], env);
    expect(r.status).toBe(0);
    expect(readdirSync(out).sort()).toEqual(["draft-vocabulary.json", "tst-draft-001.json"]);
    const b = JSON.parse(readFileSync(join(out, "tst-draft-001.json"), "utf8"));
    expect(b.entries.map((e) => e.key)).toEqual(["tst:spell:s01"]);
    expect(b.allowed.saveDamage).toEqual({ slot: "activityMap" });
    expect(existsSync(join(structure, "tst-draft-001.structure.json"))).toBe(true);
    const again = run(["batch", "draft", "TST", "--out", out, "--structure", structure], env);
    expect(again.status).toBe(0);
    expect(readdirSync(out)).toContain("tst-draft-002.json");
  });
  void writeFileSync;
});
