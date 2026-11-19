/**
 * DAS · Rule Pack — rules for content that DAS · Core does not cover (Xanathar's, Tasha's and other books that have no
 * official Foundry module), registered through the engine's public content API.
 */

import { MODULE_ID, DAS_ID } from "./constants.mjs";
import { SPELLS } from "./rules/spells.mjs";
import { SENSES } from "./rules/senses.mjs";
import { registerShadowBlade } from "./shadow-blade.mjs";
import { registerBladeCantrips, registerBladeCantripsInit } from "./blade-cantrips.mjs";
import { registerImporters } from "./importers.mjs";

/** The engine calls this hook once, at setup, with its `register(source, table)` function. */
Hooks.once(`${DAS_ID}.registerContent`, register => {
  // One table: the engine validates entry by entry and keeps the valid ones. On a DAS · Core that does not know the `sense`
  // key yet, the entries of SENSES are rejected (the engine logs them) and the spell rules are registered all the same.
  try { register(MODULE_ID, { ...SPELLS, ...SENSES }); }
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
});
