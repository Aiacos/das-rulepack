// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-bullywug-warrior-bonus-leap.json", { with: { type: "json" } })).default;
const CREATURE = "mmBullywugWarrio";
const OTHER = "mmBanditCaptain0";
// The leap of the text: this far, for this much movement.
const FAR = 30;
const COST = 10;

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const second = creature ? await h.cast({ other: OTHER }, { near: "Cible", disposition: -1 }) : null;
  const other = second?.other;
  if (!creature || !other) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // A landing square FAR feet away in a straight line: no wall on the way, no token where the creature lands.
  const land = await h.script(`const t = canvas.scene.tokens.get(${JSON.stringify(creature.id)}); const grid = canvas.scene.grid;
    const g = grid.size; const n = Math.round(${FAR} / grid.distance); const w = t.width ?? 1;
    const from = { x: t._source.x, y: t._source.y };
    const mid = (p) => ({ x: p.x + w * g / 2, y: p.y + w * g / 2 });
    const rest = canvas.scene.tokens.contents.filter((o) => o.id !== t.id);
    const d = canvas.dimensions;
    const inside = (p) => p.x >= d.sceneX && p.y >= d.sceneY && p.x + w * g <= d.sceneX + d.sceneWidth
      && p.y + w * g <= d.sceneY + d.sceneHeight;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const to = { x: from.x + dx * n * g, y: from.y + dy * n * g };
      if (!inside(to)) continue;
      if (rest.some((o) => o._source.x < to.x + w * g && to.x < o._source.x + (o.width ?? 1) * g
        && o._source.y < to.y + w * g && to.y < o._source.y + (o.height ?? 1) * g)) continue;
      if (CONFIG.Canvas.polygonBackends.move.testCollision(mid(from), mid(to), { type: "move", mode: "any" })) continue;
      // The engine takes the square under a large token's middle: one square in for a token three squares wide.
      const k = Math.floor((w - 1) / 2) * g;
      return { cell: grid.getOffset({ x: to.x + k, y: to.y + k }), x: to.x, y: to.y, units: grid.units, distance: grid.distance };
    }
    return null;`);
  if (!land) { h.expect(false, "no free landing square in a straight line"); return; }
  await h.combat(creature, other);
  await h.pause(800);

  // On its turn the creature jumps there: farther than its Strength allows, paid as the text says.
  const r = await ctx.engine("jump", { tokenId: creature.id, cell: land.cell }, { timeoutMs: 30000 });
  await h.pause(1500);
  const at = await ctx.position(creature);
  h.log(`allowed: ${JSON.stringify(r?.options ?? null)} — result: ${JSON.stringify(r?.result ?? null)}`
    + ` — budget: ${JSON.stringify(r?.budget ?? null)} — warnings: ${JSON.stringify(r?.warnings ?? [])}`
    + ` — at ${at.x},${at.y}, landing ${land.x},${land.y} (${land.units})`);
  const fixed = r?.options?.fixed;
  h.expect(fixed?.distance === FAR && fixed?.cost === COST && r?.result?.done === true && r.result.fixed === true
    && r.result.cost === COST && at.x === land.x && at.y === land.y,
  "check 1: the creature lands 30 feet away, a jump its Strength alone would not allow, for 10 feet of movement");
  // The turn's budget: the leap is taken for the turn and the difference is given back.
  h.expect(r?.budget?.fixedJump === true && land.units === "ft" && r.budget.jumped === FAR - COST,
    "check 2: the turn's movement is charged 10 feet, 20 of the 30 given back");
});
