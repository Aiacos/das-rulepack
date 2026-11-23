// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xphb-feature-paladin-vengeance-7-relentless-avenger.json", { with: { type: "json" } })).default;
const PACK = "Compendium.dnd-players-handbook.classes.Item";
const ITEM = `${PACK}.phbpdnRelentless`;
const STRIKE = `${PACK}.phbmnkUnarmedStr`;
const EFFECT = "RZNe5HYKKOHYjJ3w";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const paladin = await h.caster();
  // An easy creature to hit, beside the paladin.
  const foe = await h.target("mmZombie00000000", "Lanceur");
  const itemId = await h.give(paladin, ITEM);
  await h.give(paladin, STRIKE);
  await h.pause(1000);
  const grid = await ctx.gridSize();
  const at = await ctx.position(paladin);
  // The foe stands east of the paladin and will walk further east (squares the arena keeps free).
  const home = { x: at.x + grid, y: at.y, elevation: at.elevation ?? 0 };
  await ctx.call("move-token", { tokenId: foe.id, x: home.x, y: home.y, elevation: home.elevation });
  await h.pause(800);
  const placed = await h.fresh(foe);
  await ctx.startCombat([foe, paladin]);
  await h.pause(800);
  // The foe moves on its own turn: whoever the combat starts with, it is brought to the foe's.
  const turnOf = () => h.script("return game.combat?.combatant?.tokenId ?? null;");
  for (let k = 0; k < 2 && (await turnOf()) !== foe.id; k++) await h.nextTurn();

  // Everyone is asked for their reaction during the run (the pass's setting follows the automation level), then put back.
  const asked = await ctx.engine("setting", { key: "reactionPrompts", value: "ask" });
  ctx.restore(() => ctx.engine("setting", { key: "reactionPrompts", value: asked?.before ?? "level" }).catch(() => {}));
  // A free square three or four squares east of the paladin (the foe walks 20 feet), read from the scene.
  const others = await h.script(`return canvas.scene.tokens.contents.map((t) => ({ id: t.id, name: t.name, x: t._source.x,
    y: t._source.y }));`);
  const free = (dx) => !others.some((t) => t.id !== foe.id && Math.abs(t.x - (at.x + dx * grid)) < grid
    && Math.abs(t.y - at.y) < grid);
  const step = [4, 3, 5].find(free);
  h.log(`tokens on the row: ${others.filter((t) => Math.abs(t.y - at.y) < grid).map((t) => `${t.name}@${t.x}`).join(", ")}`
    + ` — walking to +${step}`);
  if (step === undefined) { h.expect(false, "no free square east of the paladin"); return; }
  const probe = { x: at.x + step * grid + grid / 2, y: at.y + grid / 2 };
  const threats = await ctx.engine("threats", { tokenId: foe.id, point: probe }).catch((e) => `error ${e.message}`);
  const prompts = await ctx.engine("setting", { key: "reactionPrompts" }).catch((e) => `error ${e.message}`);
  h.log(`paladin at ${at.x},${at.y} — foe at ${home.x},${home.y} — threats on leaving: ${JSON.stringify(threats)}`
    + ` — reactionPrompts: ${JSON.stringify(prompts)}`);

  // The foe walks away, five squares off: the paladin's reaction window opens, and the strike it offers is taken.
  let seen = null;
  for (let n = 0; n < 6 && !seen; n++) {
    await h.setHp(foe, 200);
    const away = probe;
    const moving = ctx.engine("move", { tokenId: foe.id, point: away, stopAfterMs: 9000 }, { timeoutMs: 25000 }).catch(() => null);
    let offered = null;
    for (const stop = Date.now() + 7000; !offered && Date.now() < stop;) {
      const r = await ctx.call("list-dialogs", { dialogsOnly: true, waitMs: 800 }).catch(() => null);
      offered = (r?.windows ?? []).find((w) => (w.title ?? "").endsWith(` — ${paladin.name}`)
        && (w.buttons ?? []).some((b) => b.action === "none")) ?? null;
    }
    const strike = (offered?.buttons ?? []).find((b) => b.action !== "none");
    if (!offered) {
      const all = await ctx.call("list-dialogs", { details: true }).catch(() => null);
      h.log(`windows open: ${JSON.stringify((all?.windows ?? []).map((w) => ({ id: w.id, title: w.title, cls: w.class ?? w.type,
        buttons: (w.buttons ?? []).map((b) => `${b.action}:${b.label}`), text: String(w.content ?? w.text ?? "").slice(0, 80) })))
        .slice(0, 900)}`);
    }
    h.log(`try ${n + 1}: reaction window ${offered ? `[${(offered.buttons ?? []).map((b) => b.label).join(", ")}]` : "absent"}`);
    const button = strike ? strike.action ?? strike.label : "none";
    if (offered) await ctx.call("answer-dialog", { id: offered.id, button }).catch(() => {});
    const moved = await moving;
    const turn = await h.script(`const c = game.combat; const t = canvas.scene.tokens.get(${JSON.stringify(foe.id)});
      return { turn: c?.combatant?.name ?? null, round: c?.round ?? null, speed: t?.actor?.system.attributes.movement.walk,
        statuses: [...(t?.actor?.statuses ?? [])], order: (c?.turns ?? []).map((x) => x.name) };`);
    h.log(`moved: ${JSON.stringify({ after: moved?.after, ms: moved?.elapsedMs, windows: moved?.newWindows }).slice(0, 300)}`
      + ` — combat: ${JSON.stringify(turn)}`);
    const own = (e) => String(e.origin ?? "").includes(itemId);
    const halted = strike ? await h.until(async () => (await placed()).some(own), 16) : false;
    if (halted) {
      const effect = (await placed()).find(own);
      const changes = JSON.stringify(effect.system?.changes ?? effect.changes ?? []).slice(0, 200);
      seen = { offered: !!offered, effect: { name: effect.name, changes } };
      break;
    }
    // A miss (or no window): back beside the paladin, a full round on so that the Reaction returns, and again.
    await ctx.call("move-token", { tokenId: foe.id, x: home.x, y: home.y, elevation: home.elevation ?? 0 });
    await h.pause(600);
    await h.nextTurn();
    await h.nextTurn();
  }
  if (!seen) { h.expect(false, "the reaction attack never hit (6 tries at most)"); return; }
  h.log(`effect on the creature hit: ${JSON.stringify(seen.effect)} (item effect ${EFFECT})`);
  h.expect(seen.offered, "check 1: leaving the paladin's reach opens their reaction window, and the strike is made");
  h.expect(/movement/.test(seen.effect.changes), "check 2: the creature hit carries the feature's Speed 0 effect");
});
