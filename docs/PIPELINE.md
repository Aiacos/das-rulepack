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

Every command is an npm script: `npm run <name> -- <arguments>`. Lines of this document stay within 132 columns, table rows
excepted.

| # | Stage | Command | Needs | Who runs it |
|---|---|---|---|---|
| 1 | Inventory | `npm run inventory -- <BOOK> <kind|all> [--allow-collisions]` | `RULEPACK_DATASET`, `RULEPACK_DUMPS`, `RULEPACK_TEXT` | a person |
| 1b | Settle a match | `npm run resolve -- <key> <origin> --doc <docId> --because "<one line>"` (see "Settling matches") | `RULEPACK_DUMPS` (`--doc`) | a person |
| 2a | Triage by rule | `npm run triage -- <BOOK> [--redo-rule]` | `DAS_CORE`, `RULEPACK_TEXT` | a person |
| 2b | Cut batches | `npm run batch -- triage <BOOK> --out <dir> [--structure <private dir>] [--size 40] [--kind <kind>] [--without-items]` | nothing (`--structure`: `RULEPACK_DUMPS`) | a person |
| 2c | Read a batch | (no command: a reader agent reads files) | `RULEPACK_TEXT` | the Claude Code session, via reader agents |
| 2d | Ingest results | `npm run ingest -- <results-file> [--overwrite \| --second]` | `RULEPACK_TEXT`, `DAS_CORE` | the Claude Code session |
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
     overwritten), in this order:
     - **`core`** ("DAS · Core has an entry under this identifier") only when DAS · Core has the record's identifier, the
       record is of the 2024 edition (the engine's entries are written for the 2024 rules) AND no other 2024 record of the
       same kind, in the whole registry, uses it: a 2014 twin neither takes the verdict away nor gets it. A monster feature
       never gets `core` by rule. A record
       that misses `core` only for that reason gets `hint: "core-generic"` (the engine has a generic entry of that name) and
       goes on through the rules below; the hint is passed to the reader.
     - **No text in the dataset** (`text: null`): a species whose traits are records of their own is left alone (its traits
       describe it); a record with a matched or ambiguous item in some origin is `unverifiable` ("the rulebook entry has no
       text of its own"); a record of kind spell, feat, option, feature, background or item with no item in any origin (a
       placeholder such as a "Subclass Feature" line) is `none` ("no text and no item in any origin"); any other is left.
     - **A text fingerprint missing from the cache** is `unverifiable` ("the rulebook text is not in the cache").
     - Anything else, SRD or not, is left for a reader (SRD content that Core lacks is a finding for upstream, not a rule
       for this pack).

     It records `evidence.triaged = { by: "rule", at }`, saves the book and prints a count per verdict and how many records
     are left. With `--redo-rule` it also re-evaluates every record of the book whose verdict the rules set
     (`evidence.triaged.by` is `"rule"`, with no confidence): a verdict the rules give again keeps its date, one they give
     differently is rewritten, and one they no longer give is cleared (`verdict` back to null, `why` and `evidence.triaged`
     removed, and the count printed as `cleared`). A verdict set by `ingest` and a record that has a `rule` are never
     touched. `by: "rule"` is reserved: `ingest` refuses a results file signed with it.
   - `batch triage` leaves out the records with no matched item in any origin (a reader has nothing to compare the text
     with); `--without-items` cuts them too.
   - `batch triage` writes `<dir>/<book>-triage-<NNN>.json` for the records that have no verdict and have text, grouped by
     kind (`--kind` keeps one kind), `--size` entries each (default 40). A record whose key is in `registry/queue.json`
     (waiting for a person) is not cut. When `<dir>` already holds batch files of the book, numbering continues after the
     highest number there: an id is never reused. Re-running `batch` therefore cuts the entries that are still open again,
     under new ids, until their results are ingested. A batch is `{ id, stage: "triage", entries: [{ key, name, kind,
     edition, textSha, owner?, level?, section?, rarity?, page?, srd?, hint?, items }] }`; the optional fields are the
     record's own (where a feature sits, its page, the SRD flag, the hint of the rule-based triage) and are left out when the
     record has none; `items` are the item summaries without their `data` (a matched item keeps its `differences`). Text is
     referenced by `textSha` and never embedded, so a batch file is safe to commit. `--out` (and `--structure`) must be a
     folder or not exist yet: an existing file is a usage error.
   - `batch triage ... --structure <private dir>` also writes `<private dir>/<batch id>.structure.json`:
     `{ batch, entries: { <key>: { <origin>: <structure> | null } } }`, one origin per matched item (`null` when the dumps do
     not hold its document, always so for `plutonium`); an entry with no matched item is left out. It needs `RULEPACK_DUMPS`.
     The document is looked up by the item's docId and, when the item records one, its data fingerprint (`data.sha256`);
     only documents of a type the pipeline reads are indexed (items, class, subclass, race, background, actors: never a
     journal entry or page that shares the id), and a document that cannot be found that way is `null`, never another one.
     Every structure is computed before any file is written. For a monster feature the document is the item embedded in the
     actor (`<actor id>.<item id>`). The structure
     (`tools/pipeline/structure.mjs`) is built from a whitelist: `level`, `school`, `rarity`, `duration`, `concentration`,
     `uses` (`max`, recovery periods), per activity its `id`, a `label` (the name without markup, 40 characters at most),
     `type`, `activation`, `save` (abilities and DC), `onSave`, `damage` and `healing` parts (`number`, `denomination`,
     `types`), `template`, `affects`, the ids of its `effects` and what it `consumes`, and per effect `id`, `name`,
     `statuses`, the `changes` as a list of changed KEYS (never their values), `transfer` and `duration`. No description,
     chat text, flag or prose value is ever copied: a string that is not a plain value (enumeration, id, key, short formula)
     is dropped. It is still derived from premium data, so the command REFUSES (exit 2, nothing written) a `--structure`
     folder inside the repository (real paths, so also through a symlink: each existing part of a path is resolved before
     the next one is applied), inside the registry folder or equal to or around `--out`, and a `--structure` or `--out`
     path with a `..` segment. Never commit a structure file.
   - `ingest` takes what the readers wrote (see below).
4. **Gates** check every record deterministically and write their outcome into `evidence.gates`: the gates that were
   checked and passed in `passed`, those that could only leave a note in `noted`, and in `items` the data fingerprint of
   the matched item of each origin the rule names (`{ <origin>: <data.sha256> }`, left out when no item has data, as for a
   legacy rule), and in `emits` a fingerprint of the record fields its emitted rule is made of besides the rule
   (`identifier`, `name`, `book`, `page`, `kind`, `alsoIn`, `sources`: `registry.mjs` `emittedFingerprint`). The evidence
   counts (state `gated`, and the `--ci` check) only while the rule fingerprint is the rule's, `emits` is the record's,
   and every recorded item fingerprint is that of the record's current matched item of its origin: moving an item to
   another document or changing its data, by `resolve`, inventory or anyone, makes the record `drafted` again.
   The ids gate fails closed: every
   16-character token of letters and digits in an entry (a key, a value, or a segment of either split at `.`, `#`, `/`,
   brackets, braces and spaces, so `#<id>`, `<id>/<id>` and `@UUID[…<id>]` are read) is a
   document id unless it is a word of the engine's own vocabulary (entry keys, enumeration values, fact and moment names
   of the `DAS_CORE` clone). The ids of several origins sit side by side (Ruling R4): every id must be an activity or effect
   of the matched item of at least one origin the rule names (`ids: <id> belongs to no origin of the rule`), and each origin
   named must contribute one when the entry has any (`ids: <origin> contributes no id`). A key whose slot holds one id
   (`tools/pipeline/draft-keys.mjs`, slot `single`: `triggers`, `rollBonus`, `atTurnStart`, `onHit`, `dataFixes`) names one
   origin only when it holds an id: a rule that names two fails (`ids: <key> holds one id: it may name one origin only (the
   others go in rule.uncovered)`); a legacy record is not held to it. An item saved under several ids,
   `alsoDocIds`, has the same ids in every copy (identical data implies it). Every matched origin (a Plutonium `unchecked`
   item is not) is named in `origins` or listed in `rule.uncovered: [{ origin, because }]` with one line saying why
   (Ruling R5; `ids: <origin> is matched but neither in origins nor uncovered`). The item of every origin named must be
   reached by an identifier the rule registers: the record's own, a `sources` binding, or an alias of `rule.alsoAs`
   (`ids: <origin> item identifier <x> is not reached (no source, no alias)`; an alias reaches only the item of its own
   `origin`). A legacy record with standing is held to the first two checks only (its origins predate `uncovered` and
   aliases: the TCE rules name `ddb-importer` alone although the official item is matched); each such origin is printed as a
   `coverage:` note (not a gate: the record's evidence does not change) and `docs/RULES.md` says "Not checked on <origin>".
   The schema gate also checks, from the record alone (so under `--ci` too), the identifiers a ruled record registers
   (`identifiers.mjs` `identifierProblems`): its own identifier is not generic (`GENERIC_IDENTIFIERS`); a monster feature's
   is its creature-scoped one, it has no alias, and an official item with `embeddedShared` fails
   (`shared embedded item id: waits on upstream …`, the rule stays `drafted`); every alias is not generic, its `origin` is in
   `rule.origins`, and it equals the identifier of the record's matched item of that origin. The ids gate also looks at the
   reprints (below), with the ids the official item contributes.
   The `unique` gate applies only to records that have a `rule`, the only ones that register an identifier with the engine:
   two ruled records that register one identifier, their own or an alias, always fail, whatever `sources` they bind; records
   without a rule are ignored (many features and traits share a name). A registered table is merged over the engine's own
   entries identifier by identifier, so an identifier or alias equal to a DAS · Core identifier (`content/index.mjs`
   `SHIPPED` and `SRD_ALIASES` of the clone) fails unless it is the record's own identifier and the rule says `inCore: true`
   (set by a person): it would patch the engine's entry for every item of that name. An alias never may.
   The validator gate also checks the rule's assertions (`rule.assert`, below) against the enumerations of the clone.
   A data fix without `from` must at least find its path on the document (`fixes: <path> does not exist`).
   The schema gate also checks `sources`: every key must be the docId (or
   an `alsoDocIds`) of the record's matched official item and every value the record's identifier
   (`sources: <docId> is not an item of this record`). `generate` fails naming the record on the same check, and on the
   identifier checks of any record that has a rule (`identifierProblems`, whatever its state), and refuses two
   emitted rules with one identifier. A
   code rule without an entry has nothing to check there (`ids: nothing to check (code rule without entry)`, noted).
7. **Generate** writes the book modules under `scripts/rules/` from the registry (a rule with aliases carries
   `alsoAs: [<identifier>]`, and one with uncovered origins `uncovered`, shown in `docs/RULES.md`); `TABLE` in `index.mjs`
   registers each entry under its identifier and under each alias; and in `index.mjs` the export `SOURCES`
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
| `reviewed` | an independent reading agrees, about the rule as it is |
| `played` | a scenario passed in a running world, on the rule as it is |

Evidence about the rule carries its fingerprint (`rule`, `registry.mjs` `ruleFingerprint`): `evidence.drafted: { by, at, core,
rule }`, `evidence.reviewed: { by, at, agrees, rule, confidence }`, `evidence.played: { at, core, world, scenario, client?,
rule }` (no other field; `by` a reader handle, `confidence` from 0 to 1). A review or a play counts only while its `rule` is
the fingerprint of the current rule, so editing the rule makes gates, review and play stale at once. A legacy record may keep a
review or a play written before the stamp existed (no `rule`): it counts as it did; one that carries a stamp is held to it.

## 🧾 Rule vocabulary

- **Assertions.** Every rule outside the legacy ones has `rule.assert`, a non-empty array of `{ given, expect }`
  (`tools/pipeline/assert.mjs`): what the rule says happens, so that a draft and a review can be compared and a scenario can
  check it. `given: { roll?: hit|miss|crit|failedSave|savedSave, moment?, origin?, targetType?, free? }`; `expect: { damage?:
  { fraction: 0|0.5|1|2, type? }, condition?: { applied?, ended? }, ends?, roll?: { mode: advantage|disadvantage, on:
  attack|save|check, for: self|target|ally|enemy }, affects?, excludes? (target|allies|enemies|self), move?: { mode,
  distance? }, uses?: { spent }, free? }`. Any other field is refused; `free` is one printable line of at most 120
  characters and never stands alone (every assertion has a closed `expect` field); `given.origin` is one of the rule's
  `origins`; `move.distance` is a non-negative number or a formula of at most 24 characters (digits, spaces, `+ - * / ( ) .`,
  `@` paths). `rule.adds` is one printable line of at most 200 characters (a legacy rule's predates the limit). The schema
  checks the shape; the validator gate checks `moment` (MOMENTS), `targetType` (CREATURE_TYPES), the statuses of `condition`
  (the conditions `core/monster-text.mjs` names), `ends` (EFFECT_ENDS or a moment), `move.mode` (MOVE_MODES) and
  `damage.type` (DAMAGE_TYPES) against the clone (`loadCore`). `normaliseAssert` gives the sorted canonical forms of a list
  (`path=value` pairs; a free text is `*`, it never counts as agreement); `impliedAsserts(entry)` what an entry says by itself:
  `saveDamage` (a saved save: half or no damage), `halfOnMiss`, `noDamage`, and a `triggers` declaration on `failedSave` with a
  `status` or `move` step (Rulings R15, R16: `noReactions` implies nothing, so such a rule always goes to a person at review).
- **Quotations.** The text gate reads the record's cached text and fails a rule whose `adds` or any `assert[].given.free` /
  `assert[].expect.free` repeats 8 or more consecutive words of it (`text: <field> quotes 8 or more consecutive words of the
  source text`); a text not in the cache fails. Under `--ci` there is no text cache: what holds there is the gate evidence,
  whose rule fingerprint covers `adds` and `assert`, so a rule edited after a local run fails `--ci` until the gates pass on
  it again; the schema's length and line limits run in both modes.
- **Drafter keys** (Ruling R6). `DRAFT_KEYS` (`tools/pipeline/draft-keys.mjs`) lists the entry keys a drafter may write, each
  with the slot its ids sit in (`activityMap`, `effectMap`: ids as an object's keys or a list, origins side by side; `single`:
  one id, one origin; `none`), read off each key's validator in the clone; `tests/pipeline/draft-keys.test.mjs` checks every
  key against the engine's `ENTRY_KEYS` and validator. `checkDraftKeys(entry, { origins, kind })` (both required: it throws
  without them) refuses any other key (the record goes to the drafts queue as outcome `person`) and, in `dataFixes`: a
  `create` (an effect to create goes to a person), a fix without a non-empty `from` guard (`{}`, `[]` or an empty part inside
  are refused: the engine's matcher takes `{}` for anything), a prose path (`name`, `system.description…`,
  `system.unidentified…`, `flags.…`, `img`, any `name`, `description` or `chat…` segment), a string longer than 60
  characters in `value`, an origin other than official alone, a monster feature.
- **Queues** (Ruling R7). `registry/drafts-queue.json` and `registry/review-queue.json` sit beside `queue.json`: arrays of
  `{ key, reason, by, why, confidence, draft?, review? }`, sorted by key (`registry.mjs` `loadQueue`, `saveQueue`,
  `validateQueueEntry`). With `legacy.json` they are the files of `NOT_BOOKS` (`registry.mjs`): `generate`, the CLI,
  `books-progress` and every other reader of `registry/*.json` leave them out, and no book code may take their names.
  `loadQueue` refuses a file that does not parse or an entry that is not valid (record key shape, known fields), and
  `gates` (with or without `--ci`) loads every queue first: a broken one exits 2 naming the file.

Besides the state, a record may carry the flag `legacy` (a rule that predates the pipeline). Verdicts: `core` (DAS · Core
has the entry), `data` (the item's own data resolves it), `none` (nothing to automate in combat), `entry` (a declarative
rule), `code` (needs a script), `engine` (needs something the engine lacks), `unverifiable` (no text).

## 📖 Brief for a triage reader agent

The Claude Code session gives each reader agent one batch file, its structure file and this brief.

> You triage the entries of one batch file, `<dir>/<book>-triage-<NNN>.json` (or `<dir>/<book>-second-<NNN>.json`, a second
> reading: the same work, done blind).
>
> **What you may read.** The batch file; its structure file `<private dir>/<book>-triage-<NNN>.structure.json` (or
> `<private dir>/<book>-second-<NNN>.structure.json`); and the text cache `$RULEPACK_TEXT`: the text of an entry is the file
> `<textSha>.txt`. Nothing else: never open anything under `registry/` (`queue.json` included), nor the results files of
> other readers.
>
> **How you work.** For each entry, read the rule text by its `textSha`, then compare it with the structure of each origin
> (`official`, `ddb-importer`, `plutonium`) under the entry's key in the structure file. The structure says what the item's own
> data carries (activities, saves, damage, templates, effects with the keys they change, uses, duration, concentration); the
> text says what the rule is. A `null` origin has a matched item whose document could not be read; an origin missing from the
> structure file has no matched item. The batch entry gives `owner`, `level`, `section`, `rarity`, `page` and `srd` where they
> apply, and per item its `match` and `differences`. When the origins differ, say in `why` which origin lacks what.
> An entry with `hint: "core-generic"` has an identifier for which DAS · Core has a generic entry (shared by many entries,
> or a monster feature): it says nothing about this entry, so judge it against its text like any other.
>
> **What the engine does without an entry** (so the data resolves it: `data`, or `none` when the text adds nothing to combat):
> attack rolls; saving throws; damage and healing, with half or none on a successful save as the activity says; applying an
> activity's effects on a hit or a failed save; statuses, with the standard condition rules; durations; passive effects that
> transfer to the bearer; concentration; uses and their recovery; templates and targeting; summon and cast activities.
>
> **What needs an entry** (`entry`, or `code` when a declarative rule cannot say it): a saving throw repeated each turn;
> damage at the start of a turn or on entering an area; an effect that ends on a stated event; a rider that applies once per
> turn; an aura; advantage or disadvantage in a stated circumstance; a rule limited to a creature type; a choice made at the
> moment of use; a data fix, when the item's data lacks what the text needs (an activity, an effect or a value that is missing
> or wrong in every origin).
>
> **What you decide.** For each entry, one verdict:
> `data` (the item's own activities and effects already do what the text says), `none` (nothing in the text acts in
> combat), `entry` (a declarative rule can express it), `code` (it needs a script), `engine` (it needs something DAS · Core
> does not have: say what in `why`), or `unverifiable`. Do not use `core`: the script already
> settled it, and a result with `core` is rejected.
>
> **No text, no verdict.** If the text file is missing or unreadable, answer `unverifiable`, whatever you know of the rules.
> Never decide from memory of the book, and never from the structure alone: it shows what the data does, not what the rule is.
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
> (a longer quotation is rejected), and never copy a structure file's content beyond ids and keys: it is private. No server,
> no network, no git, no edits to the repository.
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
4. Before a person reads the queue, a second reader may read it (below). Give a second reading to a reader with a different
   handle (`by`) than the first one's: the tool rejects the same handle.

