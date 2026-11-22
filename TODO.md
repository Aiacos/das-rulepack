# ✅ TODO

Data for every non-official spell imported by DDB Importer (activity and effect ids, text): `../darshyne-das/audit/ddb-only-spells.json`.

## Rulebook pipeline

After the pilot (`docs/pilot-xphb-spells.md`):

- [x] Triage of the 114 XPHB spells left by the rule: 97 verdicts applied (95 from the SRD 5.2 reading of November 2026, 2
      by a reader agent), see `docs/pilot-xphb-spells.md`.
- [ ] `registry/queue.json`: 553 entries wait for a person (low-confidence readings and `engine` verdicts).
- [x] Second reading of the queue (`batch ... --queued`, `ingest --second`): tooling done, see `docs/PIPELINE.md`.
- [ ] Run the second reading over the queue; only the disagreements (`reason: "disagreement"`) are left for a person.
- [x] Third reading of the disagreements (`ingest --third`) and the owner's bulk rule for two unsure readings
      (`ingest --settle-unsure`): tooling done, with the written criteria, see `docs/PIPELINE.md`. Still to do: run them.
- [ ] 6 spells without a verdict: Blight, Control Water, Time Stop, Zone of Truth (fixes proposed to DAS · Core), and
      Leomund's Secret Chest and Leomund's Tiny Hut (the official module's identifier differs from the SRD one the engine
      uses — to be checked in play, then reported upstream).
- [x] `npm run resolve` settles an ambiguous match by hand; reprints are recorded and checked by the ids gate.
- [ ] The one ambiguous DDB Importer match (`xphb:spell:flaming-sphere`): the official module and the dataset agree on the
      school, DDB Importer's item has another one — same entry, importer data to be reported; settle it with `resolve`.
- [ ] Plutonium: dump its items and run the check; every Plutonium match is `unchecked` for now.
- [ ] 2,209 entries have the verdict `entry` and no rule yet: drafting is built (`batch draft`, `ingest --draft`); run it.
- [x] Second-reader sample (200 entries, three kinds): same verdict on 88%, same answer to "needs a rule or not" on 96.5% —
      `docs/reader-agreement.md`. Spells, species and older books are not sampled yet.
- [x] `plainText` kept only the first argument of attack tags (`{@atkr m}`, `{@hit 7}` became "m 7"): now renders the headers
      (`tools/pipeline/text.mjs`, `TAG_RENDER`). Inventory refingerprints a header-only change without `textChangedAt`
      (`rerendered` in its report, Ruling R1); the real books are re-run per book.
- [ ] The stages not built: drafting, independent review, scenario generation and play, drift.
- [x] Every kind of entry is inventoried (milestone 2), and six 2024-era books are in the registry: `docs/coverage-5e24.md`.
- [ ] 15 entries still have no verdict and are not queued (entries without text that no batch can carry: species shells and
      a few text-less lines); all six 2024-era books were read by reader agents on 2026-11-21 (76 batches).
- [ ] 168 ambiguous official matches to settle with `npm run resolve`; 425 entries with no official item to look at by category.
- [ ] Ravenloft: The Horrors Within is not in the dataset (no text to fingerprint); Arcana Unleashed and World of Warcraft
      have a local dump since 2026-11-21 but are not in the dataset.
