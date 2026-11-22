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
    "adds": "On a failed save the target is also shoved 20 feet away; the size limit on targets is left to the GM.",
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
    "adds": "On a failed save the target loses reactions, gets only an action or a bonus action, until the end of its next turn.",
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
    "adds": "Movement made with this legendary action provokes no opportunity attacks; the attack is a separate roll.",
    "entry": {
      "noOpportunity": "afterUse"
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
    "adds": "A hit also drags the target 25 feet toward the balor; the size limit is left to the GM.",
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
        "because": "triggers holds one origin; this item has its own attack"
      }
    ]
  },

  {
    "identifier": "xmm-balor-death-throes",
    "name": "Death Throes",
    "page": 26,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Balor",
    "adds": "A successful save halves the explosion damage; the table triggers it when the balor dies.",
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
    ]
  },

  {
    "identifier": "xmm-banshee-horrify",
    "name": "Horrify",
    "page": 29,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Banshee",
    "adds": "Fear on a failed save ends when the banshee's next turn starts.",
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
    ]
  },

  {
    "identifier": "xmm-bearded-devil-beard",
    "name": "Beard",
    "page": 33,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Bearded Devil",
    "adds": "The poison from a hit ends when the devil's next turn starts.",
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
    ]
  },

  {
    "identifier": "xmm-bone-devil-infernal-sting",
    "name": "Infernal Sting",
    "page": 52,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Bone Devil",
    "adds": "The poison from a hit ends when the devil's next turn starts.",
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
    ]
  },

  {
    "identifier": "xmm-bulette-deadly-leap",
    "name": "Deadly Leap",
    "page": 63,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Bulette",
    "adds": "A successful save halves the damage and pushes the target 5 feet away.",
    "entry": {
      "saveDamage": {
        "IPCXEQoTuaAG5l52": "half"
      },
      "triggers": [
        {
          "on": "savedSave",
          "do": [
            {
              "type": "move",
              "mode": "push",
              "distance": 5,
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
    ]
  },

  {
    "identifier": "xmm-centaur-trooper-trampling-charge",
    "name": "Trampling Charge",
    "page": 67,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Centaur Trooper",
    "adds": "The charge move provokes no opportunity attacks.",
    "entry": {
      "noOpportunity": "afterUse"
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ]
  },

  {
    "identifier": "xmm-centaur-warden-entangling-trail",
    "name": "Entangling Trail",
    "page": 67,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Centaur Warden",
    "adds": "The move provokes no opportunity attacks; restraint ends at the end of the target's next turn.",
    "entry": {
      "noOpportunity": "afterUse",
      "effectEnds": {
        "xbTNeTDl4xlD6WEJ": "bearerTurnEnd"
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
    "identifier": "xmm-chain-devil-unnerving-gaze",
    "name": "Unnerving Gaze",
    "page": 68,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Chain Devil",
    "adds": "Fear from a failed save ends at the end of the target's own turn.",
    "entry": {
      "effectEnds": {
        "BheOE4RU2wcG94yl": "bearerTurnEnd"
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
    "identifier": "xmm-chasme-drone",
    "name": "Drone",
    "page": 69,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Chasme",
    "adds": "The sleeper rolls a fresh save whenever one of its turns ends; the sleep lasts ten minutes at most.",
    "entry": {
      "triggers": [
        {
          "on": "endOfTurn",
          "via": "effect",
          "fromEffect": "f04Z8zNXMjMn7x6U",
          "do": [
            {
              "type": "resave"
            }
          ]
        }
      ],
      "effectDurations": {
        "f04Z8zNXMjMn7x6U": {
          "seconds": 600
        }
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
    "identifier": "xmm-cloaker-moan",
    "name": "Moan",
    "page": 73,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Cloaker",
    "adds": "The fear from a failed save ends when the cloaker's next turn ends.",
    "entry": {
      "effectEnds": {
        "ozk8flGDR2kAITEI": "casterTurnEnd"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ]
  }
]);
