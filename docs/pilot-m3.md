# Pilot of rule drafting (milestone 3) — 2026-11-22

Counts only: no entry text is kept here. The pilot ran the stages built in tasks 1–6 on real entries of the 2024 Player's
Handbook, with the drafter allowlist of 28 engine keys and typed data fixes.

## What was run

| Stage | In | Out |
|---|---|---|
| `batch draft XPHB` (spell, feat, option, species, item, then 17 features) | 211 `entry` records | 6 batches, 46 entries |
| Drafter agents (one per batch) | 46 entries | 1 rule, 45 "a person must do it" |
| `ingest --draft`, gates, review, play | — | not run: see the decision |

Every "person" answer carried a specific reason (no key for a conditional advantage, for turning a hit into a miss, for
state kept across turns, for a choice at use time, for an attack count granted by another feature...).

## Why — every entry read again against the engine's full schema

A second, more capable agent read all 46 texts, the item structures, the engine's validators, its shipped entries and the
runtime code that recognises some features by identifier, and put each entry in one category.

| Kind | Entries | Allowed keys were enough | Engine keys outside the allowlist | Partly expressible | Needs new engine support | Should not have been `entry` |
|---|---|---|---|---|---|---|
| spell | 9 | 0 | 1 | 2 | 6 | 0 |
| feat | 5 | 0 | 0 | 0 | 1 | 4 |
| option | 8 | 1 | 0 | 1 | 4 | 2 |
| species | 3 | 0 | 0 | 0 | 0 | 3 |
| item | 4 | 0 | 1 | 0 | 2 | 1 |
| feature | 17 | 0 | 0 | 5 | 6 | 6 |
| **total** | **46** | **1** | **2** | **8** | **19** | **16** |

- **16 of 46 should never have reached drafting.** The engine already handles them: by code that recognises the identifier,
  by entries shipped under other identifiers (a feature whose options each have their own entry), or because its own notes
  say the system does it. The pilot's single rule was one of these: redundant.
- **19 of 46 need engine support that does not exist** (grouped below): no allowlist would help.
- **11 of 46 could be drafted** with a wider drafter vocabulary, mostly the full shape of `triggers`.
- The drafters themselves missed 3 entries an allowed typed fix would have covered.

## Missing engine capabilities (candidates for requests upstream)

| Capability | Entries blocked |
|---|---|
| Shape change with temporary hit points taken from the new form | 4 |
| New reaction moments (a creature starts its turn nearby; an ally would drop to 0; initiative shared with allies) | 3 |
| Two metamagic kinds (reroll of damage dice, doubled duration) | 2 |
| Mounted rules (a mounted state, redirecting a hit, hands depending on being mounted) | 2 |
| Follow-ups after a cast (a bonus attack, an extra nearby target) | 2 |
| One entry each: automatic failure by creature type; a miss that depends on the attacker's failed save; a use gated by the light level; a zone filtered by creature type; reach by weapon property; an effect missing from non-official data | 6 |

## Decision (Ruling R12: go needs 70 % of drafts through the gates)

**Revise — no volume drafting.** 1 of 46 is far below the bar, and the cause is upstream of the drafters:

1. **Triage first.** Before anything is drafted, a pre-pass must set `core` on what the engine already does: identifiers its
   runtime code recognises, features whose parts ship under other identifiers, and what its own content notes hand to the
   system. On this sample that removes a third of the work.
2. **Widen the drafter vocabulary where it is safe**: the full `triggers` shape the engine accepts (the vocabulary's own
   example uses a form the drafter shape refuses), then `emanation` for auras, `duringRage`, `barrier`, `globe`,
   `targets.requires`, `spellDamageTypes`, `usageLimits.whileEffect` — each a closed-vocabulary, id-based shape.
3. **Route "needs engine support" to upstream requests**, grouped as above, instead of leaving them as `entry`.
4. **Second pilot on monster features** (2024 Monster Manual, 294 draftable): their riders are mostly a condition or a push
   on a failed save, repeated saves and timing fixes, which the allowlist already expresses; auras need `emanation`, and data
   fixes are not allowed on monster features today.

The stages themselves worked as built: batches carried no rule text, results were bound to their batch, and nothing reached
the registry (the 46 results were not ingested: 45 would only have filled the drafts queue for a person).

# Second and third pilots — monster features of the 2024 Monster Manual (2026-11-22)

After the first pilot: the engine's code and options became sources of the `core` verdict (12 records), agreement at review
was calibrated (Ruling R24), and monster batches stopped offering the DDB Importer item. The rules themselves live on the
branch `pilot/m3-xmm`, not on `master`.

## Drafting (60 monster features, three batches of 20)

