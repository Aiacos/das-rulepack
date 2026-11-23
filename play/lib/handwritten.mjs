// Ruling R43: the helper of a HAND-WRITTEN scenario, the play that proves an engineered rule. A person or the main session
// writes play/<book>/<slug>.mjs (first line `// hand-written (Ruling R43)`) beside play/<book>/<slug>.json (`{ scenario, key,
// rule, handWritten: true, checks, covers }`, `rule` refreshed by `npm run scenarios -- <BOOK> --stamp-handwritten`):
//
//   // hand-written (Ruling R43)
//   import { handWritten } from "../lib/handwritten.mjs";
//   const json = (await import("./<slug>.json", { with: { type: "json" } })).default;
//   export default handWritten(json, async (h) => { ...h.use(...), h.expect(...)... });
//
// The runner (DAS_CORE tools/scenario.mjs) calls `run(ctx)`; the helper hands the module `h`, the same context helpers the
// generated scenarios use (play/lib/steps.mjs: nothing is written twice), then prints the stamp line of Ruling R10 exactly as
// a generated scenario does, or `stamp withheld: <why>` instead when an expectation failed, when another number of checks ran
// than the JSON declares, when a turn change it asked for never came, or when the JSON is not a hand-written scenario with
// a rule fingerprint. The helper cannot read the registry where the runner runs: that the JSON's `rule` is the record's rule
// as it is, `npm run scenarios -- <BOOK> --check` says before the run (it fails on a stale one) and `npm run played` after
// (it records nothing from a stamp for another rule). Everything printed is ids, engine words, numbers and fingerprints.
import { ARENA } from "../../tools/pipeline/scenarios.mjs";
import {
  HP, TRIES, advance, castTarget, casterTurn, clearNew, combatReady, documentOf, hasStatus, isTarget, lendItem, outcomeOf,
  pause, stampLine
} from "./steps.mjs";

const HEX64 = /^[0-9a-f]{64}$/;
const SCENARIO = /^[a-z][a-z0-9]{1,9}\/[a-z0-9][a-z0-9-]{0,159}$/;

// Why the JSON cannot be stamped whatever the play shows, or null.
function jsonProblem(json) {
  if (json?.handWritten !== true) return "the JSON is not a hand-written scenario (handWritten: true)";
  if (!SCENARIO.test(String(json.scenario))) return "the JSON names no scenario id";
  if (!HEX64.test(String(json.rule))) return "the JSON has no rule fingerprint (npm run scenarios -- <BOOK> --stamp-handwritten)";
  if (!Number.isInteger(json.checks) || json.checks < 1) return "the JSON declares no checks";
  return null;
}

/**
 * `{ name, scene, run(ctx) }` for the runner: `play(h)` is the module's own play. `scene` defaults to the arena of the
 * generated scenarios. `h` holds:
 * - `ctx` (the runner's context, its `expect` counted), `expect(ok, label)`, `log(...)`;
 * - `caster()` the arena's caster token, `cast(roles, { near, disposition })` creatures of the Monster Manual 2025 / SRD 2024
 *   (ctx.cast), `target(actor, near?)` one creature cast hostile near the arena's target spot (or `near`);
 * - `give(caster, uuid, { spell })` a compendium item lent to a token for the run (its uses, slots, concentration put back),
 *   returning its item id;
 * - `use({ caster, itemId, activityId, targets, consume, area })` one use of an activity, settled: `{ used, resolution,
 *   of(token), outcome(token) }` (a refused use throws: the runner reports the scenario interrupted, and no stamp is printed);
 *   `useUntil(roll, use, target)` the same use again (at most 20 times: TRIES) until `target`'s outcome is `roll` (hit, miss,
 *   failedSave, savedSave, crit), what each miss left on the target removed and its hit points reset; null (and a failed
 *   check) when it never comes;
 * - `combat(caster, target)` a combat with the caster first (initiative 20); `nextTurn()` one turn on, seen to change (false,
 *   and the stamp withheld, when it never does); `casterTurn(caster)` turns on until the caster's comes back;
 * - `effects(token)` the token's effects (each with its `origin`), `effectsFrom(token, itemId)` those whose origin is the
 *   item, `hasStatus(token, status)`; `hp(token)` and `setHp(token, n)` (the first change of a token's hit points is put back);
 * - `script(code)` a function body run on the game master's page, its return value handed back; `actorOf(token)` the page
 *   expression of a token's actor, for such a script;
 * - `answer(option = 0)` an open question of the engine answered with that option (true when one was open); `playerUse({
 *   caster, itemId, activityId })` the activity used as a player would, WITHOUT the confirmation `use` always passes (not
 *   awaited: the engine may stop it with a window); `warned(issue)` the engine's "use anyway?" window for that issue word
 *   (`wrongLight`, `needsEffect`...) seen, and closed without going on;
 * - `fresh(token)` marks the token's effects now and returns a function listing the enabled ones placed since;
 *   `status(token, id)` a status put on a token for the run; `darkness()` the scene without light for the run (both put back);
 *   `until(test, tries)` a test asked every half second until it holds.
 */
