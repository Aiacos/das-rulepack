import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestDrafts, ruleOriginLabel } from "../../tools/pipeline/draft.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { embeddedIndex } from "../../tools/pipeline/settle.mjs";
import { SHARED_EMBEDDED } from "../../tools/pipeline/identifiers.mjs";
import {
  emittedFingerprint, loadQueue, ruleFingerprint, saveBook, saveQueue, stateOf, validateRecord, writeFilesAtomically
} from "../../tools/pipeline/registry.mjs";
import {
  CORE_IDENTIFIER, EDITION_IDENTIFIER, SHARED_IDENTIFIER, identifierClashReasons
} from "../../tools/pipeline/batch.mjs";
import { gateUnique } from "../../tools/pipeline/gates.mjs";

// Synthetic fixtures only: invented entries, invented words.
const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
const AT = "2026-01-01T00:00:00.000Z";
const A_OFF = "Af11Bf22Cf33Df44";
const A_DDB = "Ad11Bd22Cd33Dd44";
const E_OFF = "Ef11Ef22Ef33Ef44";
const DOC_OFF = "Do11Do22Do33Do44";
const DOC_DDB = "Dd11Dd22Dd33Dd44";
// A stand-in for loadCore: the engine refuses an entry that marks itself with `noOpportunity: "flying"`.
const core = {
  version: "9.9.9", facts: ["actor.prone"], identifiers: new Set(["in-core"]), vocabulary: new Set(),
  validateEntry: (entry) => (entry.noOpportunity === "flying" ? ["noOpportunity: refused by the engine"] : []),
  moments: ["failedSave", "endOfTurn"], statuses: ["prone"], creatureTypes: ["undead"], moveModes: ["push"],
  effectEnds: ["bearerTurnEnd"], damageTypes: ["fire"]
};

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "draft-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const item = (origin, over = {}) => ({
  origin, match: "matched", identifier: "frost-glimmer", docId: origin === "official" ? DOC_OFF : DOC_DDB,
  activities: [origin === "official" ? A_OFF : A_DDB], effects: origin === "official" ? [E_OFF] : [],
  data: { sha256: (origin === "official" ? "a" : "b").repeat(64) }, ...over
});
const record = (over = {}) => {
  const { body, ...rest } = over;
  const sha = cacheText(textDir, body ?? BODY);
  return {
    key: "tst:spell:frost-glimmer", name: "Frost Glimmer", kind: "spell", book: "TST", page: 3, edition: "2024",
    identifier: "frost-glimmer", text: { sha256: sha, source: "5etools", chars: 10 },
    items: [item("official"), item("ddb-importer"), { origin: "plutonium", match: "unchecked" }],
    verdict: "entry", why: "a save halves it", evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9 } }, ...rest
  };
};
const ASSERT = [{ given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } }];
const rule = (over = {}) => ({
  handledIn: "table", adds: "A save halves the damage.", entry: { saveDamage: { [A_OFF]: "half", [A_DDB]: "half" } },
  origins: ["official", "ddb-importer"], assert: ASSERT, ...over
});
const result = (over = {}) => ({
  key: "tst:spell:frost-glimmer", outcome: "rule", why: "half on a save", confidence: 0.9, rule: rule(), ...over
});
// By default the batch offered every record of the call (`offered`: the keys of the batch file's entries).
const run = (records, results, opts = {}) => ingestDrafts(records, results, {
  textDir, by: "drafter-1", at: AT, core, offered: new Set(records.map((r) => r.key)), ...opts
});
const reasonOf = (out) => out.rejected.map((r) => r.reason).join(" | ");