- [x] The older books are inventoried and triaged by rule (2026-11-21): 39 books, 19,143 entries, `docs/coverage.md`.
- [x] Older books: the entries that have an item in a local source are read (2026-11-21). 11,945 entries stay without a
      verdict: almost all are monster features of books with no official module and no local item — they need a dump of
      imported items (Plutonium, or DDB Importer's monsters) before a reader can judge them.
- [x] `batch` skips entries with no item in any origin by default (a flag to include them): reading them fills the
      queue with low-confidence verdicts.
- [ ] The three XPHB feature rules (Dreadful Strikes, Inspiring Smite, Psychic Veil) and the rules of FTD, MPMM, AI and PHB
      are still legacy records without item data: their keys carry no owner, or their book has no dump of that kind.
- [x] A rule whose named origin has `identifierDiffers` (16 spells: the official module and DDB Importer name them
      differently) needs a second identifier before it can pass the ids gate: `rule.alsoAs` (Ruling R2), checked by the ids
      and `unique` gates; filled by `ingest --draft` (not built yet).
- [x] A record that has a rule keeps its identifier and page on re-inventory; `generate` emits `SOURCES` (empty today).
- [x] Before the first drafted rule: a rule for a monster feature needs an identifier scoped to its creature
      (`<book>-<creature>-<feature>`, bound by its embedded item id when no other creature shares it, Ruling R3).
- [ ] A monster feature whose official embedded item id is shared by several creatures (1,480 of XMM's 2,146 features)
      needs `<actor id>.<item id>` sources, which the engine reads but external registration refuses: an upstream issue (no
      book named). A data fix on an item embedded in an actor has no document the data-fix gate can read yet.
- [x] Before the first non-legacy rule is gated: the ids gate finds ids inside `#id`, `a/b` and `@UUID[…]` strings; a data
      fix without `from` on a mistyped path fails.
- [ ] The TCE legacy rules name `ddb-importer` alone while their official item is matched: the ids gate holds legacy records
      to the first checks only; their new rules will list the official origin or say why it is uncovered.
- [ ] Before a release built from the registry: run the local gates (dumps and text cache) and fail on any registry difference.
- [x] `ingest` saved the books and the queue in two steps: every ingest now writes them in one step (temporary files, then
      renamed; `registry.mjs` `writeFilesAtomically`).
- [ ] The 24 migrated rules have no item data attached (`ids`, `fixes`, `text` are notes): attach DDB Importer items by
      inventorying their books, then they can leave `registry/legacy.json`. `saveTashCausBrew` (Tasha's Caustic Brew) is
      to be checked against the imported item.
- [ ] Run the CI workflow on GitHub once (it was only simulated locally, on Node 20, against DAS · Core v0.289.0).
- [x] Trigger conditions (Ruling R30): a drafter's trigger may carry `if` over 14 closed facts (`conditions.mjs`
      `DRAFT_FACTS`), said in `given` by nine new fields; review, the engine's readings and scenarios read them.
- [ ] Redraft the pool R30 makes statable: 29 XMM monster features whose reread named `target-size` (11), `target-state`
      (5) or `trigger-filter` (14) among `unexpressed` (no other book has any); reread or draft them again.
- [ ] Scenarios: a size-limited assertion stages only a target that satisfies the limit; the other side (a target too
      large) and the other condition fields (`targetStatus`, `selfStatus`, `targetWithin`, `targetHp`, `targetHpAtMost`,
      `onOwnTurn`, `damageType`, `activity`) have no interpreter, and `targetType` is still checked on its positive side only.

## Shadow Blade

- [ ] Detect a dropped blade (item deleted or unequipped by the player).
- [ ] Propose `target.inDimLight` / `target.inDarkness` facts upstream, so the Advantage becomes a declarative rule with its
      reason on the chat card.

## Books

Progress by rulebook: README, "Progress by rulebook"; every rule by book: `docs/RULES.md` (both written by `npm run books`). One module per book in `scripts/rules/books/`.

- [ ] Tasha's Cauldron of Everything has an official Foundry module (`dnd-tashas-cauldron`, read on 2026-11-20). The pack's
      TCE rules were written against items imported by DDB Importer: re-check Lightning Lure, Tasha's Mind Whip and Tasha's
      Caustic Brew against the official module's activity and effect ids (and the Lightning Lure data fix against its
      data), and Booming Blade / Green-Flame Blade against its items. Rules unchanged until then.
- [ ] `docs/books.json` is a copy of the audit's counts of 2026-11-19: copy it again when the audit is recomputed. The
      audit's own list of the pack's identifiers misses the rules handled in code alone (Booming Blade, Green-Flame Blade).
- [ ] Official Foundry packages with no book in the catalogue (`docs/foundry-modules.json`, `"book": null`): decide whether
      the catalogue should list them.

## Rules written, to play

- [ ] Still only validated: Zephyr Strike, Holy Weapon, Pyrotechnics, Snare, Watery Sphere, Power Word Pain, Wall of Light,
      Incite Greed. How to play a rule without a mouse: `../darshyne-das/audit/live-helpers.js` (scene "DAS Test Arena").
- [x] Life Sense and Ghostly Gaze: validated by the contract tests against DAS · Core 0.288.0 (`DAS_CORE=<clone of main> npm test`: 59
  passed, none skipped); played earlier on hand-made features (12 cases, GM client). Still to play on an imported creature.
- [ ] Everything from a player's client (so far the GM's client only).

