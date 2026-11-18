# ✅ TODO

Data for every non-official spell imported by DDB Importer (activity and effect ids, text): `../darshyne-das/audit/ddb-only-spells.json`.

## Shadow Blade

- [ ] Detect a dropped blade (item deleted or unequipped by the player).
- [ ] Propose `target.inDimLight` / `target.inDarkness` facts upstream, so the Advantage becomes a declarative rule with its
      reason on the chat card.

## Rules written, to play

- [ ] Still only validated: Zephyr Strike, Holy Weapon, Pyrotechnics, Snare, Watery Sphere, Power Word Pain, Wall of Light,
      Incite Greed. How to play a rule without a mouse: `../darshyne-das/audit/live-helpers.js` (scene "DAS Test Arena").
- [ ] Everything from a player's client (so far the GM's client only).

## Next rules

Declarative, waiting on the engine:

- [ ] Maximilian's Earthen Grasp, Whirlwind, Wrath of Nature, Bones of the Earth: "use an action to make a check" to get free.
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
