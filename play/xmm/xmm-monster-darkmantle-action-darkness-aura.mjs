// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-darkmantle-action-darkness-aura.json", { with: { type: "json" } })).default;
const CREATURE = "mmDarkmantle0000";
const ITEM = "DXSZEBm7EZIT7A9Z";
const ACTIVITY = "amat5Ii4NydseA0h";
// What the scene holds: its light sources, and the zones an area activity lays (regions, measured templates).
const SCENE = `const s = canvas.scene; return { units: s.grid.units,
  lights: s.lights.contents.map((l) => ({ id: l.id, negative: l.config.negative === true, dim: l.config.dim,
    bright: l.config.bright })),
  zones: [...s.regions.contents.map((r) => "Region." + r.id),
    ...(s.templates?.contents ?? []).map((t) => "MeasuredTemplate." + t.id)] };`;

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Cible", disposition: -1 });
  const creature = cast?.creature;
  if (!creature) { h.expect(false, "the creature could not be placed"); return; }
  await h.pause(1000);
  const before = await h.script(SCENE);
  const fresh = async () => {
    const now = await h.script(SCENE);
    return { lights: now.lights.filter((l) => !before.lights.some((b) => b.id === l.id)),
      zones: now.zones.filter((z) => !before.zones.includes(z)), units: now.units };
  };
  // Whatever the use lays on the scene leaves with the run.
  const clear = () => h.script(`const s = canvas.scene; const keepL = ${JSON.stringify(before.lights.map((l) => l.id))};
    const keepZ = ${JSON.stringify(before.zones)};
    const r = s.regions.contents.filter((x) => !keepZ.includes("Region." + x.id)).map((x) => x.id);
    const t = (s.templates?.contents ?? []).filter((x) => !keepZ.includes("MeasuredTemplate." + x.id)).map((x) => x.id);
    if (r.length) await s.deleteEmbeddedDocuments("Region", r);
    if (t.length) await s.deleteEmbeddedDocuments("MeasuredTemplate", t);
    await new Promise((done) => setTimeout(done, 1500));
    const l = s.lights.contents.filter((x) => !keepL.includes(x.id)).map((x) => x.id);
    return { regions: r.length, templates: t.length, lightsLeft: l };`, 20000);
  ctx.restore(async () => {
    const left = await clear().catch(() => null);
    if (left?.lightsLeft?.length) {
      await h.script(`await canvas.scene.deleteEmbeddedDocuments("AmbientLight", ${JSON.stringify(left.lightsLeft)}); return true;`)
        .catch(() => null);
    }
  });

  // The aura is laid around the creature (the runner places the zone the engine would ask for).
  // A circle of the item's own radius (15 feet), centred on the creature, in the scene's pixels.
  const box = await ctx.box(creature);
  const grid = await h.script("return { size: canvas.scene.grid.size, distance: canvas.scene.grid.distance };");
  await ctx.use({ tokenId: creature.id, itemId: ITEM, activityId: ACTIVITY, targetTokenIds: [], consume: false,
    area: { shape: "circle", x: box.x + box.width / 2, y: box.y + box.height / 2, radius: (15 / grid.distance) * grid.size } });
  await h.until(async () => (await fresh()).lights.length > 0, 10);
  const laid = await fresh();
  h.log(`laid: ${JSON.stringify(laid)}`);
  const dark = laid.lights[0];
  h.expect(laid.lights.length === 1 && dark?.negative === true && laid.units === "ft" && Math.max(dark.dim, dark.bright) === 15,
    "check 1: the aura lays one source of darkness, 15 feet wide, on its zone");

  // The zone is taken away: the darkness goes with it.
  const cleared = await clear();
  h.log(`zone removed: ${JSON.stringify(cleared)}`);
  h.expect(laid.zones.length > 0 && cleared.lightsLeft.length === 0, "check 2: when the zone goes, the darkness goes with it");
});
