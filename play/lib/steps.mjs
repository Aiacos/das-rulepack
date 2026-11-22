// The interpreter of the pack's generated scenarios (play/<book>/<slug>.json), for the runner of DAS · Core:
//   cd "$DAS_CORE" && node tools/scenario.mjs <this repository>/play/<book> 2>&1 | tee <private log>
// Each generated `<slug>.mjs` is `export default scenario(<its json>)`. The runner calls `run(ctx)` in the GM's client through
// the MCP connector (DAS_CORE tools/scenario.mjs makeContext) and prints, per scenario, `▶ <name>`, one line per check and a
// verdict. `run` prints the stamp line of Ruling R10 last:
//   das-rulepack: <scenario> core=<engine version> rule=<rule fingerprint> checks=<checks played>
// which `npm run played` reads to write `evidence.played`. A run that needed a combat and could not start one prints no
// stamp (`stamp withheld: …`): nothing can be recorded from it. Everything printed is ids, engine words, numbers and
// fingerprints: never a rulebook text.
//
// It uses only what the runner's context offers: `ctx.token`, `ctx.cast` (a Monster Manual 2025 / SRD 2024 creature by its
// actor id: a monster feature's creature, and the target), `ctx.ensureItem` (a compendium item on the arena's caster),
// `ctx.use`, `ctx.settle`, `ctx.messagesSince`, `ctx.hp` / `ctx.setHp`, `ctx.position`, `ctx.box`, `ctx.effects`,
// `ctx.removeStatusEffects`, `ctx.scene`, `ctx.startCombat` / `ctx.nextTurn` / `ctx.combat` (the runner's wrappers of the
// connector's start-combat, next-turn, get-combat; end-combat is its restore), `ctx.call` (run-script: the scene's grid and
// tokens; move-token; set-initiative; set-status; get-scene-object, get-actor, update-actor / update-scene-object,
// upsert-actor-item, remove-embedded-effect), `ctx.engine` (status: the version; stats: reactions blocked, action or bonus
// action only; budget: the turn's movement freed of opportunity attacks), `ctx.engineLog`, `ctx.expect`, `ctx.restore`
// (everything it changed is put back, even when a check fails) and `ctx.log`. A check never passes on nothing: no
// resolution, no damage, no new condition, no move, no effect to end, no change of what the engine reports fail it.
import { assertionOfCanonical } from "../../tools/pipeline/registry.mjs";

const TRIES = 20;
const TARGET = "rulepack-target";
const CASTER = "rulepack-caster";
const HP = 100;
// The connector's tools are asynchronous on the GM's client: pauses let the engine finish (a forced move, a turn's endings).
// `timing.scale` 0 makes them instant (the pack's tests).
export const timing = { scale: 1 };
const pause = (ms) => (timing.scale ? new Promise((r) => setTimeout(r, ms * timing.scale)) : Promise.resolve());

// How many turn changes pass, after the effect is placed during the caster's turn (the caster acts first, then the target),
// before the one at which it must end (tools/pipeline/definitions.mjs `ends`; DAS_CORE core/effect-ends.mjs effectEndsNow).
const TURNS_BEFORE = Object.freeze({ casterTurnStart: 1, casterTurnEnd: 2, bearerTurnStart: 0, bearerTurnEnd: 1,
  currentTurnEnd: 0 });
// What DAS_CORE's `stats` test function reports for each denial on the bearer (runtime/testing-rules.mjs).
const STAT_OF = Object.freeze({ reactions: "reactionBlocked", actionAndBonus: "actionOrBonus" });

