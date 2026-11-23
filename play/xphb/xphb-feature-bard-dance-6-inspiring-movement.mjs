// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xphb-feature-bard-dance-6-inspiring-movement.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-players-handbook.classes.Item.phbbrdInspiringM";
const FOE = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const bearer = await h.caster();
  const foe = await h.target(FOE, "Cible lointaine");
  if (!bearer || !foe) { h.expect(false, "the creatures could not be placed"); return; }
  await h.give(bearer, ITEM);
  await h.pause(1000);
  const far = await ctx.position(foe);
  // The square east of the bearer (the arena keeps it free).
  const grid = await ctx.gridSize();
  const at = await ctx.position(bearer);
  const beside = { x: at.x + grid, y: at.y };
  // Everyone is asked for their reaction during the run, then the setting is put back.
  const asked = await ctx.engine("setting", { key: "reactionPrompts", value: "ask" });
  ctx.restore(() => ctx.engine("setting", { key: "reactionPrompts", value: asked?.before ?? "level" }).catch(() => {}));
  await h.combat(bearer, foe);
  await h.pause(800);
  const turnOf = () => h.script("return game.combat?.combatant?.tokenId ?? null;");

  // The foe stands on a square and ends its turn there: whether the bearer is offered its reaction.
  const endsTurnAt = async (spot) => {
    for (let k = 0; k < 3 && (await turnOf()) !== foe.id; k++) await h.nextTurn();
    await ctx.call("move-token", { tokenId: foe.id, x: spot.x, y: spot.y, elevation: 0 });
    await h.pause(1000);
    const ending = h.nextTurn().catch(() => null);
    let offered = null;
    for (const stop = Date.now() + 8000; !offered && Date.now() < stop;) {
      const r = await ctx.call("list-dialogs", { dialogsOnly: true, waitMs: 800 }).catch(() => null);
      offered = (r?.windows ?? []).find((w) => (w.title ?? "").endsWith(` — ${bearer.name}`)) ?? null;
    }
    const seen = offered ? { title: offered.title, buttons: (offered.buttons ?? []).map((b) => b.label) } : null;
    if (offered) await ctx.call("answer-dialog", { id: offered.id, button: "none" }).catch(() => {});
    await ending;
    await h.pause(1500);
    return seen;
  };

  const away = await endsTurnAt(far);
  h.log(`the foe ends its turn far from the bearer: reaction window ${JSON.stringify(away)}`);
  h.expect(away === null, "check 1: a foe that ends its turn far from the bearer opens no reaction");

  const close = await endsTurnAt(beside);
  h.log(`the foe ends its turn beside the bearer: reaction window ${JSON.stringify(close)}`);
  h.expect(close !== null, "check 2: a foe that ends its turn within 5 feet of the bearer offers the bearer the reaction");
});
