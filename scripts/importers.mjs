/**
 * Item importers this pack declares to DAS · Core's world diagnostic (`api.diagnostic.registerImporter`). The engine itself only
 * names DDB Importer; any other importer is declared from outside, by the flag its items carry.
 *
 * Items imported by Plutonium name their activities `dnd5eactivity000`… and their effects after the item, never with the ids of
 * the official item, so a DAS rule that cites the official ids finds nothing on them. Once declared, the diagnostic lists those
 * items and offers to replace each one with the official item (same id, sheet state and the importer's flags kept).
 */

import { MODULE_ID } from "./constants.mjs";

/** What is declared: the flag Plutonium writes on every item it imports (`flags.plutonium`). */
export const PLUTONIUM = Object.freeze({ id: "plutonium", flag: "plutonium", icon: "fa-solid fa-file-import" });

/**
 * Declares the importers. Does nothing, quietly, on a DAS · Core that has no `registerImporter` yet.
 * @param {object} api  DAS · Core's public API (`game.modules.get("dnd5e-combat").api`)
 * @returns {string|null}  The id of the diagnostic check, or null when nothing was declared.
 */
export function registerImporters(api) {
  const register = api?.diagnostic?.registerImporter;
  if ( typeof register !== "function" ) return null;
  try {
    return register({ ...PLUTONIUM, name: game.i18n.localize("DASRULEPACK.Importer.Plutonium.Name"),
      hint: game.i18n.localize("DASRULEPACK.Importer.Plutonium.Hint") });
  } catch(err) {
    console.error(`${MODULE_ID} | importer refused by DAS · Core:`, err);
    return null;
  }
}
