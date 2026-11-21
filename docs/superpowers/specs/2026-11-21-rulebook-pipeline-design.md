# Rulebook pipeline — design

Date: 2026-11-21 · Status: approved 2026-11-21; milestone 1 implemented on feat/rulebook-pipeline · Scope: `das-rulepack`

## Intent

Cover every official rulebook outside the SRD with rules for DAS · Core, fast and mostly automatically, without trading away
correctness. Today the pack has 24 rules from 7 books, each added by hand in about ten steps, and nothing checks that a
rule points at a real item, a real activity or a real page. The catalogue counts 40 books and 7,247 entries; at the
current pace the work does not finish, and at a faster pace without checks it would fill the pack with rules nobody can
trust.

The pipeline makes one thing true: **a rule is in a release only with the evidence that says how far it was checked, and
that evidence is produced by a tool, not typed.**

## Goals

- One command takes a rulebook from "catalogue counts" to "every entry has a verdict".
- Adding a rule is one record in one place; everything else (book modules, test lists, README, `docs/RULES.md`,
  changelog fragment) is generated.
- Every rule carries book, page, the fingerprint of the text that was read, and the item sources it was checked against.
- A change in DAS · Core, in an official module or in the dataset reopens exactly the entries it touches.
- Subagents do the reading and drafting in bulk; no subagent output reaches a release without passing the gates.

## Non-goals

- Shipping rulebook text, or any premium data, in the repository or in a release. Unchanged from today.
- Writing rules for the SRD: that is DAS · Core's ground. Engine gaps found on the way are reported upstream as issues
  with no book named, as today.
- Replacing live play as the only proof that a rule works. The pipeline organises live play; it does not simulate it.
- Homebrew and third-party books.

## Anti-goals

- A rule that silently does nothing on the user's item (wrong identifier, activity id from another importer).
- A status that says more than what was done ("played" typed by hand, "validated" on a validator fed a list of facts
  that accepts everything).
- A generator whose mistake lands on hundreds of entries at once without a per-entry check.
- Coverage numbers that mix static reading and live play.

## Constraints

- Rule text is copyrighted: it stays in a local cache outside the repository; the repository stores fingerprints only.
- Official-module item dumps are premium data: local only. Gates that need them run on the maintainer's machine; CI runs
  the gates that do not.
- Subagents get local files only: never the test server, never credentials. Live play is driven by the main session.
- Constitution principle 16: no rule from memory. No retrievable text means verdict `unverifiable`, never a draft.
- 2014 and 2024 printings of the same name are different entries.
- DAS · Core contract (0.289.x): entries validated by `validateEntry` (322 keys, facts checked against the engine's
  list); an invalid entry is dropped with a console error; a `dataFixes` item whose `from` no longer matches is skipped
  with no message; identifiers resolve through `sources` (document id → identifier), `system.identifier`, then the name.

## Approaches considered

**A — Registry-driven pipeline, book by book (chosen).** A per-entry registry is the single source of truth; staged
tools and subagent batches move each entry forward; gates decide what may ship. Costs a few days of tooling before the
first new rule; after that the marginal cost of a rule is a record and a review.

**B — Text-layer generator.** Give spells and items what the engine has for monsters: derive the rule from the
description at runtime. Very fast on recurring patterns, but a recogniser error is invisible and wide, and it moves the
rule from a reviewed record to a heuristic. Kept as a *drafting aid* inside stage 3 of A: its output is a proposal that
goes through the same gates, never a shipped layer.

**C — Subagent batches on the pack as it is.** Starts today, no tooling. Rejected: the past sweeps left up to 40% of
monster entries "unverifiable" and needed a second pass; without a registry and gates the errors accumulate and the
ten manual steps stay.

Chosen: A, with B's pattern readers as an accelerator. Picked by the user on 2026-11-21.

## Design

### 1. The registry

`registry/<book>.json` in the repository, one file per book, one record per catalogue entry. It holds no rule text.

