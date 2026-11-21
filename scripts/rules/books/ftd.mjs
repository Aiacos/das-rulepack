// Generated from registry/ftd.json by npm run build:rules — do not edit.
import { book } from "../book.mjs";

export const BOOK = "FTD";

export const RULES = book(BOOK, [
  // Raulothim's Psychic Lance (FTD p.21): the Incapacitated effect ends at the start of the caster's next turn.
  {
    "identifier": "raulothims-psychic-lance",
    "name": "Raulothim's Psychic Lance",
    "page": 21,
    "kind": "spell",
    "status": "played",
    "handledIn": "table",
    "adds": "Incapacitated ends at the start of the caster's next turn.",
    "entry": {
      "effectEnds": {
        "31jOzP6HwmGO6HHd": "casterTurnStart"
      }
    }
  }
]);
