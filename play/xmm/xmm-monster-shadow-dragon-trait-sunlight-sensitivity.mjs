// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-shadow-dragon-trait-sunlight-sensitivity.json", { with: { type: "json" } })).default;
const CREATURE = "mmShadowDragon00";
const TRAIT = "mmSunlightSensit";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE, plain: "mmBanditCaptain0" }, { near: "Cible", disposition: -1 });
  const { creature, plain } = cast ?? {};
  if (!creature || !plain) { h.expect(false, "the creature and the other one could not be placed"); return; }
  // Sunlight, for the engine, is a bright global light where the token stands: the scene is given one for the run.
  const was = await h.script("const g = canvas.scene._source.environment.globalLight;"
    + " return { enabled: g.enabled, bright: g.bright };");
  const light = (enabled, bright) => `await canvas.scene.update({ "environment.globalLight.enabled": ${enabled === true},`
    + ` "environment.globalLight.bright": ${bright === true} }); return true;`;
  ctx.restore(() => h.script(light(was?.enabled, was?.bright)));
  await h.script(light(true, true));
  await h.pause(2000);
  // A Strength check rolled as the creature's player would roll it, without the roll window and without a chat card.
  const check = (token) => h.script(`const a = ${h.actorOf(token)};
    const rolls = await a.rollAbilityCheck({ ability: "str" }, { configure: false }, { create: false });
    const roll = Array.isArray(rolls) ? rolls[0] : rolls;
    return { formula: roll?.formula ?? null, mode: roll?.options?.advantageMode ?? null };`);
  const entry = await h.script(`const item = ${h.actorOf(creature)}?.items.get(${JSON.stringify(TRAIT)});
    return item ? (game.modules.get("dnd5e-combat").api.content.of(item).entry ?? null) : null;`);
  const sunny = { creature: await check(creature), plain: await check(plain) };
  h.log(`in sunlight: creature ${JSON.stringify(sunny.creature)}, other ${JSON.stringify(sunny.plain)}`);
  h.expect(sunny.creature.mode === -1, "check 1: in sunlight the creature rolls its ability check with Disadvantage");
  h.expect(sunny.plain.mode === 0, "check 2: another creature in the same light rolls normally");
  // The engine's own reading of the trait (Disadvantage on attack rolls) must still be there beside the pack's rule.
  h.expect(Array.isArray(entry?.triggers) && entry.triggers.length >= 1 && !!entry?.rollDisadvantage,
    "check 3: the trait keeps the engine's attack-roll rule beside the pack's");
  // Out of sunlight (no global light) the same check is rolled normally.
  await h.script(light(false, false));
  await h.pause(2000);
  const shade = await check(creature);
  h.log(`without sunlight: creature ${JSON.stringify(shade)}`);
  h.expect(shade.mode === 0, "check 4: out of sunlight the creature rolls normally");
});
