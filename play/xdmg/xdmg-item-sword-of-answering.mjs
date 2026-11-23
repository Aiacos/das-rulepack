// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xdmg-item-sword-of-answering.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgSwordOfAnswer";
const WIELDER = "mmBerserker00000";
const FOE = "mmBanditCaptain0";
const SCIMITAR = { itemId: "w3cX0piuU875Hc2M", activityId: "YOx3cikY6oPu6Ojh" };

export default handWritten(json, async (h) => {
  const { ctx } = h;
  // A temporary wielder (the arena's own caster carries conditions of its own) and a foe.
  const cast = await h.cast({ wielder: WIELDER }, { near: "Cible lointaine", disposition: 1 });
  const wielder = cast?.wielder;
  const others = wielder ? await h.cast({ foe: FOE }, { near: "Lanceur", disposition: -1 }) : null;
  const foe = others?.foe;
  if (!wielder || !foe) { h.expect(false, "the creatures could not be placed"); return; }
  // The sword is lent ready to use (held and attuned).
  await ctx.ensureItem(wielder, ITEM, { byUuid: true, ready: true });
  await h.pause(1000);
  // The foe stands on a free square beside the wielder, with no wall in between.
  const beside = await h.script(`const g = canvas.scene.grid.size; const t = canvas.scene.tokens.get(${JSON.stringify(wielder.id)});
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
  if (!beside) { h.expect(false, "no free square beside the wielder"); return; }
  await ctx.call("move-token", { tokenId: foe.id, x: beside.x, y: beside.y, elevation: 0 });
  await h.pause(1000);
  // Everyone is asked for their reaction during the run, then the setting is put back.
  const asked = await ctx.engine("setting", { key: "reactionPrompts", value: "ask" });
  ctx.restore(() => ctx.engine("setting", { key: "reactionPrompts", value: asked?.before ?? "level" }).catch(() => {}));
  // A combat with the foe first: it strikes on its own turn, the wielder answers outside its own.
  await h.combat(foe, wielder);
  await h.pause(800);
  // The wielder's attack rolls so far.
  const answers = () => h.script(`return game.messages.contents
    .filter((m) => m.type === "attack" && m.speaker?.token === ${JSON.stringify(wielder.id)})
    .map((m) => ({ id: m.id, mode: m.rolls?.[0]?.options?.advantageMode ?? null }));`);

  // The foe strikes the wielder until a blow lands: the wielder's reaction window, answered with the sword.
  let seen = null;
  for (let n = 0; n < 14 && !seen; n++) {
    await h.setHp(wielder, 60);
    await h.setHp(foe, 60);
    const before = await answers();
    const mark = (await ctx.engineLog()).length;
    // The scenario tool silences every reaction by default: this use lets them open.
    const running = ctx.use({ tokenId: foe.id, ...SCIMITAR, targetTokenIds: [wielder.id], consume: false,
      usageConfig: { "dnd5e-combat": { autoReact: false } } }).catch((e) => ({ error: e.message }));
    // Every window that opens for the wielder: the sword's when it is offered, "no" to any other.
    let offered = null; let answer = null;
    for (const stop = Date.now() + 25000; !answer && Date.now() < stop;) {
      const r = await ctx.call("list-dialogs", { dialogsOnly: true, waitMs: 800 }).catch(() => null);
      const open = (r?.windows ?? []).find((w) => (w.title ?? "").endsWith(` — ${wielder.name}`)) ?? null;
      if (open) {
        offered = open;
        answer = (open.buttons ?? []).find((b) => /Sword of Answering/i.test(b.label ?? "")) ?? null;
        await ctx.call("answer-dialog", { id: open.id, button: answer ? answer.action ?? answer.label : "none" }).catch(() => {});
      } else if ((await ctx.engineLog()).slice(mark).some((l) => /: miss|action resolved/.test(l))) {
        await h.pause(2500);
        if (!((await ctx.call("list-dialogs", { dialogsOnly: true, waitMs: 800 }).catch(() => null))?.windows ?? []).length) break;
      }
    }
    await running;
    await h.pause(3500);
    const hit = (await ctx.engineLog()).slice(mark).some((l) => /attack \d+ .*: hit/.test(l));
    if (!hit) continue;
    const made = (await answers()).filter((m) => !before.some((b) => b.id === m.id));
    seen = { window: offered ? (offered.buttons ?? []).map((b) => b.label) : null, answered: !!answer, attacks: made };
  }
  await h.script(`const open = [...foundry.applications.instances.values()]
      .filter((x) => x.rendered && /Dialog/.test(x.constructor.name));
    for (const d of open) await d.close(); return true;`);
  h.log(`a blow that lands on the wielder: ${JSON.stringify(seen)}`);
  h.expect(!!seen?.answered, "check 1: damaged by a creature within reach, the wielder is offered the sword's reaction");
  h.expect(seen?.attacks?.length === 1 && seen.attacks[0].mode === 1, "check 2: the answering attack is rolled with Advantage");
});
