// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";
import { pause } from "../lib/steps.mjs";

const json = (await import("./xphb-feature-fighter-psi-warrior-15-bulwark-of-force.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-players-handbook.classes.Item.phbftrBulwarkOfF";
const ACTIVITY = "kkW9jQgIjD2MKFfw";

export default handWritten(json, async (h) => {
  const caster = await h.caster();
  const target = await h.target("mmBanditCaptain0");
  const itemId = await h.give(caster, ITEM);
  const idOf = (e) => e._id ?? e.id;
  const before = new Set((await h.effects(target)).map(idOf));
  await h.use({ caster, itemId, activityId: ACTIVITY, targets: [target], consume: false });
  // The effect the use placed: new on the target, and carrying the item's own status (the engine gives it no origin here).
  const own = (e) => !e.disabled && !before.has(idOf(e)) && (e.statuses ?? []).includes("coverHalf");
  const covered = async () => (await h.effects(target)).some(own);
  let placed = false;
  for (let k = 0; k < 8 && !placed; k++) { await pause(500); placed = await covered(); }
  h.expect(placed, "check 1: the item's cover effect is on the chosen creature after the use");

  // The giver becomes Incapacitated: the rule ends the cover it gave.
  await h.ctx.call("set-status", { tokenId: caster.id, statusId: "incapacitated", active: true });
  h.ctx.restore(() => h.ctx.call("set-status", { tokenId: caster.id, statusId: "incapacitated", active: false }).catch(() => {}));
  let gone = false;
  for (let k = 0; k < 12 && !gone; k++) { await pause(500); gone = !(await covered()); }
  h.expect(gone, "check 2: the cover effect is gone once its giver is Incapacitated");
});
