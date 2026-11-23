// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./efa-spell-homunculus-servant.json", { with: { type: "json" } })).default;
const SPELL = "Compendium.dnd-forge-artificer.options.Item.efaHomunculusSer";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const caster = await h.caster();
  const foe = await h.target("mmBanditCaptain0");
  const spellId = await h.give(caster, SPELL, { spell: true });
  await h.pause(800);
  const grid = await ctx.gridSize();
  const p = await ctx.position(caster);
  const summoned = [];
  const live = async () => (await ctx.call("list-scene-objects", { type: "Token" })).objects.Token.map((t) => t.id);
  // The summon imports its creature into the world. Afterwards: the tokens this run summoned go first, then the creatures
  // it imported (a restore of its own would run before the tokens are gone).
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
  // A combat with fixed initiatives: the caster at 20, the foe at 10.
  await h.combat(caster, foe);
  await h.pause(800);
  const order = () => h.script("return (game.combat?.turns ?? []).map((c) => c.tokenId);");

  // First casting, two squares below the caster (the row to the east holds the arena's own tokens).
  const at = (dy) => ({ tokenId: caster.id, itemId: spellId, x: p.x, y: p.y + dy * grid });
  const first = (await ctx.engine("summonAt", at(2))).tokens?.[0];
  if (!first) { h.expect(false, "the homunculus could not be summoned"); return; }
  summoned.push(first.id);
  await h.pause(2500);
  const turns = await order();
  const where = (t) => turns.indexOf(t.id);
  h.log(`turn order: caster at ${where(caster)}, homunculus at ${where(first)}, foe at ${where(foe)}`);
  h.expect((await live()).includes(first.id), "check 1: the homunculus is on the scene");
  h.expect(turns.indexOf(first.id) === turns.indexOf(caster.id) + 1,
    "check 2: in the running combat it takes its turn right after its caster");

  const second = (await ctx.engine("summonAt", at(3))).tokens?.[0];
  if (second) summoned.push(second.id);
  await h.pause(2500);
  const now = await live();
  h.expect(!!second && now.includes(second.id) && !now.includes(first.id),
    "check 3: a second casting brings a new homunculus and removes the first");
});
