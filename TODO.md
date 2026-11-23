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
- [x] A monster feature whose official embedded item id is shared by several creatures (1,480 of XMM's 2,146 features)
      is bound by `<actor id>.<item id>`, which DAS · Core now accepts (Ruling R35; the module skips them on an older one).
- [ ] A data fix on an item embedded in an actor has no document the data-fix gate can read yet.
- [ ] Draft the monster features that were left out for a shared embedded id (XMM 455, XPHB 33, EFA 2 now cut).
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
- [x] Zones and auras (Ruling R33): nine engine keys (`emanation`, `aura`, `zoneAffects`, `zoneEffects`, `selfZone`,
      `zoneLasts`, `zoneMax`, `saveAutoSuccess`, `willingFails`) and a zone `replay` trigger, in closed shapes
      (`zones.mjs`); `given.moment` takes `ownTurnStart` / `ownTurnEnd`, `expect.subjected: activity`, roll mode
      `autoSuccess`; pinned to the engine's own field lists by a DAS_CORE test.
- [ ] Draft the zone pool with R33 (no restate pass is due: no reread reason names an area): the 8 rereads whose `beyond`
      has a zone moment (XMM 7, XPHB 1), the 17 drafts-queue entries whose drafter named an aura or zone (2 FRAIF, 15 XMM),
      then the next sample of FRAIF, EFA and XPHB spells and items; measure Ruling R12 again before any volume.
- [ ] Scenarios for zones: lay the activity's area, place the target inside, pass its turn (or the bearer's) and watch
      the activity used again; until then every zone or aura moment is manual (`given.moment.<word>`).
- [ ] Zone words still missing: an emanation on death or 0 hit points (`death-trigger`), a replay per square travelled
      (`moves`), a replay under a condition, a radius formula (class scales), `aura.changes`.
- [x] Choices, barriers and wards (Ruling R34): seven engine keys (`choice`, `barrier`, `globe`, `wardsConditions`,
      `wardsAtZero`, `blocksHealing`, `blocksTempHp`) in closed shapes (`wards.mjs`); `expect.chooses`, `expect.bars`,
      `given.spellLevelAtMost`, `denies: healing|tempHp`; pinned to the engine's own field lists by a DAS_CORE test;
      `changesForm`, `formLock`, `walls`, `wallSide`, `encloses`, `wardsDetection` left out with why.
- [ ] Size the R34 pool with a drafting sample: the 9 XPHB spells again (none is in the registry), then the next FRAIF, EFA
      and XPHB batches; closed fields give only 2 XMM rereads and 1 FRAIF partial rule naming `use-time-choice`, to read for
      a pick among the activity's effects. Measure Ruling R12 before any volume.
- [x] Automatic FAILURE of a save by creature type (Ruling R37): upstream main has `saveAutoFail: { types }`; drafter key
      and roll mode `autoFail`, offered only when the engine in use knows it (`core.saveAutoFail`), skipped at registration
      by an engine that refuses it. Draft the texts that answered `engine` for it once a release carries the key.
- [ ] Upstream requests (no book named): a change of form that gives temporary hit points from the new form and lets the
      user pick among the transform's profiles (`changesForm` takes the first profile and that form's maximum hit points).
- [ ] Ward words still missing: a barrier limited to creature types (a given for the barred creature's type), the radius of
      a barrier or globe, a choice's `order` (which face gives which effect), `wardsConditions` (a source's type), `wardsAtZero`.
- [ ] Scenarios for wards: answer the choice question, walk a creature into a barrier, cast from outside a globe, heal a
      creature that bears a `blocksHealing` effect; until then `chooses`, `bars` and `denies: healing|tempHp` are manual.
- [x] Reactions, teleports and light (Ruling R38): four reaction declarations of `triggers` (an AC bonus against one hit,
      a hit turned into a miss, a melee counterattack after a miss, the item's damage dealt back) and `reactions`,
      `teleport`, `swapPlaces`, `light` in closed shapes (`reactions.mjs`); `acBonus`, `hitBecomes`, `counterattack`,
      `attackerTakes`, `reactionsPerRound`, `teleports`, `sheds`; pinned to the engine's validator text (keys, steps,
      declarations) by a DAS_CORE test, on the main branch and the latest release alike.
