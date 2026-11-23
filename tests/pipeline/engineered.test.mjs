// Ruling R43: an engineered rule, written by an engineer outside the drafter vocabulary, is proven by a recorded live play
// of a hand-written scenario instead of a review. Synthetic fixtures only: invented entries, words, ids and engine keys.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheText } from "../../tools/pipeline/text.mjs";
import {
  ruleFingerprint, saveBook, saveQueue, loadQueue, loadBook, stateOf, validateRecord
} from "../../tools/pipeline/registry.mjs";
import { gateSchema, runGates } from "../../tools/pipeline/gates.mjs";
import { emissionOf, HELD_REASONS, ruleFromRecord } from "../../tools/pipeline/generate.mjs";
import { redraftable, reviewSkipReason } from "../../tools/pipeline/batch.mjs";
import { ingestReviews } from "../../tools/pipeline/review.mjs";
import { playedFrom, STAMP } from "../../tools/pipeline/played.mjs";
import {
  ENGINEERED_UNCOVERED, engineeredFileProblem, ingestEngineered
} from "../../tools/pipeline/engineered.mjs";
import {
  HANDWRITTEN_MARK, handWrittenProblems, planOf, scenarioIdOf, stampedHandWritten
} from "../../tools/pipeline/scenarios.mjs";
import { handWritten } from "../../play/lib/handwritten.mjs";
import { timing } from "../../play/lib/steps.mjs";
import { countsLine } from "../../tools/books-progress.mjs";

const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
const AT = "2026-01-01T00:00:00.000Z";
const ACT = "Ea11Eb22Ec33Ed44";
const EFF = "Ef11Ef22Ef33Ef44";
const DDB_ACT = "Ad11Bd22Cd33Dd44";
const DOC = "Do11Do22Do33Do44";
const DOC_DDB = "Dd11Dd22Dd33Dd44";
const OTHER = "Ot11Ot22Ot33Ot44";
const BY = "engineer-1";
// A stand-in for loadCore: the engine knows the drafter keys used here and two invented keys outside the drafter vocabulary
// (`glimmerWard`, `quuxStride`); it refuses a `glimmerWard` that is not `true`.
const core = {
  version: "9.9.9", facts: [], identifiers: new Set(["in-core"]), vocabulary: new Set(),
  entryKeys: new Set(["saveDamage", "dataFixes", "glimmerWard", "quuxStride"]),
  validateEntry: (entry) => (Object.hasOwn(entry, "glimmerWard") && entry.glimmerWard !== true
    ? ["glimmerWard: true or absent"] : []),
  getPath: (o, path) => String(path).split(".").reduce((x, k) => (x == null ? undefined : x[k]), o),
  matchesFrom: (current, from) => JSON.stringify(current) === JSON.stringify(from),
  moments: [], statuses: [], creatureTypes: [], moveModes: [], effectEnds: [], damageTypes: []
};

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "engineered-")); timing.scale = 0; });
afterEach(() => { rmSync(textDir, { recursive: true, force: true }); timing.scale = 1; });

const item = (origin) => ({
  origin, match: "matched", identifier: "frost-glimmer", docId: origin === "official" ? DOC : DOC_DDB,
  activities: [origin === "official" ? ACT : DDB_ACT], effects: origin === "official" ? [EFF] : [],
  data: { sha256: (origin === "official" ? "a" : "b").repeat(64) }
});
const record = (over = {}) => ({
  key: "tst:spell:frost-glimmer", name: "Frost Glimmer", kind: "spell", book: "TST", page: 3, edition: "2024",
  identifier: "frost-glimmer", text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
  items: [item("official"), item("ddb-importer"), { origin: "plutonium", match: "unchecked" }],
  verdict: "entry", why: "a ward glimmers", evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9 } }, ...over
});
const result = (over = {}) => ({
  key: "tst:spell:frost-glimmer", entry: { glimmerWard: true }, adds: "The wizzle glows and the quux stays out.",
  why: "the engine key does what the entry asks", ...over
});
const run = (records, results, opts = {}) => ingestEngineered(records, results, { textDir, by: BY, at: AT, core, ...opts });
const reasons = (out) => out.rejected.map((r) => r.reason).join(" | ");
// The engineered record after its gates pass (runGates writes evidence.gates on a clean record).
const gated = (over = {}) => {
  const out = run([record()], [result(over)]);
  expect(reasons(out)).toBe("");
  const { updated, failures } = runGates(out.records, { core, documents: {}, textDir, ci: false, legacy: new Map(),
    owners: ["owner"] });
  expect(failures).toEqual({});
  return updated[0];
};
const playedOn = (r, rule = ruleFingerprint(r.rule)) => ({ ...r, evidence: { ...r.evidence,
  played: { at: AT, core: "9.9.9", world: "test-world", scenario: scenarioIdOf(r), client: "gm", rule } } });

