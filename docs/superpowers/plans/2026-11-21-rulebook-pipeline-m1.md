# Rulebook pipeline — milestone 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-entry registry with origin matching, deterministic gates and generated book modules, proven on the spells of the 2024 *Player's Handbook* and on the 24 rules the pack already ships.

**Architecture:** `registry/<book>.json` is the only place a rule is edited. Pure functions under `tools/pipeline/` read the local dataset and compendium dumps, build records, match origins, run gates and generate `scripts/rules/books/*.mjs`. Nothing under `tools/` calls a model or a server; subagent stages exchange batch files.

**Tech Stack:** Node ≥ 20 ES modules, Vitest 3, no new dependency. DAS · Core is read from a local clone (`$DAS_CORE`, same lookup as `tests/rules.test.mjs:9-11`).

**Spec:** `docs/superpowers/specs/2026-11-21-rulebook-pipeline-design.md`

**Out of this milestone** (next plans): drafting and review batches (spec stages 3 and 5), scenario generation and play (stage 6), drift, other kinds and books, Plutonium dumps.

## Global Constraints

- No rulebook text and no premium item data in the repository: only names, pages, ids and SHA-256 fingerprints. Tests use synthetic fixtures written for the test, never copies of dumps.
- Local inputs come from the environment, never from hard-coded paths: `RULEPACK_DATASET` (5etools `data/`), `RULEPACK_DUMPS` (folder of `<package>.<pack>.json`, each a JSON array of Foundry documents), `RULEPACK_TEXT` (text cache, files named `<sha256>.txt`), `DAS_CORE` (engine clone). A missing variable makes the commands that need it exit 2 with the variable's name; tests that need it are skipped, except when `CI` is set and the test needs only `DAS_CORE`.
- Verdicts, exactly: `core | data | none | entry | code | engine | unverifiable`. States, exactly: `inventoried | triaged | drafted | gated | reviewed | played`, plus the flag `legacy`.
- Origins, exactly: `official`, `ddb-importer`, `plutonium`. Match outcomes: `matched | absent | ambiguous | unchecked`.
- "No text, no verdict": an entry whose text is not in the cache can only be `unverifiable` or, by identifier, `core`.
- Code and docs in English; lines ≤ 132 columns; every command is an `npm run` script; `npm test` stays green after every task.
- The 24 shipped rules keep registering exactly the same entries: `tests/registration.test.mjs` snapshot must not change in this milestone.

## Review Focus

1. Two printings with the same name (a 2014 spell in the DDB dump, the 2024 one in the official dump): expected `ambiguous`, never a silent join. Test in Task 3.
2. A dump document without `system.identifier` or with an identifier that differs from the slug of its name: the record keeps both, the official one wins as canonical. Test in Task 2.
3. A registry file edited by hand so that a rule changes but its evidence stays: gates must drop the evidence and the state. Test in Task 1.
4. An id present in the DDB dump but not in the official one for a rule that claims `origins: ["official"]`: the ids gate fails naming origin and id. Test in Task 5.
5. Running inventory twice, or after a dump update: no duplicate record, human-set fields (`verdict`, `why`, `rule`) preserved, changed fingerprints reported. Test in Task 4.

---

### Task 1: Registry records and derived state

**Files:**
- Create: `tools/pipeline/registry.mjs`, `tools/pipeline/schema.mjs`
- Test: `tests/pipeline/registry.test.mjs`

**Interfaces:**
- Produces:
  - `VERDICTS`, `STATES`, `ORIGINS`, `MATCHES` (frozen string arrays, values from Global Constraints).
  - `keyOf({ book, kind, name, creature? }) → string` — `"xphb:spell:acid-splash"`; slug = lowercase, apostrophes dropped, other runs of non-alphanumerics → `-`.
  - `validateRecord(record) → string[]` (empty when valid).
  - `ruleFingerprint(rule) → string` — SHA-256 of the canonical JSON (keys sorted) of `rule`.
  - `stateOf(record, { core }) → string` — derived, see step 3.
  - `loadBook(dir, code) → { book, records }`, `saveBook(dir, { book, records })` — records sorted by `key`, 2-space JSON, trailing newline, stable across runs.

