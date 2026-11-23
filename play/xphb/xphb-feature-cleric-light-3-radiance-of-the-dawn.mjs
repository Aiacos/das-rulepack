// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xphb-feature-cleric-light-3-radiance-of-the-dawn.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-players-handbook.classes.Item.phbclcRadianceOf";
const ACTIVITY = "dnd5eactivity000";
// A creature whose own feature lays magical darkness (a rule of this pack, played on its own).
const DARK = { actor: "mmDarkmantle0000", item: "DXSZEBm7EZIT7A9Z", activity: "amat5Ii4NydseA0h", feet: 15 };
const FLASH = 30;
const SCENE = `const s = canvas.scene; return { size: s.grid.size, distance: s.grid.distance, units: s.grid.units,
  dark: s.lights.contents.filter((l) => l.config.negative === true).map((l) => l.id),
  lights: s.lights.contents.map((l) => l.id), regions: s.regions.contents.map((r) => r.id) };`;

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cleric = await h.caster();
  const cast = await h.cast({ creature: DARK.actor }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  if (!cleric || !creature) { h.expect(false, "the creatures could not be placed"); return; }
  const itemId = await h.give(cleric, ITEM);
  await h.pause(1000);
  const before = await h.script(SCENE);
  // Whatever the run lays on the scene leaves with it.
  ctx.restore(() => h.script(`const s = canvas.scene; const keepR = ${JSON.stringify(before.regions)};
    const keepL = ${JSON.stringify(before.lights)};
    const r = s.regions.contents.filter((x) => !keepR.includes(x.id)).map((x) => x.id);
    if (r.length) await s.deleteEmbeddedDocuments("Region", r);
    await new Promise((done) => setTimeout(done, 1500));
    const l = s.lights.contents.filter((x) => !keepL.includes(x.id)).map((x) => x.id);
    if (l.length) await s.deleteEmbeddedDocuments("AmbientLight", l);
    return true;`, 20000).catch(() => null));
  const feet = (n) => (n / before.distance) * before.size;
  const around = async (token, n) => {
    const box = await ctx.box(token);
    return { shape: "circle", x: box.x + box.width / 2, y: box.y + box.height / 2, radius: feet(n) };
  };
  const darkness = async () => (await h.script(SCENE)).dark.filter((id) => !before.dark.includes(id));

  // Magical darkness is laid beside the cleric.
  await ctx.use({ tokenId: creature.id, itemId: DARK.item, activityId: DARK.activity, targetTokenIds: [], consume: false,
    area: await around(creature, DARK.feet) });
  const laid = await h.until(async () => (await darkness()).length === 1, 10);
  h.log(`darkness laid: ${JSON.stringify(await darkness())} (${before.units})`);
  h.expect(laid && before.units === "ft", "check 1: magical darkness stands beside the cleric before the flash");
  if (!laid) return;

  // The flash, 30 feet around the cleric, covers it: the darkness is dispelled.
  await ctx.use({ tokenId: cleric.id, itemId, activityId: ACTIVITY, targetTokenIds: [], consume: false,
    area: await around(cleric, FLASH) });
  const gone = await h.until(async () => (await darkness()).length === 0, 12);
  const still = await h.script(SCENE);
  h.log(`after the flash: darkness ${JSON.stringify(await darkness())} — lights now`
    + ` ${still.lights.length - before.lights.length} more, regions ${still.regions.length - before.regions.length} more`);
  h.expect(gone, "check 2: the flash dispels the magical darkness it covers");
});
