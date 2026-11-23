# Rulebook pipeline — milestone 3 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `entry` verdicts into rules safely and at volume: drafted by agents, gated by tools, reviewed blind by another
agent, given a scenario a person (or the GM-side runner) can play, with every state written by a tool from evidence.

**Architecture:** Three new subagent stages reuse milestone 2's pattern (cut a batch file → an agent writes a results file → a
schema-checked `ingest`): `batch draft` / `ingest --draft` (state `drafted`, then `gates` → `gated`), `batch review` /
`ingest --review` (state `reviewed`), and two deterministic commands, `scenarios` (rule → play data) and `played` (runner log →
`evidence.played`). Before the first draft, three tooling pre-issues are closed: monster attack text, a second identifier for
origins that name an item differently, creature-scoped identifiers for monster features. A `--stale` triage cut re-reads verdicts
whose item data changed after the reading.

**Tech Stack:** Node ≥ 20 ES modules, Vitest 3, no new dependency. Environment variables as in milestones 1–2 (`DAS_CORE` is the
engine clone, read only).

**Spec:** `docs/superpowers/specs/2026-11-21-rulebook-pipeline-design.md` §1 (record), §2 stages 3–6, §3, §5, §7, §7b, §8
(`assert`, origins and variants, engine version). Runbook: `docs/PIPELINE.md`. Engine contract: `module/scripts/core/content.mjs`
(`validateEntry`, `validateSources`, `ENTRY_KEYS`), `content/index.mjs` (`registerTable` merges a pack table over the shipped
content entry by entry), `adapter/content.mjs` (`identifierOf`: sources, then `system.identifier`, then the name).

## Global Constraints

- Everything in milestones 1–2 still binds: no rulebook text or premium data in the repository, synthetic fixtures only, closed
  vocabularies, lines ≤ 132 columns, `npm test` green after every task, the 24 shipped rules register the same entries, nothing
  under `tools/` calls a model, a network service or a Foundry server.
- Drafter and reviewer agents get local files only (batch file, private structure file, text cache). Never the server, never
  credentials. **Play is run by the main session only**, on the test server named in the workspace rules.
- A results file never sets `verdict`, `identifier`, `sources`, `alsoAs`, `inCore`, `code` or any `evidence`: the tools derive
  them. A person changes a verdict with `ingest --overwrite` (milestone 2), never through a draft.
- No prose in a rule beyond `adds` (one line, ≤ 200 characters) and `assert[].free` (≤ 120): both pass `quotes()` against the
  cached text (fewer than 12 consecutive words). Every other string in `rule.entry` must be an id, an engine vocabulary word, a
  kebab identifier or a short formula (`structure.mjs` `PLAIN`), or the result is rejected.
- Evidence is stamped with the rule fingerprint (`ruleFingerprint`) wherever it is about the rule: `gates` (already), `drafted`,
  `reviewed`, `played`. Editing a rule makes all three stale; `stateOf` derives the state from evidence alone.
- Book order for real runs: XPHB, XDMG, XMM, then EFA, FRHOF, FRAIF (RHW is not in the dataset). Older books are not drafted in
  this milestone.

## Review Focus

