// Generated from registry/efa.json by npm run build:rules — do not edit.
import { book } from "../book.mjs";

export const BOOK = "EFA";

export const RULES = book(BOOK, [
  {
    "identifier": "boots-of-the-winding-path",
    "name": "Boots of the Winding Path",
    "page": 112,
    "kind": "item",
    "status": "played",
    "handledIn": "table",
    "adds": "Using the boots lets the wearer pick a destination at once and teleports them there, up to 15 feet away.",
    "entry": {
      "teleport": {
        "distance": 15,
        "units": "ft"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "engineered against the official item only (Ruling R43)"
      }
    ]
  },

  {
    "identifier": "construct-resilience",
    "name": "Construct Resilience",
    "page": 38,
    "kind": "species",
    "status": "played",
    "handledIn": "table",
    "origin": "Warforged",
    "adds": "The bearer rolls with Advantage a saving throw against anything that would give the Poisoned condition.",
    "entry": {
      "saveAdvantage": [
        "poisoned"
      ]
    }
  }
]);
