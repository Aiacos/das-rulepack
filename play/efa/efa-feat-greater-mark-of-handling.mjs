// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./efa-feat-greater-mark-of-handling.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-forge-artificer.options.Item.efaGreaterHandli";
// Subdue Animal: the save that frightens.
const ACTIVITY = "LSBMNsVZeo0nZ3Ak";
// A Beast, which the text takes, and a Humanoid, which it does not.
const BEAST = "mmWolf0000000000";
const HUMANOID = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const bearer = await h.caster();
  const others = await h.cast({ beast: BEAST, humanoid: HUMANOID }, { near: "Cible", disposition: -1 });
  const { beast, humanoid } = others ?? {};
  if (!bearer || !beast || !humanoid) { h.expect(false, "the creatures could not be placed"); return; }
  const itemId = await h.give(bearer, ITEM);
  await h.pause(1000);
  // A combat with the bearer first, then the beast.
  await h.combat(bearer, beast);
  await h.pause(800);

  // The Humanoid: the command leaves it unaffected, whatever its save would have been.
  const no = await h.use({ caster: bearer, itemId, activityId: ACTIVITY, targets: [humanoid], consume: false });
  await h.pause(2000);
  const spared = no.of(humanoid);
  const calm = !(await h.hasStatus(humanoid, "frightened"));
  h.log(`Humanoid: unaffected ${JSON.stringify(spared?.unaffected ?? null)}, Frightened ${!calm}`);
  h.expect(!!spared?.unaffected && calm, "check 1: a Humanoid is left unaffected by the command");

  // The Beast fails the save: Frightened.
  const failed = await h.useUntil("failedSave", { caster: bearer, itemId, activityId: ACTIVITY, targets: [beast],
    consume: false }, beast);
  const scared = !!failed && (await h.until(() => h.hasStatus(beast, "frightened"), 8));
  h.expect(scared, "check 2: a Beast that fails the save is Frightened");
});