// The outcome of a resolution for the target, in the assertion vocabulary's words (assert.mjs ROLLS), or null.
function outcomeOf(resolution, target) {
  if (typeof target?.save?.success === "boolean") return target.save.success ? "savedSave" : "failedSave";
  if (typeof target?.hit === "boolean") return resolution?.attack?.roll?.isCritical ? "crit" : target.hit ? "hit" : "miss";
  return null;
}
const EXPECTED = { 0: () => 0, 0.5: (t) => Math.floor(t / 2), 1: (t) => t, 2: (t) => 2 * t };
const isConcentration = (e) => /concentr/i.test(e?.name ?? "") || (e?.statuses ?? []).includes("concentrating");
const idOf = (e) => e?._id ?? e?.id;
// The engine names a resolution's target by its token's uuid (`Scene.<id>.Token.<id>`); its name may be randomised.
const isTarget = (x, token) => typeof x?.token === "string" && x.token.endsWith(`.Token.${token.id}`);

/** `{ name, scene, run(ctx) }` for the runner, from a scenario's JSON (tools/pipeline/scenarios.mjs scenarioOf). */
export function scenario(json) {
  if (json?.manual !== false) {
    throw new Error(`${json?.scenario}: a manual scenario is a checklist for a person (npm run played -- --manual)`);
  }
  return {
    name: json.scenario,
    scene: json.setup.scene,
    async run(ctx) {
      const env = { ctx, json, combat: null, withheld: null };
      const roles = await castOf(ctx, json);
      // Every check observes something that happened; no creature means nothing could: the scenario fails.
      if (roles) await play(env, roles);
      const { version } = await ctx.engine("status");
      if (env.withheld) ctx.log(`stamp withheld: ${env.withheld}`);
      else ctx.log(`das-rulepack: ${json.scenario} core=${version} rule=${json.rule} checks=${ctx.checks}`);
    }
  };
}

// The caster, the target and the item used: a monster feature's creature is cast (friendly) and uses its own item; anything
// else is lent to the arena's caster. The target is cast hostile next to the caster.
async function castOf(ctx, json) {
  const { item } = json.setup;
  if (item.kind === "monster") {
    const caster = (await ctx.cast({ [CASTER]: item.actor }, { near: json.setup.near, disposition: 1 }))?.[CASTER] ?? null;
    if (!caster) {
      ctx.expect(false, `no creature ${item.actor} on the server: nothing could be checked`);
      return null;
    }
    const at = await ctx.position(caster);
    const target = await castTarget(ctx, json, { x: at.x, y: at.y });
    return target ? { caster, target, itemId: item.id, monster: true } : null;
  }
  const caster = await ctx.token(json.setup.caster);
  const target = await castTarget(ctx, json, json.setup.near);
  if (!target) return null;
  const spell = item.kind === "spell";
  const { doc, items } = await keepCaster(ctx, caster);
  const itemId = await ctx.ensureItem(caster, item.uuid, spell ? { system: { method: "atwill" } } : {});
  const held = items.get(itemId);
  if (held) {
    // The caster already held it: ensureItem lent nothing, so its spent uses are put back as they were.
    const itemData = { "system.uses.spent": held.system?.uses?.spent ?? 0 };
    for (const [id, a] of Object.entries(held.system?.activities ?? {})) {
      itemData[`system.activities.${id}.uses.spent`] = a?.uses?.spent ?? 0;
    }
    ctx.restore(() => ctx.call("upsert-actor-item", { actorId: doc.actorId, itemData, match: { path: "_id", value: itemId } }));
  }
  return { caster, target, itemId, monster: false };
}

async function castTarget(ctx, json, near) {
  const target = (await ctx.cast({ [TARGET]: json.setup.target.actor }, { near, disposition: -1 }))?.[TARGET] ?? null;
  if (!target) ctx.expect(false, `no creature ${json.setup.target.actor} on the server: nothing could be checked`);
  return target;
}

// A token's document target for the connector's embedded-document calls, as the runner builds it (linked or not).
async function documentOf(ctx, token) {
  const { data } = await ctx.call("get-scene-object", { type: "Token", objectId: token.id });
  const linked = !!data.actorLink;
  const scene = linked ? null : (await ctx.scene()).sceneId;
  const target = linked ? { documentType: "Actor", id: data.actorId }
    : { uuid: `Scene.${scene}.Token.${token.id}.Actor.${data.actorId}` };
  return { actorId: data.actorId, linked, target };
}

