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
| 1 | Inventory | `npm run inventory -- <BOOK> spell` | `RULEPACK_DATASET`, `RULEPACK_DUMPS`, `RULEPACK_TEXT` | a person |
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
     overwritten): an identifier that DAS · Core already has is `core` ("DAS · Core has an entry"); an entry whose text
     is not in the cache is `unverifiable`; anything else, SRD or not, is left for a reader (SRD content that Core lacks
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
   of the `DAS_CORE` clone), and every origin the rule names must have it as an activity or effect of its matched item. A
   code rule without an entry has nothing to check there (`ids: nothing to check (code rule without entry)`, noted).
7. **Generate** writes the book modules under `scripts/rules/` from the registry.

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
list of them: an object `{ "<record key>": "<SHA-256 fingerprint of its rule at migration>" }`.

A record has **legacy standing** only when it says `legacy: true`, its key is in `legacy.json` and the fingerprint of its
current `rule` is the one stored there. With standing, the gates note what cannot be checked without item data or text
(`ids`, `fixes`, `text` land in `evidence.gates.noted`, not in `passed`) instead of failing, and `build:rules` emits the
rule with its old status. That is why the 24 show the state `drafted` (the gates have not all *passed*) and still ship.
Without standing (a key not listed, or a rule edited since migration) the gates fail (`legacy: <key> rule changed since
migration`) and `build:rules` refuses to write anything, naming the record. A hand-typed `evidence.played` does not
change the status of a legacy rule: only a complete play record (`scenario`, `core`, `world`, `at`) does.

A rule leaves legacy by being redone through the pipeline: inventory gives it text and item data, a person drafts or
edits its `rule`, removes `legacy` and `legacyStatus` and its key from `legacy.json`, and from then on it ships only once
the gates pass on it (`gated`, status `validated`). Editing a legacy rule in place without that is refused.

## 🚧 Not built yet

Only inventory, triage (rule-based, batch files, ingest), gates and generation exist. These stages of the design do not:

- **Draft**: writing `rule` for the `entry` and `code` verdicts.
- **Review**: the independent second reading and its comparison with the draft.
- **Play**: scenario generation and runs on a test world.
- **Drift**: recomputing fingerprints and reopening the records whose inputs changed.

Inventory, and so triage, supports the `spell` kind only.
