// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-warrior-commander-action-greatsword.json", { with: { type: "json" } })).default;
const CREATURE = "mmWarriorCommand";
const SWORD = { itemId: "cWEx0aUNtgAiphWk", activityId: "zi3BW6RGO2ugOyXu" };
const FOE = "mmBanditCaptain0";
const SCIMITAR = { itemId: "w3cX0piuU875Hc2M", activityId: "YOx3cikY6oPu6Ojh" };

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Cible lointaine", disposition: -1 });
  const creature = cast?.creature;
  const others = creature ? await h.cast({ foe: FOE }, { near: "Lanceur", disposition: 1 }) : null;
  const foe = others?.foe;
  if (!creature || !foe) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  // The foe on a free square beside the creature, with no wall in between.
  const beside = await h.script(`const g = canvas.scene.grid.size; const t = canvas.scene.tokens.get(${JSON.stringify(creature.id)});
    const at = { x: t._source.x, y: t._source.y }; const me = ${JSON.stringify(foe.id)};
    const rest = canvas.scene.tokens.contents.filter((o) => o.id !== me && o.id !== t.id);
    const centre = (p) => ({ x: p.x + g / 2, y: p.y + g / 2 });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = { x: at.x + dx * g, y: at.y + dy * g };
      if (rest.some((o) => o._source.x < c.x + g && c.x < o._source.x + (o.width ?? 1) * g
        && o._source.y < c.y + g && c.y < o._source.y + (o.height ?? 1) * g)) continue;
      if (["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
        .testCollision(centre(at), centre(c), { type, mode: "any" }))) continue;
      return c;
    }
    return null;`);
  if (!beside) { h.expect(false, "no free square beside the creature"); return; }
  await ctx.call("move-token", { tokenId: foe.id, x: beside.x, y: beside.y, elevation: 0 });
  await h.pause(1000);
  await h.combat(creature, foe);
  await h.pause(800);
  // What the sword left on the foe, and the mode of the last attack roll a token made.
  const sapped = async () => (await h.effectsFrom(foe, SWORD.itemId)).length;
  const lastMode = (token) => h.script(`const m = game.messages.contents
    .filter((x) => x.type === "attack" && x.speaker?.token === ${JSON.stringify(token.id)}).at(-1);
    return m?.rolls?.[0]?.options?.advantageMode ?? null;`);
  const strikeBack = async () => {
    await h.setHp(creature, 60);
    await h.use({ caster: foe, ...SCIMITAR, targets: [creature], consume: false });
    await h.pause(1500);
    return lastMode(foe);
  };

  // A blow that lands leaves the effect on the foe.
  if (!await h.useUntil("hit", { caster: creature, ...SWORD, targets: [foe], consume: false }, foe)) return;
  await h.pause(1500);
  const marked = await sapped();
  h.expect(marked === 1, "check 1: a hit leaves the sword's effect on the target");

  // The target's next attack roll is rolled with Disadvantage, and the effect is spent; the one after is not.
  const first = await strikeBack();
  const left = await sapped();
  const second = await strikeBack();
  h.log(`effect on the target ${marked} -> ${left}; its attack rolls: mode ${first}, then ${second}`);
  h.expect(first === -1 && left === 0, "check 2: the target's next attack roll has Disadvantage and spends the effect");
  h.expect(second === 0, "check 3: its following attack roll is normal");

  // Unspent, the effect ends when the creature's next turn starts.
  if (!await h.useUntil("hit", { caster: creature, ...SWORD, targets: [foe], consume: false }, foe)) return;
  await h.pause(1500);
  const again = await sapped();
  await h.nextTurn();
  const duringFoeTurn = await sapped();
  await h.nextTurn();
  const gone = await h.until(async () => (await sapped()) === 0, 10);
  h.log(`a second effect: ${again} after the hit, ${duringFoeTurn} during the target's turn, gone at the creature's turn: ${gone}`);
  h.expect(again === 1 && duringFoeTurn === 1 && gone, "check 4: unspent, the effect ends at the start of the creature's next turn");
});