- [ ] **Step 1: Write the failing tests** in `tests/pipeline/registry.test.mjs`:
  - `keyOf` on `{ book: "XPHB", kind: "spell", name: "Tasha's Hideous Laughter" }` → `"xphb:spell:tashas-hideous-laughter"`.
  - `validateRecord` accepts a minimal record `{ key, name, kind, book, page, edition, text: null, items: [], verdict: null, evidence: {} }`; rejects an unknown verdict, an unknown origin, `verdict: "entry"` without `rule.entry`, `page` ≤ 0, `edition` outside `"2014" | "2024"`.
  - `stateOf`: no verdict → `inventoried`; verdict only → `triaged`; `rule` present → `drafted`; `evidence.gates.rule === ruleFingerprint(rule)` and `evidence.gates.passed` includes `schema, validator, ids, fixes, text` → `gated`; plus `evidence.reviewed.agrees` → `reviewed`; plus `evidence.played` → `played`.
  - Review Focus 3: change `rule.entry` after gates → `stateOf` returns `drafted`.
  - `saveBook` then `loadBook` round-trips; saving twice gives identical bytes.
- [ ] **Step 2: Run** `npx vitest run tests/pipeline/registry.test.mjs` — expected FAIL (module not found).
- [ ] **Step 3: Implement** both files. `stateOf` never reads a `state` field from disk; `saveBook` writes the derived state as `state` for readers, `loadBook` ignores it.
- [ ] **Step 4: Run** the same command — PASS; `npm test` — PASS.
- [ ] **Step 5: Commit** `Pipeline: registry records, schema and derived state`.

### Task 2: Reading the dataset and the dumps

**Files:**
- Create: `tools/pipeline/dataset.mjs`, `tools/pipeline/dumps.mjs`, `tools/pipeline/text.mjs`
- Test: `tests/pipeline/sources.test.mjs`, fixtures in `tests/pipeline/fixtures/` (synthetic, three invented spells)

**Interfaces:**
- Produces:
  - `plainText(entries) → string` — 5etools `entries` flattened, `{@tag text|…}` reduced to `text`, whitespace collapsed.
  - `readSpells(datasetDir, bookCode) → [{ name, book, page, edition, srd, level, school, text }]` — from `spells/spells-<code lowercased>.json`; `edition` is `"2024"` when the dataset marks the source as 2024 (`srd52`/`basicRules2024` present on any entry of the file, or the book code starts with `X`), else `"2014"`; `srd` is `true` when `srd52` or `srd` is set.
  - `textFingerprint(text) → sha256 hex`; `cacheText(dir, text) → sha256` (writes `<sha>.txt` if absent); `hasText(dir, sha) → boolean`.
  - `readDump(file) → object[]`; `itemSummary(doc, origin) → { origin, docId, identifier, name, type, rules, activities: [{ id, type, save?, damageTypes }], effects: [{ id, name, statuses }], level?, school?, data }` — `rules` from `system.source.rules`, `data` = SHA-256 of the canonical JSON of `doc.system` and `doc.effects`.
  - `dumpsFor(dumpsDir, origin) → string[]` — `official`: every file not starting with `ddb.` or `dnd5e.`; `ddb-importer`: files starting with `ddb.`.

- [ ] **Step 1: Write the failing tests:** `plainText` strips tags and keeps numbers; `readSpells` on a fixture file returns page and edition; `itemSummary` on a fixture document returns activity ids, effect ids and statuses; a document with no `system.identifier` gets `identifier: null` and keeps `name` (Review Focus 2); the same document gives the same `data` fingerprint whatever the key order.
- [ ] **Step 2: Run** `npx vitest run tests/pipeline/sources.test.mjs` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS; `npm test` — PASS.
- [ ] **Step 5: Commit** `Pipeline: dataset, dump and text-cache readers`.

### Task 3: Identity and origin matching

**Files:**
- Create: `tools/pipeline/match.mjs`
- Test: `tests/pipeline/match.test.mjs`

**Interfaces:**
- Consumes: `itemSummary` output (Task 2).
- Produces:
  - `identityOf({ name, kind, edition }) → string` — `"<slug>|<kind>|<edition>"`.
  - `mechanicsOf(summary) → { level, school, activityTypes: string[], saves: string[], damageTypes: string[], statuses: string[] }` (arrays sorted, deduplicated).
  - `compareMechanics(a, b) → string[]` — names of the fields that differ.
  - `matchOrigin(entry, candidates) → { match, item?, candidates?, differences? }` — `entry` is `{ name, kind, edition, reference? }` where `reference` is the official summary when there is one; `candidates` are the summaries of one origin.

