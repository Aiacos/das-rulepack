// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./efa-species-warforged-construct-resilience.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-forge-artificer.options.Item.efaConstructResi";
// An SRD spell whose saving throw gives the Poisoned condition.
const POISONS = "Compendium.dnd5e.spells24.Item.phbsplContagion0";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const caster = await h.caster();
  const cast = await h.cast({ bearer: "mmBanditCaptain0", plain: "mmBanditCaptain0" }, { near: "Cible", disposition: -1 });
  const { bearer, plain } = cast ?? {};
  if (!bearer || !plain) { h.expect(false, "the two creatures could not be placed"); return; }
  await h.give(bearer, ITEM);
  const spellId = await h.give(caster, POISONS, { spell: true });
  await h.pause(1000);

  // The advantage mode of the creature's saving throw against the spell (1 is Advantage), read from its roll message.
  const saveMode = async (target) => {
    const used = await ctx.use({ tokenId: caster.id, itemId: spellId, activityType: "save", consume: false,
      targetTokenIds: [target.id] });
    await ctx.settle(used.usageMessageId).catch(() => null);
    // One creature is targeted: the one saving throw rolled after the use is its own.
    const save = (await ctx.messagesSince(used.usageMessageId)).find((m) => m.type === "save");
    const raw = save?.rolls?.[0];
    const roll = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { found: !!save, mode: roll?.options?.advantageMode ?? null, formula: roll?.formula ?? "" };
  };
  const withTrait = await saveMode(bearer);
  const without = await saveMode(plain);
  h.log(`with the trait: ${JSON.stringify(withTrait)} — without: ${JSON.stringify(without)}`);
  h.expect(withTrait.found && withTrait.mode === 1,
    "check 1: the bearer's save against the poisoning spell is rolled with Advantage");
  h.expect(without.found && without.mode !== 1, "check 2: a creature without the trait rolls the same save without Advantage");
});
