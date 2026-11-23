// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-treant-action-animate-trees.json", { with: { type: "json" } })).default;
const CREATURE = "mmTreant00000000";
const ITEM = "lqG4KueiyzdOy01v";
const FOE = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Cible lointaine", disposition: -1 });
  const treant = cast?.creature;
  const foe = treant ? await h.target(FOE) : null;
  if (!treant || !foe) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  const summoned = [];
  const live = async () => (await ctx.call("list-scene-objects", { type: "Token" })).objects.Token.map((t) => t.id);
  // The summon imports its creature into the world. Afterwards: the tokens this run summoned go first, then the creatures
  // it imported.
  const actorsBefore = await h.script("return game.actors.map((a) => a.id);");
  ctx.restore(async () => {
    const now = await live();
    for (const id of summoned) {
      if (now.includes(id)) await ctx.call("delete-scene-object", { type: "Token", objectId: id }).catch(() => {});
    }
    await h.script(`const before = new Set(${JSON.stringify(actorsBefore)});
      for (const a of game.actors.filter((x) => !before.has(x.id) && !x.getActiveTokens().length)) await a.delete();
      return true;`);
  });
  // A combat with the treant first, then the foe.
  await h.combat(treant, foe);
  await h.pause(800);
  const order = () => h.script("return (game.combat?.turns ?? []).map((c) => c.tokenId);");

  // A free place for a tree as wide as the treant, a few squares from it, inside the scene.
  const place = await h.script(`const g = canvas.scene.grid.size; const t = canvas.scene.tokens.get(${JSON.stringify(treant.id)});
    const w = t.width ?? 1; const at = { x: t._source.x, y: t._source.y }; const d = canvas.dimensions;
    const rest = canvas.scene.tokens.contents;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const c = { x: at.x + dx * (w + 1) * g, y: at.y + dy * (w + 1) * g };
      if (c.x < d.sceneX || c.y < d.sceneY || c.x + w * g > d.sceneX + d.sceneWidth
        || c.y + w * g > d.sceneY + d.sceneHeight) continue;
      if (rest.some((o) => o._source.x < c.x + w * g && c.x < o._source.x + (o.width ?? 1) * g
        && o._source.y < c.y + w * g && c.y < o._source.y + (o.height ?? 1) * g)) continue;
      return c;
    }
    return null;`);
  if (!place) { h.expect(false, "no free place for a tree beside the treant"); return; }
  const tree = (await ctx.engine("summonAt", { tokenId: treant.id, itemId: ITEM, x: place.x, y: place.y })).tokens?.[0];
  if (!tree) { h.expect(false, "the tree could not be animated"); return; }
  summoned.push(tree.id);
  await h.pause(2500);
  const turns = await order();
  h.log(`turn order: treant at ${turns.indexOf(treant.id)}, tree at ${turns.indexOf(tree.id)}, foe at ${turns.indexOf(foe.id)}`);
  h.expect((await live()).includes(tree.id), "check 1: the animated tree is on the scene");
  h.expect(turns.indexOf(tree.id) === turns.indexOf(treant.id) + 1,
    "check 2: in the running combat the tree takes its turn right after the treant");

  // The treant dies: the tree is no longer animate.
  await h.script(`const a = ${h.actorOf(treant)};
    await a.applyDamage([{ value: a.system.attributes.hp.value + 50, type: "force" }]); return true;`, 20000);
  const gone = await h.until(async () => !(await live()).includes(tree.id), 12);
  h.expect(gone, "check 3: when the treant dies the tree leaves the scene");
});
