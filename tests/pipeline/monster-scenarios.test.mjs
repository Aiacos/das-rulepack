import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checksOf, expectsOf, scenarioOf, TRIES } from "../../tools/pipeline/scenarios.mjs";
import { placementOf, scenario, timing } from "../../play/lib/steps.mjs";
import { assertionOfCanonical, normaliseAssert } from "../../tools/pipeline/assert.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import { emittedFingerprint, gatedItems, ruleFingerprint, stateOf } from "../../tools/pipeline/registry.mjs";
import { playedFrom } from "../../tools/pipeline/played.mjs";
import { reachesOf } from "../../tools/pipeline/structure.mjs";

// Synthetic fixtures only: an invented monster, invented ids, invented words. The runner's context is a fake world
// (`world` below) that follows the engine's documented behaviour (DAS_CORE core/effect-ends.mjs effectEndsNow,
// adapter/movement.mjs pushAway, runtime/turn.mjs budget) closely enough to say whether the interpreter would notice.
const BODY = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
const AT = "2026-01-01T00:00:00.000Z";
const ACTOR = "mmZorg0000000000";
const ITEM = "mmBlast000000000";
const ACT = "Ab11Ab22Ab33Ab44";
const ACT2 = "Ac11Ac22Ac33Ac44";
const EFF = "Ef11Ef22Ef33Ef44";
const HALF = { given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5 } } };

let textDir;
beforeEach(() => { textDir = mkdtempSync(join(tmpdir(), "monster-scenarios-")); timing.scale = 0; });
afterEach(() => { rmSync(textDir, { recursive: true, force: true }); timing.scale = 1; });

const monster = ({ entry = { saveDamage: { [ACT]: "half" } }, assert = [HALF], leaves, docId = `${ACTOR}.${ITEM}`,
  activities = [ACT] } = {}) => {
  const r = {
    key: "tst:monster:zorg/action/blast", name: "Blast", kind: "monster", book: "TST", page: 3, edition: "2024",
    identifier: "tst-zorg-blast", owner: "Zorg", section: "action",
    text: { sha256: cacheText(textDir, BODY), source: "5etools", chars: 10 },
    items: [{ origin: "official", match: "matched", identifier: "blast", docId, activities, effects: [EFF],
      data: { sha256: "a".repeat(64) } }],
    verdict: "entry", why: "a blast",
    evidence: { triaged: { by: "reader-1", at: AT, confidence: 0.9, keys: [], similar: [] } },
    rule: { handledIn: "table", adds: "Zorbly the quux.", entry, origins: ["official"], assert, ...(leaves ? { leaves } : {}) }
  };
  const fp = ruleFingerprint(r.rule);
  r.evidence.drafted = { by: "drafter-zz9", at: AT, core: "9.9.9", rule: fp };
  r.evidence.gates = { at: AT, core: "9.9.9", rule: fp, emits: emittedFingerprint(r),
    passed: ["schema", "validator", "ids", "fixes", "text", "unique"], items: gatedItems(r) };
  r.evidence.reviewed = { by: "reviewer-1", at: AT, agrees: true, rule: fp, confidence: 0.9 };
  return r;
};
// The official item's structure (structure.mjs structureOf) with each activity's reach in feet (structure.mjs reachesOf).
const structureFor = ({ type = "save", types = ["cold"], effects = [EFF], reach = null, template } = {}) => ({
  activities: [{ id: ACT, type, activation: "action", damage: [{ types }], effects, reach,
    ...(template ? { template: { type: template, size: "15" } } : {}) }],
  effects: [{ id: EFF, name: "", statuses: ["frightened"], changes: [], transfer: false }]
});
const canonical = (a) => normaliseAssert([a])[0];

