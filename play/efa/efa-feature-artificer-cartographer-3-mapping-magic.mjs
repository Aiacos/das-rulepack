// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./efa-feature-artificer-cartographer-3-mapping-magic.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-forge-artificer.options.Item.efacarMappingMag";
const GEOMETRY = `const s = canvas.scene; const r = s.dimensions.sceneRect;
  return { grid: s.grid.size, distance: s.grid.distance, units: s.grid.units,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    tokens: s.tokens.contents.map((t) => ({ id: t.id, x: t._source.x, y: t._source.y })) };`;

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const bearer = await h.caster();
  const itemId = await h.give(bearer, ITEM);
  await h.pause(800);
  const geo = await h.script(GEOMETRY);
  const p = await ctx.position(bearer);
  const grid = geo.grid;
  // A free square of the bearer's row, `dx` squares away, inside the scene.
  const free = (dx) => {
    const x = p.x + dx * grid;
    return x >= geo.rect.x && x + grid <= geo.rect.x + geo.rect.width
      && !geo.tokens.some((t) => t.id !== bearer.id && Math.abs(t.x - x) < grid && Math.abs(t.y - p.y) < grid);
  };
  // Ten feet away, and farther than the jump reaches.
  const near = [2, -2].find(free);
  const far = [4, -4, 5, -5, 6, -6].find(free);
  if (near === undefined || far === undefined || geo.units !== "ft" || geo.distance !== 5) {
    h.expect(false, "no free squares on the bearer's row to jump to");
    return;
  }
  const hop = (dx) => ctx.engine("teleport", { tokenId: bearer.id, itemId, x: p.x + dx * grid, y: p.y });
  ctx.restore(() => ctx.call("move-token", { tokenId: bearer.id, x: p.x, y: p.y, elevation: 0 }).catch(() => {}));

  const tooFar = await hop(far);
  const stayed = await ctx.position(bearer);
  h.log(`jump of ${Math.abs(far) * 5} feet: ${JSON.stringify(tooFar).slice(0, 160)} — at ${stayed.x},${stayed.y}`);
  h.expect(tooFar.accepted === false && stayed.x === p.x, "check 1: a jump farther than 10 feet is refused");

  const jump = await hop(near);
  await h.pause(800);
  const landed = await ctx.position(bearer);
  h.log(`jump of 10 feet: ${JSON.stringify(jump).slice(0, 160)} — now at ${landed.x},${landed.y}`);
  h.expect(jump.accepted === true && landed.x === p.x + near * grid && landed.y === p.y,
    "check 2: a jump of 10 feet is accepted and the bearer stands there");
});
