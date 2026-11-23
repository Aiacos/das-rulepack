// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xphb-feature-paladin-glory-15-glorious-defense.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-players-handbook.classes.Item.phbpdnGloriousDe";
const BEARER = "mmBerserker00000";
const FOE = "mmBanditCaptain0";
const SCIMITAR = { itemId: "w3cX0piuU875Hc2M", activityId: "YOx3cikY6oPu6Ojh" };
// A free square beside a token, with no wall in between, other than the squares already taken.
const BESIDE = (id, me, taken) => `const g = canvas.scene.grid.size; const t = canvas.scene.tokens.get(${JSON.stringify(id)});
  const at = { x: t._source.x, y: t._source.y }; const taken = ${JSON.stringify(taken)};
  const rest = canvas.scene.tokens.contents.filter((o) => o.id !== ${JSON.stringify(me)} && o.id !== t.id);
  const centre = (p) => ({ x: p.x + g / 2, y: p.y + g / 2 });
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = { x: at.x + dx * g, y: at.y + dy * g };
    if (taken.some((o) => o.x === c.x && o.y === c.y)) continue;
    if (rest.some((o) => o._source.x < c.x + g && c.x < o._source.x + (o.width ?? 1) * g
      && o._source.y < c.y + g && c.y < o._source.y + (o.height ?? 1) * g)) continue;
    if (["move", "sight"].some((type) => CONFIG.Canvas.polygonBackends[type]
      .testCollision(centre(at), centre(c), { type, mode: "any" }))) continue;
    return c;
  }
  return null;`;

export default handWritten(json, async (h) => {
  const { ctx } = h;
  // A temporary bearer of the feature (Charisma below 10: the bonus is its minimum, 1), an ally and a foe.
  const cast = await h.cast({ bearer: BEARER, ally: BEARER }, { near: "Cible lointaine", disposition: 1 });
  const { bearer, ally } = cast ?? {};
  const others = bearer && ally ? await h.cast({ foe: FOE }, { near: "Lanceur", disposition: -1 }) : null;
  const foe = others?.foe;
  if (!bearer || !ally || !foe) { h.expect(false, "the creatures could not be placed"); return; }
  await h.give(bearer, ITEM);
  await h.pause(1000);
  // The foe beside the bearer, the ally beside the foe's square on the bearer's other side: all within 10 feet.
  const foeAt = await h.script(BESIDE(bearer.id, foe.id, []));
  if (!foeAt) { h.expect(false, "no free square beside the bearer"); return; }
  await ctx.call("move-token", { tokenId: foe.id, x: foeAt.x, y: foeAt.y, elevation: 0 });
  await h.pause(800);
  const allyAt = await h.script(BESIDE(foe.id, ally.id, [foeAt]));
  if (!allyAt) { h.expect(false, "no free square beside the foe"); return; }
  await ctx.call("move-token", { tokenId: ally.id, x: allyAt.x, y: allyAt.y, elevation: 0 });
  await h.pause(1000);
  // Everyone is asked for their reaction during the run, then the setting is put back.
  const asked = await ctx.engine("setting", { key: "reactionPrompts", value: "ask" });
  ctx.restore(() => ctx.engine("setting", { key: "reactionPrompts", value: asked?.before ?? "level" }).catch(() => {}));
  const uses = () => h.script(`const i = ${h.actorOf(bearer)}.items.find((x) => x.system.identifier === "glorious-defense");
    return { spent: i?.system.uses?.spent ?? null, max: i?.system.uses?.max ?? null };`);

  // The foe strikes `victim` until the bearer is offered the feature: the offer is taken.
  const struck = async (victim) => {
    for (let n = 0; n < 25; n++) {
      await h.setHp(victim, 40);
      const mark = (await ctx.engineLog()).length;
      // The scenario tool silences every reaction by default: this use lets them open.
      const running = ctx.use({ tokenId: foe.id, ...SCIMITAR, targetTokenIds: [victim.id], consume: false,
        usageConfig: { "dnd5e-combat": { autoReact: false } } }).catch((e) => ({ error: e.message }));
      let taken = null;
      for (const stop = Date.now() + 25000; !taken && Date.now() < stop;) {
        const r = await ctx.call("list-dialogs", { dialogsOnly: true, waitMs: 800 }).catch(() => null);
        const open = (r?.windows ?? [])[0] ?? null;
        if (open) {
          const offer = (open.buttons ?? []).find((b) => /Glorious Defense/i.test(b.label ?? "")) ?? null;
          await ctx.call("answer-dialog", { id: open.id, button: offer ? offer.action ?? offer.label : "none" }).catch(() => {});
          if (offer) taken = { title: open.title, buttons: (open.buttons ?? []).map((b) => b.label) };
        } else if ((await ctx.engineLog()).slice(mark).some((l) => /: miss|action resolved/.test(l))) {
          await h.pause(2500);
          const last = await ctx.call("list-dialogs", { dialogsOnly: true, waitMs: 800 }).catch(() => null);
          if (!(last?.windows ?? []).length) break;
        }
      }
      await running;
      await h.pause(2000);
      const lines = (await ctx.engineLog()).slice(mark).map((l) => l.replace(/^dnd5e-combat \| /, "").slice(0, 150));
      if (taken) return { taken, tries: n + 1, lowered: lines.some((l) => /Glorious Defense.*-\d+ to the attack roll/.test(l)),
        lines: lines.filter((l) => /attack|reaction|Glorious|miss|hit/i.test(l)) };
    }
    return null;
  };

  const before = await uses();
  const own = await struck(bearer);
  h.log(`the bearer is hit: ${JSON.stringify(own)?.slice(0, 900)}`);
  const between = await uses();
  // The temporary bearer has a single use: it is given back before the second window.
  await h.script(`const i = ${h.actorOf(bearer)}.items.find((x) => x.system.identifier === "glorious-defense");
    await i.update({ "system.uses.spent": 0 }); return true;`);
  const fresh = await uses();
  const other = await struck(ally);
  h.log(`an ally within 10 feet is hit: ${JSON.stringify(other)?.slice(0, 900)}`);
  const after = await uses();
  h.log(`uses spent: ${JSON.stringify([before, between, fresh, after])}`);
  h.expect(!!own?.lowered, "check 1: hit by an attack roll, the bearer is offered the feature and the attack roll is lowered");
  h.expect(!!other?.lowered, "check 2: when an ally within 10 feet is hit, the same is offered and the roll lowered");
  h.expect(between.spent === before.spent + 1 && after.spent === fresh.spent + 1, "check 3: each use spends one of its uses");
});