- [ ] Draft the R38 pool: 19 of the 206 drafts-queue entries name a mechanic it makes writable (a reading of the drafters'
      `why`, not a closed field: 12 parries, 1 counterattack, 2 misses, 1 self teleport, 2 reaction counts, 1 light), about
      11 of them whole; 3 parries the engine already reads (the weapon-held limit stays unsayable). Measure Ruling R12.
- [ ] Reoffer the drafters' declines (Ruling R39, built 2026-11-22: `batch draft <BOOK> --reoffer`, `ingest --draft --reoffer`,
      once, blind, `reoffered: true` on the entry kept): XMM 192 entries in 10 batches, FRAIF 3 in 1; measure Ruling R12.
- [ ] Second review of the review queue (Ruling R40, built 2026-11-22: `batch review <BOOK> --second`, `ingest --review
      --second`, once, blind; confirmed when it agrees with the draft, else `second` on the entry kept): XMM 38 entries in 2
      batches, XPHB 1, XDMG 1, FRAIF 1 (the 34 disagreements and 7 low-confidence entries); run them, read the `withFirst` ones.
- [ ] Upstream requests (no book named): a step that teleports the TARGET of a hit or a failed save; damage doubled
      against objects and structures; a hit that misses only when the attacker fails a save (as `cancelForSelf`'s
      `ifSourceFails`, at `isHit`); a free counterattack tied to the AC reaction just taken.
