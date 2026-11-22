# ✨ What it covers

Every rule of DAS · Rule Pack, book by book. Back to the [README](../README.md).

"Played" means the rule was exercised in a running world (Foundry 14.370, dnd5e 6.1.0, DAS · Core 0.283.0, items imported by
DDB Importer 7.6.0), on the GM's client, through the engine's own testing interface. "Validated" means the rule passes the
engine's validator and uses the same building block as a rule that was played (the repeated save at the end of a turn is the
one played with Psychic Scream), but has not been played itself. Nothing was played from a player's client.

"Pending" means the rule is written for a key that no released DAS · Core knows yet (the `sense` block): it is registered,
and rejected by an older engine without harm, but was neither validated by this repository's tests nor played.

The tables below are generated from the rules themselves (`scripts/rules/books/`, `npm run books`; do not edit them by hand), book by book: first the
books published as an official Foundry VTT module, then the others, by year.

<!-- auto:rules -->
### TCE · Tasha's Cauldron of Everything (2020)

Published as an official Foundry VTT module (`dnd-tashas-cauldron`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Booming Blade | Spell | p.106 | Casting it makes one melee attack with a weapon you hold (you choose if you hold several). From 5th level the attack adds 1d8 thunder on a hit (2d8 at 11th, 3d8 at 17th). A target that is hit is sheathed until the start of your next turn: if it moves 5 feet or more of its own will, it takes 1d8 thunder (one more die at 5th, 11th and 17th) and the spell ends. Pushes and pulls by the engine do not set it off. Not checked on official (the rule predates it). | code | Played |
| Green-Flame Blade | Spell | p.107 | Casting it makes one melee attack with a weapon you hold. From 5th level the attack adds 1d8 fire on a hit (2d8 at 11th, 3d8 at 17th). On a hit you choose a creature within 5 feet of the target: it takes fire damage equal to your spellcasting modifier, plus the same dice. Not checked on official (the rule predates it). | code | Played |
| Lightning Lure | Spell | p.107 | On a failed save the target is pulled up to 10 ft toward the caster. The imported item's target (a "0-foot emanation" that never contains anyone) is corrected to one creature. Not checked on official (the rule predates it). | table | Played |
| Tasha's Mind Whip | Spell | p.115 | No reactions until the end of the target's next turn; on that turn, an action or a bonus action, not both. Not checked on official (the rule predates it). | table | Played |
| Tasha's Caustic Brew | Spell | p.115 | No damage on the cast; 2d4 acid at the start of each of the target's turns; an action ends it. Not checked on official (the rule predates it). | table | Played |

### XPHB · Player's Handbook (2024)

Published as an official Foundry VTT module (`dnd-players-handbook`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Psychic Veil (Soulknife 13) | Feature | p.135 | A missed attack no longer drops the invisibility; an attack that hits and deals damage still does. | code + table | Played |
| Inspiring Smite (Oath of Glory 3) | Feature | p.114 | The Temporary Hit Points are divided among the chosen creatures as the paladin likes, where the engine splits them evenly. | table | Played |
| Dreadful Strikes (Fey Wanderer 3) | Feature | p.124 | The extra Psychic die is once per turn for each target, not once per turn for the ranger. | code + table | Played |

### XMM · Monster Manual (2025)

Published as an official Foundry VTT module (`dnd-monster-manual`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Whirlwind (Air Elemental) | undefined | p.13 | On a failed save the target is also shoved 20 feet away; the size limit on targets is left to the GM. | table | Validated |
| Slowing Breath (Ancient Copper Dragon) | undefined | p.80 | On a failed save the target loses reactions, gets only an action or a bonus action, until the end of its next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Feral Strike (Animal Lord) | undefined | p.15 | Movement made with this legendary action provokes no opportunity attacks; the attack is a separate roll. | table | Validated |
| Flame Whip (Balor) | undefined | p.26 | A hit also drags the target 25 feet toward the balor; the size limit is left to the GM. Not covered on ddb-importer: triggers holds one origin; this item has its own attack. | table | Validated |
| Death Throes (Balor) | undefined | p.26 | A successful save halves the explosion damage; the table triggers it when the balor dies. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Horrify (Banshee) | undefined | p.29 | Fear on a failed save ends when the banshee's next turn starts. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Beard (Bearded Devil) | undefined | p.33 | The poison from a hit ends when the devil's next turn starts. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Infernal Sting (Bone Devil) | undefined | p.52 | The poison from a hit ends when the devil's next turn starts. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Deadly Leap (Bulette) | undefined | p.63 | A successful save halves the damage and pushes the target 5 feet away. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Trampling Charge (Centaur Trooper) | undefined | p.67 | The charge move provokes no opportunity attacks. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Entangling Trail (Centaur Warden) | undefined | p.67 | The move provokes no opportunity attacks; restraint ends at the end of the target's next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Unnerving Gaze (Chain Devil) | undefined | p.68 | Fear from a failed save ends at the end of the target's own turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Drone (Chasme) | undefined | p.69 | The sleeper rolls a fresh save whenever one of its turns ends; the sleep lasts ten minutes at most. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Moan (Cloaker) | undefined | p.73 | The fear from a failed save ends when the cloaker's next turn ends. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |

### PHB · Player's Handbook (2014)

Not published on Foundry.

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Otto's Irresistible Dance (2014) | Spell | p.264 | Disadvantage on the dancer's attacks, Advantage on attacks against it, and an action to repeat the Wisdom save. The 2024 spell is covered by DAS · Core. | table | Played |

### XGE · Xanathar's Guide to Everything (2017)

Not published on Foundry.

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Shadow Blade | Spell | p.164 | The blade is in the caster's hand as soon as the spell is cast (created on the spot, or adopted when the item's own data conjures it), sized by the slot (2d8 / 3d8 / 4d8 / 5d8), and leaves with the concentration. Advantage against a target in dim light or darkness. A thrown blade dissipates at the end of the turn; casting the spell again while concentrating brings it back without a slot. | code + table | Played |
| Frostbite | Spell | p.156 | Disadvantage on the target's next weapon attack before the end of its next turn, then the effect is spent. | table | Played |
| Zephyr Strike | Spell | p.171 | The caster's movement provokes no opportunity attacks while the spell lasts. | table | Validated |
| Psychic Scream | Spell | p.163 | A stunned target repeats the save at the end of each of its turns. | table | Played |
| Holy Weapon | Spell | p.157 | A creature blinded by the burst repeats the save at the end of each of its turns. | table | Validated |
| Earth Tremor | Spell | p.155 | No damage on a successful save (the imported data gives half). | table | Played |
| Pyrotechnics | Spell | p.163 | Blinded by the fireworks ends at the end of the caster's next turn. | table | Validated |
| Snare | Spell | p.165 | A restrained creature repeats the save at the end of each of its turns. | table | Validated |
| Watery Sphere | Spell | p.170 | A restrained creature repeats the save at the end of each of its turns. | table | Validated |
| Power Word Pain | Spell | p.163 | The target repeats the Constitution save at the end of each of its turns. | table | Validated |
| Wall of Light | Spell | p.170 | A blinded creature repeats the save at the end of each of its turns. | table | Validated |
| Ghostly Gaze (Eldritch Invocation) | Sense | p.56 | A sight that walls do not stop within 30 ft, carried by the effect the invocation places on its user; off while the user is Blinded. | table | Played |

### AI · Acquisitions Incorporated (2019)

Not published on Foundry.

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Incite Greed | Spell | p.76 | A charmed target repeats the save at the end of each of its turns. | table | Validated |

### FTD · Fizban's Treasury of Dragons (2021)

Not published on Foundry.

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Raulothim's Psychic Lance | Spell | p.21 | Incapacitated ends at the start of the caster's next turn. | table | Played |

### MPMM · Mordenkainen Presents: Monsters of the Multiverse (2022)

Not published on Foundry.

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Life Sense (Vampiric Mist) | Sense | p.250; MTF p.246 | The location of every creature within 60 ft, Constructs and Undead excepted; walls do not stop it. | table | Played |

38 rules: 16 played, 22 validated. 4 of them reviewed with Ruling R24 tolerances (not an exact agreement).
<!-- /auto:rules -->

The spell rules that name an activity or an effect use the ids of the items imported by **DDB Importer**. The same spell
brought in by another tool keeps the engine's general rules only. The class features of the Player's Handbook (2024) use the
ids of the official module, the same ids DAS · Core's own entries cite: there the pack completes an entry the engine already
has.

Shadow Blade, Booming Blade and Green-Flame Blade are handled in code and recognised by their dnd5e identifier alone, so they
work whatever tool imported the spell. Psychic Veil and Dreadful Strikes are completed in code too, on top of their entry.

The module also declares Plutonium to DAS · Core's world diagnostic as an item importer (`scripts/importers.mjs`), on an
engine that has `api.diagnostic.registerImporter`.
