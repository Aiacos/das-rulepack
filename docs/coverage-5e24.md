# Coverage of the 2024-era rulebooks — inventory and triage

Date: 2026-11-21 · DAS · Core 0.289.0 (the `DAS_CORE` clone) · counts only.

This page says, for each rulebook published in or after 2024 that has an official Foundry VTT module with a local dump, how
many entries the registry knows, how many were joined to an item of each origin, and what triage decided for them.
It is **not** a measure of what works: no rule was drafted from these verdicts, and nothing here was played.

How each number was obtained: for each book, `npm run inventory -- <BOOK> all`, `npm run triage -- <BOOK> --redo-rule`,
`npm run gates`; reader batches cut with `npm run batch` and their results applied with `npm run ingest`; then a recount of
`registry/<book>.json` and `registry/queue.json` by script. The official dumps are those of the modules as installed on
2026-11-21 (*Dungeon Master's Guide* 3.0.0).

## Totals

| | Count |
|---|---|
| Entries inventoried (six books) | 4,892 |
| Joined to an item of the official module | 4,304 |
| Ambiguous against the official module (wait for `npm run resolve`) | 164 |
| No item in the official module | 424 |
| Verdict `core` (DAS · Core has an entry under an identifier no other entry of that kind uses) | 690 |
| Verdict `none` (nothing to automate in combat) | 1,333 |
| Verdict `data` (the item's own data is enough) | 1,276 |
| Verdict `entry` (a declarative rule is needed and not written yet) | 1,412 |
| Verdict `code` (a script is needed) | 0 |
| Verdict `engine` (needs something the engine lacks) | 0 |
| Verdict `unverifiable` (no text) | 118 |
| No verdict, in `registry/queue.json`, waiting for a person | 48 |
| No verdict, left for reader agents | 15 |

Who set the verdicts: reader agents 3,863, rule 871, SRD reading of November 2026 95. A reader agent's verdict is one reading of
the text against the structure of the item's data; it was not checked by a second reader and not played. Verdicts below 0.7
of confidence, and every `engine` verdict, were not applied: they are in the queue.

Of the entries still without a verdict, 17 carry the hint `core-generic`: the engine has an entry under their
identifier, but the identifier is a generic name shared by several entries, so the rule does not decide for them.

Joined with a recorded difference against the official item: 38 by word order of the name,
26 monster features whose section differs from the item's activation. Ambiguous for a variant of
the name ("+1", a quantity): 55.

## By rulebook

### Player's Handbook (2024) (`XPHB`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB: matched / ambiguous / absent | `core` | `none` | `data` | `entry` | `code` | `engine` | no text | Queued | Left |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| spell | 391 | 391 / 0 / 0 | 390 / 1 / 0 | 277 | 65 | 38 | 9 | 0 | 0 | 0 | 2 | 0 |
| feat | 77 | 77 / 0 / 0 | 0 / 2 / 75 | 47 | 17 | 9 | 4 | 0 | 0 | 0 | 0 | 0 |
| option | 58 | 58 / 0 / 0 | 0 / 0 / 58 | 35 | 3 | 14 | 6 | 0 | 0 | 0 | 0 | 0 |
| feature | 592 | 409 / 60 / 123 | 0 / 0 / 592 | 157 | 252 | 45 | 134 | 0 | 0 | 0 | 4 | 0 |
| species | 48 | 40 / 0 / 8 | 0 / 0 / 48 | 9 | 18 | 7 | 4 | 0 | 0 | 0 | 0 | 10 |
| background | 16 | 16 / 0 / 0 | 0 / 0 / 16 | 0 | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| item | 217 | 159 / 16 / 42 | 188 / 8 / 21 | 19 | 115 | 0 | 4 | 0 | 0 | 79 | 0 | 0 |
| monster | 62 | 58 / 0 / 4 | 51 / 0 / 11 | 0 | 4 | 21 | 37 | 0 | 0 | 0 | 0 | 0 |

Records in `registry/xphb.json`: 1461 inventoried.

### Dungeon Master's Guide (2024) (`XDMG`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB: matched / ambiguous / absent | `core` | `none` | `data` | `entry` | `code` | `engine` | no text | Queued | Left |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| item | 593 | 349 / 51 / 193 | 462 / 30 / 101 | 146 | 208 | 97 | 93 | 0 | 0 | 36 | 13 | 0 |
| monster | 3 | 3 / 0 / 0 | 0 / 2 / 1 | 0 | 0 | 1 | 2 | 0 | 0 | 0 | 0 | 0 |

Records in `registry/xdmg.json`: 596 inventoried.

### Monster Manual (2025) (`XMM`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB: matched / ambiguous / absent | `core` | `none` | `data` | `entry` | `code` | `engine` | no text | Queued | Left |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| item | 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| monster | 2146 | 2114 / 28 / 4 | 1626 / 288 / 232 | 0 | 453 | 858 | 816 | 0 | 0 | 0 | 19 | 0 |

Records in `registry/xmm.json`: 2147 inventoried.

### Eberron: Forge of the Artificer (`EFA`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB: matched / ambiguous / absent | `core` | `none` | `data` | `entry` | `code` | `engine` | no text | Queued | Left |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| spell | 1 | 1 / 0 / 0 | 1 / 0 / 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| feat | 28 | 28 / 0 / 0 | 0 / 0 / 28 | 0 | 2 | 10 | 16 | 0 | 0 | 0 | 0 | 0 |
| option | 4 | 0 / 0 / 4 | 0 / 0 / 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| feature | 60 | 49 / 0 / 11 | 0 / 0 / 60 | 0 | 27 | 6 | 27 | 0 | 0 | 0 | 0 | 0 |
| species | 24 | 22 / 0 / 2 | 0 / 0 / 24 | 0 | 10 | 4 | 5 | 0 | 0 | 0 | 0 | 5 |
| background | 17 | 17 / 0 / 0 | 0 / 0 / 17 | 0 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| item | 6 | 5 / 1 / 0 | 6 / 0 / 0 | 0 | 1 | 1 | 4 | 0 | 0 | 0 | 0 | 0 |
| monster | 118 | 114 / 4 / 0 | 16 / 0 / 102 | 0 | 4 | 59 | 53 | 0 | 0 | 0 | 2 | 0 |

Records in `registry/efa.json`: 258 inventoried.

### Forgotten Realms: Heroes of Faerûn (`FRHOF`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB: matched / ambiguous / absent | `core` | `none` | `data` | `entry` | `code` | `engine` | no text | Queued | Left |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| spell | 19 | 19 / 0 / 0 | 19 / 0 / 0 | 0 | 1 | 1 | 17 | 0 | 0 | 0 | 0 | 0 |
| feat | 34 | 34 / 0 / 0 | 0 / 0 / 34 | 0 | 1 | 1 | 32 | 0 | 0 | 0 | 0 | 0 |
| feature | 56 | 46 / 0 / 10 | 0 / 0 / 56 | 0 | 17 | 8 | 28 | 0 | 0 | 0 | 3 | 0 |
| background | 18 | 18 / 0 / 0 | 0 / 0 / 18 | 0 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| item | 26 | 15 / 0 / 11 | 17 / 0 / 9 | 0 | 18 | 2 | 3 | 0 | 0 | 3 | 0 | 0 |

Records in `registry/frhof.json`: 153 inventoried.

### Forgotten Realms: Adventures in Faerûn (`FRAIF`)

| Kind | Entries | Official: matched / ambiguous / absent | DDB: matched / ambiguous / absent | `core` | `none` | `data` | `entry` | `code` | `engine` | no text | Queued | Left |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| item | 18 | 9 / 1 / 8 | 9 / 4 / 5 | 0 | 7 | 1 | 6 | 0 | 0 | 0 | 4 | 0 |
| monster | 259 | 253 / 3 / 3 | 75 / 7 / 177 | 0 | 55 | 93 | 110 | 0 | 0 | 0 | 1 | 0 |

Records in `registry/fraif.json`: 277 inventoried.

## Not done

- No rule was drafted from the `entry` and `code` verdicts, no independent review was made, nothing was played.
- 15 entries still need a reader; 0 of them are monster features.
- Ambiguous matches are not settled. Most are class features named "Ability Score Improvement" (the only same-name documents
  are general feats), same-name embedded items inside one actor, item variants, and items the equipment pack holds in
  several different copies.
- Entries with no official item are mostly lines that have neither text nor a document ("Subclass Feature"), species traits
  that exist only as a spell document, vehicles and mounts.
- Plutonium is `unchecked` on every record. DDB Importer has dumps for spells and items only: for every other kind it is
  `absent` by lack of data, not by a check.
- Not inventoried: magic item variants built from a template, item groups, and items whose text comes from a shared
  template.
- *Ravenloft: The Horrors Within*, *Arcana Unleashed* and *World of Warcraft* have a local dump but are not in the dataset,
  so they have no text to fingerprint and were not inventoried.
- Reprints were recorded on the items; the ids gate uses them only for records that have a rule, and none of the new
  records has one.
