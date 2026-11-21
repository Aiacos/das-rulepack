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
  }
]);
