// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-swarm-of-larvae-trait-swarm.json", { with: { type: "json" } })).default;
const SWARM = "mmSwarmOfLarvae0";
const TRAIT = "mmSwarm000000000";

// A token's Temporary Hit Points (the delta of an unlinked token, the sheet otherwise), read and set as a spell would.
async function tempHp(ctx, token) {
  const { data } = await ctx.call("get-scene-object", { type: "Token", objectId: token.id });
  const own = data.actorLink ? null : (data.delta?.system?.attributes?.hp?.temp ?? null);
  if (own !== null) return Number(own) || 0;
  const actor = await ctx.call("get-actor", { actorId: data.actorId });
  return Number(actor.system?.attributes?.hp?.temp ?? actor.actor?.system?.attributes?.hp?.temp) || 0;
}
// Temporary Hit Points given as a spell or a potion gives them: through the game system's own healing, which the engine
// watches (a value written straight on the sheet is nobody's healing, and is not what the rule speaks of).
const giveTempHp = (h, token, value) => h.script(`const a = ${h.actorOf(token)};
  await a.applyDamage([{ value: ${Number(value)}, type: "temphp" }]); return true;`);

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ swarm: SWARM, plain: "mmBanditCaptain0" }, { near: "Cible", disposition: -1 });
  const { swarm, plain } = cast ?? {};
  if (!swarm || !plain) { h.expect(false, "the swarm and the other creature could not be placed"); return; }
  await h.pause(1000);
  await giveTempHp(h, swarm, 7);
  await giveTempHp(h, plain, 7);
  await h.pause(1500);
  const got = { swarm: await tempHp(ctx, swarm), plain: await tempHp(ctx, plain) };
  // The engine's own rule for the trait (creatures share its space) must still be there under the pack's rule.
  const shares = await h.script(`const item = ${h.actorOf(swarm)}?.items.get(${JSON.stringify(TRAIT)});
    return item ? (game.modules.get("dnd5e-combat").api.content.of(item).entry ?? null) : null;`);
  h.log(`temporary hit points given 7: swarm ${got.swarm}, other creature ${got.plain}`
    + ` — the trait's entry: ${JSON.stringify(shares)}`);
  h.expect(got.swarm === 0, "check 1: the swarm gains no Temporary Hit Points");
  h.expect(got.plain === 7, "check 2: another creature given the same gains them");
  h.expect(shares?.sharesSpace === "mutual" && shares?.blocksTempHp === true,
    "check 3: the trait keeps the engine's shared-space rule beside the pack's");
});
