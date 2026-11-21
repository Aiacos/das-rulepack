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
  A shared embedded id needs an `<actor id>.<item id>` source, which the engine reads (`identifierOf`, §334) but external
  registration refuses (`validateSources` accepts 16-character ids only): such features stay `drafted` until upstream accepts
  it (an issue with no book named). DDB Importer monster features are always `uncovered` (world ids, generic identifiers).
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

## What a drafter may write (engine limits)

`DRAFT_KEYS` (`tools/pipeline/draft-keys.mjs`), each with the slot its ids sit in — `activityMap` / `effectMap` (an object keyed
by id: origins side by side), `single` (one id: one origin), `none`. Task 3 step 1 confirms every slot against the key's validator
in `module/scripts/core/content/entry.mjs` and drops any key it cannot confirm:
`triggers` (moments and step types of `MOMENTS` / `STEP_TYPES`), `saveDamage`, `halfOnMiss`, `noDamage`, `effectEnds`,
`endsWhen`, `actionEnds`, `breaksOn`, `noReactions`, `actionOrBonus`, `noOpportunity`, `noOpportunityAttacks`, `saveAdvantage`,
`saveDisadvantageFor`, `rollBonus`, `rollDisadvantage`, `effectStatuses`, `effectDurations`, `savedEffects`, `atTurnStart`,
`usageLimits`, `ignoresResistance`, `grantsResistances`, `grantsConditionImmunities`, `difficultTerrain`, `targets`, `onHit`
(`single`), and `dataFixes` (official origin only, `from` mandatory, never on a monster feature: the data-fix gate has no
document for `<actor id>.<item id>` yet).

Outside the list, the engine has keys but the drafter does not use them in this milestone: zones and geometry (`aura`,
`emanation`, `walls`, `zoneEffects`, `summon`, `teleport`, `light`…), `gmAlert` (prose), `choice`, `metamagic`, `sense` and
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

### Task 4: `batch draft` and the drafter brief

**Files:** modify `tools/pipeline/batch.mjs`, `cli.mjs`; `docs/PIPELINE.md` (stage 3 and brief); test
`tests/pipeline/batch-draft.test.mjs`.

**Interfaces — produces:**
- CLI: `npm run batch -- draft <BOOK> --out <dir> --structure <private dir> [--size 20] [--kind <kind>]` (`--structure`
  mandatory; same path guards as triage).
- `cutDraftBatches(records, { size = 20, kind, after, queued, core }) → [{ id: "<book>-draft-<NNN>", stage: "draft", entries }]`
  — records with `verdict: "entry"`, no `rule`, text present, at least one matched item, not in `drafts-queue.json`; official
  matched first (Ruling R8). Entry: the triage batch entry plus `identifier`, `keys` and `similar` of `evidence.triaged`, and
  `examples`: at most two `{ identifier, entry }` from Core's `SHIPPED` or the pack's gated rules (the triage `similar` first,
  else the ones sharing most top-level keys with `keys`).
- `<dir>/draft-vocabulary.json` written with each cut: `DRAFT_KEYS`, moments, step types, facts, statuses, the `assert`
  vocabulary — engine data only, safe to commit.
- Brief (in `docs/PIPELINE.md`): what a drafter reads (batch, structure, text cache, vocabulary; never `registry/`), the results
  format `{ batch, by, results: [{ key, outcome: "rule"|"person"|"code"|"engine", why, confidence, rule? }] }` with `rule: {
  handledIn: "table", adds, entry, origins, uncovered?, assert }`, ids taken only from the structure file, origins side by side,
  one origin for `single` slots, no prose, no rule from memory, "no text, no rule".

- [ ] Failing tests: `cuts entry records without a rule`, `leaves queued and ruled records out`, `numbering continues per series`,
      `examples come from similar first`, `no text is embedded`, `vocabulary file has no premium data` (only engine words);
      implement; `npm test` PASS; commit `Pipeline: draft batches and the drafter brief`.

### Task 5: `ingest --draft`

**Files:** modify `tools/pipeline/triage.mjs` (shared checks moved to `tools/pipeline/intake.mjs`), create
`tools/pipeline/draft.mjs`, modify `cli.mjs`, `docs/PIPELINE.md`; test `tests/pipeline/draft.test.mjs`.

**Interfaces — produces:**
- CLI: `npm run ingest -- <results-file> --draft` (with `--second`, `--overwrite` or `--review`: usage error).
- `ingestDrafts(records, results, { textDir, by, at, core, queue }) → { records, applied, queued, rejected }`. A result is rejected
  (others applied) when: an unknown field; unknown key; verdict not `entry`; the record already has a rule; no text in the cache;
  `outcome` unknown; for `rule`: schema errors, `checkDraftKeys(entry, { origins: rule.origins, kind: record.kind })`,
  `core.validateEntry` with the real fact list, `checkIds` (R4,
  R5), prose rules (Global Constraints), `assert` invalid or empty. `person`, `code`, `engine` outcomes and any rule with
  confidence < 0.7 go to `drafts-queue.json` (reason = outcome or `low-confidence`); the verdict is not changed.
- An applied rule: `rule` written with `alsoAs` and (for monsters) `identifier` filled by Task 2's functions, `origin` derived
  from owner/level for features, `evidence.drafted = { by, at, core, rule }`; state `drafted`. Books and the queue are written in
  one step (both files to temporary names, then renamed), closing the TODO item about two-step saves.
- Prints `{ applied, queued, rejected }`; exit 1 when anything was rejected.

- [ ] Failing tests: one per rejection reason, `applies a valid two-origin rule`, `fills alsoAs from identifierDiffers`,
      `queues engine and code outcomes without changing the verdict`, `rejects prose in entry strings`, `rejects a quotation in
      adds`, `writes books and queue atomically` (a failing second write leaves both unchanged); implement; `npm test` PASS;
      then `npm run gates` on a synthetic registry gives `gated`; commit `Pipeline: ingest drafted rules`.

### Task 6: Independent review — `batch review`, `ingest --review`

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
- `actor.item` sources for shared embedded item ids: an upstream issue, not pack work.
- Leaving legacy for the 24 migrated rules; the 437 triage-queue entries for a person; the 168 ambiguous official matches.
- Play from a player's client (`players: true` scenarios) beyond what the pilot shows is needed.
