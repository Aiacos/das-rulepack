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
| `RULEPACK_PLAY` | optional: where `scenarios` writes the play data and `played` reads it, default `play/` of this repository |
| `RULEPACK_ENGINE_VIEW` | the engine's class of each item (R42): a private file of a live sweep, never in the repository |

A command that needs a variable that is not set exits with code 2 and names it. Nothing under `tools/` calls a model, a
network service or a Foundry server.

## 🪜 Stages

Every command is an npm script: `npm run <name> -- <arguments>`. Lines of this document stay within 132 columns, table rows
excepted.

| # | Stage | Command | Needs | Who runs it |
|---|---|---|---|---|
| 1 | Inventory | `npm run inventory -- <BOOK> <kind|all> [--allow-collisions]` | `RULEPACK_DATASET`, `RULEPACK_DUMPS`, `RULEPACK_TEXT` | a person |
| 1b | Settle a match | `npm run resolve -- <key> <origin> --doc <docId> --because "<one line>"` (see "Settling matches") | `RULEPACK_DUMPS` (`--doc`) | a person |
| 2a | Triage by rule | `npm run triage -- <BOOK> [--redo-rule \| --core-prepass [--report <file>]]` | `DAS_CORE`, `RULEPACK_TEXT` (`RULEPACK_DUMPS`: a feature's options) | a person |
| 2a' | Engine reading | `npm run triage -- <BOOK> --engine-reading [--report <file>]` | `DAS_CORE`, `RULEPACK_DUMPS` | a person |
| 2b | Cut batches | `npm run batch -- triage <BOOK> --out <dir> [--structure <private dir>] [--size 40] [--kind <kind>] [--without-items]` | nothing (`--structure`: `RULEPACK_DUMPS`, and `DAS_CORE` for monster features) | a person |
| 2c | Read a batch | (no command: a reader agent reads files) | `RULEPACK_TEXT` | the Claude Code session, via reader agents |
| 2d | Ingest results | `npm run ingest -- <results-file> [--overwrite \| --second \| --third]`, or `npm run ingest -- --settle-unsure [--min <n>]` | `RULEPACK_TEXT`, `DAS_CORE` | the Claude Code session |
| 2e | Cut reread batches | `npm run batch -- reread <BOOK> --out <dir> --structure <private dir> [--size 30] [--second \| --restate]` (see "Rereading monster features") | `DAS_CORE`, `RULEPACK_DUMPS` | a person |
| 2f | Reread a batch | (no command: a reread agent reads files, blind to every earlier verdict) | `RULEPACK_TEXT` | the Claude Code session, via reread agents |
| 2g | Ingest rereads | `npm run ingest -- <results-file> --reread [--second \| --restate] --batch <batch file>` (see "Ingesting rereads") | `RULEPACK_TEXT`, `DAS_CORE`, `RULEPACK_DUMPS` | the Claude Code session |
| 3a | Cut draft batches | `npm run batch -- draft <BOOK> --out <dir> --structure <private dir> [--size 20] [--kind <kind>] [--redraft \| --reoffer]` | `DAS_CORE`, `RULEPACK_DUMPS`, `RULEPACK_TEXT` | a person |
| 3b | Draft a batch | (no command: a drafter agent reads files) | `RULEPACK_TEXT` | the Claude Code session, via drafter agents |
| 3c | Ingest drafts | `npm run ingest -- <results-file> --draft [--redraft \| --reoffer] --batch <batch file>` (see "Ingesting drafts") | `RULEPACK_TEXT`, `DAS_CORE` (`RULEPACK_DUMPS` for monster features) | the Claude Code session |
| 3d | Ingest engineered rules | `npm run ingest -- <results-file> --engineered` (see "Engineered rules", Ruling R43) | `DAS_CORE`, `RULEPACK_TEXT` (`RULEPACK_DUMPS`: other items, monster features) | the Claude Code session |
| 4 | Gates | `npm run gates` (`-- --ci` in CI) | `DAS_CORE`, `RULEPACK_DUMPS`, `RULEPACK_TEXT` (`--ci`: `DAS_CORE`) | person, CI |
| 5a | Cut review batches | `npm run batch -- review <BOOK> --out <dir> --structure <private dir> [--size 30] [--kind <kind>]` | `DAS_CORE`, `RULEPACK_DUMPS` | a person |
| 5b | Review a batch | (no command: a reviewer agent reads files, blind to the draft) | `RULEPACK_TEXT` | the Claude Code session, via reviewer agents |
| 5c | Ingest reviews | `npm run ingest -- <results-file> --review --batch <batch file>` (see "Ingesting reviews") | `RULEPACK_TEXT`, `DAS_CORE` | the Claude Code session |
| 5d | Accept a queued review | `npm run pipeline -- review-accept <key> --because "<one line>" --by <owner>` | nothing | a person (an owner) |
| 6a | Scenarios | `npm run scenarios -- <BOOK> [--check \| --plan \| --stamp-handwritten]` (see "Playing scenarios", "Engineered rules") | `RULEPACK_DUMPS` | a person |
| 6b | Play | `cd "$DAS_CORE" && node tools/scenario.mjs <this repo>/play/<book> 2>&1 \| tee <private log>` | the test server | the main session only |
| 6c | Record plays | `npm run played -- <runner-log> --world <name> [--client gm\|player]` | nothing | the main session |
| 6d | Record a play by hand | `npm run played -- --manual <key> --world <name> --because "<one line>" --by <owner>` | `RULEPACK_TEXT` | a person (an owner) |
| 7 | Generate | `npm run build:rules` (`-- --check` to verify only) | nothing | a person; CI runs `--check` |

`<BOOK>` is a book code of `docs/books.json`, in any case: every command upper-cases it once (`xzz` is `XZZ`) and refuses,
with exit 2, a code that does not then match `/^[A-Z][A-Z0-9]{1,9}$/`. Registry files are named after the lower-case code
and hold the upper-case one; a file whose records name another book, or two records with one key, is not written.

The numbers 1, 2, 4, 7 are the stage numbers of the design
(`docs/superpowers/specs/2026-11-21-rulebook-pipeline-design.md`).

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
     - **`core` for what the engine handles outside its content table**, under the same conditions (2024, unique of its
       kind and edition, never a monster feature; otherwise `hint: "core-generic"`), each with its own `why`. The
       identifiers come from a static scan of the engine's scripts (`tools/pipeline/core-scan.mjs`, read as text, never run;
       `loadCore` returns them with the file and line of each, for the report only):
       - **in code** ("DAS · Core handles this identifier in code", `runtimeIdentifiers`): a string literal that its code
         tests an item's identifier against — `identifierOf(i).id === "x"` (or `contentOf(i).identifier`,
         `i.system.identifier`, a name bound to one in the same top-level declaration, a constant that holds the literal),
         membership in a literal list, Set or object (`LIST.includes(id)`, `TABLE[id]`), a Set of an actor's identifiers
         tested with a literal (the attack budget), the first parameter of a function some call passes an identifier, and a
         feature an entry's condition asks for (`"source.hasFeature": "x"`: an improved feature played inside another
         entry). `!==` is not taken (excluding is not handling), nor `typeof x === "..."`, nor the engine's diagnostics, debug
         trail and test scenarios; a literal is taken only when it can be an identifier (kebab-case, at most 64 characters,
         hyphenated or letters only). CSS classes, settings, hooks and i18n keys are never in such a context.
       - **left to the system** ("DAS · Core leaves this identifier to the game system", `systemHandled`): a sentence of a
         comment of the content files that names dnd5e and says it does the thing alone or that no entry is needed ("... fait
         seul", "aucune entrée"), naming the identifier in backticks (hyphenated only); a literal list right under such a
         comment; an entry whose value is `null` or `{}`. The engine's notes mostly name features in French prose ("Ce que
         dnd5e fait déjà seul : Sens du danger, ..."), with no identifier: those cannot be read and are left to the reader.
       - **every part handled** ("every option of this feature is handled by DAS · Core"): the record's parts are its
         registry children (records of its book whose `owner` is its name, not monster features: a species' traits), all
         `core`, and the options its official item offers as a choice (the `ItemChoice` pools of its document in the dumps of
         the book's package, when `RULEPACK_DUMPS` is set), all among the identifiers above or the table; at least one part.
         Some handled only: `hint: "core-parts"`, no verdict. `triage` runs its rules twice, so a parent follows the parts
         the first round settles.

       The unique gate and `batch draft` hold all three like the table's (`core.handled`, gates.mjs `engineIdentifiers`): a
       rule under an identifier the engine handles in code, or leaves to the system, would stack on that behaviour, so it
       fails `unique` unless a person sets `rule.inCore`, with its own message, and the entry is left out of draft batches
       ("identifier is DAS · Core's: a person decides inCore").
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
     touched, except a pre-pass `core` the rules no longer give: its previous verdict comes back (below, `restored`). A
     `core` a reread set (by rule, with `evidence.triaged.reread`: a reader's judgement) is not the rules' and is never
     touched either (`triage.mjs` `setByRule`).
     `by: "rule"` is reserved: `ingest` refuses a results file signed with it.
   - `triage <BOOK> --core-prepass [--report <file>]` is the **pre-pass**: the `core` rule above (its four sources) and
     nothing else, over the records whose verdict is `entry` or none, whoever set it (a reader's `entry` included: the
     pilot's records were read before the engine's code was looked at, `docs/pilot-m3.md`). It never touches a record that
     has a `rule`, a legacy record, a record whose key is in any queue (`queue.json`, `drafts-queue.json`,
     `review-queue.json`), or one with another verdict. A record it turns to `core` keeps only the verdict, the `why` and
     `evidence.triaged = { by: "rule", at, was: { verdict, why, triaged } }`: `was` is what the record was (the reader's
     triage evidence, signed), so the change is auditable and reversible — the schema accepts `was` only with `by: "rule"`
     and the verdict `core`, and `--redo-rule` gives it back when the rules no longer give `core` (a twin appeared, the
     engine dropped the identifier). It prints one line per change (`core  <key>  <source>  <file:line>, ...`) and per
     record it only hints (`hint ...`, not written), then `changed:` and `hinted (not written):`; `--report <file>` (a file
     outside the registry folder) also writes them as JSON, with the engine's version, the previous verdict and its author,
     and the file and line of the engine that justify each (for parts, each option with its own). Running it again changes
     nothing. It cannot be combined with `--redo-rule`.
   - `triage <BOOK> --engine-reading [--report <file>]` (Ruling R29) gives triage **the engine's own reading of a monster
     feature**. DAS · Core reads monster features from their English text by itself (its "text" layer, the pure
     `monsterTextLayer` of `core/monster-layer.mjs`): pushes with a size limit, conditions, healing blocks, repeated saves, the
     endings of effects. `tools/pipeline/engine-reading.mjs` `engineReading` imports that function from `DAS_CORE` at run time
     (as `loadCore` imports the validator; nothing is copied) and builds its arguments from the official item of the dumps
     exactly as the engine's `textLayer(item)` builds them from the live item (description, activities with their activation,
     effect ids, `onSave`, range, template and target as the data writes them; effects with their statuses and changes); it
     throws a clear error when the clone does not export it. For each monster record with the verdict `entry` (set by anyone),
     no rule and no queue entry, a non-empty reading sets `hint: "engine-reads"` and nothing else: the verdict stays, since
     whether the reading covers the whole text is a reader's judgement; an empty reading takes a stale hint away; a record a
     reread hinted `beyond-engine` keeps that hint, which says more. A record
     that carries a rule is left to the comparison of its rule (`evidence.reading`, below). It prints the records hinted
     (with the entry keys the engine reads) and the counts (reads something, reads nothing, official item not in the
     dumps, ruled); `--report <file>` (outside the registry folder) writes them as JSON, keys and entry keys only. It cannot
     be combined with `--redo-rule` or `--core-prepass`. Running it again changes nothing.
   - `batch reread` is the **reread** of monster `entry` verdicts given before triage knew the engine's reading (section
     "Rereading monster features" below).
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
   - `batch draft` is stage 3a, described in "Brief for a drafter agent" below.
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
     `types`), `template`, `affects`, for a change of form its `transform` (`mode`, `preset`, what the creature `keeps`,
     `tempHp`: the new form's hit points come as temporary ones), the ids of its `effects` and what it `consumes`, and per
     effect `id`, `name`,
     `statuses`, the `changes` as a list of changed KEYS (never their values), `transfer` and `duration`. No description,
     chat text, flag or prose value is ever copied: a string that is not a plain value (enumeration, id, key, short formula)
     is dropped. It is still derived from premium data, so the command REFUSES (exit 2, nothing written) a `--structure`
     folder inside the repository (real paths, so also through a symlink: each existing part of a path is resolved before
     the next one is applied), inside the registry folder or equal to or around `--out`, and a `--structure` or `--out`
     path with a `..` segment. Never commit a structure file.
     For a monster feature the official item's structure also carries `engineReads` (Ruling R29): the engine's own reading
     of it (`engine-reading.mjs` `engineReading`), an entry object of ids and engine words (no prose), or `null` when the
     engine reads nothing; computed under the identifier the engine would see (the rule's own when the record has one). The
     triage, draft and review cuts all write it, so a triage cut with `--structure` needs `DAS_CORE` as soon as it holds a
     monster feature (a usage error otherwise, nothing written).
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
   is its creature-scoped one, it has no alias, and an official item with `embeddedShared` must be bound by its own
   `<actor id>.<item id>` source (Ruling R35; otherwise `shared embedded item id: only an <actor id>.<item id> source …`, the
   rule stays `drafted`); every alias is not generic, its `origin` is in
   `rule.origins`, and it equals the identifier of the record's matched item of that origin. The ids gate also looks at the
   reprints (below), with the ids the official item contributes.
   The `unique` gate applies only to records that have a `rule`, the only ones that register an identifier with the engine:
   two ruled records of one edition that register one identifier, their own or an alias, always fail, whatever `sources`
   they bind; across editions (Ruling R22, `gates.mjs` `identifierTwins`) the first rule keeps the identifier, and a rule of
   another edition under it later fails (it needs an edition-scoped identifier bound through `sources`), the 2024 rule
   standing in for the older printing's item meanwhile; records
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
   For a ruled monster feature the local run (not `--ci`: it needs the dumps) also writes **`evidence.reading`** (Ruling
   R29): the rule compared with the engine's own reading of its official item (`engine-reading.mjs` `compareWithReading`,
   on the document the data-fix gate reads). The engine merges a module's entry over its reading **key by key**
   (`mergeEntries([text, enchant, module, world, item])`, the strategy of each key in `core/content/merge.mjs` `MERGE`:
   `triggers` replaced whole, `shallow` keys field by field, the others replaced): a pack rule overrides the reading key by
   key, it does not replace it wholesale. Each key the rule declares is `same` (deep-equal to the reading's), `adds` (the
   reading has no such key) or `changes`; for `triggers` the outcome says whether the rule's list keeps every trigger the
   engine read (`superset`) or drops one (`drops`; a size limit such as `target.sizeAtMost` is the costly case), or is
   `same`, or `none` (the rule has no triggers). The evidence is `{ at, core, rule, item, delta, same, changes, triggers }`:
   the engine version, the fingerprints of the rule and of the official item's data, the keys the pack registers (`delta`:
   the `adds` keys, and `triggers` when it is a superset), the keys the engine already reads the same, the keys that change
   the reading otherwise, and the trigger outcome. A closed shape the schema gate checks (also under `--ci`); it keeps its
   date while it says the same, and is removed when the item is not in the dumps. It is current only while `rule` and `item`
   are the record's and its three lists hold exactly the keys of `rule.entry`.
7. **Generate** writes the book modules under `scripts/rules/` from the registry (a rule with aliases carries
   `alsoAs: [<identifier>]`, and one with uncovered origins `uncovered`, shown in `docs/RULES.md`); `TABLE` in `index.mjs`
   registers each entry under its identifier and under each alias; and in `index.mjs` the export `SOURCES`
   (document id to identifier) of the records whose rule is emitted and that bind `sources` (checked against the record); it is
   an empty object for the 24
   rules of today. `scripts/main.mjs` hands it to the engine as `register(source, table, { sources })` only when it is not
   empty, so with no sources the call is the two-argument call it has always been.
   **What is emitted** (Ruling R27, `generate.mjs` `emissionOf`, the one function `build:rules`, `sourcesOf`,
   `docs/RULES.md`, `tests/derived.mjs` and `gates --ci` use): a legacy rule with standing, as before; otherwise only an
   uncontested rule, one whose review about the rule as it is agrees (an agent's agreement, exact or tolerated, or an
   owner's `review-accept`), or one that waits in `review-queue.json`, about the rule as it is, only because of its own stamp
   (`evidence.drafted.because`) while the stored comparison agrees in full (`review.agrees: true`, nothing in `onlyDraft` or
   `onlyReview`, a non-empty `review.assert`, confidence at least 0.7; a field absent fails closed). A gated rule never
   reviewed, queued as `disagreement`, `low-confidence`, `free-text` or `unexpressed`, or whose queue entry is about an older
   rule is **held**: not registered with the engine, listed in `docs/RULES.md` with its reason (`HELD_REASONS`), left out of
   the README's counts, given no scenario; `gates --ci` fails when a generated module registers one (as does
   `build:rules -- --check`). A held rule still owns its identifier (the `unique` gate and `batch draft` count every record
   that has a rule).
   **Monster rules** (Rulings R28, R29): emitted only through a current `evidence.reading` (none, or a stale one, holds the
   rule: "the engine already reads this feature's text: to be compared first"); a rule with a key in `changes` is held
   ("changes the engine's reading: a person decides"), one whose `delta` is empty is held ("the engine already does it":
   a candidate for the verdict `core`), and what remains goes through the R27 decision above. The module entry of a
   shipped monster rule is its **delta** (`generate.mjs` `ruleFromRecord`, which `build:rules`, `tests/derived.mjs` and
   `docs/RULES.md` share): a `same` key is redundant and is left out, so the engine ends with the same merged entry as with
   the whole rule. `emissionOf` reads only the stored evidence: CI, which has no dumps, decides from the registry alone.
   **Rebinding** (R29, fix round 1): a monster rule's `sources` bind the item to the rule's own identifier, so the engine
   stops applying its shipped entry under the item's original identifier and reads the text under the new one. The gates
   therefore compare `before` (text layer under the original identifier + the engine's shipped entry for it) with `after`
   (text layer under the rule's identifier + what the pack registers) and store `original`, `carried`, `dropped` and `code`
   in `evidence.reading`. The keys the rebinding loses that come from the shipped entry are carried over: the module rule
   names them (`carries: { from, keys }`, shown in `docs/RULES.md` as "Carries over N engine keys") and `scripts/carry.mjs`
   takes their values from the engine's shipped table (`api.content.builtin`) when the pack registers, leaving the rule out
   when the running engine lacks one. A key that cannot be carried (its value names the original identifier) or an original
   identifier the engine handles in code holds the rule: "its identifier would drop engine behaviour". Outside monster
   features, the unique gate refuses `sources` that bind an item of an engine identifier to another identifier.
   **A shared embedded item id (Ruling R35).** One embedded item id is often used by many creatures (a bite of hundreds): a
   source under the bare id would bind every one of them. Such a feature's rule is bound by `<actor id>.<item id>` (its
   official item's `docId`, from the dumps), which DAS · Core looks up before the bare id (`adapter/content.mjs`
   `identifierOf` with `core/source-keys.mjs` `sourceKeys`: the actor read from the document that carries the item, its own
   compendium source for a world copy or a token) and which its `validateSources` accepts. Whether the engine in use does is
   asked of the engine itself, never of its version: `loadCore` calls its `validateSources` on a key of two invented ids
   (`core.mjs` `actorItemSourcesOf`, `core.actorItemSources`). With it, `batch draft` cuts such features and `ingest --draft`
   binds them; without it, they are left out ("monster feature: shared embedded id, this DAS · Core refuses actor.item
   sources"), refused at ingest, and a record that binds one fails the validator gate (also under `--ci`). The engine's
   reading, the comparison and the carry are those of the bound creature's item (the document of the dumps under that
   `docId`, the actor id taken from it). A feature whose embedded id is unique keeps its bare-id source. At registration,
   `scripts/scoped-sources.mjs` `withAcceptedSources` asks the running engine (`api.content.validateSources`) about each
   `<actor id>.<item id>` source: one it refuses, or cannot be asked about, is left out with the rules it binds, and one
   console line says how many and why.

## 📋 Record states

The state is derived from the evidence and written by the tools; nobody types it.

| State | Meaning |
|---|---|
| `inventoried` | the entry is known; no verdict yet |
| `triaged` | a verdict is set |
| `drafted` | a rule is written, but the gates have not passed on it (or the rule changed since) |
| `gated` | every required gate passed on the current rule |
| `reviewed` | an independent reading agrees, about the rule as it is |
| `played` | a scenario passed in a running world, on the rule as it is (an engineered rule: from `gated`, by its hand-written scenario, Ruling R43) |

Evidence about the rule carries its fingerprint (`rule`, `registry.mjs` `ruleFingerprint`): `evidence.drafted: { by, at, core,
rule, person?, because? }` (`person: true` with `because` from `schema.mjs` `draftedForPersonReasons()`: the name of a key
the assertion vocabulary cannot say all of, `other-key`, or `official-uncovered`; `noReactions` stays valid on stamps written
before fix round 1 of Ruling R25: the draft goes to a person at review; the schema requires the stamp on a drafted rule whose
entry has such a key or that leaves `official` uncovered, and the gate evidence fingerprint `emits` covers it, so dropping it
fails the schema and makes the record `drafted`), `evidence.reviewed: { by, at, agrees, rule, confidence, because? }`
(`because`: the line of a person's `review-accept`), `evidence.played: { at, core, world, scenario, client?, rule, manual?, by?,
because? }` (`scenario` a scenario id `<book>/<slug>`, `core` an engine version, `world` a handle, `client` `gm` or `player`;
`manual`, `by` (an owner) and `because` together, for a checklist played by hand; no other field). `by` a reader handle,
`confidence` from 0 to 1 elsewhere. A review or a play counts only while its `rule` is the fingerprint of the current
rule, so editing the rule makes gates, review and play stale at once. A legacy record may keep a review or a play written before
the stamp existed (no `rule`): it counts as it did; one that carries a stamp is held to it. A ruled monster feature also
carries `evidence.reading` (Ruling R29, written by the gates: stage 4); it does not change the state, only what is emitted.
A monster record a reread judged carries `evidence.triaged.reread` (`{ by, at, confidence, reading: { core, sha }, covered,
beyond?, unexpressed?, provisional?, second? }`, section "Ingesting rereads"); a reread `core` that no second reread has
confirmed has `provisional: true`, which is what a count of `core` verdicts reads to tell the confirmed from the provisional
ones.

## 🧾 Rule vocabulary

- **Assertions.** Every rule outside the legacy ones (and the engineered ones, section "Engineered rules") has
  `rule.assert`, a non-empty array of `{ given, expect }` (`tools/pipeline/assert.mjs`): what the rule says happens, so
  that a draft and a review can be compared and a scenario can check it. `given: { roll?: hit|miss|crit|failedSave|savedSave,
  moment?, origin?, targetType?, free?, targetSizeAtMost?,
  targetStatus?, selfStatus?, targetWithin?, targetHp?: bloodied|wounded, targetHpAtMost?, onOwnTurn?: true, damageType?,
  activity?: attack|melee|weapon|spell, spellLevelAtMost?: 0..9 }` (the fields after `free` say a trigger's condition, Ruling
  R30, below; `moment` is a moment of the engine or, Ruling R33, an aura moment `ownTurnStart|ownTurnEnd`; Ruling R34:
  `spellLevelAtMost` only with `bars: spells`); `expect: {
  damage?: { fraction: 0|0.5|1|2, type? }, condition?: { applied?, ended? }, ends?, roll?: { mode:
  advantage|disadvantage|autoSuccess|autoFail, on: attack|save|check, for: self|target|ally|enemy }, affects?
  (target|allies|enemies|self), denies? (opportunityAttacks|reactions|actionAndBonus|healing|tempHp), move?: { mode,
  distance? }, uses?: { spent }, subjected?: activity (Ruling R33: only with a zone or aura moment, and no roll), chooses?:
  oneEffect|oneEffectPerTarget|effectByRoll, bars?: entry|melee|actions|spells (Ruling R34: both said once for the use,
  never with a roll or a moment), acBonus?: proficiency|1..10, hitBecomes?: miss, attackerTakes?: activity (Ruling R38: each
  only with `given.moment: isHit` and no roll), counterattack?: meleeWeapon (only with `given.moment: isMissed`, no roll),
  reactionsPerRound?: 2..20 (once for the item, no roll or moment), teleports?: self|swapsWithTarget (at the use, or on a
  `hit` or a `miss`; never at a moment), sheds?: light (never at a moment), free? }`. Any other field is
  refused; `free` is one printable line of at most 120 characters and never stands alone (every assertion has a closed `expect`
  field); `given.origin` is one of the rule's
  `origins`; `move.distance` is a non-negative number or a formula of at most 24 characters made of digits, spaces,
  `+ - * / ( ) .` and the references `@mod`, `@prof`, `@item.…`, `@abilities.…`, `@attributes.…`, `@details.…`, `@scale.…`,
  `@flags.…` (no other word). Every text of a rule (`adds` ≤ 200, `free` ≤ 120, `uncovered[].because` ≤ 200,
  `evidence.person.because` ≤ 120) is one line of printable ASCII (0x20–0x7E): no control, format or look-alike character.
  From this milestone on `rule.catalog` is a kebab/dot identifier of at most 64 characters, `rule.origin` a display label
  of where the rule comes from in the book (owner and level, "Fey Wanderer 3"; one line of printable ASCII, at most 60
  characters; Ruling R17), and `rule.code` the script of a `code` verdict, `scripts/<kebab>(/<kebab>)*.mjs`, at most 96
  characters, which the schema gate (also under `--ci`) requires to be a file of the repository (Ruling R18). The legacy
  rules are exempt; their values pass these formats anyway. The schema
  checks the shape; the validator gate checks `moment` (MOMENTS), `targetType` (CREATURE_TYPES), `targetSizeAtMost` (the
  engine's sizes), `targetStatus` / `selfStatus` / the statuses of `condition`
  (the conditions `core/monster-text.mjs` names), `ends` (EFFECT_ENDS or a moment), `move.mode` (MOVE_MODES) and
  `damage.type` (DAMAGE_TYPES) against the clone (`loadCore`). `normaliseAssert` gives the sorted canonical forms of a list
  (`path=value` pairs; a free text is `*`, it never counts as agreement); `impliedAsserts(entry, { structure })` what an
  entry says by itself, one function per drafter key (`assert.mjs` `IMPLIED`, fix round 1 of Ruling R25): `saveDamage`,
  `halfOnMiss`, `noDamage` (fractions); `triggers` (`status` and `move` steps on a roll; a plain `resave` through an effect:
  `ends: savedSave`; a `replay` on zone moments: `subjected: activity` at each, Ruling R33; a declaration's `if` goes into
  the `given` of each of them, and one whose condition has a part with no given word implies nothing and is unassertable);
  `emanation` (`subjected: activity` at its moment, `affects: enemies` beside it when only enemies; its radius, `sees` and
  `whileActive` are unassertable), `zoneAffects` (`affects: enemies|allies`), `saveAutoSuccess` (`roll: { mode: autoSuccess,
  on: save, for: target }` given each `targetType`; `fighting` and `sizeAtLeast` are unassertable); Ruling R37:
  `saveAutoFail` (`roll: { mode: autoFail, on: save, for: target }` given each `targetType`); Ruling R34: `choice`
  (`chooses: oneEffect`, `oneEffectPerTarget` with `perTarget`, `effectByRoll` with `roll`; `order` and a pool alone are
  unassertable), `barrier` (`bars: entry` and `bars: melee`, and `bars: actions` when it `shields`; one that names creature
  types implies nothing; its radius is unassertable), `globe` (`bars: spells` given `spellLevelAtMost: <maxLevel>`; its
  radius is unassertable); Ruling R38: a reaction declaration of `triggers` in its drafter's shape (one word at its moment,
  the condition's `activity` beside it: `acBonus: proficiency|<n>` for `use` + `penalty`, `hitBecomes: miss` for `use` +
  `miss`, both at `isHit`; `counterattack: meleeWeapon` at `isMissed`; `attackerTakes: activity` for damage `to: source` at
  `isHit`; a reaction outside the shape implies nothing and is unassertable), `reactions` (`reactionsPerRound: <perRound>`),
  `teleport` (`teleports: self`, given `roll: hit` and `roll: miss` with `after: attack`; its own `distance` and `then` are
  unassertable), `swapPlaces` (`teleports: swapsWithTarget`), `light` (`sheds: light` on the roll that applies the item's
  effects; its radii are unassertable); `effectEnds` (`ends:
  <word>`), `noReactions`, `actionOrBonus`, `blocksHealing` and `blocksTempHp` (`denies: reactions` / `actionAndBonus` /
  `healing` / `tempHp`; `blocksTempHp: true` is unassertable, it also covers the creature that carries the item), `effectStatuses`
  (`condition.applied`), each on the roll that applies its effect in the official structure (a hit for an attack's, a
  failed save for a save's, a saved save for `savedEffects`; every situation,
  `given: {}`, without it); `noOpportunity` (`denies: opportunityAttacks`, but not while flying); `saveDisadvantageFor` and
  `rollDisadvantage` (rolls with disadvantage). The other drafter keys imply nothing, each with why (`IMPLIES_NOTHING`), and a
  test fails on a drafter key in neither table. A rule using a key, or a part of one (a trigger step other than those; a
  `resave` with options; `noOpportunity: "flying"`), the vocabulary cannot say (`unassertableKeys`) is stamped for a person
  at review (Ruling R15 generalised: `because` is the key's name). **`excludes` is not an agent's word** (fix round 1): no
  notion of the engine maps to it and pilot 3 used it two ways, so a drafter's `assert` and `leaves` and a reviewer's
  `assert` that hold it are refused; stored data (a review-queue entry) is still read. What it was bent to say is `denies`.
- **Trigger conditions** (Ruling R30, `tools/pipeline/conditions.mjs`). A drafter's trigger declaration may carry `if`, the
  engine's condition: ONE object whose keys are facts that must all hold (the form the engine's own content uses; no
  `all` / `any` / `not`, no list, no recipe-style `condition: [{ fact, arg }]`, which the trigger would ignore), 1 to 3 facts
  of `DRAFT_FACTS`, no two said by the same given field, each argument typed: `target.sizeAtMost` (a size word, never
  `"source"`) → `given.targetSizeAtMost`; `target.creatureType` (a creature type) → `targetType`; `target.hasStatus` /
  `source.hasStatus` (a status) → `targetStatus` / `selfStatus`; `target.within` (`{ distance: 5..300, units: "ft" }`) →
  `targetWithin` (feet); `target.bloodied` / `target.wounded` (`true`) → `targetHp`; `target.hpAtMost` (an integer 1..999)
  → `targetHpAtMost`; `source.onOwnTurn` (`true`) → `onOwnTurn`; `damage.hasType` (a list of 1 to 5 damage types) →
  `damageType`, one assertion per type; `activity.isAttack`, `isMelee`, `isWeapon`, `isSpell` (`true`) → `activity`
  `attack`, `melee`, `weapon`, `spell`. The facts and the kind of each argument are the engine's (`core/recipes.mjs`
  `FACTS`, loaded by `loadCore` as `factKinds`, with the closed lists `sizes`, `activityTypes`, `distanceUnits`); a test
  pins every allowed fact, its subject and argument kind to the clone, and requires every other fact of that list in
  `EXCLUDED_FACTS` with why (an identifier or free string: `*.hasEffect`, `target.hasEffectFrom`, `activity.identifier`,
  `source.classLevelAtLeast`; a constant of the item or its creature: `activity.dealsType`, `source.creatureType`; one fact
  per given field: `activity.type`; vision, which holds by default when it cannot be told: `source.seesTarget`,
  `target.seesSource`; not asked for: `source.allyNearTarget`, `target.hasTempHp`). `checkDraftKeys` enforces the shape
  (schema gate), the validator gate the words against the engine's lists. In review a `given` field is identity, as every
  given: a draft with a size limit and a review without one disagree, and sizes compare as values (`lg` and `huge` are two
  situations). The engine's readings go through the same `impliedAsserts`: its `all` is read as the facts together, so a
  size-limited push it reads implies the conditioned assertion, and a reread that states it is told it is not beyond.
- **Zones and auras** (Ruling R33, `tools/pipeline/zones.mjs`). Nine engine keys join `DRAFT_KEYS`, each in a closed, typed
  form (`DRAFT_SHAPES`, enforced by `checkDraftKeys` through `shapes.mjs` `shapeProblems`: own keys only, bounded numbers, ids
  of the item's own activities and effects, closed words; the validator gate checks the engine's words), each with what it
  does at the table and the engine file that says so (`ZONE_KEYS`, in `draft-vocabulary.json` `zones.keys`):
  `emanation: { on: ownTurnEnd|ownTurnStart|turnStart, affects?: any|enemy, sees?: true, activity?: <id>, whileActive?:
  true, radius?: 5..300 with units: "ft" }` (an aura that acts: at the bearer's turn end or start, or when a creature starts
  its own turn within it, the item's activity is used on each creature reached; `single` slot);
  `aura: { affects?: ally|enemy|any, includeSelf?: true, effect?: <id>, types?: [creature types], whileActive?: true,
  radius?: 5..300 with units: "ft" }` (an effect of the item copied onto the creatures near the bearer while they stay; the
  item's own template, when it has one, gives the radius and who instead; `single`); `zoneAffects: enemy|ally`;
  `zoneEffects: true`; `selfZone: { <activity id>: { type: radius|sphere|circle|cube|square, size: 5..300, units: "ft" } }`
  (`activityMap`); `zoneLasts: { seconds: 6..86400 }`; `zoneMax: 1..20`; `saveAutoSuccess: { types?, fighting?: true,
  sizeAtLeast? }` (at least one); `willingFails: true`; Ruling R37: `saveAutoFail: { types: [creature types] }` (`types`
  only, not empty), offered (`draftKeys`, `draftShapes`, `zones.keys`, a batch's `allowed`) only when the engine in use knows
  it (`loadCore` `saveAutoFail`, asked of its ENTRY_KEYS and validator): otherwise draft ingest refuses it, a full `gates`
  run fails a rule that uses it and `gates --ci` does not, as Ruling R36. And `triggers` gains a third shape, a zone that
  uses the item's activity again (`{ on: enter|turnStart|turnEnd or a list of them, do: [{ type: "replay", activity?: <id>
  }] }`: replay steps only, at zone moments only, no `if`). What the engine also takes and a drafter may not is refused with
  why (`EXCLUDED_ZONE`): `aura.changes` (free key and value strings), `aura.radiusFormula` and `emanation.radiusFormula`
  (free formulas), `aura.affects: summoner`, `emanation.atStart`, `emanation.on: death` (a death trigger), a replay `on:
  moves` (once per square: no word for how often) or under an `if`. **One way to say it**: the moment goes with
  `expect.subjected: activity`, one assertion per moment (`{ "given": { "moment": "turnEnd" }, "expect": { "subjected":
  "activity" } }`), never with a roll (refused); what the activity then does is said as for any use of the item, with the
  roll alone (`{ "given": { "roll": "failedSave" }, ... }`), not repeated per moment (allowed, as stored rereads hold it,
  but compared as another situation). `turnStart` / `turnEnd` are a creature's OWN turn inside the zone or aura;
  `ownTurnStart` / `ownTurnEnd` the turn of the aura's bearer (`definitions.auraMoment`). The radius of an area or aura is
  the item's data or the entry's, never asserted. `loadCore` gives the engine's `emanationMoments`, `auraAffects` and
  `zoneFields` (the fields each zone validator accepts, read from its own lists), and a DAS_CORE test pins every drafter
  shape, word and exclusion to them: a field the engine adds or renames fails the suite. Scenarios: a zone or aura moment is
  `manual`, named `given.moment.<word>` beside `expect.subjected` (the runner lays no lasting area and passes no turn with a
  creature inside).
- **Choices, barriers and wards** (Ruling R34, `tools/pipeline/wards.mjs`). Seven engine keys join `DRAFT_KEYS` in the same
  closed, typed form (`DRAFT_SHAPES`, enforced by `checkDraftKeys` through `wardProblemsOf`; the validator gate checks the
  creature types and statuses against the engine), each with what it does at the table and the engine file that says so
  (`WARD_KEYS`, in `draft-vocabulary.json` `wards.keys`): `choice: { effects: "one", pool? } | { effects: "one", perTarget:
  true, pool? } | { effects: "one", roll: true, order?: [<effect id>], pool? } | { pool }` (`pool: { <activity id>: [<effect
  id>] }`; at the use, the user picks one of the activity's own effects and only it is applied: once, per target that failed
  its save, or by a die; the options are labelled by the effects' own names, the engine asks its own question; `activityMap`);
  `barrier: { radius: 5..300, units: "ft", onlyTypes? | exceptTypes?: [creature types], shields?: true, endsOnContact?:
  true }` (while a creature carries an effect of the item, an emanation around it, moving with it: a creature outside, not
  the bearer, not excepted, cannot walk in, nor hit a creature inside with a melee attack without reach; `shields`: nothing
  it does from outside affects a creature inside; `endsOnContact`: the item's effects on the bearer end when it moves so that
  such a creature is inside); `globe: { radius: 5..300, units: "ft", maxLevel: 0..9 }` (a spell of that level or lower cast
  from outside affects no creature inside); `wardsConditions: { types: [creature types], statuses: [statuses] }` (the bearer
  of an effect of the item cannot be given those conditions by a creature of those types); `wardsAtZero: true` (the first
  time damage would drop the bearer to 0 hit points, it drops to 1 and the effect ends); `blocksHealing: true | [<effect id>]`
  and `blocksTempHp: true | [<effect id>]` (the bearer regains no hit points / gains no temporary ones; `blocksTempHp:
  true` also the creature that carries the item; `effectMap`). Refused with why (`EXCLUDED_WARD`): `choice.prompt` (free
  text), `choice.outcome` and `choice.grapple` (damage or a grapple in its place: no word), `globe.everywhere` (the antimagic
  field, which the system's own antimagic status also does). Not admitted, with why (`NOT_ADMITTED`, `wards.notAdmitted`):
  `changesForm` (the token becomes the FIRST profile of the item's transform activity with that form's maximum hit points,
  or keeps its own: no temporary hit points, no pick among forms), `formLock`, `walls`, `wallSide`, `encloses`,
  `wardsDetection`. An automatic FAILURE of a save by creature type is `saveAutoFail` (Ruling R37, the zone keys above),
  on an engine that knows it. **One way to say
  it**: `chooses` and `bars` hold for the use of the item, `given: {}` (or `spellLevelAtMost` for a globe), never with a roll or
  a moment (refused); a barrier that stops only some creature types has no given word for them: its rule asserts no `bars`
  and goes to a person. `loadCore` gives the engine's `choiceEffects` and `wardFields` (the fields of the choice, barrier,
  globe and wardsConditions validators, read from their own lists), and a DAS_CORE test fails on a field in neither a
  shape nor `EXCLUDED_WARD`, on a key of `NOT_ADMITTED` the engine drops, and on a value the pack assumes refused that the
  engine accepts. Scenarios: `expect.chooses`, `expect.bars`, `given.spellLevelAtMost`, `expect.denies.healing` and
  `expect.denies.tempHp` are manual (the runner picks no option, moves no creature in, casts no spell from outside, heals
  nobody); the three older denials keep their interpreter.
- **Reactions, teleports and light** (Ruling R38, `tools/pipeline/reactions.mjs`). The drafts queue declined parries, a hit
  turned into a miss, a counterattack after a miss, damage dealt back, a self teleport, a reaction on every turn and a glow
  for want of a key the engine already has. Four reaction declarations of `triggers` and four keys join the drafter's
  vocabulary in the same closed, typed form (`DRAFT_SHAPES`; `checkDraftKeys` enforces them through `reactionProblemsOf`, on
  every declaration of the reaction territory: a moment `isHit` or `isMissed`, a `use`, `penalty` or `miss` step, or damage
  `to: "source"`), each with what it does at the table and the engine file that says so (`REACTION_DECLARATIONS`,
  `REACTION_KEYS`, in `draft-vocabulary.json` `reactions`). The declarations, steps in this order (`tuple`), with an optional
  condition `if` of ONE fact among `activity.isAttack|isMelee|isWeapon|isSpell` (at a hit or a miss the engine's `target` is
  the creature that reacts and its `source` the attacker, so only the facts of the attack read the same):
  `{ on: "isHit", do: [{ type: "use", activity? }, { type: "penalty", formula: "@prof"|"1".."10" }] }` (by its reaction, the
  creature's AC is raised by that much against that attack alone; the hit is judged again and may miss: the Monster Manual's
  parry), `{ on: "isHit", do: [{ type: "use", activity? }, { type: "miss" }] }` (by its reaction, that attack misses),
  `{ on: "isMissed", do: [{ type: "use", target: "source", weapon: true, activity? }] }` (by its reaction, it attacks the
  attacker with one of its own melee weapons; the activity, when named, pays), `{ on: "isHit", do: [{ type: "damage", to:
  "source", activity: <activity id> }] }` (the attacker that hit takes that activity's damage; no reaction). The keys:
  `reactions: { perRound: 2..20 }` (that many reactions a round, never more than one in a turn; 20 is "a reaction on every
  turn", as the engine writes it for its own), `teleport: { activity, then?, after?: "attack" } | { distance: 5..300, units:
  "ft", activity?, then?, after? }` (the use teleports its user to a space it sees and picks, within the distance or the
  activity's range; `after`: once the attack is judged, hit or miss; `then`: an activity used on arrival; `single`),
  `swapPlaces: { activity }` (the user and its target within 5 ft swap places; `single`), `light: { on: "effect", bright?,
  dim?, units: "ft" }` (5..300 ft, at least one radius; the bearer of each effect of the item sheds light while it lasts,
  `dim` being the outer radius). Refused with why (`EXCLUDED_REACTION`): a declaration's `via`, `fromEffect`, `by`,
  `oncePerTurn`, `ask`, `free`, `defends`; a `use`'s `advantage`, `consume`, `free`, `approach`; any step's `margin`; a
  damage step's `formula`, `damageType`, `same`, `spends`, `onSave` (a free formula, or another moment's); `reactions.loseOne`;
  `teleport.passengers`, `unseen`, `maxLight`, `area`, `destination`; a light on an `area`, `summon`, `wall` or `caster`,
  and its `darkness`, `dispels`, `carried`, `single`, `color`, `animation`, `activity`. Not admitted, with why
  (`NOT_ADMITTED_REACTION`, `NOT_ADMITTED_STEPS`, `reactions.notAdmitted`): the keys `counter` (a 2014 counterspell, not a
  counterattack), `damageShield` (a free formula), `carriedLight` (lit by hand, a fuel item by identifier), `transpose`,
  `afterTeleport` (identifiers of other documents), `forOneAttack`; the hit steps `halve`, `uncrit`, `reduce`, `reroll`,
  `resist` (newer than the engine's latest release) and `save`. **Engine gaps** (looked for in the validators, the
  runtime, the shipped entries and the monster text reader): no step teleports the TARGET of a hit or a save (`banish`
  only removes it from the scene); nothing doubles damage against objects or structures (`siege` is only a weapon kind);
  nothing makes a hit miss only when the attacker fails a save (`cancelForSelf` has `ifSourceFails`, for areas only). Not
  gaps but not admitted: advantage on the user's next attack (a `preAttackRoll` declaration with `consume`, whose condition
  names the item by identifier, `source.hasEffect`), and an immunity after a successful save (a `mark` step's free name and
  translation label with `targets.unaffectedIf`, which the engine's monster text reader writes itself). **One way to say
  it**: a reaction word at its moment, `{ "given": { "moment": "isHit" }, "expect": { "acBonus": "proficiency" } }`, the
  condition beside the moment (`"activity": "melee"`), never a roll; `reactionsPerRound` once with an empty `given`;
  `teleports` at the use (`given: {}`) or on a hit and a miss. `loadCore` gives `reactionFields` (the reactions, teleport and
  light validators' own field lists and `LIGHT_ON`), `stepFields(type)` and `declarationFields` (read from validateStep and
  validateTrigger) and `hitWindowSteps`; a DAS_CORE test fails on a field or step in neither a drafter shape nor a table
  with why, on a value the pack assumes refused that the engine accepts, and on a shipped entry that fits a shape without
  implying its word. Every key and step is in the engine's latest release too: nothing is gated on the engine in use.
  Scenarios: every new word is manual (`expect.acBonus`, `expect.hitBecomes`, `expect.counterattack`, `expect.attackerTakes`
  beside `given.moment.isHit|isMissed` and `advance`; `expect.reactionsPerRound`, `expect.teleports`, `expect.sheds`): the
  runner makes no attack against the creature, takes no reaction, picks no destination and reads no light.
- **Partial rules** (Ruling R25, `tools/pipeline/leaves.mjs`). A rule may declare what its entry expects and it does not
  automate, as data: `rule.leaves`, at most 6 items, each an assertion `{ given, expect, because? }` of the vocabulary above
  (no `free` anywhere) of what would be true at the table but is done by hand, or `{ unexpressed, count }` (count 1 to 6) for
  what even the assertions cannot say. `because` and `unexpressed` are words of `LEAVE_REASONS`: `no-key`, `target-size`,
  `target-state`, `immunity-after-save`, `healing-block`, `out-of-combat`, `table-ruling`, `max-hp-reduction`,
  `ongoing-effect`, `use-time-choice`, `death-trigger`, `form-change`, `use-limit`, `trigger-filter`, `save-margin`,
  `follow-up-action`, `self-healing` (each defined in `definitions.leavesBecause`; the same single list a reread's
  `unexpressed` uses, section "Ingesting rereads"). Since Ruling R30, `target-size`, `target-state` and `trigger-filter` are
  for what a trigger's condition still cannot say (a size relative to the user's, a target engulfed or grappled by the user,
  a ranged attack only, a weapon property); older data keeps them as they were written. The schema checks it like `assert`
  (own keys, closed words; the validator gate checks the engine's words) and refuses a leaves assertion the rule states or
  implies (the same up to optional detail), a leaves damage the rule gives another fraction of for the same situation, an
  item listed twice, and any `leaves` on a rule whose own assertions (stated and implied) are none or only the item's own
  damage on a hit or failed save. `leaves` is part of the rule fingerprint and is emitted nowhere at runtime: the generated
  rule carries `partial` (counts by reason, `unstated` for an assertion without `because`), and docs/RULES.md says "partial"
  where the rule is handled, what it leaves to the table beside what it adds, and counts partial rules apart.
- **Quotations.** The text gate reads the record's cached text and fails a rule whose `origin`, `adds`, any `assert[].given.free` /
  `assert[].expect.free` or any `uncovered[].because` repeats 8 or more consecutive words of it, each field alone and all of
  them together in order (a quote split across fields). Both sides are normalised: NFKC, lower case, and every run of
  characters that are not letters or digits separates words (hyphens, slashes, zero-width characters). A text not in the
  cache fails; a legacy rule with standing is not held to it. Under `--ci` there is no text cache: what holds there is the
  gate evidence, whose rule fingerprint covers all of that prose, so a rule edited after a local run fails `--ci` until the
  gates pass on it again; the schema's limits run in both modes.
- **Drafter keys** (Ruling R6). `DRAFT_KEYS` (`tools/pipeline/draft-keys.mjs`) lists the entry keys a drafter may write, each
  with the slot its ids sit in (`activityMap`, `effectMap`: ids as an object's keys or a list, origins side by side; `single`:
  one id, one origin; `none`), read off each key's validator in the clone; `tests/pipeline/draft-keys.test.mjs` checks every
  key against the engine's `ENTRY_KEYS` and validator. `checkDraftKeys(entry, { origins, kind })` (both required: it throws
  without them) refuses any other key (the record goes to the drafts queue as outcome `person`) and, in `dataFixes`: a
  `create` (an effect to create goes to a person); a path outside the allowlist `FIX_PATHS` (exact case; `<id>` is 16 letters
  and digits): `system.activities.<id>.` + `range.(value|units|long)`, `target.template.(type|size|units|count)`,
  `target.affects.(type|count|choice)`, `duration.(value|units|concentration)`, `activation.(type|value)`,
  `save.(ability|dc.calculation|dc.formula)`, `damage.(onSave|parts|includeBase)`, `healing.(number|denomination|bonus|types)`,
  `consumption.(targets|spellSlot)`, `uses.(max|recovery)`, `effects`, `attack.bonus`, `spell.challenge`; on the item
  `system.uses.(max|recovery|autoDestroy)`, `system.duration.(value|units)`, `system.range.(value|units)`, `system.target.`
  + the target leaves above, `system.properties`, `system.attunement`, `system.damage.base.denomination`; on an effect
  (`effect: <id>`) `duration.(seconds|rounds|turns|value|units|expiry)`, `statuses`, `system.changes`, `changes`,
  `transfer`, `disabled`. Each leaf has a TYPE (`tools/pipeline/fix-types.mjs` `FIX_TYPES`) and `value` and `from` must
  both have it; there is no free string type: a number (a finite number, a numeric string, or a formula of at most 24
  characters of digits, operators, parentheses, spaces and the `@` references of `move.distance`); a word of a closed list
  for that leaf (`FIX_ENUMS`: units, activation, template and target types, abilities, dc calculations, `onSave`, recovery
  periods and types, damage and healing types, statuses, item properties, attunement, expiry, change types; damage types,
  abilities and statuses are the engine's own, checked against the clone by a test); a boolean; or a list of at most 12
  typed objects with closed keys (`damage.parts`: `{ number, denomination, bonus, types, scaling? }`; `consumption.targets`:
  `{ type, value, target?, scaling? }`, `target` a 16-character id or a dotted attribute path; `uses.recovery`: `{ period,
  type, formula? }`; `effects`: `{ _id, onSave?, level? }`; `changes` / `system.changes`: `{ key, value, type? | mode?,
  priority? }`, `key` a dotted attribute path of at most 64 characters; `statuses`, `system.properties`, `healing.types`:
  lists of words). `from: []` is a guard only for a list leaf ("it was empty"); null and empty strings are never one.
  At most 12 fixes per rule, one per (target, path); no `create`; an origin other than official alone and a monster feature
  are refused. Many of the engine's own fixes fall outside these types (null guards, `custom` damage parts, words as change
  values): such fixes are a person's.
  **It is a gate**: the schema gate (which runs under `--ci`) applies it to every non-legacy rule but an engineered one
  (section "Engineered rules", Ruling R43: any key of the engine's ENTRY_KEYS, data fixes still typed), unless a person signed
  the rule: `evidence.person: { by, because, rule }`, `rule` the fingerprint of the rule as signed, `by` an owner listed in
  `docs/owners.json` (never an agent's handle: `reader…`, `drafter…`, `reviewer…`, `second…`, `third…`, anything with
  `agent`). A signature of an earlier rule (the rule was edited since) or by someone not listed does not apply: the drafter
  limits do again. `evidence.person` is part of what the gate evidence fingerprints (`emits`), so adding or changing it
  after the gates makes the record `drafted` and fails `--ci` until the gates run again.
  `docs/owners.json` is protected by code review only, and `evidence.person` is a visible, reviewable claim, not a
  cryptographic signature (Ruling R20). **No ingest ever writes
  `evidence.person`** (a results file that carries `evidence` is rejected: unknown field); a person types it. The fixes gate
  fails an effect to `create` without a valid signature (`fixes: create goes to a person`). A legacy rule with standing
  keeps its behaviour.
- **Identifiers and inherited names** (Rulings R19, fix round 5). A key set is tested on own properties only, so a key named
  `constructor`, `toString`, `__proto__`... never passes for a known key; `__proto__`, `constructor` and `prototype` are
  refused as keys anywhere in an entry. A dotted path (change key, consumption target, formula reference) has at most 6
  segments of at most 24 characters; an entry may hold at most 60 distinct words of 3 letters or more in its strings, ids
  and the pack's closed vocabularies (`draft-keys.mjs` `CLOSED_WORDS`) left out; one effect's changes go through `changes`
  or `system.changes`, not both. The quotation check reads every string of the entry too (keys and values, structure-only
  strings and the roots of `@` references left out), with the words split at dots, camelCase and digit boundaries.
- **Queues** (Ruling R7). `registry/drafts-queue.json` and `registry/review-queue.json` sit beside `queue.json`: arrays of
  `{ key, reason, by, why, confidence, draft?, review?, reoffered? }` (`reoffered: true`, Ruling R39, in drafts-queue.json
  only, `true` when present), sorted by key (`registry.mjs` `loadQueue`, `saveQueue`,
  `validateQueueEntry`). With `legacy.json` they are the files of `NOT_BOOKS` (`registry.mjs`): `generate`, the CLI,
  `books-progress` and every other reader of `registry/*.json` leave them out, and no book code may take their names.
  `loadQueue` refuses a file that does not parse or an entry that is not valid (record key shape, known fields), and
  `gates` (with or without `--ci`) loads every queue first, `queue.json` included (`validateTriageQueueEntry`: key shape,
  known fields with `second` and `third`, verdicts, confidences, reader handles): a broken one exits 2 naming the file.

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
> An entry with `hint: "core-parts"` is a feature whose options (or a species whose traits) DAS · Core partly handles: judge
> what the handled parts leave out.
> **A monster feature** carries `engineReads` in its official structure: what DAS · Core already reads from the feature's
> own text, by itself (an entry of ids and engine words; `null` when it reads nothing; an entry with `hint: "engine-reads"`
> has a non-empty one). Judge ONLY what goes beyond `engineReads`: when the engine's reading already does everything the
> text says, the verdict is not `entry` (say `data` or `none` as for any entry the engine resolves, and say in `why` that
> the engine reads it); `entry` only for what the text says and `engineReads` lacks, named in `why`.
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
> **The two hard boundaries** (`none` or `entry`, `data` or `entry`): decide them with the criteria in the section "Written
> criteria for the two boundaries" of this document; a third reading is made with those criteria and nothing else.
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
> **Limits.** `why` is your own words: never quote the rulebook, and never 8 or more consecutive words of the text
> (such a quotation is rejected), and never copy a structure file's content beyond ids and keys: it is private. No server,
> no network, no git, no edits to the repository.
>
> **Confidence** is a number from 0 to 1. 1 means certain; 0.7 is the line: at 0.7 or more you would stand behind the
> verdict if nobody checked it; below 0.7 you are guessing, or the text is ambiguous, and a person will look at it instead.
> Say 0.6 when unsure rather than rounding up.

## 🔁 Rereading monster features

Triage gave the verdict `entry` to monster features without knowing that DAS · Core reads monster features from their
English text by itself (Ruling R29). On the 2024 Monster Manual that was 816 records, 287 of which the engine reads
something of. Some of those verdicts are right (the text asks for more than the engine reads), many are not (the engine
already does it: the verdict should be `core`), and only a reader comparing the text with the engine's reading can tell.
The reread is that reading, blind to every earlier verdict, reason and drafter answer (`tools/pipeline/reread.mjs`).

`npm run batch -- reread <BOOK> --out <dir> --structure <private dir> [--size 30]` needs `DAS_CORE` and `RULEPACK_DUMPS`
(a usage error, exit 2, names them otherwise): the engine's reading of each record is computed at cut time
(`engine-reading.mjs` `engineReading`, under the identifier the engine sees without the pack). It cuts
`<dir>/<book>-reread-<NNN>.json`, numbered after the highest `-reread-` number of the batch and results files of `<dir>` (an
id whose results file exists is never reused), from the records that are of kind `monster`, have the verdict `entry`, carry
no rule, are not legacy, are in neither `review-queue.json` nor `queue.json`, have text and a matched official item in the
dumps, and whose engine reading is **not empty**. A record in `drafts-queue.json` is cut (that is most of them). A record whose
stored reread (`evidence.triaged.reread`) judged the reading of today (same `sha`, below) is not cut again: only an unsure
(nothing stored) or a stale one is. A batch is `{ id, stage: "reread", core, vocabulary: "reread-vocabulary.json", entries }`;
an entry is what a triage entry carries (`key`, `name`, `kind`, `edition`, `textSha`, `owner`, `section`, `page`, `srd`
where the record has them, `items` without their data) **without the hint**, plus `reading: { core, sha }`, the fingerprint of
the engine reading the entry was cut against (the engine version and the SHA-256 of the reading's canonical form,
`readingFingerprint`). Nothing of an earlier verdict, why, confidence, reader or drafter handle, or drafts-queue answer goes
in. `<private dir>/<id>.structure.json` holds the item structures, with `engineReads` in the official one, as for triage
(premium-derived: never inside the repository, the registry or `--out`; never commit it). `<dir>/reread-vocabulary.json` is the
reviewer's vocabulary (the assertion shapes, the engine words, `definitions`, `endsExamples`) with `unexpressed`, the reasons
of `LEAVE_REASONS`, defined in `definitions.leavesBecause` (`batch.mjs` `rereadVocabulary`). `<dir>/<book>-reread-report.json`
holds counts only: the batches, the entries cut, each reason a candidate was left out (`already ruled`, `legacy`,
`in review-queue.json`, `in queue.json`, `no text`, `no matched official item`, `official item not in the dumps`,
`engine reads nothing`, `reread for the current reading`), also printed on the console.

`--second` cuts `<book>-reread-second-<NNN>` (its own numbering, `second: true` in the batch, report
`<book>-reread-second-report.json`) from the records a first reread set to `core` and no second reader has settled (`second
reread done` otherwise: confirmed, or back to `entry` by a disagreement or an unsure second reader), when the engine still
reads them as the first reread judged them (`reading changed since the first reread` otherwise). Give it to a reader with
another handle than the first: the ingest refuses the same one.

`--restate` (Ruling R31; never with `--second`, a usage error) reads ONCE more the first rereads the vocabulary has since
caught up with: `covered: false`, an `unexpressed` naming `target-size`, `target-state` or `trigger-filter` (`RESTATABLE`,
statable since trigger conditions, Ruling R30), and no `restated: true` (`restatable`). Only those are cut (every other
monster entry is left out as `not restatable`), the same reading notwithstanding; every other check above holds. The batches
keep the `-reread-` numbering, carry `restate: true`, and the report is `<book>-reread-restate-report.json`. They are
ingested with `--reread --restate` only (a restate batch without it, or a plain one with it, is refused): a record that is no
longer restatable is rejected, the same-reading refusal does not apply, and the reread stored, whatever it answers (beyond,
unexpressed, or covered: the provisional `core` below), replaces the old one and carries `restated: true`, so a restate never
cuts it again; an unsure answer leaves the record as it was.

### 📖 Brief for a reread agent

The Claude Code session gives each reread agent one batch file, its structure file, `reread-vocabulary.json` and this brief.

> You reread the entries of one batch file, `<dir>/<book>-reread-<NNN>.json` (or `<book>-reread-second-<NNN>.json`: the same
> work, done blind). Each entry is a monster feature. DAS · Core, the combat engine, reads monster features from their
> English text by itself; what it reads of this one is `engineReads`, in the official origin of the entry in the structure
> file: an entry of ids and engine words (`triggers` with their `on`, `if` and `do` steps, `effectEnds`, `saveDamage`,
> `blocksHealing`...). The question is one: **does the text require anything in combat that neither the item's own data
> nor `engineReads` gives?**
>
> **What you may read.** The batch file; its structure file `<private dir>/<book>-reread-<NNN>.structure.json`;
> `reread-vocabulary.json` beside the batch; and the text cache `$RULEPACK_TEXT` (the text of an entry is `<textSha>.txt`).
> Nothing else: never open anything under `registry/` (the queues included), any other batch or any results file. No
> network, no game server, no git, no edits to the repository: you write one results file and nothing more. You are not told
> what anyone decided before about these entries, and you must not look for it.
>
> **How you work.** For each entry read the text, then the official structure: its activities (type, save, damage parts,
> `onSave`, the effects each applies) and its effects (statuses, the keys their changes touch); then `engineReads`. What the
> item's data does, the engine does without any entry (an attack, a save, its damage, half on a save when `onSave` says so,
> the effects an activity applies with their statuses, durations, uses). What `engineReads` says, the engine adds by itself.
> Compare what remains of the text with both. There are three answers:
> - `covered: true` when everything the text requires in combat is in the item's data or in `engineReads`. What does not act
>   in combat (a description, a smell, something done outside a fight) does not count.
> - `covered: false` with `beyond` when the text requires something more that an assertion can say: `beyond` lists it, as
>   assertions of the closed vocabulary (`assert.shapes` of `reread-vocabulary.json`: `given` with `roll`, `moment`,
>   `origin`, `targetType` and the limits `targetSizeAtMost`, `targetStatus`, `selfStatus`, `targetWithin`, `targetHp`,
>   `targetHpAtMost`, `onOwnTurn`, `damageType`, `activity`, `spellLevelAtMost`; `expect` with `damage`, `condition`, `ends`,
>   `roll`, `affects`, `denies`, `move`, `uses`, `subjected`, `chooses`, `bars`), one
>   per thing the engine does not do, at most 6. Read each word in `definitions` of `reread-vocabulary.json`, never from its
>   spelling (the turn words are the trap: `bearerTurnEnd` and `casterTurnEnd` never end the turn of placement,
>   `currentTurnEnd` does; `endsExamples` shows each); a word marked `"unverified"` has no established meaning: do not use
>   it. No `free` text anywhere in `beyond`, and no `excludes`.
> - `covered: false` with `unexpressed` when the text requires something in combat that neither the item's data nor
>   `engineReads` gives, and no assertion can say it: `unexpressed` lists why, as distinct reasons of the closed list
>   `unexpressed` of `reread-vocabulary.json` (each defined in `definitions.leavesBecause`: a size limit relative to the user's,
>   a target state no given field names, an immunity after a save, a healing block, a lower hit point maximum, an effect kept
>   across turns, a choice at use time, a death or zero-hit-point trigger, a change of form, a limit on how often it is used, a
>   trigger filter no `activity` or `damageType` word says, a result by how much a save fails, a follow-up action, the user
>   healing itself...). A limit to targets of a size or smaller, of a type, in a condition, bloodied, within a distance, or to a
>   melee attack, an attack, a weapon or a spell, IS sayable: put it in the `given` of a `beyond` assertion. So is an aura
>   or an area that acts at a moment (Ruling R33): `{ "given": { "moment": "turnStart" }, "expect": { "subjected":
>   "activity" } }` for a creature that starts its own turn within it, `ownTurnEnd` / `ownTurnStart` for the bearer's turn
>   (`definitions.auraMoment`), `enter` / `turnEnd` for an area; what the activity then does is said with the roll alone.
>   So are (Ruling R34) a pick of one of the activity's own effects at use (`{ "given": {}, "expect": { "chooses":
>   "oneEffect" } }`, `oneEffectPerTarget` for one pick per target that failed, `effectByRoll` for a die), what an
>   emanation around the bearer keeps out (`bars`: `entry`, `melee`, `actions`; `spells` with `{ "spellLevelAtMost": <n> }`
>   in `given`), and a creature that regains no hit points or gains no temporary ones (`denies`: `healing`, `tempHp`, on
>   the roll that applies the effect): a healing block is then `beyond`, not `unexpressed`. Not sayable still: a barrier
>   that stops only some creature types (`no-key`), a change of form (`form-change`), a choice of anything but one of the
>   activity's effects (a damage type, a direction, a target: `use-time-choice`), an automatic failure by creature type.
>   So are (Ruling R38) what a reaction does to the attack that set it off, at its moment and with no roll: an AC bonus
>   against the hit (`{ "given": { "moment": "isHit" }, "expect": { "acBonus": "proficiency" } }`, or the number 1 to 10),
>   the hit turned into a miss (`hitBecomes: miss`, at `isHit`), a melee counterattack after a miss (`counterattack:
>   meleeWeapon`, at `isMissed`), the item's damage dealt back to the attacker that hit (`attackerTakes: activity`, at
>   `isHit`), with "a melee attack" as `"activity": "melee"` beside the moment; a creature's reactions a round
>   (`reactionsPerRound`, 20 for "one on every turn"), its own teleport (`teleports: self`; a swap with its target,
>   `swapsWithTarget`) and a glow (`sheds: light`). Not sayable still: a limit "while holding a weapon" (`trigger-filter`),
>   advantage on the user's next attack, the target teleported (`no-key`), damage doubled against objects.
>   `beyond` and `unexpressed` may be given together: list as assertions what an assertion can say, and name the reason
>   for the rest. `unexpressed` is never a way to avoid thinking: if an assertion can say it, say it in `beyond`.
>
> **Plainly: if something is missing, the answer is never covered, whatever your confidence.** `covered: true` is for a
> text with nothing left over; a reader who sees something missing answers `covered: false` (with `beyond`, `unexpressed` or
> both), and says so with a low confidence if unsure what it is, never with `covered: true`.
>
> **What is not beyond** (the written criteria, section "Written criteria for the two boundaries", apply). A rider the
> item's own data already does is not beyond (its effect already applies the condition on that roll; its save already
> halves); something `engineReads` already says is not beyond (a `status` or `move` step of its `triggers` on that roll,
> with the limit its `if` names, a `resave` that ends the effect, an `effectEnds` ending...). A trigger's `if` is read as
> the `given` of what it does: `{ "on": "failedSave", "if": { "target.sizeAtMost": "lg" }, "do": [ a push ] }` says "on a
> failed save, a Large or smaller target is pushed", and a limit the text gives that the reading lacks, or another size,
> is beyond. The ingest rejects a `beyond` assertion that either already
> implies. A requirement the closed vocabulary cannot say at all (a choice at use time, a state kept across turns) is beyond
> too: name it in `unexpressed`.
>
> **Worked example: covered** (invented). The text of "Cinder Shove" says: Dexterity save; on a failure, fire damage and the
> target falls prone; on a success, half damage. The structure has one `save` activity with fire damage and `onSave:
> "half"`, no effect; `engineReads` is `{ "triggers": [{ "on": "failedSave", "do": [{ "type": "status", "status": "prone"
> }] }] }`. The damage and the half are the item's data, the fall is in `engineReads`: nothing is left.
>
> ```json
> { "key": "tst:monster:cinder-imp/action/cinder-shove", "covered": true, "confidence": 0.9,
>   "why": "damage and half on a save are the item's; the engine reads the fall on a failed save" }
> ```
>
> **Worked example: beyond** (invented). The text of "Frost Clamp" says: on a hit the target is grappled, and while it is
> grappled it cannot take reactions. The structure has one `attack` activity whose effect has the status `grappled`;
> `engineReads` is `{ "effectEnds": { "<that effect's id>": "bearerTurnEnd" } }`. The grapple is the item's data; the lost
> reactions are neither the data nor the reading:
>
> ```json
> { "key": "tst:monster:rime-crab/action/frost-clamp", "covered": false, "confidence": 0.85,
>   "beyond": [ { "given": { "roll": "hit" }, "expect": { "denies": "reactions" } } ],
>   "why": "the grapple is the item's effect; the engine does not take its reactions away" }
> ```
>
> **Worked example: beyond, with a limit** (invented). The text of "Ember Lash" says: on a hit, a target that is Large or
> smaller is pushed 10 feet. The structure has one `attack` activity with fire damage and no effect; `engineReads` is
> null. The push and its size limit are one assertion:
>
> ```json
> { "key": "tst:monster:cinder-drake/action/ember-lash", "covered": false, "confidence": 0.85,
>   "beyond": [ { "given": { "roll": "hit", "targetSizeAtMost": "lg" }, "expect": { "move": { "mode": "push",
>     "distance": 10 } } } ],
>   "why": "the engine reads nothing of it: the push of large or smaller targets on a hit is missing" }
> ```
>
> **Worked example: beyond, an aura** (invented). The text of "Ember Halo" says: a creature that starts its turn within
> 10 feet of the salamander takes fire damage. The structure has one `damage` activity with fire damage and a range of
> 10 feet; `engineReads` is null. Nothing makes the activity act at that moment:
>
> ```json
> { "key": "tst:monster:ash-salamander/trait/ember-halo", "covered": false, "confidence": 0.8,
>   "beyond": [ { "given": { "moment": "turnStart" }, "expect": { "subjected": "activity" } } ],
>   "why": "the damage is the item's, but nothing uses it on a creature starting its turn near the salamander" }
> ```
>
> Had `engineReads` been `{ "emanation": { "on": "turnStart" } }`, the entry would be covered.
>
> **Worked example: beyond, a healing block** (invented). The text of "Rotting Grip" says: on a failed Constitution save the
> target is poisoned for a minute and cannot regain hit points while poisoned. The structure has one `save` activity whose
> effect carries `poisoned`; `engineReads` is null:
>
> ```json
> { "key": "tst:monster:bog-wight/action/rotting-grip", "covered": false, "confidence": 0.8,
>   "beyond": [ { "given": { "roll": "failedSave" }, "expect": { "denies": "healing" } } ],
>   "why": "the poison is the item's, but nothing stops the poisoned target from regaining hit points" }
> ```
>
> Had `engineReads` been `{ "blocksHealing": true }`, the entry would be covered.
>
> **Worked example: beyond, a reaction** (invented). The text of "Brass Riposte" says: when a creature hits the sentinel with
> a melee attack, the sentinel adds 3 to its AC against that attack; if the attack then misses, the sentinel makes one
> melee attack against the attacker. The structure has one `utility` activity with a reaction activation; `engineReads` is
> null:
>
> ```json
> { "key": "tst:monster:brass-sentinel/reaction/brass-riposte", "covered": false, "confidence": 0.8,
>   "beyond": [ { "given": { "moment": "isHit", "activity": "melee" }, "expect": { "acBonus": 3 } },
>     { "given": { "moment": "isMissed", "activity": "melee" }, "expect": { "counterattack": "meleeWeapon" } } ],
>   "why": "the reaction raises its AC against one melee hit and answers a miss with a melee attack" }
> ```
>
> **Worked example: unexpressed** (invented). The text of "Gale Tumble" says: Strength save; on a failure, the target is
> knocked prone, but only if it is Medium or smaller; this cannot be used again until the start of the user's next turn.
> The structure has one `save` activity with no damage and no effect; `engineReads` is `{ "triggers": [{ "on":
> "failedSave", "if": { "target.sizeAtMost": "med" }, "do": [{ "type": "status", "status": "prone" }] }] }`. The fall
> and its size limit are in `engineReads`; the once-per-round limit is neither the data nor the reading, and no assertion
> says it:
>
> ```json
> { "key": "tst:monster:storm-goat/action/gale-tumble", "covered": false, "confidence": 0.8,
>   "unexpressed": ["use-limit"],
>   "why": "the engine reads the size-limited fall, but not the wait before it is used again" }
> ```
>
> **No text, no answer.** If the text file is missing or unreadable, leave the entry out of the results. Never decide from
> memory of the book, and never from the structure alone.
>
> **Write one file** `<batch id>.results.json` outside the repository:
>
> ```json
> { "batch": "<batch id>", "by": "<your agent handle>",
>   "results": [ { "key": "…", "covered": true, "why": "one line", "confidence": 0.9 },
>                { "key": "…", "covered": false, "beyond": [ { "given": { }, "expect": { } } ], "why": "one line",
>                  "confidence": 0.8 },
>                { "key": "…", "covered": false, "unexpressed": [ "use-limit" ], "why": "one line",
>                  "confidence": 0.8 } ] }
> ```
>
> One result per entry, `key` unchanged; no other field (never `verdict`, `hint`, `reading`, `evidence` or `by` inside a
> result: a result that carries one is rejected, and a file with another top-level field is refused whole). `beyond` and
> `unexpressed` only with `covered: false`, and always one of them (or both) with it. `why` is one line of your own words,
> at most 200 characters: never the book's (8 or more consecutive words of the text are rejected), never a structure file's
> content beyond ids and keys. `by` is a short handle such as `rereader-3`, never a person's name (it is written into the
> public registry), and for a second reread never the first reader's. **Confidence** is 0 to 1; 0.7 is the line: below it,
> on a first reread, nothing is written and the entry is cut again later; on a second reread, the first reader's `core` is
> not confirmed and the entry goes back to the drafters. Say 0.6 when unsure rather than rounding up: `covered: true` takes
> work away from the pack, a second reader checks it, but a wrong one is a feature nobody automates.

## 🔁 Rereading items against the engine's view (Ruling R42)

Triage gave the verdict `entry` ("needs a pack rule") to features, spells, items, feats, species and options without seeing
what DAS · Core does with the item, and the engine has gained many rules since. The engine classifies every item itself
(its automation badge): `rule` (it has its own rule for the item, with the list of rule keys it recognises), `auto` (its
common path resolves the item's activities: a roll, an effect, a summon, a transformation, a cast), `passive` (transferred
effects only), `manual` (nothing) or `none` (gear with nothing to play). A live sweep of a test world writes that class per
record into a private file, `RULEPACK_ENGINE_VIEW`: `{ "<record key>": { level, rules, layers, identifier, pack } |
{ missing: true } }` (never in the repository; `reread-items.mjs` `parseEngineView` checks it whole and refuses a file with
one entry out of that shape). The item reread is the monster reread's discipline applied to that class: one reader blind to
every earlier verdict, a blind second reader for every covered answer, fail closed, one decision per view
(`tools/pipeline/reread-items.mjs`).

`npm run batch -- reread <BOOK> --items --out <dir> --structure <private dir> [--size 30] [--second]` needs `DAS_CORE`,
`RULEPACK_DUMPS` and `RULEPACK_ENGINE_VIEW` (a usage error, exit 2, names them otherwise; `--items` with `--restate` is one
too). The flag is `--items` because what is reread is the item the engine classifies, as against the monster feature whose
text the engine reads (the plain `batch reread`), and because the batches, the report and the vocabulary carry the same word
(`<book>-reread-items-<NNN>`). It cuts the records that are not monster features, have the verdict `entry`, carry no rule,
are not legacy, are in neither `review-queue.json` nor `queue.json`, have text and a matched official item in the dumps,
**and that the view holds with a level**. Left out, counted in `<dir>/<book>-reread-items-report.json` (counts only; also
printed): `already ruled`, `legacy`, `in review-queue.json`, `in queue.json`, `no text`, `no matched official item`, `not in
the engine view`, `missing from the engine view` (`{ missing: true }`), `official item not in the dumps`, `reread for the
current view`; the report also counts the entries cut per engine level (`byLevel`). An entry is what a triage entry carries
(`key`, `name`, `kind`, `edition`, `textSha`, `owner`, `level`, `section`, `rarity`, `page`, `srd` where the record has them,
`items` without their data) **without the hint**, plus `engineView: { level, rules }`, `engineWords` (the definition of the
level, and of each rule key named: the short definition of a drafter key where one exists, `zones.mjs` / `wards.mjs` /
`reactions.mjs`, otherwise "an engine rule of that name, not described here") and `view: { core, sha }`, the view's
fingerprint (the engine version of `DAS_CORE` and the SHA-256 of the level and the rules; `layers`, `identifier` and `pack`
never go in). `<private dir>/<id>.structure.json` holds the item structures as for triage (premium-derived: never commit
it); `<dir>/reread-items-vocabulary.json` is the monster rereader's vocabulary plus `engineLevels`, `coveredBy` and
`coveredByLevels` (below). A record whose item reread judged the view of today (same `sha`, an engine no older than today's)
is not cut again; an unsure one (nothing stored) or a stale one is.

`--second` cuts `<book>-reread-items-second-<NNN>` (report `<book>-reread-items-second-report.json`) from the records a
first item reread covered (verdict `core`, `data` or `none`, provisional) and no second reader has settled (`second reread
done` otherwise), while the view is still the one the first judged (`view changed since the first reread` otherwise). Its
entries are exactly the first's: nothing of the first answer goes in. Give it to a reader with another handle.

### 📖 Brief for an item reread agent

The Claude Code session gives each item reread agent one batch file, its structure file, `reread-items-vocabulary.json` and
this brief; the second reader gets a `-reread-items-second-` batch and the same brief, and never the first reader's results.

> You reread the entries of one batch file, `<dir>/<book>-reread-items-<NNN>.json` (or `<book>-reread-items-second-<NNN>.json`:
> the same work, done blind). Each entry is a feature, spell, item, feat, species or option. DAS · Core, the combat engine,
> classifies each item by itself; its class of this one is `engineView`: `level` (`rule`, `auto`, `passive`, `manual` or
> `none`, each defined in `engineWords.level` and in `engineLevels` of the vocabulary) and `rules`, the rule keys of the
> engine's own rule for the item (each defined in `engineWords.rules`, or said to be undescribed). The question is one:
> **does the item's data, played by the engine, together with the engine's rule for it, already do everything the text asks
> in combat?**
>
> **What you may read.** The batch file; its structure file `<private dir>/<book>-reread-items-<NNN>.structure.json`;
> `reread-items-vocabulary.json` beside the batch; and the text cache `$RULEPACK_TEXT` (`<textSha>.txt`). Nothing else:
> never anything under `registry/`, another batch, a results file, the engine view file or the engine's code. No network, no
> game server, no git, no edits to the repository: you write one results file and nothing more. You are not told what
> anyone decided before about these entries, and you must not look for it.
>
> **How you work.** Read the text, then the official structure (its activities: type, damage, save, `onSave`, the effects
> each applies; its effects: statuses, the keys their changes touch, `transfer`), then `engineView`. What the item's data
> does, the engine plays on `auto` (and on `rule`); a `passive` item acts through its transferred effects only; on `rule`
> the engine also does what each rule key says. Compare what the text asks in combat with that. There are four answers:
> - `covered: true` with `"coveredBy": "engine"` when a rule of the engine (a key of `rules`, level `rule`) does what the data
>   alone would not, and nothing is left;
> - `covered: true` with `"coveredBy": "data"` when the item's own activities and effects, on the engine's common path, do
>   all of it (level `rule`, `auto` or `passive`);
> - `covered: true` with `"coveredBy": "nothing"` when the text asks nothing to automate in combat (a choice of build, a
>   proficiency, travel, a conversation, a description), whatever the level;
> - `covered: false`, with `beyond` (assertions of the closed vocabulary, as in the monster reread brief above: one per thing
>   not done, at most 6, no `free`, no `excludes`) and/or `unexpressed` (reasons of the closed list, each defined in
>   `definitions.leavesBecause`), when the text asks something in combat that neither the data nor the engine's rule does.
>
> **Plainly: if the text asks for something in combat and the engine view is `manual`, the answer is never covered.** On
> `manual` and `none` the engine does nothing: only `"coveredBy": "nothing"` can be covered there, and only when the text
> truly asks nothing in a fight; the ingest refuses `engine` on any level but `rule` and `data` on `manual` or `none`
> (`coveredByLevels` of the vocabulary). A level does not decide alone either way: `rule` does not mean the rule does all the
> text asks (read each key's definition; an undescribed key is not evidence that something is done), and `auto` means the
> data is played, not that the data says everything the text says. If something is missing, the answer is never covered,
> whatever your confidence.
>
> **What is not beyond**: what the item's own data already does (an effect's status on the roll that applies it, an
> attack's damage on a hit, a save's half on a success when `onSave` says so); the ingest rejects such an assertion.
>
> **Worked example: covered by the engine** (invented). The text of "Ember Ward" says: once per turn, when the bearer is
> hit, it may reduce the damage by its proficiency bonus. The structure has one `utility` activity with a reaction
> activation; `engineView` is `{ "level": "rule", "rules": ["usageLimits", "damageReduction"] }`, `damageReduction`
> undescribed, `usageLimits` the once-per-turn limit. The rule names both things the text asks and the data alone would do
> neither:
>
> ```json
> { "key": "tst:feat:ember-ward", "covered": true, "coveredBy": "engine", "confidence": 0.75,
>   "why": "the engine's own rule limits it to once a turn and lowers the damage; the data alone would not" }
> ```
>
> **Worked example: covered by the data** (invented). The text of "Cinder Bolt" says: a ranged spell attack, fire damage on
> a hit, and the target sheds dim light until the end of its next turn. The structure has one `attack` activity with fire
> damage whose effect gives a light and ends on the target's next turn end; `engineView` is `{ "level": "auto", "rules": []
> }`. The attack, the damage and the effect are the data, and the engine plays them:
>
> ```json
> { "key": "tst:spell:cinder-bolt", "covered": true, "coveredBy": "data", "confidence": 0.85,
>   "why": "the attack, its damage and the timed glow are all the item's own data, played as written" }
> ```
>
> **Worked example: covered by nothing** (invented). The text of "Lamplighter's Knack" says: the character learns to read
> one more script and gains proficiency with tinker's tools. `engineView` is `{ "level": "manual", "rules": [] }`. Nothing
> of it acts in a fight:
>
> ```json
> { "key": "tst:feat:lamplighters-knack", "covered": true, "coveredBy": "nothing", "confidence": 0.9,
>   "why": "a language and a tool proficiency: nothing to play in a fight" }
> ```
>
> **Worked example: not covered, on manual** (invented). The text of "Frost Hop" says: as a bonus action the bearer leaps
> 10 feet, and the next creature it hits this turn is pushed 5 feet. `engineView` is `{ "level": "manual", "rules": [] }`:
>
> ```json
> { "key": "tst:feature:frost-hop", "covered": false, "confidence": 0.8,
>   "beyond": [ { "given": { "roll": "hit" }, "expect": { "move": { "mode": "push", "distance": 5 } } } ],
>   "unexpressed": ["follow-up-action"],
>   "why": "the engine plays nothing of it: the leap and the push after it are both missing" }
> ```
>
> **No text, no answer.** If the text file is missing or unreadable, leave the entry out of the results. Never decide from
> memory of the book, and never from the structure or the level alone.
>
> **Write one file** `<batch id>.results.json` outside the repository, `{ "batch": "<batch id>", "by": "<your handle>",
> "results": [ … ] }`, one result per entry with `key` unchanged and only the fields `key`, `covered`, `coveredBy` (with
> `covered: true` only, and always then), `beyond`, `unexpressed` (with `covered: false` only, one of them at least), `why`
> and `confidence`. `why` is one line of your own words, at most 200 characters, never 8 or more consecutive words of the
> text. `by` is a short handle such as `rereader-items-3`, never a person's name, and for a second reread never the first
> reader's. **Confidence** is 0 to 1; 0.7 is the line: below it, on a first reread, nothing is written and the entry is cut
> again; on a second reread, the first reader's answer is not confirmed and the record goes back to `entry`. A covered answer
> takes work away from the pack and a wrong one hides a missing rule: say 0.6 when unsure rather than rounding up.

## 📖 Brief for a drafter agent

`batch draft <BOOK> --out <dir> --structure <private dir>` cuts the records with verdict `entry` and no `rule`: 20 entries per
batch (`--size`), one kind per batch, kinds in the order spell, feat, option, species, background, item, feature, monster,
records with a matched official item first. A record is left out (and counted on the console, by reason) when it is already
ruled, queued in `registry/drafts-queue.json`, has no text, has no matched item, is a monster feature that can never pass the
gates (no creature to scope it to; "no official item"; "official item has no embedded id"; "shared embedded id, this DAS ·
Core refuses actor.item sources", on an engine that does, Ruling R35; "engine reads it: reread first": the engine reads
something of it, Ruling R29, and no reread found the text going beyond that reading: `hint: "beyond-engine"` lets it
through), or is one the `unique` gate would fail whatever is drafted:
"identifier is DAS · Core's: a person decides inCore",
"identifier shared with another record" (another record of the same edition that has a rule or the verdict `entry` registers it,
a monster feature counted under its creature-scoped identifier) and "identifier ruled for another edition: needs an
edition-scoped identifier" (Ruling R22: a twin of another edition alone is no clash until it has a rule; `batch.mjs`
`identifierClashReasons`, built on the gate's own `gates.mjs` `identifierClashes` and `identifierTwins`). The shared embedded id
is decided by `batch draft` itself, as inventory decides it when it binds a rule (`settle.mjs` `embeddedIndex`,
`sharedEmbeddedId`): a feature whose official embedded item id another creature of the book's package embeds is cut only when
the engine accepts `<actor id>.<item id>` sources (`core.actorItemSources`), and the actors are read from `RULEPACK_DUMPS`
(always needed, as `--structure` is mandatory; the usage error says so). The
record's own `embeddedShared` flag is no help: it is written only once a rule is bound. It writes
`<dir>/<book>-draft-<NNN>.json` (numbering continues after the highest in `<dir>`), `<private
dir>/<book>-draft-<NNN>.structure.json` (the same file as for triage: premium-derived, private) and
`<dir>/draft-vocabulary.json` (engine words only, and for every allowed data-fix path its type as a declarative description,
`fixes.types`, generated from the table that also checks it: safe to commit). A batch is `{ id, stage: "draft", allowed,
vocabulary, entries }`; `allowed` is `DRAFT_KEYS` with the slot each key's ids sit in. An entry is the triage entry plus
`identifier` (a monster feature's is scoped to its creature: `<book>-<creature>-<feature>`; its DDB Importer item, which no rule
can name, Ruling R3, is offered as `{ origin: "ddb-importer", match, uncovered: "always" }` with none of its ids, and the
structure file holds no structure for it: `batch.mjs` `rulableOrigin`), `keys` and `similar` (the triage reader's hints),
`why` and `examples` (at most three `{ identifier, entry }`, drafter keys only, stripped to ids, engine words,
formulas and numbers: no `adds`, `free` or label: first the triage `similar`, then the shipped rules that share `keys`, then the
canonical example of each key the shipped rules of the record's kind use most, so an entry has examples even when triage left
`keys` and `similar` empty), and for a monster feature a reread found going beyond the engine's reading `beyondEngine`: the
assertions that reread named (data, no free text; the second reread's when it disagreed with a covered first). The triage
`why` is kept only when it passes the quotation check of a rule's strings (8 consecutive
words of the text, `gates.mjs` `quotationCheck`); otherwise the entry is cut without `why` and counted ("why withheld: quotes
the source"). It needs the text, hence `RULEPACK_TEXT` at cut time (without the text of an entry its `why` is withheld). The
text is never in the batch: it is in the private cache, named by `textSha`. `batch draft` also writes
`<dir>/<book>-draft-report.json`: the batches, the entries cut, each reason a record was left out with its count, and the `why`
withheld (counts only). It refuses, writing nothing, a book whose package has no dump files, or that has monster records to cut
and no actor in its dumps. The numbering continues after the highest `<book>-draft-<NNN>` among the batch files and the
`<book>-draft-<NNN>.results.json` files of `<dir>`.

`--redraft` (Ruling R32) drafts again, once, the monster rules that change the engine's reading: drafted before the drafter
saw `engineReads` or could write trigger conditions, they drop or alter what the engine reads (a merged `triggers` replaces
the engine's whole), and `emissionOf` holds them `engine-changes`. Only `redraftable` records are cut (`batch.mjs`: a
monster feature, not legacy, with a rule held `engine-changes` under the reading computed now from `DAS_CORE` and the dumps,
as `npm run gates` computes it; in neither `drafts-queue.json` nor `review-queue.json`; whose draft has no
`evidence.drafted.redrafted: true`); every other `entry` record is left out as `not redraftable`. The entries are ordinary
draft entries (`engineReads` in the structure file, read as for an unruled record; `beyondEngine` when a reread found it),
blind to the rule they replace: nothing of it is in the batch, and no rule of a record cut is offered as an example. The
batches keep the `-draft-` numbering, carry `redraft: true`, and the report is `<book>-draft-redraft-report.json`. They are
ingested with `--draft --redraft` only (see "Ingesting drafts").

`--reoffer` (Ruling R39; never with `--redraft`, a usage error) offers once more to a drafter the entries of
`drafts-queue.json` that a drafter declined before the vocabulary grew (R30, R33, R34, R37, R38) and before the item summary
was corrected. Only the records whose entry `batch.mjs` `reofferable` accepts are cut: an entry whose `reason` is one of
`REOFFER_REASONS` (`person`, `code`, `engine`, `low-confidence`: a clash is a person's), signed by a drafter's handle
(`drafter…`) that no owner of `docs/owners.json` holds (an entry an owner wrote or signed is a person's), without
`reoffered: true`, about a record that is still an unruled, non-legacy `entry` record; every other `entry` record is left out
as `not reofferable`, and a reofferable one still meets every other reason above (`reofferSkipReason`: "engine reads it:
reread first", a clash, no text...). The entries are ordinary draft entries, blind to the decline: its reason, `why`,
handle, confidence and kept `draft` are in neither the batch nor the structure file (an entry is what a plain cut gives for
the record outside the queue). The batches keep the `-draft-` numbering, carry `reoffer: true`, and the report is
`<book>-draft-reoffer-report.json`. They are ingested with `--draft --reoffer` only.

`--redraft --against-reviews` (Ruling R41; `--against-reviews` without `--redraft`, or anywhere but `batch draft`, is a usage
error) drafts again, once, the records whose review-queue entry holds two blind reviews that read the text alike against
the draft: a second review (Ruling R40) marked `second: { agrees: false, result: "read", withFirst: true }`. A blind review
says what the TEXT requires and never saw the draft, so both stay valid for any later draft of the same record while its text
and matched item are unchanged. Only the records `against.mjs` `againstReviewsSkipReason` accepts are cut; every other
`entry` record of the book is left out under one closed reason (`not in review-queue.json`, `other reason`: neither
`disagreement` nor `low-confidence`, `no second review against the draft`, `redrafted against reviews`: the entry already
carries the mark below, `owner`: as for a second review, `legacy`, `stale`: the entry is not about the rule as it is, `not
an entry record`, `changed since the reviews`, `no text`). "Changed since the reviews" stands on the fingerprints the registry
keeps on the record, since a queue entry stores none: the text's `text.sha256` (inventory dates `textChangedAt` and drops
`evidence.gates` whenever it changes) and each matched item's `items[].data.sha256` (recorded per origin in
`evidence.gates.items`; inventory drops the gate evidence when it changes, and the gates keep their `at` while nothing does):
the record must have no `textChangedAt`, be `gated` (its gate evidence current, item fingerprints included) and its gate
evidence must be dated no later than the second review (`evidence.gates.at` <= `second.at`). The entries are ordinary
draft entries, blind: nothing of the old rule, of either review or of the queue entry (`reason`, `why`, handles,
confidences) is in the batch or the structure file, and no rule of a record cut is offered as an example. The batches keep
the `-draft-` numbering, carry `redraft: true, againstReviews: true`, and the report is
`<book>-draft-against-reviews-report.json`. They are ingested with `--draft --redraft --against-reviews` only.

`draft-vocabulary.json` also holds `draftShapes` (the value shape of every drafter key), `assert.shapes` (the value shape of
every `given` and `expect` field), `fixes.types` (the type of every data-fix path) and `keyExamples` (the canonical example of
each key: the shortest shipped entry that uses it), `definitions` (`tools/pipeline/definitions.mjs`: the meaning of each word
of the closed lists an agent picks from, in our own words, with the engine file or pack module it was read from, or
`"unverified"`; `batch draft` and `batch review` refuse to write anything while a word of the engine's `EFFECT_ENDS`, `MOMENTS`
or `MOVE_MODES` has none, and a test fails on it) and `endsExamples` (one invented pattern per `EFFECT_ENDS` word, with the
word it takes on the user's own turn and as a reaction on another's turn). Shapes are declarative: `enum` (one of `values`),
`object` (`keys` required, `optional`, closed), `list` (non-empty), `idMap` (an object keyed by ids of the named kind,
origins side by side), `idList`, `id`, `oneOf` (any alternative), `tagged` (an object whose `type` picks its other fields),
`tuple` (a list of exactly those places, each of its own shape: a reaction's steps, Ruling R38),
`true`, `number`, `formula`, `line`, `distance`, `facts` (a trigger's condition: 1 to `max` of the named facts as keys, each
with its argument's shape). `conditions` gives the same facts with the given field that says each, and the facts left out
with why (Ruling R30). `zones` gives the zone and aura keys with what each does (`keys`), the moments a replay and an
emanation may name, the aura moment words, and what the engine also takes with why not (`excluded`; Ruling R33). `wards`
gives the choice, barrier and ward keys with what each does (`keys`), what the engine also takes with why not (`excluded`),
and the keys of that territory a drafter may not write, with why (`notAdmitted`; Ruling R34). `reactions` gives the reaction,
teleport and light keys and the four reaction declarations with what each does (`keys`, `declarations`), the declaration's
shape (`declaration`, also among the `triggers` alternatives), the moments and the facts a reaction's condition may name,
what the engine also takes with why not (`excluded`), and the keys and hit steps of that territory a drafter may not write,
with why (`notAdmitted`; Ruling R38). Tests
build a value from every alternative of every shape and have the validators (`assertProblems`, the engine's `validateEntry`,
and for the zone, ward and reaction keys `checkDraftKeys`) accept it.

The Claude Code session gives each drafter agent one batch file, its structure file, `draft-vocabulary.json` and this brief.

> You draft rules for the entries of one batch file, `<dir>/<book>-draft-<NNN>.json`. A rule is a small declarative table
> entry, not a copy of the book.
>
> **What you may read.** The batch file; its structure file `<private dir>/<book>-draft-<NNN>.structure.json`;
> `draft-vocabulary.json` beside the batch; and the text cache `$RULEPACK_TEXT`: the text of an entry is the file
> `<textSha>.txt`. Nothing else. Never open anything under `registry/` (the queues included), nor the results files of other
> drafters. No network, no game server, no git, no edits to the repository: you write one results file and nothing more.
>
> **What you write.** Only the fields the batch asks for, in a results file. Never rulebook text: every string of a rule is
> checked for 8 or more consecutive words of the source, alone and together, and the free words of an entry (outside ids and
> the closed vocabularies) are capped at 60 per rule. `adds` is one plain line of at most 200 characters, `assert[].free` at
> most 120, `uncovered[].because` at most 200: your own words, never the book's. `origin`, the label of where the rule sits
> ("Fey Wanderer 3"), is derived by the tool from the entry's owner and level: do not write it.
>
> **Where the shapes are.** `draft-vocabulary.json` says how to write each value: `draftShapes.<key>` for a key of
> `rule.entry`, `assert.shapes.given.<field>` and `assert.shapes.expect.<field>` for an assertion, `fixes.paths` and
> `fixes.types` for `dataFixes` (`fixes.shape` says how a fix is written — an activity's leaf goes under
> `system.activities.<activity id>.` — and `fixes.examples` shows three), `keyExamples.<key>` for a worked example of a
> key. The entry's `examples` are rules of the
> same kind. Write only what a shape allows.
>
> **What the words mean.** `definitions` in `draft-vocabulary.json` gives the meaning of every word of the closed lists you
> choose from (`ends`, `roll`, `moment`, `auraMoment`, `subjected`, `chooses`, `bars`, `moveMode`, `affects`, `denies`,
> `acBonus`, `hitBecomes`, `counterattack`, `attackerTakes`, `reactionsPerRound`, `teleports`, `sheds`, `rollMode`, `rollOn`,
> `rollFor`, `fraction`, `given`, `size`, `targetHp`, `activity`, `fact`), each
> with where it comes from (`from`: the engine file, or this pack's vocabulary). Read a word there before you use it, never
> from its spelling. The turn words are the trap: `bearerTurnEnd` and `casterTurnEnd` never end on the turn the effect was
> placed in ("until the end of its next turn"), `currentTurnEnd` ends that very turn ("until the end of the turn in
> progress"); `endsExamples` gives one invented pattern per word, with the word for an effect placed on the user's own turn
> (`ownTurn`) and for one placed as a reaction on another creature's turn (`reaction`). A word marked `"unverified"` has no
> established meaning: avoid it, and if the entry cannot be said without it, answer `person`.
>
> **How you work.** For each entry read the text by `textSha`, then the structure of each matched origin. Take every id (an
> activity or an effect) from the structure file or the batch entry's `items`, never from memory. Write `rule.entry` with the
> keys of `allowed` only, and an `assert` list that says in the closed vocabulary what happens (`given`/`expect` of
> `draft-vocabulary.json`; `free` never counts as agreement). A `move` or an applied `condition` you assert on a roll must be
> done by the rule (a `triggers` step on that roll: a `move` of that mode and distance, a `status`) or, for a condition, by the
> item itself (an effect with that status linked to its attack or save activity in the structure file): otherwise the
> result is rejected ("the entry does nothing of the kind on <roll>").
> The `examples` show the shape; they are not this entry's rule.
>
> **Monster features: only what the engine does not read.** The official structure of a monster feature carries
> `engineReads`, what DAS · Core already reads from the feature's text by itself; the engine merges your rule over it key by
> key (a `triggers` list replaces its list whole). Write ONLY what goes beyond `engineReads`: never repeat one of its keys
> with the same value (it is dropped as redundant), never change one of its values (the rule is held for a person), and if
> you write `triggers` while `engineReads` has some, your list must contain every one of its triggers unchanged, conditions
> such as `target.sizeAtMost` included, plus yours. When `engineReads` already does all the text says, answer `person` with
> the reason "the engine already reads it". A monster feature the engine reads something of reaches you only after a reread
> found the text going beyond that reading: `beyondEngine` lists what it found, as assertions (a hint of what your rule is
> to add and assert, not a rule).
>
> **A trigger that holds only sometimes: its condition (`if`).** When the text limits a trigger step to some targets or
> situations, write the limit as the declaration's `if`: one object whose keys are facts of `conditions.facts` (all must
> hold), at most 3, each with the argument its shape gives (`"target.sizeAtMost": "lg"` for "Large or smaller";
> `"activity.isMelee": true` for "a melee attack"; `"target.hasStatus": "grappled"` for "a creature it is grappling"...),
> and assert each consequence with the given field of that fact (`conditions.facts.<fact>.given`: `targetSizeAtMost: "lg"`,
> `activity: "melee"`, `targetStatus: "grappled"`), beside its `roll`. Never `all`, `any`, `not`, a list or a `condition`
> key: the tool refuses them. What no fact says (a size relative to the user's, a target the user engulfed, a ranged attack
> only, while a weapon is held) is not a condition: leave the step out and name it in `leaves` (`target-size`,
> `target-state`, `trigger-filter`), or answer `person` when it is the main effect. A limit the engine already reads (an
> `if` in `engineReads`) is kept unchanged in your list, never dropped.
>
> **A zone or an aura: say when a creature is subjected (Ruling R33).** `zones.keys` of `draft-vocabulary.json` says what
> each zone and aura key does. An area that lasts and acts again on a creature that enters it, or starts or ends its own
> turn in it, is a `triggers` declaration `{ "on": [ ...those moments ], "do": [{ "type": "replay" }] }` (the item's
> activity is used again on that creature, once per turn; `"activity": "<id>"` names another activity of the item to use
> instead). An aura around the creature that carries the item is `emanation` (it acts at the bearer's turn end or start,
> `ownTurnEnd` / `ownTurnStart`, or when a creature starts its own turn within it, `turnStart`) or, for an effect held while
> near the bearer, `aura`. Assert each moment once with `"expect": { "subjected": "activity" }` and that moment alone in
> `given`; say what the activity then does with the roll alone (`{ "roll": "failedSave" }`), as for any use of the item,
> not once per moment. `turnEnd` is each creature's own turn in the area; `ownTurnEnd` the bearer's (`definitions.auraMoment`
> and `definitions.moment`): read both before choosing. "Creatures of your choice", "only enemies" is `zoneAffects: "enemy"`
> (an area) or `affects: "enemy"` (an emanation); "a construct succeeds automatically" is `saveAutoSuccess: { "types":
> ["construct"] }`, asserted `{ "given": { "targetType": "construct" }, "expect": { "roll": { "mode": "autoSuccess", "on":
> "save", "for": "target" } } }`; "a plant fails automatically" is `saveAutoFail: { "types": ["plant"] }` (`types` only),
> asserted the same with `"mode": "autoFail"` and `"targetType": "plant"`, but only when `draftKeys` lists `saveAutoFail`:
> when it does not, the engine in use does not know the key, so answer `engine`. Invented example: "Wilting Hush" deals
> necrotic damage on a failed Constitution save, half on a success, and a plant creature fails the save automatically:
> `{ "saveDamage": { "<activity id>": "half" }, "saveAutoFail": { "types": ["plant"] } }`, asserted `[{ "given": { "roll":
> "savedSave" }, "expect": { "damage": { "fraction": 0.5 } } }, { "given": { "targetType": "plant" }, "expect": { "roll": {
> "mode": "autoFail", "on": "save", "for": "target" } } }]`. Never a `changes` list, a radius formula, an emanation on
> death, a replay `on: "moves"` or under an `if` (`zones.excluded` says why): those are a person's. `selfZone`, `zoneLasts`,
> `zoneMax`, `zoneEffects`, `aura`, `willingFails`, an emanation's `radius`, `sees` or `whileActive`, and
> `saveAutoSuccess.fighting` / `sizeAtLeast` have no assertion word: write them when they are the right key, and know the
> rule then goes to a person at review.
>
> Worked example (invented). The text of "Cinder Haze" says the caster fills a 20-foot sphere with embers for the
> spell's duration; a creature that enters it or ends its turn there makes a Constitution save, and is poisoned until the
> start of its next turn on a failure. The structure has one `save` activity with a sphere template, concentration, and
> an effect carrying `poisoned`:
>
> ```json
> { "key": "tst:spell:cinder-haze", "outcome": "rule", "confidence": 0.85,
>   "why": "the sphere replays its save on entering and at the end of a turn inside; poisoned is the item's effect",
>   "rule": { "handledIn": "table", "adds": "A creature entering the haze or ending its turn there saves again.",
>     "entry": { "triggers": [{ "on": ["enter", "turnEnd"], "do": [{ "type": "replay" }] }],
>                "effectEnds": { "Ef21Ef32Ef43Ef54": "bearerTurnStart" } },
>     "origins": ["official"],
>     "assert": [
>       { "given": { "moment": "enter" }, "expect": { "subjected": "activity" } },
>       { "given": { "moment": "turnEnd" }, "expect": { "subjected": "activity" } },
>       { "given": { "roll": "failedSave" }, "expect": { "condition": { "applied": "poisoned" } } } ] } }
> ```
>
> Had the text said "at the end of each of the caster's turns, each creature within 10 feet of the caster takes fire
> damage", it would be an aura of the caster, `{ "emanation": { "on": "ownTurnEnd" } }`, asserted with `"moment":
> "ownTurnEnd"`, not `turnEnd`.
>
> **A choice, a barrier, a ward (Ruling R34).** `wards.keys` of `draft-vocabulary.json` says what each key does;
> `wards.notAdmitted` the keys you may not write and why. "The caster picks one of these effects" where each option is an
> effect of the activity in the structure is `choice: { "effects": "one" }` (`"perTarget": true` for a pick per target that
> failed its save, `"roll": true` with `"order"` for a die, `"pool"` for effects of the item the activity does not link),
> asserted `{ "given": {}, "expect": { "chooses": "oneEffect" } }` (or `oneEffectPerTarget`, `effectByRoll`); never a
> `prompt` (free text: the engine asks its own question and shows each effect's name), and never for a choice of a damage
> type, a direction or a target (those are `person`). A barrier around the bearer of the item's effect is `barrier: {
> "radius": <feet>, "units": "ft" }` (`shields`, `onlyTypes` / `exceptTypes`, `endsOnContact` as `wards.keys` says), asserted
> `bars: entry` and `bars: melee` (and `bars: actions` with `shields`), each `{ "given": {}, ... }`; one limited to some
> creature types asserts no `bars` (no word says which) and goes to a person. A ward against spells of a level or lower is
> `globe: { "radius": <feet>, "units": "ft", "maxLevel": <n> }`, asserted `{ "given": { "spellLevelAtMost": <n> }, "expect":
> { "bars": "spells" } }`. "Cannot regain hit points" while an effect lasts is `blocksHealing` (`true`, or the effect ids),
> asserted `denies: healing` on the roll that applies the effect; "cannot gain temporary hit points" is `blocksTempHp`
> (`denies: tempHp`). `wardsConditions` and `wardsAtZero` have no word: write them when they are the key, and the rule goes
> to a person. A change of form (`changesForm`: no temporary hit points, the first form only), walls and an enclosure have
> no drafter key: answer `person`. An automatic FAILURE of a save by creature type is `saveAutoFail` (zones, above) when
> `draftKeys` lists it, else `engine`. A radius is never asserted.
>
> Worked example (invented). The text of "Veil of Thorns" says: for the duration, a 10-foot barrier of thorns surrounds the
> caster and moves with it; no creature can enter it or reach through it with a melee weapon, and the caster cannot regain
> hit points while it lasts. The structure has one `utility` activity with a self range, concentration and one effect on the
> caster:
>
> ```json
> { "key": "tst:spell:veil-of-thorns", "outcome": "rule", "confidence": 0.8,
>   "why": "a barrier carried by the caster's effect; the healing block rides on the same effect",
>   "rule": { "handledIn": "table", "adds": "No creature walks into the veil or strikes into it; the caster heals none.",
>     "entry": { "barrier": { "radius": 10, "units": "ft" }, "blocksHealing": ["Ef31Ef42Ef53Ef64"] },
>     "origins": ["official"],
>     "assert": [
>       { "given": {}, "expect": { "bars": "entry" } }, { "given": {}, "expect": { "bars": "melee" } },
>       { "given": {}, "expect": { "denies": "healing" } } ] } }
> ```
>
> Had the text said "the caster chooses one of three wards: fire, cold or lightning" and the structure held three effects
> on the activity, the entry would be `{ "choice": { "effects": "one" } }`, asserted `{ "given": {}, "expect": { "chooses":
> "oneEffect" } }`; had it said "a spell of 3rd level or lower cast from outside cannot affect anything inside", `{ "globe":
> { "radius": 10, "units": "ft", "maxLevel": 3 } }` with `{ "given": { "spellLevelAtMost": 3 }, "expect": { "bars": "spells" } }`.
>
> **A reaction, a teleport, a light (Ruling R38).** `reactions.declarations` and `reactions.keys` of
> `draft-vocabulary.json` say what each does; `reactions.notAdmitted` what you may not write and why. A reaction is one
> `triggers` declaration in one of four shapes, its steps in that order, with at most one fact of `reactions.facts` as its
> condition: "adds N to its AC against that attack" (or "its proficiency bonus") is `{ "on": "isHit", "do": [{ "type": "use"
> }, { "type": "penalty", "formula": "N" }] }` (`"@prof"` for the proficiency bonus; N from 1 to 10), asserted `{ "given": {
> "moment": "isHit" }, "expect": { "acBonus": N } }` (`"proficiency"`); "the attack misses instead" is `use` then `{ "type":
> "miss" }`, asserted `hitBecomes: miss`; "when an attack misses it, it makes a melee attack against the attacker" is `{ "on":
> "isMissed", "do": [{ "type": "use", "target": "source", "weapon": true }] }`, asserted `counterattack: meleeWeapon` at
> `isMissed`; "a creature that hits it takes N damage" where the structure has a damage activity for it is `{ "on": "isHit",
> "do": [{ "type": "damage", "to": "source", "activity": "<its id>" }] }`, asserted `attackerTakes: activity`. "With a melee
> attack" is the condition `{ "activity.isMelee": true }` and `"activity": "melee"` in each `given`. Name the activity of a
> `use` only when the item has several reaction activities. "While holding a weapon", a reaction that costs nothing more, a
> bonus that lasts beyond that attack, a reduction or halving of the damage, a save that decides whether the hit misses:
> none has a shape (`person`; a damage formula of your own is refused, the damage comes from the item's activity). "It can
> take one reaction on every turn" is `{ "reactions": { "perRound": 20 } }` (N reactions a round: `perRound: N`), asserted
> `{ "given": {}, "expect": { "reactionsPerRound": 20 } }`. "It teleports up to 30 feet to a space it can see" is `{
> "teleport": { "activity": "<its id>" } }` when that activity's range is the distance, else `{ "distance": 30, "units": "ft",
> "activity": "<its id>" }`; `"after": "attack"` when it teleports once the attack hits or misses; asserted `teleports: self`
> (on `hit` and on `miss` with `after`). "It and the target swap places" is `swapPlaces`, `teleports: swapsWithTarget`. "It
> sheds bright light in a 10-foot radius and dim light for an additional 10 feet" while an effect of the item is on it is
> `{ "light": { "on": "effect", "bright": 10, "dim": 20, "units": "ft" } }` (`dim` is the OUTER radius), asserted `sheds:
> light`. Teleporting the target, advantage on the next attack, damage doubled against objects and an immunity after a
> save have no drafter key: `person` (or `engine` for the first and the third).
>
> Worked example (invented). The text of "Brass Guard" says: Reaction, when a creature hits the sentinel with a melee
> attack: the sentinel adds 3 to its AC against that attack. The structure has one `utility` activity `Bs10Bs21Bs32Bs43`
> with a reaction activation:
>
> ```json
> { "key": "tst:monster:brass-sentinel/reaction/brass-guard", "outcome": "rule", "confidence": 0.8,
>   "why": "the AC bonus against one melee hit, by the reaction",
>   "rule": { "handledIn": "table", "adds": "Raises its AC by 3 against one melee hit.",
>     "entry": { "triggers": [
>       { "on": "isHit", "if": { "activity.isMelee": true }, "do": [{ "type": "use" }, { "type": "penalty", "formula": "3" }] }
>     ] },
>     "origins": ["official"],
>     "assert": [ { "given": { "moment": "isHit", "activity": "melee" }, "expect": { "acBonus": 3 } } ] } }
> ```
>
> Had the same reaction gone on "if the attack then misses, the sentinel makes one melee attack against the attacker", do
> not add the `isMissed` declaration: each `use` costs a reaction and the creature has spent its one on the AC bonus, so the
> engine would never offer the counterattack (a free one is refused). That text is a partial rule leaving the counterattack
> (`{ "unexpressed": "follow-up-action", "count": 1 }`) or `person`. A reaction whose whole response is the counterattack
> ("when a creature misses it with a melee attack, it makes one melee attack against that creature") is the `isMissed`
> declaration alone.
>
> **Origins side by side.** Keys whose slot is `activityMap` or `effectMap` hold the ids of several origins in one object:
> list every origin whose item has the ids. A `single` slot (`triggers`, `rollBonus`, `atTurnStart`, `onHit`, `dataFixes`,
> `emanation`, `aura`, `teleport`, `swapPlaces`)
> holds one id: name one origin only and put the others in `uncovered` with a one-line reason. Every matched origin
> (`plutonium` `unchecked` excepted) is either in `origins` or in `uncovered: [{ origin, because }]`. `origins` lists each
> origin once. Leaving `official` uncovered (naming only `ddb-importer`) is allowed when the official item has nothing to
> bind; such a rule is read by a person at review.
>
> **Monster features name `official` only.** An item marked `"uncovered": "always"` (a monster feature's DDB Importer item:
> world ids, generic identifiers) is never in `origins` and has no ids to take: a rule that names it is rejected. Leave it
> out of `uncovered` too: the tool adds `{ "origin": "ddb-importer", "because": "DDB Importer monster features: world ids and
> generic identifiers" }` itself (`draft-vocabulary.json` `monsters` gives the same line).
>
> **`dataFixes`** only on the typed leaves of `fixes.paths`, official origin only, with a real `from` guard (the value the
> item has today, taken from the structure) and a `value` of the leaf's type; never on a monster feature; never `create`.
>
> **What goes to a person.** Anything the allowlist cannot express is `outcome: "person"` with a one-line `why`: never force
> it into an allowed key. A key the vocabulary cannot assert (`IMPLIES_NOTHING`: `effectDurations`, `usageLimits`,
> `breaksOn`...) sends the rule to a person at review: write it if it is the right key. Never write `excludes`: say a move
> that provokes no opportunity attacks, a lost reaction or the action-or-bonus limit with `denies`, and know that the keys
> `noOpportunity`, `noReactions`, `actionOrBonus`, `effectEnds` and a `resave` step already say them (`leaves` may not list
> what they do). A rule that needs state across turns, a prompt to a player or a fact the engine lacks
> is `code`; one that needs an engine key that does not exist is `engine`, with what is missing in `why`.
>
> **Partial rules: say what you leave out, as data (`leaves`, Ruling R25).** A rule may automate part of an entry. Then list
> in `rule.leaves` every expectation of the text the rule does not automate: an assertion `{ given, expect, because? }` of
> the same vocabulary as `assert` (no `free`: what would be true at the table but must be done by hand), or `{ "unexpressed":
> <reason>, "count": n }` for what even the assertions cannot say (a day of immunity, no regaining hit points, a halved
> speed). `because` and `unexpressed` are words of `leaves.because` in `draft-vocabulary.json` (`definitions.leavesBecause`
> says what each means; `leaves.shapes` gives both item shapes); at most 6 items. Never list what the rule itself states or
> implies (rejected). **Leaving something out silently is the worst outcome**: the reviewer, who does not see your rule,
> states everything the text requires, and an expectation found neither in your `assert` nor in your `leaves` is a
> disagreement sent to a person. `why` stays one line and does not replace `leaves`.
>
> **A rule that would leave out the main effect is not partial: answer `person`.** The main effect is the first expectation
> the text gives for its primary roll (what a hit or a failed save does). The test: if what would remain automated is only
> something the item's own data already does (its activity's damage, the condition its save already applies), answer
> `person`. A rule whose `assert`, with what its entry implies, is empty or only the item's own damage cannot carry `leaves`.
>
> Worked example (invented). The text of "Tusk Rush" says that on a failed save a target that is Large or smaller is pushed
> 10 feet and knocked prone (the item's save applies no effect); that it then has disadvantage on its next attack roll; and
> that its speed is halved until its next turn. The size-limited push and fall are automated (`triggers` with `if`, each
> asserted with `targetSizeAtMost` beside the roll: one assertion each, not two); the rest is not:
>
> ```json
> { "key": "tst:monster:tusked-strider/action/tusk-rush", "outcome": "rule", "confidence": 0.85,
>   "why": "push and fall on a failed save, Large or smaller only; the attack penalty and the slow are left to the table",
>   "rule": { "handledIn": "table", "adds": "A failed save pushes a Large or smaller target 10 feet and knocks it prone.",
>     "entry": { "triggers": [{ "on": "failedSave", "if": { "target.sizeAtMost": "lg" },
>       "do": [{ "type": "move", "mode": "push", "distance": 10, "units": "ft" }, { "type": "status", "status": "prone" }] }] },
>     "origins": ["official"],
>     "assert": [
>       { "given": { "roll": "failedSave", "targetSizeAtMost": "lg" }, "expect": { "move": { "mode": "push", "distance": 10 } } },
>       { "given": { "roll": "failedSave", "targetSizeAtMost": "lg" }, "expect": { "condition": { "applied": "prone" } } } ],
>     "leaves": [
>       { "given": { "roll": "failedSave" }, "expect": { "roll": { "mode": "disadvantage", "on": "attack", "for": "target" } },
>         "because": "no-key" },
>       { "unexpressed": "no-key", "count": 1 } ] } }
> ```
>
> Had the text said "a target no larger than the strider", the limit would be relative to the user's size, which no fact
> says: no `if`, the push left out as `{ "unexpressed": "target-size", "count": 1 }` (or `person`, the push being the main
> effect).
>
> **No text, no rule.** If the text file is missing or unreadable, answer `person` with `why: "no text"`. Never draft from
> memory of the book, and never from the structure alone. (The ingest rejects any result for an entry whose text is not in
> the cache, this one included: the session sees the entry in `rejected` and finds out why the text is missing.)
>
> **One entry, end to end** (invented names). Input, abridged:
>
> ```json
> { "key": "tst:spell:frost-lash", "name": "Frost Lash", "kind": "spell", "identifier": "frost-lash", "keys": ["saveDamage"],
>   "items": [
>     { "origin": "official", "match": "matched", "identifier": "frost-lash", "docId": "Of00Of11Of22Of33",
>       "activities": ["Sv11Sv22Sv33Sv44"], "effects": ["Ef11Ef22Ef33Ef44"] },
>     { "origin": "ddb-importer", "match": "matched", "identifier": "frost-lash", "docId": "ddbFrostLash0001",
>       "activities": ["ddbFrostSave0001"], "effects": [] },
>     { "origin": "plutonium", "match": "unchecked" } ] }
> ```
>
> The text says the target takes half damage on a successful save and falls prone on a failed one. Both origins hold an
> activity that rolls the save, so `saveDamage` (an `activityMap`) lists both side by side; `triggers` has no id slot. The
> result:
>
> ```json
> { "key": "tst:spell:frost-lash", "outcome": "rule", "why": "half on a save, prone on a failed save", "confidence": 0.9,
>   "rule": { "handledIn": "table", "adds": "A save halves the damage; a failed save leaves the target prone.",
>     "entry": { "saveDamage": { "Sv11Sv22Sv33Sv44": "half", "ddbFrostSave0001": "half" },
>                "triggers": [{ "on": "failedSave", "do": [{ "type": "status", "status": "prone" }] }] },
>     "origins": ["official", "ddb-importer"],
>     "assert": [
>       { "given": { "roll": "savedSave" }, "expect": { "damage": { "fraction": 0.5 } } },
>       { "given": { "roll": "failedSave" }, "expect": { "condition": { "applied": "prone" } } } ] } }
> ```
>
> A second entry whose text makes the hit force a save (`onHit`, a `single` slot: one id, so one origin) is drafted for the
> origin that has the activity and says why the other is not covered:
>
> ```json
> { "key": "tst:item:frost-brand", "outcome": "rule", "why": "a hit forces a save", "confidence": 0.8,
>   "rule": { "handledIn": "table", "adds": "A hit makes the target save.", "entry": { "onHit": { "save": "Sv11Sv22Sv33Sv44" } },
>     "origins": ["official"],
>     "uncovered": [{ "origin": "ddb-importer", "because": "onHit holds one activity id; this item has its own" }],
>     "assert": [{ "given": { "roll": "hit" }, "expect": { "affects": "target" } }] } }
> ```
>
> A third entry, whose text needs a zone that follows the caster (no drafter key says it), is answered to a person, with no
> `rule`:
>
> ```json
> { "key": "tst:spell:drifting-fog", "outcome": "person", "confidence": 0.9,
>   "why": "a zone that follows the caster: no drafter key" }
> ```
>
> **Write one file** `<batch id>.results.json` outside the repository:
>
> ```json
> {
>   "batch": "<batch id>",
>   "by": "<your agent handle>",
>   "results": [
>     { "key": "…", "outcome": "rule", "why": "one line", "confidence": 0.9,
>       "rule": { "handledIn": "table", "adds": "one line", "entry": { }, "origins": ["official"],
>                 "uncovered": [{ "origin": "ddb-importer", "because": "one line" }],
>                 "assert": [{ "given": { }, "expect": { } }] } },
>     { "key": "…", "outcome": "person", "why": "one line", "confidence": 0.8 }
>   ]
> }
> ```
>
> `outcome` is `rule`, `person`, `code` or `engine`; only `rule` carries a `rule` (whose fields are `handledIn`, `adds`, `entry`,
> `origins`, `uncovered`, `assert` and `leaves`). One result per entry, `key` unchanged;
> `batch` is the batch id, and a result for a key the batch does not hold is rejected. You never set `verdict`, `identifier`,
> `sources`, `alsoAs`, `inCore`, `code`, `origin` or any `evidence`: the tools derive them (a result or a rule that carries one
> is rejected). `by` is a short handle such as `drafter-3`, never a person's name (the registry is public). Confidence is 0 to
> 1; 0.7 is the line.

## 📖 Brief for a reviewer agent

`batch review <BOOK> --out <dir> --structure <private dir>` cuts the records whose state is `gated` (every gate passed on the
rule as it is): 30 entries per batch (`--size`), one kind per batch, kinds in the drafter's order. A record is left out (and
counted on the console and in `<dir>/<book>-review-report.json`, by reason) when it is `legacy`, `not gated (<state>)` (a rule
the gates do not pass is not worth reviewing; a `reviewed` or `played` one is done), `queued` (an entry of
`registry/review-queue.json` about the rule as it is waits for a person), has `no text` or `no assertion`. A rule a person
wrote (no `evidence.drafted`) is cut like any gated rule. A batch `<dir>/<book>-review-<NNN>.json` is `{ id, stage:
"review", entries, vocabulary: "review-vocabulary.json" }`; an entry is exactly a triage entry (`key`, `name`, `kind`,
`edition`, `textSha`, the record's `owner`, `level`, `section`, `rarity`, `page`, `srd`, `hint` where it has them, and
`items` without their data: the matched origins with their activity and effect ids; a monster feature's DDB Importer item as
`{ origin, match, uncovered: "always" }`, with no ids and no structure, as for a drafter) plus `rule`, the fingerprint of the
rule under review. **Nothing of the draft goes in**: no entry, no assertion, no `adds`, no `origins` or `uncovered`, no
drafter handle, no triage `keys`, `similar` or `why`.
`<dir>/review-vocabulary.json` holds the assertion vocabulary (`assert` of `draft-vocabulary.json`), the engine words it names,
the limits of the strings, and the same `definitions` and `endsExamples` as the drafter's; `<private dir>/<id>.structure.json`
the item structures, as for triage (never commit it).
Numbering continues per series (`-review-`), as for the other batches. The Claude Code session gives each reviewer agent one
batch file, its structure file and this brief, and an agent handle that is none of the rule's authors' (`evidence.drafted.by`,
`evidence.person.by`; never an owner's: `--second`, `--third`, `--draft` and `--review` refuse a results file signed with a
handle of `docs/owners.json`, Ruling R23).

> You review the entries of one batch file, `<dir>/<book>-review-<NNN>.json`, **blind**: you are not shown the rule that was
> drafted, and you must not look for it.
>
> **What you may read.** The batch file, `review-vocabulary.json` beside it, its structure file `<private dir>/<book>-review-
> <NNN>.structure.json`, and the text cache `$RULEPACK_TEXT` (the text of an entry is `<textSha>.txt`). Nothing else: never
> open anything under `registry/`, `scripts/rules/`, `docs/RULES.md`, any batch of another stage or any results file. No
> network, no game server, no git, no edits to the repository: you write one results file and nothing more. This
> prohibition is the only barrier between you and the drafted rule (the files are readable): a reviewer that opens them
> invalidates its own review, and must say so instead of answering.
>
> **Monster features.** Their official structure carries `engineReads`, what DAS · Core already reads from the feature's
> text by itself. Assert ONLY what goes beyond `engineReads`: what the engine already reads is not the rule's to claim, and
> an assertion of it is compared against a rule that leaves it out.
>
> **How you work.** For each entry read the text by `textSha`, then the structure of each matched origin. Say what must be
> true at the table when the item is used, as assertions in the closed vocabulary: `[{ given, expect }]` with the fields of
> `assert.shapes` (`given`: `roll`, `moment`, `origin`, `targetType`, and the situations a limit names: `targetSizeAtMost`,
> `targetStatus`, `selfStatus`, `targetWithin`, `targetHp`, `targetHpAtMost`, `onOwnTurn`, `damageType`, `activity`,
> `spellLevelAtMost`; `expect`: `damage` with its `fraction`, `condition` applied or ended, `ends`, `roll` with advantage,
> disadvantage, `autoSuccess` or `autoFail`, `affects`, `denies`, `move`, `uses`, `subjected`, `chooses`, `bars`; never `excludes`,
> `acBonus`, `hitBecomes`, `counterattack`, `attackerTakes`, `reactionsPerRound`, `teleports`, `sheds`; never `excludes`,
> which is refused).
> When the text limits a consequence ("if the
> target is Large or smaller", "on a melee attack", "a creature it is grappling"), state the limit in the same assertion's
> `given` (`{ "roll": "failedSave", "targetSizeAtMost": "lg" }`): a limit stated on one side only is a disagreement, so
> leave none out and add none the text does not give. State every
> consequence the text gives that the vocabulary can say, each once: a saved save that halves the damage, a failed save that
> leaves a condition, a miss that halves, an effect that ends at a moment. Leave out what the vocabulary cannot say; never
> force it. Read each word's meaning in `definitions` of `review-vocabulary.json` (the same definitions the drafter has, with
> `endsExamples` for the turn words: `bearerTurnEnd` / `casterTurnEnd` never end the turn of placement, `currentTurnEnd` ends
> it), never from its spelling; a word marked `"unverified"` has no established meaning, so leave out an assertion that
> needs it. `free` (one line, at most 120 characters, your own words) never counts as agreement: an assertion that carries one
> goes to a person. A `damage` `type` and a `move` `distance` are optional detail: give them when the text does, they are
> compared only when both sides state them. Saying that a hit or a failed save deals the item's own damage in full is
> allowed but not needed.
>
> **Zones and auras** (Ruling R33). When the text makes an area or an aura act on a creature at a moment, say each moment
> once: `{ "given": { "moment": "<word>" }, "expect": { "subjected": "activity" } }`, the moment alone in `given`. The words:
> `enter` (it enters the area), `turnStart` / `turnEnd` (it starts / ends its OWN turn inside the area or the aura),
> `ownTurnStart` / `ownTurnEnd` (the creature that carries the aura starts / ends ITS turn, and every creature within is
> subjected then); read `definitions.moment` and `definitions.auraMoment`. What the activity does to the creature (the save's
> condition, half damage on a success) is said with the roll alone, `{ "roll": "failedSave" }`, once, as for any use of the
> item: never repeated per moment. "Only enemies" or "creatures of your choice" is `{ "given": {}, "expect": { "affects":
> "enemies" } }` for an area, and the same with the aura's moment in `given` for an aura that acts. "Constructs succeed
> automatically" is `{ "given": { "targetType": "construct" }, "expect": { "roll": { "mode": "autoSuccess", "on": "save",
> "for": "target" } } }`; "plants fail it automatically" is the same with `"targetType": "plant"` and `"mode": "autoFail"`
> (Ruling R37): never read a failure as a success, nor the other way. The radius or size of an area is the item's data:
> never state it. Invented example: "Each creature that starts its turn within 10 feet of the hound must succeed on a save
> or be frightened" gives `[{ "given": { "moment": "turnStart" }, "expect": { "subjected": "activity" } }, { "given": {
> "roll": "failedSave" }, "expect": { "condition": { "applied": "frightened" } } }]`; "at the end of each of the hound's
> turns, each creature within 10 feet takes fire damage" gives `{ "given": { "moment": "ownTurnEnd" }, "expect": {
> "subjected": "activity" } }`.
>
> **Choices, barriers and wards** (Ruling R34). Say each of these once for the use of the item, with an empty `given`
> (never a roll, never a moment; read `definitions.chooses` and `definitions.bars`). "The user picks one of the effects"
> where the structure's activity holds those effects is `{ "chooses": "oneEffect" }`; one pick per target that failed its
> save, `oneEffectPerTarget`; a die that picks it, `effectByRoll`. A pick of a damage type, a direction or a target is none of
> these: do not use `chooses` for it. Around the creature that carries the item's effect: "no creature can enter" is `{ "bars":
> "entry" }`, "cannot reach through with a melee attack" (reach weapons excepted) `{ "bars": "melee" }`, "cannot affect
> anything inside" `{ "bars": "actions" }`, "a spell of 5th level or lower cast from outside has no effect inside" `{ "given":
> { "spellLevelAtMost": 5 }, "expect": { "bars": "spells" } }` (the level as the text gives it, a cantrip 0). When only some
> kinds of creature are kept out (or some pass), no word says which: do not assert `bars` for it. "Cannot regain hit points"
> while an effect lasts is `{ "denies": "healing" }` on the roll that applies the effect (`{ "roll": "failedSave" }` for a
> save's); "cannot gain temporary hit points", `{ "denies": "tempHp" }`. Invented example: "For the spell's duration, a
> 10-foot barrier moves with you; creatures can't enter it" gives `{ "given": {}, "expect": { "bars": "entry" } }`.
>
> **Reactions, teleports and light** (Ruling R38). What a reaction does to the attack that set it off is said at its moment,
> with no roll (read `definitions.acBonus`, `hitBecomes`, `counterattack`, `attackerTakes`): "adds 2 to its AC against that
> attack" is `{ "given": { "moment": "isHit" }, "expect": { "acBonus": 2 } }` (`"proficiency"` for its proficiency bonus,
> even when the number printed is that bonus); "the attack misses instead", `{ "hitBecomes": "miss" }` at `isHit`; "when an
> attack misses it, it makes a melee attack against the attacker", `{ "counterattack": "meleeWeapon" }` at `isMissed`; "a
> creature that hits it takes damage", `{ "attackerTakes": "activity" }` at `isHit` when the structure has the activity for
> that damage. "A melee attack" in the trigger is `"activity": "melee"` beside the moment. "One reaction on every turn"
> is `{ "given": {}, "expect": { "reactionsPerRound": 20 } }` (N a round: N). "It teleports" is `{ "teleports": "self" }`
> (`{ "roll": "hit" }` and `{ "roll": "miss" }` when it comes once the attack is judged), "it swaps places with the target"
> `swapsWithTarget`; "it sheds light" `{ "sheds": "light" }`. Invented example: "When a creature hits the warden with a
> melee attack, the warden adds 4 to its AC against it" gives `{ "given": { "moment": "isHit", "activity": "melee" },
> "expect": { "acBonus": 4 } }`.
>
> You never see whether the draft declared part of the entry as left to the table (`leaves`): state everything the text
> requires, as always; the comparison takes care of what the draft says it does not automate.
>
> **An entry the vocabulary cannot express at all.** An assertion made of only a `free` text is refused (it says nothing a
> tool can check), and so is an empty `assert`. Answer such an entry with `"outcome": "person"`, no `assert`, and a `why`
> that says what cannot be expressed: it goes to a person (`review-queue.json`, reason `unexpressed`). Use it only when no
> consequence of the text can be said; when some can, assert those and leave the rest out.
>
> **Write one file** `<batch id>.results.json` outside the repository:
>
> ```json
> { "batch": "<batch id>", "by": "<your agent handle>",
>   "results": [ { "key": "tst:spell:glimmerwhisk", "rule": "<the entry's rule, unchanged>", "why": "one line, your own words",
>                  "confidence": 0.9,
>                  "assert": [ { "given": { "roll": "crit", "targetType": "<a creature type>" },
>                                "expect": { "move": { "mode": "<a move mode>", "distance": 15 } } } ] } ] }
> ```
>
> Note that the example shows the shape only: an invented entry and an uncommon combination, no entry's answer.
>
> The other form, for an entry nothing of which can be expressed:
>
> ```json
> { "key": "tst:spell:glimmerwhisk", "rule": "<the entry's rule, unchanged>", "outcome": "person", "confidence": 0.6,
>   "why": "one line: what the vocabulary cannot say" }
> ```
>
> One result per entry, `key` and `rule` copied from the entry unchanged. No other field: never `evidence`, `verdict`,
> `agrees` or `by` inside a result (the tools derive them; a result that carries one is rejected). Never rulebook text: `why`
> and every `free` are checked for 8 or more consecutive words of the source, alone and together. `by` is a short handle such
> as `reviewer-2`, never a person's name, and never the drafter's. Confidence is 0 to 1; 0.7 is the line. No text, no review:
> an entry whose text file is missing is left out of the results.

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
    control or format character), or quotes 8 or more consecutive words of the cached text (the check of a rule's strings, `gates.mjs`
    `quotationCheck` with `RULE_QUOTE_WORDS`: NFKC, lower case, any other character a separator; the same limit and the
    same normaliser for `ingest`, `ingest --second` and `ingest --third`, and for the words of a kebab-case `similar` entry).
    A test (`tests/pipeline/registry-why.test.mjs`, run when `RULEPACK_TEXT` is set) fails if any `why` of the registry, or
    of a queue entry's `second` or `third` reading, breaks that limit;
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
   **Rule (Ruling R23):** a results file signed with a handle of `docs/owners.json` is a person's decision, taken only by
   the plain `ingest` (with or without `--overwrite`), where it also settles an entry that has a `second` or `third`
   reading (the verdict is applied, `evidence.triaged.by` is the owner, the earlier readings are kept as
   `evidence.triaged.first` and `second`, and the entry leaves the queue), while every agent stage (`--second`, `--third`,
   `--draft`, `--review`) refuses it and an agent-signed file is still rejected for such an entry; every other check,
   the quotation of `why` included, applies to the owner as to a reader.
3. A batch with an unusual share of rejections or queued results is redone, not patched.
4. Before a person reads the queue, a second reader may read it (below). Give a second reading to a reader with a different
   handle (`by`) than the first one's: the tool rejects the same handle.

### Ingesting drafts

`npm run ingest -- <results-file> --draft --batch <batch file>` takes what a drafter wrote (the results format of the drafter
brief above; `tools/pipeline/draft.mjs` `ingestDrafts`). `--batch` is required: it is the batch file the results answer.
`--draft` with `--overwrite`, `--second`, `--third`, `--settle-unsure` or `--review` is a usage error. The whole file is
refused (exit 2, nothing written) when it is not `{ batch, by, results }`, has another top-level field, `by` is not a handle
(`drafter-3`), it holds a key named `__proto__`, `constructor` or `prototype` anywhere, a queue file of the registry is
invalid, its `batch` is not a draft batch id `<book>-draft-<NNN>`, or the batch file does not have that id, stage `draft`,
and entries that are all keys of that book. It needs `RULEPACK_DUMPS`: monster features need the actors of the book's package
(they tell whether another creature shares the feature's embedded item id), and every rule's stated conditions are checked
against the official item's structure (below). For each result:

- **Rejected** (listed in `rejected` as `{ key, reason }`; nothing of it is kept, the record stays as it was and is cut again
  by the next `batch draft`): a field other than `key`, `outcome`, `why`, `confidence`, `rule`, or in `rule` other than
  `handledIn`, `adds`, `entry`, `origins`, `uncovered`, `assert`, `leaves` (so `evidence`, `verdict`, `identifier`,
  `sources`, `alsoAs`, `inCore`, `code`, `origin` are refused: the tools derive them, and no ingest ever writes
  `evidence.person`); a key twice in the file; a key that is no record; a key that is not an entry of the batch file ("not
  offered by this batch"); a record waiting in `drafts-queue.json`, a legacy record, a record that already has a
  rule, or one whose verdict is not `entry`; an unknown outcome; a confidence outside 0..1; a `why` that is not one line of at
  most 200 printable characters or that quotes 8 words of the text; no text in the cache; a `rule` on an outcome other than
  `rule`, or none on `rule`; `handledIn` other than `table` (a code rule is a person's, Ruling R18); `origins` that is not a
  non-empty list of distinct known origins (checked before anything that relies on it); a monster feature whose book's
  actors were not given (the library rejects the result; the command needs `RULEPACK_DUMPS` and stops with a usage error
  without it); an origin of `origins`
  that no identifier can reach (`aliasFor`: a generic or DAS · Core identifier, a DDB Importer monster feature: it belongs in
  `uncovered`); a monster feature whose official embedded item id another creature of the package embeds (Ruling R3: it
  cannot be ruled yet); and every failure the gates' own functions find on the record as it would be written: the schema
  (shape, `assert` present and valid, identifiers, sources), the drafter limits (`checkDraftKeys`: a key outside
  `DRAFT_KEYS`, a `create` fix, a fix path or type outside the allowlist, the word budget), the engine's `validateEntry` with
  the real fact list and the assertions against the engine's enumerations, the ids gate (Rulings R4, R5) and the quotation
  check of every string of the rule; and (Ruling R24, fix round 1) a stated `move` or applied `condition` on a roll that
  nothing backs (`draft.mjs` `unbackedProblems`, "the entry does nothing of the kind on <roll>"): a move needs a `triggers`
  step on that roll of that mode (and distance, when the assertion gives one); a condition needs a `status` step on that roll,
  or an effect carrying that status (its own `statuses`, or the entry's `effectStatuses`) linked to an activity of the roll's
  type in the official structure (attack for hit, miss and crit; save for failedSave; for savedSave, only an effect the entry
  lists in `savedEffects`). The structure says nothing of movement, and without the structure nothing is backed by the item
  (fail closed). Up to four of the problems are named. The `fixes` gate is not run here: `gates` runs it.
  Any unexpected exception while one result is read becomes that result's rejection (`internal: <first 80 characters>`):
  it never stops the others. A rejection repeats at most 80 characters of any string the drafter wrote.
- **Queued** in `registry/drafts-queue.json` (`{ key, reason, by, why, confidence, draft? }`, merged by key, sorted): outcome
  `person`, `code` or `engine` (the reason is the outcome); a rule that passed every check above but that the `unique` gate
  would fail whatever is drafted ("identifier is DAS · Core's: a person decides inCore", "identifier shared with another record"
  of its edition, "identifier ruled for another edition: needs an edition-scoped identifier": the same test as `batch draft`'s,
  on the record as it would be written, aliases included; the rule kept as `draft`); a rule that passed every check with a
  confidence below 0.7 (`low-confidence`, the rule kept as `draft`). A result is queued only if its `why` and the strings of its
  draft together, in either order, do not quote 8 words of the text (`why` and the rule are each checked alone, the queue entry
  holds both): a hit rejects it. The verdict is not changed. A queued record is not cut by `batch draft` again, and a later
  result for it is rejected: a person settles it (once only, `--reoffer` offers a drafter's decline again: below).
- **Applied** otherwise: `rule` is written as the drafter wrote it plus what the tools derive: `alsoAs` from `aliasFor`
  (Ruling R2: the identifier of a matched item that differs from the record's), `origin` (Ruling R17: the last part of the
  owner and, for a feature, the level), and for a monster feature its identifier `monsterIdentifier` (`<book>-<creature>-
  <feature>`) with its embedded item id bound in `sources`; `evidence.drafted = { by, at, core, rule }` (`rule` the rule's
  fingerprint), plus `person: true, because: "<key>"` when the entry uses a key the vocabulary cannot assert (Ruling R15
  generalised, `schema.mjs` `draftedForPerson`: the review sends every record with that stamp to `review-queue.json`,
  whatever the reviewer says), or `because: "official-uncovered"` when the
  rule lists `official` under `uncovered` (Ruling R21: allowed, since some official items carry nothing to bind, and read by
  a person at review). Nothing else of the evidence changes. The
  state is `drafted`; `npm run gates` (local, with dumps and text) takes it to `gated` or prints why not.

With `--redraft` (Ruling R32; a batch cut with `batch draft --redraft`, and only it: a redraft batch without the flag, or a
plain one with it, is refused, exit 2) the record must still be `redraftable` (on the reading computed now; otherwise the
result is rejected as `not redraftable`) instead of unruled, and every other check holds. An applied result replaces the
rule: the record starts from what it was before any draft (`draft.mjs` `withoutRule`: no rule, none of `evidence.drafted`,
`gates`, `reviewed`, `played`, `person` and `reading`, a monster feature's identifier and sources as for an unruled one),
then takes the new rule as above, with `evidence.drafted.redrafted: true`. It is `drafted`: `npm run gates` computes its
`evidence.reading` again, and `batch review` cuts it for a blind review, as any new draft. A result that goes to a person
(an outcome `person`, `code` or `engine`, a clash, a low confidence) is queued exactly as above, and the old rule is removed
the same way (listed in `unruled`: the queue alone would leave a rule known to change the engine's reading in place). A
rejected result leaves the record as it was. A redrafted rule that still changes the reading stays held `engine-changes`,
and the mark keeps the next `--redraft` from cutting it again.

With `--reoffer` (Ruling R39; a batch cut with `batch draft --reoffer`, and only it: a reoffer batch without the flag, or a
plain one with it, is refused, exit 2; never with `--redraft`) the record's drafts-queue entry must still be `reofferable`
(otherwise the result is rejected as `not reofferable`), decided on the registry as it is before any result is taken, and
every other check holds. A result that passes every check becomes the record's rule exactly as in a plain draft ingest, and
the entry leaves `drafts-queue.json`. For every other entry the batch offered and that is still reofferable — a result that
goes to a person again (an outcome `person`, `code` or `engine`, a clash, a low confidence: listed in `declined`, nothing of
it queued), a rejected result, or a key the results file does not answer — the entry stays exactly as it was (its `reason`,
`by`, `why`, `confidence` and `draft`) plus `reoffered: true`, so the next `--reoffer` does not cut it: the first decline is
the one a person reads, and a reoffer is one extra chance, not a new reading of the queue. Nothing else of the queue
changes, and the entry still waits for a person as before (a person settles it as any drafts-queue entry; a later plain
draft result for it is still refused). It prints `{ applied, declined, marked, rejected }`.

With `--redraft --against-reviews` (Ruling R41; a batch cut with `batch draft --redraft --against-reviews`, and only it: such
a batch without the flag, or another batch with it, is refused, exit 2) the record's review-queue entry must still be one
`againstReviewsSkipReason` accepts, decided on the registry and the queue as they are before any result is taken (otherwise
`not redraftable against its reviews`), and the drafter must have signed neither review (case aside). Every draft check
holds. A result that passes them all replaces the rule as `--redraft` does (from `withoutRule`, `evidence.drafted.redrafted:
true`, so that no later `--redraft` discards it), then the new rule is compared, by the comparison a review ingest uses
(`compareAsserts`, the official structure from the dumps for the baseline; no new tolerance), with the FIRST review as the
entry stores it (`review.assert`, `confidence`, `by`) and with the SECOND (`second.assert`, `second.confidence`,
`second.by`). Against each it stands `true` (it agrees and that reviewer's confidence is at least 0.7, the bar every review
agreement meets), `"unsure"` (it agrees, the reviewer was below 0.7) or `false`.
- Both `true`, and the draft not stamped for a person: **confirmed**. `evidence.reviewed = { by: <first reviewer>, at:
  <ingest date>, agrees: true, rule, confidence: <first's>, tolerated?, via: "redraft-against-reviews", second: { by, at,
  confidence, assert, tolerated? } }`: the first reviewer signs it (the entry's own reviewer, whose review anchored the
  queue), `at` is when the agreement was found (the first review's own date is not stored), `tolerated` is what the
  comparison with the first tolerated, and `second` keeps the second review as data (its handle, date and confidence, its
  assertions as canonical strings, what its comparison tolerated): both reviews the rule is reviewed on, no prose. The
  entry leaves `review-queue.json`; the record is `drafted` until `npm run gates` passes on the new rule, then `reviewed`
  and shipped as any reviewed rule (`emissionOf`; a monster rule still goes through its reading). `docs/RULES.md` counts
  such rules beside the second reviews (`books-progress.mjs` `againstReviews`).
- Otherwise the new rule is **kept** and the entry stays queued, brought up to date so that it is about the rule as it is:
  `draft` and `review` about the new rule (the first review compared with it), its `reason` the draft's stamp for a person
  when it has one, else `disagreement` when either comparison differs, `free-text` when only a free text stands between
  them, `low-confidence` when a reviewer was unsure; its `by`, `why`, `confidence` and `second` as they were (`second` is
  the second review as it was taken: its `onlyDraft` / `onlyReview` are about the older draft); plus `redraftedAgainst: {
  by, at, result: "compared", agreesFirst, agreesSecond }`.
- A decline (`person`, `code`, `engine`), a clash or a low confidence, a rejected result, or a key the file does not answer:
  the record and the entry stay exactly as they were, plus `redraftedAgainst: { by, at, result: "declined" | "rejected" |
  "missing" }`. Nothing goes to `drafts-queue.json`.
The mark is final: an entry that carries it is never cut by `--against-reviews` again. `review-queue.json` allows it beside a
`second` mark only, with closed keys per result (`agreesFirst` and `agreesSecond` only with `compared`, never both `true`).
It prints `{ applied, confirmed, confirmedExact, confirmedTolerated, partial, kept, declined, marked, regate, rejected }`;
the books and the review queue are written in one step.

It prints `{ applied, partial, queued, rejected }` (`partial`: the keys applied with `leaves`, Ruling R25, for the owner to
read; with `--redraft` also `unruled`) and exits with 1 when anything was rejected. The touched books and the queue are
written in one step (every file is checked first, then written under a temporary name and renamed over the old one,
`registry.mjs` `writeFilesAtomically`), as every `ingest` now does: an invalid book or queue, or a failing write, leaves
every file as it was.

### Ingesting reviews

`npm run ingest -- <results-file> --review --batch <batch file>` takes what a reviewer wrote (`tools/pipeline/review.mjs`
`ingestReviews`). `--batch` is required; `--review` with `--overwrite`, `--third`, `--settle-unsure` or `--draft` is a usage
error (`--review --second` is the second review, section "Second review" below). The whole file is refused (exit 2,
nothing written) when it is not `{ batch, by, results }`, has another
top-level field, `by` is not a handle, it holds a key named `__proto__`, `constructor` or `prototype`, a queue file of the
registry is invalid, its `batch` is not a review batch id `<book>-review-<NNN>`, or the batch file does not have that id, stage
`review`, and entries that are all keys of that book with a 64-hex `rule`. It needs `RULEPACK_DUMPS` (a usage error says so):
the official structure of each record answered, read as `batch review --structure` reads it, decides the baseline below.

**Agreement** (Rulings R9 and R24, `review.mjs` `compareAsserts`, data only). The draft says `normaliseAssert(rule.assert)`
plus `impliedAsserts(rule.entry, { structure })`: the saved-save, miss and no-damage fractions of `saveDamage`, `halfOnMiss`
and `noDamage`, each with the damage types of its activity in the official structure (one assertion per type; untyped
without the structure), and the `status` and `move` steps of `triggers` on every roll moment they are declared on (`hit`,
`failedSave`, `savedSave`...), with the mode, distance and status the step holds. The review says `normaliseAssert(assert)`.
Each side is read as its strongest assertions: one that says less than another of its own side (`push` beside `push 20`) is
absorbed by it and shares its fate. They agree when every draft assertion is matched by a distinct review assertion, every
review assertion is matched or is the item's baseline, and neither side holds a `free` text. A match is either equality or
**the same up to optional detail** (`draftMatches`): the same `given` (every given field is identity), the same expectation
kinds, every field both state equal, and every field one side states alone an optional detail of its kind (`OPTIONAL_DETAIL`:
damage `type`, move `distance`; identity everywhere else: damage `fraction`, move `mode`, condition `applied` / `ended`, roll
`mode` / `on` / `for`, `ends`, `affects`, `excludes`, `uses`), **in the safe direction only**: a detail the draft states and
the review leaves out is tolerated; a `distance` the review states and the draft side does not pin is not ("the rule pins no
distance": the draft side pins one through an entry step, whose implied assertion absorbs a stated move without distance); and
when two or more draft-side damage assertions of one `given` differ in fraction, a damage `type` must match exactly for that
`given` (which activity gets which result). Two details both stated and different never match; 20 and `"20"` are one value.
**Baseline** (`isBaseline`): a review-only `damage.fraction = 1`, with or without a `type`, given `hit` or `failedSave` alone,
is what the item's own data already does when the official item's structure has an activity of that roll that deals damage
(an `attack` for `hit`, a `save` for `failedSave`; of that type when one is stated), the draft says nothing of the damage in
that situation or in every situation, and the entry changes no damage on that roll (`draft-keys.mjs` `DAMAGE_ROLLS`, one line
per drafter key: a damage-touching `triggers` step on that roll — anything but `status`, `move`, `resave` — or on a moment
that is no roll; `saveDamage` on the saved save; `halfOnMiss` on the miss; `onHit` on the hit; `noDamage`, `ignoresResistance`,
`atTurnStart`, `dataFixes`, a `rollBonus` on anything but attack, save, check or initiative, and any key not in the table, on
every roll); no other review-only assertion is ever baseline, and a draft assertion is never ignored. Still not tolerated: any
other assertion on one side only, another moment, roll, target, condition, fraction, ending, move mode or given. The
comparison is kept as canonical assertion strings: `onlyDraft` (what the review misses), `onlyReview` (what it adds),
`baseline` (review assertions taken as the item's baseline) and `detail` (`{ draft, review }` pairs matched up to detail,
absorbed ones included), so a person sees what was tolerated. A result with `"outcome": "person"` (no `assert`) says the
reviewer could not express the entry: it is queued as `unexpressed`.
**Partial rules** (Ruling R25, extends R24): a review assertion neither matched nor baseline may be matched by an assertion
of the rule's `leaves` (what the rule declares it leaves to the table), by the same rules (one to one, up to optional detail
in the safe direction, each side read as its strongest assertions); it is then `left` (`{ leaves, review }` pairs), not
`onlyReview`. Agreement: every draft assertion matched, and every review assertion matched, baseline or left. An
`unexpressed` item matches nothing; a leave the review does not mention is fine (the reviewer may have missed it). The
reviewer never sees `leaves`: the review batch carries nothing of the draft.

For each result:

- **Rejected** (listed in `rejected` as `{ key, reason }`; nothing of it is kept, nothing queued): a field other than `key`,
  `rule`, `assert`, `why`, `confidence` (own properties only: `evidence`, `verdict`, `agrees`, `by` are refused; no ingest
  writes `evidence.person`); a key twice; a key that is no record or not an entry of the batch file; a legacy record or one
  without a rule; a `rule` that is not the fingerprint the batch entry gave, or that is no longer the rule's (the rule was
  edited after the batch was cut: "stale", Review Focus 4: the review does not apply, cut a new batch); a record waiting in
  `review-queue.json` (an entry about the rule as it is); a record whose state is not `gated`, or one of whose authors signs
  with the reviewer's handle (`evidence.drafted.by`, `evidence.person.by`, case aside: a rule a person wrote or edited after
  the draft is reviewed as it is, by someone who is neither); a confidence outside 0..1; a `why` that is not one line of at
  most 200 printable characters; an `assert` that is not a non-empty list valid against the clone's enumerations; no text in
  the cache; a `why`, a `free`, or `why` and every free text the queue entry would store (the draft's and the review's)
  together, in the stored order, its reverse, and with `why` first or last, quoting 8 words of the text. Any
  unexpected exception on one result is that result's rejection (`internal: …`). A rejection repeats at most 80 characters of
  any string the reviewer wrote. An `outcome` other than `assert` (the default) or `person`, an `assert` given with `person`,
  an empty `assert` and an assertion made of a `free` text alone are rejected.
- **Queued** in `registry/review-queue.json` (`{ key, reason, by, why, confidence, draft: { by?, person?, rule, assert,
  implied, leaves? }, review: { rule, assert, agrees, onlyDraft, onlyReview, baseline, detail, left? } }` — `baseline` and
  `detail` are absent from entries queued before Ruling R24; `leaves` and `left` (Ruling R25) only when there are some —
  merged by key, sorted; nothing is written on the
  record; `loadQueue` and `gates`, `--ci` included, hold `draft` and `review` to that shape: closed keys, valid assertions
  with the engine's words, canonical assertion strings that read back as such, so a hand-edited entry with prose fails): a
  record whose draft is stamped for a person (`evidence.drafted.person`, reason the key name or `official-uncovered`, Rulings
  R15, R21), **whatever the review says, agreement included** (`review.agrees` then says so); otherwise `unexpressed`
  (outcome `person`, `review.assert` stored as `[]`), `disagreement`, `free-text` (everything matches but a side holds a free
  text) or `low-confidence` (agreement below 0.7).
- **Agreed** otherwise: `evidence.reviewed = { by, at, agrees: true, rule, confidence, tolerated? }`, `rule` the rule's
  fingerprint, `tolerated` (only when Ruling R24 or R25 tolerated anything) `{ baseline: [review], detail: [[draft,
  review]], left?: [[leaves, review]] }`, the canonical strings of what was tolerated, held by the schema (each a canonical
  assertion of the closed vocabulary, not all lists empty). An agreement with `left` is "reviewed, partial". `tolerated` is
  part of the gates' `emits` (`registry.mjs` `emittedFingerprint`), so a hand edit that removes or changes it is seen:
  right after such an agreement the record is **`drafted`** until `npm run gates` passes again, then `reviewed` (an exact
  agreement is `reviewed` at once). A review never changes the rule.

It prints `{ agreed, agreedExact, agreedTolerated, regate, partial, queued, reasons, rejected }` (`regate`: the keys that
agreed through R24's or R25's tolerances, with a line on stderr saying to run `npm run gates`; `partial`: the agreed keys
whose rule has `leaves`, listed for the owner to read, never queued) and exits with 1 when anything was rejected.
`docs/RULES.md` counts the rules that stand reviewed through tolerances apart from exact agreements (`books-progress.mjs`
`toleratedReviews`). The touched books and the queue
are written in one step, as every `ingest` (`writeFilesAtomically`).

A person settles a review-queue entry in one of two ways. Editing the rule makes every evidence stale (the record is
`drafted`, then gated and reviewed again; the old queue entry, about another rule, no longer holds the record). Or
`npm run pipeline -- review-accept <key> --because "<one line>" --by <owner>`: `--because` is required (one line of printable
ASCII, at most 120 characters), `--by` an owner of `docs/owners.json` (never an agent's handle); the key must be in
`review-queue.json` with an entry about the rule as it is, and the record `gated`. It needs `RULEPACK_TEXT`: `--because` is
refused when it quotes 8 or more consecutive words of the entry's text, alone or with the rule's prose, and when the text is
not in the cache nothing can be checked, so nothing is written. It writes `evidence.reviewed = { by, at, agrees: true, rule,
confidence: 1, because }` and removes the entry, in one step. `evidence.reviewed.because` (like `evidence.person.because`) is
part of the gate evidence fingerprint `emits`, and the text gate reads both with the rule's prose: after `review-accept` the
record is `drafted` until `npm run gates` runs again and passes, and `gates --ci` fails until then, so a quote typed into
`because` by hand cannot stand on evidence stamped before it. The command trusts `--by`: whoever runs the CLI acts as the
owner named (Ruling R20: a visible claim, not a signature). Agents never run it.

### Second review (Ruling R40)

A review-queue entry queued as `disagreement` or `low-confidence` is read once more, blind, by a second reviewer: two
independent readings of three (the draft and one reviewer) agreeing settle it, as the triage's third reading settles two
readers who disagree. `review.mjs` `secondReviewSkipReason` says which entries are open to it: reason `disagreement` or
`low-confidence` (never a draft's stamp for a person, `free-text` or `unexpressed`: `other reason`), no `second` mark yet
(`second review done`), drafted by an agent (`owner`: no `evidence.drafted`, an `evidence.person`, a drafter handle of
`docs/owners.json`, a draft stamped for a person, a `draft.person` on the entry), the entry's draft and review about the rule
as it is (`stale`), and the plain cut's own reasons (`legacy`, `not gated (<state>)`, `no text`, `no assertion`).

- `batch review <BOOK> ... --second` cuts those entries alone, as ordinary review entries (the same entry a plain cut gives:
  nothing of the draft, of the first review or of the queue entry's `reason`, `why`, handle or confidence), in batches
  `<book>-review-second-<NNN>` (`second: true`, numbered on their own after the highest `-review-second-` number in `<dir>`),
  report `<book>-review-second-report.json`, whose `leftOut` counts the book's other queue entries by the reasons above. The
  reviewer brief is the same, unchanged: the second reviewer is given it, the batch, its structure file and a handle that is
  none of the rule's authors' and not the first reviewer's.
- `ingest <results-file> --review --second --batch <batch file>` takes only a batch so marked (a second batch without
  `--second`, or a plain one with it, is refused, exit 2). Every check of `--review` applies, with the same comparison
  (`compareAsserts`, baseline, tolerances, leaves; no new tolerance), except that the record must be an entry open to a second
  review (`not open to a second review: <reason>` otherwise) and the reviewer must not be the first one (case aside).
  - Agreement with the DRAFT at or above 0.7: **confirmed**, exactly as an agreeing first review (`evidence.reviewed`, with
    `tolerated` when R24 or R25 tolerated anything, then `drafted` until `npm run gates` runs again) plus `via:
    "second-review"` and `first: { by, confidence, reason, assert, onlyDraft, onlyReview }`, the first review as data
    (canonical assertions; its `why` stays out of the record). The entry leaves the queue.
  - Anything else: the entry stays exactly as it was (`reason`, `by`, `why`, `confidence`, `draft`, `review`) plus `second: {
    by, at, agrees, result }`: `agrees` is `false` when the assertions do not agree with the draft (an `outcome: "person"`
    included), `"unsure"` when they agree below 0.7 or when the result is `rejected` or `missing` (an offered entry the file
    does not answer). A `read` result also keeps `confidence`, `assert`, `onlyDraft`, `onlyReview` and, when its assertions
    agree with the first review's (the same comparison, the first review as the stated side), `withFirst: true`: two
    reviewers against the draft, for a person or a redraft to take first. The mark is final: the entry is never cut by
    `--second` again, and a further second result for it is rejected.
  - It prints `{ confirmed, confirmedExact, confirmedTolerated, regate, partial, marked, withFirst, rejected }` and exits with
    1 when anything was rejected; the books and the queue are written in one step.
- The schema holds both: `evidence.reviewed.via` (`"second-review"` only) and `first` go together, `first` with closed keys and
  a reason of the two; a queue entry's `second` is allowed in `review-queue.json` only, with closed keys per result, assertions
  valid against the engine's words and canonical strings. A confirmed rule is `reviewed` and ships (`emissionOf`); a marked
  entry holds its rule under its reason as before. `docs/RULES.md` counts the shipped rules settled by a second review apart
  (`books-progress.mjs` `secondReviews`).
- An entry marked `withFirst: true` (two reviewers against the draft) is open to a redraft against both reviews (Ruling R41:
  `batch draft <BOOK> --redraft --against-reviews`, "Cut draft batches" and "Ingesting drafts"). The mark stores what that
  comparison needs: the second review's assertions and confidence (`second.assert`, `second.confidence`) beside the first's
  (`review.assert`, `confidence`).

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

### Third reading and the bulk rule

The project owner approved written criteria for the hard cases (section "Written criteria for the two boundaries" below) and
two bulk rules. Both are options of `ingest`; `--third`, `--second`, `--overwrite` and `--settle-unsure` exclude one another
(a usage error, exit code 2, nothing written).

- `ingest <results-file> --third` reads a blind third reading, made with the written criteria, of the queue entries with
  `reason: "disagreement"` and a `second`, and no `third` yet. Every check of `ingest` applies (`core` is refused, no
  overwrite) and `engine` never settles. A result is rejected, and nothing of it applied, when its key is not such an entry
  (not in the queue, no `second`, another reason, already a `third`), when its handle is the first or the second reader's
  (case aside), or when its key already appeared in the file. For the others:
  - confidence at least 0.7 (the queue threshold) and a verdict equal to the first or the second reading's, not `engine`:
    **settled**. The verdict is applied with the third reader's `why`; `evidence.triaged` is written as for any ingest (by the
    third reader) plus `first: { by, confidence }`, `second: { by, confidence }` and `via: "third-reading"`; the entry leaves
    the queue;
  - anything else: **unsettled**. Nothing is applied; the entry stays with `third: { verdict, why, confidence, by }` and
    `reason` still `"disagreement"`. It is final for agents: a further `--third` result is rejected, and so is a normal
    `ingest` result ("two readers disagree: it waits for a person"). Only a person settles it.
  - it prints `{ settled, unsettled, rejected }` and exits with 1 when anything was rejected.
- `ingest --settle-unsure [--min <n>]` (no results file) is the owner's bulk rule for the entries two readers were both unsure
  about. For every queue entry with `reason: "unsure-twice"` whose first and second confidence are both at least `n` (default
  0.6; `n` must be a number from 0.5 up to, not including, 0.7: anything else is a usage error), the common verdict is applied
  with the second reader's `why`. `evidence.triaged` is signed by the second reader (so `by` stays a valid reader handle),
  carries `first` and `second` as above and `via: "bulk-unsure"`, which marks a verdict applied by the bulk rule and not read
  by anyone a third time. The entry leaves the queue; entries below `n` stay untouched; `engine` is never applied. It prints
  `{ applied, kept }` (`kept`: the `unsure-twice` entries still in the queue); a record that cannot take its verdict is kept
  and reported on stderr, with exit code 1.
- `evidence.triaged.second` and `evidence.triaged.via` are validated by the schema: `second` is `{ by, confidence }` like
  `first` and needs it; `via` is `"third-reading"` or `"bulk-unsure"` and needs both.

### Ingesting rereads

`npm run ingest -- <results-file> --reread --batch <batch file>` takes what a reread agent wrote (the results of the reread
brief above; `tools/pipeline/reread.mjs` `ingestRereads`). `--reread` with `--overwrite`, `--third`, `--settle-unsure`,
`--draft`, `--review` or `--min` is a usage error; `--second` with it means a second reread (below). `--batch` is required. It
needs `RULEPACK_TEXT`, `DAS_CORE` and `RULEPACK_DUMPS`: the engine's reading of each record answered is computed again from the
dumps, with the item's structure. The whole file is refused (exit 2, nothing written) when it is not `{ batch, by, results }`,
has another top-level field, `by` is not a handle or is an owner's (`docs/owners.json`: a reread is an agent stage, Ruling
R23), it holds a key named `__proto__`, `constructor` or `prototype`, a queue file of the registry is invalid, its `batch` is
not a reread batch id (`<book>-reread-<NNN>`, or `<book>-reread-second-<NNN>` with `--second`), or the batch file does not
have that id, stage `reread` (`second: true` exactly with `--second`) and entries that are keys of that book with their
reading. For each result:

- **Rejected** (`{ key, reason }`; nothing of it written; never stops the others, an unexpected exception included): a field
  other than `key`, `covered`, `beyond`, `unexpressed`, `why`, `confidence`; a key twice; a key that is no record or not an
  entry of the batch; a record that is not a monster feature, has a rule, is legacy, whose verdict is not `entry`, or that
  waits in `review-queue.json` or `queue.json`; an official item not in the dumps, or one the engine reads nothing of now;
  **stale**: the reading of today is not the one the batch entry was cut against (cut a new batch); a record already reread
  for that very reading; `covered` not a boolean; `beyond` or `unexpressed` with `covered: true`; `covered: false` with
  neither; `beyond` empty or longer than 6; `unexpressed` not a non-empty list of distinct reasons of `LEAVE_REASONS`
  (leaves.mjs: the one list `rule.leaves` uses too, each reason defined in `definitions.leavesBecause`); an assertion of
  `beyond` that `assertProblems` refuses (the engine's words, the agent form: no `excludes`, no `free`-only assertion), or
  that holds a `free` text at all (it is stored as data and handed to drafters); **an atom of `beyond` that the engine's
  reading already implies** (`impliedAsserts(reading, { structure })`, equal up to optional detail, Ruling R24's
  `sameUpToDetail`: a reader cannot claim as missing what the engine does), **or that the item's own data already does**
  (`itemAsserts`: the statuses of its effects on the roll that applies them, an attack's full damage on a hit, a save's on a
  failed save, the half or none of its `onSave`); a confidence outside 0..1; a `why` that is not one line of at most 200
  printable characters or quotes 8 consecutive words of the text; no text in the cache.
- **Unsure** (confidence below 0.7): nothing changes on the record and nothing is queued; the key is listed in `unsure` and
  the record is cut again by the next `batch reread`.
- **Covered** (`covered: true`, at least 0.7): the verdict becomes `core`, `why` the fixed line "DAS · Core reads this
  feature's text and a reader found nothing beyond it" (`REREAD_WHY`), the hint goes, and `evidence.triaged = { by: "rule",
  at, was: { verdict, why, triaged }, reread: { by, at, confidence, reading, covered: true, provisional: true } }`: `was` is
  what the record was, in the shape the pre-pass uses (the reader's triage evidence, an older reread left out), `reading` the
  fingerprint of the reading judged. If the key is in `drafts-queue.json`, its entry is removed (it no longer needs a rule).
- **Beyond** (`covered: false`, at least 0.7): the verdict stays `entry`, the record gains `hint: "beyond-engine"`, and
  `evidence.triaged.reread = { by, at, confidence, reading, covered: false, beyond?, unexpressed?, restated? }` beside the
  reader's
  triage evidence: `beyond` the assertions, `unexpressed` the reasons for what is missing and no assertion can state (data;
  `batch draft` hands the drafter `beyondEngine` from `beyond` only). A drafts-queue entry stays as it is (the drafter's
  answer still stands) and gains nothing.

It prints `{ covered, beyond, unsure, dequeued, rejected }` (`beyond` counts the `unexpressed` answers too; `unsure` the
keys) and exits with 1 when anything was rejected; the books and `drafts-queue.json` are written in one step
(`commitIngest`).

**Second reread** (`--reread --second`, from a `batch reread ... --second` batch): `core` takes work away, so a covered reread
stays provisional until a second, blind reader with another handle (case aside) agrees. Only a record whose verdict a first
reread set to `core`, `provisional`, with no second reread, judged against the same reading as the first, is taken; every
other check above applies. It **fails closed**: only an agreement keeps the `core`.

- Agreement (`covered: true`, at least 0.7): `reread.second = { by, at, confidence, reading, covered: true }`,
  `provisional` goes.
- Disagreement (`covered: false` with its `beyond`, its `unexpressed` or both, at least 0.7): the verdict goes back to what
  it was (`was`: `entry` and its why, the reader's triage evidence), `hint: "beyond-engine"`, and `reread` keeps both
  readings (`second` with its `beyond` and `unexpressed`).
- Unsure (below 0.7, whatever it says, once it passes the checks above): reverted the same way, the second reading
  recorded as `reread.second = { by, at, confidence, reading, outcome: "second-unsure" }` (a closed outcome; what the unsure
  reader said is not taken). The real runs showed why: readers answered `covered: true` at 0.6 while naming something
  missing the assertions could not say, so an unsure second reader more often than not saw something missing.

**The drafts-queue entry removed by the first reread is not restored** on a reversion (disagreement or unsure): the record
is simply draftable again (the command says so on stderr). A record a second reader already settled is not rejected but
reported and left alone: `already confirmed` (an agreeing second, verdict `core`) or `already reverted` (any other second,
verdict back to `entry`), so that a second-reread results file ingested before the fail-closed rule can be ingested again:
its records still provisional with no second reread get the rule, the others are reported. It prints `{ agreed,
disagreed, unsure-reverted, already confirmed, already reverted, rejected }` (counts; `rejected` the `{ key, reason }`) and
exits with 1 only when something was rejected.

The schema holds `evidence.triaged.reread` (closed keys, a reader handle, a date, a confidence, `reading: { core: an engine
version, sha: 64 hex }`, `beyond` as above with no `free`, `unexpressed` as above, a second's `outcome` only
`"second-unsure"` and then with no `covered`, `beyond` or `unexpressed`), and ties it to the record, also under `gates
--ci`: a reread covered by the first reader and by the second, if any, goes with the verdict `core` by rule, its `was` and
the fixed why, and is `provisional: true` exactly while there is no second; otherwise the verdict is not `core`; only a
covered first reread has a second one. The local `npm run gates` (it needs the dumps) prints a note (`reread: stale, ...`,
never a failure) for a record whose engine reading of today has another `sha` than the one a reread judged: a later engine
that reads the feature differently makes the reread visibly stale. A stale `entry` is cut again by `batch reread`; a stale
`core` is not (it is no
`entry` any more): the note is there for a person.

### Ingesting item rereads (Ruling R42)

`npm run ingest -- <results-file> --reread --items [--second] --batch <batch file>` takes what an item reread agent wrote
(`reread-items.mjs` `ingestItemRereads`); it needs `RULEPACK_TEXT`, `DAS_CORE`, `RULEPACK_DUMPS` and `RULEPACK_ENGINE_VIEW`
(the view and the item's structure are read again). `--items` without `--reread`, or with `--restate`, is a usage error. The
whole file is refused as for a monster reread, and when its `batch` is not `<book>-reread-items-<NNN>` (or
`<book>-reread-items-second-<NNN>` with `--second`) or the batch file does not have that id, stage `reread`, `items: true`
(`second: true` exactly with `--second`) and entries that are keys of that book with their `view`; a monster reread batch is
refused here and an item batch by the plain `--reread`. Per result:

- **Rejected**: every check of the monster reread that applies (fields, keys, the record a non-monster `entry` without rule,
  legacy or queue, `beyond` and `unexpressed`, the item's own data, confidence, why, text), with `coveredBy` among the fields
  (`by` never is); a monster feature; **stale**: no level for the item in the view now, or a view or an engine other than the
  one the batch entry was cut against; already reread for that view; `covered: true` without a `coveredBy` of `engine`,
  `data`, `nothing`, or with one the level contradicts (`engine` needs `rule`; `data` needs `rule`, `auto` or `passive`:
  `coveredByLevels`); `coveredBy` with `covered: false`.
- **Unsure** (below 0.7): nothing changes.
- **Covered** (at least 0.7): the verdict of `coveredBy` (`engine`: `core`, `data`: `data`, `nothing`: `none`), `why` its fixed
  line (`schema.mjs` `ITEM_REREAD_WHY`), a stale `beyond-engine` hint removed (any other hint kept), and `evidence.triaged =
  { by: "rule", at, was, reread: { by, at, confidence, view, covered: true, coveredBy, provisional: true } }`; the record
  leaves `drafts-queue.json`.
- **Not covered** (at least 0.7): the verdict stays `entry`, `hint: "beyond-engine"`, `reread: { by, at, confidence, view,
  covered: false, beyond?, unexpressed? }` beside the reader's triage evidence; `batch draft` hands the drafter `beyondEngine`
  from `beyond`, as for a monster feature.

**Second item reread** (`--second`): a blind second reader must agree on `covered` **and** on `coveredBy` at 0.7 or more to
confirm (`reread.second = { by, at, confidence, view, covered: true, coveredBy }`, `provisional` goes). Anything else fails
closed: another `coveredBy`, `covered: false`, or an unsure answer (`outcome: "second-unsure"`) gives the record back what it
was (`was`: `entry`, its why, the reader's triage evidence), with `hint: "beyond-engine"` only when the second found something
beyond; the drafts-queue entry is not restored. A settled record is reported (`already confirmed`, `already reverted`).

The schema holds the shape (a reread has `reading` or `view`, never both; `coveredBy` only on an item reread with `covered:
true`, and always then; a second of the same kind) and ties it to the verdict under `gates --ci` too: covered by the first
and by an agreeing second goes with the verdict of `coveredBy`, by rule, its `was` (allowed with `data` and `none` for an
item reread) and the fixed why; otherwise the verdict is none of `core`, `data`, `none`. The local `npm run gates` notes
(never fails) `reread: stale: ... read again` for an item reread judged by an engine older than `DAS_CORE`'s, or, when
`RULEPACK_ENGINE_VIEW` is given, whose view has no level for the item now or another `sha`; without the file it says the
view cannot be checked. `gates --ci` never reads the file.

### Written criteria for the two boundaries

These are our own words, approved by the project owner; they are not rulebook text.

#### `none` or `entry`
`none` when:
1. A monster's "Spellcasting" / "Innate Spellcasting" trait: the spell list and the DC are not a rule, each spell is resolved by
   its own item.
2. A Multiattack with a fixed sequence: a reminder of how many attacks to make.
3. Movement only (a leap, a dash, dragging a grappled creature): no roll and no effect to resolve.
4. A change of shape with no change to the statistics, or left to the game master.
5. Effects outside combat, or on objects and scenery only: raising the dead, building, destroying an unattended object, lights,
   decorative smoke.
6. Character-building choices: which weapons have mastery, always-prepared spells.

`entry` instead, even in one of the cases above, when:
- the Multiattack has a variable number of attacks or lets attacks be swapped for something else;
- the movement is tied to an attack or a saving throw (move, then attack, as a legendary action);
- the effect removes or imposes a condition the engine tracks (a restoration that ends a condition, an invisibility that ends on
  the first damage).

#### `data` or `entry`
`data` when the item already has the right activity (attack, save, damage, healing, cast, summon) and what is missing is only a
choice the player makes by hand anyway: using the activity again each turn, upcasting by spending more charges, choosing which
spell of a list to cast.

`entry` when the text gives a mechanical effect that would by itself change a roll, hit points, a condition or a duration, and the
data does not carry it:
- a piece is missing: no damage or healing part, no consumption of uses or charges, no template, no save ability;
- the end of the effect is missing: a duration, or an event that ends it;
- a restriction is missing: "only for spells of one class", "one at a time", "once per rest";
- a summon with end conditions, a limit of one creature, or a command economy.

An attack activity whose damage list shows the item's base damage is a plain attack: `data`.

## 🎲 Playing scenarios

Stage 6 turns a `reviewed` rule's assertions into a **scenario**: data a person, or the engine's own scenario runner on the test
server, can follow ("this item on the arena's caster, use this activity on a creature of this type, expect this"), and records
that it was actually played. The tools never touch a game server: `scenarios` writes files, `played` reads a runner log. Play
itself is run by the **main session only** (never a subagent), on the test server of the workspace rules, after a world
backup.

### `npm run scenarios -- <BOOK> [--check | --plan]`

For every record of the book in state `reviewed` or `played` whose rule is not engineered (an engineered rule's scenario is
hand-written and never generated: section "Engineered rules"), `tools/pipeline/scenarios.mjs` `scenarioOf` writes
`play/<book>/<slug of the key>.json` and, unless it is manual, `play/<book>/<slug>.mjs`, two lines that hand the JSON to
`play/lib/steps.mjs` `scenario`. A scenario is `{ scenario, key, rule, origin, client: "gm", manual, manualBecause, checks,
setup, steps }`:

- `scenario` is `<book>/<slug(key)>`, the name the runner prints; `rule` the rule fingerprint the file was made for.
- `setup`: the scene (`Arène des sorts`); the item (`origin`: official when the rule names it, else the first origin;
  `docId`; the `kind`). For a **monster feature** (`kind: monster`, docId `<actor id>.<item id>`) the creature itself is cast
  for the run from `actor` (the Monster Manual 2025, else dnd5e's SRD 2024, by that id) and uses its own embedded item `id`
  (`caster: null`, no compendium uuid, uses not consumed); a docId of another shape is `setup.item`. For anything else the item
  is lent to the arena's caster token (`caster: "Lanceur"`) from its compendium `uuid`, found in the dumps (the item pack
  holding the docId, the book's own package first). `near`: the token the creatures are cast near (`Cible`). The target is an
  SRD 2024 creature of the creature type the assertions name (`scenarios.mjs` `TARGETS`), a Bandit Captain when they name none.
  `reach`: per activity played, how far it reaches in feet (`structure.mjs` `reachesOf`: the activity's range in feet, else
  the larger of the item's reach and normal range; null when unknown); `area`: the activities with an area template, used on
  a rectangle laid over the target (as the engine's own scenarios do for a cone).
- `steps`: the assertions are `rule.assert` plus those its entry implies (`impliedAsserts`, given the official item's structure
  from the dumps: the roll each effect is applied on, the damage types), less those `rule.leaves` leaves to the table; of two
  that say the same thing (`sameUpToDetail`) only the more detailed is kept. Every id of the entry that is an activity of the
  item is played (the rule fingerprint `played` is bound to covers all of them); with none, the item's only activity; with
  several and none named, the only one of the kind that makes the assertions' rolls (a save for `failedSave`/`savedSave`, an
  attack for `hit`/`miss`). Per activity, per assertion checked on it: `{ use: <activity id> }`, `{ force: <roll> }` when it
  has a roll (`{ observe: <roll> }` when it has none but is about an effect: the roll the activity applies effects on, a failed
  save or a hit), `{ advance: <moment> }` when it has a moment, `{ check: <canonical assertion> }`. An assertion the entry ties
  to some activities (`saveDamage`, `noDamage` name theirs) is checked on those; any other, on each activity.
- `checks`: how many checks the run makes when every assertion holds: one per damage fraction (its type included), condition
  applied, condition ended, move and denial; two per ending at a turn boundary (still there just before, gone just after).
  `played` refuses a run whose stamp counts another number.
- `manual: true` when a step has no interpreter, with exactly the paths that have none in `manualBecause` (`given.free`,
  `force.crit`, `advance`, `expect.ends.savedSave`, `expect.ends.isDamaged`, `expect.move.mode.random`, `expect.move.distance`
  (a formula), `expect.roll`, `expect.uses`, `activity.heal` (a heal activity: the runner makes no healing roll and casts
  its target as a foe), `setup.item`, `setup.reach` (a pull whose start, its distance plus 5 ft, is beyond
  the activity's reach), `use`…). A manual scenario's JSON is a checklist for a person.
- Ruling R30, a trigger's condition: an assertion limited to targets of a size or smaller gets a target that satisfies it
  (`setup.target`: of the creature type the assertions name, else the default type first, no larger than the smallest limit;
  `TARGET_SIZES`, the size of each `TARGETS` creature, checked against `dnd5e.actors24` of the dumps by a test: Imp tiny;
  Wolf, Animated Armor, Red Dragon Wyrmling, Dryad, Bandit Captain, Shrieker Fungus, Zombie medium; Otyugh, Pegasus, Fire
  Elemental, Ogre, Owlbear, Ochre Jelly large), and is manual all the same: `given.targetSizeAtMost.unmet`, a target too
  large, is a second play the runner's one-target scenario does not make (`given.targetSizeAtMost` too when no creature of
  that type is small enough). Every other condition field (`targetStatus`, `selfStatus`, `targetWithin`, `targetHp`,
  `targetHpAtMost`, `onOwnTurn`, `damageType`, `activity`) is `given.<field>`: manual. `given.targetType` keeps its staging
  of the positive side only, as before.
- Ruling R33, zones and auras: an assertion at a zone or aura moment (`enter`, `turnStart`, `turnEnd`, `ownTurnStart`,
  `ownTurnEnd`) is manual, `given.moment.<word>` in `manualBecause` beside `expect.subjected` and `advance`: the runner lays
  no lasting area, places no creature in it and passes no turn to watch the activity used again. An automatic success
  or failure (`roll.mode: autoSuccess`, Ruling R37 `autoFail`) is `expect.roll`, as every roll mode.
- Ruling R34, choices, barriers and wards: `expect.chooses` (the runner answers no question), `expect.bars` (it walks no
  creature into an emanation, attacks from no outside square, casts no spell from outside), `given.spellLevelAtMost`, and
  the denials `expect.denies.healing` / `expect.denies.tempHp` (it deals no damage and heals nobody after the use) are
  manual, named so in `manualBecause`; such a check counts for nothing in `checks`. The three denials `play/lib/steps.mjs`
  observes (`opportunityAttacks`, `reactions`, `actionAndBonus`) keep their interpreter.

**What the interpreter checks** (`play/lib/steps.mjs`; no check passes on nothing — a missing resolution for the target fails
it, so does a use the engine refuses, at once; a target is found in the resolution by its token's uuid, never by name: the
engine's world may rename a cast creature, "Loquacious rulepack-target (1)"):

| Assertion | How it is observed | Fails when |
|---|---|---|
| `given.roll` hit / miss / failedSave / savedSave | the activity is used again (up to 20 times) until the resolution shows that outcome | it never comes |
| `expect.damage.fraction` (+ `type`) | the damage roll's total against `damage.applied`; the type among the resolution's `damageRoll.damages` types | no roll, no applied damage (above 0), another amount, the type absent |
| `expect.condition.applied` | the status absent before the use, present after | already there, or never there |
| `expect.condition.ended` | the status set on the target (`set-status`) before the use, gone after | it could not be set, or it stays |
| `expect.move` push / pull (± distance) | the target placed so that the lane is free (a push: adjacent, its whole distance free beyond; a pull: its distance plus one square out); squares travelled and squares from the caster before and after | nothing moved, it moved sideways or the wrong way, or not the stated distance (the failure line adds the engine's "pushed n of m (stopped)" log line when there is one) |
| `expect.ends` casterTurnStart / casterTurnEnd / bearerTurnStart / bearerTurnEnd / currentTurnEnd | in a combat (caster at initiative 20, target 10), the effect placed on a new caster's turn; turns passed one by one: still there just before the stated moment, gone just after (`casterTurnEnd` / `bearerTurnEnd`: the end of that creature's next turn, never the one it was placed in) | no new effect, gone too early, still there after |
| `expect.denies` reactions / actionAndBonus | the engine's `stats` of the target (`reactionBlocked`, `actionOrBonus`): false before the use, true after | already true, or still false |
| `expect.denies` opportunityAttacks | in a combat, on a new caster's turn: the engine's `budget` of the caster (`disengaged`, what runtime/turn.mjs sets after an item that "moves without provoking"): false before, true after | already true, or still false |

Not interpreted (manual): an ending on a repeated save (`savedSave`) or on a moment (`isDamaged`…): the engine's scenarios
force neither; a random move; roll modes; uses spent; a crit; a moment to advance to. A combat is started once per scenario
when a check needs one and ended by the runner's restore; when it cannot be started, that check fails and the run prints
`stamp withheld: …` instead of its stamp line, so `npm run played` records nothing from it.

Generated files hold ids, engine words, numbers, the record key and fingerprints: never `adds`, a `free` text (its canonical
form is `*`), the record's name or any text of the book. `--check` compares the files with what would be written (exit 1 on a
stale, missing or orphan file); files of `play/<book>/` that no reviewed record makes are removed by a write. `--plan` prints
the run order (Ruling R11): a rule's **family** is its sorted top-level entry keys, `triggers` with its declarations'
`on > step types` (`saveDamage+triggers(failedSave>status)`); the first rule (by key) of each family comes first, then the
others, all of them scheduled. Two records whose keys make one scenario id stop the command. `--check` and `--plan` are
exclusive. `--plan` prints `{ scenarios, manual, manualShare, order }`.

`scenarios` (`--check` included) needs `RULEPACK_DUMPS`, the premium dumps, to find the compendium of an item: CI has none,
so CI cannot check that `play/` is current. Run `npm run scenarios -- <BOOK> --check` locally before committing play data.

### Playing one scenario on the server (main session)

On the machine that runs the MCP connector for the test world (Node 20.10 or later: the generated modules import their JSON
with `with { type: "json" }`, and `play/lib/steps.mjs` imports `tools/pipeline/registry.mjs`, so this repository must be
checked out there), with the world open in the GM's client (connector setting
"Outils de test" on, the engine reloaded after any change), after a world backup:

```sh
cd "$DAS_CORE"
MCP_URL=<the connector's URL, default http://localhost:31416/mcp> \
  node tools/scenario.mjs <this repository>/play/<book>/<slug>.mjs 2>&1 | tee <private log>
```

A folder (`<this repository>/play/<book>`) plays every automatic scenario of the book (only those have a `.mjs`), in file
order; `--plan` says which to run first. The runner plays it in the scene named `Arène des sorts` (absent: "non applicable",
nothing recorded). A spell or item scenario places the target near `Cible` and lends the item to `Lanceur` (a spell as at
will); a monster scenario casts the creature (friendly) near `Cible`, then the target (hostile) next to it, and moves them so
that each check has its lane (`placementOf`: adjacent, on the side with the most free squares; the creature moved elsewhere on
the scene when its side has no room). It uses each activity, checks, puts everything back (the target's hit points and
conditions, the caster's spell slots, the spent uses of an item it already held, only the concentration effects the run added;
the cast creatures are removed, the combat ended), and prints a verdict. Then:

```sh
npm run played -- <private log> --world <world name>   # --client player for a player's client
```

and commit the registry. The log stays private (it is not rulebook text, but it is no repository file either).

**The 2024 Monster Manual today** (`npm run scenarios -- XMM`, 2026-11-22): 39 scenarios, **39 automatic, 0 manual** (before:
0 automatic, all `setup.item`, and 34 of them also waiting for the move, ending or denial interpreters). One scenario, then all
of them, from the engine's clone:

```sh
cd "$DAS_CORE"
export MCP_URL=<the connector's URL>
node tools/scenario.mjs <this repository>/play/xmm/xmm-monster-banshee-action-horrify.mjs 2>&1 | tee <log>
node tools/scenario.mjs <this repository>/play/xmm 2>&1 | tee <log>
cd <this repository> && npm run played -- <log> --world <world name>
```

**What could not be verified without a server** (a checklist for the first live run; each item names the scenario that shows
it):

- [ ] `ctx.cast` places a creature by its actor id for every caster of `play/xmm` (the Monster Manual 2025 module installed),
  and `disposition: 1` for the caster does not change how the engine resolves (`whirlwind`, `watery-rebuke`: `affects: enemy`).
- [ ] The monster's embedded item id is the second half of the docId for every creature (seen for the Air Elemental only).
- [ ] `run-script` returns the GEOMETRY of `play/lib/steps.mjs` (`canvas.scene.grid.size`, `.distance`, `.isSquare`,
  `dimensions.sceneRect`, tokens' `_source.x/y`, `width/height`, `level`) and `move-token` lands the target exactly on the cell.
- [ ] A forced move is measured on the free lane `placementOf` chose: no wall of the arena crosses it (walls are not read).
  The full distance is expected; a short push fails with the engine's "pushed n of m (stopped)" line in the message
  (`whirlwind`, `goristro`, `marid`, `poltergeist`, `watery-rebuke`, `tough-boss`).
- [ ] A pull starts its distance plus one square out and the engine stops it adjacent (`balor` 25 ft from 30, `merrow`,
  `shambling-mound`, `tree-blight`): the attack is accepted at that range (reach 30, normal range 20).
- [ ] An area activity accepts `area: { shape: "rectangle", …box(target) }` and resolves the target in it (every scenario with a
  non-empty `setup.area`: cones, lines, radii centred on the creature).
- [ ] `ctx.startCombat` gives a started combat (`round` ≥ 1) holding both creatures, `set-initiative` reorders it, `next-turn`
  runs the engine's turn endings (core/effect-ends.mjs) on the GM's client within 1.5 s, and no window opened at a turn change
  blocks the next one (`banshee`, `demilich`, `dracolich`, `chain-devil`, `ghast-gravecaller`).
- [ ] An effect placed on a new caster's turn carries the engine's `placedOn` (it is placed during a started combat).
- [ ] `ctx.engine("stats")` reports `reactionBlocked` and `actionOrBonus` for an unlinked cast target (`slowing-breath`,
  `fetid-cloud`).
- [ ] `ctx.engine("budget")` reports `disengaged` for the caster after a "moves without provoking" item on its own turn, the
  engine reading the item's English description (`clay-golem`, `colossus`, `lacedon-ghoul`, `unicorn`, `warrior-commander`,
  `weretiger`, `elemental-cataclysm`); a utility activity's `settle` may time out without failing the check.
- [ ] `damageRoll.damages[].type` is in the resolution the connector returns (`dire-worg`, `spectator`, `giant-ape`).
- [ ] A reaction or legendary activity (`chain-devil`, `spectator`, `watery-rebuke`, `colossus`, `unicorn`) is accepted when used
  outside its trigger with `consume: false`.
- [ ] 20 tries are enough for the rarer roll (a DC 13 save the Bandit Captain fails about one time in five).

### The stamp line and `npm run played`

`play/lib/steps.mjs` prints, last of its own lines in the scenario's block, exactly one stamp line (Ruling R10):

```text
das-rulepack: <book>/<slug> core=<engine version> rule=<64-hex rule fingerprint> checks=<checks played>
```

`core` is the engine's version as the GM's client reports it (`testApi.status`). `npm run played -- <runner-log> --world <name>
[--client gm|player]` (`tools/pipeline/played.mjs`) cuts the log into the runner's blocks (`▶ <name>` … its verdict) and, for
each block named like a scenario id (terminal colour codes are stripped from every line first; a log with stamp lines but no
block it can read exits 2, "no runner block recognised (colour codes on the header lines?)"; the engine's own scenarios in the
same log are ignored), writes `evidence.played = { at, core, world, scenario, client, rule }` only when every block of that
scenario in the log passed (`✓ scénario tenu (<n> vérifications)`, no `✗` line) with `n` equal to the stamp's `checks`, at least
1, and equal to the `checks` its scenario file declares (a run that played fewer is refused); its stamp is that whole line,
nothing before or after it on the line, one per block, naming the block's scenario; its `rule` is the record's rule fingerprint
today and the one `play/<book>/<slug>.json` was made for; the record is `reviewed` (or `played`: played again) and its scenario
is not manual. Anything else writes nothing for that scenario and is listed in `skipped` with its reason (a stamp for an older
rule, another record's rule or scenario, a failed or interrupted scenario, 0 checks, a malformed stamp, no scenario file); the
command prints `{ played, skipped }`, exits 1 when something was skipped, and writes the touched books in one step. `--world` is
a handle (letters, digits, `. _ -`); a log and `--manual` are exclusive.

**What stops a forged log, and what does not.** `played` reads only a runner log: no results file, no ingest and no agent
stage can write `evidence.played` (a results file that carries `evidence` is refused, as for every ingest). The log is
produced by the engine's runner on the server; the tool checks its form and that it was stamped for the rule as it is, not
that it came from a real run. A hand-written log with a correct stamp would be accepted: what stands against it is the main
session's honesty when it runs the play and the owner's review of the commit that records it (the same trust model as Ruling
R20). Played evidence carries the world, the client, the engine version and the date, so that review can tell what to ask.

**Played evidence and the gates.** A play from the log holds no prose: the schema holds `scenario`, `core`, `world`,
`client` and `rule` to an id, a version, a handle, a word and a fingerprint, so it is not part of `emits` and the record goes
from `reviewed` to `played` with its gate evidence standing. The only prose a play may carry is the `because` of a play by
hand: like `evidence.person.because` and `evidence.reviewed.because` it is part of `emits` and the text gate reads it, so
after `played --manual` the record is `drafted` until `npm run gates` passes again (`gates --ci` fails until then). The rule:
any line a person writes on the evidence stales the gates until the text gate has read it; nothing else written after the
gates may hold free text.

### Playing a checklist by hand

`npm run played -- --manual <key> --world <name> --because "<one line>" --by <owner> [--core <version>]` records that a person
followed a manual scenario's checklist: `evidence.played` with `manual: true`, `by` and `because`. `--by` is an owner of
`docs/owners.json`, never an agent's handle; the record must be `reviewed`, its `play/<book>/<slug>.json` made for the rule
as it is and manual; `--because` is one line of at most 120 printable characters that does not quote the entry's text (alone
or with the rule's prose; without the text in `RULEPACK_TEXT` nothing is written); `--core` defaults to the version of
`DAS_CORE`. The README shows such a rule as "Played by hand" and counts it apart.

## 🛠️ Engineered rules (Ruling R43)

The drafter vocabulary is a small, closed subset of the engine's entry keys, so that a blind reviewer can check a draft by
assertions. Most remaining entries need keys outside it. An **engineer** (an agent who reads the engine's source, or the main
session) can write such an entry, but no assertion can check it: an **engineered rule**'s evidence is a recorded **live play**
of a scenario written by hand, not a review.

**The rule.** `rule.engineered: { by, at, otherItems?, leavesNote? }` (part of the rule, so of its fingerprint): `by` an
engineer's handle `engineer-<name>` (`schema.mjs` `ENGINEER_HANDLE`; never an owner of `docs/owners.json`, which the schema
gate checks; an engineer's handle is an agent's for `evidence.person`, `played --manual` and `review-accept`), `at` the ingest
date. `evidence.person` is untouched: it stays the owners'. On an engineered rule:

- **lifted**: the drafter limits (any key of the engine's ENTRY_KEYS: `draft-keys.mjs` `engineeredKeyProblems` in place of
  `checkDraftKeys`; no closed shapes, no word budget) and the assertion requirement (`assert` may be absent; checked when
  present);
- **held**: the schema; the engine's own `validateEntry` (`loadCore`), which a key outside the engine's ENTRY_KEYS fails in a
  full run (`gates --ci` leaves it to the engine in use, as Ruling R37, so an older release does not fail it); the ids gate on
  the matched official item, an id of ANOTHER item allowed only through the closed list `otherItems: [{ docId, why }]` (1 to
  12, each named by the entry, none an id of the record's own items, each a document of the dumps when they are read:
  `ids: other item <id> is in no dump`); typed data fixes (`FIX_PATHS`, `FIX_TYPES`, no `create`, official only, never a
  monster feature); the 8-word quotation limit on every prose field; unique identifiers; the official origin only (every
  other matched origin goes in `uncovered`, "engineered against the official item only (Ruling R43)");
- **prose**: `adds` (as any rule) and what the rule leaves to the table, either `leaves` in its closed shape (Ruling R25) or,
  since an engineered rule's remainder often has no closed word, `engineered.leavesNote`: one own-words line of printable
  ASCII of at most 200 characters, read by the quotation check; not both. Each `otherItems[].why` is such a line too.
- `evidence.drafted` is refused beside it: nothing drafted it, and no review reads it.

**`npm run ingest -- <results-file> --engineered`** (`engineered.mjs` `ingestEngineered`; needs `DAS_CORE`, `RULEPACK_TEXT`;
with `RULEPACK_DUMPS` the other items are looked up, and a monster feature's actors read, which one needs). The results file
is private (it is not committed), exactly:

```json
{ "by": "engineer-<name>",
  "results": [ { "key": "<record key>", "entry": { ... }, "adds": "<one own-words line>",
                 "leaves": [ ... ], "leavesNote": "<one own-words line>",
                 "otherItems": [ { "docId": "<16-character id>", "why": "<one own-words line>" } ],
                 "why": "<one own-words line>" } ] }
```

`leaves`, `leavesNote` and `otherItems` are optional (`leaves` or `leavesNote`, not both); `why` is checked like a draft's
(one line of at most 200 characters, no 8-word quotation) and not stored. The whole file is refused (exit 2) when it has
another field, `by` is not an engineer's handle or is an owner's (case aside), or it holds a key named `__proto__`,
`constructor` or `prototype`. A result is written only on a record that is `entry`, has no rule, is not legacy and waits in
neither `queue.json` nor `review-queue.json`, has its text in the cache and a matched official item; the rule is `{
handledIn: "table", adds, entry, origins: ["official"], uncovered?, leaves?, engineered }`, completed as a draft is
(`draft.mjs` `ruledRecord`: aliases, origin label, a monster feature's identifier and source). A result that fails any gate
(the gates' own functions on the record as it would be written, the `unique` clashes included: an engineered rule has no
queue to wait in) is rejected with its reason, and nothing of it is written. A record that waited in `drafts-queue.json`
**leaves it** when its engineered rule is written (`dequeued` in the output, one stderr line per key). It prints `{ applied,
dequeued, rejected }`, exits 1 when something was rejected, and writes the books and the queue in one step.

**States and emission.** After `npm run gates` the rule is `gated` and **held** (`not-played`: "engineered (Ruling R43): no
recorded play yet"), never emitted on its gates alone; review batches leave it out ("engineered: proven by play"), a review
result for it is rejected, a redraft never takes it, and a review about it would change nothing (`stateOf` does not read one).
It is emitted only once `evidence.played` is about its current fingerprint: state `played`, status "played" in
`docs/RULES.md`, whose row says "Engineered (Ruling R43): proven by one recorded play of a hand-written scenario, not
reviewed; for the owner's eye." (and "Left to the table: <leavesNote>"), and whose closing line adds "N of them engineered
(Ruling R43): proven by a recorded play, not by a review." (nothing when there are none). When the rule changes, the record
is `drafted` until the gates pass again, then held as `play-stale` ("its play is about an older rule") until it is played again.

**The hand-written scenario** (the contract). For the record of scenario id `<book>/<slug>` (`scenarioIdOf`), two files that
a person or the main session writes and commits, and that `npm run scenarios` never writes, rewrites or removes:

- `play/<book>/<slug>.mjs`, whose **first line is exactly** `// hand-written (Ruling R43)` (`scenarios.mjs`
  `HANDWRITTEN_MARK`), exporting by default `handWritten(json, play)` of `play/lib/handwritten.mjs`;
- `play/<book>/<slug>.json`, **exactly** `{ scenario, key, rule, handWritten: true, checks, covers }`: the scenario id, the
  record key, the fingerprint of the record's rule as it is, `checks` the number of `expect` one passing run makes (1 to 999),
  `covers` one own-words line (at most 200 printable characters, no 8-word quotation of the entry's text when
  `RULEPACK_TEXT` has it) saying which situation the play covers. No other field: no rulebook text, no prose but `covers`.

`npm run scenarios -- <BOOK> --check` verifies each pair (`handWrittenProblems`: the fields, the record engineered, the
scenario id, the module's mark, the fingerprint) and fails on a stale one; `npm run scenarios -- <BOOK> --stamp-handwritten`
sets `rule` to the record's current fingerprint and writes nothing else. Run it only after reading the module again against
the rule as it is: the next play it stamps is a play of that rule. A generated scenario is never made for an engineered rule,
and a generated file that would land on a hand-written one stops the command.

`play/lib/handwritten.mjs` hands `play(h)` the context helpers the generated scenarios use (exported from
`play/lib/steps.mjs`, not written twice): `h.caster()`, `h.cast(roles, options)`, `h.target(actor, near?)`, `h.give(caster,
uuid, { spell })` (the item lent, its uses, slots and concentration put back), `h.use({ caster, itemId, activityId, targets,
consume, area })` (settled: `{ resolution, of(token), outcome(token) }`; a refused use throws), `h.useUntil(roll, use,
target)` (the use again, at most 20 times, until the target's outcome is that roll), `h.combat(caster, target)`,
`h.nextTurn()` (one turn on, seen to change), `h.casterTurn(caster)`, `h.effects(token)` (with their origins),
`h.effectsFrom(token, itemId)`, `h.hasStatus(token, status)`, `h.hp(token)`, `h.setHp(token, n)`, `h.expect(ok, label)`,
`h.log(...)`. It prints the stamp line exactly as a generated scenario does (`steps.mjs` `stampLine`) and **withholds** it
(`stamp withheld: <why>`) when an expectation failed, when another number of checks ran than the JSON declares, when a
turn change the play asked for never came, or when the JSON is not a hand-written scenario with a fingerprint. It cannot read
the registry where the runner runs: a stale `rule` is caught by `--check` before the run and by `played` after (a stamp for
another rule records nothing). `npm run played` records the play like any other (`handWritten: true` on an engineered rule in
state `gated` or `played`; a hand-written file for a rule that is not engineered, or a generated one for a rule that is,
records nothing).

An invented example (`tst`, an invented book; the key, ids and words are made up):

```js
// hand-written (Ruling R43)
import { handWritten } from "../lib/handwritten.mjs";
const json = (await import("./tst-spell-frost-glimmer.json", { with: { type: "json" } })).default;
// covers: one quux is kept out of the ward on a failed save, and the ward ends at the caster's next turn.
export default handWritten(json, async (h) => {
  const caster = await h.caster();
  const target = await h.target("mmBanditCaptain0");
  if (!target) return;
  const itemId = await h.give(caster, "Compendium.tst-pkg.spells.Item.Do11Do22Do33Do44", { spell: true });
  await h.combat(caster, target);
  const use = { caster, itemId, activityId: "Ea11Eb22Ec33Ed44", targets: [target] };
  if (!(await h.useUntil("failedSave", use, target))) return;   // fewer checks than declared: the stamp is withheld
  h.expect((await h.effectsFrom(target, itemId)).length === 1, "the ward's effect is on the target");
  await h.nextTurn();
  await h.nextTurn();
  h.expect((await h.effectsFrom(target, itemId)).length === 0, "the ward ends at the caster's next turn");
});
```

with `tst-spell-frost-glimmer.json` `{ "scenario": "tst/tst-spell-frost-glimmer", "key": "tst:spell:frost-glimmer", "rule":
"<64 hex>", "handWritten": true, "checks": 2, "covers": "one quux kept out on a failed save; the ward ends next turn" }`.

**Cost if wrong** (Ruling R43): the proof is one play of one situation, written by the same engineer who wrote the rule. It
shows the rule does what the engineer meant, not that the engineer read the book right: nothing independent reads the text
against the entry. That is why `docs/RULES.md` flags every engineered rule for the owner's eye.

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
the gates pass on it and it is uncontested (Ruling R27: reviewed, or stamped and agreed; status `validated`). Editing a
legacy record in place without that, in anything the module emits, is refused.

**The tests and the legacy rules.** The tests that check what the module ships do it in two halves. The 24 legacy rules
are pinned as they were: their registered identifiers (written out in `tests/registration.test.mjs`) and entries (its
snapshot), their saved states, their 10 `code` and `origin` values, their rule → record → rule round trip and their
properties, each test failing if a legacy rule changes. Every other rule is derived from registry/ at test time
(`tests/derived.mjs`, with `ruleFromRecord` and `sourcesOf`): the registered table and `sources` are exactly what the
registry emits, each emitted rule is the shipped one with the same properties, reads its record back and passes the
schema, and no rule shares a sense's identifier. Nothing of the pipeline's rules is written in a test; the one guard
against silent growth is docs/RULES.md (written by `npm run books`, checked by `-- --check`), whose rows per book and
status, less the legacy ones, must be what registry/ emits. A test also loads `scripts/main.mjs` and fails if a module of
`scripts/rules/books/` is not imported by the index or not in the table registered, or the index imports a missing one.

## 🚧 Not built yet

Only inventory, triage (rule-based, batch files, ingest), resolve, drafting (batches, brief, ingest), gates, review (batches,
brief, ingest, `review-accept`), scenarios and played evidence, and generation
exist. These stages of the design do not:

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
  what the engine accepts with `register(source, table, { sources })` (keys are 16-character document ids, or for a monster
  feature whose embedded id is shared `<actor id>.<item id>`, Ruling R35; values kebab-case identifiers). Only an official
  package's documents qualify. A DDB Importer item lives in a world, where the id is the world's
  own and not stable across worlds: it gets `identifierDiffers: true` on the item and no source; a monster feature is bound
  as below. Inventory owns the field: it is recomputed on every run and removed when nothing is bound.
- **Monster features (Ruling R3).** A ruled monster feature has an identifier scoped to its creature,
  `<book>-<creature>-<feature>` (`-2` for a repeated name; `identifiers.mjs` `monsterIdentifier`), never the bare feature
  name (the engine has generic entries under names such as `bite`). Inventory binds it by the id of its official embedded item
  (`sources: { <item id>: <identifier> }`, the part after `.`) when no actor of another creature of the book's package embeds
  that id and the record carries its scoped identifier (a bare name is never bound); for a shared id, the item gets
  `embeddedShared: true` and the source is the creature's whole `<actor id>.<item id>` (Ruling R35: `sources: { <actor
  id>.<item id>: <identifier> }`, never the bare id), which the gates hold `drafted` on an engine that refuses such keys. Two
  creatures' rules on one shared id are two bindings; two records that bind one key to different identifiers fail `unique`.
  A feature without a rule binds nothing. DDB Importer monster features are always uncovered (world ids, generic identifiers).
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