```jsonc
{
  "key": "xge:spell:earth-tremor",          // book : kind : slug — stable, unique
  "name": "Earth Tremor", "kind": "spell", "book": "XGE", "page": 155, "edition": "2014",
  "alsoIn": [],
  "text": { "sha256": "…", "source": "5etools@<dataset commit>", "chars": 412 },
  "items": [                                 // every origin of the item: official module (reference), DDB Importer, Plutonium
    { "origin": "ddb-importer", "match": "matched", "identifier": "earth-tremor", "docId": null,
      "activities": ["saveEarthTremorI"], "effects": [], "data": "<dump fingerprint>" }
  ],
  "verdict": "entry",                        // core | data | none | entry | code | engine | unverifiable
  "why": "one line, no quotation",
  "rule": {                                  // present when verdict is entry or code
    "handledIn": "table", "adds": "…", "entry": { "saveDamage": { "saveEarthTremorI": "none" } },
    "origins": ["ddb-importer"],             // which item origins the ids in `entry` belong to
    "assert": [ { "given": "failed save", "expect": "full damage and Prone" } ]
  },
  "evidence": {
    "drafted":   { "by": "agent", "at": "2026-11-21", "core": "0.289.0" },
    "gates":     { "at": "…", "core": "0.289.0", "passed": ["schema", "validator", "ids", "fixes"] },
    "reviewed":  { "by": "agent-2", "at": "…", "agrees": true },
    "played":    { "at": "…", "core": "0.289.0", "world": "das-test", "scenario": "xge/earth-tremor", "client": "gm" }
  },
  "state": "played"                          // derived, never written by hand — see §5
}
```

Verdicts: `core` (DAS · Core already has the entry — SRD content, nothing to write here), `data` (the item's own data
resolves it), `none` (nothing to automate in combat), `entry` (declarative rule),
`code` (needs a script), `engine` (needs a key the engine lacks — carries the upstream issue), `unverifiable` (no text).

The text cache lives outside the repository (`$RULEPACK_TEXT`, default a sibling private folder), addressed by the
fingerprint. Item dumps likewise (`$RULEPACK_DUMPS`).

### 2. Stages

```
1 inventory → 2 triage → 3 draft → 4 gates → 5 review → 6 play → 7 release
  script       rules +     sub-      script     second      scenarios    script
               subagents   agents               subagent    (main session)
```

1. **Inventory** (`tools/pipeline/inventory.mjs <book>`). Reads the 5etools dataset and the local dumps; writes one
   record per entry with page, edition, text fingerprint and, per origin, the identifier and the real activity and effect
   ids. Replaces the hand-copied counts in `docs/books.json`: counts become a by-product of the registry. Adds species
   traits, which the current audit does not count.
2. **Triage.** First deterministic rules on the item data and the engine's own pattern readers (the SRD run settled 190
   of 1,299 entries this way); what is left goes to subagents in batches of 30–60 entries of one kind, each given a
   structural summary of the item and the text, returning `{verdict, why, keys, similar, confidence}`. Low confidence and
   every `engine` verdict are queued for a human decision.
3. **Draft.** One subagent per batch of `entry` verdicts. Input: text, item data per origin, the engine's key reference,
   the two closest shipped entries (`similar`), any proposal from the pattern readers. Output: `rule` with `entry`,
   `adds`, `origins` and at least one `assert`. A draft that needs a key the engine lacks changes the verdict to `engine`
   instead of approximating.
4. **Gates** (`npm run gates`, also the pre-commit check). Deterministic, no model:
   - *schema* — the record is well formed; page present; edition set; no duplicate key or identifier clash between
     editions without a `sources` mapping.
   - *validator* — `validateEntry` from the DAS · Core clone, with the engine's real fact list (not a stand-in).
   - *ids* — every activity and effect id in the entry exists in the dump of each origin listed in `origins`; an origin
     with different ids needs its own variant or is reported as uncovered.
   - *fixes* — each `dataFixes` item either still matches `from` or is already applied, using the engine's exported
     pure functions; anything else is drift.
   - *text* — the fingerprint in the record matches the cache.
   - *generated* — book modules, test lists and docs are what the generator would write.
   CI runs schema, validator and generated; ids, fixes and text need local data and write their result into `evidence`.
5. **Review.** A second subagent receives the text and the item data, **not the draft**, and states what should happen
   in play as assertions. A script compares them with the draft's `assert` and with what the entry's keys do; any
   divergence goes to a review queue with both readings side by side. Agreement sets `evidence.reviewed`.
6. **Play.** For each reviewed rule the generator emits a scenario for the engine's scenario runner (external scenario
   folders are supported) from `assert`. The main session runs them on the test world, in batches, GM client first;
   a pass writes `evidence.played` with engine version, world and scenario. Rules sharing a building block with a played
   rule are scheduled after the first of their family, not skipped.
