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
// `ctx.hp` / `ctx.setHp`, `ctx.effects`, `ctx.removeStatusEffects`, `ctx.engine("status")` (the version), `ctx.expect`,
// `ctx.restore` (everything it changed is put back, even when a check fails) and `ctx.log`.
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
      const target = cast[TARGET];
      if (target) await play(ctx, json, caster, target);
      else ctx.log(`no creature ${json.setup.target.actor} on the server: nothing checked`);
      const { version } = await ctx.engine("status");
      ctx.log(`das-rulepack: ${json.scenario} core=${version} rule=${json.rule} checks=${ctx.checks}`);
    }
  };
}

async function play(ctx, json, caster, target) {
  const spell = json.setup.item.kind === "spell";
  const itemId = await ctx.ensureItem(caster, json.setup.item.uuid, spell ? { system: { method: "atwill" } } : {});
  const hp0 = await ctx.hp(target);
  ctx.restore(() => ctx.setHp(target, hp0));
  ctx.restore(() => ctx.removeEffectsNamed?.(caster, /concentr/i));
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

async function checkOne(ctx, { use, force, check, n, itemId, caster, target }) {
  const a = assertionOfCanonical(check);
  const status = a.expect.condition?.applied;
  if (status) ctx.restore(() => ctx.removeStatusEffects(target, status));
  for (let i = 1; i <= TRIES; i++) {
    await ctx.setHp(target, HP);
    if (status) await ctx.removeStatusEffects(target, status);
    const used = await ctx.use({ tokenId: caster.id, itemId, activityId: use, targetTokenIds: [target.id] });
    const r = await ctx.settle(used.usageMessageId);
    const t = (r.targets ?? []).find((x) => x.id === target.id || x.name === target.name) ?? r.targets?.[0];
    const outcome = outcomeOf(r, t);
    if (force && outcome !== force) continue;
    ctx.log(`check ${n}: ${check} (try ${i}, ${outcome ?? "no roll"})`);
    if (Object.hasOwn(a.expect, "damage")) {
      const rolled = (await ctx.messagesSince(used.usageMessageId)).filter((m) => m.type === "damage")
        .flatMap((m) => m.rolls ?? []).reduce((sum, roll) => sum + (roll.total ?? 0), 0);
      const applied = t?.damage?.applied ?? 0;
      const want = EXPECTED[a.expect.damage.fraction](rolled);
      ctx.expect(applied === want, `check ${n}: damage fraction ${a.expect.damage.fraction} (applied ${applied} of ${rolled})`);
    }
    if (status) {
      const on = (await ctx.effects(target)).some((e) => (e.statuses ?? []).includes(status));
      ctx.expect(on, `check ${n}: condition ${status} applied`);
    }
    return;
  }
  ctx.expect(false, `check ${n}: no ${force} in ${TRIES} tries`);
}
