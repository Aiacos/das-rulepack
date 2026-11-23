// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-shadow-dragon-trait-living-shadow.json", { with: { type: "json" } })).default;
const CREATURE = "mmShadowDragon00";
const ITEM = "mmLivingShadow00";
const EFFECT = "vWSmU9Sd32bvyapm";

export default handWritten(json, async (h) => {
  const cast = await h.cast({ creature: CREATURE }, { near: "Cible lointaine", disposition: -1 });
  const creature = cast?.creature;
  if (!creature) { h.expect(false, "the creature could not be placed"); return; }
  await h.pause(2000);
  // Whether the trait's effect is in force on the creature, and one of the resistances it gives.
  const state = () => h.script(`const a = ${h.actorOf(creature)};
    const e = a.items.get(${JSON.stringify(ITEM)})?.effects.get(${JSON.stringify(EFFECT)});
    return { found: !!e, active: e?.active === true, disabled: e?.disabled === true, suppressed: e?.isSuppressed === true,
      fireResisted: a.system.traits.dr.value.has("fire") };`);

  // The arena as it is: bright light.
  const lit = await state();
  h.log(`in bright light: ${JSON.stringify(lit)}`);
  h.expect(lit.found && !lit.active && !lit.fireResisted, "check 1: in bright light the trait's Resistance is not in force");

  // No light at all for the run: the Resistance comes into force.
  await h.darkness();
  // The engine looks at the light again when the token moves: one square away and back.
  const at = await h.ctx.position(creature);
  const grid = await h.ctx.gridSize();
  await h.ctx.call("move-token", { tokenId: creature.id, x: at.x, y: at.y + grid, elevation: 0 });
  await h.pause(1200);
  await h.ctx.call("move-token", { tokenId: creature.id, x: at.x, y: at.y, elevation: 0 });
  await h.until(async () => (await state()).active, 10);
  const dark = await state();
  h.log(`in darkness: ${JSON.stringify(dark)}`);
  h.expect(dark.active && dark.fireResisted, "check 2: in darkness the trait's Resistance is in force");
});
