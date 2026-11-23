// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-gibbering-mouther-trait-aberrant-ground.json", { with: { type: "json" } })).default;
const CREATURE = "mmGibberingMouth";
const ITEM = "mmAberrantGround";
const ACTIVITY = "zVznqPXgYjETqpQz";
// The zone of the text: this many feet around the creature.
const FEET = 10;
// The zones the scene holds, each with the behaviours it carries.
const ZONES = `return canvas.scene.regions.contents.map((r) => ({ id: r.id,
  behaviors: r.behaviors.contents.filter((b) => !b.disabled).map((b) => b.type) }));`;

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Cible", disposition: -1 });
  const creature = cast?.creature;
  if (!creature) { h.expect(false, "the creature could not be placed"); return; }
  await h.pause(1000);
  const before = (await h.script(ZONES)).map((z) => z.id);
  const fresh = async () => (await h.script(ZONES)).filter((z) => !before.includes(z.id));
  const clear = () => h.script(`const s = canvas.scene; const keep = ${JSON.stringify(before)};
    const r = s.regions.contents.filter((x) => !keep.includes(x.id)).map((x) => x.id);
    if (r.length) await s.deleteEmbeddedDocuments("Region", r);
    await new Promise((done) => setTimeout(done, 1000));
    return s.regions.contents.filter((x) => !keep.includes(x.id)).length;`, 20000);
  ctx.restore(() => clear().catch(() => null));

  // The zone is laid around the creature: a circle of the item's own radius, in the scene's pixels.
  const box = await ctx.box(creature);
  const grid = await h.script("return { size: canvas.scene.grid.size, distance: canvas.scene.grid.distance };");
  await ctx.use({ tokenId: creature.id, itemId: ITEM, activityId: ACTIVITY, targetTokenIds: [], consume: false,
    area: { shape: "circle", x: box.x + box.width / 2, y: box.y + box.height / 2, radius: (FEET / grid.distance) * grid.size } });
  await h.until(async () => (await fresh()).length > 0, 10);
  await h.pause(1500);
  const laid = await fresh();
  h.log(`laid: ${JSON.stringify(laid)}`);
  h.expect(laid.length === 1 && laid[0].behaviors.some((b) => /difficultTerrain/i.test(b)),
    "check 1: the zone laid around the creature is Difficult Terrain");

  const left = await clear();
  h.expect(left === 0, "check 2: the zone can be taken away, and nothing of it is left");
});
