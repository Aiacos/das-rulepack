// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-kuo-toa-monitor-action-bone-whip.json", { with: { type: "json" } })).default;
const CREATURE = "mmKuotoaMonitor0";
const ITEM = "mmBoneWhip000000";
const ACTIVITY = "pZ7SURN823SGCTYJ";
const EFFECT = "fnxPnbWeOvf9X0QR";
// The result of the use that places the effect, and when the text ends it.
const ROLL = "hit";
const ENDS = "casterTurnStart";

export default handWritten(json, async (h) => {
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  // Beside the creature: its attack reaches 10 feet.
  const target = creature ? await h.target("mmBanditCaptain0", creature.name) : null;
  if (!creature || !target) { h.expect(false, "the creature and its target could not be placed"); return; }
  await h.pause(1000);
  // A combat with the creature first, then its target.
  await h.combat(creature, target);
  await h.pause(800);
  const placed = await h.fresh(target);
  // The effect the item's activity places: a copy of the item's own effect, told by its name.
  const name = await h.script(`const item = ${h.actorOf(creature)}?.items.get(${JSON.stringify(ITEM)});
    return item?.effects.get(${JSON.stringify(EFFECT)})?.name ?? null;`);
  const there = async () => (await placed()).some((e) => e.name === name);
  const done = await h.useUntil(ROLL, { caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [target], consume: false },
    target);
  const on = !!done && (await h.until(there, 8));
  h.expect(!!name && on, `check 1: on a ${ROLL} the item's effect is on the target`);
  if (!on) return;

  // The target's own turn comes: by the item's data alone the effect would be gone at this point.
  await h.nextTurn();
  await h.pause(1500);
  h.expect(await there(), "check 2: at the start of the target's turn the effect is still there");

  // The target's turn ends and the creature's begins: now the effect is over, for both endings the pack writes.
  await h.nextTurn();
  const gone = await h.until(async () => !(await there()), 12);
  h.expect(gone, ENDS === "bearerTurnEnd" ? "check 3: once the target's turn has ended the effect is gone"
    : "check 3: when the creature's next turn starts the effect is gone");
});