### Second reading of the queue

An independent, blind second reading keeps only the real disagreements for a person.

- `batch triage <BOOK> --out <dir> [--structure <dir>] [--size <n>] [--kind <kind>] [--without-items] --queued` cuts batches
  only from the records of the book that are in `registry/queue.json` and have no `second` yet (and, as for any batch, no
  verdict, a text and a matched item unless `--without-items`). Ids are `<book>-second-<NNN>`, numbered apart from the
  triage batches and continuing after the highest `-second-` number in `<dir>`; `stage` stays `"triage"`. The entries are those
  of a normal batch: they carry nothing of the first reading (no verdict, why, confidence or handle). `--structure` works as
  usual. Without `--queued` nothing changes (a normal batch still leaves the whole queue out).
- `ingest <results-file> --second` reads the results of the second reader (same file format, a handle other than the first
  reader's). Every check of `ingest` applies and `core` is refused. In addition:
  - a result whose key is not in the queue, whose entry already has a `second`, or whose `by` equals the queued `by`
    (case aside) is rejected, and nothing of it is applied;
  - same verdict as the queued one, neither being `engine`, and the second reader's confidence at least 0.7 (the queue
    threshold; exactly 0.7 counts): **agreed**. The verdict is applied (`why` is the second reader's; `evidence.triaged` is
    written as for any ingest, by the second reader, plus `evidence.triaged.first: { by, confidence }` for the first reading)
    and the entry leaves the queue. Two unsure readings never settle a record;
  - same verdict but the second confidence below 0.7: **unsure**. Nothing is applied; the entry stays in the queue with
    `reason: "unsure-twice"` and the `second` reading;
  - a different verdict, or `engine` on either side: **disagreed**. The record stays without a verdict and the entry stays in
    the queue with `reason: "disagreement"` (`"engine"` when both readings are `engine`) and
    `second: { verdict, why, confidence, by }`;
  - an entry with a `second` (disagreed or unsure) is not cut again by `--queued`, a further `--second` result for it is
    rejected, and so is a normal `ingest` result for it, with or without `--overwrite` ("two readers disagree: it waits for a
    person"): no third reading, and no single reader undoes two. A result is also rejected when the same key appears twice in
    the file, or when the queue entry names no first reader;
  - it prints `{ agreed, disagreed, unsure, rejected }` (`rejected` as `{ key, reason }`) and exits with 1 when anything was
    rejected.
  `--second` together with `--overwrite` is a usage error.
- What stays for a person: the queue entries with a `second` (`reason` `"disagreement"`, `"unsure-twice"` or `"engine"`: the
  two readings side by side) and every `engine`
  verdict, as before. Entries that nobody has read twice yet keep their original reason.

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
  `+1`/`+2`/`+3` token are a variant marker that must agree. When no candidate has the same name, the candidates of the
  same base name with another variant marker are offered as `ambiguous` (`differences: ["variant"]`: a "+1" item and the
  base item are different entries, a person settles it with `resolve`), and so are those whose name has the same words in
  another order, commas ignored ("Poison, Basic" and "Basic Poison"; `differences: ["name-order"]`); the one candidate in
  another order, alone, of a fitting type and with no other difference, is `matched` with `differences: ["name-order"]`.
  The items embedded in a monster are matched by the same name only. Same-name features and traits are told apart by the
  class, subclass or race document whose advancement grants them, then by `system.requirements` and the feat subtype
  (whole hyphenated words: "Half-Elf" does not name "Elf"); what cannot be told apart is `ambiguous`, never the first. An
  item whose rarity differs (case-insensitive; a missing one is unknown) is `ambiguous`.
- A monster has no single rule: each stat-block feature (trait, action, bonus action, reaction, legendary or mythic action;
  a spellcasting block is one trait named as the block) is a record, `kind: "monster"`, with `owner` = the creature and
  `section`. Key: `<book>:monster:<creature>/<section>/<feature>`, a name repeated within one creature and section numbered
  `#2`, `#3` in dataset order (the record carries `occurrence`). The name is the base name: the recharge markup and a
  trailing parenthesised group that names a cost, a recharge, uses or a limit anywhere in it ("(Costs 2 Actions)",
  "(3/Day)", "(6/Year)", "(Celestial Only; Recharges after a Long Rest)") are dropped, the text keeps them; an embedded
  item's name is read the same way when it is compared. The KEY keeps the rule the first records were written with (only
  a group that starts with a cost, a recharge or "at will", or holds a count per day, rest or turn, is dropped from it), so
  no committed key changes; inventory updates the `name` of a monster record without a rule. A `_copy` creature lists only the
  sections it defines itself (nothing is inherited; the base's features are records of the base creature), with
  `copyOf` = "<base name>|<base source>". Two creatures of one name in a book collide like any other key.
  The official candidates are the items embedded in the actors of the creature's name in the book package's `*actors*`
  dumps (`docId` = `<actor id>.<item id>`); same-name actors with identical embedded item ids are one, differing ones make
  the features found in them `ambiguous`; no actor of the name makes every feature `absent`. The report adds `creatures`,
  `copies` (`_copy` creatures), `noActor` (creatures with no official actor) and three counts about DDB Importer's actors, each a
  creature in one group only: `noDdbActor` (no DDB actor of that name at all), `ddbOtherEditionOnly` (its only DDB actors state
  the other edition) and `ddbOtherBookOnly` (its only DDB actors of its edition state another book).
  The `ddb-importer` origin is asked for monsters too: its candidates are the items embedded in the DDB Importer actors of the
  creature's name, read from the dump files that start with `ddb.` and hold actors (`type: "npc"`, whatever the pack is
  named), with the same name, section, claim and `<actor id>.<item id>` rules as the official ones. A DDB actor states its
  edition in `system.source.rules` ("2014" or "2024"): only the actors of the creature's edition are candidates (the ones
  that state none are used when there is none that does). An actor that states its edition decides for its
  items (DDB Importer stamps an item with the printing it was imported from, so items of a 2014 actor often say 2024); only
  when the actor states none is the item's own `system.source.rules` used: none adds `differences: ["edition-unknown"]`,
  the other edition makes the feature `ambiguous`. A creature's edition is its own, also when it has no feature.
  A DDB actor also states its book in `system.source.book`, a D&D Beyond abbreviation ("MM 2024", "MotM"), which
  `docs/ddb-books.json` maps to the dataset book code (compared case-insensitively; only pairs confirmed against the dataset
  are listed). Among the actors of the creature's name and edition, the ones of the record's book are used alone when there
  are any; else the ones with no book, an SRD book ("SRD 5.1") or a book not in the map are used and the matched item gets
  `differences: ["book-unknown"]`; else (the only actors state another mapped book) a feature that has an item of its name
  there is `ambiguous` with `differences: ["book"]` and those items as candidates, never matched. When the creature exists
  only in the other edition, a feature that has an item of its name there is `ambiguous` with `differences: ["edition"]` and
  those items as candidates (never joined; settle it with `resolve`). A feature with no such item stays absent at item level
  (there is no candidate to list); the report counts the creature (`ddbOtherEditionOnly`, `ddbOtherBookOnly`).
  Same-name DDB actors with identical embedded item ids are one, differing ones make the features `ambiguous`
  (`differences: ["actor"]`). The official match is made first; when it is `matched` it is the reference of the ddb-importer
  match, whose structural differences (saves, damage types, activity types, statuses) are recorded on the item (a monster
  has no identity field beyond the edition).
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
  It never touches verdict or rule; it removes `evidence.gates` when the item is no longer the same document with the same
  data (the gates checked another item), and leaves the rest of the evidence.