describe("ingest --engineered (Ruling R43): accepted", () => {
  it("writes the rule with engineered { by, at }, no drafted evidence, the official origin only", () => {
    const out = run([record()], [result()]);
    expect(out.rejected).toEqual([]);
    expect(out.applied).toEqual(["tst:spell:frost-glimmer"]);
    const next = out.records[0];
    expect(next.rule).toEqual({ handledIn: "table", adds: "The wizzle glows and the quux stays out.",
      entry: { glimmerWard: true }, origins: ["official"],
      uncovered: [{ origin: "ddb-importer", because: ENGINEERED_UNCOVERED }], engineered: { by: BY, at: AT } });
    expect(next.evidence.drafted).toBeUndefined();
    expect(validateRecord(next)).toEqual([]);
    expect(stateOf(next)).toBe("drafted");
  });

  it("a key outside the drafter vocabulary passes the schema gate only on an engineered rule", () => {
    const next = run([record()], [result()]).records[0];
    const ctx = { core, textDir, legacy: new Map(), owners: ["owner"] };
    expect(gateSchema(next, ctx)).toEqual([]);
    const { engineered, ...drafted } = next.rule;
    expect(gateSchema({ ...next, rule: { ...drafted, assert: [{ given: { roll: "hit" }, expect: { damage: { fraction: 1 } } }] } },
      ctx).join(" ")).toContain("glimmerWard: not a drafter key");
  });

  it("ids of another item pass when listed in otherItems, and are checked against the dumps when given", () => {
    const otherItems = [{ docId: OTHER, why: "the summoned wisp the ward calls" }];
    const ok = run([record()], [result({ entry: { glimmerWard: true, quuxStride: OTHER }, otherItems })],
      { dumpIds: new Set([OTHER]) });
    expect(reasons(ok)).toBe("");
    expect(ok.records[0].rule.engineered).toEqual({ by: BY, at: AT, otherItems });
    const missing = run([record()], [result({ entry: { glimmerWard: true, quuxStride: OTHER }, otherItems })],
      { dumpIds: new Set() });
    expect(reasons(missing)).toContain(`other item ${OTHER} is in no dump`);
  });

  it("a leavesNote is kept on engineered, one line, quotation-checked", () => {
    const out = run([record()], [result({ leavesNote: "The quux may still step in on a second try." })]);
    expect(reasons(out)).toBe("");
    expect(out.records[0].rule.engineered.leavesNote).toBe("The quux may still step in on a second try.");
  });

  it("a record waiting in drafts-queue.json leaves it", () => {
    const queue = [{ key: "tst:spell:frost-glimmer", reason: "person", by: "drafter-1", why: "no key", confidence: 0.9 }];
    const out = run([record()], [result()], { queue });
    expect(out.applied).toEqual(["tst:spell:frost-glimmer"]);
    expect(out.dequeued).toEqual(["tst:spell:frost-glimmer"]);
  });
});

