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

### XDMG · Dungeon Master's Guide (2024)

Published as an official Foundry VTT module (`dnd-dungeon-masters-guide`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Book of Vile Darkness | Item | p.238 | A Fiend or an Undead is left unaffected by the book's speech. Not covered on ddb-importer: engineered against the official item only (Ruling R43). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The damage the speaker takes on each use, who stands within 15 feet, and the book's other properties (attunement save, lore, ability scores) stay with the GM. | table | Played |
| Sword of Answering | Item | p.313 | Hurt by an adjacent creature, the wielder is offered the sword's reaction attack on it, rolled with Advantage. Not covered on ddb-importer: engineered against the official item only (Ruling R43). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Ignoring the target's Immunity or Resistance, and a reach longer than 5 feet, are left to the GM. | table | Played |

Held for a person (Ruling R27): gated, not registered with DAS · Core until a person settles them.

| Held rule | Kind | Page | Status |
|---|---|---|---|
| Cloak of Invisibility | Item | p.244 | Held: review disagrees |
| Rival Coin | Item | p.296 | Held: review disagrees |

### XPHB · Player's Handbook (2024)

Published as an official Foundry VTT module (`dnd-players-handbook`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Psychic Veil (Soulknife 13) | Feature | p.135 | A missed attack no longer drops the invisibility; an attack that hits and deals damage still does. | code + table | Played |
| Inspiring Smite (Oath of Glory 3) | Feature | p.114 | The Temporary Hit Points are divided among the chosen creatures as the paladin likes, where the engine splits them evenly. | table | Played |
| Dreadful Strikes (Fey Wanderer 3) | Feature | p.124 | The extra Psychic die is once per turn for each target, not once per turn for the ranger. | code + table | Played |
| Power of the Wilds (Wild Heart 14) | Feature | p.55 | The option taken lasts only while the barbarian rages, and a second option in the same Rage is warned against. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The Lion's Disadvantage, the Ram's Prone on a hit and the Falcon's no-armor condition are applied by hand. | table | Played |
| Inspiring Movement (Dance 6) | Feature | p.64 | The bard is offered this reaction as soon as a visible adjacent foe finishes a turn. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Both half-Speed moves, the ally's reaction and their freedom from opportunity attacks are left to the players. | table | Played |
| Radiance of the Dawn (Light 3) | Feature | p.74 | The flash dispels the magical darkness its area covers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The flash is written as a dim light on its zone, lasting as long as the zone; whom the cleric chooses stays with the player; save and damage are the item's own. | table | Played |
| Arcane Charge (Eldritch Knight 15) | Feature | p.98 | Using the feature lets the fighter pick a destination at once and teleports them there, up to 30 feet away. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The link with Action Surge is the player's: the feature is used by hand when the surge is. | table | Played |
| Bulwark of Force (Psi Warrior 15) | Feature | p.99 | The cover the feature gives ends at once when the psi warrior who gave it becomes Incapacitated. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Restoring the use with a Psionic Energy Die is done by hand with the item's second activity. | table | Played |
| Hand of Harm (Mercy 3) | Feature | p.104 | On an Unarmed Strike that hits, the monk is offered the extra Necrotic damage for 1 Focus Point, once per turn. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The Poisoned rider a later Mercy feature adds to this strike is applied by hand. | table | Played |
| Cloak of Shadows (Shadow 17) | Feature | p.105 | The shroud can only be raised in Dim Light or Darkness, and it ends when the monk becomes Incapacitated. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Ending a turn in Bright Light, moving through occupied spaces and the free Flurry of Blows stay with the table. | table | Played |
| Shadow Step (Shadow 6) | Feature | p.105 | The teleport is only allowed from and to a space in Dim Light or Darkness, up to 60 feet away. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Advantage on the next melee attack this turn is applied by hand. | table | Played |
| Undying Sentinel (Ancients 15) | Feature | p.116 | At 0 Hit Points the paladin is asked whether to rise; the feature then spends its use and heals them. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The item heals from zero, one point short of the book: add 1 Hit Point by hand. Agelessness is narrative. | table | Played |
| Glorious Defense (Glory 15) | Feature | p.115 | The paladin is offered this reaction on a hit against itself or a seen creature within 10 feet; the attack loses its Charisma modifier. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The weapon attack on the attacker after a resulting miss is left to the player. | table | Played |
| Relentless Avenger (Vengeance 7) | Feature | p.117 | An Opportunity Attack of the paladin that hits puts the feature's Speed 0 effect on the creature hit. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The paladin's own move of half their Speed within the same Reaction is made by hand. | table | Played |
| Thought Shield (Great Old One 10) | Feature | p.163 | The bearer resists Psychic damage, and whoever deals it some takes as much as the bearer took. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Shielding thoughts from telepathy is left to the GM. | table | Played |
| Zone of Truth | Spell | p.343 | The 15-foot sphere is laid, and a creature coming in or beginning its turn there saves again, once per turn. Not covered on ddb-importer: its save is a second, special activity after a utility cast; the replay is bound to one origin. Partial: 1 expectation left to the table (out-of-combat 1). | table, partial | Validated |

Held for a person (Ruling R27): gated, not registered with DAS · Core until a person settles them.

| Held rule | Kind | Page | Status |
|---|---|---|---|
| Control Water | Spell | p.256 | Held: review disagrees |

### EFA · Eberron: Forge of the Artificer (2025)

Published as an official Foundry VTT module (`dnd-forge-artificer`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Greater Aberrant Mark | Feat | p.43 | The use of the Aberrant Dragonmark feat comes back on a Short Rest too. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The larger die is the item's own effect; the temporary hit points gained on casting a cantrip are used by hand from the item's activity. | table | Played |
| Greater Mark of Handling | Feat | p.43 | The command takes only a Beast or a Monstrosity. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: When the fright ends is left to the GM (the engine leaves a Frightened state behind when the item's effect ends); the mount's Reaction stays with the players; the larger die is the item's own effect. | table | Played |
| Eldritch Cannon (Artillerist 3) | Feature | p.16 | The cannon stays out of the turn order, is removed at 0 Hit Points, and goes after one hour. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: One cannon at a time, dismissing it early and aiming its options from the cannon's own space are the table's. | table | Played |
| Steel Defender (Battle Smith 3) | Feature | p.18 | The defender joins a running combat right after its maker, a new one sends the earlier away, and it goes if the maker dies. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Dodge unless commanded with a Bonus Action, acting freely while the maker is Incapacitated, and the revival timing are manual. | table | Played |
| Arcane Jolt (Battle Smith 9) | Feature | p.19 | On an attack that hits, the artificer is offered the extra Force damage for one use of the feature, once per turn. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The magic-weapon requirement, hits by the Steel Defender and the healing option are handled by hand. | table | Played |
| Mapping Magic (Cartographer 3) | Feature | p.21 | The jump takes its bearer to a free space up to 10 feet away, and no farther. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The movement the jump costs, the arrival beside a map holder, the ban at Speed 0 and the free castings of the feature stay with the player and the GM. | table | Played |
| Guided Precision (Cartographer 5) | Feature | p.21 | Damage taken asks for no Concentration save while Faerie Fire is the only spell the artificer concentrates on. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The Intelligence bonus to one damage roll each turn is added by hand with the item's activity. | table | Played |
| Boots of the Winding Path | Item | p.112 | Using the boots lets the wearer pick a destination at once and teleports them there, up to 15 feet away. Not covered on ddb-importer: engineered against the official item only (Ruling R43). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the wearer stood in the arrival space earlier this turn is the table's to check. | table | Played |
| Construct Resilience (Warforged) | Species trait | p.38 | The bearer rolls with Advantage a saving throw against anything that would give the Poisoned condition. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: A save made later only to END the Poisoned condition is rolled with Advantage by hand. | table | Played |
| Homunculus Servant | Spell | p.21 | The homunculus joins a running combat right after its caster, and casting again removes the earlier one. Not covered on ddb-importer: engineered against the official item only (Ruling R43). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Its Dodge and its moving out of danger when given no command are played by hand. | table | Played |

### FRAIF · Forgotten Realms: Adventures in Faerûn (2025)

Published as an official Foundry VTT module (`dnd-adventures-faerun`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Calimemnon Crystal | Item | p.243 | The cold aura stays around the wearer and hits creatures that come in or finish a turn inside; the damage ray deals radiant. Not covered on ddb-importer: its aura is a utility activity with a separate damage activity; triggers and fixes bind the official ids only. Partial: 3 expectations left to the table (no-key 2, use-time-choice 1). | table, partial | Validated |
| Deathdance | Item | p.237 | Humanoid targets succeed on the Constitution save automatically. | table | Validated |
| Orb of Damara | Item | p.246 | Foes beginning their turn near the bearer roll the fear save; frightened lasts until that foe's next turn begins. Not covered on ddb-importer: emanation holds a single activity id; the importer item splits the aura into its own utility and save activities. Partial: 7 expectations left to the table (form-change 1, immunity-after-save 1, no-key 2, out-of-combat 1, table-ruling 1, use-time-choice 1). | table, partial | Validated |
| Ulcrun | Item | p.237 | A successful save deals no damage at all. Partial: 1 expectation left to the table (no-key 1). | table, partial | Played |

Held for a person (Ruling R27): gated, not registered with DAS · Core until a person settles them.

| Held rule | Kind | Page | Status |
|---|---|---|---|
| Crown of Horns | Item | p.243 | Held: review disagrees |
| Prespra | Item | p.237 | Held: review disagrees |

### XMM · Monster Manual (2025)

Published as an official Foundry VTT module (`dnd-monster-manual`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Mucus Cloud (Aboleth) | Monster feature | p.12 | Creatures next to the aboleth save against the curse when its turn ends. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 4 expectations left to the table (healing-block 1, out-of-combat 2, trigger-filter 1). | table, partial | Validated |
| Scorching Sands (Adult Brass Dragon) | Monster feature | p.55 | The halved speed on a failed save ends at the end of the target's next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 1 expectation left to the table (use-limit 1). | table, partial | Played |
| Slowing Breath (Adult Copper Dragon) | Monster feature | p.79 | The slowing effect on a failed save ends at the end of the target's next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Played |
| Banish (Adult Gold Dragon) | Monster feature | p.145 | A creature that fails the save is taken off the battlefield until the dragon's next turn starts, then comes back. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: It comes back to the space it left, or the nearest free one: the GM moves it if the dragon picks another space. The once-a-round limit of the action stays with the GM. | table | Played |
| Freezing Burst (Adult White Dragon) | Monster feature | p.329 | A creature that fails stays unable to move through its own following turn, not only up to that turn's start. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the feature is changed: its damage, save and area are played from the item's own data. | table | Played |
| Whirlwind (Air Elemental) | Monster feature | p.13 | A failed save also shoves the target 20 feet away from the elemental; a success halves the damage. Partial: 1 expectation left to the table (target-size 1). | table, partial | Played |
| Cloud of Insects (Ancient Black Dragon) | Monster feature | p.40 | The effect of the failed save gives its Disadvantage on rolls to keep Concentration, and lasts through the target's next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the action is changed: its once-a-round limit is the engine's. | table | Played |
| Scorching Sands (Ancient Brass Dragon) | Monster feature | p.56 | The halved Speed lasts until the end of the target's next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the feature is changed: its damage, save and area are played from the item's own data. | table | Played |
| Slowing Breath (Ancient Copper Dragon) | Monster feature | p.80 | The slowing effect from the breath lasts until the affected creature finishes its next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Played |
| Banish (Ancient Gold Dragon) | Monster feature | p.146 | A creature that fails the save is taken off the battlefield until the dragon's next turn starts, then comes back. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: It comes back to the space it left, or the nearest free one: the GM moves it if the dragon picks another space. The once-a-round limit of the action stays with the GM. | table | Played |
| Dissolving Pseudopod (Black Pudding) | Monster feature | p.42 | The armor penalty is placed only on a target that wears armor. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Magical armor is not told apart, and the armor's destruction and its repair stay with the GM; the penalty sits on the creature, not on the armor. | table | Played |
| Abduct (Bugbear Stalker) | Monster feature | p.62 | The creature moves a creature it is grappling, whatever its size, at no extra cost of movement. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the grapple is changed: the grab, the escape and the sizes it may take are the engine's. | table | Played |
| Abduct (Bugbear Warrior) | Monster feature | p.62 | The creature moves a creature it is grappling, whatever its size, at no extra cost of movement. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the grapple is changed: the grab, the escape and the sizes it may take are the engine's. | table | Played |
| Leap (Bulette Pup) | Monster feature | p.63 | Once on each of its turns the creature may jump up to 30 feet for 10 feet of movement, whatever its Strength. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The Bonus Action is not spent by the jump itself: the GM uses the feature's activity to spend it. | table | Played |
| Leap (Bulette) | Monster feature | p.63 | Once on each of its turns the creature may jump up to 30 feet for 10 feet of movement, whatever its Strength. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The Bonus Action is not spent by the jump itself: the GM uses the feature's activity to spend it. | table | Played |
| Leap (Bullywug Bog Sage) | Monster feature | p.64 | Once on each of its turns the creature may jump up to 30 feet for 10 feet of movement, whatever its Strength. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The Bonus Action is not spent by the jump itself: the GM uses the feature's activity to spend it. | table | Played |
| Leap (Bullywug Warrior) | Monster feature | p.64 | Once on each of its turns the creature may jump up to 30 feet for 10 feet of movement, whatever its Strength. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The Bonus Action is not spent by the jump itself: the GM uses the feature's activity to spend it. | table | Played |
| Unnerving Gaze (Chain Devil) | Monster feature | p.68 | The fear ends at the end of the turn it was imposed in. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 2 expectations left to the table (immunity-after-save 1, table-ruling 1). | table, partial | Played |
| Hasten (Clay Golem) | Monster feature | p.72 | After using it, the golem's movement provokes no opportunity attacks. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 1 expectation left to the table (no-key 1). | table, partial | Played |
| Slowing Breath (Copper Dragon Wyrmling) | Monster feature | p.78 | The breath's effect lasts until the end of the target's next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the feature is changed: its damage, save and area are played from the item's own data. | table | Played |
| Constrict (Couatl) | Monster feature | p.82 | A creature larger than Medium is left unaffected by the constriction: no save, no damage, no grapple. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the feature is changed: its save, damage and conditions are played from the item's own data. | table | Played |
| Darkness Aura (Darkmantle) | Monster feature | p.90 | The aura's zone carries magical darkness of its own radius, which goes when the zone goes. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (magical). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: When the zone ends (the creature's concentration, ten minutes) follows the item's own duration. | table | Played |
| Dread Scythe (Death Cultist) | Monster feature | p.86 | The healing block on the struck creature lapses when its next turn ends. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Played |
| Chaos Blade (Death Slaad) | Monster feature | p.287 | Whichever rolled condition lands ends as the slaad's next turn starts. | table | Played |
| Dreadful Howl (Dire Worg) | Monster feature | p.335 | The fear ends when the worg's following turn begins; a save halves the damage. Partial: 1 expectation left to the table (no-key 1). | table, partial | Played |
| Terrifying Presence (Dracolich) | Monster feature | p.102 | The fear ends when the target's following turn ends; a save avoids the damage. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 1 expectation left to the table (no-key 1). | table, partial | Played |
| Sunlight Sensitivity (Drider) | Monster feature | p.105 | In sunlight the creature rolls its ability checks with Disadvantage. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Trample (Elephant) | Monster feature | p.353 | A creature that is not Prone is left unaffected by the trample: no save, no damage. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the feature is changed: its save, damage and conditions are played from the item's own data. | table | Played |
| Sacred Weapon (Empyrean) | Monster feature | p.113 | The stun ends when the user's next turn begins; the extra damage ignores resistance. Partial: 2 expectations left to the table (no-key 1, table-ruling 1). Carries over 1 engine key (usageLimits). | table, partial | Validated |
| Web Strand (Ettercap) | Monster feature | p.115 | A creature larger than Large is left unaffected by the web strand: no save, no restraint. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The web itself (its Armor Class, hit points and what destroys it) stays with the GM: the restraint is ended by hand. | table | Played |
| Morningstar (Ettin) | Monster feature | p.116 | The marker placed by a hit expires when the target's following turn ends. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 2 expectations left to the table (no-key 1, use-limit 1). | table, partial | Played |
| Euphoria Breath (Faerie Dragon Youth) | Monster feature | p.117 | The Incapacitated condition lasts until the end of the target's next turn. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the feature is changed: its damage, save and area are played from the item's own data. | table | Played |
| Stench Spray (Flumph) | Monster feature | p.122 | The poison from a failed save lasts 1d4 hours. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 2 expectations left to the table (no-key 1, out-of-combat 1). | table, partial | Validated |
| War Cry (Frost Giant) | Monster feature | p.124 | The war cry's effect on its recipient ends when the giant's next turn begins. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 1 expectation left to the table (no-key 1). | table, partial | Validated |
| Leap (Giant Ape) | Monster feature | p.354 | Once on each of its turns the creature may jump up to 30 feet for 10 feet of movement, whatever its Strength. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The Bonus Action is not spent by the jump itself: the GM uses the feature's activity to spend it. | table | Played |
| Aberrant Ground (Gibbering Mouther) | Monster feature | p.133 | The zone the feature lays around the creature is Difficult Terrain. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The GM lays the zone once with the feature's activity; whether the creature itself is slowed inside it is not checked. | table | Played |
| Hunger of Yeenoghu (Gnoll Demoniac) | Monster feature | p.141 | A creature entering the dark cube or starting its turn there saves again; the cube is difficult terrain. Partial: 2 expectations left to the table (no-key 2). Carries over 1 engine key (magical). | table, partial | Validated |
| Suffocate (Graveyard Revenant) | Monster feature | p.260 | The held creature can end the grip, and the choking with it, by winning a check as an action. Partial: 2 expectations left to the table (table-ruling 1, target-size 1). | table, partial | Validated |
| Chaos Claw (Gray Slaad) | Monster feature | p.286 | Whichever condition the hit leaves fades when the slaad begins its next turn. Partial: 1 expectation left to the table (no-key 1). | table, partial | Played |
| Chaos Staff (Green Slaad) | Monster feature | p.286 | Whichever condition the hit leaves fades when the slaad begins its next turn. Partial: 1 expectation left to the table (no-key 1). | table, partial | Played |
| Abduct (Grell) | Monster feature | p.157 | The creature moves a creature it is grappling, whatever its size, at no extra cost of movement. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the grapple is changed: the grab, the escape and the sizes it may take are the engine's. | table | Played |
| Object Slam (Haunting Revenant) | Monster feature | p.260 | The slam is rolled with Advantage against a target standing inside the revenant's own space. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The item's attack is melee only: its ranged use stays with the GM. | table | Played |
| Nightmare (Incubus) | Monster feature | p.178 | A target at 20 hit points or fewer that fails the save sleeps and takes no damage; above that it takes the damage and does not sleep. Another creature can spend its action to wake the sleeper. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The waking on damage is the engine's own reading; the one-hour duration is the item's. | table | Played |
| Sleep Gaze (Jackalwere) | Monster feature | p.182 | Another creature can spend an action to wake the sleeper; the sleep lasts ten minutes. Partial: 3 expectations left to the table (immunity-after-save 1, no-key 2). | table, partial | Validated |
| Sunlight Sensitivity (Juvenile Shadow Dragon) | Monster feature | p.275 | In sunlight the creature rolls its ability checks with Disadvantage. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Sunlight Sensitivity (Kobold Warrior) | Monster feature | p.185 | In sunlight the creature rolls its ability checks with Disadvantage. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Toxic Ink (Kraken) | Monster feature | p.187 | The blinding and poisoning end when the kraken's next turn ends. Partial: 3 expectations left to the table (no-key 2, table-ruling 1). | table, partial | Played |
| Sunlight Sensitivity (Kuo-toa Archpriest) | Monster feature | p.191 | In sunlight the creature rolls its ability checks with Disadvantage. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Bone Whip (Kuo-toa Monitor) | Monster feature | p.190 | The creature hit stays unable to make Opportunity Attacks until the monitor's own turn comes round again. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the feature is changed: its damage, save and area are played from the item's own data. | table | Played |
| Sunlight Sensitivity (Kuo-toa Monitor) | Monster feature | p.190 | In sunlight the creature rolls its ability checks with Disadvantage. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Sunlight Sensitivity (Kuo-toa Whip) | Monster feature | p.190 | In sunlight the creature rolls its ability checks with Disadvantage. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Sunlight Sensitivity (Kuo-toa) | Monster feature | p.189 | In sunlight the creature rolls its ability checks with Disadvantage. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Claw (Lacedon Ghoul) | Monster feature | p.132 | The paralysis is placed only on a target that is neither an Undead nor an elf. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The save is still asked of an Undead or an elf, with no consequence; an elf known by its name alone is not recognised. | table | Played |
| Icy Bite (Lacedon Ghoul) | Monster feature | p.132 | The slowing effect ends when the user's next turn begins. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. | table | Played |
| Charge (Lizardfolk Sovereign) | Monster feature | p.197 | Used, the feature gives the creature its Speed again for the turn, as a Dash does. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the move goes straight toward an enemy the creature can see, and its Swim Speed in water, are left to the GM. | table | Played |
| Ignited Illumination (Magmin) | Monster feature | p.200 | Used, the feature sets the creature ablaze: bright light for 10 feet and dim light for 10 more; used again, it puts the light out. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The engine treats the light as a carried one: nothing else of the creature is changed. | table | Played |
| Pseudopod (Mimic) | Monster feature | p.212 | Ability checks made to escape the mimic's grapple are rolled with Disadvantage. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The acid damage of the item's data is not changed: a damage number goes to a person. The size limit and the escape DC are the engine's. | table | Played |
| Sun Sickness (Myconid Adult) | Monster feature | p.223 | In sunlight the creature has Disadvantage on its attack rolls, ability checks and saving throws. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Its death after more than an hour in sunlight stays with the GM. | table | Played |
| Sun Sickness (Myconid Sovereign) | Monster feature | p.223 | In sunlight the creature has Disadvantage on its attack rolls, ability checks and saving throws. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Its death after more than an hour in sunlight stays with the GM. | table | Played |
| Sun Sickness (Myconid Sprout) | Monster feature | p.222 | In sunlight the creature has Disadvantage on its attack rolls, ability checks and saving throws. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Its death after more than an hour in sunlight stays with the GM. | table | Played |
| Ink Cloud (Octopus) | Monster feature | p.365 | The octopus is offered its reaction as soon as an adjacent foe finishes a turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That it must be underwater, its swim after the cloud and how long the cloud lasts are left to the GM. | table | Played |
| Bite (Phase Spider) | Monster feature | p.239 | The poison is placed only on a target the bite reduces to 0 hit points, and that target is stable. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (drain). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the bite is changed: its attack and its damage are played from the item's own data. | table | Played |
| Telekinetic Thrust (Poltergeist) | Monster feature | p.246 | A failed save also shoves the target 30 feet away from the user. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (magical). | table | Played |
| Pseudopod (Psychic Gray Ooze) | Monster feature | p.151 | The effect of the hit gives its Disadvantage on Intelligence saves, and lasts through the ooze's next turn. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the attack is changed. | table | Played |
| Aim (Scout Captain) | Monster feature | p.270 | After aiming, the creature's next attack roll of the turn is rolled with Advantage, once; the aim is lost when its turn ends. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the feature is changed. | table | Played |
| Light Sensitivity (Shadow Demon) | Monster feature | p.273 | In bright light the creature has Disadvantage on its ability checks. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Its attack rolls in bright light are the engine's own reading of the trait. | table | Played |
| Living Shadow (Shadow Dragon) | Monster feature | p.275 | The trait's Resistance is in force only while the creature stands in dim light or darkness. Carries over 4 engine keys (drawsOnEnd, effectEnds, gmAlert, onNatural1). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: A light that changes while the token stands still is seen at the token's next move or update. | table | Played |
| Sunlight Sensitivity (Shadow Dragon) | Monster feature | p.275 | In sunlight the creature rolls its ability checks with Disadvantage. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Sunlight Sensitivity (Specter) | Monster feature | p.290 | In sunlight the creature rolls its ability checks with Disadvantage. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Heart Sight (Sprite) | Monster feature | p.298 | Celestial, fiend and undead targets fail the save outright. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 1 expectation left to the table (out-of-combat 1). | table, partial | Validated |
| Swarm (Swarm of Bats) | Monster feature | p.370 | The swarm gains no Temporary Hit Points, whatever would give them. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (sharesSpace). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the swarm cannot regain Hit Points is not enforced: healing applied to it is undone by hand. | table | Played |
| Swarm (Swarm of Crawling Claws) | Monster feature | p.83 | The swarm gains no Temporary Hit Points, whatever would give them. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (sharesSpace). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the swarm cannot regain Hit Points is not enforced: healing applied to it is undone by hand. | table | Played |
| Swarm (Swarm of Dretches) | Monster feature | p.104 | The swarm gains no Temporary Hit Points, whatever would give them. Carries over 1 engine key (sharesSpace). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the swarm cannot regain Hit Points is not enforced: healing applied to it is undone by hand. | table | Played |
| Swarm (Swarm of Insects) | Monster feature | p.370 | The swarm gains no Temporary Hit Points, whatever would give them. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (sharesSpace). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the swarm cannot regain Hit Points is not enforced: healing applied to it is undone by hand. | table | Played |
| Swarm (Swarm of Larvae) | Monster feature | p.193 | The swarm gains no Temporary Hit Points, whatever would give them. Carries over 1 engine key (sharesSpace). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the swarm cannot regain Hit Points is not enforced: healing applied to it is undone by hand. | table | Played |
| Swarm (Swarm of Lemures) | Monster feature | p.194 | The swarm gains no Temporary Hit Points, whatever would give them. Carries over 1 engine key (sharesSpace). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the swarm cannot regain Hit Points is not enforced: healing applied to it is undone by hand. | table | Played |
| Swarm (Swarm of Piranhas) | Monster feature | p.370 | The swarm gains no Temporary Hit Points, whatever would give them. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (sharesSpace). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the swarm cannot regain Hit Points is not enforced: healing applied to it is undone by hand. | table | Played |
| Swarm (Swarm of Rats) | Monster feature | p.370 | The swarm gains no Temporary Hit Points, whatever would give them. Carries over 1 engine key (sharesSpace). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the swarm cannot regain Hit Points is not enforced: healing applied to it is undone by hand. | table | Played |
| Swarm (Swarm of Ravens) | Monster feature | p.371 | The swarm gains no Temporary Hit Points, whatever would give them. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (sharesSpace). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the swarm cannot regain Hit Points is not enforced: healing applied to it is undone by hand. | table | Played |
| Swarm of Proboscises (Swarm of Stirges) | Monster feature | p.299 | The hit grapples only a Medium or smaller target that stands in the swarm's own space. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The damage while grappled and the escape are the engine's and the item's. | table | Played |
| Swarm (Swarm of Stirges) | Monster feature | p.299 | The swarm gains no Temporary Hit Points, whatever would give them. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (sharesSpace). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the swarm cannot regain Hit Points is not enforced: healing applied to it is undone by hand. | table | Played |
| Swarm (Swarm of Venomous Snakes) | Monster feature | p.371 | The swarm gains no Temporary Hit Points, whatever would give them. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (sharesSpace). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: That the swarm cannot regain Hit Points is not enforced: healing applied to it is undone by hand. | table | Played |
| Animate Trees (Treant) | Monster feature | p.308 | An animated tree acts right after the treant in combat, and stops being animate when the treant dies or after a day. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Carries over 1 engine key (magical). Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The 120-foot limit, the tree's lack of this action and its taking root are left to the GM. | table | Played |
| Sunlight Sensitivity (Troglodyte) | Monster feature | p.309 | In sunlight the creature rolls its ability checks with Disadvantage. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Hypnotic Gaze (Ultroloth) | Monster feature | p.311 | The stun lasts until the ultroloth begins its next turn; a successful save takes no damage. Partial: 1 expectation left to the table (immunity-after-save 1). | table, partial | Played |
| Bite (Vampire Spawn) | Monster feature | p.315 | A creature that is not Grappled, Incapacitated or Restrained is left unaffected by the bite: no save, no damage, no drain. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: A willing creature with none of those conditions is left unaffected too: the GM applies the bite by hand in that case. The drain itself is the engine's. | table | Played |
| Spore Bomb (Violet Fungus Necrohulk) | Monster feature | p.126 | Half damage on a save; the poison lasts until the necrohulk begins its next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Partial: 1 expectation left to the table (healing-block 1). | table, partial | Played |
| Greatsword (Warrior Commander) | Monster feature | p.321 | A creature the sword hits rolls its next attack with Disadvantage, once, until the warrior's next turn starts. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: The effect lands on every hit: the GM deletes it when the warrior picks Maneuver; the ally's move is played by hand. | table | Played |
| Sunlight Sensitivity (Wight) | Monster feature | p.332 | In sunlight the creature rolls its ability checks with Disadvantage. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Sunlight Sensitivity (Winged Kobold) | Monster feature | p.185 | In sunlight the creature rolls its ability checks with Disadvantage. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Sunlight Sensitivity (Wraith) | Monster feature | p.336 | In sunlight the creature rolls its ability checks with Disadvantage. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Whether a place counts as sunlight is the scene's: only a bright global light does. | table | Played |
| Slowing Breath (Young Copper Dragon) | Monster feature | p.78 | The breath's effect lasts until the end of the target's next turn. Not covered on ddb-importer: DDB Importer monster features: world ids and generic identifiers. Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not reviewed; for the owner's eye. Left to the table: Nothing else of the feature is changed: its damage, save and area are played from the item's own data. | table | Played |

Held for a person (Ruling R27): gated, not registered with DAS · Core until a person settles them.

| Held rule | Kind | Page | Status |
|---|---|---|---|
| Dominate Mind (Aboleth) | Monster feature | p.12 | Held: its identifier would drop engine behaviour |
| Cloud of Insects (Adult Black Dragon) | Monster feature | p.39 | Held: reviewer unsure |
| Sleep Breath (Adult Brass Dragon) | Monster feature | p.55 | Held: reviewer unsure |
| Noxious Miasma (Adult Green Dragon) | Monster feature | p.153 | Held: reviewer unsure |
| Cold Gale (Adult Silver Dragon) | Monster feature | p.279 | Held: review disagrees |
| Feral Strike (Animal Lord) | Monster feature | p.15 | Held: the engine already does it |
| Lordly Presence (Animal Lord) | Monster feature | p.15 | Held: changes the engine's reading: a person decides |
| Death Throes (Balor) | Monster feature | p.26 | Held: review disagrees |
| Horrify (Banshee) | Monster feature | p.29 | Held: the engine already does it |
| Beard (Bearded Devil) | Monster feature | p.33 | Held: the engine already does it |
| Eye Rays (Beholder Zombie) | Monster feature | p.347 | Held: review disagrees |
| Mutating Claw (Blue Slaad) | Monster feature | p.285 | Held: review disagrees |
| Infernal Sting (Bone Devil) | Monster feature | p.52 | Held: the engine already does it |
| Smelting Charge (Brazen Gorgon) | Monster feature | p.149 | Held: review disagrees |
| Flame Aura (Brazen Gorgon) | Monster feature | p.149 | Held: the engine already does it |
| Deadly Leap (Bulette) | Monster feature | p.63 | Held: the engine already does it |
| Trampling Charge (Centaur Trooper) | Monster feature | p.67 | Held: the engine already does it |
| Entangling Trail (Centaur Warden) | Monster feature | p.67 | Held: the engine already does it |
| Drone (Chasme) | Monster feature | p.69 | Held: changes the engine's reading: a person decides |
| Stomp (Colossus) | Monster feature | p.76 | Held: the engine already does it |
| Grave-Dust Flight (Demilich) | Monster feature | p.96 | Held: the engine already does it |
| Create Whirlwind (Djinni) | Monster feature | p.99 | Held: changes the engine's reading: a person decides |
| Unsettling Visage (Doppelganger) | Monster feature | p.100 | Held: changes the engine's reading: a person decides |
| Rumbling Movement (Elemental Cataclysm) | Monster feature | p.111 | Held: the engine already does it |
| Bolster (Empyrean) | Monster feature | p.113 | Held: review disagrees |
| Hammer Throw (Fire Giant) | Monster feature | p.119 | Held: the engine already does it |
| Claw (Ghast Gravecaller) | Monster feature | p.130 | Held: the engine already does it |
| Claw (Ghast) | Monster feature | p.130 | Held: review disagrees |
| Stench (Ghast) | Monster feature | p.130 | Held: the engine already does it |
| Horrific Visage (Ghost) | Monster feature | p.131 | Held: the engine already does it |
| Claw (Ghoul) | Monster feature | p.132 | Held: review disagrees |
| Draconic Strike (Githyanki Dracomancer) | Monster feature | p.135 | Held: review disagrees |
| Psychic Warp (Githzerai Psion) | Monster feature | p.137 | Held: review disagrees |
| Redirect Attack (Goblin Boss) | Monster feature | p.143 | Held: review disagrees |
| Haunting Glare (Graveyard Revenant) | Monster feature | p.260 | Held: changes the engine's reading: a person decides |
| Paralyzing Tentacles (Grell) | Monster feature | p.157 | Held: changes the engine's reading: a person decides |
| Luring Song (Harpy) | Monster feature | p.164 | Held: changes the engine's reading: a person decides |
| Reactive Heads (Hydra) | Monster feature | p.175 | Held: the engine already does it |
| Ice Spear (Ice Devil) | Monster feature | p.176 | Held: the engine already does it |
| Sticky Net (Kuo-toa) | Monster feature | p.189 | Held: the engine already does it |
| Watery Rush (Lacedon Ghoul) | Monster feature | p.132 | Held: the engine already does it |
| Paralyzing Touch (Lich) | Monster feature | p.196 | Held: the engine already does it |
| Sickening Vapors (Manes Vaporspawn) | Monster feature | p.201 | Held: the engine already does it |
| Reactive (Marilith) | Monster feature | p.204 | Held: the engine already does it |
| Paralysis Gas (Modron Pentadrone) | Monster feature | p.218 | Held: changes the engine's reading: a person decides |
| Tentacle Slam (Otyugh) | Monster feature | p.233 | Held: review disagrees |
| Majestic Song (Performer Legend) | Monster feature | p.237 | Held: review disagrees |
| Defensive Stance (Pirate Admiral) | Monster feature | p.242 | Held: review disagrees |
| Fear Aura (Pit Fiend) | Monster feature | p.243 | Held: the engine already does it |
| Scare (Quasit) | Monster feature | p.252 | Held: changes the engine's reading: a person decides |
| Vengeful Glare (Revenant) | Monster feature | p.259 | Held: changes the engine's reading: a person decides |
| Swoop (Roc) | Monster feature | p.261 | Held: the engine already does it |
| Blazing Movement (Salamander Inferno Master) | Monster feature | p.267 | Held: the engine already does it |
| Fey Melody (Satyr Revelmaster) | Monster feature | p.268 | Held: review disagrees |
| Vile Appearance (Sea Hag) | Monster feature | p.271 | Held: changes the engine's reading: a person decides |
| Protection (Shield Guardian) | Monster feature | p.277 | Held: review disagrees |
| Cinder Breath (Smoke Mephit) | Monster feature | p.208 | Held: the engine already does it |
| Spell Reflection (Spectator) | Monster feature | p.289 | Held: the engine already does it |
| Mind-Rending Roar (Sphinx of Lore) | Monster feature | p.293 | Held: the engine already does it |
| Fetid Aura (Swarm of Dretches) | Monster feature | p.104 | Held: changes the engine's reading: a person decides |
| Cacophony (Swarm of Ravens) | Monster feature | p.371 | Held: the engine already does it |
| Grasping Root (Tree Blight) | Monster feature | p.44 | Held: its identifier would drop engine behaviour |
| Charging Horn (Unicorn) | Monster feature | p.313 | Held: the engine already does it |
| Sanguine Drain (Vampire Umbral Lord) | Monster feature | p.318 | Held: review disagrees |
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

145 rules: 125 played, 20 validated. 9 of them reviewed with Ruling R24 tolerances (not an exact agreement). 4 of them settled by a second review (Ruling R40). 2 of them settled by a redraft that agrees with two reviews (Ruling R41). 24 of them partial (part of the entry left to the table). 90 of them engineered (Ruling R43): proven by a recorded play, not by a review. 74 more held for a person, not shipped (changes the engine's reading: a person decides 13, the engine already does it 34, its identifier would drop engine behaviour 2, review disagrees 22, reviewer unsure 3).
<!-- /auto:rules -->

The spell rules that name an activity or an effect use the ids of the items imported by **DDB Importer**. The same spell
brought in by another tool keeps the engine's general rules only. The class features of the Player's Handbook (2024) use the
ids of the official module, the same ids DAS · Core's own entries cite: there the pack completes an entry the engine already
has.

Shadow Blade, Booming Blade and Green-Flame Blade are handled in code and recognised by their dnd5e identifier alone, so they
work whatever tool imported the spell. Psychic Veil and Dreadful Strikes are completed in code too, on top of their entry.

The module also declares Plutonium to DAS · Core's world diagnostic as an item importer (`scripts/importers.mjs`), on an
engine that has `api.diagnostic.registerImporter`.
