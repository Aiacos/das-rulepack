// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-elephant-bonus-trample.json", { with: { type: "json" } })).default;
const CREATURE = "mmElephant000000";
const ITEM = "mmTrample0000000";
const ACTIVITY = "QckCIpsC3BdEHycI";
// The creature the text lets the feature take, and the one it does not.
const ALLOWED = "mmBanditCaptain0";
const REFUSED = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const others = creature ? await h.cast({ allowed: ALLOWED, refused: REFUSED }, { near: "Cible", disposition: -1 }) : null;
  const { allowed, refused } = others ?? {};
  if (!creature || !allowed || !refused) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // Both stand beside the creature (its reach is 5 feet), on free squares with no wall in between.
  const at = await ctx.position(creature);
  const beside = (token) => h.script(`const g = canvas.scene.grid.size; const at = { x: ${Number(at.x)}, y: ${Number(at.y)} };
    const rest = canvas.scene.tokens.contents.filter((t) => t.id !== ${JSON.stringify(token.id)});
    const centre = (p) => ({ x: p.x + g / 2, y: p.y + g / 2 });
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]];
    for (const [dx, dy] of steps) {
      const c = { x: at.x + dx * g, y: at.y + dy * g };
      const w = canvas.scene.tokens.get(${JSON.stringify(token.id)}).width ?? 1;
      if (rest.some((o) => o._source.x < c.x + w * g && c.x < o._source.x + (o.width ?? 1) * g
        && o._source.y < c.y + w * g && c.y < o._source.y + (o.height ?? 1) * g)) continue;
      if (["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
        .testCollision(centre(at), centre(c), { type, mode: "any" }))) continue;
      return c;
    }
    return null;`);
  for (const token of [allowed, refused]) {
    const spot = await beside(token);
    if (!spot) { h.expect(false, "no free square beside the creature"); return; }
    await ctx.call("move-token", { tokenId: token.id, x: spot.x, y: spot.y, elevation: at.elevation ?? 0 });
    await h.pause(800);
  }
  // The allowed one lies Prone for the run; the other stands.
  await h.status(allowed, "prone");
  await h.pause(800);
  // The creature the text does not allow: the use leaves it unaffected, whatever its save would have been.
  await h.setHp(refused, 200);
  const no = await h.use({ caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [refused], consume: false });
  await h.pause(2500);
  const spared = no.of(refused);
  h.log(`refused target: unaffected ${JSON.stringify(spared?.unaffected ?? null)}, save ${JSON.stringify(spared?.save ?? null)},`
    + ` hit points ${await h.hp(refused)}`);
  h.expect(!!spared?.unaffected && (await h.hp(refused)) === 200, "check 1: a standing creature is left unaffected");

  // The creature the text allows: on a failed save it takes the damage.
  const yes = await h.useUntil("failedSave", { caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [allowed],
    consume: false }, allowed);
  await h.pause(2500);
  const hp = await h.hp(allowed);
  h.log(`allowed target: hit points ${hp}`);
  h.expect(!!yes && hp < 100, "check 2: a Prone creature that fails the save takes the damage");
});