describe("ingest --engineered: rejected, nothing half-written", () => {
  const cases = [
    ["a key outside ENTRY_KEYS", { entry: { glimmerWard: true, zorbleDance: true } }, "zorbleDance"],
    ["the engine's validateEntry", { entry: { glimmerWard: "yes" } }, "glimmerWard: true or absent"],
    ["an id that is no item's", { entry: { glimmerWard: true, quuxStride: OTHER } }, `${OTHER} belongs to no origin`],
    ["an untyped data fix", { entry: { dataFixes: [{ path: "system.name", value: "x", from: "y" }] } },
      "not an allowed leaf"],
    ["a quotation in adds", { adds: "Alpha beta gamma delta epsilon zeta eta theta." }, "rule.adds quotes"],
    ["a quotation in leavesNote", { leavesNote: "gamma delta epsilon zeta eta theta iota kappa" }, "leavesNote quotes"],
    ["a quotation in an otherItems why", { entry: { glimmerWard: true, quuxStride: OTHER },
      otherItems: [{ docId: OTHER, why: "beta gamma delta epsilon zeta eta theta iota" }] }, "otherItems[0].why quotes"],
    ["a quotation in why", { why: "iota kappa lambda mu nu xi omicron pi" }, "quotation"],
    ["leaves and leavesNote both", { leavesNote: "a note", leaves: [{ unexpressed: "no-key", count: 1 }] },
      "leaves or leavesNote"],
    ["an unknown field", { assert: [] }, "unknown field"],
    ["an otherItems id the entry does not name", { otherItems: [{ docId: OTHER, why: "a wisp" }] }, "not named by the entry"]
  ];
  for (const [what, over, reason] of cases) {
    it(`rejects ${what}`, () => {
      const r = record();
      const out = run([r], [result(over)]);
      expect(out.applied).toEqual([]);
      expect(reasons(out)).toContain(reason);
      expect(out.records[0]).toEqual(r);
    });
  }

  it("rejects a record that is legacy, ruled, not entry, triage-queued, or a DAS · Core identifier", () => {
    const ruled = record({ rule: { handledIn: "table", adds: "x", entry: {}, origins: ["official"] } });
    expect(reasons(run([record({ legacy: true })], [result()]))).toContain("legacy");
    expect(reasons(run([ruled], [result()]))).toContain("already has a rule");
    expect(reasons(run([record({ verdict: "none" })], [result()]))).toContain("not entry");
    expect(reasons(run([record()], [result()], { triageQueued: new Set(["tst:spell:frost-glimmer"]) })))
      .toContain("queue.json");
    expect(reasons(run([record({ identifier: "in-core" })], [result()]))).toContain("DAS · Core");
  });

  it("refuses a results file not signed by an engineer, or signed by an owner, or with another field", () => {
    expect(engineeredFileProblem({ by: BY, results: [] }, { owners: ["owner"] })).toBeNull();
    expect(engineeredFileProblem({ by: "drafter-1", results: [] }, { owners: ["owner"] })).toContain("engineer");
    expect(engineeredFileProblem({ by: "owner", results: [] }, { owners: ["owner"] })).toContain("engineer");
    expect(engineeredFileProblem({ by: "engineer-x", results: [] }, { owners: ["Engineer-X"] })).toContain("owner");
    expect(engineeredFileProblem({ by: BY, batch: "b", results: [] }, { owners: [] })).toContain("unknown field");
    expect(() => run([record()], [result()], { by: "drafter-1" })).toThrow(/engineer/);
  });

  it("an engineer handle is never a person's signature, and an owner never signs as an engineer", () => {
    const r = record({ evidence: { person: { by: "engineer-1", because: "signed", rule: "0".repeat(64) } } });
    expect(validateRecord(r).join(" ")).toContain("evidence.person.by");
    const next = run([record()], [result()]).records[0];
    const asOwner = { ...next, rule: { ...next.rule, engineered: { by: "engineer-owner", at: AT } } };
    expect(gateSchema(asOwner, { core, textDir, legacy: new Map(), owners: ["engineer-owner"] }).join(" "))
      .toContain("rule.engineered.by");
  });
});

