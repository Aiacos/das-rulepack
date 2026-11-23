// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xmm-monster-arch-hag-trait-tongue-twister.json", { with: { type: "json" } })).default;
const CREATURE = "mmArchhag0000000";
const CURSE = { itemId: "mmTongueTwister0", activityId: "oh2fNjf38LSUS6Pd" };
const VICTIM = "mmBerserker00000";
// A cantrip with a Verbal component, lent to the victim.
const SPELL = "Compendium.dnd-players-handbook.spells.Item.phbsplMindSliver";
const CAST = "pIHrgeAoBDsA7vv8";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const cast = await h.cast({ creature: CREATURE }, { near: "Cible lointaine", disposition: -1 });
  const creature = cast?.creature;
  const others = creature ? await h.cast({ victim: VICTIM }, { near: "Lanceur", disposition: 1 }) : null;
  const victim = others?.victim;
  if (!creature || !victim) { h.expect(false, "the creatures could not be placed"); return; }
  const spellId = await h.give(victim, SPELL, { spell: true });
  await h.pause(1000);
  await h.combat(creature, victim);
  await h.pause(800);
  const cursed = async () => (await h.effectsFrom(victim, CURSE.itemId)).length;
  // The victim casts its cantrip at the hag: what the engine said of the casting.
  const casts = async () => {
    await h.setHp(creature, 100);
    const mark = (await ctx.engineLog()).length;
    const done = await h.use({ caster: victim, itemId: spellId, activityId: CAST, targets: [creature] })
      .catch((e) => ({ refused: e.message }));
    // A failed casting is told once its d100 has been shown: the engine's line is waited for.
    await h.until(async () => (await ctx.engineLog()).slice(mark).some((l) => /action resolved|wasted/.test(l)), 12);
    await h.pause(1000);
    const lines = (await ctx.engineLog()).slice(mark).map((l) => l.replace(/^dnd5e-combat \| /, ""));
    return { failed: lines.some((l) => /the spell fails/.test(l)), resolved: lines.some((l) => /action resolved/.test(l)),
      refused: done?.refused ?? null, said: lines.filter((l) => /casts .* under/.test(l)).map((l) => l.slice(0, 130)) };
  };

  const before = await casts();
  h.log(`before the curse: ${JSON.stringify(before)}`);
  h.expect(!before.failed && before.resolved, "check 1: before the curse the victim's spell goes through");

  // The curse placed as the hag would after its Counterspell is not saved against.
  await h.use({ caster: creature, ...CURSE, targets: [victim], consume: false });
  await h.pause(2000);
  const held = await cursed();
  const during = await casts();
  h.log(`cursed (${held}): ${JSON.stringify(during)}`);
  h.expect(held === 1 && during.failed && !during.resolved, "check 2: cursed, a spell with a Verbal component fails");

  // The curse lasts until the end of the victim's next turn.
  await h.nextTurn();
  const itsTurn = await cursed();
  await h.nextTurn();
  const gone = await h.until(async () => (await cursed()) === 0, 10);
  h.log(`the curse: ${itsTurn} during the victim's turn, gone once it ended: ${gone}`);
  h.expect(itsTurn === 1 && gone, "check 3: the curse ends at the end of the victim's next turn");
});