describe("ingestDrafts: applied", () => {
  it("applies a valid two-origin rule", () => {
    const r = record();
    const out = run([r], [result()]);
    expect(out.rejected).toEqual([]);
    expect(out.applied).toEqual([r.key]);
    const next = out.records[0];
    expect(next.rule).toEqual(rule());
    expect(next.verdict).toBe("entry");
    expect(next.evidence.drafted).toEqual({ by: "drafter-1", at: AT, core: "9.9.9", rule: ruleFingerprint(next.rule) });
    expect(next.evidence.triaged).toEqual(r.evidence.triaged);
    expect(validateRecord(next)).toEqual([]);
    expect(stateOf(next)).toBe("drafted");
    // The input is not changed.
    expect(r.rule).toBeUndefined();
  });

  it("fills alsoAs from identifierDiffers", () => {
    const ddb = item("ddb-importer", { identifier: "frost-glimmer-ddb", identifierDiffers: true });
    const r = record({ items: [item("official"), ddb] });
    const out = run([r], [result()]);
    expect(out.rejected).toEqual([]);
    expect(out.records[0].rule.alsoAs).toEqual([{ identifier: "frost-glimmer-ddb", origin: "ddb-importer" }]);
  });

  it("never registers a generic or DAS · Core identifier as an alias: the origin must be uncovered", () => {
    for (const identifier of ["new-item", "in-core"]) {
      const r = record({ items: [item("official"), item("ddb-importer", { identifier, identifierDiffers: true })] });
      const out = run([r], [result()]);
      expect(out.applied).toEqual([]);
      expect(reasonOf(out)).toMatch(/ddb-importer.*rule\.uncovered/);
    }
  });

  it("derives rule.origin from the owner and level of a feature (Ruling R17)", () => {
    expect(ruleOriginLabel({ kind: "feature", owner: "Ranger/Fey Wanderer", level: 3 })).toBe("Fey Wanderer 3");
    expect(ruleOriginLabel({ kind: "monster", owner: "Glimmer Drake" })).toBe("Glimmer Drake");
    expect(ruleOriginLabel({ kind: "spell" })).toBeUndefined();
    expect(ruleOriginLabel({ kind: "feature", owner: "X".repeat(70), level: 3 })).toBeUndefined();
    const r = record({ key: "tst:feature:ranger/fey-wanderer/3/frost-glimmer", kind: "feature", owner: "Ranger/Fey Wanderer",
      level: 3 });
    const out = run([r], [result({ key: r.key })]);
    expect(out.rejected).toEqual([]);
    expect(out.records[0].rule.origin).toBe("Fey Wanderer 3");
  });

  it("accepts a key the vocabulary cannot assert (a person reads it at review, Ruling R15 generalised)", () => {
    // Fix round 1 of Ruling R25: noReactions now implies `denies: reactions`; effectDurations implies nothing.
    const entry = { effectDurations: { [E_OFF]: { seconds: 60 } } };
    const out = run([record()], [result({ rule: rule({
      entry, origins: ["official"], uncovered: [{ origin: "ddb-importer", because: "its item has no effect" }],
      assert: [{ given: { roll: "failedSave" }, expect: { affects: "target" } }]
    }) })]);
    expect(out.rejected).toEqual([]);
    const next = out.records[0];
    expect(next.rule.entry).toEqual(entry);
    // Stamped for Task 6: the review sends it to a person whatever the reviewer says.
    expect(next.evidence.drafted).toMatchObject({ person: true, because: "effectDurations" });
    expect(validateRecord(next)).toEqual([]);
    // The stamp cannot be dropped silently: the schema requires it while the key is there, and the gate evidence covers it.
    const { person, because, ...bare } = next.evidence.drafted;
    const stripped = { ...next, evidence: { ...next.evidence, drafted: bare } };
    expect(validateRecord(stripped).join(" ")).toMatch(/needs person: true, because: "effectDurations"/);
    expect(emittedFingerprint(stripped)).not.toBe(emittedFingerprint(next));
    expect(validateRecord({ ...next, evidence: { ...next.evidence, drafted: { ...bare, person: true } } }).join(" "))
      .toMatch(/person and because go together/);
    expect(validateRecord({ ...next, evidence: { ...next.evidence, drafted: { ...bare, person: true, because: "other" } } })
      .join(" ")).toMatch(/draftedForPersonReasons/);
    // A rule whose keys the vocabulary says carries no stamp (noReactions included, since fix round 1).
    expect(run([record()], [result({ rule: rule({ entry: { noReactions: [E_OFF] }, origins: ["official"],
      uncovered: [{ origin: "ddb-importer", because: "its item has no effect" }],
      assert: [{ given: { roll: "failedSave" }, expect: { denies: "reactions" } }] }) })]).records[0].evidence.drafted)
      .not.toHaveProperty("person");
    expect(run([record()], [result()]).records[0].evidence.drafted).not.toHaveProperty("person");
  });

  it("scopes a monster feature to its creature and binds its unique embedded item id", () => {
    const own = "Bt11Bt22Bt33Bt44";
    const m = record({
      key: "tst:monster:glimmer-drake/action/bite", kind: "monster", name: "Bite", owner: "Glimmer Drake", section: "action",
      identifier: "bite",
      items: [item("official", { identifier: "bite", docId: `Ac11Ac22Ac33Ac44.${own}` }),
        item("ddb-importer", { identifier: "bite" })]
    });
    const embedded = new Map([["TST", embeddedIndex([{ name: "Glimmer Drake", items: [{ docId: `Ac11Ac22Ac33Ac44.${own}` }] }])]]);
    const res = result({ key: m.key, rule: rule({
      entry: { saveDamage: { [A_OFF]: "half" } }, origins: ["official"],
      uncovered: [{ origin: "ddb-importer", because: "world ids" }]
    }) });
    const out = run([m], [res], { embedded });
    expect(out.rejected).toEqual([]);
    const next = out.records[0];
    expect(next.identifier).toBe("tst-glimmer-drake-bite");
    expect(next.sources).toEqual({ [own]: "tst-glimmer-drake-bite" });
    expect(next.rule.origin).toBe("Glimmer Drake");
    expect(next.rule.alsoAs).toBeUndefined();
  });
});