- [ ] **Step 1: Write the failing tests:**
  - no candidate with the same slug and kind → `{ match: "absent" }`;
  - one candidate, same edition (`rules`), no reference → `matched`;
  - one candidate, same edition, reference with equal mechanics → `matched`; with a different save ability → `ambiguous` and `differences: ["saves"]`;
  - one candidate whose `rules` is `"2014"` for a 2024 entry → `ambiguous`, `differences: ["edition"]` (Review Focus 1);
  - two candidates of the same edition → `ambiguous` with both in `candidates`.
- [ ] **Step 2: Run** `npx vitest run tests/pipeline/match.test.mjs` — FAIL.
- [ ] **Step 3: Implement.** Slugs compare after the same normalisation as `keyOf`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Pipeline: identity and origin matching on mechanics`.

### Task 4: Inventory command

**Files:**
- Create: `tools/pipeline/inventory.mjs`, `tools/pipeline/cli.mjs`
- Modify: `package.json` (script `"pipeline": "node tools/pipeline/cli.mjs"`)
- Test: `tests/pipeline/inventory.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `inventory({ book, kind, dataset, dumps, textDir, previous }) → { records, report }` — pure given its inputs (`dataset` = array from `readSpells`, `dumps` = `{ official: summary[], "ddb-importer": summary[] }`, `previous` = existing records). `report` = `{ added, kept, textChanged: key[], dataChanged: key[], ambiguous: key[], noOfficial: key[] }`.
  - CLI: `npm run pipeline -- inventory <BOOK> <kind>` writes `registry/<book>.json` and prints the report as JSON.

Rules the tests pin:
- one record per dataset entry; `text` = `{ sha256, source: "5etools", chars }`, the text itself goes to `textDir`;
- `items` holds one element per origin that is not `absent`, the official one first; the Plutonium origin is recorded as `{ origin: "plutonium", match: "unchecked" }` on every record in this milestone;
- canonical `identifier` of the record = the official item's identifier, else the DDB one, else the slug;
- an entry reprinted in a book already in the registry (same identity) is not duplicated: the new book is appended to `alsoIn` of the existing record — the function receives the other books' records in `previous`;
- Review Focus 5: a second run with the same inputs returns `added: 0`; `verdict`, `why`, `rule` and `evidence` of `previous` are preserved; a changed text or data fingerprint is listed in the report and `evidence.gates` is dropped for that record.

- [ ] **Step 1: Write the failing tests** for each rule above on synthetic inputs.
- [ ] **Step 2: Run** `npx vitest run tests/pipeline/inventory.test.mjs` — FAIL.
- [ ] **Step 3: Implement** the function and the CLI subcommand (argument and environment errors exit 2 with a one-line message).
- [ ] **Step 4: Run** — PASS; `npm test` — PASS.
- [ ] **Step 5: Commit** `Pipeline: inventory with origin matching, idempotent`.

### Task 5: Gates

**Files:**
- Create: `tools/pipeline/gates.mjs`, `tools/pipeline/core.mjs`
- Modify: `tools/pipeline/cli.mjs`, `package.json` (script `"gates": "node tools/pipeline/cli.mjs gates"`)
- Test: `tests/pipeline/gates.test.mjs`

**Interfaces:**
- Consumes: Task 1; summaries from Task 2.
- Produces:
  - `loadCore(dir) → { validateEntry, facts: string[], matchesFrom, getPath, version, identifiers: Set<string> }` — imports `module/scripts/core/content.mjs`, `core/data-fixes.mjs` and `content/index.mjs` from the clone; `facts` are read statically from `module/scripts/adapter/facts.mjs` (string property keys of the form `word.word`), and loading fails if fewer than 60 are found; `version` from `module/module.json`.
  - `idsIn(entry) → string[]` — every 16-character document id that appears as a key or as a string value anywhere in the entry.
  - One function per gate, each `(record, context) → string[]` of failures: `gateSchema`, `gateValidator`, `gateIds`, `gateFixes`, `gateText`; and `gateUnique(records) → string[]`.
  - `runGates(records, context) → { failures: { [key]: { [gate]: string[] } }, updated: records }` — on a record with a rule and no failure, sets `evidence.gates = { at, core: version, rule: ruleFingerprint(rule), passed: [...] }`; otherwise removes `evidence.gates`.
  - CLI `npm run gates [-- --ci]`: exit 1 on any failure; `--ci` runs schema, validator, unique only and trusts existing `evidence.gates` whose `rule` fingerprint matches.

