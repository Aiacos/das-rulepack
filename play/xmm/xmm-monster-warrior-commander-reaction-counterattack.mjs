// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import(
  "./xmm-monster-warrior-commander-reaction-counterattack.json", { with: { type: "json" } })).default;
const CREATURE = "mmWarriorCommand";
const ITEM = "mmCounterattack0";
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
  const beside = await h.script(`const g = canvas.scene.grid.size;
    const t = canvas.scene.tokens.get(${JSON.stringify(creature.id)});
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
  // Everyone is asked for their reaction during the run, then the setting is put back.
  const asked = await ctx.engine("setting", { key: "reactionPrompts", value: "ask" });
  ctx.restore(() => ctx.engine("setting", { key: "reactionPrompts", value: asked?.before ?? "level" }).catch(() => {}));
  const armour = () => h.script(`const a = ${h.actorOf(creature)};
    return { ac: a.system.attributes.ac.value, raised: a.effects.filter((e) => !e.disabled
      && String(e.origin ?? "").includes(${JSON.stringify(`Item.${ITEM}`)})).length };`);
  const plain = await armour();

  // The foe strikes until the creature is offered its reaction: the offer is taken.
  let seen = null;
  for (let n = 0; n < 30 && !seen; n++) {
    await h.setHp(creature, 80);
    const mark = (await ctx.engineLog()).length;
    // The scenario tool silences every reaction by default: this use lets them open.
    const running = ctx.use({ tokenId: foe.id, ...SCIMITAR, targetTokenIds: [creature.id], consume: false,
      usageConfig: { "dnd5e-combat": { autoReact: false } } }).catch((e) => ({ error: e.message }));
    let taken = false;
    for (const stop = Date.now() + 25000; !taken && Date.now() < stop;) {
      const r = await ctx.call("list-dialogs", { dialogsOnly: true, waitMs: 800 }).catch(() => null);
      const open = (r?.windows ?? [])[0] ?? null;
      if (open) {
        const offer = (open.buttons ?? []).find((b) => /Counterattack/i.test(b.label ?? "")) ?? null;
        const button = offer ? offer.action ?? offer.label : "none";
        await ctx.call("answer-dialog", { id: open.id, button }).catch(() => {});
        taken = !!offer;
      } else if ((await ctx.engineLog()).slice(mark).some((l) => /: miss|action resolved/.test(l))) {
        await h.pause(2500);
        const last = await ctx.call("list-dialogs", { dialogsOnly: true, waitMs: 800 }).catch(() => null);
        if (!(last?.windows ?? []).length) break;
      }
    }
    await running;
    await h.pause(3000);
    if (!taken) continue;
    const lines = (await ctx.engineLog()).slice(mark).map((l) => l.replace(/^dnd5e-combat \| /, "").slice(0, 140));
    seen = { tries: n + 1, lines: lines.filter((l) => /Counterattack|attack \d+/i.test(l)), after: await armour() };
  }
  h.log(`armour before ${JSON.stringify(plain)}; the reaction taken: ${JSON.stringify(seen)?.slice(0, 700)}`);
  h.expect(!!seen && seen.lines.some((l) => /AC \d+ -> \d+/.test(l)),
    "check 1: hit, the creature reacts and its AC rises for that attack");
  h.expect(!!seen && seen.after.raised === 0 && seen.after.ac === plain.ac,
    "check 2: once that attack is resolved, the raised AC is gone");
});
