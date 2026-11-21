# DAS · Rule Pack — rulebook pipeline

## 🧭 Purpose

The pipeline keeps **one registry record per rulebook entry** (`registry/<book>.json`) and takes each record from
"known" to "played in a running world". For every entry the first question is whether it needs a rule at all: DAS · Core
may already have it, the item data may already do the job, or the text may describe nothing to automate. That question is
called **triage**. Part of it is deterministic (a script); the rest is done by **reader agents**: models run by the Claude
Code session, never by the tools. The tools only cut batch files for readers and ingest the results they wrote.

The registry holds no rulebook text and no premium item data: names, pages, identifiers and SHA-256 fingerprints only. The
text itself lives in a local cache outside the repository.

## 🔧 Environment

| Variable | What it points at |
|---|---|
| `RULEPACK_DATASET` | the 5etools `data/` folder |
| `RULEPACK_DUMPS` | a folder of `<package>.<pack>.json` dumps, each a JSON array of Foundry documents |
| `RULEPACK_TEXT` | the text cache: files `<sha256>.txt`, one per entry text |
| `DAS_CORE` | a clone of the DAS · Core engine (read only) |
| `RULEPACK_REGISTRY` | optional: the registry folder, default `registry/` of this repository |
| `RULEPACK_RULES` | optional: where `build:rules` writes the generated modules, default `scripts/rules/` of this repository |

A command that needs a variable that is not set exits with code 2 and names it. Nothing under `tools/` calls a model, a
network service or a Foundry server.

## 🪜 Stages

Every command is an npm script: `npm run <name> -- <arguments>`.

| # | Stage | Command | Needs | Who runs it |
|---|---|---|---|---|
| 1 | Inventory | `npm run inventory -- <BOOK> <kind|all> [--allow-collisions]` | `RULEPACK_DATASET`, `RULEPACK_DUMPS`, `RULEPACK_TEXT` | a person |
| 1b | Settle a match | `npm run resolve -- <key> <origin> --doc <docId> --because "<one line>"` (see "Settling matches") | `RULEPACK_DUMPS` (`--doc`) | a person |
| 2a | Triage by rule | `npm run triage -- <BOOK>` | `DAS_CORE`, `RULEPACK_TEXT` | a person |
| 2b | Cut batches | `npm run batch -- triage <BOOK> --out <dir> [--size 40]` | nothing | a person |
| 2c | Read a batch | (no command: a reader agent reads a file) | `RULEPACK_TEXT` | the Claude Code session, via reader agents |
| 2d | Ingest results | `npm run ingest -- <results-file> [--overwrite]` | `RULEPACK_TEXT`, `DAS_CORE` | the Claude Code session |
| 4 | Gates | `npm run gates` (`-- --ci` in CI) | `DAS_CORE`, `RULEPACK_DUMPS`, `RULEPACK_TEXT` (`--ci`: `DAS_CORE`) | person, CI |
| 7 | Generate | `npm run build:rules` (`-- --check` to verify only) | nothing | a person; CI runs `--check` |

`<BOOK>` is a book code of `docs/books.json`, in any case: every command upper-cases it once (`xzz` is `XZZ`) and refuses,
with exit 2, a code that does not then match `/^[A-Z][A-Z0-9]{1,9}$/`. Registry files are named after the lower-case code
and hold the upper-case one; a file whose records name another book, or two records with one key, is not written.

The numbers 1, 2, 4, 7 are the stage numbers of the design
(`docs/superpowers/specs/2026-11-21-rulebook-pipeline-design.md`); stages 3, 5 and 6 are not built.

1. **Inventory** reads the dataset and the dumps and writes (or refreshes) one record per entry: page, edition, `srd`
   flag, canonical `identifier`, text fingerprint, and per origin the matched item with its activity and effect ids. The
   text goes into the cache. Official candidates come only from the dump files of the book's own package
   (`docs/foundry-modules.json`); a difference in level, school or edition makes a match `ambiguous`, other differences
   are kept on the matched item as `differences`. Re-running it refreshes the fingerprints and the `srd` flag; it never
   touches a verdict.
