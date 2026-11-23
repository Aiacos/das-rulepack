// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-mimic-action-pseudopod.json", { with: { type: "json" } })).default;
// The mimic and its grappling attack; another grappler with no such clause, for comparison.
const MIMIC = { actor: "mmMimic000000000", item: "mmPseudopod00000", activity: "oPXdl3BBYsuoemkT" };
const OTHER = { actor: "mmBugbearWarrior", item: "mmGrab0000000000", activity: "GVUHigbRWoWysg40" };
const VICTIM = "mmBanditCaptain0";
const ENGINE = "/modules/dnd5e-combat/scripts";
// The engine's own line when an escape check is rolled with Disadvantage.
const LINE = /Disadvantage on the escape check/;

export default handWritten(json, async (h) => {
  const { ctx } = h;
  // One grappler and its victim, placed side by side; the victim is grappled, then tries to escape.
  const escapeFrom = async (grappler, near) => {
    const cast = await h.cast({ creature: grappler.actor }, { near, disposition: -1 });
    const creature = cast?.creature;
    const second = creature ? await h.cast({ victim: VICTIM }, { near, disposition: -1 }) : null;
    const victim = second?.victim;
    if (!creature || !victim) return { placed: false };
    await h.pause(1000);
    const at = await ctx.position(creature);
    const spot = await h.script(`const g = canvas.scene.grid.size; const at = { x: ${Number(at.x)}, y: ${Number(at.y)} };
      const me = canvas.scene.tokens.get(${JSON.stringify(creature.id)}); const mw = me.width ?? 1;
      const rest = canvas.scene.tokens.contents.filter((t) => t.id !== ${JSON.stringify(victim.id)});
      const mid = (p, n) => ({ x: p.x + n * g / 2, y: p.y + n * g / 2 });
      for (let dx = -1; dx <= mw; dx++) for (let dy = -1; dy <= mw; dy++) {
        if (dx > -1 && dx < mw && dy > -1 && dy < mw) continue;
        const c = { x: at.x + dx * g, y: at.y + dy * g };
        if (rest.some((o) => o._source.x < c.x + g && c.x < o._source.x + (o.width ?? 1) * g
          && o._source.y < c.y + g && c.y < o._source.y + (o.height ?? 1) * g)) continue;
        if (["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
          .testCollision(mid(at, mw), mid(c, 1), { type, mode: "any" }))) continue;
        return c;
      }
      return null;`);
    if (!spot) return { placed: false };
    await ctx.call("move-token", { tokenId: victim.id, x: spot.x, y: spot.y, elevation: at.elevation ?? 0 });
    await h.pause(800);
    // The attack is used until the engine itself holds the victim as grappled by the creature.
    const holds = () => h.script(`const G = await import("${ENGINE}/adapter/grapple.mjs");
      const token = canvas.scene.tokens.get(${JSON.stringify(creature.id)});
      return G.victimsOf(token).some((v) => v.id === ${JSON.stringify(victim.id)});`, 15000);
    let held = false;
    for (let n = 0; n < 20 && !held; n++) {
      await h.setHp(victim, 40);
      await h.use({ caster: creature, itemId: grappler.item, activityId: grappler.activity, targets: [victim], consume: false });
      await h.pause(1500);
      held = await holds();
    }
    if (!held) return { placed: true, held: false };
    // The victim tries to escape, as its player would from the engine's menu.
    const before = (await ctx.engineLog()).length;
    await ctx.engine("actionEnd", { tokenId: victim.id }, { timeoutMs: 30000 });
    await h.pause(3000);
    const lines = (await ctx.engineLog()).slice(before);
    return { placed: true, held: true, disadvantage: lines.some((l) => LINE.test(l)),
      escape: lines.filter((l) => /escape/i.test(l)).map((l) => l.slice(0, 120)) };
  };

  const mimic = await escapeFrom(MIMIC, "Lanceur");
  h.log(`from the mimic: ${JSON.stringify(mimic)}`);
  h.expect(mimic.placed && mimic.held && mimic.disadvantage === true,
    "check 1: the check to escape the mimic's grapple is rolled with Disadvantage");

  const other = await escapeFrom(OTHER, "Cible");
  h.log(`from another grappler: ${JSON.stringify(other)}`);
  h.expect(other.placed && other.held && other.disadvantage === false && other.escape.length > 0,
    "check 2: the check to escape another creature's grapple is rolled normally");
});
