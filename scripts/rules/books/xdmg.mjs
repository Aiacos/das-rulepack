// Generated from registry/xdmg.json by npm run build:rules — do not edit.
import { book } from "../book.mjs";

export const BOOK = "XDMG";

export const RULES = book(BOOK, [
  {
    "identifier": "book-of-vile-darkness",
    "name": "Book of Vile Darkness",
    "page": 238,
    "kind": "item",
    "status": "played",
    "handledIn": "table",
    "adds": "A Fiend or an Undead is left unaffected by the book's speech.",
    "entry": {
      "targets": {
        "unaffectedIf": {
          "activity.id": "QCNkGQX4lTt0Dfi3",
          "target.creatureType": [
            "fiend",
            "undead"
          ]
        }
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "engineered against the official item only (Ruling R43)"
      }
    ]
  }
]);
