# 📝 Changelog

## Unreleased

- README: three official Foundry sourcebooks the rulebook catalogue does not contain are in the table of official modules:
  Ravenloft: The Horrors Within (RHW), Arcana Unleashed (AU) and Dungeons & Dragons: World of Warcraft (WOW). Each is
  measured from the module's own compendia and counted like any other book; species traits are a part of their own (RHW,
  WOW). The four official adventures are named as outside the scope of the tables (`docs/foundry-modules.json`).
- Life Sense and Ghostly Gaze are no longer "pending": DAS · Core 0.287.0 knows the `sense` key, the contract tests pass
  against Core 0.288.0, and both had been played on hand-made features (GM client). The README says which Core they need.
- README: monsters are in the progress bars again, measured feature by feature (a monster counts when DAS · Core leaves
  none of its features open); the counts are in `docs/books.json`.
- README made lighter: the list of every rule, book by book, is now `docs/RULES.md` (generated), and what the GM's client
  does on a player's behalf is `docs/GM-CLIENT.md`. Nothing was removed.

## 0.6.0 — 2026-11-20 (beta)

First version with an installable manifest. 0.5.0 was never released: what was written under that number is here.

What was played and what was not, as in the README: 14 rules were played in a running world, on the GM's client only
(Shadow Blade, Booming Blade, Green-Flame Blade, Frostbite, Lightning Lure, Tasha's Mind Whip, Tasha's Caustic Brew,
Raulothim's Psychic Lance, Psychic Scream, Earth Tremor, Otto's Irresistible Dance (2014), Psychic Veil, Inspiring Smite,
Dreadful Strikes); 8 are only validated by the engine's validator (Zephyr Strike, Holy Weapon, Pyrotechnics, Snare, Watery
Sphere, Power Word Pain, Wall of Light, Incite Greed); 2 are pending, neither validated nor played, and need a DAS · Core
that is not released yet (Life Sense, Ghostly Gaze). Nothing was played from a player's client.

- Installation by manifest URL: `module.json` carries `manifest` and `download`; `./build.sh` leaves the zip and the
  manifest to upload in `releases/` (GitHub issue #1).
- No rulebook text: the comments and the hint of the Booming Blade effect describe what the module does, in its own words.
- README: overall progress bars, and for each rulebook one bar per part (spells, features, feats, options, items, monsters).
- Reorganization by source book, with no change to what is registered with DAS · Core (same identifiers, same entries:
  `tests/registration.test.mjs`):
  - one module per book in `scripts/rules/books/<code>.mjs` (XGE, TCE, FTD, AI, PHB, XPHB, MPMM), each rule with its book,
    page, kind, status and where it is handled; `scripts/rules/index.mjs` builds the registered table from them. The former
    `scripts/rules/spells.mjs`, `senses.mjs` and `features.mjs` are gone. The scripts of the rules handled in code did not move.
  - `docs/books.json` (entries per official rulebook and what DAS · Core covers: counts only) and
    `docs/foundry-modules.json` (official Foundry VTT packages); `npm run books` (`tools/books-progress.mjs`) writes the
    README's "Progress by rulebook" — books published as an official Foundry module, then the others — and its list of
    rules by book. A test fails when the README is stale.
  - README: the list of rules now also shows the class features and the senses, which were registered but not listed. A
    third status, "pending", for the two senses: written, not validated by the tests here, not played.
  - Book codes are those of the catalogue: PHB is the Player's Handbook of 2014, XPHB that of 2024.
- Subclass features where DAS · Core plays the rule only in part (`scripts/rules/books/xphb.mjs`), from the Player's Handbook 2024:
  - Psychic Veil (Soulknife 13, p.135): a missed attack no longer drops the invisibility; an attack that hits and deals damage
    still does (`scripts/psychic-veil.mjs`). Played live.
  - Dreadful Strikes (Fey Wanderer 3, p.124): the extra Psychic die is once per turn for each target, not once per turn for the
    ranger (`scripts/dreadful-strikes.mjs`). Played live.
  - Inspiring Smite (Oath of Glory 3, p.114): the Temporary Hit Points are divided as the paladin likes (`choose`). Played live:
    the "divide" window opens after the creatures are ticked, and the split entered (1 and 7 of 8) is the one applied.
- World diagnostic: Plutonium is declared to DAS · Core as an item importer (`scripts/importers.mjs`), so the diagnostic
  lists Plutonium items whose rule cites ids they do not have and can replace them with the official item. Needs a DAS · Core
  with `api.diagnostic.registerImporter` (dnd5e-combat pull request 133, not released yet); nothing happens on an older one.
- Senses from other books, on the engine's generic `sense` block (`scripts/rules/books/mpmm.mjs`, `xge.mjs`): Life Sense (MPMM p.250,
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