describe("scenarioOf for a monster feature", () => {
  it("is automatic: the creature is cast from its actor id, its own item is used, no compendium uuid is needed", () => {
    const r = monster();
    expect(stateOf(r)).toBe("reviewed");
    const s = scenarioOf(r, { structure: structureFor() });
    expect(s.manual).toBe(false);
    expect(s.manualBecause).toEqual([]);
    expect(s.setup.caster).toBeNull();
    expect(s.setup.item).toEqual({ origin: "official", docId: `${ACTOR}.${ITEM}`, uuid: null, kind: "monster", actor: ACTOR,
      id: ITEM });
    expect(s.setup.reach).toEqual({ [ACT]: null });
    // The typed half (from the structure) says more than the rule's untyped one: only the typed one is checked.
    expect(s.steps).toEqual([{ use: ACT }, { force: "savedSave" },
      { check: "expect.damage.fraction=0.5;expect.damage.type=cold;given.roll=savedSave" }]);
    expect(s.checks).toBe(1);
  });

  // Ruling R35: an embedded item id other creatures share, bound by `<actor id>.<item id>`: the run casts that creature and
  // uses its own item, never another creature's.
  it("for a shared embedded id bound by <actor id>.<item id>, casts the bound creature and uses its own item", () => {
    const r = monster();
    r.items[0].embeddedShared = true;
    r.sources = { [`${ACTOR}.${ITEM}`]: r.identifier };
    const s = scenarioOf(r, { structure: structureFor() });
    expect(s.manual).toBe(false);
    expect(s.setup.item).toMatchObject({ actor: ACTOR, id: ITEM, docId: `${ACTOR}.${ITEM}` });
  });

  it("without the structure the untyped assertion is checked; an id that is not <actor>.<item> is setup.item", () => {
    expect(scenarioOf(monster()).steps.at(-1)).toEqual({ check: canonical(HALF) });
    expect(scenarioOf(monster({ docId: "mmZorg" }), { structure: structureFor() }).manualBecause).toEqual(["setup.item"]);
  });

  it("turn endings, denials and moves are interpreted, each with the number of checks the interpreter makes", () => {
    const entry = { effectEnds: { [EFF]: "casterTurnEnd" }, noReactions: [EFF],
      triggers: [{ on: "failedSave", do: [{ type: "move", mode: "push", distance: 10, units: "ft" }] }] };
    const s = scenarioOf(monster({ entry, assert: [] }), { structure: structureFor({ types: [] }) });
    expect(s.manualBecause).toEqual([]);
    const checks = s.steps.filter((x) => x.check).map((x) => x.check);
    expect(checks).toEqual([
      "expect.denies=reactions;given.roll=failedSave", "expect.ends=casterTurnEnd;given.roll=failedSave",
      "expect.move.distance=10;expect.move.mode=push;given.roll=failedSave"
    ]);
    // ends: still there before its moment, gone after (2); a denial (1); a move (1).
    expect(s.checks).toBe(4);
    expect(expectsOf(assertionOfCanonical(checks[1]))).toBe(2);
  });

  it("an assertion that holds in every situation is observed on the roll the activity applies its effect on", () => {
    const entry = { noOpportunity: "afterUse", effectEnds: { [EFF]: "bearerTurnStart" } };
    const s = scenarioOf(monster({ entry, assert: [] }), { structure: structureFor({ type: "attack", effects: [] }) });
    expect(s.manual).toBe(false);
    expect(s.steps).toEqual([{ use: ACT }, { check: "expect.denies=opportunityAttacks" },
      { use: ACT }, { observe: "hit" }, { check: "expect.ends=bearerTurnStart" }]);
  });

  it("stays manual, naming exactly the missing interpreters", () => {
    const resaved = { given: { roll: "failedSave" }, expect: { ends: "savedSave" } };
    const hurt = { given: { roll: "failedSave" }, expect: { ends: "isDamaged" } };
    const worse = { given: {}, expect: { roll: { mode: "disadvantage", on: "attack", for: "target" } } };
    const random = { given: { roll: "hit" }, expect: { move: { mode: "random" } } };
    const s = scenarioOf(monster({ assert: [HALF, resaved, hurt, worse, random] }), { structure: structureFor() });
    expect(s.manual).toBe(true);
    expect(s.manualBecause).toEqual(["expect.ends.isDamaged", "expect.ends.savedSave", "expect.move.mode.random",
      "expect.roll"]);
  });

  it("a pull that cannot start within the activity's reach is setup.reach", () => {
    const pull = { given: { roll: "hit" }, expect: { move: { mode: "pull", distance: 25 } } };
    const r = monster({ entry: {}, assert: [pull] });
    expect(scenarioOf(r, { structure: structureFor({ type: "attack", reach: 30 }) }).manualBecause).toEqual([]);
    expect(scenarioOf(r, { structure: structureFor({ type: "attack", reach: 10 }) }).manualBecause).toEqual(["setup.reach"]);
  });

  it("what the rule leaves to the table is not checked", () => {
    const left = { given: { roll: "failedSave" }, expect: { condition: { applied: "prone" } } };
    const rule = { entry: {}, assert: [HALF, left], leaves: [{ ...left, because: "no-key" }] };
    expect(checksOf(rule)).toEqual([canonical(HALF)]);
  });

  it("with several activities and none named, the only one whose kind makes the roll is played", () => {
    const entry = { triggers: [{ on: "failedSave", do: [{ type: "status", status: "restrained" }] }] };
    const r = monster({ entry, assert: [], activities: [ACT, ACT2] });
    const structure = { activities: [{ id: ACT, type: "save", damage: [], effects: [] },
      { id: ACT2, type: "check", damage: [], effects: [] }], effects: [] };
    const s = scenarioOf(r, { structure });
    expect(s.manualBecause).toEqual([]);
    expect(s.steps[0]).toEqual({ use: ACT });
    expect(scenarioOf(r).manualBecause).toContain("use");
  });

  it("an area activity is used on an area laid over the target", () => {
    expect(scenarioOf(monster(), { structure: structureFor({ template: "cone" }) }).setup.area).toEqual([ACT]);
    expect(scenarioOf(monster(), { structure: structureFor() }).setup.area).toEqual([]);
    const blank = structureFor();
    blank.activities[0].template = { type: "", size: "" };
    expect(scenarioOf(monster(), { structure: blank }).setup.area).toEqual([]);
  });

  it("tries a forced roll up to TRIES times", () => expect(TRIES).toBeGreaterThanOrEqual(20));
});

