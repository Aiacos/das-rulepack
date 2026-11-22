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
| 2d | Ingest results | `npm run ingest -- <results-file> [--overwrite \| --second \| --third]`, or `npm run ingest -- --settle-unsure [--min <n>]` | `RULEPACK_TEXT`, `DAS_CORE` | the Claude Code session |
| 3a | Cut draft batches | `npm run batch -- draft <BOOK> --out <dir> --structure <private dir> [--size 20] [--kind <kind>]` | `DAS_CORE`, `RULEPACK_DUMPS`, `RULEPACK_TEXT` | a person |
| 3b | Draft a batch | (no command: a drafter agent reads files) | `RULEPACK_TEXT` | the Claude Code session, via drafter agents |
| 3c | Ingest drafts | `npm run ingest -- <results-file> --draft --batch <batch file>` (see "Ingesting drafts") | `RULEPACK_TEXT`, `DAS_CORE` (`RULEPACK_DUMPS` for monster features) | the Claude Code session |
| 4 | Gates | `npm run gates` (`-- --ci` in CI) | `DAS_CORE`, `RULEPACK_DUMPS`, `RULEPACK_TEXT` (`--ci`: `DAS_CORE`) | person, CI |
| 5a | Cut review batches | `npm run batch -- review <BOOK> --out <dir> --structure <private dir> [--size 30] [--kind <kind>]` | `DAS_CORE`, `RULEPACK_DUMPS` | a person |
| 5b | Review a batch | (no command: a reviewer agent reads files, blind to the draft) | `RULEPACK_TEXT` | the Claude Code session, via reviewer agents |
| 5c | Ingest reviews | `npm run ingest -- <results-file> --review --batch <batch file>` (see "Ingesting reviews") | `RULEPACK_TEXT`, `DAS_CORE` | the Claude Code session |
| 5d | Accept a queued review | `npm run pipeline -- review-accept <key> --because "<one line>" --by <owner>` | nothing | a person (an owner) |
| 6a | Scenarios | `npm run scenarios -- <BOOK> [--check \| --plan]` (see "Playing scenarios") | `RULEPACK_DUMPS` | a person |
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
rule, person?, because? }` (`person: true` with `because` from `schema.mjs` `DRAFTED_FOR_PERSON`, `noReactions` or
`official-uncovered`: the draft goes to a person at review; the schema requires the stamp on a drafted rule whose entry has
`noReactions` or that leaves `official` uncovered, and the gate evidence fingerprint `emits` covers it, so dropping it fails the
schema and makes the record `drafted`), `evidence.reviewed: { by, at, agrees, rule, confidence, because? }` (`because`: the
line of a person's `review-accept`), `evidence.played: { at, core, world, scenario, client?, rule, manual?, by?,
because? }` (`scenario` a scenario id `<book>/<slug>`, `core` an engine version, `world` a handle, `client` `gm` or `player`;
`manual`, `by` (an owner) and `because` together, for a checklist played by hand; no other field). `by` a reader handle,
`confidence` from 0 to 1 elsewhere. A review or a play counts only while its `rule` is the fingerprint of the current
rule, so editing the rule makes gates, review and play stale at once. A legacy record may keep a review or a play written before
the stamp existed (no `rule`): it counts as it did; one that carries a stamp is held to it.

## 🧾 Rule vocabulary

- **Assertions.** Every rule outside the legacy ones has `rule.assert`, a non-empty array of `{ given, expect }`
  (`tools/pipeline/assert.mjs`): what the rule says happens, so that a draft and a review can be compared and a scenario can
  check it. `given: { roll?: hit|miss|crit|failedSave|savedSave, moment?, origin?, targetType?, free? }`; `expect: { damage?:
  { fraction: 0|0.5|1|2, type? }, condition?: { applied?, ended? }, ends?, roll?: { mode: advantage|disadvantage, on:
  attack|save|check, for: self|target|ally|enemy }, affects?, excludes? (target|allies|enemies|self), move?: { mode,
  distance? }, uses?: { spent }, free? }`. Any other field is refused; `free` is one printable line of at most 120
  characters and never stands alone (every assertion has a closed `expect` field); `given.origin` is one of the rule's
  `origins`; `move.distance` is a non-negative number or a formula of at most 24 characters made of digits, spaces,
  `+ - * / ( ) .` and the references `@mod`, `@prof`, `@item.…`, `@abilities.…`, `@attributes.…`, `@details.…`, `@scale.…`,
  `@flags.…` (no other word). Every text of a rule (`adds` ≤ 200, `free` ≤ 120, `uncovered[].because` ≤ 200,
  `evidence.person.because` ≤ 120) is one line of printable ASCII (0x20–0x7E): no control, format or look-alike character.
  From this milestone on `rule.catalog` is a kebab/dot identifier of at most 64 characters, `rule.origin` a display label
  of where the rule comes from in the book (owner and level, "Fey Wanderer 3"; one line of printable ASCII, at most 60
  characters; Ruling R17), and `rule.code` the script of a `code` verdict, `scripts/<kebab>(/<kebab>)*.mjs`, at most 96
  characters, which the schema gate (also under `--ci`) requires to be a file of the repository (Ruling R18). The legacy
  rules are exempt; their values pass these formats anyway. The schema
  checks the shape; the validator gate checks `moment` (MOMENTS), `targetType` (CREATURE_TYPES), the statuses of `condition`
  (the conditions `core/monster-text.mjs` names), `ends` (EFFECT_ENDS or a moment), `move.mode` (MOVE_MODES) and
  `damage.type` (DAMAGE_TYPES) against the clone (`loadCore`). `normaliseAssert` gives the sorted canonical forms of a list
  (`path=value` pairs; a free text is `*`, it never counts as agreement); `impliedAsserts(entry)` what an entry says by itself:
  `saveDamage` (a saved save: half or no damage), `halfOnMiss`, `noDamage`, and a `triggers` declaration on `failedSave` with a
  `status` or `move` step (Rulings R15, R16: `noReactions` implies nothing, so such a rule always goes to a person at review).
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
  **It is a gate**: the schema gate (which runs under `--ci`) applies it to every non-legacy rule, unless a person signed
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
  `{ key, reason, by, why, confidence, draft?, review? }`, sorted by key (`registry.mjs` `loadQueue`, `saveQueue`,
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

## 📖 Brief for a drafter agent

`batch draft <BOOK> --out <dir> --structure <private dir>` cuts the records with verdict `entry` and no `rule`: 20 entries per
batch (`--size`), one kind per batch, kinds in the order spell, feat, option, species, background, item, feature, monster,
records with a matched official item first. A record is left out (and counted on the console, by reason) when it is already
ruled, queued in `registry/drafts-queue.json`, has no text, has no matched item, is a monster feature that can never pass the
gates (no creature to scope it to; "no official item"; "official item has no embedded id"; "shared embedded id, waits on
upstream"), or is one the `unique` gate would fail whatever is drafted: "identifier is DAS · Core's: a person decides inCore",
"identifier shared with another record" (another record of the same edition that has a rule or the verdict `entry` registers it,
a monster feature counted under its creature-scoped identifier) and "identifier ruled for another edition: needs an
edition-scoped identifier" (Ruling R22: a twin of another edition alone is no clash until it has a rule; `batch.mjs`
`identifierClashReasons`, built on the gate's own `gates.mjs` `identifierClashes` and `identifierTwins`). The shared embedded id
is decided by `batch draft` itself, as inventory decides it when it binds a rule (`settle.mjs` `embeddedIndex`,
`sharedEmbeddedId`): a feature is cut only when its official embedded item id is unique among the actors of the book's package,
which `batch draft` reads from `RULEPACK_DUMPS` (always needed, as `--structure` is mandatory; the usage error says so). The
record's own `embeddedShared` flag is no help: it is written only once a rule is bound. It writes
`<dir>/<book>-draft-<NNN>.json` (numbering continues after the highest in `<dir>`), `<private
dir>/<book>-draft-<NNN>.structure.json` (the same file as for triage: premium-derived, private) and
`<dir>/draft-vocabulary.json` (engine words only, and for every allowed data-fix path its type as a declarative description,
`fixes.types`, generated from the table that also checks it: safe to commit). A batch is `{ id, stage: "draft", allowed,
vocabulary, entries }`; `allowed` is `DRAFT_KEYS` with the slot each key's ids sit in. An entry is the triage entry plus
`identifier` (a monster feature's is scoped to its creature: `<book>-<creature>-<feature>`), `keys` and `similar` (the triage
reader's hints), `why` and `examples` (at most three `{ identifier, entry }`, drafter keys only, stripped to ids, engine words,
formulas and numbers: no `adds`, `free` or label: first the triage `similar`, then the shipped rules that share `keys`, then the
canonical example of each key the shipped rules of the record's kind use most, so an entry has examples even when triage left
`keys` and `similar` empty). The triage `why` is kept only when it passes the quotation check of a rule's strings (8 consecutive
words of the text, `gates.mjs` `quotationCheck`); otherwise the entry is cut without `why` and counted ("why withheld: quotes
the source"). It needs the text, hence `RULEPACK_TEXT` at cut time (without the text of an entry its `why` is withheld). The
text is never in the batch: it is in the private cache, named by `textSha`. `batch draft` also writes
`<dir>/<book>-draft-report.json`: the batches, the entries cut, each reason a record was left out with its count, and the `why`
withheld (counts only). It refuses, writing nothing, a book whose package has no dump files, or that has monster records to cut
and no actor in its dumps. The numbering continues after the highest `<book>-draft-<NNN>` among the batch files and the
`<book>-draft-<NNN>.results.json` files of `<dir>`.

`draft-vocabulary.json` also holds `draftShapes` (the value shape of every drafter key), `assert.shapes` (the value shape of
every `given` and `expect` field), `fixes.types` (the type of every data-fix path) and `keyExamples` (the canonical example of
each key: the shortest shipped entry that uses it). Shapes are declarative: `enum` (one of `values`), `object` (`keys`
required, `optional`, closed), `list` (non-empty), `idMap` (an object keyed by ids of the named kind, origins side by side),
`idList`, `id`, `oneOf` (any alternative), `tagged` (an object whose `type` picks its other fields), `true`, `number`,
`formula`, `line`, `distance`. Tests build a value from every alternative of every shape and have the validators (`assertProblems`,
the engine's `validateEntry`) accept it.

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
> `fixes.types` for `dataFixes`, `keyExamples.<key>` for a worked example of a key. The entry's `examples` are rules of the
> same kind. Write only what a shape allows.
>
> **How you work.** For each entry read the text by `textSha`, then the structure of each matched origin. Take every id (an
> activity or an effect) from the structure file or the batch entry's `items`, never from memory. Write `rule.entry` with the
> keys of `allowed` only, and an `assert` list that says in the closed vocabulary what happens (`given`/`expect` of
> `draft-vocabulary.json`; `free` never counts as agreement). The `examples` show the shape; they are not this entry's rule.
>
> **Origins side by side.** Keys whose slot is `activityMap` or `effectMap` hold the ids of several origins in one object:
> list every origin whose item has the ids. A `single` slot (`triggers`, `rollBonus`, `atTurnStart`, `onHit`, `dataFixes`)
> holds one id: name one origin only and put the others in `uncovered` with a one-line reason. Every matched origin
> (`plutonium` `unchecked` excepted) is either in `origins` or in `uncovered: [{ origin, because }]`. `origins` lists each
> origin once. Leaving `official` uncovered (naming only `ddb-importer`) is allowed when the official item has nothing to
> bind; such a rule is read by a person at review.
>
> **`dataFixes`** only on the typed leaves of `fixes.paths`, official origin only, with a real `from` guard (the value the
> item has today, taken from the structure) and a `value` of the leaf's type; never on a monster feature; never `create`.
>
> **What goes to a person.** Anything the allowlist cannot express is `outcome: "person"` with a one-line `why`: never force
> it into an allowed key. `noReactions` is always for a person at review (Ruling R15): write it if it is the right key, and
> say in `why` that it needs the person. A rule that needs state across turns, a prompt to a player or a fact the engine lacks
> is `code`; one that needs an engine key that does not exist is `engine`, with what is missing in `why`.
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
> `outcome` is `rule`, `person`, `code` or `engine`; only `rule` carries a `rule`. One result per entry, `key` unchanged;
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
`items` without their data: the matched origins with their activity and effect ids) plus `rule`, the fingerprint of the
rule under review. **Nothing of the draft goes in**: no entry, no assertion, no `adds`, no `origins` or `uncovered`, no
drafter handle, no triage `keys`, `similar` or `why`.
`<dir>/review-vocabulary.json` holds the assertion vocabulary (`assert` of `draft-vocabulary.json`), the engine words it names
and the limits of the strings; `<private dir>/<id>.structure.json` the item structures, as for triage (never commit it).
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
> **How you work.** For each entry read the text by `textSha`, then the structure of each matched origin. Say what must be
> true at the table when the item is used, as assertions in the closed vocabulary: `[{ given, expect }]` with the fields of
> `assert.shapes` (`given`: `roll`, `moment`, `origin`, `targetType`; `expect`: `damage` with its `fraction`, `condition`
> applied or ended, `ends`, `roll` with advantage or disadvantage, `affects`, `excludes`, `move`, `uses`). State every
> consequence the text gives that the vocabulary can say, each once: a saved save that halves the damage, a failed save that
> leaves a condition, a miss that halves, an effect that ends at a moment. Leave out what the vocabulary cannot say; never
> force it. `free` (one line, at most 120 characters, your own words) never counts as agreement: an assertion that carries one
> goes to a person.
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
and entries that are all keys of that book. Monster features need `RULEPACK_DUMPS` (the actors of the book's package
tell whether another creature shares the feature's embedded item id). For each result:

- **Rejected** (listed in `rejected` as `{ key, reason }`; nothing of it is kept, the record stays as it was and is cut again
  by the next `batch draft`): a field other than `key`, `outcome`, `why`, `confidence`, `rule`, or in `rule` other than
  `handledIn`, `adds`, `entry`, `origins`, `uncovered`, `assert` (so `evidence`, `verdict`, `identifier`, `sources`, `alsoAs`,
  `inCore`, `code`, `origin` are refused: the tools derive them, and no ingest ever writes `evidence.person`); a key twice in
  the file; a key that is no record; a key that is not an entry of the batch file ("not offered by this batch"); a record
  waiting in `drafts-queue.json`, a legacy record, a record that already has a
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
  check of every string of the rule. Up to four of the problems are named. The `fixes` gate is not run here: `gates` runs it.
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
  result for it is rejected: a person settles it.
- **Applied** otherwise: `rule` is written as the drafter wrote it plus what the tools derive: `alsoAs` from `aliasFor`
  (Ruling R2: the identifier of a matched item that differs from the record's), `origin` (Ruling R17: the last part of the
  owner and, for a feature, the level), and for a monster feature its identifier `monsterIdentifier` (`<book>-<creature>-
  <feature>`) with its embedded item id bound in `sources`; `evidence.drafted = { by, at, core, rule }` (`rule` the rule's
  fingerprint), plus `person: true, because: "noReactions"` when the entry uses `noReactions` (Ruling R15: the review sends
  every record with that stamp to `review-queue.json`, whatever the reviewer says), or `because: "official-uncovered"` when the
  rule lists `official` under `uncovered` (Ruling R21: allowed, since some official items carry nothing to bind, and read by
  a person at review). Nothing else of the evidence changes. The
  state is `drafted`; `npm run gates` (local, with dumps and text) takes it to `gated` or prints why not.

It prints `{ applied, queued, rejected }` and exits with 1 when anything was rejected. The touched books and the queue are
written in one step (every file is checked first, then written under a temporary name and renamed over the old one,
`registry.mjs` `writeFilesAtomically`), as every `ingest` now does: an invalid book or queue, or a failing write, leaves
every file as it was.

### Ingesting reviews

`npm run ingest -- <results-file> --review --batch <batch file>` takes what a reviewer wrote (`tools/pipeline/review.mjs`
`ingestReviews`). `--batch` is required; `--review` with `--overwrite`, `--second`, `--third`, `--settle-unsure` or `--draft`
is a usage error. The whole file is refused (exit 2, nothing written) when it is not `{ batch, by, results }`, has another
top-level field, `by` is not a handle, it holds a key named `__proto__`, `constructor` or `prototype`, a queue file of the
registry is invalid, its `batch` is not a review batch id `<book>-review-<NNN>`, or the batch file does not have that id, stage
`review`, and entries that are all keys of that book with a 64-hex `rule`.

**Agreement** (Ruling R9, `review.mjs` `compareAsserts`, data only). The draft says `normaliseAssert(rule.assert)` plus
`impliedAsserts(rule.entry)`; the review says `normaliseAssert(assert)`. They agree when the two sets are equal and neither side
holds a `free` text. Tolerated: order, duplicates, an implied assertion the draft did not write in `assert` (its entry says
it) and the review states. Not tolerated: any assertion on one side only, so a review that misses an expectation (an implied
one included), returns fewer than the rule asserts or more, or gives another moment, roll, target, condition, fraction, ending
or move, disagrees. The comparison is kept as canonical assertion strings: `onlyDraft` (what the review misses) and
`onlyReview` (what it adds).

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
  any string the reviewer wrote.
- **Queued** in `registry/review-queue.json` (`{ key, reason, by, why, confidence, draft: { by?, person?, rule, assert,
  implied }, review: { rule, assert, agrees, onlyDraft, onlyReview } }`, merged by key, sorted; nothing is written on the
  record; `loadQueue` and `gates`, `--ci` included, hold `draft` and `review` to that shape: closed keys, valid assertions
  with the engine's words, canonical assertion strings that read back as such, so a hand-edited entry with prose fails): a
  record whose draft is stamped for a person (`evidence.drafted.person`, reason `noReactions` or `official-uncovered`, Rulings
  R15, R21), **whatever the review says, agreement included** (`review.agrees` then says so); otherwise `disagreement`,
  `free-text` (the sets are equal but a side holds a free text) or `low-confidence` (agreement below 0.7).
- **Agreed** otherwise: `evidence.reviewed = { by, at, agrees: true, rule, confidence }`, `rule` the rule's fingerprint; the
  state is `reviewed`. A review never changes the rule.

It prints `{ agreed, queued, reasons, rejected }` and exits with 1 when anything was rejected. The touched books and the queue
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

For every record of the book in state `reviewed` or `played`, `tools/pipeline/scenarios.mjs` `scenarioOf` writes
`play/<book>/<slug of the key>.json` and, unless it is manual, `play/<book>/<slug>.mjs`, two lines that hand the JSON to
`play/lib/steps.mjs` `scenario`. A scenario is `{ scenario, key, rule, origin, client: "gm", manual, manualBecause, setup,
steps }`:

- `scenario` is `<book>/<slug(key)>`, the name the runner prints; `rule` the rule fingerprint the file was made for.
- `setup`: the scene (`Arène des sorts`), its caster token (`Lanceur`) and the token the target is placed near (`Cible`); the
  item (`origin`: official when the rule names it, else the first origin; `docId`; its compendium `uuid`, found in the dumps:
  the item pack holding the docId, the book's own package first; the `kind`); the target, an SRD 2024 creature of the
  creature type the assertions name (`scenarios.mjs` `TARGETS`, ids the Monster Manual 2025 and dnd5e's `actors24` share),
  a Bandit Captain when they name none.
- `steps`: per assertion of `rule.assert` plus those its entry implies (`impliedAsserts`), deduplicated: `{ use: <activity
  id> }` (the first id of the entry that is an activity of the item, else its only activity), `{ force: <roll> }` when it
  has a roll, `{ advance: <moment> }` when it has a moment, `{ check: <canonical assertion> }`.
- `manual: true` when a step has no interpreter, with the paths that have none in `manualBecause` (`given.free`,
  `force.crit`, `advance`, `expect.condition.ended`, `setup.item`…). The interpreter covers what the runner can do without
  guessing: the outcomes `hit`, `miss`, `failedSave`, `savedSave`; a fraction of the rolled damage (no damage type); a
  condition applied; one creature type; the setup item's own origin. The runner cannot force a d20: a step `{ force }` uses
  the activity again (up to 12 times) until that outcome comes, and fails its check if it never does. A manual scenario's
  JSON is a checklist for a person.

Generated files hold ids, engine words, numbers, the record key and fingerprints: never `adds`, a `free` text (its canonical
form is `*`), the record's name or any text of the book. `--check` compares the files with what would be written (exit 1 on a
stale, missing or orphan file); files of `play/<book>/` that no reviewed record makes are removed by a write. `--plan` prints
the run order (Ruling R11): a rule's **family** is its sorted top-level entry keys, `triggers` with its declarations'
`on > step types` (`saveDamage+triggers(failedSave>status)`); the first rule (by key) of each family comes first, then the
others, all of them scheduled. Two records whose keys make one scenario id stop the command. `--check` and `--plan` are
exclusive.

### Playing one scenario on the server (main session)

On the machine that runs the MCP connector for the test world, with the world open in the GM's client (connector setting
"Outils de test" on, the engine reloaded after any change), after a world backup:

```sh
cd "$DAS_CORE"
MCP_URL=<the connector's URL, default http://localhost:31416/mcp> \
  node tools/scenario.mjs <this repository>/play/<book>/<slug>.mjs 2>&1 | tee <private log>