| Batch | Drafter model | Rules written | Accepted at ingest | Rejected | "A person must do it" |
|---|---|---|---|---|---|
| 1 (before the batch fix) | larger | 9 | 3 | 5 named the DDB Importer item, 1 quoted the text | 11 |
| 2 (before the batch fix) | smaller | 3 | 0 | 3 named the DDB Importer item | 17 |
| 3 (corrected batches) | larger | 11 | 9 | 2 quoted the text in `adds` | 9 |
| 4 (corrected batches) | larger | 2 | 2 | 0 | 18 |

- The drafter model matters: three times as many rules from the larger one on comparable batches.
- With corrected batches, 11 of 13 drafted rules were accepted and all 11 passed every gate (Ruling R12 asks 70 %).
- Yield per entry stays low and uneven: 13 rules from 40 entries (11 and 2). The keys used: `effectEnds` 7, `triggers` 4,
  `saveDamage` 3, `noOpportunity` 3, `noReactions`, `actionOrBonus`, `effectDurations` 1 each.
- Reasons for "a person" on monsters: a rider limited by the target's size, an effect only on grappled creatures, damage to
  everything nearby at a turn's end (an aura), lost reactions with no effect to carry them, a charm with control.

## Independent review (12 gated rules, one blind reviewer)

| Outcome | Rules |
|---|---|
| Agreed exactly | 3 |
| Agreed with R24 tolerances (optional detail, the item's own baseline) | 2 |
| Disagreement, queued for a person | 5 |
| Queued by rule (`noReactions`, Ruling R15) | 1 |
| Review rejected (the reviewer's reason quoted the text) | 1 |

The disagreements are the review doing its job: a different moment for the end of an effect (the bearer's turn end against
the current turn's end), two endings the draft left out, and riders the drafter had knowingly left to the table. 5 of 11 is
above R12's 30 %: **still no volume drafting**.

## Live play

One rule was played on the test world through the engine's own scenario runner (an ad-hoc scenario; the generated ones are
"manual" for moves): on a failed save the target was knocked prone and pushed (3 of 4 squares, stopped by the scene), with
full damage; on a successful save it took half. Not recorded as `played`: a manual play is the owner's to record.

## What this leaves to do

1. **Partial rules.** Drafters wrote rules that automate part of an entry and said so; review then reports the rest as a
   disagreement. Decide what a partial rule is: refused, or accepted with its uncovered part declared as data so that
   review compares only what the rule claims.
2. **Timing words.** `bearerTurnEnd`, `casterTurnEnd`, `currentTurnEnd`: two drafters and a reviewer read them differently.
   The vocabulary needs each one defined against the engine's behaviour, with an example.
3. **Tests pin the 24 first rules.** On the pilot branch 7 tests fail because they pin the registered set, the states and the
   round trip to the 24 legacy rules. New rules cannot land on `master` until those tests derive what they expect.
4. **Scenarios.** Moves have no interpreter, so both first scenarios were manual; the runner's resolution gives the target
   under its token name, which the ad-hoc scenario matched wrongly.
5. The wider vocabulary (auras, a size limit on targets) and the upstream requests of the first pilot still stand.

# Fourth pilot — the same 40 monster features with the final tooling (2026-11-22)

Between the third and the fourth pilot: every closed word an agent picks got a definition (the endings of an effect
first), three words were added to the assertion vocabulary (no opportunity attacks, no reactions, action or bonus action
only), a rule may declare what it leaves to the table as data (Ruling R25), every drafter key either implies an assertion or
sends the rule to a person, and agreement compares atoms (Ruling R26: one expectation per assertion).

| Stage | First pilot on these 40 | Fourth pilot |
|---|---|---|
| Rules written | 12 | 10 |
| Accepted at ingest and through every gate | 3 | 8 |
| Rejected at ingest | 9 | 1 (it declared as left out something the rule itself does) |
| Queued for a person (drafter unsure) | 0 | 1 |
| Partial rules (with `leaves`) | - | 7 of 8 |

| Independent review of the 8 | Rules |
|---|---|
| Agreed exactly | 5 |
| Agreed with tolerances | 1 |
| Disagreement, queued for a person | 1 |
| Queued: the reviewer was unsure | 1 |

**Ruling R12 is met**: 8 of 10 drafts through the gates (70 % asked), 1 disagreement in 8 reviews (30 % allowed).
**Decision: go, for the draftable monster features of the 2024 Monster Manual**, with the larger drafter model. The eight
rules are on `master` with their state shown in `docs/RULES.md`; none is recorded as played. What the yield is: one entry in
five becomes a rule; the rest go to a person with a reason, most often a rider no key expresses.

# Volume on the 2024 Monster Manual's draftable monster features (2026-11-22)

| Stage | Entries |
|---|---|
| Cut for drafting (13 batches, larger drafter model) | 255 |
| Rules written | 73 |
| Accepted at ingest and through every gate | 67 |
| Rejected at ingest (4 quoted the text, 1 declared as left out what the rule does) | 5 |
| Queued for a person, with a reason | 183 |

| Independent review of the 67 | Rules |
|---|---|
| Agreed exactly | 22 |
| Agreed with tolerances | 11 |
| Disagreement | 17 |
| Sent to a person by the rule's own stamp (a key the vocabulary cannot assert) | 15 |
| Reviewer unsure | 2 |

Disagreement is 17 of 67 (25 %), or 17 of the 50 rules an automatic agreement could settle (34 %): at Ruling R12's limit,
not clearly under it. Most differences: a damage fraction the reviewer states and the draft does not (7), an ending the draft
states and the reviewer does not confirm (5).

**Ruling R27 — a contested rule is held, not shipped.** The module registers a drafted rule only when a review confirmed it,
or when it waits for a person only because of its own stamp and the reviewer did not contradict it. With the pilot's eight:
**75 monster rules in the registry, 43 shipped, 32 held** (29 "review disagrees", 3 "reviewer unsure"); `docs/RULES.md`
shows which, and why. None is recorded as played.

# Live play of the shipped monster rules (2026-11-22)

The scenario generator learnt to stage a monster (the creature itself is cast for the run and uses its own embedded item)
and to check moves, the turn-based endings of an effect, the three restrictions and typed damage: the 39 scenarios of the
reviewed rules went from all manual to all automatic. They were then run on the test world through the engine's own
scenario runner, each placing its creatures, using the activity until the roll it needs comes up, and restoring the world.

| Outcome | Scenarios |
|---|---|
| Held: every declared check passed, stamp printed | 38 |
| Interrupted: the attack was never resolved (a ranged pull started beyond the reach the engine accepts) | 1 |

**Not recorded as `played`.** The stamp carries the engine version the test world reports, and that world's manifest of the
engine is stale (it says an older version than the code it runs, which is the current release plus open pull requests):
recording those stamps would write a wrong version into the evidence. The logs are kept privately; the plays are to be
recorded after the test world reports the right version, or redone then.

# Correction (2026-11-22, same day): the engine already reads monster features

Checked live after the plays: DAS · Core derives entries for monster features from their English text by itself (pushes
with a size limit, conditions, healing blocks, the endings of effects). A rule registered by a module does not replace that
reading wholesale: the engine merges the layers key by key (`mergeEntries([text, enchant, module, world, item])`), so the
module's entry overrides the reading KEY BY KEY, and `triggers` as a whole list (a later layer replaces that key whole).
With the pack's 43 monster rules registered and then unregistered on the test world:

| What the pack rule does to the engine's own reading | Rules |
|---|---|
| Identical to it (redundant) | 17 |
| Adds a key, changes none | 13 |
| Changes a key the engine had (5 of them also add one) | 13 |

For 41 of the 43 items the engine had an entry from the text; for 2 it had none. The 38 scenarios that held live prove the
behaviour at the table, not that the pack's rule added anything: the engine alone would probably have passed most of them.
Worse, a rule whose key replaces the engine's (a `triggers` list replaces the engine's list whole) can lose what the
engine reads and the drafter could not express (a size limit on a push).

**Ruling R28: every monster rule is held out of the module** until it is compared with the engine's reading (0 of the 75
shipped now; they stay in the registry). What this changes upstream of the drafting: the `entry` verdicts of monster
features were given without knowing the text layer, so most are probably `core`; triage needs the engine's reading as an
input before any monster feature is drafted again. What stands: the tooling (gates, blind review, partial rules, held
rules, automatic scenarios), which is kind-independent, and the finding that the pack's field is what the engine does not
read: non-monster entries and the entries of sources the engine's text reader does not cover.


