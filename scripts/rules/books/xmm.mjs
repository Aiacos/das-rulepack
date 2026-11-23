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
    "identifier": "xmm-adult-gold-dragon-banish",
    "name": "Banish",
    "page": 145,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Adult Gold Dragon",
    "adds": "A creature that fails the save is taken off the battlefield until the dragon's next turn starts, then comes back.",
    "entry": {
      "banishes": [
        "u5H85me3idut0t3u"
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
    "identifier": "xmm-adult-white-dragon-freezing-burst",
    "name": "Freezing Burst",
    "page": 329,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Adult White Dragon",
    "adds": "A creature that fails stays unable to move through its own following turn, not only up to that turn's start.",
    "entry": {
      "effectEnds": {
        "K6EbT8HrfSUSJW2F": "bearerTurnEnd"
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
    "identifier": "xmm-ancient-brass-dragon-scorching-sands",
    "name": "Scorching Sands",
    "page": 56,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Ancient Brass Dragon",
    "adds": "The halved Speed lasts until the end of the target's next turn.",
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
    ]
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
    "identifier": "xmm-ancient-gold-dragon-banish",
    "name": "Banish",
    "page": 146,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Ancient Gold Dragon",
    "adds": "A creature that fails the save is taken off the battlefield until the dragon's next turn starts, then comes back.",
    "entry": {
      "banishes": [
        "u5H85me3idut0t3u"
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
    "identifier": "xmm-black-pudding-dissolving-pseudopod",
    "name": "Dissolving Pseudopod",
    "page": 42,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Black Pudding",
    "adds": "The armor penalty is placed only on a target that wears armor.",
    "entry": {
      "effectsIf": {
        "target.wearsArmor": true
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
    "identifier": "xmm-bugbear-stalker-abduct",
    "name": "Abduct",
    "page": 62,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Bugbear Stalker",
    "adds": "The creature moves a creature it is grappling, whatever its size, at no extra cost of movement.",
    "entry": {
      "grappleSize": {
        "dragFree": 5
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
    "identifier": "xmm-bugbear-warrior-abduct",
    "name": "Abduct",
    "page": 62,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Bugbear Warrior",
    "adds": "The creature moves a creature it is grappling, whatever its size, at no extra cost of movement.",
    "entry": {
      "grappleSize": {
        "dragFree": 5
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
    "identifier": "xmm-bulette-pup-leap",
    "name": "Leap",
    "page": 63,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Bulette Pup",
    "adds": "Once on each of its turns the creature may jump up to 30 feet for 10 feet of movement, whatever its Strength.",
    "entry": {
      "jump": {
        "fixed": {
          "distance": 30,
          "cost": 10
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
    "identifier": "xmm-bulette-leap",
    "name": "Leap",
    "page": 63,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Bulette",
    "adds": "Once on each of its turns the creature may jump up to 30 feet for 10 feet of movement, whatever its Strength.",
    "entry": {
      "jump": {
        "fixed": {
          "distance": 30,
          "cost": 10
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
    "identifier": "xmm-bullywug-bog-sage-leap",
    "name": "Leap",
    "page": 64,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Bullywug Bog Sage",
    "adds": "Once on each of its turns the creature may jump up to 30 feet for 10 feet of movement, whatever its Strength.",
    "entry": {
      "jump": {
        "fixed": {
          "distance": 30,
          "cost": 10
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
    "identifier": "xmm-bullywug-warrior-leap",
    "name": "Leap",
    "page": 64,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Bullywug Warrior",
    "adds": "Once on each of its turns the creature may jump up to 30 feet for 10 feet of movement, whatever its Strength.",
    "entry": {
      "jump": {
        "fixed": {
          "distance": 30,
          "cost": 10
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
    "identifier": "xmm-copper-dragon-wyrmling-slowing-breath",
    "name": "Slowing Breath",
    "page": 78,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Copper Dragon Wyrmling",
    "adds": "The breath's effect lasts until the end of the target's next turn.",
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
    "identifier": "xmm-couatl-constrict",
    "name": "Constrict",
    "page": 82,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Couatl",
    "adds": "A creature larger than Medium is left unaffected by the constriction: no save, no damage, no grapple.",
    "entry": {
      "targets": {
        "unaffectedIf": {
          "not": {
            "target.sizeAtMost": "med"
          }
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
    "identifier": "xmm-darkmantle-darkness-aura",
    "name": "Darkness Aura",
    "page": 90,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Darkmantle",
    "adds": "The aura's zone carries magical darkness of its own radius, which goes when the zone goes.",
    "entry": {
      "light": {
        "on": "area",
        "darkness": true
      }
    },
    "carries": {
      "from": "darkness-aura",
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
    "identifier": "xmm-death-cultist-dread-scythe",
    "name": "Dread Scythe",
    "page": 86,
    "kind": "monster",
    "status": "played",
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
    "status": "played",
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
    "identifier": "xmm-drider-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 105,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Drider",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
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
    "identifier": "xmm-elephant-trample",
    "name": "Trample",
    "page": 353,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Elephant",
    "adds": "A creature that is not Prone is left unaffected by the trample: no save, no damage.",
    "entry": {
      "targets": {
        "unaffectedIf": {
          "not": {
            "target.hasStatus": "prone"
          }
        }
      }
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
    "identifier": "xmm-ettercap-web-strand",
    "name": "Web Strand",
    "page": 115,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Ettercap",
    "adds": "A creature larger than Large is left unaffected by the web strand: no save, no restraint.",
    "entry": {
      "targets": {
        "unaffectedIf": {
          "not": {
            "target.sizeAtMost": "lg"
          }
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
    "identifier": "xmm-faerie-dragon-youth-euphoria-breath",
    "name": "Euphoria Breath",
    "page": 117,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Faerie Dragon Youth",
    "adds": "The Incapacitated condition lasts until the end of the target's next turn.",
    "entry": {
      "effectEnds": {
        "hv7my3sOURYES70U": "bearerTurnEnd"
      }
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
    "identifier": "xmm-giant-ape-leap",
    "name": "Leap",
    "page": 354,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Giant Ape",
    "adds": "Once on each of its turns the creature may jump up to 30 feet for 10 feet of movement, whatever its Strength.",
    "entry": {
      "jump": {
        "fixed": {
          "distance": 30,
          "cost": 10
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
    "identifier": "xmm-grell-abduct",
    "name": "Abduct",
    "page": 157,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Grell",
    "adds": "The creature moves a creature it is grappling, whatever its size, at no extra cost of movement.",
    "entry": {
      "grappleSize": {
        "dragFree": 5
      }
    }
  },

  {
    "identifier": "xmm-incubus-nightmare",
    "name": "Nightmare",
    "page": 178,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Incubus",
    "adds": "A target at 20 hit points or fewer that fails the save sleeps and takes no damage; above that it takes the damage and does not sleep. Another creature can spend its action to wake the sleeper.",
    "entry": {
      "actionEnds": {
        "Di6rSDXgFkxAGsFE": {
          "by": "other",
          "verb": "wake"
        }
      },
      "hpTiers": [
        {
          "atMost": 20,
          "damage": false
        },
        {
          "effects": []
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
    "identifier": "xmm-juvenile-shadow-dragon-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 275,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Juvenile Shadow Dragon",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
        }
      }
    }
  },

  {
    "identifier": "xmm-kobold-warrior-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 185,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Kobold Warrior",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
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
    "identifier": "xmm-kuo-toa-archpriest-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 191,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Kuo-toa Archpriest",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
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
    "identifier": "xmm-kuo-toa-monitor-bone-whip",
    "name": "Bone Whip",
    "page": 190,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Kuo-toa Monitor",
    "adds": "The creature hit stays unable to make Opportunity Attacks until the monitor's own turn comes round again.",
    "entry": {
      "effectEnds": {
        "fnxPnbWeOvf9X0QR": "casterTurnStart"
      }
    }
  },

  {
    "identifier": "xmm-kuo-toa-monitor-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 190,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Kuo-toa Monitor",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
        }
      }
    }
  },

  {
    "identifier": "xmm-kuo-toa-whip-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 190,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Kuo-toa Whip",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
        }
      }
    }
  },

  {
    "identifier": "xmm-kuo-toa-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 189,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Kuo-toa",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
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
    "identifier": "xmm-lacedon-ghoul-claw",
    "name": "Claw",
    "page": 132,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Lacedon Ghoul",
    "adds": "The paralysis is placed only on a target that is neither an Undead nor an elf.",
    "entry": {
      "effectsIf": {
        "not": {
          "any": [
            {
              "target.creatureType": "undead"
            },
            {
              "target.creatureSubtype": "elf"
            },
            {
              "target.hasFeature": "elf"
            }
          ]
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
    "identifier": "xmm-magmin-ignited-illumination",
    "name": "Ignited Illumination",
    "page": 200,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Magmin",
    "adds": "Used, the feature sets the creature ablaze: bright light for 10 feet and dim light for 10 more; used again, it puts the light out.",
    "entry": {
      "carriedLight": {
        "bright": 10,
        "dim": 20,
        "units": "ft"
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
    "identifier": "xmm-mimic-pseudopod",
    "name": "Pseudopod",
    "page": 212,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Mimic",
    "adds": "Ability checks made to escape the mimic's grapple are rolled with Disadvantage.",
    "entry": {
      "inescapable": true
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "DDB Importer monster features: world ids and generic identifiers"
      }
    ]
  },

  {
    "identifier": "xmm-myconid-adult-sun-sickness",
    "name": "Sun Sickness",
    "page": 223,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Myconid Adult",
    "adds": "In sunlight the creature has Disadvantage on its attack rolls, ability checks and saving throws.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check",
          "save"
        ],
        "if": {
          "self.inSunlight": true
        }
      },
      "triggers": [
        {
          "on": "preAttackRoll",
          "if": {
            "source.inSunlight": true
          },
          "do": [
            {
              "type": "disadvantage"
            }
          ]
        }
      ]
    }
  },

  {
    "identifier": "xmm-myconid-sovereign-sun-sickness",
    "name": "Sun Sickness",
    "page": 223,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Myconid Sovereign",
    "adds": "In sunlight the creature has Disadvantage on its attack rolls, ability checks and saving throws.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check",
          "save"
        ],
        "if": {
          "self.inSunlight": true
        }
      },
      "triggers": [
        {
          "on": "preAttackRoll",
          "if": {
            "source.inSunlight": true
          },
          "do": [
            {
              "type": "disadvantage"
            }
          ]
        }
      ]
    }
  },

  {
    "identifier": "xmm-myconid-sprout-sun-sickness",
    "name": "Sun Sickness",
    "page": 222,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Myconid Sprout",
    "adds": "In sunlight the creature has Disadvantage on its attack rolls, ability checks and saving throws.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check",
          "save"
        ],
        "if": {
          "self.inSunlight": true
        }
      },
      "triggers": [
        {
          "on": "preAttackRoll",
          "if": {
            "source.inSunlight": true
          },
          "do": [
            {
              "type": "disadvantage"
            }
          ]
        }
      ]
    }
  },

  {
    "identifier": "xmm-phase-spider-bite",
    "name": "Bite",
    "page": 239,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Phase Spider",
    "adds": "The poison is placed only on a target the bite reduces to 0 hit points, and that target is stable.",
    "entry": {
      "effectsIf": {
        "target.atZero": true
      },
      "stableAtZero": true
    },
    "carries": {
      "from": "bite",
      "keys": [
        "drain"
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
    "identifier": "xmm-shadow-demon-light-sensitivity",
    "name": "Light Sensitivity",
    "page": 273,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Shadow Demon",
    "adds": "In bright light the creature has Disadvantage on its ability checks.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inBrightLight": true
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
    "identifier": "xmm-shadow-dragon-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 275,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Shadow Dragon",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
        }
      }
    }
  },

  {
    "identifier": "xmm-specter-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 290,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Specter",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
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
    "identifier": "xmm-swarm-of-bats-swarm",
    "name": "Swarm",
    "page": 370,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Swarm of Bats",
    "adds": "The swarm gains no Temporary Hit Points, whatever would give them.",
    "entry": {
      "blocksTempHp": true
    },
    "carries": {
      "from": "swarm",
      "keys": [
        "sharesSpace"
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
    "identifier": "xmm-swarm-of-crawling-claws-swarm",
    "name": "Swarm",
    "page": 83,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Swarm of Crawling Claws",
    "adds": "The swarm gains no Temporary Hit Points, whatever would give them.",
    "entry": {
      "blocksTempHp": true
    },
    "carries": {
      "from": "swarm",
      "keys": [
        "sharesSpace"
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
    "identifier": "xmm-swarm-of-dretches-swarm",
    "name": "Swarm",
    "page": 104,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Swarm of Dretches",
    "adds": "The swarm gains no Temporary Hit Points, whatever would give them.",
    "entry": {
      "blocksTempHp": true
    },
    "carries": {
      "from": "swarm",
      "keys": [
        "sharesSpace"
      ]
    }
  },

  {
    "identifier": "xmm-swarm-of-insects-swarm",
    "name": "Swarm",
    "page": 370,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Swarm of Insects",
    "adds": "The swarm gains no Temporary Hit Points, whatever would give them.",
    "entry": {
      "blocksTempHp": true
    },
    "carries": {
      "from": "swarm",
      "keys": [
        "sharesSpace"
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
    "identifier": "xmm-swarm-of-larvae-swarm",
    "name": "Swarm",
    "page": 193,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Swarm of Larvae",
    "adds": "The swarm gains no Temporary Hit Points, whatever would give them.",
    "entry": {
      "blocksTempHp": true
    },
    "carries": {
      "from": "swarm",
      "keys": [
        "sharesSpace"
      ]
    }
  },

  {
    "identifier": "xmm-swarm-of-lemures-swarm",
    "name": "Swarm",
    "page": 194,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Swarm of Lemures",
    "adds": "The swarm gains no Temporary Hit Points, whatever would give them.",
    "entry": {
      "blocksTempHp": true
    },
    "carries": {
      "from": "swarm",
      "keys": [
        "sharesSpace"
      ]
    }
  },

  {
    "identifier": "xmm-swarm-of-piranhas-swarm",
    "name": "Swarm",
    "page": 370,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Swarm of Piranhas",
    "adds": "The swarm gains no Temporary Hit Points, whatever would give them.",
    "entry": {
      "blocksTempHp": true
    },
    "carries": {
      "from": "swarm",
      "keys": [
        "sharesSpace"
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
    "identifier": "xmm-swarm-of-rats-swarm",
    "name": "Swarm",
    "page": 370,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Swarm of Rats",
    "adds": "The swarm gains no Temporary Hit Points, whatever would give them.",
    "entry": {
      "blocksTempHp": true
    },
    "carries": {
      "from": "swarm",
      "keys": [
        "sharesSpace"
      ]
    }
  },

  {
    "identifier": "xmm-swarm-of-ravens-swarm",
    "name": "Swarm",
    "page": 371,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Swarm of Ravens",
    "adds": "The swarm gains no Temporary Hit Points, whatever would give them.",
    "entry": {
      "blocksTempHp": true
    },
    "carries": {
      "from": "swarm",
      "keys": [
        "sharesSpace"
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
    "identifier": "xmm-swarm-of-stirges-swarm",
    "name": "Swarm",
    "page": 299,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Swarm of Stirges",
    "adds": "The swarm gains no Temporary Hit Points, whatever would give them.",
    "entry": {
      "blocksTempHp": true
    },
    "carries": {
      "from": "swarm",
      "keys": [
        "sharesSpace"
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
    "identifier": "xmm-swarm-of-venomous-snakes-swarm",
    "name": "Swarm",
    "page": 371,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Swarm of Venomous Snakes",
    "adds": "The swarm gains no Temporary Hit Points, whatever would give them.",
    "entry": {
      "blocksTempHp": true
    },
    "carries": {
      "from": "swarm",
      "keys": [
        "sharesSpace"
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
    "identifier": "xmm-troglodyte-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 309,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Troglodyte",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
        }
      }
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
    "identifier": "xmm-vampire-spawn-bite",
    "name": "Bite",
    "page": 315,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Vampire Spawn",
    "adds": "A creature that is not Grappled, Incapacitated or Restrained is left unaffected by the bite: no save, no damage, no drain.",
    "entry": {
      "targets": {
        "unaffectedIf": {
          "not": {
            "any": [
              {
                "target.hasStatus": "grappled"
              },
              {
                "target.hasStatus": "incapacitated"
              },
              {
                "target.hasStatus": "restrained"
              }
            ]
          }
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
  },

  {
    "identifier": "xmm-wight-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 332,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Wight",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
        }
      }
    }
  },

  {
    "identifier": "xmm-winged-kobold-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 185,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Winged Kobold",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
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
    "identifier": "xmm-wraith-sunlight-sensitivity",
    "name": "Sunlight Sensitivity",
    "page": 336,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Wraith",
    "adds": "In sunlight the creature rolls its ability checks with Disadvantage.",
    "entry": {
      "rollDisadvantage": {
        "on": [
          "check"
        ],
        "if": {
          "self.inSunlight": true
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
    "identifier": "xmm-young-copper-dragon-slowing-breath",
    "name": "Slowing Breath",
    "page": 78,
    "kind": "monster",
    "status": "played",
    "handledIn": "table",
    "origin": "Young Copper Dragon",
    "adds": "The breath's effect lasts until the end of the target's next turn.",
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
  }
]);