describe("states and emission (Ruling R43)", () => {
  it("a gated engineered rule is never emitted before a play, nor by a review", () => {
    const r = gated();
    expect(stateOf(r)).toBe("gated");
    expect(emissionOf(r)).toEqual({ emitted: false, because: "not-played" });
    expect(HELD_REASONS["not-played"]).toContain("Ruling R43");
    const reviewed = { ...r, evidence: { ...r.evidence, reviewed: { by: "reviewer-1", at: AT, agrees: true,
      rule: ruleFingerprint(r.rule), confidence: 0.9 } } };
    expect(stateOf(reviewed)).toBe("gated");
    expect(emissionOf(reviewed).emitted).toBe(false);
    expect(ruleFromRecord(r)).toBeNull();
  });

  it("is emitted once a play about the rule as it is is recorded, status played", () => {
    const r = playedOn(gated());
    expect(stateOf(r)).toBe("played");
    expect(emissionOf(r)).toEqual({ emitted: true, because: "played" });
    expect(ruleFromRecord(r)).toMatchObject({ identifier: "frost-glimmer", status: "played", entry: { glimmerWard: true } });
  });

  it("a changed rule makes the play stale: held again", () => {
    const r = playedOn(gated());
    const edited = { ...r, rule: { ...r.rule, adds: "The wizzle glows brighter." } };
    expect(stateOf(edited)).toBe("drafted");
    expect(emissionOf(edited)).toBeNull();
    const { updated } = runGates([edited], { core, documents: {}, textDir, ci: false, legacy: new Map(), owners: ["owner"] });
    expect(stateOf(updated[0])).toBe("gated");
    expect(emissionOf(updated[0])).toEqual({ emitted: false, because: "play-stale" });
  });

  it("gates --ci accepts a gated engineered rule from its evidence", () => {
    const { failures } = runGates([gated()], { core, documents: {}, ci: true, legacy: new Map(), owners: ["owner"] });
    expect(failures).toEqual({});
  });
});

describe("reviews skip an engineered rule", () => {
  it("batch review leaves it out, and a review result for it is rejected", () => {
    const r = gated();
    expect(reviewSkipReason(r)).toBe("engineered: proven by play");
    // Nor does a drafter's redraft take it (Ruling R32 redrafts monster rules held as changing the engine's reading).
    expect(redraftable({ ...r, kind: "monster" })).toBe(false);
    const fp = ruleFingerprint(r.rule);
    const out = ingestReviews([r], [{ key: r.key, rule: fp, assert: [{ given: { roll: "hit" },
      expect: { damage: { fraction: 1 } } }], why: "a review", confidence: 0.9 }], { textDir, by: "reviewer-1", core,
    offered: new Map([[r.key, fp]]) });
    expect(out.rejected.map((x) => x.reason).join(" ")).toContain("engineered");
  });
});

