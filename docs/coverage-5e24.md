# Coverage of the 2024-era rulebooks — inventory and rule-based triage

Date: 2026-11-21 · DAS · Core 0.289.0 (the `DAS_CORE` clone) · counts only.

This page says, for each rulebook published in or after 2024 that has an official Foundry VTT module with a local dump, how
many entries the registry knows, how many were joined to an item of each origin, and what the rule-based triage decided.
It is **not** a measure of what works: nothing here was drafted, reviewed or played.

How each number was obtained: for each book, `npm run inventory -- <BOOK> all`, `npm run triage -- <BOOK>`, `npm run gates`,
then a recount of `registry/<book>.json`. Each inventory run took between 2.7 and 5.8 seconds.

## Totals

| | Count |
|---|---|
| Entries inventoried (six books) | 4,892 |
| Joined to an item of the official module | 4,258 |
| Ambiguous against the official module (wait for `npm run resolve`) | 113 |
| No item in the official module | 521 |
| Verdict `core` (DAS · Core has an entry under that identifier) | 1,237 |
| Verdict `none` | 181 |
| Verdict `data` | 35 |
| Verdict `unverifiable` (no text) | 77 |
| In `registry/queue.json`, waiting for a person | 11 |
| Left for reader agents | 3,362 |

`core` is a match by identifier: for kinds other than spells the identifier comes from the official item, or from the name
when there is none, so a `core` verdict says the engine has an entry of that name, not that it covers that entry's rule.

## By rulebook

### Player's Handbook (2024) (`XPHB`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB Importer: matched / ambiguous / absent | `core` | `none` | `data` | `unverifiable` | Queued or other | Left for readers |
|---|---|---|---|---|---|---|---|---|---|
| spell | 391 | 391 / 0 / 0 | 390 / 1 / 0 | 277 | 62 | 35 | 0 | 0 | 17 |
| feat | 77 | 77 / 0 / 0 | 0 / 0 / 77 | 46 | 0 | 0 | 0 | 0 | 31 |
| option | 58 | 58 / 0 / 0 | 0 / 0 / 58 | 33 | 0 | 0 | 0 | 0 | 25 |
| feature | 592 | 409 / 60 / 123 | 0 / 0 / 592 | 165 | 0 | 0 | 0 | 0 | 427 |
| species | 48 | 32 / 4 / 12 | 0 / 0 / 48 | 9 | 3 | 0 | 7 | 0 | 29 |
| background | 16 | 16 / 0 / 0 | 0 / 0 / 16 | 0 | 0 | 0 | 0 | 0 | 16 |
| item | 217 | 152 / 13 / 52 | 185 / 3 / 29 | 18 | 27 | 0 | 58 | 0 | 114 |
| monster | 62 | 58 / 0 / 4 | 0 / 0 / 62 | 11 | 0 | 0 | 0 | 0 | 51 |

Records in `registry/xphb.json`: 1461 inventoried.

### Dungeon Master's Guide (2024) (`XDMG`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB Importer: matched / ambiguous / absent | `core` | `none` | `data` | `unverifiable` | Queued or other | Left for readers |
|---|---|---|---|---|---|---|---|---|---|
| item | 593 | 318 / 0 / 275 | 457 / 0 / 136 | 144 | 77 | 0 | 4 | 0 | 368 |
| monster | 3 | 3 / 0 / 0 | 0 / 0 / 3 | 0 | 0 | 0 | 0 | 0 | 3 |

Records in `registry/xdmg.json`: 596 inventoried.

### Monster Manual (2025) (`XMM`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB Importer: matched / ambiguous / absent | `core` | `none` | `data` | `unverifiable` | Queued or other | Left for readers |
|---|---|---|---|---|---|---|---|---|---|
| item | 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| monster | 2146 | 2114 / 28 / 4 | 0 / 0 / 2146 | 504 | 0 | 0 | 0 | 0 | 1642 |

Records in `registry/xmm.json`: 2147 inventoried.