2. **Triage** has three parts.
   - `triage` applies `autoTriage` to the records of the book that have no verdict (an existing verdict is never
     overwritten): an identifier that DAS · Core already has is `core` ("DAS · Core has an entry"); a record with no text whose
     official origin is absent (a placeholder such as a
     "Subclass Feature" line: no text and no item) is `none` with why "placeholder: no text and no item"; an entry whose
     text is not in the cache, or that has no text but does have an official item, is `unverifiable`; anything else, SRD or not,
     is left for a reader (SRD content that Core lacks
     is a finding for upstream, not a rule for this pack). It records `evidence.triaged = { by: "rule", at }`, saves the
     book and prints a count per verdict and how many records are left.
   - `batch triage` writes `<dir>/<book>-triage-<NNN>.json` for the records that have no verdict and have text, grouped by
     kind, `--size` entries each (default 40). A batch is `{ id, stage: "triage", entries: [{ key, name, kind, edition,
     textSha, items }] }`; `items` are the item summaries without their `data`. Text is referenced by `textSha` and never
     embedded, so a batch file is safe to commit.
   - `ingest` takes what the readers wrote (see below).
4. **Gates** check every record deterministically and write their outcome into `evidence.gates`: the gates that were
   checked and passed in `passed`, those that could only leave a note in `noted`. The ids gate fails closed: every
   16-character token of letters and digits in an entry (a key, a value, or a dot-separated segment of either) is a
   document id unless it is a word of the engine's own vocabulary (entry keys, enumeration values, fact and moment names
   of the `DAS_CORE` clone), and every origin the rule names must have it as an activity or effect of its matched item (an item
   saved under several ids,
   `alsoDocIds`, has the same ids in every copy: identical data implies it). The ids gate also looks at the reprints (below).
   The `unique` gate applies only to records that have a `rule`, the only ones that register an identifier with the engine:
   two ruled records with one identifier always fail, whatever `sources` they bind; records without a rule are
   ignored (many features and traits share a name). The schema gate also checks `sources`: every key must be the docId (or
   an `alsoDocIds`) of the record's matched official item and every value the record's identifier
   (`sources: <docId> is not an item of this record`). `generate` fails naming the record on the same check, and refuses two
   emitted rules with one identifier. A
   code rule without an entry has nothing to check there (`ids: nothing to check (code rule without entry)`, noted).
7. **Generate** writes the book modules under `scripts/rules/` from the registry, and in `index.mjs` the export `SOURCES`
   (document id to identifier) of the records whose rule is emitted and that bind `sources` (checked against the record); it is
   an empty object for the 24
   rules of today. `scripts/main.mjs` hands it to the engine as `register(source, table, { sources })` only when it is not
   empty, so with no sources the call is the two-argument call it has always been.

## 📋 Record states

The state is derived from the evidence and written by the tools; nobody types it.

| State | Meaning |
|---|---|
| `inventoried` | the entry is known; no verdict yet |
| `triaged` | a verdict is set |
| `drafted` | a rule is written, but the gates have not passed on it (or the rule changed since) |
| `gated` | every required gate passed on the current rule |
| `reviewed` | an independent reading agrees |
| `played` | a scenario passed in a running world |

Besides the state, a record may carry the flag `legacy` (a rule that predates the pipeline). Verdicts: `core` (DAS · Core
has the entry), `data` (the item's own data resolves it), `none` (nothing to automate in combat), `entry` (a declarative
rule), `code` (needs a script), `engine` (needs something the engine lacks), `unverifiable` (no text).

## 📖 Brief for a triage reader agent

The Claude Code session gives each reader agent one batch file and this brief.

