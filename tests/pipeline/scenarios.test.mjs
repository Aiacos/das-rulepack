import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  familyOf, planOf, scenarioFiles, scenarioIdOf, scenarioOf, TARGETS, DEFAULT_TARGET
} from "../../tools/pipeline/scenarios.mjs";
import { scenario } from "../../play/lib/steps.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { impliedAsserts, normaliseAssert } from "../../tools/pipeline/assert.mjs";
import { emittedFingerprint, gatedItems, ruleFingerprint, saveBook, stateOf } from "../../tools/pipeline/registry.mjs";

// Synthetic fixtures only: invented entries, invented words, invented ids.
const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
const AT = "2026-01-01T00:00:00.000Z";
const A_OFF = "Af11Bf22Cf33Df44";
const A_DDB = "Ad11Bd22Cd33Dd44";
const DOC = "Do11Do22Do33Do44";
const HALF = { given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } };
const PRONE = { given: { roll: "failedSave", targetType: "undead" }, expect: { condition: { applied: "prone" } } };
const packOf = (docId) => (docId === DOC ? "tst-pkg.spells" : null);

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "scenarios-")); });
afterEach(() => rmSync(textDir, { recursive: true, force: true }));

const item = (origin) => ({
  origin, match: "matched", identifier: "frost-glimmer", docId: origin === "official" ? DOC : "Dd11Dd22Dd33Dd44",
  activities: [origin === "official" ? A_OFF : A_DDB], effects: [],
  data: { sha256: (origin === "official" ? "a" : "b").repeat(64) }
});
const rule = (over = {}) => ({
  handledIn: "table", adds: "Zorbly the quux halves things for the wizzle.",
  entry: { saveDamage: { [A_OFF]: "half", [A_DDB]: "half" } }, origins: ["official", "ddb-importer"], assert: [HALF], ...over
});
// A record as `ingest --review` leaves it: drafted, gated, reviewed (agreeing) on the rule as it is.
export const reviewed = (over = {}) => {
  const { name = "Frost Glimmer", ...rest } = over;
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const r = {
    key: `tst:spell:${s}`, name, kind: "spell", book: "TST", page: 3, edition: "2024", identifier: s,
    text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
    items: [item("official"), item("ddb-importer"), { origin: "plutonium", match: "unchecked" }],
    verdict: "entry", why: "a save halves it",
    evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9, keys: ["saveDamage"], similar: [] } },
    rule: rule(), ...rest
  };
  const fp = ruleFingerprint(r.rule);
  r.evidence.drafted = { by: "drafter-zz9", at: AT, core: "9.9.9", rule: fp };
  r.evidence.gates = { at: AT, core: "9.9.9", rule: fp, emits: emittedFingerprint(r),
    passed: ["schema", "validator", "ids", "fixes", "text", "unique"], items: gatedItems(r) };
  r.evidence.reviewed = { by: "reviewer-1", at: AT, agrees: true, rule: fp, confidence: 0.9 };
  return r;
};

