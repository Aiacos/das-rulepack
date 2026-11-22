// Generated from registry/xmm.json by npm run build:rules — do not edit.
import { book } from "../book.mjs";

export const BOOK = "XMM";

export const RULES = book(BOOK, [
  {
    "identifier": "xmm-air-elemental-whirlwind",
    "name": "Whirlwind",
    "page": 13,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Air Elemental",
    "adds": "A failed save also shoves the target 20 feet away from the elemental; a success halves the damage.",
    "entry": {
      "saveDamage": {
        "GQzr4EMMm6kkZVdC": "half"
      },
      "triggers": [
        {
          "on": "failedSave",
          "do": [
            {
              "type": "move",
              "mode": "push",
              "distance": 20,
              "units": "ft"
            }
          ]
        }
      ]
    },
    "partial": {
      "target-size": 1
    }
  },

  {
    "identifier": "xmm-ancient-copper-dragon-slowing-breath",
    "name": "Slowing Breath",
    "page": 80,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Ancient Copper Dragon",
    "adds": "Failing creatures lose reactions and get only an action or a bonus action, through the end of their next turn.",
    "entry": {
      "noReactions": [
        "ztGUDHGfoUxlUY53"
      ],
      "actionOrBonus": [
        "ztGUDHGfoUxlUY53"
      ],
      "effectEnds": {
        "ztGUDHGfoUxlUY53": "bearerTurnEnd"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ]
  },

  {
    "identifier": "xmm-animal-lord-feral-strike",
    "name": "Feral Strike",
    "page": 15,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Animal Lord",
    "adds": "After this legendary action the lord's movement provokes no opportunity attacks.",
    "entry": {
      "noOpportunity": "afterUse"
    },
    "partial": {
      "no-key": 1
    }
  },

  {
    "identifier": "xmm-balor-flame-whip",
    "name": "Flame Whip",
    "page": 26,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Balor",
    "adds": "A hit drags the target 25 feet toward the balor.",
    "entry": {
      "triggers": [
        {
          "on": "hit",
          "do": [
            {
              "type": "move",
              "mode": "pull",
              "distance": 25,
              "units": "ft"
            }
          ]
        }
      ]
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "target-size": 1
    }
  },

  {
    "identifier": "xmm-balor-death-throes",
    "name": "Death Throes",
    "page": 26,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Balor",
    "adds": "A successful save against the explosion halves its damage.",
    "entry": {
      "saveDamage": {
        "jTq2czA8KQITUK4c": "half"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "no-key": 1,
      "table-ruling": 1
    }
  },

  {
    "identifier": "xmm-banshee-horrify",
    "name": "Horrify",
    "page": 29,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Banshee",
    "adds": "The fear ends as the banshee starts its following turn.",
    "entry": {
      "effectEnds": {
        "rttbSuOfCKb1TjGs": "casterTurnStart"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "immunity-after-save": 1,
      "table-ruling": 1
    }
  },

  {
    "identifier": "xmm-bearded-devil-beard",
    "name": "Beard",
    "page": 33,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Bearded Devil",
    "adds": "The poison wears off as the devil begins its following turn.",
    "entry": {
      "effectEnds": {
        "dnpr0RaXDWfSZOYz": "casterTurnStart"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "healing-block": 1
    }
  },

  {
    "identifier": "xmm-bone-devil-infernal-sting",
    "name": "Infernal Sting",
    "page": 52,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Bone Devil",
    "adds": "The poison wears off as the devil begins its following turn.",
    "entry": {
      "effectEnds": {
        "96f41YwmHtjW8P0o": "casterTurnStart"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "healing-block": 1
    }
  }
]);