## Next rules

Declarative, waiting on the engine:

- [ ] Maximilian's Earthen Grasp, Whirlwind, Wrath of Nature, Bones of the Earth: an action and an ability check to get free.
      The engine reads a check written without a DC from DAS · Core 0.284.0 (pull request #57, merged): the rules can
      now be written. Maximilian's also rolls
      both of its 2d6 parts at once in the imported data.
- [ ] Enemies Abound: repeat the save when damaged — the imported item has no effect to carry the rule.

Need code, like Shadow Blade:

- [x] Booming Blade and Green-Flame Blade (0.4.0).
- [ ] Booming Blade, Green-Flame Blade: have the engine count the cast as a spell that takes the action (no Extra Attack
      after it). Asked upstream: DAS · Core issue #69 (generic building blocks).
- [ ] Zephyr Strike and Holy Weapon: bonus damage on a hit.

Zones and recurring damage, to study against the engine's zone rules:

- [ ] Create Bonfire, Sickening Radiance, Healing Spirit, Storm Sphere, Immolation, Enervation, Shadow of Moil.

Not planned: spells whose imported data contradicts the text in a way a rule cannot repair (Feeblemind: full damage on a
successful save; Mental Prison: the 10d10 rolled with the 5d10).

## Pipeline — after the 2026-11-21 re-inventory (DDB Importer's monsters, Player's Handbook 3.0.0, Forge of the Artificer 2.0.0)

- [ ] Monster features now carry a `ddb-importer` item: 4,180 matched (880 on an SRD actor, `book-unknown`), 1,148 ambiguous
      (445 `book`, 429 `edition`, 252 `actor`), 7,313 with no DDB actor's item. Cut batches for the matched ones that have no
      official item (older books) and have them read.
- [ ] VGM and MTF match nothing: DDB Importer's dump has their creatures only under the later reprint's abbreviation
      (ambiguous `book`, by design). Decide whether a reprint actor may serve the older book's record after comparing the data.
- [ ] D&D Beyond abbreviations left out of `docs/ddb-books.json` because the dataset code was not confirmed: ToD, WGtE, RtHW, PAitM.
- [ ] Player's Handbook 3.0.0 changed 772 official items and Forge of the Artificer 2.0.0 changed 176: 344 + 160 of them carry
      a reader's verdict made on the older structure. Re-read first the 104 whose activity or effect ids changed.
- [ ] Rule-based `core` is now counted per edition and given to 2024 records only: 44 records of 2014 books went from `core`
      to no verdict with `hint: "core-generic"` and wait for a reader.
- [x] Monster features with a DDB Importer item and no official one are read (2026-11-21): 70 batches, 2,370 results —
      2,220 applied, 150 queued for a person (queue now 553). One batch whose reader had judged by name was read again.
- [x] `structure.mjs` listed an activity's own damage parts only (fixed: base damage of an attack that includes it): an attack that takes its damage from the item
      (`system.damage.base`, as DDB Importer's monster weapons do) shows no damage to the reader. Add the base damage.
- [x] Second reading of the queue (2026-11-21): 468 of the 553 queued entries read blind by another reader — 116 agreed and
      applied, 178 disagreed, 174 agreed below the threshold (`unsure-twice`). The queue holds 437 entries for a person:
      those 352 with both readings, and 85 that have no item or no text to read. Most disagreements are `none`/`entry`
      and `entry`/`data`: the line between "nothing to automate", "the data does it" and "needs a rule" is where a
      written criterion per kind would help more than a third reader.
- [x] Owner-approved written criteria for the two boundaries applied in bulk (2026-11-22): a blind third reading of the 178
      disagreements settled 152 (26 stay, each with three readings); the common verdict of two unsure readings was applied
      to 166 (8 stay). The queue holds 119 entries for a person: 85 with no item or no text, 26 + 8 with their readings.
- [x] Quotation limit is 8 consecutive words everywhere (2026-11-22): every ingest uses the gates' check; 17 triage reasons
      that shared 8-11 words with their text were reworded; a test keeps the registry clean.
- [ ] 8 legacy rules have an `adds` sharing exactly 8 consecutive words with the source (ai:incite-greed, tce:booming-blade,
      xge: holy-weapon, power-word-pain, psychic-scream, snare, wall-of-light, watery-sphere). A legacy record cannot be
      edited in place: take them out of legacy through the pipeline (redraft with `assert`, gates, review) in the pilot.

## Milestone 3 — after the first pilot (2026-11-22, `docs/pilot-m3.md`: 1 rule from 46 entries, decision: revise)

- [x] Triage pre-pass: `core` for what the engine already does (identifiers recognised by its runtime code, features whose
      parts ship under other identifiers, what its content notes leave to the system): `triage <BOOK> --core-prepass`
      (`docs/PIPELINE.md`). Still to do: run it on the registry (a dry run turns 12 XPHB `entry` records to `core`); the
      engine's notes that name features in French prose only cannot be read by it.
- [ ] Widen the drafter vocabulary: the full `triggers` shape, then `emanation`, `duringRage`, `barrier`, `globe`,
      `targets.requires`, `spellDamageTypes`, `usageLimits.whileEffect` (each through the same review as the first 28 keys).
- [ ] Decide whether typed data fixes may apply to a monster feature bound by a unique embedded id.
- [ ] A verdict for "needs engine support" entries and a grouped list of the missing capabilities for upstream.
- [ ] Second pilot on the 2024 Monster Manual's draftable monster features (294).
- [ ] Tasks 7 (scenarios; in progress) and 8 (stale re-reads) of the plan; volume only after a pilot that passes R12.
- [x] Pre-pass run on every book (2026-11-22): 12 `entry` records became `core`, all in XPHB (11 identifiers the engine
      handles in its code, 1 feature whose six options each have an engine entry). The yield is small: what the engine leaves
      to the game system is said only in the prose of its notes, with no identifier to match (5 of the pilot's 11 named
      records are missed for that reason). "Handled in code" can mean handled in part: `spell-breaker` and `war-bond` are.
- [ ] The larger remedy for wrong `entry` verdicts is a re-read with the engine in view: give a reader the engine's notes and
      the code path next to the text (a new reading stage), instead of matching identifiers.
- [x] Second and third pilots on XMM monster features (2026-11-22, `docs/pilot-m3.md`, rules on branch `pilot/m3-xmm`):
      14 rules gated, 7 reviewed (5 by agreement in the third pilot), 6 in the review queue; one played live by hand.
- [ ] Decide what a partial rule is (refused, or accepted with its uncovered part declared as data).
- [ ] Define the timing words of the vocabulary against the engine's behaviour (`bearerTurnEnd`, `casterTurnEnd`,
      `currentTurnEnd`), with an example each.
- [x] Tests that pin the 24 legacy rules (registered set, states, round trip) derive what they expect from the registry
      for every other rule (2026-11-22, `tests/derived.mjs`; docs/PIPELINE.md, Legacy rules). The 7 pass on `pilot/m3-xmm`.
- [ ] The module's `KINDS` (`scripts/rules/book.mjs`) and the Kind column of docs/RULES.md know spell, feature and sense
      only: the 14 `monster` rules of `pilot/m3-xmm` fail "the rules that are not legacy … have the same properties" and
      show as `undefined` in docs/RULES.md. Add the kind there (and its label in `tools/books-progress.mjs`) before merging.
- [ ] Scenario interpreter for moves; match the runner's resolution to the target by token id.
- [x] Volume on XMM monster features (2026-11-22): 75 rules in the registry, 43 shipped, 32 held for a person (R27);
      214 entries in the drafts queue with a reason, 36 in the review queue. `docs/pilot-m3.md` has the counts.
- [ ] The owner's queues: `registry/review-queue.json` (36: the draft and the review side by side, as data),
      `registry/drafts-queue.json` (what no key expresses, by reason), `registry/queue.json` (119 triage entries).
- [ ] From the drafts queue, rank the missing keys by entries blocked (a size limit on targets, effects only on grappled
      creatures, auras, healing blocks, immunity after a save) for the wider vocabulary and the upstream requests.
- [ ] Record as played what is played: nothing is yet (one rule was played by hand before it was re-drafted).
- [x] Scenarios for monster rules are automatic (2026-11-22); 38 of 39 held when played live on the test world.
- [ ] Record them as played: first make the test world report the engine version it really runs (its manifest is stale),
      then replay and run `npm run played`. One scenario (a ranged pull) starts beyond the range the engine accepts: fix
      its starting distance.
- [ ] Missing keys ranked from the drafts queue (214 entries): a size limit on targets (19) is one field on an existing key;
      then advantage or a bonus under a condition (23), state kept across turns (21), an armour-class bonus against one hit
      (14), a reaction that alters a roll (13), a choice at use time (11). 8 queued entries are `data`, 4 are `none`.
- [x] R28 (2026-11-22): every monster rule is held; the engine reads monster features from their text itself.
- [x] Give triage the engine's own reading of a monster feature (2026-11-22, R29): `engineReads` in the structure files of
      the triage, draft and review cuts, the three briefs, and `triage <BOOK> --engine-reading` (hint `engine-reads`, no
      verdict change). XMM: the engine reads something of 287 of 816 monster `entry` records (`docs/pilot-m3.md`).
- [ ] Re-triage the hinted monster `entry` records with `engineReads` in view (XMM 145 outside the queues; FRAIF 32, EFA 13,
      XPHB 7), then the queued ones (the drafts and review queues hold 250 XMM monster records). Tooling: the reread stage.
- [x] Compare the 75 monster rules with the engine's reading (2026-11-22, R29): the engine merges a module entry key by key
      (`triggers` whole); `evidence.reading` stores the comparison, a monster rule ships as its delta only. On a copy: 16
      would ship, 25 change the reading, 25 add nothing, 9 held by R27.
- [ ] Run `npm run gates` on the registry (writes `evidence.reading`), then `npm run build:rules`, `npm run books`,
      `npm run scenarios -- XMM`, and commit: until then every monster rule stays held ("engine-text").
- [ ] The 25 rules "the engine already does it": a person sets `core` (or drops the rule). The 25 that change the reading:
      20 drop an engine trigger (9 a size-limited push): redraft them as supersets of the engine's triggers, or drop them.
- [ ] A `shallow` key that only adds fields (Ruling R29, cost b) is held as a change: decide whether to count it as adds.
- [ ] Recompute `evidence.reading` when the engine the world runs changes (the evidence names the clone's version only).
- [x] Fix round 1 (R29): the rebinding of a monster item to the rule's identifier drops the engine's shipped entry; the
      gates compare before/after, the rule carries over what is lost (`carries`, resolved at registration). On a copy:
      13 ship (2 carry a key), 29 add nothing, 25 change the reading, 8 held by R27.
- [ ] Run `npm run gates` on the registry again (writes `original`/`carried`), then `build:rules`, `books`, `scenarios`;
      replay the live check of the shipped rules (13).
- [x] R29 and its fix (2026-11-22): monster rules ship as their delta over the engine's reading and carry over the engine
      keys a rebinding would drop; 13 of 75 shipped, checked live (no engine key lost or changed).
- [ ] Re-triage the monster `entry` records with `engineReads` in the batch (816 in XMM, 287 with a reading): most of the
      29 "the engine already does it" rules point at records whose verdict should be `core`.
- [x] The reread stage (2026-11-22): `batch reread <BOOK>` (unruled monster `entry` records the engine reads, drafts-queued
      ones included, blind to earlier verdicts) and `ingest --reread` (covered: provisional `core` by rule, out of the drafts
      queue; beyond: `hint: "beyond-engine"` and the assertions as data); `--second` for the blind safety net; `batch draft`
      leaves out what the engine reads until a reread finds it goes beyond (`docs/PIPELINE.md`, "Rereading monster features").
- [ ] Run the reread on XMM (dry cut: 8 batches, 220 records, 75 of them in the drafts queue), then the second reread of
      every `core` it sets; then FRAIF, EFA, XPHB. Count confirmed and provisional `core` apart (`reread.provisional`).
- [ ] The 39 ruled XMM monster records outside the queues are not reread (their rule's `evidence.reading` decides): decide
      whether "the engine already does it" rules should be dropped and their records reread.
- [ ] A reread `core` gone stale (the gates note a new engine reading): decide who restores it or cuts it again.
- [ ] The 25 rules that change the engine's reading: redraft them as additions (never restating `triggers`), or drop them.
- [ ] Redraft them with `batch draft XMM --redraft` (Ruling R32, built 2026-11-22: once, blind, `evidence.drafted.redrafted`),
      then `ingest --draft --redraft`, `gates`, a blind review; count what still changes the reading (held for a person).
- [ ] The reading is computed from the engine release the tools point at; record and check the engine version at
      registration (a newer engine may read more, making a shipped delta redundant: redundant is harmless, but say so).
- [x] XMM monster features re-read against the engine's reading (2026-11-22): 96 became `core` (75 confirmed by a second
      reader, 21 provisional), 60 are marked as going beyond the engine, 61 unsure and unchanged.
- [ ] The 21 provisional `core` and the 61 unsure rereads: a third reader, or a person.
- [x] Rereads that see something missing the assertions cannot say (2026-11-22): a third answer, `covered: false` with
      `unexpressed` (reasons of `LEAVE_REASONS`, extended to the recurring ones and shared with `rule.leaves`); a second
      reread fails closed (an unsure second reader reverts the `core`, outcome `second-unsure`); a second-reread results
      file can be ingested again (`already confirmed` / `already reverted`); the brief says plainly that something missing
      is never covered.
- [ ] Re-ingest the existing second-reread results files under the fail-closed rule on the registry (XMM 001-004, the
      r2 XMM second pass, FRAIF), then recount confirmed and provisional `core`.
- [ ] Hand a reread's `unexpressed` reasons to the drafter (today `beyondEngine` carries the `beyond` assertions only).
- [ ] Reread the monster features of the other books with official actor dumps (FRAIF 32, EFA 13, XPHB 7 with a reading).
- [ ] Draft the 60 "beyond the engine" records as additions over the reading (most have a shared embedded id: they wait on
      upstream for a creature-scoped binding).
- [x] Rereads, second round (2026-11-22): `core` confirmed for 80 XMM, 11 FRAIF, 5 EFA, 1 XPHB monster features; a second
      reread now fails closed and a reader can answer "missing, but the vocabulary cannot say it".
- [ ] 4 XMM provisional `core` wait for a second reader; 51 XMM rereads stay undecided (no word for what is missing).
- [ ] Give drafters the `unexpressed` reasons of a reread, and count them: they rank the vocabulary to add.
- [x] Rereads, third round (2026-11-22): the 54 undecided XMM features are decided (51 beyond the engine); XMM has 81
      monster features `core` by two readers and 136 `entry` beyond the engine. Reasons ranked in `docs/pilot-m3.md`.
- [ ] Wider vocabulary, in this order: a filter on a trigger (melee only, a kind of attack), a size limit on targets (the
      engine has the fact `target.sizeAtMost` for a trigger's `if`), a use limit per round or turn.
- [x] Trigger conditions (R30) and one restate pass (R31) over the 29 XMM features: 12 now stated (11 with a size limit),
      17 still a reason. Size limit 11 -> 1.
- [ ] A reaction limited to "a melee weapon in hand": decide whether the brief should state the melee part and leave the
      rest (11 features, one pattern), then the next keys: follow-up action, state across turns.

- [x] Draft round 5 (XMM, 12 features drafted with trigger conditions available): 1 rule shipped after an exact blind
      review, 10 to the drafts queue (7 no key, 3 would change the engine trigger), 1 rejected for a quoted why.
- [x] Scenario reach: a weapon attack that is not ranged is judged by the engine on its reach, not its range; the Merrow
      harpoon pull scenario is now manual (`setup.reach`) instead of stopping on an out-of-range prompt.
- [x] Redraft (R32) of the 13 rules that changed the engine's reading and were not queued: 1 shipped, 2 to review, 10
      removed and queued for a person. 15 monster rules ship.
- [x] Sample drafting outside XMM: 1 accepted of 16 (R12 no-go for the other 23 batches). One FRAIF item rule ships, partial.
- [ ] Spells and items need vocabulary before drafting: the main effect has no key in 7 of 9 sampled spells.

- [x] Scenario runner: a magic item is used without consuming it (a consumable spent by the first check was gone for
      the second). Seen live and pinned by a unit test.
