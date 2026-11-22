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
| Zone of Truth | Spell | p.343 | The 15-foot sphere is laid, and a creature coming in or beginning its turn there saves again, once per turn. Not covered on ddb-importer: its save is a second, special activity after a utility cast; the replay is bound to one origin. Partial: 1 expectation left to the table (out-of-combat 1). | table, partial | Validated |

Held for a person (Ruling R27): gated, not registered with DAS · Core until a person settles them.

| Held rule | Kind | Page | Status |
|---|---|---|---|
| Control Water | Spell | p.256 | Held: review disagrees |

### FRAIF · Forgotten Realms: Adventures in Faerûn (2025)

Published as an official Foundry VTT module (`dnd-adventures-faerun`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Orb of Damara | Item | p.246 | Foes beginning their turn near the bearer roll the fear save; frightened lasts until that foe's next turn begins. Not covered on ddb-importer: emanation holds a single activity id; the importer item splits the aura into its own utility and save activities. Partial: 7 expectations left to the table (form-change 1, immunity-after-save 1, no-key 2, out-of-combat 1, table-ruling 1, use-time-choice 1). | table, partial | Validated |
| Ulcrun | Item | p.237 | A successful save deals no damage at all. Partial: 1 expectation left to the table (no-key 1). | table, partial | Validated |

Held for a person (Ruling R27): gated, not registered with DAS · Core until a person settles them.

| Held rule | Kind | Page | Status |
|---|---|---|---|
| Prespra | Item | p.237 | Held: review disagrees |

### XMM · Monster Manual (2025)

Published as an official Foundry VTT module (`dnd-monster-manual`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Whirlwind (Air Elemental) | Monster feature | p.13 | A failed save also shoves the target 20 feet away from the elemental; a success halves the damage. Partial: 1 expectation left to the table (target-size 1). | table, partial | Validated |
| Slowing Breath (Ancient Copper Dragon) | Monster feature | p.80 | The slowing effect from the breath lasts until the affected creature finishes its next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Unnerving Gaze (Chain Devil) | Monster feature | p.68 | The fear ends at the end of the turn it was imposed in. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 2 expectations left to the table (immunity-after-save 1, table-ruling 1). | table, partial | Validated |
| Hasten (Clay Golem) | Monster feature | p.72 | After using it, the golem's movement provokes no opportunity attacks. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 1 expectation left to the table (no-key 1). | table, partial | Validated |
| Dreadful Howl (Dire Worg) | Monster feature | p.335 | The fear ends when the worg's following turn begins; a save halves the damage. Partial: 1 expectation left to the table (no-key 1). | table, partial | Validated |
| Terrifying Presence (Dracolich) | Monster feature | p.102 | The fear ends when the target's following turn ends; a save avoids the damage. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 1 expectation left to the table (no-key 1). | table, partial | Validated |
| Sacred Weapon (Empyrean) | Monster feature | p.113 | The stun ends when the user's next turn begins; the extra damage ignores resistance. Partial: 2 expectations left to the table (no-key 1, table-ruling 1). Carries over 1 engine key (usageLimits). | table, partial | Validated |
| Stench Spray (Flumph) | Monster feature | p.122 | The poison from a failed save lasts 1d4 hours. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 2 expectations left to the table (no-key 1, out-of-combat 1). | table, partial | Validated |
| Suffocate (Graveyard Revenant) | Monster feature | p.260 | The held creature can end the grip, and the choking with it, by winning a check as an action. Partial: 2 expectations left to the table (table-ruling 1, target-size 1). | table, partial | Validated |
| Sleep Gaze (Jackalwere) | Monster feature | p.182 | Another creature can spend an action to wake the sleeper; the sleep lasts ten minutes. Partial: 3 expectations left to the table (immunity-after-save 1, no-key 2). | table, partial | Validated |
| Toxic Ink (Kraken) | Monster feature | p.187 | The blinding and poisoning end when the kraken's next turn ends. Partial: 3 expectations left to the table (no-key 2, table-ruling 1). | table, partial | Validated |
| Icy Bite (Lacedon Ghoul) | Monster feature | p.132 | The slowing effect ends when the user's next turn begins. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Validated |
| Telekinetic Thrust (Poltergeist) | Monster feature | p.246 | A failed save also shoves the target 30 feet away from the user. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (magical). | table | Validated |
| Hypnotic Gaze (Ultroloth) | Monster feature | p.311 | The stun lasts until the ultroloth begins its next turn; a successful save takes no damage. Partial: 1 expectation left to the table (immunity-after-save 1). | table, partial | Validated |
| Spore Bomb (Violet Fungus Necrohulk) | Monster feature | p.126 | Half damage on a save; the poison lasts until the necrohulk begins its next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 1 expectation left to the table (healing-block 1). | table, partial | Validated |

Held for a person (Ruling R27): gated, not registered with DAS · Core until a person settles them.

| Held rule | Kind | Page | Status |
|---|---|---|---|
| Cloud of Insects (Adult Black Dragon) | Monster feature | p.39 | Held: reviewer unsure |
| Sleep Breath (Adult Brass Dragon) | Monster feature | p.55 | Held: reviewer unsure |
| Scorching Sands (Adult Brass Dragon) | Monster feature | p.55 | Held: reviewer unsure |
| Slowing Breath (Adult Copper Dragon) | Monster feature | p.79 | Held: reviewer unsure |
| Noxious Miasma (Adult Green Dragon) | Monster feature | p.153 | Held: reviewer unsure |
| Cold Gale (Adult Silver Dragon) | Monster feature | p.279 | Held: review disagrees |
| Feral Strike (Animal Lord) | Monster feature | p.15 | Held: the engine already does it |
| Death Throes (Balor) | Monster feature | p.26 | Held: review disagrees |
| Horrify (Banshee) | Monster feature | p.29 | Held: the engine already does it |
| Beard (Bearded Devil) | Monster feature | p.33 | Held: the engine already does it |
| Infernal Sting (Bone Devil) | Monster feature | p.52 | Held: the engine already does it |
| Deadly Leap (Bulette) | Monster feature | p.63 | Held: the engine already does it |
| Trampling Charge (Centaur Trooper) | Monster feature | p.67 | Held: the engine already does it |
| Entangling Trail (Centaur Warden) | Monster feature | p.67 | Held: the engine already does it |
| Drone (Chasme) | Monster feature | p.69 | Held: changes the engine's reading: a person decides |
| Stomp (Colossus) | Monster feature | p.76 | Held: the engine already does it |
| Grave-Dust Flight (Demilich) | Monster feature | p.96 | Held: the engine already does it |
| Create Whirlwind (Djinni) | Monster feature | p.99 | Held: changes the engine's reading: a person decides |
| Unsettling Visage (Doppelganger) | Monster feature | p.100 | Held: changes the engine's reading: a person decides |
| Rumbling Movement (Elemental Cataclysm) | Monster feature | p.111 | Held: the engine already does it |
| Hammer Throw (Fire Giant) | Monster feature | p.119 | Held: the engine already does it |
| Claw (Ghast Gravecaller) | Monster feature | p.130 | Held: the engine already does it |
| Claw (Ghast) | Monster feature | p.130 | Held: review disagrees |
| Horrific Visage (Ghost) | Monster feature | p.131 | Held: the engine already does it |
| Claw (Ghoul) | Monster feature | p.132 | Held: review disagrees |
| Draconic Strike (Githyanki Dracomancer) | Monster feature | p.135 | Held: review disagrees |
| Psychic Warp (Githzerai Psion) | Monster feature | p.137 | Held: review disagrees |
| Haunting Glare (Graveyard Revenant) | Monster feature | p.260 | Held: changes the engine's reading: a person decides |
| Chaos Claw (Gray Slaad) | Monster feature | p.286 | Held: reviewer unsure |
| Chaos Staff (Green Slaad) | Monster feature | p.286 | Held: reviewer unsure |
| Paralyzing Tentacles (Grell) | Monster feature | p.157 | Held: changes the engine's reading: a person decides |
| Luring Song (Harpy) | Monster feature | p.164 | Held: changes the engine's reading: a person decides |
| Ice Spear (Ice Devil) | Monster feature | p.176 | Held: the engine already does it |
| Sticky Net (Kuo-toa) | Monster feature | p.189 | Held: the engine already does it |
| Watery Rush (Lacedon Ghoul) | Monster feature | p.132 | Held: the engine already does it |
| Paralyzing Touch (Lich) | Monster feature | p.196 | Held: the engine already does it |
| Sickening Vapors (Manes Vaporspawn) | Monster feature | p.201 | Held: the engine already does it |
| Paralysis Gas (Modron Pentadrone) | Monster feature | p.218 | Held: changes the engine's reading: a person decides |
| Tentacle Slam (Otyugh) | Monster feature | p.233 | Held: review disagrees |
| Scare (Quasit) | Monster feature | p.252 | Held: changes the engine's reading: a person decides |
| Vengeful Glare (Revenant) | Monster feature | p.259 | Held: changes the engine's reading: a person decides |
| Swoop (Roc) | Monster feature | p.261 | Held: the engine already does it |
| Blazing Movement (Salamander Inferno Master) | Monster feature | p.267 | Held: the engine already does it |
| Vile Appearance (Sea Hag) | Monster feature | p.271 | Held: changes the engine's reading: a person decides |
| Protection (Shield Guardian) | Monster feature | p.277 | Held: review disagrees |
| Cinder Breath (Smoke Mephit) | Monster feature | p.208 | Held: the engine already does it |
| Spell Reflection (Spectator) | Monster feature | p.289 | Held: the engine already does it |
| Mind-Rending Roar (Sphinx of Lore) | Monster feature | p.293 | Held: the engine already does it |
| Fetid Aura (Swarm of Dretches) | Monster feature | p.104 | Held: changes the engine's reading: a person decides |
| Cacophony (Swarm of Ravens) | Monster feature | p.371 | Held: the engine already does it |
| Grasping Root (Tree Blight) | Monster feature | p.44 | Held: its identifier would drop engine behaviour |
| Charging Horn (Unicorn) | Monster feature | p.313 | Held: the engine already does it |
| Spores (Vrock) | Monster feature | p.319 | Held: changes the engine's reading: a person decides |
| Stunning Screech (Vrock) | Monster feature | p.319 | Held: the engine already does it |
| Tactical Charge (Warrior Commander) | Monster feature | p.321 | Held: the engine already does it |
| Prowl (Tiger or Hybrid Form Only) (Weretiger) | Monster feature | p.326 | Held: the engine already does it |
| Toxic Escape (Yochlol) | Monster feature | p.341 | Held: the engine already does it |

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

42 rules: 16 played, 26 validated. 7 of them reviewed with Ruling R24 tolerances (not an exact agreement). 15 of them partial (part of the entry left to the table). 59 more held for a person, not shipped (changes the engine's reading: a person decides 12, the engine already does it 29, its identifier would drop engine behaviour 1, review disagrees 10, reviewer unsure 7).
<!-- /auto:rules -->

The spell rules that name an activity or an effect use the ids of the items imported by **DDB Importer**. The same spell
brought in by another tool keeps the engine's general rules only. The class features of the Player's Handbook (2024) use the
ids of the official module, the same ids DAS · Core's own entries cite: there the pack completes an entry the engine already
has.

Shadow Blade, Booming Blade and Green-Flame Blade are handled in code and recognised by their dnd5e identifier alone, so they
work whatever tool imported the spell. Psychic Veil and Dreadful Strikes are completed in code too, on top of their entry.

The module also declares Plutonium to DAS · Core's world diagnostic as an item importer (`scripts/importers.mjs`), on an
engine that has `api.diagnostic.registerImporter`.
