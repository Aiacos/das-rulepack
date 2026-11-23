// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-lizardfolk-sovereign-bonus-charge.json", { with: { type: "json" } })).default;
const CREATURE = "mmLizardfolkSove";
const ITEM = "mmCharge00000000";
const ACTIVITY = "Y2IncZu5BjB42z7l";
const OTHER = "mmBanditCaptain0";
const ENGINE = "/modules/dnd5e-combat/scripts";

export default handWritten(json, async (h) => {
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const other = creature ? await h.target(OTHER) : null;
  if (!creature || !other) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // A combat with the creature first: the movement it has this turn is the engine's own count.
  await h.combat(creature, other);
  await h.pause(800);
  const reading = () => h.script(`const token = canvas.scene.tokens.get(${JSON.stringify(creature.id)});
    const A = await import("${ENGINE}/runtime/actions.mjs");
    const walk = token.actor.system.attributes.movement.walk;
    return { cap: A.movementCap(token), walk, units: canvas.scene.grid.units };`, 15000);
  // The feature used as its bearer would use it (a utility activity: nothing to resolve).
  const use = () => h.script(`const item = ${h.actorOf(creature)}?.items.get(${JSON.stringify(ITEM)});
    await item.system.activities.get(${JSON.stringify(ACTIVITY)}).use({ "dnd5e-combat": { confirmed: true } },
      { configure: false });
    return true;`, 20000);

  const before = await reading();
  await use();
  await h.until(async () => (await reading()).cap > before.cap, 10);
  const after = await reading();
  h.log(`movement this turn: before ${JSON.stringify(before)} — after the charge ${JSON.stringify(after)}`);
  h.expect(before.units === "ft" && Number.isFinite(before.cap) && before.cap === before.walk,
    "check 1: before the charge the creature may move its Speed this turn");
  h.expect(after.cap === before.cap + before.walk, "check 2: the charge gives it its Speed again, as a Dash would");
});
