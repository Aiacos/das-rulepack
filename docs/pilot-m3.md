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