Gate behaviour the tests pin:
- `gateValidator`: passes the entry to the engine's `validateEntry` with `{ facts }` as a predicate over the real list; an unknown fact name fails.
- `gateIds`: for each origin in `rule.origins`, every id of `idsIn(rule.entry)` must be an activity or effect id of that origin's item; the failure reads `ids: <origin> has no activity or effect <id>` (Review Focus 4). A record with `legacy: true` and no dump for the origin reports `ids: no item data (legacy)` as a note, not a failure.
- `gateFixes`: each `dataFixes` item must be applicable (`from` matches) or already applied (value matches) on each origin's document; anything else fails with `fixes: drift at <path>`.
- `gateText`: `text.sha256` exists in the cache. A `legacy` record with `text: null` reports `text: not fingerprinted (legacy)` as a
  note, not a failure, until inventory of its book attaches the text.
- `gateUnique`: two records with the same canonical identifier and no `sources` binding fail, naming both keys.

- [ ] **Step 1: Write the failing tests** with a stub context (`validateEntry` and `matchesFrom` injected), plus one test under `describe.skipIf(!core)` that loads the real clone and checks `facts.length ≥ 60` and that an entry of the pack validates.
- [ ] **Step 2: Run** `npx vitest run tests/pipeline/gates.test.mjs` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS; `npm test` — PASS.
- [ ] **Step 5: Commit** `Pipeline: deterministic gates (schema, validator, ids, fixes, text, unique)`.

### Task 6: Migrate the 24 rules and generate the book modules

**Files:**
- Create: `tools/pipeline/migrate.mjs` (one-off, kept for the record), `tools/pipeline/generate.mjs`, `registry/*.json` (7 books)
- Modify: `scripts/rules/books/*.mjs` (become generated), `scripts/rules/index.mjs` (generated import list), `tools/pipeline/cli.mjs`, `package.json` (script `"build:rules": "node tools/pipeline/cli.mjs generate"`)
- Test: `tests/pipeline/generate.test.mjs`; `tests/books.test.mjs` and `tests/registration.test.mjs` unchanged and green

**Interfaces:**
- Consumes: Task 1 (`loadBook`, `saveBook`), the current `RULES` export.
- Produces:
  - `recordFromRule(rule) → record` — `verdict` = `"code"` when `handledIn === "code"`, else `"entry"`; `rule` = `{ handledIn, adds, entry?, code?, origin?, catalog?, inCore?, origins: ["ddb-importer"] }`; `legacy: true`; `evidence.played = { legacy: true }` when the rule's status is `played`.
  - `ruleFromRecord(record) → Rule` — the inverse, with `status` = `played` | `validated` | `pending` mapped from the state (`gated` and `reviewed` → `validated`, `legacy` without gates → the status it had).
  - `bookModuleSource(code, records) → string` — the text of `scripts/rules/books/<code>.mjs`, first line `// Generated from registry/<code>.json by npm run build:rules — do not edit.`; `indexSource(codes) → string`.
  - CLI `generate [--check]`: writes the files; `--check` exits 1 when a file on disk differs.

- [ ] **Step 1: Write the failing tests:** `ruleFromRecord(recordFromRule(r))` deep-equals `r` for every rule of the current `RULES`; `bookModuleSource` output, imported from a temp file, exports `RULES` deep-equal to the input; `generate --check` fails after a manual edit of a generated file.
- [ ] **Step 2: Run** `npx vitest run tests/pipeline/generate.test.mjs` — FAIL.
- [ ] **Step 3: Implement** `migrate.mjs` and `generate.mjs`; run the migration once (`node tools/pipeline/migrate.mjs`), then `npm run build:rules`.
- [ ] **Step 4: Verify** `npm test` — PASS with **no snapshot change** (`git status` shows nothing under `tests/__snapshots__`); `npm run build:rules -- --check` exits 0; `npm run books -- --check` exits 0.
- [ ] **Step 5: Commit** `Pipeline: the 24 rules live in the registry; book modules are generated`.

### Task 7: Rule-based triage and batch files

**Files:**
- Create: `tools/pipeline/triage.mjs`, `tools/pipeline/batch.mjs`, `docs/PIPELINE.md`
- Modify: `tools/pipeline/cli.mjs`
- Test: `tests/pipeline/triage.test.mjs`, `tests/pipeline/batch.test.mjs`