describe("ingestDrafts: queued", () => {
  it("queues engine and code outcomes without changing the verdict", () => {
    const r = record();
    const out = run([r], [
      { key: r.key, outcome: "engine", why: "needs a zone key", confidence: 0.9 }
    ]);
    expect(out.applied).toEqual([]);
    expect(out.queued).toEqual([{ key: r.key, reason: "engine", by: "drafter-1", why: "needs a zone key", confidence: 0.9 }]);
    expect(out.records[0]).toEqual(r);
    const code = run([r], [{ key: r.key, outcome: "code", why: "state across turns", confidence: 0.8 }]);
    expect(code.queued[0].reason).toBe("code");
    const person = run([r], [{ key: r.key, outcome: "person", why: "no drafter key", confidence: 0.8 }]);
    expect(person.queued[0].reason).toBe("person");
    expect(person.records[0].verdict).toBe("entry");
  });

  it("queues a rule below 0.7 with its draft, checked like any other", () => {
    const r = record();
    const out = run([r], [result({ confidence: 0.6 })]);
    expect(out.applied).toEqual([]);
    expect(out.queued).toEqual([{ key: r.key, reason: "low-confidence", by: "drafter-1", why: "half on a save",
      confidence: 0.6, draft: rule() }]);
    expect(out.records[0].rule).toBeUndefined();
    const bad = run([r], [result({ confidence: 0.6, rule: rule({ entry: { walls: {} } }) })]);
    expect(bad.queued).toEqual([]);
    expect(bad.rejected).toHaveLength(1);
  });

  it("queues a rule on a DAS · Core identifier: a person decides inCore", () => {
    const r = record({ identifier: "in-core", items: [item("official", { identifier: "in-core" }),
      item("ddb-importer", { identifier: "in-core" })] });
    const out = run([r], [result()]);
    expect(out.rejected).toEqual([]);
    expect(out.applied).toEqual([]);
    expect(out.queued).toEqual([{ key: r.key, reason: CORE_IDENTIFIER, by: "drafter-1", why: "half on a save", confidence: 0.9,
      draft: rule() }]);
    expect(out.records[0].rule).toBeUndefined();
  });

  it("queues a rule whose identifier another entry or ruled record of its edition registers", () => {
    const twin = record({ key: "tst:spell:frost-glimmer-twin" });
    const out = run([record(), twin], [result()]);
    expect(out.applied).toEqual([]);
    expect(out.queued.map((q) => q.reason)).toEqual([SHARED_IDENTIFIER]);
    // A twin that will never register (verdict none) does not stand in the way.
    expect(run([record(), { ...twin, verdict: "none" }], [result()]).applied).toEqual(["tst:spell:frost-glimmer"]);
  });

  it("a non-rule outcome carries no rule, a rule outcome needs one", () => {
    expect(reasonOf(run([record()], [result({ outcome: "person" })]))).toMatch(/only outcome rule carries a rule/);
    expect(reasonOf(run([record()], [result({ rule: undefined })]))).toMatch(/outcome rule needs a rule/);
  });
});

