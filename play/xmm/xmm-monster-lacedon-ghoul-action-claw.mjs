// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-lacedon-ghoul-action-claw.json", { with: { type: "json" } })).default;
const CREATURE = "mmLacedonGhoul00";
const ITEM = "mmClaw0000000000";
// The saving throw the claw's hit asks for: its failure paralyzes.
const SAVE = "fDMRlni8W3d3QoOD";
// A living creature, and an Undead, which the text spares.
const LIVING = "mmBanditCaptain0";
const UNDEAD = "mmZombie00000000";

export default handWritten(json, async (h) => {
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const others = creature ? await h.cast({ living: LIVING, undead: UNDEAD }, { near: "Cible", disposition: -1 }) : null;
  const { living, undead } = others ?? {};
  if (!creature || !living || !undead) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // The save is asked of the token until it fails; then whether it is Paralyzed.
  const failing = async (token) => {
    const failed = await h.useUntil("failedSave", { caster: creature, itemId: ITEM, activityId: SAVE, targets: [token],
      consume: false }, token);
    await h.pause(2500);
    return { failed: !!failed, paralyzed: await h.hasStatus(token, "paralyzed") };
  };

  // The Undead fails the save and is not Paralyzed.
  const spared = await failing(undead);
  h.log(`Undead: ${JSON.stringify(spared)}`);
  h.expect(spared.failed && !spared.paralyzed, "check 1: an Undead that fails the save is not Paralyzed");

  // The living creature fails the save and is Paralyzed.
  const taken = await failing(living);
  h.log(`living creature: ${JSON.stringify(taken)}`);
  h.expect(taken.failed && taken.paralyzed, "check 2: a living creature that fails the save is Paralyzed");
});