```

A folder (`<this repository>/play/<book>`) plays every scenario of the book, in file order; `--plan` says which to run first.
The runner plays it in the scene named `Arène des sorts` (absent: "non applicable", nothing recorded), places the target, lends
the item to `Lanceur` (a spell as at will), uses the activity, checks, puts everything back, and prints a verdict. Then:

```sh
npm run played -- <private log> --world <world name>   # --client player for a player's client
```

and commit the registry. The log stays private (it is not rulebook text, but it is no repository file either).

### The stamp line and `npm run played`

`play/lib/steps.mjs` prints, last of its own lines in the scenario's block, exactly one stamp line (Ruling R10):

```text
das-rulepack: <book>/<slug> core=<engine version> rule=<64-hex rule fingerprint> checks=<checks played>
```

`core` is the engine's version as the GM's client reports it (`testApi.status`). `npm run played -- <runner-log> --world
<name> [--client gm|player]` (`tools/pipeline/played.mjs`) cuts the log into the runner's blocks (`▶ <name>` … its verdict) and,
for each block named like a scenario id (the engine's own scenarios in the same log are ignored), writes
`evidence.played = { at, core, world, scenario, client, rule }` only when every block of that scenario in the log passed
(`✓ scénario tenu (<n> vérifications)`, no `✗` line) with `n` equal to the stamp's `checks` and at least 1; its stamp is that
whole line, nothing before or after it on the line, one per block, naming the block's scenario; its `rule` is the record's
rule fingerprint today and the one `play/<book>/<slug>.json` was made for; the record is `reviewed` (or `played`: played
again) and its scenario is not manual. Anything else writes nothing for that scenario and is listed in `skipped` with its
reason (a stamp for an older rule, another record's rule or scenario, a failed or interrupted scenario, 0 checks, a
malformed stamp, no scenario file); the command prints `{ played, skipped }`, exits 1 when something was skipped, and writes
the touched books in one step. `--world` is a handle (letters, digits, `. _ -`); a log and `--manual` are exclusive.

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
