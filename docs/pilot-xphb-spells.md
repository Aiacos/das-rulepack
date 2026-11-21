# Pilot: 2024 Player's Handbook spells

Date: 2026-11-21. Counts only: no rulebook text and no spell name except the one ambiguous match.

Engine: DAS · Core 0.289.0, as reported by the gates (a local clone of its main branch). CI is checked against the latest
release tag (v0.289.0 on this date).

## Commands

Run from the repository root, in this order, with `DAS_CORE`, `RULEPACK_DATASET`, `RULEPACK_DUMPS` and `RULEPACK_TEXT` set
(`docs/PIPELINE.md`). Wall-clock time is the total reported by `time` for the whole `npm run` call.

| Command | Wall-clock |
|---|---|
| `npm run pipeline -- inventory XPHB spell` | 3.0 s |
| `npm run pipeline -- triage XPHB` | 0.2 s |
| `npm run gates` | 1.4 s |

## Results

| What | Count | Where it comes from |
|---|---|---|
| Spell records added to `registry/xphb.json` | 391 | `inventory`: `added` |
| Records in `registry/xphb.json` afterwards | 394 | the 391 spells and the 3 legacy features that were already there |
| Official origin | 391 matched, 0 absent, 0 ambiguous | the `match` of each record's `official` item |
| DDB Importer origin | 390 matched, 0 absent, 1 ambiguous | the `match` of each record's `ddb-importer` item |
| Plutonium origin | 391 unchecked | no Plutonium dump was read |
| Records with recorded structural differences | 76 | `inventory`: `differing` (matched items with `differences`) |
| Verdict `core`, set by rule | 277 | `triage XPHB`: `core` |
| Verdict `unverifiable`, set by rule | 0 | `triage XPHB` (every entry has its text in the cache) |
| Left without a verdict, for a reader | 114 | `triage XPHB`: `left`; 110 are SRD entries with no DAS · Core entry, 4 are not SRD |
| Records checked by the gates, all books | 415 | `gates` |
| Records failing the gates | 0 | `gates` |

The one ambiguous match is `xphb:spell:flaming-sphere`; the difference is the school.

The 3 legacy XPHB features were already in the registry. They are the same records afterwards, apart from the fields the
tools derive (`state`, `evidence.gates`). The 24 shipped rules pass the gates (schema, validator, fixes, unique) and register
the same entries (`tests/registration.test.mjs`, unchanged). No two records share an identifier.

## Checks before the commit

- `registry/xphb.json` holds no string longer than 200 characters that is not already in the file as it was before the run,
  and the `text` field of every record is only `{ sha256, source, chars }`.
- `npm test`, `npm run gates -- --ci`, `npm run build:rules -- --check` and `npm run books -- --check` pass against a fresh
  shallow clone of DAS · Core v0.289.0 with `CI=true`.

## Not done

- No rule was drafted, nothing was reviewed independently, and nothing was played in a world.
- Plutonium was not checked: its matches are `unchecked`.
- The 114 entries without a verdict wait for readers.
- The one ambiguous match waits for a human.
- Only spells of one book: the other kinds and books are not inventoried.