> You triage the entries of one batch file, `<dir>/<book>-triage-<NNN>.json`.
>
> **What you may read.** The batch file, and the text cache `$RULEPACK_TEXT`: the text of an entry is the file
> `<textSha>.txt`. Nothing else.
>
> **What you decide.** For each entry, one verdict:
> `data` (the item's own activities and effects already do what the text says), `none` (nothing in the text acts in
> combat), `entry` (a declarative rule can express it), `code` (it needs a script), `engine` (it needs something DAS · Core
> does not have: say what in `why`), or `unverifiable`. Do not use `core`: the script already
> settled it, and a result with `core` is rejected.
>
> **No text, no verdict.** If the text file is missing or unreadable, answer `unverifiable`, whatever you know of the rules.
> Never decide from memory of the book.
>
> **Write one file** `<batch id>.results.json` outside the repository:
>
> ```json
> {
>   "batch": "<batch id>",
>   "by": "<your agent handle>",
>   "results": [
>     { "key": "…", "verdict": "none", "why": "one line, at most 200 characters", "confidence": 0.9,
>       "keys": ["optional: the engine keys an entry would use"], "similar": ["optional: keys of the closest records"] }
>   ]
> }
> ```
>
> One result per entry of the batch, with the entry's `key` unchanged. `by` is a short handle such as `reader-3`, never a
> person's name: it is written into the registry, which is public. `keys` are entry keys of DAS · Core (`triggers`,
> `dataFixes`, …) or dotted paths that start with one (`triggers.0.on`). `why` is one line: no line break, no tab, no control
> character.
>
> **Limits.** `why` is your own words: never quote the rulebook, and in no case 12 or more consecutive words of the text
> (a longer quotation is rejected). No server, no network, no git, no edits to the repository.
>
> **Confidence** is a number from 0 to 1. 1 means certain; 0.7 is the line: at 0.7 or more you would stand behind the
> verdict if nobody checked it; below 0.7 you are guessing, or the text is ambiguous, and a person will look at it instead.
> Say 0.6 when unsure rather than rounding up.

## 📥 Ingesting results

The main session runs `npm run ingest -- <results-file>` for each results file. The command:

- applies every result that passes: sets `verdict` and `why`, and `evidence.triaged = { by, at, confidence }` (with `keys`
  and `similar` when given);
- **rejects the whole file** (exit 2, nothing applied) when it has a top-level field other than `batch`, `by` and
  `results` (an `overwrite` field included: see `--overwrite` below), or when `by` does not match
  `/^[a-z0-9][a-z0-9._-]{0,63}$/i`;
- **rejects a result** (the others are still applied) when:
  - it has a field other than `key`, `verdict`, `why`, `keys`, `similar`, `confidence`;
  - `keys` has more than 12 entries, or an entry that is not an entry key of the engine or a dotted path that starts with
    one (`/^[A-Za-z][A-Za-z0-9.]{0,63}$/`, first segment among the `ENTRY_KEYS` of the `DAS_CORE` clone);
  - `similar` has more than 5 entries, or an entry that is neither the key of a record nor a kebab-case identifier of at
    most 64 characters;
  - the verdict is `core` (only the rule-based step sets it) or unknown, or the key is unknown;
  - the confidence is not a number from 0 to 1;
  - `why` is empty, longer than 200 characters, not a single line of printable characters (a line break, a tab, a
    control or format character), or quotes 12 or more consecutive words of the cached text (compared on lower-cased
    words, whitespace and surrounding punctuation ignored);
  - the entry has no text and the verdict is not `unverifiable`;
  - the record already has a verdict (from a person, a rule or an earlier ingest), unless the command is run with
    `--overwrite`: replacing verdicts is a person's decision, given on the command line, never by a results file;
- puts results with confidence below 0.7, and every `engine` verdict whatever its confidence, in `registry/queue.json`
  instead of applying them: an array of `{ key, verdict, why, confidence, by, reason }` with `reason` either
  `low-confidence` or `engine`, sorted by key, one entry per key (a later result replaces an earlier one);
