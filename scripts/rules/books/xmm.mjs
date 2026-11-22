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
      }
    },
    "partial": {
      "target-size": 1
    }
  },

  {
    "identifier": "xmm-chain-devil-unnerving-gaze",
    "name": "Unnerving Gaze",
    "page": 68,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Chain Devil",
    "adds": "The fear ends at the end of the turn it was imposed in.",
    "entry": {
      "effectEnds": {
        "BheOE4RU2wcG94yl": "currentTurnEnd"
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
    "identifier": "xmm-clay-golem-hasten",
    "name": "Hasten",
    "page": 72,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Clay Golem",
    "adds": "After using it, the golem's movement provokes no opportunity attacks.",
    "entry": {
      "noOpportunity": "afterUse"
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "no-key": 1
    }
  },

  {
    "identifier": "xmm-dire-worg-dreadful-howl",
    "name": "Dreadful Howl",
    "page": 335,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Dire Worg",
    "adds": "The fear ends when the worg's following turn begins; a save halves the damage.",
    "entry": {
      "saveDamage": {
        "xToMbcg9i9oSf06f": "half"
      }
    },
    "partial": {
      "no-key": 1
    }
  },

  {
    "identifier": "xmm-dracolich-terrifying-presence",
    "name": "Terrifying Presence",
    "page": 102,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Dracolich",
    "adds": "The fear ends when the target's following turn ends; a save avoids the damage.",
    "entry": {
      "saveDamage": {
        "SVb8yS9ewkeZpP2R": "none"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "no-key": 1
    }
  },

  {
    "identifier": "xmm-empyrean-sacred-weapon",
    "name": "Sacred Weapon",
    "page": 113,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Empyrean",
    "adds": "The stun ends when the user's next turn begins; the extra damage ignores resistance.",
    "entry": {
      "ignoresResistance": {
        "types": [
          "force"
        ],
        "from": [
          "EotF3wFKQQnsLEGX"
        ]
      }
    },
    "carries": {
      "from": "sacred-weapon",
      "keys": [
        "usageLimits"
      ]
    },
    "partial": {
      "no-key": 1,
      "table-ruling": 1
    }
  },

  {
    "identifier": "xmm-flumph-stench-spray",
    "name": "Stench Spray",
    "page": 122,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Flumph",
    "adds": "The poison from a failed save lasts 1d4 hours.",
    "entry": {
      "effectDurations": {
        "1eZ97wSzxu4Txtw4": {
          "formula": "1d4",
          "units": "hours"
        }
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
      "out-of-combat": 1
    }
  },

  {
    "identifier": "xmm-graveyard-revenant-suffocate",
    "name": "Suffocate",
    "page": 260,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Graveyard Revenant",
    "adds": "The held creature can end the grip, and the choking with it, by winning a check as an action.",
    "entry": {
      "actionEnds": {
        "KwKb78SLVT0vSVHZ": {
          "by": "bearer",
          "roll": "check"
        }
      }
    },
    "partial": {
      "table-ruling": 1,
      "target-size": 1
    }
  },

  {
    "identifier": "xmm-jackalwere-sleep-gaze",
    "name": "Sleep Gaze",
    "page": 182,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Jackalwere",
    "adds": "Another creature can spend an action to wake the sleeper; the sleep lasts ten minutes.",
    "entry": {
      "actionEnds": {
        "LWfoFnHRORd9HZsh": {
          "by": "other",
          "verb": "wake"
        }
      },
      "effectDurations": {
        "LWfoFnHRORd9HZsh": {
          "seconds": 600
        }
      }
    },
    "partial": {
      "immunity-after-save": 1,
      "no-key": 2
    }
  },

  {
    "identifier": "xmm-kraken-toxic-ink",
    "name": "Toxic Ink",
    "page": 187,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Kraken",
    "adds": "The blinding and poisoning end when the kraken's next turn ends.",
    "entry": {
      "effectEnds": {
        "6eeusiffMtDU3C3c": "casterTurnEnd"
      }
    },
    "partial": {
      "no-key": 2,
      "table-ruling": 1
    }
  },

  {
    "identifier": "xmm-poltergeist-telekinetic-thrust",
    "name": "Telekinetic Thrust",
    "page": 246,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Poltergeist",
    "adds": "A failed save also shoves the target 30 feet away from the user.",
    "entry": {
      "saveDamage": {
        "qHeMp7n2VPHtGbDS": "none"
      },
      "triggers": [
        {
          "on": "failedSave",
          "do": [
            {
              "type": "move",
              "mode": "push",
              "distance": 30,
              "units": "ft"
            }
          ]
        }
      ]
    },
    "carries": {
      "from": "telekinetic-thrust",
      "keys": [
        "magical"
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
    "identifier": "xmm-ultroloth-hypnotic-gaze",
    "name": "Hypnotic Gaze",
    "page": 311,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Ultroloth",
    "adds": "The stun lasts until the ultroloth begins its next turn; a successful save takes no damage.",
    "entry": {
      "saveDamage": {
        "Sc5RbdImboeEd4zt": "none"
      }
    },
    "partial": {
      "immunity-after-save": 1
    }
  },

  {
    "identifier": "xmm-violet-fungus-necrohulk-spore-bomb",
    "name": "Spore Bomb",
    "page": 126,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Violet Fungus Necrohulk",
    "adds": "Half damage on a save; the poison lasts until the necrohulk begins its next turn.",
    "entry": {
      "saveDamage": {
        "cmFbJQhqZiLBF9Ij": "half"
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