describe("hand-written scenarios (Ruling R43)", () => {
  const json = (r, over = {}) => ({ scenario: scenarioIdOf(r), key: r.key, rule: ruleFingerprint(r.rule), handWritten: true,
    checks: 2, covers: "the ward keeps one quux out on a failed save", ...over });
  const MODULE = `${HANDWRITTEN_MARK}\nexport default {};\n`;

  it("the contract: exact fields, an engineered record, the current fingerprint, the marked module", () => {
    const r = gated();
    expect(handWrittenProblems(json(r), { record: r, module: MODULE })).toEqual([]);
    expect(handWrittenProblems(json(r, { rule: "0".repeat(64) }), { record: r, module: MODULE }).join(" "))
      .toContain("--stamp-handwritten");
    expect(handWrittenProblems(json(r), { record: r, module: "export default {};\n" }).join(" ")).toContain(HANDWRITTEN_MARK);
    expect(handWrittenProblems({ ...json(r), manual: false }, { record: r, module: MODULE }).join(" ")).toContain("manual");
    expect(handWrittenProblems(json(r, { covers: "beta gamma delta epsilon zeta eta theta iota" }), { record: r,
      module: MODULE, text: BODY }).join(" ")).toContain("covers quotes");
    const { engineered, ...plain } = r.rule;
    expect(handWrittenProblems(json(r), { record: { ...r, rule: plain }, module: MODULE }).join(" ")).toContain("engineered");
    const text = stampedHandWritten(json(r, { rule: "0".repeat(64) }), r);
    expect(JSON.parse(text)).toEqual(json(r));
  });

  it("planOf plans no generated scenario for an engineered rule", () => {
    expect(planOf([playedOn(gated())])).toEqual([]);
  });

  it("played records a passed hand-written play on a gated engineered rule", () => {
    const r = gated();
    const file = json(r);
    const log = [`▶ ${file.scenario}`, "    ✓ one", "    ✓ two",
      `    das-rulepack: ${file.scenario} core=9.9.9 rule=${file.rule} checks=2`, "  ✓ scénario tenu (2 vérifications)"].join("\n");
    const out = playedFrom([r], log, { scenarios: new Map([[file.scenario, file]]), world: "test-world", at: AT });
    expect(out.skipped).toEqual([]);
    expect(out.played).toEqual([r.key]);
    expect(stateOf(out.records[0])).toBe("played");
    // A generated-style file for an engineered rule, or a hand-written one for a reviewed rule, records nothing.
    const generated = { ...file, handWritten: undefined, manual: false };
    expect(playedFrom([r], log, { scenarios: new Map([[file.scenario, generated]]), world: "w", at: AT }).played).toEqual([]);
  });

  describe("the helper's stamp line", () => {
    // A stand-in for the runner's context (DAS_CORE tools/scenario.mjs makeContext), only what the helper calls.
    const fakeContext = () => {
      const log = [];
      let checks = 0;
      const ctx = {
        log: (...a) => log.push(a.join(" ")),
        expect: (ok, label) => { checks += 1; log.push(`${ok ? "✓" : "✗"} ${label}`); return !!ok; },
        get checks() { return checks; },
        restore: () => {},
        engine: async (fn) => (fn === "status" ? { version: "9.9.9" } : null)
      };
      return { ctx, log };
    };
    const play = async (file, body) => {
      const { ctx, log } = fakeContext();
      const s = handWritten(file, body);
      await s.run(ctx);
      return { name: s.name, log };
    };

    it("prints the stamp exactly as generated scenarios do when every declared check passed", async () => {
      const file = json(gated());
      const { name, log } = await play(file, async (h) => { h.expect(true, "one"); h.expect(true, "two"); });
      expect(name).toBe(file.scenario);
      expect(log.at(-1)).toBe(`das-rulepack: ${file.scenario} core=9.9.9 rule=${file.rule} checks=2`);
      expect(STAMP.test(log.at(-1))).toBe(true);
    });

    it("withholds it when an expectation failed", async () => {
      const { log } = await play(json(gated()), async (h) => { h.expect(true, "one"); h.expect(false, "two"); });
      expect(log.at(-1)).toMatch(/^stamp withheld: 1 expectation\(s\) failed/);
      expect(log.some((l) => l.startsWith("das-rulepack:"))).toBe(false);
    });

    it("withholds it when fewer checks ran than the JSON declares", async () => {
      const { log } = await play(json(gated()), async (h) => { h.expect(true, "one"); });
      expect(log.at(-1)).toMatch(/^stamp withheld: 1 check\(s\) ran, the scenario declares 2/);
    });

    it("withholds it when the JSON is not a hand-written scenario with a fingerprint", async () => {
      const { log } = await play(json(gated(), { rule: "stale" }), async (h) => { h.expect(true, "a"); h.expect(true, "b"); });
      expect(log.at(-1)).toMatch(/^stamp withheld: /);
    });
  });
});

describe("docs/RULES.md closing line", () => {
  const rule = { book: "TST", identifier: "frost-glimmer", status: "played" };
  it("counts engineered rules apart, and says nothing when there are none", () => {
    expect(countsLine([rule], { engineered: new Set(["TST|frost-glimmer"]) }))
      .toContain(" 1 of them engineered (Ruling R43): proven by a recorded play, not by a review.");
    expect(countsLine([rule])).not.toContain("engineered");
  });
});

