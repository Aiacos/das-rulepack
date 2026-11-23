// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./efa-item-boots-of-the-winding-path.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-forge-artificer.items.Item.efaBootsoftheWin";
const GEOMETRY = `const s = canvas.scene; const r = s.dimensions.sceneRect;
  return { grid: s.grid.size, feet: s.grid.distance, rect: { x: r.x, width: r.width },
    tokens: s.tokens.contents.map((t) => ({ id: t.id, x: t._source.x, y: t._source.y })) };`;

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const wearer = await h.caster();
  const itemId = await h.give(wearer, ITEM);
  await h.pause(800);
  const geo = await h.script(GEOMETRY);
  const p = await ctx.position(wearer);
  const { grid } = geo;
  const free = (dx) => {
    const x = p.x + dx * grid;
    return x >= geo.rect.x && x + grid <= geo.rect.x + geo.rect.width
      && !geo.tokens.some((t) => t.id !== wearer.id && Math.abs(t.x - x) < grid && Math.abs(t.y - p.y) < grid);
  };
  // 15 feet and 30 feet on a grid of 5-foot squares: at the edge of and outside the boots' 15 feet.
  const near = [3, -3].find(free);
  const far = [6, -6].find(free);
  if (geo.feet !== 5 || near === undefined || far === undefined) {
    h.expect(false, "no usable squares on the wearer's row");
    return;
  }
  const hop = (dx) => ctx.engine("teleport", { tokenId: wearer.id, itemId, x: p.x + dx * grid, y: p.y });
  ctx.restore(() => ctx.call("move-token", { tokenId: wearer.id, x: p.x, y: p.y, elevation: 0 }).catch(() => {}));

  const out = await hop(far);
  h.log(`30 feet: ${JSON.stringify(out).slice(0, 120)}`);
  h.expect(out.accepted === false, "check 1: a teleport of 30 feet is refused");

  const into = await hop(near);
  await h.pause(800);
  const landed = await ctx.position(wearer);
  h.log(`15 feet: ${JSON.stringify(into).slice(0, 120)} — now at ${landed.x},${landed.y}`);
  h.expect(into.accepted === true && landed.x === p.x + near * grid,
    "check 2: a teleport of 15 feet is accepted and the wearer stands there");
});