describe("reachesOf: the reach of each activity, in feet", () => {
  it("an activity's own range in feet, else what the engine judges the item's attack on, else null", () => {
    // A weapon with a reach and a range: the engine judges an attack that is not ranged on the reach alone (no attack mode
    // is passed by its test tool), so a target placed at the normal range is out of range.
    const doc = { system: { range: { value: 20, reach: 5, units: "ft" }, activities: {
      a: { _id: ACT, range: { units: "self" } }, b: { _id: ACT2, range: { value: "15", units: "ft" } } } } };
    expect(reachesOf(doc)).toEqual({ [ACT]: 5, [ACT2]: 15 });
    const ranged = { system: { range: { value: 20, reach: 5, units: "ft" }, activities: {
      a: { _id: ACT, range: { units: "self" }, attack: { type: { value: "ranged" } } } } } };
    expect(reachesOf(ranged)).toEqual({ [ACT]: 20 });
    const noReach = { system: { range: { value: 30, units: "ft" }, activities: { a: { _id: ACT, range: { units: "self" } } } } };
    expect(reachesOf(noReach)).toEqual({ [ACT]: 30 });
    const self = { system: { activities: { a: { _id: ACT, range: { units: "self", value: "0" } } } } };
    expect(reachesOf(self)).toEqual({ [ACT]: null });
  });
});

