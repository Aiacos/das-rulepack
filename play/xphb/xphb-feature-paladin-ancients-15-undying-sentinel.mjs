// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";
import { pause } from "../lib/steps.mjs";

const json = (await import("./xphb-feature-paladin-ancients-15-undying-sentinel.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-players-handbook.classes.Item.phbpdnUndyingSen";
const CLASS = "Compendium.dnd-players-handbook.classes.Item.phbpdnPaladin000";

// Answers the engine's question with its first option ("rise"); true when a question was open.
const ANSWER = `const b = document.querySelector('[data-action="pick0"]'); if (!b) return false; b.click(); return true;`;

export default handWritten(json, async (h) => {
  const bearer = await h.caster();
  const script = async (code) => (await h.ctx.call("run-script", { code, waitMs: 5000 }))?.result;
  const actor = `canvas.scene.tokens.get(${JSON.stringify(bearer.id)})?.actor`;
  // One paladin level for the run: the item's heal is three times the level.
  await h.give(bearer, CLASS);
  const itemId = await h.give(bearer, ITEM);
  const level = await script(`return ${actor}?.getRollData()?.classes?.paladin?.levels ?? 0;`);
  const spent = () => script(`return ${actor}?.items.get(${JSON.stringify(itemId)})?.system.uses.spent ?? null;`);
  const answered = async (tries) => {
    for (let k = 0; k < tries; k++) { await pause(500); if ((await script(ANSWER)) === true) return true; }
    return false;
  };

  await h.setHp(bearer, 0);
  h.expect(await answered(30), "check 1: at 0 Hit Points the engine asks the bearer whether to rise");
  let hp = 0;
  for (let k = 0; k < 20 && !(hp > 0); k++) { await pause(500); hp = await h.hp(bearer); }
  await pause(4000);
  const statuses = await script(`return [...(${actor}?.statuses ?? [])].sort().join(",");`);
  h.log(`paladin level ${level}, hit points after rising ${hp}, uses spent ${await spent()}, statuses: ${statuses}`);
  h.expect(level >= 1 && hp === 3 * level && (await spent()) === 1,
    "check 2: the use is spent and the bearer stands at three times the paladin level");

  await h.setHp(bearer, 0);
  const again = await answered(12);
  h.expect(!again && (await h.hp(bearer)) === 0,
    "check 3: with the use spent, a second fall asks nothing and the bearer stays at 0");
});
