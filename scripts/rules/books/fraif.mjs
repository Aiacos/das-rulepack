// Generated from registry/fraif.json by npm run build:rules — do not edit.
import { book } from "../book.mjs";

export const BOOK = "FRAIF";

export const RULES = book(BOOK, [
  {
    "identifier": "calimemnon-crystal",
    "name": "Calimemnon Crystal",
    "page": 243,
    "kind": "item",
    "status": "validated",
    "handledIn": "table",
    "adds": "The cold aura stays around the wearer and hits creatures that come in or finish a turn inside; the damage ray deals radiant.",
    "entry": {
      "triggers": [
        {
          "on": [
            "enter",
            "turnEnd"
          ],
          "do": [
            {
              "type": "replay",
              "activity": "aZZx8YQP6EC1klxs"
            }
          ]
        }
      ],
      "zoneLasts": {
        "seconds": 86400
      },
      "dataFixes": [
        {
          "path": "system.activities.OY9mLl8DZNh6Ij4t.damage.parts",
          "from": [
            {
              "number": 6,
              "denomination": 6,
              "types": []
            }
          ],
          "value": [
            {
              "number": 6,
              "denomination": 6,
              "bonus": 6,
              "types": [
                "radiant"
              ]
            }
          ]
        }
      ]
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "its aura is a utility activity with a separate damage activity; triggers and fixes bind the official ids only"
      }
    ],
    "partial": {
      "no-key": 2,
      "use-time-choice": 1
    }
  },

  {
    "identifier": "deathdance",
    "name": "Deathdance",
    "page": 237,
    "kind": "item",
    "status": "validated",
    "handledIn": "table",
    "adds": "Humanoid targets succeed on the Constitution save automatically.",
    "entry": {
      "saveAutoSuccess": {
        "types": [
          "humanoid"
        ]
      }
    }
  },

  {
    "identifier": "orb-of-damara",
    "name": "Orb of Damara",
    "page": 246,
    "kind": "item",
    "status": "validated",
    "handledIn": "table",
    "adds": "Foes beginning their turn near the bearer roll the fear save; frightened lasts until that foe's next turn begins.",
    "entry": {
      "emanation": {
        "on": "turnStart",
        "affects": "enemy",
        "activity": "pTSCNVUBXIShRBJN"
      },
      "effectEnds": {
        "PnUtkV81LSyPXFcW": "bearerTurnStart"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "emanation holds a single activity id; the importer item splits the aura into its own utility and save activities"
      }
    ],
    "partial": {
      "form-change": 1,
      "immunity-after-save": 1,
      "no-key": 2,
      "out-of-combat": 1,
      "table-ruling": 1,
      "use-time-choice": 1
    }
  },

  {
    "identifier": "ulcrun",
    "name": "Ulcrun",
    "page": 237,
    "kind": "item",
    "status": "played",
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