describe("scenarioOf: a rule's assertions as play data", () => {
  it("scenario from a saveDamage rule", () => {
    const r = reviewed();
    expect(stateOf(r)).toBe("reviewed");
    const s = scenarioOf(r, { packOf });
    expect(s).toMatchObject({
      scenario: "tst/tst-spell-frost-glimmer", key: r.key, rule: ruleFingerprint(r.rule), origin: "official", client: "gm",
      manual: false
    });
    expect(s.setup.item).toEqual({ origin: "official", docId: DOC, uuid: `Compendium.tst-pkg.spells.Item.${DOC}`, kind: "spell" });
    expect(s.setup.target).toEqual({ actor: TARGETS[DEFAULT_TARGET], type: DEFAULT_TARGET });
    // The rule's assertion and the one its entry implies are the same: one check, after the use and the forced roll.
    expect(normaliseAssert([HALF])).toEqual(impliedAsserts(r.rule.entry));
    expect(s.steps).toEqual([{ use: A_OFF }, { force: "savedSave" }, { check: normaliseAssert([HALF])[0] }]);
    expect(scenarioIdOf(r)).toBe(s.scenario);
  });

  it("the target is an SRD 2024 actor of the creature type the assertions name", () => {
    const s = scenarioOf(reviewed({ rule: rule({ assert: [HALF, PRONE] }) }), { packOf });
    expect(s.setup.target).toEqual({ actor: TARGETS.undead, type: "undead" });
    expect(s.manual).toBe(false);
    expect(s.steps.filter((x) => x.check)).toHaveLength(2);
  });

  it("free assertion makes it manual", () => {
    const free = { given: { free: "only in moonlight" }, expect: { damage: { fraction: 1 } } };
    const s = scenarioOf(reviewed({ rule: rule({ assert: [HALF, free] }) }), { packOf });
    expect(s.manual).toBe(true);
    expect(s.manualBecause).toContain("given.free");
    // A free text is never copied into the scenario: the check holds its canonical form, `*` for the words.
    expect(JSON.stringify(s)).not.toContain("moonlight");
    expect(scenarioFiles(s).map(([p]) => p)).toEqual(["tst/tst-spell-frost-glimmer.json"]);
  });

  it("a moment, a crit or an unknown compendium makes it manual, with the paths named", () => {
    const later = { given: { moment: "endOfTurn" }, expect: { condition: { ended: "prone" } } };
    const crit = { given: { roll: "crit" }, expect: { damage: { fraction: 2 } } };
    const s = scenarioOf(reviewed({ rule: rule({ assert: [later, crit] }) }), { packOf });
    expect(s.manual).toBe(true);
    expect(s.manualBecause).toEqual(expect.arrayContaining(["advance", "force.crit", "expect.condition.ended"]));
    expect(scenarioOf(reviewed(), {}).manualBecause).toContain("setup.item");
  });

  it("generated files hold no text", () => {
    const r = reviewed({ rule: rule({ assert: [HALF, PRONE] }) });
    const files = scenarioFiles(scenarioOf(r, { packOf }));
    expect(files.map(([p]) => p)).toEqual(["tst/tst-spell-frost-glimmer.json", "tst/tst-spell-frost-glimmer.mjs"]);
    const words = (t) => t.toLowerCase().match(/[a-z]{3,}/g) ?? [];
    const prose = new Set([...words(BODY), ...words(r.rule.adds), ...words(r.why), ...words(r.name)]);
    const allowed = new Set(["frost", "glimmer"]);   // the identifier's words, part of the record key
    for (const [, text] of files) {
      for (const w of words(text)) if (!allowed.has(w)) expect(prose.has(w), w).toBe(false);
    }
    const json = JSON.parse(files[0][1]);
    expect(Object.keys(json).sort()).toEqual(["client", "key", "manual", "manualBecause", "origin", "rule", "scenario", "setup",
      "steps"]);
    expect(files[1][1].split("\n").filter(Boolean)).toHaveLength(2);
  });
});

describe("families (Ruling R11)", () => {
  it("a family is the sorted top-level keys, triggers with their moments and step types", () => {
    const t = { triggers: [{ on: "failedSave", do: [{ type: "status", status: "prone" }] }], saveDamage: { [A_OFF]: "half" } };
    expect(familyOf(reviewed({ rule: rule({ entry: t }) }))).toBe("saveDamage+triggers(failedSave>status)");
    expect(familyOf(reviewed())).toBe("saveDamage");
  });

  it("plan puts one rule per family first", () => {
    const halfOnMiss = { halfOnMiss: true };
    const records = [
      reviewed({ name: "Alpha One" }), reviewed({ name: "Alpha Two" }),
      reviewed({ name: "Beta One", rule: rule({ entry: halfOnMiss, origins: ["official"],
        uncovered: [{ origin: "ddb-importer", because: "no activity" }], assert: [{ given: { roll: "miss" },
          expect: { damage: { fraction: 0.5 } } }] }) }),
      reviewed({ name: "Alpha Three" })
    ];
    const plan = planOf(records, { packOf });
    expect(plan.map((p) => [p.key, p.first])).toEqual([
      ["tst:spell:alpha-one", true], ["tst:spell:beta-one", true], ["tst:spell:alpha-three", false],
      ["tst:spell:alpha-two", false]
    ]);
    expect(plan[0]).toMatchObject({ order: 1, family: "saveDamage", scenario: "tst/tst-spell-alpha-one", manual: false });
  });
});

