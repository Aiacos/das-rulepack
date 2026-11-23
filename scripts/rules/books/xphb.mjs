// Generated from registry/xphb.json by npm run build:rules — do not edit.
/**
 * Player's Handbook (2024). Class features from subclasses that are not in the SRD, where DAS · Core ships an entry that plays
 * the rule only in part. Each entry here replaces the keys it names (the engine merges a registered table over its own, key by
 * key) and nothing else.
 *
 * The activity ids are those of the official Player's Handbook module — the same ids DAS · Core's own entries cite.
 */
import { book } from "../book.mjs";

export const BOOK = "XPHB";

export const RULES = book(BOOK, [
  // Psychic Veil (Soulknife 13, PHB 2024 p.135): the engine's entry ends the invisibility on any attack roll, so a
  // miss dropped it; the attack roll is taken out of the list. What the engine's "damage" does not cover — an
  // attack that hits and deals damage — is handled by scripts/psychic-veil.mjs.
  {
    "identifier": "psychic-veil",
    "name": "Psychic Veil",
    "page": 135,
    "kind": "feature",
    "status": "played",
    "handledIn": "code",
    "origin": "Soulknife 13",
    "inCore": true,
    "adds": "A missed attack no longer drops the invisibility; an attack that hits and deals damage still does.",
    "code": "scripts/psychic-veil.mjs",
    "entry": {
      "breaksOn": [
        "damage",
        "forcesSave"
      ]
    }
  },

  // Inspiring Smite (Oath of Glory 3, PHB 2024 p.114): the engine's entry splits the Temporary Hit Points evenly;
  // `choose` opens its distribution window instead, so the player divides them.
  {
    "identifier": "inspiring-smite",
    "name": "Inspiring Smite",
    "page": 114,
    "kind": "feature",
    "status": "played",
    "handledIn": "table",
    "origin": "Oath of Glory 3",
    "inCore": true,
    "adds": "The Temporary Hit Points are divided among the chosen creatures as the paladin likes, where the engine splits them evenly.",
    "entry": {
      "healPool": {
        "activities": [
          "oBkPCmC2KsH2WUJp"
        ],
        "temp": true,
        "choose": true
      }
    }
  },

  // Dreadful Strikes (Fey Wanderer 3, PHB 2024 p.124): the extra damage is counted once per turn for each TARGET.
  // The engine can only count per ranger, so its trigger is switched off here and scripts/dreadful-strikes.mjs
  // adds the die itself.
  {
    "identifier": "dreadful-strikes",
    "name": "Dreadful Strikes",
    "page": 124,
    "kind": "feature",
    "status": "played",
    "handledIn": "code",
    "origin": "Fey Wanderer 3",
    "inCore": true,
    "adds": "The extra Psychic die is once per turn for each target, not once per turn for the ranger.",
    "code": "scripts/dreadful-strikes.mjs",
    "entry": {
      "triggers": []
    }
  },

  {
    "identifier": "bulwark-of-force",
    "name": "Bulwark of Force",
    "page": 99,
    "kind": "feature",
    "status": "played",
    "handledIn": "table",
    "origin": "Psi Warrior 15",
    "adds": "The cover the feature gives ends at once when the psi warrior who gave it becomes Incapacitated.",
    "entry": {
      "endsWhen": {
        "incapacitated": "caster"
      }
    }
  },

  {
    "identifier": "hand-of-harm",
    "name": "Hand of Harm",
    "page": 104,
    "kind": "feature",
    "status": "played",
    "handledIn": "table",
    "origin": "Mercy 3",
    "adds": "On an Unarmed Strike that hits, the monk is offered the extra Necrotic damage for 1 Focus Point, once per turn.",
    "entry": {
      "hitRider": {
        "pays": "monks-focus",
        "damage": "3LBCmLni9BQUpgcv",
        "unarmed": true,
        "oncePerTurn": true
      }
    }
  },

  {
    "identifier": "cloak-of-shadows",
    "name": "Cloak of Shadows",
    "page": 105,
    "kind": "feature",
    "status": "played",
    "handledIn": "table",
    "origin": "Shadow 17",
    "adds": "The shroud can only be raised in Dim Light or Darkness, and it ends when the monk becomes Incapacitated.",
    "entry": {
      "usageLimits": {
        "PCabpSdfoEUocWya": {
          "light": [
            "dim",
            "dark"
          ]
        }
      },
      "endsWhen": {
        "incapacitated": "bearer"
      }
    }
  },

  {
    "identifier": "shadow-step",
    "name": "Shadow Step",
    "page": 105,
    "kind": "feature",
    "status": "played",
    "handledIn": "table",
    "origin": "Shadow 6",
    "adds": "The teleport is only allowed from and to a space in Dim Light or Darkness, up to 60 feet away.",
    "entry": {
      "teleport": {
        "distance": 60,
        "units": "ft",
        "activity": "Q1ZC1so4EDE9EyV7",
        "maxLight": "dim"
      }
    }
  },

  {
    "identifier": "undying-sentinel",
    "name": "Undying Sentinel",
    "page": 116,
    "kind": "feature",
    "status": "played",
    "handledIn": "table",
    "origin": "Ancients 15",
    "adds": "At 0 Hit Points the paladin is asked whether to rise; the feature then spends its use and heals them.",
    "entry": {
      "atZero": {
        "activity": "bRIROEIDYNYI8XFQ"
      }
    }
  },

  {
    "identifier": "zone-of-truth",
    "name": "Zone of Truth",
    "page": 343,
    "kind": "spell",
    "status": "validated",
    "handledIn": "table",
    "adds": "The 15-foot sphere is laid, and a creature coming in or beginning its turn there saves again, once per turn.",
    "entry": {
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
      ],
      "selfZone": {
        "dnd5eactivity000": {
          "type": "sphere",
          "size": 15,
          "units": "ft"
        }
      }
    },
    "uncovered": [
      {
        "origin": "ddb-importer",
        "because": "its save is a second, special activity after a utility cast; the replay is bound to one origin"
      }
    ],
    "partial": {
      "out-of-combat": 1
    }
  }
]);
