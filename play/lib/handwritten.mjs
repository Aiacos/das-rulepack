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
 *   item, `hasStatus(token, status)`; `hp(token)` and `setHp(token, n)` (the first change of a token's hit points is put back).
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

function helpers(ctx, env) {
  const kept = new Set();
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
    documentOf: (token) => documentOf(ctx, token)
  };
  return h;
}
