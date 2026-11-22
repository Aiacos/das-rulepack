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
    "identifier": "xmm-colossus-stomp",
    "name": "Stomp",
    "page": 76,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Colossus",
    "adds": "Movement made right after this legendary action provokes no opportunity attacks.",
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
      "no-key": 1,
      "table-ruling": 1
    }
  },

  {
    "identifier": "xmm-demilich-grave-dust-flight",
    "name": "Grave-Dust Flight",
    "page": 96,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Demilich",
    "adds": "The blindness from the dust ends when the demilich's following turn ends.",
    "entry": {
      "effectEnds": {
        "j48yvRFstRgyvy4r": "casterTurnEnd"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "no-key": 2,
      "table-ruling": 1
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
      },
      "effectEnds": {
        "UZAP0ag2O4tJcbXw": "casterTurnStart"
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
      },
      "effectEnds": {
        "qSjE5JhBhGvLBnhx": "bearerTurnEnd"
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
    "identifier": "xmm-dretch-fetid-cloud",
    "name": "Fetid Cloud",
    "page": 103,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Dretch",
    "adds": "The poison ends when the target's following turn ends and limits what it can do meanwhile.",
    "entry": {
      "effectEnds": {
        "IqfKmepxiah2U3YT": "bearerTurnEnd"
      },
      "noReactions": [
        "IqfKmepxiah2U3YT"
      ],
      "actionOrBonus": [
        "IqfKmepxiah2U3YT"
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
    "identifier": "xmm-elemental-cataclysm-rumbling-movement",
    "name": "Rumbling Movement",
    "page": 111,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Elemental Cataclysm",
    "adds": "The movement of this action draws no opportunity attacks.",
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
      "no-key": 1,
      "table-ruling": 1
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
      "effectEnds": {
        "btTKbwtirBgzDUFw": "casterTurnStart"
      },
      "ignoresResistance": {
        "types": [
          "force"
        ],
        "from": [
          "EotF3wFKQQnsLEGX"
        ]
      }
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
    "identifier": "xmm-ghast-gravecaller-claw",
    "name": "Claw",
    "page": 130,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Ghast Gravecaller",
    "adds": "The paralysis from a hit wears off once the target finishes its following turn.",
    "entry": {
      "effectEnds": {
        "lXZJe5XL9sFFSkX0": "bearerTurnEnd"
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
    "identifier": "xmm-giant-ape-boulder-toss",
    "name": "Boulder Toss",
    "page": 354,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Giant Ape",
    "adds": "Creatures that fail the save are knocked prone; a success halves the damage.",
    "entry": {
      "saveDamage": {
        "jpC3fk7LJlhH4CDr": "half"
      },
      "triggers": [
        {
          "on": "failedSave",
          "do": [
            {
              "type": "status",
              "status": "prone"
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
    "identifier": "xmm-githyanki-dracomancer-draconic-strike",
    "name": "Draconic Strike",
    "page": 135,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Githyanki Dracomancer",
    "adds": "A hit leaves the target frightened, not prone, until the attacker starts its following turn.",
    "entry": {
      "effectStatuses": {
        "3EaKpE9izXLyKuZ0": {
          "set": [
            "frightened"
          ]
        }
      },
      "effectEnds": {
        "3EaKpE9izXLyKuZ0": "casterTurnStart"
      }
    },
    "partial": {
      "no-key": 1
    }
  },

  {
    "identifier": "xmm-goristro-brutal-gore",
    "name": "Brutal Gore",
    "page": 150,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Goristro",
    "adds": "A hit also shoves the target 20 feet away from the demon.",
    "entry": {
      "triggers": [
        {
          "on": "hit",
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
    "identifier": "xmm-kuo-toa-sticky-net",
    "name": "Sticky Net",
    "page": 189,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Kuo-toa",
    "adds": "A failed save leaves the target restrained.",
    "entry": {
      "triggers": [
        {
          "on": "failedSave",
          "do": [
            {
              "type": "status",
              "status": "restrained"
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
      "no-key": 2,
      "target-size": 1
    }
  },

  {
    "identifier": "xmm-lacedon-ghoul-watery-rush",
    "name": "Watery Rush",
    "page": 132,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Lacedon Ghoul",
    "adds": "Movement after this bonus action provokes no opportunity attacks.",
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
      "no-key": 1,
      "table-ruling": 1
    }
  },

  {
    "identifier": "xmm-lich-paralyzing-touch",
    "name": "Paralyzing Touch",
    "page": 196,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Lich",
    "adds": "The paralysis placed by a hit ends when the lich begins its following turn.",
    "entry": {
      "effectEnds": {
        "XONucKj1fLr03vaU": "casterTurnStart"
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
    "identifier": "xmm-manes-vaporspawn-sickening-vapors",
    "name": "Sickening Vapors",
    "page": 201,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Manes Vaporspawn",
    "adds": "The incapacitation placed on a failed save lasts until the target finishes its following turn.",
    "entry": {
      "effectEnds": {
        "u5JuLiyDDXSESWDU": "bearerTurnEnd"
      }
    },
    "partial": {
      "immunity-after-save": 1,
      "table-ruling": 1
    }
  },

  {
    "identifier": "xmm-marid-water-jet",
    "name": "Water Jet",
    "page": 203,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Marid",
    "adds": "A failed save also pushes the target 20 feet away; a success halves the damage.",
    "entry": {
      "saveDamage": {
        "CY2HqHThU06Jf0Bw": "half"
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
    "identifier": "xmm-merfolk-wavebender-aquatic-burst",
    "name": "Aquatic Burst",
    "page": 209,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Merfolk Wavebender",
    "adds": "A hit also knocks the target prone.",
    "entry": {
      "triggers": [
        {
          "on": "hit",
          "do": [
            {
              "type": "status",
              "status": "prone"
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
    "identifier": "xmm-merfolk-wavebender-watery-rebuke",
    "name": "Watery Rebuke",
    "page": 209,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Merfolk Wavebender",
    "adds": "A failed save also pushes the target 30 feet away; a success deals nothing.",
    "entry": {
      "saveDamage": {
        "nCfH0YgOhJR2wIKd": "none"
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
    "partial": {
      "table-ruling": 1,
      "target-size": 1
    }
  },

  {
    "identifier": "xmm-merrow-harpoon",
    "name": "Harpoon",
    "page": 210,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Merrow",
    "adds": "A hit also drags the target 15 feet toward the merrow.",
    "entry": {
      "triggers": [
        {
          "on": "hit",
          "do": [
            {
              "type": "move",
              "mode": "pull",
              "distance": 15,
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
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ]
  },

  {
    "identifier": "xmm-shambling-mound-charged-tendril",
    "name": "Charged Tendril",
    "page": 276,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Shambling Mound",
    "adds": "A hit also pulls the target 5 feet toward the mound.",
    "entry": {
      "triggers": [
        {
          "on": "hit",
          "do": [
            {
              "type": "move",
              "mode": "pull",
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
    ],
    "partial": {
      "target-size": 1
    }
  },

  {
    "identifier": "xmm-smoke-mephit-cinder-breath",
    "name": "Cinder Breath",
    "page": 208,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Smoke Mephit",
    "adds": "The blindness ends when the mephit's next turn ends.",
    "entry": {
      "effectEnds": {
        "wVVRsyKnbu3CTPWd": "casterTurnEnd"
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
    "identifier": "xmm-spectator-spell-reflection",
    "name": "Spell Reflection",
    "page": 289,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Spectator",
    "adds": "A successful save avoids the force damage entirely.",
    "entry": {
      "saveDamage": {
        "ZYmB6aUHCqkMh0Ji": "none"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "table-ruling": 1
    }
  },

  {
    "identifier": "xmm-swarm-of-ravens-cacophony",
    "name": "Cacophony",
    "page": 371,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Swarm of Ravens",
    "adds": "The deafness ends as the swarm's next turn begins.",
    "entry": {
      "effectEnds": {
        "5cNk7YVIesN5RiIh": "casterTurnStart"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ],
    "partial": {
      "no-key": 2
    }
  },

  {
    "identifier": "xmm-tough-boss-warhammer",
    "name": "Warhammer",
    "page": 307,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Tough Boss",
    "adds": "A hit also shoves the target 10 feet away from the attacker.",
    "entry": {
      "triggers": [
        {
          "on": "hit",
          "do": [
            {
              "type": "move",
              "mode": "push",
              "distance": 10,
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
    "identifier": "xmm-tree-blight-grasping-root",
    "name": "Grasping Root",
    "page": 44,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Tree Blight",
    "adds": "A failed save also drags the target 10 feet toward the blight.",
    "entry": {
      "triggers": [
        {
          "on": "failedSave",
          "do": [
            {
              "type": "move",
              "mode": "pull",
              "distance": 10,
              "units": "ft"
            }
          ]
        }
      ]
    },
    "partial": {
      "target-size": 1,
      "target-state": 1
    }
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
      },
      "effectEnds": {
        "Od5yoiaacvQYBJId": "casterTurnStart"
      }
    },
    "partial": {
      "immunity-after-save": 1
    }
  },

  {
    "identifier": "xmm-unicorn-charging-horn",
    "name": "Charging Horn",
    "page": 313,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Unicorn",
    "adds": "Its movement after this legendary action provokes no opportunity attacks.",
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
      "table-ruling": 1
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
      },
      "effectEnds": {
        "umiIngrevg817HO5": "casterTurnStart"
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
    "identifier": "xmm-warrior-commander-tactical-charge",
    "name": "Tactical Charge",
    "page": 321,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Warrior Commander",
    "adds": "After using it, the warrior's movement draws no opportunity attacks.",
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
      "table-ruling": 1
    }
  },

  {
    "identifier": "xmm-weretiger-prowl-tiger-or-hybrid-form-only",
    "name": "Prowl (Tiger or Hybrid Form Only)",
    "page": 326,
    "kind": "monster",
    "status": "validated",
    "handledIn": "table",
    "origin": "Weretiger",
    "adds": "After using it, the weretiger's movement draws no opportunity attacks.",
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
      "table-ruling": 1
    }
  }
]);