export function handWritten(json, play, { scene = ARENA.scene } = {}) {
  return {
    name: json?.scenario,
    scene,
    async run(ctx) {
      let failed = 0;
      const own = Object.create(ctx, {
        expect: { value: (ok, label) => { if (!ok) failed += 1; return ctx.expect(ok, label); } }
      });
      const env = { ctx: own, combat: null, withheld: null };
      const start = ctx.checks;
      await play(helpers(own, env));
      const ran = ctx.checks - start;
      const { version } = await ctx.engine("status");
      const why = jsonProblem(json) ?? (failed ? `${failed} expectation(s) failed`
        : ran !== json.checks ? `${ran} check(s) ran, the scenario declares ${json.checks}` : env.withheld);
      ctx.log(why ? `stamp withheld: ${why}` : stampLine(json.scenario, version, json.rule, ran));
    }
  };
}

// Page scripts (function bodies run on the game master's client by the runner's `run-script`). `option` and `issue` are an
// integer and an engine word: both are checked before they reach a script.
const ANSWER = (option) => `const b = document.querySelector('[data-action="pick${Number.parseInt(option, 10) || 0}"]');
  if (!b) return false; b.click(); return true;`;
const WARNING = (issue) => {
  if (!/^[A-Za-z]{1,40}$/.test(String(issue))) throw new Error(`not an engine issue word: ${issue}`);
  // The engine's line may hold placeholders ({item}, {effect}): a window shows it when it shows each of its fixed stretches.
  return `const line = game.i18n.localize("DND5ECOMBAT.Souci.${issue}");
    const parts = line.split(/\\{[^}]+\\}/).map((x) => x.trim()).filter((x) => x.length > 3);
    if (!parts.length) return false;
    const el = [...document.querySelectorAll("dialog, .application")].find((e) => parts.every((x) => e.innerText.includes(x)));
    if (!el) return false;
    await foundry.applications.instances.get(el.id)?.close();
    return true;`;
};
const LIGHT = (globalLight, darkness) => 'await canvas.scene.update({ "environment.globalLight.enabled": '
  + `${globalLight === true}, "environment.darknessLevel": ${Number(darkness) || 0} }); return true;`;