7. **Release** (`npm run build:rules`). Generates `scripts/rules/books/<code>.mjs` (marked generated), the identifier
   list and snapshot of the registration test, the README blocks, `docs/RULES.md`, and a changelog fragment listing what
   changed state. Only records whose gates passed on the current engine version are emitted.

### 3. What subagents do, and their limits

Bulk reading and drafting only: triage batches, draft batches, independent review, and (once per engine release) a
re-read of entries whose keys changed upstream. Each brief names the files, the output schema and the rule "no text, no
verdict". Their output is data for the gates; they do not edit the repository, run git, or reach the server. Drafter and
reviewer are always different agents with different inputs. Batch size and the per-batch acceptance rate are logged, so
a batch with an unusual rejection rate is redone rather than patched.

### 4. Keeping the books correct over time

- **Fingerprints** on text, item data and engine version. `npm run drift` recomputes them and reopens (state back to
  `drafted`) only the records whose inputs changed: a new official-module version, a dataset update, an engine release
  that changed a key the entry uses.
- **Origins are explicit.** A rule states which importers or modules its ids belong to; the README says per rule where
  it works. No more rules that are silent on another source.
- **Editions are separate entries**, mapped to distinct identifiers through `sources` when two printings share a name.
- **Sampling.** Each release, a random sample of `reviewed`-only rules is played; the measured failure rate is published
  next to the coverage numbers. If it exceeds an agreed threshold, the family the failures belong to is replayed in full.
- **Findings feed back.** A rule found wrong in play becomes a gate or a triage rule when the mistake is of a kind a
  tool can catch.

### 5. States

Derived from `evidence`, never typed:

| State | Meaning | Ships |
|---|---|---|
| `inventoried` | entry known, no verdict | — |
| `triaged` | verdict set | — |
| `drafted` | rule written | no |
| `gated` | all gates passed on the current engine | yes, shown as "validated" |
| `reviewed` | independent reading agrees | yes, shown as "reviewed" |
| `played` | scenario passed in a running world | yes, shown as "played" |

Progress bars keep the three shipped states apart, and keep `data` / `none` verdicts (nothing to write) apart from rules
written.

### 6. Migration

The 24 existing rules are imported into the registry first (their book modules become generated output, byte-compared
before the hand-written files are replaced). The 5 code rules keep their scripts; the registry records `handledIn:
"code"` and the script path. Their current `played` status is kept only where the changelog names the play session;
otherwise it drops to `gated` until replayed.

### 7. Order of work and pilot

Set by the user on 2026-11-21: **the official Foundry VTT compendia first** — *Player's Handbook*, *Dungeon Master's
Guide* and *Monster Manual* (all 2024), then the official expansions published as Foundry modules (Tasha's, Forge of the
Artificer, Heroes of Faerûn, Adventures in Faerûn, Ravenloft: The Horrors Within, and the others as they are dumped).
Books with no official module come after.

The official module is the **reference origin** of each entry: its document id, identifier, activity and effect ids
are read from the local dump, so the ids gate runs on real data from the first day. Dumps of all the books above are
already local.

Pilot: the 2024 *Player's Handbook*, one kind at a time (spells, then feats, class and subclass features, species,
equipment). The SRD part of each book is DAS · Core's: those entries get the verdict `core` and are not drafted; a Core
entry that contradicts the text is recorded as a finding and reported upstream, never patched over in the pack. The
pilot measures, per stage, how many entries pass, how many are queued for a human, and the time per entry.

### 7b. One rule, every origin — no duplicates

The same spell reaches a table from the official module, from DDB Importer or from Plutonium. It must be **one record
and one rule**, never three.

- **Identity** of an entry is `(normalised name, kind, edition)`, with the book as tie-breaker for reprints; `alsoIn`
  lists the other books that print it. A reprint in a later book joins the existing record instead of creating one.
- **Matching runs while a book is worked**, not afterwards: when inventory reads an entry from the official dump it looks
  the same identity up in the DDB Importer dump and in the Plutonium data, and attaches each hit to `items` as another
  origin with its own identifier and ids. Outcomes are explicit: `matched`, `absent` (that origin does not have it), or
  `ambiguous` (several candidates, or same name with different mechanics — 2014 against 2024) which goes to the human
  queue and is never auto-joined.