- [ ] Reaction words still missing: "while holding a weapon" (the engine's `target.wieldsProperty` is not offered), a
      halved or reduced hit (`halve`, `reduce`), resistance by reaction (`resist`), a reroll, advantage on the next attack
      (an identifier condition), an immunity after a save (a mark's free name), a teleport's own distance, a light's radii.
- [ ] Scenarios for reactions: attack the creature with a melee activity, take its reaction, read the judged hit; until
      then every R38 word is manual (`given.moment.isHit|isMissed`, `advance`).
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
- [x] The item reread (Ruling R42, 2026-11-23): `batch reread <BOOK> --items [--second]` cuts the non-monster `entry`
      records against the engine's own class of the item (the private `RULEPACK_ENGINE_VIEW`), `ingest --reread --items`
      sets a provisional `core`, `data` or `none` by `coveredBy`, a blind second reader confirms or it fails closed
      (`docs/PIPELINE.md`, "Rereading items against the engine's view"). Dry cut: XPHB 112, XDMG 43, EFA 49 (the 204).
- [ ] Run the item reread on XPHB, XDMG and EFA, then the second item reread of every covered answer; count confirmed and
      provisional apart, per `coveredBy`.
- [ ] Definitions for the engine rule keys the view names (19 of its 20 keys have none: `usageLimits`, `triggers`,
      `rollBonus`...), read from the engine, so that a `rule` level says what it does.
- [ ] Record the engine version of the world a view was swept on in the view file, and check it against `DAS_CORE`'s.
- [ ] Reread the monster features of the other books with official actor dumps (FRAIF 32, EFA 13, XPHB 7 with a reading).
- [ ] Draft the 60 "beyond the engine" records as additions over the reading (most have a shared embedded id: bound by
      `<actor id>.<item id>` since Ruling R35).
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
- [x] Zone and aura keys (R33); second sample: FRAIF 2 of 2 drafted (1 shipped after an exact blind review, 1 to the review
      queue). The item summary shown to drafters read a save ability stored as a bare string as empty (845 activities in
      the dumps): fixed; the two XPHB drafts built on that false gap were stopped by the fixes gate and taken out.
- [x] Second sample closed: 42 rules ship (one XPHB spell with a zone key). R12 still says no-go for spells and items.
- [ ] Next keys by what the sampled spells lacked: a change of form, a barrier, effects chosen at casting.
- [x] Creature-scoped bindings (R35) and a two-batch sample of the 456 unblocked XMM features: 6 rules drafted and gated,
      all 6 in the review queue; R12 no-go for the other 21 batches.
- [x] The item summary now shows dnd5e's own change of form (`transform`: preset, what is kept, temporary hit points):
      readers and drafters had been declining form changes as "no key" although the item's data does them.
- [x] CI was red for three pushes (the engine's latest release has no creature-scoped sources yet): R36, tests follow the
      clone, `--ci` tolerates the binding. Checked locally against a clone of the release, as CI makes it.

- [x] Pre-pass against the engine main after the merges of 2026-11-22: 15 XPHB records are now `core`.
- [x] Plays recorded on the test world: 29 scenarios held, 29 plays recorded; 28 of the 42 shipped rules are played.
- [x] Drafts queue offered again (R39): 26 of 195 drafted, 9 ship after a blind review, 17 to the review queue. 49 rules.

- [x] A heal activity is a manual scenario (`activity.heal`): the runner makes no healing roll. One more play recorded.
- [x] XDMG drafted in full: 2 of 66 drafted, none shipped (both to the review queue); 64 to the drafts queue.
- [ ] The hard tail of XPHB, XDMG and XMM is written by hand or left to the table: no more bulk drafting on it.
- [x] Second review (R40) over the 41 disagreements: 4 confirmed and shipped, 12 with two reviewers against the draft, 23
      read three ways, 2 unsure. 53 rules ship.
- [ ] The 12 rules with two reviewers against the draft: write them again from the two reviews' common reading.
      Built 2026-11-22 (Ruling R41): `batch draft <BOOK> --redraft --against-reviews`, `ingest --draft --redraft
      --against-reviews`, once, blind; confirmed when the new rule agrees with both stored reviews: XMM 11 in 1 batch,
      FRAIF 1 (5 of the 12 have both reviewers at or above 0.7); run them.

- [x] Four more plays recorded, among them the first rules bound to one creature by an actor.item source.
- [x] Redraft against two standing reviews (R41): 2 of 12 confirmed and shipped. 55 rules ship.

- [x] Two more plays recorded (Death Cultist, Death Slaad). The Death Slaad scenario failed 2 runs of 4 at "effect gone":
      two direct reproductions show the engine ends all four effects at the turn start; the runner is at fault, cause open.
- [x] Scenario runner: the intermittent "effect not gone" was Bloodied (a status the system adds at the hit, no origin) taken
      for the use's effect; the runner now also confirms a turn really changed, and names what stayed on a failure.
- [x] Item reread (R42) over 204 open entries of XPHB, XDMG, EFA: 23 confirmed covered by two readers; the rest need a rule.

- [x] Engineered rules (Ruling R43, 2026-11-23): `ingest <file> --engineered` writes a rule with any key of the engine's
      ENTRY_KEYS (`rule.engineered`, an `engineer-…` handle), every other gate held; such a rule is never reviewed and ships
      only once a play of its hand-written scenario (`play/<book>/<slug>.mjs` + `.json`, `play/lib/handwritten.mjs`) is
      recorded for the rule as it is; `docs/RULES.md` flags each for the owner (`docs/PIPELINE.md`, "Engineered rules").
- [ ] Write the first engineered rules (drafts-queue `person` entries whose text needs a key outside the drafter
      vocabulary), their hand-written scenarios, and play them on the test server; then read each flagged row of RULES.md.
- [ ] The first live run of a hand-written scenario: check that `ctx` hands the helper what play/lib/handwritten.mjs says
      (`effects` with `origin`, `settle` targets by token uuid), as the checklist of generated scenarios did.
- [x] The item summary shows advancements (what dnd5e grants by itself); the item reread counts them in its fingerprint,
      so the entries whose item has some are read again.
- [x] Items with advancements read again: 9 more XPHB and 2 EFA entries confirmed covered by two readers.
- [x] First engineered rule (R43), written by hand and proven by a recorded play: Bulwark of Force (XPHB).
- [x] Second engineered rule proven by a recorded play: Undying Sentinel (XPHB).
- [x] Third engineered rule proven by a recorded play: Cloak of Shadows (XPHB). Ruling R44: a nested key newer than the engine release passes the CI gates for an engineered rule only.
- [x] Fourth engineered rule proven by a recorded play: Hand of Harm (XPHB).
- [x] Fifth engineered rule proven by a recorded play: Shadow Step (XPHB).
- [x] Sixth engineered rule proven by a recorded play: Arcane Charge (XPHB).
- [x] Seventh engineered rule proven by a recorded play: Relentless Avenger (XPHB).
- [x] Eighth engineered rule proven by a recorded play: Power of the Wilds (XPHB).
- [x] Ninth engineered rule, proven by a recorded play: Boots of the Winding Path (EFA)
- [x] Tenth engineered rule, proven by a recorded play: Construct Resilience (EFA); R45
- [x] Eleventh engineered rule, proven by a recorded play: Guided Precision (EFA)
- [x] Twelfth engineered rule, proven by a recorded play: Arcane Jolt (EFA)
- [x] Thirteenth engineered rule, proven by a recorded play: Homunculus Servant (EFA)
- [x] Fourteenth engineered rule, proven by a recorded play: Steel Defender (EFA)
- [x] Triage: Monster Manual features the text layer does not read, read against the engine view (R46): 155 confirmed covered
- [x] Eleven engineered rules, each proven by a recorded play: the swarms gain no Temporary Hit Points (XMM)
- [x] Triage: Monster Manual features read again with the engine's size limit in view: 55 more confirmed covered
- [x] Thirteen engineered rules, each proven by a recorded play on upstream main: Sunlight Sensitivity, the ability checks (XMM)
- [x] Matching: the 41 Dungeon Master's Guide rows of item families and renamed items, each settled to its official document
- [x] Matching: 27 Player's Handbook sub-features settled to the official item that holds them; the 25 hand-written plays repeated on upstream main
- [x] Engineered rule proven by a recorded play on upstream main: Eldritch Cannon (EFA)
- [x] Triage: the newly matched Player's Handbook and Dungeon Master's Guide entries read against the engine view
- [x] Five engineered rules proven by recorded plays on upstream main: effects that last to the end of the target's next turn (XMM)
- [x] Engineered rule proven by a recorded play on upstream main: Kuo-toa Monitor, Bone Whip (XMM)
- [x] Two engineered rules proven by recorded plays on upstream main: Elephant Trample and Couatl Constrict, who can be taken (XMM)
- [x] Triage: entries read again by two readers of the engine's source (R48): 78 confirmed covered, each with the engine file named
- [x] Engineered rule proven by a recorded play on upstream main: Vampire Spawn Bite, who can be bitten (XMM)
- [x] Triage: the rereads made stale by the engine-alone view read again (R49)
- [x] Five engineered rules proven by recorded plays on upstream main: the 30-foot Leap for 10 feet of movement (XMM); blade cantrips no longer read Foundry's deprecated teleport option
- [x] Three engineered rules proven by recorded plays on upstream main: Abduct, dragging a grappled creature at no extra cost (XMM)
- [x] Engineered rule proven by a recorded play on the released engine: Ettercap Web Strand, who can be taken (XMM)
- [x] Triage: first source-aware readings of the entries the third engineering round judged covered (R48); second readings still to come
- [x] Four engineered rules proven by recorded plays on the released engine: Sun Sickness of the three myconids, Light Sensitivity of the Shadow Demon (XMM)
- [x] Engineered rule proven by a recorded play on the released engine: Black Pudding Dissolving Pseudopod, the armor penalty only on a target in armor (XMM)
- [x] Engineered rule proven by a recorded play on the released engine: Lacedon Ghoul Claw, no paralysis for an Undead or an elf (XMM)
- [x] Engineered rule proven by a recorded play on the released engine: Phase Spider Bite, the poison only on a target reduced to 0 hit points, which is stable (XMM)
- [x] Engineered rule proven by a recorded play on the released engine: Mimic Pseudopod, Disadvantage on the check to escape its grapple (XMM)
- [x] Two engineered rules proven by recorded plays on the released engine: the gold dragons' Banish takes its target off the battlefield until the dragon's next turn (XMM)
- [x] Triage: blind second source-aware readings of the third engineering round (R48)
- [x] Engineered rule proven by a recorded play on the released engine: Magmin Ignited Illumination, the light it sheds while ablaze (XMM)
- [x] Engineered rule proven by a recorded play on the released engine: Incubus Nightmare, sleep at 20 hit points or fewer, damage above (XMM)
