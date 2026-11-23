// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-incubus-bonus-nightmare.json", { with: { type: "json" } })).default;
const CREATURE = "mmIncubus0000000";
const ITEM = "mmNightmare00000";
const ACTIVITY = "Y9H9ImnMcffBZlH3";
const OTHER = "mmBanditCaptain0";
// The text's line: at this many hit points or fewer the target sleeps instead of being hurt.
const LINE = 20;

export default handWritten(json, async (h) => {
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const others = creature ? await h.cast({ hale: OTHER, weak: OTHER }, { near: "Cible", disposition: -1 }) : null;
  const { hale, weak } = others ?? {};
  if (!creature || !hale || !weak) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  const use = (token) => h.use({ caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [token], consume: false });

  // A creature above the line: the save is asked until one failure shows (hit points lost); it is hurt and stays awake.
  const full = await h.hp(hale);
  let hurt = false;
  for (let n = 0; n < 20 && !hurt; n++) {
    await use(hale);
    await h.pause(2500);
    hurt = (await h.hp(hale)) < full;
  }
  const awake = !(await h.hasStatus(hale, "unconscious"));
  h.log(`above ${LINE} hit points: ${await h.hp(hale)} of ${full}, awake ${awake}`);
  h.expect(full > LINE && hurt && awake, "check 1: a creature above 20 hit points that fails the save is hurt and stays awake");

  // A creature at 15 hit points: each try starts from there; on a failure it sleeps and loses nothing.
  let asleep = false;
  for (let n = 0; n < 20 && !asleep; n++) {
    await h.setHp(weak, 15);
    await use(weak);
    await h.pause(2500);
    asleep = await h.hasStatus(weak, "unconscious");
  }
  const left = await h.hp(weak);
  h.log(`at 15 hit points: Unconscious ${asleep}, hit points ${left}`);
  h.expect(asleep && left === 15, "check 2: a creature at 20 hit points or fewer that fails the save is Unconscious and unhurt");
});
