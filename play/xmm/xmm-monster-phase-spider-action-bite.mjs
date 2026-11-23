// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-phase-spider-action-bite.json", { with: { type: "json" } })).default;
const CREATURE = "mmPhaseSpider000";
const ITEM = "mmBite0000000000";
const ACTIVITY = "xWlMeXFjELfSUWX9";
const EFFECT = "E2YIhGkeVsLrfGq0";
const OTHER = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const others = creature ? await h.cast({ hale: OTHER, weak: OTHER }, { near: "Cible", disposition: -1 }) : null;
  const { hale, weak } = others ?? {};
  if (!creature || !hale || !weak) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // Both stand within the bite's reach, on free squares with no wall in between.
  const at = await ctx.position(creature);
  const beside = (token) => h.script(`const g = canvas.scene.grid.size;
    const me = canvas.scene.tokens.get(${JSON.stringify(creature.id)});
    const from = { x: ${Number(at.x)}, y: ${Number(at.y)} }; const mw = me.width ?? 1;
    const t = canvas.scene.tokens.get(${JSON.stringify(token.id)}); const w = t.width ?? 1;
    const rest = canvas.scene.tokens.contents.filter((o) => o.id !== t.id);
    const mid = (p, n) => ({ x: p.x + n * g / 2, y: p.y + n * g / 2 });
    const spots = [];
    for (let dx = -w; dx <= mw; dx++) for (let dy = -w; dy <= mw; dy++) {
      if (dx > -w && dx < mw && dy > -w && dy < mw) continue;
      spots.push({ x: from.x + dx * g, y: from.y + dy * g });
    }
    for (const c of spots) {
      if (rest.some((o) => o._source.x < c.x + w * g && c.x < o._source.x + (o.width ?? 1) * g
        && o._source.y < c.y + w * g && c.y < o._source.y + (o.height ?? 1) * g)) continue;
      if (["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
        .testCollision(mid(from, mw), mid(c, w), { type, mode: "any" }))) continue;
      return c;
    }
    return null;`);
  for (const token of [hale, weak]) {
    const spot = await beside(token);
    if (!spot) { h.expect(false, "no free square beside the creature"); return; }
    await ctx.call("move-token", { tokenId: token.id, x: spot.x, y: spot.y, elevation: at.elevation ?? 0 });
    await h.pause(800);
  }
  // The effect the bite carries: a copy of the item's own effect, told by its name.
  const name = await h.script(`const item = ${h.actorOf(creature)}?.items.get(${JSON.stringify(ITEM)});
    return item?.effects.get(${JSON.stringify(EFFECT)})?.name ?? null;`);
  const bitten = async (token) => {
    const placed = await h.fresh(token);
    const hit = await h.useUntil("hit", { caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [token],
      consume: false }, token);
    await h.pause(3500);
    const statuses = await h.script(`return Array.from(${h.actorOf(token)}?.statuses ?? []);`);
    return { hit: !!hit, hp: await h.hp(token), marked: (await placed()).some((e) => e.name === name), statuses };
  };

  // A creature the bite does not bring down: hurt, and no poison placed.
  const first = await bitten(hale);
  h.log(`still standing: ${JSON.stringify(first)} (effect "${name}")`);
  h.expect(!!name && first.hit && first.hp > 0 && !first.marked,
    "check 1: a creature the bite does not reduce to 0 hit points carries no poison");

  // A creature at 1 hit point: the bite brings it to 0, and then the poison is placed.
  // (Each try starts again from 1 hit point: a miss leaves the creature there.)
  const placed = await h.fresh(weak);
  let down = false;
  for (let n = 0; n < 20 && !down; n++) {
    await h.setHp(weak, 1);
    await h.use({ caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [weak], consume: false });
    await h.pause(3500);
    down = (await h.hp(weak)) === 0;
  }
  const second = { hit: down, hp: await h.hp(weak), marked: (await placed()).some((e) => e.name === name),
    statuses: await h.script(`return Array.from(${h.actorOf(weak)}?.statuses ?? []);`) };
  h.log(`brought to 0: ${JSON.stringify(second)}`);
  h.expect(second.hit && second.hp === 0 && second.marked && !second.statuses.includes("dead"),
    "check 2: a creature the bite reduces to 0 hit points is not dead and carries the poison");
});
