# ✅ TODO

Data for every non-official spell imported by DDB Importer (activity and effect ids, text): `../darshyne-das/audit/ddb-only-spells.json`.

## Shadow Blade

- [ ] Detect a dropped blade (item deleted or unequipped by the player).
- [ ] Propose `target.inDimLight` / `target.inDarkness` facts upstream, so the Advantage becomes a declarative rule with its
      reason on the chat card.

## Rules written, to play

- [ ] Play the rules marked "Validated" in the README in a lit scene with a real mouse (the test scene is dark, and aiming
      an area cannot be driven from a headless browser).

## Next rules

Declarative, waiting on the engine:

- [ ] Maximilian's Earthen Grasp, Whirlwind, Wrath of Nature, Bones of the Earth: "use an action to make a check" to get free.
      Needs the engine to read a check written without a DC (pull request sent to DAS · Core). Maximilian's also rolls
      both of its 2d6 parts at once in the imported data.
- [ ] Enemies Abound: repeat the save when damaged — the imported item has no effect to carry the rule.

Need code, like Shadow Blade (a weapon attack made as part of the spell):

- [ ] Booming Blade (TCE p.106): weapon attack; thunder dice from 5th level; 1d8 thunder if the target moves willingly.
- [ ] Green-Flame Blade (TCE p.107): weapon attack; fire damage to a second creature within 5 ft.
- [ ] Zephyr Strike and Holy Weapon: bonus damage on a hit.

Zones and recurring damage, to study against the engine's zone rules:

- [ ] Create Bonfire, Sickening Radiance, Healing Spirit, Storm Sphere, Immolation, Enervation, Shadow of Moil.

Not planned: spells whose imported data contradicts the text in a way a rule cannot repair (Feeblemind: full damage on a
successful save; Mental Prison: the 10d10 rolled with the 5d10).
