// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-adult-gold-dragon-legendary-banish.json", { with: { type: "json" } })).default;
const CREATURE = "mmAdultGoldDrago";
const ITEM = "mmBanish00000000";
const ACTIVITY = "kWKwiAYgyeKBLMNJ";
const VICTIM = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const victim = creature ? await h.target(VICTIM) : null;
  if (!creature || !victim) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // A combat with the dragon first, then its victim.
  await h.combat(creature, victim);
  await h.pause(800);
  const home = await ctx.position(victim);
  const seen = () => h.script(`const t = canvas.scene.tokens.get(${JSON.stringify(victim.id)});
    const c = game.combat?.combatants.find((x) => x.tokenId === t.id);
    return { hidden: t.hidden === true, combatantHidden: c?.hidden === true, x: t._source.x, y: t._source.y };`);

  // The victim fails the save: it is gone from the battlefield, token and combatant hidden.
  const failed = await h.useUntil("failedSave", { caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [victim],
    consume: false }, victim);
  const gone = !!failed && (await h.until(async () => (await seen()).hidden, 10));
  const away = await seen();
  h.log(`after the failed save: ${JSON.stringify(away)}, Incapacitated ${await h.hasStatus(victim, "incapacitated")}`);
  h.expect(gone && away.combatantHidden, "check 1: a creature that fails the save is taken off the battlefield");
  if (!gone) return;

  // The round goes on: when the dragon's next turn starts, the creature is back where it stood.
  await h.nextTurn();
  await h.pause(1500);
  const during = await seen();
  await h.nextTurn();
  const back = await h.until(async () => !(await seen()).hidden, 12);
  const after = await seen();
  h.log(`on its own turn: ${JSON.stringify(during)} — at the dragon's next turn: ${JSON.stringify(after)} (it stood at`
    + ` ${home.x},${home.y})`);
  h.expect(during.hidden && back && after.x === home.x && after.y === home.y,
    "check 2: it stays away until the dragon's next turn starts, then stands again where it was");
});
