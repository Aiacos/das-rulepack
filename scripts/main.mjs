/**
 * DAS · Rule Pack — rules for content of the official rulebooks outside the SRD (Xanathar's, Tasha's and others, with or
 * without an official Foundry module), which DAS · Core does not cover or covers in part, registered through the engine's
 * public content API.
 */

import { MODULE_ID, DAS_ID } from "./constants.mjs";
import { RULES, TABLE, SOURCES } from "./rules/index.mjs";
import { withCarried } from "./carry.mjs";
import { withAcceptedSources } from "./scoped-sources.mjs";
import { withKnownEntries } from "./known-entries.mjs";
import { registerShadowBlade } from "./shadow-blade.mjs";
import { registerBladeCantrips, registerBladeCantripsInit } from "./blade-cantrips.mjs";
import { registerImporters } from "./importers.mjs";
import { registerDreadfulStrikes } from "./dreadful-strikes.mjs";
import { registerPsychicVeil } from "./psychic-veil.mjs";

/** The engine calls this hook once, at setup, with its `register(source, table)` function. */
Hooks.once(`${DAS_ID}.registerContent`, register => {
  // One table, built from the per-book modules of scripts/rules/books/: the engine validates entry by entry and keeps the
  // valid ones. Ruling R37: the pack asks it first (`api.content.validate`), so that a rule with a key this DAS · Core does not
  // know yet (`sense`, `saveAutoFail` on an older engine) is left out whole, with its sources, in one line; the other rules
  // are registered all the same.
  // The sources (document id -> identifier, for items whose own identifier is not the rule's) go as a third argument only when
  // there are some: without them the call is the two-argument call it has always been.
  // Ruling R29 (fix round 1): a monster rule that rebinds its item carries over the engine keys that would be dropped, taken
  // from the engine's own shipped entries; one whose carried key the running engine does not ship is left out.
  const content = globalThis.game?.modules?.get(DAS_ID)?.api?.content;
  const { table: carried, missing } = withCarried(TABLE, RULES, content?.builtin);
  if ( missing.length ) console.warn(`${MODULE_ID} | not registered (an engine key they carry is missing): ${missing.join(", ")}`);
  // Ruling R35: a rule bound to one creature's feature by an `<actor id>.<item id>` source is registered only when the running
  // engine accepts that key (an older DAS · Core refuses it): asked of the engine itself.
  const scoped = withAcceptedSources(carried, RULES, SOURCES, content?.validateSources);
  if ( scoped.skipped.length ) {
    console.warn(`${MODULE_ID} | not registered: ${scoped.skipped.length} rule(s) bound to one creature's feature by an <actor`
      + " id>.<item id> source, which this DAS · Core refuses (update DAS · Core)");
  }
  const { table, sources, skipped } = withKnownEntries(scoped.table, RULES, scoped.sources, content?.validate);
  if ( skipped.length ) {
    console.warn(`${MODULE_ID} | not registered: ${skipped.length} rule(s) this DAS · Core refuses (a key it does not know yet:`
      + ` update DAS · Core): ${skipped.join(", ")}`);
  }
  try { register(MODULE_ID, table, ...(Object.keys(sources).length ? [{ sources }] : [])); }
  catch(err) { console.error(`${MODULE_ID} | rules refused by DAS · Core:`, err); }
});

Hooks.once("init", () => registerBladeCantripsInit());

Hooks.once("ready", () => {
  const das = game.modules.get(DAS_ID);
  if ( !das?.active || (das.api?.active === false) ) {
    console.warn(`${MODULE_ID} | DAS · Core is not running: nothing to do.`);
    return;
  }
  registerShadowBlade();
  registerBladeCantrips();
  registerImporters(das.api);
  registerDreadfulStrikes();
  registerPsychicVeil();
});