**Interfaces:**
- Consumes: Tasks 1, 2, 5 (`loadCore().identifiers`).
- Produces:
  - `autoTriage(record, { coreIdentifiers, srd }) → { verdict, why, by: "rule" } | null`:
    - canonical identifier in `coreIdentifiers` → `core`, why `"DAS · Core has an entry"`;
    - `srd` true and not in Core → `null` (left for a reader: SRD content the engine has no entry for is a finding for upstream, not a rule for the pack);
    - no text in the cache → `unverifiable`;
    - otherwise `null`.
  - `cutBatches(records, { size = 40 }) → batch[]` — records without a verdict, grouped by kind, each `{ id, stage: "triage", entries: [{ key, name, kind, edition, textSha, items: summaries without the `data` field }] }`. Text is referenced by fingerprint, never embedded: the batch file is safe to commit, the reader resolves text from `RULEPACK_TEXT`.
  - `ingest(records, results) → { records, rejected }` — `results` = `[{ key, verdict, why, keys?, similar?, confidence }]`; rejects unknown keys, unknown verdicts, `why` longer than 200 characters or containing a quotation of 12 or more consecutive words of the cached text, and any verdict other than `unverifiable` for an entry without text; sets `evidence.triaged = { by, at, confidence }`; `confidence < 0.7` and every `engine` verdict are listed in `registry/queue.json` instead of being applied.
  - CLI: `triage <BOOK>` (applies `autoTriage`, prints counts), `batch triage <BOOK> --out <dir>`, `ingest <file>`.
  - `docs/PIPELINE.md`: the runbook — stage by stage, the command, who runs it, the brief given to a subagent for a triage batch (inputs, the output schema above, "no text, no verdict", no quotation, no server), and how the main session ingests the result.

- [ ] **Step 1: Write the failing tests** for each bullet above (synthetic records and results), including the quotation check and the queue.
- [ ] **Step 2: Run** `npx vitest run tests/pipeline/triage.test.mjs tests/pipeline/batch.test.mjs` — FAIL.
- [ ] **Step 3: Implement**, then write `docs/PIPELINE.md`.
- [ ] **Step 4: Run** — PASS; `npm test` — PASS.
- [ ] **Step 5: Commit** `Pipeline: rule-based triage, batch files and runbook`.

### Task 8: CI and the pilot run

**Files:**
- Create: `.github/workflows/test.yml`, `registry/xphb.json` (extended by the run), `docs/pilot-xphb-spells.md`
- Modify: `README.md` (Layout section: one paragraph pointing to `docs/PIPELINE.md`), `CHANGELOG.md`, `TODO.md`

**Interfaces:**
- Consumes: every earlier task.

- [ ] **Step 1: CI.** Workflow on push and pull request: checkout, Node 20, `npm ci`, clone `Darshyne/dnd5e-combat` at its latest release tag into `../core` (one of the lookup paths), `npm test`, `npm run gates -- --ci`, `npm run build:rules -- --check`, `npm run books -- --check`.
- [ ] **Step 2: Run the pilot locally** with the four environment variables set: `npm run pipeline -- inventory XPHB spell`, then `npm run pipeline -- triage XPHB`, then `npm run gates`.
- [ ] **Step 3: Check the outcome against known facts:** 391 records for XPHB spells; the 3 XPHB rules already in the registry are the same records, not duplicates (`gateUnique` passes); every record has an official item or is listed under `noOfficial`; every `ambiguous` match is listed.
- [ ] **Step 4: Write `docs/pilot-xphb-spells.md`** — counts only: records, per-origin `matched / absent / ambiguous`, verdicts set by rule (`core`, `unverifiable`), records left for a reader, gate results for the existing rules, wall-clock time of each command. State plainly what was not done (no drafting, no play).
- [ ] **Step 5: Commit** `Pilot: 2024 Player's Handbook spells inventoried and triaged by rule`, after `npm test` and the three `--check` commands pass.

---

## Self-review notes

- Spec §1 registry → Task 1; §2 stage 1 → Tasks 2–4; stage 2 → Task 7; stage 4 → Task 5; stage 7 (generation) → Task 6; §6 migration → Task 6; §7 pilot → Task 8; §7b matching → Tasks 3–4; §8 clarifications (tools never call a model, legacy, rule fingerprint, CI trust) → Tasks 1, 5, 6, 7.
- Deliberately not in this milestone, each needing its own plan: drafting and review batches, the closed `assert` vocabulary, scenario generation and play, `drift`, monsters, README/`RULES.md` generation from the registry (the existing `npm run books` keeps working on the generated `RULES`).
