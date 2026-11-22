import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRunnerLog, playedFrom, STAMP } from "../../tools/pipeline/played.mjs";
import { scenarioFiles, scenarioOf } from "../../tools/pipeline/scenarios.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import {
  emittedFingerprint, gatedItems, loadBook, ruleFingerprint, saveBook, stateOf, validateRecord
} from "../../tools/pipeline/registry.mjs";
import { checkText } from "../../tools/pipeline/gates.mjs";

// Synthetic fixtures only: invented entries, invented words, invented ids; the runner's lines as DAS_CORE tools/scenario.mjs
// prints them (a block `▶ <name>`, its checks, the verdict `✓ scénario tenu (<n> vérifications)` or `✗ <n> … en défaut`).
const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
const AT = "2026-01-01T00:00:00.000Z";
const A_OFF = "Af11Bf22Cf33Df44";
const DOC = "Do11Do22Do33Do44";
const HALF = { given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } };
const packOf = () => "tst-pkg.spells";

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "played-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const reviewed = (name = "Frost Glimmer", { assert = [HALF] } = {}) => {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const r = {
    key: `tst:spell:${s}`, name, kind: "spell", book: "TST", page: 3, edition: "2024", identifier: s,
    text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
    items: [{ origin: "official", match: "matched", identifier: s, docId: DOC, activities: [A_OFF], effects: [],
      data: { sha256: "a".repeat(64) } }],
    verdict: "entry", why: "a save halves it",
    evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9, keys: [], similar: [] } },
    rule: { handledIn: "table", adds: "Zorbly the quux halves things.", entry: { saveDamage: { [A_OFF]: "half" } },
      origins: ["official"], assert }
  };
  const fp = ruleFingerprint(r.rule);
  r.evidence.drafted = { by: "drafter-zz9", at: AT, core: "9.9.9", rule: fp };
  r.evidence.gates = { at: AT, core: "9.9.9", rule: fp, emits: emittedFingerprint(r),
    passed: ["schema", "validator", "ids", "fixes", "text", "unique"], items: gatedItems(r) };
  r.evidence.reviewed = { by: "reviewer-1", at: AT, agrees: true, rule: fp, confidence: 0.9 };
  return r;
};
const stamp = (id, rule, checks = 1, core = "9.9.9") => `    das-rulepack: ${id} core=${core} rule=${rule} checks=${checks}`;
const block = (id, { lines = [], verdict = "  ✓ scénario tenu (1 vérification)" } = {}) =>
  [`\n▶ ${id}`, "    ✓ check 1: damage fraction 0.5 (applied 5 of 10)", "    ✓ check 1: savedSave", ...lines,
    "    ✓ aucune erreur dans la console du MJ", verdict].join("\n");
const logOf = (...blocks) => ["Préconditions : client du MJ fr, 0 joueur(s) connecté(s)", ...blocks, "\n1/1 scénario(s) tenus"]
  .join("\n");
const scenariosOf = (records) => new Map(records.map((r) => {
  const s = scenarioOf(r, { packOf });
  return [s.scenario, s];
}));
const run = (records, log, over = {}) => playedFrom(records, log, {
  scenarios: scenariosOf(records), world: "dnd-6", client: "gm", at: AT, ...over
});

describe("the stamp line (Ruling R10)", () => {
  it("is exactly `das-rulepack: <scenario> core=<version> rule=<sha> checks=<n>`", () => {
    const sha = "c".repeat(64);
    expect(STAMP.exec(`das-rulepack: tst/x core=1.2.3 rule=${sha} checks=4`)).not.toBeNull();
    expect(STAMP.exec(`das-rulepack: tst/x core=1.2.3 rule=${sha} checks=4 and it went well`)).toBeNull();
    const parsed = parseRunnerLog(logOf(block("tst/x", { lines: [stamp("tst/x", sha)] })));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ name: "tst/x", verdict: { passed: true, checks: 1 },
      stamps: [{ scenario: "tst/x", core: "9.9.9", rule: sha, checks: 1 }] });
  });
});

