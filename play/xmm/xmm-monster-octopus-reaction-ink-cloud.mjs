// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-octopus-reaction-ink-cloud.json", { with: { type: "json" } })).default;
const CREATURE = "mmOctopus0000000";
const FOE = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Cible lointaine", disposition: -1 });
  const octopus = cast?.creature;
  const others = octopus ? await h.cast({ foe: FOE }, { near: "Lanceur", disposition: 1 }) : null;
  const foe = others?.foe;
  if (!octopus || !foe) { h.expect(false, "the creatures could not be placed"); return; }
  await h.pause(1000);
  const far = await ctx.position(foe);
  // A free square beside the octopus, with no wall in between.
  const beside = await h.script(`const g = canvas.scene.grid.size; const t = canvas.scene.tokens.get(${JSON.stringify(octopus.id)});
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
  if (!beside) { h.expect(false, "no free square beside the octopus"); return; }
  // Everyone is asked for their reaction during the run, then the setting is put back.
  const asked = await ctx.engine("setting", { key: "reactionPrompts", value: "ask" });
  ctx.restore(() => ctx.engine("setting", { key: "reactionPrompts", value: asked?.before ?? "level" }).catch(() => {}));
  await h.combat(octopus, foe);
  await h.pause(800);
  const turnOf = () => h.script("return game.combat?.combatant?.tokenId ?? null;");

  // The foe stands on a square and ends its turn there: whether the octopus is offered its reaction.
  const endsTurnAt = async (spot) => {
    for (let k = 0; k < 3 && (await turnOf()) !== foe.id; k++) await h.nextTurn();
    await ctx.call("move-token", { tokenId: foe.id, x: spot.x, y: spot.y, elevation: 0 });
    await h.pause(1000);
    const ending = h.nextTurn().catch(() => null);
    let offered = null;
    for (const stop = Date.now() + 8000; !offered && Date.now() < stop;) {
      const r = await ctx.call("list-dialogs", { dialogsOnly: true, waitMs: 800 }).catch(() => null);
      offered = (r?.windows ?? []).find((w) => (w.title ?? "").endsWith(` — ${octopus.name}`)) ?? null;
    }
    const seen = offered ? { title: offered.title, buttons: (offered.buttons ?? []).map((b) => b.label) } : null;
    if (offered) await ctx.call("answer-dialog", { id: offered.id, button: "none" }).catch(() => {});
    await ending;
    await h.pause(1500);
    return seen;
  };

  const away = await endsTurnAt(far);
  h.log(`the foe ends its turn far from the octopus: reaction window ${JSON.stringify(away)}`);
  h.expect(away === null, "check 1: a foe that ends its turn far from the octopus opens no reaction");

  const close = await endsTurnAt(beside);
  h.log(`the foe ends its turn beside the octopus: reaction window ${JSON.stringify(close)}`);
  h.expect(close !== null, "check 2: a foe that ends its turn within 5 feet of it offers the octopus its reaction");
});