describe("placementOf: where the target goes", () => {
  const geo = (tokens, { cols = 12, rows = 6 } = {}) => ({ size: 100, distance: 5, square: true,
    rect: { x: 0, y: 0, width: cols * 100, height: rows * 100 }, tokens });
  const tok = (id, col, row, w = 1, h = 1) => ({ id, x: col * 100, y: row * 100, w, h, level: null });

  it("adjacent, on the side with the most free squares", () => {
    const g = geo([tok("C", 5, 2), tok("T", 0, 0), tok("X", 7, 2)]);
    const p = placementOf(g, { casterId: "C", targetId: "T", gap: 1, lane: 0 });
    // East is blocked two squares out, west runs to the edge: west.
    expect(p).toMatchObject({ caster: null, target: { x: 400, y: 200 }, dir: "west" });
  });

  it("a push needs its whole lane free; a pull starts `distance + 1` squares out", () => {
    const g = geo([tok("C", 1, 2), tok("T", 0, 0)]);
    expect(placementOf(g, { casterId: "C", targetId: "T", gap: 1, lane: 4, mode: "push" })).toMatchObject({ dir: "east",
      target: { x: 200, y: 200 } });
    expect(placementOf(g, { casterId: "C", targetId: "T", gap: 4, lane: 0, mode: "pull" })).toMatchObject({ dir: "east",
      target: { x: 500, y: 200 } });
  });

  it("a large caster has the target centred on its side", () => {
    const g = geo([tok("C", 2, 1, 3, 3), tok("T", 0, 0)]);
    expect(placementOf(g, { casterId: "C", targetId: "T", gap: 1, lane: 0 }).target).toEqual({ x: 500, y: 200 });
  });

  it("moves a caster it may move when no side has room, and gives up when none can", () => {
    const g = geo([tok("C", 0, 0), tok("T", 11, 5), tok("X", 1, 0), tok("Y", 0, 1)], { cols: 12, rows: 6 });
    expect(placementOf(g, { casterId: "C", targetId: "T", gap: 1, lane: 3, mode: "push" })).toBeNull();
    const moved = placementOf(g, { casterId: "C", targetId: "T", gap: 1, lane: 3, mode: "push", moveCaster: true });
    expect(moved.caster).not.toBeNull();
    expect(placementOf(geo([tok("C", 0, 0), tok("T", 1, 0)], { cols: 2, rows: 1 }),
      { casterId: "C", targetId: "T", gap: 1, lane: 3, mode: "push", moveCaster: true })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A fake world for the interpreter: tokens on a 20 × 10 grid of 100 px (5 ft), effects, a combat with turns.

function world({ onUse, cols = 20, rows = 10, combatStarts = true, endsAt = null, stats = {}, freesMovement = false } = {}) {
  const tokens = new Map();
  const effects = new Map();
  const log = [];
  const calls = [];
  const restores = [];
  const resolutions = new Map();
  const messages = new Map();
  let checks = 0;
  let uses = 0;
  let combat = null;
  let ids = 0;
  const budget = new Map();
  const turnKey = () => (combat ? `${combat.round}.${combat.turn}` : null);
  const current = () => (combat ? combat.order[combat.turn] : null);
  const place = (id, col, row) => tokens.set(id, { id, x: col * 100, y: row * 100, w: 1, h: 1 });
  place("Fixed0000000000a", 2, 2);
  const effectsOf = (id) => effects.get(id) ?? [];
  const w = {
    tokens, effects, log, calls, budget, uses: () => uses, combat: () => combat,
    addEffect: (tokenId, effect) => effects.set(tokenId, [...effectsOf(tokenId), { _id: `Ef${++ids}`.padEnd(16, "0"),
      statuses: [], disabled: false, ...effect, placedOn: turnKey() }]),
    move: (tokenId, dc, dr) => {
      const t = tokens.get(tokenId);
      tokens.set(tokenId, { ...t, x: t.x + dc * 100, y: t.y + dr * 100 });
    }
  };
  // The engine's effectEndsNow at each turn change (or `endsAt`, a broken engine for the failing tests).
  const turnChange = (prior, next) => {
    for (const [tokenId, list] of effects) {
      effects.set(tokenId, list.filter((e) => {
        if (!e.ends) return true;
        if (endsAt) return !endsAt(e, { prior, next });
        const placedInEnded = e.placedOn === prior.key;
        switch (e.ends) {
          case "casterTurnStart": return next.token !== e.caster;
          case "bearerTurnStart": return next.token !== tokenId;
          case "casterTurnEnd": return !(prior.token === e.caster && !placedInEnded);
          case "bearerTurnEnd": return !(prior.token === tokenId && !placedInEnded);
          case "currentTurnEnd": return !placedInEnded;
          default: return true;
        }
      }));
    }
    budget.clear();
  };
  const ctx = {
    log: (...a) => log.push(["log", a.join(" ")]),
    expect: (ok, label) => { checks += 1; log.push([ok ? "pass" : "fail", label]); return !!ok; },
    get checks() { return checks; },
    restore: (fn) => restores.push(fn),
    cast: async (roles, opts) => Object.fromEntries(Object.entries(roles).map(([name]) => {
      const id = name.includes("caster") ? "TkCaster00000000" : "TkTarget00000000";
      if (!tokens.has(id)) place(id, id === "TkCaster00000000" ? 10 : 15, 5);
      calls.push(["cast", name, opts]);
      return [name, { id, actorId: `Ac${id.slice(2)}`, name }];
    })),
    position: async (t) => ({ x: tokens.get(t.id).x, y: tokens.get(t.id).y, elevation: 0 }),
    box: async (t) => ({ x: tokens.get(t.id).x, y: tokens.get(t.id).y, width: 100, height: 100 }),
    effects: async (t) => effectsOf(t.id),
    hp: async () => 30,
    setHp: async () => {},
    removeStatusEffects: async (t, status) =>
      effects.set(t.id, effectsOf(t.id).filter((e) => !(e.statuses ?? []).includes(status))),
    scene: async () => ({ sceneId: "ScArena000000000" }),
    use: async (params) => {
      uses += 1;
      calls.push(["use", params]);
      const out = onUse?.(w, params, uses) ?? {};
      const id = `Ms${uses}`;
      resolutions.set(id, { step: "done", ...out.resolution });
      messages.set(id, out.messages ?? []);
      if (freesMovement && combat && current() === params.tokenId) budget.set(params.tokenId, { disengaged: true });
      return { used: true, usageMessageId: id };
    },
    settle: async (id) => resolutions.get(id),
    messagesSince: async (id) => messages.get(id) ?? [],
    engineLog: async () => [],
    engine: async (fn, args) => {
      if (fn === "status") return { version: "9.9.9" };
      if (fn === "stats") return stats[args.tokenId]?.(w) ?? { reactionBlocked: false, actionOrBonus: false };
      if (fn === "budget") return combat ? { disengaged: false, ...budget.get(args.tokenId) } : null;
      return null;
    },
    startCombat: async (list) => {
      calls.push(["start-combat", list.map((t) => t.id)]);
      if (!combatStarts) return {};
      combat = { id: "Cb11Cb22Cb33Cb44", round: 1, turn: 0, order: list.map((t) => t.id), init: {} };
      ctx.ownCombat = combat.id;
      restores.push(() => { calls.push(["end-combat"]); combat = null; });
      return { id: combat.id };
    },
    ownCombat: null,
    nextTurn: async () => {
      if (!combat) return {};
      const prior = { token: current(), key: turnKey() };
      combat.turn += 1;
      if (combat.turn >= combat.order.length) { combat.turn = 0; combat.round += 1; }
      turnChange(prior, { token: current(), key: turnKey() });
      return {};
    },
    combat: async () => (combat ? { combat: { id: combat.id, round: combat.round, currentCombatantId: `Co${current()}`,
      combatants: combat.order.map((t) => ({ id: `Co${t}`, tokenId: t })) } } : {}),
    call: async (tool, args) => {
      calls.push([tool, args]);
      if (tool === "run-script") {
        return { result: { size: 100, distance: 5, square: true, rect: { x: 0, y: 0, width: cols * 100, height: rows * 100 },
          tokens: [...tokens.values()].map((t) => ({ ...t, level: null })) } };
      }
      if (tool === "move-token") { const t = tokens.get(args.tokenId); tokens.set(args.tokenId, { ...t, x: args.x, y: args.y }); }
      if (tool === "set-initiative" && combat) {
        combat.init[args.combatantId.slice(2)] = args.value;
        combat.order.sort((a, b) => (combat.init[b] ?? 0) - (combat.init[a] ?? 0));
      }
      if (tool === "set-status") {
        if (args.active) w.addEffect(args.tokenId, { statuses: [args.statusId] });
        else effects.set(args.tokenId, effectsOf(args.tokenId).filter((e) => !(e.statuses ?? []).includes(args.statusId)));
      }
      if (tool === "remove-embedded-effect") {
        const tokenId = String(args.uuid ?? "").split(".")[3];
        effects.set(tokenId, effectsOf(tokenId).filter((e) => e._id !== args.effectId));
      }
      if (tool === "get-scene-object") return { data: { actorId: `Ac${args.objectId.slice(2)}`, actorLink: false } };
      return {};
    }
  };
  return { ctx, w, log, calls, undo: async () => { for (const fn of restores.reverse()) await fn(); } };
}

const TARGET_UUID = "Scene.ScArena000000000.Token.TkTarget00000000";
// The target's part of a resolution, as the engine writes it: identified by its token's uuid, its name randomised.
const part = (over) => ({ token: TARGET_UUID, name: "Loquacious rulepack-target (1)", ...over });
const saveOutcome = (n, failsOn) => ({ success: !failsOn.includes(n), total: 10 });
const verdicts = (log) => log.filter(([k]) => k !== "log").map(([k]) => k);
const stampOf = (log) => log.filter(([k, l]) => k === "log" && l.startsWith("das-rulepack:"));
const play = async (record, structure, fake) => {
  const s = scenarioOf(record, { structure });
  expect(s.manual, s.manualBecause.join(",")).toBe(false);
  await scenario(s).run(fake.ctx);
  return s;
};
const pushEntry = (distance = 10, mode = "push") => ({ triggers: [{ on: "failedSave", do: [{ type: "move", mode, distance,
  units: "ft" }] }] });

describe("steps.mjs: monster setup", () => {
  it("casts the creature (friendly) and the target (hostile) beside it, and uses the creature's own item", async () => {
    const f = world({ onUse: () => ({ resolution: { targets: [part({ save: { success: true }, damage: { applied: 5 } })] },
      messages: [{ type: "damage", rolls: [{ total: 10 }] }] }) });
    const s = await play(monster(), null, f);
    const casts = f.calls.filter(([k]) => k === "cast");
    expect(casts.map(([, n, o]) => [n, o.disposition])).toEqual([["rulepack-caster", 1], ["rulepack-target", -1]]);
    const use = f.calls.find(([k]) => k === "use")[1];
    expect(use).toMatchObject({ tokenId: "TkCaster00000000", itemId: ITEM, activityId: ACT, targetTokenIds: ["TkTarget00000000"],
      consume: false });
    expect(f.calls.some(([k]) => k === "upsert-actor-item")).toBe(false);
    // Placed adjacent to the caster before the use.
    const t = f.w.tokens.get("TkTarget00000000");
    const c = f.w.tokens.get("TkCaster00000000");
    expect(Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y))).toBe(100);
    expect(verdicts(f.log)).toEqual(["pass"]);
    expect(stampOf(f.log)).toEqual([["log", `das-rulepack: ${s.scenario} core=9.9.9 rule=${s.rule} checks=1`]]);
  });

  it("an area activity is used on a rectangle laid over the target", async () => {
    const f = world({ onUse: () => ({ resolution: { targets: [part({ save: { success: true }, damage: { applied: 5 } })] },
      messages: [{ type: "damage", rolls: [{ total: 10 }] }] }) });
    await play(monster(), structureFor({ template: "cone" }), f);
    const use = f.calls.find(([k]) => k === "use")[1];
    const t = f.w.tokens.get("TkTarget00000000");
    expect(use.area).toEqual({ shape: "rectangle", x: t.x, y: t.y, width: 100, height: 100 });
  });

  it("a resolution that names the target only by a name no longer matches", async () => {
    const f = world({ onUse: () => ({ resolution: { targets: [{ name: "rulepack-target", save: { success: true },
      damage: { applied: 5 } }] }, messages: [{ type: "damage", rolls: [{ total: 10 }] }] }) });
    await play(monster(), null, f);
    expect(verdicts(f.log)).toEqual(["fail"]);
  });
});

describe("steps.mjs: expect.move", () => {
  const record = (mode = "push", distance = 10) => monster({ entry: pushEntry(distance, mode), assert: [] });
  const awayOrToward = (mode, squares, failsOn = [1]) => (w, params, n) => {
    const fail = failsOn.includes(n);
    if (fail && squares) {
      const c = w.tokens.get(params.tokenId);
      const t = w.tokens.get("TkTarget00000000");
      const sx = Math.sign(t.x - c.x) * (mode === "push" ? 1 : -1);
      const sy = Math.sign(t.y - c.y) * (mode === "push" ? 1 : -1);
      w.move("TkTarget00000000", sx * squares, sy * squares);
    }
    return { resolution: { targets: [part({ save: saveOutcome(n, failsOn) })] } };
  };

  it("passes on a push of the stated distance, away from the caster", async () => {
    const f = world({ onUse: awayOrToward("push", 2) });
    await play(record(), null, f);
    expect(verdicts(f.log)).toEqual(["pass"]);
  });

  it("fails on a push that went short, sideways or toward the caster", async () => {
    for (const fake of [world({ onUse: awayOrToward("push", 1) }), world({ onUse: awayOrToward("pull", 2) }),
      world({ onUse: (w, p, n) => { w.move("TkTarget00000000", 0, 2); return { resolution: { targets: [part({
        save: saveOutcome(n, [1]) })] } }; } })]) {
      await play(record(), null, fake);
      expect(verdicts(fake.log)).toEqual(["fail"]);
    }
  });

  it("fails when nothing moved", async () => {
    const f = world({ onUse: awayOrToward("push", 0) });
    await play(record(), null, f);
    expect(verdicts(f.log)).toEqual(["fail"]);
    expect(f.log.find(([k]) => k === "fail")[1]).toMatch(/moved 0/);
  });

  it("a pull starts the distance plus one square out and ends adjacent", async () => {
    const f = world({ onUse: awayOrToward("pull", 3) });
    await play(record("pull", 15), structureFor({ reach: 30, types: [] }), f);
    expect(verdicts(f.log)).toEqual(["pass"]);
  });

  it("a scene with no free lane fails, and says so", async () => {
    const f = world({ cols: 3, rows: 1, onUse: awayOrToward("push", 2) });
    f.w.tokens.clear();
    await play(record("push", 20), null, f);
    expect(f.log.find(([k]) => k === "fail")[1]).toMatch(/no free lane/);
  });
});

describe("steps.mjs: expect.condition", () => {
  const applied = (status, failsOn = [1]) => (w, p, n) => {
    if (failsOn.includes(n)) w.addEffect("TkTarget00000000", { statuses: [status] });
    return { resolution: { targets: [part({ save: saveOutcome(n, failsOn) })] } };
  };

  it("applied: passes when it appears, fails when it does not", async () => {
    const entry = { triggers: [{ on: "failedSave", do: [{ type: "status", status: "prone" }] }] };
    const ok = world({ onUse: applied("prone") });
    await play(monster({ entry, assert: [] }), null, ok);
    expect(verdicts(ok.log)).toEqual(["pass"]);
    const none = world({ onUse: applied("deafened") });
    await play(monster({ entry, assert: [] }), null, none);
    expect(verdicts(none.log)).toEqual(["fail"]);
  });

  it("ended: the condition is put on the target first and must be gone after the use", async () => {
    const ends = { given: { roll: "failedSave" }, expect: { condition: { ended: "charmed" } } };
    const cure = (works) => (w, p, n) => {
      if (works && n === 1) w.effects.set("TkTarget00000000", []);
      return { resolution: { targets: [part({ save: saveOutcome(n, [1]) })] } };
    };
    const ok = world({ onUse: cure(true) });
    await play(monster({ entry: {}, assert: [ends] }), null, ok);
    expect(ok.calls.some(([k, a]) => k === "set-status" && a.statusId === "charmed" && a.active)).toBe(true);
    expect(verdicts(ok.log)).toEqual(["pass"]);
    const kept = world({ onUse: cure(false) });
    await play(monster({ entry: {}, assert: [ends] }), null, kept);
    expect(verdicts(kept.log)).toEqual(["fail"]);
  });
});

describe("steps.mjs: expect.ends (turn by turn, in a combat)", () => {
  const applies = (word) => (w, params, n) => {
    if (n === 1) w.addEffect("TkTarget00000000", { ends: word, caster: params.tokenId, statuses: ["frightened"] });
    return { resolution: { targets: [part({ save: saveOutcome(n, [1]) })] } };
  };
  const record = (word) => monster({ entry: { effectEnds: { [EFF]: word } }, assert: [] });

  for (const word of ["casterTurnStart", "casterTurnEnd", "bearerTurnStart", "bearerTurnEnd", "currentTurnEnd"]) {
    it(`${word}: still there just before, gone just after`, async () => {
      const f = world({ onUse: applies(word) });
      await play(record(word), structureFor({ types: [] }), f);
      expect(verdicts(f.log)).toEqual(["pass", "pass"]);
      // The caster acts first (initiative 20), and the combat is ended by the restore.
      expect(f.calls.filter(([k]) => k === "set-initiative").map(([, a]) => a.value).sort()).toEqual([10, 20]);
      await f.undo();
      expect(f.calls.some(([k]) => k === "end-combat")).toBe(true);
    });
  }

  it("an effect that ends a turn too early fails before its moment; one that never ends fails after", async () => {
    const early = world({ onUse: applies("casterTurnEnd"), endsAt: () => true });
    await play(record("casterTurnEnd"), structureFor({ types: [] }), early);
    expect(verdicts(early.log)[0]).toBe("fail");
    const never = world({ onUse: applies("casterTurnEnd"), endsAt: () => false });
    await play(record("casterTurnEnd"), structureFor({ types: [] }), never);
    expect(verdicts(never.log)).toEqual(["pass", "fail"]);
  });

  it("no effect from the use fails", async () => {
    const f = world({ onUse: (w, p, n) => ({ resolution: { targets: [part({ save: saveOutcome(n, [1]) })] } }) });
    await play(record("casterTurnStart"), structureFor({ types: [] }), f);
    expect(verdicts(f.log)).toEqual(["fail"]);
  });

  it("a combat that cannot be started fails the check and withholds the stamp", async () => {
    const f = world({ onUse: applies("casterTurnStart"), combatStarts: false });
    const s = await play(record("casterTurnStart"), structureFor({ types: [] }), f);
    expect(verdicts(f.log)).toContain("fail");
    expect(f.log.find(([k]) => k === "fail")[1]).toMatch(/combat/);
    expect(stampOf(f.log)).toEqual([]);
    // `npm run played` then refuses the block: it carries no stamp (and a failed check).
    const lines = ["", `▶ ${s.scenario}`, ...f.log.map(([k, l]) => `    ${k === "log" ? "" : k === "pass" ? "✓ " : "✗ "}${l}`),
      "  ✗ 1 vérification(s) en défaut"].join("\n");
    const out = playedFrom([record("casterTurnStart")], lines, { scenarios: new Map([[s.scenario, s]]), world: "w", at: AT });
    expect(out.played).toEqual([]);
    expect(out.skipped).toHaveLength(1);
  });
});

describe("steps.mjs: expect.denies", () => {
  it("reactions and actionAndBonus: absent before the use, present after", async () => {
    const entry = { noReactions: [EFF], actionOrBonus: [EFF] };
    const apply = (w) => {
      w.addEffect("TkTarget00000000", { slowed: true });
      return { resolution: { targets: [part({ save: { success: false, total: 3 } })] } };
    };
    const blocked = (w) => { const on = (w.effects.get("TkTarget00000000") ?? []).some((e) => e.slowed);
      return { reactionBlocked: on, actionOrBonus: on }; };
    const ok = world({ onUse: apply, stats: { TkTarget00000000: blocked } });
    await play(monster({ entry, assert: [] }), structureFor({ types: [] }), ok);
    expect(verdicts(ok.log)).toEqual(["pass", "pass"]);
    const nothing = world({ onUse: (w, p, n) => ({ resolution: { targets: [part({ save: { success: false } })] } }) });
    await play(monster({ entry, assert: [] }), structureFor({ types: [] }), nothing);
    expect(verdicts(nothing.log)).toEqual(["fail", "fail"]);
    const always = world({ onUse: apply, stats: { TkTarget00000000: () => ({ reactionBlocked: true, actionOrBonus: true }) } });
    await play(monster({ entry, assert: [] }), structureFor({ types: [] }), always);
    expect(verdicts(always.log)).toEqual(["fail", "fail"]);
  });

  it("opportunityAttacks: the caster's turn leaves it free of them only after the use", async () => {
    const entry = { noOpportunity: "afterUse" };
    const structure = { activities: [{ id: ACT, type: "utility", damage: [], effects: [] }], effects: [] };
    const ok = world({ freesMovement: true });
    await play(monster({ entry, assert: [] }), structure, ok);
    expect(verdicts(ok.log)).toEqual(["pass"]);
    const nothing = world({ freesMovement: false });
    await play(monster({ entry, assert: [] }), structure, nothing);
    expect(verdicts(nothing.log)).toEqual(["fail"]);
  });
});

describe("steps.mjs: expect.damage with a type", () => {
  const typed = { given: { roll: "savedSave" }, expect: { damage: { fraction: 0.5, type: "cold" } } };
  const use = (type) => () => ({ resolution: { targets: [part({ save: { success: true }, damage: { applied: 5 } })],
    damageRoll: { damages: [{ type, value: 10 }] } }, messages: [{ type: "damage", rolls: [{ total: 10 }] }] });

  it("passes on the stated type, fails on another", async () => {
    const ok = world({ onUse: use("cold") });
    await play(monster({ entry: {}, assert: [typed] }), null, ok);
    expect(verdicts(ok.log)).toEqual(["pass"]);
    const other = world({ onUse: use("fire") });
    await play(monster({ entry: {}, assert: [typed] }), null, other);
    expect(verdicts(other.log)).toEqual(["fail"]);
  });
});
