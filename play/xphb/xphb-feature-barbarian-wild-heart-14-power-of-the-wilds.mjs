// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./xphb-feature-barbarian-wild-heart-14-power-of-the-wilds.json", { with: { type: "json" } })).default;
const PACK = "Compendium.dnd-players-handbook.classes.Item";
const CLASS = `${PACK}.phbbrbBarbarian0`;
const RAGE = `${PACK}.phbbrbRage000000`;
const ITEM = `${PACK}.phbbrbPowerOfThe`;
const ACTIVATE = "dnd5eactivity000";
const FALCON = "o18VwrDu98TcN2KZ";
const LION = "GaiGBX8kIhmEgI2Y";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  const barbarian = await h.caster();
  await ctx.ensureItem(barbarian, CLASS, { system: { levels: 14 } });
  const rageId = await h.give(barbarian, RAGE);
  const itemId = await h.give(barbarian, ITEM);
  await h.pause(1000);
  const placed = await h.fresh(barbarian);
  const idOf = (e) => e._id ?? e.id;

  // The Rage has nothing for the engine to resolve: it is entered as the player would, and its effect waited for.
  await h.script(`${h.actorOf(barbarian)}.items.get(${JSON.stringify(rageId)}).system.activities`
    + `.get(${JSON.stringify(ACTIVATE)}).use({ consume: false }, { configure: false }); return true;`);
  const raging = await h.until(async () => (await placed()).length >= 1, 16);
  const rage = new Set((await placed()).map(idOf));
  // The option, on the barbarian themself: what is placed beyond the Rage's own effect is the option's.
  await h.use({ caster: barbarian, itemId, activityId: FALCON, targets: [barbarian], consume: false });
  const option = async () => (await placed()).filter((e) => !rage.has(idOf(e)));
  const taken = await h.until(async () => (await option()).length >= 1, 16);
  h.log(`raging: ${raging} — Rage's effects: ${rage.size} — the option's: ${(await option()).map((e) => e.name).join(", ")}`);
  h.expect(raging && taken, "check 1: in Rage, the option taken puts its effect on the barbarian");

  // A second option in the same Rage: what the engine itself lists against that use (its own command, as upstream's scenarios
  // read it), in Rage and, further down, once the Rage is over.
  const issues = async () => (await ctx.engine("issues", { tokenId: barbarian.id, itemId, activityId: LION })).join(" / ");
  const during = await issues();
  h.log(`issues of a second option, in Rage: ${during || "none"}`);
  h.expect(/Rage/.test(during), "check 2: a second option in the same Rage is listed by the engine as an issue");

  // The Rage ends (its effect is removed, as when it runs out): the option's effect goes with it.
  await h.script(`const a = ${h.actorOf(barbarian)};
    for (const id of ${JSON.stringify([...rage])}) await a.effects.get(id)?.delete();
    return true;`);
  const gone = await h.until(async () => (await option()).length === 0, 16);
  const after = await issues();
  h.log(`issues of an option once the Rage is over: ${after || "none"}`);
  h.expect(taken && gone && !/Rage/.test(after), "check 3: when the Rage ends, the option's effect ends with it");
});
