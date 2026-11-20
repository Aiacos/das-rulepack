/**
 * Fizban's Treasury of Dragons (2021).
 *
 * The effect ids are those of the items imported by DDB Importer; an item from another source keeps the general rules of the
 * engine, and the parts of a rule that name an id do nothing on it.
 */
import { book } from "../book.mjs";

export const BOOK = "FTD";

export const RULES = book(BOOK, [
  {
    identifier: "raulothims-psychic-lance", name: "Raulothim's Psychic Lance", page: 21, kind: "spell", status: "played",
    handledIn: "table",
    adds: "Incapacitated ends at the start of the caster's next turn.",
    // Raulothim's Psychic Lance (FTD p.21): on a failed save the target is Incapacitated "until the start of your next turn".
    entry: { effectEnds: { "31jOzP6HwmGO6HHd": "casterTurnStart" } }
  }
]);
