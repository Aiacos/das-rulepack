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

