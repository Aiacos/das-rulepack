// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-psychic-gray-ooze-action-pseudopod.json", { with: { type: "json" } })).default;
const CREATURE = "mmPsychicGrayOoz";
const ITEM = "mmPseudopod00000";
const ACTIVITY = "oPXdl3BBYsuoemkT";
const TARGET = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const cast = await h.cast({ creature: CREATURE }, { near: "Lanceur", disposition: -1 });
  const creature = cast?.creature;
  const others = creature ? await h.cast({ target: TARGET }, { near: "Cible", disposition: -1 }) : null;
  const target = others?.target;
  if (!creature || !target) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // The ooze stands beside its target, away from everyone else.
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
  // A combat with the ooze first, then its target.
  await h.combat(creature, target);
  await h.pause(800);
  // A saving throw rolled as the target's player would, without its window and without a chat card.
  const save = (ability) => h.script(`const rolls = await ${h.actorOf(target)}
      .rollSavingThrow({ ability: ${JSON.stringify(ability)} }, { configure: false }, { create: false });
    const roll = Array.isArray(rolls) ? rolls[0] : rolls; return roll?.options?.advantageMode ?? null;`, 15000);

  const hit = await h.useUntil("hit", { caster: creature, itemId: ITEM, activityId: ACTIVITY, targets: [target],
    consume: false }, target);
  await h.pause(2000);
  const struck = { int: await save("int"), wis: await save("wis") };
  h.log(`after the hit: Intelligence save ${struck.int}, Wisdom save ${struck.wis} (-1 is Disadvantage)`);
  h.expect(!!hit && struck.int === -1 && struck.wis === 0,
    "check 1: after the hit the target rolls Intelligence saves with Disadvantage, and its other saves normally");

  // The ooze's turn ends, the target's passes, the ooze's next turn begins: the text keeps the Disadvantage until that
  // turn ends.
  await h.nextTurn();
  await h.pause(1200);
  const own = await save("int");
  await h.nextTurn();
  await h.pause(1200);
  const next = await save("int");
  await h.nextTurn();
  const over = await h.until(async () => (await save("int")) === 0, 10);
  h.log(`on the target's turn ${own}, on the ooze's next turn ${next}, once that turn has ended: normal ${over}`);
  h.expect(own === -1 && next === -1 && over,
    "check 2: the Disadvantage lasts through the ooze's next turn and is gone once that turn has ended");
});