describe("ingestDrafts: one rejection per reason", () => {
  const rejects = (res, pattern, records = [record()], opts) => {
    const out = run(records, [res], opts);
    expect(out.applied).toEqual([]);
    expect(out.queued).toEqual([]);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0].reason).toMatch(pattern);
    return out;
  };

  it("an unknown field", () => rejects(result({ note: "x" }), /unknown field "note"/));
  it("evidence, at any level of the result", () => {
    rejects(result({ evidence: { person: { by: "owner" } } }), /unknown field "evidence"/);
    rejects(result({ rule: rule({ evidence: {} }) }), /unknown field "rule\.evidence"/);
  });
  it("a field the tools derive", () => {
    for (const f of ["verdict", "identifier", "sources"]) rejects(result({ [f]: "x" }), new RegExp(`unknown field "${f}"`));
    for (const f of ["code", "alsoAs", "inCore", "origin", "verdict"]) {
      rejects(result({ rule: rule({ [f]: f === "inCore" ? true : "scripts/x.mjs" }) }), new RegExp(`unknown field "rule\\.${f}"`));
    }
  });
  it("a key named __proto__, constructor or prototype", () => {
    const res = JSON.parse(JSON.stringify(result()).replace('"saveDamage":', '"__proto__":{},"saveDamage":'));
    rejects(res, /__proto__/);
  });
  it("an unknown key", () => rejects(result({ key: "tst:spell:nothing" }), /unknown key/));
  it("a verdict that is not entry", () => rejects(result(), /verdict is data/, [record({ verdict: "data" })]));
  it("a record that already has a rule", () => {
    rejects(result(), /already has a rule/, [record({ rule: rule() })]);
  });
  it("a legacy record", () => rejects(result(), /legacy/, [record({ legacy: true })]));
  it("a record waiting in the drafts queue", () => {
    const queue = [{ key: "tst:spell:frost-glimmer", reason: "person", by: "drafter-0", why: "w", confidence: 0.9 }];
    rejects(result(), /drafts-queue/, [record()], { queue });
  });
  it("the same key twice in the file", () => {
    const out = run([record()], [result(), result()]);
    expect(out.applied).toHaveLength(1);
    expect(reasonOf(out)).toMatch(/twice/);
  });
  it("no text in the cache", () => {
    rejects(result(), /no text/, [record({ text: { sha256: "f".repeat(64), source: "5etools", chars: 1 } })]);
  });
  it("an unknown outcome", () => rejects(result({ outcome: "entry" }), /unknown outcome/));
  it("a confidence out of range", () => rejects(result({ confidence: 2 }), /confidence/));
  it("a why that is not one short line", () => rejects(result({ why: "a\nb" }), /why/));
  it("schema errors", () => rejects(result({ rule: rule({ handledIn: "code" }) }), /handledIn/));
  it("an entry key a drafter may not write", () => rejects(result({ rule: rule({ entry: { walls: { sight: true } } }) }),
    /walls: not a drafter key/));
  it("a data fix that creates an effect", () => {
    const entry = { dataFixes: [{ create: { name: "x" } }] };
    rejects(result({ rule: rule({ entry, origins: ["official"], uncovered: [{ origin: "ddb-importer", because: "w" }] }) }),
      /create is not for a drafter/);
  });
  it("an entry the engine refuses", () => rejects(result({ rule: rule({ entry: { ...rule().entry, noOpportunity: "flying" } }) }),
    /refused by the engine/));
  it("an id of no origin (ids gate)", () => {
    rejects(result({ rule: rule({ entry: { saveDamage: { [A_OFF]: "half", Zz11Zz22Zz33Zz44: "half" } } }) }),
      /Zz11Zz22Zz33Zz44 belongs to no origin/);
  });
  it("a matched origin neither covered nor uncovered (ids gate)", () => {
    rejects(result({ rule: rule({ entry: { saveDamage: { [A_OFF]: "half" } }, origins: ["official"] }) }),
      /ddb-importer is matched but neither/);
  });
  it("a single-id key across two origins (ids gate)", () => {
    rejects(result({ rule: rule({ entry: { ...rule().entry, onHit: { save: A_OFF } } }) }), /onHit holds one id/);
  });
  it("rejects prose in entry strings", () => {
    const note = "delta epsilon zeta eta theta iota kappa lambda";
    const entry = { ...rule().entry, rollBonus: { activity: A_OFF, on: ["save"], note } };
    rejects(result({ rule: rule({ entry }) }), /quotes 8 or more|not a drafter|note/);
    const quoted = { saveDamage: { [A_OFF]: "half", [A_DDB]: "half" },
      saveAdvantage: ["delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda"] };
    rejects(result({ rule: rule({ entry: quoted }) }), /quotes/);
  });
  it("rejects a quotation in adds", () => {
    rejects(result({ rule: rule({ adds: "Gamma delta epsilon zeta eta theta iota kappa." }) }), /rule\.adds quotes 8/);
  });
  it("a quotation in why", () => {
    rejects(result({ why: "beta gamma delta epsilon zeta eta theta iota" }), /why contains a quotation/);
  });
  it("an empty or invalid assert", () => {
    rejects(result({ rule: rule({ assert: [] }) }), /rule\.assert: required/);
    rejects(result({ rule: rule({ assert: [{ given: {}, expect: { damage: { fraction: 3 } } }] }) }), /fraction/);
    rejects(result({ rule: rule({ assert: [{ given: {}, expect: { condition: { applied: "glowing" } } }] }) }),
      /status of the engine/);
  });
  it("a monster feature whose embedded item id another creature shares", () => {
    const own = "Bt11Bt22Bt33Bt44";
    const m = record({
      key: "tst:monster:glimmer-drake/action/bite", kind: "monster", name: "Bite", owner: "Glimmer Drake", section: "action",
      identifier: "bite", items: [item("official", { identifier: "bite", docId: `Ac11Ac22Ac33Ac44.${own}` })]
    });
    const embedded = new Map([["TST", embeddedIndex([
      { name: "Glimmer Drake", items: [{ docId: `Ac11Ac22Ac33Ac44.${own}` }] },
      { name: "Frost Drake", items: [{ docId: `Ac99Ac22Ac33Ac44.${own}` }] }
    ])]]);
    const res = result({ key: m.key, rule: rule({ entry: { saveDamage: { [A_OFF]: "half" } }, origins: ["official"] }) });
    const out = rejects(res, new RegExp(SHARED_EMBEDDED.slice(0, 30)), [m], { embedded });
    expect(out.records[0]).toEqual(m);
    expect(run([m], [res]).rejected[0].reason).toMatch(/actors of TST's package/);
  });
});