# The engine's reading, computed offline (2026-11-22, Ruling R29)

The comparison above was measured live. It is now computed offline: `tools/pipeline/engine-reading.mjs` imports the engine's
own pure text-layer function from a clone (`DAS_CORE`, here DAS · Core 0.289.0) and gives it the official item of the dumps
as the engine's adapter gives it the live item; `npm run gates` stores the comparison on the record (`evidence.reading`).

| The 43 rules that had shipped | Live (integration build) | Offline (the clone) |
|---|---|---|
| The engine reads something of the item | 41 | 37 |
| Identical to the reading for every key the rule declares | 17 | 14 |
| Only adds keys | 13 | 16 |
| Changes a key the engine had (of them, also adds one) | 13 (5) | 13 (5) |

The difference is not hidden: the clone reads nothing of 6 of the 43 items where the live engine missed 2, and a rule on an
item read as nothing only adds; the three rules that move from "identical" to "only adds" are most likely among those four
(not checked one by one: the live log names no items). The live world ran the engine's integration build (the release plus
open pull requests), and its item data may differ from the dumps. The changes count is the same, 13. Of the 13, 10
change `triggers` and every one of them drops a trigger the engine read (none keeps them all); 9 of the 10 drop a push
limited by the target's size (`target.sizeAtMost`), no other condition is dropped; 3 change another key (two the lost
reactions and the action-or-bonus restriction, one the ending of an effect).

