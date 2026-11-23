// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";
import { pause } from "../lib/steps.mjs";

const json = (await import("./xphb-feature-monk-shadow-17-cloak-of-shadows.json", { with: { type: "json" } })).default;
const ITEM = "Compendium.dnd-players-handbook.classes.Item.phbmnkCloakOfSha";
const ACTIVITY = "PCabpSdfoEUocWya";

export default handWritten(json, async (h) => {
  const bearer = await h.caster();
  const script = async (code) => (await h.ctx.call("run-script", { code, waitMs: 8000 }))?.result;
  const itemId = await h.give(bearer, ITEM);
  const idOf = (e) => e._id ?? e.id;
  const before = new Set((await h.effects(bearer)).map(idOf));
  const shrouded = async () => (await h.effects(bearer))
    .some((e) => !e.disabled && !before.has(idOf(e)) && (e.statuses ?? []).includes("invisible"));
  const tryUse = async () => {
    try {
      const used = await h.ctx.use({ tokenId: bearer.id, itemId, activityId: ACTIVITY, targetTokenIds: [], consume: false });
      if (used?.usageMessageId) await h.ctx.settle(used.usageMessageId);
      return used?.used !== false && !!used?.usageMessageId;
    } catch { return false; }
  };

  // The arena as it is: global light on, the bearer stands in bright light. The limit is the engine's "use anyway?" window, which
  // the runner's own use always passes: here the activity is used as a player would, and the window is seen, then closed.
  const lit = await script("const e = canvas.scene.environment; return e.globalLight.enabled === true && e.darknessLevel < 0.5;");
  const activity = `canvas.scene.tokens.get(${JSON.stringify(bearer.id)}).actor.items.get(${JSON.stringify(itemId)})`
    + `.system.activities.get(${JSON.stringify(ACTIVITY)})`;
  await script(`${activity}.use({}, { configure: false }); return true;`);
  const SEEN = `const line = game.i18n.localize("DND5ECOMBAT.Souci.wrongLight");
    const el = [...document.querySelectorAll("dialog, .application")].find((e) => e.innerText.includes(line));
    if (!el) return false;
    await foundry.applications.instances.get(el.id)?.close();
    return true;`;
  let warned = false;
  for (let k = 0; k < 16 && !warned; k++) { await pause(500); warned = (await script(SEEN)) === true; }
  await pause(2000);
  h.expect(lit === true && warned && !(await shrouded()),
    "check 1: in bright light the engine stops the use with its light warning; closed, nothing is placed");

  // Darkness for the run: no global light, full darkness; put back afterwards.
  const was = await script("const e = canvas.scene.environment; return { g: e.globalLight.enabled, d: e.darknessLevel };");
  const light = (g, d) => `await canvas.scene.update({ "environment.globalLight.enabled": ${g}, "environment.darknessLevel":
    ${d} });`
    + " return true;";
  h.ctx.restore(() => script(light(was?.g !== false, Number(was?.d) || 0)));
  await script(light(false, 1));
  await pause(2500);
  const raised = await tryUse();
  let placed = false;
  for (let k = 0; k < 8 && !placed; k++) { await pause(500); placed = await shrouded(); }
  h.expect(raised && placed, "check 2: in darkness the use goes through and the Invisible effect is on the bearer");

  await h.ctx.call("set-status", { tokenId: bearer.id, statusId: "incapacitated", active: true });
  h.ctx.restore(() => h.ctx.call("set-status", { tokenId: bearer.id, statusId: "incapacitated", active: false }).catch(() => {}));
  let gone = false;
  for (let k = 0; k < 12 && !gone; k++) { await pause(500); gone = !(await shrouded()); }
  h.expect(gone, "check 3: the effect is gone once its bearer is Incapacitated");
});
