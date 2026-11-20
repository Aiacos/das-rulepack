/**
 * DAS · Rule Pack — rules for content of the official rulebooks outside the SRD (Xanathar's, Tasha's and others, with or
 * without an official Foundry module), which DAS · Core does not cover or covers in part, registered through the engine's
 * public content API.
 */

import { MODULE_ID, DAS_ID } from "./constants.mjs";
import { TABLE } from "./rules/index.mjs";
import { registerShadowBlade } from "./shadow-blade.mjs";
import { registerBladeCantrips, registerBladeCantripsInit } from "./blade-cantrips.mjs";
import { registerImporters } from "./importers.mjs";
import { registerDreadfulStrikes } from "./dreadful-strikes.mjs";
import { registerPsychicVeil } from "./psychic-veil.mjs";

/** The engine calls this hook once, at setup, with its `register(source, table)` function. */
Hooks.once(`${DAS_ID}.registerContent`, register => {
  // One table, built from the per-book modules of scripts/rules/books/: the engine validates entry by entry and keeps the
  // valid ones. On a DAS · Core that does not know the `sense` key yet, the senses are rejected (the engine logs them) and the
  // other rules are registered all the same.
  try { register(MODULE_ID, { ...TABLE }); }
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