describe("fix round 1", () => {
  const rejected = (out) => {
    expect(out.applied).toEqual([]);
    expect(out.queued).toEqual([]);
    expect(out.rejected).toHaveLength(1);
    return out.rejected[0].reason;
  };

  it("rejects a missing or malformed rule.origins without aborting the other results", () => {
    const other = record({ key: "tst:spell:cold-snap", name: "Cold Snap", identifier: "tst-cold-snap" });
    for (const origins of [undefined, null, {}, "official", [], ["official", "official"], ["elsewhere"]]) {
      const bad = result({ rule: rule({ origins }) });
      if (origins === undefined) delete bad.rule.origins;
      const out = run([record(), other], [bad, { key: other.key, outcome: "person", why: "w", confidence: 0.9 }]);
      expect(out.rejected.map((x) => x.reason).join(" ")).toMatch(/rule\.origins/);
      expect(out.queued.map((q) => q.key)).toEqual([other.key]);
    }
  });

  it("turns any unexpected exception on one result into its rejection", () => {
    const boom = result();
    Object.defineProperty(boom, "confidence", { enumerable: true, get() { throw new Error("engineered failure"); } });
    const other = record({ key: "tst:spell:cold-snap", name: "Cold Snap", identifier: "tst-cold-snap" });
    const out = run([record(), other], [boom, { key: other.key, outcome: "person", why: "w", confidence: 0.9 }]);
    expect(out.rejected).toEqual([{ key: "tst:spell:frost-glimmer", reason: "internal: engineered failure" }]);
    expect(out.queued.map((q) => q.key)).toEqual([other.key]);
  });

  it("rejects a quotation split between why and the queued draft (either order)", () => {
    // words 1-4 of the text in why, 5-8 in adds; then the reverse.
    const split = result({ confidence: 0.5, why: "alpha beta gamma delta",
      rule: rule({ adds: "Epsilon zeta eta theta." }) });
    expect(rejected(run([record()], [split]))).toMatch(/why and the draft together quote/);
    const reverse = result({ confidence: 0.5, why: "epsilon zeta eta theta", rule: rule({ adds: "Alpha beta gamma delta." }) });
    expect(rejected(run([record()], [reverse]))).toMatch(/why and the draft together quote/);
    // The same check on a queue entry for a DAS · Core identifier.
    const r = record({ identifier: "in-core", items: [item("official", { identifier: "in-core" }),
      item("ddb-importer", { identifier: "in-core" })] });
    expect(rejected(run([r], [{ ...split, confidence: 0.9 }]))).toMatch(/why and the draft together quote/);
    // Apart, both halves are fine.
    expect(run([record()], [result({ confidence: 0.5, why: "alpha beta gamma delta" })]).queued).toHaveLength(1);
  });

  it("rejects a result the batch did not offer", () => {
    expect(rejected(run([record()], [result()], { offered: new Set() }))).toMatch(/not offered by this batch/);
    expect(() => ingestDrafts([record()], [result()], { textDir, by: "drafter-1", core })).toThrow(/offered/);
  });

  it("echoes at most 80 characters of any drafter string", () => {
    const long = `k${"x".repeat(150)}`;
    const reason = rejected(run([record()], [result({ rule: rule({ entry: { ...rule().entry, [long]: true } }) })]));
    expect(reason).not.toContain(long.slice(0, 81));
    expect(reason).toContain(long.slice(0, 80));
    expect(rejected(run([record()], [result({ [long]: 1 })]))).not.toContain(long.slice(0, 81));
  });

  it("rejects a monster result when the actors index is missing, without throwing", () => {
    const m = record({ key: "tst:monster:glimmer-drake/action/bite", kind: "monster", name: "Bite", owner: "Glimmer Drake",
      section: "action", identifier: "bite",
      items: [item("official", { identifier: "bite", docId: "Ac11Ac22Ac33Ac44.Bt11Bt22Bt33Bt44" })] });
    const res = result({ key: m.key, rule: rule({ entry: { saveDamage: { [A_OFF]: "half" } }, origins: ["official"] }) });
    expect(rejected(run([m], [res]))).toMatch(/actors of TST's package/);
  });

  it("stamps a rule that leaves official uncovered for a person at review (Ruling R21)", () => {
    const out = run([record()], [result({ rule: rule({ entry: { saveDamage: { [A_DDB]: "half" } }, origins: ["ddb-importer"],
      uncovered: [{ origin: "official", because: "its item carries no activity to bind" }] }) })]);
    expect(out.rejected).toEqual([]);
    const next = out.records[0];
    expect(next.evidence.drafted).toMatchObject({ person: true, because: "official-uncovered" });
    expect(validateRecord(next)).toEqual([]);
    const { person, because, ...bare } = next.evidence.drafted;
    expect(validateRecord({ ...next, evidence: { ...next.evidence, drafted: bare } }).join(" ")).toMatch(/official-uncovered/);
  });
});

describe("Ruling R22: identifiers shared per edition", () => {
  const ruled = (over) => ({ ...record(over), rule: rule(), evidence: { ...record(over).evidence } });
  const older = { key: "tst:spell:frost-glimmer-2014", edition: "2014" };

  it("a twin of another edition with no rule does not stand in the way: cut and applied", () => {
    const twin = record(older);
    expect(identifierClashReasons([record(), twin], new Set()).size).toBe(0);
    const out = run([record(), twin], [result()]);
    expect(out.applied).toEqual(["tst:spell:frost-glimmer"]);
    // and the gate then accepts the one rule
    expect(gateUnique(out.records, { core })).toEqual([]);
  });

  it("a twin of the same edition still does (left out, queued)", () => {
    const twin = record({ key: "tst:spell:frost-glimmer-twin" });
    expect(identifierClashReasons([record(), twin], new Set()).get(record().key)).toBe(SHARED_IDENTIFIER);
  });

  it("once a 2014 twin has a rule, the 2024 record needs an edition-scoped identifier (left out, queued, gate fails)", () => {
    const twin = ruled(older);
    expect(identifierClashReasons([record(), twin], new Set()).get(record().key)).toBe(EDITION_IDENTIFIER);
    const out = run([record(), twin], [result()]);
    expect(out.applied).toEqual([]);
    expect(out.queued.map((q) => q.reason)).toEqual([EDITION_IDENTIFIER]);
    // Forced through by hand anyway: the gate fails the later rule (the drafted one), not the earlier.
    const later = { ...ruled(), evidence: { ...record().evidence, drafted: { by: "drafter-1", at: AT, core: "9.9.9",
      rule: ruleFingerprint(rule()) } } };
    const failures = gateUnique([later, twin], { core });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/tst:spell:frost-glimmer: frost-glimmer is registered by tst:spell:frost-glimmer-2014/);
    expect(failures[0]).toMatch(/edition-scoped identifier bound through sources/);
  });

  it("the other direction: a 2024 rule exists, the 2014 twin's later rule fails", () => {
    const first = { ...ruled(), evidence: { ...record().evidence, drafted: { by: "drafter-1", at: "2026-01-01T00:00:00.000Z",
      core: "9.9.9", rule: ruleFingerprint(rule()) } } };
    const second = { ...ruled(older), evidence: { ...record(older).evidence, drafted: { by: "drafter-2",
      at: "2026-02-01T00:00:00.000Z", core: "9.9.9", rule: ruleFingerprint(rule()) } } };
    const failures = gateUnique([second, first], { core });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^unique: tst:spell:frost-glimmer-2014: frost-glimmer is registered by tst:spell:frost-glimmer /);
    expect(identifierClashReasons([first, record(older)], new Set()).get(older.key)).toBe(EDITION_IDENTIFIER);
    // Two ruled records of one edition keep today's message.
    const same = { ...second, key: "tst:spell:frost-glimmer-twin", edition: "2024" };
    expect(gateUnique([first, same], { core }).join(" ")).toMatch(/share the identifier frost-glimmer/);
  });
});

