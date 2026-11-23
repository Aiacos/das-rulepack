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
  const target = await h.target("mmBanditCaptain0");
  if (!creature || !target) { h.expect(false, "the creature and its target could not be placed"); return; }
  await h.pause(1000);
  // The attack reaches 10 feet: the target is moved to a free square beside the creature.
  const at = await h.ctx.position(creature);
  // A free square beside the creature with no wall between the two (the arena has walls).
  const spot = await h.script(`const g = canvas.scene.grid.size; const at = ${JSON.stringify({ x: 0, y: 0 })};
    at.x = ${Number(at.x)}; at.y = ${Number(at.y)};
    const others = canvas.scene.tokens.contents.filter((t) => t.id !== ${JSON.stringify(target.id)});
    const centre = (p) => ({ x: p.x + g / 2, y: p.y + g / 2 });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const c = { x: at.x + dx * g, y: at.y + dy * g };
      if (others.some((t) => Math.abs(t._source.x - c.x) < g && Math.abs(t._source.y - c.y) < g)) continue;
      const blocked = ["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
        .testCollision(centre(at), centre(c), { type, mode: "any" }));
      if (!blocked) return c;
    }
    return null;`);
  if (!spot) { h.expect(false, "no free square beside the creature"); return; }
  await h.ctx.call("move-token", { tokenId: target.id, x: spot.x, y: spot.y, elevation: at.elevation ?? 0 });
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