- **Inventory and what was settled.** A resolved item stays while the chosen document is in the dump with the same data
  fingerprint; an `absent` resolution stays while matching offers the same candidates (or none). Otherwise the item goes back
  to what matching says and the key is listed under `resolutionStale` in the report.
- **`sources`.** When an item's identifier is not the record's, inventory fills `sources: { <docId>: <identifier> }`, which is
  what the engine accepts with `register(source, table, { sources })` (keys are 16-character document ids, values kebab-case
  identifiers). Only an official package's documents qualify. A DDB Importer item lives in a world, where the id is the world's
  own and not stable across worlds, and a monster feature's id is `<actor id>.<item id>`: those get `identifierDiffers: true`
  on the item and no source. Inventory owns the field: it is recomputed on every run and removed when nothing is bound.
- **Monster features (Ruling R3).** A ruled monster feature has an identifier scoped to its creature,
  `<book>-<creature>-<feature>` (`-2` for a repeated name; `identifiers.mjs` `monsterIdentifier`), never the bare feature
  name (the engine has generic entries under names such as `bite`). Inventory binds it by the id of its official embedded item
  (`sources: { <item id>: <identifier> }`, the part after `.`) when no actor of another creature of the book's package embeds
  that id and the record carries its scoped identifier (a bare name is never bound); otherwise, for a shared id, the item gets
  `embeddedShared: true` and no source (the engine reads `<actor id>.<item id>` sources, but
  external registration accepts 16-character ids only), and the ids gate keeps the rule `drafted`. A feature without a rule
  binds nothing. DDB Importer monster features are always uncovered (world ids, generic identifiers).
