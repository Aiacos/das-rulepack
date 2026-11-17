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
  "holy-weapon": { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "AVAqMpoVU6J5tDTM", do: [{ type: "resave" }] }] },

  // Earth Tremor (XGE p.155): "On a failed save, a creature takes 1d6 bludgeoning damage and is knocked prone" — nothing on a
  // success; the item's data gives half damage.
  "earth-tremor": { saveDamage: { saveEarthTremorI: "none" } },

  // Pyrotechnics (XGE p.163), fireworks: Blinded "until the end of your next turn".
  "pyrotechnics": { effectEnds: { ZjHJQ7woRp98O6cT: "casterTurnEnd" } },

  // Snare (XGE p.165): "A restrained creature can make a Dexterity saving throw at the end of each of its turns, ending the
  // effect on itself on a success."
  "snare": { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "e9NG1SwNcR4UZAXY", do: [{ type: "resave" }] }] },

  // Watery Sphere (XGE p.170): "At the end of each of its turns, a restrained target can repeat the saving throw, ending the
  // effect on itself on a success."
  "watery-sphere": { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "b4gGKWLyZdmGqgrO", do: [{ type: "resave" }] }] },

  // Power Word Pain (XGE p.163): "A target suffering this pain can make a Constitution saving throw at the end of each of its
  // turns. On a successful save, the pain ends."
  "power-word-pain": { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "zZ96n2pATqQe1y8v", do: [{ type: "resave" }] }] },

  // Wall of Light (XGE p.170): "A blinded creature can make a Constitution saving throw at the end of each of its turns,
  // ending the effect on itself on a success."
  "wall-of-light": { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "VGU8pflgbBnWKJ7E", do: [{ type: "resave" }] }] },

  // Otto's Irresistible Dance, 2014 version (PHB 2014 p.264; identifier `irresistible-dance`, where the 2024 spell is
  // `ottos-irresistible-dance` and has its rule in DAS · Core): the dancer "has disadvantage on ... attack rolls", "other
  // creatures have advantage on attack rolls against it", and "as an action, a dancing creature makes a Wisdom saving throw
  // to regain control of itself".
  "irresistible-dance": {
    actionEnds: { aWuXl9NADX7vOCOC: { by: "bearer", roll: "save" } },
    triggers: [
      { on: "preAttackRoll", via: "effect", if: { "source.hasEffect": "irresistible-dance" }, do: [{ type: "disadvantage" }] },
      { on: "preAttackRoll", via: "effect", if: { "target.hasEffect": "irresistible-dance" }, do: [{ type: "advantage" }] }
    ]
  },

  // Incite Greed (AI p.76): "At the end of each of its turns, an affected target can make a Wisdom saving throw. If it
  // succeeds, this effect ends for that target."
  "incite-greed": { triggers: [{ on: "endOfTurn", via: "effect", fromEffect: "4Hi47QCDFVz6m9gd", do: [{ type: "resave" }] }] }
});