// Puts back what the run changed on the arena's caster: the uses of an item it already held, its spell slots, and only the
// concentration effects the run added.
async function keepCaster(ctx, caster) {
  const doc = await documentOf(ctx, caster);
  const actor = await ctx.call("get-actor", { actorId: doc.actorId });
  const items = new Map((actor?.items ?? []).map((i) => [i._id, i]));
  const spells = actor?.system?.spells;
  if (spells) {
    ctx.restore(() => (doc.linked
      ? ctx.call("update-actor", { actorId: doc.actorId, actorData: { "system.spells": spells } })
      : ctx.call("update-scene-object", { type: "Token", objectId: caster.id, data: { "delta.system.spells": spells } })));
  }
  const before = new Set((await ctx.effects(caster)).map(idOf));
  ctx.restore(async () => {
    for (const e of (await ctx.effects(caster)).filter((x) => !before.has(idOf(x)) && isConcentration(x))) {
      await ctx.call("remove-embedded-effect", { ...doc.target, effectId: idOf(e) });
    }
  });
  return { doc, items };
}

async function play(env, roles) {
  const { ctx } = env;
  const hp0 = await ctx.hp(roles.target);
  ctx.restore(() => ctx.setHp(roles.target, hp0));
  // The steps come in groups: use, force? or observe?, check. Each check is its own use of the activity.
  let group = {};
  let n = 0;
  for (const step of env.json.steps) {
    Object.assign(group, step);
    if (!Object.hasOwn(step, "check")) continue;
    n += 1;
    await checkOne(env, roles, { ...group, n });
    group = {};
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Placement on the grid.

// The scene's square grid and its tokens, read in the GM's client (the same canvas the runner's cast script reads).
const GEOMETRY = "const s = canvas.scene; const g = s.grid; const r = s.dimensions.sceneRect;\n"
  + "return { size: g.size, distance: g.distance, square: !!g.isSquare, rect: { x: r.x, y: r.y, width: r.width,"
  + " height: r.height }, tokens: s.tokens.contents.map((t) => ({ id: t.id, x: t._source.x, y: t._source.y, w: t.width,"
  + " h: t.height, level: t.level ?? null })) };";
const DIRS = Object.freeze([["east", 1, 0], ["south", 0, 1], ["west", -1, 0], ["north", 0, -1]]);
const sizeOf = (t) => ({ w: Math.max(1, Math.round(Number(t?.w) || 1)), h: Math.max(1, Math.round(Number(t?.h) || 1)) });
const cellOf = (geo, t) => ({ col: Math.round((t.x - geo.rect.x) / geo.size), row: Math.round((t.y - geo.rect.y) / geo.size),
  ...sizeOf(t) });
/** Squares between two footprints, as DAS_CORE core/movement.mjs footprintGap counts them (adjacent: 1). */
export function gapOf(a, b) {
  const gap = (a0, aLen, b0, bLen) => Math.max(0, b0 - (a0 + aLen - 1), a0 - (b0 + bLen - 1));
  const dc = gap(a.col, a.w, b.col, b.w);
  const dr = gap(a.row, a.h, b.row, b.h);
  return dc === 0 && dr === 0 ? 0 : Math.max(dc, dr, 1);
}

/**
 * Where to put the target (and the caster, when `moveCaster` and its own place has no room): `{ caster: {x,y}|null, target:
 * {x,y}, dir }` in pixels, or null. The target goes `gap` squares from the caster's edge, centred on one of its sides; a push
 * needs the `lane` squares beyond it free, a pull the squares between it and the caster; of the sides that fit, the one with
 * the most free squares in a row. `geo` is the GEOMETRY script's result.
 */
export function placementOf(geo, { casterId, targetId, gap = 1, lane = 0, mode = null, moveCaster = false }) {
  if (!geo?.square || !(geo.size > 0)) return null;
  const casterTok = geo.tokens.find((t) => t.id === casterId);
  const targetTok = geo.tokens.find((t) => t.id === targetId);
  if (!casterTok || !targetTok) return null;
  const cols = Math.floor(geo.rect.width / geo.size);
  const rows = Math.floor(geo.rect.height / geo.size);
  const level = casterTok.level ?? null;
  const busy = new Set();
  for (const t of geo.tokens) {
    if (t.id === casterId || t.id === targetId || (t.level ?? null) !== level) continue;
    const c = cellOf(geo, t);
    for (let i = 0; i < c.w; i++) for (let j = 0; j < c.h; j++) busy.add(`${c.col + i},${c.row + j}`);
  }
  const free = (f, also = null) => {
    if (f.col < 0 || f.row < 0 || f.col + f.w > cols || f.row + f.h > rows) return false;
    for (let i = 0; i < f.w; i++) {
      for (let j = 0; j < f.h; j++) {
        if (busy.has(`${f.col + i},${f.row + j}`)) return false;
        if (also && gapOf({ col: f.col + i, row: f.row + j, w: 1, h: 1 }, also) === 0) return false;
      }
    }
    return true;
  };
  const t = sizeOf(targetTok);
  // The target's footprint `g` squares from the caster `c` toward `d`, centred on that side.
  const at = (c, [, dc, dr], g) => ({
    col: dc > 0 ? c.col + c.w - 1 + g : dc < 0 ? c.col - g - (t.w - 1) : c.col + Math.floor((c.w - t.w) / 2),
    row: dr > 0 ? c.row + c.h - 1 + g : dr < 0 ? c.row - g - (t.h - 1) : c.row + Math.floor((c.h - t.h) / 2),
    w: t.w, h: t.h
  });
  const needs = mode === "pull" ? [...Array(gap).keys()].map((k) => k + 1)
    : [...Array(lane + 1).keys()].map((k) => gap + k);
  const best = (c) => {
    let chosen = null;
    for (const d of DIRS) {
      if (!needs.every((g) => free(at(c, d, g), c))) continue;
      let room = 0;
      while (room < cols + rows && free(at(c, d, gap + room), c)) room += 1;
      if (!chosen || room > chosen.room) chosen = { d, room };
    }
    return chosen;
  };
  const px = (f) => ({ x: geo.rect.x + f.col * geo.size, y: geo.rect.y + f.row * geo.size });
  const here = cellOf(geo, casterTok);
  const done = (c, moved) => {
    const b = best(c);
    return b ? { caster: moved ? px(c) : null, target: px(at(c, b.d, gap)), dir: b.d[0] } : null;
  };
  const stay = done(here, false);
  if (stay || !moveCaster) return stay;
  const spots = [];
  for (let col = 0; col + here.w <= cols; col++) {
    for (let row = 0; row + here.h <= rows; row++) {
      const c = { col, row, w: here.w, h: here.h };
      if (free(c)) spots.push([Math.max(Math.abs(col - here.col), Math.abs(row - here.row)), row, col, c]);
    }
  }
  spots.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  for (const [, , , c] of spots) {
    const found = done(c, true);
    if (found) return found;
  }
  return null;
}

// Puts the target where the check needs it (adjacent, or a pull's distance plus one square out); null when it cannot.
async function place(env, roles, move) {
  const { ctx } = env;
  const geo = (await ctx.call("run-script", { code: GEOMETRY, waitMs: 10000 }))?.result ?? null;
  if (!geo?.rect) return { why: "the scene's grid could not be read" };
  const squares = Number.isFinite(move?.distance) ? move.distance / geo.distance : 2;
  const pull = move?.mode === "pull";
  const opts = { casterId: roles.caster.id, targetId: roles.target.id, mode: move?.mode ?? null, moveCaster: roles.monster,
    gap: pull ? Math.ceil(squares) + 1 : 1, lane: move && !pull ? Math.ceil(squares) : 0 };
  const spot = placementOf(geo, opts);
  const grid = geo.square ? "" : " (no square grid)";
  if (!spot) return { why: `no free lane of ${opts.gap + opts.lane} square(s) beside the caster${grid}` };
  if (spot.caster) {
    await ctx.call("move-token", { tokenId: roles.caster.id, x: spot.caster.x, y: spot.caster.y, elevation: 0 });
    await pause(600);
  }
  const now = await ctx.position(roles.target);
  if (now.x !== spot.target.x || now.y !== spot.target.y) {
    await ctx.call("move-token", { tokenId: roles.target.id, x: spot.target.x, y: spot.target.y, elevation: 0 });
    await pause(600);
  }
  const there = await ctx.position(roles.target);
  if (there.x !== spot.target.x || there.y !== spot.target.y) return { why: "the target could not be moved into place" };
  return { geo, from: await ctx.position(roles.caster), to: there };
}

// The engine's own line about the last forced move (runtime/engine-commands.mjs forcedMove), for a failure message.
async function moveNote(ctx) {
  if (typeof ctx.engineLog !== "function") return "";
  const lines = (await ctx.engineLog().catch(() => [])).filter((l) => /(?:pushed|pulled) \d+ square\(s\) out of \d+/.test(l));
  const m = /(pushed|pulled) (\d+) square\(s\) out of (\d+)( \(stopped\))?/.exec(lines.at(-1) ?? "");
  return m ? `; engine: ${m[1]} ${m[2]} of ${m[3]}${m[4] ? ", stopped by the scene" : ""}` : "";
}

// ---------------------------------------------------------------------------------------------------------------------------
// Combat.

const combatOf = async (ctx) => {
  const s = typeof ctx.combat === "function" ? await ctx.combat() : null;
  return s?.combat ?? s?.combats?.[0] ?? s ?? null;
};
const currentToken = async (ctx) => {
  const c = await combatOf(ctx);
  return (c?.combatants ?? []).find((x) => x.id === c.currentCombatantId)?.tokenId ?? null;
};

// One combat for the scenario, the caster first (initiative 20), the target second (10); the runner's restore ends it. When
// it cannot be started, the check fails and the stamp is withheld.
async function combatReady(env, roles, n) {
  const { ctx } = env;
  if (!env.combat) {
    let why = null;
    try {
      await ctx.startCombat([roles.caster, roles.target]);
      const c = await combatOf(ctx);
      const of = (id) => (c?.combatants ?? []).find((x) => x.tokenId === id);
      if (!of(roles.caster.id) || !of(roles.target.id)) why = "no combat holds both creatures";
      else {
        for (const [t, value] of [[roles.caster, 20], [roles.target, 10]]) {
          await ctx.call("set-initiative", { combatantId: of(t.id).id, value, combatId: ctx.ownCombat });
        }
        const round = Number((await combatOf(ctx))?.round);
        if (!(round >= 1)) why = `it has not started (round ${Number.isFinite(round) ? round : "none"})`;
      }
    } catch (e) {
      why = String(e?.message ?? e).slice(0, 160);
    }
    env.combat = { ok: !why, why };
    if (why) env.withheld = "a check needed a combat that could not be started";
  }
  if (!env.combat.ok) ctx.expect(false, `check ${n}: the combat it needs could not be started (${env.combat.why})`);
  return env.combat.ok;
}

// One turn on, and seen to be: next-turn is asked, then the current combatant is read until it has changed (a creature that
// cannot act, or a window the engine opens at a turn's end, can delay it); asked once more when it has not. False when the
// turn still has not changed.
async function advance(ctx) {
  const before = await currentToken(ctx);
  for (let attempt = 0; attempt < 2; attempt++) {
    await ctx.nextTurn();
    for (let k = 0; k < 12; k++) {
      await pause(500);
      if ((await currentToken(ctx)) !== before) { await pause(1000); return true; }
    }
  }
  return false;
}

// The start of a new turn of the caster (its budget fresh, a new turn for an effect's placement).
async function casterTurn(ctx, roles) {
  for (let i = 0; i < 4; i++) {
    await ctx.nextTurn();
    await pause(1500);
    if ((await currentToken(ctx)) === roles.caster.id) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------------
// One check.

const hasStatus = (effects, status) => effects.some((e) => (e.statuses ?? []).includes(status) && !e.disabled);
const statOf = async (ctx, token, field) => (await ctx.engine("stats", { tokenId: token.id }).catch(() => null))?.[field];
const disengaged = async (ctx, token) => (await ctx.engine("budget", { tokenId: token.id }).catch(() => null))?.disengaged;

// Removes the effects the use left on the target (ids not in `before`).
async function clearNew(ctx, target, before) {
  const added = (await ctx.effects(target)).filter((e) => !before.has(idOf(e)));
  if (!added.length) return;
  const doc = await documentOf(ctx, target);
  for (const e of added) await ctx.call("remove-embedded-effect", { ...doc.target, effectId: idOf(e) }).catch(() => {});
}

async function checkOne(env, roles, { use, force, observe, check, n }) {
  const { ctx, json } = env;
  const { caster, target, itemId } = roles;
  const a = assertionOfCanonical(check);
  const e = a.expect;
  const applied = e.condition?.applied;
  const ended = e.condition?.ended;
  const move = e.move ?? null;
  const ends = Object.hasOwn(TURNS_BEFORE, e.ends) ? e.ends : null;
  const denies = e.denies ?? null;
  const roll = force ?? observe ?? null;
  if (applied) ctx.restore(() => ctx.removeStatusEffects(target, applied));
  if (ended) {
    ctx.restore(async () => {
      await ctx.call("set-status", { tokenId: target.id, statusId: ended, active: false }).catch(() => {});
      await ctx.removeStatusEffects(target, ended);
    });
  }
  // An ending at a turn boundary, and a move freed of opportunity attacks, are read in a combat, from a new caster's turn.
  if (ends || denies === "opportunityAttacks") {
    if (!(await combatReady(env, roles, n))) return;
    if (!(await casterTurn(ctx, roles))) return ctx.expect(false, `check ${n}: the caster's turn never came back`);
  }
  for (let i = 1; i <= TRIES; i++) {
    await ctx.setHp(target, HP);
    if (applied) await ctx.removeStatusEffects(target, applied);
    let spot = null;
    if (roles.monster || move) {
      spot = await place(env, roles, move);
      if (spot.why) return ctx.expect(false, `check ${n}: ${spot.why}`);
    }
    if (ended) {
      await ctx.call("set-status", { tokenId: target.id, statusId: ended, active: true });
      await pause(400);
    }
    const effects0 = await ctx.effects(target);
    const before = new Set(effects0.map(idOf));
    const had = { applied: applied ? hasStatus(effects0, applied) : false, ended: ended ? hasStatus(effects0, ended) : false,
      denied: STAT_OF[denies] ? await statOf(ctx, target, STAT_OF[denies]) : null,
      free: denies === "opportunityAttacks" ? await disengaged(ctx, caster) : null };
    const area = (json.setup.area ?? []).includes(use) ? { area: { shape: "rectangle", ...(await ctx.box(target)) } } : {};
    const used = await ctx.use({ tokenId: caster.id, itemId, activityId: use, targetTokenIds: [target.id],
      ...(roles.monster || json.setup.item?.kind === "item" ? { consume: false } : {}), ...area });
    if (used?.used === false || !used?.usageMessageId) {
      throw new Error(`check ${n}: the use of activity ${use} was refused (${used?.reason ?? used?.error ?? "no usage message"})`);
    }
    // An activity with no roll that only frees the caster's own move may resolve nothing on the target, or nothing at all.
    const ownTurn = denies === "opportunityAttacks" && !roll;
    const r = ownTurn ? await ctx.settle(used.usageMessageId).catch(() => null) : await ctx.settle(used.usageMessageId);
    const t = (r?.targets ?? []).find((x) => isTarget(x, target)) ?? null;
    // No resolution for the target: nothing happened to it, so nothing can be checked as held.
    if (!t && !ownTurn) return ctx.expect(false, `check ${n}: no resolution for the target (activity ${use})`);
    const outcome = t ? outcomeOf(r, t) : null;
    if (roll && outcome !== roll) {
      await clearNew(ctx, target, before);
      continue;
    }
    ctx.log(`check ${n}: ${check} (activity ${use}, try ${i}, ${outcome ?? "no roll"})`);
    // What the resolution's application does on the GM's client (statuses, effects, a forced move) lands a moment later.
    await pause(800);
    if (Object.hasOwn(e, "damage")) await checkDamage(ctx, { n, e, r, t, used });
    if (applied) {
      const after = hasStatus(await ctx.effects(target), applied);
      const seen = had.applied ? "already there" : after ? "new" : "absent";
      ctx.expect(!had.applied && after, `check ${n}: condition ${applied} applied (${seen})`);
    }
    if (ended) {
      const after = hasStatus(await ctx.effects(target), ended);
      ctx.expect(had.ended && !after, `check ${n}: condition ${ended} ended (${had.ended ? "set" : "could not be set"} before,`
        + ` ${after ? "still there" : "gone"} after)`);
    }
    if (move && spot) await checkMove(ctx, { n, move, roles, spot });
    if (STAT_OF[denies]) {
      const after = await statOf(ctx, target, STAT_OF[denies]);
      ctx.expect(had.denied === false && after === true,
        `check ${n}: denies ${denies} (engine ${STAT_OF[denies]}: ${had.denied ?? "none"} before, ${after ?? "none"} after)`);
    }
    if (denies === "opportunityAttacks") {
      let after = await disengaged(ctx, caster);
      for (let k = 0; k < 6 && after !== true; k++) { await pause(500); after = await disengaged(ctx, caster); }
      ctx.expect(had.free === false && after === true,
        `check ${n}: denies opportunityAttacks (caster's turn freed: ${had.free ?? "none"} before, ${after ?? "none"} after)`);
    }
    if (ends) await checkEnds(ctx, { n, ends, roles, before });
    await clearNew(ctx, target, before);
    return;
  }
  ctx.expect(false, `check ${n}: no ${roll} in ${TRIES} tries (activity ${use})`);
}

async function checkDamage(ctx, { n, e, r, t, used }) {
  const messages = (await ctx.messagesSince(used.usageMessageId)).filter((m) => m.type === "damage");
  const rolled = messages.flatMap((m) => m.rolls ?? []).reduce((sum, roll) => sum + (Number(roll.total) || 0), 0);
  const applied = t.damage?.applied;
  const { fraction, type } = e.damage;
  // Fraction above 0: damage was rolled and applied. Fraction 0: damage was rolled, or the resolution says 0 applied.
  const happened = fraction > 0 ? rolled > 0 && Number.isFinite(applied) && applied > 0
    : rolled > 0 || Number.isFinite(applied);
  // The types the roll carried: the resolution's damage roll (DAS_CORE adapter/messages.mjs readDamageMessage), else the rolls'.
  const types = [...new Set([...(r?.damageRoll?.damages ?? []).map((d) => d?.type),
    ...messages.flatMap((m) => m.rolls ?? []).map((x) => x?.options?.type)].filter((x) => typeof x === "string" && x))];
  const typed = !type || types.includes(type);
  const ok = happened && typed && (applied ?? 0) === EXPECTED[fraction](rolled);
  ctx.expect(ok, `check ${n}: damage fraction ${fraction}${type ? ` ${type}` : ""} (applied ${applied ?? "none"} of ${rolled}`
    + ` rolled${type ? `, types ${types.join("/") || "none"}` : ""})`);
}

// A forced move: measured on the grid, squares from the caster before and after, the squares travelled; exact when the
// distance is stated (the lane was free, so the full distance is expected).
async function checkMove(ctx, { n, move, roles, spot }) {
  const { geo } = spot;
  let to = await ctx.position(roles.target);
  for (let k = 0; k < 8; k++) {
    await pause(500);
    const now = await ctx.position(roles.target);
    if (now.x === to.x && now.y === to.y && (now.x !== spot.to.x || now.y !== spot.to.y)) break;
    to = now;
  }
  const cell = (p, s) => ({ ...cellOf(geo, { x: p.x, y: p.y }), ...s });
  const casterCell = cell(spot.from, sizeOf(geo.tokens.find((t) => t.id === roles.caster.id)));
  const targetSize = sizeOf(geo.tokens.find((t) => t.id === roles.target.id));
  const a = cell(spot.to, targetSize);
  const b = cell(to, targetSize);
  const moved = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
  const gap0 = gapOf(casterCell, a);
  const gap1 = gapOf(casterCell, b);
  const squares = Number.isFinite(move.distance) ? move.distance / geo.distance : null;
  const straight = moved >= 1 && (move.mode === "pull" ? gap0 - gap1 : gap1 - gap0) === moved;
  const ok = straight && (squares === null || moved === squares);
  const note = ok ? "" : await moveNote(ctx);
  ctx.expect(ok, `check ${n}: ${move.mode} ${squares === null ? "" : `${move.distance} ft `}(moved ${moved} square(s),`
    + ` ${gap0} → ${gap1} from the caster${note})`);
}

// An effect still on the target, for a failure message: its own name and the end of its origin.
const stayed = (x) => `${String(x.name ?? "?").slice(0, 30)} from ${String(x.origin ?? "?").slice(-40)}`;

// An effect the use left on the target ends at its turn boundary: still there just before it, gone just after.
async function checkEnds(ctx, { n, ends, roles, before }) {
  const { target, itemId } = roles;
  const fresh = (await ctx.effects(target)).filter((x) => !before.has(idOf(x)) && !x.disabled);
  const own = fresh.filter((x) => String(x.origin ?? "").includes(`Item.${itemId}`));
  // Not the item's by its id: then whatever the use placed, which has an origin. A status the system adds by itself when the
  // hit lands (Bloodied under half the hit points) has none, and is not the use's effect: it would never end at a turn.
  const sourced = fresh.filter((x) => typeof x.origin === "string" && x.origin);
  const placed = new Set((own.length ? own : sourced.length ? sourced : fresh).map(idOf));
  if (!placed.size) return ctx.expect(false, `check ${n}: no effect of the use on the target, nothing to end at ${ends}`);
  const present = async () => (await ctx.effects(target)).some((x) => placed.has(idOf(x)) && !x.disabled);
  for (let k = 0; k < TURNS_BEFORE[ends]; k++) await advance(ctx);
  ctx.expect(await present(), `check ${n}: its effect is still there just before ${ends} (${TURNS_BEFORE[ends]} turn(s) on)`);
  const turned = await advance(ctx);
  let gone = false;
  for (let k = 0; k < 10 && !gone; k++) { await pause(500); gone = !(await present()); }
  // A turn that did not change is said: the effect was then never given its boundary, and the check proves nothing of it.
  // What is still there is named (an effect's own name, as the item gives it): a failure then says which effect stayed.
  const left = gone ? [] : (await ctx.effects(target)).filter((x) => placed.has(idOf(x)) && !x.disabled);
  const note = `${turned ? "" : " (the turn did not change after next-turn)"}`
    + `${left.length ? ` (still there: ${left.map(stayed).join("; ")}` : ""}`
    + `${left.length ? `; placed ${placed.size}, own ${own.length}, fresh ${fresh.length})` : ""}`;
  ctx.expect(gone, `check ${n}: its effect is gone at ${ends}${note}`);
}