describe("play/lib/steps.mjs scenario(json): what the engine's runner plays", () => {
  // A stand-in for the runner's context (DAS_CORE tools/scenario.mjs makeContext): only what steps.mjs calls.
  const fakeContext = ({ saves = [true], applied = 5, rolled = 10 } = {}) => {
    const log = [];
    let checks = 0;
    let n = 0;
    const ctx = {
      log: (...a) => log.push(["log", a.join(" ")]),
      expect: (ok, label) => { checks += 1; log.push([ok ? "pass" : "fail", label]); return ok; },
      get checks() { return checks; },
      restore: () => {},
      token: async (name) => ({ id: "TkCaster00000000", name, actorId: "AcCaster00000000" }),
      cast: async (roles) => Object.fromEntries(Object.keys(roles).map((k) => [k, { id: "TkTarget00000000", name: k }])),
      ensureItem: async () => "ItItem0000000000",
      use: async () => ({ used: true, usageMessageId: `Ms${n}` }),
      settle: async () => {
        const success = saves[Math.min(n, saves.length - 1)];
        n += 1;
        return { step: "done", targets: [{ id: "TkTarget00000000", save: { success, total: 12 }, damage: { applied } }] };
      },
      messagesSince: async () => [{ type: "damage", rolls: [{ total: rolled }] }],
      hp: async () => 30, setHp: async () => {}, effects: async () => [], removeStatusEffects: async () => {},
      removeEffectsNamed: async () => {},
      engine: async (fn) => (fn === "status" ? { version: "9.9.9" } : null)
    };
    return { ctx, log };
  };

  it("plays each check after forcing its roll, and logs the stamp line last", async () => {
    const s = scenarioOf(reviewed(), { packOf });
    const played = scenario(s);
    expect(played.name).toBe(s.scenario);
    const { ctx, log } = fakeContext({ saves: [false, false, true] });
    await played.run(ctx);
    expect(log.filter(([k]) => k === "pass")).toHaveLength(1);
    expect(log.at(-1)).toEqual(["log", `das-rulepack: ${s.scenario} core=9.9.9 rule=${s.rule} checks=1`]);
  });

  it("a wrong damage fraction fails its check, and a roll never seen fails too", async () => {
    const s = scenarioOf(reviewed(), { packOf });
    const wrong = fakeContext({ applied: 10, rolled: 10 });
    await scenario(s).run(wrong.ctx);
    expect(wrong.log.filter(([k]) => k === "fail")).toHaveLength(1);
    const never = fakeContext({ saves: [false] });
    await scenario(s).run(never.ctx);
    expect(never.log.filter(([k]) => k === "fail")).toHaveLength(1);
  });

  it("refuses a manual scenario: it is a checklist for a person", () => {
    const free = { given: { free: "only in moonlight" }, expect: { damage: { fraction: 1 } } };
    expect(() => scenario(scenarioOf(reviewed({ rule: rule({ assert: [free] }) }), { packOf }))).toThrow(/manual/);
  });
});

describe("npm run scenarios", () => {
  let tmp, registry, playDir, env;
  const cli = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", "scenarios", ...args], { encoding: "utf8", env });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "scenarios-cli-"));
    registry = join(tmp, "registry");
    playDir = join(tmp, "play");
    const dumps = join(tmp, "dumps");
    mkdirSync(dumps);
    writeFileSync(join(dumps, "tst-pkg.spells.json"), JSON.stringify([{ _id: DOC, name: "Frost Glimmer", type: "spell" }]));
    env = { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_PLAY: playDir, RULEPACK_DUMPS: dumps };
    saveBook(registry, { book: "TST", records: [reviewed(), reviewed({ name: "Gamma", rule: rule({ assert: [HALF, PRONE] }) })] });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("writes the files of every reviewed record, then --check finds nothing to do", () => {
    const out = cli(["TST"]);
    expect(out.status, out.stderr).toBe(0);
    expect(existsSync(join(playDir, "tst", "tst-spell-frost-glimmer.json"))).toBe(true);
    expect(existsSync(join(playDir, "tst", "tst-spell-gamma.mjs"))).toBe(true);
    const json = JSON.parse(readFileSync(join(playDir, "tst", "tst-spell-frost-glimmer.json"), "utf8"));
    expect(json.setup.item.uuid).toBe(`Compendium.tst-pkg.spells.Item.${DOC}`);
    expect(cli(["TST", "--check"]).status).toBe(0);
    writeFileSync(join(playDir, "tst", "tst-spell-gamma.json"), "{}");
    const stale = cli(["TST", "--check"]);
    expect(stale.status).toBe(1);
    expect(stale.stdout).toContain("tst/tst-spell-gamma.json");
  });

  it("--plan prints the run order by family and writes nothing", () => {
    const out = cli(["TST", "--plan"]);
    expect(out.status, out.stderr).toBe(0);
    const plan = JSON.parse(out.stdout);
    expect(plan.map((p) => p.first)).toEqual([true, false]);
    expect(existsSync(playDir)).toBe(false);
  });

  it("--check and --plan cannot be used together", () => {
    const out = cli(["TST", "--check", "--plan"]);
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/together/);
  });
});
