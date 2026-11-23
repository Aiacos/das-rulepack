// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-sphinx-of-secrets-action-curse-of-the-riddle.json", { with: { type: "json" } })).default;
const CREATURE = "mmSphinxOfSecret";
const CURSE = { itemId: "mmCurseOfTheRidd", activityId: "RbCvwBYpqZFD3jac" };
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
  // The foe on a free square beside the creature (as wide as it is), with no wall in between.
  const spot = await h.script(`const g = canvas.scene.grid.size; const t = canvas.scene.tokens.get(${JSON.stringify(creature.id)});
    const w = t.width ?? 1; const at = { x: t._source.x, y: t._source.y }; const me = ${JSON.stringify(foe.id)};
    const rest = canvas.scene.tokens.contents.filter((o) => o.id !== me && o.id !== t.id);
    const centre = (p) => ({ x: p.x + g / 2, y: p.y + g / 2 }); const middle = { x: at.x + w * g / 2, y: at.y + w * g / 2 };
    for (let k = 0; k < w; k++) for (const c of [{ x: at.x + w * g, y: at.y + k * g }, { x: at.x - g, y: at.y + k * g },
      { x: at.x + k * g, y: at.y + w * g }, { x: at.x + k * g, y: at.y - g }]) {
      if (rest.some((o) => o._source.x < c.x + g && c.x < o._source.x + (o.width ?? 1) * g
        && o._source.y < c.y + g && c.y < o._source.y + (o.height ?? 1) * g)) continue;
      if (["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
        .testCollision(middle, centre(c), { type, mode: "any" }))) continue;
      return c;
    }
    return null;`);
  if (!spot) { h.expect(false, "no free square beside the creature"); return; }
  await ctx.call("move-token", { tokenId: foe.id, x: spot.x, y: spot.y, elevation: 0 });
  await h.pause(1000);
  const cursed = async () => (await h.effectsFrom(foe, CURSE.itemId)).length;
  // The foe's rolls: a Strength check without window or card, and one attack roll against the creature.
  const rolls = async () => {
    const check = await h.script(`const r = await ${h.actorOf(foe)}.rollAbilityCheck({ ability: "str" }, { configure: false },
      { create: false }); return (Array.isArray(r) ? r[0] : r)?.options?.advantageMode ?? null;`, 20000);
    await h.setHp(creature, 100);
    await h.use({ caster: foe, ...SCIMITAR, targets: [creature], consume: false });
    await h.pause(1500);
    const attack = await h.script(`const m = game.messages.contents
      .filter((x) => x.type === "attack" && x.speaker?.token === ${JSON.stringify(foe.id)}).at(-1);
      return m?.rolls?.[0]?.options?.advantageMode ?? null;`);
    return { check, attack };
  };

  const before = await rolls();
  if (!await h.useUntil("failedSave", { caster: creature, ...CURSE, targets: [foe], consume: false }, foe)) return;
  await h.pause(1500);
  const held = await cursed();
  const during = await rolls();
  h.log(`roll modes before the curse ${JSON.stringify(before)}; cursed (${held}) ${JSON.stringify(during)}`);
  h.expect(before.check === 0 && before.attack === 0, "check 1: before the curse the foe's check and attack roll are normal");
  h.expect(held === 1 && during.check === -1, "check 2: cursed, its ability check is rolled with Disadvantage");
  h.expect(during.attack === -1, "check 3: cursed, its attack roll is rolled with Disadvantage");

  // The cursed creature tries to solve the riddle, as its player would from the engine's menu, until it does.
  let solved = false; const said = [];
  for (let n = 0; n < 15 && !solved; n++) {
    const mark = (await ctx.engineLog()).length;
    await ctx.engine("actionEnd", { tokenId: foe.id }, { timeoutMs: 30000 });
    await h.pause(2500);
    said.push(...(await ctx.engineLog()).slice(mark).filter((l) => /break/i.test(l)).map((l) => l.slice(0, 110)));
    solved = (await cursed()) === 0;
  }
  h.log(`solving the riddle: ${JSON.stringify(said.slice(-4))}`);
  h.expect(solved && /breaks free/.test(said.at(-1) ?? ""), "check 4: an action spent on a successful check ends the curse");
});
