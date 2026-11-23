// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./efa-feature-artificer-cartographer-5-guided-precision.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-forge-artificer.options.Item.efacarGuidedPrec";
const SPELL = "Compendium.dnd5e.spells24.Item.phbsplFaerieFire";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const artificer = await h.caster();
  const target = await h.target("mmBanditCaptain0");
  const spellId = await h.give(artificer, SPELL, { spell: true });
  const itemId = await h.give(artificer, ITEM);
  await h.setHp(artificer, await h.hp(artificer));
  await h.pause(800);
  // Faerie Fire is an area: it is placed around the target (the runner lays the zone the engine would ask for).
  const box = await ctx.box(target);
  const grid = await ctx.gridSize();
  const done = await h.use({ caster: artificer, itemId: spellId, targets: [], consume: false,
    area: { shape: "circle", x: box.x + box.width / 2, y: box.y + box.height / 2, radius: grid * 1.5 } });
  if (done.used?.regionId) {
    ctx.restore(() => ctx.call("delete-scene-object", { type: "Region", objectId: done.used.regionId }).catch(() => {}));
  }
  await h.pause(1000);
  const concentrating = async () => (await ctx.effectsFrom(artificer, "faerie-fire"))
    .some((e) => (e.statuses ?? []).includes("concentrating"));
  h.expect(await concentrating(), "check 1: the artificer concentrates on Faerie Fire");

  await ctx.engineLog();
  await ctx.engine("hurt", { tokenId: artificer.id, amount: 30, type: "necrotic" });
  await h.pause(3000);
  const kept = (await ctx.engineLog()).some((l) => /concentration kept without a saving throw/.test(l));
  h.expect(kept && (await concentrating()), "check 2: 30 damage with the feature: Concentration kept, and no saving throw");

  // The same damage without the feature: the engine asks for the Concentration save.
  const { actorId } = await h.documentOf(artificer);
  await ctx.call("remove-embedded-item", { documentType: "Actor", id: actorId, itemId });
  await h.pause(800);
  await ctx.engine("hurt", { tokenId: artificer.id, amount: 30, type: "necrotic" });
  await h.pause(4000);
  const asked = (await ctx.engineLog()).some((l) => /concentration saving throw/.test(l));
  h.expect(asked, "check 3: the same damage without the feature asks for a Concentration saving throw");
});