- **A match is checked on mechanics, not on the name alone**: level, school, activation, save ability, damage parts and
  the set of statuses of the two items are compared; a difference downgrades the match to `ambiguous`. Amended during
  milestone 1: only edition, level and school make a match ambiguous; structural differences (activities, saves, damage
  types, statuses) are recorded on the matched item as `differences`.
- **One identifier.** When origins disagree on the identifier, the record keeps one canonical identifier and binds the
  others through `sources`; the gate refuses two records that resolve to the same identifier, and two identifiers that
  resolve to the same item.
- **The existing 24 rules** (written on DDB Importer ids) are joined to their official-module record where one exists,
  which also settles the open point on Tasha's.
- **Plutonium** has no local dump yet. Whether its imported items keep stable activity and effect ids is not known and is
  checked first, on a dump taken from the test world by the main session; until then Plutonium is matched by identity
  only and a rule keyed by ids is listed as "not checked on Plutonium".

### 8. Clarifications after the builder's reading

- **Who runs what.** The tools never call a model. Deterministic stages (inventory, rule-based triage, gates, drift,
  release) are plain commands. For subagent stages the tools *cut* batch files (`pipeline batch <stage> <book>`) and
  *ingest* results (`pipeline ingest <file>`, schema-checked); a Claude Code session dispatches the subagents following a
  runbook in `docs/PIPELINE.md`. "One command" in the goals means one command per deterministic stage.
- **`assert` is structured.** `given` and `expect` use a closed vocabulary of things observable in play: outcome of the
  roll (hit, miss, failed save, successful save), damage fraction and type, condition applied or ended, when an effect
  ends, advantage or disadvantage and for whom, which creatures are affected or excluded, movement. The review script
  compares the reviewer's assertions with the drafter's on these terms only. It does not model what each of the 322 keys
  does: whether the entry produces the asserted outcome is what stage 6 proves. An assertion the vocabulary cannot
  express is free text and always goes to the human queue.
- **Origins and variants.** One entry per identifier. Where a key is a map by activity or effect id, the entry carries
  the ids of every origin side by side (they cannot collide). Where a key names a single id, the generator emits one
  element per origin (triggers) or, when that is not possible, a separate identifier bound through `sources` to the
  origin's document ids. The ids gate checks each origin on its own.
- **Inputs.** Dataset: the local 5etools clone (`$RULEPACK_DATASET`). Dumps: LevelDB dumps as JSON, produced by the
  existing dump tool of the audit workspace from compendium packs (`$RULEPACK_DUMPS`); official modules and the DDB
  Importer compendia already dumped there are the starting set. An entry with no dump in any origin gets verdict by text
  only and cannot pass the ids gate: it stays `drafted` and is listed as "no item data".
- **Migration never shrinks a release.** The 24 rules shipped today stay shipped. Those that cannot pass ids or text for
  lack of local data are marked `legacy` and shown as "validated (before the pipeline)" until their data exists.
- **Engine version.** Evidence is stamped with the engine version it was produced on and with a fingerprint of the rule
  itself, so a hand-edited rule invalidates its own evidence. A new engine release does not unship anything: CI reruns
  schema and validator against it; the local gates are rerun only for the records `drift` reopens. CI trusts committed
  evidence whose rule fingerprint matches.
- **Monsters** are in the registry, one record per stat-block feature (`<book>:monster:<creature>#<feature>`), with the
  verdicts of the existing per-feature measure as their starting triage. They are outside the pilot.

## Decided by the user

- Approach A, with B as a drafting aid (2026-11-21).
- Order: official Foundry compendia first (PHB, DMG, MM 2024, then the published official expansions); DDB Importer and
  Plutonium matched while each book is worked, so that no rule is duplicated (2026-11-21).

## My calls (correct me)

- The registry is committed in this repository (it carries no text); only the text cache and dumps stay private.
- Book modules become generated files; the registry is the only place a rule is edited.
- Existing `played` statuses without a recorded session drop to `gated`.
- Pilot: the 2024 Player's Handbook, kind by kind, spells first.
- A match between origins is confirmed on mechanics, not on the name; anything doubtful goes to you instead of being joined.

## Left to the builder

- Module layout under `tools/pipeline/`, the exact JSON schema file, and how batches are cut.
- How scenarios are generated from `assert` for each family of keys.
- The sampling threshold, proposed after the pilot's numbers.
