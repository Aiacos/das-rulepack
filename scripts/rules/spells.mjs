/**
 * Declarative rules for spells that DAS · Core does not ship (books outside the official Foundry modules), keyed by dnd5e
 * identifier. The keys are DAS content keys, documented at the top of `module/scripts/core/content.mjs` in DAS · Core; each
 * entry is validated by the engine when it is registered.
 *
 * Every entry names its book and page, so the rule can be checked against the text. The activity and effect ids are those of
 * the items imported by DDB Importer (its ids are stable from one import to the next); an item from another source keeps the
 * general rules of the engine, and the parts of a rule that name an id do nothing on it.
 */
export const SPELLS = Object.freeze({
  // Shadow Blade (XGE p.164): "while the spell persists, you can use a bonus action to cause the sword to reappear in your
  // hand" — recasting while concentrating costs a bonus action and no slot. The blade itself: scripts/shadow-blade.mjs.
  "shadow-blade": { recast: true, recastCost: "bonus" },

  // Frostbite (XGE p.156, EE): on a failed save, "it has disadvantage on the next weapon attack roll it makes before the end
  // of its next turn" — carried by the effect "Frostbitten", spent by the first weapon attack.
  "frostbite": {
    effectEnds: { ZNq8opE3LPDQFXup: "bearerTurnEnd" },
    triggers: [{ on: "preAttackRoll", via: "effect", if: { "source.hasEffect": "frostbite", "activity.isWeapon": true },
      do: [{ type: "disadvantage" }, { type: "consume", side: "source" }] }]
  },

  // Lightning Lure (TCE p.107, SCAG): on a failed Strength save the target "is pulled up to 10 feet in a straight line toward
  // you". The damage "if it is within 5 feet of you" is left as rolled: the engine applies it wherever the target ends.
  "lightning-lure": {
    triggers: [{ on: "failedSave", do: [{ type: "move", mode: "pull", distance: 10, units: "ft", upTo: true }] }]
  },

  // Tasha's Mind Whip (TCE p.115): on a failed save the target "can't take a reaction until the end of its next turn", and on
  // that turn "gets only one of the three" (move, action, bonus action). The engine holds action OR bonus action; the choice
  // to move instead is left to the table.
  "tashas-mind-whip": {
    noReactions: true,
    actionOrBonus: true,
    effectEnds: { cX99599Nv7wRWKFn: "bearerTurnEnd" }
  },

  // Tasha's Caustic Brew (TCE p.115): a failed save covers the target in acid — no damage then; "a creature covered in the
  // acid takes 2d4 acid damage at the start of each of its turns", until "a creature uses its action to scrape or wash the
  // acid off itself or another creature". The item's data puts the 2d4 on the saving throw: it is rolled at the start of the
  // bearer's turns instead.
  "tashas-caustic-brew": {
    noDamage: ["saveTashCausBrew"],
    actionEnds: { "2LQhIQp9u4KZrcSj": { by: "bearer" } },
    triggers: [{ on: "startOfTurn", via: "effect", fromEffect: "2LQhIQp9u4KZrcSj",
      do: [{ type: "damage", to: "bearer", activity: "saveTashCausBrew" }] }]
  },

  // Zephyr Strike (XGE p.171): "until the spell ends, your movement doesn't provoke opportunity attacks."
  "zephyr-strike": { noOpportunity: "whileEffect" },

  // Raulothim's Psychic Lance (FTD p.21): on a failed save the target is Incapacitated "until the start of your next turn".
  "raulothims-psychic-lance": { effectEnds: { "31jOzP6HwmGO6HHd": "casterTurnStart" } },

  // Psychic Scream (XGE p.163): "a stunned target can make an Intelligence saving throw at the end of each of its turns. On a
  // successful save, the stunning effect ends."
  "psychic-scream": { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "DkdkPXVGU9anSsuT", do: [{ type: "resave" }] }] },

  // Holy Weapon (XGE p.157), the burst that ends the spell: a creature that fails is Blinded for 1 minute and "can make a
  // Constitution saving throw at the end of each of its turns, ending the effect on itself on a success".
  "holy-weapon": { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "AVAqMpoVU6J5tDTM", do: [{ type: "resave" }] }] }
});
