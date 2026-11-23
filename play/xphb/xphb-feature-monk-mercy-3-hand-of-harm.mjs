// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xphb-feature-monk-mercy-3-hand-of-harm.json", { with: { type: "json" } })).default;
const PACK = "Compendium.dnd-players-handbook.classes.Item";
const CLASS = `${PACK}.phbmnkMonk000000`;
const FOCUS = `${PACK}.phbmnkMonksFocus`;
const STRIKE = `${PACK}.phbmnkUnarmedStr`;
const HARM = `${PACK}.phbmnkHandOfHarm`;

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const monk = await h.caster();
  // Beside the monk: an Unarmed Strike reaches 5 feet.
  const target = await h.target("mmBanditCaptain0", "Lanceur");
  // Five monk levels for the run: the Martial Arts die and the Focus Points both scale with them.
  await ctx.ensureItem(monk, CLASS, { system: { levels: 5 } });
  const focusId = await h.give(monk, FOCUS);
  const strikeId = await h.give(monk, STRIKE);
  await h.give(monk, HARM);
  await h.pause(1500);
  const focus = () => h.script(`const i = ${h.actorOf(monk)}?.items.get(${JSON.stringify(focusId)});
    return i ? { spent: i.system.uses.spent, max: i.system.uses.max } : null;`);
  const known = async () => (await ctx.call("list-dialogs", {})).windows.map((w) => w.id);
  // The engine's on-hit window: the button that names the feature is pressed; what the window offered is handed back.
  const take = async (ids, ms = 15000) => {
    for (const stop = Date.now() + ms; Date.now() < stop;) {
      const r = await ctx.call("list-dialogs", { dialogsOnly: true, excludeIds: ids, waitMs: 1500, details: true })
        .catch(() => null);
      for (const d of r?.windows ?? []) {
        const labels = (d.buttons ?? []).map((x) => x.label);
        const b = (d.buttons ?? []).find((x) => /Hand of Harm/i.test(x.label ?? ""));
        if (b) { await ctx.call("answer-dialog", { id: d.id, button: b.action ?? b.label }); return { labels }; }
        // Any other window (the engine's "attack anyway?" when out of reach) is declined, so that none stays open.
        h.log(`a window without the feature: ${d.title ?? ""} [${labels.join(", ")}]`);
        const no = (d.buttons ?? []).find((x) => /Cancel|Annuler|No\b/i.test(x.label ?? ""));
        if (no) await ctx.call("answer-dialog", { id: d.id, button: no.action ?? no.label }).catch(() => {});
        ids.push(d.id);
        if (no) return { declined: true, labels };
      }
    }
    return null;
  };

  let seen = null;
  for (let n = 0; n < 15 && !seen; n++) {
    await h.setHp(target, 200);
    const before = await focus();
    const ids = await known();
    const since = await ctx.lastMessageId();
    const u = await ctx.use({ tokenId: monk.id, itemId: strikeId, activityType: "attack", targetTokenIds: [target.id] });
    const asked = await take(ids);
    if (asked?.declined) break;
    const r = await ctx.settle(u.usageMessageId, { timeoutMs: 45000 }).catch(() => null);
    const hit = (r?.targets ?? []).some((t) => t.hit === true);
    if (!hit) continue;
    await h.pause(4000);
    const msgs = await ctx.messagesSince(since);
    seen = { asked, before, after: await focus(), damage: msgs.filter((m) => m.type === "damage") };
  }
  // Without a hit nothing can be checked: one failed expectation, and the stamp is withheld.
  if (!seen) { h.expect(false, "the monk never hit the target (15 tries at most)"); return; }
  const rolls = seen.damage.flatMap((m) => (m.rolls ?? []).map((x) => String(x.formula)));
  h.log(`offered: ${(seen.asked?.labels ?? []).join(", ")} — focus ${JSON.stringify(seen.before)} → ${JSON.stringify(seen.after)}`
    + ` — damage rolls: ${rolls.join(" | ")}`);
  h.expect(!!seen.asked, "check 1: on the unarmed hit the engine's window offers the feature");
  h.expect(seen.after?.spent === (seen.before?.spent ?? 0) + 1, "check 2: taking it spends one Focus Point");
  // A monk of 5th level: the Martial Arts die is a d8. The damage type of the added roll is not read here.
  h.expect(rolls.length >= 2 && rolls.slice(1).some((f) => /^1d8\b/.test(f)),
    "check 3: the feature's own roll (Martial Arts die plus Wisdom) is added to the strike's damage");
});
