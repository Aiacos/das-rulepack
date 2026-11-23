// Generated from registry/efa.json by npm run build:rules — do not edit.
import { book } from "../book.mjs";

export const BOOK = "EFA";

export const RULES = book(BOOK, [
  {
    "identifier": "greater-aberrant-mark",
    "name": "Greater Aberrant Mark",
    "page": 43,
    "kind": "feat",
    "status": "played",
    "handledIn": "table",
    "adds": "The use of the Aberrant Dragonmark feat comes back on a Short Rest too.",
    "entry": {
      "regainOnShortRest": [
        "aberrant-dragonmark"
      ]
    }
  },

  {
    "identifier": "eldritch-cannon",
    "name": "Eldritch Cannon",
    "page": 16,
    "kind": "feature",
    "status": "played",
    "handledIn": "table",
    "origin": "Artillerist 3",
    "adds": "The cannon stays out of the turn order, is removed at 0 Hit Points, and goes after one hour.",
    "entry": {
      "summon": {
        "initiative": "none",
        "vanishesAtZero": true,
        "lasts": {
          "value": 1,
          "units": "hour"
        }
      }
    }
  },

  {
    "identifier": "steel-defender",
    "name": "Steel Defender",
    "page": 18,
    "kind": "feature",
    "status": "played",
    "handledIn": "table",
    "origin": "Battle Smith 3",
    "adds": "The defender joins a running combat right after its maker, a new one sends the earlier away, and it goes if the maker dies.",
    "entry": {
      "summon": {
        "initiative": "after",
        "replaces": true,
        "vanishesWithCaster": true
      }
    }
  },

  {
    "identifier": "arcane-jolt",
    "name": "Arcane Jolt",
    "page": 19,
    "kind": "feature",
    "status": "played",
    "handledIn": "table",
    "origin": "Battle Smith 9",
    "adds": "On an attack that hits, the artificer is offered the extra Force damage for one use of the feature, once per turn.",
    "entry": {
      "hitRider": {
        "damage": "0hcKJHtmBWEpsMcJ",
        "oncePerTurn": true
      }
    }
  },

  {
    "identifier": "mapping-magic",
    "name": "Mapping Magic",
    "page": 21,
    "kind": "feature",
    "status": "played",
    "handledIn": "table",
    "origin": "Cartographer 3",
    "adds": "The jump takes its bearer to a free space up to 10 feet away, and no farther.",
    "entry": {
      "teleport": {
        "distance": 10,
        "units": "ft"
      }
    }
  },

  {
    "identifier": "guided-precision",
    "name": "Guided Precision",
    "page": 21,
    "kind": "feature",
    "status": "played",
    "handledIn": "table",
    "origin": "Cartographer 5",
    "adds": "Damage taken asks for no Concentration save while Faerie Fire is the only spell the artificer concentrates on.",
    "entry": {
      "keepsConcentration": [
        "faerie-fire"
      ]
    }
  },

  {
    "identifier": "boots-of-the-winding-path",
    "name": "Boots of the Winding Path",
    "page": 112,
    "kind": "item",
    "status": "played",
    "handledIn": "table",
    "adds": "Using the boots lets the wearer pick a destination at once and teleports them there, up to 15 feet away.",
    "entry": {
      "teleport": {
        "distance": 15,
        "units": "ft"
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "engineered against the official item only (Ruling R43)"
      }
    ]
  },

  {
    "identifier": "construct-resilience",
    "name": "Construct Resilience",
    "page": 38,
    "kind": "species",
    "status": "played",
    "handledIn": "table",
    "origin": "Warforged",
    "adds": "The bearer rolls with Advantage a saving throw against anything that would give the Poisoned condition.",
    "entry": {
      "saveAdvantage": [
        "poisoned"
      ]
    }
  },

  {
    "identifier": "homunculus-servant",
    "name": "Homunculus Servant",
    "page": 21,
    "kind": "spell",
    "status": "played",
    "handledIn": "table",
    "adds": "The homunculus joins a running combat right after its caster, and casting again removes the earlier one.",
    "entry": {
      "summon": {
        "initiative": "after",
        "replaces": true
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