| All 75 monster rules (offline) | Rules |
|---|---|
| Identical to the reading | 25 |
| Only adds keys | 25 |
| Changes a key (of them, also adds one) | 25 (12) |
| ... `triggers` dropping an engine trigger / keeping them all | 20 / 0 |
| ... dropping a size-limited push | 9 |

**Emission under R29**, on a copy of the registry after `npm run gates`: of the 75, **16 would ship** (as their delta: the
keys the engine does not read), **25 are held because they change the engine's reading** (a person decides), **25 are held
because the engine already does all they say** (candidates for `core`), and **9 stay held by R27** (7 review disagrees, 2
reviewer unsure). The repository's registry is not changed by this: every monster rule stays held ("engine-text") until
`npm run gates` writes the evidence.

**Triage with the engine's reading** (`triage <BOOK> --engine-reading`; every monster record with the verdict `entry`,
queued and ruled ones included, counted from the dumps):

| Book | Monster `entry` records | The engine reads something | Reads nothing | Official item not in the dumps |
|---|---|---|---|---|
| XMM | 816 | 287 | 521 | 8 |
| FRAIF | 110 | 32 | 75 | 3 |
| TCE | 57 | 0 | 18 | 39 |
| EFA | 53 | 13 | 38 | 2 |
| XPHB | 37 | 7 | 28 | 2 |
| XDMG | 2 | 0 | 2 | 0 |
| FRHOF | 0 | 0 | 0 | 0 |

The pre-pass itself hints only the unruled records that wait in no queue (XMM: 145 of the 287; the rest are the 250 records
of the drafts and review queues and the 39 ruled ones outside them). What the engine reads is not the whole text: "reads
something" is a hint for the reader, not a `core` verdict.

**Fix round 1 — the rebinding.** A live check of the 16 shipped deltas found that 0 changed a text-layer key but 2 items
lost a key the engine had without the pack (`usageLimits`, `magical`): binding the item to the rule's own identifier stops
the engine's shipped entry under the item's original identifier from applying. Offline (DAS · Core 0.290.0, after
`npm run gates` on a copy), comparing what the engine ends with without and with the pack: the same two keys are carried
over (empyrean sacred weapon `usageLimits`, poltergeist telekinetic thrust `magical`), 11 other shipped rules carry nothing,
and 3 (elemental cataclysm, lacedon ghoul, warrior commander) only repeat a `noOpportunity` the engine ships under the
original identifier: they become "the engine already does it". New totals of the 75: 13 ship, 25 change the reading, 29
add nothing, 6 review disagrees, 2 reviewer unsure. None holds for "its identifier would drop engine behaviour".

# Where the monster rules stand (2026-11-22, end of day)

The engine's own reading of a monster feature is now computed by the pipeline from the dumps with the engine's pure
function, compared with each rule, and stored as evidence (Ruling R29). A rule ships only as what it adds; and because a
monster rule binds its item to an identifier of its own, the engine's shipped entry under the item's original identifier
would stop applying: the keys that would be dropped are carried over at registration, from the running engine's own table.

| The 75 monster rules in the registry | Rules |
|---|---|
| Shipped, as their delta over the engine's reading (2 carry over an engine key) | 13 |
| Held: the engine already does it | 29 |
| Held: it changes the engine's reading (20 drop a trigger the engine reads, 9 of them a size-limited push) | 25 |
| Held: review disagrees / reviewer unsure | 8 |

Checked live on the test world, registering and unregistering the pack and comparing the engine's entry of each bound item:
for the 13 shipped rules no engine key is lost, none is changed, and every rule adds at least one key (a damage fraction on
a successful save 6, an ending 2, a duration 2, an ending of an action 2, and one each of three others).

Of the 816 monster features of this book that triage called `entry`, the engine reads something for 287. Triage and the
three briefs now carry that reading: what remains to judge, write and assert is only what goes beyond it.

