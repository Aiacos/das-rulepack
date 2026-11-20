# DAS · Rule Pack

## 🧭 Project

Rules for [Darshyne's Automation Suite (DAS)](https://github.com/Darshyne/dnd5e-combat) covering spells, class features and
senses from the official rulebooks **outside the SRD** (*Xanathar's Guide to Everything*, *Tasha's Cauldron of Everything*…),
first of all the books that have no official Foundry module.
DAS · Core automates the items of the official premium modules; content imported from elsewhere (D&D Beyond through DDB
Importer, Plutonium) carries no rules, so the parts of a spell that exist only in its text are not applied. This module
adds them through the engine's public content API (`dnd5e-combat.registerContent`), without touching the engine.

It ships no rulebook text: each rule names its book and page, and acts on the item you already own, recognised by its
dnd5e identifier. It is laid out to take in every official rulebook, one file per book: see
[Progress by rulebook](#-progress-by-rulebook) and [Layout](#️-layout).

This is where such rules are meant to live: the DAS repositories carry nothing from books outside the SRD, so its author
asked that rules for these spells stay in a companion module (DAS · Core
[issue #63](https://github.com/Darshyne/dnd5e-combat/issues/63)). The generic building blocks this module had to write in
code are proposed to the engine, with no spell named, in
[issue #69](https://github.com/Darshyne/dnd5e-combat/issues/69).

Requires Foundry VTT V14, dnd5e 6.0 or later, and DAS · Core 0.283.0 or later. Two things need more than that: the senses
(Life Sense, Ghostly Gaze) need a DAS · Core that knows the `sense` key, and the declaration of Plutonium as an importer
needs one with `api.diagnostic.registerImporter`; neither is in a released version yet. On 0.283.0 the two senses are
rejected when the pack registers, the importer is not declared, and every other rule works.

This is a **beta**: see below what was played and what was only validated.

## 📦 Installation

In Foundry VTT, *Add-on Modules → Install Module*, paste this manifest URL:

```
https://github.com/Aiacos/das-rulepack/releases/latest/download/module.json
```

Install and enable DAS · Core (`dnd5e-combat`) first: the pack only adds rules to it.

## ✨ What it covers

"Played" means the rule was exercised in a running world (Foundry 14.370, dnd5e 6.1.0, DAS · Core 0.283.0, items imported by
DDB Importer 7.6.0), on the GM's client, through the engine's own testing interface. "Validated" means the rule passes the
engine's validator and uses the same building block as a rule that was played (the repeated save at the end of a turn is the
one played with Psychic Scream), but has not been played itself. Nothing was played from a player's client.

"Pending" means the rule is written for a key that no released DAS · Core knows yet (the `sense` block): it is registered,
and rejected by an older engine without harm, but was neither validated by this repository's tests nor played.

The tables below are generated from the rules themselves (`scripts/rules/books/`, `npm run books`), book by book: first the
books published as an official Foundry VTT module, then the others, by year.

<!-- auto:rules -->
### TCE · Tasha's Cauldron of Everything (2020)

Published as an official Foundry VTT module (`dnd-tashas-cauldron`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Booming Blade | Spell | p.106 | Casting it makes one melee attack with a weapon you hold (you choose if you hold several). From 5th level the attack adds 1d8 thunder on a hit (2d8 at 11th, 3d8 at 17th). A target that is hit is sheathed until the start of your next turn: if it moves 5 feet or more of its own will, it takes 1d8 thunder (one more die at 5th, 11th and 17th) and the spell ends. Pushes and pulls by the engine do not set it off. | code | Played |
| Green-Flame Blade | Spell | p.107 | Casting it makes one melee attack with a weapon you hold. From 5th level the attack adds 1d8 fire on a hit (2d8 at 11th, 3d8 at 17th). On a hit you choose a creature within 5 feet of the target: it takes fire damage equal to your spellcasting modifier, plus the same dice. | code | Played |
| Lightning Lure | Spell | p.107 | On a failed save the target is pulled up to 10 ft toward the caster. The imported item's target (a "0-foot emanation" that never contains anyone) is corrected to one creature. | table | Played |
| Tasha's Mind Whip | Spell | p.115 | No reactions until the end of the target's next turn; on that turn, an action or a bonus action, not both. | table | Played |
| Tasha's Caustic Brew | Spell | p.115 | No damage on the cast; 2d4 acid at the start of each of the target's turns; an action ends it. | table | Played |

### XPHB · Player's Handbook (2024)

Published as an official Foundry VTT module (`dnd-players-handbook`).

| Rule | Kind | Page | What the module adds | Handled in | Status |
|---|---|---|---|---|---|
| Psychic Veil (Soulknife 13) | Feature | p.135 | A missed attack no longer drops the invisibility; an attack that hits and deals damage still does. | code + table | Played |
| Inspiring Smite (Oath of Glory 3) | Feature | p.114 | The Temporary Hit Points are divided among the chosen creatures as the paladin likes, where the engine splits them evenly. | table | Played |
| Dreadful Strikes (Fey Wanderer 3) | Feature | p.124 | The extra Psychic die is once per turn for each target, not once per turn for the ranger. | code + table | Played |

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
| Ghostly Gaze (Eldritch Invocation) | Sense | p.56 | A sight that walls do not stop within 30 ft, carried by the effect the invocation places on its user; off while the user is Blinded. | table | Pending |

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
| Life Sense (Vampiric Mist) | Sense | p.250; MTF p.246 | The location of every creature within 60 ft, Constructs and Undead excepted; walls do not stop it. | table | Pending |

24 rules: 14 played, 8 validated, 2 pending.
<!-- /auto:rules -->

The spell rules that name an activity or an effect use the ids of the items imported by **DDB Importer**. The same spell
brought in by another tool keeps the engine's general rules only. The class features of the Player's Handbook (2024) use the
ids of the official module, the same ids DAS · Core's own entries cite: there the pack completes an entry the engine already
has.

Shadow Blade, Booming Blade and Green-Flame Blade are handled in code and recognised by their dnd5e identifier alone, so they
work whatever tool imported the spell. Psychic Veil and Dreadful Strikes are completed in code too, on top of their entry.

The module also declares Plutonium to DAS · Core's world diagnostic as an item importer (`scripts/importers.mjs`), on an
engine that has `api.diagnostic.registerImporter`.

## 📚 Progress by rulebook

First the overall progress — all rulebooks, then each of the two groups: the books published as an official Foundry VTT
module, and the books that are not, where content reaches the table through importers. Then one row per rulebook, and
below the tables one block per rulebook with a bar for each of its parts.

How to read it: this is a **static comparison by name** — each entry of a book (spell, feat, optional feature, item, class
or subclass feature) is looked up among the identifiers of DAS · Core and of this pack. "Covered" means a dedicated
entry exists, not that the rule was played; and many entries need no dedicated rule at all, because the item's own data is
enough. Monsters are in no total and no bar: the engine reads a creature's traits and actions
from its sheet text, so only their number is given. The SRD itself is covered by DAS · Core, not by this pack. The counts and their method are in `docs/books.json`;
the "This pack" column is recomputed from the pack's own rules.

<!-- auto:books -->
### Overall

| | Books | Entries | DAS · Core | This pack | Core + pack | Monsters |
|---|---:|---:|---:|---:|---|---:|
| **All rulebooks** | **40** | **4859** | **1195** | **19 (+4)** | `█████░░░░░░░░░░░░░░░` 25% | **2388** |
| A. Official Foundry module | 7 | 2370 | 682 | 5 (+3) | `██████░░░░░░░░░░░░░░` 29% | 609 |
| B. Not on Foundry | 33 | 2489 | 513 | 14 (+1) | `████░░░░░░░░░░░░░░░░` 21% | 1779 |

Entries are spells, class and subclass features, feats, options and items. Monsters are in no total and no bar: the engine has no entry per creature, it reads a creature's traits and actions from its sheet text, so only their number is given.

### A. Published as an official Foundry VTT module

DAS · Core itself automates the official modules it was written against (see the "DAS · Core" column), and it accepts nothing outside the SRD in its public repositories, so the non-SRD rules of these books still belong in this pack.

| Code | Title | Year | Group | Foundry module | Entries | DAS · Core | This pack | Core + pack | Monsters |
|---|---|---|---|---|---:|---:|---:|---|---:|
| TCE | Tasha's Cauldron of Everything | 2020 | supplement | `dnd-tashas-cauldron` | 443 | 54 | 5 | `█░░░░░░░░░` 13% | 20 |
| XDMG | Dungeon Master's Guide (2024) | 2024 | core | `dnd-dungeon-masters-guide` | 584 | 116 | 0 | `██░░░░░░░░` 20% | 2 |
| XPHB | Player's Handbook (2024) | 2024 | core | `dnd-players-handbook` | 1104 | 512 | 0 (+3) | `█████░░░░░` 46% | 15 |
| EFA | Eberron: Forge of the Artificer | 2025 | setting | `dnd-forge-artificer` | 87 | 0 | 0 | `░░░░░░░░░░` 0% | 27 |
| FRAIF | Forgotten Realms: Adventures in Faerûn | 2025 | setting | `dnd-adventures-faerun` | 18 | 0 | 0 | `░░░░░░░░░░` 0% | 42 |
| FRHOF | Forgotten Realms: Heroes of Faerûn | 2025 | setting | `dnd-heroes-faerun` | 133 | 0 | 0 | `░░░░░░░░░░` 0% | 0 |
| XMM | Monster Manual (2025) | 2025 | core | `dnd-monster-manual` | 1 | 0 | 0 | `░░░░░░░░░░` 0% | 503 |
| **Total** | 7 books |  |  |  | **2370** | **682** | **5 (+3)** | `███░░░░░░░` 29% | **609** |

Official packages with no book in this catalogue (not counted): Ravenloft: The Horrors Within (`dnd-ravenloft-horrors-within`), Arcana Unleashed (`dnd-arcana-unleashed`), Arcana Unleashed: Deadfall (`dnd-deadfall`), Tomb of Annihilation (`dnd-tomb-annihilation`), Phandelver and Below: The Shattered Obelisk (`dnd-phandelver-below`), Heroes of the Borderlands (`dnd-heroes-borderlands`), Dungeons & Dragons: World of Warcraft (`dnd-world-warcraft`). The game system (`dnd5e`) carries the SRD in its own compendia.

### B. Not published on Foundry — rules still to implement

The content of these books reaches the table through importers, with no rules attached: this is where the pack matters most.

| Code | Title | Year | Group | Entries | DAS · Core | This pack | Core + pack | Monsters |
|---|---|---|---|---:|---:|---:|---|---:|
| DMG | Dungeon Master's Guide (2014) | 2014 | core | 515 | 108 | 0 | `██░░░░░░░░` 21% | 3 |
| MM | Monster Manual (2014) | 2014 | core | 4 | 0 | 0 | `░░░░░░░░░░` 0% | 450 |
| PHB | Player's Handbook (2014) | 2014 | core | 1033 | 373 | 0 (+1) | `████░░░░░░` 36% | 5 |
| SCAG | Sword Coast Adventurer's Guide | 2015 | setting | 39 | 2 | 0 | `█░░░░░░░░░` 5% | 0 |
| VGM | Volo's Guide to Monsters | 2016 | supplement | 7 | 0 | 0 | `░░░░░░░░░░` 0% | 143 |
| OGA | One Grung Above | 2017 | supplement-alt | 1 | 0 | 0 | `░░░░░░░░░░` 0% | 0 |
| XGE | Xanathar's Guide to Everything | 2017 | supplement | 377 | 25 | 12 | `█░░░░░░░░░` 10% | 2 |
| GGR | Guildmasters' Guide to Ravnica | 2018 | setting | 42 | 0 | 0 | `░░░░░░░░░░` 0% | 79 |
| MTF | Mordenkainen's Tome of Foes | 2018 | supplement | 5 | 0 | 0 | `░░░░░░░░░░` 0% | 140 |
| AI | Acquisitions Incorporated | 2019 | supplement | 30 | 1 | 1 | `█░░░░░░░░░` 7% | 22 |
| AWM | Adventure with Muk | 2019 | supplement-alt | 0 | 0 | 0 | — | 11 |
| ERLW | Eberron: Rising from the Last War | 2019 | setting | 32 | 0 | 0 | `░░░░░░░░░░` 0% | 41 |
| EGW | Explorer's Guide to Wildemount | 2020 | setting | 118 | 0 | 0 | `░░░░░░░░░░` 0% | 48 |
| MGELFT | Muk's Guide to Everything He Learned From Tasha | 2020 | supplement-alt | 0 | 0 | 0 | — | 6 |
| MOT | Mythic Odysseys of Theros | 2020 | setting | 12 | 0 | 0 | `░░░░░░░░░░` 0% | 51 |
| DOD | Domains of Delight | 2021 | supplement-alt | 0 | 0 | 0 | — | 1 |
| FTD | Fizban's Treasury of Dragons | 2021 | supplement | 46 | 0 | 1 | `░░░░░░░░░░` 2% | 85 |
| MABJOV | Minsc and Boo's Journal of Villainy | 2021 | supplement-alt | 0 | 0 | 0 | — | 56 |
| SCC | Strixhaven: A Curriculum of Chaos | 2021 | setting | 25 | 0 | 0 | `░░░░░░░░░░` 0% | 47 |
| VRGR | Van Richten's Guide to Ravenloft | 2021 | setting | 16 | 4 | 0 | `███░░░░░░░` 25% | 35 |
| AAG | Astral Adventurer's Guide | 2022 | setting | 22 | 0 | 0 | `░░░░░░░░░░` 0% | 0 |
| BAM | Boo's Astral Menagerie | 2022 | setting | 1 | 0 | 0 | `░░░░░░░░░░` 0% | 72 |
| MPMM | Mordenkainen Presents: Monsters of the Multiverse | 2022 | supplement | 0 | 0 | 0 | — | 261 |
| AATM | Adventure Atlas: The Mortuary | 2023 | supplement-alt | 0 | 0 | 0 | — | 3 |
| BGG | Bigby Presents: Glory of the Giants | 2023 | supplement | 45 | 0 | 0 | `░░░░░░░░░░` 0% | 72 |
| BMT | The Book of Many Things | 2023 | supplement | 77 | 0 | 0 | `░░░░░░░░░░` 0% | 41 |
| HAT-TG | Thieves' Gallery | 2023 | supplement-alt | 0 | 0 | 0 | — | 7 |
| MCV4EC | Monstrous Compendium Volume 4: Eldraine Creatures | 2023 | supplement-alt | 0 | 0 | 0 | — | 25 |
| MPP | Morte's Planar Parade | 2023 | setting | 0 | 0 | 0 | — | 54 |
| SATO | Sigil and the Outlands | 2023 | setting | 14 | 0 | 0 | `░░░░░░░░░░` 0% | 0 |
| ABH | Astarion's Book of Hungers | 2025 | supplement-alt | 16 | 0 | 0 | `░░░░░░░░░░` 0% | 5 |
| LFL | Lorwyn: First Light | 2025 | setting-alt | 4 | 0 | 0 | `░░░░░░░░░░` 0% | 8 |
| NF | Netheril's Fall | 2025 | setting-alt | 8 | 0 | 0 | `░░░░░░░░░░` 0% | 6 |
| **Total** | 33 books |  |  | **2489** | **513** | **14 (+1)** | `██░░░░░░░░` 21% | **1779** |

### Each rulebook, part by part

One block per rulebook, to open: its spells, class and subclass features, feats, options, items and monsters, each with its own bar. A part the book has no entry for is left out. Monsters are given as a number only, with no bar: they are read from the sheet text, not measured by entry.

**A. Published as an official Foundry VTT module**

<details>
<summary><b>TCE</b> · Tasha's Cauldron of Everything — <code>█░░░░░░░░░</code> 13%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 21 | 10 | 5 | `███████░░░` 71% |
| Class and subclass features | 276 | 30 | 0 | `█░░░░░░░░░` 11% |
| Feats | 15 | 5 | 0 | `███░░░░░░░` 33% |
| Options (invocations, metamagic, manoeuvres…) | 47 | 8 | 0 | `██░░░░░░░░` 17% |
| Items | 84 | 1 | 0 | `░░░░░░░░░░` 1% |
| Monsters | 20 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>XDMG</b> · Dungeon Master's Guide (2024) — <code>██░░░░░░░░</code> 20%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 584 | 116 | 0 | `██░░░░░░░░` 20% |
| Monsters | 2 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>XPHB</b> · Player's Handbook (2024) — <code>█████░░░░░</code> 46%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 391 | 265 | 0 | `███████░░░` 68% |
| Class and subclass features | 456 | 153 | 0 (+3) | `███░░░░░░░` 34% |
| Feats | 76 | 46 | 0 | `██████░░░░` 61% |
| Options (invocations, metamagic, manoeuvres…) | 58 | 32 | 0 | `██████░░░░` 55% |
| Items | 123 | 16 | 0 | `█░░░░░░░░░` 13% |
| Monsters | 15 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>EFA</b> · Eberron: Forge of the Artificer — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Class and subclass features | 48 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 28 | 0 | 0 | `░░░░░░░░░░` 0% |
| Options (invocations, metamagic, manoeuvres…) | 4 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 6 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 27 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>FRAIF</b> · Forgotten Realms: Adventures in Faerûn — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 18 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 42 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>FRHOF</b> · Forgotten Realms: Heroes of Faerûn — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 19 | 0 | 0 | `░░░░░░░░░░` 0% |
| Class and subclass features | 56 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 34 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 24 | 0 | 0 | `░░░░░░░░░░` 0% |

</details>

<details>
<summary><b>XMM</b> · Monster Manual (2025) — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 503 | — | — | read from the sheet text — not measured |

</details>

**B. Not published on Foundry**

<details>
<summary><b>DMG</b> · Dungeon Master's Guide (2014) — <code>██░░░░░░░░</code> 21%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Class and subclass features | 15 | 1 | 0 | `█░░░░░░░░░` 7% |
| Items | 500 | 107 | 0 | `██░░░░░░░░` 21% |
| Monsters | 3 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>MM</b> · Monster Manual (2014) — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 4 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 450 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>PHB</b> · Player's Handbook (2014) — <code>████░░░░░░</code> 36%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 361 | 237 | 0 (+1) | `███████░░░` 66% |
| Class and subclass features | 380 | 74 | 0 | `██░░░░░░░░` 19% |
| Feats | 42 | 23 | 0 | `█████░░░░░` 55% |
| Options (invocations, metamagic, manoeuvres…) | 82 | 31 | 0 | `████░░░░░░` 38% |
| Items | 168 | 8 | 0 | `░░░░░░░░░░` 5% |
| Monsters | 5 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>SCAG</b> · Sword Coast Adventurer's Guide — <code>█░░░░░░░░░</code> 5%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Class and subclass features | 39 | 2 | 0 | `█░░░░░░░░░` 5% |

</details>

<details>
<summary><b>VGM</b> · Volo's Guide to Monsters — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 7 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 143 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>OGA</b> · One Grung Above — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 1 | 0 | 0 | `░░░░░░░░░░` 0% |

</details>

<details>
<summary><b>XGE</b> · Xanathar's Guide to Everything — <code>█░░░░░░░░░</code> 10%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 95 | 11 | 11 | `██░░░░░░░░` 23% |
| Class and subclass features | 202 | 13 | 0 | `█░░░░░░░░░` 6% |
| Feats | 15 | 0 | 0 | `░░░░░░░░░░` 0% |
| Options (invocations, metamagic, manoeuvres…) | 22 | 1 | 1 | `█░░░░░░░░░` 9% |
| Items | 43 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 2 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>GGR</b> · Guildmasters' Guide to Ravnica — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 41 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 79 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>MTF</b> · Mordenkainen's Tome of Foes — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Feats | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 4 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 140 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>AI</b> · Acquisitions Incorporated — <code>█░░░░░░░░░</code> 7%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 7 | 0 | 1 | `█░░░░░░░░░` 14% |
| Items | 23 | 1 | 0 | `░░░░░░░░░░` 4% |
| Monsters | 22 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>AWM</b> · Adventure with Muk — monsters only, not measured</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters | 11 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>ERLW</b> · Eberron: Rising from the Last War — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Feats | 2 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 30 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 41 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>EGW</b> · Explorer's Guide to Wildemount — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 15 | 0 | 0 | `░░░░░░░░░░` 0% |
| Class and subclass features | 18 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 85 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 48 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>MGELFT</b> · Muk's Guide to Everything He Learned From Tasha — monsters only, not measured</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters | 6 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>MOT</b> · Mythic Odysseys of Theros — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 12 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 51 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>DOD</b> · Domains of Delight — monsters only, not measured</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters | 1 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>FTD</b> · Fizban's Treasury of Dragons — <code>░░░░░░░░░░</code> 2%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 7 | 0 | 1 | `█░░░░░░░░░` 14% |
| Class and subclass features | 12 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 3 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 24 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 85 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>MABJOV</b> · Minsc and Boo's Journal of Villainy — monsters only, not measured</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters | 56 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>SCC</b> · Strixhaven: A Curriculum of Chaos — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 5 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 2 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 18 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 47 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>VRGR</b> · Van Richten's Guide to Ravenloft — <code>███░░░░░░░</code> 25%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Class and subclass features | 11 | 3 | 0 | `███░░░░░░░` 27% |
| Items | 5 | 1 | 0 | `██░░░░░░░░` 20% |
| Monsters | 35 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>AAG</b> · Astral Adventurer's Guide — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 2 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 20 | 0 | 0 | `░░░░░░░░░░` 0% |

</details>

<details>
<summary><b>BAM</b> · Boo's Astral Menagerie — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 72 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>MPMM</b> · Mordenkainen Presents: Monsters of the Multiverse — monsters only, not measured</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters | 261 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>AATM</b> · Adventure Atlas: The Mortuary — monsters only, not measured</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters | 3 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>BGG</b> · Bigby Presents: Glory of the Giants — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Class and subclass features | 6 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 8 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 31 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 72 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>BMT</b> · The Book of Many Things — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 3 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 73 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 41 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>HAT-TG</b> · Thieves' Gallery — monsters only, not measured</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters | 7 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>MCV4EC</b> · Monstrous Compendium Volume 4: Eldraine Creatures — monsters only, not measured</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters | 25 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>MPP</b> · Morte's Planar Parade — monsters only, not measured</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters | 54 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>SATO</b> · Sigil and the Outlands — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 2 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 7 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 5 | 0 | 0 | `░░░░░░░░░░` 0% |

</details>

<details>
<summary><b>ABH</b> · Astarion's Book of Hungers — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Feats | 16 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 5 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>LFL</b> · Lorwyn: First Light — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Feats | 2 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 2 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 8 | — | — | read from the sheet text — not measured |

</details>

<details>
<summary><b>NF</b> · Netheril's Fall — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 8 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters | 6 | — | — | read from the sheet text — not measured |

</details>

Counts of 2026-11-19 (docs/books.json); packages read on 2026-11-20 (docs/foundry-modules.json). "(+n)": rules of this pack on an entry already counted under DAS · Core (the pack completes the engine's entry, or serves another identifier of the same name); they are not added to the bar. Not counted, the catalogue having no such entry: Life Sense (MPMM).
<!-- /auto:books -->

## 🔒 What the GM's client does on a player's behalf

A player cannot write on a creature they do not own, so the booming energy, its damage and the leaping fire are applied by the
active GM's client. It works from the chat card of the attack the engine settled, and checks again what it reads there: the
card's author must own the caster, the caster must have the cantrip, the level is read from the caster, the creature the fire
leaps to must stand within 5 feet of the creature that was hit, and each card is used once. The damage is rolled on the GM's
client. The only thing a player's client sends is which neighbouring creature the fire leaps to.

## ⚠️ Known limitations

- Booming Blade, Green-Flame Blade: the cast is counted by the engine as an attack with the weapon, not as a spell. A caster
  with Extra Attack is therefore still offered the other attacks of the Attack action, which the spell does not give; a
  Counterspell or a silence does not stop it; the components are not checked. A way to tell the engine that such a cast
  takes the Magic action is one of the blocks asked for in issue #69.
- Booming Blade, Green-Flame Blade: the first activity of the spell is replaced by the attack; the other activities of the
  imported item (its hand-rolled damage) stay as they are and are not needed.
- Booming Blade: a teleport is not counted as moving. Outside combat the energy lasts 6 seconds of world time.
- Green-Flame Blade: the second creature is chosen among the tokens within 5 feet of the target, the caster excepted; whether
  the caster can see it is left to the table.

- Lightning Lure: the damage is applied wherever the target ends, whatever its distance to the caster.
- Tasha's Mind Whip: the choice to move instead of acting is left to the table. Played: no reactions, and the effect ending
  at the end of the target's turn; the limit to an action or a bonus action is declared to the engine but was not observed.
- Lightning Lure: the correction of the imported item is written when the item is created on a sheet; for a spell already on
  a sheet, run the world diagnostic of DAS · Core (or drag the spell onto the sheet again).
- Zephyr Strike: the one-time Advantage, bonus 1d8 force and extra speed are not automated.
- Holy Weapon: the extra 2d8 radiant on each hit is not automated.
- Power Word Pain: the imported item asks for a saving throw when the spell is cast; the text has none. The speed cap and the Disadvantage are not automated.
- Snare: the Intelligence (Arcana) check to free the creature is not automated.
- Otto's Irresistible Dance (2014): the Disadvantage on Dexterity saving throws is not automated.
- Tasha's Cauldron of Everything now has an official Foundry module. The pack's rules for its spells were written against
  the items imported by DDB Importer and were not checked against the official module's items: the rules that name an
  activity or an effect id may do nothing on them (Booming Blade and Green-Flame Blade go by identifier alone).
- Life Sense, Ghostly Gaze: they need a DAS · Core that knows the `sense` key, which is in no release yet.
- Maximilian's Earthen Grasp, Whirlwind, Wrath of Nature, Bones of the Earth: no rule yet. Getting free of them takes an action and an
  ability check, which needs the engine to read a check written without a DC, which DAS · Core does from 0.284.0; the rules themselves
  are still to be written and played.

- Shadow Blade: *dropping* the blade is not detected (only throwing it). Outside combat a thrown blade dissipates after
  20 seconds.
- Shadow Blade: with several targets selected, Advantage is given only when all of them are in dim light or darkness.
- The light on a target is read from DAS · Core (`api.light`); with its light indicator unavailable no Advantage is given.

## 🗂️ Layout

```
scripts/
  main.mjs                 registers the table with DAS · Core, starts the scripts
  rules/
    book.mjs               the shape of a rule (identifier, name, book, page, kind, status, handledIn, entry…)
    index.mjs              every rule, from the book modules; builds the registered table
    books/<code>.mjs       one module per source book: xge.mjs, tce.mjs, ftd.mjs, ai.mjs, phb.mjs, xphb.mjs, mpmm.mjs
  core/                    pure rules of the code-handled rules, no Foundry access (tested)
  *.mjs                    Foundry glue of the code-handled rules, importers
docs/
  books.json               entries per official rulebook, what DAS · Core covers (counts only, method and date)
  foundry-modules.json     official Foundry VTT packages and the book each corresponds to (source and date)
tools/books-progress.mjs   writes the generated blocks of this README (`npm run books`)
tests/
```

`scripts/rules/books/<code>.mjs` is the single source of truth for "which book does this rule come from, and what is its
status": each rule is declared there once, with its metadata and, when it has one, the entry registered with DAS · Core.

**Adding a rule to a new book**: create `scripts/rules/books/<code>.mjs`, named after the book's code in `docs/books.json`
(lowercase), exporting `BOOK` and `RULES`; add it to the list in `scripts/rules/index.mjs` (a browser cannot list a folder);
add the identifier to `tests/registration.test.mjs`; run `npm run books` and `npx vitest run -u`. A book of group A or B is
laid out the same way; the group comes from `docs/foundry-modules.json` alone.

**Rules handled in code** (Shadow Blade, the blade cantrips, Psychic Veil, Dreadful Strikes) keep their code where it was:
`scripts/<rule>.mjs` for the Foundry hooks and `scripts/core/<rule>.mjs` for the pure rules. Only their metadata (and their
entry, when they have one) sits in the book module, which names the script in `code`. Moving the scripts under a per-book
folder would have changed every import and test path for no gain: a script is found from its book through `code`, and
`tests/books.test.mjs` checks that the identifiers the scripts recognise are the ones declared as handled in code.

## 🧪 Development

```
npm install
npm test
npm run books
```

Pure rules live in `scripts/core/` and are tested with Vitest; Foundry glue lives next to them in `scripts/`; declarative
rules are in `scripts/rules/books/`. `npm run books` rewrites the generated blocks of this README (a test fails when they
are stale). `./build.sh` builds the two release files in `releases/`: the zip (`scripts/`, `lang/` and the top-level documents;
`docs/`, `tools/` and `tests/` are not shipped) and the `module.json` to upload next to it.

## 📄 License

MIT. Not affiliated with Wizards of the Coast or with the DAS project.
