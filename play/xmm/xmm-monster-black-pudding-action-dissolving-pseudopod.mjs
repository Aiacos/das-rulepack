// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-black-pudding-action-dissolving-pseudopod.json", { with: { type: "json" } })).default;
const CREATURE = "mmBlackPudding00";
const ITEM = "mmDissolvingPseu";
const ACTIVITY = "HGEMC3ouhGsC1a1a";
const EFFECT = "qYzNNpsYbmdB2cg6";
// A creature in plate armor, and one that wears none.
const ARMORED = "mmKnight00000000";
const BARE = "mmOgre0000000000";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const others = creature ? await h.cast({ armored: ARMORED, bare: BARE }, { near: "Cible", disposition: -1 }) : null;
  const { armored, bare } = others ?? {};
  if (!creature || !armored || !bare) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // Both stand within the pseudopod's reach, on free squares with no wall in between.
  const at = await ctx.position(creature);
  const beside = (token) => h.script(`const g = canvas.scene.grid.size;
    const me = canvas.scene.tokens.get(${JSON.stringify(creature.id)});
    const from = { x: ${Number(at.x)}, y: ${Number(at.y)} }; const mw = me.width ?? 1;
    const t = canvas.scene.tokens.get(${JSON.stringify(token.id)}); const w = t.width ?? 1;
    const rest = canvas.scene.tokens.contents.filter((o) => o.id !== t.id);
    const mid = (p, n) => ({ x: p.x + n * g / 2, y: p.y + n * g / 2 });
    const spots = [];
    for (let dx = -w; dx <= mw; dx++) for (let dy = -w; dy <= mw; dy++) {
      if (dx > -w && dx < mw && dy > -w && dy < mw) continue;
      spots.push({ x: from.x + dx * g, y: from.y + dy * g });
    }
    for (const c of spots) {
      if (rest.some((o) => o._source.x < c.x + w * g && c.x < o._source.x + (o.width ?? 1) * g
        && o._source.y < c.y + w * g && c.y < o._source.y + (o.height ?? 1) * g)) continue;
      if (["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
        .testCollision(mid(from, mw), mid(c, w), { type, mode: "any" }))) continue;
      return c;
    }
    return null;`);
  for (const token of [armored, bare]) {
    const spot = await beside(token);
    if (!spot) { h.expect(false, "no free square beside the creature"); return; }
    await ctx.call("move-token", { tokenId: token.id, x: spot.x, y: spot.y, elevation: at.elevation ?? 0 });
    await h.pause(800);
  }
  // The effect the item's attack places: a copy of the item's own effect, told by its name.
  const name = await h.script(`const item = ${h.actorOf(creature)}?.items.get(${JSON.stringify(ITEM)});
    return item?.effects.get(${JSON.stringify(EFFECT)})?.name ?? null;`);
  const struck = async (token) => {
    const placed = await h.fresh(token);
    const before = await h.hp(token);
    const hit = await h.useUntil("hit", { caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [token],
      consume: false }, token);
    await h.pause(2500);
    const marked = (await placed()).some((e) => e.name === name);
    return { hit: !!hit, hurt: (await h.hp(token)) < before, marked };
  };

  // No armor: the pseudopod hurts, and nothing is there for the acid to eat.
  const plain = await struck(bare);
  h.log(`no armor: ${JSON.stringify(plain)} (effect "${name}")`);
  h.expect(!!name && plain.hit && plain.hurt && !plain.marked,
    "check 1: a creature that wears no armor is hurt, with no penalty placed");

  // Plate armor: the same hit places the penalty.
  const plated = await struck(armored);
  h.log(`plate armor: ${JSON.stringify(plated)}`);
  h.expect(plated.hit && plated.marked, "check 2: a creature in armor that is hit carries the penalty");
});
