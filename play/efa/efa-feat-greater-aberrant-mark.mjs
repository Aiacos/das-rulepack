// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";

const json = (await import("./efa-feat-greater-aberrant-mark.json", { with: { type: "json" } })).default;
const PACK = "Compendium.dnd-forge-artificer.options.Item";
// The mark whose use comes back, and the feat that brings it back on a Short Rest.
const MARK = `${PACK}.efaAberrantDrago`;
const GREATER = `${PACK}.efaGreaterAberra`;
const BEARER = "mmBanditCaptain0";

export default handWritten(json, async (h) => {
  const { ctx } = h;
  // A creature of its own for the run: resting it touches nothing of the arena.
  const cast = await h.cast({ bearer: BEARER }, { near: "Cible", disposition: -1 });
  const bearer = cast?.bearer;
  if (!bearer) { h.expect(false, "the bearer could not be placed"); return; }
  const markId = await ctx.ensureItem(bearer, MARK);
  await h.pause(1000);
  const spent = () => h.script(`return ${h.actorOf(bearer)}.items.get(${JSON.stringify(markId)})?.system.uses.spent ?? null;`);
  const spend = () => h.script(`await ${h.actorOf(bearer)}.items.get(${JSON.stringify(markId)}).update({ "system.uses.spent": 1 });
    return true;`);
  // A Short Rest taken as the creature's player would, without its window and without a chat card.
  const rest = () => h.script(`await ${h.actorOf(bearer)}.shortRest({ dialog: false, chat: false, advanceTime: false });
    return true;`, 30000);

  // With the mark alone, a Short Rest does not give its use back.
  await spend();
  await rest();
  await h.pause(1500);
  const alone = await spent();
  h.log(`the mark alone, after a Short Rest: uses spent ${alone}`);
  h.expect(alone === 1, "check 1: with the mark alone, the use spent is still spent after a Short Rest");

  // With the greater feat too, the same rest gives it back.
  await ctx.ensureItem(bearer, GREATER);
  await h.pause(1000);
  await rest();
  const back = await h.until(async () => (await spent()) === 0, 8);
  h.log(`with the greater feat, after a Short Rest: uses spent ${await spent()}`);
  h.expect(back, "check 2: with the greater feat, the same Short Rest gives the use back");
});