1. A DDB Importer item whose identifier is empty, generic (`new-item`, `spellcasting`, `longsword`) or a DAS · Core identifier:
   never registered as an alias (it would patch Core's entry, or every item of that name); the origin is `uncovered`.
2. Two creatures of one book whose official features share one embedded item id (`mmBite…` style): no source is bound; the rule
   stays `drafted` with the reason named; nothing registers under the bare feature name.
3. A rule carrying the activity ids of two origins side by side passes the ids gate; an id that belongs to no origin, or an origin
   listed in `origins` that contributes no id, fails it.
4. A reviewer result for a record whose rule changed after the draft is rejected (stale fingerprint); a played log line whose rule
   fingerprint is not the current one writes nothing.
5. After the `plainText` fix, `inventory <BOOK> all` on XMM changes text fingerprints but sets `textChangedAt` only where the
   words changed, not where only the attack header was restored.

## Rulings (design calls where the spec is silent; cost if wrong)

- **R1 — Renderer-only text changes are silent.** `plainTextV1` (today's renderer) is kept; when the new text differs but the old
  fingerprint equals `sha(plainTextV1(raw))`, inventory refingerprints without `textChangedAt` and keeps gate evidence. Wrong if
  a header changes meaning for a reader: those verdicts would not be re-read (mitigated: the reader judged the same words). Tags whose old rendering was empty (e.g. swapping `{@h}` for `{@m}`) are invisible to the old-renderer comparison, so such a dataset edit made between the two renderings would be refingerprinted without a date, once.
- **R2 — Second identifier = alias.** `rule.alsoAs: [{ identifier, origin }]`, filled by `ingest --draft` from the matched item's
  `identifier` when `identifierDiffers` and no source can bind it; `generate` emits the same entry under each alias. Wrong if an
  alias is shared by an unrelated item of that origin: the rule fires on it (Review Focus 1 refuses the known generic names; the
  `unique` gate refuses aliases equal to any Core identifier or to another rule's identifier or alias).
- **R3 — Monster identifiers.** A ruled monster feature gets `identifier = <book>-<slug(creature)>-<slug(feature)>`, bound by
  inventory through `sources` to the embedded item id of its official item when that id is unique among the package's actors.
  A shared embedded id needs an `<actor id>.<item id>` source, which the engine reads (`identifierOf`, §334); external
  registration refused it when this ruling was written (`validateSources` accepted 16-character ids only), and now accepts
  it: Ruling R35 binds such features. DDB Importer monster features are always `uncovered` (world ids, generic identifiers):
  `batch draft` and `batch review` offer that item as `{ origin, match, uncovered: "always" }` with no ids and no structure,
  and `ingest --draft` adds its `uncovered` line (`DDB_MONSTER_UNCOVERED`) when a drafter leaves it out (pilot 2: 8 of 12
  monster rules named it and were rejected).
  Wrong if the engine changes its source lookup: those rules silently stop applying (play would show it).
- **R4 — Ids gate on side-by-side ids.** Every id of the entry must belong to the matched item of at least one listed origin, and
  each listed origin must contribute at least one id when the entry has any. Keys whose slot holds one id (`DRAFT_KEYS` slot
  `single`) may name one origin only; the others go in `rule.uncovered`. Wrong: an origin could be half covered (one of two
  activities); review and play are what catch it.
- **R5 — Every matched origin is accounted for.** `origins ∪ uncovered[].origin` must equal the record's matched origins
  (`plutonium` `unchecked` excluded). `uncovered: [{ origin, because }]` is shown per rule in `docs/RULES.md`. Wrong only in
  noise: more "not covered on X" lines.
- **R6 — The drafter's key allowlist** (`DRAFT_KEYS`, below) is narrower than the engine's `ENTRY_KEYS`. A text that needs another
  key is drafted as `outcome: "person"`, never approximated. Wrong: slower volume; widened per family after the pilot.
- **R7 — Separate queues.** `registry/drafts-queue.json` and `registry/review-queue.json`, beside `queue.json`; all three are not
  books (`NOT_BOOKS` in `generate.mjs` and `cli.mjs`). Wrong only if a person wants one list: `npm run queues` prints all three.
- **R8 — Draft batch size 20**, review batch size 30, one kind per batch, records with a matched official item first.
- **R9 — Review compares assertions, not keys.** Agreement = the reviewer's normalised `assert` set equals the drafter's on the
  closed vocabulary, plus `impliedAsserts(entry)` for the families that have one; any `free` assertion, any difference, or a
  confidence below 0.7 goes to the review queue. Wrong: agreements on a shared misreading slip through to play.
- **R10 — Played evidence comes from the runner's log.** A generated scenario logs one stamp line
  `das-rulepack: <scenario> core=<version> rule=<sha> checks=<n>`; `played` parses the log, needs `✓ scénario tenu` for that
  scenario, `checks ≥ 1`, and the rule fingerprint of today. Wrong: a forged log is possible (it is a local file); the anti-goal
  (a state typed by hand) is met, not tamper-proofing.
- **R11 — Families.** A rule's family is its sorted top-level entry keys plus, for `triggers`, the `on → step types`; `scenarios
  --plan` lists the first rule of each family before the others (spec §2.6: scheduled after, never skipped).
- **R12 — Pilot gate.** Volume starts only if the ~40-rule pilot has ≥ 70% of drafts gated at first ingest and ≤ 30% review
  disagreement; otherwise the brief or `DRAFT_KEYS` is revised and the pilot batch redone. Wrong: thresholds are guesses until
  the pilot's numbers exist; they are published with them.
- **R13 — Kind order:** spell, feat, option, species, background, item, feature, monster — single-item kinds with activity-id maps
  first, features (class advancement, many same-name items) next, monsters last (R3). The pilot is XPHB's non-feature,
  non-monster `entry` records (23) plus its first 17 features with a matched official item, by level.
- **R14 — Stale re-read.** From this milestone `ingest` stamps `evidence.triaged.items` (origin → `data.sha256` read). For verdicts
  given before, `stamp-triaged` backfills it from a registry file of the reading's date, which a person exports from git.
  Wrong: a backfill from the wrong commit marks fresh readings stale (cost: extra reads, never a wrong verdict).

- **R15 — `noReactions` implies no assertion.** The assertion vocabulary has no word for a lost reaction, so a reviewer
  cannot check it mechanically: a rule using `noReactions` always goes to a person at review. Wrong: those rules are slower
  (a person reads each); a word for it can be added to `expect` once the pilot shows how many there are.
- **R16 — `noDamage` implies "no damage dealt by this activity"** (`{ given: {}, expect: { damage: { fraction: 0 } } }`).
  Damage that comes later from a trigger (Ensnaring Strike style) is a separate assertion of its own. Wrong: a reviewer who
  reads "the spell deals damage" as one assertion disagrees with the draft and the record goes to a person.

- **R17 — `rule.origin` is a display label** of where the rule comes from in the book (owner and level: "Fey Wanderer 3"),
  not a source origin. For a non-legacy rule: one line of printable ASCII, at most 60 characters, and part of the prose the
  quotation check covers (alone and with the rest). Wrong: a label could carry a few words of the book (8 consecutive words
  are caught; shorter fragments are not), and readers of `docs/RULES.md` see whatever label was written.
- **R18 — `rule.code` names the script of a `code` verdict**: a repository-relative path `scripts/<kebab>(/<kebab>)*.mjs`
  of at most 96 characters, and the schema gate (also under `--ci`) fails when the file is not in the repository. Wrong:
  the gate checks that a file exists, not that it implements the rule (review and play do); a script moved without its
  rules being updated fails every gate run until they are.

- **R19 — The drafter limits target accidental prose and verbatim quotation by an agent.** Every string of a rule (its free
  texts and every key and value of its entry, identifiers read as words: dots, camelCase and digits split) is checked for 8
  consecutive words of the source text, alone and together; free identifiers are short (a dotted path has at most 6
  segments of at most 24 characters, a formula at most 24 characters) and an entry may hold at most 60 distinct words of 3
  letters or more outside its ids and the pack's closed vocabularies. A deliberately encoded paraphrase inside identifiers
  is bounded (≤ 60 words per rule) but not eliminated: the independent review (Task 6) and the owner's reading of the
  registry diff are the remaining controls. Wrong: up to 60 words of paraphrase per rule could reach the registry unseen
  by the tools.
- **R20 — `docs/owners.json` is protected by code review only** (a single-owner repository: CODEOWNERS adds nothing), and
  `evidence.person` is a visible, reviewable claim, not a cryptographic signature. Wrong: anyone who can commit can add an
  owner or sign as one; the commit that does it is in the history, which is the control.
- **R21 — The official origin may be uncovered.** A rule may list `official` under `rule.uncovered` and name only
  `ddb-importer` (some official items carry no activity or effect to bind the entry to). Such a draft is stamped for a person
  at review exactly like `noReactions` (`evidence.drafted.person: true`, `because: "official-uncovered"`; `DRAFTED_FOR_PERSON`
  in `schema.mjs`, required by the schema, covered by `emits`). Wrong if the official item does carry what the rule needs: the
  rule then misses the official module's item, which the person at review is there to catch (cost: one person's reading per
  such rule; if they are many, the brief needs a sharper "why uncovered" rule).
- **R22 — An identifier is shared per edition.** As the rule-based `core` triage counts identifiers per edition, two records
  clash on an identifier (or alias) only within one edition: a 2024 record whose only twins are of another edition is cut by
  `batch draft`, applied by `ingest --draft` and accepted by the `unique` gate as long as no twin of another edition has a
  rule under it. Once one has, a twin of another edition that gets a rule later fails `unique` ("needs an edition-scoped
  identifier bound through sources", a later task), is left out by `batch draft` and queued by `ingest --draft`
  ("identifier ruled for another edition"). One function decides it (`gates.mjs` `identifierTwins`). Wrong if the older
  printing differs: the engine finds an entry by identifier whatever the edition, so the 2024 rule also applies to an item of
  the older printing that carries the same identifier (as the engine's own entries already do); until that record gets its
  own scoped rule, the 2024 rule stands in for it.

- **R23 — An owner settles the triage queue through a results file.** The plain `ingest` (with or without `--overwrite`)
  takes a results file signed with a handle of `docs/owners.json` as a person's decision, also for an entry that has a
  `second` or `third` reading (applied; the earlier readings kept in `evidence.triaged.first` / `second`; the entry leaves
  the queue); `--second`, `--third`, `--draft` and `--review` refuse an owner's handle (agent stages). Every other check, the
  quotation of `why` included, applies. Wrong: whoever runs the CLI can sign a file as an owner and settle any queued
  entry, the disagreements of two readers included (the same trust model as R20: a visible claim in a reviewed commit, not
  a signature).

- **R24 — Agreement tolerates optional detail and the item's own damage** (pilot 2, XMM: two reviews that described the
  drafted mechanics were queued as disagreements; refines R9). Each side is read as its strongest assertions (one that says
  less than another of its side is absorbed by it). A draft assertion is matched by a distinct review assertion that is equal
  or the same up to optional detail: the same `given` (every given field is identity), the same expectation kinds, every
  field both state equal, the fields one side states alone being optional detail of their kind (damage `type`, move
  `distance`; every other field is identity: `fraction`, move `mode`, condition `applied`/`ended`, roll `mode`/`on`/`for`,
  `ends`, `affects`, `excludes`, `uses`). A review-only `damage.fraction = 1` given `hit` or `failedSave` alone is the item's
  baseline, not a disagreement, when the official item's structure (read from the dumps by `ingest --review`, as `batch review
  --structure` writes it) has an attack (for `hit`) or save (for `failedSave`) activity that deals damage, of the stated type
  if any, and the draft says nothing of the damage in that situation or in every situation. Agreement: every draft assertion
  matched, every review assertion matched or baseline, no `free`. The comparison keeps `baseline` and `detail` (canonical
  strings) beside `onlyDraft`/`onlyReview`; `evidence.reviewed.tolerated` (`baseline`, `detail`: closed, sorted) says which
  tolerance an agreement used. A reviewer that can express nothing of an entry answers `outcome: "person"` (no `assert`),
  queued as `unexpressed`; a `free`-only assertion stays refused. Wrong: (a) a drafter who forgot a damage type or a
  distance the text gives is not caught at review when the reviewer gives it (play still checks the entry, which carries the
  distance it moves; a wrong type is caught only by play); (b) a draft that should have reduced or replaced the activity's own
  damage on a hit or failed save, and does not say so, agrees with a reviewer who reads full damage — the draft's silence is
  taken as "the item's data stands", which is what the entry does at the table; (c) the baseline trusts the official
  structure: an official item whose activity deals damage on a roll where the text says it does not makes a reviewer's
  wrong "full damage" pass (the drafter's rule would have to say the opposite for it to be seen).
  **Fix round 1** (a review of R24 found three leaks and a visibility gap). (L1) `impliedAsserts` now says the `move` and
  `status` steps of `triggers` on every roll moment (hit, failedSave, savedSave...), with their distance, and the distance
  tolerance runs one way only: a review distance is taken only where the draft side pins the same one (an entry step);
  `ingest --draft` rejects a stated move or condition on a roll that neither an entry step nor, for a condition, an effect of
  the item's activity of that roll backs ("the entry does nothing of the kind on <roll>"; fail closed without the structure,
  so `ingest --draft` needs `RULEPACK_DUMPS`). (L2) implied `saveDamage` / `halfOnMiss` / `noDamage` carry their activity's
  damage types from the official structure, and a type must match exactly for a given whose draft-side fractions differ.
  (L3) no baseline on a roll whose damage the entry touches (`DAMAGE_ROLLS`, one line per drafter key, a test fails when a key
  is added without one; an unknown key touches every roll; `saveDamage` is classified as touching the saved save only, since
  it sets that fraction and is itself implied and must be matched). (V) `evidence.reviewed.tolerated` stores the tolerated
  baseline strings and `[draft, review]` pairs, schema-held and part of `emits`: a tolerated agreement leaves the record
  `drafted` until the gates run again (the command says so), and RULES.md counts such reviews apart. Remaining cost: a
  reviewer less specific than the draft (no type, no distance) still agrees; a condition the item's own effect applies is
  accepted without a step even when the text gives it on another roll than the structure's activity suggests (a person reads
  the queue only when the review differs); a two-type activity whose review gives one untyped fraction now disagrees (more
  queue, not less safety); `DAMAGE_ROLLS` classifies `atTurnStart`, `onHit`, `dataFixes` by hand.
- **R25 — Partial rules: what a rule leaves to the table is data** (pilot 3, XMM: drafters wrote rules that automate part of
  an entry and said so in `why`; the blind review then stated everything the text requires and the difference was queued as
  a disagreement; extends R24). A rule may carry `rule.leaves`, at most 6 items (`tools/pipeline/leaves.mjs`), each an
  assertion `{ given, expect, because? }` of the `assert` vocabulary with no `free` (what is true at the table but done by
  hand) or `{ unexpressed, count }` (count 1 to 6) for what even assertions cannot say; `because` / `unexpressed` from the
  closed `LEAVE_REASONS` (`no-key`, `target-size`, `target-state`, `immunity-after-save`, `healing-block`, `out-of-combat`,
  `table-ruling`: the reasons the pilot's `why` strings repeat; a creature-type exemption appeared twice and is left under
  `no-key`). The schema checks it like `assert` (own keys, closed words, origins; the validator gate checks the engine's
  words) and refuses a leaves assertion the rule states or implies (same up to optional detail), a leaves damage of another
  fraction than the rule's for the same situation, a duplicate, and any `leaves` on a rule whose own assertions (stated and
  implied) are none or only the item's damage on a hit or failed save. `leaves` is in the rule fingerprint, emitted nowhere
  at runtime; the generated rule carries `partial` (counts by reason) for docs/RULES.md ("partial" where it is handled, the
  counts beside what it adds, partial rules counted apart). Review: agreement iff every draft assertion is matched and every
  review assertion is matched, baseline, or matched by a `leaves` assertion (`left`, same matching as R24); an `unexpressed`
  item matches nothing, a leave the review omits is fine; the reviewer never sees `leaves`. An agreement that used `left` is
  "reviewed, partial": `evidence.reviewed.tolerated.left` holds the `[leaves, review]` pairs (schema-held, part of `emits`,
  so the gates run again); every partial rule's agreement is automatic, not queued, and `ingest --draft` / `--review` list
  partial keys for the owner. The drafter brief says a rule that would leave out the main effect (the first expectation
  of the primary roll; test: what stays automated is only what the item's data already does) is a `person` answer.
  Wrong: (a) a drafter who lists in `leaves` what a reviewer will say turns a gap into an agreement: what the rule automates
  is still matched one to one, but what it leaves is never automated, and only docs/RULES.md and the ingest summaries tell
  the table (cost: an owner's reading of each partial rule, not enforced); (b) "main effect" is a brief rule, not a check:
  a rule that keeps a side rider and leaves the main effect passes the schema when it asserts anything of its own (review
  then agrees through `left`); (c) `unexpressed` counts are unchecked claims; (d) a leaves assertion with a word the
  vocabulary marks unverified (`excludes`) matches a reviewer's only when both chose the same word.
  **Fix round 1.** (1) What an entry implies covers what its keys do (`assert.mjs` `IMPLIED`, one function per drafter key):
  `resave` → `ends: savedSave`, `effectEnds` → `ends: <word>`, `noReactions` / `actionOrBonus` → the new `expect.denies`
  (`reactions`, `actionAndBonus`), `noOpportunity` → `denies: opportunityAttacks` (not while flying), `effectStatuses` →
  `condition.applied`, each on the roll that applies its effect in the official structure (every situation without it);
  `saveDisadvantageFor`, `rollDisadvantage` → rolls with disadvantage. The 17 other drafter keys are in `IMPLIES_NOTHING`,
  each with why (a test fails on a key in neither); a rule using one, or an unsayable part of an implied one, is stamped for a
  person at review with the key's name (**Ruling R15 generalised**; `noReactions` now implies an assertion, its old stamps
  stay valid). `denies` is the only new word: the three meanings pilot 3 needed. (2) A leave the rule already contradicts for
  a situation it covers (another fraction, move mode, roll mode, or turn ending of EFFECT_ENDS) fails the schema, as does a
  leave the rule states or implies for every situation (`given: {}` covers any). A second condition, or an event ending
  beside a timed one, stays allowed: an effect may end at a time and on an event. (3) `excludes` maps to no notion of the
  engine (the engine's "the bearer excluded" is a zone's, `targets` limits by creature type), so agents may no longer write
  it (refused in a drafter's `assert` and `leaves` and a reviewer's `assert`); stored data still reads. Wrong: (e) a key in
  `IMPLIES_NOTHING` sends every rule that uses it to a person (`effectDurations`, `usageLimits`, `onHit`...): slower volume,
  until a word is added; (f) an implied assertion read without the structure holds in every situation, so a schema check
  run without dumps may refuse a leave that is only true on another roll than the rule's (more refusals, never fewer); (g) the
  pilot records that used `excludes` (one drafted rule) or a key now unassertable without its stamp (one) fail the schema
  until redrafted or restamped.

- **R26 — agreement compares atoms.** Before comparing, each assertion is split into one assertion per expectation under
  the same `given` (`assert.mjs` `atomise`): "frightened, until the start of the caster's turn" said as one assertion or as
  two is the same statement. An assertion with a `free` text is not split. Found by the fourth pilot: 4 of 5 disagreements
  were only this. *Cost if wrong:* the link between an ending and the condition it ends is lost when a text gives two
  conditions with two endings under the same roll; both sides would then have to state both pairs for a difference to show.

- **R27 — A contested rule is held, not shipped.** Passing the gates no longer puts a rule in the module: a non-legacy
  record is emitted (registered with DAS · Core) only when a review about the rule as it is agrees (`evidence.reviewed`
  current with `agrees: true`: an agent's agreement, exact or tolerated, or an owner's `review-accept`), or when it waits in
  `review-queue.json`, about the rule as it is, only because of its own stamp (the reason is the record's
  `evidence.drafted.because` with `person: true`: a key the vocabulary cannot assert, `noReactions`, `official-uncovered`)
  and the stored comparison agrees in full (`review.agrees: true`, `onlyDraft` and `onlyReview` empty, `review.assert` not
  empty, confidence at least 0.7; any field absent or of another type holds it). Everything else that passed the gates is
  held, with a closed reason (`generate.mjs` `HELD_REASONS`): never reviewed, queued as `disagreement`, `low-confidence`,
  `free-text` or `unexpressed`, a stamped review that did not agree, or a queue entry about an older rule. Legacy rules
  with standing are emitted as before, whatever their state. One function decides (`generate.mjs` `emissionOf`), used by
  `build:rules`, `sourcesOf`, `docs/RULES.md` (each held rule listed with why; the README counts shipped rules only),
  `tests/derived.mjs` and `gates --ci` (which fails when a generated module registers a held rule). A held rule still owns
  its identifier: the `unique` gate and `batch draft` count every record that has a rule (`identifierTwins`), so no second
  record is drafted under it. Scenarios stay for `reviewed` rules only, so a held rule gets none (and neither does a shipped
  stamped-but-agreed rule, which is `gated`). *Cost if wrong:* rules that are right wait out of the module until a person
  reads them (XMM on this branch: 32 of 75 held); a stamped rule whose reviewer agreed ships before a person reads the stamp,
  which is the part of the entry the vocabulary could not check (`leaves` and the stamp say so in `docs/RULES.md` only).

- **R28 — no monster rule is registered until it is compared with what the engine reads.** DAS · Core derives entries
  for monster features from their English text by itself (its "text" layer: the readers of `core/monster-text.mjs`, put
  together by `core/monster-layer.mjs` `monsterTextLayer`); an entry registered by a module is merged over that reading key
  by key (`mergeEntries([text, enchant, module, world, item])`: `triggers` replaced whole, `shallow` keys field by field, the
  others replaced), so it overrides the reading key by key, not wholesale (corrected the same day; R29). Measured live on
  the first 43 shipped monster rules: for 41 of them the engine already had an entry from the text; 17 pack rules were
  identical to it, 13 changed keys it had (some for the worse: a size limit the engine reads and the draft lacked), 18
  added a key. `emissionOf` therefore holds every rule of kind
  `monster` ("engine-text"); `monsterRules: true` lifts it, for the tests of the mechanics only. *Cost if wrong:* the few
  rules that add something real (a damage fraction on a successful save the engine does not read) are not shipped either,
  until the comparison exists. Triage of monster features must change too: `entry` was decided without the text layer.

- **R29 — a monster rule ships only as its delta against the engine's reading** (refines R28). The comparison is computed
  offline: `tools/pipeline/engine-reading.mjs` imports the engine's pure `monsterTextLayer` from `DAS_CORE` and builds its
  arguments from the official item of the dumps as `adapter/content.mjs` `textLayer` does, then compares the rule key by key
  (`same`, `adds`, `changes`; for `triggers`: `same`, `superset`, `drops`, `none`) and merges with the engine's own
  `mergeEntries`. CI has neither dumps nor a world, so `npm run gates` (local) stores the result as `evidence.reading`
  (`{ at, core, rule, item, delta, same, changes, triggers }`, a closed shape bound to the rule's and the item's
  fingerprints), and `emissionOf` reads only that: no current reading holds the rule ("engine-text"), a key that changes the
  reading holds it ("changes the engine's reading: a person decides"; a `triggers` list that keeps every engine trigger is
  no change), an empty delta holds it ("the engine already does it": a candidate for `core`), and the rest goes through R27.
  The module entry is the delta: the `adds` keys, and `triggers` whole when it is a superset (the engine replaces that key
  whole); a `same` key is redundant and left out. Triage gets the reading too: `engineReads` in the structure files of the
  triage, draft and review cuts (the three briefs: judge, write, assert only what goes beyond it), and the hint
  `engine-reads` from `triage <BOOK> --engine-reading` on unruled monster `entry` records (no verdict change). On XMM (DAS ·
  Core 0.289.0, the clone; `docs/pilot-m3.md`): of the 75 rules, 16 would ship, 25 change the reading, 25 add nothing, 9 are
  held by R27. *Cost if wrong:* (a) the reading is the clone's, not the one the world runs: a newer engine that reads more
  makes a delta key redundant (harmless: the merge gives the same entry) or turns an `adds` into a change the evidence does
  not show until `npm run gates` runs against that engine; the evidence names the engine version so a person can see it is
  old; (b) a `shallow` key (`effectEnds`, `saveDamage`, `effectDurations`, `targets`…) that only adds fields is counted as a
  change and held, although the engine would keep the fields it read: some rules that only add wait for a person; (c) a
  rule held "the engine already does it" keeps its identifier and its place in the registry until a person sets `core`.

  **Fix round 1 (a live check of the 16 shipped deltas: 2 items lost an engine key).** A monster rule binds its item to
  its creature-scoped identifier through `sources`; the engine (`identifierOf`) then knows the item by that identifier, so
  its shipped entry under the item's original identifier (the `module` layer, `CONTENT[original]`) no longer applies, and
  the text layer is read under the new identifier. Inside `monsterTextLayer` the identifier only names the item in what it
  derives ("this attack" conditions, `activity.identifier`; the mark of an immunity after a success, `immune:<id>`; both
  need one to exist) and `swallow` comes from the shipped entry of that identifier. So the comparison is now between
  `before` (text layer under the original identifier merged with the engine's shipped entry for it) and `after` (text
  layer under the pack's identifier merged with the emitted entry), whatever the rule declares (`engineComparison`). The
  emitted entry is `delta + carried`: `carried`, the keys of `before` the rebinding loses that come from the shipped entry,
  are named in the rule (`carries: { from, keys }`) and their values are taken from the engine's own shipped table when the
  pack registers (`scripts/carry.mjs`, `api.content.builtin`: nothing of the engine is copied into the repository; a key the
  running engine no longer ships leaves the rule unregistered). Carrying is faithful for a key whose value does not name the
  original identifier; a text-layer key that names it is re-derived under the new identifier with the same meaning (the
  condition and the mark follow the item's identifier), and `swallow` is restored by carrying it. A key that cannot be
  carried (a shipped value naming the original identifier, a text-layer key that differs otherwise) or an original
  identifier the engine handles in code holds the rule: "its identifier would drop engine behaviour" (`engine-rebinding`).
  `evidence.reading` gains `original`, `carried`, `dropped` and `code` (optional, so that a reading written before still
  validates and counts until `npm run gates` rewrites it). A rule ships only when `after` keeps every key of `before`
  unchanged and its delta is not empty. A rule under the item's own identifier rebinds nothing (the engine merges the
  pack's entry over its own key by key); outside monster features the unique gate now refuses `sources` that bind an item of
  an engine identifier to another one (none in the registry). On a copy (DAS · Core 0.290.0): 13 ship (2 carry a key:
  `usageLimits`, `magical`), 25 change the reading, 29 add nothing (3 earlier shipped rules only repeated a shipped
  `noOpportunity`), 8 are held by R27. *Cost if wrong:* a carried value is the running engine's, so a change of its meaning
  upstream changes the rule's behaviour unseen until a live check; and the rule is lost entirely, not degraded, when the
  engine stops shipping a carried key.

- **R30 — a trigger may carry a condition over closed facts, and the assertions say it in `given`.** The third rereads
  ranked what readers could not state: a filter on the trigger (melee only, a kind of attack) 14, a limit on the target's
  size 11, an effect only on a target in a given state 5; the engine already has the mechanism (a declaration's `if`, a
  structure of facts, `core/triggers.mjs` `holds`; the facts with the subject and argument kind of each in
  `core/recipes.mjs` `FACTS`, read at run time by `loadCore`). A drafter's `triggers` declaration may now carry `if` in the
  form the engine's own content uses most (168 of 179 conditions: one object whose keys must all hold; never `all`, `any`,
  `not`, a list, or the recipe's `condition: [{ fact, arg }]`, which a trigger ignores), with 1 to 3 facts of a closed
  allowlist (`tools/pipeline/conditions.mjs` `DRAFT_FACTS`: `target.sizeAtMost`, `target.creatureType`, `target.hasStatus`,
  `source.hasStatus`, `target.within`, `target.bloodied`, `target.wounded`, `target.hpAtMost`, `source.onOwnTurn`,
  `damage.hasType`, `activity.isAttack`, `isMelee`, `isWeapon`, `isSpell`), each argument typed (an engine list, a bounded
  integer, a distance of 5 to 300 ft, `true`) and no two facts said by one given field; every other fact of the engine's
  list is in `EXCLUDED_FACTS` with why (an identifier or free string, a constant of the item or its creature, vision that
  holds when it cannot be told, nothing asked for), and a test fails on an engine fact in neither table or on an allowed
  fact whose subject or argument kind the engine changed. Each allowed fact has a `given` field (`targetSizeAtMost`,
  `targetType`, `targetStatus`, `selfStatus`, `targetWithin`, `targetHp`, `targetHpAtMost`, `onOwnTurn`, `damageType`,
  `activity`), defined in `definitions.given`; `impliedAsserts` carries a declaration's condition into the given of each
  assertion it implies, for a rule and for the engine's own reading alike (its `all` read as the facts together), and a
  condition with a part that has no word implies nothing (never the unconditioned assertion) and stamps the key for a
  person. In review every given stays identity, sizes compared as values. `target-size`, `target-state` and
  `trigger-filter` stay in `LEAVE_REASONS` for what is still unsayable (a size relative to the user's, a target engulfed by
  the user, a ranged attack only). A scenario stages the positive side of a size limit (a target no larger, from the
  creatures it already casts) and is manual for the other side and for every other condition field. Measured on a copy
  (DAS · Core 0.290.0): nothing of the 75 monster rules moves (25 change the engine's reading, 20 of them dropping a
  trigger, 9 of those a size-limited one: 7 a push, 2 a condition; 13 ship, the same 13); 29 XMM monster features whose
  reread named one of the three reasons are the pool this makes statable. *Cost if wrong:* (a) a condition limits what a
  trigger does, so a wrong fact or argument makes a rule silently do less than the text (a push that never fires): review
  catches it only when the reviewer states the limit the same way, and the scenario never plays the side where the rule
  must not act; (b) `given` grows by nine fields, so a drafter and a reviewer may state the same limit through two facts
  (`targetHp: "bloodied"` against `targetHpAtMost`) and disagree where they mean one thing: more queued for a person;
  (c) a reading's condition the vocabulary cannot say now implies nothing, so a reread may name as beyond what the engine
  does in part (more work for drafters, never less checking); (d) `targetType` from a condition shares the old positive-only
  staging of `saveDisadvantageFor`: a scenario of a type-limited trigger checks the right type only.

- **R31 — one restate pass per vocabulary change.** A first reread that found only what the vocabulary could not state is
  never cut again for the same reading, so when the vocabulary grows (R30 made `target-size`, `target-state` and
  `trigger-filter` statable in part) those verdicts would stand on yesterday's words. `batch reread --restate` cuts, once, the
  first rereads with `covered: false` whose `unexpressed` names one of those reasons (`reread.mjs` `RESTATABLE`,
  `restatable`), bypassing only the same-reading check; `ingest --reread --restate` replaces the reread whatever it answers
  and marks it `restated: true` (the schema allows it on a first reread only, `true` only), so it is never restated again.
  A covered answer takes the normal provisional `core` path, still subject to a second reread; an unsure one changes
  nothing. A later vocabulary change that makes other reasons statable gets its own pass: `RESTATABLE` is changed, and the
  mark cleared for the records it concerns, by a decision recorded as a new ruling. *Cost if wrong:* (a) the mark is
  one-shot: a restate whose reader was wrong but sure is not restated again without a new ruling, so a record may stay
  `entry` (more work for drafters) or turn provisional `core` (caught only by the second reread); (b) a reason that stays
  unsayable (a size relative to the user's, a ranged-only filter) is read again for nothing, a cost of reader time only;
  (c) the mark does not name the vocabulary it was judged against, so a reader cannot tell from the record alone which
  change it answered.

- **R32 — a rule that changes the engine's reading is drafted again, once, blind, as an addition over the reading.** The 25
  XMM monster rules held `engine-changes` (R29) were drafted before the drafter saw `engineReads` or could write a trigger
  condition (R30): they drop or alter what the engine reads (a merged `triggers` replaces its whole list), and no cut ever
  offered a ruled record to a drafter again. `batch draft --redraft` cuts the records `batch.mjs` `redraftable` accepts — a
  monster feature, not legacy, with a rule `emissionOf` holds `engine-changes` under the reading computed now (as the gates
  compute it), in neither drafts-queue.json nor review-queue.json, not yet redrafted — as ordinary draft entries
  (`engineReads` read as for an unruled record, `beyondEngine` when a reread found it) in batches marked `redraft: true`;
  the old rule is not shown, nor offered as an example. `ingest --draft --redraft` (refused on a batch without the mark,
  and the mark refused without the flag) runs every draft check; an applied result starts from the record as it was before
  any draft (no rule, no draft, gates, review, play, signature or reading evidence: the new rule is reviewed again, blind,
  and `npm run gates` computes its reading), takes the new rule and marks `evidence.drafted.redrafted: true`. The mark sits
  on the draft evidence, not in the rule: it says how the rule was drafted, it does not change the rule's fingerprint, what
  is emitted or what a reviewer sees, and no drafter can write it (the result fields are closed). A result that goes to a
  person is queued as any declined draft and removes the old rule too (the queue alone would leave in place a rule known to
  change the engine's reading); a rejected one changes nothing. A redrafted rule that still changes the reading stays held,
  and the mark keeps it from a second cut. *Cost if wrong:* (a) a redraft discards a rule a person may have accepted
  (`review-accept`) or that only changed a key on purpose, and a declined redraft leaves the feature without any rule until
  a person settles the queue entry; (b) the mark is one-shot: a redrafter who still drops a trigger leaves the rule held
  for a person, never redrafted again without a new ruling; (c) the mark lives on `evidence.drafted`, so a record whose
  redraft was declined carries none: drafted again later through the ordinary path, it could be redrafted once more;
  (d) the cut decides on the reading of the engine the tools point at, so another release may count other records.

- **R33 — zones and auras are drafter keys, in a closed form, and a zone moment is said once with `subjected`.** The sample
  outside the Monster Manual (1 accepted of 16) declined most often for an area or an aura that acts on a creature when it
  enters, or starts or ends a turn there; the engine has the keys in its own content. A drafter may now write nine of them
  (`tools/pipeline/zones.mjs` `ZONE_KEYS`, each with what it does, read from the engine's runtime: `emanation`, `aura`,
  `zoneAffects`, `zoneEffects`, `selfZone`, `zoneLasts`, `zoneMax`, `saveAutoSuccess`, `willingFails`), and `triggers` a
  zone that replays the item's activity (`{ on: enter|turnStart|turnEnd, do: [{ type: "replay", activity? }] }`). Every
  value is a closed word, a bounded number (radius and size 5 to 300 ft, a zone 6 to 86 400 s, 1 to 20 creatures) or an id
  of the item's own activities and effects, checked by `checkDraftKeys` against the declarative shapes (`shapes.mjs`
  `shapeProblems`); what the engine also takes is refused with why (`EXCLUDED_ZONE`: an aura's `changes` key/value
  strings and both radius formulas, free text; `aura.affects: summoner`; `emanation.atStart`; an emanation on `death`; a
  replay `on: moves` or under an `if`). No key of the nine is excluded whole: none takes another document's identifier or a
  free string once those fields are out, and each one's meaning is pinned by the engine's code and shipped uses. The
  assertion vocabulary grows by three words: `given.moment` takes the aura moments `ownTurnStart` / `ownTurnEnd` (the
  emanation moments that are no trigger moment; `turnStart` is in both lists with one meaning), `expect.subjected:
  activity` (the item's activity is used on the creature at that moment; only with a zone or aura moment, never with a
  roll), and the roll mode `autoSuccess`. `impliedAsserts`: a replay or an emanation, one `subjected` atom per moment;
  `zoneAffects`, `affects`; an emanation's `affects: enemy`, `affects: enemies` at its moment; `saveAutoSuccess.types`, one
  `autoSuccess` save per creature type. The shaping keys (`aura`, `selfZone`, `zoneLasts`, `zoneMax`, `zoneEffects`,
  `willingFails`) and the unsayable parts (an emanation's radius, `sees`, `whileActive`; `saveAutoSuccess.fighting` and
  `sizeAtLeast`) imply nothing and stamp the draft for a person (R15). The briefs ask for one wording: the moment alone with
  `subjected`, what the activity does with the roll alone, once. `loadCore` gives `emanationMoments`, `auraAffects` and
  `zoneFields` (each zone validator's own field lists, read as text), and a DAS_CORE test fails on an engine field in
  neither a shape nor `EXCLUDED_ZONE`, on a moment or recipient list that moved, and on a value the pack assumes refused
  that the engine accepts. A scenario with a zone or aura moment is manual (`given.moment.<word>`, `expect.subjected`).
  Measured (repository registry unchanged; a copy gated): the 40 shipped rules keep their states and the generated
  outputs do not change; the pool in closed fields is small (reread `beyond` assertions at a zone moment: XMM 7, XPHB 1;
  of the 206 drafts-queue entries, 3 have one; the queue's `reason` has no area word), the drafters' own `why` names an
  aura or zone for 17 of the 206 (2 FRAIF, 15 XMM: a keyword search read by eye, not a closed field; most also need
  something else, an immunity, a healing block, a choice), and the 306 entries of the other 2024 books not yet drafted carry
  no closed reason at all. *Cost if wrong:* (a) `ownTurnEnd` against `turnEnd` is the old
  trap of the turn words in a new place: a drafter and a reviewer who pick differently disagree, and a draft that picks the
  wrong one with a reviewer who does the same ships a zone that acts on the wrong turn (play cannot catch it: the
  scenarios are manual); (b) the "roll alone" wording is a brief rule, not a check (stored rereads and reviews pair a zone
  moment with a roll, so it cannot be refused): a side that repeats the consequences per moment disagrees with one that
  does not, more for a person; (c) a radius, a sight limit, a cap, a duration and a consent are never compared at review:
  a person reads each such rule (slower volume), and a person's slip there reaches the table; (d) `subjected: activity`
  says THAT the activity is used, not which one: a replay of a sibling activity and of the item's own compare equal;
  (e) an emanation acts from the text the engine reads beside it (incapacitated, kin, immunity: core/emanation.mjs
  `readEmanationText`), which a rule neither states nor controls; (f) a shipped engine entry whose shape a drafter may not
  write is no longer offered whole as a key example (its zone key or replay declaration is dropped from the example).

- **R34 — choices, barriers and wards are drafter keys, in a closed form; a change of form is not.** After R33, 7 of the 9
  sampled spells still had no key for their main effect; the drafters named a change of form (with temporary hit points
  from the new form, ended at will), a barrier that bars entry or low-level spells, a warded area whose effects are picked
  at casting, and an automatic failure of a save by creature type. Read in the engine (validators, runtime, shipped entries),
  seven keys are admitted (`tools/pipeline/wards.mjs` `WARD_KEYS`): `choice` (one of the activity's own effects picked at
  use, only it applied: once, per target that failed, or by a die in the order of `order`; a `pool` of the item's effects
  the activity does not link; options labelled by the effects' own names, so no label is needed), `barrier` (an emanation
  of 5 to 300 ft around the bearer of the item's effect: no walking in, no melee hit from outside without reach; `shields`,
  nothing from outside affects inside; `onlyTypes` / `exceptTypes`; `endsOnContact`), `globe` (no spell of `maxLevel` 0 to 9
  or lower cast from outside affects inside), `wardsConditions` (creature types and statuses), `wardsAtZero`,
  `blocksHealing` and `blocksTempHp` (`true` or effect ids). Refused with why (`EXCLUDED_WARD`): `choice.prompt` (free text),
  `choice.outcome` / `choice.grapple` (damage or a grapple instead: no word), `globe.everywhere` (the antimagic field, which
  the system's own status also does). Not admitted, with why (`NOT_ADMITTED`): `changesForm` — the engine swaps the token
  to the FIRST profile of the item's transform activity and sets that form's maximum hit points (or keeps the current ones):
  no temporary hit points, no pick among forms, so the drafters' change of form is another rule; `formLock`, `walls`,
  `wallSide` (geometry decided by keys a drafter does not write, or other items by identifier), `encloses` (precise, no
  sampled need), `wardsDetection` (any string: no list of the engine to pin). **Engine gap**: no key fails a save
  automatically for a kind of creature (only `saveAutoSuccess`, `saveAutoSuccessAgainst: ["magic"]`, the consent of
  `willingFails`); it is an upstream request, not a pack key. The assertion vocabulary grows by `expect.chooses`
  (`oneEffect`, `oneEffectPerTarget`, `effectByRoll`), `expect.bars` (`entry`, `melee`, `actions`, `spells`), both said once
  for the use (never with a roll or a moment), `given.spellLevelAtMost` (0 to 9, only with `bars: spells`), and the denials
  `healing` and `tempHp`. `impliedAsserts`: a choice its word; a barrier with no creature types `entry` and `melee` (and
  `actions` when it shields), one with them nothing (the assertion without its limit would say more than the key); a globe
  `bars: spells` at its level; `blocksHealing` / `blocksTempHp` a denial on the roll that applies each effect. Unassertable,
  so stamped for a person (R15): every barrier and globe (a radius has no word), a die's `order`, a pool alone,
  `blocksTempHp: true` (also the creature that carries the item), `wardsConditions`, `wardsAtZero`. `loadCore` gives
  `choiceEffects` and `wardFields` (the four validators' own field lists, read as text) and a DAS_CORE test fails on a
  field in neither a shape nor `EXCLUDED_WARD`, on a refused key the engine drops, and on a value assumed refused that the
  engine accepts. Scenarios: the new words are manual; only the three denials the runner observes keep an interpreter.
  Measured (repository registry unchanged; a copy gated: 19 143 records, 0 failing, the 42 shipped rules and every other
  rule keep their states, the generated modules, README and RULES.md are byte-identical): in closed fields the pool is
  near nil — of the reread reasons, `healing-block` appears in no reread and in 3 XMM partial rules' `leaves`, all three
  items the engine already reads as `blocksHealing`; `use-time-choice` in 2 XMM rereads (both queued) and 1 FRAIF rule's
  `leaves`, which a person must read to tell an effect pick from another choice; `form-change` (3 XMM rereads, 1 FRAIF
  rule) stays unstatable. The drafts queue's `reason` has no word for any of it, and the entries of FRAIF, EFA and XPHB not
  yet drafted, the 9 sampled spells among them (not ingested), carry no closed reason: only a new drafting sample can size
  the pool. *Cost if wrong:* (a) `chooses: oneEffect` says THAT one effect is picked, not which options: a draft whose
  `pool` adds or misses an effect compares equal to a review that names none; (b) the engine's barrier always bars both
  walking in and melee: a text that bars only one makes the rule say more than the text, which a reviewer stating only one
  catches as a disagreement (a person's), and a reviewer who copies the key's pair would not; (c) a barrier limited to some
  creature types (every barrier the engine ships) asserts nothing, so review checks nothing of it and a person reads every
  such rule; (d) `blocksTempHp: true` also blocks the item's holder, which a drafter reading "the target" may not mean: the
  stamp sends it to a person, who must catch it; (e) `chooses` and `bars` are never played (manual scenarios), so a wrong
  `perTarget` or radius reaches the table unless a person plays it; (f) leaving `changesForm` out keeps the commonest
  sampled main effect (a change of form) at `person`, and the automatic failure at `engine`, until upstream adds them.

- **R35 — a shared embedded item id is bound by `<actor id>.<item id>`, when the engine says it accepts the key.** One
  embedded item id is often used by many creatures (in the dumps: 1,480 of XMM's monster records, 53 of XPHB's, 4 of EFA's
  share theirs with another creature), and R3 left every such feature out (`batch draft`: 457 XMM, 33 XPHB, 2 EFA `entry`
  records) because a source under the bare id binds every creature that embeds it. DAS · Core now accepts a key of two
  16-character ids in `validateSources` and looks it up first (`identifierOf` with `core/source-keys.mjs` `sourceKeys`: the
  actor is read from the document that carries the item, its own compendium source for a world copy or a token). Built:
  `loadCore` asks the engine itself (`actorItemSourcesOf`: its `validateSources` on a key of two invented ids, never its
  version, which did not change) and gives `actorItemSources`. Inventory and `ingest --draft` bind a ruled, scoped monster
  feature whose id another creature of the package embeds by its official item's `docId` (`sources: { <actor id>.<item id>:
  <identifier> }`) and flag it `embeddedShared`; `sourceKeysOf` of such an item is that key only, so a bare shared id in
  `sources` fails (`sources: … other creatures share`) and an unbound one fails the identifier and ids gates as before.
  The engine in use decides the rest: `batch draft` cuts such features only with `actorItemSources`, `ingest --draft`
  refuses them without it, and the validator gate fails a record whose `<actor id>.<item id>` source the engine refuses
  (also under `--ci`, which loads the engine too). `unique` fails two records that bind one key to different identifiers;
  `<actor A>.<item>` and `<actor B>.<item>` are two bindings. A feature whose embedded id is unique keeps its bare-id
  source: the 15 shipped monster rules are unchanged (in XMM's package each of their ids is embedded by one actor only, so
  a dotted key would bind the same item there, and their fingerprints and evidence would move for nothing). The engine's
  reading, the comparison and the carry (R29) already used the right item: the document is the dumps' under the record's
  `docId` and the actor id is taken from it; tests pin it with two creatures that share one id. Scenarios already cast the
  creature by its actor id and use its own item. At registration the module asks the running engine
  (`api.content.validateSources`, per key) and leaves out every `<actor id>.<item id>` source it refuses, or cannot be asked
  about, with the rules that source binds, saying so in one console line (`scripts/scoped-sources.mjs`).
  Measured on a copy of the registry (DAS · Core 0.290.0 of today): the draft cut takes 455 more XMM features (2 more go to
  "reread first"), 33 more XPHB and 2 more EFA; the reread cut does not change (it never left these out); `npm run gates`
  changes no record, and the 42 shipped rules, the generated modules, README and RULES.md stay byte-identical.
  *Cost if wrong:* (a) the engine builds the item half of the key from the item's compendium source when it has one, not
  from its embedded id: an item whose source names another id is never found under the pack's key, and its rule silently
  binds nothing (measured: 0 of the 1,537 shared records of XMM, XPHB and EFA; the registry does not keep the source, so no
  gate checks it); (b) another actor of the same creature that embeds the id (a second printing in the package) is not bound,
  where a bare id reached both (measured: 0); (c) a later change to the engine's lookup order (`sourceKeys`) can bind nothing
  unseen until a play (a DAS_CORE test runs the engine's own `sourceKeys` against the pack's key); (d) on an older engine the
  module registers none of these rules (one console line), and the gates run against an older clone fail them closed
  (`drafted`, out of the module) — no worse than before; (e) an inventory run binds the key from the data without asking
  the engine, so the decision is the gates': a record can sit bound and failing the validator gate on an old clone.

## What a drafter may write (engine limits)

`DRAFT_KEYS` (`tools/pipeline/draft-keys.mjs`), each with the slot its ids sit in — `activityMap` / `effectMap` (an object keyed
by id: origins side by side), `single` (one id: one origin), `none`. Task 3 step 1 confirms every slot against the key's validator
in `module/scripts/core/content/entry.mjs` and drops any key it cannot confirm:
`triggers` (moments and step types of `MOMENTS` / `STEP_TYPES`; since R30 a condition `if` of `DRAFT_FACTS`),
`saveDamage`, `halfOnMiss`, `noDamage`, `effectEnds`, `endsWhen`, `actionEnds`, `breaksOn`, `noReactions`, `actionOrBonus`,
`noOpportunity`, `noOpportunityAttacks`, `saveAdvantage`,
`saveDisadvantageFor`, `rollBonus`, `rollDisadvantage`, `effectStatuses`, `effectDurations`, `savedEffects`, `atTurnStart`,
`usageLimits`, `ignoresResistance`, `grantsResistances`, `grantsConditionImmunities`, `difficultTerrain`, `targets`, `onHit`
(`single`), and `dataFixes` (official origin only, `from` mandatory, never on a monster feature: the data-fix gate has no
document for `<actor id>.<item id>` yet). Since R33: `emanation` and `aura` (`single`), `selfZone` (`activityMap`),
`zoneAffects`, `zoneEffects`, `zoneLasts`, `zoneMax`, `saveAutoSuccess`, `willingFails` (`none`), each in the closed shape
of `DRAFT_SHAPES`, and a `triggers` declaration that replays the item's activity at the zone moments. Since R34: `choice`
(`activityMap`), `blocksHealing`, `blocksTempHp` (`effectMap`), `barrier`, `globe`, `wardsConditions`, `wardsAtZero`
(`none`), each in its closed shape; `changesForm`, `formLock`, `walls`, `wallSide`, `encloses` and `wardsDetection` stay out,
each with why (`wards.mjs` `NOT_ADMITTED`). Since R38: four reaction declarations of `triggers` (an AC bonus against one hit,
a hit turned into a miss at `isHit`, a melee counterattack at `isMissed`, damage `to: "source"` by an activity of the item),
`reactions`, `light` (`none`), `teleport`, `swapPlaces` (`single`), each in its closed shape; `counter`, `damageShield`,
`carriedLight`, `transpose`, `afterTeleport`, `forOneAttack` stay out, each with why (`reactions.mjs`).

Outside the list, the engine has keys but the drafter does not use them in this milestone: geometry (`walls`, `summon`,
`teleport`, `light`…; the zone and aura keys of R33, the barrier keys of R34 and `teleport`, `swapPlaces`, `light`,
`reactions` of R38 are in the list), `gmAlert` (prose),
`metamagic`, `sense` and
class-mechanic keys (`smite`, `rage`, `sneakAttack`…), which Core owns for the SRD. Those records go to the drafts queue as
`outcome: "person"`. A rule that needs a fact the engine's `adapter/facts.mjs` does not provide (light level, say), state across
turns no key models, or a prompt to the player, is `outcome: "code"` (a script like Shadow Blade: a person writes it). A rule that
needs a key the engine lacks is `outcome: "engine"` with what is missing in `why` (an upstream issue with no book named). An
identifier equal to a Core identifier merges into Core's entry for every item of that name (`registerTable`): allowed only with
`inCore: true`, set by a person.

---

### Task 1: Monster attack headers in `plainText`; renderer-only refingerprint

**Files:** modify `tools/pipeline/text.mjs`, `tools/pipeline/inventory.mjs`; test `tests/pipeline/text-attack.test.mjs`;
`TODO.md`.

**Interfaces — produces:**
- `plainText(entries)` renders the attack and save tags instead of keeping their first argument: `{@atk…}` / `{@atkr…}` → the
  attack-roll header (melee, ranged, melee or ranged, by the argument letters), `{@hit n}` → `+n`, `{@h}` → `Hit:`, `{@m}` →
  `Miss:`, `{@dc n}` → `DC n`, `{@recharge n}` → `(Recharge n–6)`, `{@actSave a}`, `{@actSaveFail}`, `{@actSaveSuccess}`,
  `{@actSaveSuccessOrFail}`, `{@actTrigger}`, `{@actResponse}` → their headers; other tags unchanged. Table `TAG_RENDER`.
- `plainTextV1(entries)` — today's function, kept for comparison only.
- Inventory, for an existing record: `rendererOnly = existing.text.sha256 === textFingerprint(plainTextV1(raw))`; when true the new
  fingerprint is written, `textChangedAt` is not set, gate evidence is kept, and the key is counted in `report.rerendered`
  (Ruling R1).

- [ ] **Step 1:** Failing tests: `renders {@atkr m} and {@hit 7} as a melee attack header and +7`, `renders {@h} as Hit:`,
      `renders recharge and save tags`, `leaves unknown tags as their first argument`, `plainTextV1 is unchanged`,
      `inventory counts a header-only change as rerendered without textChangedAt` (synthetic bestiary fixture),
      `inventory still dates a change of words` .
- [ ] **Step 2:** `npx vitest run tests/pipeline/text-attack.test.mjs` — FAIL. Implement. Run — PASS; `npm test` PASS.
- [ ] **Step 3:** Real run (local data): `npm run inventory -- XMM all` then the other books in order; check Review Focus 5 with
      `git diff --stat registry/`; report `rerendered` / `textChanged` counts only.
- [ ] **Step 4:** Commit `Pipeline: monster attack headers kept in the text` and one `Inventory: re-render <BOOK>` per book.

### Task 2: Identifiers that reach every origin — aliases, monster scope, Core collisions, ids-gate hardening

**Files:** modify `tools/pipeline/schema.mjs`, `gates.mjs`, `generate.mjs`, `inventory.mjs`, `settle.mjs`; create
`tools/pipeline/identifiers.mjs`; tests `tests/pipeline/identifiers.test.mjs`, `tests/pipeline/gates-ids.test.mjs`.

**Interfaces — produces:**
- `rule.alsoAs: [{ identifier, origin }]` (schema: kebab identifier, origin in `ORIGINS`, no duplicates, never the record's own).
- `rule.uncovered: [{ origin, because }]` (schema; `because` one line ≤ 200).
- `identifiers.mjs`: `GENERIC_IDENTIFIERS` (`new-item`, `spellcasting`, `multiattack`, `bite`, `claw`, weapon base names…, plus
  the empty string), `aliasFor(record, origin, { coreIdentifiers }) → { identifier } | { uncovered: because }`,
  `monsterIdentifier(record) → "<book>-<creature>-<feature>"` (occurrence appended as `-2`).
- Inventory: for a monster record with a `rule`, binds `sources: { <embedded item id>: record.identifier }` when the embedded id
  occurs in one actor of the package only; otherwise marks the official item `embeddedShared: true` (schema field).
- `checkIds` (Ruling R4): side-by-side ids pass; new failures `ids: <id> belongs to no origin of the rule`,
  `ids: <origin> contributes no id`, `ids: <origin> is matched but neither in origins nor uncovered`, `ids: <origin> item
  identifier <x> is not reached (no source, no alias)`, `ids: shared embedded item id (engine: actor.item sources)`.
  `idsIn` also finds ids after `#`, around `/`, and inside `@UUID[…]` (TODO item "before the first non-legacy rule").
- `checkFixes`: a fix without `from` whose path does not exist on the document fails (`fixes: <path> does not exist`).
- `gateUnique` checks identifiers and aliases together, and fails an identifier or alias equal to a Core identifier
  (`core.identifiers`) unless `rule.inCore === true`.
- `generate`: the TABLE gets each alias with the same entry; `SOURCES` gains the monster bindings; `scripts/main.mjs` is
  unchanged (it already passes `{ sources }` when non-empty).

- [ ] **Step 1:** Read `adapter/content.mjs` `identifierOf` and `runtime/content.mjs` `registerExternal` in `DAS_CORE`; confirm in
      the report that an alias registered as a table key is reached by `system.identifier`, and that `actor.item` sources are
      refused by external registration. If either is not so, stop and report.
- [ ] **Step 2:** Failing tests: `alias filled from a differing DDB identifier`, `generic or empty identifier is uncovered`,
      `alias equal to a Core identifier fails unique`, `two rules sharing an alias fail unique`,
      `monster identifier is book-creature-feature`, `unique embedded id binds a source`, `shared embedded id stays drafted`
      (Review Focus 2), `side-by-side ids pass` (Review Focus 3), `id of no origin fails`, `matched origin unaccounted fails`,
      `idsIn finds ids in #id, a/b and @UUID strings`, `fix without from on a missing path fails`,
      `the 24 legacy rules still register the same table` (registration snapshot unchanged).
- [ ] **Step 3:** Run — FAIL. Implement. Run — PASS; `npm test`, `npm run gates -- --ci`, `npm run build:rules -- --check` PASS.
- [ ] **Step 4:** Commit `Pipeline: aliases, creature-scoped monster identifiers, stricter ids gate`.

### Task 3: Rule vocabulary — `assert`, draft keys, evidence stamps, queues

**Files:** modify `tools/pipeline/schema.mjs`, `registry.mjs` (`stateOf`), `generate.mjs` and `cli.mjs` (`NOT_BOOKS`); create
`tools/pipeline/draft-keys.mjs`, `tools/pipeline/assert.mjs`; tests `tests/pipeline/assert.test.mjs`,
`tests/pipeline/draft-keys.test.mjs`, `tests/pipeline/state.test.mjs`.

**Interfaces — produces:**
- `assert` becomes an array (schema today says object; no shipped record has one): `[{ given, expect }]`, at least one for a
  non-legacy rule. `given: { roll?: "hit"|"miss"|"crit"|"failedSave"|"savedSave", moment?: <engine MOMENTS name>, origin?:
  <origin>, targetType?: <CREATURE_TYPES>, free? }`; `expect: { damage?: { fraction: 0|0.5|1|2, type? }, condition?: { applied?:
  status, ended?: status }, ends?: <EFFECT_ENDS or moment>, roll?: { mode: "advantage"|"disadvantage", on:
  "attack"|"save"|"check", for: "self"|"target"|"ally"|"enemy" }, affects?: "target"|"allies"|"enemies"|"self", excludes?: …,
  move?: { mode: <MOVE_MODES>, distance }, uses?: { spent: n }, free? }`. Enumerations are read from the `DAS_CORE` clone
  (`loadCore` gains `moments`, `statuses`, `creatureTypes`, `moveModes`).
- `normaliseAssert(list) → string[]` (sorted canonical forms) and `impliedAsserts(entry) → string[]` for `saveDamage`,
  `halfOnMiss`, `noDamage`, `noReactions`, `triggers` with `failedSave → status|move` (others `[]`).
- `DRAFT_KEYS: { [key]: { slot: "activityMap"|"effectMap"|"single"|"none" } }` and `checkDraftKeys(entry, { origins, kind })
  → string[]` (both options required: called without them it throws, it never passes by default).
- Evidence shapes: `drafted: { by, at, core, rule }`, `reviewed: { by, at, agrees, rule, confidence }`, `played: { at, core,
  world, scenario, client, rule }` (`rule` 64 hex). `stateOf`: `reviewed` and `played` count only while their `rule` is the
  current fingerprint; legacy records keep today's behaviour (`legacyStatus`, complete play record).
- `drafts-queue.json` / `review-queue.json`: arrays of `{ key, reason, by, why, confidence, draft?, review? }`, sorted by key;
  added to `NOT_BOOKS`.

- [ ] **Step 1:** In `DAS_CORE` read each `DRAFT_KEYS` key's validator in `core/content/entry.mjs` / `steps.mjs`, record its
      slot; drop a key whose id slot cannot be confirmed; list what was dropped in the report.
- [ ] **Step 2:** Failing tests: `assert must be a non-empty array for a non-legacy rule`, `unknown given or expect field rejected`,
      `free text limited to 120 characters`, `normaliseAssert is order-independent`, `impliedAsserts of saveDamage none`,
      `checkDraftKeys refuses gmAlert and aura`, `reviewed with an old rule fingerprint leaves the state gated`,
      `played with an old rule fingerprint leaves the state reviewed`, `legacy states unchanged for the 24`,
      `generate ignores drafts-queue.json and review-queue.json`.
- [ ] **Step 3:** Run — FAIL. Implement. Run — PASS; `npm test`, `gates --ci`, `build:rules --check` PASS.
- [ ] **Step 4:** Commit `Pipeline: rule assertions, drafter keys and rule-stamped evidence`.

**Parked** (review findings of Task 3 kept for later, not fixed in this milestone): the field order of the concatenated
quotation check (a quote split across fields in another order than the record's); words inside `@flags.` references of a
distance; a directory or a symlink named like a script passing the `rule.code` existence check; the length of `why` in
`queue.json`.

### Task 4: `batch draft` and the drafter brief

**Files:** modify `tools/pipeline/batch.mjs`, `cli.mjs`; `docs/PIPELINE.md` (stage 3 and brief); test
`tests/pipeline/batch-draft.test.mjs`.

**Interfaces — produces:**
- CLI: `npm run batch -- draft <BOOK> --out <dir> --structure <private dir> [--size 20] [--kind <kind>]` (`--structure`
  mandatory; same path guards as triage).
- `cutDraftBatches(records, { size = 20, kind, after, queued, core }) → [{ id: "<book>-draft-<NNN>", stage: "draft", entries }]`
  — records with `verdict: "entry"`, no `rule`, text present, at least one matched item, not in `drafts-queue.json`; official
  matched first (Ruling R8). Entry: the triage batch entry plus `identifier`, `keys` and `similar` of `evidence.triaged`, `why`
  only when it passes the 8-word quotation check against the cached text (`gates.mjs` `quotationCheck`; withheld and counted
  otherwise, and always without the text: fail closed), and `examples`: at most three `{ identifier, entry }` stripped to ids,
  engine words, formulas and numbers, from Core's `SHIPPED` or the pack's gated rules (the triage `similar` first, then the
  ones sharing most top-level keys with `keys`, then the canonical example of the keys most used by shipped rules of the kind).
- `<dir>/draft-vocabulary.json` written with each cut: `DRAFT_KEYS`, moments, step types, facts, statuses, the `assert`
  vocabulary, the value shape of every key and assertion field, the type of every fix path, one canonical example per key —
  engine data only, safe to commit. `<dir>/<book>-draft-report.json`: counts only (cut, each reason left out, `why` withheld).
- Brief (in `docs/PIPELINE.md`): what a drafter reads (batch, structure, text cache, vocabulary; never `registry/`), the results
  format `{ batch, by, results: [{ key, outcome: "rule"|"person"|"code"|"engine", why, confidence, rule? }] }` with `rule: {
  handledIn: "table", adds, entry, origins, uncovered?, assert }`, ids taken only from the structure file, origins side by side,
  one origin for `single` slots, no prose, no rule from memory, "no text, no rule".

- [ ] Failing tests: `cuts entry records without a rule`, `leaves queued and ruled records out`, `numbering continues per series`,
      `examples come from similar first`, `no text is embedded`, `vocabulary file has no premium data` (only engine words);
      implement; `npm test` PASS; commit `Pipeline: draft batches and the drafter brief`.

**Parked** (review findings of Task 4 kept for later): structure files are named by batch id only (`<id>.structure.json`), so
two books or runs sharing one `--structure` folder can overwrite each other (as for triage).

### Task 5: `ingest --draft`

**Files:** modify `tools/pipeline/triage.mjs` (shared checks moved to `tools/pipeline/intake.mjs`), create
`tools/pipeline/draft.mjs`, modify `cli.mjs`, `docs/PIPELINE.md`; test `tests/pipeline/draft.test.mjs`.

**Interfaces — produces:**
- CLI: `npm run ingest -- <results-file> --draft` (with `--second`, `--overwrite` or `--review`: usage error).
- The ingest never copies `evidence` (nor `evidence.person`, a person's signature) from a results file: a result that
  carries one is rejected.
- `ingestDrafts(records, results, { textDir, by, at, core, queue }) → { records, applied, queued, rejected }`. A result is rejected
  (others applied) when: an unknown field; unknown key; verdict not `entry`; the record already has a rule; no text in the cache;
  `outcome` unknown; for `rule`: schema errors, `checkDraftKeys(entry, { origins: rule.origins, kind: record.kind })`,
  `core.validateEntry` with the real fact list, `checkIds` (R4,
  R5), prose rules (Global Constraints), `assert` invalid or empty. `person`, `code`, `engine` outcomes and any rule with
  confidence < 0.7 go to `drafts-queue.json` (reason = outcome or `low-confidence`); the verdict is not changed.
- An applied rule: `rule` written with `alsoAs` and (for monsters) `identifier` filled by Task 2's functions, `origin`
  (R17: a display label, ≤ 60 printable ASCII) derived from owner/level for features, no `code` (a `code` outcome is
  queued; a person writes the script and names it in `rule.code`, R18), `evidence.drafted = { by, at, core, rule }`; state
  `drafted`. Books and the queue are written in
  one step (both files to temporary names, then renamed), closing the TODO item about two-step saves.
- Prints `{ applied, queued, rejected }`; exit 1 when anything was rejected.

- [ ] Failing tests: one per rejection reason, `applies a valid two-origin rule`, `fills alsoAs from identifierDiffers`,
      `queues engine and code outcomes without changing the verdict`, `rejects prose in entry strings`, `rejects a quotation in
      adds`, `writes books and queue atomically` (a failing second write leaves both unchanged); implement; `npm test` PASS;
      then `npm run gates` on a synthetic registry gives `gated`; commit `Pipeline: ingest drafted rules`.

### Task 6: Independent review — `batch review`, `ingest --review`

- (Added with Task 5's fixes.) Every record whose `evidence.drafted` carries `person: true` (`because: "noReactions"`, Ruling
  R15, or `because: "official-uncovered"`, Ruling R21; stamped by `ingest --draft`, required by the schema, covered by
  `emits`) goes to `review-queue.json` whatever the review says, agreement included: `ingest --review` never writes
  `evidence.reviewed.agrees: true` for it.

**Files:** create `tools/pipeline/review.mjs`; modify `batch.mjs`, `cli.mjs`, `docs/PIPELINE.md` (stage 5, reviewer brief); test
`tests/pipeline/review.test.mjs`.

**Interfaces — produces:**
- CLI: `npm run batch -- review <BOOK> --out <dir> --structure <private dir> [--size 30] [--kind <kind>]`; entries are those of a
  triage batch (no rule, no `adds`, no `assert`, no triage `keys`/`similar`, no drafter handle) plus `rule: <fingerprint>` so
  the answer is tied to the rule it reviewed. Only records in state `gated`, not in `review-queue.json`.
- Reviewer results: `{ batch, by, results: [{ key, rule, assert, why, confidence }] }`.
- `ingestReviews(records, results, { textDir, by, at, queue }) → { records, agreed, disagreed, rejected }`: rejected when `by`
  equals `evidence.drafted.by` (case aside), `rule` is not the current fingerprint, `assert` invalid, `why` quotes the text.
  Agreement (Ruling R9): `normaliseAssert(review) ⊇ impliedAsserts(entry)` and `normaliseAssert(review)` equals
  `normaliseAssert(rule.assert)`, no `free`, confidence ≥ 0.7 → `evidence.reviewed = { by, at, agrees: true, rule, confidence }`.
  Otherwise a `review-queue.json` entry with both readings side by side (`draft` and `review`), reason `disagreement`,
  `free-text` or `low-confidence`; nothing written on the record.
- A person settles a review-queue entry by editing the rule (which makes all evidence stale) or by
  `npm run pipeline -- review-accept <key> --because "<one line>" --by <handle>` (writes `reviewed` with `by` = the person,
  `agrees: true`).

- [ ] Failing tests: `agreement writes reviewed with the rule fingerprint`, `same reviewer as drafter rejected`, `stale rule
      fingerprint rejected` (Review Focus 4), `free assertion always queued`, `implied assertion missing from the review queues
      it`, `review batch carries nothing of the draft`, `review-accept needs because`; implement; PASS; commit
      `Pipeline: independent review of drafted rules`.

**Parked** (review findings of Task 6 kept for later): the reason `free-text` is stated only when both sides hold a `free`
in the same assertion (a `free` is part of the canonical form, so one on one side only shows as `disagreement`; it still
reaches a person); review batch numbering continues per `--out` folder only, as for drafts (two folders can reuse an id).

### Task 7: Scenarios and played evidence

**Files:** create `tools/pipeline/scenarios.mjs`, `tools/pipeline/played.mjs`, `play/lib/steps.mjs` (a scenario module for the
engine's runner), generated `play/<book>/<slug>.json` and `play/<book>/<slug>.mjs`; modify `cli.mjs`, `package.json` (scripts
`scenarios`, `played`), `docs/PIPELINE.md` (stage 6); tests `tests/pipeline/scenarios.test.mjs`, `tests/pipeline/played.test.mjs`.

**Interfaces — produces:**
- `scenarioOf(record) → { scenario: "<book>/<slug(key)>", key, rule, origin, client: "gm", manual, setup, steps }` from
  `rule.assert`: `setup` = the official item by docId (else the first origin in `origins`) on the arena's caster, the target an
  SRD 2024 actor (`actors24`) chosen from the vocabulary of `given`; `steps` = `{ use: <activity id> }`, `{ force: roll }`,
  `{ advance: moment }`, `{ check: <one normalised assertion> }` per assertion. `manual: true` when a step has no interpreter
  (a `free` assertion, a zone, a movement the runner cannot force): then the JSON is a checklist for a person.
- CLI: `npm run scenarios -- <BOOK> [--check] [--plan]` writes the JSON (and, unless manual, a two-line `.mjs` that calls
  `scenario(json)` from `play/lib/steps.mjs`) for every record in state `reviewed`; `--check` compares only; `--plan` prints
  run order by family (Ruling R11). Generated files carry ids and engine words only.
- `play/lib/steps.mjs` `scenario(json)` → `{ name, run(ctx) }` for `node tools/scenario.mjs <folder>` of `DAS_CORE`; it uses
  `ctx.cast`, `ctx.engine(...)`, `ctx.expect`, `ctx.restore` only, and logs the stamp line of Ruling R10 last.
- CLI: `npm run played -- <runner-log> --world <name> [--client gm|player]`: for each stamp line whose scenario passed with
  `checks ≥ 1` and whose `rule` is the record's current fingerprint, writes `evidence.played = { at, core, world, scenario,
  client, rule }`; prints `{ played, skipped }` with a reason per skipped scenario. Never writes for a `manual` scenario: a person
  playing a checklist records it with `npm run played -- --manual <key> --world <name> --because "<one line>" --by <handle>`,
  which marks `played.manual: true` (shown as "played by hand" in the README, counted apart).

- [ ] **Step 1:** Read `tools/scenario.mjs` and `module/scripts/runtime/testing.mjs` of `DAS_CORE`: list which `testApi` functions
      can place an item on an actor, use an activity, force a save or attack outcome and advance a turn; the interpreter supports
      exactly those, every other step is `manual`. Report the list.
- [ ] **Step 2:** Failing tests: `scenario from a saveDamage rule`, `free assertion makes it manual`, `plan puts one rule per family
      first`, `played writes evidence for a passing stamped scenario`, `played skips 0 checks`, `played skips an old rule
      fingerprint`, `played skips a failed scenario`, `generated files hold no text` .
- [ ] **Step 3:** Implement; PASS; commit `Pipeline: scenarios from assertions and played evidence from the runner log`.
- [ ] **Step 4 (main session only, not a subagent):** on the test server, after a world backup, run the pilot's scenarios with the
      engine's runner, GM client first, `| tee <private log>`; `npm run played -- <log> --world <name>`; commit the registry.

### Task 8: Re-reading stale verdicts

**Files:** modify `tools/pipeline/triage.mjs` (`ingest`, `ingestSecond`), `batch.mjs`, `cli.mjs`, `schema.mjs`; create
`tools/pipeline/stale.mjs`; `docs/PIPELINE.md`; test `tests/pipeline/stale.test.mjs`.

**Interfaces — produces:**
- `evidence.triaged.items: { <origin>: <data.sha256> }`, written by every reader ingest from the record's matched items.
- `staleOf(record) → null | "data" | "text"`: a reader-set verdict (not `by: "rule"`, no `rule`) whose `triaged.items` differs from
  the current matched items' fingerprints, or whose record has `textChangedAt`.
- CLI: `npm run batch -- triage <BOOK> --out <dir> [--structure <dir>] [--size <n>] [--kind <kind>] --stale` cuts those records
  (ids `<book>-stale-<NNN>`), activity-or-effect-id changes first; `ingest <file> --stale` replaces the verdict only for records
  `staleOf` names, keeps the old one in `evidence.triaged.previous: { verdict, by, at }`, and queues a change from or to `entry`
  when the record has a rule (a rule is never dropped by a re-read).
- CLI: `npm run pipeline -- stamp-triaged <BOOK> --from <registry file of the reading's date>` fills `triaged.items` where
  missing from the item fingerprints in that file (Ruling R14); a person exports the file with `git show <commit>:registry/…`.

- [ ] Failing tests: `ingest stamps triaged items`, `changed data fingerprint is stale`, `textChangedAt is stale`, `rule-set
      verdicts are never stale`, `stale cut orders id changes first`, `stale ingest keeps previous`, `stale change away from entry
      on a ruled record is queued`, `stamp-triaged fills only missing stamps`; implement; PASS; commit
      `Pipeline: re-read verdicts whose item or text changed`.
- [ ] Real run: `stamp-triaged XPHB` and `EFA` from the commits before Player's Handbook 3.0.0 and Forge of the Artificer 2.0.0;
      cut `--stale`; reader agents read; ingest. Commit `Re-read: <BOOK> after module update`.

### Task 9: Pilot, then volume in order

**Files:** `registry/*.json`, `play/**`, `docs/pilot-m3.md`, `docs/coverage-5e24.md`, `README.md`, `TODO.md`, `CHANGELOG.md`,
`docs/RULES.md` (generated by `npm run books`).

- [ ] **Pilot (~40 rules, Ruling R13):** `batch draft XPHB` for spells, feats, options, species, items, then 17 features; drafter
      agents; `ingest --draft`; `gates`; `batch review XPHB`; reviewer agents (other handles); `ingest --review`; `scenarios XPHB
      --plan`; main session plays (Task 7 step 4); `played`; `build:rules`; `books`. One commit per stage.
- [ ] `docs/pilot-m3.md`: per stage, entries in, passed, queued (by reason), rejected (by reason), minutes per entry, and the
      drafter key histogram — counts only. Decide go / revise against Ruling R12 and write the decision there.
- [ ] Volume, after a go: XPHB remaining features, XDMG items, XMM monsters (official only, R3), then EFA, FRHOF, FRAIF, each book
      kind by kind in R13's order; after each book `gates`, `build:rules --check`, `books --check`, commit `Rules: <BOOK>
      <kind>`. A batch whose rejection or queue share is twice the pilot's is redone, not patched (spec §3).
- [ ] Update `docs/PIPELINE.md` ("Not built yet": only drift and sampling remain), README pointer, TODO and CHANGELOG; `npm test`,
      `gates --ci`, `build:rules --check`, `books --check` PASS; commit `Rulebook pipeline: drafting, review and play`.

## Not in this milestone

- Drift (`npm run drift`: reopening records on a new engine or module release), and the per-release sampling of `reviewed`-only
  rules with its published failure rate (threshold proposed from the pilot's numbers, spec §4).
- Plutonium (no dump; its matches stay `unchecked`, rules list it as not checked).
- Books without an official module, and older books' monster features without an item (they need imported-item dumps first).
- Drafter keys outside `DRAFT_KEYS`; `code` rules (written by a person); data fixes on items embedded in actors.
- ~~`actor.item` sources for shared embedded item ids: an upstream issue, not pack work.~~ Upstream accepts them now: Ruling
  R35.
- Leaving legacy for the 24 migrated rules; the 437 triage-queue entries for a person; the 168 ambiguous official matches.
- Play from a player's client (`players: true` scenarios) beyond what the pilot shows is needed.

- **R36 (2026-11-22).** CI runs against the engine's latest release, which can predate a capability the registry was gated
  with on the engine's main branch. Under `--ci`, an `<actor id>.<item id>` source the release refuses is not a failure; a
  full run of the gates still fails it, and the shipped module skips such a rule on an older engine by itself. The two
  engine tests of the capability follow what the clone has instead of pinning it true. Cost if wrong: CI would stay green
  for a rule no released engine can bind; the rule is still skipped at registration, never bound to the wrong creature.
- **R37 (2026-11-22).** The engine's main branch has `saveAutoFail: { types: [creature types] }` (a creature of those types
  fails the item's save without rolling; a type on both sides fails, core/conditions.mjs `typeAutoSave`); its latest release
  does not. `loadCore` asks the engine itself (`ENTRY_KEYS` and its own validateEntry on a probe, never its version) and
  gives `core.saveAutoFail`. The key is a drafter key (`slot: none`, only `types`, a zone key beside `saveAutoSuccess`,
  `draft-keys.mjs` `ENGINE_CAPABILITIES`), offered in `draft-vocabulary.json` and a batch's `allowed` only when the engine in
  use knows it; draft ingest refuses it otherwise; a full run of the gates fails a rule that uses it on such an engine and
  `--ci` does not (as R36), the engine being asked about the rest of the entry either way. It implies one `roll: { mode:
  autoFail, on: save, for: target }` given each `targetType`; `autoFail` is a roll mode beside `autoSuccess`. The shipped
  module now asks the running engine (`api.content.validate`) before registering and leaves out a rule it refuses, with its
  aliases and sources, in one console line (`scripts/known-entries.mjs`): the engine's register() dropped such an entry but
  kept its sources, so the item was rebound to an identifier with no entry. Cost if wrong: a rule with the key ships while
  every released engine refuses it, so it does nothing until DAS · Core is updated (said once in the console); a drafter
  on an older engine answers `engine` for a text the key would say, and that record waits for a redraft.
- **R38 (2026-11-22). Reactions, teleports and light are drafter keys, in a closed form; a reaction word is said at its
  moment.** The drafts queue's `why` lines (206) decline, read by eye, parries, a hit turned into a miss, a counterattack after
  a miss, a self teleport, a reaction on every turn and a glow "for want of a key"; the engine has each (content/triggers.mjs
  `parry`, content/monsters.mjs `reactive`, core/content/annex.mjs validateTeleport and validateLight). Admitted, in the
  closed shapes of `reactions.mjs` and `draft-keys.mjs`: four `triggers` declarations, steps in order (shape type `tuple`),
  a condition of one attack fact (`activity.isAttack|isMelee|isWeapon|isSpell`: at a hit the engine's target is the
  reactor) — `isHit` `use` + `penalty` (`@prof` or 1 to 10, the AC raised against that attack), `isHit` `use` + `miss`,
  `isMissed` `use` with `target: source, weapon: true`, `isHit` `damage` `to: source` by an activity of the item; and
  `reactions: { perRound: 2..20 }`, `teleport` (activity, or a distance of 5 to 300 ft; `then`, `after: attack`),
  `swapPlaces: { activity }`, `light: { on: effect, bright?, dim?, units: ft }`. Every other field is refused with why
  (`EXCLUDED_REACTION`: a declaration's `via`, `free`…, a damage formula, passengers, a light of an area…), and the keys and
  hit steps of the territory not admitted are named with why (`counter`, `damageShield`, `carriedLight`, `transpose`,
  `afterTeleport`, `forOneAttack`; `halve`, `uncrit`, `reduce`, `reroll`, `resist`, `save`). Words: `acBonus`
  (proficiency or 1..10), `hitBecomes: miss`, `attackerTakes: activity` (at `isHit`), `counterattack: meleeWeapon` (at
  `isMissed`), never with a roll; `reactionsPerRound` once for the item; `teleports: self|swapsWithTarget` at the use or on a
  hit or a miss; `sheds: light`. Unassertable, so stamped (R15): a teleport's own distance or arrival activity, every light
  (radii). `loadCore` reads the validators' own lists (`reactionFields`, `stepFields`, `declarationFields`,
  `hitWindowSteps`) and a DAS_CORE test fails on a field or hit step in neither a shape nor a table with why. Every admitted
  key and step is in the engine's latest release: nothing is gated (R37's mechanism stays for keys that are not). Engine
  gaps: a teleport of the TARGET, damage doubled against objects, a miss only on the attacker's failed save. Measured
  (repository registry unchanged; a copy gated: 19 143 records, 0 failing, the 101 ruled records keep their states and
  emission, registry, generated modules, README and RULES.md byte-identical): 19 of the 206 queue entries name a mechanic
  this makes writable, about 11 whole (a reading of free `why` lines, not a closed field). *Cost if wrong:* (a) a reaction
  declaration costs the creature's one reaction: a text whose single reaction raises AC and then counterattacks cannot be
  written (a second `use` would never be offered), and a drafter who writes both ships a counterattack that never fires —
  the brief says so, review cannot see it (both words agree), play is manual; (b) "while holding a weapon" is dropped by
  every parry (the engine itself does not check it): a disarmed creature still parries; (c) `acBonus: proficiency` against a
  printed number compare unequal: a reviewer who reads "+3" where the drafter wrote `@prof` disagrees, more for a person;
  (d) `reactionsPerRound: 20` stands for "one on every turn", the engine's own reading, which allows more than one a round
  in a combat of many creatures exactly as the text does but never two in one turn; (e) `teleports: self` says nothing of
  how far: a draft with a wrong `distance` agrees with any review (stamped, a person reads it); (f) a light's `dim` is the
  outer radius as Foundry counts it, a drafter reading "dim light for an additional 10 feet" as `dim: 10` halves it unseen
  by review (stamped, a person reads every light); (g) nothing here is played: every new word is manual.
- **R39 (2026-11-22). A drafter's decline is offered again, once, blind; the entry stays as it was unless a rule is
  taken.** The 206 drafts-queue entries were declined before the drafter vocabulary grew five times (R30, R33, R34, R37,
  R38) and before the item summary a drafter sees was corrected twice, and a queued entry is never cut again. `batch draft
  --reoffer` cuts the entries `batch.mjs` `reofferable` accepts — a reason of `REOFFER_REASONS` (`person`, `code`, `engine`,
  `low-confidence`; a clash stays a person's), signed by a `drafter…` handle that `docs/owners.json` does not list, no
  `reoffered: true`, its record still an unruled, non-legacy `entry` — with every other reason of the plain cut still
  applied, as ordinary draft entries (nothing of the decline: reason, `why`, handle, confidence, kept draft) in batches
  marked `reoffer: true`, report `<book>-draft-reoffer-report.json`. `ingest --draft --reoffer` (refused on a batch without
  the mark, the mark refused without the flag, never with `--redraft`) runs every draft check: an applied rule is written as
  in a plain draft ingest and the entry leaves the queue; for every other offered entry (a decline again, a clash, a low
  confidence, a rejection, a key the results file leaves out) the entry is kept as it was plus `reoffered: true` (the queue
  schema allows the mark in drafts-queue.json only, `true` only). The old `reason`, `by`, `why`, `confidence` and `draft`
  are kept, not replaced by the reoffer's: the entry is the decision a person settles, and the reoffer is one extra chance,
  not a new reading of the queue (as R31 replaces a reread only because a restate IS a reading of the same record);
  replacing them would also turn a decline of the old vocabulary into one of the new without anyone comparing the two.
  Measured (repository registry unchanged, cut into a scratch folder against the engine's main branch): XMM 192 entries cut
  in 10 batches (11 left out as "engine reads it: reread first", 533 not reofferable), FRAIF 3 in 1. *Cost if wrong:*
  (a) the mark is one-shot: a reoffer drafter who declines a text the vocabulary could say leaves it for a person, never
  reoffered again without a new ruling that clears the marks; (b) the new decline's `why` (written against today's
  vocabulary, perhaps naming exactly what is still missing) is lost from the registry: only the results file holds it,
  and a person reads the older, staler reason; (c) a low-confidence entry's kept `draft` is the old one even when the
  reoffer drafted a better rule below the threshold; (d) owners are told apart by `docs/owners.json` and the handle's
  `drafter` prefix: an entry hand-written under a drafter-looking handle would be reoffered; (e) the mark does not name the
  vocabulary it was offered against, so a later growth of the vocabulary needs its own ruling to reoffer again.
- **R40 (2026-11-22). A review disagreement or an unsure review is broken by a blind second review, once.** The 41
  review-queue entries queued `disagreement` (34) or `low-confidence` (7) waited for a person although, for triage, a blind
  third reading already settles two readers who disagree. `batch review --second` cuts the entries `review.mjs`
  `secondReviewSkipReason` accepts — one of those two reasons, no `second` mark, drafted by an agent (no `evidence.person`,
  no owner's drafter handle, no stamp for a person), the entry's draft and review about the rule as it is, gated — as
  ordinary blind review entries, in batches marked `second: true`, numbered `<book>-review-second-<NNN>`, report
  `<book>-review-second-report.json`; the reviewer brief is unchanged. `ingest --review --second` (refused on a batch without
  the mark, the mark refused without the flag) compares with the SAME comparison as a first review: an agreement with the
  draft at or above 0.7 confirms the rule as an agreeing first review does, plus `evidence.reviewed.via: "second-review"` and
  `first` (the first review as data), and the entry leaves the queue; anything else (a disagreement, an agreement below the
  threshold, an unexpressed answer, a rejected result, an offered entry left unanswered) keeps the entry as it was plus
  `second: { by, at, agrees: false | "unsure", result, ... }`, final, with `withFirst: true` when the second review's
  assertions agree with the first's. The bar is two independent readings of three agreeing: the draft and one reviewer.
  `docs/RULES.md` counts the shipped rules so settled. Measured (repository registry unchanged, cut into a scratch folder
  against the engine's main branch): XMM 38 entries in 2 batches (21 other reasons left out), XPHB 1 (1), XDMG 1 (1),
  FRAIF 1 (2): the 41 entries. *Cost if wrong:* (a) the draft is one of the two readings that agree, and it is not
  independent of its own errors: a draft and a second reviewer who share a misreading (the same words of the vocabulary read
  the same wrong way, the same item structure misleading both) ship it over a first reviewer who read it right, with no
  person in the loop and no third review to outvote them; (b) the first review's disagreement is kept as data
  (`evidence.reviewed.first`) but nothing reads it again: a confirmed rule is `reviewed` like any other, and only the
  RULES.md count says how many stand on a tie-break; (c) the mark is one-shot and a rejected or missing answer burns it (a
  results file signed with the first reviewer's handle, or a text missing from the cache, leaves the entry for a person
  without a second reading; a new ruling must clear the marks); (d) a `low-confidence` entry is one the first reviewer
  agreed with, unsure: a second agreement settles it on two agents' word where a person was the bar; (e) the second
  reviewer's `why` is not stored on the mark (data only), so a person reads the first `why` and the second's assertions,
  and must open the results file for its words; (f) `withFirst` uses the comparison's direction (the first review as the
  stated side), so two reviews that agree only up to a detail the second pins and the first does not are not called agreeing.
- **R41 (2026-11-22). Two blind reviews that read the text alike against the draft settle a new draft.** After R40, 12
  review-queue entries carry `second: { agrees: false, result: "read", withFirst: true }`: two reviewers who never saw the
  draft read the text the same way, and the draft says something else. A blind review states what the TEXT requires, so both
  stay valid for any later draft of the same record while its text and item are unchanged. `batch draft --redraft
  --against-reviews` cuts the records `against.mjs` `againstReviewsSkipReason` accepts — reason `disagreement` or
  `low-confidence`, that `second` mark, no `redraftedAgainst` mark, a rule no owner wrote or signed, not legacy, the entry
  about the rule as it is, an `entry` record with a text, unchanged since the reviews (no `textChangedAt`, `gated` with its
  item fingerprints `evidence.gates.items` = today's `items[].data.sha256`, gate evidence dated no later than `second.at`) —
  as ordinary blind draft entries in batches marked `redraft: true, againstReviews: true`, report
  `<book>-draft-against-reviews-report.json`. `ingest --draft --redraft --against-reviews` runs every draft check, replaces the
  rule as R32 does (marked `redrafted: true`), and compares the new rule with the first review and with the second as stored
  (`review.assert` / `confidence`, `second.assert` / `second.confidence`: R40 already stores both, so the 12 existing entries
  need no results file), by `compareAsserts`, no new tolerance, each agreement held to the 0.7 bar on that reviewer's own
  confidence. Both agree: `evidence.reviewed` by the first reviewer, `via: "redraft-against-reviews"`, `second: { by, at,
  confidence, assert, tolerated? }`, the entry out of the queue; a rule reviewed like any other once regated, counted apart in
  `docs/RULES.md`. Otherwise the new rule is kept, the entry stays queued about it (`draft`, `review` against the first,
  reason `disagreement`, `free-text` or `low-confidence` as a first review would say) with `redraftedAgainst: { by, at,
  result: "compared", agreesFirst, agreesSecond }`; a decline, a clash, a low confidence, a rejection or a missing answer
  leaves the record and the entry as they were with `redraftedAgainst: { by, at, result }`. Measured (repository registry
  unchanged, cut into a scratch folder against the engine's main branch): XMM 11 entries in 1 batch, FRAIF 1 in 1, XPHB and
  XDMG none: the 12. Five of them have two reviewers at or above 0.7 and can be confirmed; seven have a reviewer below it and
  can at best be kept, `"unsure"`. *Cost if wrong:* (a) two reviewers who share a misreading (the same vocabulary word read
  the same wrong way, the same item structure misleading both) now ship a draft that agrees with them, with no person in the
  loop — R40's cost (a) with the draft no longer an independent reading; (b) the reviews are taken as valid for a new draft
  although each was written for an entry whose draft it never saw: a reviewer whose assertions depended on what the batch
  offered at the time (the item summary, the vocabulary of that day) is held to them; (c) "unchanged" is proved by gate
  dates, since no fingerprint sits on a queue entry: an engine release or any other cause that re-dates the gate evidence
  after the second review refuses the record (fail closed: the 12 become uncuttable after a `npm run gates` that changes
  their evidence), and a change of item data between the first and the second review is not seen (the first review has no
  date); (d) the mark is one-shot and a rejected or missing answer burns it (a new ruling must clear the marks); (e) a kept
  entry's `second` keeps its comparison lists about the older draft, so a person reads `redraftedAgainst` for how the new
  one stands against the second review; (f) the confirmed review is signed by the first reviewer and dated at the ingest,
  not when the review was written; (g) a `redrafted: true` mark also keeps R32 from redrafting the new rule later, even if
  it changes the engine's reading.
- **R42 (2026-11-23). A non-monster `entry` is reread, blind and twice, against the engine's own class of its item.** The
  features, spells, items, feats, species and options triaged `entry` ("needs a pack rule") were judged by readers who never
  saw what DAS · Core does with the item, and the engine has gained many rules since. The engine classifies every item itself
  (its automation badge: `rule` with the rule keys it recognises, `auto`, `passive`, `manual`, `none`); a live sweep of a test
  world writes that class per record into a private file (`RULEPACK_ENGINE_VIEW`, never in the repository, checked whole by
  `reread-items.mjs` `parseEngineView`). `batch reread <BOOK> --items [--second]` cuts the unruled, non-legacy, unqueued
  non-monster `entry` records with text, a matched official item in the dumps and a level in the view, as triage entries
  without the hint plus `engineView: { level, rules }`, the definitions of the level and of each rule key named (a drafter
  key's short definition where one exists, otherwise "an engine rule of that name, not described here") and the view's
  fingerprint (`{ core: DAS_CORE's version, sha: SHA-256 of level and rules }`). The reader answers `covered: true` with
  `coveredBy` (`engine`: a rule of the engine does it; `data`: the item's own activities and effects on the common path do it;
  `nothing`: the text asks nothing to automate in combat), or `covered: false` with `beyond` / `unexpressed` (the monster
  reread's closed vocabulary), with a confidence and an own-words `why`. `ingest --reread --items` makes a covered answer at
  0.7 or more a provisional verdict set by rule (`engine`: `core`, `data`: `data`, `nothing`: `none`, with `was` and a fixed
  why, `schema.mjs` `ITEM_REREAD_WHY`) and takes the record out of the drafts queue; a level that contradicts `coveredBy` is
  refused (`engine` needs `rule`, `data` needs `rule`, `auto` or `passive`; on `manual` or `none` only `nothing` can be
  covered). A blind second reader with another handle must agree on `covered` and on `coveredBy` to confirm; anything else
  gives the record back its `entry` (fail closed), `hint: "beyond-engine"` when it found something beyond. Not covered
  keeps `entry` with the hint and the data, which `batch draft` hands the drafter as `beyondEngine` (now for every kind). The
  schema holds `evidence.triaged.reread.view` and `coveredBy` and ties them to the verdict under `gates --ci`, which never
  reads the view; the local gates note "stale: read again" for a view judged by an older engine than `DAS_CORE`'s, or, with
  the file given, a view that classifies the item otherwise or has no level for it. Measured (repository registry
  unchanged, cut into a scratch folder against the engine's main branch, DAS · Core 0.290.0): XPHB 112 entries in 4 batches
  (rule 16, auto 44, passive 3, manual 49; 3 ruled and 30 with no matched official item left out), XDMG 43 in 2 (rule 4,
  auto 32, passive 1, manual 2, none 4; 2 ruled, 41 no matched official item), EFA 49 in 2 (rule 1, auto 22, passive 14,
  manual 12; 4 no matched official item): the 204 records of the view. *Cost if wrong:* a covered answer rests on the
  engine's own classification plus two readers, and a wrong one hides a missing rule: the record leaves the drafts queue as
  `core`, `data` or `none` and nothing automates what the text asks, with no gate to say so (only a play or a person finds
  it). In particular (a) the level is the sweep's, of the engine the test world ran, while the fingerprint names the
  `DAS_CORE` clone's version: a world on another engine than the clone makes the two disagree unseen; (b) `rule` lists rule
  keys, not what they do: most keys have no definition here (of the 20 keys in the view, only `globe`), so a reader may take
  a rule for more than it does; (c) `data` trusts that the common path plays the item's data as written, which the view
  says per item but not per activity (an `auto` item whose one activity the engine skips reads as covered); (d) two readers
  who share a misreading confirm it, as in R40 and R41; (e) a change of engine version makes every item reread stale and
  cut again (reader time), since the view cannot be recomputed offline; (f) a revert does not restore the drafts-queue
  entry (as for monster rereads).
- **R43 (2026-11-23). An engineered rule is proven by one recorded live play, not by a review.** The drafter vocabulary
  (R6) is a closed subset of the engine's entry keys so that a blind reviewer can check a draft by assertions; most entries
  left need keys outside it, which an engineer (an agent who reads the engine's source, or the main session) can write but
  no assertion can check, and until now only an owner's signature (`evidence.person`, never an agent's) let such a rule
  through. A rule may now carry `engineered: { by: "engineer-<name>", at, otherItems?, leavesNote? }` (part of the rule and
  of its fingerprint; `by` never an owner of `docs/owners.json`; an engineer's handle is an agent's for every other
  signature). On such a rule the drafter limits and the assertion requirement are lifted (any key of the engine's
  ENTRY_KEYS; `assert` optional), and every other gate holds: the schema, the engine's own `validateEntry`, the ids of the
  matched official item (another item's ids only through the closed list `otherItems: [{ docId, why }]`, each looked up in
  the dumps when they are read), typed data fixes, the 8-word quotation limit on every prose field (`adds`, `leavesNote`,
  each `otherItems[].why`, the entry's strings), unique identifiers, the official origin only (every other matched origin
  uncovered). `npm run ingest -- <file> --engineered` writes it from a private results file on an unruled, non-legacy
  `entry` record outside queue.json and review-queue.json (one in drafts-queue.json leaves it); a result that fails a gate
  is rejected whole. The rule is `gated`, held ("not-played"), skipped by every review path ("engineered: proven by play")
  and by a redraft, until `npm run played` records a play of its HAND-WRITTEN scenario about the rule as it is (`played`,
  status "played"); a changed rule holds it again ("play-stale"). The scenario is a module a person or the main session
  writes (`play/<book>/<slug>.mjs`, first line `// hand-written (Ruling R43)`, with the helpers of `play/lib/handwritten.mjs`)
  beside `<slug>.json` `{ scenario, key, rule, handWritten: true, checks, covers }`; the generator never writes nor removes
  them, `--check` verifies them, `--stamp-handwritten` refreshes `rule`; the helper withholds the stamp when an expectation
  failed or another number of checks ran than declared. `docs/RULES.md` flags every such rule for the owner and counts them
  apart. *Cost if wrong:* the proof is one play of one situation, written by the same engineer who wrote the rule: it shows
  the rule does what the engineer meant, not that the engineer read the book right, and nothing independent reads the text
  against the entry (no reviewer, no assertion) — a misreading ships with a green play. Hence the flag in RULES.md: the
  owner's reading of each flagged row is the only independent check. Further: (a) the scenario checks what its author chose
  to check (`checks` is declared by the same hand), so a rule can be played on its easy case only; (b) `--stamp-handwritten`
  refreshes the fingerprint without proving the module was read again against the new rule; (c) the helper cannot read the
  registry where the runner runs: a stale JSON is caught by `scenarios --check` before the run and by `played` after (it
  records nothing), not by the helper; (d) the entry word budget of R19 does not apply to an engineered entry (the engine's
  own key names are no drafter words), so paraphrase is bounded by the quotation check and the owner's reading only; (e) a
  forged log is as possible as for R10.

### Ruling R44 — a nested key newer than the engine's release (2026-11-23)

An engineered rule (R43) may hold a sub-key of a key the engine's release knows, added on the engine's main branch after that
release (first case: `usageLimits.<activity>.light`, Cloak of Shadows). No list of the engine names sub-keys, so R36/R37
cannot leave it out of what the engine is asked. Decision: under `gates --ci`, for an engineered rule only, the engine's own
`<path>: unknown key` is not a failure; a full run of the gates, on the engine the rule was gated with, still fails it (a
typo is caught there, and the evidence gate holds the rule to that run). The shipped module already leaves out, on an engine
that refuses it, a rule with its aliases and sources (`scripts/known-entries.mjs`, R37). Cost if wrong: on an older engine
the rule is silently absent (one console warning) until that engine's next release.

### Ruling R45 — a rule on a species trait and the catalogue's counts (2026-11-23)

docs/books.json counts spells, feats, options, items, features and monsters per rulebook; it does not count species traits
(only the modules measured by themselves do, as `trait`). The first rule on a species trait (Construct Resilience, EFA) made
the progress check fail ("counts no species in EFA"). Decision: `tools/books-progress.mjs` `catalogKind` leaves such a rule
uncounted in a catalogue book and counts it as `trait` where the book has that kind; an explicit `rule.catalog` still wins.
The rule ships and is listed in docs/RULES.md; only the per-book bar does not move for it. Cost if wrong: the README's
progress understates the pack by the number of species rules, until the coverage reading counts species traits.

### Ruling R46 — monster features the engine's text layer does not read (2026-11-23)

The monster reread (R29) shows a reader the engine's reading of the feature's text; 498 of the Monster Manual's 736 `entry`
features have none ("engine reads nothing") and no stage read them again. A live sweep of the engine's own classification
of those items (private, like the items' view) says the engine has a rule of its own for 240 of them (by the feature's
identifier: a resistance to magic, a drain, a swallow), plays 131 by the item's data and leaves 127 to the table. Decision:
the item reread (R42, `batch reread <BOOK> --items`) also takes a monster feature in the dumps whose text the text layer
reads nothing of; everything else of R42 holds (the private engine view, two blind readers, the fingerprints). A monster
feature the text layer does read stays with the monster reread. Cost if wrong: a feature confirmed "covered" by two readers
against the engine's view leaves the `entry` verdict while a part of its text is not played; the view's fingerprint makes
the reread stale, and offered again, when the engine or the item changes.