describe("npm run scenarios with hand-written files", () => {
  let tmp, registry, playDir, env;
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", "scenarios", ...args], { encoding: "utf8", env });
  let r;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "engineered-cli-"));
    registry = join(tmp, "registry");
    playDir = join(tmp, "play");
    const dumps = join(tmp, "dumps");
    mkdirSync(dumps);
    env = { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_PLAY: playDir, RULEPACK_DUMPS: dumps };
    r = playedOn(gated());
    saveBook(registry, { book: "TST", records: [r] });
    mkdirSync(join(playDir, "tst"), { recursive: true });
    const slug = scenarioIdOf(r).split("/")[1];
    writeFileSync(join(playDir, "tst", `${slug}.json`), `${JSON.stringify({ scenario: scenarioIdOf(r), key: r.key,
      rule: ruleFingerprint(r.rule), handWritten: true, checks: 2, covers: "the ward keeps one quux out" }, null, 2)}\n`);
    writeFileSync(join(playDir, "tst", `${slug}.mjs`), `${HANDWRITTEN_MARK}\nexport default {};\n`);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));
  const files = () => ["json", "mjs"].map((e) => join(playDir, "tst", `${scenarioIdOf(r).split("/")[1]}.${e}`));

  it("the generator leaves the hand-written files alone, and --check accepts them", () => {
    const before = files().map((f) => readFileSync(f, "utf8"));
    const write = cli(["TST"]);
    expect(write.status, write.stderr).toBe(0);
    expect(files().map((f) => readFileSync(f, "utf8"))).toEqual(before);
    const check = cli(["TST", "--check"]);
    expect(check.status, check.stdout + check.stderr).toBe(0);
    expect(JSON.parse(check.stdout)).toMatchObject({ handWritten: 1, handWrittenProblems: [] });
  });

  it("--check flags a stale fingerprint; --stamp-handwritten refreshes it", () => {
    const edited = { ...r, rule: { ...r.rule, adds: "The wizzle glows brighter." } };
    saveBook(registry, { book: "TST", records: [edited] });
    const check = cli(["TST", "--check"]);
    expect(check.status).toBe(1);
    expect(check.stdout).toContain("--stamp-handwritten");
    const stamp = cli(["TST", "--stamp-handwritten"]);
    expect(stamp.status, stamp.stdout + stamp.stderr).toBe(0);
    expect(JSON.parse(readFileSync(files()[0], "utf8")).rule).toBe(ruleFingerprint(edited.rule));
    expect(existsSync(files()[1])).toBe(true);
    expect(cli(["TST", "--check"]).status).toBe(0);
  });
});

describe("npm run ingest -- <file> --engineered", () => {
  const CORE = process.env.DAS_CORE;
  it.skipIf(!CORE)("writes the rule, takes the record out of drafts-queue.json, and says so", () => {
    const tmp = mkdtempSync(join(tmpdir(), "engineered-ingest-"));
    try {
      const registry = join(tmp, "registry");
      saveBook(registry, { book: "TST", records: [record()] });
      saveQueue(registry, "drafts", [{ key: "tst:spell:frost-glimmer", reason: "person", by: "drafter-1", why: "no key",
        confidence: 0.9 }]);
      const file = join(tmp, "results.json");
      // `evasion: true` is a key of the engine's ENTRY_KEYS outside the drafter vocabulary (DAS_CORE's own validator).
      writeFileSync(file, JSON.stringify({ by: BY, results: [result({ entry: { evasion: true } })] }));
      const env = { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_TEXT: textDir, DAS_CORE: CORE };
      const out = spawnSync("node", ["tools/pipeline/cli.mjs", "ingest", file, "--engineered"], { encoding: "utf8", env });
      expect(out.status, out.stdout + out.stderr).toBe(0);
      expect(JSON.parse(out.stdout)).toMatchObject({ applied: 1, dequeued: ["tst:spell:frost-glimmer"], rejected: [] });
      expect(out.stderr).toContain("left drafts-queue.json");
      expect(loadQueue(registry, "drafts")).toEqual([]);
      expect(loadBook(registry, "TST").records[0].rule.engineered.by).toBe(BY);
      writeFileSync(file, JSON.stringify({ by: "drafter-1", results: [] }));
      expect(spawnSync("node", ["tools/pipeline/cli.mjs", "ingest", file, "--engineered"], { encoding: "utf8", env }).status)
        .toBe(2);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
});
