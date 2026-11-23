// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-scout-captain-bonus-aim.json", { with: { type: "json" } })).default;
const CREATURE = "mmScoutCaptain00";
const AIM = { item: "mmAim00000000000", activity: "MzsKDH0S7g3jTm6M" };
const SWORD = { item: "lPlB7NmujNipH61R", activity: "42jdrHDfDRCcYeL4" };
const TARGET = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const others = creature ? await h.cast({ target: TARGET }, { near: "Cible", disposition: -1 }) : null;
  const target = others?.target;
  if (!creature || !target) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // The scout stands beside its target, away from everyone else (a foe at its side would spoil the roll).
  const spot = await h.script(`const g = canvas.scene.grid.size; const t = canvas.scene.tokens.get(${JSON.stringify(target.id)});
    const at = { x: t._source.x, y: t._source.y }; const me = ${JSON.stringify(creature.id)};
    const rest = canvas.scene.tokens.contents.filter((o) => o.id !== me && o.id !== t.id);
    const centre = (p) => ({ x: p.x + g / 2, y: p.y + g / 2 });
    const near = (c) => rest.some((o) => Math.abs(o._source.x - c.x) <= g && Math.abs(o._source.y - c.y) <= g);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const c = { x: at.x + dx * g, y: at.y + dy * g };
      if (near(c)) continue;
      if (["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
        .testCollision(centre(at), centre(c), { type, mode: "any" }))) continue;
      return c;
    }
    return null;`);
  if (!spot) { h.expect(false, "no square beside the target that is clear of the others"); return; }
  await h.ctx.call("move-token", { tokenId: creature.id, x: spot.x, y: spot.y, elevation: 0 });
  await h.pause(800);
  // A combat with the scout first: the aim holds for its current turn.
  await h.combat(creature, target);
  await h.pause(800);
  // One blow of the sword, and how its attack roll was rolled (the last attack roll in the chat log).
  const blow = async () => {
    await h.setHp(target, 40);
    await h.use({ caster: creature, itemId: SWORD.item, activityId: SWORD.activity, targets: [target], consume: false });
    await h.pause(1500);
    return h.script(`const m = game.messages.contents.filter((x) => x.type === "attack").at(-1);
      const roll = m?.rolls?.[0]; return { formula: roll?.formula ?? null, mode: roll?.options?.advantageMode ?? null };`);
  };
  // The Aim feature used as its bearer would use it (a utility activity: nothing to resolve).
  const aim = () => h.script(`const item = ${h.actorOf(creature)}?.items.get(${JSON.stringify(AIM.item)});
    await item.system.activities.get(${JSON.stringify(AIM.activity)}).use({ "dnd5e-combat": { confirmed: true } },
      { configure: false });
    return true;`, 20000);

  const plain = await blow();
  await aim();
  await h.pause(2000);
  const aimed = await blow();
  const after = await blow();
  h.log(`without aiming ${JSON.stringify(plain)} — after aiming ${JSON.stringify(aimed)} — the blow after`
    + ` ${JSON.stringify(after)}`);
  h.expect(plain.mode === 0, "check 1: without aiming the blow is rolled normally");
  h.expect(aimed.mode === 1, "check 2: the first blow after aiming is rolled with Advantage");
  h.expect(after.mode === 0, "check 3: the next blow of the same turn is rolled normally again");
});