- prints `{ applied, queued, rejected }`, with `rejected` listing `{ key, reason }`, and exits with code 1 when anything was
  rejected. Applied and queued results are kept either way. A rejection repeats at most 80 characters of a key or of an
  unknown field name.

What the session does with the output:

1. A rejection means the reader's result for that key is unusable. Re-run those entries (cut a new batch after the others
   are applied: only entries without a verdict are cut) rather than patching the results by hand.
2. `registry/queue.json` is the list for a person. For each entry, a person decides the verdict. The tools do not apply
   queued verdicts. To settle a low-confidence one, the person checks it and ingests a results file with the verdict they
   chose, at confidence 1 and `"by": "<their handle>"` (a short handle, not their name: it lands in a public file), with
   `--overwrite` if the record already has a verdict; applying a verdict removes the key from the queue. An `engine` verdict
   is never applied by `ingest`: it waits in the queue until a person records the upstream issue and sets the record.
3. A batch with an unusual share of rejections or queued results is redone, not patched.

## 🏛️ Legacy rules

The 24 rules that shipped before the pipeline were migrated into the registry as they were: `legacy: true`, their old
status in `legacyStatus`, no text fingerprint and no item data (`text: null`, `items: []`). `registry/legacy.json` is the
list of them: an object `{ "<record key>": "<SHA-256 fingerprint of the record at migration>" }`. The fingerprint
(`legacyFingerprint` in `tools/pipeline/registry.mjs`) covers everything the generated module emits for the rule:
`identifier`, `name`, `book`, `page`, `kind`, `verdict`, `legacyStatus`, `alsoIn` and `rule`. It does not cover `evidence`.

A record has **legacy standing** only when it says `legacy: true`, its key is in `legacy.json` and the fingerprint of the
record as it is now is the one stored there. With standing, the gates note what cannot be checked without item data or text
(`ids`, `fixes`, `text` land in `evidence.gates.noted`, not in `passed`) instead of failing, and `build:rules` emits the
rule with its old status. That is why the 24 show the state `drafted` (the gates have not all *passed*) and still ship.
Without standing (a key not listed, or any of the fingerprinted fields edited since migration: a status raised from
`validated` to `played`, a new identifier, another page…) the gates fail in every mode (`legacy: <key> changed since
migration`) and `build:rules` refuses to write anything, naming the record. Evidence is not fingerprinted, so a legacy
rule may gain real evidence; but a hand-typed `evidence.played` does not change its status: only a complete play record
(`scenario`, `core`, `world`, `at`) does.

