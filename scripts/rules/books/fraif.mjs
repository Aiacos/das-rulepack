// Generated from registry/fraif.json by npm run build:rules — do not edit.
import { book } from "../book.mjs";

export const BOOK = "FRAIF";

export const RULES = book(BOOK, [
  {
    "identifier": "ulcrun",
    "name": "Ulcrun",
    "page": 237,
    "kind": "item",
    "status": "validated",
    "handledIn": "table",
    "adds": "A successful save deals no damage at all.",
    "entry": {
      "saveDamage": {
        "V2WWlJdFgdzFVzIg": "none",
        "saveUlcrunIIIIII": "none"
      }
    },
    "partial": {
      "no-key": 1
    }
  }
]);