describe("writeFilesAtomically", () => {
  it("writes books and queue atomically (a failing second write leaves both unchanged)", () => {
    const dir = mkdtempSync(join(tmpdir(), "atomic-"));
    try {
      const a = join(dir, "tst.json");
      const b = join(dir, "drafts-queue.json");
      writeFileSync(a, "old book\n");
      writeFileSync(b, "old queue\n");
      let n = 0;
      const write = (path, text) => {
        n += 1;
        if (n === 2) throw new Error("disk full");
        writeFileSync(path, text);
      };
      expect(() => writeFilesAtomically([[a, "new book\n"], [b, "new queue\n"]], { write })).toThrow(/disk full/);
      expect(readFileSync(a, "utf8")).toBe("old book\n");
      expect(readFileSync(b, "utf8")).toBe("old queue\n");
      expect(readdirSync(dir).sort()).toEqual(["drafts-queue.json", "tst.json"]);
      writeFilesAtomically([[a, "new book\n"], [b, "new queue\n"]]);
      expect(readFileSync(a, "utf8")).toBe("new book\n");
      expect(readFileSync(b, "utf8")).toBe("new queue\n");
      expect(readdirSync(dir).sort()).toEqual(["drafts-queue.json", "tst.json"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("pipeline CLI: ingest --draft", () => {
  let tmp, registry, env;
  const cli = (args, over = {}) =>
    spawnSync("node", ["tools/pipeline/cli.mjs", ...args], { encoding: "utf8", env: { ...env, ...over } });
  const file = (body) => { const f = join(tmp, "draft.results.json"); writeFileSync(f, JSON.stringify(body)); return f; };
  // The batch file a results file answers (only `id`, `stage` and the entries' keys are read by the ingest).
  const batch = (id, keys = ["tst:spell:frost-glimmer", "tst:spell:cold-snap"]) => {
    const f = join(tmp, `${id}.json`);
    writeFileSync(f, JSON.stringify({ id, stage: "draft", entries: keys.map((key) => ({ key })) }));
    return f;
  };
  const withCore = it.skipIf(!process.env.DAS_CORE);

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "draft-cli-"));
    registry = join(tmp, "registry");
    // Fix round 1 (Ruling R24): ingest --draft reads the official structures from the dumps (an empty folder: none).
    mkdirSync(join(tmp, "dumps"), { recursive: true });
    env = { PATH: process.env.PATH, RULEPACK_TEXT: textDir, RULEPACK_REGISTRY: registry, RULEPACK_DUMPS: join(tmp, "dumps"),
      ...(process.env.DAS_CORE ? { DAS_CORE: process.env.DAS_CORE } : {}) };
    saveBook(registry, { book: "TST", records: [record(), record({ key: "tst:spell:cold-snap", name: "Cold Snap",
      identifier: "tst-cold-snap" })] });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("--draft with --second, --third, --overwrite or --review is a usage error", () => {
    for (const other of ["--second", "--third", "--overwrite", "--review", "--settle-unsure"]) {
      const r = cli(["ingest", file({ batch: "tst-draft-001", by: "drafter-1", results: [] }), "--draft", "--batch",
        batch("tst-draft-001"), other]);
      expect(r.status).toBe(2);
    }
  });

  withCore("refuses a results file with an unknown top-level field or a __proto__ key, writing nothing", () => {
    const before = readFileSync(join(registry, "tst.json"), "utf8");
    expect(cli(["ingest", file({ batch: "tst-draft-001", by: "drafter-1", results: [], evidence: {} }), "--draft", "--batch",
      batch("tst-draft-001")]).status).toBe(2);
    const proto = join(tmp, "proto.json");
    writeFileSync(proto, '{"batch":"tst-draft-001","by":"drafter-1","results":[{"key":"x","__proto__":{"a":1}}]}');
    const r = cli(["ingest", proto, "--draft", "--batch", batch("tst-draft-001")]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/__proto__/);
    expect(readFileSync(join(registry, "tst.json"), "utf8")).toBe(before);
  });

  withCore("applies, queues, prints the counts, exits 1 on a rejection; then the gates give gated", () => {
    const results = [
      { key: "tst:spell:frost-glimmer", outcome: "rule", why: "half on a save", confidence: 0.9,
        rule: { handledIn: "table", adds: "A save halves the damage.", entry: { saveDamage: { [A_OFF]: "half", [A_DDB]: "half" } },
          origins: ["official", "ddb-importer"], assert: ASSERT } },
      { key: "tst:spell:cold-snap", outcome: "person", why: "a zone: no drafter key", confidence: 0.9 },
      { key: "tst:spell:nothing", outcome: "person", why: "x", confidence: 0.9 }
    ];
    const r = cli(["ingest", file({ batch: "tst-draft-001", by: "drafter-1", results }), "--draft", "--batch",
      batch("tst-draft-001")]);
    expect(r.status, r.stderr).toBe(1);
    const printed = JSON.parse(r.stdout);
    expect(printed).toMatchObject({ applied: 1, queued: 1 });
    expect(printed.rejected).toEqual([{ key: "tst:spell:nothing", reason: expect.stringMatching(/unknown key/) }]);
    const book = JSON.parse(readFileSync(join(registry, "tst.json"), "utf8"));
    const ruled = book.records.find((x) => x.key === "tst:spell:frost-glimmer");
    expect(ruled.state).toBe("drafted");
    expect(ruled.evidence.drafted.by).toBe("drafter-1");
    expect(loadQueue(registry, "drafts")).toEqual([
      { key: "tst:spell:cold-snap", reason: "person", by: "drafter-1", why: "a zone: no drafter key", confidence: 0.9 }
    ]);
    // A second results file for the queued record is rejected; nothing changes.
    const second = { batch: "tst-draft-002", by: "drafter-2", results: [{ ...results[0], key: "tst:spell:cold-snap" }] };
    const again = cli(["ingest", file(second), "--draft", "--batch", batch("tst-draft-002", ["tst:spell:cold-snap"])]);
    expect(again.status).toBe(1);
    expect(again.stdout).toMatch(/drafts-queue/);

    const dumps = join(tmp, "dumps");
    const gates = cli(["gates"], { RULEPACK_DUMPS: dumps });
    expect(gates.stdout + gates.stderr).not.toMatch(/FAIL tst:spell:frost-glimmer/);
    const gated = JSON.parse(readFileSync(join(registry, "tst.json"), "utf8")).records
      .find((x) => x.key === "tst:spell:frost-glimmer");
    expect(gated.state).toBe("gated");
  });

  withCore("--draft needs --batch, a batch file of the same id and book; a key the batch did not offer is rejected", () => {
    const body = { batch: "tst-draft-001", by: "drafter-1", results: [] };
    expect(cli(["ingest", file(body), "--draft"]).stderr).toMatch(/--batch/);
    expect(cli(["ingest", file(body), "--draft"]).status).toBe(2);
    expect(cli(["ingest", file(body), "--draft", "--batch", batch("tst-draft-002")]).status).toBe(2);
    expect(cli(["ingest", file({ ...body, batch: "tst-triage-001" }), "--draft", "--batch", batch("tst-triage-001")]).status)
      .toBe(2);
    expect(cli(["ingest", file(body), "--draft", "--batch", batch("tst-draft-001", ["xzz:spell:other"])]).status).toBe(2);
    const offered = batch("tst-draft-001", ["tst:spell:frost-glimmer"]);
    const r = cli(["ingest", file({ ...body, results: [{ key: "tst:spell:cold-snap", outcome: "person", why: "w",
      confidence: 0.9 }] }), "--draft", "--batch", offered]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).rejected[0].reason).toMatch(/not offered by this batch/);
  });

  withCore("a result without the dumps is a usage error (a monster's, and since fix round 1 any)", () => {
    const m = record({ key: "tst:monster:glimmer-drake/action/bite", kind: "monster", name: "Bite", owner: "Glimmer Drake",
      section: "action", identifier: "bite" });
    saveBook(registry, { book: "TST", records: [m] });
    const body = { batch: "tst-draft-001", by: "drafter-1", results: [{ key: m.key, outcome: "person", why: "w", confidence: 1 }] };
    const r = cli(["ingest", file(body), "--draft", "--batch", batch("tst-draft-001", [m.key])], { RULEPACK_DUMPS: "" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/RULEPACK_DUMPS/);
  });

  it("writes nothing when the drafts queue on disk is invalid", () => {
    saveQueue(registry, "drafts", []);
    writeFileSync(join(registry, "drafts-queue.json"), "[{\"key\":1}]\n");
    const before = readFileSync(join(registry, "tst.json"), "utf8");
    const r = cli(["ingest", file({ batch: "tst-draft-001", by: "drafter-1", results: [] }), "--draft", "--batch",
      batch("tst-draft-001")]);
    expect(r.status).not.toBe(0);
    expect(readFileSync(join(registry, "tst.json"), "utf8")).toBe(before);
    expect(existsSync(join(registry, "tst.json"))).toBe(true);
  });
});
