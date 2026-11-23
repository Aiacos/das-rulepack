// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-swarm-of-stirges-action-swarm-of-proboscises.json", { with: { type: "json" } })).default;
const CREATURE = "mmSwarmOfStirges";
const ITEM = "mmSwarmOfProbosc";
const ACTIVITY = "RkmvpUI0spboBnYE";
const TARGET = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const others = creature ? await h.cast({ target: TARGET }, { near: "Cible lointaine", disposition: -1 }) : null;
  const target = others?.target;
  if (!creature || !target) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // Two squares for the swarm: the target's own, and a free one beside it with no wall in between.
  const spots = await h.script(`const g = canvas.scene.grid.size; const t = canvas.scene.tokens.get(${JSON.stringify(target.id)});
    const at = { x: t._source.x, y: t._source.y }; const me = ${JSON.stringify(creature.id)};
    const rest = canvas.scene.tokens.contents.filter((o) => o.id !== me && o.id !== t.id);
    const centre = (p) => ({ x: p.x + g / 2, y: p.y + g / 2 });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = { x: at.x + dx * g, y: at.y + dy * g };
      if (rest.some((o) => o._source.x < c.x + g && c.x < o._source.x + (o.width ?? 1) * g
        && o._source.y < c.y + g && c.y < o._source.y + (o.height ?? 1) * g)) continue;
      if (["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
        .testCollision(centre(at), centre(c), { type, mode: "any" }))) continue;
      return { inside: at, beside: c };
    }
    return null;`);
  if (!spots) { h.expect(false, "no free square beside the target"); return; }
  // The swarm stands on a square and attacks until it hits; whether the hit grappled the target.
  const hitFrom = async (spot) => {
    await ctx.call("move-token", { tokenId: creature.id, x: spot.x, y: spot.y, elevation: 0 });
    await h.pause(1000);
    const hit = await h.useUntil("hit", { caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [target],
      consume: false }, target);
    await h.pause(2000);
    return { hit: !!hit, grappled: await h.hasStatus(target, "grappled") };
  };

  const beside = await hitFrom(spots.beside);
  h.log(`swarm beside the target: ${JSON.stringify(beside)}`);
  h.expect(beside.hit && !beside.grappled, "check 1: a hit from beside the target does not grapple it");

  const inside = await hitFrom(spots.inside);
  h.log(`swarm in the target's space: ${JSON.stringify(inside)}`);
  h.expect(inside.hit && inside.grappled, "check 2: a hit on a Medium target standing in the swarm's space grapples it");
});
