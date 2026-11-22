// The interpreter of the pack's generated scenarios (play/<book>/<slug>.json), for the runner of DAS · Core:
//   cd "$DAS_CORE" && node tools/scenario.mjs <this repository>/play/<book> 2>&1 | tee <private log>
// Each generated `<slug>.mjs` is `export default scenario(<its json>)`. The runner calls `run(ctx)` in the GM's client through
// the MCP connector (DAS_CORE tools/scenario.mjs makeContext) and prints, per scenario, `▶ <name>`, one line per check and a
// verdict. `run` prints the stamp line of Ruling R10 last:
//   das-rulepack: <scenario> core=<engine version> rule=<rule fingerprint> checks=<checks played>
// which `npm run played` reads to write `evidence.played`. Everything printed is ids, engine words, numbers and fingerprints:
// never a rulebook text.
//
// It uses only what the runner's context offers: `ctx.token`, `ctx.cast` (an SRD 2024 creature for the target),
// `ctx.ensureItem` (the item on the caster: no testApi function places one), `ctx.use`, `ctx.settle`, `ctx.messagesSince`,
// `ctx.hp` / `ctx.setHp`, `ctx.effects`, `ctx.removeStatusEffects`, `ctx.scene`, `ctx.call` (get-scene-object, get-actor,
// update-actor / update-scene-object, upsert-actor-item, remove-embedded-effect: to put the caster back as it was),
// `ctx.engine("status")` (the version), `ctx.expect`, `ctx.restore` (everything it changed is put back, even when a check
// fails) and `ctx.log`. A check never passes on nothing: no resolution, no damage, no new condition fail it.
import { assertionOfCanonical } from "../../tools/pipeline/registry.mjs";

const TRIES = 12;
const TARGET = "rulepack-target";
const HP = 100;

// The outcome of a resolution for the target, in the assertion vocabulary's words (assert.mjs ROLLS), or null.
function outcomeOf(resolution, target) {
  if (typeof target?.save?.success === "boolean") return target.save.success ? "savedSave" : "failedSave";
  if (typeof target?.hit === "boolean") return resolution?.attack?.roll?.isCritical ? "crit" : target.hit ? "hit" : "miss";
  return null;
}
const EXPECTED = { 0: () => 0, 0.5: (t) => Math.floor(t / 2), 1: (t) => t, 2: (t) => 2 * t };
const isConcentration = (e) => /concentr/i.test(e?.name ?? "") || (e?.statuses ?? []).includes("concentrating");
const idOf = (e) => e?._id ?? e?.id;

/** `{ name, scene, run(ctx) }` for the runner, from a scenario's JSON (tools/pipeline/scenarios.mjs scenarioOf). */
export function scenario(json) {
  if (json?.manual !== false) {
    throw new Error(`${json?.scenario}: a manual scenario is a checklist for a person (npm run played -- --manual)`);
  }
  return {
    name: json.scenario,
    scene: json.setup.scene,
    async run(ctx) {
      const caster = await ctx.token(json.setup.caster);
      const cast = await ctx.cast({ [TARGET]: json.setup.target.actor }, { near: json.setup.near, disposition: -1 });
      const target = cast?.[TARGET];
      // Every check observes something that happened; no creature means nothing could: the scenario fails.
      if (target) await play(ctx, json, caster, target);
      else ctx.expect(false, `no creature ${json.setup.target.actor} on the server: nothing could be checked`);
      const { version } = await ctx.engine("status");
      ctx.log(`das-rulepack: ${json.scenario} core=${version} rule=${json.rule} checks=${ctx.checks}`);
    }
  };
}

// The caster's document target for the connector's embedded-document calls, as the runner builds it (linked or not).
async function documentOf(ctx, token) {
  const { data } = await ctx.call("get-scene-object", { type: "Token", objectId: token.id });
  const linked = !!data.actorLink;
  const scene = linked ? null : (await ctx.scene()).sceneId;
  const target = linked ? { documentType: "Actor", id: data.actorId }
    : { uuid: `Scene.${scene}.Token.${token.id}.Actor.${data.actorId}` };
  return { actorId: data.actorId, linked, target };
}

