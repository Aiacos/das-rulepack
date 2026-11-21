// Generated from registry/mpmm.json by npm run build:rules — do not edit.
/**
 * Mordenkainen Presents: Monsters of the Multiverse (2022).
 *
 * Senses are declared with the engine's generic `sense` block (DAS · Core, `module/scripts/core/senses.mjs`), keyed by the dnd5e
 * identifier the imported items carry. They were first proposed to DAS · Core (dnd5e-combat pull request 128) and belong here:
 * the engine's public repositories carry nothing from non-SRD books.
 *
 * They need a DAS · Core that knows the `sense` key (pull requests 119 and 122 of dnd5e-combat, not in a release at the time
 * of writing). On an older engine these entries are rejected one by one when the pack registers (the engine logs them); the
 * other rules are registered all the same.
 */
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
