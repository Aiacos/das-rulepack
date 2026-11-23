// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./efa-feature-artificer-artillerist-3-eldritch-cannon.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-forge-artificer.options.Item.efaartEldritchCa";
const CRAFT = "KLuNWxkfkmUeT7ap";
const CLASS = "Compendium.dnd-forge-artificer.options.Item.efaArtificer0000";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const maker = await h.caster();
  const foe = await h.target("mmBanditCaptain0");
  // Five artificer levels for the run: the cannon's Hit Points come from them (without any it is created at 0).
  await ctx.ensureItem(maker, CLASS, { system: { levels: 5 } });
  const itemId = await h.give(maker, ITEM);
  await h.pause(800);
  const grid = await ctx.gridSize();
  const p = await ctx.position(maker);
  const summoned = [];
  const live = async () => (await ctx.call("list-scene-objects", { type: "Token" })).objects.Token.map((t) => t.id);
  // Afterwards: the world's clock back where it was, the cannons this run placed removed, then the creatures it imported.
  const t0 = (await ctx.engine("advanceTime", { seconds: 0 })).worldTime;
  const actorsBefore = await h.script("return game.actors.map((a) => a.id);");
  ctx.restore(async () => {
    const now = (await ctx.engine("advanceTime", { seconds: 0 })).worldTime;
    if (now !== t0) await ctx.engine("advanceTime", { seconds: t0 - now });
    const left = await live();
    for (const id of summoned) {
      if (left.includes(id)) await ctx.call("delete-scene-object", { type: "Token", objectId: id }).catch(() => {});
    }
    await h.script(`const before = new Set(${JSON.stringify(actorsBefore)});
      for (const a of game.actors.filter((x) => !before.has(x.id) && !x.getActiveTokens().length)) await a.delete();
      return true;`);
  });
  await h.combat(maker, foe);
  await h.pause(800);
  const at = (dy) => ({ tokenId: maker.id, itemId, activityId: CRAFT, x: p.x, y: p.y + dy * grid });

  const first = (await ctx.engine("summonAt", at(2))).tokens?.[0];
  if (!first) { h.expect(false, "the cannon could not be created"); return; }
  summoned.push(first.id);
  await h.pause(2500);
  const turns = await h.script("return (game.combat?.turns ?? []).map((c) => c.tokenId);");
  h.expect((await live()).includes(first.id) && !turns.includes(first.id),
    "check 1: the cannon is on the scene and takes no place in the turn order");

  // Destroyed as an attack would destroy it: damage applied through the game system, not a value written on the token.
  // Destroyed as an attack would destroy it: damage applied through the game system.
  const hit = await h.script(`const a = ${h.actorOf(first)}; const before = a?.system.attributes.hp.value ?? null;
    await a?.applyDamage([{ value: 999, type: "force" }]); return { before };`);
  h.log(`the cannon's Hit Points before the damage: ${hit?.before}`);
  const destroyed = await h.until(async () => !(await live()).includes(first.id), 16);
  h.expect(hit?.before > 0 && destroyed, "check 2: reduced to 0 Hit Points, the cannon is removed");

  const second = (await ctx.engine("summonAt", at(3))).tokens?.[0];
  if (second) summoned.push(second.id);
  await h.pause(2000);
  const there = !!second && (await live()).includes(second.id);
  await ctx.engine("advanceTime", { seconds: 3601 });
  const expired = await h.until(async () => !(await live()).includes(second?.id), 16);
  h.expect(there && expired, "check 3: a new cannon is there, and gone once an hour has passed");
});