- **Aliases (Ruling R2).** `rule.alsoAs: [{ identifier, origin }]` registers the entry under the identifier an origin's item
  carries when no source can bind it (a DDB Importer item, say). `identifiers.mjs` `aliasFor(record, origin,
  { coreIdentifiers })` gives the alias, or `{ uncovered: because }` when there may be none: a monster feature, an empty or
  generic identifier (`GENERIC_IDENTIFIERS`: `new-item`, `spellcasting`, `multiattack`, natural weapons, weapon base names),
  a DAS · Core identifier, or one that is not kebab-case; null when the item is already reached. The schema refuses an alias
  equal to the record's own identifier or listed twice; the `unique` gate refuses one shared with another rule or Core.
- **Reprints.** The official item of every kind but monsters gets `reprints: [{ package, docId, sameIds, missing? }]` for each
  other official package (any dump file that is not of the book's package, does not start with `ddb.` or `dnd5e.`, and is not
  an actor pack) that holds the same document id in a document of one of the record kind's types (a journal page or a
  document of another kind that shares the id is not a reprint).
  `sameIds` compares the sets of activity ids and effect ids; when they differ,
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
- A reprint is checked only when the rule names `official` among its origins; a `sameIds: false` reprint without a usable
  `missing` is taken to lack every id.
