// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-magmin-bonus-ignited-illumination.json", { with: { type: "json" } })).default;
const CREATURE = "mmMagmin00000000";
const ITEM = "mmIgnitedIllumin";
const ACTIVITY = "2gKgNtMg8wBhUP0a";

export default handWritten(json, async (h) => {
  const cast = await h.cast({ creature: CREATURE, plain: "mmBanditCaptain0" }, { near: "Cible", disposition: -1 });
  const { creature, plain } = cast ?? {};
  if (!creature || !plain) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1500);
  // The light each token sheds, in the scene's units, as Foundry holds it.
  const lightOf = (token) => h.script(`const t = canvas.scene.tokens.get(${JSON.stringify(token.id)});
    return { bright: t.light.bright, dim: t.light.dim, units: canvas.scene.grid.units };`);
  // The feature used as its bearer would use it (a utility activity: nothing to resolve, so it is not awaited as a roll).
  const toggle = () => h.script(`const item = ${h.actorOf(creature)}?.items.get(${JSON.stringify(ITEM)});
    await item.system.activities.get(${JSON.stringify(ACTIVITY)}).use({ "dnd5e-combat": { confirmed: true } },
      { configure: false });
    return true;`, 20000);

  const dark = await lightOf(creature);
  await toggle();
  const lit = await h.until(async () => (await lightOf(creature)).bright > 0, 10);
  const ablaze = await lightOf(creature);
  const other = await lightOf(plain);
  h.log(`before ${JSON.stringify(dark)} — ablaze ${JSON.stringify(ablaze)} — another creature ${JSON.stringify(other)}`);
  h.expect(dark.bright === 0 && lit && ablaze.units === "ft" && ablaze.bright === 10 && ablaze.dim === 20,
    "check 1: once ablaze the creature sheds bright light for 10 feet and dim light to 20 feet");
  h.expect(other.bright === 0 && other.dim === 0, "check 2: another creature beside it sheds none");

  await toggle();
  const out = await h.until(async () => (await lightOf(creature)).bright === 0, 10);
  h.log(`extinguished ${JSON.stringify(await lightOf(creature))}`);
  h.expect(out, "check 3: used again, the feature puts the light out");
});
