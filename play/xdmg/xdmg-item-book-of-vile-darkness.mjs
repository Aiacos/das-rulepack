// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xdmg-item-book-of-vile-darkness.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgBookOfVileDar";
// The speech that hurts those who hear it: an activity of damage alone, with no roll to hit and no save.
const ACTIVITY = "QCNkGQX4lTt0Dfi3";
// A living creature, and an Undead, which the text spares.
const LIVING = "mmBanditCaptain0";
const UNDEAD = "mmZombie00000000";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const reader = await h.caster();
  const others = await h.cast({ living: LIVING, undead: UNDEAD }, { near: "Lanceur", disposition: -1 });
  const { living, undead } = others ?? {};
  if (!reader || !living || !undead) { h.expect(false, "the creatures could not be placed"); return; }
  // The book is lent ready to use (held and attuned). Attuned, it grants spells to its bearer: they leave with it.
  const itemId = await ctx.ensureItem(reader, ITEM, { byUuid: true, ready: true });
  ctx.restore(() => h.script(`const a = ${h.actorOf(reader)};
    const granted = a.items.filter((i) => (i.flags?.dnd5e?.cachedFor ?? "").startsWith(".Item.${itemId}."));
    if (granted.length) await a.deleteEmbeddedDocuments("Item", granted.map((i) => i.id));
    return granted.length;`, 15000).catch(() => null));
  await h.pause(1500);
  const before = { living: await h.hp(living), undead: await h.hp(undead) };
  const mark = (await ctx.engineLog()).length;

  // The speech is used on both at once, as its bearer would: the use, then the damage roll its card asks for.
  const spoken = await h.script(`const a = ${h.actorOf(reader)}; const activity = a.items.get(${JSON.stringify(itemId)})
      .system.activities.get(${JSON.stringify(ACTIVITY)});
    canvas.tokens.setTargets(${JSON.stringify([undead.id, living.id])});
    const used = await activity.use({ "dnd5e-combat": { confirmed: true } }, { configure: false });
    const rolls = await activity.rollDamage({}, { configure: false },
      { data: { "flags.dnd5e.originatingMessage": used?.message?.id ?? null } });
    return { used: !!used, rolled: Array.isArray(rolls) ? rolls.length : !!rolls };`, 30000);
  await h.until(async () => (await h.hp(living)) < before.living, 10);
  const after = { living: await h.hp(living), undead: await h.hp(undead) };
  const lines = (await ctx.engineLog()).slice(mark).filter((l) => /unaffected/.test(l)).map((l) => l.slice(0, 110));
  h.log(`spoken ${JSON.stringify(spoken)} — Undead ${after.undead} of ${before.undead}, living creature ${after.living} of`
    + ` ${before.living} — engine: ${JSON.stringify(lines)}`);
  h.expect(after.undead === before.undead && lines.length === 1 && /\(content\)/.test(lines[0]),
    "check 1: an Undead in earshot is left unaffected by the speech");
  h.expect(after.living < before.living, "check 2: a living creature in earshot is hurt by the same speech");
});