// Puts back what the run changed on the caster: the uses of an item it already held, its spell slots, and only the
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

async function play(ctx, json, caster, target) {
  const spell = json.setup.item.kind === "spell";
  const { doc, items } = await keepCaster(ctx, caster);
  const itemId = await ctx.ensureItem(caster, json.setup.item.uuid, spell ? { system: { method: "atwill" } } : {});
  const held = items.get(itemId);
  if (held) {
    // The caster already held it: ensureItem lent nothing, so its spent uses are put back as they were.
    const itemData = { "system.uses.spent": held.system?.uses?.spent ?? 0 };
    for (const [id, a] of Object.entries(held.system?.activities ?? {})) {
      itemData[`system.activities.${id}.uses.spent`] = a?.uses?.spent ?? 0;
    }
    ctx.restore(() => ctx.call("upsert-actor-item", { actorId: doc.actorId, itemData, match: { path: "_id", value: itemId } }));
  }
  const hp0 = await ctx.hp(target);
  ctx.restore(() => ctx.setHp(target, hp0));
  // The steps come in groups: use, force?, check. Each check is its own use of the activity.
  let group = {};
  let n = 0;
  for (const step of json.steps) {
    Object.assign(group, step);
    if (!Object.hasOwn(step, "check")) continue;
    n += 1;
    await checkOne(ctx, { ...group, n, itemId, caster, target });
    group = {};
  }
}

const hasStatus = (effects, status) => effects.some((e) => (e.statuses ?? []).includes(status));

async function checkOne(ctx, { use, force, check, n, itemId, caster, target }) {
  const a = assertionOfCanonical(check);
  const status = a.expect.condition?.applied;
  if (status) ctx.restore(() => ctx.removeStatusEffects(target, status));
  for (let i = 1; i <= TRIES; i++) {
    await ctx.setHp(target, HP);
    if (status) await ctx.removeStatusEffects(target, status);
    const before = status ? hasStatus(await ctx.effects(target), status) : false;
    const used = await ctx.use({ tokenId: caster.id, itemId, activityId: use, targetTokenIds: [target.id] });
    if (used?.used === false || !used?.usageMessageId) {
      throw new Error(`check ${n}: the use of activity ${use} was refused (${used?.reason ?? used?.error ?? "no usage message"})`);
    }
    const r = await ctx.settle(used.usageMessageId);
    const t = (r?.targets ?? []).find((x) => x.id === target.id || x.name === target.name) ?? null;
    // No resolution for the target: nothing happened to it, so nothing can be checked as held.
    if (!t) return ctx.expect(false, `check ${n}: no resolution for the target (activity ${use})`);
    const outcome = outcomeOf(r, t);
    if (force && outcome !== force) continue;
    ctx.log(`check ${n}: ${check} (activity ${use}, try ${i}, ${outcome ?? "no roll"})`);
    if (Object.hasOwn(a.expect, "damage")) {
      const rolled = (await ctx.messagesSince(used.usageMessageId)).filter((m) => m.type === "damage")
        .flatMap((m) => m.rolls ?? []).reduce((sum, roll) => sum + (Number(roll.total) || 0), 0);
      const applied = t.damage?.applied;
      const { fraction } = a.expect.damage;
      // Fraction above 0: damage was rolled and applied. Fraction 0: damage was rolled, or the resolution says 0 applied.
      const happened = fraction > 0 ? rolled > 0 && Number.isFinite(applied) && applied > 0
        : rolled > 0 || Number.isFinite(applied);
      const ok = happened && (applied ?? 0) === EXPECTED[fraction](rolled);
      ctx.expect(ok, `check ${n}: damage fraction ${fraction} (applied ${applied ?? "none"} of ${rolled} rolled)`);
    }
    if (status) {
      const after = hasStatus(await ctx.effects(target), status);
      const seen = before ? "already there" : after ? "new" : "absent";
      ctx.expect(!before && after, `check ${n}: condition ${status} applied (${seen})`);
    }
    return;
  }
  ctx.expect(false, `check ${n}: no ${force} in ${TRIES} tries (activity ${use})`);
}
