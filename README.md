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

**Every rule, book by book, with what it adds and how far it was checked: [docs/RULES.md](https://github.com/Aiacos/das-rulepack/blob/master/docs/RULES.md).**

This is where such rules are meant to live: the DAS repositories carry nothing from books outside the SRD, so its author
asked that rules for these spells stay in a companion module (DAS · Core
[issue #63](https://github.com/Darshyne/dnd5e-combat/issues/63)). The generic building blocks this module had to write in
code are proposed to the engine, with no spell named, in
[issue #69](https://github.com/Darshyne/dnd5e-combat/issues/69).

Requires Foundry VTT V14, dnd5e 6.0 or later, and DAS · Core 0.283.0 or later. Two things need more than that: the senses
(Life Sense, Ghostly Gaze) need DAS · Core **0.287.0** or later, the first release that knows the `sense` key — on an older
engine they are rejected when the pack registers, and every other rule works; and the declaration of Plutonium as an
importer needs `api.diagnostic.registerImporter`, which is in no released version yet — until then it is skipped.

This is a **beta**: [docs/RULES.md](https://github.com/Aiacos/das-rulepack/blob/master/docs/RULES.md) says, rule by rule,
what was played and what was only validated.

## 📦 Installation

In Foundry VTT, *Add-on Modules → Install Module*, paste this manifest URL:

```
https://github.com/Aiacos/das-rulepack/releases/latest/download/module.json
```

Install and enable DAS · Core (`dnd5e-combat`) first: the pack only adds rules to it.

## ✨ What it covers

<!-- auto:summary -->
**42 rules** from **9 rulebooks**: 28 played in a running world, 14 validated by the engine's
validator but not played.
The full list, book by book — what each rule adds, where it is handled, how far it was checked: **[docs/RULES.md](https://github.com/Aiacos/das-rulepack/blob/master/docs/RULES.md)**.
<!-- /auto:summary -->

## 📚 Progress by rulebook

First the overall progress — all rulebooks, then each of the two groups: the books published as an official Foundry VTT
module, and the books that are not, where content reaches the table through importers. Then one row per rulebook, and
below the tables one block per rulebook with a bar for each of its parts.

How to read it: this is a **static comparison by name** — each entry of a book (spell, feat, optional feature, item, class
or subclass feature) is looked up among the identifiers of DAS · Core and of this pack. "Covered" means a dedicated
entry exists, not that the rule was played; and many entries need no dedicated rule at all, because the item's own data is
enough. The SRD itself is covered by DAS · Core, not by this pack.

Monsters are measured feature by feature, since a monster has no entry of its own: each feature of its stat block is either
an entry of DAS · Core, a rule the engine reads from the text, resolved by the item's data (attack, save, spellcasting),
without any combat mechanic, or open — and a monster is "resolved" when none is open. It is a static reading of the text,
not proof of play, and "resolved by data" does not check what follows an attack; this part is DAS · Core's work, not the pack's.

The counts and their methods are in `docs/books.json`; the "This pack" column is recomputed from the pack's own rules.

<!-- auto:books -->
### Overall

| | Books | Entries | DAS · Core | This pack | Core + pack | Monsters resolved |
|---|---:|---:|---:|---:|---|---:|
| **All rulebooks** | **43** | **8022** | **2465** | **37 (+4)** | `██████░░░░░░░░░░░░░░` 31% | **1232 / 2620** |
| A. Official Foundry module | 10 | 3754 | 1266 | 23 (+3) | `███████░░░░░░░░░░░░░` 34% | 546 / 841 |
| B. Not on Foundry | 33 | 4268 | 1199 | 14 (+1) | `██████░░░░░░░░░░░░░░` 28% | 686 / 1779 |

Entries are spells, class and subclass features, feats, species traits, options, items and monsters. A monster is one entry, counted under DAS · Core when it is fully resolved (no feature of its stat block left open); the last column repeats that share, which is already in the totals and the bars.

### A. Published as an official Foundry VTT module

DAS · Core itself automates the official modules it was written against (see the "DAS · Core" column), and it accepts nothing outside the SRD in its public repositories, so the non-SRD rules of these books still belong in this pack.

| Code | Title | Year | Group | Foundry module | Entries | DAS · Core | This pack | Core + pack | Monsters resolved |
|---|---|---|---|---|---:|---:|---:|---|---:|
| TCE | Tasha's Cauldron of Everything | 2020 | supplement | `dnd-tashas-cauldron` | 463 | 59 | 5 | `█░░░░░░░░░` 14% | 5 / 20 |
| XDMG | Dungeon Master's Guide (2024) | 2024 | core | `dnd-dungeon-masters-guide` | 586 | 117 | 0 | `██░░░░░░░░` 20% | 1 / 2 |
| XPHB | Player's Handbook (2024) | 2024 | core | `dnd-players-handbook` | 1119 | 519 | 1 (+3) | `█████░░░░░` 46% | 7 / 15 |
| EFA | Eberron: Forge of the Artificer | 2025 | setting | `dnd-forge-artificer` | 114 | 15 | 0 | `█░░░░░░░░░` 13% | 15 / 27 |
| FRAIF | Forgotten Realms: Adventures in Faerûn | 2025 | setting | `dnd-adventures-faerun` | 60 | 23 | 2 | `████░░░░░░` 42% | 23 / 42 |
| FRHOF | Forgotten Realms: Heroes of Faerûn | 2025 | setting | `dnd-heroes-faerun` | 133 | 0 | 0 | `░░░░░░░░░░` 0% | — |
| XMM | Monster Manual (2025) | 2025 | core | `dnd-monster-manual` | 504 | 369 | 15 | `████████░░` 76% | 369 / 503 |
| AU | Arcana Unleashed | 2026 | — | `dnd-arcana-unleashed` | 238 | 20 | 0 | `█░░░░░░░░░` 8% | 20 / 38 |
| RHW | Ravenloft: The Horrors Within | 2026 | — | `dnd-ravenloft-horrors-within` | 132 | 71 | 0 | `█████░░░░░` 54% | 37 / 69 |
| WOW | Dungeons & Dragons: World of Warcraft | 2026 | — | `dnd-world-warcraft` | 405 | 73 | 0 | `██░░░░░░░░` 18% | 69 / 125 |
| **Total** | 10 books |  |  |  | **3754** | **1266** | **23 (+3)** | `███░░░░░░░` 34% | **546 / 841** |

Not in the rulebook catalogue, measured from the module itself and counted like any other book: Ravenloft: The Horrors Within (RHW; version 2.0.0, the module's own compendia, read from the test world, 2026-11-20); Arcana Unleashed (AU; version 1.0.2, the module's own compendia, read from the files of the installed package, 2026-11-20); Dungeons & Dragons: World of Warcraft (WOW; version 1.1.0, the module's own compendia, read from the files of the installed package, 2026-11-20).

Arcana Unleashed: Deadfall (`dnd-deadfall`), Tomb of Annihilation (`dnd-tomb-annihilation`), Phandelver and Below: The Shattered Obelisk (`dnd-phandelver-below`), Heroes of the Borderlands (`dnd-heroes-borderlands`): these 4 official packages are adventures, outside the scope of the tables. The game system (`dnd5e`) carries the SRD in its own compendia.

### B. Not published on Foundry — rules still to implement

The content of these books reaches the table through importers, with no rules attached: this is where the pack matters most.

| Code | Title | Year | Group | Entries | DAS · Core | This pack | Core + pack | Monsters resolved |
|---|---|---|---|---:|---:|---:|---|---:|
| DMG | Dungeon Master's Guide (2014) | 2014 | core | 518 | 110 | 0 | `██░░░░░░░░` 21% | 2 / 3 |
| MM | Monster Manual (2014) | 2014 | core | 454 | 211 | 0 | `█████░░░░░` 46% | 211 / 450 |
| PHB | Player's Handbook (2014) | 2014 | core | 1038 | 373 | 0 (+1) | `████░░░░░░` 36% | 0 / 5 |
| SCAG | Sword Coast Adventurer's Guide | 2015 | setting | 39 | 2 | 0 | `█░░░░░░░░░` 5% | — |
| VGM | Volo's Guide to Monsters | 2016 | supplement | 150 | 57 | 0 | `████░░░░░░` 38% | 57 / 143 |
| OGA | One Grung Above | 2017 | supplement-alt | 1 | 0 | 0 | `░░░░░░░░░░` 0% | — |
| XGE | Xanathar's Guide to Everything | 2017 | supplement | 379 | 26 | 12 | `█░░░░░░░░░` 10% | 1 / 2 |
| GGR | Guildmasters' Guide to Ravnica | 2018 | setting | 121 | 25 | 0 | `██░░░░░░░░` 21% | 25 / 79 |
| MTF | Mordenkainen's Tome of Foes | 2018 | supplement | 145 | 40 | 0 | `███░░░░░░░` 28% | 40 / 140 |
| AI | Acquisitions Incorporated | 2019 | supplement | 52 | 14 | 1 | `███░░░░░░░` 29% | 13 / 22 |
| AWM | Adventure with Muk | 2019 | supplement-alt | 11 | 8 | 0 | `███████░░░` 73% | 8 / 11 |
| ERLW | Eberron: Rising from the Last War | 2019 | setting | 73 | 14 | 0 | `██░░░░░░░░` 19% | 14 / 41 |
| EGW | Explorer's Guide to Wildemount | 2020 | setting | 166 | 20 | 0 | `█░░░░░░░░░` 12% | 20 / 48 |
| MGELFT | Muk's Guide to Everything He Learned From Tasha | 2020 | supplement-alt | 6 | 4 | 0 | `███████░░░` 67% | 4 / 6 |
| MOT | Mythic Odysseys of Theros | 2020 | setting | 63 | 11 | 0 | `██░░░░░░░░` 17% | 11 / 51 |
| DOD | Domains of Delight | 2021 | supplement-alt | 1 | 0 | 0 | `░░░░░░░░░░` 0% | 0 / 1 |
| FTD | Fizban's Treasury of Dragons | 2021 | supplement | 131 | 26 | 1 | `██░░░░░░░░` 21% | 26 / 85 |
| MABJOV | Minsc and Boo's Journal of Villainy | 2021 | supplement-alt | 56 | 11 | 0 | `██░░░░░░░░` 20% | 11 / 56 |
| SCC | Strixhaven: A Curriculum of Chaos | 2021 | setting | 72 | 16 | 0 | `██░░░░░░░░` 22% | 16 / 47 |
| VRGR | Van Richten's Guide to Ravenloft | 2021 | setting | 51 | 19 | 0 | `████░░░░░░` 37% | 15 / 35 |
| AAG | Astral Adventurer's Guide | 2022 | setting | 22 | 0 | 0 | `░░░░░░░░░░` 0% | — |
| BAM | Boo's Astral Menagerie | 2022 | setting | 73 | 36 | 0 | `█████░░░░░` 49% | 36 / 72 |
| MPMM | Mordenkainen Presents: Monsters of the Multiverse | 2022 | supplement | 261 | 99 | 0 | `████░░░░░░` 38% | 99 / 261 |
| AATM | Adventure Atlas: The Mortuary | 2023 | supplement-alt | 3 | 1 | 0 | `███░░░░░░░` 33% | 1 / 3 |
| BGG | Bigby Presents: Glory of the Giants | 2023 | supplement | 117 | 33 | 0 | `███░░░░░░░` 28% | 33 / 72 |
| BMT | The Book of Many Things | 2023 | supplement | 118 | 5 | 0 | `░░░░░░░░░░` 4% | 5 / 41 |
| HAT-TG | Thieves' Gallery | 2023 | supplement-alt | 7 | 0 | 0 | `░░░░░░░░░░` 0% | 0 / 7 |
| MCV4EC | Monstrous Compendium Volume 4: Eldraine Creatures | 2023 | supplement-alt | 25 | 5 | 0 | `██░░░░░░░░` 20% | 5 / 25 |
| MPP | Morte's Planar Parade | 2023 | setting | 54 | 20 | 0 | `████░░░░░░` 37% | 20 / 54 |
| SATO | Sigil and the Outlands | 2023 | setting | 14 | 0 | 0 | `░░░░░░░░░░` 0% | — |
| ABH | Astarion's Book of Hungers | 2025 | supplement-alt | 21 | 2 | 0 | `█░░░░░░░░░` 10% | 2 / 5 |
| LFL | Lorwyn: First Light | 2025 | setting-alt | 12 | 5 | 0 | `████░░░░░░` 42% | 5 / 8 |
| NF | Netheril's Fall | 2025 | setting-alt | 14 | 6 | 0 | `████░░░░░░` 43% | 6 / 6 |
| **Total** | 33 books |  |  | **4268** | **1199** | **14 (+1)** | `███░░░░░░░` 28% | **686 / 1779** |

### Each rulebook, part by part

One block per rulebook, to open: its spells, class and subclass features, feats, species traits, options, items and monsters, each with its own bar. A part the book has no entry for is left out. Under the monsters, a second row counts their features one by one.

**A. Published as an official Foundry VTT module**

<details>
<summary><b>TCE</b> · Tasha's Cauldron of Everything — <code>█░░░░░░░░░</code> 14%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 21 | 10 | 5 | `███████░░░` 71% |
| Class and subclass features | 276 | 30 | 0 | `█░░░░░░░░░` 11% |
| Feats | 15 | 5 | 0 | `███░░░░░░░` 33% |
| Options (invocations, metamagic, manoeuvres…) | 47 | 8 | 0 | `██░░░░░░░░` 17% |
| Items | 84 | 1 | 0 | `░░░░░░░░░░` 1% |
| Monsters (fully resolved) | 20 | 5 | 0 | `███░░░░░░░` 25% |
| ↳ their features | 91 | 68 | — | `███████░░░` 75% |

</details>

<details>
<summary><b>XDMG</b> · Dungeon Master's Guide (2024) — <code>██░░░░░░░░</code> 20%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 584 | 116 | 0 | `██░░░░░░░░` 20% |
| Monsters (fully resolved) | 2 | 1 | 0 | `█████░░░░░` 50% |
| ↳ their features | 3 | 2 | — | `███████░░░` 67% |

</details>

<details>
<summary><b>XPHB</b> · Player's Handbook (2024) — <code>█████░░░░░</code> 46%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 391 | 265 | 1 | `███████░░░` 68% |
| Class and subclass features | 456 | 153 | 0 (+3) | `███░░░░░░░` 34% |
| Feats | 76 | 46 | 0 | `██████░░░░` 61% |
| Options (invocations, metamagic, manoeuvres…) | 58 | 32 | 0 | `██████░░░░` 55% |
| Items | 123 | 16 | 0 | `█░░░░░░░░░` 13% |
| Monsters (fully resolved) | 15 | 7 | 0 | `█████░░░░░` 47% |
| ↳ their features | 62 | 53 | — | `█████████░` 85% |

</details>

<details>
<summary><b>EFA</b> · Eberron: Forge of the Artificer — <code>█░░░░░░░░░</code> 13%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Class and subclass features | 48 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 28 | 0 | 0 | `░░░░░░░░░░` 0% |
| Options (invocations, metamagic, manoeuvres…) | 4 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 6 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 27 | 15 | 0 | `██████░░░░` 56% |
| ↳ their features | 118 | 103 | — | `█████████░` 87% |

</details>

<details>
<summary><b>FRAIF</b> · Forgotten Realms: Adventures in Faerûn — <code>████░░░░░░</code> 42%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 18 | 0 | 2 | `█░░░░░░░░░` 11% |
| Monsters (fully resolved) | 42 | 23 | 0 | `█████░░░░░` 55% |
| ↳ their features | 259 | 223 | — | `█████████░` 86% |

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
<summary><b>XMM</b> · Monster Manual (2025) — <code>████████░░</code> 76%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 503 | 369 | 15 | `████████░░` 76% |
| ↳ their features | 2146 | 1923 | — | `█████████░` 90% |

</details>

<details>
<summary><b>AU</b> · Arcana Unleashed — <code>█░░░░░░░░░</code> 8%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 33 | 0 | 0 | `░░░░░░░░░░` 0% |
| Class and subclass features | 61 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 37 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 69 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 38 | 20 | 0 | `█████░░░░░` 53% |
| ↳ their features | 172 | 148 | — | `█████████░` 86% |

</details>

<details>
<summary><b>RHW</b> · Ravenloft: The Horrors Within — <code>█████░░░░░</code> 54%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 1 | 1 | 0 | `██████████` 100% |
| Class and subclass features | 37 | 16 | 0 | `████░░░░░░` 43% |
| Feats | 16 | 12 | 0 | `████████░░` 75% |
| Species traits | 6 | 3 | 0 | `█████░░░░░` 50% |
| Items | 3 | 2 | 0 | `███████░░░` 67% |
| Monsters (fully resolved) | 69 | 37 | 0 | `█████░░░░░` 54% |
| ↳ their features | 467 | 403 | — | `█████████░` 86% |

</details>

<details>
<summary><b>WOW</b> · Dungeons & Dragons: World of Warcraft — <code>██░░░░░░░░</code> 18%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 70 | 1 | 0 | `░░░░░░░░░░` 1% |
| Class and subclass features | 78 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 39 | 0 | 0 | `░░░░░░░░░░` 0% |
| Species traits | 53 | 3 | 0 | `█░░░░░░░░░` 6% |
| Items | 40 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 125 | 69 | 0 | `██████░░░░` 55% |
| ↳ their features | 696 | 609 | — | `█████████░` 88% |

</details>

**B. Not published on Foundry**

<details>
<summary><b>DMG</b> · Dungeon Master's Guide (2014) — <code>██░░░░░░░░</code> 21%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Class and subclass features | 15 | 1 | 0 | `█░░░░░░░░░` 7% |
| Items | 500 | 107 | 0 | `██░░░░░░░░` 21% |
| Monsters (fully resolved) | 3 | 2 | 0 | `███████░░░` 67% |
| ↳ their features | 4 | 2 | — | `█████░░░░░` 50% |

</details>

<details>
<summary><b>MM</b> · Monster Manual (2014) — <code>█████░░░░░</code> 46%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 4 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 450 | 211 | 0 | `█████░░░░░` 47% |
| ↳ their features | 2141 | 1825 | — | `█████████░` 85% |

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
| Monsters (fully resolved) | 5 | 0 | 0 | `░░░░░░░░░░` 0% |
| ↳ their features | 10 | 5 | — | `█████░░░░░` 50% |

</details>

<details>
<summary><b>SCAG</b> · Sword Coast Adventurer's Guide — <code>█░░░░░░░░░</code> 5%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Class and subclass features | 39 | 2 | 0 | `█░░░░░░░░░` 5% |

</details>

<details>
<summary><b>VGM</b> · Volo's Guide to Monsters — <code>████░░░░░░</code> 38%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 7 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 143 | 57 | 0 | `████░░░░░░` 40% |
| ↳ their features | 690 | 560 | — | `████████░░` 81% |

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
| Monsters (fully resolved) | 2 | 1 | 0 | `█████░░░░░` 50% |
| ↳ their features | 4 | 3 | — | `████████░░` 75% |

</details>

<details>
<summary><b>GGR</b> · Guildmasters' Guide to Ravnica — <code>██░░░░░░░░</code> 21%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 41 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 79 | 25 | 0 | `███░░░░░░░` 32% |
| ↳ their features | 430 | 334 | — | `████████░░` 78% |

</details>

<details>
<summary><b>MTF</b> · Mordenkainen's Tome of Foes — <code>███░░░░░░░</code> 28%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Feats | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 4 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 140 | 40 | 0 | `███░░░░░░░` 29% |
| ↳ their features | 941 | 768 | — | `████████░░` 82% |

</details>

<details>
<summary><b>AI</b> · Acquisitions Incorporated — <code>███░░░░░░░</code> 29%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 7 | 0 | 1 | `█░░░░░░░░░` 14% |
| Items | 23 | 1 | 0 | `░░░░░░░░░░` 4% |
| Monsters (fully resolved) | 22 | 13 | 0 | `██████░░░░` 59% |
| ↳ their features | 120 | 107 | — | `█████████░` 89% |

</details>

<details>
<summary><b>AWM</b> · Adventure with Muk — <code>███████░░░</code> 73%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters (fully resolved) | 11 | 8 | 0 | `███████░░░` 73% |
| ↳ their features | 42 | 39 | — | `█████████░` 93% |

</details>

<details>
<summary><b>ERLW</b> · Eberron: Rising from the Last War — <code>██░░░░░░░░</code> 19%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Feats | 2 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 30 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 41 | 14 | 0 | `███░░░░░░░` 34% |
| ↳ their features | 244 | 200 | — | `████████░░` 82% |

</details>

<details>
<summary><b>EGW</b> · Explorer's Guide to Wildemount — <code>█░░░░░░░░░</code> 12%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 15 | 0 | 0 | `░░░░░░░░░░` 0% |
| Class and subclass features | 18 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 85 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 48 | 20 | 0 | `████░░░░░░` 42% |
| ↳ their features | 258 | 219 | — | `████████░░` 85% |

</details>

<details>
<summary><b>MGELFT</b> · Muk's Guide to Everything He Learned From Tasha — <code>███████░░░</code> 67%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters (fully resolved) | 6 | 4 | 0 | `███████░░░` 67% |
| ↳ their features | 27 | 24 | — | `█████████░` 89% |

</details>

<details>
<summary><b>MOT</b> · Mythic Odysseys of Theros — <code>██░░░░░░░░</code> 17%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 12 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 51 | 11 | 0 | `██░░░░░░░░` 22% |
| ↳ their features | 324 | 249 | — | `████████░░` 77% |

</details>

<details>
<summary><b>DOD</b> · Domains of Delight — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters (fully resolved) | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| ↳ their features | 9 | 6 | — | `███████░░░` 67% |

</details>

<details>
<summary><b>FTD</b> · Fizban's Treasury of Dragons — <code>██░░░░░░░░</code> 21%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 7 | 0 | 1 | `█░░░░░░░░░` 14% |
| Class and subclass features | 12 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 3 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 24 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 85 | 26 | 0 | `███░░░░░░░` 31% |
| ↳ their features | 677 | 547 | — | `████████░░` 81% |

</details>

<details>
<summary><b>MABJOV</b> · Minsc and Boo's Journal of Villainy — <code>██░░░░░░░░</code> 20%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters (fully resolved) | 56 | 11 | 0 | `██░░░░░░░░` 20% |
| ↳ their features | 473 | 364 | — | `████████░░` 77% |

</details>

<details>
<summary><b>SCC</b> · Strixhaven: A Curriculum of Chaos — <code>██░░░░░░░░</code> 22%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 5 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 2 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 18 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 47 | 16 | 0 | `███░░░░░░░` 34% |
| ↳ their features | 254 | 202 | — | `████████░░` 80% |

</details>

<details>
<summary><b>VRGR</b> · Van Richten's Guide to Ravenloft — <code>████░░░░░░</code> 37%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Class and subclass features | 11 | 3 | 0 | `███░░░░░░░` 27% |
| Items | 5 | 1 | 0 | `██░░░░░░░░` 20% |
| Monsters (fully resolved) | 35 | 15 | 0 | `████░░░░░░` 43% |
| ↳ their features | 212 | 180 | — | `████████░░` 85% |

</details>

<details>
<summary><b>AAG</b> · Astral Adventurer's Guide — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 2 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 20 | 0 | 0 | `░░░░░░░░░░` 0% |

</details>

<details>
<summary><b>BAM</b> · Boo's Astral Menagerie — <code>█████░░░░░</code> 49%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 72 | 36 | 0 | `█████░░░░░` 50% |
| ↳ their features | 401 | 350 | — | `█████████░` 87% |

</details>

<details>
<summary><b>MPMM</b> · Mordenkainen Presents: Monsters of the Multiverse — <code>████░░░░░░</code> 38%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters (fully resolved) | 261 | 99 | 0 | `████░░░░░░` 38% |
| ↳ their features | 1552 | 1304 | — | `████████░░` 84% |

</details>

<details>
<summary><b>AATM</b> · Adventure Atlas: The Mortuary — <code>███░░░░░░░</code> 33%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters (fully resolved) | 3 | 1 | 0 | `███░░░░░░░` 33% |
| ↳ their features | 22 | 16 | — | `███████░░░` 73% |

</details>

<details>
<summary><b>BGG</b> · Bigby Presents: Glory of the Giants — <code>███░░░░░░░</code> 28%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Class and subclass features | 6 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 8 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 31 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 72 | 33 | 0 | `█████░░░░░` 46% |
| ↳ their features | 432 | 358 | — | `████████░░` 83% |

</details>

<details>
<summary><b>BMT</b> · The Book of Many Things — <code>░░░░░░░░░░</code> 4%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Spells | 3 | 0 | 0 | `░░░░░░░░░░` 0% |
| Feats | 1 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 73 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 41 | 5 | 0 | `█░░░░░░░░░` 12% |
| ↳ their features | 292 | 222 | — | `████████░░` 76% |

</details>

<details>
<summary><b>HAT-TG</b> · Thieves' Gallery — <code>░░░░░░░░░░</code> 0%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters (fully resolved) | 7 | 0 | 0 | `░░░░░░░░░░` 0% |
| ↳ their features | 51 | 39 | — | `████████░░` 76% |

</details>

<details>
<summary><b>MCV4EC</b> · Monstrous Compendium Volume 4: Eldraine Creatures — <code>██░░░░░░░░</code> 20%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters (fully resolved) | 25 | 5 | 0 | `██░░░░░░░░` 20% |
| ↳ their features | 150 | 118 | — | `████████░░` 79% |

</details>

<details>
<summary><b>MPP</b> · Morte's Planar Parade — <code>████░░░░░░</code> 37%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Monsters (fully resolved) | 54 | 20 | 0 | `████░░░░░░` 37% |
| ↳ their features | 323 | 256 | — | `████████░░` 79% |

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
<summary><b>ABH</b> · Astarion's Book of Hungers — <code>█░░░░░░░░░</code> 10%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Feats | 16 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 5 | 2 | 0 | `████░░░░░░` 40% |
| ↳ their features | 36 | 32 | — | `█████████░` 89% |

</details>

<details>
<summary><b>LFL</b> · Lorwyn: First Light — <code>████░░░░░░</code> 42%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Feats | 2 | 0 | 0 | `░░░░░░░░░░` 0% |
| Items | 2 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 8 | 5 | 0 | `██████░░░░` 63% |
| ↳ their features | 39 | 36 | — | `█████████░` 92% |

</details>

<details>
<summary><b>NF</b> · Netheril's Fall — <code>████░░░░░░</code> 43%</summary>

| Part | Entries | DAS · Core | This pack | Core + pack |
|---|---:|---:|---:|---|
| Items | 8 | 0 | 0 | `░░░░░░░░░░` 0% |
| Monsters (fully resolved) | 6 | 6 | 0 | `██████████` 100% |
| ↳ their features | 35 | 35 | — | `██████████` 100% |

</details>

Counts of 2026-11-19, monsters of 2026-11-20 (docs/books.json); packages read on 2026-11-20 (docs/foundry-modules.json). "(+n)": rules of this pack on an entry already counted under DAS · Core (the pack completes the engine's entry, or serves another identifier of the same name); they are not added to the bar. Not counted, the catalogue having no such entry: Life Sense (MPMM).
<!-- /auto:books -->

## ⚠️ Known limitations

Booming Blade and Green-Flame Blade act on creatures the player does not own, so part of them runs on the active GM's
client, which checks again what it reads: see [What the GM's client does on a player's behalf](https://github.com/Aiacos/das-rulepack/blob/master/docs/GM-CLIENT.md).

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
- Life Sense, Ghostly Gaze: they need DAS · Core 0.287.0 or later (the `sense` key). They were played on features made by
  hand that carry the identifier, not on an imported creature or an imported invocation.
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
    index.mjs              every rule, from the book modules; builds the registered table (generated)
    books/<code>.mjs       one module per source book, generated from registry/<code>.json: xge.mjs, tce.mjs, ftd.mjs, …
  core/                    pure rules of the code-handled rules, no Foundry access (tested)
  *.mjs                    Foundry glue of the code-handled rules, importers
docs/
  books.json               entries per official rulebook, what DAS · Core covers (counts only, method and date)
  foundry-modules.json     official Foundry VTT packages and the book each corresponds to (source and date)
  RULES.md                 every rule, book by book (generated)
  GM-CLIENT.md             what the GM's client does on a player's behalf
  PIPELINE.md              how to run the rulebook pipeline
registry/
  <code>.json              one record per rulebook entry, rules included: the source of the book modules
  legacy.json              the 24 rules that predate the pipeline, with a fingerprint of each as migrated
tools/books-progress.mjs   writes the generated blocks of this README and of docs/RULES.md (`npm run books`)
tools/pipeline/            the rulebook pipeline: inventory, triage, gates, generation of the book modules
tests/
```

**The registry is the source.** `registry/<code>.json` (one file per book, named after its code in `docs/books.json`,
lowercase) holds one record per rulebook entry: names, pages, identifiers and fingerprints, no rulebook text, and for
the entries that have one, the rule with its metadata and the entry registered with DAS · Core. The book modules under
`scripts/rules/books/` and `scripts/rules/index.mjs` are generated from it by `npm run build:rules` and are never edited
by hand: CI and `./build.sh` refuse modules that differ from the registry. The pipeline that fills the registry runs from
`tools/pipeline/`; how to run it is in [docs/PIPELINE.md](docs/PIPELINE.md). What the registry holds for the 2024-era rulebooks,
in counts, is in [docs/coverage-5e24.md](docs/coverage-5e24.md); every book of the catalogue is in
[docs/coverage.md](docs/coverage.md).

**Editing or adding a rule**: edit its record in `registry/<code>.json`; run `npm run gates` (with the variables of
[docs/PIPELINE.md](docs/PIPELINE.md)) until it passes, `npm run build:rules` to regenerate the modules and `npm run books`
for the generated documents; add a new identifier to `tests/registration.test.mjs` and run `npx vitest run -u`. A new
record of a book comes from the inventory (`npm run inventory -- <BOOK> <kind|all>`), which reads every kind of entry:
spells, feats, optional features, class and subclass features, species and their traits, backgrounds, items and monster
features. A rule is a record whose verdict is `entry` or `code` and that carries a `rule`; drafting that `rule` through
the pipeline is not built yet, so a person writes it into the record and the gates check it. `sense` records exist only
among the legacy rules: inventory never produces one. The 24 rules that predate the pipeline are
*legacy* (`registry/legacy.json`): editing in place anything the module emits for one (its rule, identifier, name, book,
page, kind, verdict, status or `alsoIn`) makes the gates fail and `build:rules` refuse, until it is redone through the
pipeline (docs/PIPELINE.md, "Legacy rules"). A book of group A or B is laid out the same way; the
group comes from `docs/foundry-modules.json` alone.

**Rules handled in code** (Shadow Blade, the blade cantrips, Psychic Veil, Dreadful Strikes) keep their code where it was:
`scripts/<rule>.mjs` for the Foundry hooks and `scripts/core/<rule>.mjs` for the pure rules. Only their metadata (and their
entry, when they have one) sits in the registry and the generated book module, which names the script in `code`. Moving
the scripts under a per-book
folder would have changed every import and test path for no gain: a script is found from its book through `code`, and
`tests/books.test.mjs` checks that the identifiers the scripts recognise are the ones declared as handled in code.

## 🧪 Development

```
npm install
npm test
npm run books
```

Pure rules live in `scripts/core/` and are tested with Vitest; Foundry glue lives next to them in `scripts/`; declarative
rules are in `registry/`, generated into `scripts/rules/books/`. `npm run books` rewrites the generated blocks of this README
and of `docs/RULES.md` (a test fails when
they are stale). `./build.sh` builds the two release files in `releases/`: the zip (`scripts/`, `lang/` and the top-level documents;
`docs/`, `tools/` and `tests/` are not shipped, which is why this README links to `docs/` on GitHub) and the `module.json` to upload next to it.

## 📄 License

MIT. Not affiliated with Wizards of the Coast or with the DAS project.
