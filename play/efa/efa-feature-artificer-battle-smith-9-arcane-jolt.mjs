// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./efa-feature-artificer-battle-smith-9-arcane-jolt.json", { with: { type: "json" } })).default;
const PACK = "Compendium.dnd-players-handbook.classes.Item";
const STRIKE = `${PACK}.phbmnkUnarmedStr`;
const OPTIONS = "Compendium.dnd-forge-artificer.options.Item";
const CLASS = `${OPTIONS}.efaArtificer0000`;
const JOLT = `${OPTIONS}.efabatArcaneJolt`;

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const artificer = await h.caster();
  // Beside the artificer: an Unarmed Strike reaches 5 feet.
  const target = await h.target("mmBanditCaptain0", "Lanceur");
  // Nine artificer levels for the run: the feature's dice scale with them (2d6 at 9th level).
  await ctx.ensureItem(artificer, CLASS, { system: { levels: 9 } });
  const strikeId = await h.give(artificer, STRIKE);
  const joltId = await h.give(artificer, JOLT);
  await h.pause(1500);
  const uses = () => h.script(`const i = ${h.actorOf(artificer)}?.items.get(${JSON.stringify(joltId)});
    return i ? { spent: i.system.uses.spent, max: i.system.uses.max } : null;`);
  const known = async () => (await ctx.call("list-dialogs", {})).windows.map((w) => w.id);
  // The engine's on-hit window: the button that names the feature is pressed; what the window offered is handed back.
  const take = async (ids, ms = 15000) => {
    for (const stop = Date.now() + ms; Date.now() < stop;) {
      const r = await ctx.call("list-dialogs", { dialogsOnly: true, excludeIds: ids, waitMs: 1500, details: true })
        .catch(() => null);
      for (const d of r?.windows ?? []) {
        const labels = (d.buttons ?? []).map((x) => x.label);
        const b = (d.buttons ?? []).find((x) => /Arcane Jolt|Destructive Energy/i.test(x.label ?? ""));
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
    const before = await uses();
    const ids = await known();
    const since = await ctx.lastMessageId();
    const u = await ctx.use({ tokenId: artificer.id, itemId: strikeId, activityType: "attack", targetTokenIds: [target.id] });
    const asked = await take(ids);
    if (asked?.declined) break;
    const r = await ctx.settle(u.usageMessageId, { timeoutMs: 45000 }).catch(() => null);
    const hit = (r?.targets ?? []).some((t) => t.hit === true);
    if (!hit) continue;
    await h.pause(4000);
    const msgs = await ctx.messagesSince(since);
    seen = { asked, before, after: await uses(), damage: msgs.filter((m) => m.type === "damage") };
  }
  // Without a hit nothing can be checked: one failed expectation, and the stamp is withheld.
  if (!seen) { h.expect(false, "the artificer never hit the target (15 tries at most)"); return; }
  const rolls = seen.damage.flatMap((m) => (m.rolls ?? []).map((x) => String(x.formula)));
  h.log(`offered: ${(seen.asked?.labels ?? []).join(", ")} — uses ${JSON.stringify(seen.before)} → ${JSON.stringify(seen.after)}`
    + ` — damage rolls: ${rolls.join(" | ")}`);
  h.expect(!!seen.asked, "check 1: on the unarmed hit the engine's window offers the feature");
  h.expect(seen.after?.spent === (seen.before?.spent ?? 0) + 1, "check 2: taking it spends one use of the feature");
  // An artificer of 9th level: the feature's dice are 2d6. The damage type of the added roll is not read here.
  h.expect(rolls.length >= 2 && rolls.slice(1).some((f) => /^2d6\b/.test(f)),
    "check 3: the feature's own roll (2d6) is added to the strike's damage");
});
