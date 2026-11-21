# Rulebook pipeline — milestone 2 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inventory and rule-based triage for every kind of entry (not only spells) of the 2024-and-later rulebooks that have an official Foundry module, with nothing left that needs a hand edit of the registry.

**Architecture:** Milestone 1's pure functions stay; the dataset reader and the matcher become kind-aware through one table (`tools/pipeline/kinds.mjs`), monsters get one record per stat-block feature, and three gaps found by the pilot are closed (settling an ambiguous match, keeping a ruled record's identifier and binding the others through `sources`, checking reprints).

**Tech Stack:** Node ≥ 20 ES modules, Vitest 3, no new dependency. Same environment variables as milestone 1.

**Spec:** `docs/superpowers/specs/2026-11-21-rulebook-pipeline-design.md` (§1, §2 stages 1–2, §7, §7b, §8). Runbook: `docs/PIPELINE.md`.

**Out of this milestone:** drafting, independent review, scenarios and play (milestone 3); drift; Plutonium dumps; books without an official module (after the 5.5e books, by the user's order of 2026-11-21).

## Global Constraints

- Everything in milestone 1's Global Constraints still binds (no rulebook text or premium data in the repository, synthetic fixtures only, environment variables, exact verdict/state/origin/match vocabularies, lines ≤ 132 columns, `npm test` green after every task, the 24 shipped rules register the same entries, nothing under `tools/` calls a model or a server).
- Kinds, exactly: `spell`, `feat`, `option` (optional features: invocations, maneuvers, metamagic…), `feature` (class and subclass features), `species` (species and their traits), `background`, `item`, `monster`, plus `sense` (legacy records only, never inventoried).
- A record key never changes once written. Re-running inventory on a book already in the registry must leave every existing key, `verdict`, `why`, `rule`, `evidence`, `legacy*`, `note` and `order` untouched.
- Book order for the real runs: XPHB, XDMG, XMM, then EFA, FRHOF, FRAIF, RHW. Books whose package has no local dump (AU, WOW) are listed as "no dump", not guessed.
- Counts-only reports: no entry text, and no list of names longer than what is needed to act (ambiguous matches, entries with no official item).

## Review Focus

1. A feature that exists in two classes or subclasses under the same name (e.g. the same feature name at different levels or in different subclasses): each gets its own key (owner and level are part of the key), never merged.
2. An item whose dataset name differs from the Foundry name only by punctuation, a parenthesised variant ("(Rare)", "+1") or the order of words: matched when unambiguous, otherwise `ambiguous` with the candidates — never silently `absent`.
3. A monster with two features of the same name (two "Multiattack" variants, legendary and regular actions): distinct keys.
4. A book with a dataset file missing for one kind: that kind reports 0 entries and the others still run.
5. Re-inventory of XPHB spells after this milestone: `git diff` on `registry/xphb.json` shows no change to any spell record's key or verdict.

---

### Task 1: Kind table and dataset readers for every kind

**Files:** Create `tools/pipeline/kinds.mjs`; modify `tools/pipeline/dataset.mjs`, `tools/pipeline/schema.mjs` (KINDS), `tools/pipeline/registry.mjs` (`keyOf` with owner/level); tests `tests/pipeline/kinds.test.mjs`, `tests/pipeline/dataset-kinds.test.mjs`, fixtures under `tests/pipeline/fixtures/` (invented).

**Interfaces — produces:**
- `KINDS` extended as in Global Constraints.
- `KIND_TABLE: { [kind]: { files(bookCode) → relative dataset paths, list(json) → raw entries, docTypes: string[], identity: string[] } }` — `docTypes` are the Foundry document types an item of that kind can have (`spell` → `["spell"]`; `feat`, `option`, `feature`, `species` traits → `["feat"]`, species themselves `["race"]`, `background` → `["background"]`, `item` → `["weapon", "equipment", "consumable", "tool", "loot", "container"]`); `identity` are the mechanics fields whose difference makes a match ambiguous (`spell`: `level`, `school`; `item`: `rarity`; others: none).
- `readEntries(datasetDir, bookCode, kind, { year }) → [{ name, kind, book, page, edition, srd, text, owner?, level?, rarity?, school? }]` — `readSpells` becomes `readEntries(…, "spell", …)` and keeps working; entries of other books in a shared file are filtered by `source`; `owner` is `"<Class>"` or `"<Class>/<Subclass>"` for features, the species name for a trait, the creature for a monster feature.
- `keyOf({ book, kind, name, owner?, level? })` — `<book>:<kind>:<slug(owner)>/<level>/<slug(name)>` when owner or level is present; existing keys (no owner) unchanged.

- [ ] **Step 1:** Read the real dataset's layout for each kind (file names and JSON shapes only — `feats.json`, `optionalfeatures.json`, `items.json` + `items-base.json`, `class/class-*.json` with `classFeature` and `subclassFeature`, `races.json`, `backgrounds.json`) and write down the shapes in the report; write invented fixtures of the same shapes.
- [ ] **Step 2:** Failing tests: one per kind (name, page, edition, owner/level where applicable, text flattened and non-empty, entries of another source filtered out); Review Focus 1 (two features with one name → two keys) and 4 (missing file → `[]`); `keyOf` unchanged for a spell and for the 24 legacy keys in `registry/legacy.json`.
- [ ] **Step 3:** Run them — FAIL. Implement. Run — PASS; `npm test` PASS.
- [ ] **Step 4:** Commit `Pipeline: one dataset reader for every kind of entry`.

### Task 2: Kind-aware matching and inventory

**Files:** modify `tools/pipeline/match.mjs`, `tools/pipeline/dumps.mjs` (`itemSummary` carries `rarity`, `featType`, `requirements`), `tools/pipeline/inventory.mjs`, `tools/pipeline/cli.mjs`; tests alongside.

**Interfaces — consumes Task 1; produces:**
- `matchOrigin(entry, candidates)` uses `KIND_TABLE[entry.kind].docTypes` and `.identity`; name comparison after `matchName(name)` — slug, with a trailing parenthesised group and leading/trailing bonus tokens (`+1`, `+2`, `+3`) kept as a variant marker; an exact slug match wins; otherwise a unique candidate equal on the base name with the same variant marker; several → `ambiguous` (Review Focus 2).
- For `feature` entries, a candidate must also agree on the class when the document states it (`system.requirements` or `system.type.subtype` containing the class or subclass name); several same-name candidates that cannot be told apart → `ambiguous`.
- `inventory({ book, kind, … })` unchanged in shape; CLI `inventory <BOOK> <kind|all>`; `all` runs every inventoriable kind and prints one report per kind.
- Re-inventory never changes a key, and (closing milestone 1's finding) never changes the `identifier` of a record that has a `rule`: the official identifier, when different, is recorded on the official item only.

- [ ] Failing tests for each bullet and Review Focus 2 and 5 (a second inventory of a registry holding spell records with verdicts changes nothing in them); implement; `npm test` PASS; commit `Pipeline: inventory for feats, options, features, species, backgrounds and items`.

### Task 3: Monsters, one record per stat-block feature

**Files:** create `tools/pipeline/monsters.mjs`; modify `dataset.mjs`/`kinds.mjs` (`monster`), `inventory.mjs`, `cli.mjs`; tests + invented fixtures.

**Interfaces — produces:**
- `readMonsterFeatures(datasetDir, bookCode, { year }) → [{ name, kind: "monster", owner: <creature>, section: "trait"|"action"|"bonus"|"reaction"|"legendary"|"mythic", book, page, edition, srd, text }]` from `bestiary/bestiary-<code>.json`; `_copy` variants are listed with `copyOf` and no text (verdict later `unverifiable` unless resolved), never guessed.
- Key: `<book>:monster:<slug(creature)>/<section>/<slug(feature)>`, with `#2`, `#3` appended for a repeated name in one section (Review Focus 3).
- Official origin: the embedded items of the actor of the same name in the book package's `*actors*.json` dumps; a feature matches an embedded item of the same name (`matchName`), `docId` = `<actorId>.<itemId>`.
- `inventory <BOOK> monster` and `all` including monsters.

- [ ] Failing tests (two same-name features, a `_copy` creature, an actor with no matching embedded item → `absent`); implement; PASS; commit `Pipeline: monsters inventoried feature by feature`.

### Task 4: Settling matches, sources, reprints

**Files:** create `tools/pipeline/resolve.mjs`; modify `cli.mjs`, `gates.mjs`, `generate.mjs`, `inventory.mjs`, `schema.mjs`; tests; `docs/PIPELINE.md`.

**Interfaces — produces:**
- CLI `resolve <key> <origin> --doc <docId> --because "<one line>"` (or `--absent`): turns an `ambiguous` item into `matched` (ids read from the dump) or removes it, and records `resolved: { by, at, because }` on the item; inventory keeps a resolved item on re-run while the document's data fingerprint is unchanged, and reports it when it changed.
- When origins of one record have different identifiers, inventory fills `sources: { <docId>: <canonical identifier> }` for the non-canonical ones; `generate` emits a `SOURCES` export (docId → identifier) in the index module, and `scripts/main.mjs` passes it to the engine's registration only when non-empty (read how the engine's hook accepts `sources`; the registration test and snapshot must stay unchanged while `SOURCES` is empty for the 24 rules — if they cannot, stop and report).
- Reprints: inventory records `reprints: [{ package, docId, sameIds: boolean }]` on the official item when the same `docId` exists in another official package; the ids gate fails a rule whose ids are missing from a reprint with `sameIds: false` unless the item lists it under `reprintsExcluded` with a reason.

- [ ] Failing tests for each bullet; implement; `npm test`, `gates --ci`, `build:rules --check`, `books --check` PASS; commit `Pipeline: resolve ambiguous matches, bind sources, check reprints`.

### Task 5: Item structure for readers; rule-based triage for the new kinds

**Files:** create `tools/pipeline/structure.mjs`; modify `batch.mjs`, `triage.mjs`, `cli.mjs`, `docs/PIPELINE.md`; tests.

**Interfaces — produces:**
- `structureOf(doc) → { level?, school?, rarity?, duration?, concentration?, uses?, activities: [{ id, type, activation, save?, onSave?, damage: [{ number, denomination, types }], template?, affects?, effects: [ids], consumes? }], effects: [{ id, name, statuses, changes: [keys], transfer, duration? }] }` — structure only, no description text.
- `batch triage <BOOK> --out <dir> --structure <private dir>`: besides the committed-safe batch file, writes `<private dir>/<batch id>.structure.json` (per entry and origin, `structureOf` of the matched document). The private file is never under the repository (the CLI refuses a path inside it).
- `autoTriage` additions, each with a test: a monster feature whose creature is a `_copy` without text → `unverifiable`; nothing else is decided by rule for the new kinds (no heuristic verdicts).
- The reader brief in `docs/PIPELINE.md` updated: a reader gets the batch file, the structure file and the text cache.

- [ ] Failing tests; implement; PASS; commit `Pipeline: item structure for readers`.

### Task 6: Real runs on the 5.5e books and the coverage report

**Files:** `registry/*.json` (extended by the runs), `docs/coverage-5e24.md`, `README.md`/`TODO.md`/`CHANGELOG.md`.

- [ ] For each book in order (XPHB, XDMG, XMM, EFA, FRHOF, FRAIF, RHW): `inventory <BOOK> all`, `triage <BOOK>`, `gates`; after each book check Review Focus 5 with `git diff` and commit `Inventory: <BOOK>` (one commit per book).
- [ ] `docs/coverage-5e24.md`: per book and kind — entries, official matched / ambiguous / absent, DDB matched / ambiguous / absent, verdicts by rule, left for readers; the commands and wall-clock times; a plain "Not done" section. Counts only.
- [ ] `npm test`, `gates --ci`, `build:rules --check`, `books --check` PASS; update README pointer, TODO and CHANGELOG; commit `Coverage of the 2024-era rulebooks: inventory and rule-based triage`.
