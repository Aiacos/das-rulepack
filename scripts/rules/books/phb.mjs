// Generated from registry/phb.json by npm run build:rules — do not edit.
import { book } from "../book.mjs";

export const BOOK = "PHB";

export const RULES = book(BOOK, [
  // Otto's Irresistible Dance, 2014 version (PHB 2014 p.264; identifier `irresistible-dance`, where the 2024 spell
  // is `ottos-irresistible-dance` and has its rule in DAS · Core): disadvantage on the attacks of a creature that
  // carries the dancing effect, advantage on the attacks against it, and an action of the bearer to roll the save
  // that ends the effect.
  // The effect is named: the caster carries one too (the spell's concentration), and must not count as dancing.
  {
    "identifier": "irresistible-dance",
    "name": "Otto's Irresistible Dance (2014)",
    "page": 264,
    "kind": "spell",
    "status": "played",
    "handledIn": "table",
    "inCore": true,
    "adds": "Disadvantage on the dancer's attacks, Advantage on attacks against it, and an action to repeat the Wisdom save. The 2024 spell is covered by DAS · Core.",
    "entry": {
      "actionEnds": {
        "aWuXl9NADX7vOCOC": {
          "by": "bearer",
          "roll": "save"
        }
      },
      "triggers": [
        {
          "on": "preAttackRoll",
          "via": "effect",
          "if": {
            "source.hasEffect": {
              "item": "irresistible-dance",
              "effect": "aWuXl9NADX7vOCOC"
            }
          },
          "do": [
            {
              "type": "disadvantage"
            }
          ]
        },
        {
          "on": "preAttackRoll",
          "via": "effect",
          "if": {
            "target.hasEffect": {
              "item": "irresistible-dance",
              "effect": "aWuXl9NADX7vOCOC"
            }
          },
          "do": [
            {
              "type": "advantage"
            }
          ]
        }
      ]
    }
  }
]);
