/**
 * DAS · Rule Pack — rules for content that DAS · Core does not cover (Xanathar's, Tasha's and other books that have no
 * official Foundry module), registered through the engine's public content API.
 */

import { MODULE_ID, DAS_ID } from "./constants.mjs";
import { SPELLS } from "./rules/spells.mjs";
import { registerShadowBlade } from "./shadow-blade.mjs";

/** The engine calls this hook once, at setup, with its `register(source, table)` function. */
Hooks.once(`${DAS_ID}.registerContent`, register => {
  try { register(MODULE_ID, SPELLS); }
  catch(err) { console.error(`${MODULE_ID} | rules refused by DAS · Core:`, err); }
});

Hooks.once("ready", () => {
  const das = game.modules.get(DAS_ID);
  if ( !das?.active || (das.api?.active === false) ) {
    console.warn(`${MODULE_ID} | DAS · Core is not running: nothing to do.`);
    return;
  }
  registerShadowBlade();
});
