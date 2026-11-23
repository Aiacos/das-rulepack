// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-ancient-black-dragon-legendary-cloud-of-insects.json", { with: { type: "json" } })).default;
const CREATURE = "mmAncientBlackDr";
const ITEM = "mmCloudOfInsects";
const ACTIVITY = "0OkFhjOM80ipoNKy";
const TARGET = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const target = creature ? await h.target(TARGET) : null;
  if (!creature || !target) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // A combat with the dragon first, then its target.
  await h.combat(creature, target);
  await h.pause(800);
  // A saving throw to keep Concentration, and a plain Constitution save, rolled without window and without chat card.
  const rolled = () => h.script(`const a = ${h.actorOf(target)}; const mode = (r) => {
      const roll = Array.isArray(r) ? r[0] : r; return roll?.options?.advantageMode ?? null; };
    return { concentration: mode(await a.rollConcentration({}, { configure: false }, { create: false })),
      constitution: mode(await a.rollSavingThrow({ ability: "con" }, { configure: false }, { create: false })) };`, 20000);

  const before = await rolled();
  const failed = await h.useUntil("failedSave", { caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [target],
    consume: false }, target);
  await h.pause(2000);
  const clouded = await rolled();
  h.log(`before ${JSON.stringify(before)} — after the failed save ${JSON.stringify(clouded)} (-1 is Disadvantage)`);
  h.expect(!!failed && before.concentration === 0 && clouded.concentration === -1 && clouded.constitution === 0,
    "check 1: after the failed save the target rolls to keep Concentration with Disadvantage, and its other saves normally");

  // The target's own turn comes: still clouded. That turn ends: over.
  await h.nextTurn();
  await h.pause(1200);
  const own = await rolled();
  await h.nextTurn();
  const over = await h.until(async () => (await rolled()).concentration === 0, 10);
  h.log(`on the target's turn ${JSON.stringify(own)}, once that turn has ended: normal ${over}`);
  h.expect(own.concentration === -1 && over, "check 2: the Disadvantage lasts through the target's next turn and ends with it");
});