function helpers(ctx, env) {
  const kept = new Set();
  const script = async (code, waitMs = 8000) => (await ctx.call("run-script", { code, waitMs }))?.result;
  const h = {
    ctx,
    expect: (ok, label) => ctx.expect(ok, label),
    log: (...a) => ctx.log(...a),
    caster: () => ctx.token(ARENA.caster),
    cast: (roles, options) => ctx.cast(roles, options),
    target: (actor, near = ARENA.near) => castTarget(ctx, actor, near),
    give: (caster, uuid, options) => lendItem(ctx, caster, uuid, options),
    async use({ caster, itemId, activityId, targets = [], consume, area } = {}) {
      const used = await ctx.use({ tokenId: caster.id, itemId, activityId, targetTokenIds: targets.map((t) => t.id),
        ...(consume === undefined ? {} : { consume }), ...(area ? { area } : {}) });
      if (used?.used === false || !used?.usageMessageId) {
        throw new Error(`the use of activity ${activityId} was refused (${used?.reason ?? used?.error ?? "no usage message"})`);
      }
      const resolution = await ctx.settle(used.usageMessageId);
      const of = (token) => (resolution?.targets ?? []).find((x) => isTarget(x, token)) ?? null;
      return { used, resolution, of, outcome: (token) => outcomeOf(resolution, of(token)) };
    },
    async useUntil(roll, use, target) {
      for (let i = 1; i <= TRIES; i++) {
        const before = new Set((await ctx.effects(target)).map((e) => e?._id ?? e?.id));
        await h.setHp(target, HP);
        const done = await h.use(use);
        if (done.outcome(target) === roll) return done;
        await clearNew(ctx, target, before);
      }
      ctx.expect(false, `no ${roll} in ${TRIES} tries (activity ${use.activityId})`);
      return null;
    },
    combat: (caster, target) => combatReady(env, { caster, target }, "combat"),
    async nextTurn() {
      const turned = await advance(ctx);
      if (!turned) env.withheld = "a turn change the play asked for never came";
      return turned;
    },
    casterTurn: (caster) => casterTurn(ctx, { caster }),
    effects: (token) => ctx.effects(token),
    effectsFrom: async (token, itemId) => (await ctx.effects(token))
      .filter((e) => String(e?.origin ?? "").includes(`Item.${itemId}`)),
    hasStatus: async (token, status) => hasStatus(await ctx.effects(token), status),
    hp: (token) => ctx.hp(token),
    async setHp(token, n) {
      if (!kept.has(token.id)) {
        kept.add(token.id);
        const was = await ctx.hp(token);
        ctx.restore(() => ctx.setHp(token, was));
      }
      await ctx.setHp(token, n);
    },
    pause,
    documentOf: (token) => documentOf(ctx, token),
    script,
    actorOf: (token) => `canvas.scene.tokens.get(${JSON.stringify(token.id)})?.actor`,
    async answer(option = 0, tries = 30) {
      for (let k = 0; k < tries; k++) {
        await pause(500);
        if ((await script(ANSWER(option))) === true) return true;
      }
      return false;
    },
    playerUse: ({ caster, itemId, activityId }) => script(`${h.actorOf(caster)}.items.get(${JSON.stringify(itemId)})`
      + `.system.activities.get(${JSON.stringify(activityId)}).use({}, { configure: false }); return true;`),
    async warned(issue, tries = 16) {
      for (let k = 0; k < tries; k++) {
        await pause(500);
        if ((await script(WARNING(issue))) === true) return true;
      }
      return false;
    },
    async fresh(token) {
      const idOf = (e) => e?._id ?? e?.id;
      const before = new Set((await ctx.effects(token)).map(idOf));
      return async () => (await ctx.effects(token)).filter((e) => !e.disabled && !before.has(idOf(e)));
    },
    async status(token, statusId) {
      await ctx.call("set-status", { tokenId: token.id, statusId, active: true });
      ctx.restore(() => ctx.call("set-status", { tokenId: token.id, statusId, active: false }).catch(() => {}));
    },
    async darkness() {
      const was = await script("const e = canvas.scene.environment; return { g: e.globalLight.enabled, d: e.darknessLevel };");
      ctx.restore(() => script(LIGHT(was?.g !== false, Number(was?.d) || 0)));
      await script(LIGHT(false, 1));
      await pause(2500);
    },
    async until(test, tries = 12) {
      for (let k = 0; k < tries; k++) {
        await pause(500);
        if (await test()) return true;
      }
      return false;
    }
  };
  return h;
}
