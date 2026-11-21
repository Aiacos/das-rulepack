# ✅ TODO

Data for every non-official spell imported by DDB Importer (activity and effect ids, text): `../darshyne-das/audit/ddb-only-spells.json`.

## Rulebook pipeline

After the pilot (`docs/pilot-xphb-spells.md`):

- [x] Triage of the 114 XPHB spells left by the rule: 97 verdicts applied (95 from the SRD 5.2 reading of November 2026, 2
      by a reader agent), see `docs/pilot-xphb-spells.md`.
- [ ] `registry/queue.json`: 403 entries wait for a person (low-confidence readings and `engine` verdicts).
- [ ] 6 spells without a verdict: Blight, Control Water, Time Stop, Zone of Truth (fixes proposed to DAS · Core), and
      Leomund's Secret Chest and Leomund's Tiny Hut (the official module's identifier differs from the SRD one the engine
      uses — to be checked in play, then reported upstream).
- [x] `npm run resolve` settles an ambiguous match by hand; reprints are recorded and checked by the ids gate.
- [ ] The one ambiguous DDB Importer match (`xphb:spell:flaming-sphere`): the official module and the dataset agree on the
      school, DDB Importer's item has another one — same entry, importer data to be reported; settle it with `resolve`.
- [ ] Plutonium: dump its items and run the check; every Plutonium match is `unchecked` for now.
- [ ] 2,209 entries have the verdict `entry` and no rule yet: drafting is the next stage to build.
- [x] Second-reader sample (200 entries, three kinds): same verdict on 88%, same answer to "needs a rule or not" on 96.5% —
      `docs/reader-agreement.md`. Spells, species and older books are not sampled yet.
- [ ] `plainText` drops the attack header of monster attacks (`{@atkr m}`, `{@hit 7}` become "m 7"): fix the conversion, then
      re-fingerprint (every affected record will report `textChanged`).
- [ ] The stages not built: drafting, independent review, scenario generation and play, drift.
- [x] Every kind of entry is inventoried (milestone 2), and six 2024-era books are in the registry: `docs/coverage-5e24.md`.
- [ ] 15 entries still have no verdict and are not queued (entries without text that no batch can carry: species shells and
      a few text-less lines); all six 2024-era books were read by reader agents on 2026-11-21 (76 batches).
- [ ] 168 ambiguous official matches to settle with `npm run resolve`; 425 entries with no official item to look at by category.
- [ ] Ravenloft: The Horrors Within is not in the dataset (no text to fingerprint); Arcana Unleashed and World of Warcraft
      have a local dump since 2026-11-21 but are not in the dataset.
