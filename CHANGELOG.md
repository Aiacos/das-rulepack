# 📝 Changelog

## 0.5.0 — unreleased

- World diagnostic: Plutonium is declared to DAS · Core as an item importer (`scripts/importers.mjs`), so the diagnostic
  lists Plutonium items whose rule cites ids they do not have and can replace them with the official item. Needs a DAS · Core
  with `api.diagnostic.registerImporter` (dnd5e-combat pull request 133, not released yet); nothing happens on an older one.
- Senses from other books, on the engine's generic `sense` block (`scripts/rules/senses.mjs`): Life Sense (MPMM p.250,
  MTF p.246) and Ghostly Gaze (XGE p.56). They need a DAS · Core that knows the `sense` key (dnd5e-combat pull requests 119
  and 122, not released yet); on an older engine the two entries are rejected at registration and nothing else changes.
  Moved here from dnd5e-combat pull request 128, which the maintainer closed: nothing from non-SRD books goes in the
  engine's public repositories.
- Played live and confirmed: Frostbite, Earth Tremor, Tasha's Mind Whip, Tasha's Caustic Brew, Raulothim's Psychic Lance,
  Psychic Scream, Lightning Lure, Otto's Irresistible Dance (2014).
- Fixed: Otto's Irresistible Dance (2014) gave both Advantage and Disadvantage to every attack between the caster and the
  dancer (the caster's concentration counted as dancing); the rule now names the dancing effect.
- Fixed: Lightning Lure did nothing with the imported item, whose target is a "0-foot emanation"; the item's data is
  corrected to one creature.

## 0.4.0

- Booming Blade and Green-Flame Blade (TCE p.106–107): cast as one melee attack with a held weapon, extra dice from 5th
  level, booming energy that answers a willing move, green fire leaping to a chosen neighbour. Played live.

## 0.3.0

- Rules for Earth Tremor, Pyrotechnics, Snare, Watery Sphere, Power Word Pain and Wall of Light, each checked against the
  text of Xanathar's Guide to Everything. Validated by the engine, not yet played.
- Rules for Otto's Irresistible Dance in its 2014 version (identifier `irresistible-dance`) and Incite Greed.

## 0.2.0

- Rules for Frostbite, Lightning Lure, Tasha's Mind Whip, Tasha's Caustic Brew, Zephyr Strike, Raulothim's Psychic Lance,
  Psychic Scream and Holy Weapon (ids of the DDB Importer items). Validated by the engine, not yet played.
- Tests: every rule is checked with DAS · Core's own validator.

## 0.1.0

- Shadow Blade (XGE p.164): blade created when the spell is cast, damage by slot level, Advantage against a target in dim
  light or darkness, dissipation when thrown, Bonus Action recall while concentrating.
