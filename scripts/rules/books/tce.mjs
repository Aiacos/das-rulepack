/**
 * Tasha's Cauldron of Everything (2020).
 *
 * The activity and effect ids are those of the items imported by DDB Importer (its ids are stable from one import to the next);
 * an item from another source keeps the general rules of the engine, and the parts of a rule that name an id do nothing on it.
 */
import { book } from "../book.mjs";

export const BOOK = "TCE";

export const RULES = book(BOOK, [
  // Booming Blade and Green-Flame Blade have no entry: the whole rule is in scripts/blade-cantrips.mjs (Foundry glue) and
  // scripts/core/blade-cantrips.mjs (pure rules), which recognise the two spells by their identifier.
  {
    identifier: "booming-blade", name: "Booming Blade", page: 106, kind: "spell", status: "played",
    handledIn: "code", code: "scripts/blade-cantrips.mjs",
    adds: "Casting it makes one melee attack with a weapon you hold (you choose if you hold several). From 5th level the attack adds 1d8 thunder on a hit (2d8 at 11th, 3d8 at 17th). A target that is hit is sheathed until the start of your next turn: if it moves 5 feet or more of its own will, it takes 1d8 thunder (one more die at 5th, 11th and 17th) and the spell ends. Pushes and pulls by the engine do not set it off."
  },

  {
    identifier: "green-flame-blade", name: "Green-Flame Blade", page: 107, kind: "spell", status: "played",
    handledIn: "code", code: "scripts/blade-cantrips.mjs",
    adds: "Casting it makes one melee attack with a weapon you hold. From 5th level the attack adds 1d8 fire on a hit (2d8 at 11th, 3d8 at 17th). On a hit you choose a creature within 5 feet of the target: it takes fire damage equal to your spellcasting modifier, plus the same dice."
  },

  {
    identifier: "lightning-lure", name: "Lightning Lure", page: 107, kind: "spell", status: "played", handledIn: "table",
    adds: "On a failed save the target is pulled up to 10 ft toward the caster. The imported item's target (a \"0-foot emanation\" that never contains anyone) is corrected to one creature.",
    // Lightning Lure (TCE p.107, SCAG): on a failed Strength save the target "is pulled up to 10 feet in a straight line toward
    // you". The damage "if it is within 5 feet of you" is left as rolled: the engine applies it wherever the target ends.
    // The imported item gives the save a "0-foot emanation" as its area, so no creature is ever in it: the spell targets "one
    // creature of your choice that you can see within 15 feet of you". Corrected in the item's data (by the active GM when the
    // item is created, and by the world diagnostic for items already on a sheet).
    entry: {
      dataFixes: [
        { path: "system.target.template.type", from: "radius", value: "" },
        { path: "system.target.affects.type", from: "", value: "creature" }
      ],
      triggers: [{ on: "failedSave", do: [{ type: "move", mode: "pull", distance: 10, units: "ft", upTo: true }] }]
    }
  },

  {
    identifier: "tashas-mind-whip", name: "Tasha's Mind Whip", page: 115, kind: "spell", status: "played", handledIn: "table",
    adds: "No reactions until the end of the target's next turn; on that turn, an action or a bonus action, not both.",
    // Tasha's Mind Whip (TCE p.115): on a failed save the target "can't take a reaction until the end of its next turn", and on
    // that turn "gets only one of the three" (move, action, bonus action). The engine holds action OR bonus action; the choice
    // to move instead is left to the table.
    entry: {
      noReactions: true,
      actionOrBonus: true,
      effectEnds: { cX99599Nv7wRWKFn: "bearerTurnEnd" }
    }
  },

  {
    identifier: "tashas-caustic-brew", name: "Tasha's Caustic Brew", page: 115, kind: "spell", status: "played",
    handledIn: "table",
    adds: "No damage on the cast; 2d4 acid at the start of each of the target's turns; an action ends it.",
    // Tasha's Caustic Brew (TCE p.115): a failed save covers the target in acid — no damage then; "a creature covered in the
    // acid takes 2d4 acid damage at the start of each of its turns", until "a creature uses its action to scrape or wash the
    // acid off itself or another creature". The item's data puts the 2d4 on the saving throw: it is rolled at the start of the
    // bearer's turns instead.
    entry: {
      noDamage: ["saveTashCausBrew"],
      actionEnds: { "2LQhIQp9u4KZrcSj": { by: "bearer" } },
      triggers: [{ on: "startOfTurn", via: "effect", fromEffect: "2LQhIQp9u4KZrcSj",
        do: [{ type: "damage", to: "bearer", activity: "saveTashCausBrew" }] }]
    }
  }
]);
