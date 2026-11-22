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

Held for a person (Ruling R27): gated, not registered with DAS · Core until a person settles them.

| Held rule | Kind | Page | Status |
|---|---|---|---|
| Whirlwind (Air Elemental) | Monster feature | p.13 | Held: the engine already reads this feature's text: to be compared first |
| Slowing Breath (Ancient Copper Dragon) | Monster feature | p.80 | Held: the engine already reads this feature's text: to be compared first |
| Feral Strike (Animal Lord) | Monster feature | p.15 | Held: the engine already reads this feature's text: to be compared first |
| Flame Whip (Balor) | Monster feature | p.26 | Held: the engine already reads this feature's text: to be compared first |
| Death Throes (Balor) | Monster feature | p.26 | Held: the engine already reads this feature's text: to be compared first |
| Horrify (Banshee) | Monster feature | p.29 | Held: the engine already reads this feature's text: to be compared first |
| Beard (Bearded Devil) | Monster feature | p.33 | Held: the engine already reads this feature's text: to be compared first |
| Infernal Sting (Bone Devil) | Monster feature | p.52 | Held: the engine already reads this feature's text: to be compared first |
| Deadly Leap (Bulette) | Monster feature | p.63 | Held: the engine already reads this feature's text: to be compared first |
| Trampling Charge (Centaur Trooper) | Monster feature | p.67 | Held: the engine already reads this feature's text: to be compared first |
| Entangling Trail (Centaur Warden) | Monster feature | p.67 | Held: the engine already reads this feature's text: to be compared first |
| Unnerving Gaze (Chain Devil) | Monster feature | p.68 | Held: the engine already reads this feature's text: to be compared first |
| Drone (Chasme) | Monster feature | p.69 | Held: the engine already reads this feature's text: to be compared first |
| Hasten (Clay Golem) | Monster feature | p.72 | Held: the engine already reads this feature's text: to be compared first |
| Stomp (Colossus) | Monster feature | p.76 | Held: the engine already reads this feature's text: to be compared first |
| Grave-Dust Flight (Demilich) | Monster feature | p.96 | Held: the engine already reads this feature's text: to be compared first |
| Dreadful Howl (Dire Worg) | Monster feature | p.335 | Held: the engine already reads this feature's text: to be compared first |
| Create Whirlwind (Djinni) | Monster feature | p.99 | Held: the engine already reads this feature's text: to be compared first |
| Unsettling Visage (Doppelganger) | Monster feature | p.100 | Held: the engine already reads this feature's text: to be compared first |
| Terrifying Presence (Dracolich) | Monster feature | p.102 | Held: the engine already reads this feature's text: to be compared first |
| Fetid Cloud (Dretch) | Monster feature | p.103 | Held: the engine already reads this feature's text: to be compared first |
| Rumbling Movement (Elemental Cataclysm) | Monster feature | p.111 | Held: the engine already reads this feature's text: to be compared first |
| Sacred Weapon (Empyrean) | Monster feature | p.113 | Held: the engine already reads this feature's text: to be compared first |
| Hammer Throw (Fire Giant) | Monster feature | p.119 | Held: the engine already reads this feature's text: to be compared first |
| Stench Spray (Flumph) | Monster feature | p.122 | Held: the engine already reads this feature's text: to be compared first |
| Claw (Ghast Gravecaller) | Monster feature | p.130 | Held: the engine already reads this feature's text: to be compared first |
| Claw (Ghast) | Monster feature | p.130 | Held: the engine already reads this feature's text: to be compared first |
| Horrific Visage (Ghost) | Monster feature | p.131 | Held: the engine already reads this feature's text: to be compared first |
| Claw (Ghoul) | Monster feature | p.132 | Held: the engine already reads this feature's text: to be compared first |
| Boulder Toss (Giant Ape) | Monster feature | p.354 | Held: the engine already reads this feature's text: to be compared first |
| Draconic Strike (Githyanki Dracomancer) | Monster feature | p.135 | Held: the engine already reads this feature's text: to be compared first |
| Psychic Warp (Githzerai Psion) | Monster feature | p.137 | Held: the engine already reads this feature's text: to be compared first |
| Brutal Gore (Goristro) | Monster feature | p.150 | Held: the engine already reads this feature's text: to be compared first |
| Haunting Glare (Graveyard Revenant) | Monster feature | p.260 | Held: the engine already reads this feature's text: to be compared first |
| Suffocate (Graveyard Revenant) | Monster feature | p.260 | Held: the engine already reads this feature's text: to be compared first |
| Chaos Claw (Gray Slaad) | Monster feature | p.286 | Held: the engine already reads this feature's text: to be compared first |
| Chaos Staff (Green Slaad) | Monster feature | p.286 | Held: the engine already reads this feature's text: to be compared first |
| Paralyzing Tentacles (Grell) | Monster feature | p.157 | Held: the engine already reads this feature's text: to be compared first |
| Luring Song (Harpy) | Monster feature | p.164 | Held: the engine already reads this feature's text: to be compared first |
| Ice Spear (Ice Devil) | Monster feature | p.176 | Held: the engine already reads this feature's text: to be compared first |
| Sleep Gaze (Jackalwere) | Monster feature | p.182 | Held: the engine already reads this feature's text: to be compared first |
| Toxic Ink (Kraken) | Monster feature | p.187 | Held: the engine already reads this feature's text: to be compared first |
| Sticky Net (Kuo-toa) | Monster feature | p.189 | Held: the engine already reads this feature's text: to be compared first |
| Watery Rush (Lacedon Ghoul) | Monster feature | p.132 | Held: the engine already reads this feature's text: to be compared first |
| Paralyzing Touch (Lich) | Monster feature | p.196 | Held: the engine already reads this feature's text: to be compared first |
| Sickening Vapors (Manes Vaporspawn) | Monster feature | p.201 | Held: the engine already reads this feature's text: to be compared first |
| Water Jet (Marid) | Monster feature | p.203 | Held: the engine already reads this feature's text: to be compared first |
| Aquatic Burst (Merfolk Wavebender) | Monster feature | p.209 | Held: the engine already reads this feature's text: to be compared first |
| Watery Rebuke (Merfolk Wavebender) | Monster feature | p.209 | Held: the engine already reads this feature's text: to be compared first |
| Harpoon (Merrow) | Monster feature | p.210 | Held: the engine already reads this feature's text: to be compared first |
| Paralysis Gas (Modron Pentadrone) | Monster feature | p.218 | Held: the engine already reads this feature's text: to be compared first |
| Tentacle Slam (Otyugh) | Monster feature | p.233 | Held: the engine already reads this feature's text: to be compared first |
| Telekinetic Thrust (Poltergeist) | Monster feature | p.246 | Held: the engine already reads this feature's text: to be compared first |
| Scare (Quasit) | Monster feature | p.252 | Held: the engine already reads this feature's text: to be compared first |
| Vengeful Glare (Revenant) | Monster feature | p.259 | Held: the engine already reads this feature's text: to be compared first |
| Swoop (Roc) | Monster feature | p.261 | Held: the engine already reads this feature's text: to be compared first |
| Blazing Movement (Salamander Inferno Master) | Monster feature | p.267 | Held: the engine already reads this feature's text: to be compared first |
| Vile Appearance (Sea Hag) | Monster feature | p.271 | Held: the engine already reads this feature's text: to be compared first |
| Charged Tendril (Shambling Mound) | Monster feature | p.276 | Held: the engine already reads this feature's text: to be compared first |
| Protection (Shield Guardian) | Monster feature | p.277 | Held: the engine already reads this feature's text: to be compared first |
| Cinder Breath (Smoke Mephit) | Monster feature | p.208 | Held: the engine already reads this feature's text: to be compared first |
| Spell Reflection (Spectator) | Monster feature | p.289 | Held: the engine already reads this feature's text: to be compared first |
| Mind-Rending Roar (Sphinx of Lore) | Monster feature | p.293 | Held: the engine already reads this feature's text: to be compared first |
| Fetid Aura (Swarm of Dretches) | Monster feature | p.104 | Held: the engine already reads this feature's text: to be compared first |
| Cacophony (Swarm of Ravens) | Monster feature | p.371 | Held: the engine already reads this feature's text: to be compared first |
| Warhammer (Tough Boss) | Monster feature | p.307 | Held: the engine already reads this feature's text: to be compared first |
| Grasping Root (Tree Blight) | Monster feature | p.44 | Held: the engine already reads this feature's text: to be compared first |
| Hypnotic Gaze (Ultroloth) | Monster feature | p.311 | Held: the engine already reads this feature's text: to be compared first |
| Charging Horn (Unicorn) | Monster feature | p.313 | Held: the engine already reads this feature's text: to be compared first |
| Spore Bomb (Violet Fungus Necrohulk) | Monster feature | p.126 | Held: the engine already reads this feature's text: to be compared first |
| Spores (Vrock) | Monster feature | p.319 | Held: the engine already reads this feature's text: to be compared first |
| Stunning Screech (Vrock) | Monster feature | p.319 | Held: the engine already reads this feature's text: to be compared first |
| Tactical Charge (Warrior Commander) | Monster feature | p.321 | Held: the engine already reads this feature's text: to be compared first |
| Prowl (Tiger or Hybrid Form Only) (Weretiger) | Monster feature | p.326 | Held: the engine already reads this feature's text: to be compared first |
| Toxic Escape (Yochlol) | Monster feature | p.341 | Held: the engine already reads this feature's text: to be compared first |

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

24 rules: 16 played, 8 validated. 75 more held for a person, not shipped (the engine already reads this feature's text: to be compared first 75).
<!-- /auto:rules -->

The spell rules that name an activity or an effect use the ids of the items imported by **DDB Importer**. The same spell
brought in by another tool keeps the engine's general rules only. The class features of the Player's Handbook (2024) use the
ids of the official module, the same ids DAS · Core's own entries cite: there the pack completes an entry the engine already
has.

Shadow Blade, Booming Blade and Green-Flame Blade are handled in code and recognised by their dnd5e identifier alone, so they
work whatever tool imported the spell. Psychic Veil and Dreadful Strikes are completed in code too, on top of their entry.

The module also declares Plutonium to DAS · Core's world diagnostic as an item importer (`scripts/importers.mjs`), on an
engine that has `api.diagnostic.registerImporter`.
