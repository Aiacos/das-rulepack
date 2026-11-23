// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xphb-feature-warlock-great-old-one-10-thought-shield.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-players-handbook.classes.Item.phbwlkThoughtShi";
const SPELL = "Compendium.dnd-players-handbook.spells.Item.phbsplMindSliver";
const ACTIVITY = "pIHrgeAoBDsA7vv8";
const BEARER = "mmBerserker00000";

export default handWritten(json, async (h) => {
  // A temporary bearer of the feature at the arena's target spot, and a temporary caster to deal it Psychic damage (the
  // arena's own caster is immune to that damage).
  const bearer = await h.target(BEARER);
  const cast = bearer ? await h.cast({ caster: BEARER }, { near: "Lanceur", disposition: 1 }) : null;
  const caster = cast?.caster;
  if (!caster || !bearer) { h.expect(false, "the creatures could not be placed"); return; }
  await h.give(bearer, ITEM);
  const spellId = await h.give(caster, SPELL, { spell: true });
  await h.pause(1500);
  const resists = await h.script(`return ${h.actorOf(bearer)}.system.traits.dr.value.has("psychic");`);
  h.expect(resists, "check 1: the bearer has Resistance to Psychic damage");

  // The spell until its save fails, hit points read before and after each try.
  let lost = null; let rolled = null;
  for (let n = 0; n < 20 && !lost; n++) {
    await h.setHp(bearer, 50);
    await h.setHp(caster, 50);
    const before = { bearer: await h.hp(bearer), caster: await h.hp(caster) };
    const done = await h.use({ caster, itemId: spellId, activityId: ACTIVITY, targets: [bearer] });
    if (done.outcome(bearer) !== "failedSave") continue;
    await h.until(async () => (await h.hp(caster)) < before.caster, 8);
    rolled = await h.script(`const m = game.messages.contents.filter((x) => x.type === "damage").at(-1);
      return m?.rolls?.reduce((t, r) => t + r.total, 0) ?? null;`);
    lost = { bearer: before.bearer - (await h.hp(bearer)), caster: before.caster - (await h.hp(caster)) };
  }
  if (!lost) { h.expect(false, "the save never failed"); return; }
  h.log(`Psychic damage rolled ${rolled}: the bearer lost ${lost.bearer}, the creature that dealt it lost ${lost.caster}`);
  h.expect(Number.isFinite(rolled) && lost.bearer === Math.floor(rolled / 2), "check 2: the bearer takes half the Psychic damage");
  h.expect(lost.bearer > 0 && lost.caster === lost.bearer,
    "check 3: the creature that dealt it takes the same amount the bearer took");
});
