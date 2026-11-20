/**
 * Xanathar's Guide to Everything (2017).
 *
 * The activity and effect ids are those of the items imported by DDB Importer (its ids are stable from one import to the next);
 * an item from another source keeps the general rules of the engine, and the parts of a rule that name an id do nothing on it.
 */
import { book } from "../book.mjs";

export const BOOK = "XGE";

export const RULES = book(BOOK, [
  {
    identifier: "shadow-blade", name: "Shadow Blade", page: 164, kind: "spell", status: "played",
    handledIn: "code", code: "scripts/shadow-blade.mjs",
    adds: "The blade is in the caster's hand as soon as the spell is cast (created on the spot, or adopted when the item's own data conjures it), sized by the slot (2d8 / 3d8 / 4d8 / 5d8), and leaves with the concentration. Advantage against a target in dim light or darkness. A thrown blade dissipates at the end of the turn; casting the spell again while concentrating brings it back without a slot.",
    // Shadow Blade (XGE p.164): casting the spell again while concentrating calls the blade back, for a bonus action
    // and no slot. The blade itself: scripts/shadow-blade.mjs.
    entry: { recast: true, recastCost: "bonus" }
  },

  {
    identifier: "frostbite", name: "Frostbite", page: 156, kind: "spell", status: "played", handledIn: "table",
    adds: "Disadvantage on the target's next weapon attack before the end of its next turn, then the effect is spent.",
    // Frostbite (XGE p.156, EE): the effect "Frostbitten" ends at the end of its bearer's turn; while it is on, the
    // bearer's first weapon attack is rolled with disadvantage and uses the effect up.
    entry: {
      effectEnds: { ZNq8opE3LPDQFXup: "bearerTurnEnd" },
      triggers: [{ on: "preAttackRoll", via: "effect", if: { "source.hasEffect": "frostbite", "activity.isWeapon": true },
        do: [{ type: "disadvantage" }, { type: "consume", side: "source" }] }]
    }
  },

  {
    identifier: "zephyr-strike", name: "Zephyr Strike", page: 171, kind: "spell", status: "validated", handledIn: "table",
    adds: "The caster's movement provokes no opportunity attacks while the spell lasts.",
    // Zephyr Strike (XGE p.171): no opportunity attacks against the caster's movement while the spell's effect is
    // on.
    entry: { noOpportunity: "whileEffect" }
  },

  {
    identifier: "psychic-scream", name: "Psychic Scream", page: 163, kind: "spell", status: "played", handledIn: "table",
    adds: "A stunned target repeats the save at the end of each of its turns.",
    // Psychic Scream (XGE p.163): the stunning effect lets its bearer repeat the save at the end of each of its
    // turns.
    entry: { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "DkdkPXVGU9anSsuT", do: [{ type: "resave" }] }] }
  },

  {
    identifier: "holy-weapon", name: "Holy Weapon", page: 157, kind: "spell", status: "validated", handledIn: "table",
    adds: "A creature blinded by the burst repeats the save at the end of each of its turns.",
    // Holy Weapon (XGE p.157), the burst that ends the spell: the blinding effect lets its bearer repeat the save at
    // the end of each of its turns.
    entry: { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "AVAqMpoVU6J5tDTM", do: [{ type: "resave" }] }] }
  },

  {
    identifier: "earth-tremor", name: "Earth Tremor", page: 155, kind: "spell", status: "played", handledIn: "table",
    adds: "No damage on a successful save (the imported data gives half).",
    // Earth Tremor (XGE p.155): a successful save takes no damage; the item's data gives half.
    entry: { saveDamage: { saveEarthTremorI: "none" } }
  },

  {
    identifier: "pyrotechnics", name: "Pyrotechnics", page: 163, kind: "spell", status: "validated", handledIn: "table",
    adds: "Blinded by the fireworks ends at the end of the caster's next turn.",
    // Pyrotechnics (XGE p.163), fireworks: the blinding effect ends at the end of the caster's next turn.
    entry: { effectEnds: { ZjHJQ7woRp98O6cT: "casterTurnEnd" } }
  },

  {
    identifier: "snare", name: "Snare", page: 165, kind: "spell", status: "validated", handledIn: "table",
    adds: "A restrained creature repeats the save at the end of each of its turns.",
    // Snare (XGE p.165): the restraining effect lets its bearer repeat the save at the end of each of its turns.
    entry: { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "e9NG1SwNcR4UZAXY", do: [{ type: "resave" }] }] }
  },

  {
    identifier: "watery-sphere", name: "Watery Sphere", page: 170, kind: "spell", status: "validated", handledIn: "table",
    adds: "A restrained creature repeats the save at the end of each of its turns.",
    // Watery Sphere (XGE p.170): the restraining effect lets its bearer repeat the save at the end of each of its
    // turns.
    entry: { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "b4gGKWLyZdmGqgrO", do: [{ type: "resave" }] }] }
  },

  {
    identifier: "power-word-pain", name: "Power Word Pain", page: 163, kind: "spell", status: "validated", handledIn: "table",
    adds: "The target repeats the Constitution save at the end of each of its turns.",
    // Power Word Pain (XGE p.163): the effect lets its bearer repeat the save at the end of each of its turns.
    entry: { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "zZ96n2pATqQe1y8v", do: [{ type: "resave" }] }] }
  },

  {
    identifier: "wall-of-light", name: "Wall of Light", page: 170, kind: "spell", status: "validated", handledIn: "table",
    adds: "A blinded creature repeats the save at the end of each of its turns.",
    // Wall of Light (XGE p.170): the blinding effect lets its bearer repeat the save at the end of each of its
    // turns.
    entry: { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "VGU8pflgbBnWKJ7E", do: [{ type: "resave" }] }] }
  },

  // A sense, declared with the engine's generic `sense` block (DAS · Core, `module/scripts/core/senses.mjs`). It was first
  // proposed to DAS · Core (dnd5e-combat pull request 128) and belongs here: the engine's public repositories carry nothing from
  // non-SRD books. It needs a DAS · Core that knows the `sense` key (pull requests 119 and 122 of dnd5e-combat, not in a release
  // at the time of writing). On an older engine the entry is rejected when the pack registers (the engine logs it); the other
  // rules are registered all the same.
  {
    identifier: "ghostly-gaze", name: "Ghostly Gaze", page: 56, kind: "sense", status: "played", handledIn: "table",
    origin: "Eldritch Invocation", catalog: "option",
    adds: "A sight that walls do not stop within 30 ft, carried by the effect the invocation places on its user; off while the user is Blinded.",
    // Ghostly Gaze (eldritch invocation, XGE p.56): declared as a sight that walls do not stop, with a range of 30
    // ft, carried by the effect the invocation places on its user. It needs working eyes (`needs`): off while the
    // user is Blinded, and an Invisible creature stays unseen. Whatever else the effect grants is left to the
    // effect.
    entry: { sense: { kind: "sight", range: 30, units: "ft", via: "effect", walls: false, needs: "sight" } }
  }
]);
