/**
 * Player's Handbook (2014). Only what the 2024 rules do not replace under the same identifier: DAS · Core covers the SRD and the
 * 2024 Player's Handbook itself.
 *
 * The effect ids are those of the items imported by DDB Importer; an item from another source keeps the general rules of the
 * engine, and the parts of a rule that name an id do nothing on it.
 */
import { book } from "../book.mjs";

export const BOOK = "PHB";

export const RULES = book(BOOK, [
  {
    identifier: "irresistible-dance", name: "Otto's Irresistible Dance (2014)", page: 264, kind: "spell", status: "played",
    handledIn: "table", inCore: true,
    adds: "Disadvantage on the dancer's attacks, Advantage on attacks against it, and an action to repeat the Wisdom save. The 2024 spell is covered by DAS · Core.",
    // Otto's Irresistible Dance, 2014 version (PHB 2014 p.264; identifier `irresistible-dance`, where the 2024 spell is
    // `ottos-irresistible-dance` and has its rule in DAS · Core): the dancer "has disadvantage on ... attack rolls", "other
    // creatures have advantage on attack rolls against it", and "as an action, a dancing creature makes a Wisdom saving throw
    // to regain control of itself".
    entry: {
      actionEnds: { aWuXl9NADX7vOCOC: { by: "bearer", roll: "save" } },
      triggers: [
        // The effect is named: the caster carries one too (the spell's concentration), and must not count as dancing.
        { on: "preAttackRoll", via: "effect", if: { "source.hasEffect": { item: "irresistible-dance", effect: "aWuXl9NADX7vOCOC" } },
          do: [{ type: "disadvantage" }] },
        { on: "preAttackRoll", via: "effect", if: { "target.hasEffect": { item: "irresistible-dance", effect: "aWuXl9NADX7vOCOC" } },
          do: [{ type: "advantage" }] }
      ]
    }
  }
]);