- [x] The older books are inventoried and triaged by rule (2026-11-21): 39 books, 19,143 entries, `docs/coverage.md`.
- [x] Older books: the entries that have an item in a local source are read (2026-11-21). 11,945 entries stay without a
      verdict: almost all are monster features of books with no official module and no local item — they need a dump of
      imported items (Plutonium, or DDB Importer's monsters) before a reader can judge them.
- [ ] `batch` should skip entries with no item in any origin by default (a flag to include them): reading them fills the
      queue with low-confidence verdicts.
- [ ] The three XPHB feature rules (Dreadful Strikes, Inspiring Smite, Psychic Veil) and the rules of FTD, MPMM, AI and PHB
      are still legacy records without item data: their keys carry no owner, or their book has no dump of that kind.
- [ ] A rule whose named origin has `identifierDiffers` (16 spells: the official module and DDB Importer name them
      differently) needs a second identifier before it can pass the ids gate.
- [x] A record that has a rule keeps its identifier and page on re-inventory; `generate` emits `SOURCES` (empty today).
- [ ] Before the first drafted rule: a rule for a monster feature needs an identifier scoped to its creature (many
      creatures share a feature name, and the engine knows a generic entry under it: `hint: "core-generic"`); a data fix
      on an item embedded in an actor (`<actor id>.<item id>`) has no document the data-fix gate can read yet.
- [ ] Before the first non-legacy rule is gated: the ids gate does not find ids inside `#id`, `a/b` or `@UUID[…]` strings; a data
      fix without `from` on a mistyped path passes.
- [ ] Before a release built from the registry: run the local gates (dumps and text cache) and fail on any registry difference;
      `ingest` saves the books and the queue in two steps.
- [ ] The 24 migrated rules have no item data attached (`ids`, `fixes`, `text` are notes): attach DDB Importer items by
      inventorying their books, then they can leave `registry/legacy.json`. `saveTashCausBrew` (Tasha's Caustic Brew) is
      to be checked against the imported item.
- [ ] Run the CI workflow on GitHub once (it was only simulated locally, on Node 20, against DAS · Core v0.289.0).

## Shadow Blade

- [ ] Detect a dropped blade (item deleted or unequipped by the player).
- [ ] Propose `target.inDimLight` / `target.inDarkness` facts upstream, so the Advantage becomes a declarative rule with its
      reason on the chat card.

## Books

Progress by rulebook: README, "Progress by rulebook"; every rule by book: `docs/RULES.md` (both written by `npm run books`). One module per book in `scripts/rules/books/`.

- [ ] Tasha's Cauldron of Everything has an official Foundry module (`dnd-tashas-cauldron`, read on 2026-11-20). The pack's
      TCE rules were written against items imported by DDB Importer: re-check Lightning Lure, Tasha's Mind Whip and Tasha's
      Caustic Brew against the official module's activity and effect ids (and the Lightning Lure data fix against its
      data), and Booming Blade / Green-Flame Blade against its items. Rules unchanged until then.
- [ ] `docs/books.json` is a copy of the audit's counts of 2026-11-19: copy it again when the audit is recomputed. The
      audit's own list of the pack's identifiers misses the rules handled in code alone (Booming Blade, Green-Flame Blade).
- [ ] Official Foundry packages with no book in the catalogue (`docs/foundry-modules.json`, `"book": null`): decide whether
      the catalogue should list them.

## Rules written, to play

- [ ] Still only validated: Zephyr Strike, Holy Weapon, Pyrotechnics, Snare, Watery Sphere, Power Word Pain, Wall of Light,
      Incite Greed. How to play a rule without a mouse: `../darshyne-das/audit/live-helpers.js` (scene "DAS Test Arena").
- [x] Life Sense and Ghostly Gaze: validated by the contract tests against DAS · Core 0.288.0 (`DAS_CORE=<clone of main> npm test`: 59
  passed, none skipped); played earlier on hand-made features (12 cases, GM client). Still to play on an imported creature.
- [ ] Everything from a player's client (so far the GM's client only).

## Next rules

Declarative, waiting on the engine:

- [ ] Maximilian's Earthen Grasp, Whirlwind, Wrath of Nature, Bones of the Earth: an action and an ability check to get free.
      The engine reads a check written without a DC from DAS · Core 0.284.0 (pull request #57, merged): the rules can
      now be written. Maximilian's also rolls
      both of its 2d6 parts at once in the imported data.
- [ ] Enemies Abound: repeat the save when damaged — the imported item has no effect to carry the rule.

Need code, like Shadow Blade:

- [x] Booming Blade and Green-Flame Blade (0.4.0).
- [ ] Booming Blade, Green-Flame Blade: have the engine count the cast as a spell that takes the action (no Extra Attack
      after it). Asked upstream: DAS · Core issue #69 (generic building blocks).
- [ ] Zephyr Strike and Holy Weapon: bonus damage on a hit.

Zones and recurring damage, to study against the engine's zone rules:

- [ ] Create Bonfire, Sickening Radiance, Healing Spirit, Storm Sphere, Immolation, Enervation, Shadow of Moil.

Not planned: spells whose imported data contradicts the text in a way a rule cannot repair (Feeblemind: full damage on a
successful save; Mental Prison: the 10d10 rolled with the 5d10).
