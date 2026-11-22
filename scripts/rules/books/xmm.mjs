// Generated from registry/xmm.json by npm run build:rules — do not edit.
import { book } from "../book.mjs";

export const BOOK = "XMM";

export const RULES = book(BOOK, [
  {
    "identifier": "xmm-aboleth-mucus-cloud",
    "name": "Mucus Cloud",
    "page": 12,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Aboleth",
    "adds": "Creatures next to the aboleth save against the curse when its turn ends.",
    "entry": {
      "emanation": {
        "on": "ownTurnEnd",
        "activity": "clFFG8uDBSFzxIo8"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "healing-block": 1,
      "out-of-combat": 2,
      "trigger-filter": 1
    }
  },

  {
    "identifier": "xmm-adult-brass-dragon-scorching-sands",
    "name": "Scorching Sands",
    "page": 55,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Adult Brass Dragon",
    "adds": "The halved speed on a failed save ends at the end of the target's next turn.",
    "entry": {
      "effectEnds": {
        "n3I76HfSH6eKLALf": "bearerTurnEnd"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "use-limit": 1
    }
  },

  {
    "identifier": "xmm-adult-copper-dragon-slowing-breath",
    "name": "Slowing Breath",
    "page": 79,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Adult Copper Dragon",
    "adds": "The slowing effect on a failed save ends at the end of the target's next turn.",
    "entry": {
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
    "identifier": "xmm-air-elemental-whirlwind",
    "name": "Whirlwind",
    "page": 13,
    "kind": "monster",
    "status": "played",
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
    "identifier": "xmm-ancient-copper-dragon-slowing-breath",
    "name": "Slowing Breath",
    "page": 80,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Ancient Copper Dragon",
    "adds": "The slowing effect from the breath lasts until the affected creature finishes its next turn.",
    "entry": {
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
    "identifier": "xmm-chain-devil-unnerving-gaze",
    "name": "Unnerving Gaze",
    "page": 68,
    "kind": "monster",
    "status": "played",
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
    "status": "played",
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
    "identifier": "xmm-death-cultist-dread-scythe",
    "name": "Dread Scythe",
    "page": 86,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Death Cultist",
    "adds": "The healing block on the struck creature lapses when its next turn ends.",
    "entry": {
      "effectEnds": {
        "rWqB3N3piOf9afmQ": "bearerTurnEnd"
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
    "identifier": "xmm-death-slaad-chaos-blade",
    "name": "Chaos Blade",
    "page": 287,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Death Slaad",
    "adds": "Whichever rolled condition lands ends as the slaad's next turn starts.",
    "entry": {
      "effectEnds": {
        "1vrQDUhLrUP4jRKw": "casterTurnStart",
        "Nx6syaxPX3i62Lja": "casterTurnStart",
        "ccUmT0yvSuG8yECl": "casterTurnStart",
        "Cqw097SSxXrnYYKh": "casterTurnStart"
      }
    }
  },

  {
    "identifier": "xmm-dire-worg-dreadful-howl",
    "name": "Dreadful Howl",
    "page": 335,
    "kind": "monster",
    "status": "played",
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
    "status": "played",
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
    "identifier": "xmm-ettin-morningstar",
    "name": "Morningstar",
    "page": 116,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Ettin",
    "adds": "The marker placed by a hit expires when the target's following turn ends.",
    "entry": {
      "effectEnds": {
        "1SUTrOeGym7HuWxB": "bearerTurnEnd"
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
      "use-limit": 1
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
    "identifier": "xmm-frost-giant-war-cry",
    "name": "War Cry",
    "page": 124,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Frost Giant",
    "adds": "The war cry's effect on its recipient ends when the giant's next turn begins.",
    "entry": {
      "effectEnds": {
        "qNmREVJzIbrjEJyb": "casterTurnStart"
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
    "identifier": "xmm-gnoll-demoniac-hunger-of-yeenoghu",
    "name": "Hunger of Yeenoghu",
    "page": 141,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Gnoll Demoniac",
    "adds": "A creature entering the dark cube or starting its turn there saves again; the cube is difficult terrain.",
    "entry": {
      "difficultTerrain": {
        "cost": 2
      },
      "triggers": [
        {
          "on": [
            "enter",
            "turnStart"
          ],
          "do": [
            {
              "type": "replay"
            }
          ]
        }
      ]
    },
    "carries": {
      "from": "hunger-of-yeenoghu",
      "keys": [
        "magical"
      ]
    },
    "partial": {
      "no-key": 2
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
    "identifier": "xmm-gray-slaad-chaos-claw",
    "name": "Chaos Claw",
    "page": 286,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Gray Slaad",
    "adds": "Whichever condition the hit leaves fades when the slaad begins its next turn.",
    "entry": {
      "effectEnds": {
        "Ev7mKTcyL79IvYBB": "casterTurnStart",
        "GG2jzWkmTiuYWWe3": "casterTurnStart",
        "HH52pF3Z9b4C4iZI": "casterTurnStart",
        "W0SCayTqq4bANpBF": "casterTurnStart"
      }
    },
    "partial": {
      "no-key": 1
    }
  },

  {
    "identifier": "xmm-green-slaad-chaos-staff",
    "name": "Chaos Staff",
    "page": 286,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Green Slaad",
    "adds": "Whichever condition the hit leaves fades when the slaad begins its next turn.",
    "entry": {
      "effectEnds": {
        "9CkIM0lfUxFcSVdQ": "casterTurnStart",
        "DUCZE6k2kWwLpGrC": "casterTurnStart",
        "RwBlO4hYb5kHF0mi": "casterTurnStart",
        "XvK15FUAxn9Piwpm": "casterTurnStart"
      }
    },
    "partial": {
      "no-key": 1
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
    "status": "played",
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
    "identifier": "xmm-lacedon-ghoul-icy-bite",
    "name": "Icy Bite",
    "page": 132,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Lacedon Ghoul",
    "adds": "The slowing effect ends when the user's next turn begins.",
    "entry": {
      "effectEnds": {
        "kCxRhmskJImIaVxj": "casterTurnStart"
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
    "identifier": "xmm-poltergeist-telekinetic-thrust",
    "name": "Telekinetic Thrust",
    "page": 246,
    "kind": "monster",
    "status": "played",
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
    "identifier": "xmm-sprite-heart-sight",
    "name": "Heart Sight",
    "page": 298,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Sprite",
    "adds": "Celestial, fiend and undead targets fail the save outright.",
    "entry": {
      "saveAutoFail": {
        "types": [
          "celestial",
          "fiend",
          "undead"
        ]
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "out-of-combat": 1
    }
  },

  {
    "identifier": "xmm-ultroloth-hypnotic-gaze",
    "name": "Hypnotic Gaze",
    "page": 311,
    "kind": "monster",
    "status": "played",
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
    "status": "played",
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