### Eberron: Forge of the Artificer (`EFA`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB Importer: matched / ambiguous / absent | `core` | `none` | `data` | `unverifiable` | Queued or other | Left for readers |
|---|---|---|---|---|---|---|---|---|---|
| spell | 1 | 1 / 0 / 0 | 1 / 0 / 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| feat | 28 | 28 / 0 / 0 | 0 / 0 / 28 | 0 | 0 | 0 | 0 | 0 | 28 |
| option | 4 | 0 / 0 / 4 | 0 / 0 / 4 | 0 | 0 | 0 | 0 | 0 | 4 |
| feature | 60 | 49 / 0 / 11 | 0 / 0 / 60 | 0 | 0 | 0 | 0 | 0 | 60 |
| species | 24 | 22 / 0 / 2 | 0 / 0 / 24 | 1 | 0 | 0 | 5 | 0 | 18 |
| background | 17 | 17 / 0 / 0 | 0 / 0 / 17 | 0 | 0 | 0 | 0 | 0 | 17 |
| item | 6 | 5 / 1 / 0 | 6 / 0 / 0 | 0 | 0 | 0 | 0 | 0 | 6 |
| monster | 118 | 114 / 4 / 0 | 0 / 0 / 118 | 11 | 0 | 0 | 0 | 0 | 107 |

Records in `registry/efa.json`: 258 inventoried.

### Forgotten Realms: Heroes of Faerûn (`FRHOF`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB Importer: matched / ambiguous / absent | `core` | `none` | `data` | `unverifiable` | Queued or other | Left for readers |
|---|---|---|---|---|---|---|---|---|---|
| spell | 19 | 19 / 0 / 0 | 19 / 0 / 0 | 0 | 0 | 0 | 0 | 0 | 19 |
| feat | 34 | 34 / 0 / 0 | 0 / 0 / 34 | 0 | 0 | 0 | 0 | 0 | 34 |
| feature | 56 | 46 / 0 / 10 | 0 / 0 / 56 | 0 | 0 | 0 | 0 | 0 | 56 |
| background | 18 | 18 / 0 / 0 | 0 / 0 / 18 | 0 | 0 | 0 | 0 | 0 | 18 |
| item | 26 | 15 / 0 / 11 | 17 / 0 / 9 | 0 | 8 | 0 | 3 | 0 | 15 |

Records in `registry/frhof.json`: 153 inventoried.

### Forgotten Realms: Adventures in Faerûn (`FRAIF`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB Importer: matched / ambiguous / absent | `core` | `none` | `data` | `unverifiable` | Queued or other | Left for readers |
|---|---|---|---|---|---|---|---|---|---|
| item | 18 | 9 / 0 / 9 | 9 / 0 / 9 | 0 | 4 | 0 | 0 | 0 | 14 |
| monster | 259 | 253 / 3 / 3 | 0 / 0 / 259 | 18 | 0 | 0 | 0 | 0 | 241 |

Records in `registry/fraif.json`: 277 inventoried.
## Not done

- No rule was drafted, no independent review was made, nothing was played.
- The 3,362 entries left need a reader; 1,643 of them are monster features of the *Monster Manual*.
- Ambiguous matches are not settled. Most are class features named "Ability Score Improvement" (the only same-name documents
  are general feats), same-name embedded items inside one actor, and items the equipment pack holds in several different
  copies.
- Entries with no official item are mostly placeholders ("Subclass Feature" lines), species traits that exist only as a
  spell document, item names that carry a quantity, vehicles and mounts.
- Plutonium is `unchecked` on every record. DDB Importer has dumps for spells and items only: for every other kind it is
  `absent` by lack of data, not by a check.
- Not inventoried: magic item variants built from a template, item groups, and items whose text comes from a shared
  template.
- *Ravenloft: The Horrors Within* has a local dump but is not in the dataset, so it has no text to fingerprint and was not
  inventoried. *Arcana Unleashed* and *World of Warcraft* have no local dump.
- Reprints were recorded on the items; the ids gate uses them only for records that have a rule, and none of the new
  records has one.
