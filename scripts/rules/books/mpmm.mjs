// Generated from registry/mpmm.json by npm run build:rules — do not edit.
import { book } from "../book.mjs";

export const BOOK = "MPMM";

export const RULES = book(BOOK, [
  // Life Sense (Vampiric Mist, MPMM p.250; MTF p.246): declared as a sense that locates creatures within 60 ft,
  // two creature types excepted, and that walls do not stop. A natural sense: nothing wards against it.
  {
    "identifier": "life-sense",
    "name": "Life Sense",
    "page": 250,
    "kind": "sense",
    "status": "played",
    "handledIn": "table",
    "origin": "Vampiric Mist",
    "alsoIn": [
      {
        "book": "MTF",
        "page": 246
      }
    ],
    "catalog": null,
    "adds": "The location of every creature within 60 ft, Constructs and Undead excepted; walls do not stop it.",
    "entry": {
      "sense": {
        "kind": "locate",
        "range": 60,
        "units": "ft",
        "walls": false,
        "detects": {
          "not": {
            "target.creatureType": [
              "construct",
              "undead"
            ]
          }
        }
      }
    }
  }
]);