Whether legacy or not, a record that has a `rule` can only have the verdict `entry` or `code`: the schema refuses any
other, `ingest` rejects such a result even with `--overwrite` ("record has a rule; its verdict can only be entry or
code"), and `build:rules` fails naming a record found that way instead of silently leaving its rule out of the pack.

A rule leaves legacy by being redone through the pipeline: inventory gives it text and item data, a person drafts or
edits its `rule`, removes `legacy` and `legacyStatus` and its key from `legacy.json`, and from then on it ships only once
the gates pass on it (`gated`, status `validated`). Editing a legacy record in place without that, in anything the module
emits, is refused.

## 🚧 Not built yet

Only inventory, triage (rule-based, batch files, ingest), resolve, gates and generation exist. These stages of the design do not:

- **Draft**: writing `rule` for the `entry` and `code` verdicts.
- **Review**: the independent second reading and its comparison with the draft.
- **Play**: scenario generation and runs on a test world.
- **Drift**: recomputing fingerprints and reopening the records whose inputs changed.

Inventory reads the kinds `spell`, `feat`, `option`, `feature`, `species`, `background`, `item` and `monster` (`all` runs
them in that order and prints `{ kind: report }`; a kind with no dataset entries for the book is `{ entries: 0 }`, and only
when every kind is empty does the command exit 2). Triage and the later stages run on whatever the registry holds.

Notes on what inventory does with each kind:

- A record's `kind` is the pipeline kind; `owner` ("Class", "Class/Subclass" or a species) and `level` belong to the key of a
  feature, `owner` to that of a species trait; an item's `rarity` and a `copyOf` are recorded, never keyed. Two entries with
  one key are not merged: the second gets no record, both are listed under `collisions` and the command exits 1 unless
  `--allow-collisions` is given. A feature whose owner cannot be named is counted in `skipped`.
- An entry with no page gets `page: null` and is listed under `noPage`; `generate` refuses to emit a rule for such a record.
  An entry with no text gets `text: null` and no cache file.
- Matching looks at the Foundry document types of the kind (a species matches a `race` document, its traits `feat`
  documents). Names compare by slug (apostrophes alike, a leading "The" ignored); a trailing parenthesised group and a
  `+1`/`+2`/`+3` token are a variant marker that must agree. Same-name features and traits are told apart by the class,
  subclass or race document whose advancement grants them, then by `system.requirements` and the feat subtype; what cannot be
  told apart is `ambiguous`, never the first. An item whose rarity differs (case-insensitive; a missing one is unknown) is
  `ambiguous`.
- A monster has no single rule: each stat-block feature (trait, action, bonus action, reaction, legendary or mythic action;
  a spellcasting block is one trait named as the block) is a record, `kind: "monster"`, with `owner` = the creature and
  `section`. Key: `<book>:monster:<creature>/<section>/<feature>`, a name repeated within one creature and section numbered
  `#2`, `#3` in dataset order (the record carries `occurrence`). The name is the base name: the recharge markup and the
  cost or use qualifiers ("(Costs 2 Actions)", "(3/Day)") are dropped, the text keeps them. A `_copy` creature lists only the
  sections it defines itself (nothing is inherited; the base's features are records of the base creature), with
  `copyOf` = "<base name>|<base source>". Two creatures of one name in a book collide like any other key.
  The official candidates are the items embedded in the actors of the creature's name in the book package's `*actors*`
  dumps (`docId` = `<actor id>.<item id>`); same-name actors with identical embedded item ids are one, differing ones make
  the features found in them `ambiguous`; no actor of the name makes every feature `absent`. DDB Importer has no monster
  dump. The report adds `creatures`, `copies` (`_copy` creatures) and `noActor` (creatures with no actor), all counts.
- Repeat numbers (`#2`) are re-derived against the registry on every run, not by position: among the same-name features of one
  creature and section, the record whose stored text fingerprint equals the feature's keeps its key; only a lone feature
  with a lone record and no fingerprint match is a text edit and keeps that record; every other feature takes the lowest
  number no existing record uses, and the unmatched records stay untouched (never given to another feature).
  A record of the book and kind that a run no longer produces is never deleted or rewritten: its key is listed in `vanished`
  (legacy records and `sense` records never are). A monster feature matches only an embedded item whose activation (action,
  bonus, reaction, legendary, mythic; trait when passive) agrees with its section; an item that states none, or has no
  activity, is neutral (a spellcasting block ignores the section). An item still claimed by two features of one creature
  makes both `ambiguous` (`differences: ["duplicate"]` within one section, `["section"]` across sections).
  Whenever a record that has a verdict gets another text, inventory dates it in `textChangedAt` (cleared when a verdict is
  written again). A creature's identity includes its book.
- A re-run keeps every key; a record that has a `rule` keeps its `identifier` (the official one stays on the official item).

## 🤝 Settling matches, sources and reprints

- **`resolve`** settles an item that matching left `ambiguous`:
  `npm run resolve -- <key> <origin> --doc <docId> --because "<one line>" [--by <handle>] [--force]`, or `--absent` instead of
  `--doc`. `<origin>` is `official` or `ddb-importer`. `--doc` needs `RULEPACK_DUMPS` (it reads the document's ids and data
  fingerprint from the book's dumps). The docId must be one of the item's listed `candidates`; with `--force`, any document of
  the origin's dumps whose type fits the kind (and an item that is not ambiguous can be re-settled). `--because` is mandatory:
  one printable line of at most 200 characters. `--by` is a handle like ingest's (default `maintainer`). It writes the item as
  `matched` (ids, `data`) with `resolved: { by, at, because }`; `--absent` removes the item and records
  `{ origin, absent: true, by, at, because, candidates }` in the record's `resolutions`, so inventory does not add it again.
  It never touches verdict, rule or evidence.
- **Inventory and what was settled.** A resolved item stays while the chosen document is in the dump with the same data
  fingerprint; an `absent` resolution stays while matching offers the same candidates (or none). Otherwise the item goes back
  to what matching says and the key is listed under `resolutionStale` in the report.
- **`sources`.** When an item's identifier is not the record's, inventory fills `sources: { <docId>: <identifier> }`, which is
  what the engine accepts with `register(source, table, { sources })` (keys are 16-character document ids, values kebab-case
  identifiers). Only an official package's documents qualify. A DDB Importer item lives in a world, where the id is the world's
  own and not stable across worlds, and a monster feature's id is `<actor id>.<item id>`: those get `identifierDiffers: true`
  on the item and no source. Inventory owns the field: it is recomputed on every run and removed when nothing is bound.
- **Reprints.** The official item of every kind but monsters gets `reprints: [{ package, docId, sameIds, missing? }]` for each
  other official package (any dump file that is not of the book's package, does not start with `ddb.` or `dnd5e.`, and is not
  an actor pack) that holds the same document id. `sameIds` compares the sets of activity ids and effect ids; when they differ,
  `missing` lists the ids of the item that the reprint lacks (required when `sameIds` is false). The ids gate fails a ruled
  record whose entry uses an id listed in
  `missing`, naming the package, unless the item lists the package under `reprintsExcluded: [{ package, because }]`, which is set
  by `npm run resolve -- <key> official --exclude-reprint <package> --because "<one line>"`. Inventory keeps a
  `reprintsExcluded` entry while the package is still a reprint.

Rulings of this milestone, in short:

- **Identical copies.** Candidates with the same mechanics fingerprint (the canonical JSON of `system` and `effects` without
  `system.container`, `quantity`, `source.revision`, `equipped`, `attuned` and `identified`) and the same activity and effect id
  sets (one item saved under several document ids, e.g. per-folder copies) are one candidate; the stored `data.sha256` stays
  the full fingerprint of the first docId: `matched` with the first docId in sorted order, the others on the item as
  `alsoDocIds`. Candidates whose data
  differs stay `ambiguous`. A monster feature never collapses (two embedded items of one name are two items).
- **A feature named like its subclass** (owner `Class/Subclass`, name equal to the subclass) may match the `subclass`
  document of that name, only when no feature document matches; a subclass document belongs to the class it names.
- **Re-inventory keeps `page`** as well as `identifier` on a record that has a `rule`; another page in the dataset is listed under
  `pageChanged` and the stored one kept (a stored page of `null` is filled).
- **Monsters.** When a feature's section disagrees with the activation of the only same-name item of the actor and no other
  feature of the creature claims that item, the feature is `matched` with `differences: ["section"]`; two features competing
  for one item stay `absent` (disagreeing) or `ambiguous` (agreeing).
- **Settled items keep their reason.** A settled item keeps the `differences` of the chosen document against the entry (edition,
  rarity, structure against the official item for ddb-importer), so `report.differing` still lists it. `resolve` accepts any
  listed candidate whatever its type; `--force` is limited to the kind's types (plus `subclass` for a feature that names its
  subclass) and, for a monster, to the actors of its own creature. `--absent` on a matched item needs `--force` and then
  sticks while the document's data is unchanged.
- A resolution leaves `evidence.gates` in place until the gates run again.
- A reprint is checked only when the rule names `official` among its origins; a `sameIds: false` reprint without a usable
  `missing` is taken to lack every id.
