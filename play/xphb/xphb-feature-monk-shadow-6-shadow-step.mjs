// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xphb-feature-monk-shadow-6-shadow-step.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-players-handbook.classes.Item.phbmnkShadowStep";
const GEOMETRY = `const s = canvas.scene; const r = s.dimensions.sceneRect;
  return { id: s.id, grid: s.grid.size, rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    tokens: s.tokens.contents.map((t) => ({ id: t.id, x: t._source.x, y: t._source.y })) };`;

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const monk = await h.caster();
  const itemId = await h.give(monk, ITEM);
  await h.pause(800);
  const geo = await h.script(GEOMETRY);
  const p = await ctx.position(monk);
  const grid = geo.grid;
  // A free square of the monk's row, `dx` squares away, inside the scene.
  const free = (dx) => {
    const x = p.x + dx * grid;
    return x >= geo.rect.x && x + grid <= geo.rect.x + geo.rect.width
      && !geo.tokens.some((t) => t.id !== monk.id && Math.abs(t.x - x) < grid && Math.abs(t.y - p.y) < grid);
  };
  const near = [-2, 2, -1, 1].find(free);
  const far = [6, -6, 7, -7, 8, -8].find(free);
  if (near === undefined || far === undefined) { h.expect(false, "no free squares on the monk's row to teleport to"); return; }
  const light = async () => (await ctx.engine("stealth", { tokenId: monk.id })).light;
  const hop = (dx) => ctx.engine("teleport", { tokenId: monk.id, itemId, x: p.x + dx * grid, y: p.y });
  ctx.restore(() => ctx.call("move-token", { tokenId: monk.id, x: p.x, y: p.y, elevation: 0 }).catch(() => {}));

  const day = await light();
  const refused = await hop(near);
  h.log(`light at the start: ${day} (2 is bright) — teleport: ${JSON.stringify(refused).slice(0, 160)}`);
  h.expect(day === 2 && refused.accepted === false, "check 1: in bright light the teleport is refused");

  // Darkness four squares to each side of the monk, for the run.
  const region = await ctx.call("create-region", { sceneId: geo.id, name: "rulepack darkness", color: "#000000",
    shapes: [{ type: "rectangle", x: p.x - grid * 4, y: p.y - grid, width: grid * 9, height: grid * 3 }],
    behaviors: [{ type: "adjustDarknessLevel", name: "darkness", system: { mode: 0, modifier: 1 } }] });
  const regionId = region?.id ?? region?.regionId ?? region?.region?.id;
  ctx.restore(() => ctx.call("delete-scene-object", { type: "Region", objectId: regionId }).catch(() => {}));
  await h.pause(1500);
  const dark = await light();
  const into = await hop(near);
  await h.pause(800);
  const landed = await ctx.position(monk);
  h.log(`light in the region: ${dark} — teleport: ${JSON.stringify(into).slice(0, 160)} — now at ${landed.x},${landed.y}`);
  h.expect(dark !== 2 && into.accepted === true && landed.x === p.x + near * grid,
    "check 2: in darkness the teleport to a dark square is accepted and the monk stands there");

  const out = await ctx.engine("teleport", { tokenId: monk.id, itemId, x: p.x + far * grid, y: p.y });
  h.log(`teleport to a lit square: ${JSON.stringify(out).slice(0, 160)}`);
  h.expect(out.accepted === false, "check 3: from the darkness, the teleport to a lit square is refused");
});