describe("playedFrom: evidence.played from the runner's log", () => {
  it("played writes evidence for a passing stamped scenario", () => {
    const r = reviewed();
    const fp = ruleFingerprint(r.rule);
    const out = run([r], logOf(block("tst/tst-spell-frost-glimmer", { lines: [stamp("tst/tst-spell-frost-glimmer", fp)] })));
    expect(out.played).toEqual([r.key]);
    expect(out.skipped).toEqual([]);
    const next = out.records[0];
    expect(next.evidence.played).toEqual({ at: AT, core: "9.9.9", world: "dnd-6", scenario: "tst/tst-spell-frost-glimmer",
      client: "gm", rule: fp });
    expect(validateRecord(next)).toEqual([]);
    expect(stateOf(next)).toBe("played");
    // Played evidence holds no prose: it does not touch what the gates fingerprinted.
    expect(next.evidence.gates.emits).toBe(emittedFingerprint(next));
  });

  it("played skips 0 checks", () => {
    const r = reviewed();
    const id = "tst/tst-spell-frost-glimmer";
    const zero = [`\n▶ ${id}`, stamp(id, ruleFingerprint(r.rule), 0),
      "  ✓ scénario tenu — rien vérifié (0 vérification jouée : non applicable)"].join("\n");
    const out = run([r], logOf(zero));
    expect(out.played).toEqual([]);
    expect(out.skipped).toEqual([{ scenario: id, reason: expect.stringMatching(/0 checks/) }]);
  });

  it("played skips an old rule fingerprint", () => {
    const r = reviewed();
    const old = ruleFingerprint({ ...r.rule, adds: "an older wording" });
    const id = "tst/tst-spell-frost-glimmer";
    const out = run([r], logOf(block(id, { lines: [stamp(id, old)] })));
    expect(out.played).toEqual([]);
    expect(out.skipped[0].reason).toMatch(/not the record's current rule/);
    expect(out.records[0].evidence.played).toBeUndefined();
  });

  it("played skips a failed scenario", () => {
    const r = reviewed();
    const id = "tst/tst-spell-frost-glimmer";
    const failed = block(id, {
      lines: ["    ✗ check 2: damage fraction 0.5 (applied 10 of 10)", stamp(id, ruleFingerprint(r.rule), 3)],
      verdict: "  ✗ 1 vérification(s) en défaut" });
    const out = run([r], logOf(failed));
    expect(out.played).toEqual([]);
    expect(out.skipped).toEqual([{ scenario: id, reason: expect.stringMatching(/failed/) }]);
  });

  it("skips a log played for another record: the stamp's rule is that record's", () => {
    const a = reviewed("Frost Glimmer");
    const b = reviewed("Ember Glow", { assert: [HALF, { given: { roll: "failedSave" }, expect: { damage: { fraction: 1 } } }] });
    const id = "tst/tst-spell-frost-glimmer";
    const out = run([a, b], logOf(block(id, { lines: [stamp(id, ruleFingerprint(b.rule))] })));
    expect(out.played).toEqual([]);
    expect(out.skipped[0].reason).toMatch(/not the record's current rule/);
    const swapped = run([a, b], logOf(block(id, { lines: [stamp("tst/tst-spell-ember-glow", ruleFingerprint(b.rule))] })));
    expect(swapped.played).toEqual([]);
    expect(swapped.skipped[0].reason).toMatch(/another scenario than its block/);
  });

  it("skips a stamp with trailing prose, and clips what it echoes", () => {
    const r = reviewed();
    const id = "tst/tst-spell-frost-glimmer";
    const prose = `${stamp(id, ruleFingerprint(r.rule))} ${"and the wizzle quux was halved ".repeat(10)}`;
    const out = run([r], logOf(block(id, { lines: [prose] })));
    expect(out.played).toEqual([]);
    expect(out.skipped[0].reason).toMatch(/malformed stamp/);
    expect(JSON.stringify(out.skipped).length).toBeLessThan(400);
  });

  it("skips a block with no stamp, a manual scenario, a record not reviewed and a scenario with no record", () => {
    const r = reviewed();
    const id = "tst/tst-spell-frost-glimmer";
    expect(run([r], logOf(block(id))).skipped[0].reason).toMatch(/no stamp/);
    const moonlight = { given: { free: "only in moonlight" }, expect: { damage: { fraction: 1 } } };
    const free = reviewed("Ember Glow", { assert: [moonlight] });
    const fid = "tst/tst-spell-ember-glow";
    expect(run([free], logOf(block(fid, { lines: [stamp(fid, ruleFingerprint(free.rule))] }))).skipped[0].reason).toMatch(/manual/);
    const gated = reviewed();
    delete gated.evidence.reviewed;
    expect(run([gated], logOf(block(id, { lines: [stamp(id, ruleFingerprint(gated.rule))] }))).skipped[0].reason)
      .toMatch(/state is gated/);
    expect(run([r], logOf(block("tst/tst-spell-nobody", { lines: [stamp("tst/tst-spell-nobody", "d".repeat(64))] })))
      .skipped[0].reason).toMatch(/no record/);
  });

  it("a run that played fewer checks than its scenario declares is refused", () => {
    const r = reviewed();
    const id = "tst/tst-spell-frost-glimmer";
    const declared = new Map([[id, { ...scenarioOf(r, { packOf }), checks: 3 }]]);
    const out = run([r], logOf(block(id, { lines: [stamp(id, ruleFingerprint(r.rule))] })), { scenarios: declared });
    expect(out.played).toEqual([]);
    expect(out.skipped[0].reason).toMatch(/ran 1 of the 3 checks/);
  });

  it("an interrupted scenario is reported as failed, not as a missing stamp", () => {
    const r = reviewed();
    const id = "tst/tst-spell-frost-glimmer";
    const cut = [`\n▶ ${id}`, "    ✗ interrompu : check 1: the use of activity Af11Bf22Cf33Df44 was refused",
      "  ✗ 1 vérification(s) en défaut"].join("\n");
    expect(run([r], logOf(cut)).skipped[0].reason).toMatch(/failed/);
  });

  it("colour codes around the runner's lines are stripped before reading", () => {
    const r = reviewed();
    const id = "tst/tst-spell-frost-glimmer";
    const colour = (t) => t.split("\n").map((l) => (l.trim() ? `\u001b[1m${l}\u001b[0m` : l)).join("\n");
    const out = run([r], colour(logOf(block(id, { lines: [stamp(id, ruleFingerprint(r.rule), 1)] ,
      verdict: "  ✓ scénario tenu (1 vérification)" }))));
    expect(out.played).toEqual([r.key]);
  });

  it("a scenario file generated for another rule than today's is not the one played", () => {
    const r = reviewed();
    const id = "tst/tst-spell-frost-glimmer";
    const stale = new Map([[id, { ...scenarioOf(r, { packOf }), rule: "e".repeat(64) }]]);
    const out = run([r], logOf(block(id, { lines: [stamp(id, ruleFingerprint(r.rule))] })), { scenarios: stale });
    expect(out.played).toEqual([]);
    expect(out.skipped[0].reason).toMatch(/scenario file/);
  });
});

describe("evidence.played in the record schema", () => {
  const played = (over) => {
    const r = reviewed();
    r.evidence.played = { at: AT, core: "9.9.9", world: "dnd-6", scenario: "tst/tst-spell-frost-glimmer", client: "gm",
      rule: ruleFingerprint(r.rule), ...over };
    return r;
  };
  it("holds ids, a version, a world handle and a fingerprint: no prose can hide there", () => {
    expect(validateRecord(played({}))).toEqual([]);
    expect(validateRecord(played({ world: "the wizzle was halved by the quux" })).join()).toMatch(/evidence.played.world/);
    expect(validateRecord(played({ core: "nine and more" })).join()).toMatch(/evidence.played.core/);
    expect(validateRecord(played({ scenario: "Some Prose Here" })).join()).toMatch(/evidence.played.scenario/);
    expect(validateRecord(played({ client: "someone" })).join()).toMatch(/evidence.played.client/);
    expect(validateRecord(played({ manual: true })).join()).toMatch(/manual, by and because go together/);
  });

  it("a hand play's `because` is part of what the gates fingerprint, and the text gate reads it", () => {
    const r = played({ manual: true, by: "owner", because: "played the checklist on the arena" });
    expect(validateRecord(r)).toEqual([]);
    expect(stateOf(r)).toBe("drafted");
    const quoting = played({ manual: true, by: "owner", because: "alpha beta gamma delta epsilon zeta eta theta" });
    expect(checkText(quoting, { textDir }).failures.join()).toMatch(/evidence.played.because/);
  });
});

describe("npm run played", () => {
  let tmp, registry, playDir, env;
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", "played", ...args], { encoding: "utf8", env });
  const id = "tst/tst-spell-frost-glimmer";
  let records;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "played-cli-"));
    registry = join(tmp, "registry");
    playDir = join(tmp, "play");
    env = { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_PLAY: playDir, RULEPACK_TEXT: textDir };
    const dusk = { given: { free: "only at dusk" }, expect: { damage: { fraction: 1 } } };
    records = [reviewed(), reviewed("Ember Glow", { assert: [dusk] })];
    saveBook(registry, { book: "TST", records });
    for (const r of records) {
      for (const [p, text] of scenarioFiles(scenarioOf(r, { packOf }))) {
        mkdirSync(join(playDir, "tst"), { recursive: true });
        writeFileSync(join(playDir, p), text);
      }
    }
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("records the play of a passing stamped scenario, and prints what it skipped", () => {
    const log = join(tmp, "run.log");
    writeFileSync(log, logOf(block(id, { lines: [stamp(id, ruleFingerprint(records[0].rule))] }),
      block("tst/tst-spell-nobody", { lines: [stamp("tst/tst-spell-nobody", "d".repeat(64))] })));
    const out = cli([log, "--world", "dnd-6"]);
    expect(out.status, out.stderr).toBe(1);   // something was skipped: the play of the other is still recorded
    const report = JSON.parse(out.stdout);
    expect(report.played).toEqual([records[0].key]);
    expect(report.skipped).toHaveLength(1);
    const saved = loadBook(registry, "TST").records.find((r) => r.key === records[0].key);
    expect(saved.evidence.played).toMatchObject({ world: "dnd-6", client: "gm", core: "9.9.9", scenario: id });
    expect(JSON.parse(readFileSync(join(registry, "tst.json"), "utf8")).records.find((r) => r.key === records[0].key).state)
      .toBe("played");
  });

  it("a log with stamp lines but no runner block it can read exits non-zero and says why", () => {
    const log = join(tmp, "flat.log");
    writeFileSync(log, `${stamp(id, ruleFingerprint(records[0].rule))}\n`);
    const out = cli([log, "--world", "dnd-6"]);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/no runner block recognised \(colour codes on the header lines\?\)/);
  });

  it("needs --world, a world handle, and a client of gm or player; a log and --manual are exclusive", () => {
    const log = join(tmp, "run.log");
    writeFileSync(log, logOf());
    expect(cli([log]).status).toBe(2);
    expect(cli([log, "--world", "two words"]).status).toBe(2);
    expect(cli([log, "--world", "dnd-6", "--client", "admin"]).status).toBe(2);
    const both = cli([log, "--manual", records[1].key, "--world", "dnd-6", "--because", "x", "--by", "owner"]);
    expect(both.status).toBe(2);
    expect(both.stderr).toMatch(/together|either/);
  });

  it("--manual records a checklist played by an owner, never by an agent, and only for a manual scenario", () => {
    const manual = (key, by, because = "played the checklist on the arena") =>
      cli(["--manual", key, "--world", "dnd-6", "--because", because, "--by", by, "--core", "9.9.9"]);
    expect(manual(records[1].key, "reviewer-1").status).toBe(2);
    expect(manual(records[0].key, "owner").stderr).toMatch(/not a manual scenario/);
    expect(manual(records[1].key, "owner", "alpha beta gamma delta epsilon zeta eta theta").stderr).toMatch(/quotes/);
    const out = manual(records[1].key, "owner");
    expect(out.status, out.stderr).toBe(0);
    const saved = loadBook(registry, "TST").records.find((r) => r.key === records[1].key);
    expect(saved.evidence.played)
      .toMatchObject({ manual: true, by: "owner", world: "dnd-6", scenario: "tst/tst-spell-ember-glow" });
    expect(out.stdout).toMatch(/run npm run gates/);
  });
});
