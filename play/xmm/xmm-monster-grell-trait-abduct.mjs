// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-grell-trait-abduct.json", { with: { type: "json" } })).default;
const CREATURE = "mmGrell000000000";
// The creature's own grappling attack, and the roll of it that grapples.
const GRAB = "PYIeX0xuuewqAlgZ";
const ACTIVITY = "CJhwfRfVMm9BZJR2";
const ROLL = "hit";
const VICTIM = "mmBanditCaptain0";
const ENGINE = "/modules/dnd5e-combat/scripts";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const second = creature ? await h.cast({ victim: VICTIM }, { near: "Cible", disposition: -1 }) : null;
  const victim = second?.victim;
  if (!creature || !victim) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // The victim stands beside the creature, on a free square with no wall in between.
  const at = await ctx.position(creature);
  const spot = await h.script(`const g = canvas.scene.grid.size; const at = { x: ${Number(at.x)}, y: ${Number(at.y)} };
    const rest = canvas.scene.tokens.contents.filter((t) => t.id !== ${JSON.stringify(victim.id)});
    const centre = (p) => ({ x: p.x + g / 2, y: p.y + g / 2 });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const c = { x: at.x + dx * g, y: at.y + dy * g };
      if (rest.some((o) => o._source.x < c.x + g && c.x < o._source.x + (o.width ?? 1) * g
        && o._source.y < c.y + g && c.y < o._source.y + (o.height ?? 1) * g)) continue;
      if (["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
        .testCollision(centre(at), centre(c), { type, mode: "any" }))) continue;
      return c;
    }
    return null;`);
  if (!spot) { h.expect(false, "no free square beside the creature"); return; }
  await ctx.call("move-token", { tokenId: victim.id, x: spot.x, y: spot.y, elevation: at.elevation ?? 0 });
  await h.pause(800);
  await h.combat(creature, victim);
  await h.pause(800);

  // What the engine lets the creature move this turn, and what dragging would cost it with and without the trait.
  const reading = () => h.script(`const token = canvas.scene.tokens.get(${JSON.stringify(creature.id)});
    const A = await import("${ENGINE}/runtime/actions.mjs"); const G = await import("${ENGINE}/adapter/grapple.mjs");
    const R = await import("${ENGINE}/adapter/grapple-rules.mjs"); const M = await import("${ENGINE}/core/movement.mjs");
    const victims = G.victimsOf(token); const rules = R.grappleRulesOf(token.actor);
    const ranks = victims.map((v) => G.sizeRankOf(v.actor)); const own = G.sizeRankOf(token.actor);
    return { cap: A.movementCap(token), victims: victims.map((v) => v.id), dragFree: rules.dragFree,
      withTrait: M.dragMultiplierWith(own, ranks, { bonus: rules.bonus, freeUpTo: rules.dragFree }),
      withoutTrait: M.dragMultiplierWith(own, ranks, { bonus: 0, freeUpTo: null }) };`, 15000);
  const before = await reading();
  h.log(`before the grapple: ${JSON.stringify(before)}`);

  // The creature grapples the victim with its own attack.
  // The attack is used until the engine itself holds the victim as grappled by the creature (a miss or a save is tried again).
  let after = null;
  for (let n = 0; n < 20 && !after; n++) {
    await h.setHp(victim, 200);
    try {
      await h.use({ caster: creature, itemId: GRAB, activityId: ACTIVITY, targets: [victim], consume: false });
    } catch (e) {
      const open = await ctx.call("list-dialogs", { dialogsOnly: true, waitMs: 500 }).catch(() => null);
      h.log(`use stopped (${ROLL} wanted): ${e.message} — windows: ${JSON.stringify((open?.windows ?? []).map((w) => w.title))}`);
      break;
    }
    await h.pause(1500);
    const now = await reading();
    if (now?.victims?.includes(victim.id)) after = now;
  }
  const grabbed = !!after;
  after ??= await reading();
  h.log(`grappling: ${JSON.stringify(after)}`);
  h.expect(!!grabbed && after?.victims?.length === 1 && after.victims[0] === victim.id && after.withoutTrait === 2,
    "check 1: the creature holds the victim, a drag the engine charges double without the trait");
  h.expect(after?.dragFree === 5 && after.withTrait === 1 && Number.isFinite(before?.cap) && before.cap > 0
    && after.cap === before.cap,
  "check 2: with the trait the drag costs nothing more: the movement left this turn is what it was before the grapple");
});
