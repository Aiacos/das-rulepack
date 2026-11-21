# How far one reading can be trusted — second-reader sample

Date: 2026-11-21 · counts only.

A reader agent's verdict is one reading of an entry's text against the structure of its item. To measure how reliable that
is, three batches already read were given to a second reader that saw neither the first results nor the registry: one
batch of class features (*Player's Handbook* 2024), one of magic items (*Dungeon Master's Guide* 2024), one of monster
features (*Monster Manual* 2025). 200 entries in all.

| Batch | Entries | Same verdict | Same verdict, both readers at 0.7 or more |
|---|---|---|---|
| Class features | 40 | 37 (92%) | 30 of 33 (91%) |
| Magic items | 80 | 77 (96%) | 74 of 76 (97%) |
| Monster features | 80 | 62 (78%) | 61 of 77 (79%) |
| **Total** | **200** | **176 (88%)** | **165 of 186 (89%)** |

What the disagreements were:

| First reader → second reader | Count |
|---|---|
| `none` ↔ `data` | 17 |
| `entry` ↔ `data` | 6 |
| `entry` ↔ `none` | 1 |

Seventeen of the 24 disagreements are between `none` and `data`: both mean that nothing has to be written, and for a
monster's plain attack the line between "nothing to automate" and "the item's data does it" is a matter of wording.
On the question that decides the work — **does this entry need a rule or not** — the two readers agree on 193 of 200
entries (96.5%).

What this does and does not say:

- About 1 entry in 30 would get a different answer to "needs a rule" from another reader. A verdict `entry` is therefore a
  candidate, not a decision: the drafting stage reads the entry again, and the independent review of the design compares
  two readings before a rule is gated.
- The sample is 200 entries of three kinds from three books; it says nothing about spells, species or older books.
- Agreement between two readers is not correctness: both can be wrong the same way. Nothing here was played.
