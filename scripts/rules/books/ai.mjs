// Generated from registry/ai.json by npm run build:rules — do not edit.
import { book } from "../book.mjs";

export const BOOK = "AI";

export const RULES = book(BOOK, [
  // Incite Greed (AI p.76): the effect lets its bearer repeat the save at the end of each of its turns.
  {
    "identifier": "incite-greed",
    "name": "Incite Greed",
    "page": 76,
    "kind": "spell",
    "status": "validated",
    "handledIn": "table",
    "adds": "A charmed target repeats the save at the end of each of its turns.",
    "entry": {
      "triggers": [
        {
          "on": "endOfTurn",
          "via": "effect",
          "fromEffect": "4Hi47QCDFVz6m9gd",
          "do": [
            {
              "type": "resave"
            }
          ]
        }
      ]
    }
  }
]);
