// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-haunting-revenant-action-object-slam.json", { with: { type: "json" } })).default;
const CREATURE = "mmHauntingRevena";
const ITEM = "mmObjectSlam0000";
const ACTIVITY = "oPEFqEffSjaqnq4J";
const TARGET = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Cible lointaine", disposition: -1 });
  const creature = cast?.creature;
  const others = creature ? await h.cast({ target: TARGET }, { near: "Cible", disposition: -1 }) : null;
  const target = others?.target;
  if (!creature || !target) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // Two squares for the target: one inside the revenant's own space, one just outside it with no wall in between.
  const spots = await h.script(`const g = canvas.scene.grid.size; const r = canvas.scene.tokens.get(${JSON.stringify(creature.id)});
    const w = r.width ?? 1; const at = { x: r._source.x, y: r._source.y }; const t = ${JSON.stringify(target.id)};
    const rest = canvas.scene.tokens.contents.filter((o) => o.id !== r.id && o.id !== t);
    const centre = (p) => ({ x: p.x + g / 2, y: p.y + g / 2 }); const middle = { x: at.x + w * g / 2, y: at.y + w * g / 2 };
    const taken = (c) => rest.some((o) => o._source.x < c.x + g && c.x < o._source.x + (o.width ?? 1) * g
      && o._source.y < c.y + g && c.y < o._source.y + (o.height ?? 1) * g);
    const inside = { x: at.x + g, y: at.y + g };
    for (let k = 0; k < w; k++) for (const c of [{ x: at.x + w * g, y: at.y + k * g }, { x: at.x - g, y: at.y + k * g },
      { x: at.x + k * g, y: at.y + w * g }, { x: at.x + k * g, y: at.y - g }]) {
      if (taken(c)) continue;
      if (["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
        .testCollision(middle, centre(c), { type, mode: "any" }))) continue;
      return { inside, outside: c, width: w };
    }
    return null;`);
  if (!spots) { h.expect(false, "no free square beside the revenant"); return; }
  // One slam at the target standing on a square, and how the attack roll was rolled.
  const slam = async (spot) => {
    await ctx.call("move-token", { tokenId: target.id, x: spot.x, y: spot.y, elevation: 0 });
    await h.pause(1000);
    await h.setHp(target, 40);
    await h.use({ caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [target], consume: false });
    await h.pause(1500);
    return h.script(`const m = game.messages.contents.filter((x) => x.type === "attack").at(-1);
      return m?.rolls?.[0]?.options?.advantageMode ?? null;`);
  };

  const outside = await slam(spots.outside);
  const inside = await slam(spots.inside);
  h.log(`revenant ${spots.width} squares wide — target beside it: ${outside}, target inside its space: ${inside} (1 is Advantage)`);
  h.expect(outside === 0, "check 1: against a target beside the revenant the slam is rolled normally");
  h.expect(inside === 1, "check 2: against a target inside the revenant's space the slam is rolled with Advantage");
});
